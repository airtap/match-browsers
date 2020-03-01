# airtap-match-browsers

> **Match browsers in Airtap 4 format.**  
> Intended to replace [`sauce-browsers`](https://github.com/lpinca/sauce-browsers) in conjunction with [`airtap-sauce-browsers`](https://github.com/airtap/sauce-browsers).

[![npm status](http://img.shields.io/npm/v/airtap-match-browsers.svg)](https://www.npmjs.org/package/airtap-match-browsers)
[![node](https://img.shields.io/node/v/airtap-match-browsers.svg)](https://www.npmjs.org/package/airtap-match-browsers)
[![Travis](https://img.shields.io/travis/com/airtap/match-browsers.svg)](https://travis-ci.com/airtap/match-browsers)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Usage

```js
const sauce = require('airtap-sauce-browsers').promise
const match = require('airtap-match-browsers')

// A list of browsers available on Sauce Labs
const available = await sauce()

// A list of browsers that we want
const wanted = [
  { name: 'firefox', platform: 'linux' },
  { name: 'chrome', version: '78..latest' },
  { name: 'ios safari', version: '13' }
]

// Select browsers
const specs = match(available, wanted)
```

## Properties to match on

### `name`

Required, must be a string. Matched loosely using [`browser-names`](https://github.com/airtap/browser-names).

### `version`

Defaults to "latest". Supported forms (compatible with Zuul & Airtap):

- An exact or partial version ("6" matches "6.0").
- A keyword, one of "oldest" (first version) or "latest" (last numeric version).
- A range in the form of `<start>..<end>`, where `start` and `end` are either a version or a keyword.
- A negative range in the form of `-<n>..latest`, for example `-1..latest` which means the last 2 numeric versions.
- A non-numeric version like "dev" and "beta". Such versions sort after numeric versions, so that `oldest..latest` excludes "dev" and `latest..dev` includes latest, "beta" and "dev".
- An array of versions.

If a version is not found (including in ranges), an error is thrown.

### `platform` and any other (nested) property

Yet to document. A quick example:

```js
const specs = match(available, [{
  name: 'chrome for android',
  version: '10',
  capabilities: {
    appium: {
      // Select a specific emulator (case-insensitive)
      deviceName: 'google pixel 3a googleapi emulator'
    }
  }
}])
```

## Specifying options

Yet to document.

## Deduplication logic

Yet to document.

## Install

With [npm](https://npmjs.org) do:

```
npm install airtap-match-browsers
```

## License

[MIT](LICENSE.md) © 2020-present Vincent Weevers
