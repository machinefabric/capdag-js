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
  validateNoMediaSpecRedefinitionSync
} = require('./capns.js');

// Media URN constants (previously exported from capns.js as built-ins)
const MEDIA_STRING = 'media:string';
const MEDIA_INTEGER = 'media:integer';
const MEDIA_NUMBER = 'media:number';
const MEDIA_BOOLEAN = 'media:boolean';
const MEDIA_OBJECT = 'media:object';
const MEDIA_BINARY = 'media:binary';
const MEDIA_VOID = 'media:void';

// Media spec definitions for tests (no longer built into capns.js)
const TEST_MEDIA_SPECS = {
  [MEDIA_STRING]: 'text/plain; profile=https://capns.org/schema/str',
  [MEDIA_INTEGER]: 'text/plain; profile=https://capns.org/schema/int',
  [MEDIA_OBJECT]: 'application/json; profile=https://capns.org/schema/obj',
  [MEDIA_BINARY]: 'application/octet-stream'
};

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
 * @param {string} tags - Additional tags to add (empty string for minimal URN)
 * @returns {string} A valid cap URN string with in/out
 */
function testUrn(tags) {
  if (!tags || tags === '') {
    return 'cap:in="media:void";out="media:form=map"';
  }
  return 'cap:in="media:void";out="media:form=map";' + tags;
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
  assertEqual(cap.getOutSpec(), 'media:form=map', 'Should get outSpec');

  console.log('  ✓ Cap URN creation');
}

// TEST002: Test that tag keys and values are normalized to lowercase for case-insensitive comparison
function testCaseInsensitive() {
  console.log('Testing case insensitive behavior...');

  // Test that different casing produces the same URN
  const cap1 = CapUrn.fromString('cap:IN="media:void";OUT="media:form=map";OP=Generate;EXT=PDF;Target=Thumbnail');
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
  assertEqual(cap1.getTag('OUT'), 'media:form=map', 'Should lookup out with case-insensitive key');

  // Matching should work case-insensitively
  assert(cap1.matches(cap2), 'Should match case-insensitively');
  assert(cap2.matches(cap1), 'Should match case-insensitively');

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

  // They should match each other
  assert(cap1.matches(cap2), 'Should match each other');
  assert(cap2.matches(cap1), 'Should match each other');

  console.log('  ✓ Trailing semicolon equivalence');
}

// TEST005: Test that toString produces canonical form with alphabetically sorted tags
function testCanonicalStringFormat() {
  console.log('Testing canonical string format...');

  const cap = CapUrn.fromString(testUrn('op=generate;target=thumbnail;ext=pdf'));
  // Should be sorted alphabetically and have no trailing semicolon in canonical form
  // in/out are included in alphabetical order: 'ext' < 'in' < 'op' < 'out' < 'target'
  // Values with '=' need quoting - media:form=map requires quotes
  assertEqual(cap.toString(), 'cap:ext=pdf;in=media:void;op=generate;out="media:form=map";target=thumbnail', 'Should be alphabetically sorted');

  console.log('  ✓ Canonical string format');
}

// TEST006: Test that cap matches request with exact tags, subset tags, and wildcards
function testTagMatching() {
  console.log('Testing tag matching...');

  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf;target=thumbnail'));

  // Exact match
  const request1 = CapUrn.fromString(testUrn('op=generate;ext=pdf;target=thumbnail'));
  assert(cap.matches(request1), 'Should match exact request');

  // Subset match (other tags)
  const request2 = CapUrn.fromString(testUrn('op=generate'));
  assert(cap.matches(request2), 'Should match subset request');

  // Wildcard request should match specific cap
  const request3 = CapUrn.fromString(testUrn('ext=*'));
  assert(cap.matches(request3), 'Should match wildcard request');

  // No match - conflicting value
  const request4 = CapUrn.fromString(testUrn('op=extract'));
  assert(!cap.matches(request4), 'Should not match conflicting value');

  // Direction must match
  const request5 = CapUrn.fromString('cap:in="media:string";out="media:object";op=generate');
  assert(!cap.matches(request5), 'Should not match different inSpec');

  console.log('  ✓ Tag matching');
}

// TEST007: Test that missing tags are treated as wildcards for matching
function testMissingTagHandling() {
  console.log('Testing missing tag handling...');

  const cap = CapUrn.fromString(testUrn('op=generate'));

  // Request with tag should match cap without tag (treated as wildcard)
  const request1 = CapUrn.fromString(testUrn('ext=pdf'));
  assert(cap.matches(request1), 'Should match when cap has missing tag (wildcard)');

  // But cap with extra tags can match subset requests
  const cap2 = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request2 = CapUrn.fromString(testUrn('op=generate'));
  assert(cap2.matches(request2), 'Should match subset request');

  console.log('  ✓ Missing tag handling');
}

// TEST008: Test that specificity counts non-wildcard tags including in and out
function testSpecificity() {
  console.log('Testing specificity...');

  // Specificity now includes in/out (2) plus other tags
  const cap1 = CapUrn.fromString(testUrn('type=general'));
  const cap2 = CapUrn.fromString(testUrn('op=generate'));
  const cap3 = CapUrn.fromString(testUrn('op=*;ext=pdf'));

  // Base: in=media:void (1) + out=media:object (1) = 2
  assertEqual(cap1.specificity(), 3, 'Should have specificity 3 (2 for in/out + 1 for type)');
  assertEqual(cap2.specificity(), 3, 'Should have specificity 3 (2 for in/out + 1 for op)');
  assertEqual(cap3.specificity(), 3, 'Should have specificity 3 (2 for in/out + 1 for ext, op=* does not count)');

  // Test with wildcard in/out
  const cap4 = CapUrn.fromString('cap:in=*;out=*;op=generate');
  assertEqual(cap4.specificity(), 1, 'Should have specificity 1 (wildcards for in/out do not count)');

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
  assertEqual(modified.getOutSpec(), 'media:form=map', 'Should preserve outSpec');

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
  assertEqual(best.toString(), 'cap:ext=pdf;in=media:void;op=generate;out="media:form=map"', 'Should find most specific match');

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
  assertEqual(restored.getOutSpec(), 'media:form=map', 'Should preserve outSpec');

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
  assertEqual(minimal.getOutSpec(), 'media:form=map', 'Should have outSpec');

  // For "match anything" behavior, use wildcards
  const wildcard = CapUrn.fromString('cap:in=*;out=*');
  const specific = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(wildcard.matches(specific), 'Wildcard should match any cap');
  assert(wildcard.matches(wildcard), 'Wildcard should match itself');

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

// TEST057: Test MediaSpec parses canonical format without content-type prefix
function testMediaSpecCanonicalFormat() {
  console.log('Testing MediaSpec canonical format...');

  // Should parse canonical format (no content-type: prefix)
  const spec1 = MediaSpec.parse('text/plain; profile=https://capns.org/schema/str');
  assertEqual(spec1.contentType, 'text/plain', 'Should parse content type');
  assertEqual(spec1.profile, 'https://capns.org/schema/str', 'Should parse profile');

  // Should parse without profile
  const spec2 = MediaSpec.parse('application/json');
  assertEqual(spec2.contentType, 'application/json', 'Should parse content type without profile');
  assertEqual(spec2.profile, null, 'Should have null profile');

  // Should output canonical form (no prefix)
  assertEqual(spec1.toString(), 'text/plain; profile="https://capns.org/schema/str"', 'Should output canonical form');
  assertEqual(spec2.toString(), 'application/json', 'Should output content type only');

  console.log('  ✓ MediaSpec canonical format');
}

// TEST058: Test MediaSpec fails hard on legacy content-type prefix format
function testMediaSpecLegacyFormatRejection() {
  console.log('Testing legacy format rejection...');

  // MUST FAIL HARD on legacy content-type: prefix
  let caught = false;
  try {
    MediaSpec.parse('content-type: text/plain; profile=https://example.com');
  } catch (e) {
    if (e instanceof MediaSpecError && e.code === MediaSpecErrorCodes.LEGACY_FORMAT) {
      caught = true;
    } else {
      throw new Error(`Expected MediaSpecError with LEGACY_FORMAT code, got: ${e.message}`);
    }
  }
  assert(caught, 'Should reject legacy content-type: prefix');

  console.log('  ✓ Legacy format rejection');
}


// TEST060: Test resolveMediaUrn requires mediaSpecs table for resolution
function testMediaUrnResolutionRequiresMediaSpecs() {
  console.log('Testing media URN resolution requires mediaSpecs...');

  // Media specs table with definitions
  const mediaSpecs = {
    [MEDIA_STRING]: 'text/plain; profile=https://capns.org/schema/str',
    [MEDIA_INTEGER]: 'text/plain; profile=https://capns.org/schema/int',
    [MEDIA_OBJECT]: 'application/json; profile=https://capns.org/schema/obj',
    [MEDIA_BINARY]: 'application/octet-stream'
  };

  // Should resolve spec IDs from mediaSpecs table
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

// TEST061: Test resolveMediaUrn resolves custom media URNs from mediaSpecs table
function testMediaUrnResolutionWithMediaSpecs() {
  console.log('Testing media URN resolution with custom mediaSpecs...');

  // Custom mediaSpecs table (using media URN format as keys)
  // Includes MEDIA_STRING so resolution works
  const mediaSpecs = {
    'media:custom-json': 'application/json; profile=https://example.com/schema/custom',
    'media:rich-xml': {
      media_type: 'application/xml',
      profile_uri: 'https://example.com/schema/rich',
      schema: { type: 'object' }
    },
    [MEDIA_STRING]: 'text/plain; profile=https://capns.org/schema/str'
  };

  // Should resolve custom string form
  const customSpec = resolveMediaUrn('media:custom-json', mediaSpecs);
  assertEqual(customSpec.contentType, 'application/json', 'Should resolve custom spec');
  assertEqual(customSpec.profile, 'https://example.com/schema/custom', 'Should have custom profile');

  // Should resolve custom object form with schema
  const richSpec = resolveMediaUrn('media:rich-xml', mediaSpecs);
  assertEqual(richSpec.contentType, 'application/xml', 'Should resolve rich spec');
  assertEqual(richSpec.profile, 'https://example.com/schema/rich', 'Should have rich profile');
  assert(richSpec.schema !== null, 'Should have schema from object form');

  // Should resolve MEDIA_STRING from mediaSpecs table
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
    resolveMediaUrn('media:nonexistent', {});
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

// TEST063: Test metadata is propagated from object form media spec definition
function testMetadataPropagation() {
  console.log('Testing metadata propagation...');

  // Create a media spec definition with metadata
  const mediaSpecs = {
    'media:custom-setting;setting': {
      media_type: 'text/plain',
      profile_uri: 'https://example.com/schema',
      title: 'Custom Setting',
      description: 'A custom setting',
      metadata: {
        category_key: 'interface',
        ui_type: 'SETTING_UI_TYPE_CHECKBOX',
        subcategory_key: 'appearance',
        display_index: 5
      }
    }
  };

  // Resolve and verify metadata is propagated
  const resolved = resolveMediaUrn('media:custom-setting;setting', mediaSpecs);
  assert(resolved.metadata !== null, 'Should have metadata');
  assertEqual(resolved.metadata.category_key, 'interface', 'Should have category_key');
  assertEqual(resolved.metadata.ui_type, 'SETTING_UI_TYPE_CHECKBOX', 'Should have ui_type');
  assertEqual(resolved.metadata.subcategory_key, 'appearance', 'Should have subcategory_key');
  assertEqual(resolved.metadata.display_index, 5, 'Should have display_index');

  console.log('  ✓ Metadata propagation from object definition');
}

// TEST064: Test string form media spec definition has no metadata
function testMetadataForStringDef() {
  console.log('Testing metadata for string definition...');

  // String form definitions should have no metadata
  const mediaSpecs = {
    'media:simple;textable': 'text/plain; profile=https://example.com'
  };

  const resolved = resolveMediaUrn('media:simple;textable', mediaSpecs);
  assert(resolved.metadata === null, 'String form should have no metadata');

  console.log('  ✓ String form has no metadata');
}

// TEST065: Test string form definitions have no metadata
function testMetadataForSimpleStringDef() {
  console.log('Testing metadata for simple string definition...');

  // String form definitions should have no metadata
  const mediaSpecs = {
    [MEDIA_STRING]: 'text/plain; profile=https://capns.org/schema/str'
  };

  const resolved = resolveMediaUrn(MEDIA_STRING, mediaSpecs);
  assert(resolved.metadata === null, 'String form definition should have no metadata');

  console.log('  ✓ String form definition has no metadata');
}

// TEST066: Test metadata and validation coexist in media spec definition
function testMetadataWithValidation() {
  console.log('Testing metadata with validation...');

  // Ensure metadata and validation can coexist
  const mediaSpecs = {
    'media:bounded-number;numeric;setting': {
      media_type: 'text/plain',
      profile_uri: 'https://example.com/schema',
      title: 'Bounded Number',
      validation: {
        min: 0,
        max: 100
      },
      metadata: {
        category_key: 'inference',
        ui_type: 'SETTING_UI_TYPE_SLIDER'
      }
    }
  };

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

// TEST067: Test extension field is propagated from object form media spec definition
function testExtensionPropagation() {
  console.log('Testing extension propagation...');

  // Create a media spec definition with extension
  const mediaSpecs = {
    'media:pdf;bytes': {
      media_type: 'application/pdf',
      profile_uri: 'https://capns.org/schema/pdf',
      title: 'PDF Document',
      description: 'A PDF document',
      extension: 'pdf'
    }
  };

  // Resolve and verify extension is propagated
  const resolved = resolveMediaUrn('media:pdf;bytes', mediaSpecs);
  assertEqual(resolved.extension, 'pdf', 'Should have extension');

  console.log('  ✓ Extension propagation from object definition');
}

// TEST068: Test string form media spec definition has no extension
function testExtensionForStringDef() {
  console.log('Testing extension for string definition...');

  // String form definitions should have no extension
  const mediaSpecs = {
    'media:text;textable': 'text/plain; profile=https://example.com'
  };

  const resolved = resolveMediaUrn('media:text;textable', mediaSpecs);
  assert(resolved.extension === null, 'String form should have no extension');

  console.log('  ✓ String form has no extension');
}

// TEST069: Test extension can coexist with metadata and validation
function testExtensionWithMetadataAndValidation() {
  console.log('Testing extension with metadata and validation...');

  // Ensure extension, metadata, and validation can coexist
  const mediaSpecs = {
    'media:custom-output': {
      media_type: 'application/json',
      profile_uri: 'https://example.com/schema',
      title: 'Custom Output',
      validation: {
        min_length: 1,
        max_length: 1000
      },
      metadata: {
        category: 'output'
      },
      extension: 'json'
    }
  };

  const resolved = resolveMediaUrn('media:custom-output', mediaSpecs);

  // Verify all fields are present
  assert(resolved.validation !== null, 'Should have validation');
  assert(resolved.metadata !== null, 'Should have metadata');
  assertEqual(resolved.extension, 'json', 'Should have extension');

  console.log('  ✓ Extension coexists with metadata and validation');
}

// TEST108: Test Cap with mediaSpecs resolves custom media URNs
function testCapWithMediaSpecs() {
  console.log('Testing Cap with mediaSpecs...');

  // Now in/out are parsed as first-class fields with media URNs
  const urn = CapUrn.fromString('cap:in="media:string";op=test;out="media:custom"');
  assertEqual(urn.getInSpec(), 'media:string', 'Should parse inSpec');
  assertEqual(urn.getOutSpec(), 'media:custom', 'Should parse outSpec');

  const cap = new Cap(urn, 'Test Cap', 'test_command');

  // Set custom mediaSpecs - must include MEDIA_STRING for resolution to work
  cap.mediaSpecs = {
    [MEDIA_STRING]: 'text/plain; profile=https://capns.org/schema/str',
    'media:custom': {
      media_type: 'application/json',
      profile_uri: 'https://example.com/schema/output',
      schema: {
        type: 'object',
        properties: { result: { type: 'string' } }
      }
    }
  };

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
  cap.mediaSpecs = {
    'media:custom': 'text/plain; profile=https://example.com'
  };
  cap.arguments = {
    required: [{ name: 'input', media_urn: MEDIA_STRING }],
    optional: []
  };
  cap.output = { media_urn: 'media:custom', output_description: 'Test output' };

  // Serialize to JSON
  const json = cap.toJSON();
  assert(json.media_specs !== undefined, 'Should have media_specs in JSON');
  assertEqual(json.media_specs['media:custom'], 'text/plain; profile=https://example.com', 'Should serialize mediaSpecs');
  // URN tags should include in and out
  assertEqual(json.urn.tags['in'], 'media:void', 'Should serialize inSpec in tags');
  assertEqual(json.urn.tags['out'], 'media:form=map', 'Should serialize outSpec in tags');

  // Deserialize from JSON
  const restored = Cap.fromJSON(json);
  assert(restored.mediaSpecs !== undefined, 'Should restore mediaSpecs');
  assertEqual(restored.mediaSpecs['media:custom'], 'text/plain; profile=https://example.com', 'Should restore mediaSpecs content');
  assertEqual(restored.urn.getInSpec(), 'media:void', 'Should restore inSpec');
  assertEqual(restored.urn.getOutSpec(), 'media:form=map', 'Should restore outSpec');

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
  assert(cap.matches(request), 'Test 1: Exact match should succeed');
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
  assert(cap.matches(request), 'Test 2: Cap missing tag should match (implicit wildcard)');
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
  assert(cap.matches(request), 'Test 3: Cap with extra tag should match');
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
  assert(cap.matches(request), 'Test 4: Request wildcard should match');
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
  assert(cap.matches(request), 'Test 5: Cap wildcard should match');
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
  assert(!cap.matches(request), 'Test 6: Value mismatch should not match');
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
  assert(cap.matches(request), 'Test 7: Fallback pattern should match (cap missing ext = implicit wildcard)');
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
  assert(cap.matches(request), 'Test 8: Wildcard cap should match anything');
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
  assert(cap.matches(request), 'Test 9: Cross-dimension independence should match');
  console.log('  ✓ Test 9: Cross-dimension independence');
}

// TEST029: Test matching semantics - direction mismatch in/out does not match
function testMatchingSemantics_Test10_DirectionMismatch() {
  console.log('Testing Matching Semantics Test 10: Direction mismatch...');
  // Test 10: Direction mismatch (in/out must match)
  // Cap:     cap:in="media:void";out="media:object";op=generate
  // Request: cap:in="media:string";out="media:object";op=generate
  // Result:  NO MATCH (different inSpec)
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString('cap:in="media:string";out="media:object";op=generate');
  assert(!cap.matches(request), 'Test 10: Direction mismatch should not match');
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

  async executeCap(capUrn, positionalArgs, namedArgs, stdinData) {
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

// TEST122: Test CapCube can method returns execution info and canHandle checks capability
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

  // Verify canHandle works
  assert(composite.canHandle(matrixTestUrn('ext=pdf;op=generate')), 'Should handle matching cap');
  assert(!composite.canHandle(matrixTestUrn('op=nonexistent')), 'Should not handle non-matching cap');

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

// TEST032: Test StdinSource Data is passed correctly to executeCap
function testStdinSourcePassedToExecuteCap() {
  console.log('Testing StdinSource: Passed to executeCap...');

  // Create a mock host that verifies stdinSource is passed correctly
  let receivedSource = null;
  const mockHost = {
    executeCap: async (capUrn, positionalArgs, namedArgs, stdinSource) => {
      receivedSource = stdinSource;
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

  // Test with Data source
  const dataSource = StdinSource.fromData(new Uint8Array([1, 2, 3]));
  const { compositeHost } = cube.can('cap:in="media:void";op=test;out="media:string"');

  // Execute and verify
  return compositeHost.executeCap(
    'cap:in="media:void";op=test;out="media:string"',
    [],
    {},
    dataSource
  ).then(() => {
    assert(receivedSource !== null, 'Should receive stdinSource');
    assert(receivedSource.isData(), 'Should receive data source');
    assertEqual(receivedSource.data.length, 3, 'Should have correct data length');
    console.log('  ✓ Passed to executeCap');
  });
}

// TEST033: Test StdinSource FileReference is passed correctly to executeCap
function testStdinSourceFileReferencePassedToExecuteCap() {
  console.log('Testing StdinSource: File reference passed to executeCap...');

  // Create a mock host that verifies stdinSource is passed correctly
  let receivedSource = null;
  const mockHost = {
    executeCap: async (capUrn, positionalArgs, namedArgs, stdinSource) => {
      receivedSource = stdinSource;
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

  // Test with FileReference source
  const fileSource = StdinSource.fromFileReference(
    'tracked-123',
    '/path/to/file.pdf',
    new Uint8Array([0x42, 0x4f, 0x4f, 0x4b]),
    'media:pdf;bytes'
  );

  const { compositeHost } = cube.can('cap:in="media:void";op=test;out="media:string"');

  // Execute and verify
  return compositeHost.executeCap(
    'cap:in="media:void";op=test;out="media:string"',
    [],
    {},
    fileSource
  ).then(() => {
    assert(receivedSource !== null, 'Should receive stdinSource');
    assert(receivedSource.isFileReference(), 'Should receive file reference source');
    assertEqual(receivedSource.trackedFileId, 'tracked-123', 'Should have correct trackedFileId');
    assertEqual(receivedSource.originalPath, '/path/to/file.pdf', 'Should have correct originalPath');
    assertEqual(receivedSource.mediaUrn, 'media:pdf;bytes', 'Should have correct mediaUrn');
    console.log('  ✓ File reference passed to executeCap');
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

  // Try to redefine MEDIA_STRING which is in the registry
  const mediaSpecs = {
    [MEDIA_STRING]: {
      media_type: 'text/plain',
      title: 'My Custom String',
      description: 'Trying to redefine string'
    }
  };

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

  // Define a completely new media spec that doesn't exist in registry
  const mediaSpecs = {
    'media:my-unique-custom-type-xyz123': {
      media_type: 'application/json',
      title: 'My Custom Output',
      description: 'A custom output type'
    }
  };

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

  // New format tests
  testMediaSpecCanonicalFormat();
  testMediaSpecLegacyFormatRejection();
  testMediaUrnResolutionRequiresMediaSpecs();
  testMediaUrnResolutionWithMediaSpecs();
  testMediaUrnResolutionFailHard();
  testMetadataPropagation();
  testMetadataForStringDef();
  testMetadataForSimpleStringDef();
  testMetadataWithValidation();

  // Extension field tests
  testExtensionPropagation();
  testExtensionForStringDef();
  testExtensionWithMetadataAndValidation();
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