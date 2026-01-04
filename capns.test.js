// Cap URN JavaScript Test Suite
// Tests all the same rules as Rust, Go, and Objective-C implementations

const { CapUrn, CapUrnBuilder, CapMatcher, CapUrnError, ErrorCodes } = require('./capns.js');

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

// Test suite
function runTests() {
  console.log('Running Cap URN JavaScript tests...\n');

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

  console.log('OK All tests passed!');
}

function testCapUrnCreation() {
  console.log('Testing Cap URN creation...');
  
  const cap = CapUrn.fromString('cap:action=generate;ext=pdf;target=thumbnail');
  assertEqual(cap.getTag('action'), 'generate', 'Should get action tag');
  assertEqual(cap.getTag('target'), 'thumbnail', 'Should get target tag');
  assertEqual(cap.getTag('ext'), 'pdf', 'Should get ext tag');
  
  console.log('  ✓ Cap URN creation');
}

function testCaseInsensitive() {
  console.log('Testing case insensitive behavior...');
  
  // Test that different casing produces the same URN
  const cap1 = CapUrn.fromString('cap:ACTION=Generate;EXT=PDF;Target=Thumbnail');
  const cap2 = CapUrn.fromString('cap:action=generate;ext=pdf;target=thumbnail');
  
  // Both should be normalized to lowercase
  assertEqual(cap1.getTag('action'), 'generate', 'Should normalize action to lowercase');
  assertEqual(cap1.getTag('ext'), 'pdf', 'Should normalize ext to lowercase');
  assertEqual(cap1.getTag('target'), 'thumbnail', 'Should normalize target to lowercase');
  
  // URNs should be identical after normalization
  assertEqual(cap1.toString(), cap2.toString(), 'URNs should be equal after normalization');
  
  // PartialEq should work correctly - URNs with different case should be equal
  assert(cap1.equals(cap2), 'URNs with different case should be equal');
  
  // Case-insensitive tag lookup should work
  assertEqual(cap1.getTag('ACTION'), 'generate', 'Should lookup with case-insensitive key');
  assertEqual(cap1.getTag('Action'), 'generate', 'Should lookup with mixed case key');
  assert(cap1.hasTag('ACTION', 'Generate'), 'Should match with case-insensitive comparison');
  assert(cap1.hasTag('action', 'GENERATE'), 'Should match with case-insensitive comparison');
  
  // Matching should work case-insensitively
  assert(cap1.matches(cap2), 'Should match case-insensitively');
  assert(cap2.matches(cap1), 'Should match case-insensitively');
  
  console.log('  ✓ Case insensitive behavior');
}

function testCapPrefixRequired() {
  console.log('Testing cap: prefix requirement...');
  
  // Missing cap: prefix should fail
  assertThrows(
    () => CapUrn.fromString('action=generate;ext=pdf'),
    ErrorCodes.MISSING_CAP_PREFIX,
    'Should require cap: prefix'
  );
  
  // Valid cap: prefix should work
  const cap = CapUrn.fromString('cap:action=generate;ext=pdf');
  assertEqual(cap.getTag('action'), 'generate', 'Should parse with valid cap: prefix');
  
  console.log('  ✓ Cap prefix requirement');
}

function testTrailingSemicolonEquivalence() {
  console.log('Testing trailing semicolon equivalence...');
  
  // Both with and without trailing semicolon should be equivalent
  const cap1 = CapUrn.fromString('cap:action=generate;ext=pdf');
  const cap2 = CapUrn.fromString('cap:action=generate;ext=pdf;');
  
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
  
  const cap = CapUrn.fromString('cap:action=generate;target=thumbnail;ext=pdf');
  // Should be sorted alphabetically and have no trailing semicolon in canonical form
  assertEqual(cap.toString(), 'cap:action=generate;ext=pdf;target=thumbnail', 'Should be alphabetically sorted');
  
  console.log('  ✓ Canonical string format');
}

function testTagMatching() {
  console.log('Testing tag matching...');
  
  const cap = CapUrn.fromString('cap:action=generate;ext=pdf;target=thumbnail');
  
  // Exact match
  const request1 = CapUrn.fromString('cap:action=generate;ext=pdf;target=thumbnail');
  assert(cap.matches(request1), 'Should match exact request');
  
  // Subset match
  const request2 = CapUrn.fromString('cap:action=generate');
  assert(cap.matches(request2), 'Should match subset request');
  
  // Wildcard request should match specific cap  
  const request3 = CapUrn.fromString('cap:ext=*');
  assert(cap.matches(request3), 'Should match wildcard request');
  
  // No match - conflicting value
  const request4 = CapUrn.fromString('cap:action=extract');
  assert(!cap.matches(request4), 'Should not match conflicting value');
  
  console.log('  ✓ Tag matching');
}

function testMissingTagHandling() {
  console.log('Testing missing tag handling...');
  
  const cap = CapUrn.fromString('cap:action=generate');
  
  // Request with tag should match cap without tag (treated as wildcard)
  const request1 = CapUrn.fromString('cap:ext=pdf');
  assert(cap.matches(request1), 'Should match when cap has missing tag (wildcard)');
  
  // But cap with extra tags can match subset requests
  const cap2 = CapUrn.fromString('cap:action=generate;ext=pdf');
  const request2 = CapUrn.fromString('cap:action=generate');
  assert(cap2.matches(request2), 'Should match subset request');
  
  console.log('  ✓ Missing tag handling');
}

function testSpecificity() {
  console.log('Testing specificity...');
  
  const cap1 = CapUrn.fromString('cap:type=general');
  const cap2 = CapUrn.fromString('cap:action=generate');
  const cap3 = CapUrn.fromString('cap:action=*;ext=pdf');
  
  assertEqual(cap1.specificity(), 1, 'Should have specificity 1');
  assertEqual(cap2.specificity(), 1, 'Should have specificity 1');
  assertEqual(cap3.specificity(), 1, 'Wildcard should not count for specificity');
  
  assert(!cap2.isMoreSpecificThan(cap1), 'Different tags should not be more specific');
  
  console.log('  ✓ Specificity');
}

function testCompatibility() {
  console.log('Testing compatibility...');
  
  const cap1 = CapUrn.fromString('cap:action=generate;ext=pdf');
  const cap2 = CapUrn.fromString('cap:action=generate;format=*');
  const cap3 = CapUrn.fromString('cap:type=image;action=extract');
  
  assert(cap1.isCompatibleWith(cap2), 'Should be compatible');
  assert(cap2.isCompatibleWith(cap1), 'Should be compatible');
  assert(!cap1.isCompatibleWith(cap3), 'Should not be compatible');
  
  // Missing tags are treated as wildcards for compatibility
  const cap4 = CapUrn.fromString('cap:action=generate');
  assert(cap1.isCompatibleWith(cap4), 'Should be compatible with missing tags');
  assert(cap4.isCompatibleWith(cap1), 'Should be compatible with missing tags');
  
  console.log('  ✓ Compatibility');
}

function testBuilder() {
  console.log('Testing builder...');
  
  const cap = new CapUrnBuilder()
    .tag('action', 'generate')
    .tag('target', 'thumbnail')
    .tag('ext', 'pdf')
    .tag('output', 'binary')
    .build();
  
  assertEqual(cap.getTag('action'), 'generate', 'Should build with action tag');
  assertEqual(cap.getTag('output'), 'binary', 'Should build with output tag');
  
  console.log('  ✓ Builder');
}

function testConvenienceMethods() {
  console.log('Testing convenience methods...');
  
  const original = CapUrn.fromString('cap:action=generate');
  
  // Test withTag
  const modified = original.withTag('ext', 'pdf');
  assertEqual(modified.getTag('action'), 'generate', 'Should preserve original tag');
  assertEqual(modified.getTag('ext'), 'pdf', 'Should add new tag');
  
  // Test withoutTag
  const removed = modified.withoutTag('action');
  assertEqual(removed.getTag('ext'), 'pdf', 'Should preserve remaining tag');
  assertEqual(removed.getTag('action'), undefined, 'Should remove specified tag');
  
  // Test merge
  const cap1 = CapUrn.fromString('cap:action=generate');
  const cap2 = CapUrn.fromString('cap:ext=pdf;output=binary');
  const merged = cap1.merge(cap2);
  assertEqual(merged.toString(), 'cap:action=generate;ext=pdf;output=binary', 'Should merge correctly');
  
  // Test subset
  const subset = merged.subset(['type', 'ext']);
  assertEqual(subset.toString(), 'cap:ext=pdf', 'Should create subset correctly');
  
  // Test wildcardTag
  const cap = CapUrn.fromString('cap:ext=pdf');
  const wildcarded = cap.withWildcardTag('ext');
  assertEqual(wildcarded.toString(), 'cap:ext=*', 'Should set wildcard');
  
  console.log('  ✓ Convenience methods');
}

function testCapMatcher() {
  console.log('Testing CapMatcher...');
  
  const caps = [
    CapUrn.fromString('cap:action=*'),
    CapUrn.fromString('cap:action=generate'),
    CapUrn.fromString('cap:action=generate;ext=pdf')
  ];
  
  const request = CapUrn.fromString('cap:action=generate');
  const best = CapMatcher.findBestMatch(caps, request);
  
  // Most specific cap that can handle the request
  assertEqual(best.toString(), 'cap:action=generate;ext=pdf', 'Should find most specific match');
  
  // Test findAllMatches
  const matches = CapMatcher.findAllMatches(caps, request);
  assertEqual(matches.length, 3, 'Should find all matches');
  assertEqual(matches[0].toString(), 'cap:action=generate;ext=pdf', 'Should sort by specificity');
  
  console.log('  ✓ CapMatcher');
}

function testJSONSerialization() {
  console.log('Testing JSON serialization...');
  
  const original = CapUrn.fromString('cap:action=generate;ext=pdf');
  const json = JSON.stringify({ urn: original.toString() });
  const parsed = JSON.parse(json);
  const restored = CapUrn.fromString(parsed.urn);
  
  assert(original.equals(restored), 'Should serialize/deserialize correctly');
  
  console.log('  ✓ JSON serialization');
}

function testEmptyCapUrn() {
  console.log('Testing empty cap URN...');
  
  // Empty cap URN should be valid and match everything
  const empty = CapUrn.fromString('cap:');
  assertEqual(Object.keys(empty.tags).length, 0, 'Should have no tags');
  assertEqual(empty.toString(), 'cap:', 'Should have correct string representation');
  
  // Should match any other cap
  const specific = CapUrn.fromString('cap:action=generate;ext=pdf');
  assert(empty.matches(specific), 'Should match any cap');
  assert(empty.matches(empty), 'Should match itself');
  
  console.log('  ✓ Empty cap URN');
}

function testExtendedCharacterSupport() {
  console.log('Testing extended character support...');
  
  // Test forward slashes and colons in tag components
  const cap = CapUrn.fromString('cap:url=https://example_org/api;path=/some/file');
  assertEqual(cap.getTag('url'), 'https://example_org/api', 'Should support colons and slashes');
  assertEqual(cap.getTag('path'), '/some/file', 'Should support slashes');
  
  console.log('  ✓ Extended character support');
}

function testWildcardRestrictions() {
  console.log('Testing wildcard restrictions...');
  
  // Wildcard should be rejected in keys
  assertThrows(
    () => CapUrn.fromString('cap:*=value'),
    ErrorCodes.INVALID_CHARACTER,
    'Should reject wildcard in key'
  );
  
  // Wildcard should be accepted in values
  const cap = CapUrn.fromString('cap:key=*');
  assertEqual(cap.getTag('key'), '*', 'Should accept wildcard in value');
  
  console.log('  ✓ Wildcard restrictions');
}

function testDuplicateKeyRejection() {
  console.log('Testing duplicate key rejection...');
  
  // Duplicate keys should be rejected
  assertThrows(
    () => CapUrn.fromString('cap:key=value1;key=value2'),
    ErrorCodes.DUPLICATE_KEY,
    'Should reject duplicate keys'
  );
  
  console.log('  ✓ Duplicate key rejection');
}

function testNumericKeyRestriction() {
  console.log('Testing numeric key restriction...');
  
  // Pure numeric keys should be rejected
  assertThrows(
    () => CapUrn.fromString('cap:123=value'),
    ErrorCodes.NUMERIC_KEY,
    'Should reject numeric keys'
  );
  
  // Mixed alphanumeric keys should be allowed
  const mixedKey1 = CapUrn.fromString('cap:key123=value');
  assertEqual(mixedKey1.getTag('key123'), 'value', 'Should allow mixed alphanumeric keys');
  
  const mixedKey2 = CapUrn.fromString('cap:123key=value');
  assertEqual(mixedKey2.getTag('123key'), 'value', 'Should allow mixed alphanumeric keys');
  
  // Pure numeric values should be allowed
  const numericValue = CapUrn.fromString('cap:key=123');
  assertEqual(numericValue.getTag('key'), '123', 'Should allow numeric values');
  
  console.log('  ✓ Numeric key restriction');
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