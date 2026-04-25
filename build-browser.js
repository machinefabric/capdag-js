#!/usr/bin/env node
// Build browser-compatible bundles of tagged-urn, capdag, and
// cap-graph-renderer from the local sources + resolved tagged-urn
// dependency. Outputs three self-contained IIFE-wrapped JS files to
// `dist/` that each expose their exported classes as window globals.
//
// The browser build exists because capdag-js source files are CJS:
// they use `require()` and `module.exports`, which a plain <script tag>
// cannot load. For browser consumers (capdag-dot-com, machfab-mac
// WKWebViews) we strip those CJS hooks and wrap the result in an IIFE
// that assigns to window.*.
//
// Load order at the consumer:
//   1. tagged-urn.js       — defines window.TaggedUrn, etc.
//   2. capdag.js           — reads window.TaggedUrn, defines CapUrn,
//                            MediaUrn, Cap, CapGraph, createCap, …
//   3. cap-graph-renderer.js — reads window.cytoscape + capdag globals
//                              at call time, defines CapGraphRenderer.
//
// Running: `node build-browser.js [outDir]`. Default outDir is ./dist.

'use strict';

const fs = require('fs');
const path = require('path');

const here = __dirname;
const outDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(here, 'dist');
fs.mkdirSync(outDir, { recursive: true });

function stripCJS(src) {
  // Strip the CJS `const { TaggedUrn } = require('tagged-urn')` line and
  // the trailing `module.exports = {...}` block. Both are at known
  // positions in the source; the regex matches the full single-line
  // require and the multi-line module.exports object literal.
  return src
    .replace(/^\/\/.*Import TaggedUrn.*\n/m, '')
    .replace(/^const\s*\{\s*TaggedUrn\s*\}\s*=\s*require\s*\(\s*['"]tagged-urn['"]\s*\)\s*;?\s*$/m, '')
    .replace(/^module\.exports\s*=\s*\{[\s\S]*?\};?\s*$/m, '');
}

function buildTaggedUrn() {
  // tagged-urn is a sibling npm dependency. Resolve its main file.
  const srcPath = require.resolve('tagged-urn');
  const src = fs.readFileSync(srcPath, 'utf8');
  const processed = src.replace(/^module\.exports\s*=\s*\{[\s\S]*?\};?\s*$/m, '');
  const wrapped = `// tagged-urn — browser build
// Generated from the tagged-urn npm package by capdag-js/build-browser.js.
// Do not edit directly.

(function() {
'use strict';

${processed}

window.TaggedUrn = TaggedUrn;
window.TaggedUrnBuilder = TaggedUrnBuilder;
window.UrnMatcher = UrnMatcher;
window.TaggedUrnError = TaggedUrnError;
window.TaggedUrnErrorCodes = ErrorCodes;

})();
`;
  fs.writeFileSync(path.join(outDir, 'tagged-urn.js'), wrapped);
  console.log(`  wrote ${path.join(outDir, 'tagged-urn.js')}`);
}

function buildCapdag() {
  const srcPath = path.join(here, 'capdag.js');
  const src = fs.readFileSync(srcPath, 'utf8');

  const parserPath = path.join(here, 'machine-parser.js');
  if (!fs.existsSync(parserPath)) {
    throw new Error(`machine-parser.js not found at ${parserPath} — run 'npm run build:parser' first`);
  }
  const parserSrc = fs.readFileSync(parserPath, 'utf8');

  let processed = stripCJS(src);
  // Replace the `const machineParser = require('./machine-parser.js')`
  // line with a local variable the inlined parser assigns below.
  processed = processed.replace(
    /^const\s+machineParser\s*=\s*require\s*\(\s*['"]\.\/machine-parser\.js['"]\s*\)\s*;?\s*$/m,
    '// machineParser is inlined above'
  );

  const inlinedParser = `
// Inlined Peggy-generated machine parser.
var machineParser = (function() {
  var module = { exports: {} };
  var exports = module.exports;
${parserSrc}
  return module.exports;
})();
`;

  const wrapped = `// capdag — browser build
// Generated from capdag-js/capdag.js by capdag-js/build-browser.js.
// Do not edit directly. Requires tagged-urn.js loaded first.

(function() {
'use strict';

const { TaggedUrn } = window;
if (!TaggedUrn) {
  throw new Error('TaggedUrn global is not defined. Load tagged-urn.js before capdag.js.');
}

${inlinedParser}

${processed}

// Expose every public class and function as a window global.
window.CapUrn = CapUrn;
window.CapUrnBuilder = CapUrnBuilder;
window.CapMatcher = CapMatcher;
window.CapUrnError = CapUrnError;
window.CapUrnErrorCodes = ErrorCodes;
window.MediaUrn = MediaUrn;
window.MediaUrnError = MediaUrnError;
window.MediaUrnErrorCodes = MediaUrnErrorCodes;
window.Cap = Cap;
window.CapArg = CapArg;
window.ArgSource = ArgSource;
window.RegisteredBy = RegisteredBy;
window.createCap = createCap;
window.createCapWithDescription = createCapWithDescription;
window.createCapWithMetadata = createCapWithMetadata;
window.createCapWithDescriptionAndMetadata = createCapWithDescriptionAndMetadata;
window.ValidationError = ValidationError;
window.InputValidator = InputValidator;
window.OutputValidator = OutputValidator;
window.CapValidator = CapValidator;
window.validateCapArgs = validateCapArgs;
window.RESERVED_CLI_FLAGS = RESERVED_CLI_FLAGS;
window.MediaSpec = MediaSpec;
window.MediaSpecError = MediaSpecError;
window.MediaSpecErrorCodes = MediaSpecErrorCodes;
window.isBinaryCapUrn = isBinaryCapUrn;
window.isJSONCapUrn = isJSONCapUrn;
window.isStructuredCapUrn = isStructuredCapUrn;
window.resolveMediaUrn = resolveMediaUrn;
window.buildExtensionIndex = buildExtensionIndex;
window.mediaUrnsForExtension = mediaUrnsForExtension;
window.getExtensionMappings = getExtensionMappings;
window.CapGraphEdge = CapGraphEdge;
window.CapGraphStats = CapGraphStats;
window.CapGraph = CapGraph;
window.StdinSource = StdinSource;
window.StdinSourceKind = StdinSourceKind;
window.CapArgumentValue = CapArgumentValue;
window.MachineSyntaxError = MachineSyntaxError;
window.MachineSyntaxErrorCodes = MachineSyntaxErrorCodes;
window.MachineEdge = MachineEdge;
window.Machine = Machine;
window.MachineBuilder = MachineBuilder;
window.parseMachine = parseMachine;

})();
`;

  fs.writeFileSync(path.join(outDir, 'capdag.js'), wrapped);
  console.log(`  wrote ${path.join(outDir, 'capdag.js')}`);
}

function buildCapGraphRenderer() {
  const srcPath = path.join(here, 'cap-graph-renderer.js');
  const src = fs.readFileSync(srcPath, 'utf8');
  // The file's CJS exports block is at the bottom, guarded by
  // `typeof module !== 'undefined'`. Strip everything from that guard
  // to the end of the file.
  const stripped = src.replace(
    /if\s*\(\s*typeof\s+module\s*!==\s*'undefined'[\s\S]*$/,
    ''
  );
  const wrapped = `// cap-graph-renderer — browser build
// Generated from capdag-js/cap-graph-renderer.js by capdag-js/build-browser.js.
// Do not edit directly. Requires cytoscape, cytoscape-elk, tagged-urn.js,
// and capdag.js to be loaded first.

(function() {
'use strict';

${stripped}

window.CapGraphRenderer = CapGraphRenderer;

})();
`;
  fs.writeFileSync(path.join(outDir, 'cap-graph-renderer.js'), wrapped);
  console.log(`  wrote ${path.join(outDir, 'cap-graph-renderer.js')}`);
}

buildTaggedUrn();
buildCapdag();
buildCapGraphRenderer();
console.log(`browser bundles written to ${outDir}`);
