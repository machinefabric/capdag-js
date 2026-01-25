# Cap URN - JavaScript Implementation

JavaScript implementation of Cap URN (Capability Uniform Resource Names), built on [Tagged URN](../tagged-urn-js/).

## Features

- **Required Direction Specifiers** - `in`/`out` tags for input/output media types
- **Media URN Validation** - Validates direction spec values are valid Media URNs
- **Special Pattern Values** - `*` (must-have-any), `?` (unspecified), `!` (must-not-have)
- **Graded Specificity** - Exact values score higher than wildcards
- **Cross-Language Compatible** - Identical behavior to Rust, Go, and Objective-C implementations
- **Production Ready** - No fallbacks, fails hard on invalid input

## Installation

```bash
npm install capns
```

## Quick Start

```javascript
const { CapUrn, CapUrnBuilder, CapMatcher } = require('capns');

// Create from string (with required direction specifiers)
const cap = CapUrn.fromString('cap:in="media:binary";op=extract;out="media:object"');
console.log(cap.toString());

// Use builder pattern
const built = new CapUrnBuilder()
  .inSpec('media:void')
  .outSpec('media:object')
  .tag('op', 'generate')
  .tag('target', 'thumbnail')
  .build();

// Matching
const request = CapUrn.fromString('cap:in="media:binary";op=extract;out="media:object"');
console.log(cap.matches(request)); // true

// Find best match by specificity
const caps = [
  CapUrn.fromString('cap:in=*;op=extract;out=*'),
  CapUrn.fromString('cap:in="media:binary";op=extract;out="media:object"'),
  CapUrn.fromString('cap:ext=pdf;in="media:binary";op=extract;out="media:object"')
];
const best = CapMatcher.findBestMatch(caps, request);
console.log(best.toString()); // Most specific match
```

## API Reference

### CapUrn Class

#### Static Methods
- `CapUrn.fromString(s)` - Parse Cap URN from string
  - Throws `CapUrnError` on invalid format or missing direction specifiers

#### Instance Methods
- `toString()` - Get canonical string representation
- `getTag(key)` - Get tag value (case-insensitive)
- `getInSpec()` - Get input media type
- `getOutSpec()` - Get output media type
- `hasTag(key, value)` - Check if tag exists with value
- `withTag(key, value)` - Add/update tag (returns new instance)
- `withoutTag(key)` - Remove tag (returns new instance)
- `matches(other)` - Check if this cap matches another
- `canHandle(request)` - Check if this cap can handle a request
- `specificity()` - Get specificity score for matching
- `isMoreSpecificThan(other)` - Compare specificity
- `equals(other)` - Check equality

### CapUrnBuilder Class

Fluent builder for constructing Cap URNs:

```javascript
const cap = new CapUrnBuilder()
  .inSpec('media:binary')
  .outSpec('media:object')
  .tag('op', 'extract')
  .tag('target', 'metadata')
  .build();
```

### CapMatcher Class

Utility for matching sets of caps:

- `CapMatcher.findBestMatch(caps, request)` - Find most specific match
- `CapMatcher.findAllMatches(caps, request)` - Find all matches (sorted by specificity)

### Error Handling

```javascript
const { CapUrnError, ErrorCodes } = require('capns');

try {
  const cap = CapUrn.fromString('cap:op=extract'); // Missing in/out
} catch (error) {
  if (error instanceof CapUrnError) {
    console.log(`Error code: ${error.code}`); // MISSING_IN_SPEC
  }
}
```

Cap-specific error codes:
- `ErrorCodes.MISSING_IN_SPEC` - Missing required `in` tag
- `ErrorCodes.MISSING_OUT_SPEC` - Missing required `out` tag
- `ErrorCodes.INVALID_MEDIA_URN` - Invalid Media URN in direction spec

For base Tagged URN error codes, see [Tagged URN documentation](../tagged-urn-js/).

## Documentation

- [RULES.md](./RULES.md) - Cap-specific rules
- [Tagged URN RULES.md](../tagged-urn-js/RULES.md) - Base format rules (case, quoting, wildcards, etc.)

## Testing

```bash
npm test
```

## Cross-Language Compatibility

This JavaScript implementation produces identical results to:
- [Rust reference implementation](../capns/)
- [Go implementation](../capns-go/)
- [Objective-C implementation](../capns-objc/)

All implementations pass the same test cases and follow identical rules.
