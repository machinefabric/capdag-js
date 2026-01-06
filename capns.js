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
  NUMERIC_KEY: 7,
  UNTERMINATED_QUOTE: 8,
  INVALID_ESCAPE_SEQUENCE: 9
};

// Parser states for state machine
const ParseState = {
  EXPECTING_KEY: 0,
  IN_KEY: 1,
  EXPECTING_VALUE: 2,
  IN_UNQUOTED_VALUE: 3,
  IN_QUOTED_VALUE: 4,
  IN_QUOTED_VALUE_ESCAPE: 5,
  EXPECTING_SEMI_OR_END: 6
};

/**
 * Check if a character is valid for a key
 */
function isValidKeyChar(c) {
  return /[a-zA-Z0-9_\-\/:\.]/.test(c);
}

/**
 * Check if a character is valid for an unquoted value
 */
function isValidUnquotedValueChar(c) {
  return /[a-zA-Z0-9_\-\/:\.\*]/.test(c);
}

/**
 * Check if a value needs quoting for serialization
 */
function needsQuoting(value) {
  for (const c of value) {
    if (c === ';' || c === '=' || c === '"' || c === '\\' || c === ' ' || c.toUpperCase() !== c.toLowerCase() && c === c.toUpperCase()) {
      return true;
    }
  }
  return false;
}

/**
 * Quote a value for serialization
 */
function quoteValue(value) {
  let result = '"';
  for (const c of value) {
    if (c === '"' || c === '\\') {
      result += '\\';
    }
    result += c;
  }
  result += '"';
  return result;
}

/**
 * Cap URN implementation with flat, ordered tags
 */
class CapUrn {
  /**
   * Create a new CapUrn
   * Keys are normalized to lowercase; values are preserved as-is
   * @param {Object} tags - Initial tags (will not be re-normalized in constructor)
   * @param {boolean} skipNormalization - If true, skip key normalization (internal use)
   */
  constructor(tags = {}, skipNormalization = false) {
    this.tags = {};
    if (skipNormalization) {
      this.tags = { ...tags };
    } else {
      for (const [key, value] of Object.entries(tags)) {
        this.tags[key.toLowerCase()] = value;
      }
    }
  }

  /**
   * Create a Cap URN from string representation
   * Format: cap:key1=value1;key2=value2;... or cap:key1="value with spaces";key2=simple
   *
   * Case handling:
   * - Keys: Always normalized to lowercase
   * - Unquoted values: Normalized to lowercase
   * - Quoted values: Case preserved exactly as specified
   *
   * @param {string} s - The Cap URN string
   * @returns {CapUrn} The parsed Cap URN
   * @throws {CapUrnError} If parsing fails
   */
  static fromString(s) {
    if (!s || typeof s !== 'string') {
      throw new CapUrnError(ErrorCodes.INVALID_FORMAT, 'Cap URN cannot be empty');
    }

    // Check for "cap:" prefix (case-insensitive)
    if (s.length < 4 || s.slice(0, 4).toLowerCase() !== 'cap:') {
      throw new CapUrnError(ErrorCodes.MISSING_CAP_PREFIX, "Cap URN must start with 'cap:'");
    }

    const tagsPart = s.slice(4);
    const tags = {};

    // Handle empty cap URN (cap: with no tags or just semicolon)
    if (tagsPart === '' || tagsPart === ';') {
      return new CapUrn(tags, true);
    }

    let state = ParseState.EXPECTING_KEY;
    let currentKey = '';
    let currentValue = '';
    const chars = [...tagsPart];
    let pos = 0;

    const finishTag = () => {
      if (currentKey === '') {
        throw new CapUrnError(ErrorCodes.EMPTY_TAG, 'empty key');
      }
      if (currentValue === '') {
        throw new CapUrnError(ErrorCodes.EMPTY_TAG, `empty value for key '${currentKey}'`);
      }

      // Check for duplicate keys
      if (tags.hasOwnProperty(currentKey)) {
        throw new CapUrnError(ErrorCodes.DUPLICATE_KEY, `Duplicate tag key: ${currentKey}`);
      }

      // Validate key cannot be purely numeric
      if (/^\d+$/.test(currentKey)) {
        throw new CapUrnError(ErrorCodes.NUMERIC_KEY, `Tag key cannot be purely numeric: ${currentKey}`);
      }

      tags[currentKey] = currentValue;
      currentKey = '';
      currentValue = '';
    };

    while (pos < chars.length) {
      const c = chars[pos];

      switch (state) {
        case ParseState.EXPECTING_KEY:
          if (c === ';') {
            // Empty segment, skip
            pos++;
            continue;
          } else if (isValidKeyChar(c)) {
            currentKey += c.toLowerCase();
            state = ParseState.IN_KEY;
          } else {
            throw new CapUrnError(ErrorCodes.INVALID_CHARACTER, `invalid character '${c}' at position ${pos}`);
          }
          break;

        case ParseState.IN_KEY:
          if (c === '=') {
            if (currentKey === '') {
              throw new CapUrnError(ErrorCodes.EMPTY_TAG, 'empty key');
            }
            state = ParseState.EXPECTING_VALUE;
          } else if (isValidKeyChar(c)) {
            currentKey += c.toLowerCase();
          } else {
            throw new CapUrnError(ErrorCodes.INVALID_CHARACTER, `invalid character '${c}' in key at position ${pos}`);
          }
          break;

        case ParseState.EXPECTING_VALUE:
          if (c === '"') {
            state = ParseState.IN_QUOTED_VALUE;
          } else if (c === ';') {
            throw new CapUrnError(ErrorCodes.EMPTY_TAG, `empty value for key '${currentKey}'`);
          } else if (isValidUnquotedValueChar(c)) {
            currentValue += c.toLowerCase();
            state = ParseState.IN_UNQUOTED_VALUE;
          } else {
            throw new CapUrnError(ErrorCodes.INVALID_CHARACTER, `invalid character '${c}' in value at position ${pos}`);
          }
          break;

        case ParseState.IN_UNQUOTED_VALUE:
          if (c === ';') {
            finishTag();
            state = ParseState.EXPECTING_KEY;
          } else if (isValidUnquotedValueChar(c)) {
            currentValue += c.toLowerCase();
          } else {
            throw new CapUrnError(ErrorCodes.INVALID_CHARACTER, `invalid character '${c}' in unquoted value at position ${pos}`);
          }
          break;

        case ParseState.IN_QUOTED_VALUE:
          if (c === '"') {
            state = ParseState.EXPECTING_SEMI_OR_END;
          } else if (c === '\\') {
            state = ParseState.IN_QUOTED_VALUE_ESCAPE;
          } else {
            // Any character allowed in quoted value, preserve case
            currentValue += c;
          }
          break;

        case ParseState.IN_QUOTED_VALUE_ESCAPE:
          if (c === '"' || c === '\\') {
            currentValue += c;
            state = ParseState.IN_QUOTED_VALUE;
          } else {
            throw new CapUrnError(ErrorCodes.INVALID_ESCAPE_SEQUENCE, `invalid escape sequence at position ${pos} (only \\" and \\\\ allowed)`);
          }
          break;

        case ParseState.EXPECTING_SEMI_OR_END:
          if (c === ';') {
            finishTag();
            state = ParseState.EXPECTING_KEY;
          } else {
            throw new CapUrnError(ErrorCodes.INVALID_CHARACTER, `expected ';' or end after quoted value, got '${c}' at position ${pos}`);
          }
          break;
      }

      pos++;
    }

    // Handle end of input
    switch (state) {
      case ParseState.IN_UNQUOTED_VALUE:
      case ParseState.EXPECTING_SEMI_OR_END:
        finishTag();
        break;
      case ParseState.EXPECTING_KEY:
        // Valid - trailing semicolon or empty input after prefix
        break;
      case ParseState.IN_QUOTED_VALUE:
      case ParseState.IN_QUOTED_VALUE_ESCAPE:
        throw new CapUrnError(ErrorCodes.UNTERMINATED_QUOTE, `unterminated quote at position ${pos}`);
      case ParseState.IN_KEY:
        throw new CapUrnError(ErrorCodes.INVALID_TAG_FORMAT, `incomplete tag '${currentKey}'`);
      case ParseState.EXPECTING_VALUE:
        throw new CapUrnError(ErrorCodes.EMPTY_TAG, `empty value for key '${currentKey}'`);
    }

    return new CapUrn(tags, true);
  }

  /**
   * Get the canonical string representation of this cap URN
   * Always includes "cap:" prefix
   * Tags are sorted alphabetically for consistent representation
   * No trailing semicolon in canonical form
   * Values are quoted only when necessary (smart quoting)
   *
   * @returns {string} The canonical string representation
   */
  toString() {
    if (Object.keys(this.tags).length === 0) {
      return 'cap:';
    }

    // Sort keys for canonical representation
    const sortedKeys = Object.keys(this.tags).sort();

    // Build tag string with smart quoting
    const tagParts = sortedKeys.map(key => {
      const value = this.tags[key];
      if (needsQuoting(value)) {
        return `${key}=${quoteValue(value)}`;
      } else {
        return `${key}=${value}`;
      }
    });

    return `cap:${tagParts.join(';')}`;
  }

  /**
   * Get the value of a specific tag
   * Key is normalized to lowercase for lookup
   *
   * @param {string} key - The tag key
   * @returns {string|undefined} The tag value or undefined if not found
   */
  getTag(key) {
    return this.tags[key.toLowerCase()];
  }

  /**
   * Check if this cap has a specific tag with a specific value
   * Key is normalized to lowercase; value comparison is case-sensitive
   *
   * @param {string} key - The tag key
   * @param {string} value - The tag value to check
   * @returns {boolean} Whether the tag exists with the specified value
   */
  hasTag(key, value) {
    const tagValue = this.tags[key.toLowerCase()];
    return tagValue !== undefined && tagValue === value;
  }

  /**
   * Create a new cap URN with an added or updated tag
   * Key is normalized to lowercase; value is preserved as-is
   *
   * @param {string} key - The tag key
   * @param {string} value - The tag value
   * @returns {CapUrn} A new CapUrn instance with the tag added/updated
   */
  withTag(key, value) {
    const newTags = { ...this.tags };
    newTags[key.toLowerCase()] = value;
    return new CapUrn(newTags, true);
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
    return new CapUrn(newTags, true);
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
    return new CapUrn(newTags, true);
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
    return new CapUrn(newTags, true);
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
   * Key is normalized to lowercase; value is preserved as-is
   *
   * @param {string} key - The tag key
   * @param {string} value - The tag value
   * @returns {CapUrnBuilder} This builder instance for chaining
   */
  tag(key, value) {
    this.tags[key.toLowerCase()] = value;
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
    return new CapUrn(this.tags, true);
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
    this.arguments = { required: [], optional: [] };
    this.output = null;
    this.accepts_stdin = false;
    this.metadata_json = metadataJson;
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
           JSON.stringify(this.metadata_json) === JSON.stringify(other.metadata_json);
  }

  /**
   * Convert to JSON representation
   * @returns {Object} JSON representation
   */
  toJSON() {
    const result = {
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
    const urn = CapUrn.fromString(json.urn);
    const cap = new Cap(urn, json.title, json.command, json.cap_description, json.metadata, json.metadata_json);
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
        return `Cap '${capUrn}' argument '${details.argumentName}' expects type '${details.expectedType}' but received '${details.actualType}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'ArgumentValidationFailed':
        return `Cap '${capUrn}' argument '${details.argumentName}' failed validation rule '${details.validationRule}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'InvalidOutputType':
        return `Cap '${capUrn}' output expects type '${details.expectedType}' but received '${details.actualType}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'OutputValidationFailed':
        return `Cap '${capUrn}' output failed validation rule '${details.validationRule}' with value: ${JSON.stringify(details.actualValue)}`;
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
   */
  static validateSingleArgument(cap, argDef, value) {
    // Type validation
    InputValidator.validateArgumentType(cap, argDef, value);

    // Validation rules
    InputValidator.validateArgumentRules(cap, argDef, value);
  }

  /**
   * Validate argument type
   */
  static validateArgumentType(cap, argDef, value) {
    const capUrn = cap.urnString();
    const actualType = InputValidator.getJsonTypeName(value);

    let typeMatches = false;
    switch (argDef.argType) {
      case 'string':
        typeMatches = typeof value === 'string';
        break;
      case 'integer':
        typeMatches = Number.isInteger(value);
        break;
      case 'number':
        typeMatches = typeof value === 'number' && !isNaN(value);
        break;
      case 'boolean':
        typeMatches = typeof value === 'boolean';
        break;
      case 'array':
        typeMatches = Array.isArray(value);
        break;
      case 'object':
        typeMatches = typeof value === 'object' && value !== null && !Array.isArray(value);
        break;
      case 'binary':
        typeMatches = typeof value === 'string'; // Binary as base64 string
        break;
      default:
        typeMatches = false;
    }

    if (!typeMatches) {
      throw new ValidationError('InvalidArgumentType', capUrn, {
        argumentName: argDef.name,
        expectedType: argDef.argType,
        actualType: actualType,
        actualValue: value
      });
    }
  }

  /**
   * Validate argument rules (min/max, length, pattern, allowed values)
   */
  static validateArgumentRules(cap, argDef, value) {
    const capUrn = cap.urnString();
    const validation = argDef.validation;

    if (!validation) return;

    // Min/max validation for numbers
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        throw new ValidationError('ArgumentValidationFailed', capUrn, {
          argumentName: argDef.name,
          validationRule: `min value ${validation.min}`,
          actualValue: value
        });
      }
      if (validation.max !== undefined && value > validation.max) {
        throw new ValidationError('ArgumentValidationFailed', capUrn, {
          argumentName: argDef.name,
          validationRule: `max value ${validation.max}`,
          actualValue: value
        });
      }
    }

    // Length validation for strings and arrays
    if (typeof value === 'string' || Array.isArray(value)) {
      const length = value.length;
      if (validation.minLength !== undefined && length < validation.minLength) {
        throw new ValidationError('ArgumentValidationFailed', capUrn, {
          argumentName: argDef.name,
          validationRule: `min length ${validation.minLength}`,
          actualValue: value
        });
      }
      if (validation.maxLength !== undefined && length > validation.maxLength) {
        throw new ValidationError('ArgumentValidationFailed', capUrn, {
          argumentName: argDef.name,
          validationRule: `max length ${validation.maxLength}`,
          actualValue: value
        });
      }
    }

    // Pattern validation for strings
    if (typeof value === 'string' && validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        throw new ValidationError('ArgumentValidationFailed', capUrn, {
          argumentName: argDef.name,
          validationRule: `pattern ${validation.pattern}`,
          actualValue: value
        });
      }
    }

    // Allowed values validation
    if (validation.allowedValues && Array.isArray(validation.allowedValues)) {
      if (!validation.allowedValues.includes(value)) {
        throw new ValidationError('ArgumentValidationFailed', capUrn, {
          argumentName: argDef.name,
          validationRule: `allowed values [${validation.allowedValues.join(', ')}]`,
          actualValue: value
        });
      }
    }
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
   * Validate output against cap output schema
   */
  static validateOutput(cap, output) {
    const capUrn = cap.urnString();
    const outputDef = cap.output;

    if (!outputDef) return; // No output definition to validate against

    const actualType = InputValidator.getJsonTypeName(output);

    // Type validation
    let typeMatches = false;
    switch (outputDef.outputType) {
      case 'string':
        typeMatches = typeof output === 'string';
        break;
      case 'integer':
        typeMatches = Number.isInteger(output);
        break;
      case 'number':
        typeMatches = typeof output === 'number' && !isNaN(output);
        break;
      case 'boolean':
        typeMatches = typeof output === 'boolean';
        break;
      case 'array':
        typeMatches = Array.isArray(output);
        break;
      case 'object':
        typeMatches = typeof output === 'object' && output !== null && !Array.isArray(output);
        break;
      case 'binary':
        typeMatches = typeof output === 'string'; // Binary as base64 string
        break;
      default:
        typeMatches = false;
    }

    if (!typeMatches) {
      throw new ValidationError('InvalidOutputType', capUrn, {
        expectedType: outputDef.outputType,
        actualType: actualType,
        actualValue: output
      });
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
    createCapWithDescriptionAndMetadata,
    ValidationError,
    InputValidator,
    OutputValidator,
    CapValidator
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
  window.ValidationError = ValidationError;
  window.InputValidator = InputValidator;
  window.OutputValidator = OutputValidator;
  window.CapValidator = CapValidator;
}
