'use strict'

const test = require('tape')
const match = require('.')
const sauce = require('./sauce-fixture.json')
const start = Date.now()

process.on('exit', function () {
  console.error('Took %o ms', Date.now() - start)
})

test('includes browsers that need secure env vars', simulateSecureEnv(function (t) {
  const a = [{ name: 'a', wants: { secureEnv: true } }, { name: 'b' }]
  t.same(match(a, [{ name: 'a' }, { name: 'b' }]), a.map(normal))
  t.end()
}))

test('excludes browsers that need secure env vars', simulateSecureEnv(function (t) {
  const a = [{ name: 'a', wants: { secureEnv: true } }, { name: 'b' }]
  t.same(match(a, [{ name: 'a' }, { name: 'b' }]), a.slice(1).map(normal))
  t.end()
}, false))

test('match sauce manifests against sauce manifests', simulateSecureEnv(function (t) {
  const res = match(sauce, sauce)
  t.same(res, sauce.map(normal).sort(cmpName))
  t.end()
}))

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

test('removes exact duplicates (same manifest, same options)', function (t) {
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
    () => match(a, [{ name: 'a', version: '2.1' }]), /^Error: Zero matches for/
  )
  t.end()
})

test('matches version elements numerically', function (t) {
  const a = [{ name: 'a', version: '10.0' }, { name: 'a', version: '2.0' }]

  t.same(match(a, [{ name: 'a', version: '10.0' }]), [
    { name: 'a', version: '10.0', options: {} }
  ])
  t.same(match(a, [{ name: 'a', version: '2.0' }]), [
    { name: 'a', version: '2.0', options: {} }
  ])
  t.same(match(a, [{ name: 'a', version: 'oldest..latest' }]), [
    { name: 'a', version: '2.0', options: {} },
    { name: 'a', version: '10.0', options: {} }
  ])
  t.end()
})

test('match versions with different amount of elements', function (t) {
  const a = [{ name: 'a', version: '11.00.4.9' }, { name: 'a', version: '11' }]

  t.same(match(a, [{ name: 'a' }]), [
    { name: 'a', version: '11.00.4.9', options: {} }
  ])
  t.same(match(a, [{ name: 'a', version: '11' }]), [
    // TODO: does this make sense, compared to "version: latest" behavior?
    { name: 'a', version: '11', options: {} },
    { name: 'a', version: '11.00.4.9', options: {} }
  ])
  t.same(match(a, [{ name: 'a', version: '11.0' }]), [
    { name: 'a', version: '11.00.4.9', options: {} }
  ])
  t.same(match(a, [{ name: 'a', version: '11.00' }]), [
    { name: 'a', version: '11.00.4.9', options: {} }
  ])
  t.same(match(a, [{ name: 'a', version: '11.00.4.9' }]), [
    { name: 'a', version: '11.00.4.9', options: {} }
  ])
  t.same(match(a, [{ name: 'a', version: '11.0.4.9' }]), [
    { name: 'a', version: '11.00.4.9', options: {} }
  ])
  t.same(match(a, [{ name: 'a', version: '11.0.4' }]), [
    { name: 'a', version: '11.00.4.9', options: {} }
  ])
  t.same(match(a, [{ name: 'a', version: '11.00.4' }]), [
    { name: 'a', version: '11.00.4.9', options: {} }
  ])
  t.end()
})

test('takes latest of versions with 4 elements', function (t) {
  const a = [
    { name: 'ie', version: '11.00.18362.890' },
    { name: 'ie', version: '11.00.18362.1' }
  ]

  t.same(match(a, [{ name: 'ie' }]), [
    { name: 'ie', version: '11.00.18362.890', options: {} }
  ])
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
    /^Error: Zero matches for/
  )
  t.throws(
    () => match(a, [{ name: 'a', version: ['1.0', '2.0'] }]),
    /^Error: Zero matches for/
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
  t.same(match(a, [{ name: 'a', version: '0.0..3.0' }]), a.map(normal))

  t.end()
})

test('throws if version range matches nothing', function (t) {
  const a = [{ name: 'a', version: '3.0' }]
  t.throws(() => match(a, [{ name: 'a', version: '1.0..2.0' }]), /^Error: Zero matches for/)
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
  t.throws(() => match(a, [{ name: 'a', version: 'latest..oldest' }]), /^Error: Zero matches for/)
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
  t.throws(() => match(a, [{ name: 'a', version: 'dev' }]), /^Error: Zero matches for/)
  t.end()
})

test('match missing version', function (t) {
  const a1 = [
    { name: 'a', version: '1.0' },
    { name: 'a', version: '2.0' },
    { name: 'a', version: 'beta' },
    { name: 'a' }
  ]

  t.same(match(a1, [{ name: 'a', version: 'beta' }]), a1.slice(2, 3).map(normal))
  t.same(match(a1, [{ name: 'a', version: 'beta..beta' }]), a1.slice(2, 3).map(normal))
  t.same(match(a1, [{ name: 'a', version: 'latest..beta' }]), a1.slice(1, 3).map(normal))
  t.same(match(a1, [{ name: 'a', version: 'oldest..beta' }]), a1.slice(0, -1).map(normal))
  t.throws(() => match(a1, [{ name: 'a', version: 'dev' }]), /^Error: Zero matches for/)

  const a2 = [{ name: 'a' }]

  t.same(match(a2, [{ name: 'a' }]), a2.map(normal))
  t.throws(() => match(a2, [{ name: 'a', version: 'beta' }]), /^Error: Zero matches for/)
  t.throws(() => match(a2, [{ name: 'a', version: 'dev' }]), /^Error: Zero matches for/)

  const a3 = [{ name: 'a', version: 'beta' }]

  t.same(match(a3, [{ name: 'a' }]), a3.map(normal))
  t.same(match(a3, [{ name: 'a', version: 'beta' }]), a3.map(normal))
  t.throws(() => match(a3, [{ name: 'a', version: 'dev' }]), /^Error: Zero matches for/)

  t.end()
})

test('match firefox versions', function (t) {
  const a1 = [
    { name: 'firefox', version: '78.0.1' },
    { name: 'firefox', version: '79.0' },
    { name: 'firefox', version: '80.0a1' } // nightly, should not match latest
  ]

  t.same(match(a1, [{ name: 'firefox', version: 'oldest' }]), [a1[0]].map(normal))
  t.same(match(a1, [{ name: 'firefox', version: 'latest' }]), [a1[1]].map(normal))
  t.same(match(a1, [{ name: 'firefox', version: '80.0a1' }]), [a1[2]].map(normal))

  const a2 = [
    { name: 'firefox', version: '80.1a1' },
    { name: 'firefox', version: '80.2a1' }
  ]

  t.same(match(a2, [{ name: 'firefox' }]), [
    { name: 'firefox', version: '80.2a1', options: {} }
  ], 'no stable versions available, return last prerelease')

  t.same(match(a2, [{ name: 'firefox', version: '80.2a1' }]), [
    { name: 'firefox', version: '80.2a1', options: {} }
  ], 'exact match')

  t.same(match(a2, [{ name: 'firefox', version: '80.1a1' }]), [
    { name: 'firefox', version: '80.1a1', options: {} }
  ], 'exact match')

  t.throws(
    () => match(a2, [{ name: 'firefox', version: '80' }]), /^Error: Zero matches for/,
    'prerelease must be specified exactly'
  )

  t.throws(
    () => match(a2, [{ name: 'firefox', version: '80.0' }]), /^Error: Zero matches for/,
    'prerelease must be specified exactly'
  )

  t.end()
})

test.skip('match array of platforms', function (t) {
  const a = [{ name: 'a', platform: 'a' }, { name: 'a', platform: 'b' }]

  t.same(match(a, [{ name: 'a', platform: ['a', 'b'] }]), a.map(normal))
  t.same(match(a, [{ name: 'a', platform: ['a'] }]), a.slice(0, 1).map(normal))
  t.same(match(a, [{ name: 'a', platform: ['b'] }]), a.slice(-1).map(normal))
  t.end()
})

test.skip('match by array of nested custom properties', function (t) {
  const a = [{ name: 'a', x: { y: 2 } }, { name: 'a', x: { z: 3 } }]
  t.same(match(a, [{ name: 'a', x: [{ y: 2 }, { z: 3 }] }]), a.map(normal))
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

test('unspecified primitive property, last manifest wins', function (t) {
  const a = [
    { name: 'a', foo: '1' },
    { name: 'a', foo: '2' },
    { name: 'a', foo: '3' }
  ]

  t.same(match(a, [{ name: 'a' }]), [normal(a[2])])
  t.end()
})

test('unspecified object property, last manifest wins', function (t) {
  const a = [
    { name: 'a' },
    { name: 'a', foo: { bar: 2, baz: 'abc' } }
  ]

  t.same(match(a, [{ name: 'a' }]), [normal(a[1])])
  t.end()
})

test('"and_chr" 10 with custom emulator', simulateSecureEnv(function (t) {
  const res = match(sauce, [{
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
}))

test('"ios_saf" 13.2 with custom simulator', simulateSecureEnv(function (t) {
  const res = match(sauce, [{
    name: 'ios_saf',
    version: '13.2',
    capabilities: {
      appium: {
        deviceName: 'ipad simulator'
      }
    }
  }])
  t.is(res.length, 1)
  t.is(res[0].version, '13.2')
  t.is(res[0].capabilities.appium.deviceName, 'iPad Simulator')
  t.end()
}))

function simulateSecureEnv (test, secure) {
  return function wrapped (t) {
    process.env.AIRTAP_IS_SECURE_ENV = String(secure !== false)
    t.once('end', resetEnv)
    test(t)
  }
}

function resetEnv () {
  process.env.AIRTAP_IS_SECURE_ENV = ''
}

function normal (manifest) {
  return { ...manifest, options: {} }
}

function cmpName (a, b) {
  return a.name.localeCompare(b.name)
}
