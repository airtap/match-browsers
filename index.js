'use strict'

const hasOwnProperty = Object.prototype.hasOwnProperty
const mergeDeep = require('merge-deep')
const deepEqual = require('deep-equal')
const deep = require('deep-dot')
const names = require('browser-names')
const isForkPr = require('is-fork-pr').isForkPr

const prerelease = /[^\d.]/
const numeric = /^\d+$/

module.exports = matchAll

function matchAll (available, wanted) {
  const matches = []
  const eqlOptions = { strict: true }

  for (const original of wanted) {
    const w = normalize(original)
    const explicit = new Set(['version'])

    // Match by properties other than version
    let group = available.filter(m => match(m, w, explicit))

    // Match by version
    group.sort((a, b) => cmpVersion(a.version, b.version))
    group = filterVersions(group, w.version != null ? w.version : 'latest')

    if (group.length === 0) {
      throw new NotFoundError(original)
    }

    // Deduplicate by properties we didn't explicitly match
    for (let i = 0; i < group.length; i++) {
      const a = group[i]
      let winner = a

      for (let j = i + 1; j < group.length; j++) {
        const b = group[j]

        if (same(a, b, explicit, eqlOptions)) {
          // Last manifest wins (for no particular reason)
          winner = b
          group.splice(j--, 1)
        }
      }

      // Don't merge options into the manifest yet, so that we can
      // perform fast deduplication by object identity (below). We
      // assume that `available` itself doesn't contain duplicates.
      matches.push({ manifest: winner, options: w.options || {} })
    }
  }

  consolidate(matches, eqlOptions)
  return matches
}

function consolidate (matches, eqlOptions) {
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
        deepEqual(matches[j].options, options, eqlOptions)) {
        matches.splice(j--, 1)
      }
    }
  }
}

function normalize (wanted) {
  // For airtap < 4 compatibility
  // TODO: consider adding a shorthand "device" property for ipad & iphone
  if (wanted.name === 'iphone' || wanted.name === 'ipad') {
    wanted = { ...wanted }

    const device = wanted.name === 'iphone' ? 'iphone simulator' : 'ipad simulator'
    const caps = wanted.capabilities = { ...wanted.capabilities }
    const appium = caps.appium = { ...caps.appium }

    wanted.name = 'ios_saf'
    appium.deviceName = appium.deviceName || device
  }

  return wanted
}

function match (available, wanted, explicit, key) {
  if (isObject(wanted)) {
    if (!isObject(available)) return false

    for (const k in wanted) {
      const fqk = key ? key + '.' + k : k

      if (!hasOwnProperty.call(wanted, k)) continue
      if (fqk === 'options' || fqk === 'version') continue

      explicit.add(fqk)

      if (!match(available[k], wanted[k], explicit, fqk)) return false
    }

    return true
  } else {
    return matchPrimitive(available, wanted, key)
  }
}

function matchPrimitive (available, wanted, key) {
  if (typeof wanted === 'string') {
    wanted = wanted != null ? String(wanted).toLowerCase() : ''
    available = available != null ? String(available).toLowerCase() : ''
  }

  if (available === wanted) {
    return true
  }

  if (key === 'name') {
    for (const alias of names(wanted)) {
      if (available === alias) return true
    }
  }

  return false
}

function same (a, b, explicit, eqlOptions) {
  for (const k of explicit) {
    if (!deepEqual(deep(a, k), deep(b, k), eqlOptions)) {
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
  const result = manifests.filter(m => test(m.version))

  return result
}

// Assumes manifests are sorted by version.
function range (version, manifests) {
  if (Array.isArray(version)) {
    const tests = version.map(v => range(v, manifests))

    return function test (v) {
      return tests.some(fn => fn(v))
    }
  }

  if (typeof version === 'number') {
    version = version.toString()
  } else if (typeof version !== 'string') {
    throw new InvalidVersionError(version)
  }

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

    // Skip same version(s)
    while (i > 0 && cmpVersion(manifests[i - 1].version, manifests[i].version) === 0) {
      i--
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

class InvalidVersionError extends TypeError {
  constructor (input) {
    super('Version must be a string or number')

    Object.defineProperty(this, 'name', { value: 'InvalidVersionError' })
    Object.defineProperty(this, 'code', { value: 'ERR_INVALID_VERSION' })
    Object.defineProperty(this, 'expected', { value: true })
    Object.defineProperty(this, 'input', { value: input })
  }
}

class NotFoundError extends Error {
  constructor (input) {
    super('No matching manifest found')

    Object.defineProperty(this, 'name', { value: 'NotFoundError' })
    Object.defineProperty(this, 'code', { value: 'ERR_MANIFEST_NOT_FOUND' })
    Object.defineProperty(this, 'expected', { value: true })
    Object.defineProperty(this, 'input', { value: input })
  }
}
