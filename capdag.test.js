// Cap URN JavaScript Test Suite
// Tests mirror Rust test numbering (TEST###) for cross-language tracking.
// All implementations (Rust, Go, JS, ObjC, Python) must pass these identically.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TaggedUrn } from 'tagged-urn';
import * as plannerNS from './planner.js';
import {
  CapUrn, CapKind, CapEffect, CapUrnBuilder, CapMatcher, CapUrnError, ErrorCodes,
  MediaUrn, MediaUrnError, MediaUrnErrorCodes,
  Cap, CapGroup, CapManifest, MediaDef, MediaDefError, MediaDefErrorCodes,
  resolveMediaUrn, buildExtensionIndex, mediaUrnsForExtension, getExtensionMappings,
  CartridgeInfo, CartridgeCapSummary, CartridgeSuggestion, CartridgeRepoClient, CartridgeRepoServer,
  hostPlatform, CompatStatus, primaryPackage, CartridgeCompatibilityResolution,
  registryUrlFromBuildEnv,
  slugForSync, CartridgeInstallSource, validateRegistryUrlScheme, RegistryUrlSchemeResultKind,
  CartridgeJson, CartridgeJsonError, CartridgeJsonErrorKind, hashCartridgeDirectory,
  DiscoveryIdentity, DiscoveredCartridge, discoverCartridges,
  CartridgeAttachmentErrorKind, CartridgeChannel,
  RegistryVerdict, RegistryVerdictState, ChainFailureReason,
  REGISTRY_VERDICT_STATES, CHAIN_FAILURE_REASONS,
  registryVerdictStateForChainFailure, registryVerdictPermitsAttachment,
  registryVerdictIsTrustFailure, registryVerdictIsTransient,
  RegistryRemedy, registryVerdictRemedy,
  MANIFEST_SIG_FORMAT, RELEASE_KEY_CERT_FORMAT,
  CapFabEdge, CapFabStats, CapFab,
  StdinSource, StdinSourceKind,
  validateNoMediaDefRedefinitionSync,
  CapArgumentValue, CapArg, ArgSource, validateCapArgs, ValidationError,
  llmGenerateTextUrn, modelAvailabilityUrn, modelPathUrn,
  MachineSyntaxError, MachineSyntaxErrorCodes, MachineEdge, Machine, MachineBuilder, parseMachine, parseMachineWithAST,
  FabricRegistryEntry, MediaRegistryEntry, FabricRegistryClient,
  MEDIA_STRING, MEDIA_INTEGER, MEDIA_NUMBER, MEDIA_BOOLEAN,
  MEDIA_OBJECT, MEDIA_STRING_LIST, MEDIA_INTEGER_LIST,
  MEDIA_NUMBER_LIST, MEDIA_BOOLEAN_LIST, MEDIA_OBJECT_LIST,
  MEDIA_IDENTITY, MEDIA_VOID, MEDIA_PNG, MEDIA_AUDIO, MEDIA_VIDEO,
  MEDIA_PDF, MEDIA_EPUB, MEDIA_MD, MEDIA_TXT, MEDIA_RST, MEDIA_LOG,
  MEDIA_HTML, MEDIA_XML, MEDIA_JSON, MEDIA_YAML, MEDIA_JSON_SCHEMA,
  MEDIA_MODEL_SPEC, MEDIA_AVAILABILITY_OUTPUT, MEDIA_PATH_OUTPUT,
  MEDIA_PLAIN_TEXT,
  MEDIA_FILE_PATH,
  MEDIA_COLLECTION, MEDIA_COLLECTION_LIST,
  MEDIA_DECISION,
  MEDIA_AUDIO_SPEECH,
  CAP_IDENTITY,
  ALIAS_TARGET_CAP, ALIAS_TARGET_MEDIA,
  tokenIsUrn, isAliasToken, normalizeAliasName, classifyAliasTarget,
  selectDisplayAlias,
  StoredAlias, Manifest
} from './capdag.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Test utilities
// ============================================================================

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn, expectedErrorCode, message) {
  try {
    fn();
    throw new Error(`Expected error but function succeeded: ${message}`);
  } catch (error) {
    if (error.message && error.message.startsWith('Expected error but function succeeded')) {
      throw error;
    }
    if (error instanceof CapUrnError && error.code === expectedErrorCode) {
      return; // Expected error
    }
    throw new Error(`Expected CapUrnError with code ${expectedErrorCode} but got: [code=${error.code}] ${error.message}`);
  }
}

/**
 * A refusal: the call must throw, and its message must match. Distinct from
 * `assertThrows`, which is specific to `CapUrnError` codes — asserting only
 * "it threw" would pass on a typo in the very message the refusal exists to
 * state.
 */
function assertRefuses(fn, pattern, message) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  if (thrown === null) {
    throw new Error(`Expected a refusal but the call succeeded: ${message || pattern}`);
  }
  if (!pattern.test(thrown.message)) {
    throw new Error(`Expected a refusal matching ${pattern} but got: ${thrown.message}`);
  }
}

function assertThrowsMediaUrn(fn, expectedErrorCode, message) {
  try {
    fn();
    throw new Error(`Expected error but function succeeded: ${message}`);
  } catch (error) {
    if (error.message && error.message.startsWith('Expected error but function succeeded')) {
      throw error;
    }
    if (error instanceof MediaUrnError && error.code === expectedErrorCode) {
      return;
    }
    throw new Error(`Expected MediaUrnError with code ${expectedErrorCode} but got: [code=${error.code}] ${error.message}`);
  }
}

function assertThrowsMessage(fn, expectedMessage, message) {
  try {
    fn();
  } catch (error) {
    assert(
      typeof error.message === 'string' && error.message.includes(expectedMessage),
      `${message}: expected error containing ${JSON.stringify(expectedMessage)}, got ${JSON.stringify(error.message)}`
    );
    return;
  }
  throw new Error(`Assertion failed: ${message}: expected function to throw`);
}

function runTest(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        passCount++;
        console.log(`  PASS ${name}`);
      }).catch(err => {
        failCount++;
        console.log(`  FAIL ${name}: ${err.message}`);
      });
    }
    passCount++;
    console.log(`  PASS ${name}`);
  } catch (err) {
    failCount++;
    console.log(`  FAIL ${name}: ${err.message}`);
  }
  return null;
}

/**
 * Helper function to build test URNs with required in/out media URNs.
 * Uses MEDIA_VOID for in and MEDIA_OBJECT for out, matching the
 * Rust reference test_urn helper: test_urn(tags) => cap:in="media:void";{tags};out="media:enc=utf-8;record"
 */
// TEST6204: Urn
function test6204_Urn(tags) {
  if (!tags || tags === '') {
    return `cap:in="${MEDIA_VOID}";out="${MEDIA_OBJECT}"`;
  }
  return `cap:in="${MEDIA_VOID}";${tags};out="${MEDIA_OBJECT}"`;
}

// Helper to create a Cap for testing
function makeCap(urnString, title) {
  const capUrn = CapUrn.fromString(urnString);
  return new Cap(capUrn, title, ['test'], title);
}

// Helper to create caps with specific in/out media URNs for graph testing
function makeGraphCap(inUrn, outUrn, title) {
  const urnString = `cap:in="${inUrn}";convert;out="${outUrn}"`;
  const capUrn = CapUrn.fromString(urnString);
  return new Cap(capUrn, title, ['convert'], title);
}

// ============================================================================
// cap_urn.rs: TEST001-TEST050, TEST890-TEST891
// ============================================================================

// TEST1: Test that cap URN is created with tags parsed correctly and direction specs accessible
function test001_capUrnCreation() {
  const cap = CapUrn.fromString(test6204_Urn('generate;ext=pdf;target=thumbnail'));
  assert(cap.hasMarkerTag('generate'), 'Should get op tag');
  assertEqual(cap.getTag('target'), 'thumbnail', 'Should get target tag');
  assertEqual(cap.getTag('ext'), 'pdf', 'Should get ext tag');
  assertEqual(cap.getInSpec(), MEDIA_VOID, 'Should get inSpec');
  assertEqual(cap.getOutSpec(), MEDIA_OBJECT, 'Should get outSpec');
}

// TEST2: Test that missing 'in' or 'out' defaults to media: wildcard
function test002_directionSpecsRequired() {
  const missingIn = CapUrn.fromString('cap:in=media:;out=media:void;test');
  assertEqual(missingIn.getInSpec(), MEDIA_IDENTITY, 'Missing in should default to media:');
  assertEqual(missingIn.getOutSpec(), MEDIA_VOID, 'Explicit out should be preserved');

  const missingOut = CapUrn.fromString('cap:in=media:void;out=media:;test');
  assertEqual(missingOut.getInSpec(), MEDIA_VOID, 'Explicit in should be preserved');
  assertEqual(missingOut.getOutSpec(), MEDIA_IDENTITY, 'Missing out should default to media:');
}

// TEST3: Test that direction specs must match exactly, different in/out types don't match, wildcard matches any
function test003_directionMatching() {
  const cap = CapUrn.fromString(test6204_Urn('generate'));
  const request = CapUrn.fromString(test6204_Urn('generate'));
  assert(cap.accepts(request), 'Same direction specs should match');

  // Different direction should not match
  const requestDiff = CapUrn.fromString('cap:in="media:enc=utf-8";generate;out="media:enc=utf-8;record"');
  assert(!cap.accepts(requestDiff), 'Different inSpec should not match');

  // A wildcard INPUT takes any request input; a wildcard OUTPUT promises no
  // particular output, so it does not satisfy a request that needs a record —
  // the rule dispatch applies (capdag/formal, Legacy.accepts_skipping_top_output_not_transitive).
  const wildcardCap = CapUrn.fromString('cap:in=*;generate;out=*');
  assert(!wildcardCap.accepts(request), 'a media: output does not promise the record the request needs');
  const anyOutputRequest = CapUrn.fromString(request.toString().replace(/;out="[^"]*"|;out=[^;]*/, ''));
  assert(wildcardCap.accepts(anyOutputRequest), 'Wildcard input accepts a request that asks for no particular output');
}

// TEST4: Test that unquoted keys and values are normalized to lowercase
function test004_unquotedValuesLowercased() {
  const cap = CapUrn.fromString('cap:ext=pdf;generate;in=media:void;out="media:enc=utf-8;record"');
  assert(cap.hasMarkerTag('generate'), 'Unquoted value should be lowercased');
  assertEqual(cap.getTag('ext'), 'pdf', 'Unquoted value should be lowercased');
  assertEqual(cap.getTag('EXT'), 'pdf', 'Key lookup should be case-insensitive');
}

// TEST5: Test that quoted values preserve case while unquoted are lowercased
function test005_quotedValuesPreserveCase() {
  const cap = CapUrn.fromString('cap:in="media:void";key="HelloWorld";out="media:void"');
  assertEqual(cap.getTag('key'), 'HelloWorld', 'Quoted value should preserve case');
}

// TEST6: Test that quoted values can contain special characters (semicolons, equals, spaces)
function test006_quotedValueSpecialChars() {
  const cap = CapUrn.fromString('cap:in="media:void";key="val;ue=with spaces";out="media:void"');
  assertEqual(cap.getTag('key'), 'val;ue=with spaces', 'Quoted value should preserve special chars');
}

// TEST7: Test that escape sequences in quoted values (\" and \\) are parsed correctly
function test007_quotedValueEscapeSequences() {
  const s = String.raw`cap:in="media:void";key="val\"ue\\test";out="media:void"`;
  const cap = CapUrn.fromString(s);
  assertEqual(cap.getTag('key'), 'val"ue\\test', 'Escaped quote and backslash should be unescaped');
}

// TEST8: Test that mixed quoted and unquoted values in same URN parse correctly
function test008_mixedQuotedUnquoted() {
  const cap = CapUrn.fromString('cap:a=simple;b="Quoted";in="media:void";out="media:void"');
  assertEqual(cap.getTag('a'), 'simple', 'Unquoted value should be lowercase');
  assertEqual(cap.getTag('b'), 'Quoted', 'Quoted value should preserve case');
}

// TEST9: Test that unterminated quote produces UnterminatedQuote error
function test009_unterminatedQuoteError() {
  let threw = false;
  try {
    CapUrn.fromString('cap:in="media:void";key="unterminated;out="media:void"');
  } catch (e) {
    if (e instanceof CapUrnError) {
      threw = true;
    }
  }
  assert(threw, 'Unterminated quote should produce CapUrnError');
}

// TEST10: Test that invalid escape sequences (like \n, \x) produce InvalidEscapeSequence error
function test010_invalidEscapeSequenceError() {
  let threw = false;
  try {
    const s = String.raw`cap:in="media:void";key="hello\x";out="media:void"`;
    CapUrn.fromString(s);
  } catch (e) {
    if (e instanceof CapUrnError) {
      threw = true;
    }
  }
  assert(threw, 'Invalid escape sequence should produce CapUrnError');
}

// TEST11: Test that serialization uses smart quoting (no quotes for simple lowercase, quotes for special chars/uppercase)
function test011_serializationSmartQuoting() {
  const cap = CapUrn.fromString('cap:a=simple;b="Has Space";in="media:void";out="media:void"');
  const s = cap.toString();
  // simple lowercase should not be quoted, "Has Space" should be quoted
  assert(s.includes('a=simple'), 'Simple value should not be quoted');
  assert(s.includes('b="Has Space"'), 'Value with space should be quoted');
}

// TEST12: Test that simple cap URN round-trips (parse -> serialize -> parse equals original)
function test012_roundTripSimple() {
  const original = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  const serialized = original.toString();
  const reparsed = CapUrn.fromString(serialized);
  assert(original.equals(reparsed), 'Simple round-trip should produce equal URN');
}

// TEST13: Test that quoted values round-trip preserving case and spaces
function test013_roundTripQuoted() {
  const original = CapUrn.fromString('cap:in="media:void";key="HelloWorld";out="media:void"');
  const serialized = original.toString();
  const reparsed = CapUrn.fromString(serialized);
  assert(original.equals(reparsed), 'Quoted round-trip should produce equal URN');
  assertEqual(reparsed.getTag('key'), 'HelloWorld', 'Quoted value should survive round-trip');
}

// TEST14: Test that escape sequences round-trip correctly
function test014_roundTripEscapes() {
  const s = String.raw`cap:in="media:void";key="val\"ue\\test";out="media:void"`;
  const original = CapUrn.fromString(s);
  const serialized = original.toString();
  const reparsed = CapUrn.fromString(serialized);
  assert(original.equals(reparsed), 'Escape round-trip should produce equal URN');
  assertEqual(reparsed.getTag('key'), 'val"ue\\test', 'Escaped value should survive round-trip');
}

// TEST15: Test that cap: prefix is required and case-insensitive
function test015_capPrefixRequired() {
  assertThrows(
    () => CapUrn.fromString('in="media:void";out="media:void";generate'),
    ErrorCodes.MISSING_CAP_PREFIX,
    'Should require cap: prefix'
  );
  // Valid cap: prefix should work
  const cap = CapUrn.fromString(test6204_Urn('generate'));
  assert(cap.hasMarkerTag('generate'), 'Should parse with valid cap: prefix');
}

// TEST16: Test that trailing semicolon is equivalent (same hash, same string, matches)
function test016_trailingSemicolonEquivalence() {
  const cap1 = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  const cap2 = CapUrn.fromString(test6204_Urn('generate;ext=pdf') + ';');
  assert(cap1.equals(cap2), 'With/without trailing semicolon should be equal');
  assertEqual(cap1.toString(), cap2.toString(), 'Canonical forms should match');
}

// TEST939: The canonical form drops `in=media:` and `out=media:` segments. Every spelling of "the same cap with wildcard in/out" collapses to one byte-identical canonical string. This is the contract that makes registry lookups work: the cap-publisher hashes `<canonical-urn>` to compute the cache key, and every language port (Rust, Go, Python, JS, ObjC) must agree on the canonical form for cross-language lookups to land on the same key. A regression that emitted the wildcard segments would silently move the published cap to a different SHA-256 bucket, 404'ing every reader that hashes the canonical form.
function test939_capUrnCanonicalFormDropsWildcardInOut() {
  const canonical = 'cap:decimate-sequence';
  const variants = [
    'cap:decimate-sequence',
    'cap:decimate-sequence;in=media:;out=media:',
    'cap:in=media:;out=media:;decimate-sequence',
    'cap:in=media:;decimate-sequence;out=media:',
  ];
  for (const v of variants) {
    const parsed = CapUrn.fromString(v);
    assertEqual(
      parsed.toString(),
      canonical,
      `input ${JSON.stringify(v)} canonicalized to ${JSON.stringify(parsed.toString())}, expected ${JSON.stringify(canonical)} — wildcard in/out segments must be elided so the registry SHA-256 key is stable across input spellings`
    );
  }
  assertThrows(
    () => CapUrn.fromString('cap:in=media:;out=media:'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'declared top-to-top cap must be rejected as inadmissible'
  );

  const identity = CapUrn.fromString('cap:effect=none');
  assertEqual(identity.toString(), 'cap:effect=none', 'true identity must preserve explicit effect=none');
  assert(identity.toString() !== 'cap:', 'cap:effect=none must not collapse to the illegal bare top form');
}

// TEST17: Test tag matching: exact match, subset match, wildcard match, value mismatch
function test017_tagMatching() {
  const cap = CapUrn.fromString(test6204_Urn('generate;ext=pdf;target=thumbnail'));

  // Exact match — both directions accept
  const exact = CapUrn.fromString(test6204_Urn('generate;ext=pdf;target=thumbnail'));
  assert(cap.accepts(exact), 'Should accept exact match');
  assert(exact.accepts(cap), 'Exact match should accept in reverse too');

  // Routing direction: request(generate) accepts cap(op,ext,target)
  const subset = CapUrn.fromString(test6204_Urn('generate'));
  assert(subset.accepts(cap), 'General request should accept more specific instance');
  assert(!cap.accepts(subset), 'Specific pattern should reject subset instance');

  // Routing direction: request(ext=*) accepts cap(ext=pdf)
  const wildcard = CapUrn.fromString(test6204_Urn('ext=*'));
  assert(wildcard.accepts(cap), 'Wildcard request should accept specific instance');

  // Conflicting value — neither direction accepts
  const mismatch = CapUrn.fromString(test6204_Urn('extract'));
  assert(!cap.accepts(mismatch), 'Should not accept value mismatch');
  assert(!mismatch.accepts(cap), 'Reverse mismatch should also reject');
}

// TEST18: Test that quoted values with different case do NOT match (case-sensitive)
function test018_matchingCaseSensitiveValues() {
  const cap = CapUrn.fromString('cap:in="media:void";key="HelloWorld";out="media:void"');
  const request = CapUrn.fromString('cap:in="media:void";key=helloworld;out="media:void"');
  assert(!cap.accepts(request), 'Quoted HelloWorld should not match unquoted helloworld');
}

// TEST19: Missing tag in instance causes rejection — pattern's tags are constraints
function test019_missingTagHandling() {
  const cap = CapUrn.fromString(test6204_Urn('generate'));
  const request = CapUrn.fromString(test6204_Urn('ext=pdf'));
  assert(!cap.accepts(request), 'Pattern requiring op should reject instance missing op');
  assert(!request.accepts(cap), 'Pattern requiring ext should reject instance missing ext');

  const cap2 = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  const request2 = CapUrn.fromString(test6204_Urn('generate'));
  assert(!cap2.accepts(request2), 'Specific pattern should reject instance missing ext');
  assert(request2.accepts(cap2), 'General request should accept more specific instance');
}

// TEST020: Specificity is the sum of per-tag truth-table scores
// across in/out/y. Marker tags (bare segments and `key=*`) score 2
// (must-have-any), exact `key=value` tags score 3, missing/`?` score
// 0, `!` scores 1.
//
// test6204_Urn() builds "cap:in=media:void;out=media:record;<tags>" so
// the directional baseline is:
//   in:  media:void   -> {void=*}    -> 2
//   out: media:record -> {record=*}  -> 2
// Total directional baseline: 4.
function test020_specificity() {
  // test6204_Urn() prepends in="media:void" (1 marker, score 2) and
  // out="media:record" (1 marker, score 2). Cap-URN spec is
  // 10000*spec_U(out) + 100*spec_U(in) + spec_U(y).

  const cap1 = CapUrn.fromString(test6204_Urn('type=general'));
  // out=2, in=2, y=4 (type=general exact)
  assertEqual(cap1.specificity(), 10000*2 + 100*2 + 4,
    'out=2, in=2, y=type=general exact=4 -> 20204');

  const cap2 = CapUrn.fromString(test6204_Urn('generate'));
  // out=2, in=2, y=2 (generate marker = must-have-any)
  assertEqual(cap2.specificity(), 10000*2 + 100*2 + 2,
    'out=2, in=2, y=generate marker=2 -> 20202');

  const cap3 = CapUrn.fromString(test6204_Urn('op;ext=pdf'));
  // out=2, in=2, y=2+4 (op marker, ext=pdf exact)
  assertEqual(cap3.specificity(), 10000*2 + 100*2 + 6,
    'out=2, in=2, y=op marker(2)+ext=pdf exact(4) -> 20206');

  // Wildcard in direction normalizes to media: (no tags, score 0).
  const cap4 = CapUrn.fromString(`cap:in=*;out="${MEDIA_OBJECT}";test`);
  // out=2 (record=*), in=0 (media: empty), y=2 (test marker)
  assertEqual(cap4.specificity(), 10000*2 + 100*0 + 2,
    'out=record=2, in=*->0, y=test marker=2 -> 20002');
}

// TEST21: Test builder creates cap URN with correct tags and direction specs
function test021_builder() {
  const cap = new CapUrnBuilder()
    .inSpec('media:void')
    .outSpec('media:object')
    .marker('generate')
    .tag('ext', 'pdf')
    .build();
  assert(cap.hasMarkerTag('generate'), 'Builder should set the generate marker');
  assertEqual(cap.getTag('ext'), 'pdf', 'Builder should set ext');
  assertEqual(cap.getInSpec(), 'media:void', 'Builder should set inSpec');
  assertEqual(cap.getOutSpec(), 'media:object', 'Builder should set outSpec');
}

// TEST22: Test builder requires both in_spec and out_spec
function test022_builderRequiresDirection() {
  assertThrows(
    () => new CapUrnBuilder().tag('op', 'test').build(),
    ErrorCodes.MISSING_IN_SPEC,
    'Builder should require inSpec'
  );
  assertThrows(
    () => new CapUrnBuilder().inSpec('media:void').tag('op', 'test').build(),
    ErrorCodes.MISSING_OUT_SPEC,
    'Builder should require outSpec'
  );
}

// TEST23: Test builder lowercases keys but preserves value case
function test023_builderPreservesCase() {
  const cap = new CapUrnBuilder()
    .inSpec('media:void')
    .outSpec('media:void')
    .tag('MyKey', 'MyValue')
    .build();
  assertEqual(cap.getTag('mykey'), 'MyValue', 'Builder should lowercase key but preserve value case');
  assertEqual(cap.getTag('MyKey'), 'MyValue', 'getTag should be case-insensitive for keys');
}

// TEST24: Directional accepts — pattern's tags are constraints, instance must satisfy
function test024_compatibility() {
  const cap1 = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  const cap2 = CapUrn.fromString(test6204_Urn('generate;format=*'));
  const cap3 = CapUrn.fromString(test6204_Urn('type=image;extract'));

  assert(!cap1.accepts(cap2), 'Pattern requiring ext should reject instance missing ext');
  assert(!cap2.accepts(cap1), 'Pattern requiring format should reject instance missing format');
  assert(!cap1.accepts(cap3), 'Different op should not accept');
  assert(!cap3.accepts(cap1), 'Different op should not accept in reverse');

  const general = CapUrn.fromString(test6204_Urn('generate'));
  assert(general.accepts(cap1), 'General request should accept more specific instance');
  assert(!cap1.accepts(general), 'Specific pattern should reject general instance');

  const broadIn = CapUrn.fromString('cap:in="media:";generate;out="media:enc=utf-8;record"');
  assert(!cap1.accepts(broadIn), 'Specific input should not accept broad wildcard input');
  assert(broadIn.accepts(cap1), 'Wildcard input should accept specific input');
}

// TEST25: Test find_best_match returns most specific matching cap
function test025_bestMatch() {
  const caps = [
    CapUrn.fromString('cap:in=*;out=*;op'),
    CapUrn.fromString(test6204_Urn('generate')),
    CapUrn.fromString(test6204_Urn('generate;ext=pdf'))
  ];
  const request = CapUrn.fromString(test6204_Urn('generate'));
  const best = CapMatcher.findBestMatch(caps, request);
  assert(best !== null, 'Should find a best match');
  assertEqual(best.getTag('ext'), 'pdf', 'Best match should be the most specific (ext=pdf)');
}

// TEST26: Test merge combines tags from both caps, subset keeps only specified tags
function test026_mergeAndSubset() {
  const cap1 = CapUrn.fromString(test6204_Urn('generate'));
  const cap2 = CapUrn.fromString('cap:in="media:enc=utf-8";ext=pdf;format=binary;out="media:"');

  // Merge (other takes precedence)
  const merged = cap1.merge(cap2);
  assertEqual(merged.getInSpec(), 'media:enc=utf-8', 'Merge should take inSpec from other');
  assertEqual(merged.getOutSpec(), 'media:', 'Merge should take outSpec from other');
  assert(merged.hasMarkerTag('generate'), 'Merge should keep original tags');
  assertEqual(merged.getTag('ext'), 'pdf', 'Merge should add other tags');

  // Subset (always preserves in/out)
  const sub = merged.subset(['ext']);
  assertEqual(sub.getTag('ext'), 'pdf', 'Subset should keep ext');
  assert(!sub.hasMarkerTag('generate'), 'Subset should drop the generate marker');
  assertEqual(sub.getInSpec(), 'media:enc=utf-8', 'Subset should preserve inSpec');
}

// TEST27: Test with_wildcard_tag sets tag to wildcard, including in/out
function test027_wildcardTag() {
  const cap = CapUrn.fromString(test6204_Urn('ext=pdf'));
  const wildcardExt = cap.withWildcardTag('ext');
  assertEqual(wildcardExt.getTag('ext'), '*', 'Should set ext to wildcard');

  const wildcardIn = cap.withWildcardTag('in');
  assertEqual(wildcardIn.getInSpec(), 'media:', 'Should set in to canonical top media:');

  const wildcardOut = cap.withWildcardTag('out');
  assertEqual(wildcardOut.getOutSpec(), 'media:', 'Should set out to canonical top media:');
}

// TEST28: Test empty cap URN is illegal after effect transition
function test028_emptyCapUrnNotAllowed() {
  assertThrows(
    () => CapUrn.fromString('cap:'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'Empty cap must be rejected as inadmissible'
  );
}

// TEST29: Test minimal valid cap URN has just in and out, empty tags
function test029_minimalCapUrn() {
  const minimal = CapUrn.fromString('cap:in="media:void";out="media:void"');
  assertEqual(Object.keys(minimal.tags).length, 0, 'Should have no other tags');
  assertEqual(minimal.getInSpec(), 'media:void', 'Should have inSpec');
  assertEqual(minimal.getOutSpec(), 'media:void', 'Should have outSpec');
}

// TEST30: Test extended characters (forward slashes, colons) in tag values
function test030_extendedCharacterSupport() {
  const cap = CapUrn.fromString(test6204_Urn('url=https://example_org/api;path=/some/file'));
  assertEqual(cap.getTag('url'), 'https://example_org/api', 'Should support colons and slashes');
  assertEqual(cap.getTag('path'), '/some/file', 'Should support forward slashes');
}

// TEST31: Test wildcard rejected in keys but accepted in values
function test031_wildcardRestrictions() {
  assertThrows(
    () => CapUrn.fromString(test6204_Urn('*=value')),
    ErrorCodes.INVALID_CHARACTER,
    'Should reject wildcard in key'
  );

  // Wildcard accepted in values
  const cap = CapUrn.fromString(test6204_Urn('key=*'));
  assertEqual(cap.getTag('key'), '*', 'Should accept wildcard in value');

  // Wildcard in in/out normalizes to media:
  const capWild = CapUrn.fromString('cap:in=*;out=*;key=value');
  assertEqual(capWild.getInSpec(), MEDIA_IDENTITY, 'Wildcard inSpec should normalize to media:');
  assertEqual(capWild.getOutSpec(), MEDIA_IDENTITY, 'Wildcard outSpec should normalize to media:');
}

// TEST32: Test duplicate keys are rejected with DuplicateKey error
function test032_duplicateKeyRejection() {
  assertThrows(
    () => CapUrn.fromString(test6204_Urn('key=value1;key=value2')),
    ErrorCodes.DUPLICATE_KEY,
    'Should reject duplicate keys'
  );
}

// TEST33: Test pure numeric keys rejected, mixed alphanumeric allowed, numeric values allowed
function test033_numericKeyRestriction() {
  assertThrows(
    () => CapUrn.fromString(test6204_Urn('123=value')),
    ErrorCodes.NUMERIC_KEY,
    'Should reject pure numeric keys'
  );
  // Mixed alphanumeric allowed
  const cap1 = CapUrn.fromString(test6204_Urn('key123=value'));
  assertEqual(cap1.getTag('key123'), 'value', 'Mixed alphanumeric key should be allowed');
  const cap2 = CapUrn.fromString(test6204_Urn('x123key=value'));
  assertEqual(cap2.getTag('x123key'), 'value', 'Mixed alphanumeric key should be allowed');
}

// TEST34: Test empty values are rejected
function test034_emptyValueError() {
  let threw = false;
  try {
    CapUrn.fromString('cap:in="media:void";key=;out="media:void"');
  } catch (e) {
    if (e instanceof CapUrnError) {
      threw = true;
    }
  }
  assert(threw, 'Empty value (key=) should be rejected');
}

// TEST35: Test has_tag is case-sensitive for values, case-insensitive for keys, works for in/out
function test035_hasTagCaseSensitive() {
  const cap = CapUrn.fromString('cap:in="media:void";key="Value";out="media:void"');
  assert(cap.hasTag('key', 'Value'), 'hasTag should match exact value');
  assert(cap.hasTag('KEY', 'Value'), 'hasTag should be case-insensitive for keys');
  assert(!cap.hasTag('key', 'value'), 'hasTag should be case-sensitive for values');
  // Works for in/out
  assert(cap.hasTag('in', 'media:void'), 'hasTag should work for in');
  assert(cap.hasTag('IN', 'media:void'), 'hasTag should be case-insensitive for in key');
  assert(cap.hasTag('out', 'media:void'), 'hasTag should work for out');
}

// TEST36: Test with_tag preserves value case
function test036_withTagPreservesValue() {
  const cap = CapUrn.fromString('cap:in="media:void";out="media:void"');
  const modified = cap.withTag('key', 'MyValue');
  assertEqual(modified.getTag('key'), 'MyValue', 'withTag should preserve value case');
}

// TEST37: Test with_tag rejects empty value
function test037_withTagRejectsEmptyValue() {
  const cap = CapUrn.fromString('cap:in="media:void";out="media:void"');
  assertThrows(
    () => cap.withTag('key', ''),
    ErrorCodes.EMPTY_VALUE,
    'withTag should reject empty string values'
  );
}

// TEST38: Test semantic equivalence of unquoted and quoted simple lowercase values
function test038_semanticEquivalence() {
  const c1 = CapUrn.fromString('cap:in="media:void";key=simple;out="media:void"');
  const c2 = CapUrn.fromString('cap:in="media:void";key="simple";out="media:void"');
  assert(c1.equals(c2), 'Unquoted simple and quoted "simple" should be equal');
  assertEqual(c1.getTag('key'), c2.getTag('key'), 'Values should be identical');
}

// TEST39: Test get_tag returns direction specs (in/out) with case-insensitive lookup
function test039_getTagReturnsDirectionSpecs() {
  const cap = CapUrn.fromString(`cap:in="${MEDIA_VOID}";out="${MEDIA_OBJECT}"`);
  assertEqual(cap.getTag('in'), MEDIA_VOID, 'getTag(in) should return inSpec');
  assertEqual(cap.getTag('IN'), MEDIA_VOID, 'getTag(IN) should return inSpec (case-insensitive)');
  assertEqual(cap.getTag('out'), MEDIA_OBJECT, 'getTag(out) should return outSpec');
  assertEqual(cap.getTag('OUT'), MEDIA_OBJECT, 'getTag(OUT) should return outSpec (case-insensitive)');
}

// TEST40: Matching semantics - exact match succeeds
function test040_matchingSemanticsExactMatch() {
  const cap = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  const request = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  assert(cap.accepts(request), 'Exact match should accept');
}

// TEST41: Matching semantics - cap missing tag matches (implicit wildcard)
function test041_matchingSemanticsCapMissingTag() {
  const cap = CapUrn.fromString(test6204_Urn('generate'));
  const request = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  assert(cap.accepts(request), 'General pattern with only op should accept specific instance');
  assert(!request.accepts(cap), 'Pattern requiring ext should reject instance missing ext');
}

// TEST42: Pattern rejects instance missing required tags
function test042_matchingSemanticsCapHasExtraTag() {
  const cap = CapUrn.fromString(test6204_Urn('generate;ext=pdf;version=2'));
  const request = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  assert(!cap.accepts(request), 'Pattern requiring version should reject instance missing version');
  assert(request.accepts(cap), 'General request should accept refined instance');
}

// TEST43: Matching semantics - request wildcard matches specific cap value
// A request that says only "some ext" is not a pdf, so a pattern requiring
// ext=pdf does not accept it: `ext` promises presence, not a value, and
// reading it as "whatever the pattern wants" made `ext` and `ext=pdf`
// equivalent (capdag/formal, Legacy.marker_equivalent_to_exact).
function test043_matchingSemanticsRequestHasWildcard() {
  const cap = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  const request = CapUrn.fromString(test6204_Urn('generate;ext=*'));
  assert(!cap.accepts(request), 'a pdf pattern does not accept "some ext"');
  assert(request.accepts(cap), '"some ext" accepts a pdf');
}

// TEST44: Matching semantics - cap wildcard matches specific request value
function test044_matchingSemanticsCapHasWildcard() {
  const cap = CapUrn.fromString(test6204_Urn('generate;ext=*'));
  const request = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  assert(cap.accepts(request), 'Cap wildcard should match specific request value');
}

// TEST45: Matching semantics - value mismatch does not match
function test045_matchingSemanticsValueMismatch() {
  const cap = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  const request = CapUrn.fromString(test6204_Urn('generate;ext=docx'));
  assert(!cap.accepts(request), 'Value mismatch should not accept');
}

// TEST46: Matching semantics - fallback pattern (cap missing tag = implicit wildcard)
function test046_matchingSemanticsFallbackPattern() {
  const cap = CapUrn.fromString('cap:in="media:binary";generate-thumbnail;out="media:binary"');
  const request = CapUrn.fromString('cap:ext=wav;in="media:binary";generate-thumbnail;out="media:binary"');
  assert(cap.accepts(request), 'General pattern without ext should accept specific instance');
  assert(!request.accepts(cap), 'Pattern requiring ext should reject instance missing ext');
}

// TEST47: Matching semantics - thumbnail fallback with void input
function test047_matchingSemanticsThumbnailVoidInput() {
  const cap = CapUrn.fromString('cap:in="media:void";generate-thumbnail;out="media:ext=png;image;thumbnail"');
  const request = CapUrn.fromString('cap:ext=pdf;in="media:void";generate-thumbnail;out="media:image"');
  assert(cap.accepts(request), 'Void input cap should accept request; cap output conforms to less-specific request output');
}

// TEST48: Matching semantics - wildcard direction matches anything
// A handler whose output is `media:` promises no particular output, so it does
// not accept a request that needs one — the rule dispatch applies. Skipping the
// output axis for a `media:` handler made acceptance non-transitive
// (capdag/formal, Legacy.accepts_skipping_top_output_not_transitive).
function test048_matchingSemanticsWildcardDirection() {
  const cap = CapUrn.fromString('cap:generate');
  const request = CapUrn.fromString(test6204_Urn('generate;ext=pdf'));
  assert(!cap.accepts(request), 'a media:-output handler does not promise the output the request needs');
  const anyOutput = CapUrn.fromString('cap:ext=pdf;generate;in="media:enc=utf-8"');
  assert(cap.accepts(anyOutput), 'a generic handler accepts a request that asks for no particular output');
}

// TEST49: Non-overlapping tags — neither direction accepts
function test049_matchingSemanticsCrossDimension() {
  const cap = CapUrn.fromString(test6204_Urn('generate'));
  const request = CapUrn.fromString(test6204_Urn('ext=pdf'));
  assert(!cap.accepts(request), 'Pattern requiring op should reject instance missing op');
  assert(!request.accepts(cap), 'Pattern requiring ext should reject instance missing ext');
}

// TEST50: Matching semantics - direction mismatch prevents matching
function test050_matchingSemanticsDirectionMismatch() {
  const cap = CapUrn.fromString(
    `cap:in="${MEDIA_STRING}";generate;out="${MEDIA_OBJECT}"`
  );
  const request = CapUrn.fromString(
    `cap:in="${MEDIA_IDENTITY}";generate;out="${MEDIA_OBJECT}"`
  );
  assert(!cap.accepts(request), 'Incompatible direction types should not match');
}

// TEST890: Semantic direction matching - generic candidate matches specific request
function test890_directionSemanticMatching() {
  // Generic wildcard cap accepts specific pdf request
  const genericCap = CapUrn.fromString(
    'cap:in="media:";generate-thumbnail;out="media:ext=png;image;thumbnail"'
  );
  const pdfRequest = CapUrn.fromString(
    'cap:in="media:ext=pdf";generate-thumbnail;out="media:ext=png;image;thumbnail"'
  );
  assert(genericCap.accepts(pdfRequest), 'Generic wildcard cap must accept pdf request');

  // Also accepts epub
  const epubRequest = CapUrn.fromString(
    'cap:in="media:ext=epub";generate-thumbnail;out="media:ext=png;image;thumbnail"'
  );
  assert(genericCap.accepts(epubRequest), 'Generic wildcard cap must accept epub request');

  // Reverse: specific pdf cap does NOT accept generic bytes request
  const pdfCap = CapUrn.fromString(
    'cap:in="media:ext=pdf";generate-thumbnail;out="media:ext=png;image;thumbnail"'
  );
  const genericRequest = CapUrn.fromString(
    'cap:in="media:";generate-thumbnail;out="media:ext=png;image;thumbnail"'
  );
  assert(!pdfCap.accepts(genericRequest), 'Specific pdf cap must NOT accept generic wildcard request');

  // PDF cap does NOT accept epub request
  assert(!pdfCap.accepts(epubRequest), 'PDF cap must NOT accept epub request');

  // Output direction: cap producing more specific output satisfies less specific request
  const specificOutCap = CapUrn.fromString(
    'cap:in="media:";generate-thumbnail;out="media:ext=png;image;thumbnail"'
  );
  const genericOutRequest = CapUrn.fromString(
    'cap:in="media:";generate-thumbnail;out="media:image"'
  );
  assert(specificOutCap.accepts(genericOutRequest),
    'Cap producing image;png;thumbnail must satisfy request for image');

  // Reverse output: generic output cap does NOT satisfy specific output request
  const genericOutCap = CapUrn.fromString(
    'cap:in="media:";generate-thumbnail;out="media:image"'
  );
  const specificOutRequest = CapUrn.fromString(
    'cap:in="media:";generate-thumbnail;out="media:ext=png;image;thumbnail"'
  );
  assert(!genericOutCap.accepts(specificOutRequest),
    'Generic output cap must NOT satisfy specific output request');
}

// TEST891: Semantic direction specificity — more constraints in either axis means a higher score under the truth-table-driven sum. media: (top, no tags) scores 0; each marker tag scores 2; each exact tag scores 3.
function test891_directionSemanticSpecificity() {
  const genericCap = CapUrn.fromString(
    'cap:in="media:";generate-thumbnail;out="media:ext=png;image;thumbnail"'
  );
  const specificCap = CapUrn.fromString(
    'cap:in="media:ext=pdf";generate-thumbnail;out="media:ext=png;image;thumbnail"'
  );

  // generic:
  //   out=media:ext=png;image;thumbnail -> 4 (ext=png exact-value) + 2 + 2 = 8
  //   in=media:                     -> 0
  //   y: generate-thumbnail marker  -> 2
  //   spec_C = 10000*8 + 100*0 + 2 = 80002
  assertEqual(genericCap.specificity(), 10000*8 + 100*0 + 2,
    'out=ext=png(4)+image(2)+thumbnail(2)=8 + in=media:(0) + generate-thumbnail marker(2) = 80002');
  // specific:
  //   out=media:ext=png;image;thumbnail -> 8
  //   in=media:ext=pdf              -> 4 (ext=pdf is an exact-value tag, not a bare marker)
  //   y: generate-thumbnail marker  -> 2
  //   spec_C = 10000*8 + 100*4 + 2 = 80402
  assertEqual(specificCap.specificity(), 10000*8 + 100*4 + 2,
    'out=ext=png(4)+image(2)+thumbnail(2)=8 + in=ext=pdf(4) + generate-thumbnail marker(2) = 80402');
  assert(specificCap.specificity() > genericCap.specificity(), 'pdf should be more specific');

  // CapMatcher should prefer more specific
  const pdfRequest = CapUrn.fromString(
    'cap:in="media:ext=pdf";generate-thumbnail;out="media:ext=png;image;thumbnail"'
  );
  const best = CapMatcher.findBestMatch([genericCap, specificCap], pdfRequest);
  assert(best !== null, 'Should find a match');
  assertEqual(best.getInSpec(), 'media:ext=pdf', 'Should prefer more specific pdf cap');
}

// ============================================================================
// validation.rs: TEST053-TEST056
// ============================================================================

// TEST6208: N/A for JS (Rust-only validation infrastructure)

// TEST6212: XV5 - Test inline media def redefinition of existing registry spec is detected and rejected
function test6212_xv5InlineSpecRedefinitionDetected() {
  const registryLookup = (mediaUrn) => mediaUrn === MEDIA_STRING;
  const mediaDefs = [
    {
      urn: MEDIA_STRING,
      media_type: 'text/plain',
      title: 'My Custom String',
      description: 'Trying to redefine string'
    }
  ];
  const result = validateNoMediaDefRedefinitionSync(mediaDefs, registryLookup);
  assert(!result.valid, 'Should fail when redefining registry spec');
  assert(result.error && result.error.includes('XV5'), 'Error should mention XV5');
  assert(result.redefines && result.redefines.includes(MEDIA_STRING), 'Should identify MEDIA_STRING as redefined');
}

// TEST6216: XV5 - Test new inline media def (not in registry) is allowed
function test6216_xv5NewInlineSpecAllowed() {
  const registryLookup = (mediaUrn) => mediaUrn === MEDIA_STRING;
  const mediaDefs = [
    {
      urn: 'media:my-unique-custom-type-xyz123',
      media_type: 'application/json',
      title: 'My Custom Output',
      description: 'A custom output type'
    }
  ];
  const result = validateNoMediaDefRedefinitionSync(mediaDefs, registryLookup);
  assert(result.valid, 'New spec not in registry should pass validation');
}

// TEST6220: XV5 - Test empty media_defs (no inline specs) passes XV5 validation
function test6220_xv5EmptyMediaDefsAllowed() {
  const registryLookup = (mediaUrn) => mediaUrn === MEDIA_STRING;
  assert(validateNoMediaDefRedefinitionSync({}, registryLookup).valid, 'Empty object should pass');
  assert(validateNoMediaDefRedefinitionSync(null, registryLookup).valid, 'Null should pass');
  assert(validateNoMediaDefRedefinitionSync(undefined, registryLookup).valid, 'Undefined should pass');
}

// ============================================================================
// media_urn.rs: TEST060-TEST078
// ============================================================================

// TEST60: Test wrong prefix fails with InvalidPrefix error showing expected and actual prefix
function test060_wrongPrefixFails() {
  assertThrowsMediaUrn(
    () => MediaUrn.fromString('cap:string'),
    MediaUrnErrorCodes.INVALID_PREFIX,
    'Wrong prefix should fail with INVALID_PREFIX'
  );
}

// TEST061: REMOVED — the binary/text distinction no longer exists in the
// vocabulary (isBinary() was deleted from MediaUrn; everything is bytes).
// Encoding is now expressed by the orthogonal `enc=` tag, exercised by TEST067.

// TEST62: Test is_record returns true when record marker tag is present indicating key-value structure
function test062_isRecord() {
  assert(MediaUrn.fromString(MEDIA_OBJECT).isRecord(), 'MEDIA_OBJECT should be record');
  assert(MediaUrn.fromString('media:custom;record').isRecord(), 'custom;record should be record');
  assert(MediaUrn.fromString(MEDIA_JSON).isRecord(), 'MEDIA_JSON should be record');
  // Without record marker, is_record is false
  assert(!MediaUrn.fromString('media:enc=utf-8').isRecord(), 'plain text should not be record');
  assert(!MediaUrn.fromString(MEDIA_STRING).isRecord(), 'MEDIA_STRING should not be record');
  assert(!MediaUrn.fromString(MEDIA_STRING_LIST).isRecord(), 'MEDIA_STRING_LIST should not be record');
}

// TEST63: Test is_scalar returns true when list marker tag is absent (scalar is default)
function test063_isScalar() {
  assert(MediaUrn.fromString(MEDIA_STRING).isScalar(), 'MEDIA_STRING should be scalar');
  assert(MediaUrn.fromString(MEDIA_INTEGER).isScalar(), 'MEDIA_INTEGER should be scalar');
  assert(MediaUrn.fromString(MEDIA_NUMBER).isScalar(), 'MEDIA_NUMBER should be scalar');
  assert(MediaUrn.fromString(MEDIA_BOOLEAN).isScalar(), 'MEDIA_BOOLEAN should be scalar');
  assert(MediaUrn.fromString(MEDIA_OBJECT).isScalar(), 'MEDIA_OBJECT (record but scalar) should be scalar');
  assert(MediaUrn.fromString('media:enc=utf-8').isScalar(), 'plain text should be scalar');
  // With list marker, is_scalar is false
  assert(!MediaUrn.fromString(MEDIA_STRING_LIST).isScalar(), 'MEDIA_STRING_LIST should not be scalar');
  assert(!MediaUrn.fromString(MEDIA_OBJECT_LIST).isScalar(), 'MEDIA_OBJECT_LIST should not be scalar');
}

// TEST64: Test is_list returns true when list marker tag is present indicating ordered collection
function test064_isList() {
  assert(MediaUrn.fromString(MEDIA_STRING_LIST).isList(), 'MEDIA_STRING_LIST should be list');
  assert(MediaUrn.fromString(MEDIA_INTEGER_LIST).isList(), 'MEDIA_INTEGER_LIST should be list');
  assert(MediaUrn.fromString(MEDIA_OBJECT_LIST).isList(), 'MEDIA_OBJECT_LIST should be list');
  assert(!MediaUrn.fromString(MEDIA_STRING).isList(), 'MEDIA_STRING should not be list');
  assert(!MediaUrn.fromString(MEDIA_OBJECT).isList(), 'MEDIA_OBJECT should not be list');
}

// TEST65: Test is_opaque returns true when record marker is absent (opaque is default)
function test065_isOpaque() {
  assert(MediaUrn.fromString(MEDIA_STRING).isOpaque(), 'MEDIA_STRING should be opaque');
  assert(MediaUrn.fromString(MEDIA_STRING_LIST).isOpaque(), 'MEDIA_STRING_LIST (list but no record) should be opaque');
  assert(MediaUrn.fromString(MEDIA_PDF).isOpaque(), 'MEDIA_PDF should be opaque');
  assert(MediaUrn.fromString('media:enc=utf-8').isOpaque(), 'plain text should be opaque');
  // With record marker, is_opaque is false
  assert(!MediaUrn.fromString(MEDIA_OBJECT).isOpaque(), 'MEDIA_OBJECT should not be opaque');
  assert(!MediaUrn.fromString(MEDIA_JSON).isOpaque(), 'MEDIA_JSON should not be opaque');
}

// TEST66: Test is_json returns true only when json marker tag is present for JSON representation
function test066_isJson() {
  assert(MediaUrn.fromString(MEDIA_JSON).isJson(), 'MEDIA_JSON should be json');
  assert(MediaUrn.fromString('media:custom;fmt=json').isJson(), 'fmt=json should be json');
  // record alone does not mean JSON representation
  assert(!MediaUrn.fromString(MEDIA_OBJECT).isJson(), 'MEDIA_OBJECT should not be json');
  assert(!MediaUrn.fromString('media:enc=utf-8').isJson(), 'plain text should not be json');
}

// TEST67: Text-representability is now carried by the orthogonal `enc=` tag (the old `textable` marker and is_text() are gone). A media is "text" iff it declares an encoding. enc is orthogonal to format/numeric, so only media that actually carry enc= are text.
function test067_isText() {
  // Has enc= → text-representable
  assert(MediaUrn.fromString(MEDIA_STRING).getTag('enc') !== undefined, 'MEDIA_STRING should have enc');
  assert(MediaUrn.fromString(MEDIA_BOOLEAN).getTag('enc') !== undefined, 'MEDIA_BOOLEAN should have enc');
  // No enc= → not text-representable
  assert(MediaUrn.fromString(MEDIA_INTEGER).getTag('enc') === undefined, 'MEDIA_INTEGER should not have enc');
  assert(MediaUrn.fromString(MEDIA_JSON).getTag('enc') === undefined, 'MEDIA_JSON should not have enc');
  assert(MediaUrn.fromString(MEDIA_IDENTITY).getTag('enc') === undefined, 'MEDIA_IDENTITY should not have enc');
  assert(MediaUrn.fromString(MEDIA_PNG).getTag('enc') === undefined, 'MEDIA_PNG should not have enc');
  assert(MediaUrn.fromString(MEDIA_OBJECT).getTag('enc') === undefined, 'MEDIA_OBJECT should not have enc');
}

// TEST68: Test is_void returns true when void flag or type=void tag is present
function test068_isVoid() {
  assert(MediaUrn.fromString('media:void').isVoid(), 'media:void should be void');
  assert(!MediaUrn.fromString(MEDIA_STRING).isVoid(), 'MEDIA_STRING should not be void');
}

// TEST069-TEST6240: N/A for JS (Rust-only binary_media_urn_for_ext/text_media_urn_for_ext)

// TEST71: Test to_string roundtrip ensures serialization and deserialization preserve URN structure
function test071_toStringRoundtrip() {
  const constants = [MEDIA_STRING, MEDIA_INTEGER, MEDIA_OBJECT, MEDIA_IDENTITY, MEDIA_PDF, MEDIA_JSON];
  for (const constant of constants) {
    const parsed = MediaUrn.fromString(constant);
    const reparsed = MediaUrn.fromString(parsed.toString());
    assert(parsed.equals(reparsed), `Round-trip failed for ${constant}`);
  }
}

// TEST72: Test all media URN constants parse successfully as valid media URNs
function test072_constantsParse() {
  const constants = [
    MEDIA_STRING, MEDIA_INTEGER, MEDIA_NUMBER, MEDIA_BOOLEAN,
    MEDIA_OBJECT, MEDIA_STRING_LIST, MEDIA_INTEGER_LIST,
    MEDIA_NUMBER_LIST, MEDIA_BOOLEAN_LIST, MEDIA_OBJECT_LIST,
    MEDIA_IDENTITY, MEDIA_VOID, MEDIA_PNG, MEDIA_PDF, MEDIA_EPUB,
    MEDIA_MD, MEDIA_TXT, MEDIA_RST, MEDIA_LOG, MEDIA_HTML, MEDIA_XML,
    MEDIA_JSON, MEDIA_YAML, MEDIA_JSON_SCHEMA, MEDIA_AUDIO, MEDIA_VIDEO,
    MEDIA_MODEL_SPEC, MEDIA_AVAILABILITY_OUTPUT, MEDIA_PATH_OUTPUT,
    MEDIA_PLAIN_TEXT
  ];
  for (const constant of constants) {
    const parsed = MediaUrn.fromString(constant);
    assert(parsed !== null, `Constant ${constant} should parse as valid MediaUrn`);
  }
}

// TEST6242: N/A for JS (Rust has binary_media_urn_for_ext/text_media_urn_for_ext)

// TEST74: Test media URN conforms_to using tagged URN semantics with specific and generic requirements
function test074_mediaUrnMatching() {
  const pdfUrn = MediaUrn.fromString(MEDIA_PDF);
  const pdfPattern = MediaUrn.fromString('media:ext=pdf');
  assert(pdfUrn.conformsTo(pdfPattern), 'MEDIA_PDF should conform to media:ext=pdf');

  const mdUrn = MediaUrn.fromString(MEDIA_MD);
  const mdPattern = MediaUrn.fromString('media:ext=md');
  assert(mdUrn.conformsTo(mdPattern), 'MEDIA_MD should conform to media:ext=md');

  // Same URN conforms to itself
  assert(pdfUrn.conformsTo(pdfUrn), 'Same URN should conform to itself');
}

// TEST75: Test accepts with implicit wildcards where handlers with fewer tags can handle more requests
function test075_accepts() {
  const handler = MediaUrn.fromString(MEDIA_PDF);
  const sameReq = MediaUrn.fromString(MEDIA_PDF);
  assert(handler.accepts(sameReq), 'Handler should accept same request');

  const generalHandler = MediaUrn.fromString(MEDIA_IDENTITY);
  const specificReq = MediaUrn.fromString(MEDIA_PDF);
  assert(generalHandler.accepts(specificReq), 'General handler should accept specific request');
}

// TEST76: Test specificity increases with more tags for ranking conformance
function test076_specificity() {
  const s1 = MediaUrn.fromString('media:');
  const s2 = MediaUrn.fromString('media:ext=pdf');
  const s3 = MediaUrn.fromString('media:ext=png;image;thumbnail');
  assert(s2.specificity() > s1.specificity(), 'pdf should be more specific than wildcard');
  assert(s3.specificity() > s2.specificity(), 'image;png;thumbnail should be more specific than pdf');
}

// TEST77: Test serde roundtrip serializes to JSON string and deserializes back correctly
function test077_serdeRoundtrip() {
  const original = MediaUrn.fromString(MEDIA_PDF);
  const json = JSON.stringify({ urn: original.toString() });
  const parsed = JSON.parse(json);
  const restored = MediaUrn.fromString(parsed.urn);
  assert(original.equals(restored), 'JSON round-trip should preserve MediaUrn');
}

// TEST78: conforms_to behavior between MEDIA_OBJECT and MEDIA_STRING
function test078_debugMatchingBehavior() {
  const objUrn = MediaUrn.fromString(MEDIA_OBJECT);
  const strUrn = MediaUrn.fromString(MEDIA_STRING);
  assert(!objUrn.conformsTo(strUrn), 'MEDIA_OBJECT should NOT conform to MEDIA_STRING');
}

// ============================================================================
// media_def.rs: TEST088-TEST110
// ============================================================================

// TEST6277: N/A for JS (async registry, Rust-only)
// TEST6279: N/A for JS
// TEST6280: N/A for JS

// TEST6282: Test resolving a custom media URN from a registry-seeded media def
function test6282_resolveCustomMediaDef() {
  const mediaDefs = [
    { urn: 'media:custom-json', media_type: 'application/json', title: 'Custom JSON', profile_uri: 'https://example.com/schema/custom' }
  ];
  const spec = resolveMediaUrn('media:custom-json', mediaDefs);
  assertEqual(spec.contentType, 'application/json', 'Should resolve custom spec');
  assertEqual(spec.profile, 'https://example.com/schema/custom', 'Should have custom profile');
}

// TEST6283: Test resolving a custom record media def carrying a schema from a registry-seeded media def
function test6283_resolveCustomWithSchema() {
  const mediaDefs = [
    {
      urn: 'media:rich-xml',
      media_type: 'application/xml',
      title: 'Rich XML',
      profile_uri: 'https://example.com/schema/rich',
      schema: { type: 'object' }
    }
  ];
  const spec = resolveMediaUrn('media:rich-xml', mediaDefs);
  assertEqual(spec.contentType, 'application/xml', 'Should resolve rich spec');
  assert(spec.schema !== null, 'Should have schema');
  assertEqual(spec.schema.type, 'object', 'Schema should have correct type');
}

// TEST93: Test resolving unknown media URN fails with UnresolvableMediaUrn error
function test93_resolveUnresolvableFailsHard() {
  let caught = false;
  try {
    resolveMediaUrn('media:nonexistent', []);
  } catch (e) {
    if (e instanceof MediaDefError && e.code === MediaDefErrorCodes.UNRESOLVABLE_MEDIA_URN) {
      caught = true;
    }
  }
  assert(caught, 'Should fail hard on unresolvable media URN');
}

// TEST6286: N/A for JS (no registry concept)
// TEST6288: N/A for JS (Rust serde)
// TEST6290: N/A for JS (Rust serde)
// TEST6292: N/A for JS (Rust validation function)
// TEST6294: N/A for JS

// TEST99: Test ResolvedMediaDef is_binary returns true when enc tag is absent
function test99_resolvedIsBinary() {
  const spec = new MediaDef('application/octet-stream', null, null, 'Binary', null, MEDIA_IDENTITY);
  assert(spec.isBinary(), 'Resolved binary spec should be binary');
}

// TEST100: Test ResolvedMediaDef is_record returns true when record marker is present
function test100_resolvedIsRecord() {
  const spec = new MediaDef('application/json', null, null, 'Object', null, MEDIA_OBJECT);
  assert(spec.isRecord(), 'Resolved object spec should be record');
}

// TEST101: Test ResolvedMediaDef is_scalar returns true when list marker is absent
function test101_resolvedIsScalar() {
  const spec = new MediaDef('text/plain', null, null, 'String', null, MEDIA_STRING);
  assert(spec.isScalar(), 'Resolved string spec should be scalar');
}

// TEST102: Test ResolvedMediaDef is_list returns true when list marker is present
function test102_resolvedIsList() {
  const spec = new MediaDef('text/plain', null, null, 'String List', null, MEDIA_STRING_LIST);
  assert(spec.isList(), 'Resolved string_list spec should be list');
}

// TEST103: Test ResolvedMediaDef is_json returns true when json tag is present
function test103_resolvedIsJson() {
  const spec = new MediaDef('application/json', null, null, 'JSON', null, MEDIA_JSON);
  assert(spec.isJSON(), 'Resolved json spec should be JSON');
}

// TEST104: Test ResolvedMediaDef is_text returns true when enc tag is present
function test104_resolvedIsText() {
  const spec = new MediaDef('text/plain', null, null, 'String', null, MEDIA_STRING);
  assert(spec.isText(), 'Resolved string spec should be text');
}

// TEST105: Test metadata propagates from media def def to resolved media def
function test105_metadataPropagation() {
  const mediaDefs = [
    {
      urn: 'media:custom-setting',
      media_type: 'text/plain',
      title: 'Custom Setting',
      profile_uri: 'https://example.com/schema',
      metadata: {
        category_key: 'interface',
        ui_type: 'SETTING_UI_TYPE_CHECKBOX',
        subcategory_key: 'appearance',
        display_index: 5
      }
    }
  ];
  const resolved = resolveMediaUrn('media:custom-setting', mediaDefs);
  assert(resolved.metadata !== null, 'Should have metadata');
  assertEqual(resolved.metadata.category_key, 'interface', 'Should propagate category_key');
  assertEqual(resolved.metadata.ui_type, 'SETTING_UI_TYPE_CHECKBOX', 'Should propagate ui_type');
  assertEqual(resolved.metadata.display_index, 5, 'Should propagate display_index');
}

// TEST106: Test metadata and validation can coexist in media definition
function test106_metadataWithValidation() {
  const mediaDefs = [
    {
      urn: 'media:bounded-number;numeric',
      media_type: 'text/plain',
      title: 'Bounded Number',
      validation: { min: 0, max: 100 },
      metadata: { category_key: 'inference', ui_type: 'SETTING_UI_TYPE_SLIDER' }
    }
  ];
  const resolved = resolveMediaUrn('media:bounded-number;numeric', mediaDefs);
  assert(resolved.validation !== null, 'Should have validation');
  assertEqual(resolved.validation.min, 0, 'Should have min');
  assertEqual(resolved.validation.max, 100, 'Should have max');
  assert(resolved.metadata !== null, 'Should have metadata');
  assertEqual(resolved.metadata.category_key, 'inference', 'Should have category_key');
}

// TEST107: Test extensions field propagates from media def def to resolved
function test107_extensionsPropagation() {
  const mediaDefs = [
    {
      urn: 'media:ext=pdf',
      media_type: 'application/pdf',
      title: 'PDF Document',
      extensions: ['pdf']
    }
  ];
  const resolved = resolveMediaUrn('media:ext=pdf', mediaDefs);
  assert(Array.isArray(resolved.extensions), 'Extensions should be an array');
  assertEqual(resolved.extensions.length, 1, 'Should have one extension');
  assertEqual(resolved.extensions[0], 'pdf', 'Should have pdf extension');
}

// TEST108: Test creating new cap with URN, title, and command verifies correct initialization
function test108_extensionsSerialization() {
  // Test that MediaDef can hold extensions correctly
  const spec = new MediaDef('application/pdf', null, null, 'PDF', null, 'media:ext=pdf', null, null, ['pdf']);
  assert(Array.isArray(spec.extensions), 'Extensions should be array');
  assertEqual(spec.extensions[0], 'pdf', 'Should have pdf extension');
}

// TEST109: Test creating cap with metadata initializes and retrieves metadata correctly
function test109_extensionsWithMetadataAndValidation() {
  const mediaDefs = [
    {
      urn: 'media:custom-output',
      media_type: 'application/json',
      title: 'Custom Output',
      validation: { min_length: 1, max_length: 1000 },
      metadata: { category: 'output' },
      extensions: ['json']
    }
  ];
  const resolved = resolveMediaUrn('media:custom-output', mediaDefs);
  assert(resolved.validation !== null, 'Should have validation');
  assert(resolved.metadata !== null, 'Should have metadata');
  assert(Array.isArray(resolved.extensions), 'Should have extensions');
  assertEqual(resolved.extensions[0], 'json', 'Should have json extension');
}

// TEST110: Test cap matching with subset semantics for request fulfillment
function test110_multipleExtensions() {
  const mediaDefs = [
    {
      urn: 'media:ext=jpeg;image',
      media_type: 'image/jpeg',
      title: 'JPEG Image',
      extensions: ['jpg', 'jpeg']
    }
  ];
  const resolved = resolveMediaUrn('media:ext=jpeg;image', mediaDefs);
  assertEqual(resolved.extensions.length, 2, 'Should have two extensions');
  assertEqual(resolved.extensions[0], 'jpg', 'First extension should be jpg');
  assertEqual(resolved.extensions[1], 'jpeg', 'Second extension should be jpeg');
}

// TEST115: Test CapArg serialization and deserialization with multiple sources
function test115_capArgSerialization() {
  const arg = new CapArg(
    MEDIA_STRING,
    true,
    [new ArgSource({ cli_flag: '--name' }), new ArgSource({ position: 0 })],
    {
      arg_description: 'The name argument',
      default_value: 400,
      metadata: { kind: 'example', flags: [true, false] }
    }
  );

  const json = arg.toJSON();
  assertEqual(json.media_urn, MEDIA_STRING, 'media_urn must serialize');
  assertEqual(json.required, true, 'required must serialize');
  assertEqual(json.arg_description, 'The name argument', 'arg_description must serialize');
  assertEqual(json.default_value, 400, 'numeric default_value must serialize as number');
  assertEqual(JSON.stringify(json.metadata), JSON.stringify({ kind: 'example', flags: [true, false] }),
    'metadata must serialize as arbitrary JSON');

  const roundTripped = CapArg.fromJSON(JSON.parse(JSON.stringify(json)));
  assertEqual(roundTripped.media_urn, arg.media_urn, 'media_urn must round-trip');
  assertEqual(roundTripped.required, arg.required, 'required must round-trip');
  assertEqual(roundTripped.arg_description, arg.arg_description, 'arg_description must round-trip');
  assertEqual(roundTripped.default_value, 400, 'numeric default_value must round-trip');
  assertEqual(JSON.stringify(roundTripped.metadata), JSON.stringify({ kind: 'example', flags: [true, false] }),
    'metadata must round-trip');
  assertEqual(roundTripped.sources.length, 2, 'sources length must round-trip');
  assertEqual(roundTripped.sources[0].cli_flag, '--name', 'cli_flag source must round-trip');
  assertEqual(roundTripped.sources[1].position, 0, 'position source must round-trip');
}

// TEST116: Test CapArg constructor methods basic and with_description create args correctly
function test116_capArgConstructors() {
  const basicArg = new CapArg(
    MEDIA_STRING,
    true,
    [new ArgSource({ cli_flag: '--name' })]
  );
  assertEqual(basicArg.media_urn, MEDIA_STRING, 'basic arg media_urn must match');
  assertEqual(basicArg.required, true, 'basic arg required must match');
  assertEqual(basicArg.sources.length, 1, 'basic arg must keep one source');
  assertEqual(basicArg.arg_description, null, 'basic arg arg_description must be absent');
  assertEqual(basicArg.default_value, null, 'basic arg default_value must be absent');

  const describedArg = new CapArg(
    MEDIA_INTEGER,
    false,
    [new ArgSource({ position: 0 })],
    {
      arg_description: 'The count argument',
      default_value: 10
    }
  );
  assertEqual(describedArg.media_urn, MEDIA_INTEGER, 'described arg media_urn must match');
  assertEqual(describedArg.required, false, 'described arg required must match');
  assertEqual(describedArg.arg_description, 'The count argument', 'described arg description must match');
  assertEqual(describedArg.default_value, 10, 'described arg default_value must match');
}

// TEST150: JSON roundtrip
function test150_capManifestJsonSerialization() {
  const capUrn = CapUrn.fromString(test6204_Urn('extract;target=metadata'));
  const cap = new Cap(capUrn, 'Extract Metadata', ['extract-metadata']);
  cap.addArg(new CapArg('media:ext=pdf', true, [new ArgSource({ stdin: 'media:ext=pdf' })]));
  cap.addArg(new CapArg(
    'media:chunk-size;enc=utf-8;numeric',
    false,
    [new ArgSource({ cli_flag: '--chunk-size' })],
    {
      arg_description: 'Chunk size',
      default_value: 400,
      metadata: { unit: 'words' }
    }
  ));
  cap.addArg(new CapArg(
    'media:bool;enc=utf-8;timestamps',
    false,
    [new ArgSource({ cli_flag: '--timestamps' })],
    {
      arg_description: 'Include timestamps',
      default_value: false
    }
  ));

  const manifest = new CapManifest(
    'TestComponent',
    '0.1.0',
    'release',
    null,
    'A test component',
    [new CapGroup('default', [cap], [])]
  );

  manifest.author = 'Test Author';

  const json = manifest.toJSON();
  assertEqual(json.name, 'TestComponent', 'manifest name must serialize');
  assertEqual(json.author, 'Test Author', 'author must serialize');
  assert(Array.isArray(json.cap_groups), 'cap_groups must serialize');
  assertEqual(json.cap_groups.length, 1, 'cap_groups length must serialize');
  assertEqual(json.cap_groups[0].caps[0].args[1].default_value, 400, 'numeric default must serialize as number');
  assertEqual(json.cap_groups[0].caps[0].args[1].metadata.unit, 'words', 'metadata must serialize');
  assertEqual(json.cap_groups[0].caps[0].args[2].default_value, false, 'boolean default must serialize as boolean');

  const roundTripped = CapManifest.fromJSON(JSON.parse(JSON.stringify(json)));
  const decodedCap = roundTripped.allCaps()[0];
  assertEqual(roundTripped.name, manifest.name, 'manifest name must round-trip');
  assertEqual(roundTripped.author, 'Test Author', 'author must round-trip');
  assertEqual(roundTripped.cap_groups.length, 1, 'cap_groups length must round-trip');
  assertEqual(decodedCap.args[1].default_value, 400, 'numeric default must round-trip');
  assertEqual(JSON.stringify(decodedCap.args[1].metadata), JSON.stringify({ unit: 'words' }),
    'metadata must round-trip');
  assertEqual(decodedCap.args[2].default_value, false, 'boolean default must round-trip');
}

// TEST597: CapArg::with_full_definition stores all fields including optional ones
function test597_capArgWithFullDefinition() {
  const arg = new CapArg(
    MEDIA_STRING,
    true,
    [new ArgSource({ cli_flag: '--name' })],
    {
      arg_description: 'User name',
      default_value: { chunk_size: 400, timestamps: false },
      metadata: { hint: 'enter name' }
    }
  );

  assertEqual(arg.media_urn, MEDIA_STRING, 'media_urn must match');
  assertEqual(arg.required, true, 'required must match');
  assertEqual(arg.arg_description, 'User name', 'arg_description must match');
  assertEqual(JSON.stringify(arg.default_value), JSON.stringify({ chunk_size: 400, timestamps: false }),
    'object default_value must be preserved');
  assertEqual(JSON.stringify(arg.metadata), JSON.stringify({ hint: 'enter name' }),
    'metadata must be preserved');

  const roundTripped = CapArg.fromJSON(JSON.parse(JSON.stringify(arg.toJSON())));
  assertEqual(roundTripped.arg_description, 'User name', 'arg_description must round-trip');
  assertEqual(JSON.stringify(roundTripped.default_value), JSON.stringify({ chunk_size: 400, timestamps: false }),
    'object default_value must round-trip');
  assertEqual(JSON.stringify(roundTripped.metadata), JSON.stringify({ hint: 'enter name' }),
    'metadata must round-trip');
}

// ============================================================================
// cap_fab: browse-mode API used by cap-fab-renderer.js
//
// The renderer builds its browse graph by:
//   const capFab = new CapFab();
//   for each cap in /api/capabilities: capFab.addCap(cap, 'registry');
//   ... then reads capFab.edges / getOutgoing(urn) / etc.
//
// These tests lock in that specific contract. They do NOT cover
// buildFromRegistries / CapMatrix / CapBlock — all deleted with the dead
// in-process dispatch stack.
// ============================================================================

// Add a cap and check it becomes an edge with from/to nodes and carries the
// registry name we passed. This is exactly the shape the renderer depends on.
function test6206_CapFabAddCapPopulatesEdgesAndNodes() {
  const graph = new CapFab();
  const cap = makeGraphCap('media:ext=pdf', 'media:enc=utf-8', 'PDF to Text');
  graph.addCap(cap, 'registry');

  const edges = graph.getEdges();
  assertEqual(edges.length, 1, 'Graph must have one edge after a single addCap');
  assertEqual(edges[0].fromUrn, 'media:ext=pdf', 'Edge fromUrn must be cap in_spec');
  assertEqual(edges[0].toUrn, 'media:enc=utf-8', 'Edge toUrn must be cap out_spec');
  assertEqual(edges[0].registryName, 'registry', 'Edge must carry the registry name passed to addCap');

  const nodes = graph.getNodes();
  assert(nodes.has('media:ext=pdf'), 'from_spec must appear as a node');
  assert(nodes.has('media:enc=utf-8'), 'to_spec must appear as a node');
}

// getOutgoing takes a concrete source URN and returns edges whose from_spec
// the source conforms to. It must NOT be a plain string lookup.
function test6208_CapFabGetOutgoingConformsToMatching() {
  const graph = new CapFab();
  graph.addCap(makeGraphCap('media:enc=utf-8', 'media:embedding-vector', 'Embed text'), 'registry');

  // 'media:enc=utf-8;ext=txt' conforms to 'media:enc=utf-8' — renderer relies on
  // this for the browse-mode fan-out from specific source URNs to caps that
  // accept a broader media pattern.
  const outgoingFromSpecific = graph.getOutgoing('media:enc=utf-8;ext=txt');
  assertEqual(outgoingFromSpecific.length, 1, 'Specific URN must match broader cap input');

  // The broad URN still matches its own edge.
  const outgoingFromBroad = graph.getOutgoing('media:enc=utf-8');
  assertEqual(outgoingFromBroad.length, 1, 'Exact URN must match');

  // A totally unrelated URN must not match.
  const outgoingFromUnrelated = graph.getOutgoing('media:ext=png;image');
  assertEqual(outgoingFromUnrelated.length, 0, 'Unrelated URN must not match');
}

// Each edge must carry the registry name it was added with. This is how
// the renderer colours/groups edges by provenance in browse mode.
function test6224_CapFabDistinctRegistryNames() {
  const graph = new CapFab();
  graph.addCap(makeGraphCap('media:ext=pdf', 'media:enc=utf-8', 'PDF to Text'), 'bundled-cartridges');
  graph.addCap(makeGraphCap('media:enc=utf-8', 'media:embedding-vector', 'Embed'), 'cartridges');

  const edges = graph.getEdges();
  assertEqual(edges.length, 2, 'Two caps must produce two edges');

  const names = new Set(edges.map(e => e.registryName));
  assert(names.has('bundled-cartridges'), 'bundled-cartridges registry name must be preserved');
  assert(names.has('cartridges'), 'cartridges registry name must be preserved');
}

// ============================================================================
// caller.rs: TEST156-TEST159
// ============================================================================

// TEST156: Test creating StdinSource Data variant with byte vector
function test156_stdinSourceFromData() {
  const testData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
  const source = StdinSource.fromData(testData);
  assert(source !== null, 'Should create source');
  assertEqual(source.kind, StdinSourceKind.DATA, 'Should be DATA kind');
  assert(source.isData(), 'isData() should return true');
  assert(!source.isFileReference(), 'isFileReference() should return false');
  assertEqual(source.data, testData, 'Should store data');
}

// TEST157: Test creating StdinSource FileReference variant with all required fields
function test157_stdinSourceFromFileReference() {
  const trackedFileId = 'tracked-file-123';
  const originalPath = '/path/to/original.pdf';
  const securityBookmark = new Uint8Array([0x62, 0x6f, 0x6f, 0x6b]);
  const mediaUrn = 'media:ext=pdf';

  const source = StdinSource.fromFileReference(trackedFileId, originalPath, securityBookmark, mediaUrn);
  assert(source !== null, 'Should create source');
  assertEqual(source.kind, StdinSourceKind.FILE_REFERENCE, 'Should be FILE_REFERENCE kind');
  assert(!source.isData(), 'isData() should return false');
  assert(source.isFileReference(), 'isFileReference() should return true');
  assertEqual(source.trackedFileId, trackedFileId, 'Should store trackedFileId');
  assertEqual(source.originalPath, originalPath, 'Should store originalPath');
  assertEqual(source.mediaUrn, mediaUrn, 'Should store mediaUrn');
}

// TEST158: Test StdinSource Data with empty vector stores and retrieves correctly
function test158_stdinSourceWithEmptyData() {
  const emptyData = new Uint8Array(0);
  const source = StdinSource.fromData(emptyData);
  assert(source.isData(), 'Should be data source');
  assertEqual(source.data.length, 0, 'Data length should be 0');
}

// TEST159: Test StdinSource Data with binary content like PNG header bytes
function test159_stdinSourceWithBinaryContent() {
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const source = StdinSource.fromData(pngHeader);
  assert(source.isData(), 'Should be data source');
  assertEqual(source.data.length, 8, 'Should have 8 bytes');
  assertEqual(source.data[0], 0x89, 'First byte should be 0x89');
  assertEqual(source.data[1], 0x50, 'Second byte should be 0x50 (P)');
}

// ============================================================================
// caller.rs: TEST274-TEST283
// ============================================================================

// TEST274: Test CapArgumentValue::new stores media_urn and raw byte value
function test274_capArgumentValueNew() {
  const arg = new CapArgumentValue('media:enc=utf-8;model-spec', new Uint8Array([103, 112, 116, 45, 52]));
  assertEqual(arg.mediaUrn, 'media:enc=utf-8;model-spec', 'mediaUrn must match');
  assertEqual(arg.value.length, 5, 'value must have 5 bytes');
}

// TEST275: Test CapArgumentValue::from_str converts string to UTF-8 bytes
function test275_capArgumentValueFromStr() {
  const arg = CapArgumentValue.fromStr('media:enc=utf-8;string', 'hello world');
  assertEqual(arg.mediaUrn, 'media:enc=utf-8;string', 'mediaUrn must match');
  assertEqual(new TextDecoder().decode(arg.value), 'hello world', 'value must decode correctly');
}

// TEST276: Test CapArgumentValue::value_as_str succeeds for UTF-8 data
function test276_capArgumentValueAsStrValid() {
  const arg = CapArgumentValue.fromStr('media:string', 'test');
  assertEqual(arg.valueAsStr(), 'test', 'valueAsStr must return test');
}

// TEST277: Test CapArgumentValue::value_as_str fails for non-UTF-8 binary data
function test277_capArgumentValueAsStrInvalidUtf8() {
  const arg = new CapArgumentValue('media:ext=pdf', new Uint8Array([0xFF, 0xFE, 0x80]));
  let threw = false;
  try {
    arg.valueAsStr();
  } catch (e) {
    threw = true;
  }
  assert(threw, 'non-UTF-8 data must fail on valueAsStr with fatal decoder');
}

// TEST278: Test CapArgumentValue::new with empty value stores empty vec
function test278_capArgumentValueEmpty() {
  const arg = new CapArgumentValue('media:void', new Uint8Array([]));
  assertEqual(arg.value.length, 0, 'empty value must have 0 bytes');
  assertEqual(arg.valueAsStr(), '', 'empty value as string must be empty string');
}

// TEST279-281: N/A for JS (Rust Debug/Clone/Send traits)

// TEST282: Test CapArgumentValue::from_str with Unicode string preserves all characters
function test282_capArgumentValueUnicode() {
  const arg = CapArgumentValue.fromStr('media:string', 'hello \u4e16\u754c \ud83c\udf0d');
  assertEqual(arg.valueAsStr(), 'hello \u4e16\u754c \ud83c\udf0d', 'Unicode must roundtrip');
}

// TEST283: Test CapArgumentValue with large binary payload preserves all bytes
function test283_capArgumentValueLargeBinary() {
  const data = new Uint8Array(10000);
  for (let i = 0; i < 10000; i++) {
    data[i] = i % 256;
  }
  const arg = new CapArgumentValue('media:ext=pdf', data);
  assertEqual(arg.value.length, 10000, 'large binary must preserve all bytes');
  assertEqual(arg.value[0], 0, 'first byte check');
  assertEqual(arg.value[255], 255, 'byte 255 check');
  assertEqual(arg.value[256], 0, 'byte 256 wraps check');
}

// ============================================================================
// standard/caps.rs: TEST304-TEST312
// ============================================================================


// TEST304: Test MEDIA_AVAILABILITY_OUTPUT constant parses as valid media URN with correct tags
function test304_mediaAvailabilityOutputConstant() {
  const urn = TaggedUrn.fromString(MEDIA_AVAILABILITY_OUTPUT);
  assertEqual(urn.getTag('enc'), 'utf-8', 'model-availability must carry enc=utf-8');
  assertEqual(urn.getTag('record'), '*', 'model-availability must be record');
  const reparsed = TaggedUrn.fromString(urn.toString());
  assert(urn.conformsTo(reparsed), 'roundtrip must match original');
}

// TEST305: Test MEDIA_PATH_OUTPUT constant parses as valid media URN with correct tags
function test305_mediaPathOutputConstant() {
  const urn = TaggedUrn.fromString(MEDIA_PATH_OUTPUT);
  assertEqual(urn.getTag('enc'), 'utf-8', 'model-path must carry enc=utf-8');
  assertEqual(urn.getTag('record'), '*', 'model-path must be record');
  const reparsed = TaggedUrn.fromString(urn.toString());
  assert(urn.conformsTo(reparsed), 'roundtrip must match original');
}

// TEST306: Test MEDIA_AVAILABILITY_OUTPUT and MEDIA_PATH_OUTPUT are distinct URNs
function test306_availabilityAndPathOutputDistinct() {
  assert(MEDIA_AVAILABILITY_OUTPUT !== MEDIA_PATH_OUTPUT, 'Must be distinct');
  const avail = TaggedUrn.fromString(MEDIA_AVAILABILITY_OUTPUT);
  const path = TaggedUrn.fromString(MEDIA_PATH_OUTPUT);
  let matchResult;
  try {
    matchResult = avail.conformsTo(path);
  } catch (e) {
    matchResult = false;
  }
  assert(!matchResult, 'availability must not conform to path');
}

// TEST307: Test model_availability_urn builds valid cap URN with correct op and media defs
function test307_modelAvailabilityUrn() {
  const urn = modelAvailabilityUrn();
  assert(urn.hasMarkerTag('model-availability'), 'Must have model-availability marker');
  const inSpec = TaggedUrn.fromString(urn.getInSpec());
  const expectedIn = TaggedUrn.fromString(MEDIA_MODEL_SPEC);
  assert(inSpec.conformsTo(expectedIn), 'input must conform to MEDIA_MODEL_SPEC');
  const outSpec = TaggedUrn.fromString(urn.getOutSpec());
  const expectedOut = TaggedUrn.fromString(MEDIA_AVAILABILITY_OUTPUT);
  assert(outSpec.conformsTo(expectedOut), 'output must conform to MEDIA_AVAILABILITY_OUTPUT');
}

// TEST308: Test model_path_urn builds valid cap URN with correct op and media defs
function test308_modelPathUrn() {
  const urn = modelPathUrn();
  assert(urn.hasMarkerTag('model-path'), 'Must have model-path marker');
  const inSpec = TaggedUrn.fromString(urn.getInSpec());
  const expectedIn = TaggedUrn.fromString(MEDIA_MODEL_SPEC);
  assert(inSpec.conformsTo(expectedIn), 'input must conform to MEDIA_MODEL_SPEC');
  const outSpec = TaggedUrn.fromString(urn.getOutSpec());
  const expectedOut = TaggedUrn.fromString(MEDIA_PATH_OUTPUT);
  assert(outSpec.conformsTo(expectedOut), 'output must conform to MEDIA_PATH_OUTPUT');
}

// TEST309: Test model_availability_urn and model_path_urn produce distinct URNs
function test309_modelAvailabilityAndPathAreDistinct() {
  const avail = modelAvailabilityUrn();
  const path = modelPathUrn();
  assert(avail.toString() !== path.toString(), 'availability and path must be distinct');
}

// TEST310: llm_generate_text_urn() produces a valid cap URN with a UTF-8 text input and plain-text terminal output.
function test310_llmGenerateTextUrn() {
  const urn = llmGenerateTextUrn();
  assert(urn.hasMarkerTag('generate_text'), 'Must have generate_text marker');
  assert(urn.getTag('llm') !== undefined, 'Must have llm tag');
  assert(urn.getTag('ml-model') !== undefined, 'Must have ml-model tag');
  assert(TaggedUrn.fromString(urn.getInSpec()).conformsTo(TaggedUrn.fromString(MEDIA_STRING)),
    'in_spec must conform to MEDIA_STRING');
  assert(TaggedUrn.fromString(urn.getOutSpec()).conformsTo(TaggedUrn.fromString(MEDIA_STRING)),
    'out_spec must conform to MEDIA_STRING');
}

// Mirror-specific coverage: llm_generate_text_urn input/output specs conform to MEDIA_STRING
function test6228_LlmGenerateTextUrnSpecs() {
  const urn = llmGenerateTextUrn();
  const inSpec = TaggedUrn.fromString(urn.getInSpec());
  const expectedIn = TaggedUrn.fromString(MEDIA_STRING);
  assert(inSpec.conformsTo(expectedIn), 'in_spec must conform to MEDIA_STRING');
  const outSpec = TaggedUrn.fromString(urn.getOutSpec());
  const expectedOut = TaggedUrn.fromString(MEDIA_STRING);
  assert(outSpec.conformsTo(expectedOut), 'out_spec must conform to MEDIA_STRING');
}

// TEST312: Test all URN builders produce parseable cap URNs
function test312_allUrnBuildersProduceValidUrns() {
  const avail = modelAvailabilityUrn();
  const path = modelPathUrn();
  const llmGen = llmGenerateTextUrn();

  const parsedAvail = CapUrn.fromString(avail.toString());
  assert(parsedAvail !== null, 'modelAvailabilityUrn must be parseable');
  const parsedPath = CapUrn.fromString(path.toString());
  assert(parsedPath !== null, 'modelPathUrn must be parseable');
  const parsedLlmGen = CapUrn.fromString(llmGen.toString());
  assert(parsedLlmGen !== null, 'llmGenerateTextUrn must be parseable');
}

// ============================================================================
// Additional JS-specific tests (extension index, media URN resolution, Cap JSON)
// ============================================================================

// These tests cover JS-specific functionality not in the Rust numbering scheme
// but are important for capdag-js correctness.

function test6232_JS_buildExtensionIndex() {
  const mediaDefs = [
    { urn: 'media:ext=pdf', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:ext=jpeg;image', media_type: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
    { urn: 'media:fmt=json', media_type: 'application/json', extensions: ['json'] }
  ];
  const index = buildExtensionIndex(mediaDefs);
  assert(index instanceof Map, 'Should return a Map');
  assertEqual(index.size, 4, 'Should have 4 extensions');
  assert(index.has('pdf'), 'Should have pdf');
  assert(index.has('jpg'), 'Should have jpg');
  assert(index.has('jpeg'), 'Should have jpeg');
  assert(index.has('json'), 'Should have json');
  assertEqual(index.get('pdf')[0], 'media:ext=pdf', 'pdf should map correctly');
}

// TEST6236: J s media urns for extension
function test6236_JS_mediaUrnsForExtension() {
  const mediaDefs = [
    { urn: 'media:ext=pdf', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:fmt=json;record', media_type: 'application/json', extensions: ['json'] },
    { urn: 'media:fmt=json;list', media_type: 'application/json', extensions: ['json'] }
  ];

  const pdfUrns = mediaUrnsForExtension('pdf', mediaDefs);
  assertEqual(pdfUrns.length, 1, 'Should find 1 URN for pdf');

  // Case insensitivity
  const pdfUrnsUpper = mediaUrnsForExtension('PDF', mediaDefs);
  assertEqual(pdfUrnsUpper.length, 1, 'Should find URN with uppercase extension');

  // Multiple URNs for same extension
  const jsonUrns = mediaUrnsForExtension('json', mediaDefs);
  assertEqual(jsonUrns.length, 2, 'Should find 2 URNs for json');

  // Unknown extension throws
  let thrownError = null;
  try {
    mediaUrnsForExtension('unknown', mediaDefs);
  } catch (e) {
    thrownError = e;
  }
  assert(thrownError instanceof MediaDefError, 'Should throw MediaDefError for unknown ext');
}

// TEST6240: J s get extension mappings
function test6240_JS_getExtensionMappings() {
  const mediaDefs = [
    { urn: 'media:ext=pdf', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:ext=jpeg;image', media_type: 'image/jpeg', extensions: ['jpg', 'jpeg'] }
  ];
  const mappings = getExtensionMappings(mediaDefs);
  assert(Array.isArray(mappings), 'Should return an array');
  assertEqual(mappings.length, 3, 'Should have 3 mappings');
}

// TEST6242: J s resolve media urn from specs
function test6242_JS_resolveMediaUrnFromSpecs() {
  const mediaDefs = [
    { urn: MEDIA_STRING, media_type: 'text/plain', title: 'String', profile_uri: 'https://capdag.com/schema/str' },
    { urn: 'media:custom', media_type: 'application/json', title: 'Custom Output', schema: { type: 'object' } }
  ];
  const strSpec = resolveMediaUrn(MEDIA_STRING, mediaDefs);
  assertEqual(strSpec.contentType, 'text/plain', 'Should resolve string spec');
  const outputSpec = resolveMediaUrn('media:custom', mediaDefs);
  assertEqual(outputSpec.contentType, 'application/json', 'Should resolve custom spec');
  assert(outputSpec.schema !== null, 'Should have schema');
}

// TEST6246: J s cap j s o n serialization
function test6246_JS_capJSONSerialization() {
  const urn = CapUrn.fromString(test6204_Urn('test'));
  const cap = new Cap(urn, 'Test Cap', ['test_command']);
  cap.arguments = {
    required: [{ name: 'input', media_urn: MEDIA_STRING }],
    optional: []
  };
  cap.output = { media_urn: 'media:custom', output_description: 'Test output' };

  const json = cap.toJSON();
  assertEqual(typeof json.urn, 'string', 'URN should be string');
  assert(json.media_defs === undefined, 'Cap JSON must not contain media_defs (registry-resolved)');

  const restored = Cap.fromJSON(json);
  assertEqual(restored.urn.getInSpec(), MEDIA_VOID, 'Should restore inSpec');
  assertEqual(restored.urn.getOutSpec(), MEDIA_OBJECT, 'Should restore outSpec');
}

// JS round-trip for the documentation field on Cap. Mirrors TEST920 in
// capdag/src/cap/definition.rs — the body is non-trivial (newlines,
// backticks, embedded quotes, Unicode) so escaping mismatches between
// JSON.stringify on this side and the Rust serializer on the other side
// surface as failures here.
function test6249_JS_capDocumentationRoundTrip() {
  const urn = CapUrn.fromString(test6204_Urn('documented'));
  const cap = new Cap(urn, 'Documented Cap', ['documented']);
  const body = '# Documented Cap\r\n\nDoes the thing.\n\n```bash\necho "hi"\n```\n\nSee also: \u2605\n';
  cap.setDocumentation(body);
  assertEqual(cap.getDocumentation(), body, 'Setter must store the body verbatim');

  const json = cap.toJSON();
  assertEqual(json.documentation, body, 'toJSON must include documentation when set');

  // Stringify and parse to simulate writing to disk and reading back.
  const wireJson = JSON.parse(JSON.stringify(json));
  const restored = Cap.fromJSON(wireJson);
  assertEqual(restored.getDocumentation(), body, 'fromJSON must preserve documentation body verbatim');
  assert(restored.equals(cap), 'Round-tripped cap must equal the original');
}

// When documentation is null, toJSON must omit the field entirely. This
// matches the Rust serializer's skip-when-None semantics and the ObjC
// toDictionary behaviour. A regression where null is emitted as
// `documentation: null` would break the symmetric round-trip with Rust
// (which has no null sentinel) and pollute generated JSON.
function test6253_JS_capDocumentationOmittedWhenNull() {
  const urn = CapUrn.fromString(test6204_Urn('undocumented'));
  const cap = new Cap(urn, 'Undocumented Cap', ['undocumented']);
  assertEqual(cap.getDocumentation(), null, 'Default documentation must be null');

  const json = cap.toJSON();
  assert(!('documentation' in json), 'toJSON must omit documentation key when null');

  // fromJSON of a missing key must yield null, not undefined or empty string.
  const restored = Cap.fromJSON(JSON.parse(JSON.stringify(json)));
  assertEqual(restored.getDocumentation(), null, 'Missing documentation must round-trip as null');

  // Empty-string body is treated as absent (matches the resolver's
  // non-empty-string-only rule). This catches code paths that would store
  // an empty string and then emit it as a literal field.
  cap.setDocumentation('');
  assertEqual(cap.getDocumentation(), null, 'Empty string must collapse to null');
}

// Documentation propagates from a mediaDefs definition through
// resolveMediaUrn into the resolved MediaDef. Mirrors TEST924 on the Rust
// side. This is the path every UI consumer uses, so a break here makes the
// new field invisible everywhere downstream.
function test6257_JS_mediaDefDocumentationPropagatesThroughResolve() {
  const body = '## Markdown body\n\nWith `code` and a [link](https://example.com).';
  const mediaDefs = [
    {
      urn: 'media:doc-test;enc=utf-8',
      media_type: 'text/plain',
      title: 'Documented',
      description: 'short desc',
      documentation: body
    }
  ];

  const resolved = resolveMediaUrn('media:doc-test;enc=utf-8', mediaDefs);
  assertEqual(resolved.documentation, body, 'documentation must propagate into MediaDef');
  // The short description must remain distinct from the long markdown
  // body — they are different fields with different semantics.
  assertEqual(resolved.description, 'short desc', 'description must remain distinct from documentation');

  // Missing documentation must collapse to null, not '' or undefined.
  const noDoc = resolveMediaUrn('media:doc-test;enc=utf-8', [
    { urn: 'media:doc-test;enc=utf-8', media_type: 'text/plain', title: 'No Doc' }
  ]);
  assertEqual(noDoc.documentation, null, 'Missing documentation must resolve to null');

  const emptyDoc = resolveMediaUrn('media:doc-test;enc=utf-8', [
    { urn: 'media:doc-test;enc=utf-8', media_type: 'text/plain', title: 'Empty', documentation: '' }
  ]);
  assertEqual(emptyDoc.documentation, null, 'Empty documentation string must collapse to null');
}

// TEST6261: J s stdin source kind constants
function test6261_JS_stdinSourceKindConstants() {
  assert(StdinSourceKind.DATA !== undefined, 'DATA kind should be defined');
  assert(StdinSourceKind.FILE_REFERENCE !== undefined, 'FILE_REFERENCE kind should be defined');
  assert(StdinSourceKind.DATA !== StdinSourceKind.FILE_REFERENCE, 'Kind values should be distinct');
}

// TEST6265: J s stdin source null data
function test6265_JS_stdinSourceNullData() {
  const source = StdinSource.fromData(null);
  assert(source !== null, 'Should create source');
  assert(source.isData(), 'Should be data source');
  assertEqual(source.data, null, 'Data should be null');
}

// TEST6269: J s media def construction
function test6269_JS_mediaDefConstruction() {
  const spec1 = new MediaDef('text/plain', 'https://capdag.com/schema/str', null, 'String', null, 'media:string');
  assertEqual(spec1.contentType, 'text/plain', 'Should have content type');
  assertEqual(spec1.profile, 'https://capdag.com/schema/str', 'Should have profile');
  assertEqual(spec1.title, 'String', 'Should have title');
  assertEqual(spec1.mediaUrn, 'media:string', 'Should have mediaUrn');

  const spec2 = new MediaDef('application/octet-stream', null, null, 'Binary', null, 'media:binary');
  assertEqual(spec2.profile, null, 'Should have null profile');
}

// =============================================================================
// Cartridge Repository Tests (TEST320-TEST335)
// =============================================================================

// Sample registry for testing — v5.0 channel-partitioned schema.
//
// Both `release` and `nightly` are always present. We populate the
// release channel with two cartridges (pdf + txt) for the bulk of the
// tests, and add one nightly entry so isolation tests have something
// to assert on. Tests that need an empty channel use literals inline.
const sampleRegistry = {
  schemaVersion: '5.0',
  registryVersion: 1,
  lastUpdated: '2026-02-07T16:48:28Z',
  registryUrl: 'https://test.example/manifest',
  fabricRegistryUrl: 'https://fabric.test',
  channels: {
    release: { cartridges: {
    pdfcartridge: {
      name: 'pdfcartridge',
      description: 'PDF document processor',
      author: 'test-author',
      pageUrl: 'https://example.com/pdf',
      teamId: 'P336JK947M',
      minAppVersion: '1.0.0',
      categories: ['document'],
      tags: ['pdf', 'extractor'],
      cap_groups: [
        {
          name: 'pdf-processing',
          adapter_urns: ['media:ext=pdf'],
          caps: [
            {
              urn: 'cap:in="media:ext=pdf";disbind;out="media:disbound-page;enc=utf-8;list"',
              title: 'Disbind PDF',
              description: 'Extract pages'
            },
            {
              urn: 'cap:in="media:ext=pdf";extract-metadata;out="media:enc=utf-8;file-metadata;record"',
              title: 'Extract Metadata',
              description: 'Get PDF metadata'
            }
          ]
        }
      ],
      latestVersion: '0.81.5325',
      versions: {
        '0.81.5325': {
          releaseDate: '2026-02-07T16:40:28Z',
          changelog: ['Initial release'],
          minAppVersion: '1.0.0',
          builds: [{
            platform: 'darwin-arm64',
            package: {
              name: 'pdfcartridge-0.81.5325.pkg',
              url: 'https://cartridges.machinefabric.com/pdfcartridge/0.81.5325/pdfcartridge-0.81.5325.pkg',
              sha256: '9b68724eb9220ecf01e8ed4f5f80c594fbac2239bc5bf675005ec882ecc5eba0',
              size: 5187485
            }
          }]
        }
      }
    },
    txtcartridge: {
      name: 'txtcartridge',
      description: 'Text file processor',
      author: 'test-author',
      pageUrl: 'https://example.com/txt',
      teamId: 'P336JK947M',
      minAppVersion: '1.0.0',
      categories: ['text'],
      tags: ['txt', 'text'],
      cap_groups: [
        {
          name: 'text-processing',
          adapter_urns: ['media:enc=utf-8;ext=txt'],
          caps: [
            {
              urn: 'cap:in="media:enc=utf-8;ext=txt";disbind;out="media:disbound-page;enc=utf-8;list"',
              title: 'Disbind Text',
              description: 'Extract text pages'
            }
          ]
        }
      ],
      latestVersion: '0.54.6408',
      versions: {
        '0.54.6408': {
          releaseDate: '2026-02-07T17:44:00Z',
          changelog: ['First version'],
          minAppVersion: '1.0.0',
          builds: [{
            platform: 'darwin-arm64',
            package: {
              name: 'txtcartridge-0.54.6408.pkg',
              url: 'https://cartridges.machinefabric.com/txtcartridge/0.54.6408/txtcartridge-0.54.6408.pkg',
              sha256: 'abc123',
              size: 821000
            }
          }]
        }
      }
    }
    } },
    nightly: { cartridges: {
      jsoncartridge: {
        name: 'jsoncartridge',
        description: 'JSON tooling — nightly only',
        author: 'test-author',
        pageUrl: 'https://example.com/json',
        teamId: 'P336JK947M',
        minAppVersion: '1.0.0',
        categories: ['data'],
        tags: ['json'],
        cap_groups: [
          {
            name: 'json-processing',
            adapter_urns: ['media:json'],
            caps: [
              {
                urn: 'cap:in="media:json";pretty;out="media:fmt=json"',
                title: 'Pretty Print JSON',
                description: 'Format JSON',
                command: 'pretty'
              }
            ]
          }
        ],
        latestVersion: '0.1.0',
        versions: {
          '0.1.0': {
            releaseDate: '2026-04-01T00:00:00Z',
            changelog: ['Initial nightly'],
            minAppVersion: '1.0.0',
            builds: [{
              platform: 'darwin-arm64',
              package: {
                name: 'jsoncartridge-0.1.0.pkg',
                url: 'https://cartridges.machinefabric.com/nightly/jsoncartridge/0.1.0/jsoncartridge-0.1.0.pkg',
                sha256: 'deadbeef',
                size: 100000
              }
            }]
          }
        }
      }
    } }
  }
};

// TEST320-335: CartridgeRepoServer and CartridgeRepoClient tests
function test320_cartridgeInfoConstruction() {
  const data = {
    id: 'testcartridge',
    name: 'Test Cartridge',
    registryUrl: 'https://test.example/manifest',
    channel: 'release',
    version: '1.0.0',
    description: 'A test',
    teamId: 'TEAM123',
    signedAt: '2026-01-01',
    cap_groups: [{
      name: 'test-group',
      adapter_urns: ['media:void'],
      caps: [{urn: 'cap:in="media:void";test;out="media:void"', title: 'Test', description: ''}]
    }],
    versions: {
      '1.0.0': {
        releaseDate: '2026-01-01',
        changelog: ['Initial'],
        minAppVersion: '1.0.0',
        builds: [{platform: 'darwin-arm64', package: {name: 'test-1.0.0.pkg', url: 'https://cartridges.machinefabric.com/testcartridge/1.0.0/test-1.0.0.pkg', sha256: 'abc123', size: 100}}]
      }
    },
    availableVersions: ['1.0.0']
  };
  const cartridge = new CartridgeInfo(data);
  assert(cartridge.id === 'testcartridge', 'ID should match');
  assert(cartridge.teamId === 'TEAM123', 'Team ID should match');
  assert(cartridge.cap_groups.length === 1, 'Should have 1 cap_group');
  assert(cartridge.cap_groups[0].caps[0].urn === 'cap:in="media:void";test;out="media:void"', 'Cap URN should match');
  assert(cartridge.allCaps().length === 1, 'allCaps() should return 1 cap');
}

// TEST321: CartridgeInfo.is_signed() returns true when signature (team_id + signed_at) is present, false when either is empty.
function test321_cartridgeInfoIsSigned() {
  const signed = new CartridgeInfo({id: 'test', registryUrl: 'https://test.example/manifest', channel: 'release', teamId: 'TEAM', signedAt: '2026-01-01', cap_groups: []});
  assert(signed.isSigned() === true, 'Cartridge with teamId and signedAt should be signed');

  const unsigned1 = new CartridgeInfo({id: 'test', registryUrl: 'https://test.example/manifest', channel: 'release', teamId: '', signedAt: '2026-01-01', cap_groups: []});
  assert(unsigned1.isSigned() === false, 'Cartridge without teamId should not be signed');

  const unsigned2 = new CartridgeInfo({id: 'test', registryUrl: 'https://test.example/manifest', channel: 'release', teamId: 'TEAM', signedAt: '', cap_groups: []});
  assert(unsigned2.isSigned() === false, 'Cartridge without signedAt should not be signed');
}

// TEST322: CartridgeInfo.build_for_platform() returns the build that matches the requested platform string and None otherwise.
function test322_cartridgeInfoBuildForPlatform() {
  const withBuilds = new CartridgeInfo({
    id: 'test', registryUrl: 'https://test.example/manifest', channel: 'release', version: '1.0.0', cap_groups: [],
    versions: {
      '1.0.0': {
        builds: [
          {platform: 'darwin-arm64', package: {name: 'test-darwin.pkg', url: 'https://cartridges.machinefabric.com/test/1.0.0/test-darwin.pkg', sha256: 'abc', size: 100}},
          {platform: 'linux-x86_64', package: {name: 'test-linux.pkg', url: 'https://cartridges.machinefabric.com/test/1.0.0/test-linux.pkg', sha256: 'def', size: 200}}
        ]
      }
    },
    availableVersions: ['1.0.0']
  });
  const darwinBuild = withBuilds.buildForPlatform('darwin-arm64');
  assert(darwinBuild !== null, 'Should find darwin-arm64 build');
  assert(darwinBuild.package.name === 'test-darwin.pkg', 'Should have correct package name');

  const linuxBuild = withBuilds.buildForPlatform('linux-x86_64');
  assert(linuxBuild !== null, 'Should find linux-x86_64 build');

  const missingBuild = withBuilds.buildForPlatform('windows-x86_64');
  assert(missingBuild === null, 'Should return null for missing platform');

  const platforms = withBuilds.availablePlatforms();
  assert(platforms.length === 2, 'Should have 2 platforms');
  assert(platforms.includes('darwin-arm64'), 'Should include darwin-arm64');
  assert(platforms.includes('linux-x86_64'), 'Should include linux-x86_64');

  const noBuilds = new CartridgeInfo({id: 'test', registryUrl: 'https://test.example/manifest', channel: 'release', version: '1.0.0', cap_groups: [], versions: {}, availableVersions: []});
  assert(noBuilds.buildForPlatform('darwin-arm64') === null, 'Should return null when no versions');
  assert(noBuilds.availablePlatforms().length === 0, 'Should have no platforms');
}

// TEST323: CartridgeRepoServer requires schema 5.0 and rejects older.
function test323_cartridgeRepoServerValidateRegistry() {
  // Valid registry
  const server = new CartridgeRepoServer(sampleRegistry);
  assert(server.registry.schemaVersion === '5.0', 'Should accept v5.0 registry');

  // Invalid schema version (4.0 is no longer accepted)
  let threw = false;
  try {
    new CartridgeRepoServer({schemaVersion: '4.0', channels: {release: {cartridges: {}}, nightly: {cartridges: {}}}});
  } catch (e) {
    threw = true;
    assert(e.message.includes('5.0'), 'Should reject pre-5.0 schema and mention required version');
  }
  assert(threw, 'Should throw for v4.0 schema');

  // Missing channels object
  threw = false;
  try {
    new CartridgeRepoServer({schemaVersion: '5.0', registryVersion: 1, fabricRegistryUrl: 'https://fabric.test', registryUrl: 'https://test.example/manifest'});
  } catch (e) {
    threw = true;
    assert(e.message.includes('channels'), 'Should reject missing channels');
  }
  assert(threw, 'Should throw for missing channels');

  // Missing one of the two required channels
  threw = false;
  try {
    new CartridgeRepoServer({schemaVersion: '5.0', registryVersion: 1, fabricRegistryUrl: 'https://fabric.test', registryUrl: 'https://test.example/manifest', channels: {release: {cartridges: {}}}});
  } catch (e) {
    threw = true;
    assert(e.message.includes('nightly'), 'Should require nightly channel');
  }
  assert(threw, 'Should throw when nightly channel is missing');
}

// TEST324: CartridgeRepoServer transforms a v4.0 entry into a flat CartridgeInfo, preserving cap_groups verbatim.
function test324_cartridgeRepoServerTransformToArray() {
  const server = new CartridgeRepoServer(sampleRegistry);
  const cartridges = server.transformToCartridgeArray();

  assert(Array.isArray(cartridges), 'Should return array');
  assert(cartridges.length === 3, 'Should have 3 cartridges across both channels');

  const pdf = cartridges.find(p => p.id === 'pdfcartridge');
  assert(pdf !== undefined, 'Should include pdfcartridge');
  assert(pdf.version === '0.81.5325', 'Should have latest version');
  assert(pdf.teamId === 'P336JK947M', 'Should have teamId');
  assert(pdf.signedAt === '2026-02-07T16:40:28Z', 'Should have signedAt from releaseDate');
  assert(pdf.channel === 'release', 'pdfcartridge should be in release channel');
  assert(pdf.versions !== undefined, 'Should have versions');
  assert(pdf.versions['0.81.5325'] !== undefined, 'Should have version data');
  assert(pdf.versions['0.81.5325'].builds.length === 1, 'Should have 1 build');
  assert(pdf.versions['0.81.5325'].builds[0].platform === 'darwin-arm64', 'Should have correct platform');
  assert(pdf.versions['0.81.5325'].builds[0].package.name === 'pdfcartridge-0.81.5325.pkg', 'Should have package name');
  assert(pdf.versions['0.81.5325'].builds[0].package.sha256 === '9b68724eb9220ecf01e8ed4f5f80c594fbac2239bc5bf675005ec882ecc5eba0', 'Should have package SHA256');
  assert(Array.isArray(pdf.availableVersions), 'Should have availableVersions array');
  assert(pdf.availableVersions.includes('0.81.5325'), 'Should include latest version');
  assert(Array.isArray(pdf.cap_groups), 'Should have cap_groups array');
  assert(pdf.cap_groups.length === 1, 'Should have 1 cap_group');
  assert(pdf.cap_groups[0].caps.length === 2, 'Should have 2 caps in the group');

  const json = cartridges.find(p => p.id === 'jsoncartridge');
  assert(json !== undefined, 'Should include jsoncartridge from nightly channel');
  assert(json.channel === 'nightly', 'jsoncartridge should be in nightly channel');

  // Release entries come before nightly so any UI that paints in
  // iteration order surfaces the user-facing channel first.
  const firstNightlyIdx = cartridges.findIndex(c => c.channel === 'nightly');
  const lastReleaseIdx = cartridges.map(c => c.channel).lastIndexOf('release');
  assert(firstNightlyIdx > lastReleaseIdx, 'Release entries must precede nightly entries');
}

// TEST325: get_cartridges() wraps the transformed array in the response envelope.
function test325_cartridgeRepoServerGetCartridges() {
  const server = new CartridgeRepoServer(sampleRegistry);
  const response = server.getCartridges();

  assert(response.cartridges !== undefined, 'Should have cartridges field');
  assert(Array.isArray(response.cartridges), 'Cartridges should be array');
  assert(response.cartridges.length === 3, 'Should have 3 cartridges total');
  assert(response.cartridges.every(c => c.channel === 'release' || c.channel === 'nightly'),
    'Every cartridge must carry a channel');
}

// TEST326: get_cartridge_by_id requires a channel and returns Some for a known (channel, id), None otherwise. The same id looked up in the wrong channel must miss — channels are independent namespaces.
function test326_cartridgeRepoServerGetCartridgeById() {
  const server = new CartridgeRepoServer(sampleRegistry);

  const pdf = server.getCartridgeById('release', 'pdfcartridge');
  assert(pdf !== undefined, 'Should find pdfcartridge in release');
  assert(pdf.id === 'pdfcartridge', 'Should have correct ID');
  assert(pdf.channel === 'release', 'Should report release channel');

  const json = server.getCartridgeById('nightly', 'jsoncartridge');
  assert(json !== undefined, 'Should find jsoncartridge in nightly');
  assert(json.channel === 'nightly', 'Should report nightly channel');

  const wrongChannel = server.getCartridgeById('nightly', 'pdfcartridge');
  assert(wrongChannel === undefined, 'pdf not in nightly — channels are independent');

  const notFound = server.getCartridgeById('release', 'nonexistent');
  assert(notFound === undefined, 'Should return undefined for missing cartridge');

  let threw = false;
  try {
    server.getCartridgeById('staging', 'pdfcartridge');
  } catch (e) {
    threw = true;
    assert(e.message.includes('release') && e.message.includes('nightly'),
      'Should reject invalid channel value');
  }
  assert(threw, 'Should throw for invalid channel');
}

// TEST327: search_cartridges matches against name/description/tags and cap titles, but never against cap URN strings.
function test327_cartridgeRepoServerSearchCartridges() {
  const server = new CartridgeRepoServer(sampleRegistry);

  const pdfResults = server.searchCartridges('pdf');
  assert(pdfResults.length === 1, 'Should find 1 PDF cartridge');
  assert(pdfResults[0].id === 'pdfcartridge', 'Should find pdfcartridge');

  const metadataResults = server.searchCartridges('metadata');
  assert(metadataResults.length === 1, 'Should find cartridge by cap title');

  // Search must reach into the nightly channel too — channels are not
  // a search-time filter.
  const jsonResults = server.searchCartridges('json');
  assert(jsonResults.length === 1, 'Should reach nightly cartridges');
  assert(jsonResults[0].channel === 'nightly', 'Should report nightly channel');

  const noResults = server.searchCartridges('nonexistent');
  assert(noResults.length === 0, 'Should return empty for no matches');
}

// TEST328: CartridgeRepoServer.getCartridgesByCategory() filters
// cartridges by category across both channels.
function test328_cartridgeRepoServerGetByCategory() {
  const server = new CartridgeRepoServer(sampleRegistry);

  const docCartridges = server.getCartridgesByCategory('document');
  assert(docCartridges.length === 1, 'Should find 1 document cartridge');
  assert(docCartridges[0].id === 'pdfcartridge', 'Should be pdfcartridge');

  const textCartridges = server.getCartridgesByCategory('text');
  assert(textCartridges.length === 1, 'Should find 1 text cartridge');
  assert(textCartridges[0].id === 'txtcartridge', 'Should be txtcartridge');

  const dataCartridges = server.getCartridgesByCategory('data');
  assert(dataCartridges.length === 1, 'Category lookup should reach the nightly channel too');
  assert(dataCartridges[0].channel === 'nightly', 'Should be the nightly entry');
}

// TEST329: CartridgeRepoServer.getCartridgesByCap() parses the input
// URN and matches each declared cap via `conformsTo`. Tag-order
// differences resolve because matching is order-theoretic, not string.
function test329_cartridgeRepoServerGetByCap() {
  const server = new CartridgeRepoServer(sampleRegistry);

  const disbindCap = 'cap:in="media:ext=pdf";disbind;out="media:disbound-page;enc=utf-8;list"';
  const cartridges = server.getCartridgesByCap(disbindCap);

  assert(cartridges.length === 1, 'Should find 1 cartridge with this cap');
  assert(cartridges[0].id === 'pdfcartridge', 'Should be pdfcartridge');

  const metadataCap = 'cap:in="media:ext=pdf";extract-metadata;out="media:enc=utf-8;file-metadata;record"';
  const metadataCartridges = server.getCartridgesByCap(metadataCap);
  assert(metadataCartridges.length === 1, 'Should find metadata cap');
}

// TEST330: CartridgeRepoClient updates its local cache keyed by
// "<channel>:<id>". The cache holds release and nightly entries
// independently — the same id is allowed in both.
function test330_cartridgeRepoClientUpdateCache() {
  const client = new CartridgeRepoClient(3600);
  const server = new CartridgeRepoServer(sampleRegistry);
  const cartridges = server.transformToCartridgeArray().map(p => new CartridgeInfo(p));

  // Cache key is the registry URL the cartridges carry — mismatching
  // it would orphan the entries (the new cache key is
  // <registryUrl>:<channel>:<id>). The sampleRegistry stamps every
  // entry with 'https://test.example/manifest'.
  const REGISTRY_URL = 'https://test.example/manifest';
  client.updateCache(REGISTRY_URL, cartridges);

  const cache = client.caches.get(REGISTRY_URL);
  assert(cache !== undefined, 'Cache should exist');
  assert(cache.cartridges.size === 3, 'Should have 3 cartridges in cache (2 release + 1 nightly)');
  assert(
    cache.cartridges.has(`${REGISTRY_URL}:release:pdfcartridge`),
    'Should key by <registryUrl>:<channel>:<id>'
  );
  assert(
    cache.cartridges.has(`${REGISTRY_URL}:nightly:jsoncartridge`),
    'Should hold nightly entry independently'
  );
  assert(cache.capToCartridges.size > 0, 'Should have cap mappings');
}

// TEST331: CartridgeRepoClient.getSuggestionsForCap() returns cartridge
// suggestions with channel propagated onto each suggestion.
function test331_cartridgeRepoClientGetSuggestions() {
  const client = new CartridgeRepoClient(3600);
  const server = new CartridgeRepoServer(sampleRegistry);
  const cartridges = server.transformToCartridgeArray().map(p => new CartridgeInfo(p));

  client.updateCache('https://example.com/api/cartridges', cartridges);

  const disbindCap = 'cap:in="media:ext=pdf";disbind;out="media:disbound-page;enc=utf-8;list"';
  const suggestions = client.getSuggestionsForCap(disbindCap);

  assert(suggestions.length === 1, 'Should find 1 suggestion');
  assert(suggestions[0].cartridgeId === 'pdfcartridge', 'Should suggest pdfcartridge');
  assert(suggestions[0].channel === 'release', 'Channel must propagate from cache');
  // The returned capUrn is the canonical (normalized) form. Compare via
  // tagged-URN equivalence rather than string equality so a tag-order
  // difference between the request and the canonical form is tolerated.
  const requested = CapUrn.fromString(disbindCap);
  const returned = CapUrn.fromString(suggestions[0].capUrn);
  assert(returned.isEquivalent(requested), 'Should have equivalent cap URN');
  assert(suggestions[0].capTitle === 'Disbind PDF', 'Should have cap title');

  // Nightly cap should also surface a suggestion, with channel set to nightly.
  const prettyCap = 'cap:in="media:json";pretty;out="media:fmt=json"';
  const nightlySuggestions = client.getSuggestionsForCap(prettyCap);
  assert(nightlySuggestions.length === 1, 'Should find nightly cap suggestion');
  assert(nightlySuggestions[0].channel === 'nightly', 'Should report nightly channel');
}

// TEST332: get_cartridge requires a (channel, id) pair and returns the cached entry for known pairs, None otherwise. The same id in the wrong channel must miss.
function test332_cartridgeRepoClientGetCartridge() {
  const client = new CartridgeRepoClient(3600);
  const server = new CartridgeRepoServer(sampleRegistry);
  const cartridges = server.transformToCartridgeArray().map(p => new CartridgeInfo(p));

  const REGISTRY_URL = 'https://test.example/manifest';
  client.updateCache(REGISTRY_URL, cartridges);

  const cartridge = client.getCartridge(REGISTRY_URL, 'release', 'pdfcartridge');
  assert(cartridge !== null && cartridge !== undefined, 'Should find cartridge in release');
  assert(cartridge.id === 'pdfcartridge', 'Should have correct ID');
  assert(cartridge.channel === 'release', 'Should report release channel');
  assert(cartridge.registryUrl === REGISTRY_URL, 'Should report registry URL');

  const json = client.getCartridge(REGISTRY_URL, 'nightly', 'jsoncartridge');
  assert(json !== null && json !== undefined, 'Should find nightly entry');
  assert(json.channel === 'nightly', 'Should report nightly channel');

  const wrongChannel = client.getCartridge(REGISTRY_URL, 'nightly', 'pdfcartridge');
  assert(wrongChannel === undefined || wrongChannel === null,
    'Should miss when looking up release id in nightly channel');

  const notFound = client.getCartridge(REGISTRY_URL, 'release', 'nonexistent');
  assert(notFound === undefined || notFound === null, 'Should miss for unknown id');

  // Two URLs that look similar but differ byte-wise are distinct
  // registries — looking up one cartridge under the other's URL
  // misses, even if id+channel match.
  const wrongRegistry = client.getCartridge(
    'https://other.example/manifest', 'release', 'pdfcartridge'
  );
  assert(wrongRegistry === undefined || wrongRegistry === null,
    'Should miss when looking up under a different registry URL');

  let threw = false;
  try {
    client.getCartridge(REGISTRY_URL, 'staging', 'pdfcartridge');
  } catch (e) {
    threw = true;
  }
  assert(threw, 'Should throw for invalid channel');
}

// TEST333: get_all_available_caps returns the deduplicated set of normalized URNs across cartridges.
function test333_cartridgeRepoClientGetAllCaps() {
  const client = new CartridgeRepoClient(3600);
  const server = new CartridgeRepoServer(sampleRegistry);
  const cartridges = server.transformToCartridgeArray().map(p => new CartridgeInfo(p));

  client.updateCache('https://example.com/api/cartridges', cartridges);

  const caps = client.getAllAvailableCaps();
  assert(Array.isArray(caps), 'Should return array');
  // 2 caps from pdfcartridge + 1 from txtcartridge + 1 from
  // jsoncartridge (nightly) = 4 unique caps.
  assert(caps.length === 4, `Should have 4 unique caps, got ${caps.length}`);
  assert(caps.every(c => typeof c === 'string'), 'All caps should be strings');
}

// TEST334: needs_sync returns true on an empty cache, false right after a successful update.
function test334_cartridgeRepoClientNeedsSync() {
  const client = new CartridgeRepoClient(1); // 1 second TTL
  const server = new CartridgeRepoServer(sampleRegistry);
  const cartridges = server.transformToCartridgeArray().map(p => new CartridgeInfo(p));

  const urls = ['https://example.com/api/cartridges'];

  // Should need sync initially
  assert(client.needsSync(urls) === true, 'Should need sync with empty cache');

  // Update cache
  client.updateCache(urls[0], cartridges);

  // Should not need sync immediately
  assert(client.needsSync(urls) === false, 'Should not need sync right after update');
}

// TEST335: Round-trip: server produces a v5.0 response, client consumes
// it, channel provenance is preserved end-to-end.
function test335_cartridgeRepoServerClientIntegration() {
  // Server creates API response
  const server = new CartridgeRepoServer(sampleRegistry);
  const apiResponse = server.getCartridges();

  // Client consumes API response
  const client = new CartridgeRepoClient(3600);
  const cartridges = apiResponse.cartridges.map(p => new CartridgeInfo(p));
  const REGISTRY_URL = 'https://test.example/manifest';
  client.updateCache(REGISTRY_URL, cartridges);

  // Client can find cartridge by (registryUrl, channel, id)
  const cartridge = client.getCartridge(REGISTRY_URL, 'release', 'pdfcartridge');
  assert(cartridge !== null && cartridge !== undefined, 'Client should find cartridge from server data');
  assert(cartridge.isSigned(), 'Cartridge should be signed');
  assert(cartridge.channel === 'release', 'Should report release channel');
  assert(cartridge.registryUrl === REGISTRY_URL, 'Should report registry URL');
  assert(cartridge.buildForPlatform('darwin-arm64') !== null, 'Cartridge should have darwin-arm64 build');

  // Client can get suggestions
  const capUrn = 'cap:in="media:ext=pdf";disbind;out="media:disbound-page;enc=utf-8;list"';
  const suggestions = client.getSuggestionsForCap(capUrn);
  assert(suggestions.length === 1, 'Should get suggestions');
  assert(suggestions[0].cartridgeId === 'pdfcartridge', 'Should suggest correct cartridge');
  assert(suggestions[0].channel === 'release', 'Suggestion should preserve channel');

  // Server can search
  const searchResults = server.searchCartridges('pdf');
  assert(searchResults.length === 1, 'Server search should work');
  assert(searchResults[0].id === cartridge.id, 'Search and client should agree');
}

// ============================================================================
// Host-compatibility resolution (cartridge_repo.rs: TEST1849-TEST1853)
// ============================================================================

// Construct a cartridge whose versions/platform-builds are fully specified.
// `versions` is given newest-first as [version, [[platform, format, pkgName], ...]];
// `version` (the "latest" field) is set to the first entry. Mirrors the Rust
// test helper cartridge_with_versions.
function cartridgeWithVersions(id, versions) {
  const versionMap = {};
  const available = [];
  for (const [ver, builds] of versions) {
    available.push(ver);
    versionMap[ver] = {
      releaseDate: '2026-02-07',
      changelog: [],
      minAppVersion: '',
      builds: builds.map(([plat, fmt, name]) => ({
        platform: plat,
        packages: [{
          name,
          sha256: 'deadbeef',
          size: 4242,
          url: `https://cartridges.machinefabric.com/${name}`,
          format: fmt,
        }],
      })),
    };
  }
  const latest = versions.length > 0 ? versions[0][0] : '';
  return new CartridgeInfo({
    id,
    name: id,
    version: latest,
    description: '',
    author: '',
    teamId: 'TEAM123',
    signedAt: '2026-02-07T00:00:00Z',
    minAppVersion: '',
    pageUrl: '',
    categories: [],
    tags: [],
    cap_groups: [],
    versions: versionMap,
    availableVersions: available,
    channel: 'release',
    registryUrl: 'https://example.com/cartridges',
  });
}

// TEST1849: latest version has a host build → Compatible, resolving to the latest version and that platform's native-format package.
function test1849_resolveForHostCompatibleLatest() {
  const cartridge = cartridgeWithVersions('c', [
    ['1.2.0', [['darwin-arm64', 'pkg', 'c-1.2.0.pkg'], ['linux-x86_64', 'deb', 'c-1.2.0.deb']]],
    ['1.1.0', [['darwin-arm64', 'pkg', 'c-1.1.0.pkg']]],
  ]);

  const r = cartridge.resolveForHost('linux-x86_64');
  assertEqual(r.status, CompatStatus.COMPATIBLE, 'latest with host build is Compatible');
  assertEqual(r.resolvedVersion, '1.2.0', 'resolves to the latest version');
  assertEqual(r.resolvedPackage.name, 'c-1.2.0.deb', 'resolves to native-format package');
  assertEqual(r.resolvedPackage.format, 'deb', 'package format is deb');
  assert(r.reason === null, 'Compatible carries no reason');
  assertEqual(r.hostPlatform, 'linux-x86_64', 'host platform echoed back');
}

// TEST1850: the latest version lacks a host build but an older version has one → CompatibleOutdated, resolving to the older version with a reason naming both the latest and the resolved version.
function test1850_resolveForHostCompatibleOutdated() {
  const cartridge = cartridgeWithVersions('c', [
    ['1.3.0', [['darwin-arm64', 'pkg', 'c-1.3.0.pkg']]],
    ['1.2.0', [['darwin-arm64', 'pkg', 'c-1.2.0.pkg'], ['linux-x86_64', 'deb', 'c-1.2.0.deb']]],
    ['1.1.0', [['linux-x86_64', 'deb', 'c-1.1.0.deb']]],
  ]);

  const r = cartridge.resolveForHost('linux-x86_64');
  assertEqual(r.status, CompatStatus.COMPATIBLE_OUTDATED, 'latest lacks host build → CompatibleOutdated');
  assertEqual(r.resolvedVersion, '1.2.0', 'newest-with-host-build is 1.2.0, not oldest 1.1.0');
  assertEqual(r.resolvedPackage.name, 'c-1.2.0.deb', 'resolves to 1.2.0 deb package');
  assert(r.reason !== null, 'outdated carries a reason');
  assert(r.reason.includes('1.3.0'), `reason names the latest: ${r.reason}`);
  assert(r.reason.includes('1.2.0'), `reason names the resolved: ${r.reason}`);
}

// TEST1851: no version ships a host build → Incompatible, no resolved version/package, reason states the host platform.
function test1851_resolveForHostIncompatible() {
  const cartridge = cartridgeWithVersions('c', [
    ['1.2.0', [['darwin-arm64', 'pkg', 'c-1.2.0.pkg']]],
    ['1.1.0', [['darwin-arm64', 'pkg', 'c-1.1.0.pkg']]],
  ]);

  const r = cartridge.resolveForHost('windows-x86_64');
  assertEqual(r.status, CompatStatus.INCOMPATIBLE, 'no host build → Incompatible');
  assert(r.resolvedVersion === null, 'no resolved version when Incompatible');
  assert(r.resolvedPackage === null, 'no resolved package when Incompatible');
  assert(r.reason.includes('windows-x86_64'), `reason names the host platform: ${r.reason}`);
}

// TEST1852: a host build whose packages[] is empty AND has no legacy `package` ships no installer; resolution must SKIP it (not resolve to an un-downloadable version) and fall through to an older usable version.
function test1852_resolveForHostSkipsBuildWithNoInstaller() {
  const cartridge = cartridgeWithVersions('c', [
    ['2.0.0', [['linux-x86_64', 'deb', 'c-2.0.0.deb']]],
    ['1.0.0', [['linux-x86_64', 'deb', 'c-1.0.0.deb']]],
  ]);
  // Make 2.0.0's linux build ship nothing installable.
  const v2 = cartridge.versions['2.0.0'];
  v2.builds[0].packages = [];
  delete v2.builds[0].package;

  const r = cartridge.resolveForHost('linux-x86_64');
  // 2.0.0 is skipped (no installer); newest USABLE host build is 1.0.0.
  assertEqual(r.status, CompatStatus.COMPATIBLE_OUTDATED, '2.0.0 skipped → CompatibleOutdated to 1.0.0');
  assertEqual(r.resolvedVersion, '1.0.0', 'resolves to the older usable version');
  assertEqual(r.resolvedPackage.name, 'c-1.0.0.deb', 'resolves to 1.0.0 deb package');
}

// TEST1853: host_platform() returns a normalized {os}-{arch} string with arch aarch64 mapped to arm64 — the exact form the registry uses.
function test1853_hostPlatformNormalizedForm() {
  const p = hostPlatform();
  const dash = p.indexOf('-');
  assert(dash > 0, `host_platform must be os-arch, got ${p}`);
  const os = p.slice(0, dash);
  const arch = p.slice(dash + 1);
  assert((os === 'darwin' || os === 'linux' || os === 'windows') || os.length > 0, `os segment present: ${os}`);
  // The registry never uses the raw "aarch64"; it must be normalized.
  assert(arch !== 'aarch64', 'arch must be normalized to arm64');
}

// ============================================================================
// Build-env registry identity (manifest.rs: TEST1872-TEST1874)
// ============================================================================

// TEST1872: a non-empty MFR_CARTRIDGE_REGISTRY_URL passes through verbatim —
// a published build reports exactly the URL it was compiled with.
function test1872_registryUrlFromBuildEnvPassesThroughNonempty() {
  const url = 'https://cartridges.machinefabric.com/manifest';
  assertEqual(registryUrlFromBuildEnv(url), url, 'non-empty URL passes through verbatim');
}

// TEST1873: an unset env (null/undefined) yields null — a dev build has no
// baked registry and loads only `dev/` cartridges.
function test1873_registryUrlFromBuildEnvNoneForDev() {
  assert(registryUrlFromBuildEnv(null) === null, 'null env → null (dev build)');
  assert(registryUrlFromBuildEnv(undefined) === null, 'absent env → null (dev build)');
}

// TEST1874: an exported-but-empty env (`Some("")`) is neither a dev build nor a valid identity and MUST fail hard at compile time, so the build can never silently hash the empty string into a fake registry slug. We assert the panic rather than letting a bogus empty primary registry ship.
function test1874_registryUrlFromBuildEnvRejectsEmptyString() {
  let threw = false;
  try {
    registryUrlFromBuildEnv('');
  } catch (e) {
    threw = true;
    assert(e.message.includes('MFR_CARTRIDGE_REGISTRY_URL must be unset'), `panic message names the variable: ${e.message}`);
  }
  assert(threw, 'empty string must fail hard');
}

// ============================================================================
// Cartridge discovery (cartridge_discovery.rs: TEST1875-TEST1878)
// ============================================================================

// Lay down `{root}/{slug}/{channel}/{name}/{version}/`. When `cartridgeJson`
// is provided, also write it plus an executable `entry` binary so readFromDir
// accepts the directory and discovery reaches its own identity checks. Mirrors
// the Rust test helper install_fixture.
function discoveryInstallFixture(root, slug, channelFolder, name, version, cartridgeJson, entry) {
  // {slug}/v1/{channel}/{name}/{version} — the version level pins to the host
  // registry version (the tests construct identities at cartridgeRegistryVersion 1).
  const dir = path.join(root, slug, 'v1', channelFolder, name, version);
  fs.mkdirSync(dir, { recursive: true });
  if (cartridgeJson !== null && cartridgeJson !== undefined) {
    fs.writeFileSync(path.join(dir, 'cartridge.json'), cartridgeJson);
    const entryPath = path.join(dir, entry);
    fs.writeFileSync(entryPath, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(entryPath, 0o755);
  }
}

function discoveryDevCartridgeJson(channel, fabricManifestVersion) {
  return JSON.stringify({
    name: 'cart', version: '1.0.0', channel, registry_url: null, entry: 'cart',
    installed_at: '2024-01-01T00:00:00Z', fabric_manifest_version: fabricManifestVersion,
  });
}

function discoveryRegistryCartridgeJson(url, channel, fmv) {
  return JSON.stringify({
    name: 'cart', version: '1.0.0', channel, registry_url: url, entry: 'cart',
    installed_at: '2024-01-01T00:00:00Z', fabric_manifest_version: fmv,
  });
}

function discoveryMakeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'capdag-disc-'));
}

function discoveryRemoveRoot(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
}

function discoveryExpectIncompatible(out, kind) {
  assertEqual(out.length, 1, 'expected exactly one discovered entry');
  assertEqual(out[0].kind, 'incompatible', 'entry must be incompatible');
  assertEqual(out[0].error.kind, kind, `wrong attachment-error kind: ${out[0].error.message}`);
}

// TEST1875: scan-all — a registry slug folder AND the dev slot present on disk
// are BOTH scanned, regardless of the host's own baked registry. Both fixtures
// lack a real bifaci binary, so both end at HandshakeFailed — proving discovery
// REACHED them (was not filtered out by a registry pin). A registry-pin
// rejection would instead surface BadInstallation and never probe.
async function test1875_scanAllReachesBothDevAndRegistrySlugs() {
  const root = discoveryMakeTempRoot();
  try {
    const url = 'https://cartridges.example.com/manifest';
    const rslug = slugForSync(url);
    // Host baked for a DIFFERENT registry than the on-disk registry cartridge.
    const host = new DiscoveryIdentity({ channel: 'nightly', registryUrl: 'https://other.example.com/manifest', fabricManifestVersion: 1, cartridgeRegistryVersion: 1 });
    discoveryInstallFixture(root, 'dev', 'nightly', 'devcart', '1.0.0', discoveryDevCartridgeJson('nightly', 1), 'cart');
    discoveryInstallFixture(root, rslug, 'nightly', 'regcart', '1.0.0', discoveryRegistryCartridgeJson(url, 'nightly', 1), 'cart');
    const out = await discoverCartridges(root, host);
    assertEqual(out.length, 2, `both slugs must be scanned, got ${out.length}`);
    for (const c of out) {
      assertEqual(c.kind, 'incompatible', 'both reach the probe stage');
      assertEqual(c.error.kind, CartridgeAttachmentErrorKind.HANDSHAKE_FAILED,
        `both reached the probe (not registry-pin-rejected): ${c.error.message}`);
    }
  } finally {
    discoveryRemoveRoot(root);
  }
}

// TEST1876: only the host's channel subtree is scanned. A cartridge under a
// slug's `release/` folder is invisible to a nightly host even though the slug
// folder is present (its `nightly/` subtree is absent).
async function test1876_otherChannelSubtreeIsSkipped() {
  const root = discoveryMakeTempRoot();
  try {
    const url = 'https://cartridges.example.com/manifest';
    const rslug = slugForSync(url);
    discoveryInstallFixture(root, rslug, 'release', 'regcart', '1.0.0', discoveryRegistryCartridgeJson(url, 'release', 1), 'cart');
    const out = await discoverCartridges(root, new DiscoveryIdentity({ channel: 'nightly', registryUrl: null, fabricManifestVersion: 1, cartridgeRegistryVersion: 1 }));
    assertEqual(out.length, 0, 'a release-only slug must be invisible to a nightly host');
  } finally {
    discoveryRemoveRoot(root);
  }
}

// TEST1877: a registry cartridge hand-copied under the WRONG registry slug
// folder fails the three-place rule (BadInstallation) — scan-all does not mean
// "accept anywhere"; placement must still be self-consistent.
async function test1877_registryCartridgeUnderWrongSlugIsBadInstall() {
  const root = discoveryMakeTempRoot();
  try {
    const url = 'https://cartridges.example.com/manifest';
    const wrongSlug = slugForSync('https://somewhere-else.example.com/manifest');
    const json = discoveryRegistryCartridgeJson(url, 'nightly', 1);
    discoveryInstallFixture(root, wrongSlug, 'nightly', 'cart', '1.0.0', json, 'cart');
    const out = await discoverCartridges(root, new DiscoveryIdentity({ channel: 'nightly', registryUrl: null, fabricManifestVersion: 1, cartridgeRegistryVersion: 1 }));
    discoveryExpectIncompatible(out, CartridgeAttachmentErrorKind.MISPLACED);
  } finally {
    discoveryRemoveRoot(root);
  }
}

// TEST1878: a cartridge marked `installed_from: bundle` with no baked hash in
// BUNDLED_CARTRIDGE_HASHES (empty in this mirror) is rejected as BadInstallation
// — the bundled-integrity gate fires before the probe. Non-macOS only: on macOS
// the baked-hash path is intentionally absent (OS code-signature is the guard),
// so a bundled cartridge is accepted there and would instead end at the probe.
async function test1878_bundledCartridgeWithoutBakedHashIsRejected() {
  if (process.platform === 'darwin') {
    // Mirrors the Rust #[cfg(not(target_os = "macos"))] gate: on macOS the
    // baked-hash path does not exist, so this scenario is not exercised.
    return;
  }
  const root = discoveryMakeTempRoot();
  try {
    // Dev slug (null registry) but installed_from=bundle — placement is
    // self-consistent (null→dev), so it passes readFromDir and reaches the
    // bundled-hash gate, which has no baked entry → BadInstallation.
    const json = JSON.stringify({
      name: 'cart', version: '1.0.0', channel: 'nightly', registry_url: null, entry: 'cart',
      installed_at: '2024-01-01T00:00:00Z', installed_from: 'bundle', fabric_manifest_version: 1,
    });
    discoveryInstallFixture(root, 'dev', 'nightly', 'cart', '1.0.0', json, 'cart');
    const out = await discoverCartridges(root, new DiscoveryIdentity({ channel: 'nightly', registryUrl: null, fabricManifestVersion: 1, cartridgeRegistryVersion: 1 }));
    discoveryExpectIncompatible(out, CartridgeAttachmentErrorKind.MISPLACED);
    assert(out[0].error.message.includes('bundled cartridge integrity'),
      `message should name the bundled-integrity failure: ${out[0].error.message}`);
  } finally {
    discoveryRemoveRoot(root);
  }
}

// ============================================================================
// media_urn.rs: TEST1294-TEST1302 (MediaUrn predicates)
// ============================================================================

// TEST546: is_image returns true only when image marker tag is present
function test546_isImage() {
  assert(MediaUrn.fromString(MEDIA_PNG).isImage(), 'MEDIA_PNG should be image');
  assert(MediaUrn.fromString('media:ext=png;image;thumbnail').isImage(), 'media:ext=png;image;thumbnail should be image');
  assert(MediaUrn.fromString('media:ext=jpg;image').isImage(), 'media:ext=jpg;image should be image');
  // Non-image types
  assert(!MediaUrn.fromString(MEDIA_PDF).isImage(), 'MEDIA_PDF should not be image');
  assert(!MediaUrn.fromString(MEDIA_STRING).isImage(), 'MEDIA_STRING should not be image');
  assert(!MediaUrn.fromString(MEDIA_AUDIO).isImage(), 'MEDIA_AUDIO should not be image');
  assert(!MediaUrn.fromString(MEDIA_VIDEO).isImage(), 'MEDIA_VIDEO should not be image');
}

// TEST547: is_audio returns true only when audio marker tag is present
function test547_isAudio() {
  assert(MediaUrn.fromString(MEDIA_AUDIO).isAudio(), 'MEDIA_AUDIO should be audio');
  assert(MediaUrn.fromString(MEDIA_AUDIO_SPEECH).isAudio(), 'MEDIA_AUDIO_SPEECH should be audio');
  assert(MediaUrn.fromString('media:audio;ext=mp3').isAudio(), 'media:audio;ext=mp3 should be audio');
  // Non-audio types
  assert(!MediaUrn.fromString(MEDIA_VIDEO).isAudio(), 'MEDIA_VIDEO should not be audio');
  assert(!MediaUrn.fromString(MEDIA_PNG).isAudio(), 'MEDIA_PNG should not be audio');
  assert(!MediaUrn.fromString(MEDIA_STRING).isAudio(), 'MEDIA_STRING should not be audio');
}

// TEST548: is_video returns true only when video marker tag is present
function test548_isVideo() {
  assert(MediaUrn.fromString(MEDIA_VIDEO).isVideo(), 'MEDIA_VIDEO should be video');
  assert(MediaUrn.fromString('media:ext=mp4;video').isVideo(), 'media:ext=mp4;video should be video');
  // Non-video types
  assert(!MediaUrn.fromString(MEDIA_AUDIO).isVideo(), 'MEDIA_AUDIO should not be video');
  assert(!MediaUrn.fromString(MEDIA_PNG).isVideo(), 'MEDIA_PNG should not be video');
  assert(!MediaUrn.fromString(MEDIA_STRING).isVideo(), 'MEDIA_STRING should not be video');
}

// TEST549: is_numeric returns true only when numeric marker tag is present
function test549_isNumeric() {
  assert(MediaUrn.fromString(MEDIA_INTEGER).isNumeric(), 'MEDIA_INTEGER should be numeric');
  assert(MediaUrn.fromString(MEDIA_NUMBER).isNumeric(), 'MEDIA_NUMBER should be numeric');
  assert(MediaUrn.fromString(MEDIA_INTEGER_LIST).isNumeric(), 'MEDIA_INTEGER_LIST should be numeric');
  assert(MediaUrn.fromString(MEDIA_NUMBER_LIST).isNumeric(), 'MEDIA_NUMBER_LIST should be numeric');
  // Non-numeric types
  assert(!MediaUrn.fromString(MEDIA_STRING).isNumeric(), 'MEDIA_STRING should not be numeric');
  assert(!MediaUrn.fromString(MEDIA_BOOLEAN).isNumeric(), 'MEDIA_BOOLEAN should not be numeric');
  assert(!MediaUrn.fromString(MEDIA_IDENTITY).isNumeric(), 'MEDIA_IDENTITY should not be numeric');
}

// TEST550: is_bool returns true only when bool marker tag is present
function test550_isBool() {
  assert(MediaUrn.fromString(MEDIA_BOOLEAN).isBool(), 'MEDIA_BOOLEAN should be bool');
  assert(MediaUrn.fromString(MEDIA_BOOLEAN_LIST).isBool(), 'MEDIA_BOOLEAN_LIST should be bool');
  // MEDIA_DECISION is now a JSON record type (not bool)
  assert(!MediaUrn.fromString(MEDIA_DECISION).isBool(), 'MEDIA_DECISION should not be bool (it is a JSON record now)');
  // Non-bool types
  assert(!MediaUrn.fromString(MEDIA_STRING).isBool(), 'MEDIA_STRING should not be bool');
  assert(!MediaUrn.fromString(MEDIA_INTEGER).isBool(), 'MEDIA_INTEGER should not be bool');
  assert(!MediaUrn.fromString(MEDIA_IDENTITY).isBool(), 'MEDIA_IDENTITY should not be bool');
}

// TEST551: is_file_path returns true for the single file-path media URN, false for everything else. There is no "array" variant — cardinality is carried by is_sequence on the wire, not by URN tags.
function test551_isFilePath() {
  assert(MediaUrn.fromString(MEDIA_FILE_PATH).isFilePath(), 'MEDIA_FILE_PATH should be file-path');
  assert(!MediaUrn.fromString(MEDIA_STRING).isFilePath(), 'MEDIA_STRING should not be file-path');
  assert(!MediaUrn.fromString(MEDIA_IDENTITY).isFilePath(), 'MEDIA_IDENTITY should not be file-path');
}

// TEST553: is_live_feed returns true for every URN carrying the `live` marker tag (the reference-media family the runtime resolves via providers), false for everything else — including content URNs a feed delivers.
function test553_isLiveFeed() {
  assert(MediaUrn.fromString('media:live').isLiveFeed(), 'media:live should be live-feed');
  assert(MediaUrn.fromString('media:live;synthetic').isLiveFeed(), 'media:live;synthetic should be live-feed');
  assert(MediaUrn.fromString('media:audio;live;microphone').isLiveFeed(), 'microphone URN should be live-feed');
  assert(!MediaUrn.fromString(MEDIA_STRING).isLiveFeed(), 'MEDIA_STRING should not be live-feed');
  assert(!MediaUrn.fromString(MEDIA_FILE_PATH).isLiveFeed(), 'MEDIA_FILE_PATH should not be live-feed');
  assert(!MediaUrn.fromString('media:audio;pcm').isLiveFeed(), 'feed CONTENT urns should not be live-feed');
}

// Mirror-specific coverage: isCollection returns true when collection marker tag is present
// Mirror-specific coverage: N/A for JS (MEDIA_COLLECTION constants removed - no longer exists)
function test6272_isCollection() {
  // Skip - collection types removed from capdag
}

// TEST555: N/A for JS (with_tag/without_tag on MediaUrn - JS MediaUrn does not have these methods)

// TEST556: N/A for JS (image_media_urn_for_ext helper not in JS)

// TEST557: N/A for JS (audio_media_urn_for_ext helper not in JS)

// TEST558: predicates are consistent with constants — every constant triggers exactly the expected predicates
function test558_predicateConstantConsistency() {
  // MEDIA_INTEGER must be numeric, scalar, NOT enc-bearing/bool/image/list.
  // Integers carry no enc= (a number is not a character-encoded string).
  const intUrn = MediaUrn.fromString(MEDIA_INTEGER);
  assert(intUrn.isNumeric(), 'MEDIA_INTEGER must be numeric');
  assert(intUrn.getTag('enc') === undefined, 'MEDIA_INTEGER must not carry enc');
  assert(intUrn.isScalar(), 'MEDIA_INTEGER must be scalar');
  assert(!intUrn.isBool(), 'MEDIA_INTEGER must not be bool');
  assert(!intUrn.isImage(), 'MEDIA_INTEGER must not be image');
  assert(!intUrn.isList(), 'MEDIA_INTEGER must not be list');

  // MEDIA_BOOLEAN must be bool, enc-bearing, scalar, NOT numeric
  const boolUrn = MediaUrn.fromString(MEDIA_BOOLEAN);
  assert(boolUrn.isBool(), 'MEDIA_BOOLEAN must be bool');
  assert(boolUrn.getTag('enc') === 'utf-8', 'MEDIA_BOOLEAN must carry enc=utf-8');
  assert(boolUrn.isScalar(), 'MEDIA_BOOLEAN must be scalar');
  assert(!boolUrn.isNumeric(), 'MEDIA_BOOLEAN must not be numeric');

  // MEDIA_JSON must be json, record, scalar, NOT list — and carries no enc
  // (fmt= is the content-format axis, orthogonal to enc=).
  const jsonUrn = MediaUrn.fromString(MEDIA_JSON);
  assert(jsonUrn.isJson(), 'MEDIA_JSON must be json');
  assert(jsonUrn.getTag('enc') === undefined, 'MEDIA_JSON must not carry enc');
  assert(jsonUrn.isRecord(), 'MEDIA_JSON must be record');
  assert(jsonUrn.isScalar(), 'MEDIA_JSON must be scalar (no list marker)');
  assert(!jsonUrn.isList(), 'MEDIA_JSON must not be list');

  // MEDIA_VOID is void, NOT numeric, and carries no enc tag
  const voidUrn = MediaUrn.fromString(MEDIA_VOID);
  assert(voidUrn.isVoid(), 'MEDIA_VOID must be void');
  assert(voidUrn.getTag('enc') === undefined, 'MEDIA_VOID must not carry enc');
  assert(!voidUrn.isNumeric(), 'MEDIA_VOID must not be numeric');
}

// ============================================================================
// cap_urn.rs: TEST1303-TEST1307 (CapUrn tier tests)
// ============================================================================

// TEST559: without_tag removes tag, rejects structural keys, case-insensitive for keys
function test559_withoutTag() {
  const cap = CapUrn.fromString('cap:in="media:void";test;ext=pdf;out="media:void"');
  const removed = cap.withoutTag('ext');
  assertEqual(removed.getTag('ext'), undefined, 'withoutTag should remove ext');
  assert(removed.hasMarkerTag('test'), 'withoutTag should preserve op');

  // Case-insensitive removal
  const removed2 = cap.withoutTag('EXT');
  assertEqual(removed2.getTag('ext'), undefined, 'withoutTag should be case-insensitive');

  assertThrows(() => cap.withoutTag('in'), ErrorCodes.INVALID_TAG_FORMAT, 'withoutTag must reject in');
  assertThrows(() => cap.withoutTag('out'), ErrorCodes.INVALID_TAG_FORMAT, 'withoutTag must reject out');
  assertThrows(() => cap.withoutTag('effect'), ErrorCodes.INVALID_TAG_FORMAT, 'withoutTag must reject effect');

  // Removing non-existent tag is no-op
  const same3 = cap.withoutTag('nonexistent');
  assert(same3.equals(cap), 'Removing non-existent tag is no-op');
}

// TEST560: with_in_spec and with_out_spec change direction specs
function test560_withInOutSpec() {
  const cap = CapUrn.fromString('cap:in="media:void";test;out="media:void"');

  const changedIn = cap.withInSpec('media:');
  assertEqual(changedIn.getInSpec(), 'media:', 'withInSpec should change inSpec');
  assertEqual(changedIn.getOutSpec(), 'media:void', 'withInSpec should preserve outSpec');
  assert(changedIn.hasMarkerTag('test'), 'withInSpec should preserve tags');

  const changedOut = cap.withOutSpec('media:string');
  assertEqual(changedOut.getInSpec(), 'media:void', 'withOutSpec should preserve inSpec');
  assertEqual(changedOut.getOutSpec(), 'media:string', 'withOutSpec should change outSpec');

  // Chain both
  const changedBoth = cap.withInSpec('media:ext=pdf').withOutSpec(MEDIA_TXT);
  assertEqual(changedBoth.getInSpec(), 'media:ext=pdf', 'Chain should set inSpec');
  assertEqual(changedBoth.getOutSpec(), 'media:enc=utf-8;ext=txt', 'Chain should set outSpec');

  const identity = CapUrn.fromString('cap:effect=none');
  assertThrows(
    () => identity.withOutSpec('media:ext=pdf'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'withOutSpec must revalidate admissibility'
  );
}

// TEST561: N/A for JS (in_media_urn/out_media_urn not in JS CapUrn)

// TEST562: N/A for JS (canonical_option not in JS CapUrn)

// TEST563: CapMatcher::find_all_matches returns all matching caps sorted by specificity
function test563_findAllMatches() {
  const caps = [
    CapUrn.fromString('cap:in="media:void";test;out="media:void"'),
    CapUrn.fromString('cap:in="media:void";test;ext=pdf;out="media:void"'),
    CapUrn.fromString('cap:in="media:void";different;out="media:void"'),
  ];

  const request = CapUrn.fromString('cap:in="media:void";test;out="media:void"');
  const matches = CapMatcher.findAllMatches(caps, request);

  // Should find 2 matches (test and test;ext=pdf), not different
  assertEqual(matches.length, 2, 'Should find 2 matches');
  // Sorted by specificity descending: ext=pdf first (more specific)
  assert(matches[0].specificity() >= matches[1].specificity(), 'First match should be more specific');
  assertEqual(matches[0].getTag('ext'), 'pdf', 'Most specific match should have ext=pdf');
}

// TEST564: CapMatcher::are_compatible detects bidirectional overlap
function test564_areCompatible() {
  const caps1 = [
    CapUrn.fromString('cap:in="media:void";test;out="media:void"'),
  ];
  const caps2 = [
    CapUrn.fromString('cap:in="media:void";test;ext=pdf;out="media:void"'),
  ];
  const caps3 = [
    CapUrn.fromString('cap:in="media:void";different;out="media:void"'),
  ];

  // caps1 (test) accepts caps2 (test;ext=pdf) -> compatible
  assert(CapMatcher.areCompatible(caps1, caps2), 'caps1 and caps2 should be compatible');

  // caps1 (test) vs caps3 (different) -> not compatible
  assert(!CapMatcher.areCompatible(caps1, caps3), 'caps1 and caps3 should not be compatible');

  // Empty sets are not compatible
  assert(!CapMatcher.areCompatible([], caps1), 'Empty vs non-empty should not be compatible');
  assert(!CapMatcher.areCompatible(caps1, []), 'Non-empty vs empty should not be compatible');
}

// TEST565: N/A for JS (tags_to_string not in JS CapUrn)

// TEST566: with_tag rejects structural keys
function test566_withTagRejectsStructuralKeys() {
  const cap = CapUrn.fromString('cap:in="media:void";test;out="media:void"');
  assertThrows(() => cap.withTag('in', 'media:'), ErrorCodes.INVALID_TAG_FORMAT, 'withTag must reject in');
  assertThrows(() => cap.withTag('out', 'media:'), ErrorCodes.INVALID_TAG_FORMAT, 'withTag must reject out');
  assertThrows(() => cap.withTag('effect', 'none'), ErrorCodes.INVALID_TAG_FORMAT, 'withTag must reject effect');
}

// TEST6544: builder rejects structural keys on tag/marker
function test6544_builderRejectsStructuralKeys() {
  assertThrows(
    () => new CapUrnBuilder().tag('in', 'media:void'),
    ErrorCodes.INVALID_TAG_FORMAT,
    'builder.tag must reject structural in'
  );
  assertThrows(
    () => new CapUrnBuilder().marker('effect'),
    ErrorCodes.INVALID_TAG_FORMAT,
    'builder.marker must reject structural effect'
  );
  assertThrows(
    () => new CapUrnBuilder().inSpec('media:void').outSpec('media:record').tag('123', 'value').build(),
    ErrorCodes.NUMERIC_KEY,
    'builder.build must reject invalid non-structural tags'
  );
}

// TEST1294: RULE11 - void-input cap with stdin source rejected
function test1294_rule11VoidInputWithStdinRejected() {
  const urn = CapUrn.fromString('cap:in="media:void";test;out="media:string"');
  const cap = new Cap(urn, 'Test', ['test-cmd']);
  const stdinSource = ArgSource.fromJSON({ stdin: 'media:string' });
  cap.args = [new CapArg('media:string', true, [stdinSource])];
  try {
    validateCapArgs(cap);
    assert(false, 'Should have thrown RULE11 for void input with stdin');
  } catch (e) {
    assert(e instanceof ValidationError, 'Should be ValidationError');
    assert(e.message.includes('RULE11'), 'Should mention RULE11: ' + e.message);
  }
}

// TEST1295: RULE11 - non-void-input cap without stdin source rejected
function test1295_rule11NonVoidInputWithoutStdinRejected() {
  const urn = CapUrn.fromString('cap:in="media:string";test;out="media:string"');
  const cap = new Cap(urn, 'Test', ['test-cmd']);
  const posSource = ArgSource.fromJSON({ cli_flag: '--name' });
  cap.args = [new CapArg('media:string', true, [posSource])];
  try {
    validateCapArgs(cap);
    assert(false, 'Should have thrown RULE11 for non-void input without stdin');
  } catch (e) {
    assert(e instanceof ValidationError, 'Should be ValidationError');
    assert(e.message.includes('RULE11'), 'Should mention RULE11: ' + e.message);
  }
}

// TEST1296: RULE11 - void-input cap with only cli_flag sources passes
function test1296_rule11VoidInputCliFlagOnly() {
  const urn = CapUrn.fromString('cap:in="media:void";test;out="media:string"');
  const cap = new Cap(urn, 'Test', ['test-cmd']);
  const flagSource = ArgSource.fromJSON({ cli_flag: '--name' });
  cap.args = [new CapArg('media:string', true, [flagSource])];
  // Should not throw
  validateCapArgs(cap);
}

// TEST1953: RULE14 — `streaming: true` is accepted on the main input (the
// stdin arg equivalent to `in=`), survives the JSON round-trip, and is refused
// on any other argument: a side option has no wire stream, so it has nothing
// to consume incrementally, and the rule keeps the executor's hop rule
// one-dimensional.
function test1953_rule14StreamingOnlyOnMainInput() {
  const urn = CapUrn.fromString('cap:in="media:string";test;out="media:string"');
  const ok = new Cap(urn, 'Test', ['test-cmd']);
  const main = new CapArg('media:string', true, [ArgSource.fromJSON({ stdin: 'media:string' })], { streaming: true });
  ok.args = [main];
  validateCapArgs(ok);
  assert(CapArg.fromJSON(main.toJSON()).streaming === true, 'streaming survives the JSON round-trip');
  assert(!('streaming' in new CapArg('media:string', true, []).toJSON()), 'streaming is omitted when false, like is_sequence');

  const bad = new Cap(CapUrn.fromString('cap:in="media:string";test;out="media:string"'), 'Test', ['test-cmd']);
  bad.args = [
    new CapArg('media:string', true, [ArgSource.fromJSON({ stdin: 'media:string' })]),
    new CapArg('media:integer;numeric', false, [ArgSource.fromJSON({ cli_flag: '--count' })], { streaming: true }),
  ];
  try {
    validateCapArgs(bad);
    assert(false, 'Should have thrown RULE14 for a streaming side option');
  } catch (e) {
    assert(e instanceof ValidationError, 'Should be ValidationError');
    assert(e.message.includes('RULE14'), 'Should mention RULE14: ' + e.message);
    assert(e.message.includes('media:integer;numeric'), 'Should name the offending arg: ' + e.message);
  }
}

// TEST1964: a definition field this capdag does not know is a NEWER fabric,
// not noise — parsing refuses it, naming the key, for arguments and outputs
// alike. The field being dropped is how a cartridge built on an older capdag
// once advertised a `streaming` input as bounded.
function test1964_unknownDefinitionFieldIsRefused() {
  let threw = null;
  try {
    CapArg.fromJSON({ media_urn: 'media:string', required: true, sources: [{ stdin: 'media:string' }], chunking: 'adaptive' });
  } catch (e) { threw = e; }
  assert(threw !== null && threw.message.includes('chunking'), 'an unknown arg field must be refused by name: ' + (threw && threw.message));
  assert(CapArg.fromJSON({ media_urn: 'media:string', required: true, sources: [{ stdin: 'media:string' }], streaming: true }).streaming === true);

  const capJson = new Cap(CapUrn.fromString('cap:in="media:string";test;out="media:string"'), 'Test', ['test-cmd']).toJSON();
  capJson.output = { media_urn: 'media:string', output_description: 'x', windowed: true };
  threw = null;
  try { Cap.fromJSON(capJson); } catch (e) { threw = e; }
  assert(threw !== null && threw.message.includes('windowed'), 'an unknown output field must be refused by name: ' + (threw && threw.message));
}

// TEST1297: RULE11 - non-void-input cap with stdin source passes
function test1297_rule11NonVoidInputWithStdin() {
  const urn = CapUrn.fromString('cap:in="media:string";test;out="media:string"');
  const cap = new Cap(urn, 'Test', ['test-cmd']);
  const stdinSource = ArgSource.fromJSON({ stdin: 'media:string' });
  cap.args = [new CapArg('media:string', true, [stdinSource])];
  // Should not throw
  validateCapArgs(cap);
}

// TEST567: N/A for JS (conforms_to_str/accepts_str not in JS CapUrn)

// ============================================================================
// cap_urn.rs: TEST639-TEST653 (Cap URN wildcard tests)
// ============================================================================

// TEST6201: cap: (empty) is the illegal bare top form
function test6201_emptyCapIsIllegal() {
  assertThrows(
    () => CapUrn.fromString('cap:'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'Empty cap must be rejected as inadmissible'
  );
}

// TEST640: cap:in defaults to the same illegal bare top form
function test640_inOnlyIsIllegal() {
  assertThrows(
    () => CapUrn.fromString('cap:in'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'Bare in must be rejected as inadmissible'
  );
}

// TEST641: cap:out defaults to the same illegal bare top form
function test641_outOnlyIsIllegal() {
  assertThrows(
    () => CapUrn.fromString('cap:out'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'Bare out must be rejected as inadmissible'
  );
}

// TEST642: cap:in;out becomes the same illegal bare top form
function test642_inOutWithoutValuesAreIllegal() {
  assertThrows(
    () => CapUrn.fromString('cap:in;out'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'Bare in/out must be rejected as inadmissible'
  );
}

// TEST643: cap:in=*;out=* is the same illegal bare top form
function test643_explicitAsteriskIsIllegal() {
  assertThrows(
    () => CapUrn.fromString('cap:in=*;out=*'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'Explicit wildcard top-to-top must be rejected as inadmissible'
  );
}

// TEST644: cap:in=media:;out=* is the same illegal bare top form
function test644_specificInWildcardOutIsIllegal() {
  assertThrows(
    () => CapUrn.fromString('cap:in=media:;out=*'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'Top-to-top declared form must be rejected as inadmissible'
  );
}

// TEST645: cap:in=*;out=media:text has wildcard in, specific out
function test645_wildcardInSpecificOut() {
  const cap = CapUrn.fromString('cap:in=*;out=media:text');
  assertEqual(cap.getInSpec(), 'media:', 'Wildcard in should normalize to media:');
  assertEqual(cap.getOutSpec(), 'media:text', 'Should have specific out');
}

// TEST646: cap:in=foo fails (invalid media URN)
function test646_invalidInSpecFails() {
  assertThrows(
    () => CapUrn.fromString('cap:in=foo;out=media:'),
    ErrorCodes.INVALID_IN_SPEC,
    'Invalid in spec should fail hard'
  );
}

// TEST647: cap:in=media:;out=bar fails (invalid media URN)
function test647_invalidOutSpecFails() {
  assertThrows(
    () => CapUrn.fromString('cap:in=media:;out=bar'),
    ErrorCodes.INVALID_OUT_SPEC,
    'Invalid out spec should fail hard'
  );
}

// TEST648: Wildcard in/out match specific caps
function test648_wildcardAcceptsSpecific() {
  const wildcard = CapUrn.fromString('cap:in=*;out=*;raw');
  const specific = CapUrn.fromString('cap:in="media:";out="media:text";raw');

  // `media:` output promises no particular output: the generic handler does not
  // promise text; the text handler satisfies a request asking for none.
  assert(!wildcard.accepts(specific), 'a media:-output handler does not promise text out');
  assert(specific.accepts(wildcard), 'a text-producing handler satisfies a request asking for no particular output');
  const specificIn = CapUrn.fromString('cap:in="media:text";out=*;raw');
  assert(wildcard.accepts(specificIn), 'a handler taking any input accepts a request that sends text');
  assert(specificIn.conformsTo(wildcard), 'the text-sending request conforms to the generic handler');
}

// TEST649: Specificity - wildcard has 0, specific has tag count
function test649_specificityScoring() {
  const wildcard = CapUrn.fromString('cap:in=*;out=*;raw');
  const specific = CapUrn.fromString('cap:in="media:";out="media:text";raw');

  assertEqual(wildcard.specificity(), 2, 'Marker-only wildcard cap should have y-axis specificity only');
  assert(specific.specificity() > 0, 'Specific cap should have non-zero specificity');
}

// TEST650: cap:in=media:;out=media:;test preserves other tags
function test650_wildcardPreserveOtherTags() {
  const cap = CapUrn.fromString('cap:in=media:;out=media:;test');
  assertEqual(cap.getInSpec(), 'media:', 'in spec should remain media:');
  assertEqual(cap.getOutSpec(), 'media:', 'out spec should remain media:');
  assertEqual(cap.getEffect(), CapEffect.DECLARED, 'missing effect should default to declared');
  assert(cap.hasMarkerTag('test'), 'marker tag should be preserved');
}

// TEST6620: Generic top-to-top spellings are all rejected.
function test6620_wildcardGenericFormsRejected() {
  const forms = [
    'cap:',
    'cap:in;out',
    'cap:in=*;out=*',
    'cap:in=media:;out=media:',
    'cap:in;out=media:',
    'cap:in=*;out=media:',
    'cap:in=media:;out',
    'cap:in=media:;out=*',
  ];
  for (const form of forms) {
    assertThrows(
      () => CapUrn.fromString(form),
      ErrorCodes.ILLEGAL_DECLARATION,
      `${form} must be rejected as inadmissible`
    );
  }
}

// TEST6621: CAP_IDENTITY constant names the true identity cap, not bare cap:
function test6621_capIdentityConstantWorks() {
  const identity = CapUrn.fromString(CAP_IDENTITY);
  assertEqual(identity.toString(), 'cap:effect=none', 'CAP_IDENTITY must be explicit effect=none');
  assertEqual(identity.kind(), CapKind.IDENTITY, 'CAP_IDENTITY must classify as identity');

  const longForm = CapUrn.fromString('cap:in=media:;out=media:;effect=none');
  assert(identity.accepts(longForm), 'identity should accept its long form');
  assert(longForm.accepts(identity), 'long form should accept canonical identity');

  assertThrows(
    () => CapUrn.fromString('cap:'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'bare cap must be rejected as inadmissible'
  );
}

// TEST653: invalid effect=none declarations fail at construction
function test653_invalidEffectNoneDeclarationRejected() {
  assertThrows(
    () => CapUrn.fromString('cap:in="media:ext=pdf";effect=none;out="media:enc=utf-8"'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'invalid effect=none declaration must fail at construction'
  );
}

// TEST125: effect=none preserves runtime media identity
function test125_effectNonePreservesRuntimeMedia() {
  const decimate = CapUrn.fromString('cap:decimate-sequence;effect=none');
  const png = MediaUrn.fromString('media:ext=png;image');
  const pdf = MediaUrn.fromString('media:ext=pdf');
  assertEqual(decimate.inferRuntimeOutputMedia(png).toString(), png.toString(), 'effect=none should preserve png');
  assertEqual(decimate.inferRuntimeOutputMedia(pdf).toString(), pdf.toString(), 'effect=none should preserve pdf');
}

// TEST126: default effect=declared uses the declared output
function test126_effectDeclaredUsesDeclaredOutput() {
  const resize = CapUrn.fromString('cap:in=media:image;out=media:image;resize');
  const png = MediaUrn.fromString('media:ext=png;image;width=4000');
  assertEqual(
    resize.inferRuntimeOutputMedia(png).toString(),
    'media:image',
    'default declared effect should collapse to declared output'
  );
}

// TEST127: invalid effect=none declarations fail hard
function test127_invalidEffectNoneFailsHard() {
  assertThrows(
    () => CapUrn.fromString('cap:in="media:ext=pdf";effect=none;out="media:enc=utf-8"'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'invalid effect=none declaration must fail at construction'
  );
}

// TEST8121: isConformantRuntimeOutput — effect=declared accepts a more
// specific emission, rejects a more generic one
function test8121_effectConformanceDeclaredAsymmetry() {
  const cap = CapUrn.fromString('cap:extract;in="media:ext=pdf";out="media:record"');
  const input = MediaUrn.fromString('media:ext=pdf');

  assert(
    cap.isConformantRuntimeOutput(input, MediaUrn.fromString('media:record')),
    'emitting exactly the declared out is conformant'
  );
  assert(
    cap.isConformantRuntimeOutput(input, MediaUrn.fromString('media:fmt=json;record')),
    'a more specific emission than the declared out is conformant'
  );
  assert(
    !cap.isConformantRuntimeOutput(input, MediaUrn.fromString('media:')),
    'a more generic emission than the declared out is a violation'
  );
  assert(
    !cap.isConformantRuntimeOutput(input, MediaUrn.fromString('media:ext=png;image')),
    'an unrelated emission is a violation'
  );
}

// TEST8122: isConformantRuntimeOutput — effect=none requires the emission
// to be tag-equivalent to the runtime input; MORE specific is still a lie
function test8122_effectConformanceNoneRequiresEquivalence() {
  const cap = CapUrn.fromString('cap:decimate-sequence;effect=none');
  const input = MediaUrn.fromString('media:ext=png;image');

  assert(
    cap.isConformantRuntimeOutput(input, input),
    'emitting exactly the runtime input type is conformant'
  );
  assert(
    !cap.isConformantRuntimeOutput(input, MediaUrn.fromString('media:ext=png;image;width=64')),
    'effect=none promises the output type IS the input type; more specific is a lie'
  );
  assert(
    !cap.isConformantRuntimeOutput(input, MediaUrn.fromString('media:image')),
    'a more generic emission is a violation'
  );

  const strict = CapUrn.fromString('cap:effect=none;in="media:image";out="media:image"');
  const nonImage = MediaUrn.fromString('media:ext=pdf');
  assertThrows(
    () => strict.isConformantRuntimeOutput(nonImage, nonImage),
    ErrorCodes.INVALID_EFFECT_APPLICATION,
    'a nonconforming runtime input is an upstream contract break, surfaced as an error'
  );
}

// TEST8123: isConformantRuntimeOutput — effect=patch requires exactly the
// delta-patched input type
function test8123_effectConformancePatchRequiresPatchedInput() {
  const cap = CapUrn.fromString(
    'cap:convert;effect=patch;in="media:ext=jpeg;image";out="media:ext=png;image"'
  );
  const input = MediaUrn.fromString('media:ext=jpeg;image;width=64');

  assert(
    cap.isConformantRuntimeOutput(input, MediaUrn.fromString('media:ext=png;image;width=64')),
    'the delta-patched input type (preserved tags intact) is conformant'
  );
  assert(
    !cap.isConformantRuntimeOutput(input, MediaUrn.fromString('media:ext=png;image')),
    'dropping the preserved width tag violates the patch promise'
  );
  assert(
    !cap.isConformantRuntimeOutput(input, input),
    'emitting the unpatched input type is a violation'
  );
}

// TEST128: omitted effect means declared; unconstrained effect must be explicit
function test128_effectDispatchRequiresExplicitWildcard() {
  const noneCandidate = CapUrn.fromString('cap:effect=none');
  const declaredRequest = CapUrn.fromString('cap:raw');
  const anyRequest = CapUrn.fromString('cap:?effect');
  assert(!noneCandidate.isDispatchable(declaredRequest), 'effect=none should not silently satisfy declared request');
  assert(noneCandidate.isDispatchable(anyRequest), 'explicit ?effect should accept any candidate effect');
}

// ============================================================================
// Machine notation tests — mirrors Rust machine module tests exactly
// ============================================================================

// --- Machine parser tests (mirrors parser.rs tests) ---

function test6275_Machine_emptyInput() {
  assertThrowsWithCode(() => parseMachine(''), MachineSyntaxErrorCodes.EMPTY);
}

// TEST6277: Machine whitespace only
function test6277_Machine_whitespaceOnly() {
  assertThrowsWithCode(() => parseMachine('   \n  \t  '), MachineSyntaxErrorCodes.EMPTY);
}

// TEST6279: Machine header only no wirings
function test6279_Machine_headerOnlyNoWirings() {
  assertThrowsWithCode(
    () => Machine.fromString('[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]'),
    MachineSyntaxErrorCodes.NO_EDGES
  );
}

// TEST6280: Machine duplicate alias
function test6280_Machine_duplicateAlias() {
  assertThrowsWithCode(
    () => Machine.fromString(
      '[ex cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
      '[ex cap:in="media:ext=pdf";summarize;out="media:enc=utf-8;ext=txt"]' +
      '[a -> ex -> b]'
    ),
    MachineSyntaxErrorCodes.DUPLICATE_ALIAS
  );
}

// TEST6286: Machine simple linear chain
function test6286_Machine_simpleLinearChain() {
  const g = Machine.fromString(
    '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
    '[doc -> extract -> text]'
  );
  assertEqual(g.edgeCount(), 1);
  const edge = g.edges()[0];
  assertEqual(edge.sources.length, 1);
  assert(edge.sources[0].isEquivalent(MediaUrn.fromString('media:ext=pdf')),
    'Source should be media:ext=pdf');
  assert(edge.target.isEquivalent(MediaUrn.fromString('media:enc=utf-8;ext=txt')),
    'Target should be media:enc=utf-8;ext=txt');
  assertEqual(edge.isLoop, false);
}

// TEST6288: Machine two step chain
function test6288_Machine_twoStepChain() {
  const g = Machine.fromString(
    '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
    '[embed cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"]' +
    '[doc -> extract -> text]' +
    '[text -> embed -> vectors]'
  );
  assertEqual(g.edgeCount(), 2);
  assert(g.edges()[0].sources[0].isEquivalent(MediaUrn.fromString('media:ext=pdf')),
    'First edge source should be media:ext=pdf');
  assert(g.edges()[1].target.isEquivalent(MediaUrn.fromString('media:embedding-vector;enc=utf-8;record')),
    'Second edge target should be media:embedding-vector;enc=utf-8;record');
}

// TEST6290: Machine fan out
function test6290_Machine_fanOut() {
  const g = Machine.fromString(
    '[meta cap:in="media:ext=pdf";extract-metadata;out="media:enc=utf-8;file-metadata;record"]' +
    '[outline cap:in="media:ext=pdf";extract-outline;out="media:document-outline;enc=utf-8;record"]' +
    '[thumb cap:in="media:ext=pdf";generate-thumbnail;out="media:ext=png;image;thumbnail"]' +
    '[doc -> meta -> metadata]' +
    '[doc -> outline -> outline_data]' +
    '[doc -> thumb -> thumbnail]'
  );
  assertEqual(g.edgeCount(), 3);
  for (const edge of g.edges()) {
    assertEqual(edge.sources.length, 1);
    assert(edge.sources[0].isEquivalent(MediaUrn.fromString('media:ext=pdf')),
      'All fan-out sources should be media:ext=pdf');
  }
}

// TEST6292: Machine fan in secondary assigned by prior wiring
function test6292_Machine_fanInSecondaryAssignedByPriorWiring() {
  const g = Machine.fromString(
    '[thumb cap:in="media:ext=pdf";generate-thumbnail;out="media:ext=png;image;thumbnail"]' +
    '[model_dl cap:in="media:enc=utf-8;model-spec";download;out="media:enc=utf-8;model-spec"]' +
    '[describe cap:in="media:ext=png;image";describe-image;out="media:enc=utf-8;image-description"]' +
    '[doc -> thumb -> thumbnail]' +
    '[spec_input -> model_dl -> model_spec]' +
    '[(thumbnail, model_spec) -> describe -> description]'
  );
  assertEqual(g.edgeCount(), 3);
  assertEqual(g.edges()[2].sources.length, 2);
}

// TEST6294: Machine fan in secondary unassigned gets wildcard
function test6294_Machine_fanInSecondaryUnassignedGetsWildcard() {
  const g = Machine.fromString(
    '[describe cap:in="media:ext=png;image";describe-image;out="media:enc=utf-8;image-description"]\n' +
    '[(thumbnail, model_spec) -> describe -> description]'
  );
  assertEqual(g.edges().length, 1);
  assertEqual(g.edges()[0].sources.length, 2);
  assertEqual(g.edges()[0].sources[0].toString(), 'media:ext=png;image');
  assertEqual(g.edges()[0].sources[1].toString(), 'media:');
}

// TEST6306: The retired LOOP keyword is no longer grammar. A wiring that still
// writes `LOOP <cap>` before the cap alias no longer parses — `LOOP` is now an
// ordinary alias, so `pages -> LOOP p2t -> texts` is two aliases in the cap
// position with no arrow between them, which is a syntax error.
function test6306_Machine_loopKeywordIsNotGrammar() {
  assertThrowsWithCode(
    () => Machine.fromString(
      '[p2t cap:in="media:disbound-page;enc=utf-8";page-to-text;out="media:enc=utf-8;ext=txt"]' +
      '[pages -> LOOP p2t -> texts]'
    ),
    MachineSyntaxErrorCodes.PARSE_ERROR
  );

  // `LOOP` on its own in the cap position parses fine — it is just an alias —
  // but resolves to nothing, proving it carries no special meaning.
  assertThrowsWithCode(
    () => Machine.fromString('[pages -> LOOP -> texts]'),
    MachineSyntaxErrorCodes.UNDEFINED_ALIAS
  );
}

// TEST6308: Machine undefined alias fails
function test6308_Machine_undefinedAliasFails() {
  assertThrowsWithCode(
    () => Machine.fromString('[doc -> nonexistent -> text]'),
    MachineSyntaxErrorCodes.UNDEFINED_ALIAS
  );
}

// TEST6310: Machine node alias collision
function test6310_Machine_nodeAliasCollision() {
  assertThrowsWithCode(
    () => Machine.fromString(
      '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
      '[extract -> extract -> text]'
    ),
    MachineSyntaxErrorCodes.NODE_ALIAS_COLLISION
  );
}

// TEST6312: Machine conflicting media types fail
function test6312_Machine_conflictingMediaTypesFail() {
  assertThrowsWithCode(
    () => Machine.fromString(
      '[cap1 cap:in="media:enc=utf-8;ext=txt";a;out="media:ext=pdf"]' +
      '[cap2 cap:in="media:audio;ext=wav";b;out="media:enc=utf-8;ext=txt"]' +
      '[src -> cap1 -> mid]' +
      '[mid -> cap2 -> dst]'
    ),
    MachineSyntaxErrorCodes.INVALID_WIRING
  );
}

// TEST6315: Machine multiline format
function test6315_Machine_multilineFormat() {
  const g = Machine.fromString(
    '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]\n' +
    '[embed cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"]\n' +
    '[doc -> extract -> text]\n' +
    '[text -> embed -> vectors]\n'
  );
  assertEqual(g.edgeCount(), 2);
}

// TEST6318: Machine different aliases same graph
function test6318_Machine_differentAliasesSameGraph() {
  const g1 = Machine.fromString(
    '[ex cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
    '[a -> ex -> b]'
  );
  const g2 = Machine.fromString(
    '[xt cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
    '[x -> xt -> y]'
  );
  assert(g1.isEquivalent(g2), 'Different aliases should produce equivalent graphs');
}

// TEST6321: Machine malformed input fails
function test6321_Machine_malformedInputFails() {
  assertThrowsWithCode(
    () => parseMachine('not valid machine notation'),
    MachineSyntaxErrorCodes.PARSE_ERROR
  );
}

// TEST6323: Machine unterminated bracket fails
function test6323_Machine_unterminatedBracketFails() {
  assertThrowsWithCode(
    () => parseMachine('[extract cap:in=media:ext=pdf'),
    MachineSyntaxErrorCodes.PARSE_ERROR
  );
}

// --- Machine parser line-based mode tests ---

function test6327_Machine_lineBasedSimpleChain() {
  const g = Machine.fromString(
    'extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"\n' +
    'doc -> extract -> text'
  );
  assertEqual(g.edgeCount(), 1);
  const edge = g.edges()[0];
  assert(edge.sources[0].isEquivalent(MediaUrn.fromString('media:ext=pdf')),
    'Source should be media:ext=pdf');
  assert(edge.target.isEquivalent(MediaUrn.fromString('media:enc=utf-8;ext=txt')),
    'Target should be media:enc=utf-8;ext=txt');
}

// TEST6331: Machine line based two step chain
function test6331_Machine_lineBasedTwoStepChain() {
  const g = Machine.fromString(
    'extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"\n' +
    'embed cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"\n' +
    'doc -> extract -> text\n' +
    'text -> embed -> vectors'
  );
  assertEqual(g.edgeCount(), 2);
}

// TEST6334: The retired LOOP keyword is not grammar in line-based mode either —
// `pages -> LOOP p2t -> texts` is a syntax error, same as the bracketed form.
function test6334_Machine_lineBasedLoopKeywordIsNotGrammar() {
  assertThrowsWithCode(
    () => Machine.fromString(
      'p2t cap:in="media:disbound-page;enc=utf-8";page-to-text;out="media:enc=utf-8;ext=txt"\n' +
      'pages -> LOOP p2t -> texts'
    ),
    MachineSyntaxErrorCodes.PARSE_ERROR
  );
}

// TEST6337: Machine line based fan in
function test6337_Machine_lineBasedFanIn() {
  const g = Machine.fromString(
    'thumb cap:in="media:ext=pdf";generate-thumbnail;out="media:ext=png;image;thumbnail"\n' +
    'model_dl cap:in="media:enc=utf-8;model-spec";download;out="media:enc=utf-8;model-spec"\n' +
    'describe cap:in="media:ext=png;image";describe-image;out="media:enc=utf-8;image-description"\n' +
    'doc -> thumb -> thumbnail\n' +
    'spec_input -> model_dl -> model_spec\n' +
    '(thumbnail, model_spec) -> describe -> description'
  );
  assertEqual(g.edgeCount(), 3);
  assertEqual(g.edges()[2].sources.length, 2);
}

// TEST6341: Machine mixed bracketed and line based
function test6341_Machine_mixedBracketedAndLineBased() {
  const g = Machine.fromString(
    '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]\n' +
    'doc -> extract -> text'
  );
  assertEqual(g.edgeCount(), 1);
}

// TEST6345: Machine line based equivalent to bracketed
function test6345_Machine_lineBasedEquivalentToBracketed() {
  const g1 = Machine.fromString(
    '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
    '[doc -> extract -> text]'
  );
  const g2 = Machine.fromString(
    'extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"\n' +
    'doc -> extract -> text'
  );
  assert(g1.isEquivalent(g2), 'Line-based and bracketed must produce equivalent graphs');
}

// TEST6349: Machine line based format serialization
function test6349_Machine_lineBasedFormatSerialization() {
  const g = new Machine([
    new MachineEdge(
      [MediaUrn.fromString('media:ext=pdf')],
      CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
      MediaUrn.fromString('media:enc=utf-8;ext=txt'),
      false
    ),
  ]);
  const lineBased = g.toMachineNotationFormatted('line-based');
  assert(!lineBased.includes('['), 'Line-based format must not contain brackets');
  assert(!lineBased.includes(']'), 'Line-based format must not contain brackets');
  // Aliases are pure-index `edge_<N>` (no privileged tag to derive a friendlier name).
  assert(lineBased.includes('edge_0 cap:'), 'Should contain header');
  assert(lineBased.includes('-> edge_0 ->'), 'Should contain wiring');

  // Round-trip
  const reparsed = Machine.fromString(lineBased);
  assert(g.isEquivalent(reparsed), 'Line-based round-trip must produce equivalent graph');
}

// TEST6353: Machine line based and bracketed parse same graph
function test6353_Machine_lineBasedAndBracketedParseSameGraph() {
  const g = new Machine([
    new MachineEdge(
      [MediaUrn.fromString('media:ext=pdf')],
      CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
      MediaUrn.fromString('media:enc=utf-8;ext=txt'),
      false
    ),
    new MachineEdge(
      [MediaUrn.fromString('media:enc=utf-8;ext=txt')],
      CapUrn.fromString('cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"'),
      MediaUrn.fromString('media:embedding-vector;enc=utf-8;record'),
      false
    ),
  ]);
  const bracketed = g.toMachineNotationFormatted('bracketed');
  const lineBased = g.toMachineNotationFormatted('line-based');

  const gBracketed = Machine.fromString(bracketed);
  const gLineBased = Machine.fromString(lineBased);
  assert(gBracketed.isEquivalent(gLineBased),
    'Bracketed and line-based must parse to equivalent graphs');
}

// --- Machine graph tests (mirrors graph.rs tests) ---

function test6357_Machine_edgeEquivalenceSameUrns() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  );
  assert(e1.isEquivalent(e2), 'Same URNs should be equivalent');
}

// TEST6361: Machine edge equivalence different cap urns
function test6361_Machine_edgeEquivalenceDifferentCapUrns() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";summarize;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  );
  assert(!e1.isEquivalent(e2), 'Different cap URNs should not be equivalent');
}

// TEST6365: Machine edge equivalence different targets
function test6365_Machine_edgeEquivalenceDifferentTargets() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:fmt=json;record'),
    false
  );
  assert(!e1.isEquivalent(e2), 'Different targets should not be equivalent');
}

// TEST6369: Machine edge equivalence different loop flag
function test6369_Machine_edgeEquivalenceDifferentLoopFlag() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    true
  );
  assert(!e1.isEquivalent(e2), 'Different loop flags should not be equivalent');
}

// TEST6372: Machine edge equivalence source order independent
function test6372_Machine_edgeEquivalenceSourceOrderIndependent() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:enc=utf-8;ext=txt'), MediaUrn.fromString('media:enc=utf-8;model-spec')],
    CapUrn.fromString('cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"'),
    MediaUrn.fromString('media:embedding-vector;enc=utf-8;record'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:enc=utf-8;model-spec'), MediaUrn.fromString('media:enc=utf-8;ext=txt')],
    CapUrn.fromString('cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"'),
    MediaUrn.fromString('media:embedding-vector;enc=utf-8;record'),
    false
  );
  assert(e1.isEquivalent(e2), 'Source order should not matter for equivalence');
}

// TEST6375: Machine edge equivalence different source count
function test6375_Machine_edgeEquivalenceDifferentSourceCount() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:enc=utf-8;ext=txt')],
    CapUrn.fromString('cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"'),
    MediaUrn.fromString('media:embedding-vector;enc=utf-8;record'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:enc=utf-8;ext=txt'), MediaUrn.fromString('media:enc=utf-8;model-spec')],
    CapUrn.fromString('cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"'),
    MediaUrn.fromString('media:embedding-vector;enc=utf-8;record'),
    false
  );
  assert(!e1.isEquivalent(e2), 'Different source counts should not be equivalent');
}

// TEST6377: Machine graph equivalence same edges
function test6377_Machine_graphEquivalenceSameEdges() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g1 = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
  ]);
  const g2 = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
  ]);
  assert(g1.isEquivalent(g2), 'Same edges should be equivalent');
}

// TEST6380: Machine graph equivalence reordered edges
function test6380_Machine_graphEquivalenceReorderedEdges() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g1 = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
  ]);
  const g2 = new Machine([
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
  ]);
  assert(g1.isEquivalent(g2), 'Reordered edges should still be equivalent');
}

// TEST6383: Machine graph not equivalent different edge count
function test6383_Machine_graphNotEquivalentDifferentEdgeCount() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g1 = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
  ]);
  const g2 = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
  ]);
  assert(!g1.isEquivalent(g2), 'Different edge counts should not be equivalent');
}

// TEST6386: Machine graph not equivalent different cap
function test6386_Machine_graphNotEquivalentDifferentCap() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g1 = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
  ]);
  const g2 = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";summarize;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
  ]);
  assert(!g1.isEquivalent(g2), 'Different caps should not be equivalent');
}

// TEST6389: Machine graph empty
function test6389_Machine_graphEmpty() {
  const g = Machine.empty();
  assert(g.isEmpty(), 'Empty graph should be empty');
  assertEqual(g.edgeCount(), 0);
}

// TEST6392: Machine graph empty equivalence
function test6392_Machine_graphEmptyEquivalence() {
  const g1 = Machine.empty();
  const g2 = Machine.empty();
  assert(g1.isEquivalent(g2), 'Two empty graphs should be equivalent');
}

// TEST6395: Machine root sources linear chain
function test6395_Machine_rootSourcesLinearChain() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
  ]);
  const roots = g.rootSources();
  assertEqual(roots.length, 1);
  assert(roots[0].isEquivalent(MediaUrn.fromString('media:ext=pdf')),
    'Root source should be media:ext=pdf');
}

// TEST6397: Machine leaf targets linear chain
function test6397_Machine_leafTargetsLinearChain() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
  ]);
  const leaves = g.leafTargets();
  assertEqual(leaves.length, 1);
  assert(leaves[0].isEquivalent(MediaUrn.fromString('media:embedding-vector;enc=utf-8;record')),
    'Leaf target should be media:embedding-vector;enc=utf-8;record');
}

// TEST6398: Machine root sources fan in
function test6398_Machine_rootSourcesFanIn() {
  const e = new MachineEdge(
    [MediaUrn.fromString('media:enc=utf-8;ext=txt'), MediaUrn.fromString('media:enc=utf-8;model-spec')],
    CapUrn.fromString('cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"'),
    MediaUrn.fromString('media:embedding-vector;enc=utf-8;record'),
    false
  );
  const g = new Machine([e]);
  const roots = g.rootSources();
  assertEqual(roots.length, 2);
}

// TEST6400: Machine display edge
function test6400_Machine_displayEdge() {
  const e = new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  );
  const display = e.toString();
  assert(display.includes('media:ext=pdf'), 'Display should contain media:ext=pdf');
}

// TEST6402: Machine display graph
function test6402_Machine_displayGraph() {
  const e = new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  );
  assertEqual(new Machine([e]).toString(), 'Machine(1 edges)');
  assertEqual(Machine.empty().toString(), 'Machine(empty)');
}

// --- Machine serializer tests (mirrors serializer.rs tests) ---

function test6404_Machine_serializeSingleEdge() {
  const g = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  )]);
  const notation = g.toMachineNotation();
  // Aliases are pure-index `edge_<N>` (no privileged tag to derive a friendlier name).
  assert(notation.includes('[edge_0 '), 'Should use edge_0 alias: ' + notation);
  assert(notation.includes('-> edge_0 ->'), 'Should have edge_0 in wiring: ' + notation);
  assert(notation.includes('[n0 ->'), 'Should use n0 for source: ' + notation);
  assert(notation.includes('-> n1]'), 'Should use n1 for target: ' + notation);
}

// TEST6406: Machine serialize two edge chain
function test6406_Machine_serializeTwoEdgeChain() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
  ]);
  const notation = g.toMachineNotation();
  const bracketCount = (notation.match(/\[/g) || []).length;
  assertEqual(bracketCount, 4, 'Should have 4 brackets (2 headers + 2 wirings)');
}

// TEST6408: Machine serialize empty graph
function test6408_Machine_serializeEmptyGraph() {
  assertEqual(Machine.empty().toMachineNotation(), '');
}

// TEST6410: Machine roundtrip single edge
function test6410_Machine_roundtripSingleEdge() {
  const original = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  )]);
  const notation = original.toMachineNotation();
  const reparsed = Machine.fromString(notation);
  assert(original.isEquivalent(reparsed),
    'Single edge round-trip failed: ' + notation);
}

// TEST6413: Machine roundtrip two edge chain
function test6413_Machine_roundtripTwoEdgeChain() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const original = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
  ]);
  const notation = original.toMachineNotation();
  const reparsed = Machine.fromString(notation);
  assert(original.isEquivalent(reparsed),
    'Two-edge chain round-trip failed: ' + notation);
}

// TEST6415: Machine roundtrip fan out
function test6415_Machine_roundtripFanOut() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const original = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract-metadata;out="media:enc=utf-8;file-metadata;record"', 'media:enc=utf-8;file-metadata;record'),
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract-outline;out="media:document-outline;enc=utf-8;record"', 'media:document-outline;enc=utf-8;record'),
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";generate-thumbnail;out="media:ext=png;image;thumbnail"', 'media:ext=png;image;thumbnail'),
  ]);
  const notation = original.toMachineNotation();
  const reparsed = Machine.fromString(notation);
  assert(original.isEquivalent(reparsed),
    'Fan-out round-trip failed: ' + notation);
}

// TEST6417: A per-item map (`is_loop`) edge serializes WITHOUT any LOOP marker —
// `is_loop` is a derived cardinality property, not authored notation text. The
// pure-JS parse path has no cap definitions to re-derive cardinality, so the
// reparsed edge has `isLoop === false`; editors get the derived value from the
// engine, not from re-parsing.
function test6417_Machine_loopEdgeSerializesWithoutLoopText() {
  const original = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:disbound-page;enc=utf-8')],
    CapUrn.fromString('cap:in="media:disbound-page;enc=utf-8";page-to-text;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    true
  )]);
  const notation = original.toMachineNotation();
  assert(!notation.includes('LOOP'), 'serialized notation must not contain the retired LOOP keyword');

  const reparsed = Machine.fromString(notation);
  assertEqual(reparsed.edgeCount(), 1);
  assertEqual(reparsed.edges()[0].isLoop, false,
    'pure-JS parse path cannot derive cardinality — isLoop defaults to false');
  // The structural payload (sources, cap, target) round-trips intact.
  assert(reparsed.edges()[0].capUrn.isEquivalent(original.edges()[0].capUrn),
    'cap URN must round-trip');
  assert(reparsed.edges()[0].target.isEquivalent(original.edges()[0].target),
    'target media must round-trip');
}

// TEST6419: Machine serialization is deterministic
function test6419_Machine_serializationIsDeterministic() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
  ]);
  const n1 = g.toMachineNotation();
  const n2 = g.toMachineNotation();
  assertEqual(n1, n2, 'Serialization must be deterministic');
}

// TEST6421: Machine reordered edges produce same notation
function test6421_Machine_reorderedEdgesProduceSameNotation() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g1 = new Machine([
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
  ]);
  const g2 = new Machine([
    mkEdge('media:enc=utf-8;ext=txt', 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record'),
    mkEdge('media:ext=pdf', 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt'),
  ]);
  assertEqual(g1.toMachineNotation(), g2.toMachineNotation(),
    'Same graph with reordered edges must produce identical notation');
}

// TEST6429: Machine multiline serialize format
function test6429_Machine_multilineSerializeFormat() {
  const g = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  )]);
  const multi = g.toMachineNotationMultiline();
  assert(multi.includes('\n'), 'Multi-line format must contain newlines');
  // Should round-trip
  const reparsed = Machine.fromString(multi);
  assert(g.isEquivalent(reparsed), 'Multi-line round-trip failed');
}

// Aliases are pure-index `edge_<N>` regardless of the cap's tags; there is
// no privileged `op` tag to derive a friendlier name from.
function test6432_Machine_aliasFromOpTag() {
  const g = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  )]);
  const notation = g.toMachineNotation();
  assert(notation.includes('[edge_0 '), 'Expected edge_0 alias, got: ' + notation);
}

// TEST6434: Machine alias fallback without op tag
function test6434_Machine_aliasFallbackWithoutOpTag() {
  const g = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:ext=pdf')],
    CapUrn.fromString('cap:in="media:ext=pdf";out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    false
  )]);
  const notation = g.toMachineNotation();
  assert(notation.includes('edge_'), 'Expected fallback alias, got: ' + notation);
}

// Pure-index aliases inherently disambiguate edges that share a marker tag.
function test6436_Machine_duplicateOpTagsDisambiguated() {
  const g = new Machine([
    new MachineEdge(
      [MediaUrn.fromString('media:ext=pdf')],
      CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"'),
      MediaUrn.fromString('media:enc=utf-8;ext=txt'),
      false
    ),
    new MachineEdge(
      [MediaUrn.fromString('media:ext=pdf')],
      CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:fmt=json;record"'),
      MediaUrn.fromString('media:fmt=json;record'),
      false
    ),
  ]);
  const notation = g.toMachineNotation();
  assert(notation.includes('edge_0') && notation.includes('edge_1'),
    'Two edges must serialize with two distinct aliases: ' + notation);
}

// --- Machine builder tests ---

function test6437_Machine_builderSingleEdge() {
  const builder = new MachineBuilder();
  builder.addEdge(
    ['media:ext=pdf'],
    'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"',
    'media:enc=utf-8;ext=txt'
  );
  const g = builder.build();
  assertEqual(g.edgeCount(), 1);
  assertEqual(g.edges()[0].isLoop, false);
}

// TEST6438: Machine builder with loop
function test6438_Machine_builderWithLoop() {
  const builder = new MachineBuilder();
  builder.addEdge(
    ['media:disbound-page;enc=utf-8'],
    'cap:in="media:disbound-page;enc=utf-8";page-to-text;out="media:enc=utf-8;ext=txt"',
    'media:enc=utf-8;ext=txt',
    true
  );
  const g = builder.build();
  assertEqual(g.edges()[0].isLoop, true);
}

// TEST6439: Machine builder chaining
function test6439_Machine_builderChaining() {
  const g = new MachineBuilder()
    .addEdge(['media:ext=pdf'], 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt')
    .addEdge(['media:enc=utf-8;ext=txt'], 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record')
    .build();
  assertEqual(g.edgeCount(), 2);
}

// TEST6440: Machine builder equivalent to parsed
function test6440_Machine_builderEquivalentToParsed() {
  const parsed = Machine.fromString(
    '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
    '[doc -> extract -> text]'
  );
  const built = new MachineBuilder()
    .addEdge(['media:ext=pdf'], 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt')
    .build();
  assert(parsed.isEquivalent(built),
    'Builder-constructed graph should be equivalent to parsed graph');
}

// TEST6442: Machine builder round trip
function test6442_Machine_builderRoundTrip() {
  const built = new MachineBuilder()
    .addEdge(['media:ext=pdf'], 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'media:enc=utf-8;ext=txt')
    .addEdge(['media:enc=utf-8;ext=txt'], 'cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"', 'media:embedding-vector;enc=utf-8;record')
    .build();
  const notation = built.toMachineNotation();
  const reparsed = Machine.fromString(notation);
  assert(built.isEquivalent(reparsed), 'Builder round-trip failed');
}

// --- CapUrn.isEquivalent/isComparable tests ---

function test6444_Machine_capUrnIsEquivalent() {
  const a = CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"');
  const b = CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"');
  assert(a.isEquivalent(b), 'Same cap URNs should be equivalent');
  const c = CapUrn.fromString('cap:in="media:ext=pdf";summarize;out="media:enc=utf-8;ext=txt"');
  assert(!a.isEquivalent(c), 'Different cap URNs should not be equivalent');
}

// TEST6446: Machine cap urn is comparable
function test6446_Machine_capUrnIsComparable() {
  const general = CapUrn.fromString('cap:in="media:ext=pdf";out="media:enc=utf-8;ext=txt"');
  const specific = CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"');
  assert(general.isComparable(specific), 'General should be comparable to specific');
  assert(specific.isComparable(general), 'isComparable should be symmetric');
}

// TEST6448: Machine cap urn in media urn
function test6448_Machine_capUrnInMediaUrn() {
  const cap = CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"');
  const inUrn = cap.inMediaUrn();
  assert(inUrn instanceof MediaUrn, 'inMediaUrn should return MediaUrn');
  assert(inUrn.isEquivalent(MediaUrn.fromString('media:ext=pdf')), 'inMediaUrn should be media:ext=pdf');
}

// TEST6449: Machine cap urn out media urn
function test6449_Machine_capUrnOutMediaUrn() {
  const cap = CapUrn.fromString('cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"');
  const outUrn = cap.outMediaUrn();
  assert(outUrn instanceof MediaUrn, 'outMediaUrn should return MediaUrn');
  assert(outUrn.isEquivalent(MediaUrn.fromString('media:enc=utf-8;ext=txt')), 'outMediaUrn should be media:enc=utf-8;ext=txt');
}

// --- MediaUrn.isEquivalent/isComparable tests ---

function test6450_Machine_mediaUrnIsEquivalent() {
  const a = MediaUrn.fromString('media:ext=pdf');
  const b = MediaUrn.fromString('media:ext=pdf');
  assert(a.isEquivalent(b), 'Same media URNs should be equivalent');
  const c = MediaUrn.fromString('media:enc=utf-8;ext=txt');
  assert(!a.isEquivalent(c), 'Different media URNs should not be equivalent');
}

// TEST6451: Machine media urn is comparable
function test6451_Machine_mediaUrnIsComparable() {
  const general = MediaUrn.fromString('media:enc=utf-8');
  const specific = MediaUrn.fromString('media:enc=utf-8;ext=txt');
  assert(general.isComparable(specific), 'General should be comparable to specific');
  assert(specific.isComparable(general), 'isComparable should be symmetric');
  const unrelated = MediaUrn.fromString('media:ext=pdf');
  assert(!general.isComparable(unrelated), 'Unrelated should not be comparable');
}

// ============================================================================
// Phase 0A: Position tracking tests
// ============================================================================

function test6452_Machine_parseMachineWithAST_headerLocation() {
  const input = '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"][doc -> extract -> text]';
  const result = parseMachineWithAST(input);
  assert(result.statements.length === 2, 'Should have 2 statements');
  const stmt = result.statements[0];
  assertEqual(stmt.type, 'header', 'First statement should be a header');
  assert(stmt.location !== undefined, 'Header should have location');
  assert(stmt.location.start !== undefined, 'Location should have start');
  assert(stmt.location.end !== undefined, 'Location should have end');
  assert(stmt.location.start.line !== undefined, 'Start should have line');
  assert(stmt.location.start.column !== undefined, 'Start should have column');
  assert(stmt.aliasLocation !== undefined, 'Header should have aliasLocation');
  assert(stmt.capUrnLocation !== undefined, 'Header should have capUrnLocation');
  assertEqual(stmt.alias, 'extract', 'Alias should be extract');
}

// TEST6453: Machine parse machine with a s t wiring location
function test6453_Machine_parseMachineWithAST_wiringLocation() {
  const input = '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]\n[doc -> extract -> text]';
  const result = parseMachineWithAST(input);
  assert(result.statements.length === 2, 'Should have 2 statements');
  const wiring = result.statements[1];
  assertEqual(wiring.type, 'wiring', 'Second statement should be a wiring');
  assert(wiring.location !== undefined, 'Wiring should have location');
  assert(wiring.sourceLocations !== undefined, 'Wiring should have sourceLocations');
  assert(wiring.sourceLocations.length === 1, 'Should have 1 source location');
  assert(wiring.capAliasLocation !== undefined, 'Wiring should have capAliasLocation');
  assert(wiring.targetLocation !== undefined, 'Wiring should have targetLocation');
  assertEqual(wiring.target, 'text', 'Target should be text');
}

// TEST6454: Machine parse machine with a s t multiline positions
function test6454_Machine_parseMachineWithAST_multilinePositions() {
  const input = '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]\n[doc -> extract -> text]';
  const result = parseMachineWithAST(input);
  const headerLoc = result.statements[0].location;
  const wiringLoc = result.statements[1].location;
  assertEqual(headerLoc.start.line, 1, 'Header should be on line 1');
  assertEqual(wiringLoc.start.line, 2, 'Wiring should be on line 2');
}

// TEST6455: Machine parse machine with a s t fan in source locations
function test6455_Machine_parseMachineWithAST_fanInSourceLocations() {
  const input = [
    '[describe cap:in="media:ext=png;image";describe-image;out="media:enc=utf-8;image-description"]',
    '[(thumbnail, model_spec) -> describe -> description]'
  ].join('\n');
  const result = parseMachineWithAST(input);
  const wiring = result.statements[1];
  assertEqual(wiring.sources.length, 2, 'Fan-in should have 2 sources');
  assert(wiring.sourceLocations.length === 2, 'Should have 2 source locations');
}

// TEST6456: Machine parse machine with a s t alias map
function test6456_Machine_parseMachineWithAST_aliasMap() {
  const input = [
    '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]',
    '[embed cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"]',
    '[doc -> extract -> text]',
    '[text -> embed -> vectors]',
  ].join('\n');
  const result = parseMachineWithAST(input);
  assert(result.aliasMap.has('extract'), 'aliasMap should have extract');
  assert(result.aliasMap.has('embed'), 'aliasMap should have embed');
  assertEqual(result.aliasMap.size, 2, 'aliasMap should have 2 entries');
  const extractEntry = result.aliasMap.get('extract');
  assert(extractEntry.capUrn !== undefined, 'Alias entry should have capUrn');
  assert(extractEntry.location !== undefined, 'Alias entry should have location');
  assert(extractEntry.aliasLocation !== undefined, 'Alias entry should have aliasLocation');
  assert(extractEntry.capUrnLocation !== undefined, 'Alias entry should have capUrnLocation');
}

// TEST6457: Machine parse machine with a s t node media
function test6457_Machine_parseMachineWithAST_nodeMedia() {
  const input = [
    '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]',
    '[doc -> extract -> text]',
  ].join('\n');
  const result = parseMachineWithAST(input);
  assert(result.nodeMedia.has('doc'), 'nodeMedia should have doc');
  assert(result.nodeMedia.has('text'), 'nodeMedia should have text');
  assertEqual(result.nodeMedia.get('doc').toString(), 'media:ext=pdf', 'doc should be media:ext=pdf');
  assertEqual(result.nodeMedia.get('text').toString(), 'media:enc=utf-8;ext=txt', 'text should be media:enc=utf-8;ext=txt');
}

// TEST6458: Machine error location parse error
function test6458_Machine_errorLocation_parseError() {
  try {
    parseMachine('[this is not valid');
    throw new Error('Expected MachineSyntaxError');
  } catch (e) {
    assertEqual(e.code, MachineSyntaxErrorCodes.PARSE_ERROR, 'Should be PARSE_ERROR');
    assert(e.location !== null, 'Parse error should have location');
  }
}

// TEST6459: Machine error location duplicate alias
function test6459_Machine_errorLocation_duplicateAlias() {
  try {
    parseMachine(
      '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
      '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
      '[doc -> extract -> text]'
    );
    throw new Error('Expected MachineSyntaxError');
  } catch (e) {
    assertEqual(e.code, MachineSyntaxErrorCodes.DUPLICATE_ALIAS, 'Should be DUPLICATE_ALIAS');
    assert(e.location !== null, 'Duplicate alias error should have location');
  }
}

// TEST6460: Machine error location undefined alias
function test6460_Machine_errorLocation_undefinedAlias() {
  try {
    parseMachine('[doc -> nonexistent -> text]');
    throw new Error('Expected MachineSyntaxError');
  } catch (e) {
    assertEqual(e.code, MachineSyntaxErrorCodes.UNDEFINED_ALIAS, 'Should be UNDEFINED_ALIAS');
    assert(e.location !== null, 'Undefined alias error should have location');
  }
}

// ============================================================================
// Phase 0C: Machine.toMermaid() tests
// ============================================================================

function test6462_Machine_toMermaid_linearChain() {
  const machine = Machine.fromString(
    '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
    '[doc -> extract -> text]'
  );
  const mermaid = machine.toMermaid();
  assert(mermaid.startsWith('flowchart LR'), 'Should start with flowchart LR');
  // Edge labels are pure-index `edge_<N>` aliases from the canonical
  // serializer (the input alias name is not preserved in the rendered
  // diagram — it's a serialization artefact, not part of the machine).
  assert(mermaid.includes('edge_0'), 'Should include edge_0 label');
  assert(mermaid.includes('media:ext=pdf'), 'Should include media:ext=pdf node');
  assert(mermaid.includes('media:enc=utf-8;ext=txt'), 'Should include media:enc=utf-8;ext=txt node');
  assert(mermaid.includes('-->'), 'Should include arrow');
  // Root source and leaf target should both be stadium shape
  assert(mermaid.includes('(['), 'Should have stadium shape nodes');
}

// TEST6463: Mermaid renders a per-item map (`is_loop`) edge with a dotted line
// — `is_loop` is a kept render property — but emits NO "LOOP" text, since that
// keyword is retired. The loop edge is built programmatically because the
// grammar no longer has any way to author one.
function test6463_Machine_toMermaid_loopEdge() {
  const machine = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:disbound-page;enc=utf-8')],
    CapUrn.fromString('cap:in="media:disbound-page;enc=utf-8";page-to-text;out="media:enc=utf-8;ext=txt"'),
    MediaUrn.fromString('media:enc=utf-8;ext=txt'),
    true
  )]);
  const mermaid = machine.toMermaid();
  assert(!mermaid.includes('LOOP'), 'Must not emit the retired LOOP label');
  assert(mermaid.includes('-.'), 'Should use dotted line for the per-item map edge');
  assert(mermaid.includes('.->'), 'Should use dotted arrow for the per-item map edge');
}

// TEST6464: Machine to mermaid empty graph
function test6464_Machine_toMermaid_emptyGraph() {
  const machine = Machine.empty();
  const mermaid = machine.toMermaid();
  assert(mermaid.includes('empty graph'), 'Should indicate empty graph');
}

// TEST6465: Machine to mermaid fan in
function test6465_Machine_toMermaid_fanIn() {
  const machine = Machine.fromString(
    '[describe cap:in="media:ext=png;image";describe-image;out="media:enc=utf-8;image-description"]' +
    '[(thumbnail, model_spec) -> describe -> description]'
  );
  const mermaid = machine.toMermaid();
  // Fan-in should produce two arrows pointing to the same target
  const arrowCount = (mermaid.match(/-->/g) || []).length;
  assertEqual(arrowCount, 2, 'Fan-in should produce 2 arrows');
}

// TEST6466: Machine to mermaid fan out
function test6466_Machine_toMermaid_fanOut() {
  const input = [
    '[meta cap:in="media:ext=pdf";extract-metadata;out="media:enc=utf-8;file-metadata;record"]',
    '[thumb cap:in="media:ext=pdf";generate-thumbnail;out="media:ext=png;image;thumbnail"]',
    '[doc -> meta -> metadata]',
    '[doc -> thumb -> thumbnail]'
  ].join('');
  const machine = Machine.fromString(input);
  const mermaid = machine.toMermaid();
  // Should have 2 edges
  const arrowCount = (mermaid.match(/-->/g) || []).length;
  assertEqual(arrowCount, 2, 'Fan-out should produce 2 arrows');
  // The root source (media:ext=pdf) should appear once as a node definition
  assert(mermaid.includes('media:ext=pdf'), 'Should include media:ext=pdf');
}

// ============================================================================
// Phase 0B: FabricRegistryClient tests
// ============================================================================

function test6467_Machine_capRegistryEntry_construction() {
  const entry = new FabricRegistryEntry({
    urn: 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"',
    title: 'PDF Extractor',
    command: 'extract',
    cap_description: 'Extracts text from PDF',
    args: [{ media_urn: 'media:ext=pdf', required: true }],
    output: { media_urn: 'media:enc=utf-8;ext=txt', output_description: 'Digitized text' },
    media_defs: [],
    urn_tags: { op: 'extract' },
    in_spec: 'media:ext=pdf',
    out_spec: 'media:enc=utf-8;ext=txt',
    in_media_title: 'PDF Document',
    out_media_title: 'Text'
  });
  assertEqual(entry.urn, 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"', 'URN should match');
  assertEqual(entry.title, 'PDF Extractor', 'Title should match');
  assertEqual(entry.description, 'Extracts text from PDF', 'Description should match');
  assertEqual(entry.inSpec, 'media:ext=pdf', 'inSpec should match');
  assertEqual(entry.outSpec, 'media:enc=utf-8;ext=txt', 'outSpec should match');
  assertEqual(entry.urnTags.op, 'extract', 'op tag should match');
}

// TEST6468: Machine media registry entry construction
function test6468_Machine_mediaRegistryEntry_construction() {
  const entry = new MediaRegistryEntry({
    urn: 'media:ext=pdf',
    title: 'PDF Document',
    media_type: 'application/pdf',
    description: 'Portable Document Format'
  });
  assertEqual(entry.urn, 'media:ext=pdf', 'URN should match');
  assertEqual(entry.title, 'PDF Document', 'Title should match');
  assertEqual(entry.mediaType, 'application/pdf', 'Media type should match');
  assertEqual(entry.description, 'Portable Document Format', 'Description should match');
}

// TEST6469: Machine cap registry client construction
function test6469_Machine_capRegistryClient_construction() {
  const client = new FabricRegistryClient('https://example.com', 600);
  assert(client !== null, 'Client should be constructed');
  // Invalidate should not throw
  client.invalidate();
}

// TEST6470: Machine cap registry entry defaults
function test6470_Machine_capRegistryEntry_defaults() {
  // Verify that missing fields default gracefully
  const entry = new FabricRegistryEntry({ urn: 'cap:in=media:;test;out=media:' });
  assertEqual(entry.urn, 'cap:in=media:;test;out=media:', 'URN should match');
  assertEqual(entry.title, '', 'Title should default to empty');
  assertEqual(entry.description, '', 'Description should default to empty');
  assert(Array.isArray(entry.aliases) && entry.aliases.length === 0, 'Aliases should default to an empty array');
  assert(Array.isArray(entry.args), 'Args should default to array');
  assertEqual(entry.args.length, 0, 'Args should be empty');
}

// Helper for machine error tests
function assertThrowsWithCode(fn, expectedCode) {
  try {
    fn();
    throw new Error(`Expected ${expectedCode} error but no error was thrown`);
  } catch (e) {
    if (e.code !== expectedCode) {
      throw new Error(`Expected error code '${expectedCode}' but got '${e.code}': ${e.message}`);
    }
  }
}

// ============================================================================
// cap-fab-renderer helpers — pure functions that do not require a DOM.
// The renderer class itself needs cytoscape + DOM and is exercised by hand
// in the browser; these tests cover the pure data transforms underneath it.
// ============================================================================

import {
  cardinalityLabel as rendererCardinalityLabel,
  cardinalityFromCap as rendererCardinalityFromCap,
  canonicalMediaUrn as rendererCanonicalMediaUrn,
  mediaNodeLabel as rendererMediaNodeLabel,
  buildBrowseGraphData as rendererBuildBrowseGraphData,
  buildStrandGraphData as rendererBuildStrandGraphData,
  collapseStrandShapeTransitions as rendererCollapseStrandShapeTransitions,
  buildRunGraphData as rendererBuildRunGraphData,
  buildEditorGraphData as rendererBuildEditorGraphData,
  buildResolvedMachineGraphData as rendererBuildResolvedMachineGraphData,
  classifyStrandCapSteps as rendererClassifyStrandCapSteps,
  validateStrandPayload as rendererValidateStrandPayload,
  validateRunPayload as rendererValidateRunPayload,
  validateEditorGraphPayload as rendererValidateEditorGraphPayload,
  validateResolvedMachinePayload as rendererValidateResolvedMachinePayload,
  validateStrandStep as rendererValidateStrandStep,
  validateBodyOutcome as rendererValidateBodyOutcome,
} from './cap-fab-renderer.js';

// TEST6471: Renderer cardinality label all four cases
function test6471_Renderer_cardinalityLabel_allFourCases() {
  assertEqual(rendererCardinalityLabel(false, false), '1\u21921', 'scalar-to-scalar');
  assertEqual(rendererCardinalityLabel(true, false),  'n\u21921', 'sequence-to-scalar');
  assertEqual(rendererCardinalityLabel(false, true),  '1\u2192n', 'scalar-to-sequence');
  assertEqual(rendererCardinalityLabel(true, true),   'n\u2192n', 'sequence-to-sequence');
}

// TEST6472: Renderer cardinality label uses unicode arrow
function test6472_Renderer_cardinalityLabel_usesUnicodeArrow() {
  // The label must use the real rightwards arrow (U+2192), not ASCII "->".
  // Downstream styling and tests depend on this glyph.
  const label = rendererCardinalityLabel(false, true);
  assert(label.includes('\u2192'), 'label should contain U+2192 rightwards arrow');
  assert(!label.includes('->'), 'label must not contain the ASCII replacement "->"');
}

// TEST6473: Renderer cardinality from cap finds stdin arg not first arg
function test6473_Renderer_cardinalityFromCap_findsStdinArgNotFirstArg() {
  // The main input arg is the one whose sources include a stdin source.
  // A naive implementation that reads args[0] would see `cli-only` (not a
  // sequence) and report 1→1 even though the stdin arg is a sequence.
  const cap = {
    urn: 'cap:in="media:enc=utf-8;list";transcribe;out="media:enc=utf-8"',
    args: [
      {
        display_name: 'cli-only',
        is_sequence: false,
        sources: [{ cli_flag: '--mode' }],
      },
      {
        display_name: 'main-input',
        is_sequence: true,
        sources: [{ stdin: {} }],
      },
    ],
    output: { is_sequence: false },
  };
  assertEqual(rendererCardinalityFromCap(cap), 'n\u21921',
    'must pick the arg that has a stdin source, not args[0]');
}

// TEST6474: Renderer cardinality from cap scalar defaults when fields missing
function test6474_Renderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing() {
  // No args and no output: both sides collapse to 1 (scalar default).
  // If a bug makes the function return "n" for missing data, this fails.
  const cap = { urn: 'cap:in="media:";noop;out="media:"' };
  assertEqual(rendererCardinalityFromCap(cap), '1\u21921',
    'missing args/output must default to scalar on both sides');
}

// TEST6475: Renderer cardinality from cap output only sequence
function test6475_Renderer_cardinalityFromCap_outputOnlySequence() {
  // One scalar stdin arg, output is a sequence: expects 1→n.
  const cap = {
    urn: 'cap:in="media:enc=utf-8";generate;out="media:enc=utf-8;list"',
    args: [{ sources: [{ stdin: {} }], is_sequence: false }],
    output: { is_sequence: true },
  };
  assertEqual(rendererCardinalityFromCap(cap), '1\u2192n',
    'scalar stdin with sequence output must yield 1→n');
}

// TEST6476: Renderer cardinality from cap rejects string is sequence
function test6476_Renderer_cardinalityFromCap_rejectsStringIsSequence() {
  // The function must use strict `=== true` to avoid treating truthy strings
  // as booleans. "true" is a string, not a boolean — it must NOT be treated
  // as a sequence, because downstream renderers expect boolean semantics.
  const cap = {
    urn: 'cap:in="media:";x;out="media:"',
    args: [{ sources: [{ stdin: {} }], is_sequence: 'true' }],
    output: { is_sequence: 'true' },
  };
  assertEqual(rendererCardinalityFromCap(cap), '1\u21921',
    'string "true" must not be treated as boolean true');
}

// TEST6478: Renderer cardinality from cap throws on non object
function test6478_Renderer_cardinalityFromCap_throwsOnNonObject() {
  // Fail-hard on invalid input; no fallback to a default cardinality.
  let threw = false;
  try {
    rendererCardinalityFromCap(null);
  } catch (e) {
    threw = true;
  }
  assert(threw, 'cardinalityFromCap(null) must throw');

  threw = false;
  try {
    rendererCardinalityFromCap('not-an-object');
  } catch (e) {
    threw = true;
  }
  assert(threw, 'cardinalityFromCap(string) must throw');
}

// TEST6479: Renderer canonical media urn normalizes tag order
function test6479_Renderer_canonicalMediaUrn_normalizesTagOrder() {
  // Two media URNs with identical tags in different input orders must
  // produce the same canonical string. If canonicalization is bypassed,
  // the two strings remain different and this test exposes it.
  const a = rendererCanonicalMediaUrn('media:video;h264;list');
  const b = rendererCanonicalMediaUrn('media:list;h264;video');
  assertEqual(a, b, 'tag-order differences must not survive canonicalization');
}

// TEST6480: Renderer canonical media urn preserves value tags
function test6480_Renderer_canonicalMediaUrn_preservesValueTags() {
  const c = rendererCanonicalMediaUrn('media:model;quant=q4');
  assert(c.includes('quant=q4'), 'value tag must be preserved');
}

// TEST6481: Renderer canonical media urn rejects cap urn
function test6481_Renderer_canonicalMediaUrn_rejectsCapUrn() {
  // MediaUrn.fromString enforces the media: prefix. Feeding a cap URN to
  // canonicalMediaUrn must fail hard.
  let threw = false;
  try {
    rendererCanonicalMediaUrn('cap:x;in="media:";out="media:"');
  } catch (e) {
    threw = true;
  }
  assert(threw, 'canonicalMediaUrn must reject non-media URNs');
}

// TEST6482: Renderer media node label rejects urn derived labels
function test6482_Renderer_mediaNodeLabel_rejectsUrnDerivedLabels() {
  let threw = false;
  let message = '';
  try {
    rendererMediaNodeLabel('media:video;quant=q4');
  } catch (e) {
    threw = true;
    message = e.message || '';
  }
  assert(threw, 'mediaNodeLabel must reject URN-derived labels');
  assert(message.includes('no longer supported'),
    'error must explain that explicit titles are required');
}

// TEST6483: Renderer build browse graph data rejects missing media titles
function test6483_Renderer_buildBrowseGraphData_rejectsMissingMediaTitles() {
  let threw = false;
  let message = '';
  try {
    rendererBuildBrowseGraphData([
      {
        urn: 'cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"',
        title: 'Extract Text',
        in_spec: 'media:ext=pdf',
        out_spec: 'media:enc=utf-8;ext=txt',
        in_media_title: 'PDF',
        out_media_title: '',
      },
    ]);
  } catch (e) {
    threw = true;
    message = e.message || '';
  }
  assert(threw, 'browse builder must reject missing explicit media titles');
  assert(message.includes('out_media_title'),
    'error must identify the missing explicit media title field');
}

// ---------------- strand builder ----------------

let fixtureStepToken = 0;

function nextFixtureStepToken() {
  fixtureStepToken += 1;
  return `fixture-step-${fixtureStepToken}`;
}

function makeCapStep(capUrn, title, fromSpec, toSpec, inSeq, outSeq) {
  return {
    token_id: nextFixtureStepToken(),
    step_type: {
      Cap: {
        cap_urn: capUrn,
        title,
        specificity: 0,
        input_is_sequence: inSeq,
        output_is_sequence: outSeq,
        inputs: [{ arg_urn: fromSpec, source: 'StrandInput' }],
      },
    },
    from_spec: fromSpec,
    to_spec: toSpec,
  };
}

function makeForEachStep(mediaDef) {
  return {
    token_id: nextFixtureStepToken(),
    step_type: { ForEach: { media_def: mediaDef } },
    from_spec: mediaDef,
    to_spec: mediaDef,
  };
}

function makeCollectStep(mediaDef) {
  return {
    token_id: nextFixtureStepToken(),
    step_type: { Collect: { media_def: mediaDef } },
    from_spec: mediaDef,
    to_spec: mediaDef,
  };
}

// Build an intentionally linear fixture while still spelling the canonical
// stable-token producer graph that production payloads carry. ForEach changes
// cardinality but does not replace the current value producer; Collect does.
function wireLinearStepInputs(steps) {
  let producerToken = null;
  for (const step of steps) {
    if (step.step_type.Cap) {
      step.step_type.Cap.inputs = [{
        arg_urn: step.from_spec,
        source: producerToken === null
          ? 'StrandInput'
          : { Step: { token_id: producerToken } },
      }];
      producerToken = step.token_id;
    } else if (step.step_type.Collect) {
      producerToken = step.token_id;
    }
  }
  return steps;
}

// TEST6484: Renderer validate strand step rejects unknown variant
function test6484_Renderer_validateStrandStep_rejectsUnknownVariant() {
  // A step with an unknown variant must fail hard at validation; no
  // silent coercion.
  let threw = false;
  try {
    rendererValidateStrandStep({
      token_id: nextFixtureStepToken(),
      step_type: { WrongVariant: {} },
      from_spec: 'media:a',
      to_spec: 'media:a',
    }, 'test');
  } catch (e) {
    threw = true;
    assert(e.message.includes('WrongVariant'), 'error must name the bad variant');
  }
  assert(threw, 'unknown variant must throw');
}

// TEST6486: Renderer validate strand step requires boolean is sequence
function test6486_Renderer_validateStrandStep_requiresBooleanIsSequence() {
  // A Cap variant must have boolean is_sequence fields; number or string
  // must reject.
  let threw = false;
  try {
    rendererValidateStrandStep({
      token_id: nextFixtureStepToken(),
      step_type: { Cap: {
        cap_urn: 'cap:in="media:a";x;out="media:b"',
        title: 't',
        input_is_sequence: 1,  // number, not boolean
        output_is_sequence: false,
      }},
      from_spec: 'media:a',
      to_spec: 'media:b',
    }, 'test');
  } catch (e) {
    threw = true;
    assert(e.message.includes('input_is_sequence'), 'error must name the bad field');
  }
  assert(threw, 'non-boolean is_sequence must throw');
}

// TEST6487: Renderer classify strand cap steps cap flags
function test6487_Renderer_classifyStrandCapSteps_capFlags() {
  // Strand: ForEach → cap1 → cap2 → cap3 → Collect. cap1 should have
  // prevForEach=true; cap3 should have nextCollect=true; cap2 should
  // have neither.
  const steps = wireLinearStepInputs([
    makeForEachStep('media:ext=pdf;list'),
    makeCapStep('cap:in="media:ext=pdf";a;out="media:ext=png;image"', 'a', 'media:ext=pdf', 'media:ext=png;image', false, false),
    makeCapStep('cap:in="media:ext=png;image";b;out="media:ext=jpg"', 'b', 'media:ext=png;image', 'media:ext=jpg', false, false),
    makeCapStep('cap:in="media:ext=jpg";c;out="media:ext=txt"', 'c', 'media:ext=jpg', 'media:ext=txt', false, false),
    makeCollectStep('media:ext=txt'),
  ]);
  const { capStepIndices, capFlags } = rendererClassifyStrandCapSteps(steps);
  assertEqual(capStepIndices.length, 3, 'three cap steps');
  assert(capFlags.get(1).prevForEach, 'cap1 has prevForEach');
  assert(!capFlags.get(1).nextCollect, 'cap1 has no nextCollect');
  assert(!capFlags.get(2).prevForEach, 'cap2 has no prevForEach');
  assert(!capFlags.get(2).nextCollect, 'cap2 has no nextCollect');
  assert(!capFlags.get(3).prevForEach, 'cap3 has no prevForEach');
  assert(capFlags.get(3).nextCollect, 'cap3 has nextCollect');
}

// TEST6488: Renderer classify strand cap steps nested forks
function test6488_Renderer_classifyStrandCapSteps_nestedForks() {
  // Nested strand: ForEach → cap1 → ForEach → cap2 → Collect → cap3 → Collect.
  // cap1 has prevForEach (outer), cap2 has prevForEach (inner) and
  // nextCollect (inner), cap3 has nextCollect (outer).
  const steps = wireLinearStepInputs([
    makeForEachStep('media:a;list'),
    makeCapStep('cap:in="media:a";a;out="media:b"', 'a', 'media:a', 'media:b', false, false),
    makeForEachStep('media:b;list'),
    makeCapStep('cap:in="media:b";b;out="media:c"', 'b', 'media:b', 'media:c', false, false),
    makeCollectStep('media:c'),
    makeCapStep('cap:in="media:c";c;out="media:d"', 'c', 'media:c', 'media:d', false, false),
    makeCollectStep('media:d'),
  ]);
  const { capFlags } = rendererClassifyStrandCapSteps(steps);
  assert(capFlags.get(1).prevForEach && !capFlags.get(1).nextCollect, 'cap1 outer entry');
  assert(capFlags.get(3).prevForEach && capFlags.get(3).nextCollect, 'cap2 inner both');
  assert(!capFlags.get(5).prevForEach && capFlags.get(5).nextCollect, 'cap3 outer exit');
}

// Helper: find an edge with the given source/target ids.
function findEdge(edges, source, target) {
  return edges.find(e => e.source === source && e.target === target);
}

function withMediaDisplayNames(payload, mediaDisplayNames) {
  return Object.assign({}, payload, {
    media_display_names: Object.assign({}, mediaDisplayNames),
  });
}

// TEST6489: Renderer build strand graph data single cap plain
function test6489_Renderer_buildStrandGraphData_singleCapPlain() {
  // Minimal strand with one plain 1→1 cap. Plan builder produces:
  //   input_slot → step_0 (cap) → output
  // (two edges, three nodes). No cardinality marker in the cap label
  // because input_is_sequence == output_is_sequence == false.
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:a',
    target_media_urn: 'media:b',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:a";x;out="media:b"', 'x', 'media:a', 'media:b', false, false),
    ]),
  }, {
    'media:a': 'Source A',
    'media:b': 'Target B',
  });
  const built = rendererBuildStrandGraphData(payload);
  const nodeIds = built.nodes.map(n => n.id).sort();
  assertEqual(JSON.stringify(nodeIds), JSON.stringify(['input_slot', 'output', 'step_0']),
    'nodes are input_slot + step_0 + output (positional ids)');
  assertEqual(built.edges.length, 2, 'two edges: input_slot→step_0 and step_0→output');
  const capEdge = findEdge(built.edges, 'input_slot', 'step_0');
  assert(capEdge !== undefined, 'cap edge from input_slot to step_0 exists');
  assertEqual(capEdge.label, 'x', 'plain cap edge label is the cap title with no cardinality marker');
  const outEdge = findEdge(built.edges, 'step_0', 'output');
  assert(outEdge !== undefined, 'output edge from step_0 to output exists');
}

// TEST6491: Renderer build strand graph data sequence shows cardinality
function test6491_Renderer_buildStrandGraphData_sequenceShowsCardinality() {
  // A cap with input_is_sequence=true MUST emit "(n→1)" on its edge
  // label.
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:a;list',
    target_media_urn: 'media:b',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:a;list";x;out="media:b"', 'x', 'media:a;list', 'media:b', true, false),
    ]),
  }, {
    'media:a;list': 'Source A List',
    'media:b': 'Target B',
  });
  const built = rendererBuildStrandGraphData(payload);
  const capEdge = findEdge(built.edges, 'input_slot', 'step_0');
  assert(capEdge !== undefined, 'cap edge exists');
  assert(capEdge.label.includes('(n\u21921)'),
    `cap edge label must include (n\u21921) marker; got: ${capEdge.label}`);
}

// TEST6492: Renderer build strand graph data foreach collect span
function test6492_Renderer_buildStrandGraphData_foreachCollectSpan() {
  // Strand: [ForEach, Cap, Collect]. Plan builder produces:
  //   input_slot (source) →direct→ step_1 (cap) — cap emits its own
  //                                              direct edge from prev
  //   input_slot →direct→ step_0 (foreach)      — created when Collect
  //   step_0 →iteration→ step_1                 — iteration edge
  //   step_1 →collection→ step_2 (collect)      — collection edge
  //   step_2 →direct→ output                    — output connector
  //
  // (six nodes: input_slot, step_0, step_1, step_2, output; five
  // edges.) ForEach and Collect are REAL nodes in the graph, not
  // labels on cap edges — they're distinct processing units in the
  // plan. This mirrors capdag's plan_builder.rs exactly.
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:ext=pdf;list',
    target_media_urn: 'media:txt;list',
    steps: wireLinearStepInputs([
      makeForEachStep('media:ext=pdf;list'),
      makeCapStep('cap:in="media:ext=pdf";extract;out="media:ext=txt"', 'extract', 'media:ext=pdf', 'media:ext=txt', false, false),
      makeCollectStep('media:ext=txt'),
    ]),
  }, {
    'media:ext=pdf;list': 'PDF List',
    'media:ext=txt': 'Plain Text',
    'media:txt;list': 'Text List',
  });
  const built = rendererBuildStrandGraphData(payload);
  const nodeIds = built.nodes.map(n => n.id).sort();
  assertEqual(JSON.stringify(nodeIds),
    JSON.stringify(['input_slot', 'output', 'step_0', 'step_1', 'step_2']),
    'positional nodes for source, foreach, cap, collect, output');

  // The five edges the plan builder would produce:
  assert(findEdge(built.edges, 'input_slot', 'step_1') !== undefined,
    'cap direct edge input_slot→step_1 (prev wasn\'t advanced by ForEach)');
  assert(findEdge(built.edges, 'input_slot', 'step_0') !== undefined,
    'foreach input edge input_slot→step_0');
  assert(findEdge(built.edges, 'step_0', 'step_1') !== undefined,
    'iteration edge step_0→step_1 (body entry)');
  assert(findEdge(built.edges, 'step_1', 'step_2') !== undefined,
    'collection edge step_1→step_2 (body exit → collect)');
  assert(findEdge(built.edges, 'step_2', 'output') !== undefined,
    'output edge step_2→output');

  // ForEach and Collect nodes carry their canonical labels.
  const foreachNode = built.nodes.find(n => n.id === 'step_0');
  assertEqual(foreachNode.label, 'for each', 'ForEach node labeled "for each"');
  const collectNode = built.nodes.find(n => n.id === 'step_2');
  assertEqual(collectNode.label, 'collect', 'Collect node labeled "collect"');
}

// TEST6493: Renderer build strand graph data standalone collect
function test6493_Renderer_buildStrandGraphData_standaloneCollect() {
  // Strand with a standalone Collect (no enclosing ForEach). Plan
  // builder creates a Collect node consuming prev directly — plain
  // direct edge, no iteration/collection semantics.
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:a',
    target_media_urn: 'media:b;list',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:a";x;out="media:b"', 'x', 'media:a', 'media:b', false, false),
      makeCollectStep('media:b'),
    ]),
  }, {
    'media:a': 'Source A',
    'media:b': 'Target B',
    'media:b;list': 'Target B List',
  });
  const built = rendererBuildStrandGraphData(payload);
  assert(findEdge(built.edges, 'input_slot', 'step_0') !== undefined,
    'cap edge input_slot → step_0');
  assert(findEdge(built.edges, 'step_0', 'step_1') !== undefined,
    'standalone collect edge step_0 → step_1 (Collect node)');
  assert(findEdge(built.edges, 'step_1', 'output') !== undefined,
    'output edge step_1 → output');
  const collectNode = built.nodes.find(n => n.id === 'step_1');
  assertEqual(collectNode.label, 'collect', 'Collect node labeled "collect"');
}

// TEST6494: Renderer build strand graph data unclosed for each body
function test6494_Renderer_buildStrandGraphData_unclosedForEachBody() {
  // Strand: [Cap_a, ForEach, Cap_b] with no closing Collect. The plan
  // builder's "unclosed ForEach" branch creates a ForEach node
  // connecting Cap_a to Cap_b via iteration, with prev becoming the
  // body exit (Cap_b).
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:a',
    target_media_urn: 'media:c',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:a";a;out="media:b"', 'a', 'media:a', 'media:b', false, false),
      makeForEachStep('media:b'),
      makeCapStep('cap:in="media:b";b;out="media:c"', 'b', 'media:b', 'media:c', false, false),
    ]),
  }, {
    'media:a': 'Source A',
    'media:b': 'Intermediate B',
    'media:c': 'Target C',
  });
  const built = rendererBuildStrandGraphData(payload);
  // Cap_a connects from input_slot.
  assert(findEdge(built.edges, 'input_slot', 'step_0') !== undefined,
    'cap_a edge input_slot → step_0');
  // Cap_b still connects directly from step_0 (the ForEach didn't
  // advance prev). This mirrors plan_builder.
  assert(findEdge(built.edges, 'step_0', 'step_2') !== undefined,
    'cap_b direct edge step_0 → step_2');
  // ForEach node at step_1 with direct edge from step_0 and iteration
  // edge to step_2.
  assert(findEdge(built.edges, 'step_0', 'step_1') !== undefined,
    'foreach input edge step_0 → step_1');
  assert(findEdge(built.edges, 'step_1', 'step_2') !== undefined,
    'iteration edge step_1 → step_2 (body entry)');
  // Output connects from step_2 (body exit).
  assert(findEdge(built.edges, 'step_2', 'output') !== undefined,
    'output edge step_2 → output');
}

// TEST6495: Renderer build strand graph data nested for each throws
function test6495_Renderer_buildStrandGraphData_nestedForEachThrows() {
  // Nested ForEach without an intervening body cap in the outer
  // ForEach is an illegal nesting per plan_builder. The renderer
  // must throw the same error to surface the issue rather than
  // render a malformed graph.
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:a;list',
    target_media_urn: 'media:a',
    steps: wireLinearStepInputs([
      makeForEachStep('media:a;list'),
      makeForEachStep('media:a'),
      makeCapStep('cap:in="media:a";x;out="media:a"', 'x', 'media:a', 'media:a', false, false),
    ]),
  }, {
    'media:a;list': 'Source A List',
    'media:a': 'Source A',
  });
  let threw = false;
  try {
    rendererBuildStrandGraphData(payload);
  } catch (e) {
    threw = true;
    assert(e.message.includes('nested ForEach'),
      'error must name the nested-ForEach violation');
  }
  assert(threw, 'nested ForEach without outer body cap must throw');
}

// TEST6496: Renderer collapse strand single cap body keeps cap own label
function test6496_Renderer_collapseStrand_singleCapBodyKeepsCapOwnLabel() {
  // User spec: ForEach/Collect are NOT rendered as nodes, and
  // the collapse does NOT relabel cap edges. Each cap edge
  // carries whatever label the strand builder emitted — the
  // cap's own cardinality marker (from its input/output sequence
  // flags) is the only source of truth.
  //
  // Strand [ForEach, Cap(extract, in=1, out=1), Collect],
  // source=pdf;list, target=txt;list. The extract cap itself is
  // 1→1, so its edge label has NO cardinality marker.
  //
  // Expected render shape: 3 nodes (input_slot, step_1, output),
  // with the entry edge labeled "extract" and an unlabeled
  // connector bridge to the output.
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:ext=pdf;list',
    target_media_urn: 'media:txt;list',
    steps: wireLinearStepInputs([
      makeForEachStep('media:ext=pdf;list'),
      makeCapStep('cap:in="media:ext=pdf";extract;out="media:ext=txt"', 'extract', 'media:ext=pdf', 'media:ext=txt', false, false),
      makeCollectStep('media:ext=txt'),
    ]),
  }, {
    'media:ext=pdf;list': 'PDF List',
    'media:ext=txt': 'Plain Text',
    'media:txt;list': 'Text List',
  });
  const built = rendererBuildStrandGraphData(payload);
  const collapsed = rendererCollapseStrandShapeTransitions(built);

  const nodeIds = collapsed.nodes.map(n => n.id).sort();
  assertEqual(JSON.stringify(nodeIds),
    JSON.stringify(['input_slot', 'output', 'step_1']),
    'collapse removes the ForEach and Collect nodes; the remaining nodes are source + cap + target');

  // Exactly one edge input_slot → step_1 carrying just the cap
  // title — no (1→n) or (n→n) marker because the cap's own
  // cardinality is 1→1.
  const entryEdges = collapsed.edges.filter(e => e.source === 'input_slot' && e.target === 'step_1');
  assertEqual(entryEdges.length, 1,
    'phantom duplicate cap edge must be gone — exactly one edge from source to cap');
  assertEqual(entryEdges[0].label, 'extract',
    'entry edge carries just the cap title (cap is 1→1, no marker)');

  // The collect bridge is an unlabeled connector.
  const exitEdges = collapsed.edges.filter(e => e.source === 'step_1' && e.target === 'output');
  assertEqual(exitEdges.length, 1,
    'there is exactly one exit edge step_1 → output');
  assertEqual(exitEdges[0].label, '',
    'collect bridge is unlabeled');
}

// TEST6497: Renderer collapse strand unclosed for each body collapses
function test6497_Renderer_collapseStrand_unclosedForEachBodyCollapses() {
  // [Cap_a(1→1), ForEach, Cap_b(1→1)] with no Collect,
  // source=media:a, target=media:c. Cap_b's to_spec is media:c
  // which is equivalent to target_media_urn, so the output node is
  // merged into step_2.
  //
  // Since both caps are 1→1, neither carries a cardinality
  // marker in the render. The foreach step is just dropped;
  // no relabeling.
  //
  // Final: 3 nodes (input_slot, step_0, step_2), 2 edges.
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:a',
    target_media_urn: 'media:c',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:a";a;out="media:b"', 'a', 'media:a', 'media:b', false, false),
      makeForEachStep('media:b'),
      makeCapStep('cap:in="media:b";b;out="media:c"', 'b', 'media:b', 'media:c', false, false),
    ]),
  }, {
    'media:a': 'Source A',
    'media:b': 'Intermediate B',
    'media:c': 'Target C',
  });
  const built = rendererBuildStrandGraphData(payload);
  const collapsed = rendererCollapseStrandShapeTransitions(built);

  const nodeIds = collapsed.nodes.map(n => n.id).sort();
  assertEqual(JSON.stringify(nodeIds),
    JSON.stringify(['input_slot', 'step_0', 'step_2']),
    'foreach node removed and output merged into step_2 (same URN as target)');

  // Exactly one edge from step_0 to step_2, labeled with just
  // cap_b's title — no foreach marker because cap_b is 1→1 and
  // the collapse doesn't relabel cap edges.
  const step0ToStep2 = collapsed.edges.filter(e => e.source === 'step_0' && e.target === 'step_2');
  assertEqual(step0ToStep2.length, 1,
    'exactly one step_0 → step_2 edge after dropping the foreach iteration');
  assertEqual(step0ToStep2[0].label, 'b',
    'cap_b edge carries just its title (1→1 cap, no marker)');

  // Cap_a's edge is unchanged.
  const capA = collapsed.edges.find(e => e.source === 'input_slot' && e.target === 'step_0');
  assert(capA !== undefined, 'cap_a edge input_slot → step_0 exists');
  assertEqual(capA.label, 'a', 'cap_a edge carries just its title');

  // After merging, step_2 becomes the render target — no separate
  // output node exists.
  const outputNode = collapsed.nodes.find(n => n.id === 'output');
  assertEqual(outputNode, undefined,
    'output node was merged into step_2 because their URNs are semantically equivalent');
  const mergedTarget = collapsed.nodes.find(n => n.id === 'step_2');
  assertEqual(mergedTarget.nodeClass, 'strand-target',
    'merged step_2 takes on the strand-target role');
}

// TEST6498: Renderer collapse strand standalone collect collapses
function test6498_Renderer_collapseStrand_standaloneCollectCollapses() {
  // [Cap, Collect] with no enclosing ForEach, source=media:a,
  // target=media:b;list (NOT equivalent to cap's to_spec media:b,
  // so the output node is retained after collapse).
  //
  // Collapse:
  //   - step_1 (standalone Collect) removed.
  //   - Synthesized bridging edge step_0 → output labeled "collect".
  //   - The cap edge input_slot → step_0 is unchanged because the
  //     cap is not inside any foreach body.
  //
  // Final: 3 nodes (input_slot, step_0, output), 2 edges.
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:a',
    target_media_urn: 'media:b;list',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:a";x;out="media:b"', 'x', 'media:a', 'media:b', false, false),
      makeCollectStep('media:b'),
    ]),
  }, {
    'media:a': 'Source A',
    'media:b': 'Target B',
    'media:b;list': 'Target B List',
  });
  const built = rendererBuildStrandGraphData(payload);
  const collapsed = rendererCollapseStrandShapeTransitions(built);

  const nodeIds = collapsed.nodes.map(n => n.id).sort();
  assertEqual(JSON.stringify(nodeIds),
    JSON.stringify(['input_slot', 'output', 'step_0']),
    'collect node removed; only cap + source + target remain');

  const capEdge = collapsed.edges.find(e => e.source === 'input_slot' && e.target === 'step_0');
  assert(capEdge !== undefined, 'cap edge survives');
  assertEqual(capEdge.label, 'x',
    'cap edge carries just its title — no foreach cardinality markers because the cap is not inside a foreach body');

  const collectEdge = collapsed.edges.find(e => e.source === 'step_0' && e.target === 'output');
  assert(collectEdge !== undefined, 'step_0 → output edge synthesized by collect collapse');
  assertEqual(collectEdge.label, '',
    'the synthesized bridging edge for a standalone Collect is an unlabeled connector (cap labels carry all cardinality info)');
}

// TEST6499: Renderer collapse strand sequence producing cap before foreach
function test6499_Renderer_collapseStrand_sequenceProducingCapBeforeForeach() {
  // Regression test mirroring the user's real strand:
  // [Cap_disbind (output_is_sequence=true), ForEach, Cap_make_decision],
  // source = media:ext=pdf, target = media:decision (equivalent to
  // the last cap's to_spec).
  //
  // Expected render shape after collapse:
  //   input_slot → step_0 labeled "Disbind PDF Into Pages (1→n)"
  //       — from Disbind's own output_is_sequence flag, computed
  //       at build time by the strand builder.
  //   step_0 → step_2 labeled "Make a Decision" — no marker
  //       because make_decision is 1→1. The collapse does NOT
  //       add a (1→n) marker on this edge — the (1→n) belongs
  //       to the cap that actually produces the sequence
  //       (Disbind), NOT the cap that consumes one item from it.
  //   No separate output node because step_2's to_spec equals the
  //       strand target.
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:ext=pdf',
    target_media_urn: 'media:decision',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:ext=pdf";disbind;out="media:page"', 'Disbind', 'media:ext=pdf', 'media:page', false, true),
      makeForEachStep('media:page'),
      makeCapStep('cap:in="media:page";decide;out="media:decision"', 'Make a Decision', 'media:page', 'media:decision', false, false),
    ]),
  }, {
    'media:ext=pdf': 'PDF',
    'media:page': 'Page',
    'media:decision': 'Decision',
  });
  const built = rendererBuildStrandGraphData(payload);
  const collapsed = rendererCollapseStrandShapeTransitions(built);

  const nodeIds = collapsed.nodes.map(n => n.id).sort();
  assertEqual(JSON.stringify(nodeIds),
    JSON.stringify(['input_slot', 'step_0', 'step_2']),
    'foreach node and duplicate output node both removed');

  // Disbind cap edge carries its own (1→n) marker from
  // output_is_sequence=true, NOT from the foreach flag.
  const disbind = collapsed.edges.find(e => e.source === 'input_slot' && e.target === 'step_0');
  assert(disbind !== undefined, 'Disbind edge input_slot → step_0 exists');
  assertEqual(disbind.label, 'Disbind (1\u2192n)',
    'Disbind edge reflects its own output_is_sequence=true cardinality');

  // make_decision cap edge — the plan-builder phantom direct
  // edge becomes the render-visible cap edge, carrying just the
  // cap title. No (1→n) marker: make_decision is 1→1, and the
  // collapse does NOT add cardinality markers based on foreach
  // context. The fan-out semantics come from Disbind's own
  // output_is_sequence flag, which is already visible on the
  // Disbind edge.
  const makeDecision = collapsed.edges.filter(e => e.source === 'step_0' && e.target === 'step_2');
  assertEqual(makeDecision.length, 1,
    'exactly one edge from Text Page to Decision (phantom not duplicated)');
  assertEqual(makeDecision[0].label, 'Make a Decision',
    'the make_decision edge carries just its title — 1→1 cap, no marker');

  // Duplicate target must be gone.
  const outputNode = collapsed.nodes.find(n => n.id === 'output');
  assertEqual(outputNode, undefined,
    'output node merged into step_2 because they represent the same URN');
}

// TEST6500: Renderer collapse strand plain cap merges trailing output
function test6500_Renderer_collapseStrand_plainCapMergesTrailingOutput() {
  // A strand with a single plain 1→1 cap whose to_spec equals
  // target_media_urn. The plan-builder topology produces:
  //   input_slot → step_0 (cap) → output
  // The collapse pass merges the trailing output edge because
  // step_0 and output represent the same URN (media:b).
  //
  // Final: 2 nodes (input_slot, step_0), 1 edge.
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:a',
    target_media_urn: 'media:b',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:a";x;out="media:b"', 'x', 'media:a', 'media:b', false, false),
    ]),
  }, {
    'media:a': 'Source A',
    'media:b': 'Target B',
  });
  const built = rendererBuildStrandGraphData(payload);
  const collapsed = rendererCollapseStrandShapeTransitions(built);

  assertEqual(collapsed.nodes.length, 2,
    'duplicate output node merged into step_0 — 2 nodes remain');
  const outputNode = collapsed.nodes.find(n => n.id === 'output');
  assertEqual(outputNode, undefined,
    'output node dropped by merge');
  const mergedTarget = collapsed.nodes.find(n => n.id === 'step_0');
  assertEqual(mergedTarget.nodeClass, 'strand-target',
    'step_0 takes on the strand-target role after the merge');

  assertEqual(collapsed.edges.length, 1, 'single cap edge remains');
  assertEqual(collapsed.edges[0].source, 'input_slot');
  assertEqual(collapsed.edges[0].target, 'step_0');
  assertEqual(collapsed.edges[0].label, 'x', 'cap title preserved as edge label');
}

// TEST6501: Renderer collapse strand plain cap distinct target no merge
function test6501_Renderer_collapseStrand_plainCapDistinctTargetNoMerge() {
  // A strand with a single plain cap whose to_spec is NOT
  // equivalent to target_media_urn. The output node must be retained
  // and the trailing connector edge preserved.
  const payload = withMediaDisplayNames({
    source_media_urn: 'media:a',
    target_media_urn: 'media:b;list',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:a";x;out="media:b"', 'x', 'media:a', 'media:b', false, false),
    ]),
  }, {
    'media:a': 'Source A',
    'media:b': 'Target B',
    'media:b;list': 'Target B List',
  });
  const built = rendererBuildStrandGraphData(payload);
  const collapsed = rendererCollapseStrandShapeTransitions(built);

  assertEqual(collapsed.nodes.length, 3,
    'no merge because cap to_spec (media:b) and target (media:b;list) are semantically distinct');
  assert(collapsed.nodes.find(n => n.id === 'output') !== undefined,
    'output node retained');
  assert(collapsed.nodes.find(n => n.id === 'step_0') !== undefined,
    'step_0 retained');
}

// TEST6502: Renderer validate strand payload missing source media urn
function test6502_Renderer_validateStrandPayload_missingSourceMediaUrn() {
  let threw = false;
  try {
    rendererValidateStrandPayload({ target_media_urn: 'media:b', steps: [] });
  } catch (e) {
    threw = true;
    assert(e.message.includes('source_media_urn'), 'error must name source_media_urn');
  }
  assert(threw, 'missing source_media_urn must throw');
}

// TEST7120: Renderer requires the authoritative cap input graph
function test7120_Renderer_validateStrandPayload_requiresAuthoritativeInputs() {
  const step = makeCapStep(
    'cap:in="media:a";x;out="media:b"',
    'x', 'media:a', 'media:b', false, false
  );
  const payload = { source_media_urn: 'media:a', target_media_urn: 'media:b', steps: [step] };

  const missing = JSON.parse(JSON.stringify(payload));
  delete missing.steps[0].step_type.Cap.inputs;
  assertThrowsMessage(
    () => rendererValidateStrandPayload(missing),
    'inputs must be an array',
    'a cap cannot omit its data-flow graph'
  );

  const empty = JSON.parse(JSON.stringify(payload));
  empty.steps[0].step_type.Cap.inputs = [];
  assertThrowsMessage(
    () => rendererValidateStrandPayload(empty),
    'must include the primary input',
    'a cap cannot omit its primary input'
  );

  const duplicate = JSON.parse(JSON.stringify(payload));
  duplicate.steps[0].step_type.Cap.inputs.push(
    { arg_urn: 'media:a', source: 'StrandInput' }
  );
  assertThrowsMessage(
    () => rendererValidateStrandPayload(duplicate),
    "duplicates 'media:a'",
    'one cap cannot bind the same argument slot twice'
  );

  const unresolved = JSON.parse(JSON.stringify(payload));
  unresolved.steps[0].step_type.Cap.inputs[0].source = { Step: { token_id: 'missing-step' } };
  assertThrowsMessage(
    () => rendererValidateStrandPayload(unresolved),
    'does not resolve to a strand step',
    'a cap input cannot name an unknown producer'
  );
}

// ---------------- run builder ----------------

function test6503_Renderer_validateBodyOutcome_rejectsNegativeIndex() {
  let threw = false;
  try {
    rendererValidateBodyOutcome({ body_index: -1, foreach_token_id: null, success: true, cap_urns: [], failed_token_id: null, failed_arg_urn: null }, 'test');
  } catch (e) {
    threw = true;
  }
  assert(threw, 'negative body_index must throw');
}

// TEST7121: Renderer body outcomes require an explicit stable failure coordinate
function test7121_Renderer_validateBodyOutcome_requiresExplicitFailureCoordinate() {
  rendererValidateBodyOutcome(
    { body_index: 0, foreach_token_id: null, success: false, cap_urns: [], failed_token_id: null, failed_arg_urn: null },
    'unattributed'
  );
  let threw = false;
  try {
    rendererValidateBodyOutcome({ body_index: 0, success: false, cap_urns: [] }, 'missing');
  } catch (error) {
    threw = true;
    assert(error.message.includes('foreach_token_id must be present as null or a stable ForEach step token'),
      'missing execution-region coordinate error must state the required wire shape');
  }
  assert(threw, 'omitting foreach_token_id must fail hard');

  threw = false;
  try {
    rendererValidateBodyOutcome(
      { body_index: 0, foreach_token_id: null, success: false, cap_urns: [], failed_arg_urn: null },
      'missing-failure-coordinate'
    );
  } catch (error) {
    threw = true;
    assert(error.message.includes('must be present as null or a stable step token'),
      'missing failure coordinate error must state the required wire shape');
  }
  assert(threw, 'omitting failed_token_id must fail hard');

  threw = false;
  try {
    rendererValidateBodyOutcome(
      { body_index: 0, foreach_token_id: null, success: false, cap_urns: [], failed_token_id: null },
      'missing-argument-coordinate'
    );
  } catch (error) {
    threw = true;
    assert(error.message.includes('must be present as null or an attributed argument URN'),
      'missing argument coordinate error must state the required wire shape');
  }
  assert(threw, 'omitting failed_arg_urn must fail hard');

  assertThrowsMessage(
    () => rendererValidateBodyOutcome(
      { body_index: 1, foreach_token_id: null, success: true, cap_urns: [], failed_token_id: null, failed_arg_urn: null },
      'nonzero-linear'
    ),
    'linear and must use body_index 0',
    'a bare ordinal cannot address a second linear body'
  );

  assertThrowsMessage(
    () => rendererValidateBodyOutcome(
      { body_index: Number.MAX_SAFE_INTEGER + 1, foreach_token_id: 'tok-foreach', success: true, cap_urns: [], failed_token_id: null, failed_arg_urn: null },
      'unsafe-coordinate'
    ),
    'non-negative safe integer',
    'JSON transport must not round a body coordinate'
  );
}

// TEST7122: Renderer body outcomes reject execution-region tokens for non-ForEach steps
function test7122_Renderer_validateRunPayload_requiresForEachRegionCoordinate() {
  const strand = {
    source_media_urn: 'media:a',
    target_media_urn: 'media:b',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:a";convert;out="media:b"', 'convert', 'media:a', 'media:b', false, false),
    ]),
  };
  const payload = {
    resolved_strand: strand,
    body_outcomes: [{
      body_index: 0,
      foreach_token_id: strand.steps[0].token_id,
      success: true,
      cap_urns: [],
      failed_token_id: null,
      failed_arg_urn: null,
    }],
    visible_success_count: 1,
    visible_failure_count: 0,
    total_body_count: 1,
  };
  assertThrowsMessage(
    () => rendererValidateRunPayload(payload),
    'does not resolve to a ForEach strand step',
    'a body outcome cannot use a cap token as its execution-region coordinate'
  );

  const duplicateCoordinate = {
    ...payload,
    body_outcomes: [0, 1].map(() => ({
      body_index: 0,
      foreach_token_id: null,
      success: true,
      cap_urns: [],
      failed_token_id: null,
      failed_arg_urn: null,
    })),
  };
  assertThrowsMessage(
    () => rendererValidateRunPayload(duplicateCoordinate),
    "duplicate body coordinate 'linear:0'",
    'one execution coordinate cannot acquire two outcomes'
  );
}

// TEST6504: Renderer build run graph data pages successes and failures
function test6504_Renderer_buildRunGraphData_pagesSuccessesAndFailures() {
  // 6 successes, 4 failures. visible=3+2, total=10. Body has 2
  // caps (a, b). Each body replica is a chain of:
  //   entry node + body_step_0 (cap a) + body_step_1 (cap b)
  // = 3 nodes per body. Failed bodies truncate at failed_token_id
  // (cap b, idx=1) so `traceEnd=2` — same 3-node chain.
  //
  // Total replica nodes: (3 success × 3) + (2 failure × 3) = 15.
  //
  // Show-more nodes: one for 3 hidden successes, one for 2 hidden
  // failures.
  const strand = {
    source_media_urn: 'media:ext=pdf;list',
    target_media_urn: 'media:ext=txt',
    steps: wireLinearStepInputs([
      makeForEachStep('media:ext=pdf;list'),
      makeCapStep('cap:in="media:ext=pdf";a;out="media:ext=png;image"', 'a', 'media:ext=pdf', 'media:ext=png;image', false, false),
      makeCapStep('cap:in="media:ext=png;image";b;out="media:ext=txt"', 'b', 'media:ext=png;image', 'media:ext=txt', false, false),
      makeCollectStep('media:ext=txt'),
    ]),
  };
  const outcomes = [];
  for (let i = 0; i < 6; i++) {
    outcomes.push({ body_index: i, foreach_token_id: strand.steps[0].token_id, success: true, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0, failed_token_id: null, failed_arg_urn: null });
  }
  for (let i = 6; i < 10; i++) {
    outcomes.push({
      body_index: i,
      foreach_token_id: strand.steps[0].token_id,
      success: false,
      cap_urns: [],
      saved_paths: [],
      total_bytes: 0,
      duration_ms: 0,
      failed_token_id: strand.steps[2].token_id,
      failed_arg_urn: null,
      error: 'oom',
    });
  }
  const payload = {
    resolved_strand: strand,
    media_display_names: {
      'media:ext=pdf;list': 'PDF List',
      'media:ext=pdf': 'PDF',
      'media:ext=png;image': 'PNG',
      'media:ext=txt': 'Text',
    },
    body_outcomes: outcomes,
    visible_success_count: 3,
    visible_failure_count: 2,
    total_body_count: 10,
  };
  const built = rendererBuildRunGraphData(payload);

  let successNodes = 0;
  let failureNodes = 0;
  for (const n of built.replicaNodes) {
    if (n.classes === 'body-success') successNodes++;
    if (n.classes === 'body-failure') failureNodes++;
  }
  assertEqual(successNodes, 3 * 3, '3 success bodies × (1 entry + 2 body caps) = 9 success replica nodes');
  assertEqual(failureNodes, 2 * 3, '2 failure bodies × (1 entry + 2 body caps) = 6 failure replica nodes');

  // Show-more nodes: one for success (hidden 3), one for failure (hidden 2).
  const successShowMore = built.showMoreNodes.find(n => n.data.showMoreGroup === 'success');
  const failureShowMore = built.showMoreNodes.find(n => n.data.showMoreGroup === 'failure');
  assert(successShowMore !== undefined, 'success show-more present');
  assert(failureShowMore !== undefined, 'failure show-more present');
  assertEqual(successShowMore.data.hiddenCount, 3, 'success hidden count = 3');
  assertEqual(failureShowMore.data.hiddenCount, 2, 'failure hidden count = 2');
}

// TEST6505: Renderer run graph keeps an unattributed body failure at its entry
function test6505_Renderer_buildRunGraphData_unattributedFailureStopsAtEntry() {
  // A failure without failed_token_id is machine-scoped. The body remains
  // visible, but no cap is falsely presented as the failure location.
  //
  // Strand [ForEach, Cap, Collect] → body has 1 cap. Each body
  // replica emits 1 entry node + 1 body cap node = 2 nodes.
  const strand = {
    source_media_urn: 'media:ext=pdf;list',
    target_media_urn: 'media:ext=txt',
    steps: wireLinearStepInputs([
      makeForEachStep('media:ext=pdf;list'),
      makeCapStep('cap:in="media:ext=pdf";a;out="media:ext=txt"', 'a', 'media:ext=pdf', 'media:ext=txt', false, false),
      makeCollectStep('media:ext=txt'),
    ]),
  };
  const payload = {
    resolved_strand: strand,
    media_display_names: {
      'media:ext=pdf;list': 'PDF List',
      'media:ext=pdf': 'PDF',
      'media:ext=txt': 'Text',
    },
    body_outcomes: [
      { body_index: 0, foreach_token_id: strand.steps[0].token_id, success: false, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0, failed_token_id: null, failed_arg_urn: null, error: 'unknown' },
    ],
    visible_success_count: 0,
    visible_failure_count: 5,
    total_body_count: 1,
  };
  const built = rendererBuildRunGraphData(payload);
  let failureNodes = 0;
  for (const n of built.replicaNodes) {
    if (n.classes === 'body-failure') failureNodes++;
  }
  assertEqual(failureNodes, 1, 'only the body entry is shown for an unattributed failure');
}

// TEST6506: Renderer run graph resolves a failure by exact stable step token
function test6506_Renderer_buildRunGraphData_resolvesExactFailedStepToken() {
  const strand = {
    source_media_urn: 'media:a',
    target_media_urn: 'media:c',
    steps: wireLinearStepInputs([
      makeForEachStep('media:a;list'),
      // Canonical form places tags alphabetically: op after in/out.
      makeCapStep(
        'cap:in="media:a";x;out="media:b"',
        'x', 'media:a', 'media:b', false, false
      ),
      makeCapStep(
        'cap:in="media:b";y;out="media:c"',
        'y', 'media:b', 'media:c', false, false
      ),
      makeCollectStep('media:c'),
    ]),
  };
  const payload = {
    resolved_strand: strand,
    media_display_names: {
      'media:a': 'Source A',
      'media:a;list': 'Source A List',
      'media:b': 'Intermediate B',
      'media:c': 'Target C',
    },
    body_outcomes: [
      {
        body_index: 0,
        foreach_token_id: strand.steps[0].token_id,
        success: false,
        cap_urns: [],
        saved_paths: [],
        total_bytes: 0,
        duration_ms: 0,
        failed_token_id: strand.steps[2].token_id,
        failed_arg_urn: null,
        error: 'fail',
      },
    ],
    visible_success_count: 0,
    visible_failure_count: 1,
    total_body_count: 1,
  };
  const built = rendererBuildRunGraphData(payload);
  let failureNodes = 0;
  for (const n of built.replicaNodes) {
    if (n.classes === 'body-failure') failureNodes++;
  }
  // 1 entry + 2 body step nodes (cap x and cap y, truncated
  // at cap y) = 3 failure replica nodes.
  assertEqual(failureNodes, 3, 'trace truncates at cap y by stable token, yielding entry + 2 cap nodes');

  const invalid = JSON.parse(JSON.stringify(payload));
  invalid.body_outcomes[0].failed_token_id = 'missing-step-token';
  let threw = false;
  try {
    rendererBuildRunGraphData(invalid);
  } catch (error) {
    threw = true;
    assert(error.message.includes('does not resolve to a strand step'),
      'unknown token failure must identify the unresolved coordinate');
  }
  assert(threw, 'unknown failed_token_id must fail hard');
}

// TEST6507: Renderer build run graph data backbone has no foreach node
function test6507_Renderer_buildRunGraphData_backboneHasNoForeachNode() {
  // Regression test for the run-mode rendering fix: the backbone
  // delivered to cytoscape must NOT contain any strand-foreach or
  // strand-collect nodes. Run mode inherits the same cosmetic
  // collapse as strand mode so the foreach/collect execution-layer
  // concepts don't leak into the view as boxed nodes.
  //
  // User scenario: [Disbind (1→n), ForEach, make_decision] where
  // target_media_urn equals the last cap's to_spec, so the backbone
  // collapses to 3 nodes: input_slot, step_0 (Text Page),
  // step_2 (Decision, merged target). No separate `for each` or
  // `collect` boxes.
  const strand = {
    source_media_urn: 'media:ext=pdf',
    target_media_urn: 'media:decision',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:ext=pdf";disbind;out="media:page"', 'Disbind', 'media:ext=pdf', 'media:page', false, true),
      makeForEachStep('media:page'),
      makeCapStep('cap:in="media:page";decide;out="media:decision"', 'Make a Decision', 'media:page', 'media:decision', false, false),
    ]),
  };
  const payload = {
    resolved_strand: strand,
    media_display_names: {
      'media:ext=pdf': 'PDF',
      'media:page': 'Page',
      'media:decision': 'Decision',
    },
    body_outcomes: [],
    visible_success_count: 0,
    visible_failure_count: 0,
    total_body_count: 0,
  };
  const built = rendererBuildRunGraphData(payload);

  // Backbone must contain NO foreach/collect nodes.
  const foreachNodes = built.strandBuilt.nodes.filter(n => n.nodeClass === 'strand-foreach');
  const collectNodes = built.strandBuilt.nodes.filter(n => n.nodeClass === 'strand-collect');
  assertEqual(foreachNodes.length, 0, 'run backbone must not contain strand-foreach nodes');
  assertEqual(collectNodes.length, 0, 'run backbone must not contain strand-collect nodes');

  // The backbone fallback connector is the foreach-entry cap edge
  // that runs from the pre-foreach node to the body cap. It must
  // survive collapse so the target stays reachable even with zero
  // successful bodies.
  const backboneCapEdges = built.strandBuilt.edges.filter(e => e.edgeClass.indexOf('strand-cap-edge') >= 0);
  assert(backboneCapEdges.some(e => e.source === 'step_0' && e.target === 'step_2'),
    'foreach-entry backbone edge step_0 → step_2 must be present for fallback connectivity');

  // With zero outcomes, no replicas and no show-more nodes.
  assertEqual(built.replicaNodes.length, 0, 'no replica nodes when body_outcomes is empty');
  assertEqual(built.showMoreNodes.length, 0, 'no show-more nodes when no hidden outcomes');
}

// TEST6508: Renderer build run graph data all failed drops target placeholder
function test6508_Renderer_buildRunGraphData_allFailedDropsTargetPlaceholder() {
  // When every body fails, the strand target node was never
  // reached by any execution. The render drops BOTH the backbone
  // foreach-entry edge AND the orphaned target node so the user
  // doesn't see a stale "Decision" placeholder alongside their
  // failed replicas.
  const strand = {
    source_media_urn: 'media:ext=pdf',
    target_media_urn: 'media:decision',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:ext=pdf";disbind;out="media:page"', 'Disbind', 'media:ext=pdf', 'media:page', false, true),
      makeForEachStep('media:page'),
      makeCapStep('cap:in="media:page";decide;out="media:decision"', 'Make a Decision', 'media:page', 'media:decision', false, false),
    ]),
  };
  const payload = {
    resolved_strand: strand,
    media_display_names: {
      'media:ext=pdf': 'PDF',
      'media:page': 'Page',
      'media:decision': 'Decision',
    },
    body_outcomes: [
      { body_index: 0, foreach_token_id: strand.steps[1].token_id, success: false, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0, failed_token_id: strand.steps[2].token_id, failed_arg_urn: null, error: 'boom' },
      { body_index: 1, foreach_token_id: strand.steps[1].token_id, success: false, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0, failed_token_id: strand.steps[2].token_id, failed_arg_urn: null, error: 'boom' },
    ],
    visible_success_count: 3,
    visible_failure_count: 3,
    total_body_count: 2,
  };
  const built = rendererBuildRunGraphData(payload);

  // The dropped placeholder: step_2 (the merged strand target
  // "Decision") is absent from the backbone because all bodies
  // failed and the replicas didn't reach it.
  const hasStep2 = built.strandBuilt.nodes.some(n => n.id === 'step_2');
  assertEqual(hasStep2, false,
    'strand target placeholder must be dropped when zero successful replicas reach it');

  // The backbone foreach-entry edge is also gone — replicas
  // replaced it and there's no orphan target to connect.
  const foreachEntry = built.strandBuilt.edges.find(e =>
    e.edgeClass === 'strand-cap-edge' && e.foreachEntry === true);
  assertEqual(foreachEntry, undefined,
    'backbone foreach-entry edge must be dropped when replicas exist');

  // Each failed body renders as an entry node + N body-step
  // nodes. Body has 1 cap (make_decision), so 2 nodes per body.
  // 2 failed bodies × 2 nodes = 4 failure replica nodes.
  const failureNodes = built.replicaNodes.filter(n => n.classes === 'body-failure');
  assertEqual(failureNodes.length, 4,
    'two failed bodies × (entry + 1 body cap) = 4 failure replica nodes');

  // Disbind is the sequence producer, so its backbone node
  // (step_0) is ALSO dropped — the per-body entry nodes own
  // the per-item rendering. The only surviving backbone node
  // is the input_slot (avid-optic source PDF).
  const hasStep0 = built.strandBuilt.nodes.some(n => n.id === 'step_0');
  assertEqual(hasStep0, false,
    'sequence producer backbone node (Disbind output) is dropped; replicas own the per-body rendering');
  const hasInputSlot = built.strandBuilt.nodes.some(n => n.id === 'input_slot');
  assertEqual(hasInputSlot, true, 'input_slot survives as the shared source');
}

// TEST6509: Renderer build run graph data unclosed foreach success no merge
function test6509_Renderer_buildRunGraphData_unclosedForeachSuccessNoMerge() {
  // Strand without a Collect: [Disbind, ForEach, make_decision].
  // Under the floom-engine realize_strand semantics there's no Collect,
  // so each body produces its OWN terminal output. Successful
  // replicas do NOT merge into a shared target — each body has
  // its own separate decision.
  //
  // Expected replica shape per body:
  //   anchorNode (pre-foreach backbone) → entry (per-body Text Page)
  //                                    → body_n_0 (per-body Decision)
  //   (no merge edge back into the backbone)
  const strand = {
    source_media_urn: 'media:ext=pdf',
    target_media_urn: 'media:decision',
    steps: wireLinearStepInputs([
      makeCapStep('cap:in="media:ext=pdf";disbind;out="media:page"', 'Disbind', 'media:ext=pdf', 'media:page', false, true),
      makeForEachStep('media:page'),
      makeCapStep('cap:in="media:page";decide;out="media:decision"', 'Make a Decision', 'media:page', 'media:decision', false, false),
    ]),
  };
  const payload = {
    resolved_strand: strand,
    media_display_names: {
      'media:ext=pdf': 'PDF',
      'media:page': 'Page',
      'media:decision': 'Decision',
    },
    body_outcomes: [
      { body_index: 0, foreach_token_id: strand.steps[1].token_id, success: true, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0, failed_token_id: null, failed_arg_urn: null },
    ],
    visible_success_count: 3,
    visible_failure_count: 3,
    total_body_count: 1,
  };
  const built = rendererBuildRunGraphData(payload);

  // step_2 (the merged strand target) was dropped because it's
  // a body cap step and there's no Collect to merge into.
  const hasStep2 = built.strandBuilt.nodes.some(n => n.id === 'step_2');
  assertEqual(hasStep2, false,
    'body cap node dropped; without Collect there is no shared merge target');

  // Each body produces its own entry + body cap chain: 2 nodes.
  const successNodes = built.replicaNodes.filter(n => n.classes === 'body-success');
  assertEqual(successNodes.length, 2,
    'one successful body × (entry + 1 body cap) = 2 replica nodes');

  // No replica edge targets the (now non-existent) step_2.
  const mergeEdges = built.replicaEdges.filter(e =>
    e.data && e.data.target === 'step_2');
  assertEqual(mergeEdges.length, 0,
    'no merge edges to step_2 because there is no Collect');

  // The fork edge from anchor (input_slot, because Disbind IS
  // the sequence producer whose backbone node is dropped) to
  // the per-body entry IS present.
  const forkEdges = built.replicaEdges.filter(e =>
    e.data && e.data.source === 'input_slot' && e.classes === 'body-success');
  assertEqual(forkEdges.length, 1, 'fork edge input_slot → body-0-entry exists');
}

// TEST6510: Renderer build run graph data closed foreach success merges at collect target
function test6510_Renderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget() {
  // With a Collect closing the body, successful replicas DO merge
  // into the post-collect target so the flow converges.
  // Strand: [Disbind, ForEach, Cap_a, Cap_b, Collect] with a
  // downstream cap after Collect to make the post-collect target
  // a real separate node.
  //
  // Actually simpler: [ForEach, Cap_a, Collect] with source=list
  // and target=list.
  const strand = {
    source_media_urn: 'media:ext=pdf;list',
    target_media_urn: 'media:txt;list',
    steps: wireLinearStepInputs([
      makeForEachStep('media:ext=pdf;list'),
      makeCapStep('cap:in="media:ext=pdf";extract;out="media:ext=txt"', 'extract', 'media:ext=pdf', 'media:ext=txt', false, false),
      makeCollectStep('media:ext=txt'),
    ]),
  };
  const payload = {
    resolved_strand: strand,
    media_display_names: {
      'media:ext=pdf;list': 'PDF List',
      'media:ext=pdf': 'PDF',
      'media:ext=txt': 'Text',
      'media:txt;list': 'Text List',
    },
    body_outcomes: [
      { body_index: 0, foreach_token_id: strand.steps[0].token_id, success: true, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0, failed_token_id: null, failed_arg_urn: null },
    ],
    visible_success_count: 3,
    visible_failure_count: 3,
    total_body_count: 1,
  };
  const built = rendererBuildRunGraphData(payload);

  // The post-collect target (output) is still present — it's the
  // strand target. Successful replicas merge into it.
  const hasOutput = built.strandBuilt.nodes.some(n => n.id === 'output');
  assertEqual(hasOutput, true,
    'post-collect target (output) stays because successful replicas merge into it');

  // One body × (entry + 1 body cap) = 2 replica nodes.
  const successNodes = built.replicaNodes.filter(n => n.classes === 'body-success');
  assertEqual(successNodes.length, 2,
    'one successful body × (entry + 1 body cap) = 2 replica nodes');

  // One merge edge from the last body cap to the output node.
  const mergeEdges = built.replicaEdges.filter(e =>
    e.data && e.data.target === 'output' && e.classes === 'body-success');
  assertEqual(mergeEdges.length, 1,
    'one merge edge from body cap replica to collect target');
}

// ---------------- editor-graph builder ----------------

function test6511_Renderer_validateEditorGraphPayload_rejectsUnknownKind() {
  let threw = false;
  try {
    rendererValidateEditorGraphPayload({
      elements: [{ kind: 'widget', graph_id: 'w1' }],
    });
  } catch (e) {
    threw = true;
    assert(e.message.includes('widget') || e.message.includes('kind'),
      'error must name the bad kind');
  }
  assert(threw, 'unknown element kind must throw');
}

// TEST6512: Renderer build editor graph data collapses caps into labeled edges
function test6512_Renderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges() {
  // The notation analyzer emits a bipartite chain per cap
  // application: data_node → arg_edge → cap_node → arg_edge →
  // data_node. The machine builder collapses each cap into a
  // single labeled edge between the input and output data slots.
  // Cap nodes do NOT appear as cytoscape nodes. Cap tokenIds are
  // carried on the synthesized edge so editor cross-highlight
  // still resolves from the rendered edge to the cap's source
  // text.
  const data = {
    elements: [
      { kind: 'node', graph_id: 'n_src', label: 'n0', token_id: 't-src' },
      { kind: 'node', graph_id: 'n_dst', label: 'n1', token_id: 't-dst' },
      { kind: 'cap',  graph_id: 'c1',    label: 'my_cap', token_id: 't-cap', linked_cap_urn: 'cap:...' },
      { kind: 'edge', graph_id: 'e_in',  source_graph_id: 'n_src', target_graph_id: 'c1', label: 'in', token_id: 't-ein' },
      { kind: 'edge', graph_id: 'e_out', source_graph_id: 'c1', target_graph_id: 'n_dst', label: 'out', token_id: 't-eout' },
    ],
  };
  const built = rendererBuildEditorGraphData(data);

  // Only data-slot nodes survive. Cap is NOT a node.
  assertEqual(built.nodes.length, 2, 'only data-slot nodes are rendered');
  const nodeIds = built.nodes.map(n => n.data.id).sort();
  assertEqual(JSON.stringify(nodeIds), JSON.stringify(['n_dst', 'n_src']),
    'data-slot nodes preserved verbatim');
  assertEqual(built.nodes.every(n => n.data.kind === 'node'), true,
    'every surviving node has kind=node (no cap nodes)');

  // The cap is collapsed to a single labeled edge.
  assertEqual(built.edges.length, 1, 'one collapsed edge per cap application');
  const edge = built.edges[0];
  assertEqual(edge.data.source, 'n_src', 'edge source is the cap input data slot');
  assertEqual(edge.data.target, 'n_dst', 'edge target is the cap output data slot');
  assertEqual(edge.data.label, 'my_cap', 'edge label is the cap title');
  assertEqual(edge.data.tokenId, 't-cap',
    'edge carries the cap node tokenId so editor cross-highlight points to the cap in source text');
}

// TEST6513: Renderer build editor graph data loop marked edge gets loop class
function test6513_Renderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass() {
  // A cap marked `is_loop: true` must produce a `machine-loop`
  // edge so the stylesheet's dashed amber rule applies.
  const data = {
    elements: [
      { kind: 'node', graph_id: 'a', label: 'a', token_id: 't-a' },
      { kind: 'node', graph_id: 'b', label: 'b', token_id: 't-b' },
      { kind: 'cap',  graph_id: 'c', label: 'looped', token_id: 't-c', is_loop: true },
      { kind: 'edge', graph_id: 'e1', source_graph_id: 'a', target_graph_id: 'c', token_id: 't-e1' },
      { kind: 'edge', graph_id: 'e2', source_graph_id: 'c', target_graph_id: 'b', token_id: 't-e2' },
    ],
  };
  const built = rendererBuildEditorGraphData(data);
  assertEqual(built.edges.length, 1, 'one collapsed edge');
  assert(built.edges[0].classes.indexOf('machine-loop') >= 0,
    'loop-marked cap emits machine-loop class on the collapsed edge');
}

// TEST6514: Renderer build editor graph data cardinality from data slot sequence flags
function test6514_Renderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags() {
  // Cardinality markers come from the source and target data
  // slots' `is_sequence` flags. A cap whose output data slot has
  // `is_sequence=true` shows "(1→n)" on its collapsed edge.
  const data = {
    elements: [
      { kind: 'node', graph_id: 'a', label: 'pdf',   token_id: 't-a', is_sequence: false },
      { kind: 'node', graph_id: 'b', label: 'pages', token_id: 't-b', is_sequence: true },
      { kind: 'cap',  graph_id: 'c', label: 'disbind', token_id: 't-c' },
      { kind: 'edge', graph_id: 'e1', source_graph_id: 'a', target_graph_id: 'c', token_id: 't-e1' },
      { kind: 'edge', graph_id: 'e2', source_graph_id: 'c', target_graph_id: 'b', token_id: 't-e2' },
    ],
  };
  const built = rendererBuildEditorGraphData(data);
  assertEqual(built.edges.length, 1, 'one collapsed edge');
  assertEqual(built.edges[0].data.label, 'disbind (1\u2192n)',
    'cardinality marker "(1→n)" derived from output data slot is_sequence=true');
}

// TEST6515: Renderer build editor graph data cap without complete args is dropped
function test6515_Renderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped() {
  // A cap with no incoming or no outgoing argument edges (e.g.
  // the user is mid-typing) contributes nothing to the render.
  // The data slots are still emitted.
  const data = {
    elements: [
      { kind: 'node', graph_id: 'a', label: 'a', token_id: 't-a' },
      { kind: 'cap',  graph_id: 'c', label: 'halfway', token_id: 't-c' },
      { kind: 'edge', graph_id: 'e1', source_graph_id: 'a', target_graph_id: 'c', token_id: 't-e1' },
    ],
  };
  const built = rendererBuildEditorGraphData(data);
  assertEqual(built.nodes.length, 1, 'data slot emitted');
  assertEqual(built.edges.length, 0,
    'incomplete cap (no outgoing argument) drops out of the render');
}

// TEST6516: Renderer build editor graph data rejects edge with missing source
function test6516_Renderer_buildEditorGraphData_rejectsEdgeWithMissingSource() {
  let threw = false;
  try {
    rendererBuildEditorGraphData({
      elements: [
        { kind: 'edge', graph_id: 'e1', target_graph_id: 't' },
      ],
    });
  } catch (e) {
    threw = true;
  }
  assert(threw, 'edge without source_graph_id must throw');
}

// ---------------- resolved-machine builder ----------------

function test6517_Renderer_buildResolvedMachineGraphData_singleStrandLinearChain() {
  // A single-strand machine: media:ext=pdf → extract → media:ext=txt
  // → embed → media:embedding. Two edges, three nodes, no
  // loops, no fan-in. Tests the basic shape — nodes and
  // edges flow through verbatim from the resolved machine
  // payload.
  const payload = {
    strands: [
      {
        nodes: [
          { id: 'n0', urn: 'media:ext=pdf', title: 'PDF' },
          { id: 'n1', urn: 'media:enc=utf-8;ext=txt', title: 'Plain Text' },
          { id: 'n2', urn: 'media:embedding;record', title: 'Embedding Record' },
        ],
        edges: [
          {
            alias: 'edge_0',
            cap_urn: 'cap:in="media:ext=pdf";extract;out=media:enc=utf-8;ext=txt',
            title: 'Extract Text',
            is_loop: false,
            assignment: [
              { cap_arg_media_urn: 'media:ext=pdf', source_node: 'n0' },
            ],
            target_node: 'n1',
          },
          {
            alias: 'edge_1',
            cap_urn: 'cap:in=media:enc=utf-8;embed;out=media:embedding;record',
            title: 'Generate Embedding',
            is_loop: false,
            assignment: [
              { cap_arg_media_urn: 'media:enc=utf-8', source_node: 'n1' },
            ],
            target_node: 'n2',
          },
        ],
        input_anchor_nodes: ['n0'],
        output_anchor_nodes: ['n2'],
      },
    ],
  };
  const built = rendererBuildResolvedMachineGraphData(payload);
  assertEqual(built.nodes.length, 3, 'three data-slot nodes');
  assertEqual(built.edges.length, 2, 'two cap edges (one assignment each)');
  // First edge connects n0 → n1, second connects n1 → n2.
  const edges = built.edges.map(e => `${e.data.source}->${e.data.target}`);
  assertEqual(edges[0], 'n0->n1', 'first edge wires n0 to n1');
  assertEqual(edges[1], 'n1->n2', 'second edge wires n1 to n2');
  // Anchor nodes carry the strand-source / strand-target classes.
  const n0 = built.nodes.find(n => n.data.id === 'n0');
  const n2 = built.nodes.find(n => n.data.id === 'n2');
  assertEqual(n0.data.label, 'PDF', 'node label must come from explicit title');
  assert(n0.classes.indexOf('strand-source') >= 0,
    'input anchor node carries strand-source class');
  assert(n2.classes.indexOf('strand-target') >= 0,
    'output anchor node carries strand-target class');
}

// TEST6518: Renderer build resolved machine graph data loop edge gets loop class
function test6518_Renderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass() {
  // An is_loop edge corresponds to a strand step inside a
  // ForEach body. The renderer must mark it with the
  // `machine-loop` class so the dashed amber rule applies.
  const payload = {
    strands: [
      {
        nodes: [
          { id: 'n0', urn: 'media:enc=utf-8;page', title: 'Page' },
          { id: 'n1', urn: 'media:decision;fmt=json;record', title: 'Decision Record' },
        ],
        edges: [
          {
            alias: 'edge_0',
            cap_urn: 'cap:in=media:enc=utf-8;make-decision;out=media:decision;fmt=json;record',
            title: 'Make Decision',
            is_loop: true,
            assignment: [
              { cap_arg_media_urn: 'media:enc=utf-8', source_node: 'n0' },
            ],
            target_node: 'n1',
          },
        ],
        input_anchor_nodes: ['n0'],
        output_anchor_nodes: ['n1'],
      },
    ],
  };
  const built = rendererBuildResolvedMachineGraphData(payload);
  assertEqual(built.edges.length, 1, 'one cap edge');
  assert(built.edges[0].classes.indexOf('machine-loop') >= 0,
    'is_loop=true must produce a machine-loop class on the cap edge');
}

// TEST6519: Renderer build resolved machine graph data fan in produces edge per assignment
function test6519_Renderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment() {
  // A cap with two input args (a fan-in) gets one rendered
  // edge per (source_node, target_node) pair so cytoscape can
  // draw both incoming wires. Both edges share the cap title
  // and color so they read as a single fan-in.
  const payload = {
    strands: [
      {
        nodes: [
          { id: 'n0', urn: 'media:ext=png;image', title: 'PNG Image' },
          { id: 'n1', urn: 'media:enc=utf-8;model-spec', title: 'Model Spec' },
          { id: 'n2', urn: 'media:enc=utf-8;image-description', title: 'Image Description' },
        ],
        edges: [
          {
            alias: 'edge_0',
            cap_urn: 'cap:in="media:ext=png;image";describe-image;out="media:enc=utf-8;image-description"',
            title: 'Describe Image',
            is_loop: false,
            assignment: [
              { cap_arg_media_urn: 'media:ext=png;image', source_node: 'n0' },
              { cap_arg_media_urn: 'media:enc=utf-8;model-spec', source_node: 'n1' },
            ],
            target_node: 'n2',
          },
        ],
        input_anchor_nodes: ['n0', 'n1'],
        output_anchor_nodes: ['n2'],
      },
    ],
  };
  const built = rendererBuildResolvedMachineGraphData(payload);
  assertEqual(built.edges.length, 2, 'two rendered edges, one per assignment binding');
  const sources = built.edges.map(e => e.data.source).sort();
  assertEqual(JSON.stringify(sources), JSON.stringify(['n0', 'n1']),
    'each binding gets its own source-node edge into the same target');
  assertEqual(built.edges[0].data.target, 'n2', 'first edge targets n2');
  assertEqual(built.edges[1].data.target, 'n2', 'second edge targets n2');
}

// TEST6520: Renderer build resolved machine graph data multi strand keeps strands disjoint
function test6520_Renderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint() {
  // Two strands inside one machine. Each strand has its own
  // nodes and edges. Node ids are globally unique across
  // strands (Rust assigns them via a single counter), so no
  // node id collision can happen. The renderer must emit
  // every node and every edge from both strands.
  const payload = {
    strands: [
      {
        nodes: [
          { id: 'n0', urn: 'media:ext=pdf', title: 'PDF' },
          { id: 'n1', urn: 'media:enc=utf-8;ext=txt', title: 'Plain Text' },
        ],
        edges: [
          {
            alias: 'edge_0',
            cap_urn: 'cap:in="media:ext=pdf";extract;out=media:enc=utf-8;ext=txt',
            title: 'Extract Text',
            is_loop: false,
            assignment: [
              { cap_arg_media_urn: 'media:ext=pdf', source_node: 'n0' },
            ],
            target_node: 'n1',
          },
        ],
        input_anchor_nodes: ['n0'],
        output_anchor_nodes: ['n1'],
      },
      {
        nodes: [
          { id: 'n2', urn: 'media:fmt=json;record', title: 'JSON Record' },
          { id: 'n3', urn: 'media:fmt=csv;list;record', title: 'CSV Rows' },
        ],
        edges: [
          {
            alias: 'edge_1',
            cap_urn: 'cap:in=media:fmt=json;record;convert-format;out=media:fmt=csv;list;record',
            title: 'Convert Format',
            is_loop: false,
            assignment: [
              { cap_arg_media_urn: 'media:fmt=json;record', source_node: 'n2' },
            ],
            target_node: 'n3',
          },
        ],
        input_anchor_nodes: ['n2'],
        output_anchor_nodes: ['n3'],
      },
    ],
  };
  const built = rendererBuildResolvedMachineGraphData(payload);
  assertEqual(built.nodes.length, 4, 'all four nodes from both strands present');
  assertEqual(built.edges.length, 2, 'one edge per strand');
  // Each node carries a strandIndex matching which strand it came from.
  const idToStrand = {};
  for (const n of built.nodes) idToStrand[n.data.id] = n.data.strandIndex;
  assertEqual(idToStrand['n0'], 0, 'n0 belongs to strand 0');
  assertEqual(idToStrand['n1'], 0, 'n1 belongs to strand 0');
  assertEqual(idToStrand['n2'], 1, 'n2 belongs to strand 1');
  assertEqual(idToStrand['n3'], 1, 'n3 belongs to strand 1');
}

// TEST6521: Renderer build resolved machine graph data duplicate node id across strands fails hard
function test6521_Renderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard() {
  // Node ids must be globally unique across strands. The
  // Rust serializer guarantees this via a single global
  // counter. If the host ever feeds a payload that violates
  // it, the renderer must fail hard so the bug surfaces
  // instead of silently overwriting one node with another.
  const payload = {
    strands: [
      {
        nodes: [{ id: 'n0', urn: 'media:ext=pdf', title: 'PDF' }],
        edges: [],
        input_anchor_nodes: ['n0'],
        output_anchor_nodes: ['n0'],
      },
      {
        nodes: [{ id: 'n0', urn: 'media:ext=html', title: 'HTML' }],
        edges: [],
        input_anchor_nodes: ['n0'],
        output_anchor_nodes: ['n0'],
      },
    ],
  };
  let threw = false;
  let message = '';
  try {
    rendererBuildResolvedMachineGraphData(payload);
  } catch (e) {
    threw = true;
    message = e.message || '';
  }
  assert(threw, 'duplicate node id across strands must throw');
  assert(message.includes('duplicate node id') && message.includes('n0'),
    'error must name the colliding node id');
}

// TEST6522: Renderer validate resolved machine payload rejects missing fields
function test6522_Renderer_validateResolvedMachinePayload_rejectsMissingFields() {
  // The validator must reject any payload missing a required
  // field on a strand, edge, node, or assignment binding.
  // We exercise the most-likely-to-be-missed field on each
  // sub-shape.
  const cases = [
    { strands: 'not-an-array' },
    { strands: [{ nodes: [], edges: [], input_anchor_nodes: [] /* missing output_anchor_nodes */ }] },
    { strands: [{ nodes: [{ id: 'n0' /* missing urn/title */ }], edges: [], input_anchor_nodes: [], output_anchor_nodes: [] }] },
    {
      strands: [{
        nodes: [{ id: 'n0', urn: 'media:x', title: 'X' }],
        edges: [{
          alias: 'edge_0',
          cap_urn: 'cap:in=...;out=...',
          title: 'Edge 0',
          is_loop: false,
          assignment: [{ cap_arg_media_urn: 'media:x' /* missing source_node */ }],
          target_node: 'n0',
        }],
        input_anchor_nodes: ['n0'],
        output_anchor_nodes: ['n0'],
      }],
    },
  ];
  for (const c of cases) {
    let threw = false;
    try { rendererValidateResolvedMachinePayload(c); } catch (e) { threw = true; }
    assert(threw, `validator must reject payload: ${JSON.stringify(c).slice(0, 80)}`);
  }
}

// ============================================================================
// CapKind classifier tests (test1800–test1805)
//
// Mirrored across every language port (Rust, Go, Python, Swift/ObjC,
// JS) under the SAME numbers. Any divergence is a wire-level
// inconsistency — the kind taxonomy is part of the protocol's public
// surface, not a per-port detail.
// ============================================================================

// TEST1800: Identity classifier — and only explicit effect=none qualifies.
function test1800_kindIdentityOnlyForBareCap() {
  const identity = CapUrn.fromString('cap:effect=none');
  assertEqual(identity.kind(), CapKind.IDENTITY, 'cap:effect=none should be Identity');

  for (const spelling of [
    'cap:in=media:;out=media:;effect=none',
    'cap:effect=none;in=*;out=*',
    'cap:effect=none;in=media:',
    'cap:effect=none;out=media:',
  ]) {
    const cap = CapUrn.fromString(spelling);
    assertEqual(cap.kind(), CapKind.IDENTITY,
      `${spelling} should classify as Identity`);
  }

  assertThrows(
    () => CapUrn.fromString('cap:'),
    ErrorCodes.ILLEGAL_DECLARATION,
    'bare cap must be rejected as inadmissible'
  );

  const withOp = CapUrn.fromString('cap:passthrough');
  assertEqual(withOp.kind(), CapKind.TRANSFORM,
    'cap:passthrough specifies the operation axis — not Identity');
}

// TEST1801: Source classifier — in=media:void, out non-void.
function test1801_kindSourceWhenInputIsVoid() {
  const warm = CapUrn.fromString('cap:in=media:void;out="media:model-artifact";warm');
  assertEqual(warm.kind(), CapKind.SOURCE, 'warm cap is a Source');

  const gen = CapUrn.fromString('cap:in=media:void;out="media:enc=utf-8"');
  assertEqual(gen.kind(), CapKind.SOURCE, 'in=void with concrete out is a Source');
}

// TEST1802: Sink classifier — out=media:void, in non-void.
function test1802_kindSinkWhenOutputIsVoid() {
  const discard = CapUrn.fromString('cap:discard;in=media:;out=media:void');
  assertEqual(discard.kind(), CapKind.SINK, 'discard cap is a Sink');

  const log = CapUrn.fromString('cap:in="media:fmt=json";log;out=media:void');
  assertEqual(log.kind(), CapKind.SINK, 'log cap is a Sink');
}

// TEST1803: Effect classifier — both sides void. Reads as `() → ()`.
function test1803_kindEffectWhenBothSidesVoid() {
  const ping = CapUrn.fromString('cap:in=media:void;out=media:void;ping');
  assertEqual(ping.kind(), CapKind.EFFECT, 'ping is an Effect');

  const bare = CapUrn.fromString('cap:in=media:void;out=media:void');
  assertEqual(bare.kind(), CapKind.EFFECT,
    'in=void;out=void with empty y is still an Effect');
}

// TEST1804: Transform classifier — at least one side non-void, and the cap is not the bare identity. The default kind for ordinary data-processing caps.
function test1804_kindTransformForNormalDataProcessors() {
  const extract = CapUrn.fromString('cap:extract;in="media:ext=pdf";out="media:enc=utf-8;record"');
  assertEqual(extract.kind(), CapKind.TRANSFORM, 'extract is a Transform');

  const labeled = CapUrn.fromString('cap:passthrough;in=media:;out=media:');
  assertEqual(labeled.kind(), CapKind.TRANSFORM,
    'fully generic in/out with a tag is a Transform, not Identity');
}

// TEST1810: media:void is atomic — refinements are parse errors. Mirrored across every language port (Rust, Go, Python, Swift/ObjC, JS) under the SAME number. Any divergence is a wire-level inconsistency — the unit type's atomicity is part of the protocol's deepest layer, not a per-port detail. The bare `media:void` parses successfully; any combination with another tag (marker or key=value) MUST fail with VoidNotAtomic. This forecloses a fake taxonomy of unit values; reasons or labels for *why* void is used belong on the cap URN's non-directional tags or in cap args.
function test1810_mediaVoidIsAtomic() {
  // Bare void: must parse successfully.
  const bare = MediaUrn.fromString('media:void');
  assert(bare.isVoid(), 'bare media:void must parse — it is the unit type');

  const badInputs = [
    'media:void;text',
    'media:void;pdf',
    'media:void;audio',
    'media:void;reason=warmup',
    'media:void;heartbeat',
    'media:void;manual',
    // Order must not matter — the parser canonicalizes tags.
    'media:warmup;void',
    'media:reason=foo;void',
  ];

  for (const input of badInputs) {
    let threw = false;
    let code = null;
    try {
      MediaUrn.fromString(input);
    } catch (e) {
      threw = true;
      code = e.code;
    }
    assert(threw, `${input}: expected parse error, but parsed successfully`);
    assertEqual(code, MediaUrnErrorCodes.VOID_NOT_ATOMIC,
      `${input}: expected VOID_NOT_ATOMIC error code`);
  }
}

// TEST1805: Kind is invariant under canonicalization. The same morphism written in many surface forms must classify the same way once parsed. This pins the rule that kind is a property of the cap as a structured object, not of any particular spelling.
function test1805_kindInvariantUnderCanonicalSpellings() {
  const cases = [
    { a: 'cap:effect=none', b: 'cap:in=media:;out=media:;effect=none', expected: CapKind.IDENTITY },
    {
      a: 'cap:extract;in="media:ext=pdf";out="media:enc=utf-8"',
      b: 'cap:extract;in="media:ext=pdf";out="media:enc=utf-8"',
      expected: CapKind.TRANSFORM,
    },
    {
      a: 'cap:in=media:void;out="media:enc=utf-8";warm',
      b: 'cap:warm;out="media:enc=utf-8";in=media:void',
      expected: CapKind.SOURCE,
    },
  ];

  for (const { a, b, expected } of cases) {
    const kindA = CapUrn.fromString(a).kind();
    const kindB = CapUrn.fromString(b).kind();
    assertEqual(kindA, expected, `${a} should classify as ${expected}`);
    assertEqual(kindB, expected, `${b} should classify as ${expected}`);
    assertEqual(kindA, kindB,
      `${a} and ${b} parse to the same cap and must classify identically`);
  }
}

// ============================================================================
// Truth-table specificity tests (test1820–test1824)
//
// Mirrored across every language port (Rust, Go, Python, Swift/ObjC,
// JS) under the SAME numbers. Specificity must be the truth-table
// sum across all three axes using the six-form ladder:
//
//   ?x or missing     -> 0   (no constraint)
//   x?=v              -> 1   (absent OR not v)
//   x (=x=*) marker   -> 2   (must-have-any)
//   x!=v              -> 3   (present and not v)
//   x=v exact         -> 4   (must-have-this-value)
//   !x                -> 5   (must-not-have)
// ============================================================================

// TEST1820: A `?`-valued cap-tag scores 0. Same as missing.
function test1820_specificityQuestionIsZero() {
  const bare = CapUrn.fromString('cap:?effect');
  assertEqual(bare.specificity(), 0, 'cap:?effect must score 0 (fully unconstrained request)');

  const withQ = CapUrn.fromString('cap:?target');
  assertEqual(withQ.specificity(), 0,
    '?x must score 0 (explicit no-constraint, same as missing)');
}

// TEST1821: A `!`-valued cap-tag scores 5 (top of negative chain).
function test1821_specificityMustNotHaveIsFive() {
  const cap = CapUrn.fromString('cap:!constrained');
  assertEqual(cap.specificity(), 5,
    '!constrained (must-not-have) must score 5');
}

// TEST1822: A `*`-valued cap-tag (including bare markers) scores 2.
function test1822_specificityMustHaveAnyIsTwo() {
  const bareMarker = CapUrn.fromString('cap:extract');
  assertEqual(bareMarker.specificity(), 2,
    'bare `extract` parses as extract=* (must-have-any) and scores 2');

  const explicitStar = CapUrn.fromString('cap:extract=*');
  assertEqual(explicitStar.specificity(), 2,
    'explicit key=* must score 2 (same as bare marker)');

  assertEqual(bareMarker.specificity(), explicitStar.specificity(),
    'bare marker and explicit key=* are the same form and must score identically');
}

// TEST1823: An exact-valued cap-tag scores 4.
function test1823_specificityExactValueIsFour() {
  const cap = CapUrn.fromString('cap:target=metadata');
  assertEqual(cap.specificity(), 4,
    'target=metadata (exact value) must score 4');
}

// TEST1824: All six forms compose additively on a single cap. This pins the truth-table sum across the y axis as a whole.
function test1824_specificityCombinedYAxis() {
  const cap = CapUrn.fromString('cap:!constrained;?target;extract;stage!=alpha;target2=metadata;ver?=draft');
  assertEqual(cap.specificity(), 15,
    'y combining all six forms (0+1+2+3+4+5) must sum to 15');
}

// ============================================================================
// Six-form canonicalization tests (test1830–test1835).
// ============================================================================

// TEST1830: ?x ≡ x? ≡ x=? all canonicalize to ?x.
function test1830_canonicalizeNoConstraint() {
  const canonical = 'cap:?x';
  for (const input of ['cap:?x', 'cap:x?', 'cap:x=?']) {
    const cap = CapUrn.fromString(input);
    assertEqual(cap.toString(), canonical,
      `input ${input} must canonicalize to ${canonical}`);
  }
}

// TEST1831: ?x=v and x?=v both canonicalize to x?=v. The third hypothetical form `x=?v` is NOT recognized as a qualifier — a value starting with `?` is just an exact value beginning with a `?` character.
function test1831_canonicalizeAbsentOrNotValue() {
  const canonical = 'cap:x?=foo';
  for (const input of ['cap:?x=foo', 'cap:x?=foo']) {
    const cap = CapUrn.fromString(input);
    assertEqual(cap.toString(), canonical,
      `input ${input} must canonicalize to ${canonical}`);
  }

  // `x=?foo` is a plain exact tag whose value is the string `?foo`
  // — NOT a canonicalization alias.
  const exact = CapUrn.fromString('cap:x=?foo');
  assertEqual(exact.toString(), 'cap:x=?foo');
  assertEqual(exact.getTag('x'), '?foo');
}

// TEST1832: x ≡ x=* both canonicalize to bare x.
function test1832_canonicalizeMustHaveAny() {
  const canonical = 'cap:x';
  for (const input of ['cap:x', 'cap:x=*']) {
    const cap = CapUrn.fromString(input);
    assertEqual(cap.toString(), canonical,
      `input ${input} must canonicalize to ${canonical}`);
  }
}

// TEST1833: !x=v and x!=v both canonicalize to x!=v. The third hypothetical form `x=!v` is NOT recognized as a qualifier — a value starting with `!` is just an exact value beginning with a `!` character.
function test1833_canonicalizePresentNotValue() {
  const canonical = 'cap:x!=foo';
  for (const input of ['cap:!x=foo', 'cap:x!=foo']) {
    const cap = CapUrn.fromString(input);
    assertEqual(cap.toString(), canonical,
      `input ${input} must canonicalize to ${canonical}`);
  }

  // `x=!foo` is a plain exact tag whose value is the string `!foo`
  // — NOT a canonicalization alias.
  const exact = CapUrn.fromString('cap:x=!foo');
  assertEqual(exact.toString(), 'cap:x=!foo');
  assertEqual(exact.getTag('x'), '!foo');
}

// TEST1834: x=v stays as x=v (the lone exact-value form).
function test1834_canonicalizeExactValue() {
  const cap = CapUrn.fromString('cap:x=foo');
  assertEqual(cap.toString(), 'cap:x=foo');
}

// TEST1835: !x ≡ x! ≡ x=! all canonicalize to !x.
function test1835_canonicalizeMustNotHave() {
  const canonical = 'cap:!x';
  for (const input of ['cap:!x', 'cap:x!', 'cap:x=!']) {
    const cap = CapUrn.fromString(input);
    assertEqual(cap.toString(), canonical,
      `input ${input} must canonicalize to ${canonical}`);
  }
}

// TEST1842: Full 6×6 truth table.
function test1842_truthTableFullCrossProduct() {
  const forms = ['', '?x', 'x?=v', 'x', 'x!=v', 'x=v', '!x'];
  // Each form means the set of states it allows, on either side; an instance
  // is accepted when its set lies inside the pattern's (capdag/formal,
  // `tagMatch_iff_allows`). A missing key and `?x` promise nothing, so they
  // satisfy only patterns that ask for nothing; `x` promises presence, not a
  // value.
  // miss   ?x    x?=v   x      x!=v   x=v    !x
  const expected = [
    [true,  true, false, false, false, false, false], // missing
    [true,  true, false, false, false, false, false], // ?x
    [true,  true, true,  false, false, false, false], // x?=v
    [true,  true, false, true,  false, false, false], // x
    [true,  true, true,  true,  true,  false, false], // x!=v
    [true,  true, false, true,  false, true,  false], // x=v
    [true,  true, true,  false, false, false, true ], // !x
  ];
  for (let i = 0; i < forms.length; i++) {
    for (let j = 0; j < forms.length; j++) {
      const instForm = forms[i];
      const pattForm = forms[j];
      const instStr = instForm === '' ? 'cap:base' : 'cap:base;' + instForm;
      const pattStr = pattForm === '' ? 'cap:base' : 'cap:base;' + pattForm;
      const inst = CapUrn.fromString(instStr);
      const patt = CapUrn.fromString(pattStr);
      const actual = patt.accepts(inst);
      assertEqual(actual, expected[i][j],
        `cell (inst=${instForm}, patt=${pattForm}) expected ${expected[i][j]} got ${actual}`);
    }
  }
}

// TEST6734: Invalid qualifier combinations must be rejected.
function test6734_rejectInvalidCombinations() {
  const invalid = [
    'cap:?x?=v', 'cap:!x!=v', 'cap:?!x', 'cap:!?x',
    'cap:?x=*', 'cap:!x=*',
    'cap:?x=?', 'cap:?x=!', 'cap:!x=?', 'cap:!x=!',
    'cap:?', 'cap:!',
  ];
  for (const input of invalid) {
    let threw = false;
    try { CapUrn.fromString(input); } catch (_e) { threw = true; }
    assert(threw, `input ${input} must be rejected`);
  }
}

// TEST6735: out-axis difference dominates combined in+y differences.
function test6735_axisWeightingOutDominates() {
  const bigOut = CapUrn.fromString('cap:in=media:;out="media:enc=utf-8;record"');
  const bigInAndY = CapUrn.fromString(
    'cap:in="media:ext=pdf";out=media:record;!constrained;?target;extract;stage!=alpha;target2=metadata;ver?=draft'
  );
  assert(bigOut.specificity() > bigInAndY.specificity(),
    'out-axis difference must dominate combined in+y differences');
}

// TEST1845: With equal out-axis, in-axis dominates over y-axis.
function test1845_axisWeightingInDominatesY() {
  const bigIn = CapUrn.fromString('cap:in="media:ext=pdf";out=media:record');
  const bigY = CapUrn.fromString(
    'cap:in=media:;out=media:record;!constrained;?target;extract;stage!=alpha;target2=metadata;ver?=draft'
  );
  assert(bigIn.specificity() > bigY.specificity(),
    'in-axis difference must dominate y-axis');
}

// TEST6736: Decoded layout — 10000*out + 100*in + y.
function test6736_axisWeightingDecodedLayout() {
  const cap = CapUrn.fromString('cap:in="media:a;b";out="media:a;b;c;d";extract');
  // out=4 markers (8), in=2 markers (4), y=1 marker (2)
  // 10000*8 + 100*4 + 2 = 80402
  assertEqual(cap.specificity(), 10000*8 + 100*4 + 2);
}

// ============================================================================
// Cap.version round-trip tests: TEST1847-TEST1848
// ============================================================================

// TEST6737: Cap with version=0 round-trips with no `version` key on wire
function test6737_capVersionZeroOmittedOnWire() {
  const urn = CapUrn.fromString('cap:in="media:void";test-op;out="media:enc=utf-8;record"');
  const cap = new Cap(urn, 'Test Cap', ['test-op']);
  // version defaults to 0
  assertEqual(cap.version, 0, 'Default version should be 0');
  const json = cap.toJSON();
  assert(!('version' in json), 'version=0 must not appear on wire');
  const restored = Cap.fromJSON(json);
  assertEqual(restored.version, 0, 'Restored version must be 0');
}

// TEST1848: Cap with version=N round-trips with `version: N` on wire
function test1848_capVersionNonZeroOnWire() {
  const urn = CapUrn.fromString('cap:in="media:void";versioned-op;out="media:enc=utf-8;record"');
  const cap = new Cap(urn, 'Versioned Cap', ['versioned-op']);
  cap.version = 42;
  const json = cap.toJSON();
  assert('version' in json, 'version!=0 must appear on wire');
  assertEqual(json.version, 42, 'Wire version must equal 42');
  const restored = Cap.fromJSON(json);
  assertEqual(restored.version, 42, 'Restored version must equal 42');
}

// ===========================================================================
// Shared parity tests 7100-7104: CapArg.streamUrn / CapArg.isMainInput.
// Same substantive assertions in every capdag mirror (rust, go, js, objc, py).
// ===========================================================================

// TEST7100: streamUrn() returns the stdin source's URN when it differs from the declared slot media_urn — the stdin URN, not the slot URN, is what the runtime demuxes the arg's input stream by.
function test7100_streamUrnReturnsStdinSourceUrnWhenItDiffersFromSlotUrn() {
  const arg = new CapArg(
    'media:enc=utf-8;file-path',
    true,
    [new ArgSource({ stdin: 'media:ext=pdf;pdf-stream' })]
  );
  assertEqual(arg.streamUrn(), 'media:ext=pdf;pdf-stream',
    'streamUrn must return the stdin source URN');
  assert(arg.streamUrn() !== arg.media_urn,
    'stream URN must differ from the declared slot media_urn here');
}

// TEST7101: streamUrn() falls back to the declared slot media_urn when the arg declares no stdin source — a producer-fed arg may be delivered by its declared URN without ever appearing on stdin.
function test7101_streamUrnFallsBackToDeclaredMediaUrnWithoutStdinSource() {
  const arg = new CapArg(
    'media:enc=utf-8;system-prompt',
    true,
    [new ArgSource({ cli_flag: '--system-prompt' })]
  );
  assertEqual(arg.streamUrn(), 'media:enc=utf-8;system-prompt',
    'streamUrn must fall back to the declared media_urn');
}

// TEST7102: isMainInput() is true when the stdin URN is order-theoretically EQUIVALENT to the cap's in= spec even when the two strings list their tags in a different order — the comparison is the MediaUrn equivalence predicate, never a string comparison.
function test7102_isMainInputTrueOnTagOrderInsensitiveEquivalenceToInSpec() {
  const inSpec = MediaUrn.fromString('media:ext=pdf;pdf-stream');
  const arg = new CapArg(
    'media:enc=utf-8;file-path',
    true,
    [new ArgSource({ stdin: 'media:pdf-stream;ext=pdf' })] // same tags, different order
  );
  assert(arg.isMainInput(inSpec),
    'tag-order-insensitive equivalent stdin URN must be the main input');
  // The raw strings genuinely differ — proves the match is equivalence,
  // not string equality.
  assert(inSpec.toString() !== 'media:pdf-stream;ext=pdf',
    'raw spec strings must differ for this test to be meaningful');
}

// TEST7103: isMainInput() is false for cli_flag-only and position-only args (no stdin source means never the main input, whatever the declared slot URN says), and false when the stdin URN is not equivalent to in=.
function test7103_isMainInputFalseWithoutEquivalentStdinSource() {
  const inSpec = MediaUrn.fromString('media:ext=pdf;pdf-stream');

  const cliFlagOnly = new CapArg(
    'media:ext=pdf;pdf-stream', // slot URN even matches in= — irrelevant
    true,
    [new ArgSource({ cli_flag: '--input' })]
  );
  assert(!cliFlagOnly.isMainInput(inSpec), 'cli_flag-only arg is never the main input');

  const positionOnly = new CapArg(
    'media:ext=pdf;pdf-stream',
    true,
    [new ArgSource({ position: 0 })]
  );
  assert(!positionOnly.isMainInput(inSpec), 'position-only arg is never the main input');

  const nonEquivalentStdin = new CapArg(
    'media:enc=utf-8;system-prompt',
    false,
    [new ArgSource({ stdin: 'media:enc=utf-8;system-prompt' })]
  );
  assert(!nonEquivalentStdin.isMainInput(inSpec),
    'stdin URN not equivalent to in= must not be the main input');
}

// TEST7104: A realistic multi-arg cap (one stdin main input; one required, defaultless cli_flag arg; several defaulted cli_flag args): exactly one arg is the main input, and partitioning the remaining args by required-without-default vs has-default yields the expected sets.
function test7104_multiArgCapExactlyOneMainInputAndPartitionOfRest() {
  const inSpec = MediaUrn.fromString('media:ext=pdf;pdf-stream');

  const args = [
    new CapArg(
      'media:enc=utf-8;file-path',
      true,
      // Main input may ALSO be delivered by cli-flag; stdin is the
      // defining route.
      [new ArgSource({ stdin: 'media:pdf-stream;ext=pdf' }), new ArgSource({ cli_flag: '--input' })]
    ),
    new CapArg(
      'media:enc=utf-8;question',
      true,
      [new ArgSource({ cli_flag: '--question' })]
    ),
    new CapArg(
      'media:max-tokens;numeric',
      false,
      [new ArgSource({ cli_flag: '--max-tokens' })],
      { default_value: 1024 }
    ),
    new CapArg(
      'media:numeric;temperature',
      false,
      [new ArgSource({ cli_flag: '--temperature' })],
      { default_value: 0.7 }
    ),
    new CapArg(
      'media:enc=utf-8;system-prompt',
      false,
      [new ArgSource({ cli_flag: '--system-prompt' })],
      { default_value: 'You are a helpful assistant.' }
    ),
  ];

  const mainInputs = args.filter(a => a.isMainInput(inSpec)).map(a => a.media_urn);
  const rest = args.filter(a => !a.isMainInput(inSpec));
  const requiredWithoutDefault = rest
    .filter(a => a.required && a.default_value === null)
    .map(a => a.media_urn);
  const withDefault = rest
    .filter(a => a.default_value !== null)
    .map(a => a.media_urn);

  assertEqual(JSON.stringify(mainInputs),
    JSON.stringify(['media:enc=utf-8;file-path']),
    'exactly one arg must be the main input');
  assertEqual(JSON.stringify(requiredWithoutDefault),
    JSON.stringify(['media:enc=utf-8;question']),
    'required-without-default partition');
  assertEqual(JSON.stringify(withDefault),
    JSON.stringify([
      'media:max-tokens;numeric',
      'media:numeric;temperature',
      'media:enc=utf-8;system-prompt',
    ]),
    'has-default partition');
}

// ===========================================================================
// Fabric alias tests (shared numbers 1880-1882, 1887)
//
// Shared test numbers test the same behavior, with the same method, across
// every capdag implementation. This lightweight JS mirror provides the alias
// primitives + Manifest (de)serialization; the registry-resolution tests
// (1888-1892) and notation-parser tests (1883-1886) belong to the mirrors
// that implement the full registry/resolver pipeline.
// ===========================================================================

// TEST1880: alias name normalization lowercases and accepts the allowed character class; rejects colon, whitespace, and out-of-class chars with the right error. A broken validator would let a URN-shaped or whitespace name through, or mangle a valid name.
function test1880_aliasNameNormalizationRules() {
  assertEqual(normalizeAliasName('JSONDoc'), 'jsondoc', 'lowercases');
  assertEqual(normalizeAliasName('pdf2text'), 'pdf2text', 'plain name');
  assertEqual(normalizeAliasName('my.alias-1_x'), 'my.alias-1_x', 'allowed punctuation');
  for (const bad of ['', 'pdf:text', 'my alias', 'a/b']) {
    let threw = false;
    try { normalizeAliasName(bad); } catch (_) { threw = true; }
    assert(threw, `normalizeAliasName must reject ${JSON.stringify(bad)}`);
  }
}

// TEST1881: URN-vs-alias detection keys purely on the presence of ':'. The whole design rests on this discriminator being exact.
function test1881_tokenUrnVsAliasDetection() {
  assert(tokenIsUrn('cap:in="media:ext=pdf";extract;out="media:enc=utf-8"'), 'cap URN is a URN');
  assert(tokenIsUrn('media:fmt=json;record'), 'media URN is a URN');
  assert(!tokenIsUrn('pdf2text'), 'bare name is not a URN');
  assert(isAliasToken('pdf2text'), 'bare name is an alias token');
  assert(!isAliasToken('media:enc=utf-8'), 'media URN is not an alias token');
}

// TEST1882: alias target classification distinguishes cap from media by prefix and rejects a non-URN target. The typed-boundary enforcement in the registry depends on this.
function test1882_classifyAliasTargetByPrefix() {
  assertEqual(classifyAliasTarget('media:fmt=json;record'), ALIAS_TARGET_MEDIA, 'media target');
  assertEqual(
    classifyAliasTarget('cap:effect=patch;in="media:image";name;out="media:ext=png;image"'),
    ALIAS_TARGET_CAP, 'cap target');
  assertEqual(classifyAliasTarget('not-a-urn'), null, 'non-URN target is null');
}

// TEST1887: the Manifest type round-trips an `aliases` map.
function test1887_manifestSerdeRoundTripsAliases() {
  const body = '{"version":1,"previous":0,"caps":{},"media":{},"aliases":{"pdf2text":3,"jsondoc":1}}';
  const m = Manifest.fromJSON(JSON.parse(body));
  assertEqual(m.aliases['pdf2text'], 3, 'pdf2text defver');
  assertEqual(m.aliases['jsondoc'], 1, 'jsondoc defver');
  const back = m.toJSON();
  assertEqual(back.aliases['pdf2text'], 3, 'round-trip pdf2text');
  assertEqual(back.aliases['jsondoc'], 1, 'round-trip jsondoc');

  // A StoredAlias round-trips its wire shape.
  const a = StoredAlias.fromJSON({ name: 'pdf2text', target: 'cap:effect=none', version: 3 });
  assertEqual(a.target, 'cap:effect=none', 'alias target');
  assertEqual(JSON.stringify(a.toJSON()), '{"name":"pdf2text","target":"cap:effect=none","version":3}', 'alias wire shape');
}

// TEST1894: selectDisplayAlias picks the SHORTEST name, ties broken
// alphabetically. This is the deterministic ordering every aliased-display
// surface relies on; a regression here silently changes which alias the whole
// UI renders.
function test1894_selectDisplayAliasOrdering() {
  // Shorter wins over longer regardless of alphabetical order.
  assertEqual(selectDisplayAlias(['png-image', 'png', 'image-png']), 'png', 'shortest wins');
  // Equal length → alphabetical (a09 < a16).
  assertEqual(selectDisplayAlias(['a16', 'a09', 'a12']), 'a09', 'tie → alphabetical');
  // Single candidate returns itself.
  assertEqual(selectDisplayAlias(['solo']), 'solo', 'single candidate');
  // Empty set → null.
  assertEqual(selectDisplayAlias([]), null, 'empty → null');
}

// TEST1895: displayAliasForUrn reverse-resolves a URN to its display alias.
// Proves: (1) the shortest-then-alphabetical winner among multiple aliases on
// the same target, (2) a NON-canonical query URN (different tag order) still
// resolves because the query is canonicalised before matching, (3) a URN with
// no alias returns null, (4) a non-URN string returns null.
function test1895_displayAliasForUrn() {
  const registry = new FabricRegistryClient();
  const capTarget = CapUrn.fromString('cap:coerce;in="media:integer;numeric";out="media:enc=utf-8"').toString();
  // Two aliases on the same cap target; "i2s" is shorter than "int2str".
  registry.insertCachedAliasForTest(new StoredAlias('int2str', capTarget, 1));
  registry.insertCachedAliasForTest(new StoredAlias('i2s', capTarget, 1));
  // A media alias too. Stored canonically.
  const jsonTarget = MediaUrn.fromString('media:fmt=json;record').toString();
  registry.insertCachedAliasForTest(new StoredAlias('json', jsonTarget, 1));

  // Canonical query → shortest alias wins.
  assertEqual(
    registry.displayAliasForUrn('cap:coerce;in="media:integer;numeric";out="media:enc=utf-8"'),
    'i2s', 'shortest cap alias wins');
  // NON-canonical query (media tags reordered) must still resolve via
  // canonicalisation.
  assertEqual(registry.displayAliasForUrn('media:record;fmt=json'), 'json',
    'non-canonical media query canonicalises');
  // A real URN with no alias → null.
  assertEqual(registry.displayAliasForUrn('media:enc=utf-8;ext=pdf'), null, 'no alias → null');
  // A non-URN (no cap:/media: prefix) → null, never a throw.
  assertEqual(registry.displayAliasForUrn('int2str'), null, 'non-URN → null');
}

// TEST1896: cachedCapAliases returns only CAP-targeted aliases as [name,
// target] pairs — media aliases are excluded. Drives the notation editor's
// registered-alias completions.
function test1896_cachedCapAliasesFiltersToCapTargets() {
  const registry = new FabricRegistryClient();
  const capTarget = CapUrn.fromString('cap:coerce;in="media:integer;numeric";out="media:enc=utf-8"').toString();
  registry.insertCachedAliasForTest(new StoredAlias('int2str', capTarget, 1));
  registry.insertCachedAliasForTest(new StoredAlias('json', MediaUrn.fromString('media:fmt=json;record').toString(), 1));
  const capAliases = registry.cachedCapAliases();
  assertEqual(capAliases.length, 1, 'only the cap alias is returned');
  assertEqual(capAliases[0][0], 'int2str', 'pair name');
  assertEqual(capAliases[0][1], capTarget, 'pair target');
}

// TEST1196: toMachineNotationAliased references an aliased cap DIRECTLY in the
// wiring by its display alias (shortest, then alphabetical) with NO header, and
// keeps the synthetic `edge_N` token + header for a cap that has no alias.
function test1196_aliasedSerializationUsesAliasAndDropsHeader() {
  const registry = new FabricRegistryClient();
  const m = Machine.fromString(
    '[extract cap:in="media:ext=pdf";extract;out="media:enc=utf-8;ext=txt"]' +
    '[embed cap:in="media:enc=utf-8;ext=txt";embed;out="media:embedding-vector;enc=utf-8;record"]' +
    '[doc -> extract -> text]' +
    '[text -> embed -> vectors]'
  );
  // Canonical target strings for the two caps, exactly as the serializer keys.
  const extractTarget = m.edges().find(e => e.capUrn.toString().includes('extract')).capUrn.toString();
  // Two aliases on the extract cap; "ex" is shorter than "extract-pdf".
  registry.insertCachedAliasForTest(new StoredAlias('extract-pdf', extractTarget, 1));
  registry.insertCachedAliasForTest(new StoredAlias('ex', extractTarget, 1));
  // No alias for the embed cap → it must stay a raw URN with a header.

  const aliased = m.toMachineNotationAliased(registry, 'bracketed');

  // The extract cap is aliased: referenced directly in the wiring by its
  // SHORTER alias `ex`, with NO header, and its URN must not appear.
  assert(aliased.includes('-> ex ->'),
    `extract cap must be referenced by shortest alias 'ex', got: ${aliased}`);
  assert(!aliased.includes('extract;out'),
    `the aliased extract cap URN must not appear, got: ${aliased}`);
  // The longer alias must not be chosen.
  assert(!aliased.includes('extract-pdf'),
    `the longer alias must not be used, got: ${aliased}`);
  // The un-aliased embed cap keeps its synthetic header binding `edge_N` to the
  // canonical embed URN.
  assert(/\[edge_\d+ cap:.*embed/.test(aliased),
    `the un-aliased embed cap must keep its header URN, got: ${aliased}`);

  // An un-aliased machine (empty registry) is byte-identical to the canonical
  // formatted form — the aliased path adds nothing when no alias exists.
  const empty = new FabricRegistryClient();
  assertEqual(
    m.toMachineNotationAliased(empty, 'bracketed'),
    m.toMachineNotationFormatted('bracketed'),
    'no aliases → identical to canonical bracketed form');
}

// ============================================================================
// Test runner
// ============================================================================


// ============================================================================
// Unified planner plan-space (planner.js) — TEST1450+
// ============================================================================


/** Planner-specific throw assertion: any PlanStateError counts. */
function assertThrowsPlanState(fn, message) {
  try {
    fn();
  } catch (error) {
    if (error instanceof plannerNS.PlanStateError) return;
    throw new Error(`Expected PlanStateError but got ${error.name}: ${error.message} (${message})`);
  }
  throw new Error(`Expected PlanStateError but function succeeded: ${message}`);
}

// TEST1514: the provenance vocabulary grows with installers. A workspace
// build install parses to its named value; a spelling this build does not
// know parses, is preserved VERBATIM, round-trips, and is not BUNDLE (the
// one semantic value) — an unknown telemetry hint can never fail the
// cartridge.json parse and take the cartridge down with it.
function test1514_installSourceVocabularyTolerance() {
  const base = {
    name: 'candlecartridge',
    version: '1.227.800',
    channel: 'nightly',
    registry_url: 'https://cartridges-staging.machinefabric.com/v1/manifest',
    entry: 'candlecartridge',
    installed_at: '2026-08-14T22:26:59Z',
    fabric_manifest_version: 4,
  };
  // A drifted installer's spelling is tolerated but NOT blessed: the
  // protocol's vocabulary is registry/dev/bundle/app_installer, and a
  // writer's mistake never becomes a named value.
  const built = CartridgeJson.fromObject({ ...base, installed_from: 'build' });
  assert(built.installedFrom === 'build',
    `build is preserved verbatim like any unknown, got ${built.installedFrom}`);
  assert(!Object.values(CartridgeInstallSource).includes('build'),
    'build is not part of the protocol vocabulary');

  const unknown = CartridgeJson.fromObject({ ...base, installed_from: 'quantum_courier' });
  assert(unknown.installedFrom === 'quantum_courier',
    `unknown spellings are preserved verbatim, got ${unknown.installedFrom}`);
  assert(unknown.installedFrom !== CartridgeInstallSource.BUNDLE,
    'an unknown spelling is never the semantic bundle value');
  const rewritten = unknown.toObject ? unknown.toObject() : JSON.parse(JSON.stringify(unknown));
  assert((rewritten.installed_from || rewritten.installedFrom) === 'quantum_courier',
    'unknown spellings round-trip');
}

// TEST1450: a defaults-only request is AUTO with every knob at its default,
// and the proto JSON carries the documented wire shape.
function test1450_planRequestDefaults() {
  const request = new plannerNS.PlanRequest({
    sources: [{ mediaUrn: 'media:ext=pdf', isSequence: false }],
    exactTargets: ['media:enc=utf-8;ext=txt'],
  });
  assertEqual(request.isConfigured, false, 'defaults are not configured');
  const wire = request.toProtoJSON();
  assertEqual(wire.mode, 0, 'AUTO mode');
  assertEqual(wire.ranking, 0, 'intent ranking');
  assertEqual(wire.convergence.presence, 0, 'auto presence');
  assertEqual(wire.convergence.mechanism, 0, 'any mechanism');
  assertEqual(wire.sources[0].media_urn, 'media:ext=pdf', 'snake_case source field');
  assertEqual(wire.sources[0].is_sequence, false, 'snake_case sequence field');
  assertEqual(wire.max_depth, 0, '0 = engine default depth');
}

// TEST1451: at-depth REQUIRES a positive depth; a depth anywhere else is
// invalid; ranking never flips the request to CONFIGURED but any
// space-constraining knob does (mode is forced to CONFIGURED on the wire).
function test1451_planRequestKnobValidation() {
  assertThrowsPlanState(() => new plannerNS.PlanRequest({
    sources: [{ mediaUrn: 'media:ext=pdf', isSequence: false }],
    exactTargets: ['media:enc=utf-8;ext=txt'],
    convergenceLocation: 'at-depth',
  }), 'at-depth without a depth must throw');

  assertThrowsPlanState(() => new plannerNS.PlanRequest({
    sources: [{ mediaUrn: 'media:ext=pdf', isSequence: false }],
    exactTargets: ['media:enc=utf-8;ext=txt'],
    convergenceAtDepth: 2,
  }), 'a depth without at-depth must throw');

  const ranked = new plannerNS.PlanRequest({
    sources: [{ mediaUrn: 'media:ext=pdf', isSequence: false }],
    exactTargets: ['media:enc=utf-8;ext=txt'],
    ranking: 'shortest',
  });
  assertEqual(ranked.isConfigured, false, 'ranking alone never configures');
  assertEqual(ranked.toProtoJSON().mode, 0, 'ranking alone stays AUTO');

  const constrained = new plannerNS.PlanRequest({
    sources: [{ mediaUrn: 'media:ext=pdf', isSequence: false }],
    exactTargets: ['media:enc=utf-8;ext=txt'],
    convergenceMechanism: 'collect',
  });
  assertEqual(constrained.isConfigured, true, 'a mechanism constrains');
  assertEqual(constrained.toProtoJSON().mode, 1, 'constrained ⇒ CONFIGURED on the wire');

  assertThrowsPlanState(() => new plannerNS.PlanRequest({
    sources: [],
    exactTargets: ['media:enc=utf-8;ext=txt'],
  }), 'no sources must throw');
  assertThrowsPlanState(() => new plannerNS.PlanRequest({
    sources: [{ mediaUrn: 'media:ext=pdf', isSequence: false }],
    exactTargets: [],
  }), 'no targets must throw');
}

// TEST1452: every knob round-trips value → proto number → value, and an
// unknown value/number fails hard in both directions.
function test1452_knobProtoRoundTrip() {
  const knobs = [
    plannerNS.ConvergencePresence, plannerNS.ConvergenceLocation,
    plannerNS.ConvergenceMechanism, plannerNS.ConvergenceArity,
    plannerNS.DivergencePresence, plannerNS.DivergenceLocation,
    plannerNS.RankPolicy, plannerNS.PlanMode,
  ];
  for (const knob of knobs) {
    for (const value of knob.values) {
      assertEqual(knob.fromProto(knob.toProto(value)), value, `${knob.name} round-trips ${value}`);
    }
    assertThrowsPlanState(() => knob.toProto('no-such-value'), `${knob.name} rejects unknown value`);
    assertThrowsPlanState(() => knob.fromProto(999), `${knob.name} rejects unknown number`);
  }
}

// TEST1453: candidate/target parsers accept realistic proto-JSON and sort
// candidates by rank; malformed payloads (missing field, wrong type) fail
// hard with the offending path in the message.
function test1453_planResponseParsers() {
  const candidates = plannerNS.parsePlanCandidates({
    candidates: [
      {
        notation: '[n0 -> edge_1 -> n1]',
        label: 'Convert each',
        rank: 1,
        profile: { source_media: ['media:ext=pdf'], target_media: ['media:enc=utf-8;ext=txt'], apexes: [], converged: false, diverged: false },
        cost: { cap_steps: 2, total_steps: 2, max_leg_depth: 0, intent_score: 0.5 },
      },
      {
        notation: '[(n0, n1) -> edge_0 -> n2]',
        label: 'Combine via text',
        rank: 0,
        profile: {
          source_media: ['media:ext=pdf', 'media:ext=md'],
          target_media: ['media:enc=utf-8;ext=txt'],
          apexes: [{ media_urn: 'media:enc=utf-8;page', mechanism: 2, depth: 1 }],
          converged: true,
          diverged: false,
        },
        cost: { cap_steps: 3, total_steps: 4, max_leg_depth: 1, intent_score: 0.8 },
      },
    ],
  });
  assertEqual(candidates.length, 2, 'two candidates');
  assertEqual(candidates[0].rank, 0, 'sorted by rank');
  assertEqual(candidates[0].profile.apexes[0].mechanism, 'collect', 'proto mechanism decoded to knob value');
  assertEqual(candidates[0].profile.converged, true, 'converged carried');

  assertThrowsPlanState(
    () => plannerNS.parsePlanCandidates({ candidates: [{ label: 'missing notation', rank: 0 }] }),
    'a candidate without notation must fail hard'
  );

  const targets = plannerNS.parseConvergentTargets({
    targets: [
      {
        media_def: 'media:enc=utf-8;ext=txt',
        display_name: 'Plain Text',
        min_total_steps: 3,
        apex: { media_urn: 'media:enc=utf-8;page', mechanism: 2, depth: 1 },
        convergent: true,
        file_extension: 'txt',
      },
      {
        media_def: 'media:ext=png;image',
        display_name: 'PNG Image',
        min_total_steps: 2,
        convergent: false,
        file_extension: 'png',
      },
    ],
  });
  assertEqual(targets[0].apex.mediaUrn, 'media:enc=utf-8;page', 'apex carried');
  assertEqual(targets[1].apex, null, 'independent target has no apex');
  assertThrowsPlanState(
    () => plannerNS.parseConvergentTargets({ targets: [{ display_name: 'no media_def' }] }),
    'a target without media_def must fail hard'
  );
}

async function runTests() {
  console.log('Running capdag-js tests...\n');

  // cap_urn.rs: TEST001-TEST050, TEST890-TEST891
  console.log('--- cap_urn.rs ---');
  runTest('TEST001: cap_urn_creation', test001_capUrnCreation);
  runTest('TEST002: direction_specs_required', test002_directionSpecsRequired);
  runTest('TEST003: direction_matching', test003_directionMatching);
  runTest('TEST004: unquoted_values_lowercased', test004_unquotedValuesLowercased);
  runTest('TEST005: quoted_values_preserve_case', test005_quotedValuesPreserveCase);
  runTest('TEST006: quoted_value_special_chars', test006_quotedValueSpecialChars);
  runTest('TEST007: quoted_value_escape_sequences', test007_quotedValueEscapeSequences);
  runTest('TEST008: mixed_quoted_unquoted', test008_mixedQuotedUnquoted);
  runTest('TEST009: unterminated_quote_error', test009_unterminatedQuoteError);
  runTest('TEST010: invalid_escape_sequence_error', test010_invalidEscapeSequenceError);
  runTest('TEST011: serialization_smart_quoting', test011_serializationSmartQuoting);
  runTest('TEST012: round_trip_simple', test012_roundTripSimple);
  runTest('TEST013: round_trip_quoted', test013_roundTripQuoted);
  runTest('TEST014: round_trip_escapes', test014_roundTripEscapes);
  runTest('TEST015: cap_prefix_required', test015_capPrefixRequired);
  runTest('TEST016: trailing_semicolon_equivalence', test016_trailingSemicolonEquivalence);
  runTest('TEST939: cap_urn_canonical_form_drops_wildcard_in_out', test939_capUrnCanonicalFormDropsWildcardInOut);
  runTest('TEST017: tag_matching', test017_tagMatching);
  runTest('TEST018: matching_case_sensitive_values', test018_matchingCaseSensitiveValues);
  runTest('TEST019: missing_tag_handling', test019_missingTagHandling);
  runTest('TEST020: specificity', test020_specificity);
  runTest('TEST021: builder', test021_builder);
  runTest('TEST022: builder_requires_direction', test022_builderRequiresDirection);
  runTest('TEST023: builder_preserves_case', test023_builderPreservesCase);
  runTest('TEST024: compatibility', test024_compatibility);
  runTest('TEST025: best_match', test025_bestMatch);
  runTest('TEST026: merge_and_subset', test026_mergeAndSubset);
  runTest('TEST027: wildcard_tag', test027_wildcardTag);
  runTest('TEST028: empty_cap_urn_not_allowed', test028_emptyCapUrnNotAllowed);
  runTest('TEST029: minimal_cap_urn', test029_minimalCapUrn);
  runTest('TEST030: extended_character_support', test030_extendedCharacterSupport);
  runTest('TEST031: wildcard_restrictions', test031_wildcardRestrictions);
  runTest('TEST032: duplicate_key_rejection', test032_duplicateKeyRejection);
  runTest('TEST033: numeric_key_restriction', test033_numericKeyRestriction);
  runTest('TEST034: empty_value_error', test034_emptyValueError);
  runTest('TEST035: has_tag_case_sensitive', test035_hasTagCaseSensitive);
  runTest('TEST036: with_tag_preserves_value', test036_withTagPreservesValue);
  runTest('TEST037: with_tag_rejects_empty_value', test037_withTagRejectsEmptyValue);
  runTest('TEST038: semantic_equivalence', test038_semanticEquivalence);
  runTest('TEST039: get_tag_returns_direction_specs', test039_getTagReturnsDirectionSpecs);
  runTest('TEST040: matching_semantics_exact_match', test040_matchingSemanticsExactMatch);
  runTest('TEST041: matching_semantics_cap_missing_tag', test041_matchingSemanticsCapMissingTag);
  runTest('TEST042: matching_semantics_cap_has_extra_tag', test042_matchingSemanticsCapHasExtraTag);
  runTest('TEST043: matching_semantics_request_has_wildcard', test043_matchingSemanticsRequestHasWildcard);
  runTest('TEST044: matching_semantics_cap_has_wildcard', test044_matchingSemanticsCapHasWildcard);
  runTest('TEST045: matching_semantics_value_mismatch', test045_matchingSemanticsValueMismatch);
  runTest('TEST046: matching_semantics_fallback_pattern', test046_matchingSemanticsFallbackPattern);
  runTest('TEST047: matching_semantics_thumbnail_void_input', test047_matchingSemanticsThumbnailVoidInput);
  runTest('TEST048: matching_semantics_wildcard_direction', test048_matchingSemanticsWildcardDirection);
  runTest('TEST049: matching_semantics_cross_dimension', test049_matchingSemanticsCrossDimension);
  runTest('TEST050: matching_semantics_direction_mismatch', test050_matchingSemanticsDirectionMismatch);
  runTest('TEST890: direction_semantic_matching', test890_directionSemanticMatching);
  runTest('TEST891: direction_semantic_specificity', test891_directionSemanticSpecificity);

  // validation.rs: TEST053-TEST056
  console.log('\n--- validation.rs ---');
  console.log('  SKIP TEST053: N/A for JS (Rust-only validation infrastructure)');
  runTest('TEST054: xv5_inline_spec_redefinition_detected', test6212_xv5InlineSpecRedefinitionDetected);
  runTest('TEST055: xv5_new_inline_spec_allowed', test6216_xv5NewInlineSpecAllowed);
  runTest('TEST056: xv5_empty_media_defs_allowed', test6220_xv5EmptyMediaDefsAllowed);

  // media_urn.rs: TEST060-TEST078
  console.log('\n--- media_urn.rs ---');
  runTest('TEST060: wrong_prefix_fails', test060_wrongPrefixFails);
  console.log('  SKIP TEST061: REMOVED (binary/text distinction gone; see TEST067 for enc=)');
  runTest('TEST062: is_record', test062_isRecord);
  runTest('TEST063: is_scalar', test063_isScalar);
  runTest('TEST064: is_list', test064_isList);
  runTest('TEST065: is_opaque', test065_isOpaque);
  runTest('TEST066: is_json', test066_isJson);
  runTest('TEST067: is_text', test067_isText);
  runTest('TEST068: is_void', test068_isVoid);
  console.log('  SKIP TEST069-070: N/A for JS (Rust binary_media_urn_for_ext/text_media_urn_for_ext)');
  runTest('TEST071: to_string_roundtrip', test071_toStringRoundtrip);
  runTest('TEST072: constants_parse', test072_constantsParse);
  console.log('  SKIP TEST073: N/A for JS (Rust extension helpers)');
  runTest('TEST074: media_urn_matching', test074_mediaUrnMatching);
  runTest('TEST075: accepts', test075_accepts);
  runTest('TEST076: specificity', test076_specificity);
  runTest('TEST077: serde_roundtrip (JSON.stringify)', test077_serdeRoundtrip);
  runTest('TEST078: debug_matching_behavior', test078_debugMatchingBehavior);

  // media_def.rs: TEST088-TEST110
  console.log('\n--- media_def.rs ---');
  console.log('  SKIP TEST088-090: N/A for JS (async registry, Rust-only)');
  runTest('TEST6282: resolve_custom_media_def', test6282_resolveCustomMediaDef);
  runTest('TEST6283: resolve_custom_with_schema', test6283_resolveCustomWithSchema);
  runTest('TEST093: resolve_unresolvable_fails_hard', test93_resolveUnresolvableFailsHard);
  console.log('  SKIP TEST094: N/A for JS (no registry concept)');
  console.log('  SKIP TEST095-098: N/A for JS (Rust serde/validation)');
  runTest('TEST099: resolved_is_binary', test99_resolvedIsBinary);
  runTest('TEST100: resolved_is_record', test100_resolvedIsRecord);
  runTest('TEST101: resolved_is_scalar', test101_resolvedIsScalar);
  runTest('TEST102: resolved_is_list', test102_resolvedIsList);
  runTest('TEST103: resolved_is_json', test103_resolvedIsJson);
  runTest('TEST104: resolved_is_text', test104_resolvedIsText);
  runTest('TEST105: metadata_propagation', test105_metadataPropagation);
  runTest('TEST106: metadata_with_validation', test106_metadataWithValidation);
  runTest('TEST107: extensions_propagation', test107_extensionsPropagation);
  runTest('TEST108: extensions_serialization', test108_extensionsSerialization);
  runTest('TEST109: extensions_with_metadata_and_validation', test109_extensionsWithMetadataAndValidation);
  runTest('TEST110: multiple_extensions', test110_multipleExtensions);
  runTest('TEST115: cap_arg_serialization', test115_capArgSerialization);
  runTest('TEST116: cap_arg_constructors', test116_capArgConstructors);
  runTest('TEST150: cap_manifest_json_serialization', test150_capManifestJsonSerialization);
  runTest('TEST597: cap_arg_with_full_definition', test597_capArgWithFullDefinition);

  // cap-fab-renderer.js uses CapFab in browse mode (static registry from
  // /api/capabilities). These tests guard the minimal API the renderer relies
  // on: new CapFab(), addCap(cap, registryName), getEdges(), getOutgoing().
  console.log('\n--- cap_fab (browse-mode API used by cap-fab-renderer) ---');
  runTest('cap_fab: add_cap_populates_edges_and_nodes', test6206_CapFabAddCapPopulatesEdgesAndNodes);
  runTest('cap_fab: get_outgoing_conforms_to_matching', test6208_CapFabGetOutgoingConformsToMatching);
  runTest('cap_fab: distinct_registry_names_recorded_per_edge', test6224_CapFabDistinctRegistryNames);

  // caller.rs: TEST156-TEST159
  console.log('\n--- caller.rs (StdinSource) ---');
  runTest('TEST156: stdin_source_from_data', test156_stdinSourceFromData);
  runTest('TEST157: stdin_source_from_file_reference', test157_stdinSourceFromFileReference);
  runTest('TEST158: stdin_source_empty_data', test158_stdinSourceWithEmptyData);
  runTest('TEST159: stdin_source_binary_content', test159_stdinSourceWithBinaryContent);

  // caller.rs: TEST274-TEST283
  console.log('\n--- caller.rs (CapArgumentValue) ---');
  runTest('TEST274: cap_argument_value_new', test274_capArgumentValueNew);
  runTest('TEST275: cap_argument_value_from_str', test275_capArgumentValueFromStr);
  runTest('TEST276: cap_argument_value_as_str_valid', test276_capArgumentValueAsStrValid);
  runTest('TEST277: cap_argument_value_as_str_invalid_utf8', test277_capArgumentValueAsStrInvalidUtf8);
  runTest('TEST278: cap_argument_value_empty', test278_capArgumentValueEmpty);
  console.log('  SKIP TEST279-281: N/A for JS (Rust Debug/Clone/Send traits)');
  runTest('TEST282: cap_argument_value_unicode', test282_capArgumentValueUnicode);
  runTest('TEST283: cap_argument_value_large_binary', test283_capArgumentValueLargeBinary);

  // standard/caps.rs: TEST304-TEST312
  console.log('\n--- standard/caps.rs ---');
  runTest('TEST304: media_availability_output_constant', test304_mediaAvailabilityOutputConstant);
  runTest('TEST305: media_path_output_constant', test305_mediaPathOutputConstant);
  runTest('TEST306: availability_and_path_output_distinct', test306_availabilityAndPathOutputDistinct);
  runTest('TEST307: model_availability_urn', test307_modelAvailabilityUrn);
  runTest('TEST308: model_path_urn', test308_modelPathUrn);
  runTest('TEST309: model_availability_and_path_are_distinct', test309_modelAvailabilityAndPathAreDistinct);
  runTest('TEST310: llm_generate_text_urn', test310_llmGenerateTextUrn);
  runTest('llm_generate_text_urn_specs', test6228_LlmGenerateTextUrnSpecs);
  runTest('TEST312: all_urn_builders_produce_valid_urns', test312_allUrnBuildersProduceValidUrns);

  // JS-specific tests (no Rust number)
  console.log('\n--- JS-specific ---');
  runTest('JS: build_extension_index', test6232_JS_buildExtensionIndex);
  runTest('JS: media_urns_for_extension', test6236_JS_mediaUrnsForExtension);
  runTest('JS: get_extension_mappings', test6240_JS_getExtensionMappings);
  runTest('JS: resolve_media_urn_from_specs', test6242_JS_resolveMediaUrnFromSpecs);
  runTest('JS: cap_json_serialization', test6246_JS_capJSONSerialization);
  runTest('JS: cap_documentation_round_trip', test6249_JS_capDocumentationRoundTrip);
  runTest('JS: cap_documentation_omitted_when_null', test6253_JS_capDocumentationOmittedWhenNull);
  runTest('JS: media_def_documentation_propagates_through_resolve', test6257_JS_mediaDefDocumentationPropagatesThroughResolve);
  runTest('JS: stdin_source_kind_constants', test6261_JS_stdinSourceKindConstants);
  runTest('JS: stdin_source_null_data', test6265_JS_stdinSourceNullData);
  runTest('JS: media_def_construction', test6269_JS_mediaDefConstruction);

  // cartridge_repo: CartridgeRepoServer and CartridgeRepoClient tests
  console.log('\n--- cartridge_repo ---');
  runTest('TEST320: cartridge_info_construction', test320_cartridgeInfoConstruction);
  runTest('TEST321: cartridge_info_is_signed', test321_cartridgeInfoIsSigned);
  runTest('TEST322: cartridge_info_build_for_platform', test322_cartridgeInfoBuildForPlatform);
  runTest('TEST323: cartridge_repo_server_validate_registry', test323_cartridgeRepoServerValidateRegistry);
  runTest('TEST324: cartridge_repo_server_transform_to_array', test324_cartridgeRepoServerTransformToArray);
  runTest('TEST325: cartridge_repo_server_get_cartridges', test325_cartridgeRepoServerGetCartridges);
  runTest('TEST326: cartridge_repo_server_get_cartridge_by_id', test326_cartridgeRepoServerGetCartridgeById);
  runTest('TEST327: cartridge_repo_server_search_cartridges', test327_cartridgeRepoServerSearchCartridges);
  runTest('TEST328: cartridge_repo_server_get_by_category', test328_cartridgeRepoServerGetByCategory);
  runTest('TEST329: cartridge_repo_server_get_by_cap', test329_cartridgeRepoServerGetByCap);
  runTest('TEST330: cartridge_repo_client_update_cache', test330_cartridgeRepoClientUpdateCache);
  runTest('TEST331: cartridge_repo_client_get_suggestions', test331_cartridgeRepoClientGetSuggestions);
  runTest('TEST332: cartridge_repo_client_get_cartridge', test332_cartridgeRepoClientGetCartridge);
  runTest('TEST333: cartridge_repo_client_get_all_caps', test333_cartridgeRepoClientGetAllCaps);
  runTest('TEST334: cartridge_repo_client_needs_sync', test334_cartridgeRepoClientNeedsSync);
  runTest('TEST335: cartridge_repo_server_client_integration', test335_cartridgeRepoServerClientIntegration);

  // cartridge_repo.rs: TEST1849-TEST1853 (host-compatibility resolution)
  console.log('\n--- cartridge_repo.rs (resolve_for_host) ---');
  runTest('TEST1849: resolve_for_host_compatible_latest', test1849_resolveForHostCompatibleLatest);
  runTest('TEST1850: resolve_for_host_compatible_outdated', test1850_resolveForHostCompatibleOutdated);
  runTest('TEST1851: resolve_for_host_incompatible', test1851_resolveForHostIncompatible);
  runTest('TEST1852: resolve_for_host_skips_build_with_no_installer', test1852_resolveForHostSkipsBuildWithNoInstaller);
  runTest('TEST1853: host_platform_normalized_form', test1853_hostPlatformNormalizedForm);

  // manifest.rs: TEST1872-TEST1874 (registry_url_from_build_env)
  console.log('\n--- manifest.rs (registry_url_from_build_env) ---');
  runTest('TEST1872: registry_url_from_build_env_passes_through_nonempty', test1872_registryUrlFromBuildEnvPassesThroughNonempty);
  runTest('TEST1873: registry_url_from_build_env_none_for_dev', test1873_registryUrlFromBuildEnvNoneForDev);
  runTest('TEST1874: registry_url_from_build_env_rejects_empty_string', test1874_registryUrlFromBuildEnvRejectsEmptyString);

  // cartridge_discovery.rs: TEST1875-TEST1878 (scan-all discovery)
  console.log('\n--- cartridge_discovery.rs (discover_cartridges) ---');
  await runTest('TEST1875: scan_all_reaches_both_dev_and_registry_slugs', test1875_scanAllReachesBothDevAndRegistrySlugs);
  await runTest('TEST1876: other_channel_subtree_is_skipped', test1876_otherChannelSubtreeIsSkipped);
  await runTest('TEST1877: registry_cartridge_under_wrong_slug_is_bad_install', test1877_registryCartridgeUnderWrongSlugIsBadInstall);
  await runTest('TEST1878: bundled_cartridge_without_baked_hash_is_rejected', test1878_bundledCartridgeWithoutBakedHashIsRejected);

  // media_urn.rs: TEST1312-TEST1315, TEST1298-TEST1302 (MediaUrn predicates)
  console.log('\n--- media_urn.rs (predicates) ---');
  runTest('TEST1312: is_image', test546_isImage);
  runTest('TEST1313: is_audio', test547_isAudio);
  runTest('TEST1314: is_video', test548_isVideo);
  runTest('TEST1315: is_numeric', test549_isNumeric);
  runTest('TEST1298: is_bool', test550_isBool);
  runTest('TEST1299: is_file_path', test551_isFilePath);
  runTest('TEST553: is_live_feed', test553_isLiveFeed);
  runTest('TEST1302: predicate_constant_consistency', test558_predicateConstantConsistency);

  // cap_urn.rs: TEST1303-TEST1307 (CapUrn tier tests)
  console.log('\n--- cap_urn.rs (tier tests) ---');
  runTest('TEST1303: without_tag', test559_withoutTag);
  runTest('TEST1304: with_in_out_spec', test560_withInOutSpec);
  runTest('TEST1305: find_all_matches', test563_findAllMatches);
  runTest('TEST1306: are_compatible', test564_areCompatible);
  runTest('TEST1307: with_tag_rejects_structural_keys', test566_withTagRejectsStructuralKeys);
  runTest('TEST1308: builder_rejects_structural_keys', test6544_builderRejectsStructuralKeys);
  runTest('TEST1294: rule11_void_input_with_stdin_rejected', test1294_rule11VoidInputWithStdinRejected);
  runTest('TEST1295: rule11_non_void_input_without_stdin_rejected', test1295_rule11NonVoidInputWithoutStdinRejected);
  runTest('TEST1296: rule11_void_input_cli_flag_only', test1296_rule11VoidInputCliFlagOnly);
  runTest('TEST1297: rule11_non_void_input_with_stdin', test1297_rule11NonVoidInputWithStdin);
  runTest('TEST1953: rule14_streaming_only_on_main_input', test1953_rule14StreamingOnlyOnMainInput);
  runTest('TEST1964: unknown_definition_field_is_refused', test1964_unknownDefinitionFieldIsRefused);

  // cap_urn.rs: TEST639-TEST653 (Cap URN wildcard tests)
  console.log('\n--- cap_urn.rs (wildcard tests) ---');
  runTest('TEST639: empty_cap_is_illegal', test6201_emptyCapIsIllegal);
  runTest('TEST640: in_only_is_illegal', test640_inOnlyIsIllegal);
  runTest('TEST641: out_only_is_illegal', test641_outOnlyIsIllegal);
  runTest('TEST642: in_out_without_values_are_illegal', test642_inOutWithoutValuesAreIllegal);
  runTest('TEST643: explicit_asterisk_is_illegal', test643_explicitAsteriskIsIllegal);
  runTest('TEST644: specific_in_wildcard_out_is_illegal', test644_specificInWildcardOutIsIllegal);
  runTest('TEST645: wildcard_in_specific_out', test645_wildcardInSpecificOut);
  runTest('TEST646: invalid_in_spec_fails', test646_invalidInSpecFails);
  runTest('TEST647: invalid_out_spec_fails', test647_invalidOutSpecFails);
  runTest('TEST648: wildcard_accepts_specific', test648_wildcardAcceptsSpecific);
  runTest('TEST649: specificity_scoring', test649_specificityScoring);
  runTest('TEST650: wildcard_preserve_other_tags', test650_wildcardPreserveOtherTags);
  runTest('TEST651: wildcard_generic_forms_rejected', test6620_wildcardGenericFormsRejected);
  runTest('TEST652: cap_identity_constant_works', test6621_capIdentityConstantWorks);
  runTest('TEST653: invalid_effect_none_declaration_rejected', test653_invalidEffectNoneDeclarationRejected);
  runTest('TEST654: effect_none_preserves_runtime_media', test125_effectNonePreservesRuntimeMedia);
  runTest('TEST655: effect_declared_uses_declared_output', test126_effectDeclaredUsesDeclaredOutput);
  runTest('TEST656: invalid_effect_none_fails_hard', test127_invalidEffectNoneFailsHard);
  runTest('TEST657: effect_dispatch_requires_explicit_wildcard', test128_effectDispatchRequiresExplicitWildcard);
  runTest('TEST8150: registry_verdict_states_closed', test8150_registryVerdictStatesAreTheClosedWireVocabulary);
  runTest('TEST8151: chain_failure_classification', test8151_unreadableFormatIsUnverifiableAndRejectedKeyIsUntrusted);
  runTest('TEST8152: only_verified_permits_attachment', test8152_onlyVerifiedPermitsAttachment);
  runTest('TEST8153: trust_failures_never_transient', test8153_trustFailuresAreNeverTransient);
  runTest('TEST8154: contradictory_verdicts_refused', test8154_contradictoryVerdictsAreRefused);
  runTest('TEST8159: remedy_follows_from_state', test8159_theRemedyFollowsFromTheState);
  runTest('TEST8162: a_verdict_says_the_same_thing_at_a_different_time', test8162_aVerdictSaysTheSameThingAtADifferentTime);
  runTest('TEST8155: registry_verdict_wire_round_trip', test8155_registryVerdictWireRoundTrip);
  runTest('TEST8157: signature_formats_from_library', test8157_signatureFormatDiscriminatorsComeFromTheLibrary);
  runTest('TEST8158: attachment_kinds_separate_situations', test8158_attachmentKindsSeparateTheirSituations);
  runTest('TEST12166: the_implementation_is_the_proved_model', test12166_theImplementationIsTheProvedModel);
  runTest('TEST8121: effect_conformance_declared_asymmetry', test8121_effectConformanceDeclaredAsymmetry);
  runTest('TEST8122: effect_conformance_none_requires_equivalence', test8122_effectConformanceNoneRequiresEquivalence);
  runTest('TEST8123: effect_conformance_patch_requires_patched_input', test8123_effectConformancePatchRequiresPatchedInput);

  // machine module: parser tests (mirrors parser.rs)
  console.log('\n--- machine/parser.rs ---');
  runTest('MACHINE:empty_input', test6275_Machine_emptyInput);
  runTest('MACHINE:whitespace_only', test6277_Machine_whitespaceOnly);
  runTest('MACHINE:header_only_no_wirings', test6279_Machine_headerOnlyNoWirings);
  runTest('MACHINE:duplicate_alias', test6280_Machine_duplicateAlias);
  runTest('MACHINE:simple_linear_chain', test6286_Machine_simpleLinearChain);
  runTest('MACHINE:two_step_chain', test6288_Machine_twoStepChain);
  runTest('MACHINE:fan_out', test6290_Machine_fanOut);
  runTest('MACHINE:fan_in_secondary_assigned_by_prior_wiring', test6292_Machine_fanInSecondaryAssignedByPriorWiring);
  runTest('MACHINE:fan_in_secondary_unassigned_gets_wildcard', test6294_Machine_fanInSecondaryUnassignedGetsWildcard);
  runTest('MACHINE:loop_keyword_is_not_grammar', test6306_Machine_loopKeywordIsNotGrammar);
  runTest('MACHINE:undefined_alias_fails', test6308_Machine_undefinedAliasFails);
  runTest('MACHINE:node_alias_collision', test6310_Machine_nodeAliasCollision);
  runTest('MACHINE:conflicting_media_types_fail', test6312_Machine_conflictingMediaTypesFail);
  runTest('MACHINE:multiline_format', test6315_Machine_multilineFormat);
  runTest('MACHINE:different_aliases_same_graph', test6318_Machine_differentAliasesSameGraph);
  runTest('MACHINE:malformed_input_fails', test6321_Machine_malformedInputFails);
  runTest('MACHINE:unterminated_bracket_fails', test6323_Machine_unterminatedBracketFails);

  // machine module: line-based mode tests
  console.log('\n--- machine/parser.rs (line-based) ---');
  runTest('MACHINE:line_based_simple_chain', test6327_Machine_lineBasedSimpleChain);
  runTest('MACHINE:line_based_two_step_chain', test6331_Machine_lineBasedTwoStepChain);
  runTest('MACHINE:line_based_loop_keyword_is_not_grammar', test6334_Machine_lineBasedLoopKeywordIsNotGrammar);
  runTest('MACHINE:line_based_fan_in', test6337_Machine_lineBasedFanIn);
  runTest('MACHINE:mixed_bracketed_and_line_based', test6341_Machine_mixedBracketedAndLineBased);
  runTest('MACHINE:line_based_equivalent_to_bracketed', test6345_Machine_lineBasedEquivalentToBracketed);
  runTest('MACHINE:line_based_format_serialization', test6349_Machine_lineBasedFormatSerialization);
  runTest('MACHINE:line_based_and_bracketed_parse_same_graph', test6353_Machine_lineBasedAndBracketedParseSameGraph);

  // machine module: graph tests (mirrors graph.rs)
  console.log('\n--- machine/graph.rs ---');
  runTest('MACHINE:edge_equivalence_same_urns', test6357_Machine_edgeEquivalenceSameUrns);
  runTest('MACHINE:edge_equivalence_different_cap_urns', test6361_Machine_edgeEquivalenceDifferentCapUrns);
  runTest('MACHINE:edge_equivalence_different_targets', test6365_Machine_edgeEquivalenceDifferentTargets);
  runTest('MACHINE:edge_equivalence_different_loop_flag', test6369_Machine_edgeEquivalenceDifferentLoopFlag);
  runTest('MACHINE:edge_equivalence_source_order_independent', test6372_Machine_edgeEquivalenceSourceOrderIndependent);
  runTest('MACHINE:edge_equivalence_different_source_count', test6375_Machine_edgeEquivalenceDifferentSourceCount);
  runTest('MACHINE:graph_equivalence_same_edges', test6377_Machine_graphEquivalenceSameEdges);
  runTest('MACHINE:graph_equivalence_reordered_edges', test6380_Machine_graphEquivalenceReorderedEdges);
  runTest('MACHINE:graph_not_equivalent_different_edge_count', test6383_Machine_graphNotEquivalentDifferentEdgeCount);
  runTest('MACHINE:graph_not_equivalent_different_cap', test6386_Machine_graphNotEquivalentDifferentCap);
  runTest('MACHINE:graph_empty', test6389_Machine_graphEmpty);
  runTest('MACHINE:graph_empty_equivalence', test6392_Machine_graphEmptyEquivalence);
  runTest('MACHINE:root_sources_linear_chain', test6395_Machine_rootSourcesLinearChain);
  runTest('MACHINE:leaf_targets_linear_chain', test6397_Machine_leafTargetsLinearChain);
  runTest('MACHINE:root_sources_fan_in', test6398_Machine_rootSourcesFanIn);
  runTest('MACHINE:display_edge', test6400_Machine_displayEdge);
  runTest('MACHINE:display_graph', test6402_Machine_displayGraph);

  // machine module: serializer tests (mirrors serializer.rs)
  console.log('\n--- machine/serializer.rs ---');
  runTest('MACHINE:serialize_single_edge', test6404_Machine_serializeSingleEdge);
  runTest('MACHINE:serialize_two_edge_chain', test6406_Machine_serializeTwoEdgeChain);
  runTest('MACHINE:serialize_empty_graph', test6408_Machine_serializeEmptyGraph);
  runTest('MACHINE:roundtrip_single_edge', test6410_Machine_roundtripSingleEdge);
  runTest('MACHINE:roundtrip_two_edge_chain', test6413_Machine_roundtripTwoEdgeChain);
  runTest('MACHINE:roundtrip_fan_out', test6415_Machine_roundtripFanOut);
  runTest('MACHINE:loop_edge_serializes_without_loop_text', test6417_Machine_loopEdgeSerializesWithoutLoopText);
  runTest('MACHINE:serialization_is_deterministic', test6419_Machine_serializationIsDeterministic);
  runTest('MACHINE:reordered_edges_produce_same_notation', test6421_Machine_reorderedEdgesProduceSameNotation);
  runTest('MACHINE:multiline_serialize_format', test6429_Machine_multilineSerializeFormat);
  runTest('MACHINE:alias_from_op_tag', test6432_Machine_aliasFromOpTag);
  runTest('MACHINE:alias_fallback_without_op_tag', test6434_Machine_aliasFallbackWithoutOpTag);
  runTest('MACHINE:duplicate_op_tags_disambiguated', test6436_Machine_duplicateOpTagsDisambiguated);

  // machine module: builder tests
  console.log('\n--- machine/builder ---');
  runTest('MACHINE:builder_single_edge', test6437_Machine_builderSingleEdge);
  runTest('MACHINE:builder_with_loop', test6438_Machine_builderWithLoop);
  runTest('MACHINE:builder_chaining', test6439_Machine_builderChaining);
  runTest('MACHINE:builder_equivalent_to_parsed', test6440_Machine_builderEquivalentToParsed);
  runTest('MACHINE:builder_round_trip', test6442_Machine_builderRoundTrip);

  // machine module: CapUrn.isEquivalent/isComparable
  console.log('\n--- machine/urn_predicates ---');
  runTest('MACHINE:cap_urn_is_equivalent', test6444_Machine_capUrnIsEquivalent);
  runTest('MACHINE:cap_urn_is_comparable', test6446_Machine_capUrnIsComparable);
  runTest('MACHINE:cap_urn_in_media_urn', test6448_Machine_capUrnInMediaUrn);
  runTest('MACHINE:cap_urn_out_media_urn', test6449_Machine_capUrnOutMediaUrn);
  runTest('MACHINE:media_urn_is_equivalent', test6450_Machine_mediaUrnIsEquivalent);
  runTest('MACHINE:media_urn_is_comparable', test6451_Machine_mediaUrnIsComparable);

  // Phase 0A: Position tracking
  console.log('\n--- machine/position_tracking ---');
  runTest('MACHINE:parseMachineWithAST_headerLocation', test6452_Machine_parseMachineWithAST_headerLocation);
  runTest('MACHINE:parseMachineWithAST_wiringLocation', test6453_Machine_parseMachineWithAST_wiringLocation);
  runTest('MACHINE:parseMachineWithAST_multilinePositions', test6454_Machine_parseMachineWithAST_multilinePositions);
  runTest('MACHINE:parseMachineWithAST_fanInSourceLocations', test6455_Machine_parseMachineWithAST_fanInSourceLocations);
  runTest('MACHINE:parseMachineWithAST_aliasMap', test6456_Machine_parseMachineWithAST_aliasMap);
  runTest('MACHINE:parseMachineWithAST_nodeMedia', test6457_Machine_parseMachineWithAST_nodeMedia);
  runTest('MACHINE:errorLocation_parseError', test6458_Machine_errorLocation_parseError);
  runTest('MACHINE:errorLocation_duplicateAlias', test6459_Machine_errorLocation_duplicateAlias);
  runTest('MACHINE:errorLocation_undefinedAlias', test6460_Machine_errorLocation_undefinedAlias);

  // Phase 0C: Machine.toMermaid()
  console.log('\n--- machine/mermaid ---');
  runTest('MACHINE:toMermaid_linearChain', test6462_Machine_toMermaid_linearChain);
  runTest('MACHINE:toMermaid_loopEdge', test6463_Machine_toMermaid_loopEdge);
  runTest('MACHINE:toMermaid_emptyGraph', test6464_Machine_toMermaid_emptyGraph);
  runTest('MACHINE:toMermaid_fanIn', test6465_Machine_toMermaid_fanIn);
  runTest('MACHINE:toMermaid_fanOut', test6466_Machine_toMermaid_fanOut);

  // Phase 0B: FabricRegistryClient
  console.log('\n--- registry/client ---');
  runTest('REGISTRY: capRegistryEntry_construction', test6467_Machine_capRegistryEntry_construction);
  runTest('REGISTRY: mediaRegistryEntry_construction', test6468_Machine_mediaRegistryEntry_construction);
  runTest('REGISTRY: capRegistryClient_construction', test6469_Machine_capRegistryClient_construction);
  runTest('REGISTRY: capRegistryEntry_defaults', test6470_Machine_capRegistryEntry_defaults);

  // cap-fab-renderer pure helpers (no DOM dependency)
  console.log('\n--- cap-fab-renderer helpers ---');
  runTest('RENDERER: cardinalityLabel_allFourCases',          test6471_Renderer_cardinalityLabel_allFourCases);
  runTest('RENDERER: cardinalityLabel_usesUnicodeArrow',      test6472_Renderer_cardinalityLabel_usesUnicodeArrow);
  runTest('RENDERER: cardinalityFromCap_findsStdinArg',       test6473_Renderer_cardinalityFromCap_findsStdinArgNotFirstArg);
  runTest('RENDERER: cardinalityFromCap_scalarDefaults',      test6474_Renderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing);
  runTest('RENDERER: cardinalityFromCap_outputOnlySequence',  test6475_Renderer_cardinalityFromCap_outputOnlySequence);
  runTest('RENDERER: cardinalityFromCap_rejectsStringBool',   test6476_Renderer_cardinalityFromCap_rejectsStringIsSequence);
  runTest('RENDERER: cardinalityFromCap_throwsOnNonObject',   test6478_Renderer_cardinalityFromCap_throwsOnNonObject);
  runTest('RENDERER: canonicalMediaUrn_normalizesTagOrder',   test6479_Renderer_canonicalMediaUrn_normalizesTagOrder);
  runTest('RENDERER: canonicalMediaUrn_preservesValueTags',   test6480_Renderer_canonicalMediaUrn_preservesValueTags);
  runTest('RENDERER: canonicalMediaUrn_rejectsCapUrn',        test6481_Renderer_canonicalMediaUrn_rejectsCapUrn);
  runTest('RENDERER: mediaNodeLabel_rejectsUrnDerived',       test6482_Renderer_mediaNodeLabel_rejectsUrnDerivedLabels);
  runTest('RENDERER: buildBrowse_rejectsMissingMediaTitles',  test6483_Renderer_buildBrowseGraphData_rejectsMissingMediaTitles);

  console.log('\n--- cap-fab-renderer strand builder ---');
  runTest('RENDERER: validateStrandStep_unknownVariant',      test6484_Renderer_validateStrandStep_rejectsUnknownVariant);
  runTest('RENDERER: validateStrandStep_booleanIsSequence',   test6486_Renderer_validateStrandStep_requiresBooleanIsSequence);
  runTest('RENDERER: classifyStrandCapSteps_simple',          test6487_Renderer_classifyStrandCapSteps_capFlags);
  runTest('RENDERER: classifyStrandCapSteps_nested',          test6488_Renderer_classifyStrandCapSteps_nestedForks);
  runTest('RENDERER: buildStrand_singleCapPlain',             test6489_Renderer_buildStrandGraphData_singleCapPlain);
  runTest('RENDERER: buildStrand_sequenceShowsCardinality',   test6491_Renderer_buildStrandGraphData_sequenceShowsCardinality);
  runTest('RENDERER: buildStrand_foreachCollectSpan',         test6492_Renderer_buildStrandGraphData_foreachCollectSpan);
  runTest('RENDERER: buildStrand_standaloneCollect',          test6493_Renderer_buildStrandGraphData_standaloneCollect);
  runTest('RENDERER: buildStrand_unclosedForEachBody',        test6494_Renderer_buildStrandGraphData_unclosedForEachBody);
  runTest('RENDERER: buildStrand_nestedForEachThrows',        test6495_Renderer_buildStrandGraphData_nestedForEachThrows);
  runTest('RENDERER: collapseStrand_singleCapBody',           test6496_Renderer_collapseStrand_singleCapBodyKeepsCapOwnLabel);
  runTest('RENDERER: collapseStrand_unclosedForEachBody',     test6497_Renderer_collapseStrand_unclosedForEachBodyCollapses);
  runTest('RENDERER: collapseStrand_standaloneCollect',       test6498_Renderer_collapseStrand_standaloneCollectCollapses);
  runTest('RENDERER: collapseStrand_seqCapBeforeForeach',     test6499_Renderer_collapseStrand_sequenceProducingCapBeforeForeach);
  runTest('RENDERER: collapseStrand_plainCapMergesOutput',    test6500_Renderer_collapseStrand_plainCapMergesTrailingOutput);
  runTest('RENDERER: collapseStrand_plainCapDistinctTarget',  test6501_Renderer_collapseStrand_plainCapDistinctTargetNoMerge);
  runTest('RENDERER: validateStrand_missingSourceMediaUrn',   test6502_Renderer_validateStrandPayload_missingSourceMediaUrn);
  runTest('RENDERER: validateStrand_requiresCapInputs',       test7120_Renderer_validateStrandPayload_requiresAuthoritativeInputs);

  console.log('\n--- cap-fab-renderer run builder ---');
  runTest('RENDERER: validateBodyOutcome_negativeIndex',      test6503_Renderer_validateBodyOutcome_rejectsNegativeIndex);
  runTest('RENDERER: validateBodyOutcome_failureCoordinate',  test7121_Renderer_validateBodyOutcome_requiresExplicitFailureCoordinate);
  runTest('RENDERER: buildRun_pagesSuccessesAndFailures',     test6504_Renderer_buildRunGraphData_pagesSuccessesAndFailures);
  runTest('RENDERER: buildRun_unattributedFailureAtEntry',    test6505_Renderer_buildRunGraphData_unattributedFailureStopsAtEntry);
  runTest('RENDERER: buildRun_resolvesFailedStepToken',       test6506_Renderer_buildRunGraphData_resolvesExactFailedStepToken);
  runTest('RENDERER: buildRun_backboneHasNoForeachNode',      test6507_Renderer_buildRunGraphData_backboneHasNoForeachNode);
  runTest('RENDERER: buildRun_allFailedDropsPlaceholder',     test6508_Renderer_buildRunGraphData_allFailedDropsTargetPlaceholder);
  runTest('RENDERER: buildRun_unclosedForeachNoMerge',        test6509_Renderer_buildRunGraphData_unclosedForeachSuccessNoMerge);
  runTest('RENDERER: buildRun_closedForeachMerges',           test6510_Renderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget);

  console.log('\n--- cap-fab-renderer editor-graph builder ---');
  runTest('RENDERER: validateEditorGraph_unknownKind',          test6511_Renderer_validateEditorGraphPayload_rejectsUnknownKind);
  runTest('RENDERER: buildEditorGraph_collapsesCapsIntoEdges',  test6512_Renderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges);
  runTest('RENDERER: buildEditorGraph_loopEdgeGetsClass',       test6513_Renderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass);
  runTest('RENDERER: buildEditorGraph_cardinalityFromIsSeq',    test6514_Renderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags);
  runTest('RENDERER: buildEditorGraph_incompleteCapDropped',    test6515_Renderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped);
  runTest('RENDERER: buildEditorGraph_rejectsEdgeMissingSrc',   test6516_Renderer_buildEditorGraphData_rejectsEdgeWithMissingSource);

  console.log('\n--- cap-fab-renderer resolved-machine builder ---');
  runTest('RENDERER: buildResolvedMachine_singleStrandLinear',     test6517_Renderer_buildResolvedMachineGraphData_singleStrandLinearChain);
  runTest('RENDERER: buildResolvedMachine_loopGetsLoopClass',      test6518_Renderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass);
  runTest('RENDERER: buildResolvedMachine_fanInOneEdgePerSrc',     test6519_Renderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment);
  runTest('RENDERER: buildResolvedMachine_multiStrandDisjoint',    test6520_Renderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint);
  runTest('RENDERER: buildResolvedMachine_dupNodeIdFails',         test6521_Renderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard);
  runTest('RENDERER: validateResolvedMachine_rejectsMissingFields', test6522_Renderer_validateResolvedMachinePayload_rejectsMissingFields);

  console.log('\n--- CapKind classifier (test1800–test1805) ---');
  runTest('TEST1800: kind_identity_requires_effect_none',   test1800_kindIdentityOnlyForBareCap);
  runTest('TEST1801: kind_source_when_input_is_void',       test1801_kindSourceWhenInputIsVoid);
  runTest('TEST1802: kind_sink_when_output_is_void',        test1802_kindSinkWhenOutputIsVoid);
  runTest('TEST1803: kind_effect_when_both_sides_void',     test1803_kindEffectWhenBothSidesVoid);
  runTest('TEST1804: kind_transform_for_normal_processors', test1804_kindTransformForNormalDataProcessors);
  runTest('TEST1805: kind_invariant_under_canonical',       test1805_kindInvariantUnderCanonicalSpellings);

  console.log('\n--- media:void atomicity (test1810) ---');
  runTest('TEST1810: media_void_is_atomic',                 test1810_mediaVoidIsAtomic);

  console.log('\n--- Truth-table specificity (test1820–test1824) ---');
  runTest('TEST1820: specificity_question_is_zero',         test1820_specificityQuestionIsZero);
  runTest('TEST1821: specificity_must_not_have_is_five',    test1821_specificityMustNotHaveIsFive);
  runTest('TEST1822: specificity_must_have_any_is_two',     test1822_specificityMustHaveAnyIsTwo);
  runTest('TEST1823: specificity_exact_value_is_four',      test1823_specificityExactValueIsFour);
  runTest('TEST1824: specificity_combined_y_axis',          test1824_specificityCombinedYAxis);

  console.log('\n--- Six-form canonicalization (test1830–test1835) ---');
  runTest('TEST1830: canonicalize_no_constraint',           test1830_canonicalizeNoConstraint);
  runTest('TEST1831: canonicalize_absent_or_not_value',     test1831_canonicalizeAbsentOrNotValue);
  runTest('TEST1832: canonicalize_must_have_any',           test1832_canonicalizeMustHaveAny);
  runTest('TEST1833: canonicalize_present_not_value',       test1833_canonicalizePresentNotValue);
  runTest('TEST1834: canonicalize_exact_value',             test1834_canonicalizeExactValue);
  runTest('TEST1835: canonicalize_must_not_have',           test1835_canonicalizeMustNotHave);

  console.log('\n--- Truth-table cross-product + axis weighting (test1842–test1846) ---');
  runTest('TEST1842: truth_table_full_cross_product',       test1842_truthTableFullCrossProduct);
  runTest('TEST1843: reject_invalid_combinations',          test6734_rejectInvalidCombinations);
  runTest('TEST1844: axis_weighting_out_dominates',         test6735_axisWeightingOutDominates);
  runTest('TEST1845: axis_weighting_in_dominates_y',        test1845_axisWeightingInDominatesY);
  runTest('TEST1846: axis_weighting_decoded_layout',        test6736_axisWeightingDecodedLayout);

  // Cap.version round-trip tests
  runTest('TEST1847: cap_version_zero_omitted_on_wire',     test6737_capVersionZeroOmittedOnWire);
  runTest('TEST1848: cap_version_nonzero_on_wire',          test1848_capVersionNonZeroOnWire);

  console.log('\n--- CapArg stream URN + main input (test7100–test7104) ---');
  runTest('TEST7100: stream_urn_prefers_stdin_source_urn',   test7100_streamUrnReturnsStdinSourceUrnWhenItDiffersFromSlotUrn);
  runTest('TEST7101: stream_urn_falls_back_to_media_urn',    test7101_streamUrnFallsBackToDeclaredMediaUrnWithoutStdinSource);
  runTest('TEST7102: is_main_input_by_urn_equivalence',      test7102_isMainInputTrueOnTagOrderInsensitiveEquivalenceToInSpec);
  runTest('TEST7103: is_main_input_false_without_stdin',     test7103_isMainInputFalseWithoutEquivalentStdinSource);
  runTest('TEST7104: multi_arg_main_input_partition',        test7104_multiArgCapExactlyOneMainInputAndPartitionOfRest);

  runTest('TEST1880: alias_name_normalization_rules',       test1880_aliasNameNormalizationRules);
  runTest('TEST1881: token_urn_vs_alias_detection',         test1881_tokenUrnVsAliasDetection);
  runTest('TEST1882: classify_alias_target_by_prefix',      test1882_classifyAliasTargetByPrefix);
  runTest('TEST1887: manifest_serde_round_trips_aliases',   test1887_manifestSerdeRoundTripsAliases);

  console.log('\n--- URN→alias display + aliased serialization (test1894–test1896, test1196) ---');
  runTest('TEST1894: select_display_alias_ordering',         test1894_selectDisplayAliasOrdering);
  runTest('TEST1895: display_alias_for_urn',                 test1895_displayAliasForUrn);
  runTest('TEST1896: cached_cap_aliases_filters_to_cap',     test1896_cachedCapAliasesFiltersToCapTargets);
  runTest('TEST1196: aliased_serialization_uses_alias',      test1196_aliasedSerializationUsesAliasAndDropsHeader);

  // planner.js: unified plan-space vocabulary
  console.log('--- planner.js ---');
  runTest('TEST1514: install_source_vocabulary_tolerance', test1514_installSourceVocabularyTolerance);
  runTest('TEST1450: plan_request_defaults', test1450_planRequestDefaults);
  runTest('TEST1451: plan_request_knob_validation', test1451_planRequestKnobValidation);
  runTest('TEST1452: knob_proto_round_trip', test1452_knobProtoRoundTrip);
  runTest('TEST1453: plan_response_parsers', test1453_planResponseParsers);

  // Summary
  console.log(`\n${passCount + failCount} tests: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) {
    console.log('ERR Some tests failed!');
    process.exit(1);
  } else {
    console.log('OK All tests passed!');
  }
}


// ============================================================================
// Registry verdicts — the vocabulary a consumer concludes about a REGISTRY
// ============================================================================

/** TEST8150: the wire vocabulary is closed and matches the Rust mirror. */
function test8150_registryVerdictStatesAreTheClosedWireVocabulary() {
  const expected = [
    'verified', 'pending', 'offline', 'unreachable',
    'http_error', 'malformed', 'unsigned', 'untrusted', 'unverifiable', 'unenforced',
  ];
  assertEqual(REGISTRY_VERDICT_STATES.length, expected.length, 'state count matches the Rust mirror');
  for (const state of expected) {
    assert(REGISTRY_VERDICT_STATES.includes(state), `wire vocabulary carries '${state}'`);
  }
  const reasons = [
    'malformed_envelope', 'unsupported_envelope_format', 'malformed_certificate',
    'unsupported_certificate_format', 'empty_certificate_list', 'insufficient_root_signatures',
    'expired_certificate', 'not_yet_valid_certificate', 'environment_mismatch',
    'key_id_mismatch', 'no_authorizing_certificate', 'manifest_signature_invalid',
  ];
  assertEqual(CHAIN_FAILURE_REASONS.length, reasons.length, 'reason count matches the Rust mirror');
  for (const reason of reasons) {
    assert(CHAIN_FAILURE_REASONS.includes(reason), `wire vocabulary carries '${reason}'`);
  }
  assertRefuses(() => registryVerdictPermitsAttachment('network_error'), /unknown registry verdict state/);
}

/** TEST8151: a format this build cannot read is OUR limitation — never the
 *  registry being untrustworthy, and never a network problem. */
function test8151_unreadableFormatIsUnverifiableAndRejectedKeyIsUntrusted() {
  for (const unevaluable of [
    ChainFailureReason.MALFORMED_ENVELOPE,
    ChainFailureReason.UNSUPPORTED_ENVELOPE_FORMAT,
    ChainFailureReason.MALFORMED_CERTIFICATE,
    ChainFailureReason.UNSUPPORTED_CERTIFICATE_FORMAT,
    ChainFailureReason.EMPTY_CERTIFICATE_LIST,
  ]) {
    assertEqual(
      registryVerdictStateForChainFailure(unevaluable),
      RegistryVerdictState.UNVERIFIABLE,
      `${unevaluable} could not be judged at all`,
    );
  }
  for (const judged of [
    ChainFailureReason.INSUFFICIENT_ROOT_SIGNATURES,
    ChainFailureReason.EXPIRED_CERTIFICATE,
    ChainFailureReason.NOT_YET_VALID_CERTIFICATE,
    ChainFailureReason.ENVIRONMENT_MISMATCH,
    ChainFailureReason.KEY_ID_MISMATCH,
    ChainFailureReason.NO_AUTHORIZING_CERTIFICATE,
    ChainFailureReason.MANIFEST_SIGNATURE_INVALID,
  ]) {
    assertEqual(
      registryVerdictStateForChainFailure(judged),
      RegistryVerdictState.UNTRUSTED,
      `${judged} is a judgement that WAS reached`,
    );
  }
  assertRefuses(() => registryVerdictStateForChainFailure('bad_signature'), /unknown chain failure reason/);
}

/** TEST8152: only a verified registry lets a cartridge attach — `pending`
 *  included, which must never read as permission. */
function test8152_onlyVerifiedPermitsAttachment() {
  for (const state of REGISTRY_VERDICT_STATES) {
    assertEqual(
      registryVerdictPermitsAttachment(state),
      state === RegistryVerdictState.VERIFIED || state === RegistryVerdictState.UNENFORCED,
      `permits_attachment('${state}')`,
    );
  }
  // A DEV BUILD HAS TO WORK, and it says which of the two it is: "we checked
  // and it passed" and "we did not check" are different facts.
  assert(registryVerdictPermitsAttachment(RegistryVerdictState.UNENFORCED));
  assert(!registryVerdictIsTrustFailure(RegistryVerdictState.UNENFORCED));
  assert(!registryVerdictIsTransient(RegistryVerdictState.UNENFORCED));
  assertEqual(registryVerdictRemedy(RegistryVerdictState.UNENFORCED), RegistryRemedy.NONE);
}

/** TEST8153: a refusal never resolves itself, so nothing may present it as
 *  worth retrying. */
function test8153_trustFailuresAreNeverTransient() {
  for (const state of REGISTRY_VERDICT_STATES) {
    assert(
      !(registryVerdictIsTrustFailure(state) && registryVerdictIsTransient(state)),
      `'${state}' cannot be both a refusal and something a retry could fix`,
    );
  }
  assert(registryVerdictIsTrustFailure(RegistryVerdictState.UNVERIFIABLE));
  assert(registryVerdictIsTrustFailure(RegistryVerdictState.UNTRUSTED));
  assert(registryVerdictIsTrustFailure(RegistryVerdictState.UNSIGNED));
  assert(registryVerdictIsTransient(RegistryVerdictState.UNREACHABLE));
  assert(registryVerdictIsTransient(RegistryVerdictState.PENDING));
  // Policy is not transient: it holds until an operator changes it.
  assert(!registryVerdictIsTransient(RegistryVerdictState.OFFLINE));
  assert(!registryVerdictIsTrustFailure(RegistryVerdictState.OFFLINE));
}

/** TEST8162: WHEN IS A VERDICT NEWS? Both desktop clients re-verify their
 *  registries after every discovery round and re-run discovery when the
 *  verdicts "changed". Change had to mean "the registry said something
 *  different", and comparing whole verdicts cannot mean that: they carry the
 *  moment of the check, so the same answer taken a second later is a different
 *  value. That is the loop that left an engine discovering cartridges forever. */
function test8162_aVerdictSaysTheSameThingAtADifferentTime() {
  const earlier = RegistryVerdict.verified('https://r.example', 1756000000);
  const later = RegistryVerdict.verified('https://r.example', 1756000931);
  assert(
    JSON.stringify(earlier.toJSON()) !== JSON.stringify(later.toJSON()),
    'they are not the same value — one is a later check',
  );
  assert(earlier.statesTheSameAs(later), 'but they say the same thing about the registry');

  for (const differing of [
    RegistryVerdict.stated('https://r.example', RegistryVerdictState.UNREACHABLE, 'connection timed out', 1756000000),
    RegistryVerdict.httpError('https://r.example', 503, 'the registry answered HTTP 503', 1756000000),
    RegistryVerdict.chainFailed('https://r.example', ChainFailureReason.MANIFEST_SIGNATURE_INVALID, 'signature does not verify', 1756000000),
    RegistryVerdict.verified('https://other.example/manifest', 1756000000),
  ]) {
    assert(!earlier.statesTheSameAs(differing), `${differing.state} is a different statement about the registry`);
  }

  // 404 and 503 are different situations with different remedies.
  assert(
    !RegistryVerdict.httpError('https://r.example', 404, 'the registry answered HTTP 404', 1756000000)
      .statesTheSameAs(RegistryVerdict.httpError('https://r.example', 503, 'the registry answered HTTP 503', 1756000000)),
    '404 and 503 are different situations with different remedies',
  );

  assertRefuses(() => earlier.statesTheSameAs({ state: 'verified' }),
    /compares two registry verdicts/, 'a bare object is not a verdict');
}

/** TEST8159: the remedy follows from the state, and "check the network" is
 *  reachable from exactly one state. That sentence used to be appended to every
 *  held-cartridge message whatever the cause, which is how a signature format a
 *  build could not read sent operators to their router. */
function test8159_theRemedyFollowsFromTheState() {
  const network = REGISTRY_VERDICT_STATES.filter(
    (state) => registryVerdictRemedy(state) === RegistryRemedy.CHECK_NETWORK,
  );
  assertEqual(network.length, 1, 'exactly one state is a network problem');
  assertEqual(network[0], RegistryVerdictState.UNREACHABLE);
  for (const state of REGISTRY_VERDICT_STATES) {
    if (!registryVerdictIsTrustFailure(state)) continue;
    const remedy = registryVerdictRemedy(state);
    assert(
      remedy === RegistryRemedy.DO_NOT_PROCEED || remedy === RegistryRemedy.UPDATE_CLIENT,
      `'${state}' is a refusal; its remedy must not be a retry (got '${remedy}')`,
    );
  }
  // The one that was misclassified: our limitation, so update the client —
  // never distrust the registry, never touch the network.
  assertEqual(registryVerdictRemedy(RegistryVerdictState.UNVERIFIABLE), RegistryRemedy.UPDATE_CLIENT);
  assertEqual(registryVerdictRemedy(RegistryVerdictState.UNTRUSTED), RegistryRemedy.DO_NOT_PROCEED);
  assertEqual(registryVerdictRemedy(RegistryVerdictState.VERIFIED), RegistryRemedy.NONE);
  assertEqual(registryVerdictRemedy(RegistryVerdictState.PENDING), RegistryRemedy.WAIT);
  // Policy is the operator's setting, not their router.
  assertEqual(registryVerdictRemedy(RegistryVerdictState.OFFLINE), RegistryRemedy.CHANGE_NETWORK_POLICY);
  assertRefuses(() => registryVerdictRemedy('flaky'), /unknown registry verdict state/);
}

/** TEST8154: illegal states are unrepresentable — every contradiction is
 *  refused at construction. */
function test8154_contradictoryVerdictsAreRefused() {
  const URL = 'https://cartridges.example/v1/manifest';
  const now = 1700000000;
  assertRefuses(
    () => RegistryVerdict.stated(URL, RegistryVerdictState.UNREACHABLE, '', now),
    /must carry the detail/,
  );
  assertRefuses(
    () => RegistryVerdict.stated(URL, RegistryVerdictState.VERIFIED, 'all good', now),
    /states no failure/,
  );
  assertRefuses(
    () => RegistryVerdict.stated(URL, RegistryVerdictState.HTTP_ERROR, '500', now),
    /must carry the status/,
  );
  assertRefuses(
    () => RegistryVerdict.stated(URL, RegistryVerdictState.UNTRUSTED, 'nope', now),
    /must carry the chain failure reason/,
  );
  assertRefuses(
    () => RegistryVerdict.stated('', RegistryVerdictState.UNREACHABLE, 'timeout', now),
    /must name the registry/,
  );
  // A reason that contradicts the state it is filed under.
  assertRefuses(
    () => new RegistryVerdict(URL, RegistryVerdictState.UNTRUSTED, 'x', null,
      ChainFailureReason.UNSUPPORTED_ENVELOPE_FORMAT, now),
    /chain failure reason/,
  );
  // A status on a state that never answered.
  assertRefuses(
    () => new RegistryVerdict(URL, RegistryVerdictState.UNREACHABLE, 'timeout', 404, null, now),
    /only an 'http_error' verdict carries an HTTP status/,
  );
}

/** TEST8155: the wire form round-trips with its invariants intact. */
function test8155_registryVerdictWireRoundTrip() {
  const URL = 'https://cartridges.example/v1/manifest';
  const now = 1700000000;
  const verdict = RegistryVerdict.chainFailed(
    URL,
    ChainFailureReason.UNSUPPORTED_ENVELOPE_FORMAT,
    "envelope format 'other/1' is not implemented by this build",
    now,
  );
  assertEqual(verdict.state, RegistryVerdictState.UNVERIFIABLE);
  const decoded = RegistryVerdict.fromJSON(JSON.parse(JSON.stringify(verdict.toJSON())));
  assertEqual(decoded.state, verdict.state);
  assertEqual(decoded.chain_failure, verdict.chain_failure);
  assertEqual(decoded.detail, verdict.detail);
  assertEqual(decoded.registry_url, verdict.registry_url);
  assertEqual(decoded.permitsAttachment(), false);

  const http = RegistryVerdict.httpError(URL, 404, 'registry answered HTTP 404', now);
  assertEqual(http.http_status, 404);
  assertEqual(RegistryVerdict.fromJSON(http.toJSON()).http_status, 404);

  assertRefuses(
    () => RegistryVerdict.fromJSON({
      registry_url: URL, state: 'http_error', detail: 'answered badly',
      http_status: null, chain_failure: null, checked_at_unix_seconds: now,
    }),
    /must carry the status/,
  );
  assertRefuses(
    () => RegistryVerdict.fromJSON({
      registry_url: URL, state: 'flaky', detail: 'hm',
      http_status: null, chain_failure: null, checked_at_unix_seconds: now,
    }),
    /unknown registry verdict state/,
  );
}

/** TEST8157: the format discriminators are the library's, so no consumer can
 *  hold a divergent copy. A product rename that edits a client's private
 *  constant makes that client verify nothing while every other implementation
 *  keeps working — which is precisely what happened. */
function test8157_signatureFormatDiscriminatorsComeFromTheLibrary() {
  assertEqual(MANIFEST_SIG_FORMAT, 'machinefabric-manifest-sig/1');
  assertEqual(RELEASE_KEY_CERT_FORMAT, 'machinefabric-release-key-cert/1');
}

/** TEST8158: the attachment vocabulary names the situations apart. */
function test8158_attachmentKindsSeparateTheirSituations() {
  assertEqual(CartridgeAttachmentErrorKind.MISPLACED, 'misplaced');
  assertEqual(CartridgeAttachmentErrorKind.NOT_LISTED, 'not_listed');
  assertEqual(CartridgeAttachmentErrorKind.REGISTRY_UNVERIFIED, 'registry_unverified');
  assert(
    CartridgeAttachmentErrorKind.BAD_INSTALLATION === undefined,
    'bad_installation meant two things with different remedies and is gone',
  );
  assert(
    CartridgeAttachmentErrorKind.REGISTRY_UNREACHABLE === undefined,
    'registry_unreachable claimed a cause it could not know and is gone',
  );
}


/**
 * TEST12166: matching, specificity and dispatch are the proved model's.
 *
 * `capdag/formal` proves the rules have no holes — refinement is transitive,
 * equivalence is "the same tag set", dispatch composes. Those are proofs about
 * the MODEL. What ties them to this implementation is `conformance.json`,
 * generated from the model (`lake exe conformance`), every row of which is
 * parsed with this mirror's own parser and must get the model's answer. The
 * same table runs in every mirror, so a mirror that drifts fails naming the row.
 */
function test12166_theImplementationIsTheProvedModel() {
  const table = JSON.parse(fs.readFileSync(
    path.join(here, '..', 'formal', 'conformance.json'), 'utf8'));
  const wrong = [];
  // Each distinct URN is parsed once: the table names a few hundred of them
  // across twenty thousand rows, and every parse makes its model values in
  // WebAssembly. Each ROW is still decided on its own.
  const parsed = (parse) => {
    const seen = new Map();
    return (text) => {
      if (!seen.has(text)) seen.set(text, parse(text));
      return seen.get(text);
    };
  };
  const media = parsed((text) => MediaUrn.fromString(text));
  const cap = parsed((text) => CapUrn.fromString(text));
  for (const row of table.refines) {
    const got = media(row.instance).conformsTo(media(row.pattern));
    if (got !== row.refines) wrong.push(`${row.instance} ⪯ ${row.pattern}: model ${row.refines}, got ${got}`);
  }
  for (const row of table.scores) {
    const got = media(row.urn).specificity();
    if (got !== row.score) wrong.push(`score ${row.urn}: model ${row.score}, got ${got}`);
  }
  for (const row of table.dispatch) {
    const candidate = cap(row.candidate);
    const request = cap(row.request);
    const got = candidate.isDispatchable(request);
    if (got !== row.dispatch) wrong.push(`${row.candidate} serves ${row.request}: model ${row.dispatch}, got ${got}`);
    const accepted = candidate.accepts(request);
    if (accepted !== row.accepts) wrong.push(`${row.candidate} accepts ${row.request}: model ${row.accepts}, got ${accepted}`);
  }
  assert(table.refines.length > 4000 && table.dispatch.length > 20000, 'the table is the full one');
  assert(wrong.length === 0, `${wrong.length} row(s) differ from the model, e.g.\n  ${wrong.slice(0, 8).join('\n  ')}`);
}

// Run the tests
runTests()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\nERR Test failed:', error.message);
    process.exit(1);
  });
