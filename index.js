'use strict'

const hasOwnProperty = Object.prototype.hasOwnProperty
const mergeDeep = require('merge-deep')
const deepEqual = require('deep-equal')
const deep = require('deep-dot')
const names = require('browser-names')
const isForkPr = require('is-fork-pr').isForkPr

const defaults = { version: 'latest' }
const prerelease = /[^\d.]/
const numeric = /^\d+$/

module.exports = matchAll

function matchAll (available, wanted) {
  wanted = wanted.map(withDefaults)
  wanted.sort((a, b) => a.name.localeCompare(b.name))

  explode(wanted)

  const matches = []
  const groups = new Map()

  // Group by name for faster matching
  for (const manifest of available) {
    const name = manifest.name

    if (groups.has(name)) {
      groups.get(name).push(manifest)
    } else {
      groups.set(name, [manifest])
    }
  }

  for (const w of wanted) {
    const explicit = new Set()

    // Match by name
    let group = findName(groups, w.name) || []

    // Lazily sort by version
    if (!group.sorted) {
      group.sort((a, b) => cmpVersion(a.version, b.version))
      group.sorted = true
    }

    // Match by other properties
    const skip = ['name', 'version']
    group = group.filter(m => match(m, w, explicit, skip))

    // Match by version
    w.version = lower(w.version)
    group = filterVersions(group, w.version)

    if (group.length === 0) {
      throw new Error('Zero matches for ' + JSON.stringify(w, null, 2))
    }

    // Deduplicate by properties we didn't explicitly match
    for (let i = 0; i < group.length; i++) {
      const a = group[i]
      let winner = a

      for (let j = i + 1; j < group.length; j++) {
        const b = group[j]

        if (same(a, b, explicit)) {
          // Last manifest wins (for no particular reason)
          winner = b
          group.splice(j--, 1)
        }
      }

      // Don't merge options into the manifest yet, so that we can
      // perform fast deduplication by object identity (below). We
      // assume that `available` itself doesn't contain duplicates.
      matches.push({ manifest: winner, options: w.options })
    }
  }

  consolidate(matches)
  return matches
}

function findName (groups, name) {
  if (groups.has(name)) {
    return groups.get(name)
  }

  for (const alias of names(name)) {
    if (alias !== name && groups.has(alias)) {
      return groups.get(alias)
    }
  }
}

function consolidate (matches) {
  const insecure = insecureEnv()

  for (let i = 0; i < matches.length; i++) {
    const { manifest, options } = matches[i]

    // Skip browsers that need secure environment variables and are therefore
    // not available on pull requests from forks. Done here (after matching)
    // so that the order of precedence between browsers is consistent in
    // secure and insecure envs. Could reconsider that; needs a discussion.
    if (insecure && manifest.wants && manifest.wants.secureEnv) {
      matches.splice(i--, 1)
      continue
    }

    // Add user-provided options to manifest
    matches[i] = mergeDeep(manifest, { options })

    // Remove exact duplicates (same manifest, same options)
    for (let j = i + 1; j < matches.length; j++) {
      if (matches[j].manifest === manifest &&
        deepEqual(matches[j].options, options, { strict: true })) {
        matches.splice(j--, 1)
      }
    }
  }
}

function explode (manifests) {
  for (let i = 0; i < manifests.length; i++) {
    const manifest = manifests[i]

    for (const k of ['version']) {
      if (Array.isArray(manifest[k])) {
        manifests.splice(i--, 1, ...manifest[k].map(v => ({ ...manifest, [k]: v })))
        break
      }
    }
  }
}

function withDefaults (manifest) {
  manifest = { ...manifest }

  for (const k in defaults) {
    manifest[k] = manifest[k] || defaults[k]
  }

  if (typeof manifest.name !== 'string' || manifest.name === '') {
    throw new TypeError('Manifest "name" is required')
  }

  manifest.name = lower(manifest.name)
  manifest.options = manifest.options || {}

  // For airtap < 4 compatibility
  // TODO: consider adding a shorthand "device" property for ipad & iphone
  if (manifest.name === 'iphone' || manifest.name === 'ipad') {
    const device = manifest.name === 'iphone' ? 'iphone simulator' : 'ipad simulator'
    const caps = manifest.capabilities = { ...manifest.capabilities }
    const appium = caps.appium = { ...caps.appium }

    manifest.name = 'ios_saf'
    appium.deviceName = appium.deviceName || device
  }

  return manifest
}

function lower (value) {
  return value != null ? String(value).toLowerCase() : ''
}

function match (available, wanted, explicit, skip, key) {
  if (Array.isArray(available)) {
    return available.some(el => match(el, wanted, explicit, skip, key))
  } else if (Array.isArray(wanted)) {
    throw new Error('Array is not yet supported on ' + key)

    // TODO: explode into multiple browsers, instead of this "oneof" behavior
    // return wanted.some(el => match(available, el, explicit, skip, key))
  } else if (isObject(wanted)) {
    if (!isObject(available)) return false

    for (const k in wanted) {
      const fqk = key ? key + '.' + k : k

      if (!hasOwnProperty.call(wanted, k)) continue
      if (fqk === 'options') continue
      if (!match(available[k], wanted[k], explicit, skip, fqk)) return false
    }

    return true
  } else if (wanted === 'any') {
    return true
  } else {
    explicit.add(key)
    return skip.includes(key) || matchPrimitive(available, wanted)
  }
}

function matchPrimitive (available, wanted) {
  if (typeof wanted === 'string') {
    wanted = lower(wanted)
    available = lower(available)
  }

  return available === wanted
}

function same (a, b, explicit) {
  for (const k of explicit) {
    if (!deepEqual(deep(a, k), deep(b, k), { strict: true })) {
      return false
    }
  }

  return true
}

// Assumes manifests are sorted by version.
function filterVersions (manifests, version) {
  if (manifests.length === 0) {
    return manifests
  }

  const test = range(version, manifests)
  const result = []

  for (const m of manifests) {
    if (test(m.version)) {
      result.push(m)
    } else if (result.length) {
      break
    }
  }

  return result
}

// Assumes manifests are sorted by version.
function range (version, manifests) {
  let gte
  let lte

  if (version.indexOf('..') === -1) {
    gte = lte = resolve(version || 'latest')
  } else {
    const arr = version.split('..')

    gte = resolve(arr[0] || 'oldest')
    lte = resolve(arr[1] || 'latest')
  }

  return function test (v) {
    const c1 = cmpRange(v, gte, false)
    if (c1 < 0) return false

    const c2 = cmpRange(v, lte, true)
    if (c2 > 0) return false

    return true
  }

  function resolve (v) {
    if (v === 'oldest') return manifests[0].version
    if (v === 'latest') return latest(manifests, 0)
    if (/^-\d+$/.test(v) && v < 0) return latest(manifests, v * -1)

    return v
  }
}

function latest (manifests, n) {
  for (let i = manifests.length - 1; i >= 0; i--) {
    if (!isPrerelease(manifests[i].version) && (!n-- || i === 0)) {
      return manifests[i].version
    }
  }

  // All are prereleases, return the last
  return manifests[manifests.length - 1].version
}

function isPrerelease (version) {
  return !version || prerelease.test(version)
}

function cmpVersion (a, b) {
  return cmpRange(a, b, false)
}

function cmpRange (a, b, prefixOnly) {
  // Missing version behaves like last prerelease
  if (!a) return !b ? 0 : 1
  if (!b) return -1

  const ap = isPrerelease(a)
  const bp = isPrerelease(b)

  if (ap !== bp) return ap ? 1 : -1

  const av = a.split('.')
  const bv = b.split('.')

  for (let i = 0; i < Math.min(av.length, bv.length); i++) {
    const cmp = cmpElement(av[i], bv[i])

    if (cmp > 0) return 1
    if (cmp < 0) return -1
  }

  if (prefixOnly || av.length === bv.length) {
    return 0
  } else {
    return av.length > bv.length ? 1 : -1
  }
}

function cmpElement (a, b) {
  if (numeric.test(a) && numeric.test(b)) {
    return a - b
  } else {
    return a.localeCompare(b)
  }
}

function insecureEnv () {
  if (process.env.AIRTAP_IS_SECURE_ENV) {
    return process.env.AIRTAP_IS_SECURE_ENV === 'false'
  }

  if (process.env.CI) {
    if (isForkPr()) return true
    if (process.env.TRAVIS_SECURE_ENV_VARS === 'false') return true
  }

  return false
}

function isObject (o) {
  return typeof o === 'object' && o !== null && !Array.isArray(o)
}
