# CapDAG for JavaScript

This public package is CapDAG's JavaScript planning and notation mirror. Use it
in browsers or Node.js for Tagged, Media, and Cap URNs, capability definitions,
dispatch, Machine Notation, planning, and graph rendering.

JavaScript intentionally does not implement the cartridge runtime, host, relay,
or Bifaci process surface. That boundary is part of the package design, not an
unreported parity gap. Rust remains the behavioral reference for shared
features.

## Install the package

```bash
npm install capdag
```

The package is an ES module and needs Node.js 20 or newer. Dispatch,
acceptance, equivalence and specificity are decided by code generated from the
proved model ([formal foundations](https://capdag.com/docs/02-formal-foundations/)),
which runs as WebAssembly: it is instantiated when the package is first
imported, so importing it waits for that (top-level `await`), and a CommonJS
`require` cannot load it.

## Parse and build Cap URNs

```javascript
import { CapUrn, CapUrnBuilder } from "capdag";

const parsed = CapUrn.fromString(
  'cap:disbind;in="media:ext=pdf";out="media:enc=utf-8;page"'
);
const built = new CapUrnBuilder()
  .inSpec("media:ext=pdf")
  .outSpec("media:enc=utf-8;page")
  .marker("disbind")
  .build();

console.log(parsed.toString() === built.toString());
```

Treat URNs as opaque parsed values. Use the package's predicates for
equivalence, conformance, dispatch, and ranking instead of string surgery.

## Find the relevant API

- `capdag.js` provides URNs, definitions, dispatch, and matching.
- `machine-parser.js` is generated from `machine.pegjs`.
- `planner.js` provides planning and Machine Notation structures.
- `cap-fab-renderer.js` (`capdag/cap-fab-renderer`) renders graphs; the page
  provides cytoscape and cytoscape-elk.
- `formal/` is the generated model code, with its WebAssembly program.
- [`RULES.md`](RULES.md) records package-specific construction rules.

The normative semantics and terminology live in the
[CapDAG specification](https://capdag.com/docs/01-overview/). Source comments and
exports are the JavaScript API reference.

## Use it in a browser

`node build-browser.js <dir>` lays out capdag, tagged-urn and lungo-ts as ES
modules a page loads without a bundler, each beside its WebAssembly program.
A page imports `<dir>/capdag/capdag.js`, or — for page scripts that are not
modules — imports `<dir>/capdag/browser.js` from a module script, which puts
every public name on the global object once the models are instantiated. A page
with a content security policy allows `script-src 'wasm-unsafe-eval'`.

## Build and verify changes

```bash
npm run build:parser
npm test
```

`npm test` runs the parser build first. Shared behavior changes require the
applicable reference test with the same substantive number and assertions.

## License

MIT
