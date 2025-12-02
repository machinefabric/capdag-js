# Cap URN - JavaScript Implementation

Production-ready JavaScript implementation of Cap URN (Capability Uniform Resource Names) with strict validation and matching rules.

## Features

- ✅ **Strict Rule Enforcement** - Follows exact same rules as Rust, Go, and Objective-C implementations
- ✅ **Case Insensitive** - All input normalized to lowercase
- ✅ **Tag Order Independent** - Canonical alphabetical sorting 
- ✅ **Wildcard Support** - `*` matching in values only
- ✅ **Extended Characters** - Support for `/` and `:` in tag components
- ✅ **Production Ready** - No fallbacks, fails hard on invalid input
- ✅ **Comprehensive Tests** - Full test suite verifying all 21 rules

## Installation

```bash
npm install capns
```

## Quick Start

```javascript
const { CapUrn, CapUrnBuilder, CapMatcher } = require('capns');

// Create from string
const cap = CapUrn.fromString('cap:action=generate;ext=pdf');
console.log(cap.toString()); // "cap:action=generate;ext=pdf"

// Use builder pattern
const built = new CapUrnBuilder()
  .tag('action', 'extract')
  .tag('target', 'metadata')
  .build();

// Matching
const request = CapUrn.fromString('cap:action=generate');
console.log(cap.matches(request)); // true

// Find best match
const caps = [
  CapUrn.fromString('cap:action=*'),
  CapUrn.fromString('cap:action=generate'),
  CapUrn.fromString('cap:action=generate;ext=pdf')
];
const best = CapMatcher.findBestMatch(caps, request);
console.log(best.toString()); // "cap:action=generate;ext=pdf" (most specific)
```

## API Reference

### CapUrn Class

#### Static Methods
- `CapUrn.fromString(s)` - Parse Cap URN from string
  - Throws `CapUrnError` on invalid format

#### Instance Methods
- `toString()` - Get canonical string representation
- `getTag(key)` - Get tag value (case-insensitive)
- `hasTag(key, value)` - Check if tag exists with value
- `withTag(key, value)` - Add/update tag (returns new instance)
- `withoutTag(key)` - Remove tag (returns new instance)
- `matches(other)` - Check if this cap matches another
- `canHandle(request)` - Check if this cap can handle a request
- `specificity()` - Get specificity score for matching
- `isMoreSpecificThan(other)` - Compare specificity
- `isCompatibleWith(other)` - Check compatibility
- `equals(other)` - Check equality

### CapUrnBuilder Class

Fluent builder for constructing Cap URNs:

```javascript
const cap = new CapUrnBuilder()
  .tag('action', 'generate')
  .tag('format', 'json')
  .build();
```

### CapMatcher Class

Utility for matching sets of caps:

- `CapMatcher.findBestMatch(caps, request)` - Find most specific match
- `CapMatcher.findAllMatches(caps, request)` - Find all matches (sorted by specificity)
- `CapMatcher.areCompatible(caps1, caps2)` - Check if cap sets are compatible

### Error Handling

```javascript
const { CapUrnError, ErrorCodes } = require('capns');

try {
  const cap = CapUrn.fromString('invalid:format');
} catch (error) {
  if (error instanceof CapUrnError) {
    console.log(`Error code: ${error.code}`);
    console.log(`Message: ${error.message}`);
  }
}
```

Error codes:
- `ErrorCodes.INVALID_FORMAT` - General format error
- `ErrorCodes.MISSING_CAP_PREFIX` - Missing "cap:" prefix
- `ErrorCodes.INVALID_CHARACTER` - Invalid characters in tags
- `ErrorCodes.DUPLICATE_KEY` - Duplicate tag keys
- `ErrorCodes.NUMERIC_KEY` - Pure numeric tag keys
- `ErrorCodes.EMPTY_TAG` - Empty tag components

## Rules

This implementation strictly follows the 21 Cap URN rules. See `RULES.md` for complete specification.

### Key Rules Summary:

1. **Case Insensitive** - `cap:ACTION=Generate` == `cap:action=generate`
2. **Order Independent** - `cap:a=1;b=2` == `cap:b=2;a=1` 
3. **Prefix Required** - Must start with `cap:`
4. **Semicolon Separated** - Tags separated by `;`
5. **Optional Trailing `;`** - `cap:a=1;` == `cap:a=1`
6. **Canonical Form** - Lowercase, alphabetically sorted, no trailing `;`
7. **Wildcard Values** - `*` allowed in values only, not keys
8. **Extended Characters** - `/` and `:` allowed in tag components
9. **No Duplicate Keys** - Fails hard on duplicates
10. **No Numeric Keys** - Pure numeric keys forbidden

## Testing

```bash
npm test
```

Runs comprehensive test suite covering all rules and edge cases.

## Browser Support

Works in both Node.js and browsers:

```html
<script src="capns.js"></script>
<script>
const cap = CapUrn.fromString('cap:action=generate');
console.log(cap.toString());
</script>
```

## Cross-Language Compatibility

This JavaScript implementation produces identical results to:
- [Rust implementation](../capns/)
- [Go implementation](../capns-go/)  
- [Objective-C implementation](../capns-objc/)

All implementations pass the same test cases and follow identical rules.