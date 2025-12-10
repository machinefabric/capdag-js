// Cap URN JavaScript Implementation
// Follows the exact same rules as Rust, Go, and Objective-C implementations

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
  NUMERIC_KEY: 7
};

/**
 * Cap URN implementation with flat, ordered tags
 */
class CapUrn {
  constructor(tags = {}) {
    // Normalize all keys and values to lowercase for case-insensitive matching
    this.tags = {};
    for (const [key, value] of Object.entries(tags)) {
      this.tags[key.toLowerCase()] = value.toLowerCase();
    }
  }

  /**
   * Create a Cap URN from string representation
   * Format: cap:key1=value1;key2=value2;...
   * 
   * @param {string} s - The Cap URN string
   * @returns {CapUrn} The parsed Cap URN
   * @throws {CapUrnError} If parsing fails
   */
  static fromString(s) {
    if (!s || typeof s !== 'string') {
      throw new CapUrnError(ErrorCodes.INVALID_FORMAT, 'Cap URN cannot be empty');
    }

    // Normalize to lowercase for case-insensitive handling
    const normalized = s.toLowerCase();

    // Ensure "cap:" prefix is present
    if (!normalized.startsWith('cap:')) {
      throw new CapUrnError(ErrorCodes.MISSING_CAP_PREFIX, "Cap URN must start with 'cap:'");
    }

    // Remove the "cap:" prefix
    const tagsPart = normalized.slice(4);

    const tags = {};

    // Remove trailing semicolon if present
    const normalizedTagsPart = tagsPart.replace(/;$/, '');
    
    // Handle empty cap URN (cap: with no tags)
    if (normalizedTagsPart === '') {
      return new CapUrn(tags);
    }

    // Parse tags
    for (const tagStr of normalizedTagsPart.split(';')) {
      const trimmedTag = tagStr.trim();
      if (trimmedTag === '') {
        continue;
      }

      const parts = trimmedTag.split('=');
      if (parts.length !== 2) {
        throw new CapUrnError(ErrorCodes.INVALID_TAG_FORMAT, `Invalid tag format (must be key=value): ${trimmedTag}`);
      }

      const key = parts[0].trim();
      const value = parts[1].trim();

      if (key === '' || value === '') {
        throw new CapUrnError(ErrorCodes.EMPTY_TAG, `Tag key or value cannot be empty: ${trimmedTag}`);
      }

      // Check for duplicate keys
      if (tags.hasOwnProperty(key)) {
        throw new CapUrnError(ErrorCodes.DUPLICATE_KEY, `Duplicate tag key: ${key}`);
      }

      // Validate key cannot be purely numeric
      if (/^\d+$/.test(key)) {
        throw new CapUrnError(ErrorCodes.NUMERIC_KEY, `Tag key cannot be purely numeric: ${key}`);
      }

      // Validate key and value characters
      if (!CapUrn._isValidTagComponent(key, true) || !CapUrn._isValidTagComponent(value, false)) {
        throw new CapUrnError(ErrorCodes.INVALID_CHARACTER, `Invalid character in tag (use alphanumeric, _, -, /, :, ., * in values only): ${trimmedTag}`);
      }

      tags[key] = value;
    }

    return new CapUrn(tags);
  }

  /**
   * Validate that a tag component contains only allowed characters
   * Allowed: alphanumeric, underscore, dash, slash, colon, asterisk (asterisk only in values)
   * 
   * @param {string} s - The component to validate
   * @param {boolean} isKey - Whether this is a key (true) or value (false)
   * @returns {boolean} Whether the component is valid
   */
  static _isValidTagComponent(s, isKey) {
    for (const char of s) {
      const isValid = /[a-zA-Z0-9_\-\/:.]/.test(char) || (!isKey && char === '*');
      if (!isValid) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get the canonical string representation of this cap URN
   * Always includes "cap:" prefix
   * Tags are sorted alphabetically for consistent representation
   * No trailing semicolon in canonical form
   * 
   * @returns {string} The canonical string representation
   */
  toString() {
    if (Object.keys(this.tags).length === 0) {
      return 'cap:';
    }

    // Sort keys for canonical representation
    const sortedKeys = Object.keys(this.tags).sort();
    
    // Build tag string
    const tagParts = sortedKeys.map(key => `${key}=${this.tags[key]}`);
    
    return `cap:${tagParts.join(';')}`;
  }

  /**
   * Get the value of a specific tag
   * Key is normalized to lowercase for case-insensitive lookup
   * 
   * @param {string} key - The tag key
   * @returns {string|undefined} The tag value or undefined if not found
   */
  getTag(key) {
    return this.tags[key.toLowerCase()];
  }

  /**
   * Check if this cap has a specific tag with a specific value
   * Both key and value are normalized to lowercase for case-insensitive comparison
   * 
   * @param {string} key - The tag key
   * @param {string} value - The tag value to check
   * @returns {boolean} Whether the tag exists with the specified value
   */
  hasTag(key, value) {
    const tagValue = this.tags[key.toLowerCase()];
    return tagValue !== undefined && tagValue === value.toLowerCase();
  }

  /**
   * Create a new cap URN with an added or updated tag
   * Both key and value are normalized to lowercase
   * 
   * @param {string} key - The tag key
   * @param {string} value - The tag value
   * @returns {CapUrn} A new CapUrn instance with the tag added/updated
   */
  withTag(key, value) {
    const newTags = { ...this.tags };
    newTags[key.toLowerCase()] = value.toLowerCase();
    return new CapUrn(newTags);
  }

  /**
   * Create a new cap URN with a tag removed
   * Key is normalized to lowercase for case-insensitive removal
   * 
   * @param {string} key - The tag key to remove
   * @returns {CapUrn} A new CapUrn instance with the tag removed
   */
  withoutTag(key) {
    const newTags = { ...this.tags };
    delete newTags[key.toLowerCase()];
    return new CapUrn(newTags);
  }

  /**
   * Check if this cap matches another based on tag compatibility
   * 
   * A cap matches a request if:
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

    // Check all tags that the request specifies
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
   * 
   * @returns {number} The number of non-wildcard tags
   */
  specificity() {
    return Object.values(this.tags).filter(value => value !== '*').length;
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
   * 
   * @param {CapUrn} other - The other cap to check compatibility with
   * @returns {boolean} Whether the caps are compatible
   */
  isCompatibleWith(other) {
    if (!other) {
      return true;
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
   * 
   * @param {string} key - The tag key to set to wildcard
   * @returns {CapUrn} A new CapUrn instance with the tag set to wildcard
   */
  withWildcardTag(key) {
    if (this.tags.hasOwnProperty(key.toLowerCase())) {
      return this.withTag(key, '*');
    }
    return this;
  }

  /**
   * Create a new cap with only specified tags
   * 
   * @param {string[]} keys - Array of tag keys to include
   * @returns {CapUrn} A new CapUrn instance with only the specified tags
   */
  subset(keys) {
    const newTags = {};
    for (const key of keys) {
      const normalizedKey = key.toLowerCase();
      if (this.tags.hasOwnProperty(normalizedKey)) {
        newTags[normalizedKey] = this.tags[normalizedKey];
      }
    }
    return new CapUrn(newTags);
  }

  /**
   * Merge with another cap (other takes precedence for conflicts)
   * 
   * @param {CapUrn} other - The cap to merge with
   * @returns {CapUrn} A new CapUrn instance with merged tags
   */
  merge(other) {
    const newTags = { ...this.tags };
    if (other && other.tags) {
      Object.assign(newTags, other.tags);
    }
    return new CapUrn(newTags);
  }

  /**
   * Check if this cap URN is equal to another
   * 
   * @param {CapUrn} other - The other cap URN to compare with
   * @returns {boolean} Whether the cap URNs are equal
   */
  equals(other) {
    if (!other || !(other instanceof CapUrn)) {
      return false;
    }

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
    this.tags = {};
  }

  /**
   * Add or update a tag
   * Both key and value are normalized to lowercase
   * 
   * @param {string} key - The tag key
   * @param {string} value - The tag value
   * @returns {CapUrnBuilder} This builder instance for chaining
   */
  tag(key, value) {
    this.tags[key.toLowerCase()] = value.toLowerCase();
    return this;
  }

  /**
   * Build the final CapUrn
   * 
   * @returns {CapUrn} A new CapUrn instance
   * @throws {CapUrnError} If no tags have been added
   */
  build() {
    if (Object.keys(this.tags).length === 0) {
      throw new CapUrnError(ErrorCodes.INVALID_FORMAT, 'Cap URN cannot be empty');
    }
    return new CapUrn(this.tags);
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
   */
  constructor(urn, title, command, capDescription = null, metadata = {}) {
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
    this.arguments = { required: [], optional: [] };
    this.output = null;
    this.accepts_stdin = false;
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
   * Add a required argument
   * @param {Object} arg - The argument definition
   */
  addRequiredArgument(arg) {
    this.arguments.required.push(arg);
  }

  /**
   * Add an optional argument
   * @param {Object} arg - The argument definition
   */
  addOptionalArgument(arg) {
    this.arguments.optional.push(arg);
  }

  /**
   * Set the output definition
   * @param {Object} output - The output definition
   */
  setOutput(output) {
    this.output = output;
  }

  /**
   * Check if this capability equals another
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
           JSON.stringify(this.metadata) === JSON.stringify(other.metadata);
  }

  /**
   * Convert to JSON representation
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      urn: {
        tags: this.urn.tags
      },
      title: this.title,
      command: this.command,
      cap_description: this.cap_description,
      metadata: this.metadata,
      arguments: this.arguments,
      output: this.output,
      accepts_stdin: this.accepts_stdin
    };
  }

  /**
   * Create a capability from JSON representation
   * @param {Object} json - The JSON data
   * @returns {Cap} The capability instance
   */
  static fromJSON(json) {
    const urn = new CapUrn(json.urn.tags);
    const cap = new Cap(urn, json.title, json.command, json.cap_description, json.metadata);
    cap.arguments = json.arguments || { required: [], optional: [] };
    cap.output = json.output;
    cap.accepts_stdin = json.accepts_stdin || false;
    return cap;
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

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS
  module.exports = {
    CapUrn,
    CapUrnBuilder,
    CapMatcher,
    CapUrnError,
    ErrorCodes,
    Cap,
    createCap,
    createCapWithDescription,
    createCapWithMetadata,
    createCapWithDescriptionAndMetadata
  };
}

if (typeof window !== 'undefined') {
  // Browser globals
  window.CapUrn = CapUrn;
  window.CapUrnBuilder = CapUrnBuilder;
  window.CapMatcher = CapMatcher;
  window.CapUrnError = CapUrnError;
  window.CapUrnErrorCodes = ErrorCodes;
  window.Cap = Cap;
  window.createCap = createCap;
  window.createCapWithDescription = createCapWithDescription;
  window.createCapWithMetadata = createCapWithMetadata;
  window.createCapWithDescriptionAndMetadata = createCapWithDescriptionAndMetadata;
}