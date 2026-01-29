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
   * Check if this cap matches another based on tag compatibility
   *
   * Direction matching (in/out) is checked FIRST:
   * - Both in and out must match (with wildcard support)
   * - Wildcards (*) match any value
   *
   * Then for other tags:
   * - For each tag in the request: cap has same value, wildcard (*), or missing tag
   * - For each tag in the cap: if request is missing that tag, that's fine (cap is more specific)
   * Missing tags are treated as wildcards (less specific, can handle any value).
   *
   * @param {CapUrn} request - The request cap to match against
   * @returns {boolean} Whether this cap matches the request
   */
  matches(request) {
    if (!request) {
      return true;
    }

    // Check direction compatibility first
    // inSpec must match (with wildcard support)
    if (this.inSpec !== '*' && request.inSpec !== '*' && this.inSpec !== request.inSpec) {
      return false;
    }

    // outSpec must match (with wildcard support)
    if (this.outSpec !== '*' && request.outSpec !== '*' && this.outSpec !== request.outSpec) {
      return false;
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
   * Check if this cap can handle a request
   *
   * @param {CapUrn} request - The requested cap
   * @returns {boolean} Whether this cap can handle the request
   */
  canHandle(request) {
    return this.matches(request);
  }

  /**
   * Calculate specificity score for cap matching
   * More specific caps have higher scores and are preferred
   * Includes inSpec and outSpec in the count (if not wildcards)
   *
   * @returns {number} The number of non-wildcard tags plus direction specs
   */
  specificity() {
    let count = 0;
    // Count non-wildcard direction specs
    if (this.inSpec !== '*') {
      count++;
    }
    if (this.outSpec !== '*') {
      count++;
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

    // First check if they're compatible
    if (!this.isCompatibleWith(other)) {
      return false;
    }

    return this.specificity() > other.specificity();
  }

  /**
   * Check if this cap is compatible with another
   *
   * Two caps are compatible if they can potentially match
   * the same types of requests (considering wildcards and missing tags as wildcards)
   * Direction specs (in/out) must be compatible.
   *
   * @param {CapUrn} other - The other cap to check compatibility with
   * @returns {boolean} Whether the caps are compatible
   */
  isCompatibleWith(other) {
    if (!other) {
      return true;
    }

    // Check direction spec compatibility
    if (this.inSpec !== '*' && other.inSpec !== '*' && this.inSpec !== other.inSpec) {
      return false;
    }
    if (this.outSpec !== '*' && other.outSpec !== '*' && this.outSpec !== other.outSpec) {
      return false;
    }

    // Get all unique tag keys from both caps
    const allKeys = new Set([...Object.keys(this.tags), ...Object.keys(other.tags)]);

    for (const key of allKeys) {
      const v1 = this.tags[key];
      const v2 = other.tags[key];

      if (v1 !== undefined && v2 !== undefined) {
        // Both have the tag - they must match or one must be wildcard
        if (v1 !== '*' && v2 !== '*' && v1 !== v2) {
          return false;
        }
      }
      // If only one has the tag, it's compatible (missing tag is wildcard)
    }

    return true;
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
   * Find the most specific cap that can handle a request
   *
   * @param {CapUrn[]} caps - Array of available caps
   * @param {CapUrn} request - The request to match
   * @returns {CapUrn|null} The best matching cap or null if no match
   */
  static findBestMatch(caps, request) {
    let best = null;
    let bestSpecificity = -1;

    for (const cap of caps) {
      if (cap.canHandle(request)) {
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
   * Find all caps that can handle a request, sorted by specificity
   *
   * @param {CapUrn[]} caps - Array of available caps
   * @param {CapUrn} request - The request to match
   * @returns {CapUrn[]} Array of matching caps sorted by specificity (most specific first)
   */
  static findAllMatches(caps, request) {
    const matches = caps.filter(cap => cap.canHandle(request));

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
        if (c1.isCompatibleWith(c2)) {
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
  EMPTY_CONTENT_TYPE: 1,
  UNTERMINATED_QUOTE: 2,
  LEGACY_FORMAT: 3,
  UNRESOLVABLE_MEDIA_URN: 4
};

// ============================================================================
// BUILT-IN SPEC IDS AND DEFINITIONS
// ============================================================================

/**
 * Well-known built-in media URN constants
 * These media URNs are implicitly available and do not need to be declared in mediaSpecs
 */
const MEDIA_STRING = 'media:textable;form=scalar';
const MEDIA_INTEGER = 'media:integer;textable;numeric;form=scalar';
const MEDIA_NUMBER = 'media:textable;numeric;form=scalar';
const MEDIA_BOOLEAN = 'media:bool;textable;form=scalar';
const MEDIA_OBJECT = 'media:form=map;textable';
const MEDIA_STRING_ARRAY = 'media:textable;form=list';
const MEDIA_INTEGER_ARRAY = 'media:integer;textable;numeric;form=list';
const MEDIA_NUMBER_ARRAY = 'media:textable;numeric;form=list';
const MEDIA_BOOLEAN_ARRAY = 'media:bool;textable;form=list';
const MEDIA_OBJECT_ARRAY = 'media:form=list;textable';
const MEDIA_BINARY = 'media:bytes';
const MEDIA_VOID = 'media:void';
// Semantic content types
const MEDIA_PNG = 'media:image;png;bytes';
const MEDIA_AUDIO = 'media:wav;audio;bytes;';
const MEDIA_VIDEO = 'media:video;bytes';
// Semantic AI input types
const MEDIA_AUDIO_SPEECH = 'media:audio;wav;bytes;speech';
const MEDIA_IMAGE_THUMBNAIL = 'media:image;png;bytes;thumbnail';
// Document types (PRIMARY naming - type IS the format)
const MEDIA_PDF = 'media:pdf;bytes';
const MEDIA_EPUB = 'media:epub;bytes';
// Text format types (PRIMARY naming - type IS the format)
const MEDIA_MD = 'media:md;textable';
const MEDIA_TXT = 'media:txt;textable';
const MEDIA_RST = 'media:rst;textable';
const MEDIA_LOG = 'media:log;textable';
const MEDIA_HTML = 'media:html;textable';
const MEDIA_XML = 'media:xml;textable';
const MEDIA_JSON = 'media:json;textable;form=map';
const MEDIA_JSON_SCHEMA = 'media:json;json-schema;textable;form=map';
const MEDIA_YAML = 'media:yaml;textable;form=map';
// Semantic input types
const MEDIA_MODEL_SPEC = 'media:model-spec;textable;form=scalar';
const MEDIA_MODEL_REPO = 'media:model-repo;textable;form=map';
// Semantic output types
const MEDIA_MODEL_DIM = 'media:model-dim;integer;textable;numeric;form=scalar';
const MEDIA_DECISION = 'media:decision;bool;textable;form=scalar';
const MEDIA_DECISION_ARRAY = 'media:decision;bool;textable;form=list';

// =============================================================================
// SCHEMA URL CONFIGURATION
// =============================================================================

const DEFAULT_SCHEMA_BASE = 'https://capns.org/schema';

/**
 * Get the schema base URL from environment variables or default
 *
 * Checks in order:
 * 1. CAPNS_SCHEMA_BASE_URL environment variable
 * 2. CAPNS_REGISTRY_URL environment variable + "/schema"
 * 3. Default: "https://capns.org/schema"
 *
 * @returns {string} The schema base URL
 */
function getSchemaBaseURL() {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.CAPNS_SCHEMA_BASE_URL) {
      return process.env.CAPNS_SCHEMA_BASE_URL;
    }
    if (process.env.CAPNS_REGISTRY_URL) {
      return process.env.CAPNS_REGISTRY_URL + '/schema';
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
// BUILTIN MEDIA SPECS
// =============================================================================

/**
 * Built-in media URN definitions - canonical media spec strings
 * Maps media URN to canonical format: <media-type>; profile=<url>
 *
 * NOTE: These use hardcoded URLs for static initialization.
 * Use getSchemaBaseURL() and getProfileURL() for dynamic resolution.
 */
const BUILTIN_SPECS = {
  [MEDIA_STRING]: 'text/plain; profile=https://capns.org/schema/str',
  [MEDIA_INTEGER]: 'text/plain; profile=https://capns.org/schema/int',
  [MEDIA_NUMBER]: 'text/plain; profile=https://capns.org/schema/num',
  [MEDIA_BOOLEAN]: 'text/plain; profile=https://capns.org/schema/bool',
  [MEDIA_OBJECT]: 'application/json; profile=https://capns.org/schema/obj',
  [MEDIA_STRING_ARRAY]: 'application/json; profile=https://capns.org/schema/str-array',
  [MEDIA_INTEGER_ARRAY]: 'application/json; profile=https://capns.org/schema/int-array',
  [MEDIA_NUMBER_ARRAY]: 'application/json; profile=https://capns.org/schema/num-array',
  [MEDIA_BOOLEAN_ARRAY]: 'application/json; profile=https://capns.org/schema/bool-array',
  [MEDIA_OBJECT_ARRAY]: 'application/json; profile=https://capns.org/schema/obj-array',
  [MEDIA_BINARY]: 'application/octet-stream',
  [MEDIA_VOID]: 'application/x-void; profile=https://capns.org/schema/void',
  // Semantic content types
  [MEDIA_PNG]: 'image/png; profile=https://capns.org/schema/image',
  [MEDIA_AUDIO]: 'audio/wav; profile=https://capns.org/schema/audio',
  [MEDIA_VIDEO]: 'video/mp4; profile=https://capns.org/schema/video',
  // Document types (PRIMARY naming)
  [MEDIA_PDF]: 'application/pdf',
  [MEDIA_EPUB]: 'application/epub+zip',
  // Text format types (PRIMARY naming)
  [MEDIA_MD]: 'text/markdown',
  [MEDIA_TXT]: 'text/plain',
  [MEDIA_RST]: 'text/x-rst',
  [MEDIA_LOG]: 'text/plain',
  [MEDIA_HTML]: 'text/html',
  [MEDIA_XML]: 'application/xml',
  [MEDIA_JSON]: 'application/json',
  [MEDIA_YAML]: 'application/x-yaml'
};

/**
 * Check if a media URN has a marker tag (e.g., bytes, json, textable).
 * Uses TaggedUrn parsing for proper tag detection.
 * @param {string} mediaUrn - The media URN
 * @param {string} tagName - The marker tag name to check
 * @returns {boolean} True if the marker tag is present
 */
function hasMediaUrnTag(mediaUrn, tagName) {
  if (!mediaUrn) return false;
  const parsed = TaggedUrn.fromString(mediaUrn);
  return parsed.getTag(tagName) !== undefined;
}

/**
 * Check if a media URN has a tag with a specific value (e.g., form=map).
 * Uses TaggedUrn parsing for proper tag detection.
 * @param {string} mediaUrn - The media URN
 * @param {string} tagName - The tag key to check
 * @param {string} tagValue - The expected tag value
 * @returns {boolean} True if the tag has the expected value
 */
function hasMediaUrnTagValue(mediaUrn, tagName, tagValue) {
  if (!mediaUrn) return false;
  const parsed = TaggedUrn.fromString(mediaUrn);
  return parsed.getTag(tagName) === tagValue;
}

/**
 * Parsed MediaSpec structure
 *
 * Parses media_spec values in the canonical format:
 * `<media-type>; profile=<url>`
 *
 * Examples:
 * - `application/json; profile="https://capns.org/schema/document-outline"`
 * - `image/png; profile="https://capns.org/schema/thumbnail-image"`
 * - `text/plain; profile=https://capns.org/schema/str`
 *
 * NOTE: The legacy "content-type:" prefix is NO LONGER SUPPORTED and will cause a hard failure.
 */
class MediaSpec {
  /**
   * Create a new MediaSpec
   * @param {string} contentType - The MIME content type
   * @param {string|null} profile - Optional profile URL
   * @param {Object|null} schema - Optional JSON Schema for local validation
   * @param {string|null} title - Optional display-friendly title
   * @param {string|null} description - Optional description
   * @param {string|null} mediaUrn - Source media URN for tag-based checks
   * @param {Object|null} validation - Optional validation rules (min, max, min_length, max_length, pattern, allowed_values)
   * @param {Object|null} metadata - Optional metadata (arbitrary key-value pairs for display/categorization)
   */
  constructor(contentType, profile = null, schema = null, title = null, description = null, mediaUrn = null, validation = null, metadata = null) {
    this.contentType = contentType;
    this.profile = profile;
    this.schema = schema;
    this.title = title;
    this.description = description;
    this.mediaUrn = mediaUrn;
    this.validation = validation;
    this.metadata = metadata;
  }

  /**
   * Parse a media_spec string in canonical format
   * Format: `<media-type>; profile=<url>`
   *
   * IMPORTANT: Legacy "content-type:" prefix is NOT supported and will FAIL HARD
   *
   * @param {string} s - The media_spec string
   * @returns {MediaSpec} The parsed MediaSpec
   * @throws {MediaSpecError} If parsing fails or legacy format detected
   */
  static parse(s) {
    const trimmed = s.trim();
    const lower = trimmed.toLowerCase();

    // FAIL HARD on legacy format - no backward compatibility
    if (lower.startsWith('content-type:')) {
      throw new MediaSpecError(
        MediaSpecErrorCodes.LEGACY_FORMAT,
        "Legacy 'content-type:' prefix is no longer supported. Use canonical format: '<media-type>; profile=<url>'"
      );
    }

    // Split by semicolon to separate mime type from parameters
    const semicolonPos = trimmed.indexOf(';');
    let contentType, paramsStr;

    if (semicolonPos === -1) {
      contentType = trimmed.trim();
      paramsStr = null;
    } else {
      contentType = trimmed.slice(0, semicolonPos).trim();
      paramsStr = trimmed.slice(semicolonPos + 1).trim();
    }

    if (contentType === '') {
      throw new MediaSpecError(MediaSpecErrorCodes.EMPTY_CONTENT_TYPE, "media_type cannot be empty");
    }

    // Parse profile if present
    let profile = null;
    if (paramsStr) {
      profile = MediaSpec.parseProfile(paramsStr);
    }

    return new MediaSpec(contentType, profile);
  }

  /**
   * Parse profile parameter from params string
   * @param {string} params - The parameters string after semicolon
   * @returns {string|null} The profile value or null
   */
  static parseProfile(params) {
    // Look for profile= (case-insensitive)
    const lower = params.toLowerCase();
    const pos = lower.indexOf('profile=');
    if (pos === -1) {
      return null;
    }

    const afterProfile = params.slice(pos + 8);

    // Handle quoted value
    if (afterProfile.startsWith('"')) {
      const rest = afterProfile.slice(1);
      const endPos = rest.indexOf('"');
      if (endPos === -1) {
        throw new MediaSpecError(MediaSpecErrorCodes.UNTERMINATED_QUOTE, "unterminated quote in profile value");
      }
      return rest.slice(0, endPos);
    }

    // Unquoted value - take until semicolon or end
    const semicolonPos = afterProfile.indexOf(';');
    if (semicolonPos !== -1) {
      return afterProfile.slice(0, semicolonPos).trim();
    }
    return afterProfile.trim();
  }

  /**
   * Check if this media spec represents binary data.
   * Returns true if the "bytes" marker tag is present in the source media URN.
   * @returns {boolean} True if binary
   */
  isBinary() {
    if (!this.mediaUrn) return false;
    return hasMediaUrnTag(this.mediaUrn, 'bytes');
  }

  /**
   * Check if this media spec represents a map/object structure (form=map).
   * This indicates a key-value structure, regardless of representation format.
   * @returns {boolean} True if map
   */
  isMap() {
    if (!this.mediaUrn) return false;
    return hasMediaUrnTagValue(this.mediaUrn, 'form', 'map');
  }

  /**
   * Check if this media spec represents a scalar value (form=scalar).
   * @returns {boolean} True if scalar
   */
  isScalar() {
    if (!this.mediaUrn) return false;
    return hasMediaUrnTagValue(this.mediaUrn, 'form', 'scalar');
  }

  /**
   * Check if this media spec represents a list/array structure (form=list).
   * @returns {boolean} True if list
   */
  isList() {
    if (!this.mediaUrn) return false;
    return hasMediaUrnTagValue(this.mediaUrn, 'form', 'list');
  }

  /**
   * Check if this media spec represents structured data (map or list).
   * Structured data can be serialized as JSON when transmitted as text.
   * Note: This does NOT check for the explicit `json` tag - use isJSON() for that.
   * @returns {boolean} True if structured (map or list)
   */
  isStructured() {
    return this.isMap() || this.isList();
  }

  /**
   * Check if this media spec represents JSON representation specifically.
   * Returns true if the "json" marker tag is present in the source media URN.
   * Note: This only checks for explicit JSON format marker.
   * For checking if data is structured (map/list), use isStructured().
   * @returns {boolean} True if JSON representation
   */
  isJSON() {
    if (!this.mediaUrn) return false;
    return hasMediaUrnTag(this.mediaUrn, 'json');
  }

  /**
   * Check if this media spec represents text output.
   * Returns true if the "textable" marker tag is present in the source media URN.
   * @returns {boolean} True if text
   */
  isText() {
    if (!this.mediaUrn) return false;
    return hasMediaUrnTag(this.mediaUrn, 'textable');
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
  static fromCapUrn(capUrn, mediaSpecs = {}) {
    // outSpec is now a required field, so it's always present
    const mediaUrn = capUrn.getOutSpec();

    // Resolve the media URN to a MediaSpec - no fallbacks, fail hard
    return resolveMediaUrn(mediaUrn, mediaSpecs);
  }
}

/**
 * Resolve a media URN to a MediaSpec
 *
 * Resolution algorithm:
 * 1. Look up mediaUrn in mediaSpecs table
 * 2. If not found AND mediaUrn is a known built-in: use built-in definition
 * 3. If not found and not a built-in: FAIL HARD
 *
 * @param {string} mediaUrn - The media URN (e.g., "media:string")
 * @param {Object} mediaSpecs - The mediaSpecs lookup table
 * @returns {MediaSpec} The resolved MediaSpec
 * @throws {MediaSpecError} If media URN cannot be resolved
 */
function resolveMediaUrn(mediaUrn, mediaSpecs = {}) {
  // First check local mediaSpecs table
  if (mediaSpecs && mediaSpecs[mediaUrn]) {
    const def = mediaSpecs[mediaUrn];

    if (typeof def === 'string') {
      // String form: canonical media spec string
      const spec = MediaSpec.parse(def);
      spec.mediaUrn = mediaUrn; // Attach source URN for tag-based checks
      return spec;
    } else if (typeof def === 'object') {
      // Object form: { media_type, profile_uri, schema?, title?, description?, validation?, metadata? }
      const mediaType = def.media_type || def.mediaType;
      const profileUri = def.profile_uri || def.profileUri;
      const schema = def.schema || null;
      const title = def.title || null;
      const description = def.description || null;
      const validation = def.validation || null;
      const metadata = def.metadata || null;

      if (!mediaType) {
        throw new MediaSpecError(
          MediaSpecErrorCodes.UNRESOLVABLE_MEDIA_URN,
          `Media URN '${mediaUrn}' has invalid object definition: missing media_type`
        );
      }

      return new MediaSpec(mediaType, profileUri, schema, title, description, mediaUrn, validation, metadata);
    }
  }

  // Check built-in specs
  if (BUILTIN_SPECS[mediaUrn]) {
    const spec = MediaSpec.parse(BUILTIN_SPECS[mediaUrn]);
    spec.mediaUrn = mediaUrn; // Attach source URN for tag-based checks
    return spec;
  }

  // FAIL HARD - no fallbacks, no guessing
  throw new MediaSpecError(
    MediaSpecErrorCodes.UNRESOLVABLE_MEDIA_URN,
    `Cannot resolve media URN: '${mediaUrn}'. Not found in mediaSpecs table and not a known built-in.`
  );
}

/**
 * Check if a media URN is a known built-in
 * @param {string} mediaUrn - The media URN to check
 * @returns {boolean} True if built-in
 */
function isBuiltinMediaUrn(mediaUrn) {
  return BUILTIN_SPECS.hasOwnProperty(mediaUrn);
}

/**
 * XV5: Validate that inline media_specs don't redefine built-in/registry specs.
 *
 * For capns-js (client-side), we check against BUILTIN_SPECS.
 * Server-side validation (capns_dot_org) should check against the full registry.
 *
 * @param {Object} mediaSpecs - The inline media_specs object from a capability
 * @param {Object} [options] - Validation options
 * @param {Function} [options.registryLookup] - Optional async function to check registry (for server-side)
 * @returns {Promise<{valid: boolean, error?: string, redefines?: string[]}>}
 */
async function validateNoMediaSpecRedefinition(mediaSpecs, options = {}) {
  if (!mediaSpecs || typeof mediaSpecs !== 'object' || Object.keys(mediaSpecs).length === 0) {
    return { valid: true };
  }

  const { registryLookup } = options;
  const redefines = [];

  for (const mediaUrn of Object.keys(mediaSpecs)) {
    // Check against built-in specs first (always available)
    if (isBuiltinMediaUrn(mediaUrn)) {
      redefines.push(mediaUrn);
      continue;
    }

    // If a registry lookup function is provided (server-side), check against it
    if (registryLookup && typeof registryLookup === 'function') {
      try {
        const existsInRegistry = await registryLookup(mediaUrn);
        if (existsInRegistry) {
          redefines.push(mediaUrn);
        }
      } catch (err) {
        // Network/registry unavailable - log warning and allow (graceful degradation)
        console.warn(`[WARN] XV5: Could not verify inline spec '${mediaUrn}' against registry: ${err.message}. Allowing operation in offline mode.`);
      }
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
 * XV5: Synchronous version for checking against built-in specs only.
 * Use this for client-side validation where registry lookup isn't available.
 *
 * @param {Object} mediaSpecs - The inline media_specs object from a capability
 * @returns {{valid: boolean, error?: string, redefines?: string[]}}
 */
function validateNoMediaSpecRedefinitionSync(mediaSpecs) {
  if (!mediaSpecs || typeof mediaSpecs !== 'object' || Object.keys(mediaSpecs).length === 0) {
    return { valid: true };
  }

  const redefines = [];

  for (const mediaUrn of Object.keys(mediaSpecs)) {
    if (isBuiltinMediaUrn(mediaUrn)) {
      redefines.push(mediaUrn);
    }
  }

  if (redefines.length > 0) {
    return {
      valid: false,
      error: `XV5: Inline media specs redefine existing built-in specs: ${redefines.join(', ')}`,
      redefines
    };
  }

  return { valid: true };
}

/**
 * Check if a CapUrn represents binary output.
 * Throws error if the output spec cannot be resolved - no fallbacks.
 * @param {CapUrn} capUrn - The cap URN
 * @param {Object} mediaSpecs - Optional mediaSpecs lookup table
 * @returns {boolean} True if binary
 * @throws {MediaSpecError} If 'out' tag is missing or spec ID cannot be resolved
 */
function isBinaryCapUrn(capUrn, mediaSpecs = {}) {
  const mediaSpec = MediaSpec.fromCapUrn(capUrn, mediaSpecs);
  return mediaSpec.isBinary();
}

/**
 * Check if a CapUrn represents JSON output.
 * Note: This checks for explicit JSON format marker only.
 * Throws error if the output spec cannot be resolved - no fallbacks.
 * @param {CapUrn} capUrn - The cap URN
 * @param {Object} mediaSpecs - Optional mediaSpecs lookup table
 * @returns {boolean} True if explicit JSON tag present
 * @throws {MediaSpecError} If 'out' tag is missing or spec ID cannot be resolved
 */
function isJSONCapUrn(capUrn, mediaSpecs = {}) {
  const mediaSpec = MediaSpec.fromCapUrn(capUrn, mediaSpecs);
  return mediaSpec.isJSON();
}

/**
 * Check if a CapUrn represents structured output (map or list).
 * Structured data can be serialized as JSON when transmitted as text.
 * Throws error if the output spec cannot be resolved - no fallbacks.
 * @param {CapUrn} capUrn - The cap URN
 * @param {Object} mediaSpecs - Optional mediaSpecs lookup table
 * @returns {boolean} True if structured (map or list)
 * @throws {MediaSpecError} If 'out' tag is missing or spec ID cannot be resolved
 */
function isStructuredCapUrn(capUrn, mediaSpecs = {}) {
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
   * @param {string|null} capDescription - Optional description
   * @param {Object} metadata - Optional metadata object
   * @param {Object|null} metadataJson - Optional arbitrary metadata as JSON object
   */
  constructor(urn, title, command, capDescription = null, metadata = {}, metadataJson = null) {
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
    this.metadata = metadata || {};
    this.mediaSpecs = {};  // Spec ID resolution table
    this.args = [];  // Array of CapArg - unified argument format
    this.output = null;
    this.metadata_json = metadataJson;
    this.registered_by = null;  // Registration attribution
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
   * Check if this capability matches a request string
   * @param {string} request - The request string
   * @returns {boolean} Whether this capability matches the request
   */
  matchesRequest(request) {
    try {
      const requestUrn = CapUrn.fromString(request);
      return this.urn.canHandle(requestUrn);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if this capability can handle a request URN
   * @param {CapUrn} requestUrn - The request URN
   * @returns {boolean} Whether this capability can handle the request
   */
  canHandleRequest(requestUrn) {
    return this.urn.canHandle(requestUrn);
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
    // Build complete tags map including in and out
    const allTags = {
      ...this.urn.tags,
      'in': this.urn.inSpec,
      'out': this.urn.outSpec
    };

    const result = {
      urn: {
        tags: allTags
      },
      title: this.title,
      command: this.command,
      cap_description: this.cap_description,
      metadata: this.metadata,
      media_specs: this.mediaSpecs,
      args: this.args.map(a => a.toJSON()),
      output: this.output
    };

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
    // Handle both string and object URN formats
    let urn;
    if (typeof json.urn === 'string') {
      urn = CapUrn.fromString(json.urn);
    } else if (json.urn && json.urn.tags) {
      // Use fromTags to extract in/out from the tags object
      urn = CapUrn.fromTags(json.urn.tags);
    } else {
      throw new Error('Invalid URN format in JSON');
    }

    const cap = new Cap(urn, json.title, json.command, json.cap_description, json.metadata, json.metadata_json);
    cap.mediaSpecs = json.media_specs || json.mediaSpecs || {};
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
    // Match against standard capns.org schemas (both /schema/ and /schemas/ for compatibility)
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
    this.host = host;          // Object implementing executeCap(capUrn, positionalArgs, namedArgs, stdinSource) -> Promise
    this.capabilities = capabilities;  // Array<Cap>
  }
}

/**
 * Unified registry for cap sets (providers and plugins)
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
        if (cap.urn.matches(request)) {
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
        if (cap.urn.matches(request)) {
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
   * Check if any host can handle the specified capability
   * @param {string} requestUrn - The capability URN to check
   * @returns {boolean} Whether the capability can be handled
   */
  canHandle(requestUrn) {
    try {
      this.findCapSets(requestUrn);
      return true;
    } catch (e) {
      return false;
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
// CAP CUBE - Composite Registry
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
   * @param {string[]} positionalArgs - Positional arguments
   * @param {object} namedArgs - Named arguments as key-value pairs
   * @param {StdinSource|null} stdinSource - Optional stdin source (data or file reference)
   * @returns {Promise<{binaryOutput: Uint8Array|null, textOutput: string|null}>}
   */
  async executeCap(capUrn, positionalArgs, namedArgs, stdinSource) {
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
          if (cap.urn.matches(request)) {
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
    return bestHost.executeCap(capUrn, positionalArgs, namedArgs, stdinSource);
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
class CapCube {
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
   * Check if any registry can handle the specified capability
   * @param {string} requestUrn - The capability URN to check
   * @returns {boolean} Whether the capability can be handled
   */
  canHandle(requestUrn) {
    try {
      this.findBestCapSet(requestUrn);
      return true;
    } catch (e) {
      return false;
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
        if (cap.urn.matches(request)) {
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
   * Uses satisfies-based matching instead of exact string matching.
   * @param {string} urn - The media URN
   * @returns {CapGraphEdge[]}
   */
  getOutgoing(urn) {
    // Use TaggedUrn matching: find all edges where the provided URN
    // satisfies the edge's input requirement (fromUrn)
    let providedUrn;
    try {
      providedUrn = TaggedUrn.fromString(urn);
    } catch (e) {
      return []; // Invalid URN, return empty
    }

    const edges = this.edges.filter(edge => {
      try {
        const requirementUrn = TaggedUrn.fromString(edge.fromUrn);
        return providedUrn.matches(requirementUrn);
      } catch (e) {
        return false; // Invalid requirement URN, skip
      }
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
 * For plugins (via gRPC/XPC), using FileReference avoids size limits
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
   * Used for plugins to read files locally instead of sending bytes over the wire.
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

// Export for CommonJS
module.exports = {
  CapUrn,
  CapUrnBuilder,
  CapMatcher,
  CapUrnError,
  ErrorCodes,
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
  isBuiltinMediaUrn,
  validateNoMediaSpecRedefinition,
  validateNoMediaSpecRedefinitionSync,
  BUILTIN_SPECS,
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
  MEDIA_BINARY,
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
  CapMatrixError,
  CapMatrix,
  BestCapSetMatch,
  CompositeCapSet,
  CapCube,
  CapGraphEdge,
  CapGraphStats,
  CapGraph,
  StdinSource,
  StdinSourceKind
};
