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
  isBuiltinMediaUrn,
  BUILTIN_SPECS,
  MEDIA_STRING,
  MEDIA_INTEGER,
  MEDIA_NUMBER,
  MEDIA_BOOLEAN,
  MEDIA_OBJECT,
  MEDIA_BINARY,
  MEDIA_VOID,
  // CapMatrix and CapCube
  CapMatrixError,
  CapMatrix,
  BestCapSetMatch,
  CompositeCapSet,
  CapCube,
  // CapGraph
  CapGraphEdge,
  CapGraphStats,
  CapGraph
} = require('./capns.js');

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
    return 'cap:in="media:type=void;v=1";out="media:type=object;v=1"';
  }
  return 'cap:in="media:type=void;v=1";out="media:type=object;v=1";' + tags;
}

// Test suite - defined at the end of file

function testCapUrnCreation() {
  console.log('Testing Cap URN creation...');

  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf;target=thumbnail'));
  assertEqual(cap.getTag('op'), 'generate', 'Should get action tag');
  assertEqual(cap.getTag('target'), 'thumbnail', 'Should get target tag');
  assertEqual(cap.getTag('ext'), 'pdf', 'Should get ext tag');
  assertEqual(cap.getInSpec(), 'media:type=void;v=1', 'Should get inSpec');
  assertEqual(cap.getOutSpec(), 'media:type=object;v=1', 'Should get outSpec');

  console.log('  ✓ Cap URN creation');
}

function testCaseInsensitive() {
  console.log('Testing case insensitive behavior...');

  // Test that different casing produces the same URN
  const cap1 = CapUrn.fromString('cap:IN="media:type=void;v=1";OUT="media:type=object;v=1";OP=Generate;EXT=PDF;Target=Thumbnail');
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
  assertEqual(cap1.getTag('IN'), 'media:type=void;v=1', 'Should lookup in with case-insensitive key');
  assertEqual(cap1.getTag('OUT'), 'media:type=object;v=1', 'Should lookup out with case-insensitive key');

  // Matching should work case-insensitively
  assert(cap1.matches(cap2), 'Should match case-insensitively');
  assert(cap2.matches(cap1), 'Should match case-insensitively');

  console.log('  ✓ Case insensitive behavior');
}

function testCapPrefixRequired() {
  console.log('Testing cap: prefix requirement...');

  // Missing cap: prefix should fail
  assertThrows(
    () => CapUrn.fromString('in="media:type=void;v=1";out="media:type=object;v=1";op=generate'),
    ErrorCodes.MISSING_CAP_PREFIX,
    'Should require cap: prefix'
  );

  // Valid cap: prefix should work
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assertEqual(cap.getTag('op'), 'generate', 'Should parse with valid cap: prefix');

  console.log('  ✓ Cap prefix requirement');
}

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

function testCanonicalStringFormat() {
  console.log('Testing canonical string format...');

  const cap = CapUrn.fromString(testUrn('op=generate;target=thumbnail;ext=pdf'));
  // Should be sorted alphabetically and have no trailing semicolon in canonical form
  // in/out are included in alphabetical order: 'ext' < 'in' < 'op' < 'out' < 'target'
  assertEqual(cap.toString(), 'cap:ext=pdf;in="media:type=void;v=1";op=generate;out="media:type=object;v=1";target=thumbnail', 'Should be alphabetically sorted');

  console.log('  ✓ Canonical string format');
}

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
  const request5 = CapUrn.fromString('cap:in="media:type=string;v=1";out="media:type=object;v=1";op=generate');
  assert(!cap.matches(request5), 'Should not match different inSpec');

  console.log('  ✓ Tag matching');
}

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

function testSpecificity() {
  console.log('Testing specificity...');

  // Specificity now includes in/out (2) plus other tags
  const cap1 = CapUrn.fromString(testUrn('type=general'));
  const cap2 = CapUrn.fromString(testUrn('op=generate'));
  const cap3 = CapUrn.fromString(testUrn('op=*;ext=pdf'));

  // Base: in=media:type=void;v=1 (1) + out=media:type=object;v=1 (1) = 2
  assertEqual(cap1.specificity(), 3, 'Should have specificity 3 (2 for in/out + 1 for type)');
  assertEqual(cap2.specificity(), 3, 'Should have specificity 3 (2 for in/out + 1 for op)');
  assertEqual(cap3.specificity(), 3, 'Should have specificity 3 (2 for in/out + 1 for ext, op=* does not count)');

  // Test with wildcard in/out
  const cap4 = CapUrn.fromString('cap:in=*;out=*;op=generate');
  assertEqual(cap4.specificity(), 1, 'Should have specificity 1 (wildcards for in/out do not count)');

  assert(!cap2.isMoreSpecificThan(cap1), 'Different tags should not be more specific');

  console.log('  ✓ Specificity');
}

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
  const cap5 = CapUrn.fromString('cap:in="media:type=string;v=1";out="media:type=object;v=1";op=generate');
  assert(!cap1.isCompatibleWith(cap5), 'Should not be compatible with different inSpec');

  console.log('  ✓ Compatibility');
}

function testBuilder() {
  console.log('Testing builder...');

  const cap = new CapUrnBuilder()
    .inSpec('media:type=void;v=1')
    .outSpec('media:type=object;v=1')
    .tag('op', 'generate')
    .tag('target', 'thumbnail')
    .tag('ext', 'pdf')
    .tag('format', 'binary')
    .build();

  assertEqual(cap.getTag('op'), 'generate', 'Should build with op tag');
  assertEqual(cap.getTag('format'), 'binary', 'Should build with format tag');
  assertEqual(cap.getInSpec(), 'media:type=void;v=1', 'Should build with inSpec');
  assertEqual(cap.getOutSpec(), 'media:type=object;v=1', 'Should build with outSpec');

  // Builder should require inSpec and outSpec
  assertThrows(
    () => new CapUrnBuilder().tag('op', 'test').build(),
    ErrorCodes.MISSING_IN_SPEC,
    'Should require inSpec'
  );

  assertThrows(
    () => new CapUrnBuilder().inSpec('media:type=void;v=1').tag('op', 'test').build(),
    ErrorCodes.MISSING_OUT_SPEC,
    'Should require outSpec'
  );

  console.log('  ✓ Builder');
}

function testConvenienceMethods() {
  console.log('Testing convenience methods...');

  const original = CapUrn.fromString(testUrn('op=generate'));

  // Test withTag
  const modified = original.withTag('ext', 'pdf');
  assertEqual(modified.getTag('op'), 'generate', 'Should preserve original tag');
  assertEqual(modified.getTag('ext'), 'pdf', 'Should add new tag');
  assertEqual(modified.getInSpec(), 'media:type=void;v=1', 'Should preserve inSpec');
  assertEqual(modified.getOutSpec(), 'media:type=object;v=1', 'Should preserve outSpec');

  // Test withTag silently ignores in/out
  const modified2 = original.withTag('in', 'media:type=string;v=1');
  assertEqual(modified2.getInSpec(), 'media:type=void;v=1', 'withTag should ignore in');
  assert(modified2 === original, 'withTag(in) should return same object');

  // Test withInSpec/withOutSpec
  const modifiedIn = original.withInSpec('media:type=string;v=1');
  assertEqual(modifiedIn.getInSpec(), 'media:type=string;v=1', 'withInSpec should change inSpec');
  const modifiedOut = original.withOutSpec('media:type=binary;v=1');
  assertEqual(modifiedOut.getOutSpec(), 'media:type=binary;v=1', 'withOutSpec should change outSpec');

  // Test withoutTag
  const removed = modified.withoutTag('op');
  assertEqual(removed.getTag('ext'), 'pdf', 'Should preserve remaining tag');
  assertEqual(removed.getTag('op'), undefined, 'Should remove specified tag');
  assertEqual(removed.getInSpec(), 'media:type=void;v=1', 'Should preserve inSpec after withoutTag');

  // Test withoutTag silently ignores in/out
  const removed2 = modified.withoutTag('in');
  assertEqual(removed2.getInSpec(), 'media:type=void;v=1', 'withoutTag should ignore in');
  assert(removed2 === modified, 'withoutTag(in) should return same object');

  // Test merge (direction from other)
  const cap1 = CapUrn.fromString(testUrn('op=generate'));
  const cap2 = CapUrn.fromString('cap:in="media:type=string;v=1";out="media:type=binary;v=1";ext=pdf;format=binary');
  const merged = cap1.merge(cap2);
  assertEqual(merged.getInSpec(), 'media:type=string;v=1', 'merge should take inSpec from other');
  assertEqual(merged.getOutSpec(), 'media:type=binary;v=1', 'merge should take outSpec from other');
  assertEqual(merged.getTag('op'), 'generate', 'merge should keep original tags');
  assertEqual(merged.getTag('ext'), 'pdf', 'merge should add other tags');

  // Test subset (always preserves in/out)
  const subset = merged.subset(['type', 'ext']);
  assertEqual(subset.getTag('ext'), 'pdf', 'Should include ext');
  assertEqual(subset.getTag('op'), undefined, 'Should not include op');
  assertEqual(subset.getInSpec(), 'media:type=string;v=1', 'subset should preserve inSpec');
  assertEqual(subset.getOutSpec(), 'media:type=binary;v=1', 'subset should preserve outSpec');

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
  assertEqual(best.toString(), 'cap:ext=pdf;in="media:type=void;v=1";op=generate;out="media:type=object;v=1"', 'Should find most specific match');

  // Test findAllMatches - now only 2 match because first has wildcard in/out
  const matches = CapMatcher.findAllMatches(caps, request);
  assertEqual(matches.length, 3, 'Should find all matches (wildcard in/out matches any)');
  // First should be most specific (ext=pdf;op=generate with in/out)
  assertEqual(matches[0].getTag('ext'), 'pdf', 'Most specific should have ext=pdf');

  console.log('  ✓ CapMatcher');
}

function testJSONSerialization() {
  console.log('Testing JSON serialization...');

  const original = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const json = JSON.stringify({ urn: original.toString() });
  const parsed = JSON.parse(json);
  const restored = CapUrn.fromString(parsed.urn);

  assert(original.equals(restored), 'Should serialize/deserialize correctly');
  assertEqual(restored.getInSpec(), 'media:type=void;v=1', 'Should preserve inSpec');
  assertEqual(restored.getOutSpec(), 'media:type=object;v=1', 'Should preserve outSpec');

  console.log('  ✓ JSON serialization');
}

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
    () => CapUrn.fromString('cap:in="media:type=void;v=1"'),
    ErrorCodes.MISSING_OUT_SPEC,
    'Cap URN without out should fail with MISSING_OUT_SPEC'
  );

  // Minimal valid cap (just in/out)
  const minimal = CapUrn.fromString(testUrn(''));
  assertEqual(Object.keys(minimal.tags).length, 0, 'Should have no other tags');
  assertEqual(minimal.getInSpec(), 'media:type=void;v=1', 'Should have inSpec');
  assertEqual(minimal.getOutSpec(), 'media:type=object;v=1', 'Should have outSpec');

  // For "match anything" behavior, use wildcards
  const wildcard = CapUrn.fromString('cap:in=*;out=*');
  const specific = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(wildcard.matches(specific), 'Wildcard should match any cap');
  assert(wildcard.matches(wildcard), 'Wildcard should match itself');

  console.log('  ✓ Empty cap URN now fails (in/out required)');
}

function testExtendedCharacterSupport() {
  console.log('Testing extended character support...');

  // Test forward slashes and colons in tag components
  const cap = CapUrn.fromString(testUrn('url=https://example_org/api;path=/some/file'));
  assertEqual(cap.getTag('url'), 'https://example_org/api', 'Should support colons and slashes');
  assertEqual(cap.getTag('path'), '/some/file', 'Should support slashes');

  console.log('  ✓ Extended character support');
}

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

function testBuiltinSpecIds() {
  console.log('Testing built-in spec IDs...');

  // Verify built-in spec IDs exist
  assert(isBuiltinMediaUrn(MEDIA_STRING), 'MEDIA_STRING should be built-in');
  assert(isBuiltinMediaUrn(MEDIA_INTEGER), 'MEDIA_INTEGER should be built-in');
  assert(isBuiltinMediaUrn(MEDIA_NUMBER), 'MEDIA_NUMBER should be built-in');
  assert(isBuiltinMediaUrn(MEDIA_BOOLEAN), 'MEDIA_BOOLEAN should be built-in');
  assert(isBuiltinMediaUrn(MEDIA_OBJECT), 'MEDIA_OBJECT should be built-in');
  assert(isBuiltinMediaUrn(MEDIA_BINARY), 'MEDIA_BINARY should be built-in');

  // Non-existent spec should not be built-in
  assert(!isBuiltinMediaUrn('media:type=nonexistent;v=1'), 'Non-existent spec should not be built-in');

  console.log('  ✓ Built-in spec IDs');
}

function testSpecIdResolution() {
  console.log('Testing spec ID resolution...');

  // Should resolve built-in spec IDs
  const strSpec = resolveMediaUrn(MEDIA_STRING);
  assertEqual(strSpec.contentType, 'text/plain', 'Should resolve str spec');
  assertEqual(strSpec.profile, 'https://capns.org/schema/str', 'Should have correct profile');

  const intSpec = resolveMediaUrn(MEDIA_INTEGER);
  assertEqual(intSpec.contentType, 'text/plain', 'Should resolve int spec');
  assertEqual(intSpec.profile, 'https://capns.org/schema/int', 'Should have correct profile');

  const objSpec = resolveMediaUrn(MEDIA_OBJECT);
  assertEqual(objSpec.contentType, 'application/json', 'Should resolve obj spec');

  const binarySpec = resolveMediaUrn(MEDIA_BINARY);
  assertEqual(binarySpec.contentType, 'application/octet-stream', 'Should resolve binary spec');
  assert(binarySpec.isBinary(), 'Binary spec should report isBinary()');

  console.log('  ✓ Spec ID resolution');
}

function testMediaUrnResolutionWithMediaSpecs() {
  console.log('Testing media URN resolution with custom mediaSpecs...');

  // Custom mediaSpecs table (using media URN format as keys)
  const mediaSpecs = {
    'media:type=custom-json;v=1': 'application/json; profile=https://example.com/schema/custom',
    'media:type=rich-xml;v=1': {
      media_type: 'application/xml',
      profile_uri: 'https://example.com/schema/rich',
      schema: { type: 'object' }
    }
  };

  // Should resolve custom string form
  const customSpec = resolveMediaUrn('media:type=custom-json;v=1', mediaSpecs);
  assertEqual(customSpec.contentType, 'application/json', 'Should resolve custom spec');
  assertEqual(customSpec.profile, 'https://example.com/schema/custom', 'Should have custom profile');

  // Should resolve custom object form with schema
  const richSpec = resolveMediaUrn('media:type=rich-xml;v=1', mediaSpecs);
  assertEqual(richSpec.contentType, 'application/xml', 'Should resolve rich spec');
  assertEqual(richSpec.profile, 'https://example.com/schema/rich', 'Should have rich profile');
  assert(richSpec.schema !== null, 'Should have schema from object form');

  // Should still resolve built-ins when not in custom table
  const strSpec = resolveMediaUrn(MEDIA_STRING, mediaSpecs);
  assertEqual(strSpec.contentType, 'text/plain', 'Should still resolve built-in');

  console.log('  ✓ Media URN resolution with custom mediaSpecs');
}

function testMediaUrnResolutionFailHard() {
  console.log('Testing media URN resolution fail hard...');

  // Should FAIL HARD on unresolvable media URN
  let caught = false;
  try {
    resolveMediaUrn('media:type=nonexistent;v=1', {});
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

function testCapWithMediaSpecs() {
  console.log('Testing Cap with mediaSpecs...');

  // Now in/out are parsed as first-class fields with media URNs
  const urn = CapUrn.fromString('cap:in="media:type=string;v=1";op=test;out="media:type=custom;v=1"');
  assertEqual(urn.getInSpec(), 'media:type=string;v=1', 'Should parse inSpec');
  assertEqual(urn.getOutSpec(), 'media:type=custom;v=1', 'Should parse outSpec');

  const cap = new Cap(urn, 'Test Cap', 'test_command');

  // Set custom mediaSpecs
  cap.mediaSpecs = {
    'media:type=custom;v=1': {
      media_type: 'application/json',
      profile_uri: 'https://example.com/schema/output',
      schema: {
        type: 'object',
        properties: { result: { type: 'string' } }
      }
    }
  };

  // Should resolve built-in via cap.resolveMediaUrn
  const strSpec = cap.resolveMediaUrn(MEDIA_STRING);
  assertEqual(strSpec.contentType, 'text/plain', 'Should resolve built-in through cap');

  // Should resolve custom spec via cap.resolveMediaUrn
  const outputSpec = cap.resolveMediaUrn('media:type=custom;v=1');
  assertEqual(outputSpec.contentType, 'application/json', 'Should resolve custom spec through cap');
  assert(outputSpec.schema !== null, 'Should have schema');

  console.log('  ✓ Cap with mediaSpecs');
}

function testCapJSONSerialization() {
  console.log('Testing Cap JSON serialization with mediaSpecs...');

  const urn = CapUrn.fromString(testUrn('op=test'));
  const cap = new Cap(urn, 'Test Cap', 'test_command');
  cap.mediaSpecs = {
    'media:type=custom;v=1': 'text/plain; profile=https://example.com'
  };
  cap.arguments = {
    required: [{ name: 'input', media_urn: MEDIA_STRING }],
    optional: []
  };
  cap.output = { media_urn: 'media:type=custom;v=1', output_description: 'Test output' };

  // Serialize to JSON
  const json = cap.toJSON();
  assert(json.media_specs !== undefined, 'Should have media_specs in JSON');
  assertEqual(json.media_specs['media:type=custom;v=1'], 'text/plain; profile=https://example.com', 'Should serialize mediaSpecs');
  // URN tags should include in and out
  assertEqual(json.urn.tags['in'], 'media:type=void;v=1', 'Should serialize inSpec in tags');
  assertEqual(json.urn.tags['out'], 'media:type=object;v=1', 'Should serialize outSpec in tags');

  // Deserialize from JSON
  const restored = Cap.fromJSON(json);
  assert(restored.mediaSpecs !== undefined, 'Should restore mediaSpecs');
  assertEqual(restored.mediaSpecs['media:type=custom;v=1'], 'text/plain; profile=https://example.com', 'Should restore mediaSpecs content');
  assertEqual(restored.urn.getInSpec(), 'media:type=void;v=1', 'Should restore inSpec');
  assertEqual(restored.urn.getOutSpec(), 'media:type=object;v=1', 'Should restore outSpec');

  console.log('  ✓ Cap JSON serialization with mediaSpecs');
}

function testOpTagRename() {
  console.log('Testing op tag (renamed from action)...');

  // Should use 'op' tag, not 'action'
  const cap = CapUrn.fromString(testUrn('op=generate;format=json'));
  assertEqual(cap.getTag('op'), 'generate', 'Should have op tag');
  assertEqual(cap.getTag('action'), undefined, 'Should not have action tag');

  // Builder should use op
  const built = new CapUrnBuilder()
    .inSpec('media:type=void;v=1')
    .outSpec('media:type=object;v=1')
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

function testMatchingSemantics_Test1_ExactMatch() {
  console.log('Testing Matching Semantics Test 1: Exact match...');
  // Test 1: Exact match (including in/out)
  // Cap:     cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=pdf
  // Request: cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=pdf
  // Result:  MATCH
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.matches(request), 'Test 1: Exact match should succeed');
  console.log('  ✓ Test 1: Exact match');
}

function testMatchingSemantics_Test2_CapMissingTag() {
  console.log('Testing Matching Semantics Test 2: Cap missing tag...');
  // Test 2: Cap missing tag (implicit wildcard for other tags, not in/out)
  // Cap:     cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate
  // Request: cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=pdf
  // Result:  MATCH (cap can handle any ext)
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.matches(request), 'Test 2: Cap missing tag should match (implicit wildcard)');
  console.log('  ✓ Test 2: Cap missing tag');
}

function testMatchingSemantics_Test3_CapHasExtraTag() {
  console.log('Testing Matching Semantics Test 3: Cap has extra tag...');
  // Test 3: Cap has extra tag
  // Cap:     cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=pdf;version=2
  // Request: cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=pdf
  // Result:  MATCH (request doesn't constrain version)
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf;version=2'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.matches(request), 'Test 3: Cap with extra tag should match');
  console.log('  ✓ Test 3: Cap has extra tag');
}

function testMatchingSemantics_Test4_RequestHasWildcard() {
  console.log('Testing Matching Semantics Test 4: Request has wildcard...');
  // Test 4: Request has wildcard
  // Cap:     cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=pdf
  // Request: cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=*
  // Result:  MATCH (request accepts any ext)
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=*'));
  assert(cap.matches(request), 'Test 4: Request wildcard should match');
  console.log('  ✓ Test 4: Request has wildcard');
}

function testMatchingSemantics_Test5_CapHasWildcard() {
  console.log('Testing Matching Semantics Test 5: Cap has wildcard...');
  // Test 5: Cap has wildcard
  // Cap:     cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=*
  // Request: cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=pdf
  // Result:  MATCH (cap handles any ext)
  const cap = CapUrn.fromString(testUrn('op=generate;ext=*'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.matches(request), 'Test 5: Cap wildcard should match');
  console.log('  ✓ Test 5: Cap has wildcard');
}

function testMatchingSemantics_Test6_ValueMismatch() {
  console.log('Testing Matching Semantics Test 6: Value mismatch...');
  // Test 6: Value mismatch
  // Cap:     cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=pdf
  // Request: cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=docx
  // Result:  NO MATCH
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=docx'));
  assert(!cap.matches(request), 'Test 6: Value mismatch should not match');
  console.log('  ✓ Test 6: Value mismatch');
}

function testMatchingSemantics_Test7_FallbackPattern() {
  console.log('Testing Matching Semantics Test 7: Fallback pattern...');
  // Test 7: Fallback pattern
  // Cap:     cap:in="media:type=void;v=1";out="media:type=binary;v=1";op=generate_thumbnail
  // Request: cap:in="media:type=void;v=1";out="media:type=binary;v=1";op=generate_thumbnail;ext=wav
  // Result:  MATCH (cap has implicit ext=*)
  const cap = CapUrn.fromString('cap:in="media:type=void;v=1";out="media:type=binary;v=1";op=generate_thumbnail');
  const request = CapUrn.fromString('cap:in="media:type=void;v=1";out="media:type=binary;v=1";op=generate_thumbnail;ext=wav');
  assert(cap.matches(request), 'Test 7: Fallback pattern should match (cap missing ext = implicit wildcard)');
  console.log('  ✓ Test 7: Fallback pattern');
}

function testMatchingSemantics_Test8_WildcardCapMatchesAnything() {
  console.log('Testing Matching Semantics Test 8: Wildcard cap matches anything...');
  // Test 8: Wildcard cap matches anything (replaces empty cap test)
  // Cap:     cap:in=*;out=*
  // Request: cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate;ext=pdf
  // Result:  MATCH
  const cap = CapUrn.fromString('cap:in=*;out=*');
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.matches(request), 'Test 8: Wildcard cap should match anything');
  console.log('  ✓ Test 8: Wildcard cap matches anything');
}

function testMatchingSemantics_Test9_CrossDimensionIndependence() {
  console.log('Testing Matching Semantics Test 9: Cross-dimension independence...');
  // Test 9: Cross-dimension independence (for other tags, not in/out)
  // Cap:     cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate
  // Request: cap:in="media:type=void;v=1";out="media:type=object;v=1";ext=pdf
  // Result:  MATCH (both have implicit wildcards for missing tags)
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString(testUrn('ext=pdf'));
  assert(cap.matches(request), 'Test 9: Cross-dimension independence should match');
  console.log('  ✓ Test 9: Cross-dimension independence');
}

function testMatchingSemantics_Test10_DirectionMismatch() {
  console.log('Testing Matching Semantics Test 10: Direction mismatch...');
  // Test 10: Direction mismatch (in/out must match)
  // Cap:     cap:in="media:type=void;v=1";out="media:type=object;v=1";op=generate
  // Request: cap:in="media:type=string;v=1";out="media:type=object;v=1";op=generate
  // Result:  NO MATCH (different inSpec)
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString('cap:in="media:type=string;v=1";out="media:type=object;v=1";op=generate');
  assert(!cap.matches(request), 'Test 10: Direction mismatch should not match');
  console.log('  ✓ Test 10: Direction mismatch');
}

// ============================================================================
// CapMatrix and CapCube Tests
// ============================================================================

// Helper to create a test URN
function matrixTestUrn(tags) {
  if (!tags) {
    return 'cap:in="media:type=void;v=1";out="media:type=object;v=1"';
  }
  return `cap:in="media:type=void;v=1";out="media:type=object;v=1";${tags}`;
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

function testCapCubeMoreSpecificWins() {
  console.log('Testing CapCube: More specific wins...');

  const providerRegistry = new CapMatrix();
  const pluginRegistry = new CapMatrix();

  // Provider: less specific cap (no ext tag)
  const providerHost = new MockCapSet('provider');
  const providerCap = makeCap(
    'cap:in="media:type=binary;v=1";op=generate_thumbnail;out="media:type=binary;v=1"',
    'Provider Thumbnail Generator (generic)'
  );
  providerRegistry.registerCapSet('provider', providerHost, [providerCap]);

  // Plugin: more specific cap (has ext=pdf)
  const pluginHost = new MockCapSet('plugin');
  const pluginCap = makeCap(
    'cap:ext=pdf;in="media:type=binary;v=1";op=generate_thumbnail;out="media:type=binary;v=1"',
    'Plugin PDF Thumbnail Generator (specific)'
  );
  pluginRegistry.registerCapSet('plugin', pluginHost, [pluginCap]);

  // Create composite with provider first
  const composite = new CapCube();
  composite.addRegistry('providers', providerRegistry);
  composite.addRegistry('plugins', pluginRegistry);

  // Request for PDF thumbnails - plugin's more specific cap should win
  const request = 'cap:ext=pdf;in="media:type=binary;v=1";op=generate_thumbnail;out="media:type=binary;v=1"';
  const best = composite.findBestCapSet(request);

  assertEqual(best.registryName, 'plugins', 'More specific plugin should win');
  assertEqual(best.specificity, 4, 'Plugin cap has 4 specific tags');
  assertEqual(best.cap.title, 'Plugin PDF Thumbnail Generator (specific)', 'Should get plugin cap');

  console.log('  ✓ More specific wins');
}

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

function testCapCubeFallbackScenario() {
  console.log('Testing CapCube: Fallback scenario...');

  const providerRegistry = new CapMatrix();
  const pluginRegistry = new CapMatrix();

  // Provider with generic fallback
  const providerHost = new MockCapSet('provider_fallback');
  const providerCap = makeCap(
    'cap:in="media:type=binary;v=1";op=generate_thumbnail;out="media:type=binary;v=1"',
    'Generic Thumbnail Provider'
  );
  providerRegistry.registerCapSet('provider_fallback', providerHost, [providerCap]);

  // Plugin with PDF-specific handler
  const pluginHost = new MockCapSet('pdf_plugin');
  const pluginCap = makeCap(
    'cap:ext=pdf;in="media:type=binary;v=1";op=generate_thumbnail;out="media:type=binary;v=1"',
    'PDF Thumbnail Plugin'
  );
  pluginRegistry.registerCapSet('pdf_plugin', pluginHost, [pluginCap]);

  const composite = new CapCube();
  composite.addRegistry('providers', providerRegistry);
  composite.addRegistry('plugins', pluginRegistry);

  // Request for PDF thumbnail
  const request = 'cap:ext=pdf;in="media:type=binary;v=1";op=generate_thumbnail;out="media:type=binary;v=1"';
  const best = composite.findBestCapSet(request);

  assertEqual(best.registryName, 'plugins', 'Plugin should win for PDF');
  assertEqual(best.cap.title, 'PDF Thumbnail Plugin', 'Should get plugin cap');
  assertEqual(best.specificity, 4, 'Plugin has specificity 4');

  // Test that for a different file type, provider wins
  const requestWav = 'cap:ext=wav;in="media:type=binary;v=1";op=generate_thumbnail;out="media:type=binary;v=1"';
  const bestWav = composite.findBestCapSet(requestWav);

  assertEqual(bestWav.registryName, 'providers', 'Provider should win for wav');
  assertEqual(bestWav.cap.title, 'Generic Thumbnail Provider', 'Should get provider cap');

  console.log('  ✓ Fallback scenario');
}

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

function testCapGraphBasicConstruction() {
  console.log('Testing CapGraph: Basic construction...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str -> obj
  const cap1 = makeGraphCap('media:type=binary;v=1', 'media:type=string;v=1', 'Binary to String');
  const cap2 = makeGraphCap('media:type=string;v=1', 'media:type=object;v=1', 'String to Object');

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

function testCapGraphOutgoingIncoming() {
  console.log('Testing CapGraph: Outgoing and incoming edges...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str, binary -> obj
  const cap1 = makeGraphCap('media:type=binary;v=1', 'media:type=string;v=1', 'Binary to String');
  const cap2 = makeGraphCap('media:type=binary;v=1', 'media:type=object;v=1', 'Binary to Object');

  registry.registerCapSet('converter', mockHost, [cap1, cap2]);

  const cube = new CapCube();
  cube.addRegistry('converters', registry);

  const graph = cube.graph();

  // binary has 2 outgoing edges
  const outgoing = graph.getOutgoing('media:type=binary;v=1');
  assertEqual(outgoing.length, 2, 'Expected 2 outgoing edges from binary');

  // str has 1 incoming edge
  const incomingStr = graph.getIncoming('media:type=string;v=1');
  assertEqual(incomingStr.length, 1, 'Expected 1 incoming edge to str');

  // obj has 1 incoming edge
  const incomingObj = graph.getIncoming('media:type=object;v=1');
  assertEqual(incomingObj.length, 1, 'Expected 1 incoming edge to obj');

  console.log('  ✓ Outgoing and incoming edges');
}

function testCapGraphCanConvert() {
  console.log('Testing CapGraph: Can convert...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str -> obj
  const cap1 = makeGraphCap('media:type=binary;v=1', 'media:type=string;v=1', 'Binary to String');
  const cap2 = makeGraphCap('media:type=string;v=1', 'media:type=object;v=1', 'String to Object');

  registry.registerCapSet('converter', mockHost, [cap1, cap2]);

  const cube = new CapCube();
  cube.addRegistry('converters', registry);

  const graph = cube.graph();

  // Direct conversions
  assert(graph.canConvert('media:type=binary;v=1', 'media:type=string;v=1'), 'Should convert binary to str');
  assert(graph.canConvert('media:type=string;v=1', 'media:type=object;v=1'), 'Should convert str to obj');

  // Transitive conversion
  assert(graph.canConvert('media:type=binary;v=1', 'media:type=object;v=1'), 'Should convert binary to obj transitively');

  // Same spec
  assert(graph.canConvert('media:type=binary;v=1', 'media:type=binary;v=1'), 'Should convert same spec');

  // Impossible conversions
  assert(!graph.canConvert('media:type=object;v=1', 'media:type=binary;v=1'), 'Should not convert obj to binary');
  assert(!graph.canConvert('media:type=nonexistent;v=1', 'media:type=string;v=1'), 'Should not convert nonexistent');

  console.log('  ✓ Can convert');
}

function testCapGraphFindPath() {
  console.log('Testing CapGraph: Find path...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str -> obj
  const cap1 = makeGraphCap('media:type=binary;v=1', 'media:type=string;v=1', 'Binary to String');
  const cap2 = makeGraphCap('media:type=string;v=1', 'media:type=object;v=1', 'String to Object');

  registry.registerCapSet('converter', mockHost, [cap1, cap2]);

  const cube = new CapCube();
  cube.addRegistry('converters', registry);

  const graph = cube.graph();

  // Direct path
  let path = graph.findPath('media:type=binary;v=1', 'media:type=string;v=1');
  assert(path !== null, 'Should find path from binary to str');
  assertEqual(path.length, 1, 'Expected path length 1');

  // Transitive path
  path = graph.findPath('media:type=binary;v=1', 'media:type=object;v=1');
  assert(path !== null, 'Should find path from binary to obj');
  assertEqual(path.length, 2, 'Expected path length 2');
  assertEqual(path[0].cap.title, 'Binary to String', 'First edge');
  assertEqual(path[1].cap.title, 'String to Object', 'Second edge');

  // No path
  path = graph.findPath('media:type=object;v=1', 'media:type=binary;v=1');
  assertEqual(path, null, 'Should not find impossible path');

  // Same spec
  path = graph.findPath('media:type=binary;v=1', 'media:type=binary;v=1');
  assert(path !== null, 'Should return empty path for same spec');
  assertEqual(path.length, 0, 'Expected empty path for same spec');

  console.log('  ✓ Find path');
}

function testCapGraphFindAllPaths() {
  console.log('Testing CapGraph: Find all paths...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str -> obj
  // binary -> obj (direct)
  const cap1 = makeGraphCap('media:type=binary;v=1', 'media:type=string;v=1', 'Binary to String');
  const cap2 = makeGraphCap('media:type=string;v=1', 'media:type=object;v=1', 'String to Object');
  const cap3 = makeGraphCap('media:type=binary;v=1', 'media:type=object;v=1', 'Binary to Object (direct)');

  registry.registerCapSet('converter', mockHost, [cap1, cap2, cap3]);

  const cube = new CapCube();
  cube.addRegistry('converters', registry);

  const graph = cube.graph();

  // Find all paths from binary to obj
  const paths = graph.findAllPaths('media:type=binary;v=1', 'media:type=object;v=1', 3);

  assertEqual(paths.length, 2, 'Expected 2 paths');

  // Paths should be sorted by length (shortest first)
  assertEqual(paths[0].length, 1, 'First path should have length 1 (direct)');
  assertEqual(paths[1].length, 2, 'Second path should have length 2 (via str)');

  console.log('  ✓ Find all paths');
}

function testCapGraphGetDirectEdges() {
  console.log('Testing CapGraph: Get direct edges...');

  const registry1 = new CapMatrix();
  const registry2 = new CapMatrix();
  const mockHost1 = { executeCap: async () => ({ textOutput: 'mock1' }) };
  const mockHost2 = { executeCap: async () => ({ textOutput: 'mock2' }) };

  // Two converters: binary -> str with different specificities
  const cap1 = makeGraphCap('media:type=binary;v=1', 'media:type=string;v=1', 'Generic Binary to String');

  // More specific converter (with extra tag for higher specificity)
  const capUrn2 = CapUrn.fromString('cap:ext=pdf;in="media:type=binary;v=1";op=convert;out="media:type=string;v=1"');
  const cap2 = new Cap(capUrn2, 'PDF Binary to String', 'convert', 'PDF Binary to String');

  registry1.registerCapSet('converter1', mockHost1, [cap1]);
  registry2.registerCapSet('converter2', mockHost2, [cap2]);

  const cube = new CapCube();
  cube.addRegistry('reg1', registry1);
  cube.addRegistry('reg2', registry2);

  const graph = cube.graph();

  // Get direct edges (should be sorted by specificity)
  const edges = graph.getDirectEdges('media:type=binary;v=1', 'media:type=string;v=1');

  assertEqual(edges.length, 2, 'Expected 2 direct edges');

  // First should be more specific (PDF converter)
  assertEqual(edges[0].cap.title, 'PDF Binary to String', 'First edge should be more specific');
  assert(edges[0].specificity > edges[1].specificity, 'First edge should have higher specificity');

  console.log('  ✓ Get direct edges');
}

function testCapGraphStats() {
  console.log('Testing CapGraph: Stats...');

  const registry = new CapMatrix();
  const mockHost = { executeCap: async () => ({ textOutput: 'mock' }) };

  // binary -> str -> obj
  //         \-> json
  const cap1 = makeGraphCap('media:type=binary;v=1', 'media:type=string;v=1', 'Binary to String');
  const cap2 = makeGraphCap('media:type=string;v=1', 'media:type=object;v=1', 'String to Object');
  const cap3 = makeGraphCap('media:type=binary;v=1', 'media:type=json;v=1', 'Binary to JSON');

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

function testCapGraphWithCapCube() {
  console.log('Testing CapGraph: With CapCube...');

  // Integration test: build graph from CapCube
  const providerRegistry = new CapMatrix();
  const pluginRegistry = new CapMatrix();
  const providerHost = { executeCap: async () => ({ textOutput: 'provider' }) };
  const pluginHost = { executeCap: async () => ({ textOutput: 'plugin' }) };

  // Provider: binary -> str
  const providerCap = makeGraphCap('media:type=binary;v=1', 'media:type=string;v=1', 'Provider Binary to String');
  providerRegistry.registerCapSet('provider', providerHost, [providerCap]);

  // Plugin: str -> obj
  const pluginCap = makeGraphCap('media:type=string;v=1', 'media:type=object;v=1', 'Plugin String to Object');
  pluginRegistry.registerCapSet('plugin', pluginHost, [pluginCap]);

  const cube = new CapCube();
  cube.addRegistry('providers', providerRegistry);
  cube.addRegistry('plugins', pluginRegistry);

  const graph = cube.graph();

  // Should be able to convert binary -> obj through both registries
  assert(graph.canConvert('media:type=binary;v=1', 'media:type=object;v=1'), 'Should convert across registries');

  const path = graph.findPath('media:type=binary;v=1', 'media:type=object;v=1');
  assert(path !== null, 'Should find path');
  assertEqual(path.length, 2, 'Expected path length 2');

  // Verify edges come from different registries
  assertEqual(path[0].registryName, 'providers', 'First edge from providers');
  assertEqual(path[1].registryName, 'plugins', 'Second edge from plugins');

  console.log('  ✓ With CapCube');
}

// Update runTests to include new tests
function runTests() {
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
  testBuiltinSpecIds();
  testSpecIdResolution();
  testMediaUrnResolutionWithMediaSpecs();
  testMediaUrnResolutionFailHard();
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

  console.log('OK All tests passed!');
}

// Run the tests
if (require.main === module) {
  try {
    runTests();
    process.exit(0);
  } catch (error) {
    console.error('\nERR Test failed:', error.message);
    process.exit(1);
  }
}

module.exports = { runTests };