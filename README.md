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
proved model ([formal foundations](https://machinefabric.com/capdag/docs/02-formal-foundations/)),
which runs as WebAssembly: it is instantiated when the package is first
imported, so importing it waits for that (top-level `await`), and a CommonJS
`require` cannot load it.

## Parse and build Cap URNs

```javascript
import { CapUrn, CapUrnBuilder } from "capdag";

const parsed = CapUrn.fromString(
  'cap:disbind;in="media:document;ext=pdf";out="media:enc=utf-8;page"'
);
const built = new CapUrnBuilder()
  .inSpec("media:document;ext=pdf")
  .outSpec("media:enc=utf-8;page")
  .marker("disbind")
  .build();

console.log(parsed.toString() === built.toString());
```

Treat URNs as opaque parsed values. Use the package's predicates for
equivalence, conformance, dispatch, and ranking instead of string surgery.

## Read and write Machine Notation

A machine is read against the definitions of the caps it names: they say what
each step takes and gives, by name and by type, and what a constant written in
the machine is held to.

```javascript
import { Cap, CapArg, CapOutput, ArgSource, CapUrn, CapDefinitions, parseMachine } from "capdag";

const extract = new Cap(
  CapUrn.fromString('cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
  "Extract Text", ["extract"]
);
extract.addArg(new CapArg("media:document;ext=pdf", "document", true,
  [new ArgSource({ stdin: "media:document;ext=pdf" })]));
extract.addOutput(new CapOutput("media:enc=utf-8;ext=txt", "text", "The text"));

const definitions = new CapDefinitions().addCaps([extract]);
const machine = parseMachine(
  '[extract cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
  "[(document=pdf) -> extract -> text]",
  definitions
);
console.log(machine.toMachineNotation());
```

The definitions can come from the fabric registry instead. A client reads one
manifest of it — a pinned version, or the one the registry has promoted as its
latest — fetches each definition it needs, holds each cap to the definition
rules as it reads it, and then serves as the definitions a machine is parsed
against, fabric aliases included:

```javascript
import { FabricRegistryClient, parseMachine } from "capdag";

const fabric = await FabricRegistryClient.latest("https://fabric.capdag.com");
await fabric.getCap('cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"');
const machine = parseMachine(
  '[extract cap:in="media:document;ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
  "[pdf -> extract -> text]",
  fabric
);
```

A cap or media definition names the dims it was built from, and the value
chosen from each, in its `dims`; its own `documentation` is only what is
specific to it. A definition is held only together with every dim it names,
so `fabric.getCachedDim(name)` gives the dim's title and documentation and
those of each of its values (`getDim(name)` fetches one by name).

`parseMachineWithAST` also returns every statement with where each part of it
stands in the text, and the name the text gave each node. A machine that names
other machines in step position is read with a `MachineSource`
(`MapMachineSource`, or `FileMachineSource` under Node.js). Anything with
`capDefinition(urn)` and `mediaDefinition(urn)` can stand in for
`CapDefinitions`.

## Find the relevant API

- `capdag.js` provides URNs, definitions, dispatch, matching, and Machine
  Notation: reading, resolving and writing machines.
- `machine-parser.js` is generated from `machine.pegjs`.
- `planner.js` provides the planner's request and result vocabulary.
- `cap-fab-renderer.js` (`capdag/cap-fab-renderer`) renders graphs; the page
  provides cytoscape and cytoscape-elk.
- `formal/` is the generated model code, with its WebAssembly program.
- [`RULES.md`](RULES.md) records package-specific construction rules.

The normative semantics and terminology live in the
[CapDAG specification](https://machinefabric.com/capdag/docs/01-overview/). Source comments and
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
