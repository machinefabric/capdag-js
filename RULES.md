# Cap URN Rules (JavaScript)

## Overview

Cap URNs extend Tagged URNs with capability-specific requirements. For base Tagged URN format rules (case handling, tag ordering, wildcards, quoting, value-less tags, etc.), see [Tagged URN RULES.md](../tagged-urn-js/RULES.md).

This document covers only cap-specific rules.

## Cap-Specific Rules

### 1. Required Direction Specifiers

Cap URNs **must** include `in` and `out` tags that specify input/output media types:

```javascript
// Valid cap URN with direction specifiers
const cap = CapUrn.fromString('cap:in="media:type=binary;v=1";op=extract;out="media:type=object;v=1"');

// Invalid - missing direction specifiers
CapUrn.fromString('cap:op=extract'); // throws ErrorCodes.MISSING_IN_SPEC
```

### 2. No Value-less Tags

Unlike base Tagged URNs which allow value-less tags, Cap URNs require explicit `key=value` format for all tags.

### 3. Media URN Validation

Direction specifier values must be valid Media URNs or wildcard `*`:

```javascript
// Valid: Media URN value
'cap:in="media:type=binary;v=1";op=extract;out="media:type=object;v=1"'

// Valid: Wildcard
'cap:in=*;op=extract;out=*'

// Invalid: Not a Media URN
'cap:in=binary;op=extract;out=object' // throws ErrorCodes.INVALID_MEDIA_URN
```

## Cap-Specific Error Codes

| Code | Name | Description |
|------|------|-------------|
| 10 | MISSING_IN_SPEC | Cap URN missing required `in` tag |
| 11 | MISSING_OUT_SPEC | Cap URN missing required `out` tag |
| 12 | INVALID_MEDIA_URN | Direction spec value is not a valid Media URN |

## Cross-Language Compatibility

This JavaScript implementation follows the same rules as:
- [Rust reference implementation](../capns/)
- [Go implementation](../capns-go/)
- [Objective-C implementation](../capns-objc/)
