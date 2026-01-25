# Cap URN Rules (JavaScript)

## Overview

Cap URNs extend Tagged URNs with capability-specific requirements. For base Tagged URN format rules (case handling, tag ordering, special values, quoting, value-less tags, etc.), see [Tagged URN RULES.md](https://github.com/filegrind/tagged-urn-js/blob/main/RULES.md).

This document covers only cap-specific rules.

## Cap-Specific Rules

### 1. Required Direction Specifiers

Cap URNs **must** include `in` and `out` tags that specify input/output media types:

```javascript
// Valid cap URN with direction specifiers
const cap = CapUrn.fromString('cap:in="media:binary";op=extract;out="media:object"');

// Invalid - missing direction specifiers
CapUrn.fromString('cap:op=extract'); // throws ErrorCodes.MISSING_IN_SPEC
```

### 2. Media URN Validation

Direction specifier values must be valid Media URNs or special pattern values:

```javascript
// Valid: Media URN value
'cap:in="media:binary";op=extract;out="media:object"'

// Valid: Must-have-any (any media type)
'cap:in=*;op=extract;out=*'

// Invalid: Not a Media URN or special value
'cap:in=binary;op=extract;out=object' // throws ErrorCodes.INVALID_MEDIA_URN
```

### 3. Matching Semantics

Cap matching uses Tagged URN matching semantics:

| Pattern Value | Meaning | Instance Missing | Instance=v | Instance=x≠v |
|---------------|---------|------------------|------------|--------------|
| (missing) | No constraint | OK | OK | OK |
| `K=?` | No constraint (explicit) | OK | OK | OK |
| `K=!` | Must-not-have | OK | NO | NO |
| `K=*` | Must-have, any value | NO | OK | OK |
| `K=v` | Must-have, exact value | NO | OK | NO |

### 4. Graded Specificity

Specificity uses graded scoring:

| Value Type | Score |
|------------|-------|
| Exact value (K=v) | 3 |
| Must-have-any (K=*) | 2 |
| Must-not-have (K=!) | 1 |
| Unspecified (K=?) or missing | 0 |

Examples:
- `cap:in="media:binary";op=extract;out="media:object"` → 3+3+3 = 9
- `cap:in=*;op=extract;out=*` → 2+3+2 = 7

## Cap-Specific Error Codes

| Code | Name | Description |
|------|------|-------------|
| 10 | MISSING_IN_SPEC | Cap URN missing required `in` tag |
| 11 | MISSING_OUT_SPEC | Cap URN missing required `out` tag |
| 12 | INVALID_MEDIA_URN | Direction spec value is not a valid Media URN |

## Cross-Language Compatibility

This JavaScript implementation follows the same rules as:
- [Rust reference implementation](https://github.com/filegrind/capns)
- [Go implementation](https://github.com/filegrind/capns-go)
- [Objective-C implementation](https://github.com/filegrind/capns-objc)
