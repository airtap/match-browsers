'use strict'

const test = require('tape')
const match = require('.')
const sauceSpecs = require('./sauce-fixture.json')

test('match sauce specs against sauce specs', function (t) {
  const res = match(sauceSpecs, sauceSpecs)
  t.same(res, sauceSpecs.map(normal).sort(cmpName))
  t.end()
})

test('matching against nothing throws error', function (t) {
  t.same(match([], []), [])
  t.throws(() => match([], [{ name: 'x' }]), /^Error: Zero matches/)
  t.end()
})

test('match by name', function (t) {
  const a = [{ name: 'a', foo: true }, { name: 'b' }]

  t.same(match(a, [{ name: 'a' }]), [{ name: 'a', foo: true, options: {} }])
  t.same(match(a, [{ name: 'b' }]), [{ name: 'b', options: {} }])
  t.same(match(a, [{ name: 'B' }]), [{ name: 'b', options: {} }])
  t.end()
})

test('match by alias', function (t) {
  const a = [{ name: 'ie' }, { name: 'edge' }]

  t.same(match(a, [{ name: 'IE' }]), a.slice(0, 1).map(normal))
  t.same(match(a, [{ name: 'internet explorer' }]), a.slice(0, 1).map(normal))
  t.same(match(a, [{ name: 'INTERNET EXPLORER' }]), a.slice(0, 1).map(normal))
  t.same(match(a, [{ name: 'msedge' }]), a.slice(-1).map(normal))
  t.end()
})

test('removes exact duplicates (same spec, same options)', function (t) {
  t.same(match([{ name: 'a' }], [
    { name: 'a' },
    { name: 'a' },
    { name: 'a' }
  ]), [
    { name: 'a', options: {} }
  ])
  t.end()
})

test('preserves options', function (t) {
  t.same(match([{ name: 'a' }], [
    { name: 'a', options: { x: 1 } }
  ]), [
    { name: 'a', options: { x: 1 } }
  ])
  t.end()
})

test('preserves distinct sets of options', function (t) {
  t.same(match([{ name: 'a' }], [
    { name: 'a', options: { x: 1 } },
    { name: 'a', options: { x: 2 } },
    { name: 'a', options: { x: 2 } }
  ]), [
    { name: 'a', options: { x: 1 } },
    { name: 'a', options: { x: 2 } }
  ])
  t.end()
})

test('merges options', function (t) {
  t.same(match([{ name: 'a', options: { x: 1 } }], [
    { name: 'a', options: { x: 2 } }
  ]), [
    { name: 'a', options: { x: 2 } }
  ])
  t.same(match([{ name: 'a', options: { x: 1 } }], [
    { name: 'a', options: { y: 2 } }
  ]), [
    { name: 'a', options: { x: 1, y: 2 } }
  ])
  t.end()
})

test('match by custom property', function (t) {
  const a = [{ name: 'a', x: 1 }, { name: 'a', x: 2 }]

  t.same(match(a, [{ name: 'a', x: 2 }]), [{ name: 'a', x: 2, options: {} }])
  t.throws(() => match(a, [{ name: 'a', x: 0 }]), /^Error: Zero matches/)
  t.end()
})

test('match by nested custom property', function (t) {
  const a = [{ name: 'a', x: { y: 2 } }, { name: 'a', x: { z: 3 } }]

  t.same(match(a, [
    { name: 'a', x: { z: 3 } }
  ]), [
    { name: 'a', x: { z: 3 }, options: {} }
  ])
  t.end()
})

test('match by array of nested custom properties', function (t) {
  const a = [{ name: 'a', x: { y: 2 } }, { name: 'a', x: { z: 3 } }]
  t.same(match(a, [{ name: 'a', x: [{ y: 2 }, { z: 3 }] }]), a.map(normal))
  t.end()
})

test('match by version', function (t) {
  const a = [{ name: 'a', version: '1.0' }, { name: 'a', version: '2.0' }]

  t.same(match(a, [{ name: 'a', version: '1.0' }]), [
    { name: 'a', version: '1.0', options: {} }
  ])
  t.same(match(a, [{ name: 'a', version: '2.0' }]), [
    { name: 'a', version: '2.0', options: {} }
  ])
  t.same(match(a, [{ name: 'a', version: '2' }]), [
    { name: 'a', version: '2.0', options: {} }
  ])
  t.throws(
    () => match(a, [{ name: 'a', version: '2.1' }]), /^Error: Version not found/
  )
  t.end()
})

test('match multiple versions', function (t) {
  const a = [
    { name: 'a', version: '1.0' },
    { name: 'a', version: '2.0' },
    { name: 'a', version: '3.0' }
  ]
  t.same(match(a, [
    { name: 'a', version: ['1.0', '2.0'] }
  ]), a.slice(0, 2).map(normal))
  t.end()
})

test('throws if a version is not found', function (t) {
  const a = [{ name: 'a', version: '1.0' }]

  t.throws(
    () => match(a, [{ name: 'a', version: '2.0' }]),
    /^Error: Version not found/
  )
  t.throws(
    () => match(a, [{ name: 'a', version: ['1.0', '2.0'] }]),
    /^Error: Version not found/
  )
  t.end()
})

test('matches latest version by default', function (t) {
  const a = [
    { name: 'a', version: '1.0' },
    { name: 'a', version: '2.0' },
    { name: 'a', version: '3.0' }
  ]

  t.same(match(a, [{ name: 'a' }]), a.slice(-1).map(normal))
  t.end()
})

test('match version "latest"', function (t) {
  const a = [
    { name: 'a', version: '1.0' },
    { name: 'a', version: '2.0' },
    { name: 'a', version: '3.0' }
  ]

  t.same(match(a, [{ name: 'a', version: 'latest' }]), a.slice(-1).map(normal))
  t.end()
})

test('match version "oldest"', function (t) {
  const a = [
    { name: 'a', version: '1.0' },
    { name: 'a', version: '2.0' },
    { name: 'a', version: '3.0' }
  ]

  t.same(match(a, [{ name: 'a', version: 'oldest' }]), a.slice(0, 1).map(normal))
  t.end()
})

test('match version range', function (t) {
  const a = [
    { name: 'a', version: '1.0' },
    { name: 'a', version: '2.0' },
    { name: 'a', version: '3.0' }
  ]

  t.same(match(a, [{ name: 'a', version: '..1.0' }]), a.slice(0, 1).map(normal))
  t.same(match(a, [{ name: 'a', version: '..2.0' }]), a.slice(0, 2).map(normal))
  t.same(match(a, [{ name: 'a', version: '2.0..3.0' }]), a.slice(1).map(normal))
  t.same(match(a, [{ name: 'a', version: '3.0..3.0' }]), a.slice(-1).map(normal))
  t.throws(
    () => match(a, [{ name: 'a', version: '0.0..3.0' }]),
    /^Error: Version not found: 0\.0/
  )

  t.end()
})

test('throws if version range matches nothing', function (t) {
  const a = [{ name: 'a', version: '3.0' }]
  t.throws(() => match(a, [{ name: 'a', version: '1.0..2.0' }]), /^Error: Version not found/)
  t.end()
})

test('match version range "oldest..latest"', function (t) {
  const a = [
    { name: 'a', version: '1.0' },
    { name: 'a', version: '2.0' },
    { name: 'a', version: '3.0' }
  ]

  t.same(match(a, [{ name: 'a', version: 'oldest..latest' }]), a.map(normal))
  t.same(match(a, [{ name: 'a', version: 'oldest..' }]), a.map(normal))
  t.same(match(a, [{ name: 'a', version: '..latest' }]), a.map(normal))
  // t.throws(() => match(a, [{ name: 'a', version: 'latest..oldest' }]), /^Error: Zero matches/)
  t.end()
})

test('match negative version range', function (t) {
  const a = [
    { name: 'a', version: '1.0' },
    { name: 'a', version: '2.0' },
    { name: 'a', version: '3.0' }
  ]

  t.same(match(a, [{ name: 'a', version: '-1..latest' }]), a.slice(-2).map(normal))
  t.same(match(a, [{ name: 'a', version: '-2..latest' }]), a.map(normal))
  t.same(match(a, [{ name: 'a', version: '-20..latest' }]), a.map(normal))
  t.end()
})

test('match string versions', function (t) {
  const a = [
    { name: 'a', version: '1.0' },
    { name: 'a', version: '2.0' },
    { name: 'a', version: 'beta' }
  ]

  t.same(match(a, [{ name: 'a', version: 'beta' }]), a.slice(-1).map(normal))
  t.same(match(a, [{ name: 'a', version: 'beta..beta' }]), a.slice(-1).map(normal))
  t.same(match(a, [{ name: 'a', version: 'latest..beta' }]), a.slice(-2).map(normal))
  t.same(match(a, [{ name: 'a', version: 'oldest..beta' }]), a.map(normal))
  t.same(match(a, [{ name: 'a', version: 'oldest..latest' }]), a.slice(0, -1).map(normal))
  t.throws(() => match(a, [{ name: 'a', version: 'dev' }]), /^Error: Version not found: dev/)
  t.end()
})

test('match array of platforms', function (t) {
  const a = [{ name: 'a', platform: 'a' }, { name: 'a', platform: 'b' }]

  t.same(match(a, [{ name: 'a', platform: ['a', 'b'] }]), a.map(normal))
  t.same(match(a, [{ name: 'a', platform: ['a'] }]), a.slice(0, 1).map(normal))
  t.same(match(a, [{ name: 'a', platform: ['b'] }]), a.slice(-1).map(normal))
  t.end()
})

test('sorts results by name', function (t) {
  const a = [{ name: 'b' }, { name: 'a' }]

  t.same(match(a, [{ name: 'b' }, { name: 'a' }]), a.reverse().map(normal))
  t.end()
})

test('sorts results by version', function (t) {
  const a = [{ name: 'a', version: '2.0' }, { name: 'a', version: '1.0' }]

  t.same(match(a, [{ name: 'a', version: '..latest' }]), a.reverse().map(normal))
  t.end()
})

test('preferredOver: basic', function (t) {
  const a = [
    { name: 'a' },
    { name: 'a', foo: { bar: 2, baz: 'abc' } }
  ]

  t.same(match(a, [{ name: 'a' }]), [normal(a[1])], 'without preferredOver')

  a[0].preferredOver = { 'foo.bar': [2] }
  t.same(match(a, [{ name: 'a' }]), [normal(a[0])], 'preferredOver matches single value')

  a[0].preferredOver = { 'foo.bar': [2, 3] }
  t.same(match(a, [{ name: 'a' }]), [normal(a[0])], 'preferredOver matches one of values')

  a[0].preferredOver = { 'foo.baz': ['ABc'] }
  t.same(match(a, [{ name: 'a' }]), [normal(a[0])], 'matching is case-insensitive')

  a[0].preferredOver = { 'foo.bar': ['2'] }
  t.same(match(a, [{ name: 'a' }]), [normal(a[0])], 'matching is loosely typed')

  a[0].preferredOver = { 'foo.bar': ['any'] }
  t.same(match(a, [{ name: 'a' }]), [normal(a[0])], '"any" matches primitive')

  a[0].preferredOver = { foo: ['any'] }
  t.same(match(a, [{ name: 'a' }]), [normal(a[0])], '"any" matches object')

  a[0].preferredOver = { nope: ['any'] }
  t.same(match(a, [{ name: 'a' }]), [normal(a[1])], '"any" matches only if property exists')

  a[0].preferredOver = { 'foo.bar': [3] }
  t.same(match(a, [{ name: 'a' }]), [normal(a[1])], 'does not apply if value is not found')

  a[0].preferredOver = { 'foo.bar': [2] }
  t.same(match(a, [{ name: 'a', foo: { bar: 2 } }]), [normal(a[1])], 'does not apply if explicitly matched')

  a[0].preferredOver = { 'foo.bar': ['any'] }
  t.same(match(a, [{ name: 'a', foo: { bar: 2 } }]), [normal(a[1])], '"any" does not apply if explicitly matched')

  t.end()
})

test('preferredOver: compares all in group against each other', function (t) {
  const a = [
    { name: 'a', foo: '1' },
    { name: 'a', foo: '2' },
    { name: 'a', foo: '3' }
  ]

  t.same(match(a, [{ name: 'a' }]), [normal(a[2])], 'without preferredOver')

  a[1].preferredOver = { foo: ['3'] }
  t.same(match(a, [{ name: 'a' }]), [normal(a[1])], 'spec 1 over spec 2')
  delete a[1].preferredOver

  a[0].preferredOver = { foo: ['3'] }
  t.same(match(a, [{ name: 'a' }]), [normal(a[0])], 'spec 0 over spec 2')

  t.end()
})

// Not sure if this makes sense.
test.skip('preferredOver: does not apply if other property is not referenced', function (t) {
  const a = [
    { name: 'a', foo: '1', one: 'one' },
    { name: 'a', foo: '2', preferredOver: { one: ['one'] } },
    { name: 'a', foo: '3', two: 'two' }
  ]

  t.same(match(a, [{ name: 'a' }]), [normal(a[2])])

  const b = [
    { name: 'a', foo: '1', one: 'one' },
    { name: 'a', foo: '2', preferredOver: { one: ['one'], two: ['two'] } },
    { name: 'a', foo: '3', two: 'two' }
  ]

  t.same(match(b, [{ name: 'a' }]), [normal(b[1])])
  t.end()
})

test('preferredOver: specific value takes precedence over "any"', function (t) {
  const a = [
    { name: 'a', foo: '1', one: 'one', preferredOver: { two: ['two'] } },
    { name: 'a', foo: '2', preferredOver: { one: ['any'] } },
    { name: 'a', foo: '3', two: 'two' }
  ]

  t.same(match(a, [{ name: 'a' }]), [normal(a[0])])

  const b = [
    { name: 'a', foo: '1', one: 'one', preferredOver: { two: ['any'] } },
    { name: 'a', foo: '2', preferredOver: { two: ['two'] } },
    { name: 'a', foo: '3', two: 'two' }
  ]

  t.same(match(b, [{ name: 'a' }]), [normal(b[1])])
  t.end()
})

test('preferredOver: "android" 6 prefers Android GoogleAPI Emulator', function (t) {
  const res = match(sauceSpecs, [{ name: 'android', version: '6' }])
  t.is(res.length, 1)
  t.is(res[0].version, '6.0')
  t.is(res[0].capabilities.appium.deviceName, 'Android GoogleAPI Emulator')
  t.end()
})

test('preferredOver: "and_chr" 6 prefers Android GoogleAPI Emulator', function (t) {
  const res = match(sauceSpecs, [{ name: 'and_chr', version: '6' }])
  t.is(res.length, 1)
  t.is(res[0].version, '6.0')
  t.is(res[0].capabilities.appium.deviceName, 'Android GoogleAPI Emulator')
  t.end()
})

test('preferredOver: "and_chr" 10 prefers Android GoogleAPI Emulator', function (t) {
  const res = match(sauceSpecs, [{ name: 'and_chr', version: '10' }])
  t.is(res.length, 1)
  t.is(res[0].version, '10.0')
  t.is(res[0].capabilities.appium.deviceName, 'Android GoogleAPI Emulator')
  t.end()
})

test('preferredOver: "and_chr" 10 with custom emulator', function (t) {
  const res = match(sauceSpecs, [{
    name: 'and_chr',
    version: '10',
    capabilities: {
      appium: {
        deviceName: 'google pixel 3a googleapi emulator'
      }
    }
  }])
  t.is(res.length, 1)
  t.is(res[0].version, '10.0')
  t.is(res[0].capabilities.appium.deviceName, 'Google Pixel 3a GoogleAPI Emulator')
  t.end()
})

test('preferredOver: "ios_saf" 13 prefers iPhone Simulator', function (t) {
  const res = match(sauceSpecs, [{ name: 'ios_saf', version: '13' }])
  t.is(res.length, 1)
  t.is(res[0].version, '13.0')
  t.is(res[0].capabilities.appium.deviceName, 'iPhone Simulator')
  t.end()
})

test('preferredOver: "ios_saf" 13 with custom simulator', function (t) {
  const res = match(sauceSpecs, [{
    name: 'ios_saf',
    version: '13',
    capabilities: {
      appium: {
        deviceName: 'ipad simulator'
      }
    }
  }])
  t.is(res.length, 1)
  t.is(res[0].version, '13.0')
  t.is(res[0].capabilities.appium.deviceName, 'iPad Simulator')
  t.end()
})

function normal (spec) {
  return { ...spec, options: {} }
}

function cmpName (a, b) {
  return a.name.localeCompare(b.name)
}
