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
  resolveSpecId,
  isBuiltinSpecId,
  BUILTIN_SPECS,
  SPEC_ID_STR,
  SPEC_ID_INT,
  SPEC_ID_NUM,
  SPEC_ID_BOOL,
  SPEC_ID_OBJ,
  SPEC_ID_BINARY,
  SPEC_ID_VOID
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
 * Helper function to build test URNs with required in/out specs
 * @param {string} tags - Additional tags to add (empty string for minimal URN)
 * @returns {string} A valid cap URN string with in/out
 */
function testUrn(tags) {
  if (!tags || tags === '') {
    return 'cap:in=std:void.v1;out=std:obj.v1';
  }
  return 'cap:in=std:void.v1;out=std:obj.v1;' + tags;
}

// Test suite - defined at the end of file

function testCapUrnCreation() {
  console.log('Testing Cap URN creation...');

  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf;target=thumbnail'));
  assertEqual(cap.getTag('op'), 'generate', 'Should get action tag');
  assertEqual(cap.getTag('target'), 'thumbnail', 'Should get target tag');
  assertEqual(cap.getTag('ext'), 'pdf', 'Should get ext tag');
  assertEqual(cap.getInSpec(), 'std:void.v1', 'Should get inSpec');
  assertEqual(cap.getOutSpec(), 'std:obj.v1', 'Should get outSpec');

  console.log('  ✓ Cap URN creation');
}

function testCaseInsensitive() {
  console.log('Testing case insensitive behavior...');

  // Test that different casing produces the same URN
  const cap1 = CapUrn.fromString('cap:IN=std:void.v1;OUT=std:obj.v1;OP=Generate;EXT=PDF;Target=Thumbnail');
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
  assertEqual(cap1.getTag('IN'), 'std:void.v1', 'Should lookup in with case-insensitive key');
  assertEqual(cap1.getTag('OUT'), 'std:obj.v1', 'Should lookup out with case-insensitive key');

  // Matching should work case-insensitively
  assert(cap1.matches(cap2), 'Should match case-insensitively');
  assert(cap2.matches(cap1), 'Should match case-insensitively');

  console.log('  ✓ Case insensitive behavior');
}

function testCapPrefixRequired() {
  console.log('Testing cap: prefix requirement...');

  // Missing cap: prefix should fail
  assertThrows(
    () => CapUrn.fromString('in=std:void.v1;out=std:obj.v1;op=generate'),
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
  assertEqual(cap.toString(), 'cap:ext=pdf;in=std:void.v1;op=generate;out=std:obj.v1;target=thumbnail', 'Should be alphabetically sorted');

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
  const request5 = CapUrn.fromString('cap:in=std:str.v1;out=std:obj.v1;op=generate');
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

  // Base: in=std:void.v1 (1) + out=std:obj.v1 (1) = 2
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
  const cap5 = CapUrn.fromString('cap:in=std:str.v1;out=std:obj.v1;op=generate');
  assert(!cap1.isCompatibleWith(cap5), 'Should not be compatible with different inSpec');

  console.log('  ✓ Compatibility');
}

function testBuilder() {
  console.log('Testing builder...');

  const cap = new CapUrnBuilder()
    .inSpec('std:void.v1')
    .outSpec('std:obj.v1')
    .tag('op', 'generate')
    .tag('target', 'thumbnail')
    .tag('ext', 'pdf')
    .tag('format', 'binary')
    .build();

  assertEqual(cap.getTag('op'), 'generate', 'Should build with op tag');
  assertEqual(cap.getTag('format'), 'binary', 'Should build with format tag');
  assertEqual(cap.getInSpec(), 'std:void.v1', 'Should build with inSpec');
  assertEqual(cap.getOutSpec(), 'std:obj.v1', 'Should build with outSpec');

  // Builder should require inSpec and outSpec
  assertThrows(
    () => new CapUrnBuilder().tag('op', 'test').build(),
    ErrorCodes.MISSING_IN_SPEC,
    'Should require inSpec'
  );

  assertThrows(
    () => new CapUrnBuilder().inSpec('std:void.v1').tag('op', 'test').build(),
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
  assertEqual(modified.getInSpec(), 'std:void.v1', 'Should preserve inSpec');
  assertEqual(modified.getOutSpec(), 'std:obj.v1', 'Should preserve outSpec');

  // Test withTag silently ignores in/out
  const modified2 = original.withTag('in', 'std:str.v1');
  assertEqual(modified2.getInSpec(), 'std:void.v1', 'withTag should ignore in');
  assert(modified2 === original, 'withTag(in) should return same object');

  // Test withInSpec/withOutSpec
  const modifiedIn = original.withInSpec('std:str.v1');
  assertEqual(modifiedIn.getInSpec(), 'std:str.v1', 'withInSpec should change inSpec');
  const modifiedOut = original.withOutSpec('std:binary.v1');
  assertEqual(modifiedOut.getOutSpec(), 'std:binary.v1', 'withOutSpec should change outSpec');

  // Test withoutTag
  const removed = modified.withoutTag('op');
  assertEqual(removed.getTag('ext'), 'pdf', 'Should preserve remaining tag');
  assertEqual(removed.getTag('op'), undefined, 'Should remove specified tag');
  assertEqual(removed.getInSpec(), 'std:void.v1', 'Should preserve inSpec after withoutTag');

  // Test withoutTag silently ignores in/out
  const removed2 = modified.withoutTag('in');
  assertEqual(removed2.getInSpec(), 'std:void.v1', 'withoutTag should ignore in');
  assert(removed2 === modified, 'withoutTag(in) should return same object');

  // Test merge (direction from other)
  const cap1 = CapUrn.fromString(testUrn('op=generate'));
  const cap2 = CapUrn.fromString('cap:in=std:str.v1;out=std:binary.v1;ext=pdf;format=binary');
  const merged = cap1.merge(cap2);
  assertEqual(merged.getInSpec(), 'std:str.v1', 'merge should take inSpec from other');
  assertEqual(merged.getOutSpec(), 'std:binary.v1', 'merge should take outSpec from other');
  assertEqual(merged.getTag('op'), 'generate', 'merge should keep original tags');
  assertEqual(merged.getTag('ext'), 'pdf', 'merge should add other tags');

  // Test subset (always preserves in/out)
  const subset = merged.subset(['type', 'ext']);
  assertEqual(subset.getTag('ext'), 'pdf', 'Should include ext');
  assertEqual(subset.getTag('op'), undefined, 'Should not include op');
  assertEqual(subset.getInSpec(), 'std:str.v1', 'subset should preserve inSpec');
  assertEqual(subset.getOutSpec(), 'std:binary.v1', 'subset should preserve outSpec');

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
  assertEqual(best.toString(), 'cap:ext=pdf;in=std:void.v1;op=generate;out=std:obj.v1', 'Should find most specific match');

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
  assertEqual(restored.getInSpec(), 'std:void.v1', 'Should preserve inSpec');
  assertEqual(restored.getOutSpec(), 'std:obj.v1', 'Should preserve outSpec');

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
    () => CapUrn.fromString('cap:in=std:void.v1'),
    ErrorCodes.MISSING_OUT_SPEC,
    'Cap URN without out should fail with MISSING_OUT_SPEC'
  );

  // Minimal valid cap (just in/out)
  const minimal = CapUrn.fromString(testUrn(''));
  assertEqual(Object.keys(minimal.tags).length, 0, 'Should have no other tags');
  assertEqual(minimal.getInSpec(), 'std:void.v1', 'Should have inSpec');
  assertEqual(minimal.getOutSpec(), 'std:obj.v1', 'Should have outSpec');

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
  assert(isBuiltinSpecId(SPEC_ID_STR), 'SPEC_ID_STR should be built-in');
  assert(isBuiltinSpecId(SPEC_ID_INT), 'SPEC_ID_INT should be built-in');
  assert(isBuiltinSpecId(SPEC_ID_NUM), 'SPEC_ID_NUM should be built-in');
  assert(isBuiltinSpecId(SPEC_ID_BOOL), 'SPEC_ID_BOOL should be built-in');
  assert(isBuiltinSpecId(SPEC_ID_OBJ), 'SPEC_ID_OBJ should be built-in');
  assert(isBuiltinSpecId(SPEC_ID_BINARY), 'SPEC_ID_BINARY should be built-in');

  // Non-existent spec should not be built-in
  assert(!isBuiltinSpecId('std:nonexistent.v1'), 'Non-existent spec should not be built-in');

  console.log('  ✓ Built-in spec IDs');
}

function testSpecIdResolution() {
  console.log('Testing spec ID resolution...');

  // Should resolve built-in spec IDs
  const strSpec = resolveSpecId(SPEC_ID_STR);
  assertEqual(strSpec.contentType, 'text/plain', 'Should resolve str spec');
  assertEqual(strSpec.profile, 'https://capns.org/schema/str', 'Should have correct profile');

  const intSpec = resolveSpecId(SPEC_ID_INT);
  assertEqual(intSpec.contentType, 'text/plain', 'Should resolve int spec');
  assertEqual(intSpec.profile, 'https://capns.org/schema/int', 'Should have correct profile');

  const objSpec = resolveSpecId(SPEC_ID_OBJ);
  assertEqual(objSpec.contentType, 'application/json', 'Should resolve obj spec');

  const binarySpec = resolveSpecId(SPEC_ID_BINARY);
  assertEqual(binarySpec.contentType, 'application/octet-stream', 'Should resolve binary spec');
  assert(binarySpec.isBinary(), 'Binary spec should report isBinary()');

  console.log('  ✓ Spec ID resolution');
}

function testSpecIdResolutionWithMediaSpecs() {
  console.log('Testing spec ID resolution with custom mediaSpecs...');

  // Custom mediaSpecs table
  const mediaSpecs = {
    'my:custom-spec.v1': 'application/json; profile=https://example.com/schema/custom',
    'my:rich-spec.v1': {
      media_type: 'application/xml',
      profile_uri: 'https://example.com/schema/rich',
      schema: { type: 'object' }
    }
  };

  // Should resolve custom string form
  const customSpec = resolveSpecId('my:custom-spec.v1', mediaSpecs);
  assertEqual(customSpec.contentType, 'application/json', 'Should resolve custom spec');
  assertEqual(customSpec.profile, 'https://example.com/schema/custom', 'Should have custom profile');

  // Should resolve custom object form with schema
  const richSpec = resolveSpecId('my:rich-spec.v1', mediaSpecs);
  assertEqual(richSpec.contentType, 'application/xml', 'Should resolve rich spec');
  assertEqual(richSpec.profile, 'https://example.com/schema/rich', 'Should have rich profile');
  assert(richSpec.schema !== null, 'Should have schema from object form');

  // Should still resolve built-ins when not in custom table
  const strSpec = resolveSpecId(SPEC_ID_STR, mediaSpecs);
  assertEqual(strSpec.contentType, 'text/plain', 'Should still resolve built-in');

  console.log('  ✓ Spec ID resolution with custom mediaSpecs');
}

function testSpecIdResolutionFailHard() {
  console.log('Testing spec ID resolution fail hard...');

  // Should FAIL HARD on unresolvable spec ID
  let caught = false;
  try {
    resolveSpecId('nonexistent:spec.v1', {});
  } catch (e) {
    if (e instanceof MediaSpecError && e.code === MediaSpecErrorCodes.UNRESOLVABLE_SPEC_ID) {
      caught = true;
    } else {
      throw new Error(`Expected MediaSpecError with UNRESOLVABLE_SPEC_ID code, got: ${e.message}`);
    }
  }
  assert(caught, 'Should fail hard on unresolvable spec ID');

  console.log('  ✓ Spec ID resolution fail hard');
}

function testCapWithMediaSpecs() {
  console.log('Testing Cap with mediaSpecs...');

  // Now in/out are parsed as first-class fields
  const urn = CapUrn.fromString('cap:in=std:str.v1;out=my:output.v1;op=test');
  assertEqual(urn.getInSpec(), 'std:str.v1', 'Should parse inSpec');
  assertEqual(urn.getOutSpec(), 'my:output.v1', 'Should parse outSpec');

  const cap = new Cap(urn, 'Test Cap', 'test_command');

  // Set custom mediaSpecs
  cap.mediaSpecs = {
    'my:output.v1': {
      media_type: 'application/json',
      profile_uri: 'https://example.com/schema/output',
      schema: {
        type: 'object',
        properties: { result: { type: 'string' } }
      }
    }
  };

  // Should resolve built-in via cap.resolveSpecId
  const strSpec = cap.resolveSpecId(SPEC_ID_STR);
  assertEqual(strSpec.contentType, 'text/plain', 'Should resolve built-in through cap');

  // Should resolve custom spec via cap.resolveSpecId
  const outputSpec = cap.resolveSpecId('my:output.v1');
  assertEqual(outputSpec.contentType, 'application/json', 'Should resolve custom spec through cap');
  assert(outputSpec.schema !== null, 'Should have schema');

  console.log('  ✓ Cap with mediaSpecs');
}

function testCapJSONSerialization() {
  console.log('Testing Cap JSON serialization with mediaSpecs...');

  const urn = CapUrn.fromString(testUrn('op=test'));
  const cap = new Cap(urn, 'Test Cap', 'test_command');
  cap.mediaSpecs = {
    'my:spec.v1': 'text/plain; profile=https://example.com'
  };
  cap.arguments = {
    required: [{ name: 'input', media_spec: SPEC_ID_STR }],
    optional: []
  };
  cap.output = { media_spec: 'my:spec.v1', output_description: 'Test output' };

  // Serialize to JSON
  const json = cap.toJSON();
  assert(json.media_specs !== undefined, 'Should have media_specs in JSON');
  assertEqual(json.media_specs['my:spec.v1'], 'text/plain; profile=https://example.com', 'Should serialize mediaSpecs');
  // URN tags should include in and out
  assertEqual(json.urn.tags['in'], 'std:void.v1', 'Should serialize inSpec in tags');
  assertEqual(json.urn.tags['out'], 'std:obj.v1', 'Should serialize outSpec in tags');

  // Deserialize from JSON
  const restored = Cap.fromJSON(json);
  assert(restored.mediaSpecs !== undefined, 'Should restore mediaSpecs');
  assertEqual(restored.mediaSpecs['my:spec.v1'], 'text/plain; profile=https://example.com', 'Should restore mediaSpecs content');
  assertEqual(restored.urn.getInSpec(), 'std:void.v1', 'Should restore inSpec');
  assertEqual(restored.urn.getOutSpec(), 'std:obj.v1', 'Should restore outSpec');

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
    .inSpec('std:void.v1')
    .outSpec('std:obj.v1')
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
  // Cap:     cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=pdf
  // Request: cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=pdf
  // Result:  MATCH
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.matches(request), 'Test 1: Exact match should succeed');
  console.log('  ✓ Test 1: Exact match');
}

function testMatchingSemantics_Test2_CapMissingTag() {
  console.log('Testing Matching Semantics Test 2: Cap missing tag...');
  // Test 2: Cap missing tag (implicit wildcard for other tags, not in/out)
  // Cap:     cap:in=std:void.v1;out=std:obj.v1;op=generate
  // Request: cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=pdf
  // Result:  MATCH (cap can handle any ext)
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.matches(request), 'Test 2: Cap missing tag should match (implicit wildcard)');
  console.log('  ✓ Test 2: Cap missing tag');
}

function testMatchingSemantics_Test3_CapHasExtraTag() {
  console.log('Testing Matching Semantics Test 3: Cap has extra tag...');
  // Test 3: Cap has extra tag
  // Cap:     cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=pdf;version=2
  // Request: cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=pdf
  // Result:  MATCH (request doesn't constrain version)
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf;version=2'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.matches(request), 'Test 3: Cap with extra tag should match');
  console.log('  ✓ Test 3: Cap has extra tag');
}

function testMatchingSemantics_Test4_RequestHasWildcard() {
  console.log('Testing Matching Semantics Test 4: Request has wildcard...');
  // Test 4: Request has wildcard
  // Cap:     cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=pdf
  // Request: cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=*
  // Result:  MATCH (request accepts any ext)
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=*'));
  assert(cap.matches(request), 'Test 4: Request wildcard should match');
  console.log('  ✓ Test 4: Request has wildcard');
}

function testMatchingSemantics_Test5_CapHasWildcard() {
  console.log('Testing Matching Semantics Test 5: Cap has wildcard...');
  // Test 5: Cap has wildcard
  // Cap:     cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=*
  // Request: cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=pdf
  // Result:  MATCH (cap handles any ext)
  const cap = CapUrn.fromString(testUrn('op=generate;ext=*'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.matches(request), 'Test 5: Cap wildcard should match');
  console.log('  ✓ Test 5: Cap has wildcard');
}

function testMatchingSemantics_Test6_ValueMismatch() {
  console.log('Testing Matching Semantics Test 6: Value mismatch...');
  // Test 6: Value mismatch
  // Cap:     cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=pdf
  // Request: cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=docx
  // Result:  NO MATCH
  const cap = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  const request = CapUrn.fromString(testUrn('op=generate;ext=docx'));
  assert(!cap.matches(request), 'Test 6: Value mismatch should not match');
  console.log('  ✓ Test 6: Value mismatch');
}

function testMatchingSemantics_Test7_FallbackPattern() {
  console.log('Testing Matching Semantics Test 7: Fallback pattern...');
  // Test 7: Fallback pattern
  // Cap:     cap:in=std:void.v1;out=std:binary.v1;op=generate_thumbnail
  // Request: cap:in=std:void.v1;out=std:binary.v1;op=generate_thumbnail;ext=wav
  // Result:  MATCH (cap has implicit ext=*)
  const cap = CapUrn.fromString('cap:in=std:void.v1;out=std:binary.v1;op=generate_thumbnail');
  const request = CapUrn.fromString('cap:in=std:void.v1;out=std:binary.v1;op=generate_thumbnail;ext=wav');
  assert(cap.matches(request), 'Test 7: Fallback pattern should match (cap missing ext = implicit wildcard)');
  console.log('  ✓ Test 7: Fallback pattern');
}

function testMatchingSemantics_Test8_WildcardCapMatchesAnything() {
  console.log('Testing Matching Semantics Test 8: Wildcard cap matches anything...');
  // Test 8: Wildcard cap matches anything (replaces empty cap test)
  // Cap:     cap:in=*;out=*
  // Request: cap:in=std:void.v1;out=std:obj.v1;op=generate;ext=pdf
  // Result:  MATCH
  const cap = CapUrn.fromString('cap:in=*;out=*');
  const request = CapUrn.fromString(testUrn('op=generate;ext=pdf'));
  assert(cap.matches(request), 'Test 8: Wildcard cap should match anything');
  console.log('  ✓ Test 8: Wildcard cap matches anything');
}

function testMatchingSemantics_Test9_CrossDimensionIndependence() {
  console.log('Testing Matching Semantics Test 9: Cross-dimension independence...');
  // Test 9: Cross-dimension independence (for other tags, not in/out)
  // Cap:     cap:in=std:void.v1;out=std:obj.v1;op=generate
  // Request: cap:in=std:void.v1;out=std:obj.v1;ext=pdf
  // Result:  MATCH (both have implicit wildcards for missing tags)
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString(testUrn('ext=pdf'));
  assert(cap.matches(request), 'Test 9: Cross-dimension independence should match');
  console.log('  ✓ Test 9: Cross-dimension independence');
}

function testMatchingSemantics_Test10_DirectionMismatch() {
  console.log('Testing Matching Semantics Test 10: Direction mismatch...');
  // Test 10: Direction mismatch (in/out must match)
  // Cap:     cap:in=std:void.v1;out=std:obj.v1;op=generate
  // Request: cap:in=std:str.v1;out=std:obj.v1;op=generate
  // Result:  NO MATCH (different inSpec)
  const cap = CapUrn.fromString(testUrn('op=generate'));
  const request = CapUrn.fromString('cap:in=std:str.v1;out=std:obj.v1;op=generate');
  assert(!cap.matches(request), 'Test 10: Direction mismatch should not match');
  console.log('  ✓ Test 10: Direction mismatch');
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
  testSpecIdResolutionWithMediaSpecs();
  testSpecIdResolutionFailHard();
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