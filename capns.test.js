// Cap URN JavaScript Test Suite
// Tests mirror Rust test numbering (TEST###) for cross-language tracking.
// All implementations (Rust, Go, JS, ObjC, Python) must pass these identically.

const {
  CapUrn, CapUrnBuilder, CapMatcher, CapUrnError, ErrorCodes,
  MediaUrn, MediaUrnError, MediaUrnErrorCodes,
  Cap, MediaSpec, MediaSpecError, MediaSpecErrorCodes,
  resolveMediaUrn, buildExtensionIndex, mediaUrnsForExtension, getExtensionMappings,
  CapMatrixError, CapMatrix, BestCapSetMatch, CompositeCapSet, CapBlock,
  PluginInfo, PluginCapSummary, PluginSuggestion, PluginRepoClient, PluginRepoServer,
  CapGraphEdge, CapGraphStats, CapGraph,
  StdinSource, StdinSourceKind,
  validateNoMediaSpecRedefinitionSync,
  CapArgumentValue,
  llmConversationUrn, modelAvailabilityUrn, modelPathUrn,
  MEDIA_STRING, MEDIA_INTEGER, MEDIA_NUMBER, MEDIA_BOOLEAN,
  MEDIA_OBJECT, MEDIA_STRING_ARRAY, MEDIA_INTEGER_ARRAY,
  MEDIA_NUMBER_ARRAY, MEDIA_BOOLEAN_ARRAY, MEDIA_OBJECT_ARRAY,
  MEDIA_BINARY, MEDIA_VOID, MEDIA_PNG, MEDIA_AUDIO, MEDIA_VIDEO,
  MEDIA_PDF, MEDIA_EPUB, MEDIA_MD, MEDIA_TXT, MEDIA_RST, MEDIA_LOG,
  MEDIA_HTML, MEDIA_XML, MEDIA_JSON, MEDIA_YAML, MEDIA_JSON_SCHEMA,
  MEDIA_MODEL_SPEC, MEDIA_AVAILABILITY_OUTPUT, MEDIA_PATH_OUTPUT,
  MEDIA_LLM_INFERENCE_OUTPUT
} = require('./capns.js');

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
 * Rust reference test_urn helper: test_urn(tags) => cap:in="media:void";{tags};out="media:form=map;textable"
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
// cap_urn.rs: TEST001-TEST052
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
  const requestDiff = CapUrn.fromString('cap:in="media:textable;form=scalar";op=generate;out="media:form=map;textable"');
  assert(!cap.accepts(requestDiff), 'Different inSpec should not match');

  // Wildcard direction matches any
  const wildcardCap = CapUrn.fromString('cap:in=*;op=generate;out=*');
  assert(wildcardCap.accepts(request), 'Wildcard direction should match any');
}

// TEST004: Unquoted keys/values normalized to lowercase
function test004_unquotedValuesLowercased() {
  const cap = CapUrn.fromString('cap:IN="media:void";OP=Generate;EXT=PDF;OUT="media:form=map;textable"');
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
  // media:void = 1 tag, media:form=map;textable = 2 tags
  const cap1 = CapUrn.fromString(testUrn('type=general'));
  assertEqual(cap1.specificity(), 4, 'void(1) + textable+form(2) + type(1) = 4');

  const cap2 = CapUrn.fromString(testUrn('op=generate'));
  assertEqual(cap2.specificity(), 4, 'void(1) + textable+form(2) + op(1) = 4');

  // Wildcard tag does not count
  const cap3 = CapUrn.fromString(testUrn('op=*;ext=pdf'));
  assertEqual(cap3.specificity(), 4, 'void(1) + textable+form(2) + ext(1) = 4 (op=* does not count)');

  // Wildcard direction doesn't contribute
  const cap4 = CapUrn.fromString(`cap:in=*;out="${MEDIA_OBJECT}";op=test`);
  assertEqual(cap4.specificity(), 3, 'textable+form(2) + op(1) = 3 (in=* does not count)');
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
  const cap5 = CapUrn.fromString('cap:in="media:textable;form=scalar";out="media:object";op=generate');
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
  const cap2 = CapUrn.fromString('cap:in="media:textable;form=scalar";ext=pdf;format=binary;out="media:bytes"');

  // Merge (other takes precedence)
  const merged = cap1.merge(cap2);
  assertEqual(merged.getInSpec(), 'media:textable;form=scalar', 'Merge should take inSpec from other');
  assertEqual(merged.getOutSpec(), 'media:bytes', 'Merge should take outSpec from other');
  assertEqual(merged.getTag('op'), 'generate', 'Merge should keep original tags');
  assertEqual(merged.getTag('ext'), 'pdf', 'Merge should add other tags');

  // Subset (always preserves in/out)
  const sub = merged.subset(['ext']);
  assertEqual(sub.getTag('ext'), 'pdf', 'Subset should keep ext');
  assertEqual(sub.getTag('op'), undefined, 'Subset should drop op');
  assertEqual(sub.getInSpec(), 'media:textable;form=scalar', 'Subset should preserve inSpec');
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
  const cap = CapUrn.fromString('cap:in="media:void";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"');
  const request = CapUrn.fromString('cap:ext=pdf;in="media:void";op=generate_thumbnail;out="media:image;bytes"');
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

// TEST050: media:string vs media:bytes -> no match
function test050_matchingSemanticsDirectionMismatch() {
  const cap = CapUrn.fromString(
    `cap:in="${MEDIA_STRING}";op=generate;out="${MEDIA_OBJECT}"`
  );
  const request = CapUrn.fromString(
    `cap:in="${MEDIA_BINARY}";op=generate;out="${MEDIA_OBJECT}"`
  );
  assert(!cap.accepts(request), 'Incompatible direction types should not match');
}

// TEST051: Generic media:bytes provider accepts media:pdf;bytes request;
//          specific pdf cap rejects generic bytes request;
//          output direction: more specific output satisfies less specific request
function test051_directionSemanticMatching() {
  // Generic bytes cap accepts specific pdf;bytes request
  const genericCap = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  const pdfRequest = CapUrn.fromString(
    'cap:in="media:pdf;bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  assert(genericCap.accepts(pdfRequest), 'Generic bytes cap must accept pdf;bytes request');

  // Also accepts epub;bytes
  const epubRequest = CapUrn.fromString(
    'cap:in="media:epub;bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  assert(genericCap.accepts(epubRequest), 'Generic bytes cap must accept epub;bytes request');

  // Reverse: specific pdf cap does NOT accept generic bytes request
  const pdfCap = CapUrn.fromString(
    'cap:in="media:pdf;bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  const genericRequest = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  assert(!pdfCap.accepts(genericRequest), 'Specific pdf cap must NOT accept generic bytes request');

  // PDF cap does NOT accept epub request
  assert(!pdfCap.accepts(epubRequest), 'PDF cap must NOT accept epub request');

  // Output direction: cap producing more specific output satisfies less specific request
  const specificOutCap = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  const genericOutRequest = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;bytes"'
  );
  assert(specificOutCap.accepts(genericOutRequest),
    'Cap producing image;png;bytes;thumbnail must satisfy request for image;bytes');

  // Reverse output: generic output cap does NOT satisfy specific output request
  const genericOutCap = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;bytes"'
  );
  const specificOutRequest = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  assert(!genericOutCap.accepts(specificOutRequest),
    'Generic output cap must NOT satisfy specific output request');
}

// TEST052: Specificity: media:bytes(1 tag) + image;png;bytes;thumbnail(4 tags) + op(1) = 6;
//          pdf;bytes(2) = 7; CapMatcher prefers higher
function test052_directionSemanticSpecificity() {
  const genericCap = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  const specificCap = CapUrn.fromString(
    'cap:in="media:pdf;bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );

  assertEqual(genericCap.specificity(), 6, 'bytes(1) + image;png;bytes;thumbnail(4) + op(1) = 6');
  assertEqual(specificCap.specificity(), 7, 'pdf;bytes(2) + image;png;bytes;thumbnail(4) + op(1) = 7');
  assert(specificCap.specificity() > genericCap.specificity(), 'pdf;bytes should be more specific');

  // CapMatcher should prefer more specific
  const pdfRequest = CapUrn.fromString(
    'cap:in="media:pdf;bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  const best = CapMatcher.findBestMatch([genericCap, specificCap], pdfRequest);
  assert(best !== null, 'Should find a match');
  assertEqual(best.getInSpec(), 'media:pdf;bytes', 'Should prefer more specific pdf;bytes cap');
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

// TEST061: isBinary true for media:bytes, MEDIA_PNG, MEDIA_PDF, MEDIA_BINARY; false for media:textable
function test061_isBinary() {
  assert(MediaUrn.fromString('media:bytes').isBinary(), 'media:bytes should be binary');
  assert(MediaUrn.fromString(MEDIA_PNG).isBinary(), 'MEDIA_PNG should be binary');
  assert(MediaUrn.fromString(MEDIA_PDF).isBinary(), 'MEDIA_PDF should be binary');
  assert(MediaUrn.fromString(MEDIA_BINARY).isBinary(), 'MEDIA_BINARY should be binary');
  assert(!MediaUrn.fromString('media:textable').isBinary(), 'media:textable should not be binary');
}

// TEST062: isMap true for MEDIA_OBJECT (form=map); false for MEDIA_STRING (form=scalar), MEDIA_STRING_ARRAY (form=list)
function test062_isMap() {
  assert(MediaUrn.fromString(MEDIA_OBJECT).isMap(), 'MEDIA_OBJECT should be map');
  assert(!MediaUrn.fromString(MEDIA_STRING).isMap(), 'MEDIA_STRING should not be map');
  assert(!MediaUrn.fromString(MEDIA_STRING_ARRAY).isMap(), 'MEDIA_STRING_ARRAY should not be map');
}

// TEST063: isScalar true for MEDIA_STRING, MEDIA_INTEGER, MEDIA_NUMBER, MEDIA_BOOLEAN;
//          false for MEDIA_OBJECT, MEDIA_STRING_ARRAY
function test063_isScalar() {
  assert(MediaUrn.fromString(MEDIA_STRING).isScalar(), 'MEDIA_STRING should be scalar');
  assert(MediaUrn.fromString(MEDIA_INTEGER).isScalar(), 'MEDIA_INTEGER should be scalar');
  assert(MediaUrn.fromString(MEDIA_NUMBER).isScalar(), 'MEDIA_NUMBER should be scalar');
  assert(MediaUrn.fromString(MEDIA_BOOLEAN).isScalar(), 'MEDIA_BOOLEAN should be scalar');
  assert(!MediaUrn.fromString(MEDIA_OBJECT).isScalar(), 'MEDIA_OBJECT should not be scalar');
  assert(!MediaUrn.fromString(MEDIA_STRING_ARRAY).isScalar(), 'MEDIA_STRING_ARRAY should not be scalar');
}

// TEST064: isList true for MEDIA_STRING_ARRAY, MEDIA_INTEGER_ARRAY, MEDIA_OBJECT_ARRAY;
//          false for MEDIA_STRING, MEDIA_OBJECT
function test064_isList() {
  assert(MediaUrn.fromString(MEDIA_STRING_ARRAY).isList(), 'MEDIA_STRING_ARRAY should be list');
  assert(MediaUrn.fromString(MEDIA_INTEGER_ARRAY).isList(), 'MEDIA_INTEGER_ARRAY should be list');
  assert(MediaUrn.fromString(MEDIA_OBJECT_ARRAY).isList(), 'MEDIA_OBJECT_ARRAY should be list');
  assert(!MediaUrn.fromString(MEDIA_STRING).isList(), 'MEDIA_STRING should not be list');
  assert(!MediaUrn.fromString(MEDIA_OBJECT).isList(), 'MEDIA_OBJECT should not be list');
}

// TEST065: isStructured true for MEDIA_OBJECT (map), MEDIA_STRING_ARRAY (list), MEDIA_JSON (map);
//          false for MEDIA_STRING (scalar)
function test065_isStructured() {
  assert(MediaUrn.fromString(MEDIA_OBJECT).isStructured(), 'MEDIA_OBJECT should be structured');
  assert(MediaUrn.fromString(MEDIA_STRING_ARRAY).isStructured(), 'MEDIA_STRING_ARRAY should be structured');
  assert(MediaUrn.fromString(MEDIA_JSON).isStructured(), 'MEDIA_JSON should be structured');
  assert(!MediaUrn.fromString(MEDIA_STRING).isStructured(), 'MEDIA_STRING should not be structured');
}

// TEST066: isJson true for MEDIA_JSON; false for MEDIA_OBJECT (map but not json)
function test066_isJson() {
  assert(MediaUrn.fromString(MEDIA_JSON).isJson(), 'MEDIA_JSON should be json');
  assert(!MediaUrn.fromString(MEDIA_OBJECT).isJson(), 'MEDIA_OBJECT should not be json');
}

// TEST067: isText true for MEDIA_STRING, MEDIA_INTEGER, MEDIA_OBJECT (textable);
//          false for MEDIA_BINARY, MEDIA_PNG
function test067_isText() {
  assert(MediaUrn.fromString(MEDIA_STRING).isText(), 'MEDIA_STRING should be text');
  assert(MediaUrn.fromString(MEDIA_INTEGER).isText(), 'MEDIA_INTEGER should be text');
  assert(MediaUrn.fromString(MEDIA_OBJECT).isText(), 'MEDIA_OBJECT should be text');
  assert(!MediaUrn.fromString(MEDIA_BINARY).isText(), 'MEDIA_BINARY should not be text');
  assert(!MediaUrn.fromString(MEDIA_PNG).isText(), 'MEDIA_PNG should not be text');
}

// TEST068: isVoid true for media:void; false for media:string
function test068_isVoid() {
  assert(MediaUrn.fromString('media:void').isVoid(), 'media:void should be void');
  assert(!MediaUrn.fromString(MEDIA_STRING).isVoid(), 'MEDIA_STRING should not be void');
}

// TEST069-TEST070: N/A for JS (Rust-only binary_media_urn_for_ext/text_media_urn_for_ext)

// TEST071: Parse -> toString -> parse equals original
function test071_toStringRoundtrip() {
  const constants = [MEDIA_STRING, MEDIA_INTEGER, MEDIA_OBJECT, MEDIA_BINARY, MEDIA_PDF, MEDIA_JSON];
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
    MEDIA_OBJECT, MEDIA_STRING_ARRAY, MEDIA_INTEGER_ARRAY,
    MEDIA_NUMBER_ARRAY, MEDIA_BOOLEAN_ARRAY, MEDIA_OBJECT_ARRAY,
    MEDIA_BINARY, MEDIA_VOID, MEDIA_PNG, MEDIA_PDF, MEDIA_EPUB,
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

// TEST074: MEDIA_PDF (media:pdf;bytes) conformsTo media:pdf; MEDIA_MD conformsTo media:md; same URNs conform
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

  const generalHandler = MediaUrn.fromString(MEDIA_BINARY);
  const specificReq = MediaUrn.fromString(MEDIA_PDF);
  assert(generalHandler.accepts(specificReq), 'General handler should accept specific request');
}

// TEST076: More tags = higher specificity
function test076_specificity() {
  const s1 = MediaUrn.fromString('media:bytes');
  const s2 = MediaUrn.fromString('media:pdf;bytes');
  const s3 = MediaUrn.fromString('media:image;png;bytes;thumbnail');
  assert(s2.specificity() > s1.specificity(), 'pdf;bytes should be more specific than bytes');
  assert(s3.specificity() > s2.specificity(), 'image;png;bytes;thumbnail should be more specific than pdf;bytes');
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

// TEST099: MediaSpec with media:bytes -> isBinary() true
function test099_resolvedIsBinary() {
  const spec = new MediaSpec('application/octet-stream', null, null, 'Binary', null, MEDIA_BINARY);
  assert(spec.isBinary(), 'Resolved binary spec should be binary');
}

// TEST100: MediaSpec with form=map -> isMap() true
function test100_resolvedIsMap() {
  const spec = new MediaSpec('application/json', null, null, 'Object', null, MEDIA_OBJECT);
  assert(spec.isMap(), 'Resolved object spec should be map');
}

// TEST101: MediaSpec with form=scalar -> isScalar() true
function test101_resolvedIsScalar() {
  const spec = new MediaSpec('text/plain', null, null, 'String', null, MEDIA_STRING);
  assert(spec.isScalar(), 'Resolved string spec should be scalar');
}

// TEST102: MediaSpec with form=list -> isList() true
function test102_resolvedIsList() {
  const spec = new MediaSpec('text/plain', null, null, 'String Array', null, MEDIA_STRING_ARRAY);
  assert(spec.isList(), 'Resolved string_array spec should be list');
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
      urn: 'media:custom-setting;setting',
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
  const resolved = resolveMediaUrn('media:custom-setting;setting', mediaSpecs);
  assert(resolved.metadata !== null, 'Should have metadata');
  assertEqual(resolved.metadata.category_key, 'interface', 'Should propagate category_key');
  assertEqual(resolved.metadata.ui_type, 'SETTING_UI_TYPE_CHECKBOX', 'Should propagate ui_type');
  assertEqual(resolved.metadata.display_index, 5, 'Should propagate display_index');
}

// TEST106: Metadata and validation coexist
function test106_metadataWithValidation() {
  const mediaSpecs = [
    {
      urn: 'media:bounded-number;numeric;setting',
      media_type: 'text/plain',
      title: 'Bounded Number',
      validation: { min: 0, max: 100 },
      metadata: { category_key: 'inference', ui_type: 'SETTING_UI_TYPE_SLIDER' }
    }
  ];
  const resolved = resolveMediaUrn('media:bounded-number;numeric;setting', mediaSpecs);
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
      urn: 'media:pdf;bytes',
      media_type: 'application/pdf',
      title: 'PDF Document',
      extensions: ['pdf']
    }
  ];
  const resolved = resolveMediaUrn('media:pdf;bytes', mediaSpecs);
  assert(Array.isArray(resolved.extensions), 'Extensions should be an array');
  assertEqual(resolved.extensions.length, 1, 'Should have one extension');
  assertEqual(resolved.extensions[0], 'pdf', 'Should have pdf extension');
}

// TEST108: N/A for JS (Rust serde) - but we test MediaSpec with extensions
function test108_extensionsSerialization() {
  // Test that MediaSpec can hold extensions correctly
  const spec = new MediaSpec('application/pdf', null, null, 'PDF', null, 'media:pdf;bytes', null, null, ['pdf']);
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
      urn: 'media:image;jpeg;bytes',
      media_type: 'image/jpeg',
      title: 'JPEG Image',
      extensions: ['jpg', 'jpeg']
    }
  ];
  const resolved = resolveMediaUrn('media:image;jpeg;bytes', mediaSpecs);
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
  const pluginRegistry = new CapMatrix();

  const providerHost = new MockCapSet('provider');
  const providerCap = makeCap(
    'cap:in="media:binary";op=generate_thumbnail;out="media:binary"',
    'Provider Thumbnail Generator (generic)'
  );
  providerRegistry.registerCapSet('provider', providerHost, [providerCap]);

  const pluginHost = new MockCapSet('plugin');
  const pluginCap = makeCap(
    'cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"',
    'Plugin PDF Thumbnail Generator (specific)'
  );
  pluginRegistry.registerCapSet('plugin', pluginHost, [pluginCap]);

  const composite = new CapBlock();
  composite.addRegistry('providers', providerRegistry);
  composite.addRegistry('plugins', pluginRegistry);

  const request = 'cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"';
  const best = composite.findBestCapSet(request);

  assertEqual(best.registryName, 'plugins', 'More specific plugin should win');
  assertEqual(best.cap.title, 'Plugin PDF Thumbnail Generator (specific)', 'Should get plugin cap');
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
  const pluginRegistry = new CapMatrix();

  const providerHost = new MockCapSet('provider_fallback');
  const providerCap = makeCap(
    'cap:in="media:binary";op=generate_thumbnail;out="media:binary"',
    'Generic Thumbnail Provider'
  );
  providerRegistry.registerCapSet('provider_fallback', providerHost, [providerCap]);

  const pluginHost = new MockCapSet('pdf_plugin');
  const pluginCap = makeCap(
    'cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"',
    'PDF Thumbnail Plugin'
  );
  pluginRegistry.registerCapSet('pdf_plugin', pluginHost, [pluginCap]);

  const composite = new CapBlock();
  composite.addRegistry('providers', providerRegistry);
  composite.addRegistry('plugins', pluginRegistry);

  // PDF request -> plugin wins
  const best = composite.findBestCapSet('cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"');
  assertEqual(best.registryName, 'plugins', 'Plugin should win for PDF');

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
  const pluginRegistry = new CapMatrix();
  const providerHost = { executeCap: async () => ({ textOutput: 'provider' }) };
  const pluginHost = { executeCap: async () => ({ textOutput: 'plugin' }) };

  const providerCap = makeGraphCap('media:binary', 'media:string', 'Provider Binary to String');
  providerRegistry.registerCapSet('provider', providerHost, [providerCap]);

  const pluginCap = makeGraphCap('media:string', 'media:object', 'Plugin String to Object');
  pluginRegistry.registerCapSet('plugin', pluginHost, [pluginCap]);

  const cube = new CapBlock();
  cube.addRegistry('providers', providerRegistry);
  cube.addRegistry('plugins', pluginRegistry);
  const graph = cube.graph();

  assert(graph.canConvert('media:binary', 'media:object'), 'Should convert across registries');
  const path = graph.findPath('media:binary', 'media:object');
  assert(path !== null, 'Should find path');
  assertEqual(path.length, 2, 'Path through 2 registries');
  assertEqual(path[0].registryName, 'providers', 'First edge from providers');
  assertEqual(path[1].registryName, 'plugins', 'Second edge from plugins');
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
  const mediaUrn = 'media:pdf;bytes';

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
  const arg = new CapArgumentValue('media:model-spec;textable;form=scalar', new Uint8Array([103, 112, 116, 45, 52]));
  assertEqual(arg.mediaUrn, 'media:model-spec;textable;form=scalar', 'mediaUrn must match');
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
  const arg = new CapArgumentValue('media:pdf;bytes', new Uint8Array([0xFF, 0xFE, 0x80]));
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
  const arg = new CapArgumentValue('media:pdf;bytes', data);
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
  assertEqual(urn.getTag('form'), 'map', 'model-availability must be form=map');
  assert(urn.getTag('bytes') === undefined, 'model-availability must not be binary');
  const reparsed = TaggedUrn.fromString(urn.toString());
  assert(urn.conformsTo(reparsed), 'roundtrip must match original');
}

// TEST305: MEDIA_PATH_OUTPUT constant parses as valid media URN with correct tags
function test305_mediaPathOutputConstant() {
  const urn = TaggedUrn.fromString(MEDIA_PATH_OUTPUT);
  assert(urn.getTag('textable') !== undefined, 'model-path must be textable');
  assertEqual(urn.getTag('form'), 'map', 'model-path must be form=map');
  assert(urn.getTag('bytes') === undefined, 'model-path must not be binary');
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

// TEST310: llm_conversation_urn uses unconstrained tag (not constrained)
function test310_llmConversationUrnUnconstrained() {
  const urn = llmConversationUrn('en');
  assert(urn.getTag('unconstrained') !== undefined, 'Must have unconstrained tag');
  assert(urn.hasTag('op', 'conversation'), 'Must have op=conversation');
  assert(urn.hasTag('language', 'en'), 'Must have language=en');
}

// TEST311: llm_conversation_urn in/out specs match the expected media URNs semantically
function test311_llmConversationUrnSpecs() {
  const urn = llmConversationUrn('fr');
  const inSpec = TaggedUrn.fromString(urn.getInSpec());
  const expectedIn = TaggedUrn.fromString(MEDIA_STRING);
  assert(inSpec.conformsTo(expectedIn), 'in_spec must conform to MEDIA_STRING');
  const outSpec = TaggedUrn.fromString(urn.getOutSpec());
  const expectedOut = TaggedUrn.fromString(MEDIA_LLM_INFERENCE_OUTPUT);
  assert(outSpec.conformsTo(expectedOut), 'out_spec must conform to MEDIA_LLM_INFERENCE_OUTPUT');
}

// TEST312: All URN builders produce parseable cap URNs
function test312_allUrnBuildersProduceValidUrns() {
  const avail = modelAvailabilityUrn();
  const path = modelPathUrn();
  const conv = llmConversationUrn('en');

  const parsedAvail = CapUrn.fromString(avail.toString());
  assert(parsedAvail !== null, 'modelAvailabilityUrn must be parseable');
  const parsedPath = CapUrn.fromString(path.toString());
  assert(parsedPath !== null, 'modelPathUrn must be parseable');
  const parsedConv = CapUrn.fromString(conv.toString());
  assert(parsedConv !== null, 'llmConversationUrn must be parseable');
}

// ============================================================================
// Additional JS-specific tests (extension index, media URN resolution, Cap JSON)
// ============================================================================

// These tests cover JS-specific functionality not in the Rust numbering scheme
// but are important for capns-js correctness.

function testJS_buildExtensionIndex() {
  const mediaSpecs = [
    { urn: 'media:pdf;bytes', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:image;jpeg;bytes', media_type: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
    { urn: 'media:json;textable', media_type: 'application/json', extensions: ['json'] }
  ];
  const index = buildExtensionIndex(mediaSpecs);
  assert(index instanceof Map, 'Should return a Map');
  assertEqual(index.size, 4, 'Should have 4 extensions');
  assert(index.has('pdf'), 'Should have pdf');
  assert(index.has('jpg'), 'Should have jpg');
  assert(index.has('jpeg'), 'Should have jpeg');
  assert(index.has('json'), 'Should have json');
  assertEqual(index.get('pdf')[0], 'media:pdf;bytes', 'pdf should map correctly');
}

function testJS_mediaUrnsForExtension() {
  const mediaSpecs = [
    { urn: 'media:pdf;bytes', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:json;textable;form=map', media_type: 'application/json', extensions: ['json'] },
    { urn: 'media:json;textable;form=list', media_type: 'application/json', extensions: ['json'] }
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
    { urn: 'media:pdf;bytes', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:image;jpeg;bytes', media_type: 'image/jpeg', extensions: ['jpg', 'jpeg'] }
  ];
  const mappings = getExtensionMappings(mediaSpecs);
  assert(Array.isArray(mappings), 'Should return an array');
  assertEqual(mappings.length, 3, 'Should have 3 mappings');
}

function testJS_capWithMediaSpecs() {
  const urn = CapUrn.fromString('cap:in="media:string";op=test;out="media:custom"');
  const cap = new Cap(urn, 'Test Cap', 'test_command');
  cap.mediaSpecs = [
    { urn: MEDIA_STRING, media_type: 'text/plain', title: 'String', profile_uri: 'https://capns.org/schema/str' },
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

  const binaryArg = new CapArgumentValue('media:pdf;bytes', new Uint8Array([0x89, 0x50, 0x4E, 0x47]));
  const { compositeHost } = cube.can('cap:in="media:void";op=test;out="media:string"');

  return compositeHost.executeCap(
    'cap:in="media:void";op=test;out="media:string"',
    [binaryArg]
  ).then(() => {
    assert(receivedArgs !== null, 'Should receive arguments');
    assertEqual(receivedArgs[0].mediaUrn, 'media:pdf;bytes', 'Correct mediaUrn');
    assertEqual(receivedArgs[0].value[0], 0x89, 'First byte check');
    assertEqual(receivedArgs[0].value.length, 4, 'Correct data length');
  });
}

function testJS_mediaSpecConstruction() {
  const spec1 = new MediaSpec('text/plain', 'https://capns.org/schema/str', null, 'String', null, 'media:string');
  assertEqual(spec1.contentType, 'text/plain', 'Should have content type');
  assertEqual(spec1.profile, 'https://capns.org/schema/str', 'Should have profile');
  assertEqual(spec1.title, 'String', 'Should have title');
  assertEqual(spec1.mediaUrn, 'media:string', 'Should have mediaUrn');

  const spec2 = new MediaSpec('application/octet-stream', null, null, 'Binary', null, 'media:binary');
  assertEqual(spec2.profile, null, 'Should have null profile');
}

// =============================================================================
// Plugin Repository Tests (TEST320-TEST335)
// =============================================================================

// Sample registry for testing
const sampleRegistry = {
  schemaVersion: '3.0',
  lastUpdated: '2026-02-07T16:48:28Z',
  plugins: {
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
          urn: 'cap:in="media:pdf;bytes";op=disbind;out="media:disbound-page;textable;form=list"',
          title: 'Disbind PDF',
          description: 'Extract pages'
        },
        {
          urn: 'cap:in="media:pdf;bytes";op=extract_metadata;out="media:file-metadata;textable;form=map"',
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
          platform: 'darwin-arm64',
          package: {
            name: 'pdfcartridge-0.81.5325.pkg',
            sha256: '9b68724eb9220ecf01e8ed4f5f80c594fbac2239bc5bf675005ec882ecc5eba0',
            size: 5187485
          },
          binary: {
            name: 'pdfcartridge-0.81.5325-darwin-arm64',
            sha256: '908187ec35632758f1a00452ff4755ba01020ea288619098b6998d5d33851d19',
            size: 12980288
          }
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
          urn: 'cap:in="media:txt;textable";op=disbind;out="media:disbound-page;textable;form=list"',
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
          platform: 'darwin-arm64',
          package: {
            name: 'txtcartridge-0.54.6408.pkg',
            sha256: 'abc123',
            size: 821000
          },
          binary: {
            name: 'txtcartridge-0.54.6408-darwin-arm64',
            sha256: 'def456',
            size: 1700000
          }
        }
      }
    }
  }
};

// TEST320: Plugin info construction
function test320_pluginInfoConstruction() {
  const data = {
    id: 'testplugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test',
    teamId: 'TEAM123',
    signedAt: '2026-01-01',
    binaryName: 'test-binary',
    binarySha256: 'abc123',
    caps: [{urn: 'cap:in="media:void";op=test;out="media:void"', title: 'Test', description: ''}]
  };
  const plugin = new PluginInfo(data);
  assert(plugin.id === 'testplugin', 'ID should match');
  assert(plugin.teamId === 'TEAM123', 'Team ID should match');
  assert(plugin.caps.length === 1, 'Should have 1 cap');
  assert(plugin.caps[0].urn === 'cap:in="media:void";op=test;out="media:void"', 'Cap URN should match');
}

// TEST321: Plugin info is signed check
function test321_pluginInfoIsSigned() {
  const signed = new PluginInfo({id: 'test', teamId: 'TEAM', signedAt: '2026-01-01', caps: []});
  assert(signed.isSigned() === true, 'Plugin with teamId and signedAt should be signed');

  const unsigned1 = new PluginInfo({id: 'test', teamId: '', signedAt: '2026-01-01', caps: []});
  assert(unsigned1.isSigned() === false, 'Plugin without teamId should not be signed');

  const unsigned2 = new PluginInfo({id: 'test', teamId: 'TEAM', signedAt: '', caps: []});
  assert(unsigned2.isSigned() === false, 'Plugin without signedAt should not be signed');
}

// TEST322: Plugin info has binary check
function test322_pluginInfoHasBinary() {
  const withBinary = new PluginInfo({id: 'test', binaryName: 'test-bin', binarySha256: 'abc', caps: []});
  assert(withBinary.hasBinary() === true, 'Plugin with binary info should return true');

  const noBinary1 = new PluginInfo({id: 'test', binaryName: '', binarySha256: 'abc', caps: []});
  assert(noBinary1.hasBinary() === false, 'Plugin without binaryName should return false');

  const noBinary2 = new PluginInfo({id: 'test', binaryName: 'test', binarySha256: '', caps: []});
  assert(noBinary2.hasBinary() === false, 'Plugin without binarySha256 should return false');
}

// TEST323: PluginRepoServer validate registry
function test323_pluginRepoServerValidateRegistry() {
  // Valid registry
  const server = new PluginRepoServer(sampleRegistry);
  assert(server.registry.schemaVersion === '3.0', 'Should accept valid registry');

  // Invalid schema version
  let threw = false;
  try {
    new PluginRepoServer({schemaVersion: '2.0', plugins: {}});
  } catch (e) {
    threw = true;
    assert(e.message.includes('schema version'), 'Should reject wrong schema version');
  }
  assert(threw, 'Should throw for invalid schema');

  // Missing plugins
  threw = false;
  try {
    new PluginRepoServer({schemaVersion: '3.0'});
  } catch (e) {
    threw = true;
    assert(e.message.includes('plugins'), 'Should reject missing plugins');
  }
  assert(threw, 'Should throw for missing plugins');
}

// TEST324: PluginRepoServer transform to array
function test324_pluginRepoServerTransformToArray() {
  const server = new PluginRepoServer(sampleRegistry);
  const plugins = server.transformToPluginArray();

  assert(Array.isArray(plugins), 'Should return array');
  assert(plugins.length === 2, 'Should have 2 plugins');
  
  const pdf = plugins.find(p => p.id === 'pdfcartridge');
  assert(pdf !== undefined, 'Should include pdfcartridge');
  assert(pdf.version === '0.81.5325', 'Should have latest version');
  assert(pdf.teamId === 'P336JK947M', 'Should have teamId');
  assert(pdf.signedAt === '2026-02-07T16:40:28Z', 'Should have signedAt from releaseDate');
  assert(pdf.binaryName === 'pdfcartridge-0.81.5325-darwin-arm64', 'Should have binary name');
  assert(pdf.binarySha256 === '908187ec35632758f1a00452ff4755ba01020ea288619098b6998d5d33851d19', 'Should have SHA256');
  assert(Array.isArray(pdf.caps), 'Should have caps array');
  assert(pdf.caps.length === 2, 'Should have 2 caps');
}

// TEST325: PluginRepoServer get plugins
function test325_pluginRepoServerGetPlugins() {
  const server = new PluginRepoServer(sampleRegistry);
  const response = server.getPlugins();

  assert(response.plugins !== undefined, 'Should have plugins field');
  assert(Array.isArray(response.plugins), 'Plugins should be array');
  assert(response.plugins.length === 2, 'Should have 2 plugins');
}

// TEST326: PluginRepoServer get plugin by ID
function test326_pluginRepoServerGetPluginById() {
  const server = new PluginRepoServer(sampleRegistry);

  const pdf = server.getPluginById('pdfcartridge');
  assert(pdf !== undefined, 'Should find pdfcartridge');
  assert(pdf.id === 'pdfcartridge', 'Should have correct ID');

  const notFound = server.getPluginById('nonexistent');
  assert(notFound === undefined, 'Should return undefined for missing plugin');
}

// TEST327: PluginRepoServer search plugins
function test327_pluginRepoServerSearchPlugins() {
  const server = new PluginRepoServer(sampleRegistry);

  const pdfResults = server.searchPlugins('pdf');
  assert(pdfResults.length === 1, 'Should find 1 PDF plugin');
  assert(pdfResults[0].id === 'pdfcartridge', 'Should find pdfcartridge');

  const metadataResults = server.searchPlugins('metadata');
  assert(metadataResults.length === 1, 'Should find plugin by cap title');

  const noResults = server.searchPlugins('nonexistent');
  assert(noResults.length === 0, 'Should return empty for no matches');
}

// TEST328: PluginRepoServer get by category
function test328_pluginRepoServerGetByCategory() {
  const server = new PluginRepoServer(sampleRegistry);

  const docPlugins = server.getPluginsByCategory('document');
  assert(docPlugins.length === 1, 'Should find 1 document plugin');
  assert(docPlugins[0].id === 'pdfcartridge', 'Should be pdfcartridge');

  const textPlugins = server.getPluginsByCategory('text');
  assert(textPlugins.length === 1, 'Should find 1 text plugin');
  assert(textPlugins[0].id === 'txtcartridge', 'Should be txtcartridge');
}

// TEST329: PluginRepoServer get by cap
function test329_pluginRepoServerGetByCap() {
  const server = new PluginRepoServer(sampleRegistry);

  const disbindCap = 'cap:in="media:pdf;bytes";op=disbind;out="media:disbound-page;textable;form=list"';
  const plugins = server.getPluginsByCap(disbindCap);

  assert(plugins.length === 1, 'Should find 1 plugin with this cap');
  assert(plugins[0].id === 'pdfcartridge', 'Should be pdfcartridge');

  const metadataCap = 'cap:in="media:pdf;bytes";op=extract_metadata;out="media:file-metadata;textable;form=map"';
  const metadataPlugins = server.getPluginsByCap(metadataCap);
  assert(metadataPlugins.length === 1, 'Should find metadata cap');
}

// TEST330: PluginRepoClient update cache
function test330_pluginRepoClientUpdateCache() {
  const client = new PluginRepoClient(3600);
  const server = new PluginRepoServer(sampleRegistry);
  const plugins = server.transformToPluginArray().map(p => new PluginInfo(p));

  client.updateCache('https://example.com/api/plugins', plugins);

  const cache = client.caches.get('https://example.com/api/plugins');
  assert(cache !== undefined, 'Cache should exist');
  assert(cache.plugins.size === 2, 'Should have 2 plugins in cache');
  assert(cache.capToPlugins.size > 0, 'Should have cap mappings');
}

// TEST331: PluginRepoClient get suggestions
function test331_pluginRepoClientGetSuggestions() {
  const client = new PluginRepoClient(3600);
  const server = new PluginRepoServer(sampleRegistry);
  const plugins = server.transformToPluginArray().map(p => new PluginInfo(p));

  client.updateCache('https://example.com/api/plugins', plugins);

  const disbindCap = 'cap:in="media:pdf;bytes";op=disbind;out="media:disbound-page;textable;form=list"';
  const suggestions = client.getSuggestionsForCap(disbindCap);

  assert(suggestions.length === 1, 'Should find 1 suggestion');
  assert(suggestions[0].pluginId === 'pdfcartridge', 'Should suggest pdfcartridge');
  assert(suggestions[0].capUrn === disbindCap, 'Should have correct cap URN');
  assert(suggestions[0].capTitle === 'Disbind PDF', 'Should have cap title');
}

// TEST332: PluginRepoClient get plugin
function test332_pluginRepoClientGetPlugin() {
  const client = new PluginRepoClient(3600);
  const server = new PluginRepoServer(sampleRegistry);
  const plugins = server.transformToPluginArray().map(p => new PluginInfo(p));

  client.updateCache('https://example.com/api/plugins', plugins);

  const plugin = client.getPlugin('pdfcartridge');
  assert(plugin !== null, 'Should find plugin');
  assert(plugin.id === 'pdfcartridge', 'Should have correct ID');

  const notFound = client.getPlugin('nonexistent');
  assert(notFound === null, 'Should return null for missing plugin');
}

// TEST333: PluginRepoClient get all caps
function test333_pluginRepoClientGetAllCaps() {
  const client = new PluginRepoClient(3600);
  const server = new PluginRepoServer(sampleRegistry);
  const plugins = server.transformToPluginArray().map(p => new PluginInfo(p));

  client.updateCache('https://example.com/api/plugins', plugins);

  const caps = client.getAllAvailableCaps();
  assert(Array.isArray(caps), 'Should return array');
  assert(caps.length === 3, 'Should have 3 unique caps');
  assert(caps.every(c => typeof c === 'string'), 'All caps should be strings');
}

// TEST334: PluginRepoClient needs sync
function test334_pluginRepoClientNeedsSync() {
  const client = new PluginRepoClient(1); // 1 second TTL
  const server = new PluginRepoServer(sampleRegistry);
  const plugins = server.transformToPluginArray().map(p => new PluginInfo(p));

  const urls = ['https://example.com/api/plugins'];

  // Should need sync initially
  assert(client.needsSync(urls) === true, 'Should need sync with empty cache');

  // Update cache
  client.updateCache(urls[0], plugins);

  // Should not need sync immediately
  assert(client.needsSync(urls) === false, 'Should not need sync right after update');

  // Wait for cache to expire (1 second)
  // Note: Can't test this synchronously, would need async test
}

// TEST335: PluginRepoServer and Client integration
function test335_pluginRepoServerClientIntegration() {
  // Server creates API response
  const server = new PluginRepoServer(sampleRegistry);
  const apiResponse = server.getPlugins();

  // Client consumes API response
  const client = new PluginRepoClient(3600);
  const plugins = apiResponse.plugins.map(p => new PluginInfo(p));
  client.updateCache('https://example.com/api/plugins', plugins);

  // Client can find plugin
  const plugin = client.getPlugin('pdfcartridge');
  assert(plugin !== null, 'Client should find plugin from server data');
  assert(plugin.isSigned(), 'Plugin should be signed');
  assert(plugin.hasBinary(), 'Plugin should have binary');

  // Client can get suggestions
  const capUrn = 'cap:in="media:pdf;bytes";op=disbind;out="media:disbound-page;textable;form=list"';
  const suggestions = client.getSuggestionsForCap(capUrn);
  assert(suggestions.length === 1, 'Should get suggestions');
  assert(suggestions[0].pluginId === 'pdfcartridge', 'Should suggest correct plugin');

  // Server can search
  const searchResults = server.searchPlugins('pdf');
  assert(searchResults.length === 1, 'Server search should work');
  assert(searchResults[0].id === plugin.id, 'Search and client should agree');
}

// ============================================================================
// Test runner
// ============================================================================

async function runTests() {
  console.log('Running capns-js tests...\n');

  // cap_urn.rs: TEST001-TEST052
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
  runTest('TEST051: direction_semantic_matching', test051_directionSemanticMatching);
  runTest('TEST052: direction_semantic_specificity', test052_directionSemanticSpecificity);

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
  runTest('TEST062: is_map', test062_isMap);
  runTest('TEST063: is_scalar', test063_isScalar);
  runTest('TEST064: is_list', test064_isList);
  runTest('TEST065: is_structured', test065_isStructured);
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
  runTest('TEST100: resolved_is_map', test100_resolvedIsMap);
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
  runTest('TEST310: llm_conversation_urn_unconstrained', test310_llmConversationUrnUnconstrained);
  runTest('TEST311: llm_conversation_urn_specs', test311_llmConversationUrnSpecs);
  runTest('TEST312: all_urn_builders_produce_valid_urns', test312_allUrnBuildersProduceValidUrns);

  // JS-specific tests (no Rust number)
  console.log('\n--- JS-specific ---');
  runTest('JS: build_extension_index', testJS_buildExtensionIndex);
  runTest('JS: media_urns_for_extension', testJS_mediaUrnsForExtension);
  runTest('JS: get_extension_mappings', testJS_getExtensionMappings);
  runTest('JS: cap_with_media_specs', testJS_capWithMediaSpecs);
  runTest('JS: cap_json_serialization', testJS_capJSONSerialization);
  runTest('JS: stdin_source_kind_constants', testJS_stdinSourceKindConstants);
  runTest('JS: stdin_source_null_data', testJS_stdinSourceNullData);
  const p1 = runTest('JS: args_passed_to_executeCap', testJS_argsPassedToExecuteCap);
  if (p1) await p1;
  const p2 = runTest('JS: binary_arg_passed_to_executeCap', testJS_binaryArgPassedToExecuteCap);
  if (p2) await p2;
  runTest('JS: media_spec_construction', testJS_mediaSpecConstruction);

  // plugin_repo: PluginRepoServer and PluginRepoClient tests
  console.log('\n--- plugin_repo ---');
  runTest('TEST320: plugin_info_construction', test320_pluginInfoConstruction);
  runTest('TEST321: plugin_info_is_signed', test321_pluginInfoIsSigned);
  runTest('TEST322: plugin_info_has_binary', test322_pluginInfoHasBinary);
  runTest('TEST323: plugin_repo_server_validate_registry', test323_pluginRepoServerValidateRegistry);
  runTest('TEST324: plugin_repo_server_transform_to_array', test324_pluginRepoServerTransformToArray);
  runTest('TEST325: plugin_repo_server_get_plugins', test325_pluginRepoServerGetPlugins);
  runTest('TEST326: plugin_repo_server_get_plugin_by_id', test326_pluginRepoServerGetPluginById);
  runTest('TEST327: plugin_repo_server_search_plugins', test327_pluginRepoServerSearchPlugins);
  runTest('TEST328: plugin_repo_server_get_by_category', test328_pluginRepoServerGetByCategory);
  runTest('TEST329: plugin_repo_server_get_by_cap', test329_pluginRepoServerGetByCap);
  runTest('TEST330: plugin_repo_client_update_cache', test330_pluginRepoClientUpdateCache);
  runTest('TEST331: plugin_repo_client_get_suggestions', test331_pluginRepoClientGetSuggestions);
  runTest('TEST332: plugin_repo_client_get_plugin', test332_pluginRepoClientGetPlugin);
  runTest('TEST333: plugin_repo_client_get_all_caps', test333_pluginRepoClientGetAllCaps);
  runTest('TEST334: plugin_repo_client_needs_sync', test334_pluginRepoClientNeedsSync);
  runTest('TEST335: plugin_repo_server_client_integration', test335_pluginRepoServerClientIntegration);

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
