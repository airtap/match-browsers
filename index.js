'use strict'

const hasOwnProperty = Object.prototype.hasOwnProperty
const mergeDeep = require('merge-deep')
const deepEqual = require('deep-equal')
const deep = require('deep-dot')
const names = require('browser-names')
const defaults = { version: 'latest' }

module.exports = matchAll

function matchAll (available, wanted) {
  wanted = wanted.map(withDefaults)
  wanted.sort((a, b) => a.name.localeCompare(b.name))

  explode(wanted)

  const matches = []
  const groups = new Map()

  // Group by name for faster matching
  for (const spec of available) {
    const name = lower(spec.name)

    if (groups.has(name)) {
      groups.get(name).push(spec)
    } else {
      groups.set(name, [spec])
    }
  }

  // Presort versions and add aliases
  for (const [name, group] of groups) {
    group.sort((a, b) => cmpVersion(a.version, b.version))

    for (const alias of names(name)) {
      if (alias !== name) groups.set(alias, group)
    }
  }

  for (const w of wanted) {
    const explicit = new Set()

    // Match by name and version
    let group = groups.get(w.name) || []
    w.version = lower(w.version)
    group = filterVersions(group, w.version)

    // Match by properties other than name and version
    const skip = ['name', 'version']
    group = group.filter(m => match(m, w, explicit, skip))

    if (group.length === 0) {
      throw new Error('Zero matches for ' + JSON.stringify(w, null, 2))
    }

    // Deduplicate by properties we didn't explicitly match
    for (let i = 0; i < group.length; i++) {
      const a = group[i]
      const alternatives = [a]

      for (let j = i + 1; j < group.length; j++) {
        const b = group[j]

        if (same(a, b, explicit)) {
          alternatives.push(b)
          group.splice(j--, 1)
        }
      }

      // Pick winner by preferredOver rules (or short of that, the last spec)
      let winner = alternatives[alternatives.length - 1]
      let max = 0

      // TODO: optimize by merging logic into above loop
      // TODO: find a simpler solution to deduplication overall
      for (let x = 0; x < alternatives.length; x++) {
        for (let y = x + 1; y < alternatives.length; y++) {
          const weightX = preferredOver(alternatives[x], alternatives[y])
          const weightY = preferredOver(alternatives[y], alternatives[x])

          if (weightX > max) {
            max = weightX
            winner = alternatives[x]
          }

          if (weightY > max) {
            max = weightY
            winner = alternatives[y]
          }
        }
      }

      // Don't merge options into the spec yet, so that we can
      // perform fast deduplication by object identity (below). We
      // assume that `available` itself doesn't contain duplicates.
      matches.push({ spec: winner, options: w.options })
    }
  }

  consolidate(matches)
  return matches
}

function consolidate (matches) {
  for (let i = 0; i < matches.length; i++) {
    const { spec, options } = matches[i]

    // Add user-provided options to spec
    matches[i] = mergeDeep(spec, { options })

    // Remove exact duplicates (same spec, same options)
    for (let j = i + 1; j < matches.length; j++) {
      if (matches[j].spec === spec &&
        deepEqual(matches[j].options, options, { strict: true })) {
        matches.splice(j--, 1)
      }
    }
  }
}

function explode (specs) {
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]

    for (const k of ['version']) {
      if (Array.isArray(spec[k])) {
        specs.splice(i--, 1, ...spec[k].map(v => ({ ...spec, [k]: v })))
        break
      }
    }
  }
}

function withDefaults (spec) {
  spec = { ...spec }

  for (const k in defaults) {
    spec[k] = spec[k] || defaults[k]
  }

  if (typeof spec.name !== 'string' || spec.name === '') {
    throw new TypeError('Browser "name" is required')
  }

  spec.name = lower(spec.name)
  spec.options = spec.options || {}

  // For airtap < 4 compatibility
  // TODO: consider adding a shorthand "device" property for ipad & iphone
  if (spec.name === 'iphone' || spec.name === 'ipad') {
    const device = spec.name === 'iphone' ? 'iphone simulator' : 'ipad simulator'
    const caps = spec.capabilities = { ...spec.capabilities }
    const appium = caps.appium = { ...caps.appium }

    spec.name = 'ios_saf'
    appium.deviceName = appium.deviceName || device
  }

  return spec
}

function preferredOver (a, b) {
  let weight = 0

  if (a.preferredOver) {
    for (const k of Object.keys(a.preferredOver)) {
      const values = a.preferredOver[k].map(lower)
      const value = deep(b, k)

      if (value == null) {
        continue
      } else if (values.includes(lower(value))) {
        // A specific value has more weight than "any"
        weight += 1e3
      } else if (values.includes('any')) {
        weight += 1
      }
    }
  }

  return weight
}

function lower (value) {
  return value != null ? String(value).toLowerCase() : ''
}

function match (available, wanted, explicit, skip, key) {
  if (Array.isArray(available)) {
    return available.some(el => match(el, wanted, explicit, skip, key))
  } else if (Array.isArray(wanted)) {
    return wanted.some(el => match(available, el, explicit, skip, key))
  } else if (isObject(wanted)) {
    if (!isObject(available)) return false

    for (const k in wanted) {
      const fqk = key ? key + '.' + k : k

      if (!hasOwnProperty.call(wanted, k)) continue
      if (fqk === 'options' || fqk === 'preferredOver') continue
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

// Assumes specs are sorted by version.
function filterVersions (specs, version) {
  const [gte, lte] = range(version, specs)

  let start = 0
  let end = specs.length

  if (gte) {
    while (start < end && cmpVersion(specs[start].version, gte) < 0) {
      start++
    }

    if (!matchVersion(gte, specs[start] && specs[start].version)) {
      throw new Error(`Version not found: ${gte}`)
    }
  }

  if (lte) {
    while (end > start && cmpVersion(specs[end - 1].version, lte) > 0) {
      end--
    }

    if (!matchVersion(lte, specs[end - 1] && specs[end - 1].version)) {
      throw new Error(`Version not found: ${lte}`)
    }
  }

  return specs.slice(start, end)
}

function range (version, specs) {
  const arr = version.split('..')

  if (arr.length === 1) {
    arr.push(arr[0])
  }

  return arr.map(function (v) {
    if (!specs.length) return
    if (v === 'oldest') return specs[0].version
    if (v === 'latest') return latest(specs, 0)
    if (!isNaN(v) && v < 0) return latest(specs, v * -1)

    return v
  })
}

function latest (specs, n) {
  for (let i = specs.length - 1; i >= 0; i--) {
    if (!isBeta(specs[i].version) && !n--) {
      return specs[i].version
    }
  }

  return specs[0].version
}

function isBeta (version) {
  return version && isNaN(version)
}

function matchVersion (wanted, available) {
  if (!available) return false
  if (isBeta(available)) return available === wanted

  return available.startsWith(wanted)
}

function cmpVersion (a, b) {
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1

  if (isNaN(a)) return isNaN(b) ? a.localeCompare(b) : 1
  if (isNaN(b)) return -1

  return Number(a) - Number(b)
}

function isObject (o) {
  return typeof o === 'object' && o !== null && !Array.isArray(o)
}
