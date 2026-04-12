// Cap URN JavaScript Implementation
// Follows the exact same rules as Rust, Go, and Objective-C implementations

// Import TaggedUrn from the tagged-urn package
const { TaggedUrn } = require('tagged-urn');

/**
 * Error types for Cap URN operations
 */
class CapUrnError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CapUrnError';
    this.code = code;
  }
}

// Error codes
const ErrorCodes = {
  INVALID_FORMAT: 1,
  EMPTY_TAG: 2,
  INVALID_CHARACTER: 3,
  INVALID_TAG_FORMAT: 4,
  MISSING_CAP_PREFIX: 5,
  DUPLICATE_KEY: 6,
  NUMERIC_KEY: 7,
  UNTERMINATED_QUOTE: 8,
  INVALID_ESCAPE_SEQUENCE: 9,
  MISSING_IN_SPEC: 10,
  MISSING_OUT_SPEC: 11
};

// Note: All parsing is delegated to TaggedUrn from tagged-urn-js
// No duplicate state machine or parsing helpers needed here

/**
 * Cap URN implementation with required direction (in/out) and optional tags
 *
 * Direction is now a REQUIRED first-class field:
 * - inSpec: The input media URN (required, must start with "media:")
 * - outSpec: The output media URN (required, must start with "media:")
 * - tags: Other optional tags (no longer contains in/out)
 */
/**
 * Check if a value is a valid media URN or wildcard
 * @param {string} value - The value to check
 * @returns {boolean} True if valid media URN or wildcard
 */
function isValidMediaUrnOrWildcard(value) {
  return value === '*' || (value && value.startsWith('media:'));
}

class CapUrn {
  /**
   * Create a new CapUrn with required direction specs
   * @param {string} inSpec - Required input media URN (e.g., "media:void") or wildcard "*"
   * @param {string} outSpec - Required output media URN (e.g., "media:object") or wildcard "*"
   * @param {Object} tags - Other tags (must NOT contain 'in' or 'out')
   */
  constructor(inSpec, outSpec, tags = {}) {
    // Validate in/out are media URNs or wildcards
    if (!isValidMediaUrnOrWildcard(inSpec)) {
      throw new CapUrnError(ErrorCodes.INVALID_FORMAT, `Invalid 'in' media URN: ${inSpec}. Must start with 'media:' or be '*'`);
    }
    if (!isValidMediaUrnOrWildcard(outSpec)) {
      throw new CapUrnError(ErrorCodes.INVALID_FORMAT, `Invalid 'out' media URN: ${outSpec}. Must start with 'media:' or be '*'`);
    }

    this.inSpec = inSpec;
    this.outSpec = outSpec;
    this.tags = {};
    // Copy tags, filtering out any 'in' or 'out' that might have slipped through
    for (const [key, value] of Object.entries(tags)) {
      const keyLower = key.toLowerCase();
      if (keyLower !== 'in' && keyLower !== 'out') {
        this.tags[keyLower] = value;
      }
    }
  }

  /**
   * Get the input media URN
   * @returns {string} The input media URN
   */
  getInSpec() {
    return this.inSpec;
  }

  /**
   * Get the output media URN
   * @returns {string} The output media URN
   */
  getOutSpec() {
    return this.outSpec;
  }

  /**
   * Parse the in= spec into a MediaUrn.
   * @returns {MediaUrn} The input media URN
   * @throws {MediaUrnError} If the in spec is not a valid media URN
   */
  inMediaUrn() {
    return MediaUrn.fromString(this.inSpec);
  }

  /**
   * Parse the out= spec into a MediaUrn.
   * @returns {MediaUrn} The output media URN
   * @throws {MediaUrnError} If the out spec is not a valid media URN
   */
  outMediaUrn() {
    return MediaUrn.fromString(this.outSpec);
  }

  /**
   * Create a Cap URN from string representation
   * Format: cap:in="<media-urn>";out="<media-urn>";key1=value1;key2=value2;...
   *
   * IMPORTANT: 'in' and 'out' tags are REQUIRED and must be valid media URNs.
   *
   * Uses TaggedUrn for parsing to ensure consistent behavior across implementations.
   *
   * @param {string} s - The Cap URN string
   * @returns {CapUrn} The parsed Cap URN
   * @throws {CapUrnError} If parsing fails or in/out are missing/invalid
   */
  static fromString(s) {
    if (!s || typeof s !== 'string') {
      throw new CapUrnError(ErrorCodes.INVALID_FORMAT, 'Cap URN cannot be empty');
    }

    // Check for 'cap:' prefix early to give better error messages
    if (!s.startsWith('cap:')) {
      throw new CapUrnError(ErrorCodes.MISSING_CAP_PREFIX, "Cap URN must start with 'cap:' prefix");
    }

    // Use TaggedUrn for parsing
    let taggedUrn;
    try {
      taggedUrn = TaggedUrn.fromString(s);
    } catch (e) {
      // Convert TaggedUrnError to CapUrnError with appropriate error code
      const msg = e.message || '';
      const msgLower = msg.toLowerCase();
      if (msgLower.includes('invalid character')) {
        throw new CapUrnError(ErrorCodes.INVALID_CHARACTER, msg);
      }
      if (msgLower.includes('duplicate')) {
        throw new CapUrnError(ErrorCodes.DUPLICATE_KEY, msg);
      }
      if (msgLower.includes('unterminated') || msgLower.includes('unclosed')) {
        throw new CapUrnError(ErrorCodes.UNTERMINATED_QUOTE, msg);
      }
      if (msgLower.includes('numeric') || msgLower.includes('purely numeric')) {
        throw new CapUrnError(ErrorCodes.NUMERIC_KEY, msg);
      }
      throw new CapUrnError(ErrorCodes.INVALID_FORMAT, msg);
    }

    // Double-check prefix (should always be 'cap' after the early check above)
    if (taggedUrn.getPrefix() !== 'cap') {
      throw new CapUrnError(ErrorCodes.MISSING_CAP_PREFIX, `Expected 'cap:' prefix, got '${taggedUrn.getPrefix()}:'`);
    }

    // Extract required 'in' and 'out' tags
    const inSpec = taggedUrn.getTag('in');
    const outSpec = taggedUrn.getTag('out');

    if (!inSpec) {
      throw new CapUrnError(ErrorCodes.MISSING_IN_SPEC, "Cap URN requires 'in' tag for input media URN");
    }
    if (!outSpec) {
      throw new CapUrnError(ErrorCodes.MISSING_OUT_SPEC, "Cap URN requires 'out' tag for output media URN");
    }

    // Validate in/out are media URNs or wildcards
    if (!isValidMediaUrnOrWildcard(inSpec)) {
      throw new CapUrnError(ErrorCodes.INVALID_FORMAT, `Invalid 'in' media URN: ${inSpec}. Must start with 'media:' or be '*'`);
    }
    if (!isValidMediaUrnOrWildcard(outSpec)) {
      throw new CapUrnError(ErrorCodes.INVALID_FORMAT, `Invalid 'out' media URN: ${outSpec}. Must start with 'media:' or be '*'`);
    }

    // Build remaining tags (excluding in/out)
    const remainingTags = {};
    for (const [key, value] of Object.entries(taggedUrn.tags)) {
      if (key !== 'in' && key !== 'out') {
        remainingTags[key] = value;
      }
    }

    return new CapUrn(inSpec, outSpec, remainingTags);
  }

  /**
   * Create a Cap URN from a tags object
   * Extracts 'in' and 'out' from tags (required), stores rest as regular tags
   *
   * @param {Object} tags - Object containing all tags including 'in' and 'out'
   * @returns {CapUrn} The parsed Cap URN
   * @throws {CapUrnError} If 'in' or 'out' tags are missing or invalid
   */
  static fromTags(tags) {
    const inSpec = tags['in'] || tags['IN'];
    const outSpec = tags['out'] || tags['OUT'];

    if (!inSpec) {
      throw new CapUrnError(ErrorCodes.MISSING_IN_SPEC, "Cap URN requires 'in' tag for input media URN");
    }
    if (!outSpec) {
      throw new CapUrnError(ErrorCodes.MISSING_OUT_SPEC, "Cap URN requires 'out' tag for output media URN");
    }

    // Validate in/out are media URNs or wildcards
    if (!isValidMediaUrnOrWildcard(inSpec)) {
      throw new CapUrnError(ErrorCodes.INVALID_FORMAT, `Invalid 'in' media URN: ${inSpec}. Must start with 'media:' or be '*'`);
    }
    if (!isValidMediaUrnOrWildcard(outSpec)) {
      throw new CapUrnError(ErrorCodes.INVALID_FORMAT, `Invalid 'out' media URN: ${outSpec}. Must start with 'media:' or be '*'`);
    }

    // Build remaining tags (excluding in/out)
    const remainingTags = {};
    for (const [key, value] of Object.entries(tags)) {
      const keyLower = key.toLowerCase();
      if (keyLower !== 'in' && keyLower !== 'out') {
        remainingTags[keyLower] = value;
      }
    }

    return new CapUrn(inSpec, outSpec, remainingTags);
  }

  /**
   * Get the canonical string representation of this cap URN
   * Always includes "cap:" prefix
   * Tags are sorted alphabetically for consistent representation (in/out included)
   * Uses TaggedUrn for serialization to ensure consistent quoting
   *
   * @returns {string} The canonical string representation
   */
  toString() {
    // Build complete tags map including in and out
    const allTags = { ...this.tags, 'in': this.inSpec, 'out': this.outSpec };

    // Use TaggedUrn for canonical serialization
    const taggedUrn = new TaggedUrn('cap', allTags, true);
    return taggedUrn.toString();
  }

  /**
   * Get the value of a specific tag
   * Key is normalized to lowercase for lookup
   * Returns inSpec for "in" key, outSpec for "out" key
   *
   * @param {string} key - The tag key
   * @returns {string|undefined} The tag value or undefined if not found
   */
  getTag(key) {
    const keyLower = key.toLowerCase();
    if (keyLower === 'in') {
      return this.inSpec;
    }
    if (keyLower === 'out') {
      return this.outSpec;
    }
    return this.tags[keyLower];
  }

  /**
   * Check if this cap has a specific tag with a specific value
   * Key is normalized to lowercase; value comparison is case-sensitive
   * Checks inSpec for "in" key, outSpec for "out" key
   *
   * @param {string} key - The tag key
   * @param {string} value - The tag value to check
   * @returns {boolean} Whether the tag exists with the specified value
   */
  hasTag(key, value) {
    const keyLower = key.toLowerCase();
    if (keyLower === 'in') {
      return this.inSpec === value;
    }
    if (keyLower === 'out') {
      return this.outSpec === value;
    }
    const tagValue = this.tags[keyLower];
    return tagValue !== undefined && tagValue === value;
  }

  /**
   * Create a new cap URN with an added or updated tag
   * Key is normalized to lowercase; value is preserved as-is
   * SILENTLY IGNORES attempts to set "in" or "out" - use withInSpec/withOutSpec instead
   *
   * @param {string} key - The tag key
   * @param {string} value - The tag value
   * @returns {CapUrn} A new CapUrn instance with the tag added/updated
   */
  withTag(key, value) {
    const keyLower = key.toLowerCase();
    // Silently ignore attempts to set in/out via withTag
    if (keyLower === 'in' || keyLower === 'out') {
      return this;
    }
    const newTags = { ...this.tags };
    newTags[keyLower] = value;
    return new CapUrn(this.inSpec, this.outSpec, newTags);
  }

  /**
   * Create a new cap URN with a different input spec
   *
   * @param {string} inSpec - The new input spec ID
   * @returns {CapUrn} A new CapUrn instance with the updated inSpec
   */
  withInSpec(inSpec) {
    return new CapUrn(inSpec, this.outSpec, this.tags);
  }

  /**
   * Create a new cap URN with a different output spec
   *
   * @param {string} outSpec - The new output spec ID
   * @returns {CapUrn} A new CapUrn instance with the updated outSpec
   */
  withOutSpec(outSpec) {
    return new CapUrn(this.inSpec, outSpec, this.tags);
  }

  /**
   * Create a new cap URN with a tag removed
   * Key is normalized to lowercase for case-insensitive removal
   * SILENTLY IGNORES attempts to remove "in" or "out" - they are required
   *
   * @param {string} key - The tag key to remove
   * @returns {CapUrn} A new CapUrn instance with the tag removed
   */
  withoutTag(key) {
    const keyLower = key.toLowerCase();
    // Silently ignore attempts to remove in/out - they are required
    if (keyLower === 'in' || keyLower === 'out') {
      return this;
    }
    const newTags = { ...this.tags };
    delete newTags[keyLower];
    return new CapUrn(this.inSpec, this.outSpec, newTags);
  }

  /**
   * Check if this cap (pattern/handler) accepts a request (instance).
   *
   * Direction (in/out) uses TaggedUrn.accepts()/conformsTo() (via MediaUrn matching):
   * - Input: capIn.accepts(requestIn) — cap's input spec is pattern, request's input is instance
   * - Output: capOut.conformsTo(requestOut) — cap's output is instance, request's output is pattern
   * For other tags:
   * - For each tag in the request: cap has same value, wildcard (*), or missing tag
   * - For each tag in the cap: if request is missing that tag, that's fine (cap is more specific)
   * Missing tags (except in/out) are treated as wildcards (less specific, can handle any value).
   *
   * @param {CapUrn} request - The request cap to check
   * @returns {boolean} Whether this cap accepts the request
   */
  accepts(request) {
    if (!request) {
      return true;
    }

    // Direction specs: TaggedUrn semantic matching via MediaUrn
    // Check in_urn: cap's input spec (pattern) accepts request's input (instance).
    // "media:" on the PATTERN side (this.inSpec) means "I accept any input" — skip check.
    // "*" is also treated as wildcard. "media:" on the instance side still participates.
    if (this.inSpec !== '*' && this.inSpec !== 'media:' && request.inSpec !== '*') {
      const capIn = TaggedUrn.fromString(this.inSpec);
      const requestIn = TaggedUrn.fromString(request.inSpec);
      if (!capIn.accepts(requestIn)) {
        return false;
      }
    }

    // Check out_urn: cap's output (instance) conforms to request's output (pattern).
    // "media:" on the PATTERN side (this.outSpec) means "I accept any output" — skip check.
    // "*" is also treated as wildcard. "media:" on the instance side still participates.
    if (this.outSpec !== '*' && this.outSpec !== 'media:' && request.outSpec !== '*') {
      const capOut = TaggedUrn.fromString(this.outSpec);
      const requestOut = TaggedUrn.fromString(request.outSpec);
      if (!capOut.conformsTo(requestOut)) {
        return false;
      }
    }

    // Check all other tags that the request specifies
    for (const [requestKey, requestValue] of Object.entries(request.tags)) {
      const capValue = this.tags[requestKey];

      if (capValue === undefined) {
        // Missing tag in cap is treated as wildcard - can handle any value
        continue;
      }

      if (capValue === '*') {
        // Cap has wildcard - can handle any value
        continue;
      }

      if (requestValue === '*') {
        // Request accepts any value - cap's specific value matches
        continue;
      }

      if (capValue !== requestValue) {
        // Cap has specific value that doesn't match request's specific value
        return false;
      }
    }

    // If cap has additional specific tags that request doesn't specify, that's fine
    // The cap is just more specific than needed
    return true;
  }

  /**
   * Check if this cap (instance) conforms to another cap (pattern).
   * Equivalent to cap.accepts(this).
   *
   * @param {CapUrn} cap - The cap to check conformance against
   * @returns {boolean} Whether this cap conforms to the given cap
   */
  conformsTo(cap) {
    return cap.accepts(this);
  }

  /**
   * Calculate specificity score for cap matching
   *
   * More specific caps have higher scores and are preferred.
   * Direction specs contribute their MediaUrn tag count (more tags = more specific).
   * Other tags contribute 1 per non-wildcard value.
   *
   * @returns {number} The specificity score
   */
  specificity() {
    let count = 0;
    // Direction specs contribute their MediaUrn tag count
    if (this.inSpec !== '*') {
      const inMedia = TaggedUrn.fromString(this.inSpec);
      count += Object.keys(inMedia.tags).length;
    }
    if (this.outSpec !== '*') {
      const outMedia = TaggedUrn.fromString(this.outSpec);
      count += Object.keys(outMedia.tags).length;
    }
    // Count non-wildcard tags
    count += Object.values(this.tags).filter(value => value !== '*').length;
    return count;
  }

  /**
   * Check if this cap is more specific than another
   *
   * @param {CapUrn} other - The other cap to compare with
   * @returns {boolean} Whether this cap is more specific
   */
  isMoreSpecificThan(other) {
    if (!other) {
      return true;
    }

    return this.specificity() > other.specificity();
  }

  /**
   * Create a new cap with a specific tag set to wildcard
   * Handles "in" and "out" specially
   *
   * @param {string} key - The tag key to set to wildcard
   * @returns {CapUrn} A new CapUrn instance with the tag set to wildcard
   */
  withWildcardTag(key) {
    const keyLower = key.toLowerCase();
    if (keyLower === 'in') {
      return this.withInSpec('*');
    }
    if (keyLower === 'out') {
      return this.withOutSpec('*');
    }
    if (this.tags.hasOwnProperty(keyLower)) {
      return this.withTag(key, '*');
    }
    return this;
  }

  /**
   * Create a new cap with only specified tags
   * Always preserves inSpec and outSpec (they are required)
   *
   * @param {string[]} keys - Array of tag keys to include
   * @returns {CapUrn} A new CapUrn instance with only the specified tags (plus in/out)
   */
  subset(keys) {
    const newTags = {};
    for (const key of keys) {
      const normalizedKey = key.toLowerCase();
      // Skip in/out - they are always preserved via constructor
      if (normalizedKey !== 'in' && normalizedKey !== 'out') {
        if (this.tags.hasOwnProperty(normalizedKey)) {
          newTags[normalizedKey] = this.tags[normalizedKey];
        }
      }
    }
    return new CapUrn(this.inSpec, this.outSpec, newTags);
  }

  /**
   * Merge with another cap (other takes precedence for conflicts)
   * Direction specs (in/out) are taken from other
   *
   * @param {CapUrn} other - The cap to merge with
   * @returns {CapUrn} A new CapUrn instance with merged tags
   */
  merge(other) {
    if (!other) {
      return new CapUrn(this.inSpec, this.outSpec, this.tags);
    }
    const newTags = { ...this.tags, ...other.tags };
    return new CapUrn(other.inSpec, other.outSpec, newTags);
  }

  /**
   * Check if two cap URNs are comparable (on the same specialization chain).
   * isComparable(other) ≡ accepts(other) || other.accepts(this)
   * @param {CapUrn} other
   * @returns {boolean}
   */
  isComparable(other) {
    return this.accepts(other) || other.accepts(this);
  }

  /**
   * Check if two cap URNs are equivalent in the order-theoretic sense.
   * Two URNs are equivalent if each accepts (subsumes) the other.
   * isEquivalent(other) ≡ accepts(other) && other.accepts(this)
   * @param {CapUrn} other
   * @returns {boolean}
   */
  isEquivalent(other) {
    return this.accepts(other) && other.accepts(this);
  }

  /**
   * Check if this cap URN is equal to another
   * Compares direction specs (in/out) and tags
   *
   * @param {CapUrn} other - The other cap URN to compare with
   * @returns {boolean} Whether the cap URNs are equal
   */
  equals(other) {
    if (!other || !(other instanceof CapUrn)) {
      return false;
    }

    // Compare direction specs
    if (this.inSpec !== other.inSpec || this.outSpec !== other.outSpec) {
      return false;
    }

    // Compare tags
    const thisKeys = Object.keys(this.tags).sort();
    const otherKeys = Object.keys(other.tags).sort();

    if (thisKeys.length !== otherKeys.length) {
      return false;
    }

    for (let i = 0; i < thisKeys.length; i++) {
      if (thisKeys[i] !== otherKeys[i]) {
        return false;
      }
      if (this.tags[thisKeys[i]] !== other.tags[otherKeys[i]]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get a hash string for this cap URN
   * Two equivalent cap URNs will have the same hash
   *
   * @returns {string} A hash of the canonical string representation
   */
  hash() {
    // Simple hash function for the canonical string
    const canonical = this.toString();
    let hash = 0;
    for (let i = 0; i < canonical.length; i++) {
      const char = canonical.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}

/**
 * Cap URN Builder for fluent construction
 */
class CapUrnBuilder {
  constructor() {
    this._inSpec = null;
    this._outSpec = null;
    this._tags = {};
  }

  /**
   * Set the input spec ID
   *
   * @param {string} spec - The input spec ID
   * @returns {CapUrnBuilder} This builder instance for chaining
   */
  inSpec(spec) {
    this._inSpec = spec;
    return this;
  }

  /**
   * Set the output spec ID
   *
   * @param {string} spec - The output spec ID
   * @returns {CapUrnBuilder} This builder instance for chaining
   */
  outSpec(spec) {
    this._outSpec = spec;
    return this;
  }

  /**
   * Add or update a tag
   * Key is normalized to lowercase; value is preserved as-is
   * SILENTLY IGNORES attempts to set "in" or "out" - use inSpec/outSpec methods
   *
   * @param {string} key - The tag key
   * @param {string} value - The tag value
   * @returns {CapUrnBuilder} This builder instance for chaining
   */
  tag(key, value) {
    const keyLower = key.toLowerCase();
    // Silently ignore in/out - use inSpec/outSpec methods
    if (keyLower !== 'in' && keyLower !== 'out') {
      this._tags[keyLower] = value;
    }
    return this;
  }

  /**
   * Build the final CapUrn
   *
   * @returns {CapUrn} A new CapUrn instance
   * @throws {CapUrnError} If inSpec or outSpec are not set
   */
  build() {
    if (!this._inSpec) {
      throw new CapUrnError(ErrorCodes.MISSING_IN_SPEC, "Cap URN requires 'in' spec - call inSpec() before build()");
    }
    if (!this._outSpec) {
      throw new CapUrnError(ErrorCodes.MISSING_OUT_SPEC, "Cap URN requires 'out' spec - call outSpec() before build()");
    }
    return new CapUrn(this._inSpec, this._outSpec, this._tags);
  }
}

/**
 * Cap Matcher utility class
 */
class CapMatcher {
  /**
   * Find the most specific cap that accepts a request
   *
   * @param {CapUrn[]} caps - Array of available caps
   * @param {CapUrn} request - The request to match
   * @returns {CapUrn|null} The best matching cap or null if no match
   */
  static findBestMatch(caps, request) {
    let best = null;
    let bestSpecificity = -1;

    for (const cap of caps) {
      if (cap.accepts(request)) {
        const specificity = cap.specificity();
        if (specificity > bestSpecificity) {
          best = cap;
          bestSpecificity = specificity;
        }
      }
    }

    return best;
  }

  /**
   * Find all caps that accept a request, sorted by specificity
   *
   * @param {CapUrn[]} caps - Array of available caps
   * @param {CapUrn} request - The request to match
   * @returns {CapUrn[]} Array of matching caps sorted by specificity (most specific first)
   */
  static findAllMatches(caps, request) {
    const matches = caps.filter(cap => cap.accepts(request));

    // Sort by specificity (most specific first)
    matches.sort((a, b) => b.specificity() - a.specificity());

    return matches;
  }

  /**
   * Check if two cap sets are compatible
   *
   * @param {CapUrn[]} caps1 - First set of caps
   * @param {CapUrn[]} caps2 - Second set of caps
   * @returns {boolean} Whether any caps from the two sets are compatible
   */
  static areCompatible(caps1, caps2) {
    for (const c1 of caps1) {
      for (const c2 of caps2) {
        if (c1.accepts(c2) || c2.accepts(c1)) {
          return true;
        }
      }
    }
    return false;
  }
}

// ============================================================================
// MEDIA SPEC PARSING
// ============================================================================

/**
 * MediaSpec error types
 */
class MediaSpecError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MediaSpecError';
    this.code = code;
  }
}

const MediaSpecErrorCodes = {
  UNRESOLVABLE_MEDIA_URN: 1,
  DUPLICATE_MEDIA_URN: 2
};

// ============================================================================
// BUILT-IN SPEC IDS AND DEFINITIONS
// ============================================================================

/**
 * Well-known built-in media URN constants
 * These media URNs are implicitly available and do not need to be declared in mediaSpecs
 *
 * Cardinality and Structure use orthogonal marker tags:
 * - `list` marker: presence = list/array, absence = scalar (default)
 * - `record` marker: presence = has internal fields, absence = opaque (default)
 *
 * Examples:
 * - `media:pdf` → scalar, opaque (no markers)
 * - `media:textable;list` → list, opaque (has list marker)
 * - `media:json;textable;record` → scalar, record (has record marker)
 * - `media:json;list;record;textable` → list of records (has both markers)
 */

// Primitive types - URNs must match base.toml definitions
// Media URN for void (no input/output) - no coercion tags
const MEDIA_VOID = 'media:void';
// Media URN for string type - textable (can become text), scalar by default (no list marker)
const MEDIA_STRING = 'media:textable';
// Media URN for integer type - textable, numeric (math ops valid), scalar by default
const MEDIA_INTEGER = 'media:integer;textable;numeric';
// Media URN for number type - textable, numeric, scalar by default
const MEDIA_NUMBER = 'media:textable;numeric';
// Media URN for boolean type - uses "bool" not "boolean" per base.toml
const MEDIA_BOOLEAN = 'media:bool;textable';
// Media URN for a generic record/object type - has internal key-value structure but NOT textable
// Use MEDIA_JSON for textable JSON objects.
const MEDIA_OBJECT = 'media:record';
// Media URN for binary data - the most general media type (no constraints)
const MEDIA_IDENTITY = 'media:';

// Array types - URNs must match base.toml definitions
// Media URN for string array type - textable with list marker
const MEDIA_STRING_ARRAY = 'media:list;textable';
// Media URN for integer array type - textable, numeric with list marker
const MEDIA_INTEGER_ARRAY = 'media:integer;list;textable;numeric';
// Media URN for number array type - textable, numeric with list marker
const MEDIA_NUMBER_ARRAY = 'media:list;textable;numeric';
// Media URN for boolean array type - uses "bool" with list marker
const MEDIA_BOOLEAN_ARRAY = 'media:bool;list;textable';
// Media URN for object array type - list of records (NOT textable)
// Use a specific format like JSON array for textable object arrays.
const MEDIA_OBJECT_ARRAY = 'media:list;record';

// Semantic media types for specialized content
// Media URN for PNG image data
const MEDIA_PNG = 'media:image;png';
// Media URN for audio data (wav, mp3, flac, etc.)
const MEDIA_AUDIO = 'media:wav;audio';
// Media URN for video data (mp4, webm, mov, etc.)
const MEDIA_VIDEO = 'media:video';

// Semantic AI input types - distinguished by their purpose/context
// Media URN for audio input containing speech for transcription (Whisper)
const MEDIA_AUDIO_SPEECH = 'media:audio;wav;speech';
// Media URN for thumbnail image output
const MEDIA_IMAGE_THUMBNAIL = 'media:image;png;thumbnail';

// Document types (PRIMARY naming - type IS the format)
// Media URN for PDF documents
const MEDIA_PDF = 'media:pdf';
// Media URN for EPUB documents
const MEDIA_EPUB = 'media:epub';

// Text format types (PRIMARY naming - type IS the format)
// Media URN for Markdown text
const MEDIA_MD = 'media:md;textable';
// Media URN for plain text
const MEDIA_TXT = 'media:txt;textable';
// Media URN for reStructuredText
const MEDIA_RST = 'media:rst;textable';
// Media URN for log files
const MEDIA_LOG = 'media:log;textable';
// Media URN for HTML documents
const MEDIA_HTML = 'media:html;textable';
// Media URN for XML documents
const MEDIA_XML = 'media:xml;textable';
// Media URN for JSON data - has record marker (structured key-value)
const MEDIA_JSON = 'media:json;record;textable';
// Media URN for JSON with schema constraint (input for structured queries)
const MEDIA_JSON_SCHEMA = 'media:json;json-schema;record;textable';
// Media URN for YAML data - has record marker (structured key-value)
const MEDIA_YAML = 'media:record;textable;yaml';

// File path types - for arguments that represent filesystem paths
// Media URN for a single file path - textable, scalar by default (no list marker)
const MEDIA_FILE_PATH = 'media:file-path;textable';
// Media URN for an array of file paths - textable with list marker
const MEDIA_FILE_PATH_ARRAY = 'media:file-path;list;textable';

// Semantic text input types - distinguished by their purpose/context
// Media URN for frontmatter text (book metadata) - scalar by default
const MEDIA_FRONTMATTER_TEXT = 'media:frontmatter;textable';
// Media URN for model spec (provider:model format, HuggingFace name, etc.) - scalar by default
const MEDIA_MODEL_SPEC = 'media:model-spec;textable';
// Media URN for MLX model path - scalar by default
const MEDIA_MLX_MODEL_PATH = 'media:mlx-model-path;textable';
// Media URN for model repository (input for list-models) - has record marker
const MEDIA_MODEL_REPO = 'media:model-repo;record;textable';

// CAPDAG output types - record marker for structured JSON objects, list marker for arrays
// Media URN for model dimension output - scalar by default (no list marker)
const MEDIA_MODEL_DIM = 'media:integer;model-dim;numeric;textable';
// Media URN for model download output - has record marker
const MEDIA_DOWNLOAD_OUTPUT = 'media:download-result;record;textable';
// Media URN for model list output - has record marker
const MEDIA_LIST_OUTPUT = 'media:model-list;record;textable';
// Media URN for model status output - has record marker
const MEDIA_STATUS_OUTPUT = 'media:model-status;record;textable';
// Media URN for model contents output - has record marker
const MEDIA_CONTENTS_OUTPUT = 'media:model-contents;record;textable';
// Media URN for model availability output - has record marker
const MEDIA_AVAILABILITY_OUTPUT = 'media:model-availability;record;textable';
// Media URN for model path output - has record marker
const MEDIA_PATH_OUTPUT = 'media:model-path;record;textable';
// Media URN for embedding vector output - has record marker
const MEDIA_EMBEDDING_VECTOR = 'media:embedding-vector;record;textable';
// Media URN for LLM inference output - has record marker
const MEDIA_LLM_INFERENCE_OUTPUT = 'media:generated-text;record;textable';
// Media URN for extracted metadata - has record marker
const MEDIA_FILE_METADATA = 'media:file-metadata;record;textable';
// Media URN for extracted outline - has record marker
const MEDIA_DOCUMENT_OUTLINE = 'media:document-outline;record;textable';
// Media URN for disbound page - has list marker (array of page objects)
const MEDIA_DISBOUND_PAGE = 'media:disbound-page;list;textable';
// Media URN for vision inference output - textable, scalar by default
const MEDIA_IMAGE_DESCRIPTION = 'media:image-description;textable';
// Media URN for transcription output - has record marker
const MEDIA_TRANSCRIPTION_OUTPUT = 'media:record;textable;transcription';
// Media URN for decision output (bit choice) - scalar by default
const MEDIA_DECISION = 'media:bool;decision;textable';
// Media URN for decision array output (bit choices) - has list marker
const MEDIA_DECISION_ARRAY = 'media:bool;decision;list;textable';

// =============================================================================
// STANDARD CAP URN CONSTANTS
// =============================================================================

// Standard echo capability URN
// Accepts any media type as input and outputs any media type
const CAP_IDENTITY = 'cap:in=media:;out=media:';

// =============================================================================
// MEDIA URN CLASS
// =============================================================================

/**
 * Error types for MediaUrn operations
 */
class MediaUrnError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MediaUrnError';
    this.code = code;
  }
}

const MediaUrnErrorCodes = {
  INVALID_PREFIX: 'INVALID_PREFIX',
};

/**
 * MediaUrn wraps a TaggedUrn with prefix validation and media-specific convenience methods.
 * Mirrors the Rust MediaUrn type.
 */
class MediaUrn {
  /**
   * @param {TaggedUrn} taggedUrn - A parsed TaggedUrn with prefix 'media'
   */
  constructor(taggedUrn) {
    if (taggedUrn.getPrefix() !== 'media') {
      throw new MediaUrnError(
        MediaUrnErrorCodes.INVALID_PREFIX,
        `Expected prefix 'media', got '${taggedUrn.getPrefix()}'`
      );
    }
    this._urn = taggedUrn;
  }

  /**
   * Parse a media URN string. Validates the prefix is 'media'.
   * @param {string} str - The media URN string (e.g., "media:pdf")
   * @returns {MediaUrn}
   * @throws {MediaUrnError} If prefix is not 'media'
   */
  static fromString(str) {
    const urn = TaggedUrn.fromString(str);
    return new MediaUrn(urn);
  }

  /** @returns {boolean} True if the "textable" marker tag is NOT present (binary = not textable) */
  isBinary() { return this._urn.getTag('textable') === undefined; }

  // =========================================================================
  // CARDINALITY (list marker)
  // =========================================================================

  /**
   * Returns true if this media is a list (has `list` marker tag).
   * Returns false if scalar (no `list` marker = default).
   * @returns {boolean}
   */
  isList() { return this._hasMarkerTag('list'); }

  /**
   * Returns true if this media is a scalar (no `list` marker).
   * Scalar is the default cardinality.
   * @returns {boolean}
   */
  isScalar() { return !this._hasMarkerTag('list'); }

  // =========================================================================
  // STRUCTURE (record marker)
  // =========================================================================

  /**
   * Returns true if this media is a record (has `record` marker tag).
   * A record has internal key-value structure (e.g., JSON object).
   * @returns {boolean}
   */
  isRecord() { return this._hasMarkerTag('record'); }

  /**
   * Returns true if this media is opaque (no `record` marker).
   * Opaque is the default structure - no internal fields recognized.
   * @returns {boolean}
   */
  isOpaque() { return !this._hasMarkerTag('record'); }

  // =========================================================================
  // HELPER: Check for marker tag presence
  // =========================================================================

  /**
   * Check if a marker tag (tag with wildcard/no value) is present.
   * A marker tag is stored as key="*" in the tagged URN.
   * @param {string} tagName
   * @returns {boolean}
   * @private
   */
  _hasMarkerTag(tagName) {
    const value = this._urn.getTag(tagName);
    return value === '*';
  }

  /** @returns {boolean} True if the "json" marker tag is present */
  isJson() { return this._urn.getTag('json') !== undefined; }

  /** @returns {boolean} True if the "textable" marker tag is present */
  isText() { return this._urn.getTag('textable') !== undefined; }

  /** @returns {boolean} True if the "void" marker tag is present */
  isVoid() { return this._urn.getTag('void') !== undefined; }

  /** @returns {boolean} True if the "image" marker tag is present */
  isImage() { return this._urn.getTag('image') !== undefined; }

  /** @returns {boolean} True if the "audio" marker tag is present */
  isAudio() { return this._urn.getTag('audio') !== undefined; }

  /** @returns {boolean} True if the "video" marker tag is present */
  isVideo() { return this._urn.getTag('video') !== undefined; }

  /** @returns {boolean} True if the "numeric" marker tag is present */
  isNumeric() { return this._urn.getTag('numeric') !== undefined; }

  /** @returns {boolean} True if the "bool" marker tag is present */
  isBool() { return this._urn.getTag('bool') !== undefined; }

  /**
   * Check if this represents a single file path type (not array).
   * Returns true if the "file-path" marker tag is present AND no list marker.
   * @returns {boolean}
   */
  isFilePath() { return this._hasMarkerTag('file-path') && !this.isList(); }

  /**
   * Check if this represents a file path array type.
   * Returns true if the "file-path" marker tag is present AND has list marker.
   * @returns {boolean}
   */
  isFilePathArray() { return this._hasMarkerTag('file-path') && this.isList(); }

  /**
   * Check if this represents any file path type (single or array).
   * Returns true if "file-path" marker tag is present.
   * @returns {boolean}
   */
  isAnyFilePath() { return this._hasMarkerTag('file-path'); }

  /**
   * Check if this media URN conforms to another (pattern).
   * @param {MediaUrn} pattern
   * @returns {boolean}
   */
  conformsTo(pattern) { return this._urn.conformsTo(pattern._urn); }

  /**
   * Check if this media URN (as pattern) accepts an instance.
   * @param {MediaUrn} instance
   * @returns {boolean}
   */
  accepts(instance) { return this._urn.accepts(instance._urn); }

  /** @returns {number} Specificity score (tag count based) */
  specificity() { return this._urn.specificity(); }

  /**
   * Get the file extension from the ext tag, if present.
   * @returns {string|null}
   */
  extension() {
    const ext = this._urn.getTag('ext');
    return ext !== undefined ? ext : null;
  }

  /**
   * @param {string} key
   * @param {string} [value]
   * @returns {boolean}
   */
  hasTag(key, value) {
    if (value !== undefined) {
      return this._urn.hasTag(key, value);
    }
    return this._urn.getTag(key) !== undefined;
  }

  /**
   * @param {string} key
   * @returns {string|undefined}
   */
  getTag(key) { return this._urn.getTag(key); }

  /** @returns {string} Canonical string representation */
  toString() { return this._urn.toString(); }

  /**
   * Check if two media URNs are equivalent (each accepts the other).
   * isEquivalent(other) ≡ accepts(other) && other.accepts(this)
   * @param {MediaUrn} other
   * @returns {boolean}
   */
  isEquivalent(other) { return this._urn.isEquivalent(other._urn); }

  /**
   * Check if two media URNs are comparable (on the same specialization chain).
   * isComparable(other) ≡ accepts(other) || other.accepts(this)
   * @param {MediaUrn} other
   * @returns {boolean}
   */
  isComparable(other) { return this._urn.isComparable(other._urn); }

  /**
   * @param {MediaUrn} other
   * @returns {boolean}
   */
  equals(other) { return this._urn.equals(other._urn); }
}

// =============================================================================
// STANDARD CAP URN BUILDERS
// =============================================================================

/**
 * Build URN for LLM conversation capability
 * @param {string} langCode - Language code (e.g., "en", "fr")
 * @returns {CapUrn}
 */
function llmConversationUrn(langCode) {
  return new CapUrnBuilder()
    .tag('op', 'conversation')
    .tag('unconstrained', '*')
    .tag('language', langCode)
    .inSpec(MEDIA_STRING)
    .outSpec(MEDIA_LLM_INFERENCE_OUTPUT)
    .build();
}

/**
 * Build URN for model-availability capability
 * @returns {CapUrn}
 */
function modelAvailabilityUrn() {
  return new CapUrnBuilder()
    .tag('op', 'model-availability')
    .inSpec(MEDIA_MODEL_SPEC)
    .outSpec(MEDIA_AVAILABILITY_OUTPUT)
    .build();
}

/**
 * Build URN for model-path capability
 * @returns {CapUrn}
 */
function modelPathUrn() {
  return new CapUrnBuilder()
    .tag('op', 'model-path')
    .inSpec(MEDIA_MODEL_SPEC)
    .outSpec(MEDIA_PATH_OUTPUT)
    .build();
}

// =============================================================================
// SCHEMA URL CONFIGURATION
// =============================================================================

const DEFAULT_SCHEMA_BASE = 'https://capdag.com/schema';

/**
 * Get the schema base URL from environment variables or default
 *
 * Checks in order:
 * 1. CAPDAG_SCHEMA_BASE_URL environment variable
 * 2. CAPDAG_REGISTRY_URL environment variable + "/schema"
 * 3. Default: "https://capdag.com/schema"
 *
 * @returns {string} The schema base URL
 */
function getSchemaBaseURL() {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.CAPDAG_SCHEMA_BASE_URL) {
      return process.env.CAPDAG_SCHEMA_BASE_URL;
    }
    if (process.env.CAPDAG_REGISTRY_URL) {
      return process.env.CAPDAG_REGISTRY_URL + '/schema';
    }
  }
  return DEFAULT_SCHEMA_BASE;
}

/**
 * Get a profile URL for the given profile name
 *
 * @param {string} profileName - The profile name (e.g., 'str', 'int')
 * @returns {string} The full profile URL
 */
function getProfileURL(profileName) {
  return `${getSchemaBaseURL()}/${profileName}`;
}

// =============================================================================
// MEDIA URN TAG UTILITIES
// =============================================================================
// NOTE: The MEDIA_X constants above are convenience values for referencing
// common media URNs in code. Resolution must go through mediaSpecs tables -
// there is NO built-in resolution.

/**
 * Resolved MediaSpec structure
 *
 * A MediaSpec is a resolved media specification containing information about
 * a value type in the CAPDAG system. MediaSpecs are identified by unique media URNs
 * and contain fields like media_type, profile_uri, schema, etc.
 *
 * MediaSpecs are defined in JSON files in the registry or inline in cap definitions.
 */
class MediaSpec {
  /**
   * Create a new MediaSpec
   * @param {string} contentType - The MIME content type
   * @param {string|null} profile - Optional profile URL
   * @param {Object|null} schema - Optional JSON Schema for local validation
   * @param {string|null} title - Optional display-friendly title
   * @param {string|null} description - Optional short plain-text description
   * @param {string|null} mediaUrn - Source media URN for tag-based checks
   * @param {Object|null} validation - Optional validation rules (min, max, min_length, max_length, pattern, allowed_values)
   * @param {Object|null} metadata - Optional metadata (arbitrary key-value pairs for display/categorization)
   * @param {string[]} extensions - File extensions for storing this media type (e.g., ['pdf'], ['jpg', 'jpeg'])
   * @param {string|null} documentation - Optional long-form markdown documentation. Rendered in media info panels, the cap navigator, capdag-dot-com, and anywhere else a rich-text explanation of the media spec is useful.
   */
  constructor(contentType, profile = null, schema = null, title = null, description = null, mediaUrn = null, validation = null, metadata = null, extensions = [], documentation = null) {
    this.contentType = contentType;
    this.profile = profile;
    this.schema = schema;
    this.title = title;
    this.description = description;
    this.mediaUrn = mediaUrn;
    this.validation = validation;
    this.metadata = metadata;
    this.extensions = extensions;
    this.documentation = documentation;
  }

  /**
   * Get the parsed MediaUrn object for this spec. Lazily created and cached.
   * @returns {MediaUrn|null} The parsed MediaUrn, or null if no mediaUrn string
   */
  parsedMediaUrn() {
    if (!this.mediaUrn) return null;
    if (!this._parsedMediaUrn) {
      this._parsedMediaUrn = MediaUrn.fromString(this.mediaUrn);
    }
    return this._parsedMediaUrn;
  }

  /** @returns {boolean} True if binary (textable marker tag absent) */
  isBinary() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.isBinary() : false;
  }

  /** @returns {boolean} True if record structure (has record marker) */
  isRecord() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.isRecord() : false;
  }

  /** @returns {boolean} True if opaque structure (no record marker) */
  isOpaque() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.isOpaque() : false;
  }

  /** @returns {boolean} True if scalar value (no list marker) */
  isScalar() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.isScalar() : false;
  }

  /** @returns {boolean} True if list/array (has list marker) */
  isList() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.isList() : false;
  }

  /** @returns {boolean} True if JSON representation (json tag present) */
  isJSON() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.isJson() : false;
  }

  /** @returns {boolean} True if text (textable tag present) */
  isText() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.isText() : false;
  }

  /** @returns {boolean} True if image (image tag present) */
  isImage() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.hasTag('image') : false;
  }

  /** @returns {boolean} True if audio (audio tag present) */
  isAudio() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.hasTag('audio') : false;
  }

  /** @returns {boolean} True if video (video tag present) */
  isVideo() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.hasTag('video') : false;
  }

  /** @returns {boolean} True if numeric (numeric tag present) */
  isNumeric() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.hasTag('numeric') : false;
  }

  /** @returns {boolean} True if boolean (bool tag present) */
  isBool() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.hasTag('bool') : false;
  }

  /**
   * Get the primary type (e.g., "image" from "image/png")
   * @returns {string} The primary type
   */
  primaryType() {
    return this.contentType.split('/')[0];
  }

  /**
   * Get the subtype (e.g., "png" from "image/png")
   * @returns {string|undefined} The subtype
   */
  subtype() {
    const parts = this.contentType.split('/');
    return parts.length > 1 ? parts[1] : undefined;
  }

  /**
   * Get the canonical string representation
   * Format: <media-type>; profile="<url>" (no content-type: prefix)
   * @returns {string} The media_spec as a string
   */
  toString() {
    if (this.profile) {
      return `${this.contentType}; profile="${this.profile}"`;
    }
    return this.contentType;
  }

  /**
   * Get MediaSpec from a CapUrn using the output media URN
   * NOTE: outSpec is now a required first-class field on CapUrn
   * @param {CapUrn} capUrn - The cap URN
   * @param {Object} mediaSpecs - Optional mediaSpecs lookup table for resolution
   * @returns {MediaSpec} The resolved MediaSpec
   * @throws {MediaSpecError} If media URN cannot be resolved
   */
  static fromCapUrn(capUrn, mediaSpecs = []) {
    // outSpec is now a required field, so it's always present
    const mediaUrn = capUrn.getOutSpec();

    // Resolve the media URN to a MediaSpec - no fallbacks, fail hard
    return resolveMediaUrn(mediaUrn, mediaSpecs);
  }
}

/**
 * Resolve a media URN to a MediaSpec
 *
 * Resolution: Look up mediaUrn in mediaSpecs array (by urn field), FAIL HARD if not found.
 * There is no built-in resolution - all media URNs must be in mediaSpecs.
 *
 * @param {string} mediaUrn - The media URN (e.g., "media:textable")
 * @param {Array} mediaSpecs - The mediaSpecs array (each item has urn, media_type, title, etc.)
 * @returns {MediaSpec} The resolved MediaSpec
 * @throws {MediaSpecError} If media URN cannot be resolved
 */
function resolveMediaUrn(mediaUrn, mediaSpecs = []) {
  // Look up in mediaSpecs array by urn field
  if (mediaSpecs && Array.isArray(mediaSpecs)) {
    const def = mediaSpecs.find(spec => spec.urn === mediaUrn);

    if (def) {
      // Object form: { urn, media_type, title, profile_uri?, schema?, description?, documentation?, validation?, metadata?, extensions? }
      const mediaType = def.media_type || def.mediaType;
      const profileUri = def.profile_uri || def.profileUri || null;
      const schema = def.schema || null;
      const title = def.title || null;
      const description = def.description || null;
      // Long-form markdown body for rich info panels. Strict
      // snake_case (`documentation`) to match the JSON schema; no
      // camelCase fallback because all generator pipelines write the
      // canonical form.
      const documentation = typeof def.documentation === 'string' && def.documentation.length > 0
        ? def.documentation
        : null;
      const validation = def.validation || null;
      const metadata = def.metadata || null;
      const extensions = Array.isArray(def.extensions) ? def.extensions : [];

      if (!mediaType) {
        throw new MediaSpecError(
          MediaSpecErrorCodes.UNRESOLVABLE_MEDIA_URN,
          `Media URN '${mediaUrn}' has invalid definition: missing media_type`
        );
      }

      return new MediaSpec(mediaType, profileUri, schema, title, description, mediaUrn, validation, metadata, extensions, documentation);
    }
  }

  // FAIL HARD - media URN must be in mediaSpecs array
  throw new MediaSpecError(
    MediaSpecErrorCodes.UNRESOLVABLE_MEDIA_URN,
    `Cannot resolve media URN: '${mediaUrn}'. Not found in mediaSpecs array.`
  );
}

/**
 * Build an extension index from a mediaSpecs array.
 * Maps lowercase extension strings to arrays of media URNs that use that extension.
 *
 * @param {Array} mediaSpecs - The mediaSpecs array
 * @returns {Map<string, string[]>} Map from extension to list of URNs
 */
function buildExtensionIndex(mediaSpecs) {
  const index = new Map();
  if (!mediaSpecs || !Array.isArray(mediaSpecs)) {
    return index;
  }

  for (const spec of mediaSpecs) {
    if (!spec.urn || !Array.isArray(spec.extensions)) continue;
    for (const ext of spec.extensions) {
      const extLower = ext.toLowerCase();
      if (!index.has(extLower)) {
        index.set(extLower, []);
      }
      const urns = index.get(extLower);
      if (!urns.includes(spec.urn)) {
        urns.push(spec.urn);
      }
    }
  }
  return index;
}

/**
 * Look up all media URNs that match a file extension (synchronous, no network).
 *
 * Returns all media URNs registered for the given file extension.
 * Multiple URNs may match the same extension (e.g., with different form= parameters).
 *
 * The extension should NOT include the leading dot (e.g., "pdf" not ".pdf").
 * Lookup is case-insensitive.
 *
 * @param {string} extension - The file extension to look up (without leading dot)
 * @param {Array} mediaSpecs - The mediaSpecs array
 * @returns {string[]} Array of media URNs for the extension
 * @throws {MediaSpecError} If no media spec is registered for the given extension
 *
 * @example
 * const urns = mediaUrnsForExtension('pdf', mediaSpecs);
 * // May return ['media:pdf']
 */
function mediaUrnsForExtension(extension, mediaSpecs) {
  const index = buildExtensionIndex(mediaSpecs);
  const extLower = extension.toLowerCase();
  const urns = index.get(extLower);

  if (!urns || urns.length === 0) {
    throw new MediaSpecError(
      MediaSpecErrorCodes.UNRESOLVABLE_MEDIA_URN,
      `No media spec registered for extension '${extension}'. ` +
      `Ensure the media spec is defined with an 'extensions' array containing '${extension}'.`
    );
  }

  return urns;
}

/**
 * Get all registered extensions and their corresponding media URNs.
 *
 * Returns an array of [extension, urns] pairs for debugging and introspection.
 *
 * @param {Array} mediaSpecs - The mediaSpecs array
 * @returns {Array<[string, string[]]>} Array of [extension, urns] pairs
 */
function getExtensionMappings(mediaSpecs) {
  const index = buildExtensionIndex(mediaSpecs);
  return Array.from(index.entries());
}

/**
 * Validate that media_specs array has no duplicate URNs.
 *
 * @param {Array} mediaSpecs - The mediaSpecs array to validate
 * @returns {{valid: boolean, error?: string, duplicates?: string[]}}
 */
function validateNoMediaSpecDuplicates(mediaSpecs) {
  if (!mediaSpecs || !Array.isArray(mediaSpecs) || mediaSpecs.length === 0) {
    return { valid: true };
  }

  const seen = new Set();
  const duplicates = [];

  for (const spec of mediaSpecs) {
    if (!spec.urn) continue;
    if (seen.has(spec.urn)) {
      duplicates.push(spec.urn);
    } else {
      seen.add(spec.urn);
    }
  }

  if (duplicates.length > 0) {
    return {
      valid: false,
      error: `Duplicate media URNs in media_specs: ${duplicates.join(', ')}`,
      duplicates
    };
  }

  return { valid: true };
}

/**
 * XV5: Validate that inline media_specs don't redefine existing registry specs.
 *
 * Validation requires a registryLookup function to check if media URNs exist.
 * If no registryLookup is provided, validation passes (graceful degradation).
 *
 * @param {Array} mediaSpecs - The inline media_specs array from a capability
 * @param {Object} [options] - Validation options
 * @param {Function} [options.registryLookup] - Function to check if media URN exists in registry
 *                                              Returns true if exists, false otherwise
 *                                              Should handle errors gracefully (return false)
 * @returns {Promise<{valid: boolean, error?: string, redefines?: string[]}>}
 */
async function validateNoMediaSpecRedefinition(mediaSpecs, options = {}) {
  if (!mediaSpecs || !Array.isArray(mediaSpecs) || mediaSpecs.length === 0) {
    return { valid: true };
  }

  const { registryLookup } = options;

  // If no registry lookup provided, degrade gracefully and allow
  if (!registryLookup || typeof registryLookup !== 'function') {
    return { valid: true };
  }

  const redefines = [];

  for (const spec of mediaSpecs) {
    const mediaUrn = spec.urn;
    if (!mediaUrn) continue;
    try {
      const existsInRegistry = await registryLookup(mediaUrn);
      if (existsInRegistry) {
        redefines.push(mediaUrn);
      }
    } catch (err) {
      // Registry lookup failed - log warning and allow (graceful degradation)
      console.warn(`[WARN] XV5: Could not verify inline spec '${mediaUrn}' against registry: ${err.message}. Allowing operation in offline mode.`);
    }
  }

  if (redefines.length > 0) {
    return {
      valid: false,
      error: `XV5: Inline media specs redefine existing registry specs: ${redefines.join(', ')}`,
      redefines
    };
  }

  return { valid: true };
}

/**
 * XV5: Synchronous version that checks against a provided lookup function.
 * If no registryLookup is provided, validation passes (graceful degradation).
 *
 * @param {Array} mediaSpecs - The inline media_specs array from a capability
 * @param {Function} [registryLookup] - Synchronous function to check if media URN exists
 *                                       Returns true if exists, false otherwise
 * @returns {{valid: boolean, error?: string, redefines?: string[]}}
 */
function validateNoMediaSpecRedefinitionSync(mediaSpecs, registryLookup = null) {
  if (!mediaSpecs || !Array.isArray(mediaSpecs) || mediaSpecs.length === 0) {
    return { valid: true };
  }

  // If no registry lookup provided, degrade gracefully and allow
  if (!registryLookup || typeof registryLookup !== 'function') {
    return { valid: true };
  }

  const redefines = [];

  for (const spec of mediaSpecs) {
    const mediaUrn = spec.urn;
    if (!mediaUrn) continue;
    if (registryLookup(mediaUrn)) {
      redefines.push(mediaUrn);
    }
  }

  if (redefines.length > 0) {
    return {
      valid: false,
      error: `XV5: Inline media specs redefine existing registry specs: ${redefines.join(', ')}`,
      redefines
    };
  }

  return { valid: true };
}

/**
 * Check if a CapUrn represents binary output.
 * Throws error if the output spec cannot be resolved - no fallbacks.
 * @param {CapUrn} capUrn - The cap URN
 * @param {Array} mediaSpecs - Optional mediaSpecs array
 * @returns {boolean} True if binary
 * @throws {MediaSpecError} If 'out' tag is missing or spec ID cannot be resolved
 */
function isBinaryCapUrn(capUrn, mediaSpecs = []) {
  const mediaSpec = MediaSpec.fromCapUrn(capUrn, mediaSpecs);
  return mediaSpec.isBinary();
}

/**
 * Check if a CapUrn represents JSON output.
 * Note: This checks for explicit JSON format marker only.
 * Throws error if the output spec cannot be resolved - no fallbacks.
 * @param {CapUrn} capUrn - The cap URN
 * @param {Array} mediaSpecs - Optional mediaSpecs array
 * @returns {boolean} True if explicit JSON tag present
 * @throws {MediaSpecError} If 'out' tag is missing or spec ID cannot be resolved
 */
function isJSONCapUrn(capUrn, mediaSpecs = []) {
  const mediaSpec = MediaSpec.fromCapUrn(capUrn, mediaSpecs);
  return mediaSpec.isJSON();
}

/**
 * Check if a CapUrn represents structured output (map or list).
 * Structured data can be serialized as JSON when transmitted as text.
 * Throws error if the output spec cannot be resolved - no fallbacks.
 * @param {CapUrn} capUrn - The cap URN
 * @param {Array} mediaSpecs - Optional mediaSpecs array
 * @returns {boolean} True if structured (map or list)
 * @throws {MediaSpecError} If 'out' tag is missing or spec ID cannot be resolved
 */
function isStructuredCapUrn(capUrn, mediaSpecs = []) {
  const mediaSpec = MediaSpec.fromCapUrn(capUrn, mediaSpecs);
  return mediaSpec.isStructured();
}

/**
 * Registration attribution - who registered a capability and when
 */
class RegisteredBy {
  /**
   * Create a new registration attribution
   * @param {string} username - Username of the user who registered this capability
   * @param {string} registeredAt - ISO 8601 timestamp of when the capability was registered
   */
  constructor(username, registeredAt) {
    if (!username || typeof username !== 'string') {
      throw new Error('Username is required and must be a string');
    }
    if (!registeredAt || typeof registeredAt !== 'string') {
      throw new Error('RegisteredAt is required and must be a string');
    }
    this.username = username;
    this.registered_at = registeredAt;
  }

  /**
   * Create from JSON representation
   * @param {Object} json - The JSON data
   * @returns {RegisteredBy} The registration attribution instance
   */
  static fromJSON(json) {
    return new RegisteredBy(json.username, json.registered_at);
  }

  /**
   * Convert to JSON representation
   * @returns {Object} The JSON representation
   */
  toJSON() {
    return {
      username: this.username,
      registered_at: this.registered_at
    };
  }
}

// ============================================================================
// CAP ARGUMENT SYSTEM
// ============================================================================

/**
 * Known source keys for argument sources
 */
const KNOWN_SOURCE_KEYS = ['stdin', 'position', 'cli_flag'];

/**
 * Reserved CLI flags that cannot be used
 */
const RESERVED_CLI_FLAGS = ['manifest', '--help', '--version', '-v', '-h'];

/**
 * Argument source - specifies how an argument can be provided
 */
class ArgSource {
  constructor() {
    this.stdin = null;    // string (media URN) or null
    this.position = null; // number or null
    this.cli_flag = null; // string or null
  }

  /**
   * Create an ArgSource from a JSON object
   * @param {Object} obj - The source object with one of: stdin, position, cli_flag
   * @returns {ArgSource} The ArgSource instance
   * @throws {Error} If unknown keys are present (RULE8)
   */
  static fromJSON(obj) {
    // RULE8: Reject unknown keys
    for (const key of Object.keys(obj)) {
      if (!KNOWN_SOURCE_KEYS.includes(key)) {
        throw new ValidationError('InvalidCapSchema', 'unknown',
          { issue: `Unknown source key: ${key}` });
      }
    }
    const source = new ArgSource();
    if (obj.stdin !== undefined) source.stdin = obj.stdin;
    if (obj.position !== undefined) source.position = obj.position;
    if (obj.cli_flag !== undefined) source.cli_flag = obj.cli_flag;
    return source;
  }

  /**
   * Get the type of this source
   * @returns {string|null} The source type: 'stdin', 'position', 'cli_flag', or null
   */
  getType() {
    if (this.stdin !== null) return 'stdin';
    if (this.position !== null) return 'position';
    if (this.cli_flag !== null) return 'cli_flag';
    return null;
  }

  /**
   * Convert to JSON representation
   * @returns {Object} The JSON representation
   */
  toJSON() {
    if (this.stdin !== null) return { stdin: this.stdin };
    if (this.position !== null) return { position: this.position };
    if (this.cli_flag !== null) return { cli_flag: this.cli_flag };
    return {};
  }
}

/**
 * Cap argument definition - media_urn is the unique identifier
 */
class CapArg {
  /**
   * Create a new CapArg
   * @param {string} mediaUrn - The unique media URN for this argument
   * @param {boolean} required - Whether this argument is required
   * @param {Array<ArgSource>} sources - How this argument can be provided
   * @param {Object} options - Optional fields: arg_description, default_value, metadata
   */
  constructor(mediaUrn, required, sources, options = {}) {
    this.media_urn = mediaUrn;
    this.required = required;
    this.is_sequence = options.is_sequence || false;
    this.sources = sources;  // Array of ArgSource
    this.arg_description = options.arg_description || null;
    this.default_value = options.default_value !== undefined ? options.default_value : null;
    this.metadata = options.metadata || null;
  }

  /**
   * Create a CapArg from JSON
   * @param {Object} json - The JSON representation
   * @returns {CapArg} The CapArg instance
   */
  static fromJSON(json) {
    const sources = (json.sources || []).map(s => ArgSource.fromJSON(s));
    return new CapArg(
      json.media_urn,
      json.required,
      sources,
      {
        is_sequence: json.is_sequence,
        arg_description: json.arg_description,
        default_value: json.default_value,
        metadata: json.metadata
      }
    );
  }

  /**
   * Convert to JSON representation
   * @returns {Object} The JSON representation
   */
  toJSON() {
    const result = {
      media_urn: this.media_urn,
      required: this.required,
      sources: this.sources.map(s => s.toJSON())
    };
    if (this.is_sequence) result.is_sequence = true;
    if (this.arg_description) result.arg_description = this.arg_description;
    if (this.default_value !== null && this.default_value !== undefined) {
      result.default_value = this.default_value;
    }
    if (this.metadata) result.metadata = this.metadata;
    return result;
  }

  /**
   * Check if this argument has a stdin source
   * @returns {boolean} True if has stdin source
   */
  hasStdinSource() {
    return this.sources.some(s => s.stdin !== null);
  }

  /**
   * Get the stdin media URN if present
   * @returns {string|null} The stdin media URN or null
   */
  getStdinMediaUrn() {
    const stdinSource = this.sources.find(s => s.stdin !== null);
    return stdinSource ? stdinSource.stdin : null;
  }

  /**
   * Check if this argument has a position source
   * @returns {boolean} True if has position source
   */
  hasPositionSource() {
    return this.sources.some(s => s.position !== null);
  }

  /**
   * Get the position if present
   * @returns {number|null} The position or null
   */
  getPosition() {
    const posSource = this.sources.find(s => s.position !== null);
    return posSource ? posSource.position : null;
  }

  /**
   * Check if this argument has a cli_flag source
   * @returns {boolean} True if has cli_flag source
   */
  hasCliFlagSource() {
    return this.sources.some(s => s.cli_flag !== null);
  }

  /**
   * Get the cli_flag if present
   * @returns {string|null} The cli_flag or null
   */
  getCliFlag() {
    const flagSource = this.sources.find(s => s.cli_flag !== null);
    return flagSource ? flagSource.cli_flag : null;
  }
}

/**
 * Capability definition class
 */
class Cap {
  /**
   * Create a new capability
   * @param {CapUrn} urn - The capability URN
   * @param {string} title - The human-readable title (required)
   * @param {string} command - The command string
   * @param {string|null} capDescription - Optional short plain-text description
   * @param {Object} metadata - Optional metadata object
   * @param {Object|null} metadataJson - Optional arbitrary metadata as JSON object
   * @param {string|null} documentation - Optional long-form markdown documentation. Rendered in capability info panels, the cap navigator, capdag-dot-com, and anywhere else a rich-text explanation of the cap is useful.
   */
  constructor(urn, title, command, capDescription = null, metadata = {}, metadataJson = null, documentation = null) {
    if (!(urn instanceof CapUrn)) {
      throw new Error('URN must be a CapUrn instance');
    }
    if (!title || typeof title !== 'string') {
      throw new Error('Title is required and must be a string');
    }
    if (!command || typeof command !== 'string') {
      throw new Error('Command is required and must be a string');
    }

    this.urn = urn;
    this.title = title;
    this.command = command;
    this.cap_description = capDescription;
    this.documentation = documentation;
    this.metadata = metadata || {};
    this.mediaSpecs = [];  // Media spec definitions array
    this.args = [];  // Array of CapArg - unified argument format
    this.output = null;
    this.metadata_json = metadataJson;
    this.registered_by = null;  // Registration attribution
  }

  /**
   * Get the long-form markdown documentation, if any.
   * @returns {string|null}
   */
  getDocumentation() {
    return this.documentation;
  }

  /**
   * Set the long-form markdown documentation.
   * @param {string|null} documentation
   */
  setDocumentation(documentation) {
    this.documentation = (typeof documentation === 'string' && documentation.length > 0)
      ? documentation
      : null;
  }

  /**
   * Clear the long-form markdown documentation.
   */
  clearDocumentation() {
    this.documentation = null;
  }

  /**
   * Get the media type expected for stdin (derived from args with stdin source)
   * @returns {string|null} The media URN for stdin, or null if cap doesn't accept stdin
   */
  stdinMediaType() {
    return this.getStdinMediaUrn();
  }

  /**
   * Get the stdin media URN from args
   * @returns {string|null} The stdin media URN or null if no arg accepts stdin
   */
  getStdinMediaUrn() {
    for (const arg of this.args) {
      const stdinUrn = arg.getStdinMediaUrn();
      if (stdinUrn) return stdinUrn;
    }
    return null;
  }

  /**
   * Check if this cap accepts stdin input
   * @returns {boolean} True if any arg has a stdin source
   */
  acceptsStdin() {
    return this.getStdinMediaUrn() !== null;
  }

  /**
   * Resolve a media URN to a MediaSpec using this cap's mediaSpecs table
   * @param {string} mediaUrn - The media URN (e.g., "media:string")
   * @returns {MediaSpec} The resolved MediaSpec
   * @throws {MediaSpecError} If media URN cannot be resolved
   */
  resolveMediaUrn(mediaUrn) {
    return resolveMediaUrn(mediaUrn, this.mediaSpecs);
  }

  /**
   * Get the URN as a string
   * @returns {string} The URN string representation
   */
  urnString() {
    return this.urn.toString();
  }

  /**
   * Check if this capability accepts a request string
   * @param {string} request - The request string
   * @returns {boolean} Whether this capability accepts the request
   */
  acceptsRequest(request) {
    const requestUrn = CapUrn.fromString(request);
    return this.urn.accepts(requestUrn);
  }

  /**
   * Check if this capability is more specific than another
   * @param {Cap} other - The other capability
   * @returns {boolean} Whether this capability is more specific
   */
  isMoreSpecificThan(other) {
    if (!other) return true;
    return this.urn.isMoreSpecificThan(other.urn);
  }

  /**
   * Get metadata value by key
   * @param {string} key - The metadata key
   * @returns {string|undefined} The metadata value
   */
  getMetadata(key) {
    return this.metadata[key];
  }

  /**
   * Set metadata value
   * @param {string} key - The metadata key
   * @param {string} value - The metadata value
   */
  setMetadata(key, value) {
    this.metadata[key] = value;
  }

  /**
   * Remove metadata value
   * @param {string} key - The metadata key to remove
   * @returns {boolean} Whether the key existed
   */
  removeMetadata(key) {
    const existed = this.metadata.hasOwnProperty(key);
    delete this.metadata[key];
    return existed;
  }

  /**
   * Check if this capability has specific metadata
   * @param {string} key - The metadata key
   * @returns {boolean} Whether the metadata exists
   */
  hasMetadata(key) {
    return this.metadata.hasOwnProperty(key);
  }

  /**
   * Add an argument
   * @param {CapArg} arg - The argument to add
   */
  addArg(arg) {
    this.args.push(arg);
  }

  /**
   * Get all required arguments
   * @returns {Array<CapArg>} Required arguments
   */
  getRequiredArgs() {
    return this.args.filter(arg => arg.required);
  }

  /**
   * Get all optional arguments
   * @returns {Array<CapArg>} Optional arguments
   */
  getOptionalArgs() {
    return this.args.filter(arg => !arg.required);
  }

  /**
   * Find argument by media_urn
   * @param {string} mediaUrn - The media URN to search for
   * @returns {CapArg|null} The argument or null
   */
  findArgByMediaUrn(mediaUrn) {
    return this.args.find(arg => arg.media_urn === mediaUrn) || null;
  }

  /**
   * Set the output definition
   * @param {Object} output - The output definition
   */
  setOutput(output) {
    this.output = output;
  }

  /**
   * Get metadata JSON
   * @returns {Object|null} The metadata JSON
   */
  getMetadataJSON() {
    return this.metadata_json;
  }

  /**
   * Set metadata JSON
   * @param {Object} metadata - The metadata JSON object
   */
  setMetadataJSON(metadata) {
    this.metadata_json = metadata;
  }

  /**
   * Clear metadata JSON
   */
  clearMetadataJSON() {
    this.metadata_json = null;
  }

  /**
   * Check if this capability equals another
   * Compares all fields to match Rust reference implementation
   * @param {Cap} other - The other capability
   * @returns {boolean} Whether the capabilities are equal
   */
  equals(other) {
    if (!other || !(other instanceof Cap)) {
      return false;
    }

    return this.urn.equals(other.urn) &&
           this.title === other.title &&
           this.command === other.command &&
           this.cap_description === other.cap_description &&
           this.documentation === other.documentation &&
           JSON.stringify(this.metadata) === JSON.stringify(other.metadata) &&
           JSON.stringify(this.mediaSpecs) === JSON.stringify(other.mediaSpecs) &&
           JSON.stringify(this.args.map(a => a.toJSON())) === JSON.stringify(other.args.map(a => a.toJSON())) &&
           JSON.stringify(this.output) === JSON.stringify(other.output) &&
           JSON.stringify(this.metadata_json) === JSON.stringify(other.metadata_json) &&
           JSON.stringify(this.registered_by) === JSON.stringify(other.registered_by);
  }

  /**
   * Convert to JSON representation
   * @returns {Object} JSON representation
   */
  toJSON() {
    const result = {
      urn: this.urn.toString(),
      title: this.title,
      command: this.command,
      cap_description: this.cap_description,
      metadata: this.metadata,
      media_specs: this.mediaSpecs,
      args: this.args.map(a => a.toJSON()),
      output: this.output
    };

    // Long-form markdown documentation. Only emitted when set, to match
    // the Rust serializer which skips this field when None.
    if (typeof this.documentation === 'string' && this.documentation.length > 0) {
      result.documentation = this.documentation;
    }

    if (this.metadata_json !== null && this.metadata_json !== undefined) {
      result.metadata_json = this.metadata_json;
    }

    return result;
  }

  /**
   * Create a capability from JSON representation
   * @param {Object} json - The JSON data
   * @returns {Cap} The capability instance
   */
  static fromJSON(json) {
    // URN must be a string in canonical format
    if (typeof json.urn !== 'string') {
      throw new Error("URN must be a string in canonical format (e.g., 'cap:in=\"media:...\";op=...;out=\"media:...\"')");
    }
    const urn = CapUrn.fromString(json.urn);

    const documentation = (typeof json.documentation === 'string' && json.documentation.length > 0)
      ? json.documentation
      : null;
    const cap = new Cap(urn, json.title, json.command, json.cap_description, json.metadata, json.metadata_json, documentation);
    cap.mediaSpecs = json.media_specs || json.mediaSpecs || [];
    // Parse args (new format)
    if (json.args && Array.isArray(json.args)) {
      cap.args = json.args.map(a => CapArg.fromJSON(a));
    } else {
      cap.args = [];
    }
    cap.output = json.output;
    cap.registered_by = json.registered_by ? RegisteredBy.fromJSON(json.registered_by) : null;
    return cap;
  }

  /**
   * Get the registration attribution
   * @returns {RegisteredBy|null} The registration attribution or null
   */
  getRegisteredBy() {
    return this.registered_by;
  }

  /**
   * Set the registration attribution
   * @param {RegisteredBy} registeredBy - The registration attribution
   */
  setRegisteredBy(registeredBy) {
    this.registered_by = registeredBy;
  }

  /**
   * Clear the registration attribution
   */
  clearRegisteredBy() {
    this.registered_by = null;
  }
}

/**
 * Helper functions for creating capabilities
 */
function createCap(urn, title, command) {
  return new Cap(urn, title, command);
}

function createCapWithDescription(urn, title, command, description) {
  return new Cap(urn, title, command, description);
}

function createCapWithMetadata(urn, title, command, metadata) {
  return new Cap(urn, title, command, null, metadata);
}

function createCapWithDescriptionAndMetadata(urn, title, command, description, metadata) {
  return new Cap(urn, title, command, description, metadata);
}

// ============================================================================
// VALIDATION SYSTEM
// ============================================================================

/**
 * Validation error types with descriptive failure information
 */
class ValidationError extends Error {
  constructor(type, capUrn, details = {}) {
    const message = ValidationError.formatMessage(type, capUrn, details);
    super(message);
    this.name = 'ValidationError';
    this.type = type;
    this.capUrn = capUrn;
    this.details = details;
  }

  static formatMessage(type, capUrn, details) {
    switch (type) {
      case 'UnknownCap':
        return `Unknown cap '${capUrn}' - cap not registered or advertised`;
      case 'MissingRequiredArgument':
        return `Cap '${capUrn}' requires argument '${details.argumentName}' but it was not provided`;
      case 'UnknownArgument':
        return `Cap '${capUrn}' does not accept argument '${details.argumentName}' - check capability definition for valid arguments`;
      case 'InvalidArgumentType':
        if (details.expectedMediaSpec) {
          const errors = details.schemaErrors ? details.schemaErrors.join(', ') : 'validation failed';
          return `Cap '${capUrn}' argument '${details.argumentName}' expects media_spec '${details.expectedMediaSpec}' but ${errors} for value: ${JSON.stringify(details.actualValue)}`;
        }
        return `Cap '${capUrn}' argument '${details.argumentName}' expects type '${details.expectedType}' but received '${details.actualType}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'MediaValidationFailed':
        return `Cap '${capUrn}' argument '${details.argumentName}' failed validation rule '${details.validationRule}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'MediaSpecValidationFailed':
        return `Cap '${capUrn}' argument '${details.argumentName}' failed media spec '${details.mediaUrn}' validation rule '${details.validationRule}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'InvalidOutputType':
        if (details.expectedMediaSpec) {
          const errors = details.schemaErrors ? details.schemaErrors.join(', ') : 'validation failed';
          return `Cap '${capUrn}' output expects media_spec '${details.expectedMediaSpec}' but ${errors} for value: ${JSON.stringify(details.actualValue)}`;
        }
        return `Cap '${capUrn}' output expects type '${details.expectedType}' but received '${details.actualType}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'OutputValidationFailed':
        return `Cap '${capUrn}' output failed validation rule '${details.validationRule}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'OutputMediaSpecValidationFailed':
        return `Cap '${capUrn}' output failed media spec '${details.mediaUrn}' validation rule '${details.validationRule}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'InvalidCapSchema':
        return `Cap '${capUrn}' has invalid schema: ${details.issue}`;
      case 'TooManyArguments':
        return `Cap '${capUrn}' expects at most ${details.maxExpected} arguments but received ${details.actualCount}`;
      case 'JsonParseError':
        return `Cap '${capUrn}' JSON parsing failed: ${details.error}`;
      case 'SchemaValidationFailed':
        return `Cap '${capUrn}' schema validation failed for '${details.fieldName}': ${details.schemaErrors}`;
      default:
        return `Cap validation error: ${type}`;
    }
  }
}

/**
 * Validate cap args against the 12 validation rules
 * @param {Cap} cap - The capability to validate
 * @throws {ValidationError} If any validation rule is violated
 */
function validateCapArgs(cap) {
  const capUrn = cap.urnString();
  const args = cap.args;

  // RULE1: No duplicate media_urns (using string comparison for now)
  const mediaUrns = new Set();
  for (const arg of args) {
    if (mediaUrns.has(arg.media_urn)) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `RULE1: Duplicate media_urn '${arg.media_urn}'`
      });
    }
    mediaUrns.add(arg.media_urn);
  }

  // RULE2: sources must not be null or empty
  for (const arg of args) {
    if (!arg.sources || arg.sources.length === 0) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `RULE2: Argument '${arg.media_urn}' has empty sources`
      });
    }
  }

  // Collect stdin URNs, positions, and cli_flags for cross-arg validation
  const stdinUrns = [];
  const positions = [];
  const cliFlags = [];

  for (const arg of args) {
    const sourceTypes = new Set();
    let hasPosition = false;
    let hasCliFlag = false;

    for (const source of arg.sources) {
      const sourceType = source.getType();

      // RULE4: No arg may specify same source type more than once
      if (sourceTypes.has(sourceType)) {
        throw new ValidationError('InvalidCapSchema', capUrn, {
          issue: `RULE4: Argument '${arg.media_urn}' has duplicate source type '${sourceType}'`
        });
      }
      sourceTypes.add(sourceType);

      if (source.stdin !== null) {
        stdinUrns.push(source.stdin);
      }
      if (source.position !== null) {
        hasPosition = true;
        positions.push({ position: source.position, mediaUrn: arg.media_urn });
      }
      if (source.cli_flag !== null) {
        hasCliFlag = true;
        cliFlags.push({ flag: source.cli_flag, mediaUrn: arg.media_urn });

        // RULE10: Reserved cli_flags
        if (RESERVED_CLI_FLAGS.includes(source.cli_flag)) {
          throw new ValidationError('InvalidCapSchema', capUrn, {
            issue: `RULE10: Argument '${arg.media_urn}' uses reserved cli_flag '${source.cli_flag}'`
          });
        }
      }
    }

    // RULE7: No arg may have both position and cli_flag
    if (hasPosition && hasCliFlag) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `RULE7: Argument '${arg.media_urn}' has both position and cli_flag sources`
      });
    }
  }

  // RULE3: If multiple args have stdin source, stdin media_urns must be identical
  if (stdinUrns.length > 1) {
    const firstStdin = stdinUrns[0];
    for (let i = 1; i < stdinUrns.length; i++) {
      if (stdinUrns[i] !== firstStdin) {
        throw new ValidationError('InvalidCapSchema', capUrn, {
          issue: `RULE3: Multiple args have different stdin media_urns: '${firstStdin}' vs '${stdinUrns[i]}'`
        });
      }
    }
  }

  // RULE5: No two args may have same position
  const positionSet = new Set();
  for (const { position, mediaUrn } of positions) {
    if (positionSet.has(position)) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `RULE5: Duplicate position ${position} in argument '${mediaUrn}'`
      });
    }
    positionSet.add(position);
  }

  // RULE6: Positions must be sequential (0-based, no gaps when aggregated)
  if (positions.length > 0) {
    const sortedPositions = [...positions].sort((a, b) => a.position - b.position);
    for (let i = 0; i < sortedPositions.length; i++) {
      if (sortedPositions[i].position !== i) {
        throw new ValidationError('InvalidCapSchema', capUrn, {
          issue: `RULE6: Position gap - expected ${i} but found ${sortedPositions[i].position}`
        });
      }
    }
  }

  // RULE9: No two args may have same cli_flag
  const flagSet = new Set();
  for (const { flag, mediaUrn } of cliFlags) {
    if (flagSet.has(flag)) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `RULE9: Duplicate cli_flag '${flag}' in argument '${mediaUrn}'`
      });
    }
    flagSet.add(flag);
  }

  // RULE8: No unknown keys in source objects - this is handled in ArgSource.fromJSON()
  // RULE11: cli_flag used verbatim as specified - enforced by design
  // RULE12: media_urn is the key, no name field - enforced by CapArg structure
}

/**
 * Input argument validator
 */
class InputValidator {
  /**
   * Validate positional arguments against cap input schema
   */
  static validatePositionalArguments(cap, argValues) {
    const capUrn = cap.urnString();
    const args = cap.arguments;

    // Check if too many arguments provided
    const maxArgs = args.required.length + args.optional.length;
    if (argValues.length > maxArgs) {
      throw new ValidationError('TooManyArguments', capUrn, {
        maxExpected: maxArgs,
        actualCount: argValues.length
      });
    }

    // Validate required arguments
    for (let i = 0; i < args.required.length; i++) {
      if (i >= argValues.length) {
        throw new ValidationError('MissingRequiredArgument', capUrn, {
          argumentName: args.required[i].name
        });
      }

      InputValidator.validateSingleArgument(cap, args.required[i], argValues[i]);
    }

    // Validate optional arguments if provided
    const requiredCount = args.required.length;
    for (let i = 0; i < args.optional.length; i++) {
      const argIndex = requiredCount + i;
      if (argIndex < argValues.length) {
        InputValidator.validateSingleArgument(cap, args.optional[i], argValues[argIndex]);
      }
    }
  }

  /**
   * Validate named arguments against cap input schema
   */
  static validateNamedArguments(cap, namedArgs) {
    const capUrn = cap.urnString();
    const args = cap.arguments;

    // Extract named argument values into a map
    const providedArgs = new Map();
    for (const arg of namedArgs) {
      if (typeof arg === 'object' && arg.name && arg.hasOwnProperty('value')) {
        providedArgs.set(arg.name, arg.value);
      }
    }

    // Check that all required arguments are provided as named arguments
    for (const reqArg of args.required) {
      if (!providedArgs.has(reqArg.name)) {
        throw new ValidationError('MissingRequiredArgument', capUrn, {
          argumentName: `${reqArg.name} (expected as named argument)`
        });
      }

      // Validate the provided argument value
      const providedValue = providedArgs.get(reqArg.name);
      InputValidator.validateSingleArgument(cap, reqArg, providedValue);
    }

    // Validate optional arguments if provided
    for (const optArg of args.optional) {
      if (providedArgs.has(optArg.name)) {
        const providedValue = providedArgs.get(optArg.name);
        InputValidator.validateSingleArgument(cap, optArg, providedValue);
      }
    }

    // Check for unknown arguments
    const knownArgNames = new Set([
      ...args.required.map(arg => arg.name),
      ...args.optional.map(arg => arg.name)
    ]);

    for (const providedName of providedArgs.keys()) {
      if (!knownArgNames.has(providedName)) {
        throw new ValidationError('UnknownArgument', capUrn, {
          argumentName: providedName
        });
      }
    }
  }

  /**
   * Validate a single argument against its definition
   * Two-pass validation:
   * 1. Type validation + media spec validation rules (inherent to semantic type)
   */
  static validateSingleArgument(cap, argDef, value) {
    // Type validation - returns the resolved MediaSpec
    const mediaSpec = InputValidator.validateArgumentType(cap, argDef, value);

    // Media spec validation rules (inherent to the semantic type)
    if (mediaSpec && mediaSpec.validation) {
      InputValidator.validateMediaSpecRules(cap, argDef, mediaSpec, value);
    }
  }

  /**
   * Validate argument type using MediaSpec
   * Resolves spec ID to MediaSpec before validation
   * @returns {MediaSpec|null} The resolved MediaSpec
   */
  static validateArgumentType(cap, argDef, value) {
    const capUrn = cap.urnString();

    // Get mediaUrn field (now contains a media URN)
    const mediaUrn = argDef.mediaUrn || argDef.media_urn;
    if (!mediaUrn) {
      // No media_urn - skip validation
      return null;
    }

    // Resolve media URN to MediaSpec - FAIL HARD if unresolvable
    let mediaSpec;
    try {
      mediaSpec = cap.resolveMediaUrn(mediaUrn);
    } catch (e) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `Cannot resolve media URN '${mediaUrn}' for argument '${argDef.name}': ${e.message}`
      });
    }

    // For binary media types, expect base64-encoded string
    if (mediaSpec.isBinary()) {
      if (typeof value !== 'string') {
        throw new ValidationError('InvalidArgumentType', capUrn, {
          argumentName: argDef.name,
          expectedMediaSpec: mediaUrn,
          actualValue: value,
          schemaErrors: ['Expected base64-encoded string for binary type']
        });
      }
      return mediaSpec;
    }

    // If the resolved media spec has a local schema, validate against it
    if (mediaSpec.schema) {
      // TODO: Full JSON Schema validation would require a JSON Schema library
      // For now, skip local schema validation
    }

    // For types with profile, validate against profile
    if (mediaSpec.profile) {
      const valid = InputValidator.validateAgainstProfile(mediaSpec.profile, value);
      if (!valid) {
        throw new ValidationError('InvalidArgumentType', capUrn, {
          argumentName: argDef.name,
          expectedMediaSpec: mediaUrn,
          actualValue: value,
          schemaErrors: [`Value does not match profile schema`]
        });
      }
    }

    return mediaSpec;
  }

  /**
   * Validate value against media spec's inherent validation rules (first pass)
   * @param {Cap} cap - The capability
   * @param {Object} argDef - The argument definition
   * @param {MediaSpec} mediaSpec - The resolved media spec
   * @param {*} value - The value to validate
   */
  static validateMediaSpecRules(cap, argDef, mediaSpec, value) {
    const capUrn = cap.urnString();
    const validation = mediaSpec.validation;
    const mediaUrn = mediaSpec.mediaUrn;

    // Min/max validation for numbers
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        throw new ValidationError('MediaSpecValidationFailed', capUrn, {
          argumentName: argDef.name,
          mediaUrn: mediaUrn,
          validationRule: `min value ${validation.min}`,
          actualValue: value
        });
      }
      if (validation.max !== undefined && value > validation.max) {
        throw new ValidationError('MediaSpecValidationFailed', capUrn, {
          argumentName: argDef.name,
          mediaUrn: mediaUrn,
          validationRule: `max value ${validation.max}`,
          actualValue: value
        });
      }
    }

    // Length validation for strings and arrays
    if (typeof value === 'string' || Array.isArray(value)) {
      const length = value.length;
      if (validation.min_length !== undefined && length < validation.min_length) {
        throw new ValidationError('MediaSpecValidationFailed', capUrn, {
          argumentName: argDef.name,
          mediaUrn: mediaUrn,
          validationRule: `min length ${validation.min_length}`,
          actualValue: value
        });
      }
      if (validation.max_length !== undefined && length > validation.max_length) {
        throw new ValidationError('MediaSpecValidationFailed', capUrn, {
          argumentName: argDef.name,
          mediaUrn: mediaUrn,
          validationRule: `max length ${validation.max_length}`,
          actualValue: value
        });
      }
    }

    // Pattern validation for strings
    if (typeof value === 'string' && validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        throw new ValidationError('MediaSpecValidationFailed', capUrn, {
          argumentName: argDef.name,
          mediaUrn: mediaUrn,
          validationRule: `pattern ${validation.pattern}`,
          actualValue: value
        });
      }
    }

    // Allowed values validation
    if (validation.allowed_values && Array.isArray(validation.allowed_values)) {
      if (!validation.allowed_values.includes(value)) {
        throw new ValidationError('MediaSpecValidationFailed', capUrn, {
          argumentName: argDef.name,
          mediaUrn: mediaUrn,
          validationRule: `allowed values [${validation.allowed_values.join(', ')}]`,
          actualValue: value
        });
      }
    }
  }

  /**
   * Basic validation against common profile schemas
   * @param {string} profile - Profile URL
   * @param {*} value - Value to validate
   * @returns {boolean} True if valid
   */
  static validateAgainstProfile(profile, value) {
    // Match against standard capdag.com schemas (both /schema/ and /schemas/ for compatibility)
    if (profile.includes('/schema/str') || profile.includes('/schemas/str')) {
      return typeof value === 'string';
    }
    if (profile.includes('/schema/int') || profile.includes('/schemas/int')) {
      return Number.isInteger(value);
    }
    if (profile.includes('/schema/num') || profile.includes('/schemas/num')) {
      return typeof value === 'number' && !isNaN(value);
    }
    if (profile.includes('/schema/bool') || profile.includes('/schemas/bool')) {
      return typeof value === 'boolean';
    }
    if (profile.includes('/schema/obj') || profile.includes('/schemas/obj')) {
      // Check obj before obj-array
      if (profile.includes('-array')) {
        return Array.isArray(value) && value.every(v => typeof v === 'object' && v !== null && !Array.isArray(v));
      }
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
    if (profile.includes('/schema/str-array') || profile.includes('/schemas/str-array')) {
      return Array.isArray(value) && value.every(v => typeof v === 'string');
    }
    if (profile.includes('/schema/int-array') || profile.includes('/schemas/int-array')) {
      return Array.isArray(value) && value.every(v => Number.isInteger(v));
    }
    if (profile.includes('/schema/num-array') || profile.includes('/schemas/num-array')) {
      return Array.isArray(value) && value.every(v => typeof v === 'number');
    }
    if (profile.includes('/schema/bool-array') || profile.includes('/schemas/bool-array')) {
      return Array.isArray(value) && value.every(v => typeof v === 'boolean');
    }

    // Unknown profile - allow any JSON value
    return true;
  }

  /**
   * Get JSON type name for a value
   */
  static getJsonTypeName(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (Number.isInteger(value)) return 'integer';
    return typeof value;
  }
}

/**
 * Output validator
 */
class OutputValidator {
  /**
   * Validate output against cap output schema using MediaSpec
   * Resolves spec ID to MediaSpec before validation
   */
  static validateOutput(cap, output) {
    const capUrn = cap.urnString();
    const outputDef = cap.output;

    if (!outputDef) return; // No output definition to validate against

    // Type validation - returns the resolved MediaSpec
    const mediaSpec = OutputValidator.validateOutputType(cap, outputDef, output);

    // Media spec validation rules (inherent to the semantic type)
    if (mediaSpec && mediaSpec.validation) {
      OutputValidator.validateOutputMediaSpecRules(cap, mediaSpec, output);
    }
  }

  /**
   * Validate output type using MediaSpec
   * @returns {MediaSpec|null} The resolved MediaSpec
   */
  static validateOutputType(cap, outputDef, value) {
    const capUrn = cap.urnString();

    // Get mediaUrn field (now contains a media URN)
    const mediaUrn = outputDef.mediaUrn || outputDef.media_urn;
    if (!mediaUrn) {
      // No media_urn - skip validation
      return null;
    }

    // Resolve media URN to MediaSpec - FAIL HARD if unresolvable
    let mediaSpec;
    try {
      mediaSpec = cap.resolveMediaUrn(mediaUrn);
    } catch (e) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `Cannot resolve media URN '${mediaUrn}' for output: ${e.message}`
      });
    }

    // For binary media types, expect base64-encoded string
    if (mediaSpec.isBinary()) {
      if (typeof value !== 'string') {
        throw new ValidationError('InvalidOutputType', capUrn, {
          expectedMediaSpec: mediaUrn,
          actualValue: value,
          schemaErrors: ['Expected base64-encoded string for binary type']
        });
      }
      return mediaSpec;
    }

    // If the resolved media spec has a local schema, validate against it
    if (mediaSpec.schema) {
      // TODO: Full JSON Schema validation would require a JSON Schema library
      // For now, skip local schema validation
    }

    // For types with profile, validate against profile
    if (mediaSpec.profile) {
      const valid = InputValidator.validateAgainstProfile(mediaSpec.profile, value);
      if (!valid) {
        throw new ValidationError('InvalidOutputType', capUrn, {
          expectedMediaSpec: mediaUrn,
          actualValue: value,
          schemaErrors: [`Value does not match profile schema`]
        });
      }
    }

    return mediaSpec;
  }

  /**
   * Validate output against media spec's inherent validation rules (first pass)
   */
  static validateOutputMediaSpecRules(cap, mediaSpec, value) {
    const capUrn = cap.urnString();
    const validation = mediaSpec.validation;
    const mediaUrn = mediaSpec.mediaUrn;

    // Min/max validation for numbers
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        throw new ValidationError('OutputMediaSpecValidationFailed', capUrn, {
          mediaUrn: mediaUrn,
          validationRule: `min value ${validation.min}`,
          actualValue: value
        });
      }
      if (validation.max !== undefined && value > validation.max) {
        throw new ValidationError('OutputMediaSpecValidationFailed', capUrn, {
          mediaUrn: mediaUrn,
          validationRule: `max value ${validation.max}`,
          actualValue: value
        });
      }
    }

    // Length validation for strings
    if (typeof value === 'string') {
      if (validation.min_length !== undefined && value.length < validation.min_length) {
        throw new ValidationError('OutputMediaSpecValidationFailed', capUrn, {
          mediaUrn: mediaUrn,
          validationRule: `min length ${validation.min_length}`,
          actualValue: value
        });
      }
      if (validation.max_length !== undefined && value.length > validation.max_length) {
        throw new ValidationError('OutputMediaSpecValidationFailed', capUrn, {
          mediaUrn: mediaUrn,
          validationRule: `max length ${validation.max_length}`,
          actualValue: value
        });
      }
    }

    // Pattern validation for strings
    if (typeof value === 'string' && validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        throw new ValidationError('OutputMediaSpecValidationFailed', capUrn, {
          mediaUrn: mediaUrn,
          validationRule: `pattern ${validation.pattern}`,
          actualValue: value
        });
      }
    }

    // Allowed values validation
    if (validation.allowed_values && Array.isArray(validation.allowed_values)) {
      if (!validation.allowed_values.includes(value)) {
        throw new ValidationError('OutputMediaSpecValidationFailed', capUrn, {
          mediaUrn: mediaUrn,
          validationRule: `allowed values [${validation.allowed_values.join(', ')}]`,
          actualValue: value
        });
      }
    }
  }
}

/**
 * Cap validator
 */
class CapValidator {
  /**
   * Validate cap schema
   */
  static validateCap(cap) {
    const capUrn = cap.urnString();

    // Validate basic cap structure
    if (!cap.title || typeof cap.title !== 'string') {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: 'Cap must have a valid title'
      });
    }

    if (!cap.command || typeof cap.command !== 'string') {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: 'Cap must have a valid command'
      });
    }

    // Validate arguments structure
    if (cap.arguments) {
      if (cap.arguments.required && !Array.isArray(cap.arguments.required)) {
        throw new ValidationError('InvalidCapSchema', capUrn, {
          issue: 'Required arguments must be an array'
        });
      }

      if (cap.arguments.optional && !Array.isArray(cap.arguments.optional)) {
        throw new ValidationError('InvalidCapSchema', capUrn, {
          issue: 'Optional arguments must be an array'
        });
      }
    }

    // Validate output structure
    if (cap.output && typeof cap.output !== 'object') {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: 'Cap output must be an object'
      });
    }
  }
}

// ============================================================================
// CAP ARGUMENT VALUE - Unified argument type
// ============================================================================

/**
 * Unified argument type - arguments are identified by media_urn.
 * The cap definition's sources specify how to extract values (stdin, position, cli_flag).
 */
class CapArgumentValue {
  /**
   * Create a new CapArgumentValue
   * @param {string} mediaUrn - Semantic identifier, e.g., "media:model-spec;textable"
   * @param {Uint8Array|Buffer} value - Value bytes (UTF-8 for text, raw for binary)
   */
  constructor(mediaUrn, value) {
    this.mediaUrn = mediaUrn;
    this.value = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  }

  /**
   * Create a new CapArgumentValue from a string value
   * @param {string} mediaUrn - Semantic identifier
   * @param {string} value - String value (will be converted to UTF-8 bytes)
   * @returns {CapArgumentValue}
   */
  static fromStr(mediaUrn, value) {
    const encoder = new TextEncoder();
    return new CapArgumentValue(mediaUrn, encoder.encode(value));
  }

  /**
   * Get the value as a UTF-8 string
   * @returns {string} The value decoded as UTF-8
   */
  valueAsStr() {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(this.value);
  }
}

// ============================================================================
// CAP MATRIX - Registry for Capability Hosts
// ============================================================================

/**
 * Error types for capability host registry operations
 */
class CapMatrixError extends Error {
  constructor(type, message) {
    super(message);
    this.name = 'CapMatrixError';
    this.type = type;
  }

  static noSetsFound(capability) {
    return new CapMatrixError('NoSetsFound', `No cap sets found for capability: ${capability}`);
  }

  static invalidUrn(urn, reason) {
    return new CapMatrixError('InvalidUrn', `Invalid capability URN: ${urn}: ${reason}`);
  }

  static registryError(message) {
    return new CapMatrixError('RegistryError', message);
  }
}

/**
 * Internal entry for a registered capability host
 */
class CapSetEntry {
  constructor(name, host, capabilities) {
    this.name = name;
    this.host = host;          // Object implementing executeCap(capUrn, arguments) -> Promise
    this.capabilities = capabilities;  // Array<Cap>
  }
}

/**
 * Unified registry for cap sets (providers and cartridges)
 * Provides capability host discovery using subset matching.
 */
class CapMatrix {
  constructor() {
    this.sets = new Map();  // Map<string, CapSetEntry>
  }

  /**
   * Register a capability host with its supported capabilities
   * @param {string} name - Unique name for the capability host
   * @param {object} host - Object with executeCap method
   * @param {Cap[]} capabilities - Array of capabilities this host supports
   */
  registerCapSet(name, host, capabilities) {
    const entry = new CapSetEntry(name, host, capabilities);
    this.sets.set(name, entry);
  }

  /**
   * Find cap sets that can handle the requested capability
   * Uses subset matching: host capabilities must be a subset of or match the request
   * @param {string} requestUrn - The capability URN to find sets for
   * @returns {object[]} Array of hosts that can handle the request
   * @throws {CapMatrixError} If URN is invalid or no sets found
   */
  findCapSets(requestUrn) {
    let request;
    try {
      request = CapUrn.fromString(requestUrn);
    } catch (e) {
      throw CapMatrixError.invalidUrn(requestUrn, e.message);
    }

    const matchingHosts = [];

    for (const entry of this.sets.values()) {
      for (const cap of entry.capabilities) {
        if (cap.urn.accepts(request)) {
          matchingHosts.push(entry.host);
          break;  // Found a matching capability for this host
        }
      }
    }

    if (matchingHosts.length === 0) {
      throw CapMatrixError.noSetsFound(requestUrn);
    }

    return matchingHosts;
  }

  /**
   * Find the best capability host for the request using specificity ranking
   * @param {string} requestUrn - The capability URN to find the best host for
   * @returns {{host: object, cap: Cap}} The best host and matching cap definition
   * @throws {CapMatrixError} If URN is invalid or no sets found
   */
  findBestCapSet(requestUrn) {
    let request;
    try {
      request = CapUrn.fromString(requestUrn);
    } catch (e) {
      throw CapMatrixError.invalidUrn(requestUrn, e.message);
    }

    let bestHost = null;
    let bestCap = null;
    let bestSpecificity = -1;

    for (const entry of this.sets.values()) {
      for (const cap of entry.capabilities) {
        if (cap.urn.accepts(request)) {
          const specificity = cap.urn.specificity();
          if (bestSpecificity === -1 || specificity > bestSpecificity) {
            bestHost = entry.host;
            bestCap = cap;
            bestSpecificity = specificity;
          }
          break;  // Found match for this entry, check next
        }
      }
    }

    if (bestHost === null) {
      throw CapMatrixError.noSetsFound(requestUrn);
    }

    return { host: bestHost, cap: bestCap };
  }

  /**
   * Get all registered capability host names
   * @returns {string[]} Array of host names
   */
  getHostNames() {
    return Array.from(this.sets.keys());
  }

  /**
   * Get all capabilities from all registered sets
   * @returns {Cap[]} Array of all capabilities
   */
  getAllCapabilities() {
    const capabilities = [];
    for (const entry of this.sets.values()) {
      capabilities.push(...entry.capabilities);
    }
    return capabilities;
  }

  /**
   * Check if any host accepts the specified capability request
   * @param {string} requestUrn - The capability URN to check
   * @returns {boolean} Whether the capability request is accepted
   */
  acceptsRequest(requestUrn) {
    try {
      this.findCapSets(requestUrn);
      return true;
    } catch (e) {
      if (e instanceof CapMatrixError) {
        return false;
      }
      throw e;
    }
  }

  /**
   * Unregister a capability host
   * @param {string} name - The name of the host to unregister
   * @returns {boolean} Whether the host was found and removed
   */
  unregisterCapSet(name) {
    return this.sets.delete(name);
  }

  /**
   * Clear all registered sets
   */
  clear() {
    this.sets.clear();
  }
}

// ============================================================================
// CAP BLOCK - Composite Registry
// ============================================================================

/**
 * Result of finding the best match across registries
 */
class BestCapSetMatch {
  /**
   * @param {Cap} cap - The Cap definition that matched
   * @param {number} specificity - The specificity score of the match
   * @param {string} registryName - The name of the registry that provided this match
   */
  constructor(cap, specificity, registryName) {
    this.cap = cap;
    this.specificity = specificity;
    this.registryName = registryName;
  }
}

/**
 * Composite CapSet that wraps multiple registries
 * and delegates execution to the best matching one.
 */
class CompositeCapSet {
  /**
   * @param {Array<{name: string, registry: CapMatrix}>} registries
   */
  constructor(registries) {
    this.registries = registries;
  }

  /**
   * Execute a capability by finding the best match and delegating
   * @param {string} capUrn - The capability URN to execute
   * @param {CapArgumentValue[]} args - Arguments identified by media_urn
   * @returns {Promise<{binaryOutput: Uint8Array|null, textOutput: string|null}>}
   */
  async executeCap(capUrn, args) {
    let request;
    try {
      request = CapUrn.fromString(capUrn);
    } catch (e) {
      throw new Error(`Invalid cap URN '${capUrn}': ${e.message}`);
    }

    // Find the best matching host across all registries
    let bestHost = null;
    let bestSpecificity = -1;

    for (const { registry } of this.registries) {
      for (const entry of registry.sets.values()) {
        for (const cap of entry.capabilities) {
          if (cap.urn.accepts(request)) {
            const specificity = cap.urn.specificity();
            if (bestSpecificity === -1 || specificity > bestSpecificity) {
              bestHost = entry.host;
              bestSpecificity = specificity;
            }
            break;  // Found match for this entry
          }
        }
      }
    }

    if (bestHost === null) {
      throw new Error(`No capability host found for '${capUrn}'`);
    }

    // Delegate execution to the best matching host
    return bestHost.executeCap(capUrn, args);
  }

  /**
   * Build a directed graph from all capabilities in the registries.
   * @returns {CapGraph}
   */
  graph() {
    return CapGraph.buildFromRegistries(this.registries);
  }
}

/**
 * Composite registry that wraps multiple CapMatrix instances
 * and finds the best match across all of them by specificity.
 *
 * When multiple registries can handle a request, this registry compares
 * specificity scores and returns the most specific match.
 * On tie, defaults to the first registry that was added (priority order).
 */
class CapBlock {
  constructor() {
    this.registries = [];  // Array of {name: string, registry: CapMatrix}
  }

  /**
   * Add a child registry with a name.
   * Registries are checked in order of addition for tie-breaking.
   * @param {string} name - Unique name for this registry
   * @param {CapMatrix} registry - The CapMatrix to add
   */
  addRegistry(name, registry) {
    this.registries.push({ name, registry });
  }

  /**
   * Remove a child registry by name
   * @param {string} name - The name of the registry to remove
   * @returns {CapMatrix|null} The removed registry, or null if not found
   */
  removeRegistry(name) {
    const index = this.registries.findIndex(entry => entry.name === name);
    if (index !== -1) {
      const removed = this.registries[index].registry;
      this.registries.splice(index, 1);
      return removed;
    }
    return null;
  }

  /**
   * Get a child registry by name
   * @param {string} name - The name of the registry
   * @returns {CapMatrix|null} The registry, or null if not found
   */
  getRegistry(name) {
    const entry = this.registries.find(e => e.name === name);
    return entry ? entry.registry : null;
  }

  /**
   * Get names of all child registries
   * @returns {string[]} Array of registry names in priority order
   */
  getRegistryNames() {
    return this.registries.map(entry => entry.name);
  }

  /**
   * Check if a capability is available and return execution info.
   * This is the main entry point for capability lookup.
   * @param {string} capUrn - The capability URN to look up
   * @returns {{cap: Cap, compositeHost: CompositeCapSet}} The cap and composite host for execution
   * @throws {CapMatrixError} If URN is invalid or no match found
   */
  can(capUrn) {
    // Find the best match to get the cap definition
    const bestMatch = this.findBestCapSet(capUrn);

    // Create a CompositeCapSet that will delegate execution
    const compositeHost = new CompositeCapSet([...this.registries]);

    return {
      cap: bestMatch.cap,
      compositeHost: compositeHost
    };
  }

  /**
   * Find the best capability host across ALL child registries.
   * Polls all registries and compares their best matches by specificity.
   * On specificity tie, returns the match from the first registry.
   * @param {string} requestUrn - The capability URN to find the best host for
   * @returns {BestCapSetMatch} The best match
   * @throws {CapMatrixError} If URN is invalid or no match found
   */
  findBestCapSet(requestUrn) {
    let request;
    try {
      request = CapUrn.fromString(requestUrn);
    } catch (e) {
      throw CapMatrixError.invalidUrn(requestUrn, e.message);
    }

    let bestOverall = null;

    for (const { name, registry } of this.registries) {
      // Find the best match within this registry
      const result = this._findBestInRegistry(registry, request);
      if (result) {
        const { cap, specificity } = result;
        const candidate = new BestCapSetMatch(cap, specificity, name);

        if (bestOverall === null) {
          bestOverall = candidate;
        } else if (specificity > bestOverall.specificity) {
          // Only replace if strictly more specific
          // On tie, keep the first one (priority order)
          bestOverall = candidate;
        }
      }
    }

    if (bestOverall === null) {
      throw CapMatrixError.noSetsFound(requestUrn);
    }

    return bestOverall;
  }

  /**
   * Check if any registry accepts the specified capability request
   * @param {string} requestUrn - The capability URN to check
   * @returns {boolean} Whether the capability request is accepted
   */
  acceptsRequest(requestUrn) {
    try {
      this.findBestCapSet(requestUrn);
      return true;
    } catch (e) {
      if (e instanceof CapMatrixError) {
        return false;
      }
      throw e;
    }
  }

  /**
   * Find the best match within a single registry
   * @private
   * @param {CapMatrix} registry - The registry to search
   * @param {CapUrn} request - The parsed request URN
   * @returns {{cap: Cap, specificity: number}|null} The best match or null
   */
  _findBestInRegistry(registry, request) {
    let bestCap = null;
    let bestSpecificity = -1;

    for (const entry of registry.sets.values()) {
      for (const cap of entry.capabilities) {
        if (cap.urn.accepts(request)) {
          const specificity = cap.urn.specificity();
          if (bestSpecificity === -1 || specificity > bestSpecificity) {
            bestCap = cap;
            bestSpecificity = specificity;
          }
          break;  // Found match for this entry
        }
      }
    }

    if (bestCap === null) {
      return null;
    }
    return { cap: bestCap, specificity: bestSpecificity };
  }

  /**
   * Build a directed graph from all capabilities across all registries.
   * The graph represents all possible conversions where:
   * - Nodes are media URNs (e.g., "media:string", "media:binary")
   * - Edges are capabilities that convert from one media URN to another
   * @returns {CapGraph} The capability graph
   */
  graph() {
    return CapGraph.buildFromRegistries(this.registries);
  }
}

// ============================================================================
// CAP GRAPH - Directed graph of capability conversions
// ============================================================================

/**
 * An edge in the capability graph representing a conversion from one media URN to another.
 */
class CapGraphEdge {
  /**
   * @param {string} fromUrn - The input media URN
   * @param {string} toUrn - The output media URN
   * @param {Cap} cap - The capability that performs this conversion
   * @param {string} registryName - The registry that provided this capability
   * @param {number} specificity - Specificity score for ranking
   */
  constructor(fromUrn, toUrn, cap, registryName, specificity) {
    this.fromUrn = fromUrn;
    this.toUrn = toUrn;
    this.cap = cap;
    this.registryName = registryName;
    this.specificity = specificity;
  }
}

/**
 * Statistics about a capability graph.
 */
class CapGraphStats {
  /**
   * @param {number} nodeCount - Number of unique media URN nodes
   * @param {number} edgeCount - Number of edges (capabilities)
   * @param {number} inputUrnCount - Number of URNs that serve as inputs
   * @param {number} outputUrnCount - Number of URNs that serve as outputs
   */
  constructor(nodeCount, edgeCount, inputUrnCount, outputUrnCount) {
    this.nodeCount = nodeCount;
    this.edgeCount = edgeCount;
    this.inputUrnCount = inputUrnCount;
    this.outputUrnCount = outputUrnCount;
  }
}

/**
 * A directed graph where nodes are media URNs and edges are capabilities.
 * This graph enables discovering conversion paths between different media formats.
 */
class CapGraph {
  constructor() {
    this.edges = [];
    this.outgoing = new Map();  // fromUrn -> edge indices
    this.incoming = new Map();  // toUrn -> edge indices
    this.nodes = new Set();
  }

  /**
   * Add a capability as an edge in the graph.
   * @param {Cap} cap - The capability to add
   * @param {string} registryName - The registry that provided this capability
   */
  addCap(cap, registryName) {
    const fromUrn = cap.urn.getInSpec();
    const toUrn = cap.urn.getOutSpec();
    const specificity = cap.urn.specificity();

    // Add nodes
    this.nodes.add(fromUrn);
    this.nodes.add(toUrn);

    // Create edge
    const edgeIndex = this.edges.length;
    const edge = new CapGraphEdge(fromUrn, toUrn, cap, registryName, specificity);
    this.edges.push(edge);

    // Update outgoing index
    if (!this.outgoing.has(fromUrn)) {
      this.outgoing.set(fromUrn, []);
    }
    this.outgoing.get(fromUrn).push(edgeIndex);

    // Update incoming index
    if (!this.incoming.has(toUrn)) {
      this.incoming.set(toUrn, []);
    }
    this.incoming.get(toUrn).push(edgeIndex);
  }

  /**
   * Build a graph from multiple registries.
   * @param {Array<{name: string, registry: CapMatrix}>} registries
   * @returns {CapGraph}
   */
  static buildFromRegistries(registries) {
    const graph = new CapGraph();

    for (const { name, registry } of registries) {
      for (const entry of registry.sets.values()) {
        for (const cap of entry.capabilities) {
          graph.addCap(cap, name);
        }
      }
    }

    return graph;
  }

  /**
   * Get all nodes (media URNs) in the graph.
   * @returns {Set<string>}
   */
  getNodes() {
    return new Set(this.nodes);
  }

  /**
   * Get all edges in the graph.
   * @returns {CapGraphEdge[]}
   */
  getEdges() {
    return [...this.edges];
  }

  /**
   * Get all edges where the provided URN satisfies the edge's input requirement.
   * Uses conformsTo-based matching instead of exact string matching.
   * @param {string} urn - The media URN
   * @returns {CapGraphEdge[]}
   */
  getOutgoing(urn) {
    // Use TaggedUrn matching: find all edges where the provided URN (instance)
    // conforms to the edge's input requirement (pattern/fromUrn)
    const providedUrn = TaggedUrn.fromString(urn);

    const edges = this.edges.filter(edge => {
      const requirementUrn = TaggedUrn.fromString(edge.fromUrn);
      return providedUrn.conformsTo(requirementUrn);
    });

    // Sort by specificity (highest first) for consistent ordering
    edges.sort((a, b) => b.specificity - a.specificity);

    return edges;
  }

  /**
   * Get all edges targeting a media URN.
   * @param {string} urn - The media URN
   * @returns {CapGraphEdge[]}
   */
  getIncoming(urn) {
    const indices = this.incoming.get(urn) || [];
    return indices.map(i => this.edges[i]);
  }

  /**
   * Check if there's any direct edge from one URN to another.
   * @param {string} fromUrn - The source media URN
   * @param {string} toUrn - The target media URN
   * @returns {boolean}
   */
  hasDirectEdge(fromUrn, toUrn) {
    return this.getOutgoing(fromUrn).some(edge => edge.toUrn === toUrn);
  }

  /**
   * Get all direct edges from one URN to another, sorted by specificity (highest first).
   * @param {string} fromUrn - The source media URN
   * @param {string} toUrn - The target media URN
   * @returns {CapGraphEdge[]}
   */
  getDirectEdges(fromUrn, toUrn) {
    const edges = this.getOutgoing(fromUrn).filter(edge => edge.toUrn === toUrn);
    edges.sort((a, b) => b.specificity - a.specificity);
    return edges;
  }

  /**
   * Check if a conversion path exists from one URN to another.
   * Uses BFS to find if there's any path (direct or through intermediates).
   * @param {string} fromUrn - The source media URN
   * @param {string} toUrn - The target media URN
   * @returns {boolean}
   */
  canConvert(fromUrn, toUrn) {
    if (fromUrn === toUrn) {
      return true;
    }

    if (!this.nodes.has(fromUrn) || !this.nodes.has(toUrn)) {
      return false;
    }

    const visited = new Set();
    const queue = [fromUrn];
    visited.add(fromUrn);

    while (queue.length > 0) {
      const current = queue.shift();

      for (const edge of this.getOutgoing(current)) {
        if (edge.toUrn === toUrn) {
          return true;
        }
        if (!visited.has(edge.toUrn)) {
          visited.add(edge.toUrn);
          queue.push(edge.toUrn);
        }
      }
    }

    return false;
  }

  /**
   * Find the shortest conversion path from one URN to another.
   * @param {string} fromUrn - The source media URN
   * @param {string} toUrn - The target media URN
   * @returns {CapGraphEdge[]|null} Array of edges representing the path, or null if no path exists
   */
  findPath(fromUrn, toUrn) {
    if (fromUrn === toUrn) {
      return [];
    }

    if (!this.nodes.has(fromUrn) || !this.nodes.has(toUrn)) {
      return null;
    }

    // BFS to find shortest path
    // visited maps urn -> {prevUrn, edgeIdx} or null for start node
    const visited = new Map();
    const queue = [fromUrn];
    visited.set(fromUrn, null);

    while (queue.length > 0) {
      const current = queue.shift();

      const indices = this.outgoing.get(current) || [];
      for (const edgeIdx of indices) {
        const edge = this.edges[edgeIdx];

        if (edge.toUrn === toUrn) {
          // Found the target - reconstruct path
          const path = [this.edges[edgeIdx]];

          let backtrack = current;
          let backtrackInfo = visited.get(backtrack);
          while (backtrackInfo !== null && backtrackInfo !== undefined) {
            path.push(this.edges[backtrackInfo.edgeIdx]);
            backtrack = backtrackInfo.prevUrn;
            backtrackInfo = visited.get(backtrack);
          }

          path.reverse();
          return path;
        }

        if (!visited.has(edge.toUrn)) {
          visited.set(edge.toUrn, { prevUrn: current, edgeIdx });
          queue.push(edge.toUrn);
        }
      }
    }

    return null;
  }

  /**
   * Find all conversion paths from one URN to another (up to a maximum depth).
   * @param {string} fromUrn - The source media URN
   * @param {string} toUrn - The target media URN
   * @param {number} maxDepth - Maximum path length to search
   * @returns {CapGraphEdge[][]} Array of paths (each path is an array of edges)
   */
  findAllPaths(fromUrn, toUrn, maxDepth) {
    if (!this.nodes.has(fromUrn) || !this.nodes.has(toUrn)) {
      return [];
    }

    const allPaths = [];
    const currentPath = [];
    const visited = new Set();

    this._dfsFindPaths(fromUrn, toUrn, maxDepth, currentPath, visited, allPaths);

    // Sort by path length (shortest first)
    allPaths.sort((a, b) => a.length - b.length);

    // Convert indices to edge references
    return allPaths.map(indices => indices.map(i => this.edges[i]));
  }

  /**
   * DFS helper for finding all paths
   * @private
   */
  _dfsFindPaths(current, target, remainingDepth, currentPath, visited, allPaths) {
    if (remainingDepth === 0) {
      return;
    }

    const indices = this.outgoing.get(current) || [];
    for (const edgeIdx of indices) {
      const edge = this.edges[edgeIdx];

      if (edge.toUrn === target) {
        // Found a path
        allPaths.push([...currentPath, edgeIdx]);
      } else if (!visited.has(edge.toUrn)) {
        // Continue searching
        visited.add(edge.toUrn);
        currentPath.push(edgeIdx);

        this._dfsFindPaths(edge.toUrn, target, remainingDepth - 1, currentPath, visited, allPaths);

        currentPath.pop();
        visited.delete(edge.toUrn);
      }
    }
  }

  /**
   * Find the best (highest specificity) conversion path from one URN to another.
   * @param {string} fromUrn - The source media URN
   * @param {string} toUrn - The target media URN
   * @param {number} maxDepth - Maximum path length to search
   * @returns {CapGraphEdge[]|null} Array of edges representing the best path, or null if no path exists
   */
  findBestPath(fromUrn, toUrn, maxDepth) {
    const allPaths = this.findAllPaths(fromUrn, toUrn, maxDepth);

    if (allPaths.length === 0) {
      return null;
    }

    let bestPath = null;
    let bestScore = -1;

    for (const path of allPaths) {
      const score = path.reduce((sum, edge) => sum + edge.specificity, 0);
      if (score > bestScore) {
        bestScore = score;
        bestPath = path;
      }
    }

    return bestPath;
  }

  /**
   * Get all URNs that have at least one outgoing edge.
   * @returns {string[]}
   */
  getInputUrns() {
    return Array.from(this.outgoing.keys());
  }

  /**
   * Get all URNs that have at least one incoming edge.
   * @returns {string[]}
   */
  getOutputUrns() {
    return Array.from(this.incoming.keys());
  }

  /**
   * Get statistics about the graph.
   * @returns {CapGraphStats}
   */
  stats() {
    return new CapGraphStats(
      this.nodes.size,
      this.edges.length,
      this.outgoing.size,
      this.incoming.size
    );
  }
}

// ============================================================================
// StdinSource - Represents stdin input source (data or file reference)
// ============================================================================

/**
 * Stdin source kinds
 */
const StdinSourceKind = {
  DATA: 'data',
  FILE_REFERENCE: 'file_reference'
};

/**
 * Represents the source for stdin data.
 * For cartridges (via gRPC/XPC), using FileReference avoids size limits
 * by letting the receiving side read the file locally.
 */
class StdinSource {
  /**
   * Create a StdinSource (use static factory methods instead)
   * @param {string} kind - StdinSourceKind.DATA or StdinSourceKind.FILE_REFERENCE
   * @param {Object} options - Options for the source
   * @private
   */
  constructor(kind, options = {}) {
    this.kind = kind;

    if (kind === StdinSourceKind.DATA) {
      this.data = options.data || null;
    } else if (kind === StdinSourceKind.FILE_REFERENCE) {
      this.trackedFileId = options.trackedFileId || '';
      this.originalPath = options.originalPath || '';
      this.securityBookmark = options.securityBookmark || null;
      this.mediaUrn = options.mediaUrn || '';
    }
  }

  /**
   * Create a StdinSource from raw data bytes
   * @param {Uint8Array|Buffer|null} data - The raw bytes for stdin
   * @returns {StdinSource}
   */
  static fromData(data) {
    return new StdinSource(StdinSourceKind.DATA, { data });
  }

  /**
   * Create a StdinSource from a file reference
   * Used for cartridges to read files locally instead of sending bytes over the wire.
   * @param {string} trackedFileId - ID for lifecycle management
   * @param {string} originalPath - Original file path (for logging/debugging)
   * @param {Uint8Array|Buffer|null} securityBookmark - Security bookmark data
   * @param {string} mediaUrn - Media URN so receiver knows expected type
   * @returns {StdinSource}
   */
  static fromFileReference(trackedFileId, originalPath, securityBookmark, mediaUrn) {
    return new StdinSource(StdinSourceKind.FILE_REFERENCE, {
      trackedFileId,
      originalPath,
      securityBookmark,
      mediaUrn
    });
  }

  /**
   * Check if this is a data source
   * @returns {boolean}
   */
  isData() {
    return this.kind === StdinSourceKind.DATA;
  }

  /**
   * Check if this is a file reference source
   * @returns {boolean}
   */
  isFileReference() {
    return this.kind === StdinSourceKind.FILE_REFERENCE;
  }
}

// =============================================================================
// Cartridge Repository System
// =============================================================================

/**
 * Cartridge capability summary from registry
 */
class CartridgeCapSummary {
  constructor(urn, title, description = '') {
    this.urn = urn;
    this.title = title;
    this.description = description;
  }
}

/**
 * Cartridge information from registry
 */
class CartridgeInfo {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.version = data.version || '';
    this.description = data.description || '';
    this.author = data.author || '';
    this.pageUrl = data.pageUrl || '';
    this.teamId = data.teamId || '';
    this.signedAt = data.signedAt || '';
    this.minAppVersion = data.minAppVersion || '';
    this.caps = (data.caps || []).map(c => new CartridgeCapSummary(c.urn, c.title, c.description || ''));
    this.categories = data.categories || [];
    this.tags = data.tags || [];
    this.changelog = data.changelog || {};
    // Distribution fields
    this.platform = data.platform || '';
    this.packageName = data.packageName || '';
    this.packageSha256 = data.packageSha256 || '';
    this.packageSize = data.packageSize || 0;
    this.binaryName = data.binaryName || '';
    this.binarySha256 = data.binarySha256 || '';
    this.binarySize = data.binarySize || 0;
    this.availableVersions = data.availableVersions || [];
  }

  /**
   * Check if cartridge is signed (has team_id and signed_at)
   */
  isSigned() {
    return this.teamId.length > 0 && this.signedAt.length > 0;
  }

  /**
   * Check if binary download info is available
   */
  hasBinary() {
    return this.binaryName.length > 0 && this.binarySha256.length > 0;
  }
}

/**
 * Cartridge suggestion for a missing cap
 */
class CartridgeSuggestion {
  constructor(data) {
    this.cartridgeId = data.cartridgeId;
    this.cartridgeName = data.cartridgeName;
    this.cartridgeDescription = data.cartridgeDescription;
    this.capUrn = data.capUrn;
    this.capTitle = data.capTitle;
    this.latestVersion = data.latestVersion;
    this.repoUrl = data.repoUrl;
    this.pageUrl = data.pageUrl;
  }
}

/**
 * Cartridge registry cache entry
 */
class CartridgeRepoCache {
  constructor(repoUrl) {
    this.cartridges = new Map(); // cartridge_id -> CartridgeInfo
    this.capToCartridges = new Map(); // cap_urn -> [cartridge_ids]
    this.lastUpdated = Date.now();
    this.repoUrl = repoUrl;
  }
}

/**
 * Cartridge repository client - fetches and caches cartridge registry
 */
class CartridgeRepoClient {
  constructor(cacheTtlSeconds = 3600) {
    this.caches = new Map(); // repo_url -> CartridgeRepoCache
    this.cacheTtl = cacheTtlSeconds * 1000; // Convert to milliseconds
  }

  /**
   * Fetch registry from a URL
   */
  async fetchRegistry(repoUrl) {
    const response = await fetch(repoUrl);

    if (!response.ok) {
      throw new Error(`Cartridge registry request failed: HTTP ${response.status} from ${repoUrl}`);
    }

    const data = await response.json();

    if (!data.cartridges || !Array.isArray(data.cartridges)) {
      throw new Error(`Invalid cartridge registry response from ${repoUrl}: missing cartridges array`);
    }

    return data.cartridges.map(p => new CartridgeInfo(p));
  }

  /**
   * Update cache from registry data
   */
  updateCache(repoUrl, cartridges) {
    const cache = new CartridgeRepoCache(repoUrl);

    for (const cartridge of cartridges) {
      cache.cartridges.set(cartridge.id, cartridge);

      for (const cap of cartridge.caps) {
        if (!cache.capToCartridges.has(cap.urn)) {
          cache.capToCartridges.set(cap.urn, []);
        }
        cache.capToCartridges.get(cap.urn).push(cartridge.id);
      }
    }

    this.caches.set(repoUrl, cache);
  }

  /**
   * Check if cache is stale
   */
  isCacheStale(cache) {
    return (Date.now() - cache.lastUpdated) > this.cacheTtl;
  }

  /**
   * Sync cartridge data from repository URLs
   */
  async syncRepos(repoUrls) {
    for (const repoUrl of repoUrls) {
      try {
        const cartridges = await this.fetchRegistry(repoUrl);
        this.updateCache(repoUrl, cartridges);
      } catch (e) {
        console.warn(`Failed to sync cartridge repo ${repoUrl}: ${e.message}`);
        // Continue with other repos
      }
    }
  }

  /**
   * Check if any repo needs syncing
   */
  needsSync(repoUrls) {
    for (const repoUrl of repoUrls) {
      const cache = this.caches.get(repoUrl);
      if (!cache || this.isCacheStale(cache)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get cartridge suggestions for a cap URN
   */
  getSuggestionsForCap(capUrn) {
    const suggestions = [];

    for (const cache of this.caches.values()) {
      const cartridgeIds = cache.capToCartridges.get(capUrn);
      if (!cartridgeIds) continue;

      for (const cartridgeId of cartridgeIds) {
        const cartridge = cache.cartridges.get(cartridgeId);
        if (!cartridge) continue;

        const capInfo = cartridge.caps.find(c => c.urn === capUrn);
        if (!capInfo) continue;

        const pageUrl = cartridge.pageUrl || cache.repoUrl;

        suggestions.push(new CartridgeSuggestion({
          cartridgeId: cartridge.id,
          cartridgeName: cartridge.name,
          cartridgeDescription: cartridge.description,
          capUrn: capUrn,
          capTitle: capInfo.title,
          latestVersion: cartridge.version,
          repoUrl: cache.repoUrl,
          pageUrl: pageUrl
        }));
      }
    }

    return suggestions;
  }

  /**
   * Get all available cartridges from all repos
   */
  getAllCartridges() {
    const cartridges = [];
    for (const cache of this.caches.values()) {
      for (const [cartridgeId, cartridgeInfo] of cache.cartridges) {
        cartridges.push([cartridgeId, cartridgeInfo]);
      }
    }
    return cartridges;
  }

  /**
   * Get all available cap URNs from cartridges
   */
  getAllAvailableCaps() {
    const caps = new Set();
    for (const cache of this.caches.values()) {
      for (const capUrn of cache.capToCartridges.keys()) {
        caps.add(capUrn);
      }
    }
    return Array.from(caps).sort();
  }

  /**
   * Get cartridge info by ID
   */
  getCartridge(cartridgeId) {
    for (const cache of this.caches.values()) {
      const cartridge = cache.cartridges.get(cartridgeId);
      if (cartridge) {
        return cartridge;
      }
    }
    return null;
  }

  /**
   * Get suggestions for missing caps
   */
  getSuggestionsForMissingCaps(availableCaps, requestedCaps) {
    const availableSet = new Set(availableCaps);
    const suggestions = [];

    for (const capUrn of requestedCaps) {
      if (!availableSet.has(capUrn)) {
        suggestions.push(...this.getSuggestionsForCap(capUrn));
      }
    }

    return suggestions;
  }
}

/**
 * Cartridge repository server - serves registry data with queries
 */
class CartridgeRepoServer {
  constructor(registry) {
    this.registry = registry;
    this.validateRegistry();
  }

  /**
   * Validate registry schema
   */
  validateRegistry() {
    if (!this.registry) {
      throw new Error('Registry is required');
    }
    if (this.registry.schemaVersion !== '3.0') {
      throw new Error(`Unsupported registry schema version: ${this.registry.schemaVersion}. Required: 3.0`);
    }
    if (!this.registry.cartridges || typeof this.registry.cartridges !== 'object') {
      throw new Error('Registry must have cartridges object');
    }
  }

  /**
   * Validate version data has all required fields
   */
  validateVersionData(id, version, versionData) {
    if (!versionData.platform) {
      throw new Error(`Cartridge ${id} v${version}: missing required field 'platform'`);
    }
    if (!versionData.package || !versionData.package.name) {
      throw new Error(`Cartridge ${id} v${version}: missing required field 'package'`);
    }
    if (!versionData.binary || !versionData.binary.name) {
      throw new Error(`Cartridge ${id} v${version}: missing required field 'binary'`);
    }
  }

  /**
   * Compare version strings
   */
  compareVersions(a, b) {
    const partsA = a.split('.').map(x => parseInt(x) || 0);
    const partsB = b.split('.').map(x => parseInt(x) || 0);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA !== numB) {
        return numA - numB;
      }
    }
    return 0;
  }

  /**
   * Build changelog map from versions
   */
  buildChangelogMap(versions) {
    const changelog = {};
    for (const [version, versionData] of Object.entries(versions)) {
      if (versionData.changelog && Array.isArray(versionData.changelog)) {
        changelog[version] = versionData.changelog;
      }
    }
    return changelog;
  }

  /**
   * Transform registry to flat cartridge array
   */
  transformToCartridgeArray() {
    const cartridgesObject = this.registry.cartridges || {};
    const cartridges = [];

    for (const [id, cartridge] of Object.entries(cartridgesObject)) {
      const latestVersion = cartridge.latestVersion;
      const versionData = cartridge.versions[latestVersion];

      if (!versionData) {
        throw new Error(`Cartridge ${id}: latest version ${latestVersion} not found in versions`);
      }

      // Validate required fields - fail hard
      this.validateVersionData(id, latestVersion, versionData);

      // Get all version numbers sorted descending
      const availableVersions = Object.keys(cartridge.versions).sort((a, b) => {
        return this.compareVersions(b, a);
      });

      // Build flat cartridge object with latest version data
      const packageUrl = `https://machinefabric.com/cartridges/packages/${versionData.package.name}`;
      cartridges.push({
        id,
        name: cartridge.name,
        version: latestVersion,
        description: cartridge.description,
        author: cartridge.author,
        pageUrl: cartridge.pageUrl || packageUrl,
        teamId: cartridge.teamId,
        signedAt: versionData.releaseDate,
        minAppVersion: versionData.minAppVersion || cartridge.minAppVersion,
        caps: cartridge.caps || [],
        categories: cartridge.categories,
        tags: cartridge.tags,
        changelog: this.buildChangelogMap(cartridge.versions),
        // Distribution fields - ALL REQUIRED
        platform: versionData.platform,
        packageName: versionData.package.name,
        packageSha256: versionData.package.sha256,
        packageSize: versionData.package.size,
        binaryName: versionData.binary.name,
        binarySha256: versionData.binary.sha256,
        binarySize: versionData.binary.size,
        // All available versions
        availableVersions
      });
    }

    return cartridges;
  }

  /**
   * Get all cartridges (API response format)
   */
  getCartridges() {
    return {
      cartridges: this.transformToCartridgeArray()
    };
  }

  /**
   * Get cartridge by ID
   */
  getCartridgeById(id) {
    const cartridges = this.transformToCartridgeArray();
    return cartridges.find(p => p.id === id);
  }

  /**
   * Search cartridges by query
   */
  searchCartridges(query) {
    const cartridges = this.transformToCartridgeArray();
    const lowerQuery = query.toLowerCase();

    return cartridges.filter(p =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
      p.caps.some(c => c.urn.toLowerCase().includes(lowerQuery) || c.title.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get cartridges by category
   */
  getCartridgesByCategory(category) {
    const cartridges = this.transformToCartridgeArray();
    return cartridges.filter(p => p.categories.includes(category));
  }

  /**
   * Get cartridges that provide a specific cap
   */
  getCartridgesByCap(capUrn) {
    const cartridges = this.transformToCartridgeArray();
    return cartridges.filter(p => p.caps.some(c => c.urn === capUrn));
  }
}

// ============================================================================
// Machine Notation — compact, round-trippable DAG path identifiers
//
// Machine notation describes capability transformation paths using bracket-
// delimited statements:
//   [alias cap:in="...";op=...;out="..."]   — header (defines a cap with alias)
//   [src -> alias -> dst]                   — wiring (connects nodes via cap)
//   [(a, b) -> alias -> dst]               — fan-in wiring
//   [src -> LOOP alias -> dst]             — loop wiring (ForEach semantics)
// ============================================================================

/**
 * Error types for machine notation parsing.
 * Mirrors Rust MachineSyntaxError exactly.
 */
class MachineSyntaxError extends Error {
  /**
   * @param {string} code - Error code from MachineSyntaxErrorCodes
   * @param {string} message - Human-readable error message
   * @param {Object|null} [location] - Source location { start: {offset,line,column}, end: {offset,line,column} }
   */
  constructor(code, message, location) {
    super(message);
    this.name = 'MachineSyntaxError';
    this.code = code;
    this.location = location || null;
  }
}

const MachineSyntaxErrorCodes = {
  EMPTY: 'Empty',
  UNTERMINATED_STATEMENT: 'UnterminatedStatement',
  INVALID_CAP_URN: 'InvalidCapUrn',
  UNDEFINED_ALIAS: 'UndefinedAlias',
  DUPLICATE_ALIAS: 'DuplicateAlias',
  INVALID_WIRING: 'InvalidWiring',
  INVALID_MEDIA_URN: 'InvalidMediaUrn',
  INVALID_HEADER: 'InvalidHeader',
  NO_EDGES: 'NoEdges',
  NODE_ALIAS_COLLISION: 'NodeAliasCollision',
  PARSE_ERROR: 'ParseError',
};

/**
 * A single edge in the machine graph.
 *
 * Each edge represents a capability that transforms one or more source
 * media types into a target media type. The isLoop flag indicates
 * ForEach semantics (the capability is applied to each item in a list).
 *
 * Mirrors Rust MachineEdge.
 */
class MachineEdge {
  /**
   * @param {MediaUrn[]} sources - Input media URN(s)
   * @param {CapUrn} capUrn - The capability URN (edge label)
   * @param {MediaUrn} target - Output media URN
   * @param {boolean} isLoop - Whether this edge has ForEach semantics
   */
  constructor(sources, capUrn, target, isLoop) {
    this.sources = sources;
    this.capUrn = capUrn;
    this.target = target;
    this.isLoop = isLoop;
  }

  /**
   * Check if two edges are semantically equivalent.
   *
   * Equivalence is defined as:
   * - Same number of sources, and each source in this has an equivalent source in other
   * - Equivalent cap URNs (via CapUrn.isEquivalent)
   * - Equivalent target media URNs (via MediaUrn.isEquivalent)
   * - Same isLoop flag
   *
   * Source order does not matter — fan-in sources are compared as sets.
   * Mirrors Rust MachineEdge::is_equivalent.
   */
  isEquivalent(other) {
    if (this.isLoop !== other.isLoop) {
      return false;
    }

    if (!this.capUrn.isEquivalent(other.capUrn)) {
      return false;
    }

    // Target equivalence
    if (!this.target.isEquivalent(other.target)) {
      return false;
    }

    // Source set equivalence — order-independent comparison
    if (this.sources.length !== other.sources.length) {
      return false;
    }

    // For each source in this, find a matching source in other.
    // Track which indices in other have been matched to avoid double-counting.
    const matched = new Array(other.sources.length).fill(false);
    for (const selfSrc of this.sources) {
      let found = false;
      for (let j = 0; j < other.sources.length; j++) {
        if (matched[j]) continue;
        if (selfSrc.isEquivalent(other.sources[j])) {
          matched[j] = true;
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }

    return true;
  }

  /**
   * Display string for this edge.
   * Mirrors Rust Display for MachineEdge.
   */
  toString() {
    const sources = this.sources.map(s => s.toString()).join(', ');
    const loopPrefix = this.isLoop ? 'LOOP ' : '';
    return `(${sources}) -${loopPrefix}${this.capUrn}-> ${this.target}`;
  }
}

/**
 * A machine graph — the semantic model behind machine notation.
 *
 * The graph is a collection of directed edges where each edge is a capability
 * that transforms source media types into a target media type.
 *
 * Two graphs are equivalent if they have the same set of edges, regardless
 * of ordering. Alias names used in the textual notation are not part of
 * the graph model.
 *
 * Mirrors Rust Machine.
 */
class Machine {
  /**
   * @param {MachineEdge[]} edges
   */
  constructor(edges) {
    this._edges = edges;
  }

  /**
   * Create an empty machine graph.
   * @returns {Machine}
   */
  static empty() {
    return new Machine([]);
  }

  /**
   * Parse machine notation into a Machine.
   * @param {string} input
   * @returns {Machine}
   * @throws {MachineSyntaxError}
   */
  static fromString(input) {
    return parseMachine(input);
  }

  /**
   * Get the edges of this graph.
   * @returns {MachineEdge[]}
   */
  edges() {
    return this._edges;
  }

  /**
   * Number of edges in the graph.
   * @returns {number}
   */
  edgeCount() {
    return this._edges.length;
  }

  /**
   * Check if the graph has no edges.
   * @returns {boolean}
   */
  isEmpty() {
    return this._edges.length === 0;
  }

  /**
   * Check if two machine graphs are semantically equivalent.
   *
   * Two graphs are equivalent if they have the same set of edges
   * (compared using MachineEdge.isEquivalent). Edge ordering
   * does not matter.
   *
   * Mirrors Rust Machine::is_equivalent.
   */
  isEquivalent(other) {
    if (this._edges.length !== other._edges.length) {
      return false;
    }

    // For each edge in this, find a matching edge in other.
    const matched = new Array(other._edges.length).fill(false);
    for (const selfEdge of this._edges) {
      let found = false;
      for (let j = 0; j < other._edges.length; j++) {
        if (matched[j]) continue;
        if (selfEdge.isEquivalent(other._edges[j])) {
          matched[j] = true;
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }

    return true;
  }

  /**
   * Collect all unique source media URNs across all edges that are not
   * also produced as targets by any other edge. These are the "root"
   * inputs to the graph.
   *
   * Mirrors Rust Machine::root_sources.
   * @returns {MediaUrn[]}
   */
  rootSources() {
    const roots = [];
    for (const edge of this._edges) {
      for (const src of edge.sources) {
        // Check if any edge produces this source as a target
        const isProduced = this._edges.some(e => e.target.isEquivalent(src));
        if (!isProduced) {
          // Avoid duplicates (by equivalence)
          const alreadyAdded = roots.some(r => r.isEquivalent(src));
          if (!alreadyAdded) {
            roots.push(src);
          }
        }
      }
    }
    return roots;
  }

  /**
   * Collect all unique target media URNs that are not consumed as sources
   * by any other edge. These are the "leaf" outputs of the graph.
   *
   * Mirrors Rust Machine::leaf_targets.
   * @returns {MediaUrn[]}
   */
  leafTargets() {
    const leaves = [];
    for (const edge of this._edges) {
      const isConsumed = this._edges.some(e =>
        e.sources.some(s => s.isEquivalent(edge.target))
      );
      if (!isConsumed) {
        const alreadyAdded = leaves.some(l => l.isEquivalent(edge.target));
        if (!alreadyAdded) {
          leaves.push(edge.target);
        }
      }
    }
    return leaves;
  }

  // =========================================================================
  // Serializer — deterministic canonical form
  // Mirrors Rust serializer.rs
  // =========================================================================

  /**
   * Serialize this machine graph to canonical one-line machine notation.
   *
   * The output is deterministic: same graph → same string.
   * Mirrors Rust Machine::to_machine_notation.
   * @returns {string}
   */
  toMachineNotation() {
    if (this._edges.length === 0) {
      return '';
    }

    const { aliases, nodeNames, edgeOrder } = this._buildSerializationMaps();
    let output = '';

    // Emit headers in alias-sorted order
    const sortedAliases = Array.from(aliases.entries()).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

    for (const [alias, { edgeIdx }] of sortedAliases) {
      const edge = this._edges[edgeIdx];
      output += `[${alias} ${edge.capUrn}]`;
    }

    // Emit wirings in edge order
    for (const edgeIdx of edgeOrder) {
      const edge = this._edges[edgeIdx];
      let alias = null;
      for (const [a, info] of aliases) {
        if (info.edgeIdx === edgeIdx) {
          alias = a;
          break;
        }
      }

      // Source node name(s)
      const sources = edge.sources.map(s => {
        const key = s.toString();
        return nodeNames.get(key);
      });

      // Target node name
      const targetKey = edge.target.toString();
      const targetName = nodeNames.get(targetKey);

      const loopPrefix = edge.isLoop ? 'LOOP ' : '';

      if (sources.length === 1) {
        output += `[${sources[0]} -> ${loopPrefix}${alias} -> ${targetName}]`;
      } else {
        const group = sources.join(', ');
        output += `[(${group}) -> ${loopPrefix}${alias} -> ${targetName}]`;
      }
    }

    return output;
  }

  /**
   * Serialize to multi-line machine notation (one statement per line).
   * Mirrors Rust Machine::to_machine_notation_multiline.
   * @returns {string}
   */
  toMachineNotationMultiline() {
    if (this._edges.length === 0) {
      return '';
    }

    const { aliases, nodeNames, edgeOrder } = this._buildSerializationMaps();
    const lines = [];

    // Emit headers in alias-sorted order
    const sortedAliases = Array.from(aliases.entries()).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

    for (const [alias, { edgeIdx }] of sortedAliases) {
      const edge = this._edges[edgeIdx];
      lines.push(`[${alias} ${edge.capUrn}]`);
    }

    // Emit wirings in edge order
    for (const edgeIdx of edgeOrder) {
      const edge = this._edges[edgeIdx];
      let alias = null;
      for (const [a, info] of aliases) {
        if (info.edgeIdx === edgeIdx) {
          alias = a;
          break;
        }
      }

      const sources = edge.sources.map(s => {
        const key = s.toString();
        return nodeNames.get(key);
      });

      const targetKey = edge.target.toString();
      const targetName = nodeNames.get(targetKey);

      const loopPrefix = edge.isLoop ? 'LOOP ' : '';

      if (sources.length === 1) {
        lines.push(`[${sources[0]} -> ${loopPrefix}${alias} -> ${targetName}]`);
      } else {
        const group = sources.join(', ');
        lines.push(`[(${group}) -> ${loopPrefix}${alias} -> ${targetName}]`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Serialize this machine graph to machine notation in the specified format.
   *
   * The output is deterministic: same graph + same format → same string.
   * @param {'bracketed' | 'line-based'} format - The notation format to use.
   * @returns {string}
   */
  toMachineNotationFormatted(format) {
    if (this._edges.length === 0) {
      return '';
    }

    const { aliases, nodeNames, edgeOrder } = this._buildSerializationMaps();
    const bracketed = format === 'bracketed';
    const open = bracketed ? '[' : '';
    const close = bracketed ? ']' : '';
    const lines = [];

    // Emit headers in alias-sorted order
    const sortedAliases = Array.from(aliases.entries()).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

    for (const [alias, { edgeIdx }] of sortedAliases) {
      const edge = this._edges[edgeIdx];
      lines.push(`${open}${alias} ${edge.capUrn}${close}`);
    }

    // Emit wirings in edge order
    for (const edgeIdx of edgeOrder) {
      const edge = this._edges[edgeIdx];
      let alias = null;
      for (const [a, info] of aliases) {
        if (info.edgeIdx === edgeIdx) {
          alias = a;
          break;
        }
      }

      const sources = edge.sources.map(s => {
        const key = s.toString();
        return nodeNames.get(key);
      });

      const targetKey = edge.target.toString();
      const targetName = nodeNames.get(targetKey);

      const loopPrefix = edge.isLoop ? 'LOOP ' : '';

      if (sources.length === 1) {
        lines.push(`${open}${sources[0]} -> ${loopPrefix}${alias} -> ${targetName}${close}`);
      } else {
        const group = sources.join(', ');
        lines.push(`${open}(${group}) -> ${loopPrefix}${alias} -> ${targetName}${close}`);
      }
    }

    return bracketed ? lines.join('') : lines.join('\n');
  }

  /**
   * Build the alias map, node name map, and edge ordering for serialization.
   *
   * Returns:
   * - aliases: Map<string, { edgeIdx: number, capStr: string }>
   * - nodeNames: Map<string, string> (media_urn_canonical → node_name)
   * - edgeOrder: number[] (edge indices in canonical order)
   *
   * Mirrors Rust Machine::build_serialization_maps.
   * @private
   */
  _buildSerializationMaps() {
    // Step 1: Generate canonical edge ordering
    const edgeOrder = Array.from({ length: this._edges.length }, (_, i) => i);
    edgeOrder.sort((a, b) => {
      const ea = this._edges[a];
      const eb = this._edges[b];

      const capCmp = ea.capUrn.toString().localeCompare(eb.capUrn.toString());
      if (capCmp !== 0) return capCmp;

      const srcA = ea.sources.map(s => s.toString());
      const srcB = eb.sources.map(s => s.toString());
      // Lexicographic comparison of source arrays
      const minLen = Math.min(srcA.length, srcB.length);
      for (let i = 0; i < minLen; i++) {
        const cmp = srcA[i].localeCompare(srcB[i]);
        if (cmp !== 0) return cmp;
      }
      if (srcA.length !== srcB.length) return srcA.length - srcB.length;

      return ea.target.toString().localeCompare(eb.target.toString());
    });

    // Step 2: Generate aliases from op= tag
    const aliases = new Map();
    const aliasCounts = new Map();

    for (const idx of edgeOrder) {
      const edge = this._edges[idx];
      const opTag = edge.capUrn.getTag('op');
      const baseAlias = opTag !== undefined ? opTag : `edge_${idx}`;

      const count = aliasCounts.get(baseAlias) || 0;
      const alias = count === 0 ? baseAlias : `${baseAlias}_${count}`;
      aliasCounts.set(baseAlias, count + 1);

      const capStr = edge.capUrn.toString();
      aliases.set(alias, { edgeIdx: idx, capStr });
    }

    // Step 3: Generate node names
    // Collect all unique media URNs, assign names in order of first appearance
    const nodeNames = new Map();
    let nodeCounter = 0;

    for (const idx of edgeOrder) {
      const edge = this._edges[idx];
      for (const src of edge.sources) {
        const key = src.toString();
        if (!nodeNames.has(key)) {
          nodeNames.set(key, `n${nodeCounter}`);
          nodeCounter++;
        }
      }
      const targetKey = edge.target.toString();
      if (!nodeNames.has(targetKey)) {
        nodeNames.set(targetKey, `n${nodeCounter}`);
        nodeCounter++;
      }
    }

    return { aliases, nodeNames, edgeOrder };
  }

  /**
   * Generate a Mermaid flowchart string from this machine graph.
   *
   * - Root sources: stadium-shaped nodes (rounded)
   * - Leaf targets: stadium-shaped nodes (rounded)
   * - Intermediate nodes: rectangular
   * - Edge labels: op= tag value (or full cap URN if no op)
   * - LOOP edges: dotted line style with "LOOP" prefix on label
   * - Node labels: derived MediaUrn type
   *
   * @returns {string} Mermaid flowchart definition
   */
  toMermaid() {
    if (this._edges.length === 0) {
      return 'flowchart LR\n  empty["(empty graph)"]';
    }

    const { aliases, nodeNames, edgeOrder } = this._buildSerializationMaps();
    const rootSourceSet = new Set(this.rootSources().map(s => s.toString()));
    const leafTargetSet = new Set(this.leafTargets().map(t => t.toString()));

    const lines = ['flowchart LR'];

    // Define node shapes based on role
    for (const [mediaKey, nodeName] of nodeNames) {
      // Escape special mermaid characters in the label
      const label = mediaKey.replace(/"/g, '#quot;');
      if (rootSourceSet.has(mediaKey)) {
        // Stadium shape for roots
        lines.push(`  ${nodeName}([${label}])`);
      } else if (leafTargetSet.has(mediaKey)) {
        // Stadium shape for leaves
        lines.push(`  ${nodeName}([${label}])`);
      } else {
        // Rectangle for intermediates
        lines.push(`  ${nodeName}[${label}]`);
      }
    }

    // Define edges
    for (const edgeIdx of edgeOrder) {
      const edge = this._edges[edgeIdx];
      // Find alias for this edge
      let edgeLabel = null;
      for (const [a, info] of aliases) {
        if (info.edgeIdx === edgeIdx) {
          edgeLabel = a;
          break;
        }
      }
      const opTag = edge.capUrn.getTag('op');
      const label = opTag !== undefined ? opTag : edgeLabel;

      const targetKey = edge.target.toString();
      const targetName = nodeNames.get(targetKey);

      for (const src of edge.sources) {
        const srcKey = src.toString();
        const srcName = nodeNames.get(srcKey);

        if (edge.isLoop) {
          // Dotted line for LOOP edges
          lines.push(`  ${srcName} -. "LOOP ${label}" .-> ${targetName}`);
        } else {
          lines.push(`  ${srcName} -- "${label}" --> ${targetName}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Display string for this graph.
   * Mirrors Rust Display for Machine.
   */
  toString() {
    if (this._edges.length === 0) {
      return 'Machine(empty)';
    }
    return `Machine(${this._edges.length} edges)`;
  }
}

// ============================================================================
// Machine Parser — PEG-based parser using Peggy
// Mirrors Rust parser.rs exactly (4-phase pipeline)
// ============================================================================

// Load the Peggy-generated parser
const machineParser = require('./machine-parser.js');

/**
 * Assign a media URN to a node, or check consistency if already assigned.
 *
 * Uses MediaUrn.isComparable() — two types on the same specialization
 * chain are compatible.
 *
 * Mirrors Rust assign_or_check_node.
 * @private
 */
function assignOrCheckNode(node, mediaUrn, nodeMedia, position, location) {
  const existing = nodeMedia.get(node);
  if (existing !== undefined) {
    const compatible = existing.isComparable(mediaUrn);
    if (!compatible) {
      throw new MachineSyntaxError(
        MachineSyntaxErrorCodes.INVALID_WIRING,
        `invalid wiring at statement ${position}: node '${node}' has conflicting media types: existing '${existing}', new '${mediaUrn}'`,
        location
      );
    }
  } else {
    nodeMedia.set(node, mediaUrn);
  }
}

/**
 * Internal: run the 4-phase parse pipeline on machine notation input.
 * Returns { machine, statements, aliasMap, nodeMedia } for full introspection.
 *
 * @param {string} input - Machine notation string
 * @returns {{ machine: Machine, statements: Object[], aliasMap: Map, nodeMedia: Map }}
 * @throws {MachineSyntaxError}
 * @private
 */
function _parseMachineInternal(input) {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new MachineSyntaxError(
      MachineSyntaxErrorCodes.EMPTY,
      'machine notation is empty'
    );
  }

  // Phase 1: Parse with Peggy grammar
  let stmts;
  try {
    stmts = machineParser.parse(trimmed);
  } catch (e) {
    // Peggy SyntaxError has .location — propagate it
    const loc = e.location || null;
    throw new MachineSyntaxError(
      MachineSyntaxErrorCodes.PARSE_ERROR,
      `parse error: ${e.message}`,
      loc
    );
  }

  // Phase 2: Separate headers and wirings (already done by grammar actions)
  const headers = [];
  const wirings = [];

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    if (stmt.type === 'header') {
      // Parse the cap URN string
      let capUrn;
      try {
        capUrn = CapUrn.fromString(stmt.capUrn);
      } catch (e) {
        throw new MachineSyntaxError(
          MachineSyntaxErrorCodes.INVALID_CAP_URN,
          `invalid cap URN in header '${stmt.alias}': ${e.message}`,
          stmt.capUrnLocation || stmt.location
        );
      }
      headers.push({
        alias: stmt.alias,
        capUrn,
        position: i,
        location: stmt.location,
        aliasLocation: stmt.aliasLocation,
        capUrnLocation: stmt.capUrnLocation,
      });
    } else if (stmt.type === 'wiring') {
      wirings.push({
        sources: stmt.sources,
        capAlias: stmt.capAlias,
        target: stmt.target,
        isLoop: stmt.isLoop,
        position: i,
        location: stmt.location,
        sourceLocations: stmt.sourceLocations,
        capAliasLocation: stmt.capAliasLocation,
        targetLocation: stmt.targetLocation,
      });
    }
  }

  // Phase 3: Build alias → CapUrn map, checking for duplicates
  const aliasMap = new Map();
  for (const header of headers) {
    if (aliasMap.has(header.alias)) {
      const firstPos = aliasMap.get(header.alias).position;
      throw new MachineSyntaxError(
        MachineSyntaxErrorCodes.DUPLICATE_ALIAS,
        `duplicate alias '${header.alias}' (first defined at statement ${firstPos})`,
        header.aliasLocation || header.location
      );
    }
    aliasMap.set(header.alias, {
      capUrn: header.capUrn,
      position: header.position,
      location: header.location,
      aliasLocation: header.aliasLocation,
      capUrnLocation: header.capUrnLocation,
    });
  }

  // Phase 4: Resolve wirings into MachineEdges
  if (wirings.length === 0 && headers.length > 0) {
    throw new MachineSyntaxError(
      MachineSyntaxErrorCodes.NO_EDGES,
      'machine has headers but no wirings — define at least one edge',
      headers[headers.length - 1].location
    );
  }

  const nodeMedia = new Map(); // node_name → MediaUrn
  const edges = [];

  for (const wiring of wirings) {
    // Look up the cap alias
    const aliasEntry = aliasMap.get(wiring.capAlias);
    if (!aliasEntry) {
      throw new MachineSyntaxError(
        MachineSyntaxErrorCodes.UNDEFINED_ALIAS,
        `wiring references undefined alias '${wiring.capAlias}'`,
        wiring.capAliasLocation || wiring.location
      );
    }
    const capUrn = aliasEntry.capUrn;

    // Check node-alias collisions
    for (let si = 0; si < wiring.sources.length; si++) {
      const src = wiring.sources[si];
      if (aliasMap.has(src)) {
        throw new MachineSyntaxError(
          MachineSyntaxErrorCodes.NODE_ALIAS_COLLISION,
          `node name '${src}' collides with cap alias '${src}'`,
          wiring.sourceLocations ? wiring.sourceLocations[si] : wiring.location
        );
      }
    }
    if (aliasMap.has(wiring.target)) {
      throw new MachineSyntaxError(
        MachineSyntaxErrorCodes.NODE_ALIAS_COLLISION,
        `node name '${wiring.target}' collides with cap alias '${wiring.target}'`,
        wiring.targetLocation || wiring.location
      );
    }

    // Derive media URNs from cap's in=/out= specs
    let capInMedia;
    try {
      capInMedia = capUrn.inMediaUrn();
    } catch (e) {
      throw new MachineSyntaxError(
        MachineSyntaxErrorCodes.INVALID_MEDIA_URN,
        `invalid media URN in cap '${wiring.capAlias}': in= spec: ${e.message}`,
        aliasEntry.capUrnLocation || wiring.location
      );
    }

    let capOutMedia;
    try {
      capOutMedia = capUrn.outMediaUrn();
    } catch (e) {
      throw new MachineSyntaxError(
        MachineSyntaxErrorCodes.INVALID_MEDIA_URN,
        `invalid media URN in cap '${wiring.capAlias}': out= spec: ${e.message}`,
        aliasEntry.capUrnLocation || wiring.location
      );
    }

    // Resolve source media URNs
    const sourceUrns = [];
    for (let i = 0; i < wiring.sources.length; i++) {
      const src = wiring.sources[i];
      if (i === 0) {
        // Primary source: use cap's in= spec
        assignOrCheckNode(src, capInMedia, nodeMedia, wiring.position,
          wiring.sourceLocations ? wiring.sourceLocations[i] : wiring.location);
        sourceUrns.push(capInMedia);
      } else {
        // Secondary source (fan-in): use existing type if assigned,
        // otherwise use wildcard media: — the orchestrator parser will
        // resolve the real type from the cap's args via registry lookup.
        let secondaryMedia = nodeMedia.get(src);
        if (secondaryMedia === undefined) {
          secondaryMedia = MediaUrn.fromString('media:');
          nodeMedia.set(src, secondaryMedia);
        }
        sourceUrns.push(secondaryMedia);
      }
    }

    // Assign target media URN
    assignOrCheckNode(wiring.target, capOutMedia, nodeMedia, wiring.position,
      wiring.targetLocation || wiring.location);

    edges.push(new MachineEdge(sourceUrns, capUrn, capOutMedia, wiring.isLoop));
  }

  return {
    machine: new Machine(edges),
    statements: stmts,
    aliasMap,
    nodeMedia,
  };
}

/**
 * Parse machine notation into a Machine.
 *
 * Uses the Peggy-generated PEG parser to parse the input, then resolves
 * cap URNs and derives media URNs from cap in/out specs.
 *
 * Fails hard — no fallbacks, no guessing, no recovery.
 *
 * Mirrors Rust parse_machine exactly.
 *
 * @param {string} input - Machine notation string
 * @returns {Machine}
 * @throws {MachineSyntaxError}
 */
function parseMachine(input) {
  return _parseMachineInternal(input).machine;
}

/**
 * Parse machine notation and return both the Machine and the raw AST with locations.
 *
 * Use this for LSP tooling — the statements array contains full position information
 * for every element (aliases, cap URNs, sources, targets).
 *
 * @param {string} input - Machine notation string
 * @returns {{ machine: Machine, statements: Object[], aliasMap: Map, nodeMedia: Map }}
 * @throws {MachineSyntaxError}
 */
function parseMachineWithAST(input) {
  return _parseMachineInternal(input);
}

// ============================================================================
// MachineBuilder — programmatic path construction
// ============================================================================

/**
 * Builder for constructing Machines programmatically.
 *
 * Provides a fluent API for building machine graphs without writing
 * machine notation strings. Useful for constructing paths from graph
 * exploration (e.g., selecting paths in the UI).
 */
class MachineBuilder {
  constructor() {
    this._edges = [];
  }

  /**
   * Add an edge to the graph.
   * @param {string[]} sourceUrns - Source media URN strings
   * @param {string} capUrnStr - Cap URN string
   * @param {string} targetUrn - Target media URN string
   * @param {boolean} [isLoop=false] - Whether this edge has ForEach semantics
   * @returns {MachineBuilder} this (for chaining)
   */
  addEdge(sourceUrns, capUrnStr, targetUrn, isLoop = false) {
    const sources = sourceUrns.map(s => MediaUrn.fromString(s));
    const capUrn = CapUrn.fromString(capUrnStr);
    const target = MediaUrn.fromString(targetUrn);
    this._edges.push(new MachineEdge(sources, capUrn, target, isLoop));
    return this;
  }

  /**
   * Add a linear chain of edges from CapGraphEdge[] (from CapGraph.findAllPaths).
   *
   * Each CapGraphEdge has fromUrn, toUrn, and cap (with cap.urn).
   * This converts the path into a series of MachineEdges.
   *
   * @param {CapGraphEdge[]} capGraphEdges - Array of CapGraphEdge from pathfinding
   * @returns {MachineBuilder} this (for chaining)
   */
  addCapGraphPath(capGraphEdges) {
    for (const edge of capGraphEdges) {
      const source = MediaUrn.fromString(edge.fromUrn);
      const target = MediaUrn.fromString(edge.toUrn);
      this._edges.push(new MachineEdge([source], edge.cap.urn, target, false));
    }
    return this;
  }

  /**
   * Build the Machine from the accumulated edges.
   * @returns {Machine}
   */
  build() {
    return new Machine([...this._edges]);
  }
}

// ============================================================================
// Cap & Media Registry Client
// Fetches and caches capability and media registries from capdag.com
// ============================================================================

/**
 * A capability entry from the registry.
 * Matches the denormalized view format from capdag.com /api/capabilities.
 */
class CapRegistryEntry {
  constructor(data) {
    this.urn = data.urn;
    this.title = data.title || '';
    this.command = data.command || '';
    this.description = data.cap_description || '';
    this.args = data.args || [];
    this.output = data.output || null;
    this.mediaSpecs = data.media_specs || [];
    this.urnTags = data.urn_tags || {};
    this.inSpec = data.in_spec || '';
    this.outSpec = data.out_spec || '';
    this.inMediaTitle = data.in_media_title || '';
    this.outMediaTitle = data.out_media_title || '';
  }
}

/**
 * A media spec entry from the registry.
 * Matches the media lookup format from capdag.com /media:*.
 */
class MediaRegistryEntry {
  constructor(data) {
    this.urn = data.urn;
    this.title = data.title || '';
    this.mediaType = data.media_type || '';
    this.description = data.description || '';
  }
}

/**
 * Client for fetching and caching capability and media registries from capdag.com.
 *
 * Uses a time-based cache with configurable TTL. All methods are async.
 * Fails hard on network errors — no silent degradation.
 */
class CapRegistryClient {
  /**
   * @param {string} [baseUrl='https://capdag.com'] - Registry base URL
   * @param {number} [cacheTtlSeconds=300] - Cache TTL in seconds
   */
  constructor(baseUrl = 'https://capdag.com', cacheTtlSeconds = 300) {
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._cacheTtl = cacheTtlSeconds * 1000;
    this._capCache = null;       // { entries: CapRegistryEntry[], fetchedAt: number }
    this._mediaCache = new Map(); // media_urn_string → { entry: MediaRegistryEntry, fetchedAt: number }
  }

  /**
   * Fetch all capabilities from the registry (cached).
   * @returns {Promise<CapRegistryEntry[]>}
   */
  async fetchCapabilities() {
    if (this._capCache && (Date.now() - this._capCache.fetchedAt) < this._cacheTtl) {
      return this._capCache.entries;
    }

    const response = await fetch(`${this._baseUrl}/api/capabilities`);
    if (!response.ok) {
      throw new Error(`Cap registry request failed: HTTP ${response.status} from ${this._baseUrl}/api/capabilities`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(`Invalid cap registry response: expected array, got ${typeof data}`);
    }

    const entries = data.map(d => new CapRegistryEntry(d));
    this._capCache = { entries, fetchedAt: Date.now() };
    return entries;
  }

  /**
   * Lookup a single capability by URN.
   * Uses the capabilities cache if available, otherwise falls back to direct lookup.
   * @param {string} capUrnStr - Cap URN string
   * @returns {Promise<CapRegistryEntry|null>}
   */
  async lookupCap(capUrnStr) {
    // Try cache first
    if (this._capCache && (Date.now() - this._capCache.fetchedAt) < this._cacheTtl) {
      const found = this._capCache.entries.find(e => e.urn === capUrnStr);
      if (found) return found;
    }

    // Direct lookup
    const encoded = encodeURIComponent(capUrnStr);
    const response = await fetch(`${this._baseUrl}/${encoded}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Cap lookup failed: HTTP ${response.status} for ${capUrnStr}`);
    }

    const data = await response.json();
    return new CapRegistryEntry(data);
  }

  /**
   * Lookup a single media spec by URN.
   * @param {string} mediaUrnStr - Media URN string
   * @returns {Promise<MediaRegistryEntry|null>}
   */
  async lookupMedia(mediaUrnStr) {
    // Check cache
    const cached = this._mediaCache.get(mediaUrnStr);
    if (cached && (Date.now() - cached.fetchedAt) < this._cacheTtl) {
      return cached.entry;
    }

    const encoded = encodeURIComponent(mediaUrnStr);
    const response = await fetch(`${this._baseUrl}/${encoded}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Media lookup failed: HTTP ${response.status} for ${mediaUrnStr}`);
    }

    const data = await response.json();
    const entry = new MediaRegistryEntry(data);
    this._mediaCache.set(mediaUrnStr, { entry, fetchedAt: Date.now() });
    return entry;
  }

  /**
   * Get all known media URNs from cached capabilities (in and out specs).
   * Fetches capabilities if not cached.
   * @returns {Promise<string[]>}
   */
  async getKnownMediaUrns() {
    const caps = await this.fetchCapabilities();
    const urns = new Set();
    for (const cap of caps) {
      if (cap.inSpec) urns.add(cap.inSpec);
      if (cap.outSpec) urns.add(cap.outSpec);
    }
    return Array.from(urns).sort();
  }

  /**
   * Get all known op= tag values from cached capabilities.
   * @returns {Promise<string[]>}
   */
  async getKnownOps() {
    const caps = await this.fetchCapabilities();
    const ops = new Set();
    for (const cap of caps) {
      const op = cap.urnTags && cap.urnTags.op;
      if (op) ops.add(op);
    }
    return Array.from(ops).sort();
  }

  /**
   * Invalidate all caches. Next call to any method will fetch fresh data.
   */
  invalidate() {
    this._capCache = null;
    this._mediaCache.clear();
  }
}

// Export for CommonJS
module.exports = {
  CapUrn,
  CapUrnBuilder,
  CapMatcher,
  CapUrnError,
  ErrorCodes,
  MediaUrn,
  MediaUrnError,
  MediaUrnErrorCodes,
  Cap,
  CapArg,
  ArgSource,
  RegisteredBy,
  createCap,
  createCapWithDescription,
  createCapWithMetadata,
  createCapWithDescriptionAndMetadata,
  ValidationError,
  InputValidator,
  OutputValidator,
  CapValidator,
  validateCapArgs,
  RESERVED_CLI_FLAGS,
  MediaSpec,
  MediaSpecError,
  MediaSpecErrorCodes,
  isBinaryCapUrn,
  isJSONCapUrn,
  isStructuredCapUrn,
  resolveMediaUrn,
  buildExtensionIndex,
  mediaUrnsForExtension,
  getExtensionMappings,
  validateNoMediaSpecRedefinition,
  validateNoMediaSpecRedefinitionSync,
  validateNoMediaSpecDuplicates,
  getSchemaBaseURL,
  getProfileURL,
  MEDIA_STRING,
  MEDIA_INTEGER,
  MEDIA_NUMBER,
  MEDIA_BOOLEAN,
  MEDIA_OBJECT,
  MEDIA_STRING_ARRAY,
  MEDIA_INTEGER_ARRAY,
  MEDIA_NUMBER_ARRAY,
  MEDIA_BOOLEAN_ARRAY,
  MEDIA_OBJECT_ARRAY,
  MEDIA_IDENTITY,
  MEDIA_VOID,
  MEDIA_PNG,
  MEDIA_AUDIO,
  MEDIA_VIDEO,
  MEDIA_AUDIO_SPEECH,
  MEDIA_IMAGE_THUMBNAIL,
  // Document types (PRIMARY naming)
  MEDIA_PDF,
  MEDIA_EPUB,
  // Text format types (PRIMARY naming)
  MEDIA_MD,
  MEDIA_TXT,
  MEDIA_RST,
  MEDIA_LOG,
  MEDIA_HTML,
  MEDIA_XML,
  MEDIA_JSON,
  MEDIA_JSON_SCHEMA,
  MEDIA_YAML,
  MEDIA_MODEL_SPEC,
  MEDIA_MODEL_REPO,
  MEDIA_MODEL_DIM,
  MEDIA_DECISION,
  MEDIA_DECISION_ARRAY,
  // Semantic output types - model management
  MEDIA_DOWNLOAD_OUTPUT,
  MEDIA_LIST_OUTPUT,
  MEDIA_STATUS_OUTPUT,
  MEDIA_CONTENTS_OUTPUT,
  MEDIA_AVAILABILITY_OUTPUT,
  MEDIA_PATH_OUTPUT,
  // Semantic output types - inference
  MEDIA_EMBEDDING_VECTOR,
  MEDIA_LLM_INFERENCE_OUTPUT,
  MEDIA_FILE_METADATA,
  MEDIA_DOCUMENT_OUTLINE,
  MEDIA_DISBOUND_PAGE,
  MEDIA_IMAGE_DESCRIPTION,
  MEDIA_TRANSCRIPTION_OUTPUT,
  // File path types
  MEDIA_FILE_PATH,
  MEDIA_FILE_PATH_ARRAY,
  // Semantic text input types
  MEDIA_FRONTMATTER_TEXT,
  MEDIA_MLX_MODEL_PATH,
  // Unified argument type
  CapArgumentValue,
  // Standard cap URN builders
  llmConversationUrn,
  modelAvailabilityUrn,
  modelPathUrn,
  CapMatrixError,
  CapMatrix,
  BestCapSetMatch,
  CompositeCapSet,
  CapBlock,
  CapGraphEdge,
  CapGraphStats,
  CapGraph,
  StdinSource,
  StdinSourceKind,
  // Cartridge Repository
  CartridgeCapSummary,
  CartridgeInfo,
  CartridgeSuggestion,
  CartridgeRepoCache,
  CartridgeRepoClient,
  CartridgeRepoServer,
  // Machine notation
  MachineSyntaxError,
  MachineSyntaxErrorCodes,
  MachineEdge,
  Machine,
  MachineBuilder,
  parseMachine,
  parseMachineWithAST,
  // Cap & Media Registry
  CapRegistryEntry,
  MediaRegistryEntry,
  CapRegistryClient,
};
