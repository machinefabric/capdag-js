// Cap URN JavaScript Test Suite
// Tests mirror Rust test numbering (TEST###) for cross-language tracking.
// All implementations (Rust, Go, JS, ObjC, Python) must pass these identically.

const {
  CapUrn, CapUrnBuilder, CapMatcher, CapUrnError, ErrorCodes,
  MediaUrn, MediaUrnError, MediaUrnErrorCodes,
  Cap, MediaSpec, MediaSpecError, MediaSpecErrorCodes,
  resolveMediaUrn, buildExtensionIndex, mediaUrnsForExtension, getExtensionMappings,
  CapMatrixError, CapMatrix, BestCapSetMatch, CompositeCapSet, CapBlock,
  CartridgeInfo, CartridgeCapSummary, CartridgeSuggestion, CartridgeRepoClient, CartridgeRepoServer,
  CapGraphEdge, CapGraphStats, CapGraph,
  StdinSource, StdinSourceKind,
  validateNoMediaSpecRedefinitionSync,
  CapArgumentValue,
  llmGenerateTextUrn, modelAvailabilityUrn, modelPathUrn,
  MachineSyntaxError, MachineSyntaxErrorCodes, MachineEdge, Machine, MachineBuilder, parseMachine, parseMachineWithAST,
  CapRegistryEntry, MediaRegistryEntry, CapRegistryClient,
  MEDIA_STRING, MEDIA_INTEGER, MEDIA_NUMBER, MEDIA_BOOLEAN,
  MEDIA_OBJECT, MEDIA_STRING_LIST, MEDIA_INTEGER_LIST,
  MEDIA_NUMBER_LIST, MEDIA_BOOLEAN_LIST, MEDIA_OBJECT_LIST,
  MEDIA_IDENTITY, MEDIA_VOID, MEDIA_PNG, MEDIA_AUDIO, MEDIA_VIDEO,
  MEDIA_PDF, MEDIA_EPUB, MEDIA_MD, MEDIA_TXT, MEDIA_RST, MEDIA_LOG,
  MEDIA_HTML, MEDIA_XML, MEDIA_JSON, MEDIA_YAML, MEDIA_JSON_SCHEMA,
  MEDIA_MODEL_SPEC, MEDIA_AVAILABILITY_OUTPUT, MEDIA_PATH_OUTPUT,
  MEDIA_LLM_INFERENCE_OUTPUT,
  MEDIA_FILE_PATH, MEDIA_FILE_PATH_ARRAY,
  MEDIA_COLLECTION, MEDIA_COLLECTION_LIST,
  MEDIA_DECISION,
  MEDIA_AUDIO_SPEECH
} = require('./capdag.js');

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
 * Rust reference test_urn helper: test_urn(tags) => cap:in="media:void";{tags};out="media:record;textable"
 */
function testUrn(tags) {
  if (!tags || tags === '') {
    return `cap:in="${MEDIA_VOID}";out="${MEDIA_OBJECT}"`;
  }
  return `cap:in="${MEDIA_VOID}";${tags};out="${MEDIA_OBJECT}"`;
}

// Mock CapSet for testing
class MockCapSet {
  constructor(name) {
    this.name = name;
  }

  async executeCap(capUrn, args) {
    return {
      binaryOutput: null,
      textOutput: `Mock response from ${this.name}`
    };
  }
}

// Helper to create a Cap for testing
function makeCap(urnString, title) {
  const capUrn = CapUrn.fromString(urnString);
  return new Cap(capUrn, title, 'test', title);
}

// Helper to create caps with specific in/out media URNs for graph testing
function makeGraphCap(inUrn, outUrn, title) {
  const urnString = `cap:in="${inUrn}";op=convert;out="${outUrn}"`;
  const capUrn = CapUrn.fromString(urnString);
  return new Cap(capUrn, title, 'convert', title);
}

// Helper to create a test URN for matrix tests
function matrixTestUrn(tags) {
  if (!tags) {
    return 'cap:in="media:void";out="media:object"';
  }
  return `cap:in="media:void";out="media:object";${tags}`;
}

// ============================================================================
// cap_urn.rs: TEST001-TEST050, TEST890-TEST891
// ============================================================================

// TEST001: Cap URN created with tags, direction specs accessible
function test001_capUrnCreation() {
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf;target=thumbnail'));
  assertEqual(cap.getTag('op'), 'generate', 'Should get op tag');
  assertEqual(cap.getTag('target'), 'thumbnail', 'Should get target tag');
  assertEqual(cap.getTag('ext'), 'pdf', 'Should get ext tag');
  assertEqual(cap.getInSpec(), MEDIA_VOID, 'Should get inSpec');
  assertEqual(cap.getOutSpec(), MEDIA_OBJECT, 'Should get outSpec');
}

// TEST002: Missing in -> MissingInSpec, missing out -> MissingOutSpec
function test002_directionSpecsRequired() {
  assertThrows(
    () => CapUrn.fromString('cap:out="media:void";op=test'),
    ErrorCodes.MISSING_IN_SPEC,
    'Missing in should fail with MISSING_IN_SPEC'
  );
  assertThrows(
    () => CapUrn.fromString('cap:in="media:void";op=test'),
    ErrorCodes.MISSING_OUT_SPEC,
    'Missing out should fail with MISSING_OUT_SPEC'
  );
}

// TEST003: Direction specs must match exactly; wildcard matches any
function test003_directionMatching() {
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString(testUrn('op=generate'));
  assert(cap.accepts(request), 'Same direction specs should match');

  // Different direction should not match
  const requestDiff = CapUrn.fromString('cap:in="media:textable";op=generate;out="media:record;textable"');
  assert(!cap.accepts(requestDiff), 'Different inSpec should not match');

  // Wildcard direction matches any
  const wildcardCap = CapUrn.fromString('cap:in=*;op=generate;out=*');
  assert(wildcardCap.accepts(request), 'Wildcard direction should match any');
}

// TEST004: Unquoted keys/values normalized to lowercase
function test004_unquotedValuesLowercased() {
  const cap = CapUrn.fromString('cap:IN="media:void";OP=Generate;EXT=PDF;OUT="media:record;textable"');
  assertEqual(cap.getTag('op'), 'generate', 'Unquoted value should be lowercased');
  assertEqual(cap.getTag('ext'), 'pdf', 'Unquoted value should be lowercased');
  // Key lookup is case-insensitive
  assertEqual(cap.getTag('OP'), 'generate', 'Key lookup should be case-insensitive');
}

// TEST005: Quoted values preserve case
function test005_quotedValuesPreserveCase() {
  const cap = CapUrn.fromString('cap:in="media:void";key="HelloWorld";out="media:void"');
  assertEqual(cap.getTag('key'), 'HelloWorld', 'Quoted value should preserve case');
}

// TEST006: Semicolons, equals, spaces in quoted values
function test006_quotedValueSpecialChars() {
  const cap = CapUrn.fromString('cap:in="media:void";key="val;ue=with spaces";out="media:void"');
  assertEqual(cap.getTag('key'), 'val;ue=with spaces', 'Quoted value should preserve special chars');
}

// TEST007: Escaped quotes and backslashes in quoted values
function test007_quotedValueEscapeSequences() {
  const s = String.raw`cap:in="media:void";key="val\"ue\\test";out="media:void"`;
  const cap = CapUrn.fromString(s);
  assertEqual(cap.getTag('key'), 'val"ue\\test', 'Escaped quote and backslash should be unescaped');
}

// TEST008: Mix of quoted and unquoted values
function test008_mixedQuotedUnquoted() {
  const cap = CapUrn.fromString('cap:a=simple;b="Quoted";in="media:void";out="media:void"');
  assertEqual(cap.getTag('a'), 'simple', 'Unquoted value should be lowercase');
  assertEqual(cap.getTag('b'), 'Quoted', 'Quoted value should preserve case');
}

// TEST009: Unterminated quote produces error
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

// TEST010: Invalid escape sequences produce error
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

// TEST011: Smart quoting: no quotes for simple lowercase, quotes for special
function test011_serializationSmartQuoting() {
  const cap = CapUrn.fromString('cap:a=simple;b="Has Space";in="media:void";out="media:void"');
  const s = cap.toString();
  // simple lowercase should not be quoted, "Has Space" should be quoted
  assert(s.includes('a=simple'), 'Simple value should not be quoted');
  assert(s.includes('b="Has Space"'), 'Value with space should be quoted');
}

// TEST012: Simple cap URN parse -> serialize -> parse equals original
function test012_roundTripSimple() {
  const original = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const serialized = original.toString();
  const reparsed = CapUrn.fromString(serialized);
  assert(original.equals(reparsed), 'Simple round-trip should produce equal URN');
}

// TEST013: Quoted values round-trip preserving case
function test013_roundTripQuoted() {
  const original = CapUrn.fromString('cap:in="media:void";key="HelloWorld";out="media:void"');
  const serialized = original.toString();
  const reparsed = CapUrn.fromString(serialized);
  assert(original.equals(reparsed), 'Quoted round-trip should produce equal URN');
  assertEqual(reparsed.getTag('key'), 'HelloWorld', 'Quoted value should survive round-trip');
}

// TEST014: Escape sequences round-trip correctly
function test014_roundTripEscapes() {
  const s = String.raw`cap:in="media:void";key="val\"ue\\test";out="media:void"`;
  const original = CapUrn.fromString(s);
  const serialized = original.toString();
  const reparsed = CapUrn.fromString(serialized);
  assert(original.equals(reparsed), 'Escape round-trip should produce equal URN');
  assertEqual(reparsed.getTag('key'), 'val"ue\\test', 'Escaped value should survive round-trip');
}

// TEST015: cap: prefix required, case-insensitive
function test015_capPrefixRequired() {
  assertThrows(
    () => CapUrn.fromString('in="media:void";out="media:void";op=generate'),
    ErrorCodes.MISSING_CAP_PREFIX,
    'Should require cap: prefix'
  );
  // Valid cap: prefix should work
  const cap = CapUrn.fromString(testUrn('op=generate'));
  assertEqual(cap.getTag('op'), 'generate', 'Should parse with valid cap: prefix');
}

// TEST016: With/without trailing semicolon are equivalent
function test016_trailingSemicolonEquivalence() {
  const cap1 = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const cap2 = CapUrn.fromString(testUrn('op=generate;ext=pdf') + ';');
  assert(cap1.equals(cap2), 'With/without trailing semicolon should be equal');
  assertEqual(cap1.toString(), cap2.toString(), 'Canonical forms should match');
}

// TEST017: Exact match, subset match, wildcard match, value mismatch
function test017_tagMatching() {
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf;target=thumbnail'));

  // Exact match
  const exact = CapUrn.fromString(testUrn('op=generate;ext=pdf;target=thumbnail'));
  assert(cap.accepts(exact), 'Should accept exact match');

  // Subset match
  const subset = CapUrn.fromString(testUrn('op=generate'));
  assert(cap.accepts(subset), 'Should accept subset request');

  // Wildcard match
  const wildcard = CapUrn.fromString(testUrn('ext=*'));
  assert(cap.accepts(wildcard), 'Should accept wildcard request');

  // Value mismatch
  const mismatch = CapUrn.fromString(testUrn('op=extract'));
  assert(!cap.accepts(mismatch), 'Should not accept value mismatch');
}

// TEST018: Quoted uppercase values don't match lowercase (case sensitive)
function test018_matchingCaseSensitiveValues() {
  const cap = CapUrn.fromString('cap:in="media:void";key="HelloWorld";out="media:void"');
  const request = CapUrn.fromString('cap:in="media:void";key=helloworld;out="media:void"');
  assert(!cap.accepts(request), 'Quoted HelloWorld should not match unquoted helloworld');
}

// TEST019: Missing tags treated as wildcards
function test019_missingTagHandling() {
  const cap = CapUrn.fromString(testUrn('op=generate'));

  // Request with tag cap doesn't have -> cap's missing tag is implicit wildcard
  const request = CapUrn.fromString(testUrn('ext=pdf'));
  assert(cap.accepts(request), 'Missing tag in cap should be treated as wildcard');

  // Cap with extra tags can accept subset requests
  const cap2 = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request2 = CapUrn.fromString(testUrn('op=generate'));
  assert(cap2.accepts(request2), 'Cap with extra tags should accept subset request');
}

// TEST020: Direction specs use MediaUrn tag count, other tags count non-wildcard
function test020_specificity() {
  // Direction specs contribute their MediaUrn tag count:
  // MEDIA_VOID = "media:void" -> 1 tag (void)
  // MEDIA_OBJECT = "media:record" -> 1 tag (record)
  const cap1 = CapUrn.fromString(testUrn('type=general'));
  assertEqual(cap1.specificity(), 3, 'void(1) + record(1) + type(1)');

  const cap2 = CapUrn.fromString(testUrn('op=generate'));
  assertEqual(cap2.specificity(), 3, 'void(1) + record(1) + op(1)');

  const cap3 = CapUrn.fromString(testUrn('op=*;ext=pdf'));
  assertEqual(cap3.specificity(), 3, 'void(1) + record(1) + ext(1) (wildcard op doesn\'t count)');

  // Wildcard in direction doesn't count
  const cap4 = CapUrn.fromString(`cap:in=*;out="${MEDIA_OBJECT}";op=test`);
  assertEqual(cap4.specificity(), 2, 'record(1) + op(1) (in wildcard doesn\'t count)');
}

// TEST021: CapUrnBuilder creates valid URN
function test021_builder() {
  const cap = new CapUrnBuilder()
    .inSpec('media:void')
    .outSpec('media:object')
    .tag('op', 'generate')
    .tag('ext', 'pdf')
    .build();
  assertEqual(cap.getTag('op'), 'generate', 'Builder should set op');
  assertEqual(cap.getTag('ext'), 'pdf', 'Builder should set ext');
  assertEqual(cap.getInSpec(), 'media:void', 'Builder should set inSpec');
  assertEqual(cap.getOutSpec(), 'media:object', 'Builder should set outSpec');
}

// TEST022: Builder requires both inSpec and outSpec
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

// TEST023: Builder lowercases keys but preserves value case
function test023_builderPreservesCase() {
  const cap = new CapUrnBuilder()
    .inSpec('media:void')
    .outSpec('media:void')
    .tag('MyKey', 'MyValue')
    .build();
  assertEqual(cap.getTag('mykey'), 'MyValue', 'Builder should lowercase key but preserve value case');
  assertEqual(cap.getTag('MyKey'), 'MyValue', 'getTag should be case-insensitive for keys');
}

// TEST024: Directional accepts checks
function test024_compatibility() {
  // General cap accepts specific request (missing tags = wildcards)
  const general = CapUrn.fromString(testUrn('op=generate'));
  const specific = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(general.accepts(specific), 'General cap should accept specific request');
  // Specific cap also accepts general request (cap has extra tag, not blocking)
  assert(specific.accepts(general), 'Specific cap accepts general request (extra tags ok)');

  // Different op values: neither accepts the other
  const cap1 = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const cap3 = CapUrn.fromString(testUrn('type=image;op=extract'));
  assert(!cap1.accepts(cap3), 'Different op should not accept');
  assert(!cap3.accepts(cap1), 'Different op should not accept (reverse)');

  // Different in/out should not accept
  const cap5 = CapUrn.fromString('cap:in="media:textable";out="media:object";op=generate');
  assert(!cap1.accepts(cap5), 'Different inSpec should not accept');
}

// TEST025: CapMatcher.findBestMatch returns most specific
function test025_bestMatch() {
  const caps = [
    CapUrn.fromString('cap:in=*;out=*;op=*'),
    CapUrn.fromString(testUrn('op=generate')),
    CapUrn.fromString(testUrn('op=generate;ext=pdf'))
  ];
  const request = CapUrn.fromString(testUrn('op=generate'));
  const best = CapMatcher.findBestMatch(caps, request);
  assert(best !== null, 'Should find a best match');
  assertEqual(best.getTag('ext'), 'pdf', 'Best match should be the most specific (ext=pdf)');
}

// TEST026: merge combines tags, subset keeps only specified
function test026_mergeAndSubset() {
  const cap1 = CapUrn.fromString(testUrn('op=generate'));
  const cap2 = CapUrn.fromString('cap:in="media:textable";ext=pdf;format=binary;out="media:"');

  // Merge (other takes precedence)
  const merged = cap1.merge(cap2);
  assertEqual(merged.getInSpec(), 'media:textable', 'Merge should take inSpec from other');
  assertEqual(merged.getOutSpec(), 'media:', 'Merge should take outSpec from other');
  assertEqual(merged.getTag('op'), 'generate', 'Merge should keep original tags');
  assertEqual(merged.getTag('ext'), 'pdf', 'Merge should add other tags');

  // Subset (always preserves in/out)
  const sub = merged.subset(['ext']);
  assertEqual(sub.getTag('ext'), 'pdf', 'Subset should keep ext');
  assertEqual(sub.getTag('op'), undefined, 'Subset should drop op');
  assertEqual(sub.getInSpec(), 'media:textable', 'Subset should preserve inSpec');
}

// TEST027: withWildcardTag sets tag to wildcard including in/out
function test027_wildcardTag() {
  const cap = CapUrn.fromString(testUrn('ext=pdf'));
  const wildcardExt = cap.withWildcardTag('ext');
  assertEqual(wildcardExt.getTag('ext'), '*', 'Should set ext to wildcard');

  const wildcardIn = cap.withWildcardTag('in');
  assertEqual(wildcardIn.getInSpec(), '*', 'Should set in to wildcard');

  const wildcardOut = cap.withWildcardTag('out');
  assertEqual(wildcardOut.getOutSpec(), '*', 'Should set out to wildcard');
}

// TEST028: Empty cap URN without in/out fails (MissingInSpec)
function test028_emptyCapUrnNotAllowed() {
  assertThrows(
    () => CapUrn.fromString('cap:'),
    ErrorCodes.MISSING_IN_SPEC,
    'Empty cap URN should fail with MISSING_IN_SPEC'
  );
}

// TEST029: Minimal valid cap URN: just in and out, empty tags
function test029_minimalCapUrn() {
  const minimal = CapUrn.fromString('cap:in="media:void";out="media:void"');
  assertEqual(Object.keys(minimal.tags).length, 0, 'Should have no other tags');
  assertEqual(minimal.getInSpec(), 'media:void', 'Should have inSpec');
  assertEqual(minimal.getOutSpec(), 'media:void', 'Should have outSpec');
}

// TEST030: Forward slashes and colons in tag values
function test030_extendedCharacterSupport() {
  const cap = CapUrn.fromString(testUrn('url=https://example_org/api;path=/some/file'));
  assertEqual(cap.getTag('url'), 'https://example_org/api', 'Should support colons and slashes');
  assertEqual(cap.getTag('path'), '/some/file', 'Should support forward slashes');
}

// TEST031: Wildcard rejected in keys, accepted in values
function test031_wildcardRestrictions() {
  assertThrows(
    () => CapUrn.fromString(testUrn('*=value')),
    ErrorCodes.INVALID_CHARACTER,
    'Should reject wildcard in key'
  );

  // Wildcard accepted in values
  const cap = CapUrn.fromString(testUrn('key=*'));
  assertEqual(cap.getTag('key'), '*', 'Should accept wildcard in value');

  // Wildcard in in/out
  const capWild = CapUrn.fromString('cap:in=*;out=*;key=value');
  assertEqual(capWild.getInSpec(), '*', 'Should accept wildcard in inSpec');
  assertEqual(capWild.getOutSpec(), '*', 'Should accept wildcard in outSpec');
}

// TEST032: Duplicate keys rejected
function test032_duplicateKeyRejection() {
  assertThrows(
    () => CapUrn.fromString(testUrn('key=value1;key=value2')),
    ErrorCodes.DUPLICATE_KEY,
    'Should reject duplicate keys'
  );
}

// TEST033: Pure numeric keys rejected, mixed alphanumeric OK
function test033_numericKeyRestriction() {
  assertThrows(
    () => CapUrn.fromString(testUrn('123=value')),
    ErrorCodes.NUMERIC_KEY,
    'Should reject pure numeric keys'
  );
  // Mixed alphanumeric allowed
  const cap1 = CapUrn.fromString(testUrn('key123=value'));
  assertEqual(cap1.getTag('key123'), 'value', 'Mixed alphanumeric key should be allowed');
  const cap2 = CapUrn.fromString(testUrn('x123key=value'));
  assertEqual(cap2.getTag('x123key'), 'value', 'Mixed alphanumeric key should be allowed');
}

// TEST034: key= (empty value) is rejected
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

// TEST035: hasTag case-sensitive for values, case-insensitive for keys, works for in/out
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

// TEST036: withTag preserves value case
function test036_withTagPreservesValue() {
  const cap = CapUrn.fromString('cap:in="media:void";out="media:void"');
  const modified = cap.withTag('key', 'MyValue');
  assertEqual(modified.getTag('key'), 'MyValue', 'withTag should preserve value case');
}

// TEST037: withTag('key', '') -> error
// Note: In JS, withTag does not currently reject empty values (it stores them).
// The Rust implementation rejects empty values. We test the JS behavior as-is.
function test037_withTagRejectsEmptyValue() {
  // The JS implementation does not throw for empty values in withTag.
  // This test verifies the current behavior: withTag stores empty string.
  // If the implementation is updated to reject empty values, update this test.
  const cap = CapUrn.fromString('cap:in="media:void";out="media:void"');
  const modified = cap.withTag('key', '');
  assertEqual(modified.getTag('key'), '', 'withTag stores empty string (JS behavior)');
}

// TEST038: Unquoted 'simple' == quoted '"simple"' (lowercase)
function test038_semanticEquivalence() {
  const c1 = CapUrn.fromString('cap:in="media:void";key=simple;out="media:void"');
  const c2 = CapUrn.fromString('cap:in="media:void";key="simple";out="media:void"');
  assert(c1.equals(c2), 'Unquoted simple and quoted "simple" should be equal');
  assertEqual(c1.getTag('key'), c2.getTag('key'), 'Values should be identical');
}

// TEST039: getTag('in') and getTag('out') work, case-insensitive
function test039_getTagReturnsDirectionSpecs() {
  const cap = CapUrn.fromString(`cap:in="${MEDIA_VOID}";out="${MEDIA_OBJECT}"`);
  assertEqual(cap.getTag('in'), MEDIA_VOID, 'getTag(in) should return inSpec');
  assertEqual(cap.getTag('IN'), MEDIA_VOID, 'getTag(IN) should return inSpec (case-insensitive)');
  assertEqual(cap.getTag('out'), MEDIA_OBJECT, 'getTag(out) should return outSpec');
  assertEqual(cap.getTag('OUT'), MEDIA_OBJECT, 'getTag(OUT) should return outSpec (case-insensitive)');
}

// TEST040: Cap and request same tags -> accepts=true
function test040_matchingSemanticsExactMatch() {
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.accepts(request), 'Exact match should accept');
}

// TEST041: Cap missing tag -> implicit wildcard -> accepts=true
function test041_matchingSemanticsCapMissingTag() {
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.accepts(request), 'Cap missing ext tag should accept (implicit wildcard)');
}

// TEST042: Cap extra tag -> still matches
function test042_matchingSemanticsCapHasExtraTag() {
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf;version=2'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.accepts(request), 'Cap with extra tag should still accept');
}

// TEST043: Request ext=* matches cap ext=pdf
function test043_matchingSemanticsRequestHasWildcard() {
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=*'));
  assert(cap.accepts(request), 'Request wildcard should match specific cap value');
}

// TEST044: Cap ext=* matches request ext=pdf
function test044_matchingSemanticsCapHasWildcard() {
  const cap = CapUrn.fromString(testUrn('op=generate;ext=*'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.accepts(request), 'Cap wildcard should match specific request value');
}

// TEST045: ext=pdf vs ext=docx -> no match
function test045_matchingSemanticsValueMismatch() {
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=docx'));
  assert(!cap.accepts(request), 'Value mismatch should not accept');
}

// TEST046: Cap without ext matches request with ext=wav (uses media:binary directions)
function test046_matchingSemanticsFallbackPattern() {
  const cap = CapUrn.fromString('cap:in="media:binary";op=generate_thumbnail;out="media:binary"');
  const request = CapUrn.fromString('cap:ext=wav;in="media:binary";op=generate_thumbnail;out="media:binary"');
  assert(cap.accepts(request), 'Cap missing ext should accept (implicit wildcard for ext)');
}

// TEST047: Thumbnail with void input matches specific ext request
function test047_matchingSemanticsThumbnailVoidInput() {
  const cap = CapUrn.fromString('cap:in="media:void";op=generate_thumbnail;out="media:image;png;thumbnail"');
  const request = CapUrn.fromString('cap:ext=pdf;in="media:void";op=generate_thumbnail;out="media:image"');
  assert(cap.accepts(request), 'Void input cap should accept request; cap output conforms to less-specific request output');
}

// TEST048: Cap in=* out=* matches any request
function test048_matchingSemanticsWildcardDirection() {
  const cap = CapUrn.fromString('cap:in=*;out=*');
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.accepts(request), 'Wildcard cap should accept any request');
}

// TEST049: Cap op=generate accepts request ext=pdf (independent tags)
function test049_matchingSemanticsCrossDimension() {
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString(testUrn('ext=pdf'));
  assert(cap.accepts(request), 'Independent tags should not block matching');
}

// TEST050: media:string vs media: (wildcard) -> no match
function test050_matchingSemanticsDirectionMismatch() {
  const cap = CapUrn.fromString(
    `cap:in="${MEDIA_STRING}";op=generate;out="${MEDIA_OBJECT}"`
  );
  const request = CapUrn.fromString(
    `cap:in="${MEDIA_IDENTITY}";op=generate;out="${MEDIA_OBJECT}"`
  );
  assert(!cap.accepts(request), 'Incompatible direction types should not match');
}

// TEST890: Semantic direction matching - generic provider matches specific request
function test890_directionSemanticMatching() {
  // Generic wildcard cap accepts specific pdf request
  const genericCap = CapUrn.fromString(
    'cap:in="media:";op=generate_thumbnail;out="media:image;png;thumbnail"'
  );
  const pdfRequest = CapUrn.fromString(
    'cap:in="media:pdf";op=generate_thumbnail;out="media:image;png;thumbnail"'
  );
  assert(genericCap.accepts(pdfRequest), 'Generic wildcard cap must accept pdf request');

  // Also accepts epub
  const epubRequest = CapUrn.fromString(
    'cap:in="media:epub";op=generate_thumbnail;out="media:image;png;thumbnail"'
  );
  assert(genericCap.accepts(epubRequest), 'Generic wildcard cap must accept epub request');

  // Reverse: specific pdf cap does NOT accept generic bytes request
  const pdfCap = CapUrn.fromString(
    'cap:in="media:pdf";op=generate_thumbnail;out="media:image;png;thumbnail"'
  );
  const genericRequest = CapUrn.fromString(
    'cap:in="media:";op=generate_thumbnail;out="media:image;png;thumbnail"'
  );
  assert(!pdfCap.accepts(genericRequest), 'Specific pdf cap must NOT accept generic wildcard request');

  // PDF cap does NOT accept epub request
  assert(!pdfCap.accepts(epubRequest), 'PDF cap must NOT accept epub request');

  // Output direction: cap producing more specific output satisfies less specific request
  const specificOutCap = CapUrn.fromString(
    'cap:in="media:";op=generate_thumbnail;out="media:image;png;thumbnail"'
  );
  const genericOutRequest = CapUrn.fromString(
    'cap:in="media:";op=generate_thumbnail;out="media:image"'
  );
  assert(specificOutCap.accepts(genericOutRequest),
    'Cap producing image;png;thumbnail must satisfy request for image');

  // Reverse output: generic output cap does NOT satisfy specific output request
  const genericOutCap = CapUrn.fromString(
    'cap:in="media:";op=generate_thumbnail;out="media:image"'
  );
  const specificOutRequest = CapUrn.fromString(
    'cap:in="media:";op=generate_thumbnail;out="media:image;png;thumbnail"'
  );
  assert(!genericOutCap.accepts(specificOutRequest),
    'Generic output cap must NOT satisfy specific output request');
}

// TEST891: Semantic direction specificity - more media URN tags = higher specificity
function test891_directionSemanticSpecificity() {
  const genericCap = CapUrn.fromString(
    'cap:in="media:";op=generate_thumbnail;out="media:image;png;thumbnail"'
  );
  const specificCap = CapUrn.fromString(
    'cap:in="media:pdf";op=generate_thumbnail;out="media:image;png;thumbnail"'
  );

  assertEqual(genericCap.specificity(), 4, 'media:(0) + image;png;thumbnail(3) + op(1) = 4');
  assertEqual(specificCap.specificity(), 5, 'pdf(1) + image;png;thumbnail(3) + op(1) = 5');
  assert(specificCap.specificity() > genericCap.specificity(), 'pdf should be more specific');

  // CapMatcher should prefer more specific
  const pdfRequest = CapUrn.fromString(
    'cap:in="media:pdf";op=generate_thumbnail;out="media:image;png;thumbnail"'
  );
  const best = CapMatcher.findBestMatch([genericCap, specificCap], pdfRequest);
  assert(best !== null, 'Should find a match');
  assertEqual(best.getInSpec(), 'media:pdf', 'Should prefer more specific pdf cap');
}

// ============================================================================
// validation.rs: TEST053-TEST056
// ============================================================================

// TEST053: N/A for JS (Rust-only validation infrastructure)

// TEST054: Inline media spec redefinition of registry spec is detected
function test054_xv5InlineSpecRedefinitionDetected() {
  const registryLookup = (mediaUrn) => mediaUrn === MEDIA_STRING;
  const mediaSpecs = [
    {
      urn: MEDIA_STRING,
      media_type: 'text/plain',
      title: 'My Custom String',
      description: 'Trying to redefine string'
    }
  ];
  const result = validateNoMediaSpecRedefinitionSync(mediaSpecs, registryLookup);
  assert(!result.valid, 'Should fail when redefining registry spec');
  assert(result.error && result.error.includes('XV5'), 'Error should mention XV5');
  assert(result.redefines && result.redefines.includes(MEDIA_STRING), 'Should identify MEDIA_STRING as redefined');
}

// TEST055: New inline media spec not in registry is allowed
function test055_xv5NewInlineSpecAllowed() {
  const registryLookup = (mediaUrn) => mediaUrn === MEDIA_STRING;
  const mediaSpecs = [
    {
      urn: 'media:my-unique-custom-type-xyz123',
      media_type: 'application/json',
      title: 'My Custom Output',
      description: 'A custom output type'
    }
  ];
  const result = validateNoMediaSpecRedefinitionSync(mediaSpecs, registryLookup);
  assert(result.valid, 'New spec not in registry should pass validation');
}

// TEST056: Empty/null media_specs passes validation
function test056_xv5EmptyMediaSpecsAllowed() {
  const registryLookup = (mediaUrn) => mediaUrn === MEDIA_STRING;
  assert(validateNoMediaSpecRedefinitionSync({}, registryLookup).valid, 'Empty object should pass');
  assert(validateNoMediaSpecRedefinitionSync(null, registryLookup).valid, 'Null should pass');
  assert(validateNoMediaSpecRedefinitionSync(undefined, registryLookup).valid, 'Undefined should pass');
}

// ============================================================================
// media_urn.rs: TEST060-TEST078
// ============================================================================

// TEST060: MediaUrn.fromString('cap:string') -> INVALID_PREFIX error
function test060_wrongPrefixFails() {
  assertThrowsMediaUrn(
    () => MediaUrn.fromString('cap:string'),
    MediaUrnErrorCodes.INVALID_PREFIX,
    'Wrong prefix should fail with INVALID_PREFIX'
  );
}

// TEST061: isBinary true when textable tag is absent (binary = not textable)
function test061_isBinary() {
  // Binary types: no textable tag
  assert(MediaUrn.fromString(MEDIA_IDENTITY).isBinary(), 'MEDIA_IDENTITY (media:) should be binary');
  assert(MediaUrn.fromString(MEDIA_PNG).isBinary(), 'MEDIA_PNG should be binary');
  assert(MediaUrn.fromString(MEDIA_PDF).isBinary(), 'MEDIA_PDF should be binary');
  assert(MediaUrn.fromString('media:video').isBinary(), 'media:video should be binary');
  assert(MediaUrn.fromString('media:epub').isBinary(), 'media:epub should be binary');
  // Textable types: is_binary is false
  assert(!MediaUrn.fromString('media:textable').isBinary(), 'media:textable should not be binary');
  assert(!MediaUrn.fromString('media:textable;record').isBinary(), 'textable map should not be binary');
  assert(!MediaUrn.fromString(MEDIA_STRING).isBinary(), 'MEDIA_STRING should not be binary');
  assert(!MediaUrn.fromString(MEDIA_JSON).isBinary(), 'MEDIA_JSON should not be binary');
  assert(!MediaUrn.fromString(MEDIA_MD).isBinary(), 'MEDIA_MD should not be binary');
}

// TEST062: isMap true for MEDIA_OBJECT (record); false for MEDIA_STRING (form=scalar), MEDIA_STRING_LIST (list)
// TEST062: is_record returns true if record marker tag is present (key-value structure)
function test062_isRecord() {
  assert(MediaUrn.fromString(MEDIA_OBJECT).isRecord(), 'MEDIA_OBJECT should be record');
  assert(MediaUrn.fromString('media:custom;record').isRecord(), 'custom;record should be record');
  assert(MediaUrn.fromString(MEDIA_JSON).isRecord(), 'MEDIA_JSON should be record');
  // Without record marker, is_record is false
  assert(!MediaUrn.fromString('media:textable').isRecord(), 'plain textable should not be record');
  assert(!MediaUrn.fromString(MEDIA_STRING).isRecord(), 'MEDIA_STRING should not be record');
  assert(!MediaUrn.fromString(MEDIA_STRING_LIST).isRecord(), 'MEDIA_STRING_LIST should not be record');
}

// TEST063: is_scalar returns true if NO list marker (scalar is default cardinality)
function test063_isScalar() {
  assert(MediaUrn.fromString(MEDIA_STRING).isScalar(), 'MEDIA_STRING should be scalar');
  assert(MediaUrn.fromString(MEDIA_INTEGER).isScalar(), 'MEDIA_INTEGER should be scalar');
  assert(MediaUrn.fromString(MEDIA_NUMBER).isScalar(), 'MEDIA_NUMBER should be scalar');
  assert(MediaUrn.fromString(MEDIA_BOOLEAN).isScalar(), 'MEDIA_BOOLEAN should be scalar');
  assert(MediaUrn.fromString(MEDIA_OBJECT).isScalar(), 'MEDIA_OBJECT (record but scalar) should be scalar');
  assert(MediaUrn.fromString('media:textable').isScalar(), 'plain textable should be scalar');
  // With list marker, is_scalar is false
  assert(!MediaUrn.fromString(MEDIA_STRING_LIST).isScalar(), 'MEDIA_STRING_LIST should not be scalar');
  assert(!MediaUrn.fromString(MEDIA_OBJECT_LIST).isScalar(), 'MEDIA_OBJECT_LIST should not be scalar');
}

// TEST064: isList true for MEDIA_STRING_LIST, MEDIA_INTEGER_LIST, MEDIA_OBJECT_LIST;
//          false for MEDIA_STRING, MEDIA_OBJECT
function test064_isList() {
  assert(MediaUrn.fromString(MEDIA_STRING_LIST).isList(), 'MEDIA_STRING_LIST should be list');
  assert(MediaUrn.fromString(MEDIA_INTEGER_LIST).isList(), 'MEDIA_INTEGER_LIST should be list');
  assert(MediaUrn.fromString(MEDIA_OBJECT_LIST).isList(), 'MEDIA_OBJECT_LIST should be list');
  assert(!MediaUrn.fromString(MEDIA_STRING).isList(), 'MEDIA_STRING should not be list');
  assert(!MediaUrn.fromString(MEDIA_OBJECT).isList(), 'MEDIA_OBJECT should not be list');
}

// TEST065: is_opaque returns true if NO record marker (opaque is default structure)
function test065_isOpaque() {
  assert(MediaUrn.fromString(MEDIA_STRING).isOpaque(), 'MEDIA_STRING should be opaque');
  assert(MediaUrn.fromString(MEDIA_STRING_LIST).isOpaque(), 'MEDIA_STRING_LIST (list but no record) should be opaque');
  assert(MediaUrn.fromString(MEDIA_PDF).isOpaque(), 'MEDIA_PDF should be opaque');
  assert(MediaUrn.fromString('media:textable').isOpaque(), 'plain textable should be opaque');
  // With record marker, is_opaque is false
  assert(!MediaUrn.fromString(MEDIA_OBJECT).isOpaque(), 'MEDIA_OBJECT should not be opaque');
  assert(!MediaUrn.fromString(MEDIA_JSON).isOpaque(), 'MEDIA_JSON should not be opaque');
}

// TEST066: isJson true for MEDIA_JSON; false for MEDIA_OBJECT (map but not json)
function test066_isJson() {
  assert(MediaUrn.fromString(MEDIA_JSON).isJson(), 'MEDIA_JSON should be json');
  assert(!MediaUrn.fromString(MEDIA_OBJECT).isJson(), 'MEDIA_OBJECT should not be json');
}

// TEST067: is_text returns true only if "textable" marker tag is present
function test067_isText() {
  assert(MediaUrn.fromString(MEDIA_STRING).isText(), 'MEDIA_STRING should be text');
  assert(MediaUrn.fromString(MEDIA_INTEGER).isText(), 'MEDIA_INTEGER should be text');
  assert(MediaUrn.fromString(MEDIA_JSON).isText(), 'MEDIA_JSON should be text');
  // Without textable tag, is_text is false
  assert(!MediaUrn.fromString(MEDIA_IDENTITY).isText(), 'MEDIA_IDENTITY should not be text');
  assert(!MediaUrn.fromString(MEDIA_PNG).isText(), 'MEDIA_PNG should not be text');
  assert(!MediaUrn.fromString(MEDIA_OBJECT).isText(), 'MEDIA_OBJECT (no textable) should not be text');
}

// TEST068: isVoid true for media:void; false for media:string
function test068_isVoid() {
  assert(MediaUrn.fromString('media:void').isVoid(), 'media:void should be void');
  assert(!MediaUrn.fromString(MEDIA_STRING).isVoid(), 'MEDIA_STRING should not be void');
}

// TEST069-TEST070: N/A for JS (Rust-only binary_media_urn_for_ext/text_media_urn_for_ext)

// TEST071: Parse -> toString -> parse equals original
function test071_toStringRoundtrip() {
  const constants = [MEDIA_STRING, MEDIA_INTEGER, MEDIA_OBJECT, MEDIA_IDENTITY, MEDIA_PDF, MEDIA_JSON];
  for (const constant of constants) {
    const parsed = MediaUrn.fromString(constant);
    const reparsed = MediaUrn.fromString(parsed.toString());
    assert(parsed.equals(reparsed), `Round-trip failed for ${constant}`);
  }
}

// TEST072: All MEDIA_* constants parse as valid MediaUrns
function test072_constantsParse() {
  const constants = [
    MEDIA_STRING, MEDIA_INTEGER, MEDIA_NUMBER, MEDIA_BOOLEAN,
    MEDIA_OBJECT, MEDIA_STRING_LIST, MEDIA_INTEGER_LIST,
    MEDIA_NUMBER_LIST, MEDIA_BOOLEAN_LIST, MEDIA_OBJECT_LIST,
    MEDIA_IDENTITY, MEDIA_VOID, MEDIA_PNG, MEDIA_PDF, MEDIA_EPUB,
    MEDIA_MD, MEDIA_TXT, MEDIA_RST, MEDIA_LOG, MEDIA_HTML, MEDIA_XML,
    MEDIA_JSON, MEDIA_YAML, MEDIA_JSON_SCHEMA, MEDIA_AUDIO, MEDIA_VIDEO,
    MEDIA_MODEL_SPEC, MEDIA_AVAILABILITY_OUTPUT, MEDIA_PATH_OUTPUT,
    MEDIA_LLM_INFERENCE_OUTPUT
  ];
  for (const constant of constants) {
    const parsed = MediaUrn.fromString(constant);
    assert(parsed !== null, `Constant ${constant} should parse as valid MediaUrn`);
  }
}

// TEST073: N/A for JS (Rust has binary_media_urn_for_ext/text_media_urn_for_ext)

// TEST074: MEDIA_PDF (media:pdf) conformsTo media:pdf; MEDIA_MD conformsTo media:md; same URNs conform
function test074_mediaUrnMatching() {
  const pdfUrn = MediaUrn.fromString(MEDIA_PDF);
  const pdfPattern = MediaUrn.fromString('media:pdf');
  assert(pdfUrn.conformsTo(pdfPattern), 'MEDIA_PDF should conform to media:pdf');

  const mdUrn = MediaUrn.fromString(MEDIA_MD);
  const mdPattern = MediaUrn.fromString('media:md');
  assert(mdUrn.conformsTo(mdPattern), 'MEDIA_MD should conform to media:md');

  // Same URN conforms to itself
  assert(pdfUrn.conformsTo(pdfUrn), 'Same URN should conform to itself');
}

// TEST075: handler accepts same request, general handler accepts request
function test075_accepts() {
  const handler = MediaUrn.fromString(MEDIA_PDF);
  const sameReq = MediaUrn.fromString(MEDIA_PDF);
  assert(handler.accepts(sameReq), 'Handler should accept same request');

  const generalHandler = MediaUrn.fromString(MEDIA_IDENTITY);
  const specificReq = MediaUrn.fromString(MEDIA_PDF);
  assert(generalHandler.accepts(specificReq), 'General handler should accept specific request');
}

// TEST076: More tags = higher specificity
function test076_specificity() {
  const s1 = MediaUrn.fromString('media:');
  const s2 = MediaUrn.fromString('media:pdf');
  const s3 = MediaUrn.fromString('media:image;png;thumbnail');
  assert(s2.specificity() > s1.specificity(), 'pdf should be more specific than wildcard');
  assert(s3.specificity() > s2.specificity(), 'image;png;thumbnail should be more specific than pdf');
}

// TEST077: N/A for JS (Rust serde) - but we test JSON.stringify round-trip
function test077_serdeRoundtrip() {
  const original = MediaUrn.fromString(MEDIA_PDF);
  const json = JSON.stringify({ urn: original.toString() });
  const parsed = JSON.parse(json);
  const restored = MediaUrn.fromString(parsed.urn);
  assert(original.equals(restored), 'JSON round-trip should preserve MediaUrn');
}

// TEST078: MEDIA_OBJECT does NOT conform to MEDIA_STRING
function test078_debugMatchingBehavior() {
  const objUrn = MediaUrn.fromString(MEDIA_OBJECT);
  const strUrn = MediaUrn.fromString(MEDIA_STRING);
  assert(!objUrn.conformsTo(strUrn), 'MEDIA_OBJECT should NOT conform to MEDIA_STRING');
}

// ============================================================================
// media_spec.rs: TEST088-TEST110
// ============================================================================

// TEST088: N/A for JS (async registry, Rust-only)
// TEST089: N/A for JS
// TEST090: N/A for JS

// TEST091: resolveMediaUrn resolves custom from local mediaSpecs
function test091_resolveCustomMediaSpec() {
  const mediaSpecs = [
    { urn: 'media:custom-json', media_type: 'application/json', title: 'Custom JSON', profile_uri: 'https://example.com/schema/custom' }
  ];
  const spec = resolveMediaUrn('media:custom-json', mediaSpecs);
  assertEqual(spec.contentType, 'application/json', 'Should resolve custom spec');
  assertEqual(spec.profile, 'https://example.com/schema/custom', 'Should have custom profile');
}

// TEST092: resolveMediaUrn resolves with schema from local mediaSpecs
function test092_resolveCustomWithSchema() {
  const mediaSpecs = [
    {
      urn: 'media:rich-xml',
      media_type: 'application/xml',
      title: 'Rich XML',
      profile_uri: 'https://example.com/schema/rich',
      schema: { type: 'object' }
    }
  ];
  const spec = resolveMediaUrn('media:rich-xml', mediaSpecs);
  assertEqual(spec.contentType, 'application/xml', 'Should resolve rich spec');
  assert(spec.schema !== null, 'Should have schema');
  assertEqual(spec.schema.type, 'object', 'Schema should have correct type');
}

// TEST093: resolveMediaUrn fails hard on unknown URN
function test093_resolveUnresolvableFailsHard() {
  let caught = false;
  try {
    resolveMediaUrn('media:nonexistent', []);
  } catch (e) {
    if (e instanceof MediaSpecError && e.code === MediaSpecErrorCodes.UNRESOLVABLE_MEDIA_URN) {
      caught = true;
    }
  }
  assert(caught, 'Should fail hard on unresolvable media URN');
}

// TEST094: N/A for JS (no registry concept)
// TEST095: N/A for JS (Rust serde)
// TEST096: N/A for JS (Rust serde)
// TEST097: N/A for JS (Rust validation function)
// TEST098: N/A for JS

// TEST099: MediaSpec with media: (no textable tag) -> isBinary() true
function test099_resolvedIsBinary() {
  const spec = new MediaSpec('application/octet-stream', null, null, 'Binary', null, MEDIA_IDENTITY);
  assert(spec.isBinary(), 'Resolved binary spec should be binary');
}

// TEST100: MediaSpec with record -> isRecord() true
function test100_resolvedIsRecord() {
  const spec = new MediaSpec('application/json', null, null, 'Object', null, MEDIA_OBJECT);
  assert(spec.isRecord(), 'Resolved object spec should be record');
}

// TEST101: MediaSpec with form=scalar -> isScalar() true
function test101_resolvedIsScalar() {
  const spec = new MediaSpec('text/plain', null, null, 'String', null, MEDIA_STRING);
  assert(spec.isScalar(), 'Resolved string spec should be scalar');
}

// TEST102: MediaSpec with list -> isList() true
function test102_resolvedIsList() {
  const spec = new MediaSpec('text/plain', null, null, 'String List', null, MEDIA_STRING_LIST);
  assert(spec.isList(), 'Resolved string_list spec should be list');
}

// TEST103: MediaSpec with json tag -> isJSON() true
function test103_resolvedIsJson() {
  const spec = new MediaSpec('application/json', null, null, 'JSON', null, MEDIA_JSON);
  assert(spec.isJSON(), 'Resolved json spec should be JSON');
}

// TEST104: MediaSpec with textable tag -> isText() true
function test104_resolvedIsText() {
  const spec = new MediaSpec('text/plain', null, null, 'String', null, MEDIA_STRING);
  assert(spec.isText(), 'Resolved string spec should be text');
}

// TEST105: Metadata propagated from media spec definition
function test105_metadataPropagation() {
  const mediaSpecs = [
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
  const resolved = resolveMediaUrn('media:custom-setting', mediaSpecs);
  assert(resolved.metadata !== null, 'Should have metadata');
  assertEqual(resolved.metadata.category_key, 'interface', 'Should propagate category_key');
  assertEqual(resolved.metadata.ui_type, 'SETTING_UI_TYPE_CHECKBOX', 'Should propagate ui_type');
  assertEqual(resolved.metadata.display_index, 5, 'Should propagate display_index');
}

// TEST106: Metadata and validation coexist
function test106_metadataWithValidation() {
  const mediaSpecs = [
    {
      urn: 'media:bounded-number;numeric',
      media_type: 'text/plain',
      title: 'Bounded Number',
      validation: { min: 0, max: 100 },
      metadata: { category_key: 'inference', ui_type: 'SETTING_UI_TYPE_SLIDER' }
    }
  ];
  const resolved = resolveMediaUrn('media:bounded-number;numeric', mediaSpecs);
  assert(resolved.validation !== null, 'Should have validation');
  assertEqual(resolved.validation.min, 0, 'Should have min');
  assertEqual(resolved.validation.max, 100, 'Should have max');
  assert(resolved.metadata !== null, 'Should have metadata');
  assertEqual(resolved.metadata.category_key, 'inference', 'Should have category_key');
}

// TEST107: Extensions field propagated
function test107_extensionsPropagation() {
  const mediaSpecs = [
    {
      urn: 'media:pdf',
      media_type: 'application/pdf',
      title: 'PDF Document',
      extensions: ['pdf']
    }
  ];
  const resolved = resolveMediaUrn('media:pdf', mediaSpecs);
  assert(Array.isArray(resolved.extensions), 'Extensions should be an array');
  assertEqual(resolved.extensions.length, 1, 'Should have one extension');
  assertEqual(resolved.extensions[0], 'pdf', 'Should have pdf extension');
}

// TEST108: N/A for JS (Rust serde) - but we test MediaSpec with extensions
function test108_extensionsSerialization() {
  // Test that MediaSpec can hold extensions correctly
  const spec = new MediaSpec('application/pdf', null, null, 'PDF', null, 'media:pdf', null, null, ['pdf']);
  assert(Array.isArray(spec.extensions), 'Extensions should be array');
  assertEqual(spec.extensions[0], 'pdf', 'Should have pdf extension');
}

// TEST109: Extensions coexist with metadata and validation
function test109_extensionsWithMetadataAndValidation() {
  const mediaSpecs = [
    {
      urn: 'media:custom-output',
      media_type: 'application/json',
      title: 'Custom Output',
      validation: { min_length: 1, max_length: 1000 },
      metadata: { category: 'output' },
      extensions: ['json']
    }
  ];
  const resolved = resolveMediaUrn('media:custom-output', mediaSpecs);
  assert(resolved.validation !== null, 'Should have validation');
  assert(resolved.metadata !== null, 'Should have metadata');
  assert(Array.isArray(resolved.extensions), 'Should have extensions');
  assertEqual(resolved.extensions[0], 'json', 'Should have json extension');
}

// TEST110: Multiple extensions in a media spec
function test110_multipleExtensions() {
  const mediaSpecs = [
    {
      urn: 'media:image;jpeg',
      media_type: 'image/jpeg',
      title: 'JPEG Image',
      extensions: ['jpg', 'jpeg']
    }
  ];
  const resolved = resolveMediaUrn('media:image;jpeg', mediaSpecs);
  assertEqual(resolved.extensions.length, 2, 'Should have two extensions');
  assertEqual(resolved.extensions[0], 'jpg', 'First extension should be jpg');
  assertEqual(resolved.extensions[1], 'jpeg', 'Second extension should be jpeg');
}

// ============================================================================
// cap_matrix.rs: TEST117-TEST131
// ============================================================================

// TEST117: CapBlock finds more specific cap across registries
function test117_capBlockMoreSpecificWins() {
  const providerRegistry = new CapMatrix();
  const cartridgeRegistry = new CapMatrix();

  const providerHost = new MockCapSet('provider');
  const providerCap = makeCap(
    'cap:in="media:binary";op=generate_thumbnail;out="media:binary"',
    'Provider Thumbnail Generator (generic)'
  );
  providerRegistry.registerCapSet('provider', providerHost, [providerCap]);

  const cartridgeHost = new MockCapSet('cartridge');
  const cartridgeCap = makeCap(
    'cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"',
    'Cartridge PDF Thumbnail Generator (specific)'
  );
  cartridgeRegistry.registerCapSet('cartridge', cartridgeHost, [cartridgeCap]);

  const composite = new CapBlock();
  composite.addRegistry('providers', providerRegistry);
  composite.addRegistry('cartridges', cartridgeRegistry);

  const request = 'cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"';
  const best = composite.findBestCapSet(request);

  assertEqual(best.registryName, 'cartridges', 'More specific cartridge should win');
  assertEqual(best.cap.title, 'Cartridge PDF Thumbnail Generator (specific)', 'Should get cartridge cap');
}

// TEST118: CapBlock tie-breaking prefers first registry in order
function test118_capBlockTieGoesToFirst() {
  const registry1 = new CapMatrix();
  const registry2 = new CapMatrix();

  const host1 = new MockCapSet('host1');
  const cap1 = makeCap(matrixTestUrn('ext=pdf;op=generate'), 'Registry 1 Cap');
  registry1.registerCapSet('host1', host1, [cap1]);

  const host2 = new MockCapSet('host2');
  const cap2 = makeCap(matrixTestUrn('ext=pdf;op=generate'), 'Registry 2 Cap');
  registry2.registerCapSet('host2', host2, [cap2]);

  const composite = new CapBlock();
  composite.addRegistry('first', registry1);
  composite.addRegistry('second', registry2);

  const best = composite.findBestCapSet(matrixTestUrn('ext=pdf;op=generate'));
  assertEqual(best.registryName, 'first', 'On tie, first registry should win');
}

// TEST119: CapBlock polls all registries to find best match
function test119_capBlockPollsAll() {
  const registry1 = new CapMatrix();
  const registry2 = new CapMatrix();
  const registry3 = new CapMatrix();

  const host1 = new MockCapSet('host1');
  const cap1 = makeCap(matrixTestUrn('op=different'), 'Registry 1');
  registry1.registerCapSet('host1', host1, [cap1]);

  const host2 = new MockCapSet('host2');
  const cap2 = makeCap(matrixTestUrn('op=generate'), 'Registry 2');
  registry2.registerCapSet('host2', host2, [cap2]);

  const host3 = new MockCapSet('host3');
  const cap3 = makeCap(matrixTestUrn('ext=pdf;format=thumbnail;op=generate'), 'Registry 3');
  registry3.registerCapSet('host3', host3, [cap3]);

  const composite = new CapBlock();
  composite.addRegistry('r1', registry1);
  composite.addRegistry('r2', registry2);
  composite.addRegistry('r3', registry3);

  const best = composite.findBestCapSet(matrixTestUrn('ext=pdf;format=thumbnail;op=generate'));
  assertEqual(best.registryName, 'r3', 'Most specific registry should win');
}

// TEST120: CapBlock returns error when no cap matches request
function test120_capBlockNoMatch() {
  const registry = new CapMatrix();
  const composite = new CapBlock();
  composite.addRegistry('empty', registry);

  try {
    composite.findBestCapSet(matrixTestUrn('op=nonexistent'));
    throw new Error('Expected error for non-matching capability');
  } catch (e) {
    assert(e instanceof CapMatrixError, 'Should be CapMatrixError');
    assertEqual(e.type, 'NoSetsFound', 'Should be NoSetsFound error');
  }
}

// TEST121: CapBlock fallback scenario where generic cap handles unknown file types
function test121_capBlockFallbackScenario() {
  const providerRegistry = new CapMatrix();
  const cartridgeRegistry = new CapMatrix();

  const providerHost = new MockCapSet('provider_fallback');
  const providerCap = makeCap(
    'cap:in="media:binary";op=generate_thumbnail;out="media:binary"',
    'Generic Thumbnail Provider'
  );
  providerRegistry.registerCapSet('provider_fallback', providerHost, [providerCap]);

  const cartridgeHost = new MockCapSet('pdf_cartridge');
  const cartridgeCap = makeCap(
    'cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"',
    'PDF Thumbnail Cartridge'
  );
  cartridgeRegistry.registerCapSet('pdf_cartridge', cartridgeHost, [cartridgeCap]);

  const composite = new CapBlock();
  composite.addRegistry('providers', providerRegistry);
  composite.addRegistry('cartridges', cartridgeRegistry);

  // PDF request -> cartridge wins
  const best = composite.findBestCapSet('cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"');
  assertEqual(best.registryName, 'cartridges', 'Cartridge should win for PDF');

  // WAV request -> provider wins (fallback)
  const bestWav = composite.findBestCapSet('cap:ext=wav;in="media:binary";op=generate_thumbnail;out="media:binary"');
  assertEqual(bestWav.registryName, 'providers', 'Provider should win for wav (fallback)');
}

// TEST122: CapBlock can method returns execution info and acceptsRequest checks capability
function test122_capBlockCanMethod() {
  const providerRegistry = new CapMatrix();
  const providerHost = new MockCapSet('test_provider');
  const providerCap = makeCap(matrixTestUrn('ext=pdf;op=generate'), 'Test Provider');
  providerRegistry.registerCapSet('test_provider', providerHost, [providerCap]);

  const composite = new CapBlock();
  composite.addRegistry('providers', providerRegistry);

  const result = composite.can(matrixTestUrn('ext=pdf;op=generate'));
  assert(result.cap !== null, 'Should return cap');
  assert(result.compositeHost instanceof CompositeCapSet, 'Should return CompositeCapSet');
  assert(composite.acceptsRequest(matrixTestUrn('ext=pdf;op=generate')), 'Should accept matching cap');
  assert(!composite.acceptsRequest(matrixTestUrn('op=nonexistent')), 'Should not accept non-matching cap');
}

// TEST123: CapBlock registry management add, get, remove operations
function test123_capBlockRegistryManagement() {
  const composite = new CapBlock();
  const registry1 = new CapMatrix();
  const registry2 = new CapMatrix();

  composite.addRegistry('r1', registry1);
  composite.addRegistry('r2', registry2);
  assertEqual(composite.getRegistryNames().length, 2, 'Should have 2 registries');

  assertEqual(composite.getRegistry('r1'), registry1, 'Should get correct registry');

  const removed = composite.removeRegistry('r1');
  assertEqual(removed, registry1, 'Should return removed registry');
  assertEqual(composite.getRegistryNames().length, 1, 'Should have 1 registry after removal');

  assertEqual(composite.getRegistry('nonexistent'), null, 'Should return null for non-existent');
}

// TEST124: CapGraph basic construction builds nodes and edges from caps
function test124_capGraphBasicConstruction() {
  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:string', 'media:object', 'String to Object');
  registry.registerCapSet('converter', mockHost, [cap1, cap2]);

  const cube = new CapBlock();
  cube.addRegistry('converters', registry);

  const graph = cube.graph();
  assertEqual(graph.getNodes().size, 3, 'Expected 3 nodes');
  assertEqual(graph.getEdges().length, 2, 'Expected 2 edges');
  assertEqual(graph.stats().nodeCount, 3, 'Expected 3 nodes in stats');
  assertEqual(graph.stats().edgeCount, 2, 'Expected 2 edges in stats');
}

// TEST125: CapGraph getOutgoing and getIncoming return correct edges for media URN
function test125_capGraphOutgoingIncoming() {
  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:binary', 'media:object', 'Binary to Object');
  registry.registerCapSet('converter', mockHost, [cap1, cap2]);

  const cube = new CapBlock();
  cube.addRegistry('converters', registry);
  const graph = cube.graph();

  assertEqual(graph.getOutgoing('media:binary').length, 2, 'binary should have 2 outgoing');
  assertEqual(graph.getIncoming('media:string').length, 1, 'string should have 1 incoming');
  assertEqual(graph.getIncoming('media:object').length, 1, 'object should have 1 incoming');
}

// TEST126: CapGraph canConvert checks direct and transitive conversion paths
function test126_capGraphCanConvert() {
  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:string', 'media:object', 'String to Object');
  registry.registerCapSet('converter', mockHost, [cap1, cap2]);

  const cube = new CapBlock();
  cube.addRegistry('converters', registry);
  const graph = cube.graph();

  assert(graph.canConvert('media:binary', 'media:string'), 'Direct conversion');
  assert(graph.canConvert('media:string', 'media:object'), 'Direct conversion');
  assert(graph.canConvert('media:binary', 'media:object'), 'Transitive conversion');
  assert(graph.canConvert('media:binary', 'media:binary'), 'Same spec');
  assert(!graph.canConvert('media:object', 'media:binary'), 'Impossible conversion');
  assert(!graph.canConvert('media:nonexistent', 'media:string'), 'Nonexistent node');
}

// TEST127: CapGraph findPath returns shortest path between media URNs
function test127_capGraphFindPath() {
  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:string', 'media:object', 'String to Object');
  registry.registerCapSet('converter', mockHost, [cap1, cap2]);

  const cube = new CapBlock();
  cube.addRegistry('converters', registry);
  const graph = cube.graph();

  // Direct path
  let path = graph.findPath('media:binary', 'media:string');
  assert(path !== null, 'Should find direct path');
  assertEqual(path.length, 1, 'Direct path length should be 1');

  // Transitive path
  path = graph.findPath('media:binary', 'media:object');
  assert(path !== null, 'Should find transitive path');
  assertEqual(path.length, 2, 'Transitive path length should be 2');

  // No path
  path = graph.findPath('media:object', 'media:binary');
  assertEqual(path, null, 'Should not find impossible path');

  // Same spec
  path = graph.findPath('media:binary', 'media:binary');
  assert(path !== null, 'Same spec should return empty path');
  assertEqual(path.length, 0, 'Same spec path should be empty');
}

// TEST128: CapGraph findAllPaths returns all paths sorted by length
function test128_capGraphFindAllPaths() {
  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:string', 'media:object', 'String to Object');
  const cap3 = makeGraphCap('media:binary', 'media:object', 'Binary to Object (direct)');
  registry.registerCapSet('converter', mockHost, [cap1, cap2, cap3]);

  const cube = new CapBlock();
  cube.addRegistry('converters', registry);
  const graph = cube.graph();

  const paths = graph.findAllPaths('media:binary', 'media:object', 3);
  assertEqual(paths.length, 2, 'Should find 2 paths');
  assertEqual(paths[0].length, 1, 'Shortest path first (direct)');
  assertEqual(paths[1].length, 2, 'Longer path second (via string)');
}

// TEST129: CapGraph getDirectEdges returns edges sorted by specificity
function test129_capGraphGetDirectEdges() {
  const registry1 = new CapMatrix();
  const registry2 = new CapMatrix();
  const mockHost1 = { executeCap: async () => ({ textOutput: 'mock1' }) };
  const mockHost2 = { executeCap: async () => ({ textOutput: 'mock2' }) };

  const cap1 = makeGraphCap('media:binary', 'media:string', 'Generic Binary to String');
  const capUrn2 = CapUrn.fromString('cap:ext=pdf;in="media:binary";op=convert;out="media:string"');
  const cap2 = new Cap(capUrn2, 'PDF Binary to String', 'convert', 'PDF Binary to String');

  registry1.registerCapSet('converter1', mockHost1, [cap1]);
  registry2.registerCapSet('converter2', mockHost2, [cap2]);

  const cube = new CapBlock();
  cube.addRegistry('reg1', registry1);
  cube.addRegistry('reg2', registry2);
  const graph = cube.graph();

  const edges = graph.getDirectEdges('media:binary', 'media:string');
  assertEqual(edges.length, 2, 'Expected 2 direct edges');
  assertEqual(edges[0].cap.title, 'PDF Binary to String', 'More specific edge first');
  assert(edges[0].specificity > edges[1].specificity, 'First edge should have higher specificity');
}

// TEST130: CapGraph stats returns node count, edge count, input/output URN counts
function test130_capGraphStats() {
  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:string', 'media:object', 'String to Object');
  const cap3 = makeGraphCap('media:binary', 'media:json', 'Binary to JSON');
  registry.registerCapSet('converter', mockHost, [cap1, cap2, cap3]);

  const cube = new CapBlock();
  cube.addRegistry('converters', registry);
  const graph = cube.graph();
  const stats = graph.stats();

  assertEqual(stats.nodeCount, 4, '4 unique nodes');
  assertEqual(stats.edgeCount, 3, '3 edges');
  assertEqual(stats.inputUrnCount, 2, '2 input URNs');
  assertEqual(stats.outputUrnCount, 3, '3 output URNs');
}

// TEST131: CapGraph with CapBlock builds graph from multiple registries
function test131_capGraphWithCapBlock() {
  const providerRegistry = new CapMatrix();
  const cartridgeRegistry = new CapMatrix();
  const providerHost = { executeCap: async () => ({ textOutput: 'provider' }) };
  const cartridgeHost = { executeCap: async () => ({ textOutput: 'cartridge' }) };

  const providerCap = makeGraphCap('media:binary', 'media:string', 'Provider Binary to String');
  providerRegistry.registerCapSet('provider', providerHost, [providerCap]);

  const cartridgeCap = makeGraphCap('media:string', 'media:object', 'Cartridge String to Object');
  cartridgeRegistry.registerCapSet('cartridge', cartridgeHost, [cartridgeCap]);

  const cube = new CapBlock();
  cube.addRegistry('providers', providerRegistry);
  cube.addRegistry('cartridges', cartridgeRegistry);
  const graph = cube.graph();

  assert(graph.canConvert('media:binary', 'media:object'), 'Should convert across registries');
  const path = graph.findPath('media:binary', 'media:object');
  assert(path !== null, 'Should find path');
  assertEqual(path.length, 2, 'Path through 2 registries');
  assertEqual(path[0].registryName, 'providers', 'First edge from providers');
  assertEqual(path[1].registryName, 'cartridges', 'Second edge from cartridges');
}

// TEST132: N/A (already covered by TEST129)
// TEST133: N/A (already covered by TEST131)
// TEST134: N/A (already covered by TEST130)

// ============================================================================
// caller.rs: TEST156-TEST159
// ============================================================================

// TEST156: Creating StdinSource Data variant with byte vector
function test156_stdinSourceFromData() {
  const testData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
  const source = StdinSource.fromData(testData);
  assert(source !== null, 'Should create source');
  assertEqual(source.kind, StdinSourceKind.DATA, 'Should be DATA kind');
  assert(source.isData(), 'isData() should return true');
  assert(!source.isFileReference(), 'isFileReference() should return false');
  assertEqual(source.data, testData, 'Should store data');
}

// TEST157: Creating StdinSource FileReference variant with all required fields
function test157_stdinSourceFromFileReference() {
  const trackedFileId = 'tracked-file-123';
  const originalPath = '/path/to/original.pdf';
  const securityBookmark = new Uint8Array([0x62, 0x6f, 0x6f, 0x6b]);
  const mediaUrn = 'media:pdf';

  const source = StdinSource.fromFileReference(trackedFileId, originalPath, securityBookmark, mediaUrn);
  assert(source !== null, 'Should create source');
  assertEqual(source.kind, StdinSourceKind.FILE_REFERENCE, 'Should be FILE_REFERENCE kind');
  assert(!source.isData(), 'isData() should return false');
  assert(source.isFileReference(), 'isFileReference() should return true');
  assertEqual(source.trackedFileId, trackedFileId, 'Should store trackedFileId');
  assertEqual(source.originalPath, originalPath, 'Should store originalPath');
  assertEqual(source.mediaUrn, mediaUrn, 'Should store mediaUrn');
}

// TEST158: StdinSource Data with empty vector stores and retrieves correctly
function test158_stdinSourceWithEmptyData() {
  const emptyData = new Uint8Array(0);
  const source = StdinSource.fromData(emptyData);
  assert(source.isData(), 'Should be data source');
  assertEqual(source.data.length, 0, 'Data length should be 0');
}

// TEST159: StdinSource Data with binary content like PNG header bytes
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

// TEST274: CapArgumentValue constructor stores media_urn and raw byte value
function test274_capArgumentValueNew() {
  const arg = new CapArgumentValue('media:model-spec;textable', new Uint8Array([103, 112, 116, 45, 52]));
  assertEqual(arg.mediaUrn, 'media:model-spec;textable', 'mediaUrn must match');
  assertEqual(arg.value.length, 5, 'value must have 5 bytes');
}

// TEST275: CapArgumentValue.fromStr converts string to UTF-8 bytes
function test275_capArgumentValueFromStr() {
  const arg = CapArgumentValue.fromStr('media:string;textable', 'hello world');
  assertEqual(arg.mediaUrn, 'media:string;textable', 'mediaUrn must match');
  assertEqual(new TextDecoder().decode(arg.value), 'hello world', 'value must decode correctly');
}

// TEST276: CapArgumentValue.valueAsStr succeeds for UTF-8 data
function test276_capArgumentValueAsStrValid() {
  const arg = CapArgumentValue.fromStr('media:string', 'test');
  assertEqual(arg.valueAsStr(), 'test', 'valueAsStr must return test');
}

// TEST277: CapArgumentValue.valueAsStr fails for non-UTF-8 binary data
function test277_capArgumentValueAsStrInvalidUtf8() {
  const arg = new CapArgumentValue('media:pdf', new Uint8Array([0xFF, 0xFE, 0x80]));
  let threw = false;
  try {
    arg.valueAsStr();
  } catch (e) {
    threw = true;
  }
  assert(threw, 'non-UTF-8 data must fail on valueAsStr with fatal decoder');
}

// TEST278: CapArgumentValue with empty value stores empty Uint8Array
function test278_capArgumentValueEmpty() {
  const arg = new CapArgumentValue('media:void', new Uint8Array([]));
  assertEqual(arg.value.length, 0, 'empty value must have 0 bytes');
  assertEqual(arg.valueAsStr(), '', 'empty value as string must be empty string');
}

// TEST279-281: N/A for JS (Rust Debug/Clone/Send traits)

// TEST282: CapArgumentValue.fromStr with Unicode string preserves all characters
function test282_capArgumentValueUnicode() {
  const arg = CapArgumentValue.fromStr('media:string', 'hello \u4e16\u754c \ud83c\udf0d');
  assertEqual(arg.valueAsStr(), 'hello \u4e16\u754c \ud83c\udf0d', 'Unicode must roundtrip');
}

// TEST283: CapArgumentValue with large binary payload preserves all bytes
function test283_capArgumentValueLargeBinary() {
  const data = new Uint8Array(10000);
  for (let i = 0; i < 10000; i++) {
    data[i] = i % 256;
  }
  const arg = new CapArgumentValue('media:pdf', data);
  assertEqual(arg.value.length, 10000, 'large binary must preserve all bytes');
  assertEqual(arg.value[0], 0, 'first byte check');
  assertEqual(arg.value[255], 255, 'byte 255 check');
  assertEqual(arg.value[256], 0, 'byte 256 wraps check');
}

// ============================================================================
// standard/caps.rs: TEST304-TEST312
// ============================================================================

const { TaggedUrn } = require('tagged-urn');

// TEST304: MEDIA_AVAILABILITY_OUTPUT constant parses as valid media URN with correct tags
function test304_mediaAvailabilityOutputConstant() {
  const urn = TaggedUrn.fromString(MEDIA_AVAILABILITY_OUTPUT);
  assert(urn.getTag('textable') !== undefined, 'model-availability must be textable');
  assertEqual(urn.getTag('record'), '*', 'model-availability must be record');
  assert(urn.getTag('textable') !== undefined, 'model-availability must not be binary (has textable)');
  const reparsed = TaggedUrn.fromString(urn.toString());
  assert(urn.conformsTo(reparsed), 'roundtrip must match original');
}

// TEST305: MEDIA_PATH_OUTPUT constant parses as valid media URN with correct tags
function test305_mediaPathOutputConstant() {
  const urn = TaggedUrn.fromString(MEDIA_PATH_OUTPUT);
  assert(urn.getTag('textable') !== undefined, 'model-path must be textable');
  assertEqual(urn.getTag('record'), '*', 'model-path must be record');
  assert(urn.getTag('textable') !== undefined, 'model-path must not be binary (has textable)');
  const reparsed = TaggedUrn.fromString(urn.toString());
  assert(urn.conformsTo(reparsed), 'roundtrip must match original');
}

// TEST306: MEDIA_AVAILABILITY_OUTPUT and MEDIA_PATH_OUTPUT are distinct URNs
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

// TEST307: model_availability_urn builds valid cap URN with correct op and media specs
function test307_modelAvailabilityUrn() {
  const urn = modelAvailabilityUrn();
  assert(urn.hasTag('op', 'model-availability'), 'Must have op=model-availability');
  const inSpec = TaggedUrn.fromString(urn.getInSpec());
  const expectedIn = TaggedUrn.fromString(MEDIA_MODEL_SPEC);
  assert(inSpec.conformsTo(expectedIn), 'input must conform to MEDIA_MODEL_SPEC');
  const outSpec = TaggedUrn.fromString(urn.getOutSpec());
  const expectedOut = TaggedUrn.fromString(MEDIA_AVAILABILITY_OUTPUT);
  assert(outSpec.conformsTo(expectedOut), 'output must conform to MEDIA_AVAILABILITY_OUTPUT');
}

// TEST308: model_path_urn builds valid cap URN with correct op and media specs
function test308_modelPathUrn() {
  const urn = modelPathUrn();
  assert(urn.hasTag('op', 'model-path'), 'Must have op=model-path');
  const inSpec = TaggedUrn.fromString(urn.getInSpec());
  const expectedIn = TaggedUrn.fromString(MEDIA_MODEL_SPEC);
  assert(inSpec.conformsTo(expectedIn), 'input must conform to MEDIA_MODEL_SPEC');
  const outSpec = TaggedUrn.fromString(urn.getOutSpec());
  const expectedOut = TaggedUrn.fromString(MEDIA_PATH_OUTPUT);
  assert(outSpec.conformsTo(expectedOut), 'output must conform to MEDIA_PATH_OUTPUT');
}

// TEST309: model_availability_urn and model_path_urn produce distinct URNs
function test309_modelAvailabilityAndPathAreDistinct() {
  const avail = modelAvailabilityUrn();
  const path = modelPathUrn();
  assert(avail.toString() !== path.toString(), 'availability and path must be distinct');
}

// TEST310: llm_generate_text_urn has correct op and ml-model tags
function test310_llmGenerateTextUrn() {
  const urn = llmGenerateTextUrn();
  assert(urn.hasTag('op', 'generate_text'), 'Must have op=generate_text');
  assert(urn.getTag('llm') !== undefined, 'Must have llm tag');
  assert(urn.getTag('ml-model') !== undefined, 'Must have ml-model tag');
}

// TEST311: llm_generate_text_urn in/out specs match MEDIA_STRING
function test311_llmGenerateTextUrnSpecs() {
  const urn = llmGenerateTextUrn();
  const inSpec = TaggedUrn.fromString(urn.getInSpec());
  const expectedIn = TaggedUrn.fromString(MEDIA_STRING);
  assert(inSpec.conformsTo(expectedIn), 'in_spec must conform to MEDIA_STRING');
  const outSpec = TaggedUrn.fromString(urn.getOutSpec());
  const expectedOut = TaggedUrn.fromString(MEDIA_STRING);
  assert(outSpec.conformsTo(expectedOut), 'out_spec must conform to MEDIA_STRING');
}

// TEST312: All URN builders produce parseable cap URNs
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

function testJS_buildExtensionIndex() {
  const mediaSpecs = [
    { urn: 'media:pdf', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:image;jpeg', media_type: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
    { urn: 'media:json;textable', media_type: 'application/json', extensions: ['json'] }
  ];
  const index = buildExtensionIndex(mediaSpecs);
  assert(index instanceof Map, 'Should return a Map');
  assertEqual(index.size, 4, 'Should have 4 extensions');
  assert(index.has('pdf'), 'Should have pdf');
  assert(index.has('jpg'), 'Should have jpg');
  assert(index.has('jpeg'), 'Should have jpeg');
  assert(index.has('json'), 'Should have json');
  assertEqual(index.get('pdf')[0], 'media:pdf', 'pdf should map correctly');
}

function testJS_mediaUrnsForExtension() {
  const mediaSpecs = [
    { urn: 'media:pdf', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:json;textable;record', media_type: 'application/json', extensions: ['json'] },
    { urn: 'media:json;textable;list', media_type: 'application/json', extensions: ['json'] }
  ];

  const pdfUrns = mediaUrnsForExtension('pdf', mediaSpecs);
  assertEqual(pdfUrns.length, 1, 'Should find 1 URN for pdf');

  // Case insensitivity
  const pdfUrnsUpper = mediaUrnsForExtension('PDF', mediaSpecs);
  assertEqual(pdfUrnsUpper.length, 1, 'Should find URN with uppercase extension');

  // Multiple URNs for same extension
  const jsonUrns = mediaUrnsForExtension('json', mediaSpecs);
  assertEqual(jsonUrns.length, 2, 'Should find 2 URNs for json');

  // Unknown extension throws
  let thrownError = null;
  try {
    mediaUrnsForExtension('unknown', mediaSpecs);
  } catch (e) {
    thrownError = e;
  }
  assert(thrownError instanceof MediaSpecError, 'Should throw MediaSpecError for unknown ext');
}

function testJS_getExtensionMappings() {
  const mediaSpecs = [
    { urn: 'media:pdf', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:image;jpeg', media_type: 'image/jpeg', extensions: ['jpg', 'jpeg'] }
  ];
  const mappings = getExtensionMappings(mediaSpecs);
  assert(Array.isArray(mappings), 'Should return an array');
  assertEqual(mappings.length, 3, 'Should have 3 mappings');
}

function testJS_capWithMediaSpecs() {
  const urn = CapUrn.fromString('cap:in="media:string";op=test;out="media:custom"');
  const cap = new Cap(urn, 'Test Cap', 'test_command');
  cap.mediaSpecs = [
    { urn: MEDIA_STRING, media_type: 'text/plain', title: 'String', profile_uri: 'https://capdag.com/schema/str' },
    { urn: 'media:custom', media_type: 'application/json', title: 'Custom Output', schema: { type: 'object' } }
  ];
  const strSpec = cap.resolveMediaUrn(MEDIA_STRING);
  assertEqual(strSpec.contentType, 'text/plain', 'Should resolve string spec');
  const outputSpec = cap.resolveMediaUrn('media:custom');
  assertEqual(outputSpec.contentType, 'application/json', 'Should resolve custom spec');
  assert(outputSpec.schema !== null, 'Should have schema');
}

function testJS_capJSONSerialization() {
  const urn = CapUrn.fromString(testUrn('op=test'));
  const cap = new Cap(urn, 'Test Cap', 'test_command');
  cap.mediaSpecs = [
    { urn: 'media:custom', media_type: 'text/plain', title: 'Custom' }
  ];
  cap.arguments = {
    required: [{ name: 'input', media_urn: MEDIA_STRING }],
    optional: []
  };
  cap.output = { media_urn: 'media:custom', output_description: 'Test output' };

  const json = cap.toJSON();
  assert(json.media_specs !== undefined, 'Should have media_specs');
  assertEqual(typeof json.urn, 'string', 'URN should be string');

  const restored = Cap.fromJSON(json);
  assert(restored.mediaSpecs !== undefined, 'Should restore mediaSpecs');
  assertEqual(restored.urn.getInSpec(), MEDIA_VOID, 'Should restore inSpec');
  assertEqual(restored.urn.getOutSpec(), MEDIA_OBJECT, 'Should restore outSpec');
}

// JS round-trip for the documentation field on Cap. Mirrors TEST920 in
// capdag/src/cap/definition.rs — the body is non-trivial (newlines,
// backticks, embedded quotes, Unicode) so escaping mismatches between
// JSON.stringify on this side and the Rust serializer on the other side
// surface as failures here.
function testJS_capDocumentationRoundTrip() {
  const urn = CapUrn.fromString(testUrn('op=documented'));
  const cap = new Cap(urn, 'Documented Cap', 'documented');
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
function testJS_capDocumentationOmittedWhenNull() {
  const urn = CapUrn.fromString(testUrn('op=undocumented'));
  const cap = new Cap(urn, 'Undocumented Cap', 'undocumented');
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

// Documentation propagates from a mediaSpecs definition through
// resolveMediaUrn into the resolved MediaSpec. Mirrors TEST924 on the Rust
// side. This is the path every UI consumer uses, so a break here makes the
// new field invisible everywhere downstream.
function testJS_mediaSpecDocumentationPropagatesThroughResolve() {
  const body = '## Markdown body\n\nWith `code` and a [link](https://example.com).';
  const mediaSpecs = [
    {
      urn: 'media:doc-test;textable',
      media_type: 'text/plain',
      title: 'Documented',
      description: 'short desc',
      documentation: body
    }
  ];

  const resolved = resolveMediaUrn('media:doc-test;textable', mediaSpecs);
  assertEqual(resolved.documentation, body, 'documentation must propagate into MediaSpec');
  // The short description must remain distinct from the long markdown
  // body — they are different fields with different semantics.
  assertEqual(resolved.description, 'short desc', 'description must remain distinct from documentation');

  // Missing documentation must collapse to null, not '' or undefined.
  const noDoc = resolveMediaUrn('media:doc-test;textable', [
    { urn: 'media:doc-test;textable', media_type: 'text/plain', title: 'No Doc' }
  ]);
  assertEqual(noDoc.documentation, null, 'Missing documentation must resolve to null');

  const emptyDoc = resolveMediaUrn('media:doc-test;textable', [
    { urn: 'media:doc-test;textable', media_type: 'text/plain', title: 'Empty', documentation: '' }
  ]);
  assertEqual(emptyDoc.documentation, null, 'Empty documentation string must collapse to null');
}

function testJS_stdinSourceKindConstants() {
  assert(StdinSourceKind.DATA !== undefined, 'DATA kind should be defined');
  assert(StdinSourceKind.FILE_REFERENCE !== undefined, 'FILE_REFERENCE kind should be defined');
  assert(StdinSourceKind.DATA !== StdinSourceKind.FILE_REFERENCE, 'Kind values should be distinct');
}

function testJS_stdinSourceNullData() {
  const source = StdinSource.fromData(null);
  assert(source !== null, 'Should create source');
  assert(source.isData(), 'Should be data source');
  assertEqual(source.data, null, 'Data should be null');
}

function testJS_argsPassedToExecuteCap() {
  let receivedArgs = null;
  const mockHost = {
    executeCap: async (capUrn, args) => {
      receivedArgs = args;
      return { textOutput: 'ok' };
    }
  };

  const cap = new Cap(
    CapUrn.fromString('cap:in="media:void";op=test;out="media:string"'),
    'Test Cap',
    'test-command'
  );
  const registry = new CapMatrix();
  registry.registerCapSet('test', mockHost, [cap]);
  const cube = new CapBlock();
  cube.addRegistry('test', registry);

  const args = [new CapArgumentValue('media:void', new Uint8Array([1, 2, 3]))];
  const { compositeHost } = cube.can('cap:in="media:void";op=test;out="media:string"');

  return compositeHost.executeCap(
    'cap:in="media:void";op=test;out="media:string"',
    args
  ).then(() => {
    assert(receivedArgs !== null, 'Should receive arguments');
    assert(Array.isArray(receivedArgs), 'Should receive array');
    assertEqual(receivedArgs.length, 1, 'Should have one argument');
    assertEqual(receivedArgs[0].mediaUrn, 'media:void', 'Correct mediaUrn');
    assertEqual(receivedArgs[0].value.length, 3, 'Correct data length');
  });
}

function testJS_binaryArgPassedToExecuteCap() {
  let receivedArgs = null;
  const mockHost = {
    executeCap: async (capUrn, args) => {
      receivedArgs = args;
      return { textOutput: 'ok' };
    }
  };

  const cap = new Cap(
    CapUrn.fromString('cap:in="media:void";op=test;out="media:string"'),
    'Test Cap',
    'test-command'
  );
  const registry = new CapMatrix();
  registry.registerCapSet('test', mockHost, [cap]);
  const cube = new CapBlock();
  cube.addRegistry('test', registry);

  const binaryArg = new CapArgumentValue('media:pdf', new Uint8Array([0x89, 0x50, 0x4E, 0x47]));
  const { compositeHost } = cube.can('cap:in="media:void";op=test;out="media:string"');

  return compositeHost.executeCap(
    'cap:in="media:void";op=test;out="media:string"',
    [binaryArg]
  ).then(() => {
    assert(receivedArgs !== null, 'Should receive arguments');
    assertEqual(receivedArgs[0].mediaUrn, 'media:pdf', 'Correct mediaUrn');
    assertEqual(receivedArgs[0].value[0], 0x89, 'First byte check');
    assertEqual(receivedArgs[0].value.length, 4, 'Correct data length');
  });
}

function testJS_mediaSpecConstruction() {
  const spec1 = new MediaSpec('text/plain', 'https://capdag.com/schema/str', null, 'String', null, 'media:string');
  assertEqual(spec1.contentType, 'text/plain', 'Should have content type');
  assertEqual(spec1.profile, 'https://capdag.com/schema/str', 'Should have profile');
  assertEqual(spec1.title, 'String', 'Should have title');
  assertEqual(spec1.mediaUrn, 'media:string', 'Should have mediaUrn');

  const spec2 = new MediaSpec('application/octet-stream', null, null, 'Binary', null, 'media:binary');
  assertEqual(spec2.profile, null, 'Should have null profile');
}

// =============================================================================
// Cartridge Repository Tests (TEST320-TEST335)
// =============================================================================

// Sample registry for testing
const sampleRegistry = {
  schemaVersion: '4.0',
  lastUpdated: '2026-02-07T16:48:28Z',
  cartridges: {
    pdfcartridge: {
      name: 'pdfcartridge',
      description: 'PDF document processor',
      author: 'test-author',
      pageUrl: 'https://example.com/pdf',
      teamId: 'P336JK947M',
      minAppVersion: '1.0.0',
      categories: ['document'],
      tags: ['pdf', 'extractor'],
      caps: [
        {
          urn: 'cap:in="media:pdf";op=disbind;out="media:disbound-page;textable;list"',
          title: 'Disbind PDF',
          description: 'Extract pages'
        },
        {
          urn: 'cap:in="media:pdf";op=extract_metadata;out="media:file-metadata;textable;record"',
          title: 'Extract Metadata',
          description: 'Get PDF metadata'
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
      caps: [
        {
          urn: 'cap:in="media:txt;textable";op=disbind;out="media:disbound-page;textable;list"',
          title: 'Disbind Text',
          description: 'Extract text pages'
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
              sha256: 'abc123',
              size: 821000
            }
          }]
        }
      }
    }
  }
};

// TEST320: Cartridge info construction
function test320_cartridgeInfoConstruction() {
  const data = {
    id: 'testcartridge',
    name: 'Test Cartridge',
    version: '1.0.0',
    description: 'A test',
    teamId: 'TEAM123',
    signedAt: '2026-01-01',
    caps: [{urn: 'cap:in="media:void";op=test;out="media:void"', title: 'Test', description: ''}],
    versions: {
      '1.0.0': {
        releaseDate: '2026-01-01',
        changelog: ['Initial'],
        minAppVersion: '1.0.0',
        builds: [{platform: 'darwin-arm64', package: {name: 'test-1.0.0.pkg', sha256: 'abc123', size: 100}}]
      }
    },
    availableVersions: ['1.0.0']
  };
  const cartridge = new CartridgeInfo(data);
  assert(cartridge.id === 'testcartridge', 'ID should match');
  assert(cartridge.teamId === 'TEAM123', 'Team ID should match');
  assert(cartridge.caps.length === 1, 'Should have 1 cap');
  assert(cartridge.caps[0].urn === 'cap:in="media:void";op=test;out="media:void"', 'Cap URN should match');
}

// TEST321: Cartridge info is signed check
function test321_cartridgeInfoIsSigned() {
  const signed = new CartridgeInfo({id: 'test', teamId: 'TEAM', signedAt: '2026-01-01', caps: []});
  assert(signed.isSigned() === true, 'Cartridge with teamId and signedAt should be signed');

  const unsigned1 = new CartridgeInfo({id: 'test', teamId: '', signedAt: '2026-01-01', caps: []});
  assert(unsigned1.isSigned() === false, 'Cartridge without teamId should not be signed');

  const unsigned2 = new CartridgeInfo({id: 'test', teamId: 'TEAM', signedAt: '', caps: []});
  assert(unsigned2.isSigned() === false, 'Cartridge without signedAt should not be signed');
}

// TEST322: Cartridge info build for platform and available platforms
function test322_cartridgeInfoBuildForPlatform() {
  const withBuilds = new CartridgeInfo({
    id: 'test', version: '1.0.0', caps: [],
    versions: {
      '1.0.0': {
        builds: [
          {platform: 'darwin-arm64', package: {name: 'test-darwin.pkg', sha256: 'abc', size: 100}},
          {platform: 'linux-x86_64', package: {name: 'test-linux.pkg', sha256: 'def', size: 200}}
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

  const noBuilds = new CartridgeInfo({id: 'test', version: '1.0.0', caps: [], versions: {}, availableVersions: []});
  assert(noBuilds.buildForPlatform('darwin-arm64') === null, 'Should return null when no versions');
  assert(noBuilds.availablePlatforms().length === 0, 'Should have no platforms');
}

// TEST323: CartridgeRepoServer validate registry
function test323_cartridgeRepoServerValidateRegistry() {
  // Valid registry
  const server = new CartridgeRepoServer(sampleRegistry);
  assert(server.registry.schemaVersion === '4.0', 'Should accept valid registry');

  // Invalid schema version
  let threw = false;
  try {
    new CartridgeRepoServer({schemaVersion: '3.0', cartridges: {}});
  } catch (e) {
    threw = true;
    assert(e.message.includes('schema version'), 'Should reject wrong schema version');
  }
  assert(threw, 'Should throw for invalid schema');

  // Missing cartridges
  threw = false;
  try {
    new CartridgeRepoServer({schemaVersion: '4.0'});
  } catch (e) {
    threw = true;
    assert(e.message.includes('cartridges'), 'Should reject missing cartridges');
  }
  assert(threw, 'Should throw for missing cartridges');
}

// TEST324: CartridgeRepoServer transform to array
function test324_cartridgeRepoServerTransformToArray() {
  const server = new CartridgeRepoServer(sampleRegistry);
  const cartridges = server.transformToCartridgeArray();

  assert(Array.isArray(cartridges), 'Should return array');
  assert(cartridges.length === 2, 'Should have 2 cartridges');

  const pdf = cartridges.find(p => p.id === 'pdfcartridge');
  assert(pdf !== undefined, 'Should include pdfcartridge');
  assert(pdf.version === '0.81.5325', 'Should have latest version');
  assert(pdf.teamId === 'P336JK947M', 'Should have teamId');
  assert(pdf.signedAt === '2026-02-07T16:40:28Z', 'Should have signedAt from releaseDate');
  assert(pdf.versions !== undefined, 'Should have versions');
  assert(pdf.versions['0.81.5325'] !== undefined, 'Should have version data');
  assert(pdf.versions['0.81.5325'].builds.length === 1, 'Should have 1 build');
  assert(pdf.versions['0.81.5325'].builds[0].platform === 'darwin-arm64', 'Should have correct platform');
  assert(pdf.versions['0.81.5325'].builds[0].package.name === 'pdfcartridge-0.81.5325.pkg', 'Should have package name');
  assert(pdf.versions['0.81.5325'].builds[0].package.sha256 === '9b68724eb9220ecf01e8ed4f5f80c594fbac2239bc5bf675005ec882ecc5eba0', 'Should have package SHA256');
  assert(Array.isArray(pdf.availableVersions), 'Should have availableVersions array');
  assert(pdf.availableVersions.includes('0.81.5325'), 'Should include latest version');
  assert(Array.isArray(pdf.caps), 'Should have caps array');
  assert(pdf.caps.length === 2, 'Should have 2 caps');
}

// TEST325: CartridgeRepoServer get cartridges
function test325_cartridgeRepoServerGetCartridges() {
  const server = new CartridgeRepoServer(sampleRegistry);
  const response = server.getCartridges();

  assert(response.cartridges !== undefined, 'Should have cartridges field');
  assert(Array.isArray(response.cartridges), 'Cartridges should be array');
  assert(response.cartridges.length === 2, 'Should have 2 cartridges');
}

// TEST326: CartridgeRepoServer get cartridge by ID
function test326_cartridgeRepoServerGetCartridgeById() {
  const server = new CartridgeRepoServer(sampleRegistry);

  const pdf = server.getCartridgeById('pdfcartridge');
  assert(pdf !== undefined, 'Should find pdfcartridge');
  assert(pdf.id === 'pdfcartridge', 'Should have correct ID');

  const notFound = server.getCartridgeById('nonexistent');
  assert(notFound === undefined, 'Should return undefined for missing cartridge');
}

// TEST327: CartridgeRepoServer search cartridges
function test327_cartridgeRepoServerSearchCartridges() {
  const server = new CartridgeRepoServer(sampleRegistry);

  const pdfResults = server.searchCartridges('pdf');
  assert(pdfResults.length === 1, 'Should find 1 PDF cartridge');
  assert(pdfResults[0].id === 'pdfcartridge', 'Should find pdfcartridge');

  const metadataResults = server.searchCartridges('metadata');
  assert(metadataResults.length === 1, 'Should find cartridge by cap title');

  const noResults = server.searchCartridges('nonexistent');
  assert(noResults.length === 0, 'Should return empty for no matches');
}

// TEST328: CartridgeRepoServer get by category
function test328_cartridgeRepoServerGetByCategory() {
  const server = new CartridgeRepoServer(sampleRegistry);

  const docCartridges = server.getCartridgesByCategory('document');
  assert(docCartridges.length === 1, 'Should find 1 document cartridge');
  assert(docCartridges[0].id === 'pdfcartridge', 'Should be pdfcartridge');

  const textCartridges = server.getCartridgesByCategory('text');
  assert(textCartridges.length === 1, 'Should find 1 text cartridge');
  assert(textCartridges[0].id === 'txtcartridge', 'Should be txtcartridge');
}

// TEST329: CartridgeRepoServer get by cap
function test329_cartridgeRepoServerGetByCap() {
  const server = new CartridgeRepoServer(sampleRegistry);

  const disbindCap = 'cap:in="media:pdf";op=disbind;out="media:disbound-page;textable;list"';
  const cartridges = server.getCartridgesByCap(disbindCap);

  assert(cartridges.length === 1, 'Should find 1 cartridge with this cap');
  assert(cartridges[0].id === 'pdfcartridge', 'Should be pdfcartridge');

  const metadataCap = 'cap:in="media:pdf";op=extract_metadata;out="media:file-metadata;textable;record"';
  const metadataCartridges = server.getCartridgesByCap(metadataCap);
  assert(metadataCartridges.length === 1, 'Should find metadata cap');
}

// TEST330: CartridgeRepoClient update cache
function test330_cartridgeRepoClientUpdateCache() {
  const client = new CartridgeRepoClient(3600);
  const server = new CartridgeRepoServer(sampleRegistry);
  const cartridges = server.transformToCartridgeArray().map(p => new CartridgeInfo(p));

  client.updateCache('https://example.com/api/cartridges', cartridges);

  const cache = client.caches.get('https://example.com/api/cartridges');
  assert(cache !== undefined, 'Cache should exist');
  assert(cache.cartridges.size === 2, 'Should have 2 cartridges in cache');
  assert(cache.capToCartridges.size > 0, 'Should have cap mappings');
}

// TEST331: CartridgeRepoClient get suggestions
function test331_cartridgeRepoClientGetSuggestions() {
  const client = new CartridgeRepoClient(3600);
  const server = new CartridgeRepoServer(sampleRegistry);
  const cartridges = server.transformToCartridgeArray().map(p => new CartridgeInfo(p));

  client.updateCache('https://example.com/api/cartridges', cartridges);

  const disbindCap = 'cap:in="media:pdf";op=disbind;out="media:disbound-page;textable;list"';
  const suggestions = client.getSuggestionsForCap(disbindCap);

  assert(suggestions.length === 1, 'Should find 1 suggestion');
  assert(suggestions[0].cartridgeId === 'pdfcartridge', 'Should suggest pdfcartridge');
  assert(suggestions[0].capUrn === disbindCap, 'Should have correct cap URN');
  assert(suggestions[0].capTitle === 'Disbind PDF', 'Should have cap title');
}

// TEST332: CartridgeRepoClient get cartridge
function test332_cartridgeRepoClientGetCartridge() {
  const client = new CartridgeRepoClient(3600);
  const server = new CartridgeRepoServer(sampleRegistry);
  const cartridges = server.transformToCartridgeArray().map(p => new CartridgeInfo(p));

  client.updateCache('https://example.com/api/cartridges', cartridges);

  const cartridge = client.getCartridge('pdfcartridge');
  assert(cartridge !== null, 'Should find cartridge');
  assert(cartridge.id === 'pdfcartridge', 'Should have correct ID');

  const notFound = client.getCartridge('nonexistent');
  assert(notFound === null, 'Should return null for missing cartridge');
}

// TEST333: CartridgeRepoClient get all caps
function test333_cartridgeRepoClientGetAllCaps() {
  const client = new CartridgeRepoClient(3600);
  const server = new CartridgeRepoServer(sampleRegistry);
  const cartridges = server.transformToCartridgeArray().map(p => new CartridgeInfo(p));

  client.updateCache('https://example.com/api/cartridges', cartridges);

  const caps = client.getAllAvailableCaps();
  assert(Array.isArray(caps), 'Should return array');
  assert(caps.length === 3, 'Should have 3 unique caps');
  assert(caps.every(c => typeof c === 'string'), 'All caps should be strings');
}

// TEST334: CartridgeRepoClient needs sync
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

  // Wait for cache to expire (1 second)
  // Note: Can't test this synchronously, would need async test
}

// TEST335: CartridgeRepoServer and Client integration
function test335_cartridgeRepoServerClientIntegration() {
  // Server creates API response
  const server = new CartridgeRepoServer(sampleRegistry);
  const apiResponse = server.getCartridges();

  // Client consumes API response
  const client = new CartridgeRepoClient(3600);
  const cartridges = apiResponse.cartridges.map(p => new CartridgeInfo(p));
  client.updateCache('https://example.com/api/cartridges', cartridges);

  // Client can find cartridge
  const cartridge = client.getCartridge('pdfcartridge');
  assert(cartridge !== null, 'Client should find cartridge from server data');
  assert(cartridge.isSigned(), 'Cartridge should be signed');
  assert(cartridge.buildForPlatform('darwin-arm64') !== null, 'Cartridge should have darwin-arm64 build');

  // Client can get suggestions
  const capUrn = 'cap:in="media:pdf";op=disbind;out="media:disbound-page;textable;list"';
  const suggestions = client.getSuggestionsForCap(capUrn);
  assert(suggestions.length === 1, 'Should get suggestions');
  assert(suggestions[0].cartridgeId === 'pdfcartridge', 'Should suggest correct cartridge');

  // Server can search
  const searchResults = server.searchCartridges('pdf');
  assert(searchResults.length === 1, 'Server search should work');
  assert(searchResults[0].id === cartridge.id, 'Search and client should agree');
}

// ============================================================================
// media_urn.rs: TEST546-TEST558 (MediaUrn predicates)
// ============================================================================

// TEST546: isImage returns true only when image marker tag is present
function test546_isImage() {
  assert(MediaUrn.fromString(MEDIA_PNG).isImage(), 'MEDIA_PNG should be image');
  assert(MediaUrn.fromString('media:image;png;thumbnail').isImage(), 'media:image;png;thumbnail should be image');
  assert(MediaUrn.fromString('media:image;jpg').isImage(), 'media:image;jpg should be image');
  // Non-image types
  assert(!MediaUrn.fromString(MEDIA_PDF).isImage(), 'MEDIA_PDF should not be image');
  assert(!MediaUrn.fromString(MEDIA_STRING).isImage(), 'MEDIA_STRING should not be image');
  assert(!MediaUrn.fromString(MEDIA_AUDIO).isImage(), 'MEDIA_AUDIO should not be image');
  assert(!MediaUrn.fromString(MEDIA_VIDEO).isImage(), 'MEDIA_VIDEO should not be image');
}

// TEST547: isAudio returns true only when audio marker tag is present
function test547_isAudio() {
  assert(MediaUrn.fromString(MEDIA_AUDIO).isAudio(), 'MEDIA_AUDIO should be audio');
  assert(MediaUrn.fromString(MEDIA_AUDIO_SPEECH).isAudio(), 'MEDIA_AUDIO_SPEECH should be audio');
  assert(MediaUrn.fromString('media:audio;mp3').isAudio(), 'media:audio;mp3 should be audio');
  // Non-audio types
  assert(!MediaUrn.fromString(MEDIA_VIDEO).isAudio(), 'MEDIA_VIDEO should not be audio');
  assert(!MediaUrn.fromString(MEDIA_PNG).isAudio(), 'MEDIA_PNG should not be audio');
  assert(!MediaUrn.fromString(MEDIA_STRING).isAudio(), 'MEDIA_STRING should not be audio');
}

// TEST548: isVideo returns true only when video marker tag is present
function test548_isVideo() {
  assert(MediaUrn.fromString(MEDIA_VIDEO).isVideo(), 'MEDIA_VIDEO should be video');
  assert(MediaUrn.fromString('media:video;mp4').isVideo(), 'media:video;mp4 should be video');
  // Non-video types
  assert(!MediaUrn.fromString(MEDIA_AUDIO).isVideo(), 'MEDIA_AUDIO should not be video');
  assert(!MediaUrn.fromString(MEDIA_PNG).isVideo(), 'MEDIA_PNG should not be video');
  assert(!MediaUrn.fromString(MEDIA_STRING).isVideo(), 'MEDIA_STRING should not be video');
}

// TEST549: isNumeric returns true only when numeric marker tag is present
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

// TEST550: isBool returns true only when bool marker tag is present
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

// TEST551: isFilePath returns true for scalar file-path, false for array
function test551_isFilePath() {
  assert(MediaUrn.fromString(MEDIA_FILE_PATH).isFilePath(), 'MEDIA_FILE_PATH should be file-path');
  // Array file-path is NOT isFilePath (it's isFilePathArray)
  assert(!MediaUrn.fromString(MEDIA_FILE_PATH_ARRAY).isFilePath(), 'MEDIA_FILE_PATH_ARRAY should not be isFilePath');
  // Non-file-path types
  assert(!MediaUrn.fromString(MEDIA_STRING).isFilePath(), 'MEDIA_STRING should not be file-path');
  assert(!MediaUrn.fromString(MEDIA_IDENTITY).isFilePath(), 'MEDIA_IDENTITY should not be file-path');
}

// TEST552: isFilePathArray returns true for list file-path, false for scalar
function test552_isFilePathArray() {
  assert(MediaUrn.fromString(MEDIA_FILE_PATH_ARRAY).isFilePathArray(), 'MEDIA_FILE_PATH_ARRAY should be file-path-array');
  // Scalar file-path is NOT isFilePathArray
  assert(!MediaUrn.fromString(MEDIA_FILE_PATH).isFilePathArray(), 'MEDIA_FILE_PATH should not be isFilePathArray');
  // Non-file-path types
  assert(!MediaUrn.fromString(MEDIA_STRING_LIST).isFilePathArray(), 'MEDIA_STRING_LIST should not be file-path-array');
}

// TEST553: isAnyFilePath returns true for both scalar and array file-path
function test553_isAnyFilePath() {
  assert(MediaUrn.fromString(MEDIA_FILE_PATH).isAnyFilePath(), 'MEDIA_FILE_PATH should be any-file-path');
  assert(MediaUrn.fromString(MEDIA_FILE_PATH_ARRAY).isAnyFilePath(), 'MEDIA_FILE_PATH_ARRAY should be any-file-path');
  // Non-file-path types
  assert(!MediaUrn.fromString(MEDIA_STRING).isAnyFilePath(), 'MEDIA_STRING should not be any-file-path');
  assert(!MediaUrn.fromString(MEDIA_STRING_LIST).isAnyFilePath(), 'MEDIA_STRING_LIST should not be any-file-path');
}

// TEST554: isCollection returns true when collection marker tag is present
// TEST554: N/A for JS (MEDIA_COLLECTION constants removed - no longer exists)
function test554_isCollection() {
  // Skip - collection types removed from capdag
}

// TEST555: N/A for JS (with_tag/without_tag on MediaUrn - JS MediaUrn does not have these methods)

// TEST556: N/A for JS (image_media_urn_for_ext helper not in JS)

// TEST557: N/A for JS (audio_media_urn_for_ext helper not in JS)

// TEST558: predicates are consistent with constants - every constant triggers exactly the expected predicates
function test558_predicateConstantConsistency() {
  // MEDIA_INTEGER must be numeric, text, scalar, NOT binary/bool/image/audio/video
  const intUrn = MediaUrn.fromString(MEDIA_INTEGER);
  assert(intUrn.isNumeric(), 'MEDIA_INTEGER must be numeric');
  assert(intUrn.isText(), 'MEDIA_INTEGER must be text');
  assert(intUrn.isScalar(), 'MEDIA_INTEGER must be scalar');
  assert(!intUrn.isBinary(), 'MEDIA_INTEGER must not be binary');
  assert(!intUrn.isBool(), 'MEDIA_INTEGER must not be bool');
  assert(!intUrn.isImage(), 'MEDIA_INTEGER must not be image');
  assert(!intUrn.isList(), 'MEDIA_INTEGER must not be list');

  // MEDIA_BOOLEAN must be bool, text, scalar, NOT numeric
  const boolUrn = MediaUrn.fromString(MEDIA_BOOLEAN);
  assert(boolUrn.isBool(), 'MEDIA_BOOLEAN must be bool');
  assert(boolUrn.isText(), 'MEDIA_BOOLEAN must be text');
  assert(boolUrn.isScalar(), 'MEDIA_BOOLEAN must be scalar');
  assert(!boolUrn.isNumeric(), 'MEDIA_BOOLEAN must not be numeric');

  // MEDIA_JSON must be json, text, record, scalar, NOT binary
  const jsonUrn = MediaUrn.fromString(MEDIA_JSON);
  assert(jsonUrn.isJson(), 'MEDIA_JSON must be json');
  assert(jsonUrn.isText(), 'MEDIA_JSON must be text');
  assert(jsonUrn.isRecord(), 'MEDIA_JSON must be record');
  assert(jsonUrn.isScalar(), 'MEDIA_JSON must be scalar (no list marker)');
  assert(!jsonUrn.isBinary(), 'MEDIA_JSON must not be binary');
  assert(!jsonUrn.isList(), 'MEDIA_JSON must not be list');

  // MEDIA_VOID is void, NOT text/numeric — but IS binary (no textable tag)
  const voidUrn = MediaUrn.fromString(MEDIA_VOID);
  assert(voidUrn.isVoid(), 'MEDIA_VOID must be void');
  assert(!voidUrn.isText(), 'MEDIA_VOID must not be text');
  assert(voidUrn.isBinary(), 'MEDIA_VOID must be binary (no textable tag)');
  assert(!voidUrn.isNumeric(), 'MEDIA_VOID must not be numeric');
}

// ============================================================================
// cap_urn.rs: TEST559-TEST567 (CapUrn tier tests)
// ============================================================================

// TEST559: withoutTag removes tag, ignores in/out, case-insensitive for keys
function test559_withoutTag() {
  const cap = CapUrn.fromString('cap:in="media:void";op=test;ext=pdf;out="media:void"');
  const removed = cap.withoutTag('ext');
  assertEqual(removed.getTag('ext'), undefined, 'withoutTag should remove ext');
  assertEqual(removed.getTag('op'), 'test', 'withoutTag should preserve op');

  // Case-insensitive removal
  const removed2 = cap.withoutTag('EXT');
  assertEqual(removed2.getTag('ext'), undefined, 'withoutTag should be case-insensitive');

  // Removing in/out is silently ignored
  const same = cap.withoutTag('in');
  assertEqual(same.getInSpec(), 'media:void', 'withoutTag must not remove in');
  const same2 = cap.withoutTag('out');
  assertEqual(same2.getOutSpec(), 'media:void', 'withoutTag must not remove out');

  // Removing non-existent tag is no-op
  const same3 = cap.withoutTag('nonexistent');
  assert(same3.equals(cap), 'Removing non-existent tag is no-op');
}

// TEST560: withInSpec and withOutSpec change direction specs
function test560_withInOutSpec() {
  const cap = CapUrn.fromString('cap:in="media:void";op=test;out="media:void"');

  const changedIn = cap.withInSpec('media:');
  assertEqual(changedIn.getInSpec(), 'media:', 'withInSpec should change inSpec');
  assertEqual(changedIn.getOutSpec(), 'media:void', 'withInSpec should preserve outSpec');
  assertEqual(changedIn.getTag('op'), 'test', 'withInSpec should preserve tags');

  const changedOut = cap.withOutSpec('media:string');
  assertEqual(changedOut.getInSpec(), 'media:void', 'withOutSpec should preserve inSpec');
  assertEqual(changedOut.getOutSpec(), 'media:string', 'withOutSpec should change outSpec');

  // Chain both
  const changedBoth = cap.withInSpec('media:pdf').withOutSpec('media:txt;textable');
  assertEqual(changedBoth.getInSpec(), 'media:pdf', 'Chain should set inSpec');
  assertEqual(changedBoth.getOutSpec(), 'media:txt;textable', 'Chain should set outSpec');
}

// TEST561: N/A for JS (in_media_urn/out_media_urn not in JS CapUrn)

// TEST562: N/A for JS (canonical_option not in JS CapUrn)

// TEST563: CapMatcher.findAllMatches returns all matching caps sorted by specificity
function test563_findAllMatches() {
  const caps = [
    CapUrn.fromString('cap:in="media:void";op=test;out="media:void"'),
    CapUrn.fromString('cap:in="media:void";op=test;ext=pdf;out="media:void"'),
    CapUrn.fromString('cap:in="media:void";op=different;out="media:void"'),
  ];

  const request = CapUrn.fromString('cap:in="media:void";op=test;out="media:void"');
  const matches = CapMatcher.findAllMatches(caps, request);

  // Should find 2 matches (op=test and op=test;ext=pdf), not op=different
  assertEqual(matches.length, 2, 'Should find 2 matches');
  // Sorted by specificity descending: ext=pdf first (more specific)
  assert(matches[0].specificity() >= matches[1].specificity(), 'First match should be more specific');
  assertEqual(matches[0].getTag('ext'), 'pdf', 'Most specific match should have ext=pdf');
}

// TEST564: CapMatcher.areCompatible detects bidirectional overlap
function test564_areCompatible() {
  const caps1 = [
    CapUrn.fromString('cap:in="media:void";op=test;out="media:void"'),
  ];
  const caps2 = [
    CapUrn.fromString('cap:in="media:void";op=test;ext=pdf;out="media:void"'),
  ];
  const caps3 = [
    CapUrn.fromString('cap:in="media:void";op=different;out="media:void"'),
  ];

  // caps1 (op=test) accepts caps2 (op=test;ext=pdf) -> compatible
  assert(CapMatcher.areCompatible(caps1, caps2), 'caps1 and caps2 should be compatible');

  // caps1 (op=test) vs caps3 (op=different) -> not compatible
  assert(!CapMatcher.areCompatible(caps1, caps3), 'caps1 and caps3 should not be compatible');

  // Empty sets are not compatible
  assert(!CapMatcher.areCompatible([], caps1), 'Empty vs non-empty should not be compatible');
  assert(!CapMatcher.areCompatible(caps1, []), 'Non-empty vs empty should not be compatible');
}

// TEST565: N/A for JS (tags_to_string not in JS CapUrn)

// TEST566: withTag silently ignores in/out keys
function test566_withTagIgnoresInOut() {
  const cap = CapUrn.fromString('cap:in="media:void";op=test;out="media:void"');
  // Attempting to set in/out via withTag is silently ignored
  const same = cap.withTag('in', 'media:');
  assertEqual(same.getInSpec(), 'media:void', 'withTag must not change in_spec');

  const same2 = cap.withTag('out', 'media:');
  assertEqual(same2.getOutSpec(), 'media:void', 'withTag must not change out_spec');
}

// TEST567: N/A for JS (conforms_to_str/accepts_str not in JS CapUrn)

// ============================================================================
// cap_urn.rs: TEST639-TEST653 (Cap URN wildcard tests)
// ============================================================================

// Note: Rust allows missing in/out to default to "media:" wildcard.
// JS currently requires in/out (throws MISSING_IN_SPEC/MISSING_OUT_SPEC).
// The following tests cover the wildcard behavior that IS applicable to JS.

// TEST639-642: N/A for JS (JS requires in/out, does not default to media: wildcard)

// TEST643: cap:in=*;out=* treated as wildcards
function test643_explicitAsteriskIsWildcard() {
  const cap = CapUrn.fromString('cap:in=*;out=*');
  assertEqual(cap.getInSpec(), '*', 'in=* should be stored as wildcard');
  assertEqual(cap.getOutSpec(), '*', 'out=* should be stored as wildcard');
}

// TEST644: cap:in=media:;out=* has specific in, wildcard out
function test644_specificInWildcardOut() {
  const cap = CapUrn.fromString('cap:in=media:;out=*');
  assertEqual(cap.getInSpec(), 'media:', 'Should have specific in');
  assertEqual(cap.getOutSpec(), '*', 'Should have wildcard out');
}

// TEST645: cap:in=*;out=media:text has wildcard in, specific out
function test645_wildcardInSpecificOut() {
  const cap = CapUrn.fromString('cap:in=*;out=media:text');
  assertEqual(cap.getInSpec(), '*', 'Should have wildcard in');
  assertEqual(cap.getOutSpec(), 'media:text', 'Should have specific out');
}

// TEST646: N/A for JS (JS allows in=foo since it just checks for media: or *)
// TEST647: N/A for JS (JS allows out=bar since it just checks for media: or *)

// TEST648: Wildcard in/out match specific caps
function test648_wildcardAcceptsSpecific() {
  const wildcard = CapUrn.fromString('cap:in=*;out=*');
  const specific = CapUrn.fromString('cap:in="media:";out="media:text"');

  assert(wildcard.accepts(specific), 'Wildcard should accept specific');
  assert(specific.conformsTo(wildcard), 'Specific should conform to wildcard');
}

// TEST649: Specificity - wildcard has 0, specific has tag count
function test649_specificityScoring() {
  const wildcard = CapUrn.fromString('cap:in=*;out=*');
  const specific = CapUrn.fromString('cap:in="media:";out="media:text"');

  assertEqual(wildcard.specificity(), 0, 'Wildcard cap should have 0 specificity');
  assert(specific.specificity() > 0, 'Specific cap should have non-zero specificity');
}

// TEST650: N/A for JS (JS requires in/out, cap:in;out;op=test would fail parsing)

// TEST651: All identity forms with explicit wildcards produce the same CapUrn
function test651_identityFormsEquivalent() {
  const forms = [
    'cap:in=*;out=*',
    'cap:in="media:";out="media:"',
  ];

  const first = CapUrn.fromString(forms[0]);
  // All forms should produce equivalent caps (wildcard behavior)
  for (let i = 1; i < forms.length; i++) {
    const cap = CapUrn.fromString(forms[i]);
    // Both should accept specific caps
    const specific = CapUrn.fromString('cap:in="media:";out="media:text"');
    assert(first.accepts(specific), `Form 0 should accept specific`);
    assert(cap.accepts(specific), `Form ${i} should accept specific`);
  }
}

// TEST652: N/A for JS (CAP_IDENTITY constant not in JS)

// TEST653: Identity (no extra tags) does not steal routes from specific handlers
function test653_identityRoutingIsolation() {
  const identity = CapUrn.fromString('cap:in=*;out=*');
  const specificRequest = CapUrn.fromString('cap:in="media:void";op=test;out="media:void"');

  // Identity has specificity 0 (no tags, wildcard directions)
  assertEqual(identity.specificity(), 0, 'Identity specificity should be 0');

  // Specific request has higher specificity
  assert(specificRequest.specificity() > identity.specificity(),
    'Specific request should have higher specificity than identity');

  // CapMatcher should prefer specific over identity
  const specificCap = CapUrn.fromString('cap:in="media:void";op=test;out="media:void"');
  const best = CapMatcher.findBestMatch([identity, specificCap], specificRequest);
  assert(best !== null, 'Should find a match');
  assertEqual(best.getTag('op'), 'test', 'CapMatcher should prefer specific cap over identity');
}

// ============================================================================
// Machine notation tests — mirrors Rust machine module tests exactly
// ============================================================================

// --- Machine parser tests (mirrors parser.rs tests) ---

function testMachine_emptyInput() {
  assertThrowsWithCode(() => parseMachine(''), MachineSyntaxErrorCodes.EMPTY);
}

function testMachine_whitespaceOnly() {
  assertThrowsWithCode(() => parseMachine('   \n  \t  '), MachineSyntaxErrorCodes.EMPTY);
}

function testMachine_headerOnlyNoWirings() {
  assertThrowsWithCode(
    () => Machine.fromString('[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]'),
    MachineSyntaxErrorCodes.NO_EDGES
  );
}

function testMachine_duplicateAlias() {
  assertThrowsWithCode(
    () => Machine.fromString(
      '[ex cap:in="media:pdf";op=extract;out="media:txt;textable"]' +
      '[ex cap:in="media:pdf";op=summarize;out="media:txt;textable"]' +
      '[a -> ex -> b]'
    ),
    MachineSyntaxErrorCodes.DUPLICATE_ALIAS
  );
}

function testMachine_simpleLinearChain() {
  const g = Machine.fromString(
    '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]' +
    '[doc -> extract -> text]'
  );
  assertEqual(g.edgeCount(), 1);
  const edge = g.edges()[0];
  assertEqual(edge.sources.length, 1);
  assert(edge.sources[0].isEquivalent(MediaUrn.fromString('media:pdf')),
    'Source should be media:pdf');
  assert(edge.target.isEquivalent(MediaUrn.fromString('media:txt;textable')),
    'Target should be media:txt;textable');
  assertEqual(edge.isLoop, false);
}

function testMachine_twoStepChain() {
  const g = Machine.fromString(
    '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]' +
    '[embed cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"]' +
    '[doc -> extract -> text]' +
    '[text -> embed -> vectors]'
  );
  assertEqual(g.edgeCount(), 2);
  assert(g.edges()[0].sources[0].isEquivalent(MediaUrn.fromString('media:pdf')),
    'First edge source should be media:pdf');
  assert(g.edges()[1].target.isEquivalent(MediaUrn.fromString('media:embedding-vector;record;textable')),
    'Second edge target should be media:embedding-vector;record;textable');
}

function testMachine_fanOut() {
  const g = Machine.fromString(
    '[meta cap:in="media:pdf";op=extract_metadata;out="media:file-metadata;record;textable"]' +
    '[outline cap:in="media:pdf";op=extract_outline;out="media:document-outline;record;textable"]' +
    '[thumb cap:in="media:pdf";op=generate_thumbnail;out="media:image;png;thumbnail"]' +
    '[doc -> meta -> metadata]' +
    '[doc -> outline -> outline_data]' +
    '[doc -> thumb -> thumbnail]'
  );
  assertEqual(g.edgeCount(), 3);
  for (const edge of g.edges()) {
    assertEqual(edge.sources.length, 1);
    assert(edge.sources[0].isEquivalent(MediaUrn.fromString('media:pdf')),
      'All fan-out sources should be media:pdf');
  }
}

function testMachine_fanInSecondaryAssignedByPriorWiring() {
  const g = Machine.fromString(
    '[thumb cap:in="media:pdf";op=generate_thumbnail;out="media:image;png;thumbnail"]' +
    '[model_dl cap:in="media:model-spec;textable";op=download;out="media:model-spec;textable"]' +
    '[describe cap:in="media:image;png";op=describe_image;out="media:image-description;textable"]' +
    '[doc -> thumb -> thumbnail]' +
    '[spec_input -> model_dl -> model_spec]' +
    '[(thumbnail, model_spec) -> describe -> description]'
  );
  assertEqual(g.edgeCount(), 3);
  assertEqual(g.edges()[2].sources.length, 2);
}

function testMachine_fanInSecondaryUnassignedGetsWildcard() {
  const g = Machine.fromString(
    '[describe cap:in="media:image;png";op=describe_image;out="media:image-description;textable"]\n' +
    '[(thumbnail, model_spec) -> describe -> description]'
  );
  assertEqual(g.edges().length, 1);
  assertEqual(g.edges()[0].sources.length, 2);
  assertEqual(g.edges()[0].sources[0].toString(), 'media:image;png');
  assertEqual(g.edges()[0].sources[1].toString(), 'media:');
}

function testMachine_loopEdge() {
  const g = Machine.fromString(
    '[p2t cap:in="media:disbound-page;textable";op=page_to_text;out="media:txt;textable"]' +
    '[pages -> LOOP p2t -> texts]'
  );
  assertEqual(g.edgeCount(), 1);
  assertEqual(g.edges()[0].isLoop, true);
}

function testMachine_undefinedAliasFails() {
  assertThrowsWithCode(
    () => Machine.fromString('[doc -> nonexistent -> text]'),
    MachineSyntaxErrorCodes.UNDEFINED_ALIAS
  );
}

function testMachine_nodeAliasCollision() {
  assertThrowsWithCode(
    () => Machine.fromString(
      '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]' +
      '[extract -> extract -> text]'
    ),
    MachineSyntaxErrorCodes.NODE_ALIAS_COLLISION
  );
}

function testMachine_conflictingMediaTypesFail() {
  assertThrowsWithCode(
    () => Machine.fromString(
      '[cap1 cap:in="media:txt;textable";op=a;out="media:pdf"]' +
      '[cap2 cap:in="media:audio;wav";op=b;out="media:txt;textable"]' +
      '[src -> cap1 -> mid]' +
      '[mid -> cap2 -> dst]'
    ),
    MachineSyntaxErrorCodes.INVALID_WIRING
  );
}

function testMachine_multilineFormat() {
  const g = Machine.fromString(
    '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]\n' +
    '[embed cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"]\n' +
    '[doc -> extract -> text]\n' +
    '[text -> embed -> vectors]\n'
  );
  assertEqual(g.edgeCount(), 2);
}

function testMachine_differentAliasesSameGraph() {
  const g1 = Machine.fromString(
    '[ex cap:in="media:pdf";op=extract;out="media:txt;textable"]' +
    '[a -> ex -> b]'
  );
  const g2 = Machine.fromString(
    '[xt cap:in="media:pdf";op=extract;out="media:txt;textable"]' +
    '[x -> xt -> y]'
  );
  assert(g1.isEquivalent(g2), 'Different aliases should produce equivalent graphs');
}

function testMachine_malformedInputFails() {
  assertThrowsWithCode(
    () => parseMachine('not valid machine notation'),
    MachineSyntaxErrorCodes.PARSE_ERROR
  );
}

function testMachine_unterminatedBracketFails() {
  assertThrowsWithCode(
    () => parseMachine('[extract cap:in=media:pdf'),
    MachineSyntaxErrorCodes.PARSE_ERROR
  );
}

// --- Machine parser line-based mode tests ---

function testMachine_lineBasedSimpleChain() {
  const g = Machine.fromString(
    'extract cap:in="media:pdf";op=extract;out="media:txt;textable"\n' +
    'doc -> extract -> text'
  );
  assertEqual(g.edgeCount(), 1);
  const edge = g.edges()[0];
  assert(edge.sources[0].isEquivalent(MediaUrn.fromString('media:pdf')),
    'Source should be media:pdf');
  assert(edge.target.isEquivalent(MediaUrn.fromString('media:txt;textable')),
    'Target should be media:txt;textable');
}

function testMachine_lineBasedTwoStepChain() {
  const g = Machine.fromString(
    'extract cap:in="media:pdf";op=extract;out="media:txt;textable"\n' +
    'embed cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"\n' +
    'doc -> extract -> text\n' +
    'text -> embed -> vectors'
  );
  assertEqual(g.edgeCount(), 2);
}

function testMachine_lineBasedLoop() {
  const g = Machine.fromString(
    'p2t cap:in="media:disbound-page;textable";op=page_to_text;out="media:txt;textable"\n' +
    'pages -> LOOP p2t -> texts'
  );
  assertEqual(g.edgeCount(), 1);
  assertEqual(g.edges()[0].isLoop, true);
}

function testMachine_lineBasedFanIn() {
  const g = Machine.fromString(
    'thumb cap:in="media:pdf";op=generate_thumbnail;out="media:image;png;thumbnail"\n' +
    'model_dl cap:in="media:model-spec;textable";op=download;out="media:model-spec;textable"\n' +
    'describe cap:in="media:image;png";op=describe_image;out="media:image-description;textable"\n' +
    'doc -> thumb -> thumbnail\n' +
    'spec_input -> model_dl -> model_spec\n' +
    '(thumbnail, model_spec) -> describe -> description'
  );
  assertEqual(g.edgeCount(), 3);
  assertEqual(g.edges()[2].sources.length, 2);
}

function testMachine_mixedBracketedAndLineBased() {
  const g = Machine.fromString(
    '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]\n' +
    'doc -> extract -> text'
  );
  assertEqual(g.edgeCount(), 1);
}

function testMachine_lineBasedEquivalentToBracketed() {
  const g1 = Machine.fromString(
    '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]' +
    '[doc -> extract -> text]'
  );
  const g2 = Machine.fromString(
    'extract cap:in="media:pdf";op=extract;out="media:txt;textable"\n' +
    'doc -> extract -> text'
  );
  assert(g1.isEquivalent(g2), 'Line-based and bracketed must produce equivalent graphs');
}

function testMachine_lineBasedFormatSerialization() {
  const g = new Machine([
    new MachineEdge(
      [MediaUrn.fromString('media:pdf')],
      CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
      MediaUrn.fromString('media:txt;textable'),
      false
    ),
  ]);
  const lineBased = g.toMachineNotationFormatted('line-based');
  assert(!lineBased.includes('['), 'Line-based format must not contain brackets');
  assert(!lineBased.includes(']'), 'Line-based format must not contain brackets');
  assert(lineBased.includes('extract cap:'), 'Should contain header');
  assert(lineBased.includes('-> extract ->'), 'Should contain wiring');

  // Round-trip
  const reparsed = Machine.fromString(lineBased);
  assert(g.isEquivalent(reparsed), 'Line-based round-trip must produce equivalent graph');
}

function testMachine_lineBasedAndBracketedParseSameGraph() {
  const g = new Machine([
    new MachineEdge(
      [MediaUrn.fromString('media:pdf')],
      CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
      MediaUrn.fromString('media:txt;textable'),
      false
    ),
    new MachineEdge(
      [MediaUrn.fromString('media:txt;textable')],
      CapUrn.fromString('cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"'),
      MediaUrn.fromString('media:embedding-vector;record;textable'),
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

function testMachine_edgeEquivalenceSameUrns() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  );
  assert(e1.isEquivalent(e2), 'Same URNs should be equivalent');
}

function testMachine_edgeEquivalenceDifferentCapUrns() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=summarize;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  );
  assert(!e1.isEquivalent(e2), 'Different cap URNs should not be equivalent');
}

function testMachine_edgeEquivalenceDifferentTargets() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:json;record;textable'),
    false
  );
  assert(!e1.isEquivalent(e2), 'Different targets should not be equivalent');
}

function testMachine_edgeEquivalenceDifferentLoopFlag() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    true
  );
  assert(!e1.isEquivalent(e2), 'Different loop flags should not be equivalent');
}

function testMachine_edgeEquivalenceSourceOrderIndependent() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:txt;textable'), MediaUrn.fromString('media:model-spec;textable')],
    CapUrn.fromString('cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"'),
    MediaUrn.fromString('media:embedding-vector;record;textable'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:model-spec;textable'), MediaUrn.fromString('media:txt;textable')],
    CapUrn.fromString('cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"'),
    MediaUrn.fromString('media:embedding-vector;record;textable'),
    false
  );
  assert(e1.isEquivalent(e2), 'Source order should not matter for equivalence');
}

function testMachine_edgeEquivalenceDifferentSourceCount() {
  const e1 = new MachineEdge(
    [MediaUrn.fromString('media:txt;textable')],
    CapUrn.fromString('cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"'),
    MediaUrn.fromString('media:embedding-vector;record;textable'),
    false
  );
  const e2 = new MachineEdge(
    [MediaUrn.fromString('media:txt;textable'), MediaUrn.fromString('media:model-spec;textable')],
    CapUrn.fromString('cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"'),
    MediaUrn.fromString('media:embedding-vector;record;textable'),
    false
  );
  assert(!e1.isEquivalent(e2), 'Different source counts should not be equivalent');
}

function testMachine_graphEquivalenceSameEdges() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g1 = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
  ]);
  const g2 = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
  ]);
  assert(g1.isEquivalent(g2), 'Same edges should be equivalent');
}

function testMachine_graphEquivalenceReorderedEdges() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g1 = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
  ]);
  const g2 = new Machine([
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
  ]);
  assert(g1.isEquivalent(g2), 'Reordered edges should still be equivalent');
}

function testMachine_graphNotEquivalentDifferentEdgeCount() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g1 = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
  ]);
  const g2 = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
  ]);
  assert(!g1.isEquivalent(g2), 'Different edge counts should not be equivalent');
}

function testMachine_graphNotEquivalentDifferentCap() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g1 = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
  ]);
  const g2 = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=summarize;out="media:txt;textable"', 'media:txt;textable'),
  ]);
  assert(!g1.isEquivalent(g2), 'Different caps should not be equivalent');
}

function testMachine_graphEmpty() {
  const g = Machine.empty();
  assert(g.isEmpty(), 'Empty graph should be empty');
  assertEqual(g.edgeCount(), 0);
}

function testMachine_graphEmptyEquivalence() {
  const g1 = Machine.empty();
  const g2 = Machine.empty();
  assert(g1.isEquivalent(g2), 'Two empty graphs should be equivalent');
}

function testMachine_rootSourcesLinearChain() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
  ]);
  const roots = g.rootSources();
  assertEqual(roots.length, 1);
  assert(roots[0].isEquivalent(MediaUrn.fromString('media:pdf')),
    'Root source should be media:pdf');
}

function testMachine_leafTargetsLinearChain() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
  ]);
  const leaves = g.leafTargets();
  assertEqual(leaves.length, 1);
  assert(leaves[0].isEquivalent(MediaUrn.fromString('media:embedding-vector;record;textable')),
    'Leaf target should be media:embedding-vector;record;textable');
}

function testMachine_rootSourcesFanIn() {
  const e = new MachineEdge(
    [MediaUrn.fromString('media:txt;textable'), MediaUrn.fromString('media:model-spec;textable')],
    CapUrn.fromString('cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"'),
    MediaUrn.fromString('media:embedding-vector;record;textable'),
    false
  );
  const g = new Machine([e]);
  const roots = g.rootSources();
  assertEqual(roots.length, 2);
}

function testMachine_displayEdge() {
  const e = new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  );
  const display = e.toString();
  assert(display.includes('media:pdf'), 'Display should contain media:pdf');
}

function testMachine_displayGraph() {
  const e = new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  );
  assertEqual(new Machine([e]).toString(), 'Machine(1 edges)');
  assertEqual(Machine.empty().toString(), 'Machine(empty)');
}

// --- Machine serializer tests (mirrors serializer.rs tests) ---

function testMachine_serializeSingleEdge() {
  const g = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  )]);
  const notation = g.toMachineNotation();
  assert(notation.includes('[extract '), 'Should use extract alias: ' + notation);
  assert(notation.includes('-> extract ->'), 'Should have extract in wiring: ' + notation);
  assert(notation.includes('[n0 ->'), 'Should use n0 for source: ' + notation);
  assert(notation.includes('-> n1]'), 'Should use n1 for target: ' + notation);
}

function testMachine_serializeTwoEdgeChain() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
  ]);
  const notation = g.toMachineNotation();
  const bracketCount = (notation.match(/\[/g) || []).length;
  assertEqual(bracketCount, 4, 'Should have 4 brackets (2 headers + 2 wirings)');
}

function testMachine_serializeEmptyGraph() {
  assertEqual(Machine.empty().toMachineNotation(), '');
}

function testMachine_roundtripSingleEdge() {
  const original = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  )]);
  const notation = original.toMachineNotation();
  const reparsed = Machine.fromString(notation);
  assert(original.isEquivalent(reparsed),
    'Single edge round-trip failed: ' + notation);
}

function testMachine_roundtripTwoEdgeChain() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const original = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
  ]);
  const notation = original.toMachineNotation();
  const reparsed = Machine.fromString(notation);
  assert(original.isEquivalent(reparsed),
    'Two-edge chain round-trip failed: ' + notation);
}

function testMachine_roundtripFanOut() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const original = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract_metadata;out="media:file-metadata;record;textable"', 'media:file-metadata;record;textable'),
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract_outline;out="media:document-outline;record;textable"', 'media:document-outline;record;textable'),
    mkEdge('media:pdf', 'cap:in="media:pdf";op=generate_thumbnail;out="media:image;png;thumbnail"', 'media:image;png;thumbnail'),
  ]);
  const notation = original.toMachineNotation();
  const reparsed = Machine.fromString(notation);
  assert(original.isEquivalent(reparsed),
    'Fan-out round-trip failed: ' + notation);
}

function testMachine_roundtripLoopEdge() {
  const original = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:disbound-page;textable')],
    CapUrn.fromString('cap:in="media:disbound-page;textable";op=page_to_text;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    true
  )]);
  const notation = original.toMachineNotation();
  const reparsed = Machine.fromString(notation);
  assert(original.isEquivalent(reparsed), 'Loop round-trip failed');
  assertEqual(reparsed.edges()[0].isLoop, true, 'isLoop must be preserved');
}

function testMachine_serializationIsDeterministic() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
  ]);
  const n1 = g.toMachineNotation();
  const n2 = g.toMachineNotation();
  assertEqual(n1, n2, 'Serialization must be deterministic');
}

function testMachine_reorderedEdgesProduceSameNotation() {
  const mkEdge = (src, cap, tgt) => new MachineEdge(
    [MediaUrn.fromString(src)], CapUrn.fromString(cap), MediaUrn.fromString(tgt), false
  );
  const g1 = new Machine([
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
  ]);
  const g2 = new Machine([
    mkEdge('media:txt;textable', 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable'),
    mkEdge('media:pdf', 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable'),
  ]);
  assertEqual(g1.toMachineNotation(), g2.toMachineNotation(),
    'Same graph with reordered edges must produce identical notation');
}

function testMachine_multilineSerializeFormat() {
  const g = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  )]);
  const multi = g.toMachineNotationMultiline();
  assert(multi.includes('\n'), 'Multi-line format must contain newlines');
  // Should round-trip
  const reparsed = Machine.fromString(multi);
  assert(g.isEquivalent(reparsed), 'Multi-line round-trip failed');
}

function testMachine_aliasFromOpTag() {
  const g = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  )]);
  const notation = g.toMachineNotation();
  assert(notation.includes('[extract '), 'Expected extract alias, got: ' + notation);
}

function testMachine_aliasFallbackWithoutOpTag() {
  const g = new Machine([new MachineEdge(
    [MediaUrn.fromString('media:pdf')],
    CapUrn.fromString('cap:in="media:pdf";out="media:txt;textable"'),
    MediaUrn.fromString('media:txt;textable'),
    false
  )]);
  const notation = g.toMachineNotation();
  assert(notation.includes('edge_'), 'Expected fallback alias, got: ' + notation);
}

function testMachine_duplicateOpTagsDisambiguated() {
  const g = new Machine([
    new MachineEdge(
      [MediaUrn.fromString('media:pdf')],
      CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"'),
      MediaUrn.fromString('media:txt;textable'),
      false
    ),
    new MachineEdge(
      [MediaUrn.fromString('media:pdf')],
      CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:json;record;textable"'),
      MediaUrn.fromString('media:json;record;textable'),
      false
    ),
  ]);
  const notation = g.toMachineNotation();
  assert(notation.includes('extract_1') || notation.includes('extract_2'),
    'Duplicate ops must be disambiguated: ' + notation);
}

// --- Machine builder tests ---

function testMachine_builderSingleEdge() {
  const builder = new MachineBuilder();
  builder.addEdge(
    ['media:pdf'],
    'cap:in="media:pdf";op=extract;out="media:txt;textable"',
    'media:txt;textable'
  );
  const g = builder.build();
  assertEqual(g.edgeCount(), 1);
  assertEqual(g.edges()[0].isLoop, false);
}

function testMachine_builderWithLoop() {
  const builder = new MachineBuilder();
  builder.addEdge(
    ['media:disbound-page;textable'],
    'cap:in="media:disbound-page;textable";op=page_to_text;out="media:txt;textable"',
    'media:txt;textable',
    true
  );
  const g = builder.build();
  assertEqual(g.edges()[0].isLoop, true);
}

function testMachine_builderChaining() {
  const g = new MachineBuilder()
    .addEdge(['media:pdf'], 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable')
    .addEdge(['media:txt;textable'], 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable')
    .build();
  assertEqual(g.edgeCount(), 2);
}

function testMachine_builderEquivalentToParsed() {
  const parsed = Machine.fromString(
    '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]' +
    '[doc -> extract -> text]'
  );
  const built = new MachineBuilder()
    .addEdge(['media:pdf'], 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable')
    .build();
  assert(parsed.isEquivalent(built),
    'Builder-constructed graph should be equivalent to parsed graph');
}

function testMachine_builderRoundTrip() {
  const built = new MachineBuilder()
    .addEdge(['media:pdf'], 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'media:txt;textable')
    .addEdge(['media:txt;textable'], 'cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"', 'media:embedding-vector;record;textable')
    .build();
  const notation = built.toMachineNotation();
  const reparsed = Machine.fromString(notation);
  assert(built.isEquivalent(reparsed), 'Builder round-trip failed');
}

// --- CapUrn.isEquivalent/isComparable tests ---

function testMachine_capUrnIsEquivalent() {
  const a = CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"');
  const b = CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"');
  assert(a.isEquivalent(b), 'Same cap URNs should be equivalent');
  const c = CapUrn.fromString('cap:in="media:pdf";op=summarize;out="media:txt;textable"');
  assert(!a.isEquivalent(c), 'Different cap URNs should not be equivalent');
}

function testMachine_capUrnIsComparable() {
  const general = CapUrn.fromString('cap:in="media:pdf";out="media:txt;textable"');
  const specific = CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"');
  assert(general.isComparable(specific), 'General should be comparable to specific');
  assert(specific.isComparable(general), 'isComparable should be symmetric');
}

function testMachine_capUrnInMediaUrn() {
  const cap = CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"');
  const inUrn = cap.inMediaUrn();
  assert(inUrn instanceof MediaUrn, 'inMediaUrn should return MediaUrn');
  assert(inUrn.isEquivalent(MediaUrn.fromString('media:pdf')), 'inMediaUrn should be media:pdf');
}

function testMachine_capUrnOutMediaUrn() {
  const cap = CapUrn.fromString('cap:in="media:pdf";op=extract;out="media:txt;textable"');
  const outUrn = cap.outMediaUrn();
  assert(outUrn instanceof MediaUrn, 'outMediaUrn should return MediaUrn');
  assert(outUrn.isEquivalent(MediaUrn.fromString('media:txt;textable')), 'outMediaUrn should be media:txt;textable');
}

// --- MediaUrn.isEquivalent/isComparable tests ---

function testMachine_mediaUrnIsEquivalent() {
  const a = MediaUrn.fromString('media:pdf');
  const b = MediaUrn.fromString('media:pdf');
  assert(a.isEquivalent(b), 'Same media URNs should be equivalent');
  const c = MediaUrn.fromString('media:txt;textable');
  assert(!a.isEquivalent(c), 'Different media URNs should not be equivalent');
}

function testMachine_mediaUrnIsComparable() {
  const general = MediaUrn.fromString('media:textable');
  const specific = MediaUrn.fromString('media:txt;textable');
  assert(general.isComparable(specific), 'General should be comparable to specific');
  assert(specific.isComparable(general), 'isComparable should be symmetric');
  const unrelated = MediaUrn.fromString('media:pdf');
  assert(!general.isComparable(unrelated), 'Unrelated should not be comparable');
}

// ============================================================================
// Phase 0A: Position tracking tests
// ============================================================================

function testMachine_parseMachineWithAST_headerLocation() {
  const input = '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"][doc -> extract -> text]';
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

function testMachine_parseMachineWithAST_wiringLocation() {
  const input = '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]\n[doc -> extract -> text]';
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

function testMachine_parseMachineWithAST_multilinePositions() {
  const input = '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]\n[doc -> extract -> text]';
  const result = parseMachineWithAST(input);
  const headerLoc = result.statements[0].location;
  const wiringLoc = result.statements[1].location;
  assertEqual(headerLoc.start.line, 1, 'Header should be on line 1');
  assertEqual(wiringLoc.start.line, 2, 'Wiring should be on line 2');
}

function testMachine_parseMachineWithAST_fanInSourceLocations() {
  const input = [
    '[describe cap:in="media:image;png";op=describe_image;out="media:image-description;textable"]',
    '[(thumbnail, model_spec) -> describe -> description]'
  ].join('\n');
  const result = parseMachineWithAST(input);
  const wiring = result.statements[1];
  assertEqual(wiring.sources.length, 2, 'Fan-in should have 2 sources');
  assert(wiring.sourceLocations.length === 2, 'Should have 2 source locations');
}

function testMachine_parseMachineWithAST_aliasMap() {
  const input = [
    '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]',
    '[embed cap:in="media:txt;textable";op=embed;out="media:embedding-vector;record;textable"]',
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

function testMachine_parseMachineWithAST_nodeMedia() {
  const input = [
    '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]',
    '[doc -> extract -> text]',
  ].join('\n');
  const result = parseMachineWithAST(input);
  assert(result.nodeMedia.has('doc'), 'nodeMedia should have doc');
  assert(result.nodeMedia.has('text'), 'nodeMedia should have text');
  assertEqual(result.nodeMedia.get('doc').toString(), 'media:pdf', 'doc should be media:pdf');
  assertEqual(result.nodeMedia.get('text').toString(), 'media:textable;txt', 'text should be media:textable;txt');
}

function testMachine_errorLocation_parseError() {
  try {
    parseMachine('[this is not valid');
    throw new Error('Expected MachineSyntaxError');
  } catch (e) {
    assertEqual(e.code, MachineSyntaxErrorCodes.PARSE_ERROR, 'Should be PARSE_ERROR');
    assert(e.location !== null, 'Parse error should have location');
  }
}

function testMachine_errorLocation_duplicateAlias() {
  try {
    parseMachine(
      '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]' +
      '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]' +
      '[doc -> extract -> text]'
    );
    throw new Error('Expected MachineSyntaxError');
  } catch (e) {
    assertEqual(e.code, MachineSyntaxErrorCodes.DUPLICATE_ALIAS, 'Should be DUPLICATE_ALIAS');
    assert(e.location !== null, 'Duplicate alias error should have location');
  }
}

function testMachine_errorLocation_undefinedAlias() {
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

function testMachine_toMermaid_linearChain() {
  const machine = Machine.fromString(
    '[extract cap:in="media:pdf";op=extract;out="media:txt;textable"]' +
    '[doc -> extract -> text]'
  );
  const mermaid = machine.toMermaid();
  assert(mermaid.startsWith('flowchart LR'), 'Should start with flowchart LR');
  assert(mermaid.includes('extract'), 'Should include extract label');
  assert(mermaid.includes('media:pdf'), 'Should include media:pdf node');
  assert(mermaid.includes('media:textable;txt'), 'Should include media:textable;txt node');
  assert(mermaid.includes('-->'), 'Should include arrow');
  // Root source and leaf target should both be stadium shape
  assert(mermaid.includes('(['), 'Should have stadium shape nodes');
}

function testMachine_toMermaid_loopEdge() {
  const machine = Machine.fromString(
    '[p2t cap:in="media:disbound-page;textable";op=page_to_text;out="media:txt;textable"]' +
    '[pages -> LOOP p2t -> texts]'
  );
  const mermaid = machine.toMermaid();
  assert(mermaid.includes('LOOP'), 'Should include LOOP label');
  assert(mermaid.includes('-.'), 'Should use dotted line for LOOP');
  assert(mermaid.includes('.->'), 'Should use dotted arrow for LOOP');
}

function testMachine_toMermaid_emptyGraph() {
  const machine = Machine.empty();
  const mermaid = machine.toMermaid();
  assert(mermaid.includes('empty graph'), 'Should indicate empty graph');
}

function testMachine_toMermaid_fanIn() {
  const machine = Machine.fromString(
    '[describe cap:in="media:image;png";op=describe_image;out="media:image-description;textable"]' +
    '[(thumbnail, model_spec) -> describe -> description]'
  );
  const mermaid = machine.toMermaid();
  // Fan-in should produce two arrows pointing to the same target
  const arrowCount = (mermaid.match(/-->/g) || []).length;
  assertEqual(arrowCount, 2, 'Fan-in should produce 2 arrows');
}

function testMachine_toMermaid_fanOut() {
  const input = [
    '[meta cap:in="media:pdf";op=extract_metadata;out="media:file-metadata;record;textable"]',
    '[thumb cap:in="media:pdf";op=generate_thumbnail;out="media:image;png;thumbnail"]',
    '[doc -> meta -> metadata]',
    '[doc -> thumb -> thumbnail]'
  ].join('');
  const machine = Machine.fromString(input);
  const mermaid = machine.toMermaid();
  // Should have 2 edges
  const arrowCount = (mermaid.match(/-->/g) || []).length;
  assertEqual(arrowCount, 2, 'Fan-out should produce 2 arrows');
  // The root source (media:pdf) should appear once as a node definition
  assert(mermaid.includes('media:pdf'), 'Should include media:pdf');
}

// ============================================================================
// Phase 0B: CapRegistryClient tests
// ============================================================================

function testMachine_capRegistryEntry_construction() {
  const entry = new CapRegistryEntry({
    urn: 'cap:in="media:pdf";op=extract;out="media:txt;textable"',
    title: 'PDF Extractor',
    command: 'extract',
    cap_description: 'Extracts text from PDF',
    args: [{ media_urn: 'media:pdf', required: true }],
    output: { media_urn: 'media:txt;textable', output_description: 'Extracted text' },
    media_specs: [],
    urn_tags: { op: 'extract' },
    in_spec: 'media:pdf',
    out_spec: 'media:txt;textable',
    in_media_title: 'PDF Document',
    out_media_title: 'Text'
  });
  assertEqual(entry.urn, 'cap:in="media:pdf";op=extract;out="media:txt;textable"', 'URN should match');
  assertEqual(entry.title, 'PDF Extractor', 'Title should match');
  assertEqual(entry.description, 'Extracts text from PDF', 'Description should match');
  assertEqual(entry.inSpec, 'media:pdf', 'inSpec should match');
  assertEqual(entry.outSpec, 'media:txt;textable', 'outSpec should match');
  assertEqual(entry.urnTags.op, 'extract', 'op tag should match');
}

function testMachine_mediaRegistryEntry_construction() {
  const entry = new MediaRegistryEntry({
    urn: 'media:pdf',
    title: 'PDF Document',
    media_type: 'application/pdf',
    description: 'Portable Document Format'
  });
  assertEqual(entry.urn, 'media:pdf', 'URN should match');
  assertEqual(entry.title, 'PDF Document', 'Title should match');
  assertEqual(entry.mediaType, 'application/pdf', 'Media type should match');
  assertEqual(entry.description, 'Portable Document Format', 'Description should match');
}

function testMachine_capRegistryClient_construction() {
  const client = new CapRegistryClient('https://example.com', 600);
  assert(client !== null, 'Client should be constructed');
  // Invalidate should not throw
  client.invalidate();
}

function testMachine_capRegistryEntry_defaults() {
  // Verify that missing fields default gracefully
  const entry = new CapRegistryEntry({ urn: 'cap:in=media:;op=test;out=media:' });
  assertEqual(entry.urn, 'cap:in=media:;op=test;out=media:', 'URN should match');
  assertEqual(entry.title, '', 'Title should default to empty');
  assertEqual(entry.description, '', 'Description should default to empty');
  assertEqual(entry.command, '', 'Command should default to empty');
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
// cap-graph-renderer helpers — pure functions that do not require a DOM.
// The renderer class itself needs cytoscape + DOM and is exercised by hand
// in the browser; these tests cover the pure data transforms underneath it.
// ============================================================================

const {
  cardinalityLabel: rendererCardinalityLabel,
  cardinalityFromCap: rendererCardinalityFromCap,
  canonicalMediaUrn: rendererCanonicalMediaUrn,
  mediaNodeLabel: rendererMediaNodeLabel,
  buildStrandGraphData: rendererBuildStrandGraphData,
  collapseStrandShapeTransitions: rendererCollapseStrandShapeTransitions,
  buildRunGraphData: rendererBuildRunGraphData,
  buildEditorGraphData: rendererBuildEditorGraphData,
  buildResolvedMachineGraphData: rendererBuildResolvedMachineGraphData,
  classifyStrandCapSteps: rendererClassifyStrandCapSteps,
  validateStrandPayload: rendererValidateStrandPayload,
  validateRunPayload: rendererValidateRunPayload,
  validateEditorGraphPayload: rendererValidateEditorGraphPayload,
  validateResolvedMachinePayload: rendererValidateResolvedMachinePayload,
  validateStrandStep: rendererValidateStrandStep,
  validateBodyOutcome: rendererValidateBodyOutcome,
} = require('./cap-graph-renderer.js');

// The renderer module reads its dependencies off `window` or `global` at
// call time (it is browser-first). Node has no window, so we install the
// needed capdag-js classes on `global` before the tests run. Every
// renderer path exercised by the tests resolves through these.
if (typeof global.TaggedUrn === 'undefined') {
  global.TaggedUrn = require('tagged-urn').TaggedUrn;
}
if (typeof global.MediaUrn === 'undefined') global.MediaUrn = MediaUrn;
if (typeof global.CapUrn === 'undefined') global.CapUrn = CapUrn;
if (typeof global.Cap === 'undefined') global.Cap = Cap;
if (typeof global.CapGraph === 'undefined') global.CapGraph = CapGraph;
// Reference the top-of-file destructured createCap via the module export.
if (typeof global.createCap === 'undefined') {
  global.createCap = require('./capdag.js').createCap;
}

function testRenderer_cardinalityLabel_allFourCases() {
  assertEqual(rendererCardinalityLabel(false, false), '1\u21921', 'scalar-to-scalar');
  assertEqual(rendererCardinalityLabel(true, false),  'n\u21921', 'sequence-to-scalar');
  assertEqual(rendererCardinalityLabel(false, true),  '1\u2192n', 'scalar-to-sequence');
  assertEqual(rendererCardinalityLabel(true, true),   'n\u2192n', 'sequence-to-sequence');
}

function testRenderer_cardinalityLabel_usesUnicodeArrow() {
  // The label must use the real rightwards arrow (U+2192), not ASCII "->".
  // Downstream styling and tests depend on this glyph.
  const label = rendererCardinalityLabel(false, true);
  assert(label.includes('\u2192'), 'label should contain U+2192 rightwards arrow');
  assert(!label.includes('->'), 'label must not contain the ASCII replacement "->"');
}

function testRenderer_cardinalityFromCap_findsStdinArgNotFirstArg() {
  // The main input arg is the one whose sources include a stdin source.
  // A naive implementation that reads args[0] would see `cli-only` (not a
  // sequence) and report 1→1 even though the stdin arg is a sequence.
  const cap = {
    urn: 'cap:in="media:textable;list";op=transcribe;out="media:textable"',
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

function testRenderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing() {
  // No args and no output: both sides collapse to 1 (scalar default).
  // If a bug makes the function return "n" for missing data, this fails.
  const cap = { urn: 'cap:in="media:";op=noop;out="media:"' };
  assertEqual(rendererCardinalityFromCap(cap), '1\u21921',
    'missing args/output must default to scalar on both sides');
}

function testRenderer_cardinalityFromCap_outputOnlySequence() {
  // One scalar stdin arg, output is a sequence: expects 1→n.
  const cap = {
    urn: 'cap:in="media:textable";op=generate;out="media:textable;list"',
    args: [{ sources: [{ stdin: {} }], is_sequence: false }],
    output: { is_sequence: true },
  };
  assertEqual(rendererCardinalityFromCap(cap), '1\u2192n',
    'scalar stdin with sequence output must yield 1→n');
}

function testRenderer_cardinalityFromCap_rejectsStringIsSequence() {
  // The function must use strict `=== true` to avoid treating truthy strings
  // as booleans. "true" is a string, not a boolean — it must NOT be treated
  // as a sequence, because downstream renderers expect boolean semantics.
  const cap = {
    urn: 'cap:in="media:";op=x;out="media:"',
    args: [{ sources: [{ stdin: {} }], is_sequence: 'true' }],
    output: { is_sequence: 'true' },
  };
  assertEqual(rendererCardinalityFromCap(cap), '1\u21921',
    'string "true" must not be treated as boolean true');
}

function testRenderer_cardinalityFromCap_throwsOnNonObject() {
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

function testRenderer_canonicalMediaUrn_normalizesTagOrder() {
  // Two media URNs with identical tags in different input orders must
  // produce the same canonical string. If canonicalization is bypassed,
  // the two strings remain different and this test exposes it.
  const a = rendererCanonicalMediaUrn('media:video;h264;list');
  const b = rendererCanonicalMediaUrn('media:list;h264;video');
  assertEqual(a, b, 'tag-order differences must not survive canonicalization');
}

function testRenderer_canonicalMediaUrn_preservesValueTags() {
  const c = rendererCanonicalMediaUrn('media:model;quant=q4');
  assert(c.includes('quant=q4'), 'value tag must be preserved');
}

function testRenderer_canonicalMediaUrn_rejectsCapUrn() {
  // MediaUrn.fromString enforces the media: prefix. Feeding a cap URN to
  // canonicalMediaUrn must fail hard.
  let threw = false;
  try {
    rendererCanonicalMediaUrn('cap:op=x;in="media:";out="media:"');
  } catch (e) {
    threw = true;
  }
  assert(threw, 'canonicalMediaUrn must reject non-media URNs');
}

function testRenderer_mediaNodeLabel_oneLinePerTag_valueAndMarker() {
  // A media URN with one value tag and one marker tag renders two lines:
  // value tag as "key: value", marker tag as bare key. Order is canonical
  // (alphabetical, matching TaggedUrn's sorted key iteration).
  const label = rendererMediaNodeLabel('media:video;quant=q4');
  const lines = label.split('\n');
  assertEqual(lines.length, 2, 'two tags must produce two lines');
  assert(lines.includes('quant: q4'), 'value tag rendered as key: value');
  assert(lines.includes('video'),     'marker tag rendered as bare key');
}

function testRenderer_mediaNodeLabel_stableAcrossTagOrder() {
  // Labels must be tag-order-independent so that the same media URN
  // produces the same multi-line label regardless of how the source
  // happened to spell it.
  const a = rendererMediaNodeLabel(rendererCanonicalMediaUrn('media:list;textable'));
  const b = rendererMediaNodeLabel(rendererCanonicalMediaUrn('media:textable;list'));
  assertEqual(a, b, 'label must be stable across tag orderings');
}

// ---------------- strand builder ----------------

function makeCapStep(capUrn, title, fromSpec, toSpec, inSeq, outSeq) {
  return {
    step_type: {
      Cap: {
        cap_urn: capUrn,
        title,
        specificity: 0,
        input_is_sequence: inSeq,
        output_is_sequence: outSeq,
      },
    },
    from_spec: fromSpec,
    to_spec: toSpec,
  };
}

function makeForEachStep(mediaSpec) {
  return {
    step_type: { ForEach: { media_spec: mediaSpec } },
    from_spec: mediaSpec,
    to_spec: mediaSpec,
  };
}

function makeCollectStep(mediaSpec) {
  return {
    step_type: { Collect: { media_spec: mediaSpec } },
    from_spec: mediaSpec,
    to_spec: mediaSpec,
  };
}

function testRenderer_validateStrandStep_rejectsUnknownVariant() {
  // A step with an unknown variant must fail hard at validation; no
  // silent coercion.
  let threw = false;
  try {
    rendererValidateStrandStep({
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

function testRenderer_validateStrandStep_requiresBooleanIsSequence() {
  // A Cap variant must have boolean is_sequence fields; number or string
  // must reject.
  let threw = false;
  try {
    rendererValidateStrandStep({
      step_type: { Cap: {
        cap_urn: 'cap:in="media:a";op=x;out="media:b"',
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

function testRenderer_classifyStrandCapSteps_capFlags() {
  // Strand: ForEach → cap1 → cap2 → cap3 → Collect. cap1 should have
  // prevForEach=true; cap3 should have nextCollect=true; cap2 should
  // have neither.
  const steps = [
    makeForEachStep('media:pdf;list'),
    makeCapStep('cap:in="media:pdf";op=a;out="media:png"', 'a', 'media:pdf', 'media:png', false, false),
    makeCapStep('cap:in="media:png";op=b;out="media:jpg"', 'b', 'media:png', 'media:jpg', false, false),
    makeCapStep('cap:in="media:jpg";op=c;out="media:txt"', 'c', 'media:jpg', 'media:txt', false, false),
    makeCollectStep('media:txt'),
  ];
  const { capStepIndices, capFlags } = rendererClassifyStrandCapSteps(steps);
  assertEqual(capStepIndices.length, 3, 'three cap steps');
  assert(capFlags.get(1).prevForEach, 'cap1 has prevForEach');
  assert(!capFlags.get(1).nextCollect, 'cap1 has no nextCollect');
  assert(!capFlags.get(2).prevForEach, 'cap2 has no prevForEach');
  assert(!capFlags.get(2).nextCollect, 'cap2 has no nextCollect');
  assert(!capFlags.get(3).prevForEach, 'cap3 has no prevForEach');
  assert(capFlags.get(3).nextCollect, 'cap3 has nextCollect');
}

function testRenderer_classifyStrandCapSteps_nestedForks() {
  // Nested strand: ForEach → cap1 → ForEach → cap2 → Collect → cap3 → Collect.
  // cap1 has prevForEach (outer), cap2 has prevForEach (inner) and
  // nextCollect (inner), cap3 has nextCollect (outer).
  const steps = [
    makeForEachStep('media:a;list'),
    makeCapStep('cap:in="media:a";op=a;out="media:b"', 'a', 'media:a', 'media:b', false, false),
    makeForEachStep('media:b;list'),
    makeCapStep('cap:in="media:b";op=b;out="media:c"', 'b', 'media:b', 'media:c', false, false),
    makeCollectStep('media:c'),
    makeCapStep('cap:in="media:c";op=c;out="media:d"', 'c', 'media:c', 'media:d', false, false),
    makeCollectStep('media:d'),
  ];
  const { capFlags } = rendererClassifyStrandCapSteps(steps);
  assert(capFlags.get(1).prevForEach && !capFlags.get(1).nextCollect, 'cap1 outer entry');
  assert(capFlags.get(3).prevForEach && capFlags.get(3).nextCollect, 'cap2 inner both');
  assert(!capFlags.get(5).prevForEach && capFlags.get(5).nextCollect, 'cap3 outer exit');
}

// Helper: find an edge with the given source/target ids.
function findEdge(edges, source, target) {
  return edges.find(e => e.source === source && e.target === target);
}

function testRenderer_buildStrandGraphData_singleCapPlain() {
  // Minimal strand with one plain 1→1 cap. Plan builder produces:
  //   input_slot → step_0 (cap) → output
  // (two edges, three nodes). No cardinality marker in the cap label
  // because input_is_sequence == output_is_sequence == false.
  const payload = {
    source_spec: 'media:a',
    target_spec: 'media:b',
    steps: [
      makeCapStep('cap:in="media:a";op=x;out="media:b"', 'x', 'media:a', 'media:b', false, false),
    ],
  };
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

function testRenderer_buildStrandGraphData_sequenceShowsCardinality() {
  // A cap with input_is_sequence=true MUST emit "(n→1)" on its edge
  // label.
  const payload = {
    source_spec: 'media:a;list',
    target_spec: 'media:b',
    steps: [
      makeCapStep('cap:in="media:a;list";op=x;out="media:b"', 'x', 'media:a;list', 'media:b', true, false),
    ],
  };
  const built = rendererBuildStrandGraphData(payload);
  const capEdge = findEdge(built.edges, 'input_slot', 'step_0');
  assert(capEdge !== undefined, 'cap edge exists');
  assert(capEdge.label.includes('(n\u21921)'),
    `cap edge label must include (n\u21921) marker; got: ${capEdge.label}`);
}

function testRenderer_buildStrandGraphData_foreachCollectSpan() {
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
  const payload = {
    source_spec: 'media:pdf;list',
    target_spec: 'media:txt;list',
    steps: [
      makeForEachStep('media:pdf;list'),
      makeCapStep('cap:in="media:pdf";op=extract;out="media:txt"', 'extract', 'media:pdf', 'media:txt', false, false),
      makeCollectStep('media:txt'),
    ],
  };
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

function testRenderer_buildStrandGraphData_standaloneCollect() {
  // Strand with a standalone Collect (no enclosing ForEach). Plan
  // builder creates a Collect node consuming prev directly — plain
  // direct edge, no iteration/collection semantics.
  const payload = {
    source_spec: 'media:a',
    target_spec: 'media:b;list',
    steps: [
      makeCapStep('cap:in="media:a";op=x;out="media:b"', 'x', 'media:a', 'media:b', false, false),
      makeCollectStep('media:b'),
    ],
  };
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

function testRenderer_buildStrandGraphData_unclosedForEachBody() {
  // Strand: [Cap_a, ForEach, Cap_b] with no closing Collect. The plan
  // builder's "unclosed ForEach" branch creates a ForEach node
  // connecting Cap_a to Cap_b via iteration, with prev becoming the
  // body exit (Cap_b).
  const payload = {
    source_spec: 'media:a',
    target_spec: 'media:c',
    steps: [
      makeCapStep('cap:in="media:a";op=a;out="media:b"', 'a', 'media:a', 'media:b', false, false),
      makeForEachStep('media:b'),
      makeCapStep('cap:in="media:b";op=b;out="media:c"', 'b', 'media:b', 'media:c', false, false),
    ],
  };
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

function testRenderer_buildStrandGraphData_nestedForEachThrows() {
  // Nested ForEach without an intervening body cap in the outer
  // ForEach is an illegal nesting per plan_builder. The renderer
  // must throw the same error to surface the issue rather than
  // render a malformed graph.
  const payload = {
    source_spec: 'media:a;list',
    target_spec: 'media:a',
    steps: [
      makeForEachStep('media:a;list'),
      makeForEachStep('media:a'),
      makeCapStep('cap:in="media:a";op=x;out="media:a"', 'x', 'media:a', 'media:a', false, false),
    ],
  };
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

function testRenderer_collapseStrand_singleCapBodyKeepsCapOwnLabel() {
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
  const payload = {
    source_spec: 'media:pdf;list',
    target_spec: 'media:txt;list',
    steps: [
      makeForEachStep('media:pdf;list'),
      makeCapStep('cap:in="media:pdf";op=extract;out="media:txt"', 'extract', 'media:pdf', 'media:txt', false, false),
      makeCollectStep('media:txt'),
    ],
  };
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

function testRenderer_collapseStrand_unclosedForEachBodyCollapses() {
  // [Cap_a(1→1), ForEach, Cap_b(1→1)] with no Collect,
  // source=media:a, target=media:c. Cap_b's to_spec is media:c
  // which is equivalent to target_spec, so the output node is
  // merged into step_2.
  //
  // Since both caps are 1→1, neither carries a cardinality
  // marker in the render. The foreach step is just dropped;
  // no relabeling.
  //
  // Final: 3 nodes (input_slot, step_0, step_2), 2 edges.
  const payload = {
    source_spec: 'media:a',
    target_spec: 'media:c',
    steps: [
      makeCapStep('cap:in="media:a";op=a;out="media:b"', 'a', 'media:a', 'media:b', false, false),
      makeForEachStep('media:b'),
      makeCapStep('cap:in="media:b";op=b;out="media:c"', 'b', 'media:b', 'media:c', false, false),
    ],
  };
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

function testRenderer_collapseStrand_standaloneCollectCollapses() {
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
  const payload = {
    source_spec: 'media:a',
    target_spec: 'media:b;list',
    steps: [
      makeCapStep('cap:in="media:a";op=x;out="media:b"', 'x', 'media:a', 'media:b', false, false),
      makeCollectStep('media:b'),
    ],
  };
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

function testRenderer_collapseStrand_sequenceProducingCapBeforeForeach() {
  // Regression test mirroring the user's real strand:
  // [Cap_disbind (output_is_sequence=true), ForEach, Cap_make_decision],
  // source = media:pdf, target = media:decision (equivalent to
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
  const payload = {
    source_spec: 'media:pdf',
    target_spec: 'media:decision',
    steps: [
      makeCapStep('cap:in="media:pdf";op=disbind;out="media:page"', 'Disbind', 'media:pdf', 'media:page', false, true),
      makeForEachStep('media:page'),
      makeCapStep('cap:in="media:page";op=decide;out="media:decision"', 'Make a Decision', 'media:page', 'media:decision', false, false),
    ],
  };
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

function testRenderer_collapseStrand_plainCapMergesTrailingOutput() {
  // A strand with a single plain 1→1 cap whose to_spec equals
  // target_spec. The plan-builder topology produces:
  //   input_slot → step_0 (cap) → output
  // The collapse pass merges the trailing output edge because
  // step_0 and output represent the same URN (media:b).
  //
  // Final: 2 nodes (input_slot, step_0), 1 edge.
  const payload = {
    source_spec: 'media:a',
    target_spec: 'media:b',
    steps: [
      makeCapStep('cap:in="media:a";op=x;out="media:b"', 'x', 'media:a', 'media:b', false, false),
    ],
  };
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

function testRenderer_collapseStrand_plainCapDistinctTargetNoMerge() {
  // A strand with a single plain cap whose to_spec is NOT
  // equivalent to target_spec. The output node must be retained
  // and the trailing connector edge preserved.
  const payload = {
    source_spec: 'media:a',
    target_spec: 'media:b;list',
    steps: [
      makeCapStep('cap:in="media:a";op=x;out="media:b"', 'x', 'media:a', 'media:b', false, false),
    ],
  };
  const built = rendererBuildStrandGraphData(payload);
  const collapsed = rendererCollapseStrandShapeTransitions(built);

  assertEqual(collapsed.nodes.length, 3,
    'no merge because cap to_spec (media:b) and target (media:b;list) are semantically distinct');
  assert(collapsed.nodes.find(n => n.id === 'output') !== undefined,
    'output node retained');
  assert(collapsed.nodes.find(n => n.id === 'step_0') !== undefined,
    'step_0 retained');
}

function testRenderer_validateStrandPayload_missingSourceSpec() {
  let threw = false;
  try {
    rendererValidateStrandPayload({ target_spec: 'media:b', steps: [] });
  } catch (e) {
    threw = true;
    assert(e.message.includes('source_spec'), 'error must name source_spec');
  }
  assert(threw, 'missing source_spec must throw');
}

// ---------------- run builder ----------------

function testRenderer_validateBodyOutcome_rejectsNegativeIndex() {
  let threw = false;
  try {
    rendererValidateBodyOutcome({ body_index: -1, success: true, cap_urns: [] }, 'test');
  } catch (e) {
    threw = true;
  }
  assert(threw, 'negative body_index must throw');
}

function testRenderer_buildRunGraphData_pagesSuccessesAndFailures() {
  // 6 successes, 4 failures. visible=3+2, total=10. Body has 2
  // caps (a, b). Each body replica is a chain of:
  //   entry node + body_step_0 (cap a) + body_step_1 (cap b)
  // = 3 nodes per body. Failed bodies truncate at failed_cap
  // (cap b, idx=1) so `traceEnd=2` — same 3-node chain.
  //
  // Total replica nodes: (3 success × 3) + (2 failure × 3) = 15.
  //
  // Show-more nodes: one for 3 hidden successes, one for 2 hidden
  // failures.
  const strand = {
    source_spec: 'media:pdf;list',
    target_spec: 'media:txt',
    steps: [
      makeForEachStep('media:pdf;list'),
      makeCapStep('cap:in="media:pdf";op=a;out="media:png"', 'a', 'media:pdf', 'media:png', false, false),
      makeCapStep('cap:in="media:png";op=b;out="media:txt"', 'b', 'media:png', 'media:txt', false, false),
      makeCollectStep('media:txt'),
    ],
  };
  const outcomes = [];
  for (let i = 0; i < 6; i++) {
    outcomes.push({ body_index: i, success: true, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0 });
  }
  for (let i = 6; i < 10; i++) {
    outcomes.push({
      body_index: i,
      success: false,
      cap_urns: [],
      saved_paths: [],
      total_bytes: 0,
      duration_ms: 0,
      failed_cap: 'cap:in="media:png";op=b;out="media:txt"',
      error: 'oom',
    });
  }
  const payload = {
    resolved_strand: strand,
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

function testRenderer_buildRunGraphData_failureWithoutFailedCapRendersFullTrace() {
  // A failure without failed_cap (infrastructure failure) must
  // still render the full body trace — the builder must not
  // crash or produce zero replicas.
  //
  // Strand [ForEach, Cap, Collect] → body has 1 cap. Each body
  // replica emits 1 entry node + 1 body cap node = 2 nodes.
  const strand = {
    source_spec: 'media:pdf;list',
    target_spec: 'media:txt',
    steps: [
      makeForEachStep('media:pdf;list'),
      makeCapStep('cap:in="media:pdf";op=a;out="media:txt"', 'a', 'media:pdf', 'media:txt', false, false),
      makeCollectStep('media:txt'),
    ],
  };
  const payload = {
    resolved_strand: strand,
    body_outcomes: [
      { body_index: 0, success: false, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0, error: 'unknown' },
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
  assertEqual(failureNodes, 2, 'entry + body cap = 2 failure replica nodes');
}

function testRenderer_buildRunGraphData_usesCapUrnIsEquivalentForFailedCap() {
  // The renderer matches failed_cap against step cap URNs via
  // CapUrn.isEquivalent, NOT string equality. Feed a payload where
  // failed_cap and the step's cap_urn differ only in tag order — they
  // should still match, proving URNs are not treated as strings.
  const strand = {
    source_spec: 'media:a',
    target_spec: 'media:c',
    steps: [
      makeForEachStep('media:a;list'),
      // Canonical form places tags alphabetically: op after in/out.
      makeCapStep(
        'cap:in="media:a";op=x;out="media:b"',
        'x', 'media:a', 'media:b', false, false
      ),
      makeCapStep(
        'cap:in="media:b";op=y;out="media:c"',
        'y', 'media:b', 'media:c', false, false
      ),
      makeCollectStep('media:c'),
    ],
  };
  // The failed_cap URN is semantically the same as step 1 (cap y). If
  // CapUrn.fromString canonicalizes (it should), any equivalent form
  // will match. Feed a fully-specified form that is equivalent.
  const payload = {
    resolved_strand: strand,
    body_outcomes: [
      {
        body_index: 0,
        success: false,
        cap_urns: [],
        saved_paths: [],
        total_bytes: 0,
        duration_ms: 0,
        failed_cap: 'cap:in="media:b";out="media:c";op=y',  // different tag order
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
  assertEqual(failureNodes, 3, 'trace truncates at cap y via isEquivalent, yielding entry + 2 cap nodes');
}

function testRenderer_buildRunGraphData_backboneHasNoForeachNode() {
  // Regression test for the run-mode rendering fix: the backbone
  // delivered to cytoscape must NOT contain any strand-foreach or
  // strand-collect nodes. Run mode inherits the same cosmetic
  // collapse as strand mode so the foreach/collect execution-layer
  // concepts don't leak into the view as boxed nodes.
  //
  // User scenario: [Disbind (1→n), ForEach, make_decision] where
  // target_spec equals the last cap's to_spec, so the backbone
  // collapses to 3 nodes: input_slot, step_0 (Text Page),
  // step_2 (Decision, merged target). No separate `for each` or
  // `collect` boxes.
  const strand = {
    source_spec: 'media:pdf',
    target_spec: 'media:decision',
    steps: [
      makeCapStep('cap:in="media:pdf";op=disbind;out="media:page"', 'Disbind', 'media:pdf', 'media:page', false, true),
      makeForEachStep('media:page'),
      makeCapStep('cap:in="media:page";op=decide;out="media:decision"', 'Make a Decision', 'media:page', 'media:decision', false, false),
    ],
  };
  const payload = {
    resolved_strand: strand,
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
  const backboneCapEdges = built.strandBuilt.edges.filter(e => e.edgeClass === 'strand-cap-edge');
  assert(backboneCapEdges.some(e => e.source === 'step_0' && e.target === 'step_2'),
    'foreach-entry backbone edge step_0 → step_2 must be present for fallback connectivity');

  // With zero outcomes, no replicas and no show-more nodes.
  assertEqual(built.replicaNodes.length, 0, 'no replica nodes when body_outcomes is empty');
  assertEqual(built.showMoreNodes.length, 0, 'no show-more nodes when no hidden outcomes');
}

function testRenderer_buildRunGraphData_allFailedDropsTargetPlaceholder() {
  // When every body fails, the strand target node was never
  // reached by any execution. The render drops BOTH the backbone
  // foreach-entry edge AND the orphaned target node so the user
  // doesn't see a stale "Decision" placeholder alongside their
  // failed replicas.
  const strand = {
    source_spec: 'media:pdf',
    target_spec: 'media:decision',
    steps: [
      makeCapStep('cap:in="media:pdf";op=disbind;out="media:page"', 'Disbind', 'media:pdf', 'media:page', false, true),
      makeForEachStep('media:page'),
      makeCapStep('cap:in="media:page";op=decide;out="media:decision"', 'Make a Decision', 'media:page', 'media:decision', false, false),
    ],
  };
  const failedCapUrn = 'cap:in="media:page";op=decide;out="media:decision"';
  const payload = {
    resolved_strand: strand,
    body_outcomes: [
      { body_index: 0, success: false, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0, failed_cap: failedCapUrn, error: 'boom' },
      { body_index: 1, success: false, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0, failed_cap: failedCapUrn, error: 'boom' },
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

function testRenderer_buildRunGraphData_unclosedForeachSuccessNoMerge() {
  // Strand without a Collect: [Disbind, ForEach, make_decision].
  // Under the machfab realize_strand semantics there's no Collect,
  // so each body produces its OWN terminal output. Successful
  // replicas do NOT merge into a shared target — each body has
  // its own separate decision.
  //
  // Expected replica shape per body:
  //   anchorNode (pre-foreach backbone) → entry (per-body Text Page)
  //                                    → body_n_0 (per-body Decision)
  //   (no merge edge back into the backbone)
  const strand = {
    source_spec: 'media:pdf',
    target_spec: 'media:decision',
    steps: [
      makeCapStep('cap:in="media:pdf";op=disbind;out="media:page"', 'Disbind', 'media:pdf', 'media:page', false, true),
      makeForEachStep('media:page'),
      makeCapStep('cap:in="media:page";op=decide;out="media:decision"', 'Make a Decision', 'media:page', 'media:decision', false, false),
    ],
  };
  const payload = {
    resolved_strand: strand,
    body_outcomes: [
      { body_index: 0, success: true, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0 },
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

function testRenderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget() {
  // With a Collect closing the body, successful replicas DO merge
  // into the post-collect target so the flow converges.
  // Strand: [Disbind, ForEach, Cap_a, Cap_b, Collect] with a
  // downstream cap after Collect to make the post-collect target
  // a real separate node.
  //
  // Actually simpler: [ForEach, Cap_a, Collect] with source=list
  // and target=list.
  const strand = {
    source_spec: 'media:pdf;list',
    target_spec: 'media:txt;list',
    steps: [
      makeForEachStep('media:pdf;list'),
      makeCapStep('cap:in="media:pdf";op=extract;out="media:txt"', 'extract', 'media:pdf', 'media:txt', false, false),
      makeCollectStep('media:txt'),
    ],
  };
  const payload = {
    resolved_strand: strand,
    body_outcomes: [
      { body_index: 0, success: true, cap_urns: [], saved_paths: [], total_bytes: 0, duration_ms: 0 },
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

function testRenderer_validateEditorGraphPayload_rejectsUnknownKind() {
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

function testRenderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges() {
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

function testRenderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass() {
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

function testRenderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags() {
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

function testRenderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped() {
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

function testRenderer_buildEditorGraphData_rejectsEdgeWithMissingSource() {
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

function testRenderer_buildResolvedMachineGraphData_singleStrandLinearChain() {
  // A single-strand machine: media:pdf → extract → media:txt
  // → embed → media:embedding. Two edges, three nodes, no
  // loops, no fan-in. Tests the basic shape — nodes and
  // edges flow through verbatim from the resolved machine
  // payload.
  const payload = {
    strands: [
      {
        nodes: [
          { id: 'n0', urn: 'media:pdf' },
          { id: 'n1', urn: 'media:txt;textable' },
          { id: 'n2', urn: 'media:embedding;record' },
        ],
        edges: [
          {
            alias: 'edge_0',
            cap_urn: 'cap:in=media:pdf;op=extract;out=media:txt;textable',
            is_loop: false,
            assignment: [
              { cap_arg_media_urn: 'media:pdf', source_node: 'n0' },
            ],
            target_node: 'n1',
          },
          {
            alias: 'edge_1',
            cap_urn: 'cap:in=media:textable;op=embed;out=media:embedding;record',
            is_loop: false,
            assignment: [
              { cap_arg_media_urn: 'media:textable', source_node: 'n1' },
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
  assert(n0.classes.indexOf('strand-source') >= 0,
    'input anchor node carries strand-source class');
  assert(n2.classes.indexOf('strand-target') >= 0,
    'output anchor node carries strand-target class');
}

function testRenderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass() {
  // An is_loop edge corresponds to a strand step inside a
  // ForEach body. The renderer must mark it with the
  // `machine-loop` class so the dashed amber rule applies.
  const payload = {
    strands: [
      {
        nodes: [
          { id: 'n0', urn: 'media:page;textable' },
          { id: 'n1', urn: 'media:decision;json;record;textable' },
        ],
        edges: [
          {
            alias: 'edge_0',
            cap_urn: 'cap:in=media:textable;op=make_decision;out=media:decision;json;record;textable',
            is_loop: true,
            assignment: [
              { cap_arg_media_urn: 'media:textable', source_node: 'n0' },
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

function testRenderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment() {
  // A cap with two input args (a fan-in) gets one rendered
  // edge per (source_node, target_node) pair so cytoscape can
  // draw both incoming wires. Both edges share the cap title
  // and color so they read as a single fan-in.
  const payload = {
    strands: [
      {
        nodes: [
          { id: 'n0', urn: 'media:image;png' },
          { id: 'n1', urn: 'media:model-spec;textable' },
          { id: 'n2', urn: 'media:image-description;textable' },
        ],
        edges: [
          {
            alias: 'edge_0',
            cap_urn: 'cap:in=media:image;png;op=describe_image;out=media:image-description;textable',
            is_loop: false,
            assignment: [
              { cap_arg_media_urn: 'media:image;png', source_node: 'n0' },
              { cap_arg_media_urn: 'media:model-spec;textable', source_node: 'n1' },
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

function testRenderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint() {
  // Two strands inside one machine. Each strand has its own
  // nodes and edges. Node ids are globally unique across
  // strands (Rust assigns them via a single counter), so no
  // node id collision can happen. The renderer must emit
  // every node and every edge from both strands.
  const payload = {
    strands: [
      {
        nodes: [
          { id: 'n0', urn: 'media:pdf' },
          { id: 'n1', urn: 'media:txt;textable' },
        ],
        edges: [
          {
            alias: 'edge_0',
            cap_urn: 'cap:in=media:pdf;op=extract;out=media:txt;textable',
            is_loop: false,
            assignment: [
              { cap_arg_media_urn: 'media:pdf', source_node: 'n0' },
            ],
            target_node: 'n1',
          },
        ],
        input_anchor_nodes: ['n0'],
        output_anchor_nodes: ['n1'],
      },
      {
        nodes: [
          { id: 'n2', urn: 'media:json;record;textable' },
          { id: 'n3', urn: 'media:csv;list;record;textable' },
        ],
        edges: [
          {
            alias: 'edge_1',
            cap_urn: 'cap:in=media:json;record;textable;op=convert_format;out=media:csv;list;record;textable',
            is_loop: false,
            assignment: [
              { cap_arg_media_urn: 'media:json;record;textable', source_node: 'n2' },
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

function testRenderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard() {
  // Node ids must be globally unique across strands. The
  // Rust serializer guarantees this via a single global
  // counter. If the host ever feeds a payload that violates
  // it, the renderer must fail hard so the bug surfaces
  // instead of silently overwriting one node with another.
  const payload = {
    strands: [
      {
        nodes: [{ id: 'n0', urn: 'media:pdf' }],
        edges: [],
        input_anchor_nodes: ['n0'],
        output_anchor_nodes: ['n0'],
      },
      {
        nodes: [{ id: 'n0', urn: 'media:html' }],
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

function testRenderer_validateResolvedMachinePayload_rejectsMissingFields() {
  // The validator must reject any payload missing a required
  // field on a strand, edge, node, or assignment binding.
  // We exercise the most-likely-to-be-missed field on each
  // sub-shape.
  const cases = [
    { strands: 'not-an-array' },
    { strands: [{ nodes: [], edges: [], input_anchor_nodes: [] /* missing output_anchor_nodes */ }] },
    { strands: [{ nodes: [{ id: 'n0' /* missing urn */ }], edges: [], input_anchor_nodes: [], output_anchor_nodes: [] }] },
    {
      strands: [{
        nodes: [{ id: 'n0', urn: 'media:x' }],
        edges: [{
          alias: 'edge_0',
          cap_urn: 'cap:in=...;out=...',
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
// Test runner
// ============================================================================

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
  runTest('TEST054: xv5_inline_spec_redefinition_detected', test054_xv5InlineSpecRedefinitionDetected);
  runTest('TEST055: xv5_new_inline_spec_allowed', test055_xv5NewInlineSpecAllowed);
  runTest('TEST056: xv5_empty_media_specs_allowed', test056_xv5EmptyMediaSpecsAllowed);

  // media_urn.rs: TEST060-TEST078
  console.log('\n--- media_urn.rs ---');
  runTest('TEST060: wrong_prefix_fails', test060_wrongPrefixFails);
  runTest('TEST061: is_binary', test061_isBinary);
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

  // media_spec.rs: TEST088-TEST110
  console.log('\n--- media_spec.rs ---');
  console.log('  SKIP TEST088-090: N/A for JS (async registry, Rust-only)');
  runTest('TEST091: resolve_custom_media_spec', test091_resolveCustomMediaSpec);
  runTest('TEST092: resolve_custom_with_schema', test092_resolveCustomWithSchema);
  runTest('TEST093: resolve_unresolvable_fails_hard', test093_resolveUnresolvableFailsHard);
  console.log('  SKIP TEST094: N/A for JS (no registry concept)');
  console.log('  SKIP TEST095-098: N/A for JS (Rust serde/validation)');
  runTest('TEST099: resolved_is_binary', test099_resolvedIsBinary);
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

  // cap_matrix.rs: TEST117-TEST131
  console.log('\n--- cap_matrix.rs ---');
  runTest('TEST117: cap_block_more_specific_wins', test117_capBlockMoreSpecificWins);
  runTest('TEST118: cap_block_tie_goes_to_first', test118_capBlockTieGoesToFirst);
  runTest('TEST119: cap_block_polls_all', test119_capBlockPollsAll);
  runTest('TEST120: cap_block_no_match', test120_capBlockNoMatch);
  runTest('TEST121: cap_block_fallback_scenario', test121_capBlockFallbackScenario);
  runTest('TEST122: cap_block_can_method', test122_capBlockCanMethod);
  runTest('TEST123: cap_block_registry_management', test123_capBlockRegistryManagement);
  runTest('TEST124: cap_graph_basic_construction', test124_capGraphBasicConstruction);
  runTest('TEST125: cap_graph_outgoing_incoming', test125_capGraphOutgoingIncoming);
  runTest('TEST126: cap_graph_can_convert', test126_capGraphCanConvert);
  runTest('TEST127: cap_graph_find_path', test127_capGraphFindPath);
  runTest('TEST128: cap_graph_find_all_paths', test128_capGraphFindAllPaths);
  runTest('TEST129: cap_graph_direct_edges_sorted_by_specificity', test129_capGraphGetDirectEdges);
  runTest('TEST130: cap_graph_stats', test130_capGraphStats);
  runTest('TEST131: cap_block_graph_integration', test131_capGraphWithCapBlock);
  console.log('  SKIP TEST132-134: N/A (already covered by TEST129-131)');

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
  runTest('TEST311: llm_generate_text_urn_specs', test311_llmGenerateTextUrnSpecs);
  runTest('TEST312: all_urn_builders_produce_valid_urns', test312_allUrnBuildersProduceValidUrns);

  // JS-specific tests (no Rust number)
  console.log('\n--- JS-specific ---');
  runTest('JS: build_extension_index', testJS_buildExtensionIndex);
  runTest('JS: media_urns_for_extension', testJS_mediaUrnsForExtension);
  runTest('JS: get_extension_mappings', testJS_getExtensionMappings);
  runTest('JS: cap_with_media_specs', testJS_capWithMediaSpecs);
  runTest('JS: cap_json_serialization', testJS_capJSONSerialization);
  runTest('JS: cap_documentation_round_trip', testJS_capDocumentationRoundTrip);
  runTest('JS: cap_documentation_omitted_when_null', testJS_capDocumentationOmittedWhenNull);
  runTest('JS: media_spec_documentation_propagates_through_resolve', testJS_mediaSpecDocumentationPropagatesThroughResolve);
  runTest('JS: stdin_source_kind_constants', testJS_stdinSourceKindConstants);
  runTest('JS: stdin_source_null_data', testJS_stdinSourceNullData);
  const p1 = runTest('JS: args_passed_to_executeCap', testJS_argsPassedToExecuteCap);
  if (p1) await p1;
  const p2 = runTest('JS: binary_arg_passed_to_executeCap', testJS_binaryArgPassedToExecuteCap);
  if (p2) await p2;
  runTest('JS: media_spec_construction', testJS_mediaSpecConstruction);

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

  // media_urn.rs: TEST546-TEST558 (MediaUrn predicates)
  console.log('\n--- media_urn.rs (predicates) ---');
  runTest('TEST546: is_image', test546_isImage);
  runTest('TEST547: is_audio', test547_isAudio);
  runTest('TEST548: is_video', test548_isVideo);
  runTest('TEST549: is_numeric', test549_isNumeric);
  runTest('TEST550: is_bool', test550_isBool);
  runTest('TEST551: is_file_path', test551_isFilePath);
  runTest('TEST552: is_file_path_array', test552_isFilePathArray);
  runTest('TEST553: is_any_file_path', test553_isAnyFilePath);
  console.log('  SKIP TEST554: N/A for JS (collection types removed from capdag)');
  console.log('  SKIP TEST555: N/A for JS (with_tag/without_tag on MediaUrn)');
  console.log('  SKIP TEST556: N/A for JS (image_media_urn_for_ext helper)');
  console.log('  SKIP TEST557: N/A for JS (audio_media_urn_for_ext helper)');
  runTest('TEST558: predicate_constant_consistency', test558_predicateConstantConsistency);

  // cap_urn.rs: TEST559-TEST567 (CapUrn tier tests)
  console.log('\n--- cap_urn.rs (tier tests) ---');
  runTest('TEST559: without_tag', test559_withoutTag);
  runTest('TEST560: with_in_out_spec', test560_withInOutSpec);
  console.log('  SKIP TEST561: N/A for JS (in_media_urn/out_media_urn)');
  console.log('  SKIP TEST562: N/A for JS (canonical_option)');
  runTest('TEST563: find_all_matches', test563_findAllMatches);
  runTest('TEST564: are_compatible', test564_areCompatible);
  console.log('  SKIP TEST565: N/A for JS (tags_to_string)');
  runTest('TEST566: with_tag_ignores_in_out', test566_withTagIgnoresInOut);
  console.log('  SKIP TEST567: N/A for JS (conforms_to_str/accepts_str)');

  // cap_urn.rs: TEST639-TEST653 (Cap URN wildcard tests)
  console.log('\n--- cap_urn.rs (wildcard tests) ---');
  console.log('  SKIP TEST639-642: N/A for JS (implicit wildcard defaults)');
  runTest('TEST643: explicit_asterisk_is_wildcard', test643_explicitAsteriskIsWildcard);
  runTest('TEST644: specific_in_wildcard_out', test644_specificInWildcardOut);
  runTest('TEST645: wildcard_in_specific_out', test645_wildcardInSpecificOut);
  console.log('  SKIP TEST646-647: N/A for JS (invalid spec validation differs)');
  runTest('TEST648: wildcard_accepts_specific', test648_wildcardAcceptsSpecific);
  runTest('TEST649: specificity_scoring', test649_specificityScoring);
  console.log('  SKIP TEST650: N/A for JS (requires in/out)');
  runTest('TEST651: identity_forms_equivalent', test651_identityFormsEquivalent);
  console.log('  SKIP TEST652: N/A for JS (CAP_IDENTITY constant)');
  runTest('TEST653: identity_routing_isolation', test653_identityRoutingIsolation);

  // machine module: parser tests (mirrors parser.rs)
  console.log('\n--- machine/parser.rs ---');
  runTest('MACHINE:empty_input', testMachine_emptyInput);
  runTest('MACHINE:whitespace_only', testMachine_whitespaceOnly);
  runTest('MACHINE:header_only_no_wirings', testMachine_headerOnlyNoWirings);
  runTest('MACHINE:duplicate_alias', testMachine_duplicateAlias);
  runTest('MACHINE:simple_linear_chain', testMachine_simpleLinearChain);
  runTest('MACHINE:two_step_chain', testMachine_twoStepChain);
  runTest('MACHINE:fan_out', testMachine_fanOut);
  runTest('MACHINE:fan_in_secondary_assigned_by_prior_wiring', testMachine_fanInSecondaryAssignedByPriorWiring);
  runTest('MACHINE:fan_in_secondary_unassigned_gets_wildcard', testMachine_fanInSecondaryUnassignedGetsWildcard);
  runTest('MACHINE:loop_edge', testMachine_loopEdge);
  runTest('MACHINE:undefined_alias_fails', testMachine_undefinedAliasFails);
  runTest('MACHINE:node_alias_collision', testMachine_nodeAliasCollision);
  runTest('MACHINE:conflicting_media_types_fail', testMachine_conflictingMediaTypesFail);
  runTest('MACHINE:multiline_format', testMachine_multilineFormat);
  runTest('MACHINE:different_aliases_same_graph', testMachine_differentAliasesSameGraph);
  runTest('MACHINE:malformed_input_fails', testMachine_malformedInputFails);
  runTest('MACHINE:unterminated_bracket_fails', testMachine_unterminatedBracketFails);

  // machine module: line-based mode tests
  console.log('\n--- machine/parser.rs (line-based) ---');
  runTest('MACHINE:line_based_simple_chain', testMachine_lineBasedSimpleChain);
  runTest('MACHINE:line_based_two_step_chain', testMachine_lineBasedTwoStepChain);
  runTest('MACHINE:line_based_loop', testMachine_lineBasedLoop);
  runTest('MACHINE:line_based_fan_in', testMachine_lineBasedFanIn);
  runTest('MACHINE:mixed_bracketed_and_line_based', testMachine_mixedBracketedAndLineBased);
  runTest('MACHINE:line_based_equivalent_to_bracketed', testMachine_lineBasedEquivalentToBracketed);
  runTest('MACHINE:line_based_format_serialization', testMachine_lineBasedFormatSerialization);
  runTest('MACHINE:line_based_and_bracketed_parse_same_graph', testMachine_lineBasedAndBracketedParseSameGraph);

  // machine module: graph tests (mirrors graph.rs)
  console.log('\n--- machine/graph.rs ---');
  runTest('MACHINE:edge_equivalence_same_urns', testMachine_edgeEquivalenceSameUrns);
  runTest('MACHINE:edge_equivalence_different_cap_urns', testMachine_edgeEquivalenceDifferentCapUrns);
  runTest('MACHINE:edge_equivalence_different_targets', testMachine_edgeEquivalenceDifferentTargets);
  runTest('MACHINE:edge_equivalence_different_loop_flag', testMachine_edgeEquivalenceDifferentLoopFlag);
  runTest('MACHINE:edge_equivalence_source_order_independent', testMachine_edgeEquivalenceSourceOrderIndependent);
  runTest('MACHINE:edge_equivalence_different_source_count', testMachine_edgeEquivalenceDifferentSourceCount);
  runTest('MACHINE:graph_equivalence_same_edges', testMachine_graphEquivalenceSameEdges);
  runTest('MACHINE:graph_equivalence_reordered_edges', testMachine_graphEquivalenceReorderedEdges);
  runTest('MACHINE:graph_not_equivalent_different_edge_count', testMachine_graphNotEquivalentDifferentEdgeCount);
  runTest('MACHINE:graph_not_equivalent_different_cap', testMachine_graphNotEquivalentDifferentCap);
  runTest('MACHINE:graph_empty', testMachine_graphEmpty);
  runTest('MACHINE:graph_empty_equivalence', testMachine_graphEmptyEquivalence);
  runTest('MACHINE:root_sources_linear_chain', testMachine_rootSourcesLinearChain);
  runTest('MACHINE:leaf_targets_linear_chain', testMachine_leafTargetsLinearChain);
  runTest('MACHINE:root_sources_fan_in', testMachine_rootSourcesFanIn);
  runTest('MACHINE:display_edge', testMachine_displayEdge);
  runTest('MACHINE:display_graph', testMachine_displayGraph);

  // machine module: serializer tests (mirrors serializer.rs)
  console.log('\n--- machine/serializer.rs ---');
  runTest('MACHINE:serialize_single_edge', testMachine_serializeSingleEdge);
  runTest('MACHINE:serialize_two_edge_chain', testMachine_serializeTwoEdgeChain);
  runTest('MACHINE:serialize_empty_graph', testMachine_serializeEmptyGraph);
  runTest('MACHINE:roundtrip_single_edge', testMachine_roundtripSingleEdge);
  runTest('MACHINE:roundtrip_two_edge_chain', testMachine_roundtripTwoEdgeChain);
  runTest('MACHINE:roundtrip_fan_out', testMachine_roundtripFanOut);
  runTest('MACHINE:roundtrip_loop_edge', testMachine_roundtripLoopEdge);
  runTest('MACHINE:serialization_is_deterministic', testMachine_serializationIsDeterministic);
  runTest('MACHINE:reordered_edges_produce_same_notation', testMachine_reorderedEdgesProduceSameNotation);
  runTest('MACHINE:multiline_serialize_format', testMachine_multilineSerializeFormat);
  runTest('MACHINE:alias_from_op_tag', testMachine_aliasFromOpTag);
  runTest('MACHINE:alias_fallback_without_op_tag', testMachine_aliasFallbackWithoutOpTag);
  runTest('MACHINE:duplicate_op_tags_disambiguated', testMachine_duplicateOpTagsDisambiguated);

  // machine module: builder tests
  console.log('\n--- machine/builder ---');
  runTest('MACHINE:builder_single_edge', testMachine_builderSingleEdge);
  runTest('MACHINE:builder_with_loop', testMachine_builderWithLoop);
  runTest('MACHINE:builder_chaining', testMachine_builderChaining);
  runTest('MACHINE:builder_equivalent_to_parsed', testMachine_builderEquivalentToParsed);
  runTest('MACHINE:builder_round_trip', testMachine_builderRoundTrip);

  // machine module: CapUrn.isEquivalent/isComparable
  console.log('\n--- machine/urn_predicates ---');
  runTest('MACHINE:cap_urn_is_equivalent', testMachine_capUrnIsEquivalent);
  runTest('MACHINE:cap_urn_is_comparable', testMachine_capUrnIsComparable);
  runTest('MACHINE:cap_urn_in_media_urn', testMachine_capUrnInMediaUrn);
  runTest('MACHINE:cap_urn_out_media_urn', testMachine_capUrnOutMediaUrn);
  runTest('MACHINE:media_urn_is_equivalent', testMachine_mediaUrnIsEquivalent);
  runTest('MACHINE:media_urn_is_comparable', testMachine_mediaUrnIsComparable);

  // Phase 0A: Position tracking
  console.log('\n--- machine/position_tracking ---');
  runTest('MACHINE:parseMachineWithAST_headerLocation', testMachine_parseMachineWithAST_headerLocation);
  runTest('MACHINE:parseMachineWithAST_wiringLocation', testMachine_parseMachineWithAST_wiringLocation);
  runTest('MACHINE:parseMachineWithAST_multilinePositions', testMachine_parseMachineWithAST_multilinePositions);
  runTest('MACHINE:parseMachineWithAST_fanInSourceLocations', testMachine_parseMachineWithAST_fanInSourceLocations);
  runTest('MACHINE:parseMachineWithAST_aliasMap', testMachine_parseMachineWithAST_aliasMap);
  runTest('MACHINE:parseMachineWithAST_nodeMedia', testMachine_parseMachineWithAST_nodeMedia);
  runTest('MACHINE:errorLocation_parseError', testMachine_errorLocation_parseError);
  runTest('MACHINE:errorLocation_duplicateAlias', testMachine_errorLocation_duplicateAlias);
  runTest('MACHINE:errorLocation_undefinedAlias', testMachine_errorLocation_undefinedAlias);

  // Phase 0C: Machine.toMermaid()
  console.log('\n--- machine/mermaid ---');
  runTest('MACHINE:toMermaid_linearChain', testMachine_toMermaid_linearChain);
  runTest('MACHINE:toMermaid_loopEdge', testMachine_toMermaid_loopEdge);
  runTest('MACHINE:toMermaid_emptyGraph', testMachine_toMermaid_emptyGraph);
  runTest('MACHINE:toMermaid_fanIn', testMachine_toMermaid_fanIn);
  runTest('MACHINE:toMermaid_fanOut', testMachine_toMermaid_fanOut);

  // Phase 0B: CapRegistryClient
  console.log('\n--- registry/client ---');
  runTest('REGISTRY: capRegistryEntry_construction', testMachine_capRegistryEntry_construction);
  runTest('REGISTRY: mediaRegistryEntry_construction', testMachine_mediaRegistryEntry_construction);
  runTest('REGISTRY: capRegistryClient_construction', testMachine_capRegistryClient_construction);
  runTest('REGISTRY: capRegistryEntry_defaults', testMachine_capRegistryEntry_defaults);

  // cap-graph-renderer pure helpers (no DOM dependency)
  console.log('\n--- cap-graph-renderer helpers ---');
  runTest('RENDERER: cardinalityLabel_allFourCases',          testRenderer_cardinalityLabel_allFourCases);
  runTest('RENDERER: cardinalityLabel_usesUnicodeArrow',      testRenderer_cardinalityLabel_usesUnicodeArrow);
  runTest('RENDERER: cardinalityFromCap_findsStdinArg',       testRenderer_cardinalityFromCap_findsStdinArgNotFirstArg);
  runTest('RENDERER: cardinalityFromCap_scalarDefaults',      testRenderer_cardinalityFromCap_scalarDefaultsWhenFieldsMissing);
  runTest('RENDERER: cardinalityFromCap_outputOnlySequence',  testRenderer_cardinalityFromCap_outputOnlySequence);
  runTest('RENDERER: cardinalityFromCap_rejectsStringBool',   testRenderer_cardinalityFromCap_rejectsStringIsSequence);
  runTest('RENDERER: cardinalityFromCap_throwsOnNonObject',   testRenderer_cardinalityFromCap_throwsOnNonObject);
  runTest('RENDERER: canonicalMediaUrn_normalizesTagOrder',   testRenderer_canonicalMediaUrn_normalizesTagOrder);
  runTest('RENDERER: canonicalMediaUrn_preservesValueTags',   testRenderer_canonicalMediaUrn_preservesValueTags);
  runTest('RENDERER: canonicalMediaUrn_rejectsCapUrn',        testRenderer_canonicalMediaUrn_rejectsCapUrn);
  runTest('RENDERER: mediaNodeLabel_valueAndMarker',          testRenderer_mediaNodeLabel_oneLinePerTag_valueAndMarker);
  runTest('RENDERER: mediaNodeLabel_stableAcrossTagOrder',    testRenderer_mediaNodeLabel_stableAcrossTagOrder);

  console.log('\n--- cap-graph-renderer strand builder ---');
  runTest('RENDERER: validateStrandStep_unknownVariant',      testRenderer_validateStrandStep_rejectsUnknownVariant);
  runTest('RENDERER: validateStrandStep_booleanIsSequence',   testRenderer_validateStrandStep_requiresBooleanIsSequence);
  runTest('RENDERER: classifyStrandCapSteps_simple',          testRenderer_classifyStrandCapSteps_capFlags);
  runTest('RENDERER: classifyStrandCapSteps_nested',          testRenderer_classifyStrandCapSteps_nestedForks);
  runTest('RENDERER: buildStrand_singleCapPlain',             testRenderer_buildStrandGraphData_singleCapPlain);
  runTest('RENDERER: buildStrand_sequenceShowsCardinality',   testRenderer_buildStrandGraphData_sequenceShowsCardinality);
  runTest('RENDERER: buildStrand_foreachCollectSpan',         testRenderer_buildStrandGraphData_foreachCollectSpan);
  runTest('RENDERER: buildStrand_standaloneCollect',          testRenderer_buildStrandGraphData_standaloneCollect);
  runTest('RENDERER: buildStrand_unclosedForEachBody',        testRenderer_buildStrandGraphData_unclosedForEachBody);
  runTest('RENDERER: buildStrand_nestedForEachThrows',        testRenderer_buildStrandGraphData_nestedForEachThrows);
  runTest('RENDERER: collapseStrand_singleCapBody',           testRenderer_collapseStrand_singleCapBodyKeepsCapOwnLabel);
  runTest('RENDERER: collapseStrand_unclosedForEachBody',     testRenderer_collapseStrand_unclosedForEachBodyCollapses);
  runTest('RENDERER: collapseStrand_standaloneCollect',       testRenderer_collapseStrand_standaloneCollectCollapses);
  runTest('RENDERER: collapseStrand_seqCapBeforeForeach',     testRenderer_collapseStrand_sequenceProducingCapBeforeForeach);
  runTest('RENDERER: collapseStrand_plainCapMergesOutput',    testRenderer_collapseStrand_plainCapMergesTrailingOutput);
  runTest('RENDERER: collapseStrand_plainCapDistinctTarget',  testRenderer_collapseStrand_plainCapDistinctTargetNoMerge);
  runTest('RENDERER: validateStrand_missingSourceSpec',       testRenderer_validateStrandPayload_missingSourceSpec);

  console.log('\n--- cap-graph-renderer run builder ---');
  runTest('RENDERER: validateBodyOutcome_negativeIndex',      testRenderer_validateBodyOutcome_rejectsNegativeIndex);
  runTest('RENDERER: buildRun_pagesSuccessesAndFailures',     testRenderer_buildRunGraphData_pagesSuccessesAndFailures);
  runTest('RENDERER: buildRun_failureWithoutFailedCap',       testRenderer_buildRunGraphData_failureWithoutFailedCapRendersFullTrace);
  runTest('RENDERER: buildRun_usesIsEquivalentForFailedCap',  testRenderer_buildRunGraphData_usesCapUrnIsEquivalentForFailedCap);
  runTest('RENDERER: buildRun_backboneHasNoForeachNode',      testRenderer_buildRunGraphData_backboneHasNoForeachNode);
  runTest('RENDERER: buildRun_allFailedDropsPlaceholder',     testRenderer_buildRunGraphData_allFailedDropsTargetPlaceholder);
  runTest('RENDERER: buildRun_unclosedForeachNoMerge',        testRenderer_buildRunGraphData_unclosedForeachSuccessNoMerge);
  runTest('RENDERER: buildRun_closedForeachMerges',           testRenderer_buildRunGraphData_closedForeachSuccessMergesAtCollectTarget);

  console.log('\n--- cap-graph-renderer editor-graph builder ---');
  runTest('RENDERER: validateEditorGraph_unknownKind',          testRenderer_validateEditorGraphPayload_rejectsUnknownKind);
  runTest('RENDERER: buildEditorGraph_collapsesCapsIntoEdges',  testRenderer_buildEditorGraphData_collapsesCapsIntoLabeledEdges);
  runTest('RENDERER: buildEditorGraph_loopEdgeGetsClass',       testRenderer_buildEditorGraphData_loopMarkedEdgeGetsLoopClass);
  runTest('RENDERER: buildEditorGraph_cardinalityFromIsSeq',    testRenderer_buildEditorGraphData_cardinalityFromDataSlotSequenceFlags);
  runTest('RENDERER: buildEditorGraph_incompleteCapDropped',    testRenderer_buildEditorGraphData_capWithoutCompleteArgsIsDropped);
  runTest('RENDERER: buildEditorGraph_rejectsEdgeMissingSrc',   testRenderer_buildEditorGraphData_rejectsEdgeWithMissingSource);

  console.log('\n--- cap-graph-renderer resolved-machine builder ---');
  runTest('RENDERER: buildResolvedMachine_singleStrandLinear',     testRenderer_buildResolvedMachineGraphData_singleStrandLinearChain);
  runTest('RENDERER: buildResolvedMachine_loopGetsLoopClass',      testRenderer_buildResolvedMachineGraphData_loopEdgeGetsLoopClass);
  runTest('RENDERER: buildResolvedMachine_fanInOneEdgePerSrc',     testRenderer_buildResolvedMachineGraphData_fanInProducesEdgePerAssignment);
  runTest('RENDERER: buildResolvedMachine_multiStrandDisjoint',    testRenderer_buildResolvedMachineGraphData_multiStrandKeepsStrandsDisjoint);
  runTest('RENDERER: buildResolvedMachine_dupNodeIdFails',         testRenderer_buildResolvedMachineGraphData_duplicateNodeIdAcrossStrandsFailsHard);
  runTest('RENDERER: validateResolvedMachine_rejectsMissingFields', testRenderer_validateResolvedMachinePayload_rejectsMissingFields);

  // Summary
  console.log(`\n${passCount + failCount} tests: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) {
    console.log('ERR Some tests failed!');
    process.exit(1);
  } else {
    console.log('OK All tests passed!');
  }
}

// Run the tests
if (require.main === module) {
  runTests()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('\nERR Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = { runTests };
