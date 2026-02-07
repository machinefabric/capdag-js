// Cap URN JavaScript Test Suite
// Tests all the same rules as Rust, Go, and Objective-C implementations

const {
  CapUrn,
  CapUrnBuilder,
  CapMatcher,
  CapUrnError,
  ErrorCodes,
  Cap,
  MediaSpec,
  MediaSpecError,
  MediaSpecErrorCodes,
  resolveMediaUrn,
  buildExtensionIndex,
  mediaUrnsForExtension,
  getExtensionMappings,
  // CapMatrix and CapCube
  CapMatrixError,
  CapMatrix,
  BestCapSetMatch,
  CompositeCapSet,
  CapCube,
  // CapGraph
  CapGraphEdge,
  CapGraphStats,
  CapGraph,
  // StdinSource
  StdinSource,
  StdinSourceKind,
  // XV5 validation
  validateNoMediaSpecRedefinitionSync,
  // Unified argument type
  CapArgumentValue,
  // Standard cap URN builders
  llmConversationUrn,
  modelAvailabilityUrn,
  modelPathUrn,
  // Media URN constants (from capns.js)
  MEDIA_STRING: CAPNS_MEDIA_STRING,
  MEDIA_VOID: CAPNS_MEDIA_VOID,
  MEDIA_OBJECT: CAPNS_MEDIA_OBJECT,
  MEDIA_MODEL_SPEC: CAPNS_MEDIA_MODEL_SPEC,
  MEDIA_AVAILABILITY_OUTPUT,
  MEDIA_PATH_OUTPUT,
  MEDIA_LLM_INFERENCE_OUTPUT
} = require('./capns.js');

// Media URN constants (previously exported from capns.js as built-ins)
const MEDIA_STRING = 'media:string';
const MEDIA_INTEGER = 'media:integer';
const MEDIA_NUMBER = 'media:number';
const MEDIA_BOOLEAN = 'media:boolean';
const MEDIA_OBJECT = 'media:object';
const MEDIA_BINARY = 'media:binary';
const MEDIA_VOID = 'media:void';

// Media spec definitions for tests (array format - each spec has its own urn)
const TEST_MEDIA_SPECS = [
  { urn: MEDIA_STRING, media_type: 'text/plain', title: 'String', profile_uri: 'https://capns.org/schema/str' },
  { urn: MEDIA_INTEGER, media_type: 'text/plain', title: 'Integer', profile_uri: 'https://capns.org/schema/int' },
  { urn: MEDIA_OBJECT, media_type: 'application/json', title: 'Object', profile_uri: 'https://capns.org/schema/obj' },
  { urn: MEDIA_BINARY, media_type: 'application/octet-stream', title: 'Binary' }
];

// Test assertion utility
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected: ${expected}, Actual: ${actual}`);
  }
}

function assertThrows(fn, expectedErrorCode, message) {
  try {
    fn();
    throw new Error(`Expected error but function succeeded: ${message}`);
  } catch (error) {
    if (error instanceof CapUrnError && error.code === expectedErrorCode) {
      return; // Expected error
    }
    throw new Error(`Expected CapUrnError with code ${expectedErrorCode} but got: ${error.message}`);
  }
}

/**
 * Helper function to build test URNs with required in/out media URNs
 * Uses media:void (1 tag) for in and media:form=map;textable (2 tags) for out
 * to match the Rust reference test_urn helper.
 * @param {string} tags - Additional tags to add (empty string for minimal URN)
 * @returns {string} A valid cap URN string with in/out
 */
function testUrn(tags) {
  if (!tags || tags === '') {
    return 'cap:in="media:void";out="media:form=map;textable"';
  }
  return 'cap:in="media:void";out="media:form=map;textable";' + tags;
}

// Test suite - defined at the end of file

// TEST001: Test that cap URN is created with tags parsed correctly and direction specs accessible
function testCapUrnCreation() {
  console.log('Testing Cap URN creation...');

  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf;target=thumbnail'));
  assertEqual(cap.getTag('op'), 'generate', 'Should get action tag');
  assertEqual(cap.getTag('target'), 'thumbnail', 'Should get target tag');
  assertEqual(cap.getTag('ext'), 'pdf', 'Should get ext tag');
  assertEqual(cap.getInSpec(), 'media:void', 'Should get inSpec');
  assertEqual(cap.getOutSpec(), 'media:form=map;textable', 'Should get outSpec');

  console.log('  ✓ Cap URN creation');
}

// TEST002: Test that tag keys and values are normalized to lowercase for case-insensitive comparison
function testCaseInsensitive() {
  console.log('Testing case insensitive behavior...');

  // Test that different casing produces the same URN
  const cap1 = CapUrn.fromString('cap:IN="media:void";OUT="media:form=map;textable";OP=Generate;EXT=PDF;Target=Thumbnail');
  const cap2 = CapUrn.fromString(testUrn('op=generate;ext=pdf;target=thumbnail'));

  // Both should be normalized to lowercase
  assertEqual(cap1.getTag('op'), 'generate', 'Should normalize op to lowercase');
  assertEqual(cap1.getTag('ext'), 'pdf', 'Should normalize ext to lowercase');
  assertEqual(cap1.getTag('target'), 'thumbnail', 'Should normalize target to lowercase');

  // URNs should be identical after normalization
  assertEqual(cap1.toString(), cap2.toString(), 'URNs should be equal after normalization');

  // PartialEq should work correctly - URNs with different case should be equal
  assert(cap1.equals(cap2), 'URNs with different case should be equal');

  // Case-insensitive tag lookup should work
  assertEqual(cap1.getTag('OP'), 'generate', 'Should lookup with case-insensitive key');
  assertEqual(cap1.getTag('Op'), 'generate', 'Should lookup with mixed case key');
  assert(cap1.hasTag('op', 'generate'), 'Should match with case-insensitive comparison');
  assert(cap1.hasTag('OP', 'generate'), 'Should match with case-insensitive comparison');

  // Case-insensitive in/out lookup
  assertEqual(cap1.getTag('IN'), 'media:void', 'Should lookup in with case-insensitive key');
  assertEqual(cap1.getTag('OUT'), 'media:form=map;textable', 'Should lookup out with case-insensitive key');

  // Accepting should work case-insensitively
  assert(cap1.accepts(cap2), 'Should accept case-insensitively');
  assert(cap2.accepts(cap1), 'Should accept case-insensitively');

  console.log('  ✓ Case insensitive behavior');
}

// TEST003: Test that URN without cap prefix is rejected with MISSING_CAP_PREFIX error
function testCapPrefixRequired() {
  console.log('Testing cap: prefix requirement...');

  // Missing cap: prefix should fail
  assertThrows(
    () => CapUrn.fromString('in="media:void";out="media:object";op=generate'),
    ErrorCodes.MISSING_CAP_PREFIX,
    'Should require cap: prefix'
  );

  // Valid cap: prefix should work
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assertEqual(cap.getTag('op'), 'generate', 'Should parse with valid cap: prefix');

  console.log('  ✓ Cap prefix requirement');
}

// TEST004: Test that URNs with and without trailing semicolon are equivalent
function testTrailingSemicolonEquivalence() {
  console.log('Testing trailing semicolon equivalence...');

  // Both with and without trailing semicolon should be equivalent
  const cap1 = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const cap2 = CapUrn.fromString(testUrn('op=generate;ext=pdf') + ';');

  // They should be equal
  assert(cap1.equals(cap2), 'Should be equal with/without trailing semicolon');

  // They should have same string representation (canonical form)
  assertEqual(cap1.toString(), cap2.toString(), 'Should have same canonical form');

  // They should accept each other
  assert(cap1.accepts(cap2), 'Should accept each other');
  assert(cap2.accepts(cap1), 'Should accept each other');

  console.log('  ✓ Trailing semicolon equivalence');
}

// TEST005: Test that toString produces canonical form with alphabetically sorted tags
function testCanonicalStringFormat() {
  console.log('Testing canonical string format...');

  const cap = CapUrn.fromString(testUrn('op=generate;target=thumbnail;ext=pdf'));
  // Should be sorted alphabetically and have no trailing semicolon in canonical form
  // in/out are included in alphabetical order: 'ext' < 'in' < 'op' < 'out' < 'target'
  // Values with '=' need quoting - media:form=map requires quotes
  assertEqual(cap.toString(), 'cap:ext=pdf;in=media:void;op=generate;out="media:form=map;textable";target=thumbnail', 'Should be alphabetically sorted');

  console.log('  ✓ Canonical string format');
}

// TEST006: Test that cap matches request with exact tags, subset tags, and wildcards
function testTagMatching() {
  console.log('Testing tag matching...');

  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf;target=thumbnail'));

  // Exact match
  const request1 = CapUrn.fromString(testUrn('op=generate;ext=pdf;target=thumbnail'));
  assert(cap.accepts(request1), 'Should accept exact request');

  // Subset match (other tags)
  const request2 = CapUrn.fromString(testUrn('op=generate'));
  assert(cap.accepts(request2), 'Should accept subset request');

  // Wildcard request should match specific cap
  const request3 = CapUrn.fromString(testUrn('ext=*'));
  assert(cap.accepts(request3), 'Should accept wildcard request');

  // No match - conflicting value
  const request4 = CapUrn.fromString(testUrn('op=extract'));
  assert(!cap.accepts(request4), 'Should not accept conflicting value');

  // Direction must match
  const request5 = CapUrn.fromString('cap:in="media:string";out="media:object";op=generate');
  assert(!cap.accepts(request5), 'Should not accept different inSpec');

  console.log('  ✓ Tag matching');
}

// TEST007: Test that missing tags are treated as wildcards for matching
function testMissingTagHandling() {
  console.log('Testing missing tag handling...');

  const cap = CapUrn.fromString(testUrn('op=generate'));

  // Request with tag should match cap without tag (treated as wildcard)
  const request1 = CapUrn.fromString(testUrn('ext=pdf'));
  assert(cap.accepts(request1), 'Should accept when cap has missing tag (wildcard)');

  // But cap with extra tags can accept subset requests
  const cap2 = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request2 = CapUrn.fromString(testUrn('op=generate'));
  assert(cap2.accepts(request2), 'Should accept subset request');

  console.log('  ✓ Missing tag handling');
}

// TEST008: Test that specificity counts non-wildcard tags including in and out
// TEST020: Test specificity calculation (direction specs use MediaUrn tag count, wildcards don't count)
function testSpecificity() {
  console.log('Testing specificity...');

  // Direction specs contribute their MediaUrn tag count:
  // media:void = 1 tag (void)
  // media:form=map;textable = 2 tags (form, textable)
  const cap1 = CapUrn.fromString(testUrn('type=general'));
  const cap2 = CapUrn.fromString(testUrn('op=generate'));
  const cap3 = CapUrn.fromString(testUrn('op=*;ext=pdf'));

  assertEqual(cap1.specificity(), 4, 'void(1) + textable+form(2) + type(1) = 4');
  assertEqual(cap2.specificity(), 4, 'void(1) + textable+form(2) + op(1) = 4');
  assertEqual(cap3.specificity(), 4, 'void(1) + textable+form(2) + ext(1) = 4 (wildcard op does not count)');

  // Wildcard in direction doesn't count
  const cap4 = CapUrn.fromString('cap:in=*;out="media:form=map;textable";op=test');
  assertEqual(cap4.specificity(), 3, 'textable+form(2) + op(1) = 3 (in wildcard does not count)');

  assert(!cap2.isMoreSpecificThan(cap1), 'Different tags should not be more specific');

  console.log('  ✓ Specificity');
}

// TEST009: Test that compatibility checks if caps can handle same requests
function testCompatibility() {
  console.log('Testing compatibility...');

  const cap1 = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const cap2 = CapUrn.fromString(testUrn('op=generate;format=*'));
  const cap3 = CapUrn.fromString(testUrn('type=image;op=extract'));

  assert(cap1.isCompatibleWith(cap2), 'Should be compatible');
  assert(cap2.isCompatibleWith(cap1), 'Should be compatible');
  assert(!cap1.isCompatibleWith(cap3), 'Should not be compatible (different op)');

  // Missing tags are treated as wildcards for compatibility
  const cap4 = CapUrn.fromString(testUrn('op=generate'));
  assert(cap1.isCompatibleWith(cap4), 'Should be compatible with missing tags');
  assert(cap4.isCompatibleWith(cap1), 'Should be compatible with missing tags');

  // Different in/out should not be compatible
  const cap5 = CapUrn.fromString('cap:in="media:string";out="media:object";op=generate');
  assert(!cap1.isCompatibleWith(cap5), 'Should not be compatible with different inSpec');

  console.log('  ✓ Compatibility');
}

// TEST010: Test that CapUrnBuilder creates valid URN with tags and direction specs
function testBuilder() {
  console.log('Testing builder...');

  const cap = new CapUrnBuilder()
    .inSpec('media:void')
    .outSpec('media:object')
    .tag('op', 'generate')
    .tag('target', 'thumbnail')
    .tag('ext', 'pdf')
    .tag('format', 'binary')
    .build();

  assertEqual(cap.getTag('op'), 'generate', 'Should build with op tag');
  assertEqual(cap.getTag('format'), 'binary', 'Should build with format tag');
  assertEqual(cap.getInSpec(), 'media:void', 'Should build with inSpec');
  assertEqual(cap.getOutSpec(), 'media:object', 'Should build with outSpec');

  // Builder should require inSpec and outSpec
  assertThrows(
    () => new CapUrnBuilder().tag('op', 'test').build(),
    ErrorCodes.MISSING_IN_SPEC,
    'Should require inSpec'
  );

  assertThrows(
    () => new CapUrnBuilder().inSpec('media:void').tag('op', 'test').build(),
    ErrorCodes.MISSING_OUT_SPEC,
    'Should require outSpec'
  );

  console.log('  ✓ Builder');
}

// TEST011: Test convenience methods withTag, withoutTag, withInSpec, withOutSpec, merge, subset, withWildcardTag
function testConvenienceMethods() {
  console.log('Testing convenience methods...');

  const original = CapUrn.fromString(testUrn('op=generate'));

  // Test withTag
  const modified = original.withTag('ext', 'pdf');
  assertEqual(modified.getTag('op'), 'generate', 'Should preserve original tag');
  assertEqual(modified.getTag('ext'), 'pdf', 'Should add new tag');
  assertEqual(modified.getInSpec(), 'media:void', 'Should preserve inSpec');
  assertEqual(modified.getOutSpec(), 'media:form=map;textable', 'Should preserve outSpec');

  // Test withTag silently ignores in/out
  const modified2 = original.withTag('in', 'media:string');
  assertEqual(modified2.getInSpec(), 'media:void', 'withTag should ignore in');
  assert(modified2 === original, 'withTag(in) should return same object');

  // Test withInSpec/withOutSpec
  const modifiedIn = original.withInSpec('media:string');
  assertEqual(modifiedIn.getInSpec(), 'media:string', 'withInSpec should change inSpec');
  const modifiedOut = original.withOutSpec('media:binary');
  assertEqual(modifiedOut.getOutSpec(), 'media:binary', 'withOutSpec should change outSpec');

  // Test withoutTag
  const removed = modified.withoutTag('op');
  assertEqual(removed.getTag('ext'), 'pdf', 'Should preserve remaining tag');
  assertEqual(removed.getTag('op'), undefined, 'Should remove specified tag');
  assertEqual(removed.getInSpec(), 'media:void', 'Should preserve inSpec after withoutTag');

  // Test withoutTag silently ignores in/out
  const removed2 = modified.withoutTag('in');
  assertEqual(removed2.getInSpec(), 'media:void', 'withoutTag should ignore in');
  assert(removed2 === modified, 'withoutTag(in) should return same object');

  // Test merge (direction from other)
  const cap1 = CapUrn.fromString(testUrn('op=generate'));
  const cap2 = CapUrn.fromString('cap:in="media:string";out="media:binary";ext=pdf;format=binary');
  const merged = cap1.merge(cap2);
  assertEqual(merged.getInSpec(), 'media:string', 'merge should take inSpec from other');
  assertEqual(merged.getOutSpec(), 'media:binary', 'merge should take outSpec from other');
  assertEqual(merged.getTag('op'), 'generate', 'merge should keep original tags');
  assertEqual(merged.getTag('ext'), 'pdf', 'merge should add other tags');

  // Test subset (always preserves in/out)
  const subset = merged.subset(['type', 'ext']);
  assertEqual(subset.getTag('ext'), 'pdf', 'Should include ext');
  assertEqual(subset.getTag('op'), undefined, 'Should not include op');
  assertEqual(subset.getInSpec(), 'media:string', 'subset should preserve inSpec');
  assertEqual(subset.getOutSpec(), 'media:binary', 'subset should preserve outSpec');

  // Test wildcardTag for in/out
  const cap = CapUrn.fromString(testUrn('ext=pdf'));
  const wildcardedExt = cap.withWildcardTag('ext');
  assertEqual(wildcardedExt.getTag('ext'), '*', 'Should set ext wildcard');
  const wildcardedIn = cap.withWildcardTag('in');
  assertEqual(wildcardedIn.getInSpec(), '*', 'Should set in wildcard');
  const wildcardedOut = cap.withWildcardTag('out');
  assertEqual(wildcardedOut.getOutSpec(), '*', 'Should set out wildcard');

  console.log('  ✓ Convenience methods');
}

// TEST012: Test that CapMatcher finds best and all matches from cap list
function testCapMatcher() {
  console.log('Testing CapMatcher...');

  const caps = [
    CapUrn.fromString('cap:in=*;out=*;op=*'),
    CapUrn.fromString(testUrn('op=generate')),
    CapUrn.fromString(testUrn('op=generate;ext=pdf'))
  ];

  const request = CapUrn.fromString(testUrn('op=generate'));
  const best = CapMatcher.findBestMatch(caps, request);

  // Most specific cap that can handle the request (ext=pdf is more specific)
  // Canonical order is alphabetical: ext, in, op, out
  // Note: media:form=map needs quotes because it contains '='
  assertEqual(best.toString(), 'cap:ext=pdf;in=media:void;op=generate;out="media:form=map;textable"', 'Should find most specific match');

  // Test findAllMatches - now only 2 match because first has wildcard in/out
  const matches = CapMatcher.findAllMatches(caps, request);
  assertEqual(matches.length, 3, 'Should find all matches (wildcard in/out matches any)');
  // First should be most specific (ext=pdf;op=generate with in/out)
  assertEqual(matches[0].getTag('ext'), 'pdf', 'Most specific should have ext=pdf');

  console.log('  ✓ CapMatcher');
}

// TEST013: Test that cap URN serializes to and deserializes from JSON
function testJSONSerialization() {
  console.log('Testing JSON serialization...');

  const original = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const json = JSON.stringify({ urn: original.toString() });
  const parsed = JSON.parse(json);
  const restored = CapUrn.fromString(parsed.urn);

  assert(original.equals(restored), 'Should serialize/deserialize correctly');
  assertEqual(restored.getInSpec(), 'media:void', 'Should preserve inSpec');
  assertEqual(restored.getOutSpec(), 'media:form=map;textable', 'Should preserve outSpec');

  console.log('  ✓ JSON serialization');
}

// TEST014: Test that empty cap URN without in/out fails, minimal URN with just in/out succeeds
function testEmptyCapUrn() {
  console.log('Testing empty cap URN now fails (in/out required)...');

  // Empty cap URN now FAILS because in/out are required
  assertThrows(
    () => CapUrn.fromString('cap:'),
    ErrorCodes.MISSING_IN_SPEC,
    'Empty cap URN should fail with MISSING_IN_SPEC'
  );

  // Missing out should fail
  assertThrows(
    () => CapUrn.fromString('cap:in="media:void"'),
    ErrorCodes.MISSING_OUT_SPEC,
    'Cap URN without out should fail with MISSING_OUT_SPEC'
  );

  // Minimal valid cap (just in/out)
  const minimal = CapUrn.fromString(testUrn(''));
  assertEqual(Object.keys(minimal.tags).length, 0, 'Should have no other tags');
  assertEqual(minimal.getInSpec(), 'media:void', 'Should have inSpec');
  assertEqual(minimal.getOutSpec(), 'media:form=map;textable', 'Should have outSpec');

  // For "match anything" behavior, use wildcards
  const wildcard = CapUrn.fromString('cap:in=*;out=*');
  const specific = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(wildcard.accepts(specific), 'Wildcard should accept any cap');
  assert(wildcard.accepts(wildcard), 'Wildcard should accept itself');

  console.log('  ✓ Empty cap URN now fails (in/out required)');
}

// TEST015: Test that URN supports forward slashes and colons in tag values
function testExtendedCharacterSupport() {
  console.log('Testing extended character support...');

  // Test forward slashes and colons in tag components
  const cap = CapUrn.fromString(testUrn('url=https://example_org/api;path=/some/file'));
  assertEqual(cap.getTag('url'), 'https://example_org/api', 'Should support colons and slashes');
  assertEqual(cap.getTag('path'), '/some/file', 'Should support slashes');

  console.log('  ✓ Extended character support');
}

// TEST016: Test that wildcard is rejected in keys but accepted in values
function testWildcardRestrictions() {
  console.log('Testing wildcard restrictions...');

  // Wildcard should be rejected in keys
  assertThrows(
    () => CapUrn.fromString(testUrn('*=value')),
    ErrorCodes.INVALID_CHARACTER,
    'Should reject wildcard in key'
  );

  // Wildcard should be accepted in values
  const cap = CapUrn.fromString(testUrn('key=*'));
  assertEqual(cap.getTag('key'), '*', 'Should accept wildcard in value');

  // Wildcard in in/out should work
  const capWild = CapUrn.fromString('cap:in=*;out=*;key=value');
  assertEqual(capWild.getInSpec(), '*', 'Should accept wildcard in inSpec');
  assertEqual(capWild.getOutSpec(), '*', 'Should accept wildcard in outSpec');

  console.log('  ✓ Wildcard restrictions');
}

// TEST017: Test that duplicate keys in URN are rejected with DUPLICATE_KEY error
function testDuplicateKeyRejection() {
  console.log('Testing duplicate key rejection...');

  // Duplicate keys should be rejected
  assertThrows(
    () => CapUrn.fromString(testUrn('key=value1;key=value2')),
    ErrorCodes.DUPLICATE_KEY,
    'Should reject duplicate keys'
  );

  console.log('  ✓ Duplicate key rejection');
}

// TEST018: Test that pure numeric keys are rejected but mixed alphanumeric keys are allowed
function testNumericKeyRestriction() {
  console.log('Testing numeric key restriction...');

  // Pure numeric keys should be rejected
  assertThrows(
    () => CapUrn.fromString(testUrn('123=value')),
    ErrorCodes.NUMERIC_KEY,
    'Should reject numeric keys'
  );

  // Mixed alphanumeric keys should be allowed
  const mixedKey1 = CapUrn.fromString(testUrn('key123=value'));
  assertEqual(mixedKey1.getTag('key123'), 'value', 'Should allow mixed alphanumeric keys');

  const mixedKey2 = CapUrn.fromString(testUrn('x123key=value'));
  assertEqual(mixedKey2.getTag('x123key'), 'value', 'Should allow mixed alphanumeric keys');

  // Pure numeric values should be allowed
  const numericValue = CapUrn.fromString(testUrn('key=123'));
  assertEqual(numericValue.getTag('key'), '123', 'Should allow numeric values');

  console.log('  ✓ Numeric key restriction');
}

// ============================================================================
// NEW FORMAT TESTS - Spec ID Resolution and MediaSpec
// ============================================================================

// TEST057: Test MediaSpec constructor creates object with correct fields
function testMediaSpecConstruction() {
  console.log('Testing MediaSpec construction...');

  // Create MediaSpec directly (no parsing needed - media_type and profile_uri are separate fields)
  const spec1 = new MediaSpec('text/plain', 'https://capns.org/schema/str', null, 'String', null, 'media:string');
  assertEqual(spec1.contentType, 'text/plain', 'Should have content type');
  assertEqual(spec1.profile, 'https://capns.org/schema/str', 'Should have profile');
  assertEqual(spec1.title, 'String', 'Should have title');
  assertEqual(spec1.mediaUrn, 'media:string', 'Should have mediaUrn');

  // Create without profile
  const spec2 = new MediaSpec('application/octet-stream', null, null, 'Binary', null, 'media:binary');
  assertEqual(spec2.contentType, 'application/octet-stream', 'Should have content type without profile');
  assertEqual(spec2.profile, null, 'Should have null profile');

  console.log('  ✓ MediaSpec construction');
}


// TEST060: Test resolveMediaUrn requires mediaSpecs array for resolution
function testMediaUrnResolutionRequiresMediaSpecs() {
  console.log('Testing media URN resolution requires mediaSpecs...');

  // Media specs array with definitions (each spec has its own urn)
  const mediaSpecs = [
    { urn: MEDIA_STRING, media_type: 'text/plain', title: 'String', profile_uri: 'https://capns.org/schema/str' },
    { urn: MEDIA_INTEGER, media_type: 'text/plain', title: 'Integer', profile_uri: 'https://capns.org/schema/int' },
    { urn: MEDIA_OBJECT, media_type: 'application/json', title: 'Object', profile_uri: 'https://capns.org/schema/obj' },
    { urn: MEDIA_BINARY, media_type: 'application/octet-stream', title: 'Binary' }
  ];

  // Should resolve spec IDs from mediaSpecs array
  const strSpec = resolveMediaUrn(MEDIA_STRING, mediaSpecs);
  assertEqual(strSpec.contentType, 'text/plain', 'Should resolve str spec');
  assertEqual(strSpec.profile, 'https://capns.org/schema/str', 'Should have correct profile');

  const intSpec = resolveMediaUrn(MEDIA_INTEGER, mediaSpecs);
  assertEqual(intSpec.contentType, 'text/plain', 'Should resolve int spec');
  assertEqual(intSpec.profile, 'https://capns.org/schema/int', 'Should have correct profile');

  const objSpec = resolveMediaUrn(MEDIA_OBJECT, mediaSpecs);
  assertEqual(objSpec.contentType, 'application/json', 'Should resolve obj spec');

  const binarySpec = resolveMediaUrn(MEDIA_BINARY, mediaSpecs);
  assertEqual(binarySpec.contentType, 'application/octet-stream', 'Should resolve binary spec');
  // Note: isBinary() checks for 'bytes' tag in media URN, not content type

  console.log('  ✓ Media URN resolution requires mediaSpecs');
}

// TEST061: Test resolveMediaUrn resolves custom media URNs from mediaSpecs array
function testMediaUrnResolutionWithMediaSpecs() {
  console.log('Testing media URN resolution with custom mediaSpecs...');

  // Custom mediaSpecs array (each spec has its own urn)
  const mediaSpecs = [
    { urn: 'media:custom-json', media_type: 'application/json', title: 'Custom JSON', profile_uri: 'https://example.com/schema/custom' },
    { urn: 'media:rich-xml', media_type: 'application/xml', title: 'Rich XML', profile_uri: 'https://example.com/schema/rich', schema: { type: 'object' } },
    { urn: MEDIA_STRING, media_type: 'text/plain', title: 'String', profile_uri: 'https://capns.org/schema/str' }
  ];

  // Should resolve custom media spec
  const customSpec = resolveMediaUrn('media:custom-json', mediaSpecs);
  assertEqual(customSpec.contentType, 'application/json', 'Should resolve custom spec');
  assertEqual(customSpec.profile, 'https://example.com/schema/custom', 'Should have custom profile');

  // Should resolve custom media spec with schema
  const richSpec = resolveMediaUrn('media:rich-xml', mediaSpecs);
  assertEqual(richSpec.contentType, 'application/xml', 'Should resolve rich spec');
  assertEqual(richSpec.profile, 'https://example.com/schema/rich', 'Should have rich profile');
  assert(richSpec.schema !== null, 'Should have schema');

  // Should resolve MEDIA_STRING from mediaSpecs array
  const strSpec = resolveMediaUrn(MEDIA_STRING, mediaSpecs);
  assertEqual(strSpec.contentType, 'text/plain', 'Should resolve string spec from mediaSpecs');

  console.log('  ✓ Media URN resolution with custom mediaSpecs');
}

// TEST062: Test resolveMediaUrn fails hard on unresolvable media URN
function testMediaUrnResolutionFailHard() {
  console.log('Testing media URN resolution fail hard...');

  // Should FAIL HARD on unresolvable media URN
  let caught = false;
  try {
    resolveMediaUrn('media:nonexistent', []);
  } catch (e) {
    if (e instanceof MediaSpecError && e.code === MediaSpecErrorCodes.UNRESOLVABLE_MEDIA_URN) {
      caught = true;
    } else {
      throw new Error(`Expected MediaSpecError with UNRESOLVABLE_MEDIA_URN code, got: ${e.message}`);
    }
  }
  assert(caught, 'Should fail hard on unresolvable media URN');

  console.log('  ✓ Media URN resolution fail hard');
}

// TEST063: Test metadata is propagated from media spec definition
function testMetadataPropagation() {
  console.log('Testing metadata propagation...');

  // Create a media spec definition with metadata
  const mediaSpecs = [
    {
      urn: 'media:custom-setting;setting',
      media_type: 'text/plain',
      title: 'Custom Setting',
      profile_uri: 'https://example.com/schema',
      description: 'A custom setting',
      metadata: {
        category_key: 'interface',
        ui_type: 'SETTING_UI_TYPE_CHECKBOX',
        subcategory_key: 'appearance',
        display_index: 5
      }
    }
  ];

  // Resolve and verify metadata is propagated
  const resolved = resolveMediaUrn('media:custom-setting;setting', mediaSpecs);
  assert(resolved.metadata !== null, 'Should have metadata');
  assertEqual(resolved.metadata.category_key, 'interface', 'Should have category_key');
  assertEqual(resolved.metadata.ui_type, 'SETTING_UI_TYPE_CHECKBOX', 'Should have ui_type');
  assertEqual(resolved.metadata.subcategory_key, 'appearance', 'Should have subcategory_key');
  assertEqual(resolved.metadata.display_index, 5, 'Should have display_index');

  console.log('  ✓ Metadata propagation from object definition');
}

// TEST064: (Removed - string form is no longer supported)

// TEST065: (Removed - string form is no longer supported)

// TEST066: Test metadata and validation coexist in media spec definition
function testMetadataWithValidation() {
  console.log('Testing metadata with validation...');

  // Ensure metadata and validation can coexist
  const mediaSpecs = [
    {
      urn: 'media:bounded-number;numeric;setting',
      media_type: 'text/plain',
      title: 'Bounded Number',
      profile_uri: 'https://example.com/schema',
      validation: {
        min: 0,
        max: 100
      },
      metadata: {
        category_key: 'inference',
        ui_type: 'SETTING_UI_TYPE_SLIDER'
      }
    }
  ];

  const resolved = resolveMediaUrn('media:bounded-number;numeric;setting', mediaSpecs);

  // Verify validation
  assert(resolved.validation !== null, 'Should have validation');
  assertEqual(resolved.validation.min, 0, 'Should have min validation');
  assertEqual(resolved.validation.max, 100, 'Should have max validation');

  // Verify metadata
  assert(resolved.metadata !== null, 'Should have metadata');
  assertEqual(resolved.metadata.category_key, 'inference', 'Should have category_key');
  assertEqual(resolved.metadata.ui_type, 'SETTING_UI_TYPE_SLIDER', 'Should have ui_type');

  console.log('  ✓ Metadata coexists with validation');
}

// TEST067: Test extensions field is propagated from media spec definition
function testExtensionsPropagation() {
  console.log('Testing extensions propagation...');

  // Create a media spec definition with extensions array
  const mediaSpecs = [
    {
      urn: 'media:pdf;bytes',
      media_type: 'application/pdf',
      title: 'PDF Document',
      profile_uri: 'https://capns.org/schema/pdf',
      description: 'A PDF document',
      extensions: ['pdf']
    }
  ];

  // Resolve and verify extensions is propagated
  const resolved = resolveMediaUrn('media:pdf;bytes', mediaSpecs);
  assert(Array.isArray(resolved.extensions), 'Extensions should be an array');
  assertEqual(resolved.extensions.length, 1, 'Should have one extension');
  assertEqual(resolved.extensions[0], 'pdf', 'Should have pdf extension');

  console.log('  ✓ Extensions propagation from definition');
}

// TEST068: (Removed - string form is no longer supported)

// TEST069: Test extensions can coexist with metadata and validation
function testExtensionsWithMetadataAndValidation() {
  console.log('Testing extensions with metadata and validation...');

  // Ensure extensions, metadata, and validation can coexist
  const mediaSpecs = [
    {
      urn: 'media:custom-output',
      media_type: 'application/json',
      title: 'Custom Output',
      profile_uri: 'https://example.com/schema',
      validation: {
        min_length: 1,
        max_length: 1000
      },
      metadata: {
        category: 'output'
      },
      extensions: ['json']
    }
  ];

  const resolved = resolveMediaUrn('media:custom-output', mediaSpecs);

  // Verify all fields are present
  assert(resolved.validation !== null, 'Should have validation');
  assert(resolved.metadata !== null, 'Should have metadata');
  assert(Array.isArray(resolved.extensions), 'Extensions should be an array');
  assertEqual(resolved.extensions[0], 'json', 'Should have json extension');

  console.log('  ✓ Extensions coexists with metadata and validation');
}

// TEST070: Test multiple extensions in a media spec
function testMultipleExtensions() {
  console.log('Testing multiple extensions...');

  // Create a media spec definition with multiple extensions
  const mediaSpecs = [
    {
      urn: 'media:image;jpeg;bytes',
      media_type: 'image/jpeg',
      title: 'JPEG Image',
      profile_uri: 'https://capns.org/schema/jpeg',
      description: 'JPEG image data',
      extensions: ['jpg', 'jpeg']
    }
  ];

  // Resolve and verify multiple extensions are propagated
  const resolved = resolveMediaUrn('media:image;jpeg;bytes', mediaSpecs);
  assert(Array.isArray(resolved.extensions), 'Extensions should be an array');
  assertEqual(resolved.extensions.length, 2, 'Should have two extensions');
  assertEqual(resolved.extensions[0], 'jpg', 'Should have jpg extension first');
  assertEqual(resolved.extensions[1], 'jpeg', 'Should have jpeg extension second');

  console.log('  ✓ Multiple extensions propagation');
}

// TEST071: Test buildExtensionIndex creates correct mappings
function testBuildExtensionIndex() {
  console.log('Testing buildExtensionIndex...');

  const mediaSpecs = [
    { urn: 'media:pdf;bytes', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:image;jpeg;bytes', media_type: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
    { urn: 'media:json;textable', media_type: 'application/json', extensions: ['json'] }
  ];

  const index = buildExtensionIndex(mediaSpecs);

  assert(index instanceof Map, 'Should return a Map');
  assertEqual(index.size, 4, 'Should have 4 extensions (pdf, jpg, jpeg, json)');
  assert(index.has('pdf'), 'Should have pdf');
  assert(index.has('jpg'), 'Should have jpg');
  assert(index.has('jpeg'), 'Should have jpeg');
  assert(index.has('json'), 'Should have json');

  assertEqual(index.get('pdf').length, 1, 'pdf should have 1 URN');
  assertEqual(index.get('pdf')[0], 'media:pdf;bytes', 'pdf should map to media:pdf;bytes');

  assertEqual(index.get('jpg').length, 1, 'jpg should have 1 URN');
  assertEqual(index.get('jpg')[0], 'media:image;jpeg;bytes', 'jpg should map to jpeg URN');

  console.log('  ✓ buildExtensionIndex creates correct mappings');
}

// TEST072: Test mediaUrnsForExtension finds URNs by extension
function testMediaUrnsForExtension() {
  console.log('Testing mediaUrnsForExtension...');

  const mediaSpecs = [
    { urn: 'media:pdf;bytes', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:image;jpeg;bytes', media_type: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
    { urn: 'media:json;textable;form=map', media_type: 'application/json', extensions: ['json'] },
    { urn: 'media:json;textable;form=list', media_type: 'application/json', extensions: ['json'] }
  ];

  // Test single extension
  const pdfUrns = mediaUrnsForExtension('pdf', mediaSpecs);
  assertEqual(pdfUrns.length, 1, 'Should find 1 URN for pdf');
  assertEqual(pdfUrns[0], 'media:pdf;bytes', 'Should find pdf URN');

  // Test case insensitivity
  const pdfUrnsUpper = mediaUrnsForExtension('PDF', mediaSpecs);
  assertEqual(pdfUrnsUpper.length, 1, 'Should find URN with uppercase extension');

  // Test extension with multiple URNs
  const jsonUrns = mediaUrnsForExtension('json', mediaSpecs);
  assertEqual(jsonUrns.length, 2, 'Should find 2 URNs for json');

  // Test unknown extension throws
  let thrownError = null;
  try {
    mediaUrnsForExtension('unknown', mediaSpecs);
  } catch (e) {
    thrownError = e;
  }
  assert(thrownError !== null, 'Should throw for unknown extension');
  assert(thrownError instanceof MediaSpecError, 'Should throw MediaSpecError');

  console.log('  ✓ mediaUrnsForExtension finds URNs by extension');
}

// TEST073: Test getExtensionMappings returns all mappings
function testGetExtensionMappings() {
  console.log('Testing getExtensionMappings...');

  const mediaSpecs = [
    { urn: 'media:pdf;bytes', media_type: 'application/pdf', extensions: ['pdf'] },
    { urn: 'media:image;jpeg;bytes', media_type: 'image/jpeg', extensions: ['jpg', 'jpeg'] }
  ];

  const mappings = getExtensionMappings(mediaSpecs);
  assert(Array.isArray(mappings), 'Should return an array');
  assertEqual(mappings.length, 3, 'Should have 3 mappings (pdf, jpg, jpeg)');

  // Find pdf mapping
  const pdfMapping = mappings.find(m => m[0] === 'pdf');
  assert(pdfMapping !== undefined, 'Should have pdf mapping');
  assertEqual(pdfMapping[1].length, 1, 'pdf should have 1 URN');

  console.log('  ✓ getExtensionMappings returns all mappings');
}

// TEST108: Test Cap with mediaSpecs resolves custom media URNs
function testCapWithMediaSpecs() {
  console.log('Testing Cap with mediaSpecs...');

  // Now in/out are parsed as first-class fields with media URNs
  const urn = CapUrn.fromString('cap:in="media:string";op=test;out="media:custom"');
  assertEqual(urn.getInSpec(), 'media:string', 'Should parse inSpec');
  assertEqual(urn.getOutSpec(), 'media:custom', 'Should parse outSpec');

  const cap = new Cap(urn, 'Test Cap', 'test_command');

  // Set custom mediaSpecs array - must include MEDIA_STRING for resolution to work
  cap.mediaSpecs = [
    { urn: MEDIA_STRING, media_type: 'text/plain', title: 'String', profile_uri: 'https://capns.org/schema/str' },
    {
      urn: 'media:custom',
      media_type: 'application/json',
      title: 'Custom Output',
      profile_uri: 'https://example.com/schema/output',
      schema: {
        type: 'object',
        properties: { result: { type: 'string' } }
      }
    }
  ];

  // Should resolve MEDIA_STRING from mediaSpecs via cap.resolveMediaUrn
  const strSpec = cap.resolveMediaUrn(MEDIA_STRING);
  assertEqual(strSpec.contentType, 'text/plain', 'Should resolve string spec through cap');

  // Should resolve custom spec via cap.resolveMediaUrn
  const outputSpec = cap.resolveMediaUrn('media:custom');
  assertEqual(outputSpec.contentType, 'application/json', 'Should resolve custom spec through cap');
  assert(outputSpec.schema !== null, 'Should have schema');

  console.log('  ✓ Cap with mediaSpecs');
}

// TEST109: Test Cap JSON serialization includes mediaSpecs and direction specs
function testCapJSONSerialization() {
  console.log('Testing Cap JSON serialization with mediaSpecs...');

  const urn = CapUrn.fromString(testUrn('op=test'));
  const cap = new Cap(urn, 'Test Cap', 'test_command');
  cap.mediaSpecs = [
    { urn: 'media:custom', media_type: 'text/plain', title: 'Custom', profile_uri: 'https://example.com' }
  ];
  cap.arguments = {
    required: [{ name: 'input', media_urn: MEDIA_STRING }],
    optional: []
  };
  cap.output = { media_urn: 'media:custom', output_description: 'Test output' };

  // Serialize to JSON
  const json = cap.toJSON();
  assert(json.media_specs !== undefined, 'Should have media_specs in JSON');
  assert(Array.isArray(json.media_specs), 'media_specs should be an array');
  assertEqual(json.media_specs.length, 1, 'Should have one media spec');
  assertEqual(json.media_specs[0].urn, 'media:custom', 'Should serialize mediaSpec urn');
  // URN should be a string in canonical format
  assertEqual(typeof json.urn, 'string', 'URN should be serialized as string');
  assert(json.urn.includes('in=media:void'), 'Should contain inSpec in URN string');
  assert(json.urn.includes('out="media:form=map;textable"'), 'Should contain outSpec in URN string');

  // Deserialize from JSON
  const restored = Cap.fromJSON(json);
  assert(restored.mediaSpecs !== undefined, 'Should restore mediaSpecs');
  assert(Array.isArray(restored.mediaSpecs), 'Restored mediaSpecs should be an array');
  assertEqual(restored.mediaSpecs.length, 1, 'Should restore one media spec');
  assertEqual(restored.mediaSpecs[0].urn, 'media:custom', 'Should restore mediaSpec urn');
  assertEqual(restored.urn.getInSpec(), 'media:void', 'Should restore inSpec');
  assertEqual(restored.urn.getOutSpec(), 'media:form=map;textable', 'Should restore outSpec');

  console.log('  ✓ Cap JSON serialization with mediaSpecs');
}

// TEST019: Test op tag is used instead of deprecated action tag
function testOpTagRename() {
  console.log('Testing op tag (renamed from action)...');

  // Should use 'op' tag, not 'action'
  const cap = CapUrn.fromString(testUrn('op=generate;format=json'));
  assertEqual(cap.getTag('op'), 'generate', 'Should have op tag');
  assertEqual(cap.getTag('action'), undefined, 'Should not have action tag');

  // Builder should use op
  const built = new CapUrnBuilder()
    .inSpec('media:void')
    .outSpec('media:object')
    .tag('op', 'transform')
    .tag('type', 'data')
    .build();
  assertEqual(built.getTag('op'), 'transform', 'Builder should set op tag');

  console.log('  ✓ Op tag (renamed from action)');
}

// ============================================================================
// MATCHING SEMANTICS SPECIFICATION TESTS
// These 9 tests verify the exact matching semantics from RULES.md Sections 12-17
// All implementations (Rust, Go, JS, ObjC) must pass these identically
// ============================================================================

// TEST020: Test matching semantics - exact match including in/out
function testMatchingSemantics_Test1_ExactMatch() {
  console.log('Testing Matching Semantics Test 1: Exact match...');
  // Test 1: Exact match (including in/out)
  // Cap:     cap:in="media:void";out="media:object";op=generate;ext=pdf
  // Request: cap:in="media:void";out="media:object";op=generate;ext=pdf
  // Result:  MATCH
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.accepts(request), 'Test 1: Exact match should succeed');
  console.log('  ✓ Test 1: Exact match');
}

// TEST021: Test matching semantics - cap missing tag treated as implicit wildcard
function testMatchingSemantics_Test2_CapMissingTag() {
  console.log('Testing Matching Semantics Test 2: Cap missing tag...');
  // Test 2: Cap missing tag (implicit wildcard for other tags, not in/out)
  // Cap:     cap:in="media:void";out="media:object";op=generate
  // Request: cap:in="media:void";out="media:object";op=generate;ext=pdf
  // Result:  MATCH (cap can handle any ext)
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.accepts(request), 'Test 2: Cap missing tag should accept (implicit wildcard)');
  console.log('  ✓ Test 2: Cap missing tag');
}

// TEST022: Test matching semantics - cap with extra tag matches request
function testMatchingSemantics_Test3_CapHasExtraTag() {
  console.log('Testing Matching Semantics Test 3: Cap has extra tag...');
  // Test 3: Cap has extra tag
  // Cap:     cap:in="media:void";out="media:object";op=generate;ext=pdf;version=2
  // Request: cap:in="media:void";out="media:object";op=generate;ext=pdf
  // Result:  MATCH (request doesn't constrain version)
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf;version=2'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.accepts(request), 'Test 3: Cap with extra tag should accept');
  console.log('  ✓ Test 3: Cap has extra tag');
}

// TEST023: Test matching semantics - request with wildcard matches specific cap
function testMatchingSemantics_Test4_RequestHasWildcard() {
  console.log('Testing Matching Semantics Test 4: Request has wildcard...');
  // Test 4: Request has wildcard
  // Cap:     cap:in="media:void";out="media:object";op=generate;ext=pdf
  // Request: cap:in="media:void";out="media:object";op=generate;ext=*
  // Result:  MATCH (request accepts any ext)
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=*'));
  assert(cap.accepts(request), 'Test 4: Request wildcard should accept');
  console.log('  ✓ Test 4: Request has wildcard');
}

// TEST024: Test matching semantics - cap with wildcard matches specific request
function testMatchingSemantics_Test5_CapHasWildcard() {
  console.log('Testing Matching Semantics Test 5: Cap has wildcard...');
  // Test 5: Cap has wildcard
  // Cap:     cap:in="media:void";out="media:object";op=generate;ext=*
  // Request: cap:in="media:void";out="media:object";op=generate;ext=pdf
  // Result:  MATCH (cap handles any ext)
  const cap = CapUrn.fromString(testUrn('op=generate;ext=*'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.accepts(request), 'Test 5: Cap wildcard should accept');
  console.log('  ✓ Test 5: Cap has wildcard');
}

// TEST025: Test matching semantics - value mismatch does not match
function testMatchingSemantics_Test6_ValueMismatch() {
  console.log('Testing Matching Semantics Test 6: Value mismatch...');
  // Test 6: Value mismatch
  // Cap:     cap:in="media:void";out="media:object";op=generate;ext=pdf
  // Request: cap:in="media:void";out="media:object";op=generate;ext=docx
  // Result:  NO MATCH
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=docx'));
  assert(!cap.accepts(request), 'Test 6: Value mismatch should not accept');
  console.log('  ✓ Test 6: Value mismatch');
}

// TEST026: Test matching semantics - fallback pattern with missing tag as implicit wildcard
function testMatchingSemantics_Test7_FallbackPattern() {
  console.log('Testing Matching Semantics Test 7: Fallback pattern...');
  // Test 7: Fallback pattern
  // Cap:     cap:in="media:void";out="media:binary";op=generate_thumbnail
  // Request: cap:in="media:void";out="media:binary";op=generate_thumbnail;ext=wav
  // Result:  MATCH (cap has implicit ext=*)
  const cap = CapUrn.fromString('cap:in="media:void";out="media:binary";op=generate_thumbnail');
  const request = CapUrn.fromString('cap:in="media:void";out="media:binary";op=generate_thumbnail;ext=wav');
  assert(cap.accepts(request), 'Test 7: Fallback pattern should accept (cap missing ext = implicit wildcard)');
  console.log('  ✓ Test 7: Fallback pattern');
}

// TEST027: Test matching semantics - wildcard cap with in=* out=* matches anything
function testMatchingSemantics_Test8_WildcardCapMatchesAnything() {
  console.log('Testing Matching Semantics Test 8: Wildcard cap matches anything...');
  // Test 8: Wildcard cap matches anything (replaces empty cap test)
  // Cap:     cap:in=*;out=*
  // Request: cap:in="media:void";out="media:object";op=generate;ext=pdf
  // Result:  MATCH
  const cap = CapUrn.fromString('cap:in=*;out=*');
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.accepts(request), 'Test 8: Wildcard cap should accept anything');
  console.log('  ✓ Test 8: Wildcard cap matches anything');
}

// TEST028: Test matching semantics - cross-dimension independence for other tags
function testMatchingSemantics_Test9_CrossDimensionIndependence() {
  console.log('Testing Matching Semantics Test 9: Cross-dimension independence...');
  // Test 9: Cross-dimension independence (for other tags, not in/out)
  // Cap:     cap:in="media:void";out="media:object";op=generate
  // Request: cap:in="media:void";out="media:object";ext=pdf
  // Result:  MATCH (both have implicit wildcards for missing tags)
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString(testUrn('ext=pdf'));
  assert(cap.accepts(request), 'Test 9: Cross-dimension independence should accept');
  console.log('  ✓ Test 9: Cross-dimension independence');
}

// TEST029: Test matching semantics - direction mismatch in/out does not match
function testMatchingSemantics_Test10_DirectionMismatch() {
  console.log('Testing Matching Semantics Test 10: Direction mismatch...');
  // Test 10: Direction mismatch prevents matching
  // media:string has tags {textable:*, form:scalar}, media:bytes has tags {bytes:*}
  // Neither can provide input for the other (completely different marker tags)
  const cap = CapUrn.fromString(
    'cap:in="media:string";op=generate;out="media:form=map;textable"'
  );
  const request = CapUrn.fromString(
    'cap:in="media:bytes";op=generate;out="media:form=map;textable"'
  );
  assert(!cap.accepts(request), 'Test 10: Direction mismatch should not accept');
  console.log('  ✓ Test 10: Direction mismatch');
}

// ============================================================================
// CapMatrix and CapCube Tests
// ============================================================================

// Helper to create a test URN
function matrixTestUrn(tags) {
  if (!tags) {
    return 'cap:in="media:void";out="media:object"';
  }
  return `cap:in="media:void";out="media:object";${tags}`;
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

// TEST117: Test CapCube finds more specific cap across registries
function testCapCubeMoreSpecificWins() {
  console.log('Testing CapCube: More specific wins...');

  const providerRegistry = new CapMatrix();
  const pluginRegistry = new CapMatrix();

  // Provider: less specific cap (no ext tag)
  const providerHost = new MockCapSet('provider');
  const providerCap = makeCap(
    'cap:in="media:binary";op=generate_thumbnail;out="media:binary"',
    'Provider Thumbnail Generator (generic)'
  );
  providerRegistry.registerCapSet('provider', providerHost, [providerCap]);

  // Plugin: more specific cap (has ext=pdf)
  const pluginHost = new MockCapSet('plugin');
  const pluginCap = makeCap(
    'cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"',
    'Plugin PDF Thumbnail Generator (specific)'
  );
  pluginRegistry.registerCapSet('plugin', pluginHost, [pluginCap]);

  // Create composite with provider first
  const composite = new CapCube();
  composite.addRegistry('providers', providerRegistry);
  composite.addRegistry('plugins', pluginRegistry);

  // Request for PDF thumbnails - plugin's more specific cap should win
  const request = 'cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"';
  const best = composite.findBestCapSet(request);

  assertEqual(best.registryName, 'plugins', 'More specific plugin should win');
  assertEqual(best.specificity, 4, 'Plugin cap has 4 specific tags');
  assertEqual(best.cap.title, 'Plugin PDF Thumbnail Generator (specific)', 'Should get plugin cap');

  console.log('  ✓ More specific wins');
}

// TEST118: Test CapCube tie-breaking prefers first registry in order
function testCapCubeTieGoesToFirst() {
  console.log('Testing CapCube: Tie goes to first...');

  const registry1 = new CapMatrix();
  const registry2 = new CapMatrix();

  // Both have same specificity
  const host1 = new MockCapSet('host1');
  const cap1 = makeCap(matrixTestUrn('ext=pdf;op=generate'), 'Registry 1 Cap');
  registry1.registerCapSet('host1', host1, [cap1]);

  const host2 = new MockCapSet('host2');
  const cap2 = makeCap(matrixTestUrn('ext=pdf;op=generate'), 'Registry 2 Cap');
  registry2.registerCapSet('host2', host2, [cap2]);

  const composite = new CapCube();
  composite.addRegistry('first', registry1);
  composite.addRegistry('second', registry2);

  const best = composite.findBestCapSet(matrixTestUrn('ext=pdf;op=generate'));

  assertEqual(best.registryName, 'first', 'On tie, first registry should win');
  assertEqual(best.cap.title, 'Registry 1 Cap', 'Should get first registry cap');

  console.log('  ✓ Tie goes to first');
}

// TEST119: Test CapCube polls all registries to find best match
function testCapCubePollsAll() {
  console.log('Testing CapCube: Polls all registries...');

  const registry1 = new CapMatrix();
  const registry2 = new CapMatrix();
  const registry3 = new CapMatrix();

  // Registry 1: doesn't match
  const host1 = new MockCapSet('host1');
  const cap1 = makeCap(matrixTestUrn('op=different'), 'Registry 1');
  registry1.registerCapSet('host1', host1, [cap1]);

  // Registry 2: matches but less specific
  const host2 = new MockCapSet('host2');
  const cap2 = makeCap(matrixTestUrn('op=generate'), 'Registry 2');
  registry2.registerCapSet('host2', host2, [cap2]);

  // Registry 3: matches and most specific
  const host3 = new MockCapSet('host3');
  const cap3 = makeCap(matrixTestUrn('ext=pdf;format=thumbnail;op=generate'), 'Registry 3');
  registry3.registerCapSet('host3', host3, [cap3]);

  const composite = new CapCube();
  composite.addRegistry('r1', registry1);
  composite.addRegistry('r2', registry2);
  composite.addRegistry('r3', registry3);

  const best = composite.findBestCapSet(matrixTestUrn('ext=pdf;format=thumbnail;op=generate'));

  assertEqual(best.registryName, 'r3', 'Most specific registry should win');

  console.log('  ✓ Polls all registries');
}

// TEST120: Test CapCube returns error when no cap matches request
function testCapCubeNoMatch() {
  console.log('Testing CapCube: No match error...');

  const registry = new CapMatrix();
  const composite = new CapCube();
  composite.addRegistry('empty', registry);

  try {
    composite.findBestCapSet(matrixTestUrn('op=nonexistent'));
    throw new Error('Expected error for non-matching capability');
  } catch (e) {
    assert(e instanceof CapMatrixError, 'Should be CapMatrixError');
    assertEqual(e.type, 'NoSetsFound', 'Should be NoSetsFound error');
  }

  console.log('  ✓ No match error');
}

// TEST121: Test CapCube fallback scenario where generic cap handles unknown file types
function testCapCubeFallbackScenario() {
  console.log('Testing CapCube: Fallback scenario...');

  const providerRegistry = new CapMatrix();
  const pluginRegistry = new CapMatrix();

  // Provider with generic fallback
  const providerHost = new MockCapSet('provider_fallback');
  const providerCap = makeCap(
    'cap:in="media:binary";op=generate_thumbnail;out="media:binary"',
    'Generic Thumbnail Provider'
  );
  providerRegistry.registerCapSet('provider_fallback', providerHost, [providerCap]);

  // Plugin with PDF-specific handler
  const pluginHost = new MockCapSet('pdf_plugin');
  const pluginCap = makeCap(
    'cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"',
    'PDF Thumbnail Plugin'
  );
  pluginRegistry.registerCapSet('pdf_plugin', pluginHost, [pluginCap]);

  const composite = new CapCube();
  composite.addRegistry('providers', providerRegistry);
  composite.addRegistry('plugins', pluginRegistry);

  // Request for PDF thumbnail
  const request = 'cap:ext=pdf;in="media:binary";op=generate_thumbnail;out="media:binary"';
  const best = composite.findBestCapSet(request);

  assertEqual(best.registryName, 'plugins', 'Plugin should win for PDF');
  assertEqual(best.cap.title, 'PDF Thumbnail Plugin', 'Should get plugin cap');
  assertEqual(best.specificity, 4, 'Plugin has specificity 4');

  // Test that for a different file type, provider wins
  const requestWav = 'cap:ext=wav;in="media:binary";op=generate_thumbnail;out="media:binary"';
  const bestWav = composite.findBestCapSet(requestWav);

  assertEqual(bestWav.registryName, 'providers', 'Provider should win for wav');
  assertEqual(bestWav.cap.title, 'Generic Thumbnail Provider', 'Should get provider cap');

  console.log('  ✓ Fallback scenario');
}

// TEST122: Test CapCube can method returns execution info and acceptsRequest checks capability
function testCapCubeCanMethod() {
  console.log('Testing CapCube: can() method...');

  const providerRegistry = new CapMatrix();

  const providerHost = new MockCapSet('test_provider');
  const providerCap = makeCap(matrixTestUrn('ext=pdf;op=generate'), 'Test Provider');
  providerRegistry.registerCapSet('test_provider', providerHost, [providerCap]);

  const composite = new CapCube();
  composite.addRegistry('providers', providerRegistry);

  // Test can() returns execution info
  const result = composite.can(matrixTestUrn('ext=pdf;op=generate'));
  assert(result.cap !== null, 'Should return cap');
  assert(result.compositeHost instanceof CompositeCapSet, 'Should return CompositeCapSet');

  // Verify acceptsRequest works
  assert(composite.acceptsRequest(matrixTestUrn('ext=pdf;op=generate')), 'Should accept matching cap');
  assert(!composite.acceptsRequest(matrixTestUrn('op=nonexistent')), 'Should not accept non-matching cap');

  console.log('  ✓ can() method');
}

// TEST123: Test CapCube registry management add, get, remove operations
function testCapCubeRegistryManagement() {
  console.log('Testing CapCube: Registry management...');

  const composite = new CapCube();
  const registry1 = new CapMatrix();
  const registry2 = new CapMatrix();

  // Test AddRegistry
  composite.addRegistry('r1', registry1);
  composite.addRegistry('r2', registry2);

  let names = composite.getRegistryNames();
  assertEqual(names.length, 2, 'Should have 2 registries');

  // Test GetRegistry
  assertEqual(composite.getRegistry('r1'), registry1, 'Should get correct registry');

  // Test RemoveRegistry
  const removed = composite.removeRegistry('r1');
  assertEqual(removed, registry1, 'Should return removed registry');

  names = composite.getRegistryNames();
  assertEqual(names.length, 1, 'Should have 1 registry after removal');

  // Test GetRegistry for non-existent
  assertEqual(composite.getRegistry('nonexistent'), null, 'Should return null for non-existent');

  console.log('  ✓ Registry management');
}

// ============================================================================
// CapGraph Tests
// ============================================================================

// Helper to create caps with specific in/out media URNs for graph testing
function makeGraphCap(inUrn, outUrn, title) {
  const urnString = `cap:in="${inUrn}";op=convert;out="${outUrn}"`;
  const capUrn = CapUrn.fromString(urnString);
  return new Cap(capUrn, title, 'convert', title);
}

// TEST124: Test CapGraph basic construction builds nodes and edges from caps
function testCapGraphBasicConstruction() {
  console.log('Testing CapGraph: Basic construction...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str -> obj
  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:string', 'media:object', 'String to Object');

  registry.registerCapSet('converter', mockHost, [cap1, cap2]);

  const cube = new CapCube();
  cube.addRegistry('converters', registry);

  const graph = cube.graph();

  // Check nodes
  const nodes = graph.getNodes();
  assertEqual(nodes.size, 3, 'Expected 3 nodes');

  // Check edges
  const edges = graph.getEdges();
  assertEqual(edges.length, 2, 'Expected 2 edges');

  // Check stats
  const stats = graph.stats();
  assertEqual(stats.nodeCount, 3, 'Expected 3 nodes in stats');
  assertEqual(stats.edgeCount, 2, 'Expected 2 edges in stats');

  console.log('  ✓ Basic construction');
}

// TEST125: Test CapGraph getOutgoing and getIncoming return correct edges for media URN
function testCapGraphOutgoingIncoming() {
  console.log('Testing CapGraph: Outgoing and incoming edges...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str, binary -> obj
  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:binary', 'media:object', 'Binary to Object');

  registry.registerCapSet('converter', mockHost, [cap1, cap2]);

  const cube = new CapCube();
  cube.addRegistry('converters', registry);

  const graph = cube.graph();

  // binary has 2 outgoing edges
  const outgoing = graph.getOutgoing('media:binary');
  assertEqual(outgoing.length, 2, 'Expected 2 outgoing edges from binary');

  // str has 1 incoming edge
  const incomingStr = graph.getIncoming('media:string');
  assertEqual(incomingStr.length, 1, 'Expected 1 incoming edge to str');

  // obj has 1 incoming edge
  const incomingObj = graph.getIncoming('media:object');
  assertEqual(incomingObj.length, 1, 'Expected 1 incoming edge to obj');

  console.log('  ✓ Outgoing and incoming edges');
}

// TEST126: Test CapGraph canConvert checks direct and transitive conversion paths
function testCapGraphCanConvert() {
  console.log('Testing CapGraph: Can convert...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str -> obj
  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:string', 'media:object', 'String to Object');

  registry.registerCapSet('converter', mockHost, [cap1, cap2]);

  const cube = new CapCube();
  cube.addRegistry('converters', registry);

  const graph = cube.graph();

  // Direct conversions
  assert(graph.canConvert('media:binary', 'media:string'), 'Should convert binary to str');
  assert(graph.canConvert('media:string', 'media:object'), 'Should convert str to obj');

  // Transitive conversion
  assert(graph.canConvert('media:binary', 'media:object'), 'Should convert binary to obj transitively');

  // Same spec
  assert(graph.canConvert('media:binary', 'media:binary'), 'Should convert same spec');

  // Impossible conversions
  assert(!graph.canConvert('media:object', 'media:binary'), 'Should not convert obj to binary');
  assert(!graph.canConvert('media:nonexistent', 'media:string'), 'Should not convert nonexistent');

  console.log('  ✓ Can convert');
}

// TEST127: Test CapGraph findPath returns shortest path between media URNs
function testCapGraphFindPath() {
  console.log('Testing CapGraph: Find path...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str -> obj
  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:string', 'media:object', 'String to Object');

  registry.registerCapSet('converter', mockHost, [cap1, cap2]);

  const cube = new CapCube();
  cube.addRegistry('converters', registry);

  const graph = cube.graph();

  // Direct path
  let path = graph.findPath('media:binary', 'media:string');
  assert(path !== null, 'Should find path from binary to str');
  assertEqual(path.length, 1, 'Expected path length 1');

  // Transitive path
  path = graph.findPath('media:binary', 'media:object');
  assert(path !== null, 'Should find path from binary to obj');
  assertEqual(path.length, 2, 'Expected path length 2');
  assertEqual(path[0].cap.title, 'Binary to String', 'First edge');
  assertEqual(path[1].cap.title, 'String to Object', 'Second edge');

  // No path
  path = graph.findPath('media:object', 'media:binary');
  assertEqual(path, null, 'Should not find impossible path');

  // Same spec
  path = graph.findPath('media:binary', 'media:binary');
  assert(path !== null, 'Should return empty path for same spec');
  assertEqual(path.length, 0, 'Expected empty path for same spec');

  console.log('  ✓ Find path');
}

// TEST128: Test CapGraph findAllPaths returns all paths sorted by length
function testCapGraphFindAllPaths() {
  console.log('Testing CapGraph: Find all paths...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str -> obj
  // binary -> obj (direct)
  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:string', 'media:object', 'String to Object');
  const cap3 = makeGraphCap('media:binary', 'media:object', 'Binary to Object (direct)');

  registry.registerCapSet('converter', mockHost, [cap1, cap2, cap3]);

  const cube = new CapCube();
  cube.addRegistry('converters', registry);

  const graph = cube.graph();

  // Find all paths from binary to obj
  const paths = graph.findAllPaths('media:binary', 'media:object', 3);

  assertEqual(paths.length, 2, 'Expected 2 paths');

  // Paths should be sorted by length (shortest first)
  assertEqual(paths[0].length, 1, 'First path should have length 1 (direct)');
  assertEqual(paths[1].length, 2, 'Second path should have length 2 (via str)');

  console.log('  ✓ Find all paths');
}

// TEST129: Test CapGraph getDirectEdges returns edges sorted by specificity
function testCapGraphGetDirectEdges() {
  console.log('Testing CapGraph: Get direct edges...');

  const registry1 = new CapMatrix();
  const registry2 = new CapMatrix();
  const mockHost1 = { executeCap: async () => ({ textOutput: 'mock1' }) };
  const mockHost2 = { executeCap: async () => ({ textOutput: 'mock2' }) };

  // Two converters: binary -> str with different specificities
  const cap1 = makeGraphCap('media:binary', 'media:string', 'Generic Binary to String');

  // More specific converter (with extra tag for higher specificity)
  const capUrn2 = CapUrn.fromString('cap:ext=pdf;in="media:binary";op=convert;out="media:string"');
  const cap2 = new Cap(capUrn2, 'PDF Binary to String', 'convert', 'PDF Binary to String');

  registry1.registerCapSet('converter1', mockHost1, [cap1]);
  registry2.registerCapSet('converter2', mockHost2, [cap2]);

  const cube = new CapCube();
  cube.addRegistry('reg1', registry1);
  cube.addRegistry('reg2', registry2);

  const graph = cube.graph();

  // Get direct edges (should be sorted by specificity)
  const edges = graph.getDirectEdges('media:binary', 'media:string');

  assertEqual(edges.length, 2, 'Expected 2 direct edges');

  // First should be more specific (PDF converter)
  assertEqual(edges[0].cap.title, 'PDF Binary to String', 'First edge should be more specific');
  assert(edges[0].specificity > edges[1].specificity, 'First edge should have higher specificity');

  console.log('  ✓ Get direct edges');
}

// TEST130: Test CapGraph stats returns node count, edge count, input/output URN counts
function testCapGraphStats() {
  console.log('Testing CapGraph: Stats...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str -> obj
  //         \-> json
  const cap1 = makeGraphCap('media:binary', 'media:string', 'Binary to String');
  const cap2 = makeGraphCap('media:string', 'media:object', 'String to Object');
  const cap3 = makeGraphCap('media:binary', 'media:json', 'Binary to JSON');

  registry.registerCapSet('converter', mockHost, [cap1, cap2, cap3]);

  const cube = new CapCube();
  cube.addRegistry('converters', registry);

  const graph = cube.graph();
  const stats = graph.stats();

  // 4 unique nodes: binary, str, obj, json
  assertEqual(stats.nodeCount, 4, 'Expected 4 nodes');

  // 3 edges
  assertEqual(stats.edgeCount, 3, 'Expected 3 edges');

  // 2 input URNs (binary, str)
  assertEqual(stats.inputUrnCount, 2, 'Expected 2 input URNs');

  // 3 output URNs (str, obj, json)
  assertEqual(stats.outputUrnCount, 3, 'Expected 3 output URNs');

  console.log('  ✓ Stats');
}

// TEST131: Test CapGraph with CapCube builds graph from multiple registries
function testCapGraphWithCapCube() {
  console.log('Testing CapGraph: With CapCube...');

  // Integration test: build graph from CapCube
  const providerRegistry = new CapMatrix();
  const pluginRegistry = new CapMatrix();
  const providerHost = { executeCap: async () => ({ textOutput: 'provider' }) };
  const pluginHost = { executeCap: async () => ({ textOutput: 'plugin' }) };

  // Provider: binary -> str
  const providerCap = makeGraphCap('media:binary', 'media:string', 'Provider Binary to String');
  providerRegistry.registerCapSet('provider', providerHost, [providerCap]);

  // Plugin: str -> obj
  const pluginCap = makeGraphCap('media:string', 'media:object', 'Plugin String to Object');
  pluginRegistry.registerCapSet('plugin', pluginHost, [pluginCap]);

  const cube = new CapCube();
  cube.addRegistry('providers', providerRegistry);
  cube.addRegistry('plugins', pluginRegistry);

  const graph = cube.graph();

  // Should be able to convert binary -> obj through both registries
  assert(graph.canConvert('media:binary', 'media:object'), 'Should convert across registries');

  const path = graph.findPath('media:binary', 'media:object');
  assert(path !== null, 'Should find path');
  assertEqual(path.length, 2, 'Expected path length 2');

  // Verify edges come from different registries
  assertEqual(path[0].registryName, 'providers', 'First edge from providers');
  assertEqual(path[1].registryName, 'plugins', 'Second edge from plugins');

  console.log('  ✓ With CapCube');
}

// ============================================================================
// StdinSource Tests
// ============================================================================

// TEST156: Test creating StdinSource Data variant with byte vector
function testStdinSourceFromData() {
  console.log('Testing StdinSource: From data...');

  const testData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
  const source = StdinSource.fromData(testData);

  assert(source !== null, 'Should create source');
  assertEqual(source.kind, StdinSourceKind.DATA, 'Should be DATA kind');
  assert(source.isData(), 'isData() should return true');
  assert(!source.isFileReference(), 'isFileReference() should return false');
  assertEqual(source.data, testData, 'Should store data');

  console.log('  ✓ From data');
}

// TEST157: Test creating StdinSource FileReference variant with all required fields
function testStdinSourceFromFileReference() {
  console.log('Testing StdinSource: From file reference...');

  const trackedFileId = 'tracked-file-123';
  const originalPath = '/path/to/original.pdf';
  const securityBookmark = new Uint8Array([0x62, 0x6f, 0x6f, 0x6b]); // "book"
  const mediaUrn = 'media:pdf;bytes';

  const source = StdinSource.fromFileReference(trackedFileId, originalPath, securityBookmark, mediaUrn);

  assert(source !== null, 'Should create source');
  assertEqual(source.kind, StdinSourceKind.FILE_REFERENCE, 'Should be FILE_REFERENCE kind');
  assert(!source.isData(), 'isData() should return false');
  assert(source.isFileReference(), 'isFileReference() should return true');
  assertEqual(source.trackedFileId, trackedFileId, 'Should store trackedFileId');
  assertEqual(source.originalPath, originalPath, 'Should store originalPath');
  assertEqual(source.securityBookmark, securityBookmark, 'Should store securityBookmark');
  assertEqual(source.mediaUrn, mediaUrn, 'Should store mediaUrn');

  console.log('  ✓ From file reference');
}

// TEST158: Test StdinSource Data with empty vector stores and retrieves correctly
function testStdinSourceWithEmptyData() {
  console.log('Testing StdinSource: With empty data...');

  const emptyData = new Uint8Array(0);
  const source = StdinSource.fromData(emptyData);

  assert(source !== null, 'Should create source');
  assert(source.isData(), 'Should be data source');
  assertEqual(source.data.length, 0, 'Data length should be 0');

  console.log('  ✓ With empty data');
}

// TEST030: Test StdinSource with null data creates valid Data source
function testStdinSourceWithNullData() {
  console.log('Testing StdinSource: With null data...');

  const source = StdinSource.fromData(null);

  assert(source !== null, 'Should create source');
  assert(source.isData(), 'Should be data source');
  assertEqual(source.data, null, 'Data should be null');

  console.log('  ✓ With null data');
}

// TEST159: Test StdinSource Data with binary content like PNG header bytes
function testStdinSourceWithBinaryContent() {
  console.log('Testing StdinSource: With binary content...');

  // PNG header bytes
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const source = StdinSource.fromData(pngHeader);

  assert(source !== null, 'Should create source');
  assert(source.isData(), 'Should be data source');
  assertEqual(source.data.length, 8, 'Should have 8 bytes');
  assertEqual(source.data[0], 0x89, 'First byte should be 0x89');
  assertEqual(source.data[1], 0x50, 'Second byte should be 0x50 (P)');

  console.log('  ✓ With binary content');
}

// TEST031: Test StdinSourceKind constants are defined and distinct
function testStdinSourceKindConstants() {
  console.log('Testing StdinSource: Kind constants...');

  assert(StdinSourceKind.DATA !== undefined, 'DATA kind should be defined');
  assert(StdinSourceKind.FILE_REFERENCE !== undefined, 'FILE_REFERENCE kind should be defined');
  assert(StdinSourceKind.DATA !== StdinSourceKind.FILE_REFERENCE, 'Kind values should be distinct');

  console.log('  ✓ Kind constants');
}

// TEST032: Test unified arguments are passed correctly to executeCap via CompositeCapSet
function testStdinSourcePassedToExecuteCap() {
  console.log('Testing unified arguments: Passed to executeCap...');

  // Create a mock host that captures arguments
  let receivedArgs = null;
  const mockHost = {
    executeCap: async (capUrn, args) => {
      receivedArgs = args;
      return { textOutput: 'ok' };
    }
  };

  // Create a simple cap
  const cap = new Cap(
    CapUrn.fromString('cap:in="media:void";op=test;out="media:string"'),
    'Test Cap',
    'test-command'
  );

  // Create registry and cube
  const registry = new CapMatrix();
  registry.registerCapSet('test', mockHost, [cap]);

  const cube = new CapCube();
  cube.addRegistry('test', registry);

  // Test with CapArgumentValue
  const args = [new CapArgumentValue('media:void', new Uint8Array([1, 2, 3]))];
  const { compositeHost } = cube.can('cap:in="media:void";op=test;out="media:string"');

  // Execute and verify
  return compositeHost.executeCap(
    'cap:in="media:void";op=test;out="media:string"',
    args
  ).then(() => {
    assert(receivedArgs !== null, 'Should receive arguments');
    assert(Array.isArray(receivedArgs), 'Should receive array of arguments');
    assertEqual(receivedArgs.length, 1, 'Should have one argument');
    assertEqual(receivedArgs[0].mediaUrn, 'media:void', 'Should have correct mediaUrn');
    assertEqual(receivedArgs[0].value.length, 3, 'Should have correct data length');
    console.log('  ✓ Passed to executeCap');
  });
}

// TEST033: Test binary CapArgumentValue is passed correctly through executeCap
function testStdinSourceFileReferencePassedToExecuteCap() {
  console.log('Testing unified arguments: Binary argument passed to executeCap...');

  // Create a mock host that captures arguments
  let receivedArgs = null;
  const mockHost = {
    executeCap: async (capUrn, args) => {
      receivedArgs = args;
      return { textOutput: 'ok' };
    }
  };

  // Create a simple cap
  const cap = new Cap(
    CapUrn.fromString('cap:in="media:void";op=test;out="media:string"'),
    'Test Cap',
    'test-command'
  );

  // Create registry and cube
  const registry = new CapMatrix();
  registry.registerCapSet('test', mockHost, [cap]);

  const cube = new CapCube();
  cube.addRegistry('test', registry);

  // Test with binary CapArgumentValue
  const binaryArg = new CapArgumentValue('media:pdf;bytes', new Uint8Array([0x89, 0x50, 0x4E, 0x47]));
  const args = [binaryArg];

  const { compositeHost } = cube.can('cap:in="media:void";op=test;out="media:string"');

  // Execute and verify
  return compositeHost.executeCap(
    'cap:in="media:void";op=test;out="media:string"',
    args
  ).then(() => {
    assert(receivedArgs !== null, 'Should receive arguments');
    assertEqual(receivedArgs.length, 1, 'Should have one argument');
    assertEqual(receivedArgs[0].mediaUrn, 'media:pdf;bytes', 'Should have correct mediaUrn');
    assertEqual(receivedArgs[0].value[0], 0x89, 'First byte should be 0x89');
    assertEqual(receivedArgs[0].value.length, 4, 'Should have correct data length');
    console.log('  ✓ Binary argument passed to executeCap');
  });
}

// ============================================================================
// XV5 VALIDATION TESTS
// TEST054-056: Validate that inline media_specs don't redefine registry specs
// ============================================================================

// TEST054: Test XV5 validation detects inline media spec redefinition of registry spec
function testXV5InlineSpecRedefinitionDetected() {
  console.log('Testing XV5: Inline spec redefinition detected...');

  // Mock registry lookup that reports MEDIA_STRING as existing in registry
  const registryLookup = (mediaUrn) => mediaUrn === MEDIA_STRING;

  // Try to redefine MEDIA_STRING which is in the registry (array format with urn field)
  const mediaSpecs = [
    {
      urn: MEDIA_STRING,
      media_type: 'text/plain',
      title: 'My Custom String',
      description: 'Trying to redefine string'
    }
  ];

  const result = validateNoMediaSpecRedefinitionSync(mediaSpecs, registryLookup);

  assert(!result.valid, 'Should fail validation when redefining registry spec');
  assert(result.error && result.error.includes('XV5'), 'Error should mention XV5');
  assert(result.redefines && result.redefines.includes(MEDIA_STRING), 'Should identify MEDIA_STRING as redefined');

  console.log('  ✓ Inline spec redefinition detected');
}

// TEST055: Test XV5 validation allows new inline media spec not in registry
function testXV5NewInlineSpecAllowed() {
  console.log('Testing XV5: New inline spec allowed...');

  // Mock registry lookup that reports MEDIA_STRING as existing, but not custom specs
  const registryLookup = (mediaUrn) => mediaUrn === MEDIA_STRING;

  // Define a completely new media spec that doesn't exist in registry (array format)
  const mediaSpecs = [
    {
      urn: 'media:my-unique-custom-type-xyz123',
      media_type: 'application/json',
      title: 'My Custom Output',
      description: 'A custom output type'
    }
  ];

  const result = validateNoMediaSpecRedefinitionSync(mediaSpecs, registryLookup);

  assert(result.valid, 'Should pass validation for new spec not in registry');
  assert(!result.error, 'Should not have error message');

  console.log('  ✓ New inline spec allowed');
}

// TEST056: Test XV5 validation passes for empty or null media_specs
function testXV5EmptyMediaSpecsAllowed() {
  console.log('Testing XV5: Empty media_specs allowed...');

  // Mock registry lookup function
  const registryLookup = (mediaUrn) => mediaUrn === MEDIA_STRING;

  // Empty or null media_specs should pass
  let result = validateNoMediaSpecRedefinitionSync({}, registryLookup);
  assert(result.valid, 'Empty object should pass validation');

  result = validateNoMediaSpecRedefinitionSync(null, registryLookup);
  assert(result.valid, 'Null should pass validation');

  result = validateNoMediaSpecRedefinitionSync(undefined, registryLookup);
  assert(result.valid, 'Undefined should pass validation');

  console.log('  ✓ Empty media_specs allowed');
}

// ============================================================================
// TEST051-052: Semantic direction matching
// ============================================================================

// TEST051: Semantic direction matching - generic provider matches specific request
function testDirectionSemanticMatching() {
  console.log('Testing direction semantic matching...');

  // A cap accepting media:bytes (generic) should match a request with media:pdf;bytes (specific)
  // because media:pdf;bytes has all marker tags that media:bytes requires (bytes=*)
  const genericCap = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  const pdfRequest = CapUrn.fromString(
    'cap:in="media:pdf;bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  assert(genericCap.accepts(pdfRequest),
    'Generic bytes provider must accept specific pdf;bytes request');

  // Generic cap also accepts epub;bytes (any bytes subtype)
  const epubRequest = CapUrn.fromString(
    'cap:in="media:epub;bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  assert(genericCap.accepts(epubRequest),
    'Generic bytes provider must accept epub;bytes request');

  // Reverse: specific cap does NOT accept generic request
  const pdfCap = CapUrn.fromString(
    'cap:in="media:pdf;bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  const genericRequest = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  assert(!pdfCap.accepts(genericRequest),
    'Specific pdf;bytes cap must NOT accept generic bytes request');

  // Incompatible types: pdf cap does NOT accept epub request
  assert(!pdfCap.accepts(epubRequest),
    'PDF-specific cap must NOT accept epub request (epub lacks pdf marker)');

  // Output direction: cap producing more specific output accepts less specific request
  const specificOutCap = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  const genericOutRequest = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;bytes"'
  );
  assert(specificOutCap.accepts(genericOutRequest),
    'Cap producing image;png;bytes;thumbnail must satisfy request for image;bytes');

  // Reverse output: generic output cap does NOT accept specific output request
  const genericOutCap = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;bytes"'
  );
  const specificOutRequest = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  assert(!genericOutCap.accepts(specificOutRequest),
    'Cap producing generic image;bytes must NOT satisfy request requiring image;png;bytes;thumbnail');

  console.log('  ✓ Direction semantic matching');
}

// TEST052: Semantic direction specificity - more media URN tags = higher specificity
function testDirectionSemanticSpecificity() {
  console.log('Testing direction semantic specificity...');

  // media:bytes has 1 tag, media:pdf;bytes has 2 tags
  // media:image;png;bytes;thumbnail has 4 tags
  const genericCap = CapUrn.fromString(
    'cap:in="media:bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  const specificCap = CapUrn.fromString(
    'cap:in="media:pdf;bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );

  // generic: bytes(1) + image;png;bytes;thumbnail(4) + op(1) = 6
  assertEqual(genericCap.specificity(), 6, 'generic cap specificity must be 6');
  // specific: pdf;bytes(2) + image;png;bytes;thumbnail(4) + op(1) = 7
  assertEqual(specificCap.specificity(), 7, 'specific cap specificity must be 7');

  assert(specificCap.specificity() > genericCap.specificity(),
    'pdf;bytes cap must be more specific than bytes cap');

  // CapMatcher should prefer the more specific cap when both match
  const pdfRequest = CapUrn.fromString(
    'cap:in="media:pdf;bytes";op=generate_thumbnail;out="media:image;png;bytes;thumbnail"'
  );
  const best = CapMatcher.findBestMatch([genericCap, specificCap], pdfRequest);
  assert(best !== null, 'CapMatcher must find a match');
  assertEqual(best.getInSpec(), 'media:pdf;bytes',
    'CapMatcher must prefer the more specific pdf;bytes provider');

  console.log('  ✓ Direction semantic specificity');
}

// ============================================================================
// TEST274-283: CapArgumentValue tests
// ============================================================================

// TEST274: Test CapArgumentValue constructor stores media_urn and raw byte value
function testCapArgumentValueNew() {
  console.log('Testing CapArgumentValue: new...');
  const arg = new CapArgumentValue('media:model-spec;textable;form=scalar', new Uint8Array([103, 112, 116, 45, 52])); // "gpt-4"
  assertEqual(arg.mediaUrn, 'media:model-spec;textable;form=scalar', 'mediaUrn must match');
  assertEqual(arg.value.length, 5, 'value must have 5 bytes');
  console.log('  ✓ CapArgumentValue new');
}

// TEST275: Test CapArgumentValue.fromStr converts string to UTF-8 bytes
function testCapArgumentValueFromStr() {
  console.log('Testing CapArgumentValue: fromStr...');
  const arg = CapArgumentValue.fromStr('media:string;textable', 'hello world');
  assertEqual(arg.mediaUrn, 'media:string;textable', 'mediaUrn must match');
  const decoded = new TextDecoder().decode(arg.value);
  assertEqual(decoded, 'hello world', 'value must decode to hello world');
  console.log('  ✓ CapArgumentValue fromStr');
}

// TEST276: Test CapArgumentValue.valueAsStr succeeds for UTF-8 data
function testCapArgumentValueAsStrValid() {
  console.log('Testing CapArgumentValue: valueAsStr valid...');
  const arg = CapArgumentValue.fromStr('media:string', 'test');
  assertEqual(arg.valueAsStr(), 'test', 'valueAsStr must return test');
  console.log('  ✓ CapArgumentValue valueAsStr valid');
}

// TEST277: Test CapArgumentValue.valueAsStr fails for non-UTF-8 binary data
function testCapArgumentValueAsStrInvalidUtf8() {
  console.log('Testing CapArgumentValue: valueAsStr invalid UTF-8...');
  const arg = new CapArgumentValue('media:pdf;bytes', new Uint8Array([0xFF, 0xFE, 0x80]));
  let threw = false;
  try {
    arg.valueAsStr();
  } catch (e) {
    threw = true;
  }
  assert(threw, 'non-UTF-8 data must fail on valueAsStr with fatal decoder');
  console.log('  ✓ CapArgumentValue valueAsStr invalid UTF-8');
}

// TEST278: Test CapArgumentValue with empty value stores empty Uint8Array
function testCapArgumentValueEmpty() {
  console.log('Testing CapArgumentValue: empty value...');
  const arg = new CapArgumentValue('media:void', new Uint8Array([]));
  assertEqual(arg.value.length, 0, 'empty value must have 0 bytes');
  assertEqual(arg.valueAsStr(), '', 'empty value as string must be empty string');
  console.log('  ✓ CapArgumentValue empty');
}

// TEST282: Test CapArgumentValue.fromStr with Unicode string preserves all characters
function testCapArgumentValueUnicode() {
  console.log('Testing CapArgumentValue: Unicode...');
  const arg = CapArgumentValue.fromStr('media:string', 'hello 世界 🌍');
  assertEqual(arg.valueAsStr(), 'hello 世界 🌍', 'Unicode must roundtrip');
  console.log('  ✓ CapArgumentValue Unicode');
}

// TEST283: Test CapArgumentValue with large binary payload preserves all bytes
function testCapArgumentValueLargeBinary() {
  console.log('Testing CapArgumentValue: large binary...');
  const data = new Uint8Array(10000);
  for (let i = 0; i < 10000; i++) {
    data[i] = i % 256;
  }
  const arg = new CapArgumentValue('media:pdf;bytes', data);
  assertEqual(arg.value.length, 10000, 'large binary must preserve all bytes');
  assertEqual(arg.value[0], 0, 'first byte check');
  assertEqual(arg.value[255], 255, 'byte 255 check');
  assertEqual(arg.value[256], 0, 'byte 256 wraps check');
  console.log('  ✓ CapArgumentValue large binary');
}

// ============================================================================
// TEST304-306: MEDIA_AVAILABILITY_OUTPUT and MEDIA_PATH_OUTPUT tests
// ============================================================================

// TEST304: Test MEDIA_AVAILABILITY_OUTPUT constant parses as valid media URN with correct tags
function testMediaAvailabilityOutputConstant() {
  console.log('Testing MEDIA_AVAILABILITY_OUTPUT constant...');
  const { TaggedUrn } = require('tagged-urn');
  const urn = TaggedUrn.fromString(MEDIA_AVAILABILITY_OUTPUT);
  assert(urn.getTag('textable') !== undefined, 'model-availability must be textable');
  assertEqual(urn.getTag('form'), 'map', 'model-availability must be form=map');
  assert(urn.getTag('bytes') === undefined, 'model-availability must not be binary');
  // Roundtrip
  const reparsed = TaggedUrn.fromString(urn.toString());
  assert(urn.conformsTo(reparsed), 'roundtrip must match original');
  console.log('  ✓ MEDIA_AVAILABILITY_OUTPUT');
}

// TEST305: Test MEDIA_PATH_OUTPUT constant parses as valid media URN with correct tags
function testMediaPathOutputConstant() {
  console.log('Testing MEDIA_PATH_OUTPUT constant...');
  const { TaggedUrn } = require('tagged-urn');
  const urn = TaggedUrn.fromString(MEDIA_PATH_OUTPUT);
  assert(urn.getTag('textable') !== undefined, 'model-path must be textable');
  assertEqual(urn.getTag('form'), 'map', 'model-path must be form=map');
  assert(urn.getTag('bytes') === undefined, 'model-path must not be binary');
  // Roundtrip
  const reparsed = TaggedUrn.fromString(urn.toString());
  assert(urn.conformsTo(reparsed), 'roundtrip must match original');
  console.log('  ✓ MEDIA_PATH_OUTPUT');
}

// TEST306: Test MEDIA_AVAILABILITY_OUTPUT and MEDIA_PATH_OUTPUT are distinct URNs
function testAvailabilityAndPathOutputDistinct() {
  console.log('Testing MEDIA_AVAILABILITY_OUTPUT and MEDIA_PATH_OUTPUT distinct...');
  const { TaggedUrn } = require('tagged-urn');
  assert(MEDIA_AVAILABILITY_OUTPUT !== MEDIA_PATH_OUTPUT,
    'availability and path output must be distinct media URNs');
  const avail = TaggedUrn.fromString(MEDIA_AVAILABILITY_OUTPUT);
  const path = TaggedUrn.fromString(MEDIA_PATH_OUTPUT);
  // They must NOT conform to each other (different types)
  let matchResult;
  try {
    matchResult = avail.conformsTo(path);
  } catch (e) {
    matchResult = false;
  }
  assert(!matchResult, 'availability must not conform to path');
  console.log('  ✓ Availability and path output distinct');
}

// ============================================================================
// TEST307-312: Standard cap URN builder tests
// ============================================================================

// TEST307: Test model_availability_urn builds valid cap URN with correct op and media specs
function testModelAvailabilityUrn() {
  console.log('Testing modelAvailabilityUrn...');
  const urn = modelAvailabilityUrn();
  assert(urn.hasTag('op', 'model-availability'), 'URN must have op=model-availability');
  // Compare in_spec semantically
  const { TaggedUrn } = require('tagged-urn');
  const inSpec = TaggedUrn.fromString(urn.getInSpec());
  const expectedIn = TaggedUrn.fromString(CAPNS_MEDIA_MODEL_SPEC);
  assert(inSpec.conformsTo(expectedIn), 'input must conform to MEDIA_MODEL_SPEC');
  const outSpec = TaggedUrn.fromString(urn.getOutSpec());
  const expectedOut = TaggedUrn.fromString(MEDIA_AVAILABILITY_OUTPUT);
  assert(outSpec.conformsTo(expectedOut), 'output must conform to MEDIA_AVAILABILITY_OUTPUT');
  console.log('  ✓ modelAvailabilityUrn');
}

// TEST308: Test model_path_urn builds valid cap URN with correct op and media specs
function testModelPathUrn() {
  console.log('Testing modelPathUrn...');
  const urn = modelPathUrn();
  assert(urn.hasTag('op', 'model-path'), 'URN must have op=model-path');
  const { TaggedUrn } = require('tagged-urn');
  const inSpec = TaggedUrn.fromString(urn.getInSpec());
  const expectedIn = TaggedUrn.fromString(CAPNS_MEDIA_MODEL_SPEC);
  assert(inSpec.conformsTo(expectedIn), 'input must conform to MEDIA_MODEL_SPEC');
  const outSpec = TaggedUrn.fromString(urn.getOutSpec());
  const expectedOut = TaggedUrn.fromString(MEDIA_PATH_OUTPUT);
  assert(outSpec.conformsTo(expectedOut), 'output must conform to MEDIA_PATH_OUTPUT');
  console.log('  ✓ modelPathUrn');
}

// TEST309: Test model_availability_urn and model_path_urn produce distinct URNs
function testModelAvailabilityAndPathAreDistinct() {
  console.log('Testing modelAvailabilityUrn and modelPathUrn distinct...');
  const avail = modelAvailabilityUrn();
  const path = modelPathUrn();
  assert(avail.toString() !== path.toString(),
    'availability and path must be distinct cap URNs');
  console.log('  ✓ modelAvailabilityUrn and modelPathUrn distinct');
}

// TEST310: Test llm_conversation_urn uses unconstrained tag (not constrained)
function testLlmConversationUrnUnconstrained() {
  console.log('Testing llmConversationUrn unconstrained...');
  const urn = llmConversationUrn('en');
  assert(urn.getTag('unconstrained') !== undefined, 'LLM conversation URN must have unconstrained tag');
  assert(urn.hasTag('op', 'conversation'), 'must have op=conversation');
  assert(urn.hasTag('language', 'en'), 'must have language=en');
  console.log('  ✓ llmConversationUrn unconstrained');
}

// TEST311: Test llm_conversation_urn in/out specs match the expected media URNs semantically
function testLlmConversationUrnSpecs() {
  console.log('Testing llmConversationUrn specs...');
  const { TaggedUrn } = require('tagged-urn');
  const urn = llmConversationUrn('fr');

  // Compare semantically via TaggedUrn matching (tag order may differ)
  const inSpec = TaggedUrn.fromString(urn.getInSpec());
  const expectedIn = TaggedUrn.fromString(CAPNS_MEDIA_STRING);
  assert(inSpec.conformsTo(expectedIn),
    `in_spec '${urn.getInSpec()}' must conform to MEDIA_STRING '${CAPNS_MEDIA_STRING}'`);

  const outSpec = TaggedUrn.fromString(urn.getOutSpec());
  const expectedOut = TaggedUrn.fromString(MEDIA_LLM_INFERENCE_OUTPUT);
  assert(outSpec.conformsTo(expectedOut),
    `out_spec '${urn.getOutSpec()}' must conform to '${MEDIA_LLM_INFERENCE_OUTPUT}'`);
  console.log('  ✓ llmConversationUrn specs');
}

// TEST312: Test all URN builders produce parseable cap URNs
function testAllUrnBuildersProduceValidUrns() {
  console.log('Testing all URN builders produce valid URNs...');
  // Each of these must not throw
  const avail = modelAvailabilityUrn();
  const path = modelPathUrn();
  const conv = llmConversationUrn('en');

  // Verify they roundtrip through CapUrn parsing
  const availStr = avail.toString();
  const parsedAvail = CapUrn.fromString(availStr);
  assert(parsedAvail !== null, 'modelAvailabilityUrn must be parseable');

  const pathStr = path.toString();
  const parsedPath = CapUrn.fromString(pathStr);
  assert(parsedPath !== null, 'modelPathUrn must be parseable');

  const convStr = conv.toString();
  const parsedConv = CapUrn.fromString(convStr);
  assert(parsedConv !== null, 'llmConversationUrn must be parseable');

  console.log('  ✓ All URN builders produce valid URNs');
}

// Update runTests to include new tests
async function runTests() {
  console.log('Running Cap URN JavaScript tests...\n');

  // Original URN tests
  testCapUrnCreation();
  testCaseInsensitive();
  testCapPrefixRequired();
  testTrailingSemicolonEquivalence();
  testCanonicalStringFormat();
  testTagMatching();
  testMissingTagHandling();
  testSpecificity();
  testCompatibility();
  testBuilder();
  testConvenienceMethods();
  testCapMatcher();
  testJSONSerialization();
  testEmptyCapUrn();
  testExtendedCharacterSupport();
  testWildcardRestrictions();
  testDuplicateKeyRejection();
  testNumericKeyRestriction();

  // New format tests (MediaSpec is now array, no string form parsing)
  testMediaSpecConstruction();
  testMediaUrnResolutionRequiresMediaSpecs();
  testMediaUrnResolutionWithMediaSpecs();
  testMediaUrnResolutionFailHard();
  testMetadataPropagation();
  testMetadataWithValidation();

  // Extensions field tests
  testExtensionsPropagation();
  testExtensionsWithMetadataAndValidation();
  testMultipleExtensions();
  testBuildExtensionIndex();
  testMediaUrnsForExtension();
  testGetExtensionMappings();
  testCapWithMediaSpecs();
  testCapJSONSerialization();
  testOpTagRename();

  // Matching semantics specification tests (10 tests with direction support)
  testMatchingSemantics_Test1_ExactMatch();
  testMatchingSemantics_Test2_CapMissingTag();
  testMatchingSemantics_Test3_CapHasExtraTag();
  testMatchingSemantics_Test4_RequestHasWildcard();
  testMatchingSemantics_Test5_CapHasWildcard();
  testMatchingSemantics_Test6_ValueMismatch();
  testMatchingSemantics_Test7_FallbackPattern();
  testMatchingSemantics_Test8_WildcardCapMatchesAnything();
  testMatchingSemantics_Test9_CrossDimensionIndependence();
  testMatchingSemantics_Test10_DirectionMismatch();

  // CapMatrix and CapCube tests
  testCapCubeMoreSpecificWins();
  testCapCubeTieGoesToFirst();
  testCapCubePollsAll();
  testCapCubeNoMatch();
  testCapCubeFallbackScenario();
  testCapCubeCanMethod();
  testCapCubeRegistryManagement();

  // CapGraph tests
  testCapGraphBasicConstruction();
  testCapGraphOutgoingIncoming();
  testCapGraphCanConvert();
  testCapGraphFindPath();
  testCapGraphFindAllPaths();
  testCapGraphGetDirectEdges();
  testCapGraphStats();
  testCapGraphWithCapCube();

  // StdinSource tests
  testStdinSourceFromData();
  testStdinSourceFromFileReference();
  testStdinSourceWithEmptyData();
  testStdinSourceWithNullData();
  testStdinSourceWithBinaryContent();
  testStdinSourceKindConstants();
  await testStdinSourcePassedToExecuteCap();
  await testStdinSourceFileReferencePassedToExecuteCap();

  // XV5 validation tests
  testXV5InlineSpecRedefinitionDetected();
  testXV5NewInlineSpecAllowed();
  testXV5EmptyMediaSpecsAllowed();

  // Semantic direction matching tests
  testDirectionSemanticMatching();
  testDirectionSemanticSpecificity();

  // CapArgumentValue tests
  testCapArgumentValueNew();
  testCapArgumentValueFromStr();
  testCapArgumentValueAsStrValid();
  testCapArgumentValueAsStrInvalidUtf8();
  testCapArgumentValueEmpty();
  testCapArgumentValueUnicode();
  testCapArgumentValueLargeBinary();

  // Media output constant tests
  testMediaAvailabilityOutputConstant();
  testMediaPathOutputConstant();
  testAvailabilityAndPathOutputDistinct();

  // Standard cap URN builder tests
  testModelAvailabilityUrn();
  testModelPathUrn();
  testModelAvailabilityAndPathAreDistinct();
  testLlmConversationUrnUnconstrained();
  testLlmConversationUrnSpecs();
  testAllUrnBuildersProduceValidUrns();

  console.log('OK All tests passed!');
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