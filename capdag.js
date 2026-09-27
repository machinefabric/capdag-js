// Cap URN JavaScript Implementation
// Follows the exact same rules as Rust, Go, and Objective-C implementations
//
// Dispatch, acceptance, equivalence and specificity are decided by code
// generated from the proved model in ../formal (Lean) by lungo, in ./formal,
// not written here. It runs as WebAssembly, instantiated once when this module
// is first imported.

import { TaggedUrn } from 'tagged-urn';
import * as machineParser from './machine-parser.js';
import { load } from './formal/index.js';

const model = await load();

// Node's modules, for what works with the file system and with processes:
// cartridge discovery, installation records and directory hashes. They exist
// only under Node; elsewhere this module loads without them, and asking for
// them there is an error naming what needed them.
const node = (typeof process !== 'undefined' && process.versions && process.versions.node)
  ? {
      fs: await import('node:fs'),
      path: await import('node:path'),
      crypto: await import('node:crypto'),
      childProcess: await import('node:child_process'),
    }
  : null;

function nodeModules(what) {
  if (node === null) {
    throw new Error(`capdag: ${what} needs Node's file system and processes, which this runtime does not have`);
  }
  return node;
}

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
  MISSING_OUT_SPEC: 11,
  EMPTY_VALUE: 12,
  INVALID_IN_SPEC: 13,
  INVALID_OUT_SPEC: 14,
  INVALID_EFFECT: 15,
  INVALID_EFFECT_APPLICATION: 16,
  ILLEGAL_DECLARATION: 17
};

// Note: All parsing is delegated to TaggedUrn from tagged-urn-js
// No duplicate state machine or parsing helpers needed here

/**
 * Cap URN implementation with direction specs and optional tags.
 *
 * Direction rules match the Rust reference:
 * - missing `in` or `out` defaults to `media:`
 * - `in=*` and `out=*` normalize to `media:`
 * - empty `in=` / `out=` are rejected
 * - tags: Other optional tags (no longer contains in/out)
 */
/**
 * Normalize a parsed direction tag to canonical wildcard semantics.
 * Missing tags and `*` both become `media:`.
 *
 * @param {TaggedUrn} taggedUrn - Parsed tagged URN
 * @param {string} tagName - `in` or `out`
 * @returns {string} Normalized direction spec
 */
function processDirectionTag(taggedUrn, tagName) {
  const rawValue = taggedUrn.getTag(tagName);
  if (rawValue === undefined || rawValue === '*') {
    return 'media:';
  }
  if (rawValue === '') {
    throw new CapUrnError(
      tagName === 'in' ? ErrorCodes.INVALID_IN_SPEC : ErrorCodes.INVALID_OUT_SPEC,
      `Empty value for '${tagName}' tag is not allowed`
    );
  }
  return rawValue;
}

/**
 * Canonicalize a direction spec via MediaUrn parsing.
 *
 * @param {string} spec - Media URN string
 * @param {string} tagName - `in` or `out`
 * @returns {string} Canonical media URN string
 */
function canonicalizeDirectionSpec(spec, tagName) {
  if (spec === 'media:' || spec === '*') {
    return 'media:';
  }

  try {
    return MediaUrn.fromString(spec).toString();
  } catch (error) {
    throw new CapUrnError(
      tagName === 'in' ? ErrorCodes.INVALID_IN_SPEC : ErrorCodes.INVALID_OUT_SPEC,
      `Invalid media URN for ${tagName} spec '${spec}': ${error.message}`
    );
  }
}

/**
 * Validate a direction spec while preserving the caller-provided string.
 * This matches the reference `with_in_spec` / `with_out_spec` behavior.
 *
 * @param {string} spec - Media URN string
 * @param {string} tagName - `in` or `out`
 * @returns {string} The original spec when valid
 */
function validatePreservedDirectionSpec(spec, tagName) {
  if (spec === 'media:' || spec === '*') {
    return 'media:';
  }

  try {
    MediaUrn.fromString(spec);
    return spec;
  } catch (error) {
    throw new CapUrnError(
      tagName === 'in' ? ErrorCodes.INVALID_IN_SPEC : ErrorCodes.INVALID_OUT_SPEC,
      `Invalid media URN for ${tagName} spec '${spec}': ${error.message}`
    );
  }
}

/**
 * Functional category of a cap, derived from all four structural axes
 * (`in`, `out`, `effect`, and the remaining tags). The classification is **logical** —
 * the dispatch protocol does not branch on CapKind. Exposed so tools,
 * UIs, planners, and tests can reason about a cap's role without
 * re-deriving the rules.
 *
 * `media:void` is the **unit type** (no meaningful value). `media:`
 * is the **top type** (universal wildcard). With those anchors the
 * five kinds fall out:
 *
 *   IDENTITY   in=media:, out=media:, effect=none, no other tags  → A → A
 *   SOURCE     in=media:void, out!=void              → () → B
 *   SINK       in!=void,    out=media:void           → A → ()
 *   EFFECT     in=media:void, out=media:void         → () → ()
 *   TRANSFORM  anything else
 *
 * `cap:effect=none` is the categorical identity morphism.
 *
 * String values are snake_case to match other capdag enum
 * serializations on the wire.
 */
const CapKind = Object.freeze({
  IDENTITY: 'identity',
  SOURCE: 'source',
  SINK: 'sink',
  EFFECT: 'effect',
  TRANSFORM: 'transform',
});

const CapEffect = Object.freeze({
  DECLARED: 'declared',
  NONE: 'none',
  PATCH: 'patch',
  ANY: '?',
});

function normalizeEffectValue(rawValue) {
  if (rawValue === undefined || rawValue === null) return CapEffect.DECLARED;
  if (rawValue === '?' || rawValue === '*') return CapEffect.ANY;
  if (rawValue === CapEffect.DECLARED) return CapEffect.DECLARED;
  if (rawValue === CapEffect.NONE) return CapEffect.NONE;
  if (rawValue === CapEffect.PATCH) return CapEffect.PATCH;
  if (rawValue === '') {
    throw new CapUrnError(ErrorCodes.INVALID_EFFECT, "Empty value for 'effect' tag is not allowed");
  }
  throw new CapUrnError(
    ErrorCodes.INVALID_EFFECT,
    `Unsupported effect '${rawValue}'. Supported values are declared, none, patch, or explicit unconstrained ?effect/effect=*`
  );
}

function validateNonStructuralTags(tags) {
  try {
    const serialized = new TaggedUrn('cap', tags).toString();
    TaggedUrn.fromString(serialized);
  } catch (error) {
    const msg = error && error.message ? error.message : String(error);
    const msgLower = msg.toLowerCase();
    if (msgLower.includes('duplicate')) {
      throw new CapUrnError(ErrorCodes.DUPLICATE_KEY, msg);
    }
    if (msgLower.includes('numeric') || msgLower.includes('purely numeric')) {
      throw new CapUrnError(ErrorCodes.NUMERIC_KEY, msg);
    }
    if (msgLower.includes('invalid character')) {
      throw new CapUrnError(ErrorCodes.INVALID_CHARACTER, msg);
    }
    if (msgLower.includes('escape')) {
      throw new CapUrnError(ErrorCodes.INVALID_ESCAPE_SEQUENCE, msg);
    }
    throw new CapUrnError(ErrorCodes.INVALID_TAG_FORMAT, msg);
  }
}

/**
 * A tagged URN as capdag's model takes it. Each program generated for
 * JavaScript runs in a WebAssembly instance of its own, so tagged-urn's model
 * value of a URN cannot pass here: this program makes its own, from the same
 * tags, with the same function of the same model.
 */
function modelUrn(urn) {
  const made = model.make(urn.prefix, urn.modelTags());
  if (made === null) {
    throw new Error(`capdag: the model refused ${urn.toString()}, whose keys are sorted`);
  }
  return made;
}

const MODEL_EFFECTS = Object.freeze({
  declared: Object.freeze({ kind: 'declared' }),
  none: Object.freeze({ kind: 'none' }),
  patch: Object.freeze({ kind: 'patch' }),
  '?': Object.freeze({ kind: 'unspecified' }),
});

class CapUrn {
  // Per-axis weights for cap-URN specificity. Two orders of
  // magnitude separate each axis to keep them in distinct digit
  // slots while folding into a single comparable integer.
  //   spec_C(c) = WEIGHT_OUT*spec_U(out) + WEIGHT_IN*spec_U(in) + spec_U(y)
  static WEIGHT_OUT = 10000;
  static WEIGHT_IN = 100;

  /**
   * Create a new CapUrn with direction specs.
   * @param {string} inSpec - Input media URN (e.g., "media:void")
   * @param {string} outSpec - Output media URN (e.g., "media:object")
   * @param {string} effect - Runtime media identity effect
   * @param {Object} tags - Other tags (must NOT contain 'in', 'out', or 'effect')
   */
  constructor(inSpec, outSpec, effect = CapEffect.DECLARED, tags = {}) {
    this.inSpec = canonicalizeDirectionSpec(inSpec, 'in');
    this.outSpec = canonicalizeDirectionSpec(outSpec, 'out');
    this.effectValue = normalizeEffectValue(effect);
    this.tags = {};
    // Copy tags, filtering out any structural coordinates that might have slipped through
    for (const [key, value] of Object.entries(tags)) {
      const keyLower = key.toLowerCase();
      if (keyLower !== 'in' && keyLower !== 'out' && keyLower !== 'effect') {
        this.tags[keyLower] = value;
      }
    }
    validateNonStructuralTags(this.tags);
    this._validateAdmissible();
    // The same cap on the proved model's side: its three URNs and its effect.
    // Dispatch, acceptance, equivalence and specificity are asked of it. Made
    // here, from the same fields, and the cap is frozen, so the two can never
    // describe different caps; it is not enumerable, so it is not part of what
    // a cap serializes or compares as.
    const formal = {
      input: modelUrn(MediaUrn.fromString(this.inSpec)._urn),
      output: modelUrn(MediaUrn.fromString(this.outSpec)._urn),
      other: modelUrn(new TaggedUrn('cap', this.tags)),
      effect: MODEL_EFFECTS[this.effectValue],
    };
    Object.defineProperty(this, 'formal', { value: formal, enumerable: false });
    Object.freeze(this.tags);
    Object.freeze(this);
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
   * Get the canonical effect coordinate.
   * @returns {string}
   */
  getEffect() {
    return this.effectValue;
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
   * Functional category of this cap, derived from all four axes:
   * `in`, `out`, `effect`, and the remaining y-axis tags.
   *
   * Identity requires top/top, no other tags, and explicit
   * `effect=none`.
   *
   * @returns {string} A {@link CapKind} value (snake_case string).
   * @throws {MediaUrnError} If either side is not a valid media URN
   *   (only happens on internally inconsistent state since
   *   construction validates both sides).
   */
  kind() {
    const inMedia = this.inMediaUrn();
    const outMedia = this.outMediaUrn();

    const inVoid = inMedia.isVoid();
    const outVoid = outMedia.isVoid();
    const inTop = inMedia.isTop();
    const outTop = outMedia.isTop();
    const noExtraTags = Object.keys(this.tags).length === 0;

    if (inTop && outTop && noExtraTags) {
      if (this.effectValue === CapEffect.NONE) return CapKind.IDENTITY;
    }
    if (inVoid && outVoid) return CapKind.EFFECT;
    if (inVoid) return CapKind.SOURCE;
    if (outVoid) return CapKind.SINK;
    return CapKind.TRANSFORM;
  }

  /**
   * Create a Cap URN from string representation
   * Format: cap:in="<media-urn>";out="<media-urn>";key1=value1;key2=value2;...
   *
   * Missing `in` / `out` default to `media:`. `in=*` / `out=*` are also
   * normalized to `media:`.
   *
   * Uses TaggedUrn for parsing to ensure consistent behavior across implementations.
   *
   * @param {string} s - The Cap URN string
   * @returns {CapUrn} The parsed Cap URN
   * @throws {CapUrnError} If parsing fails or direction specs are invalid
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

    const inSpec = processDirectionTag(taggedUrn, 'in');
    const outSpec = processDirectionTag(taggedUrn, 'out');

    const effect = normalizeEffectValue(taggedUrn.getTag('effect'));

    // Build remaining tags (excluding in/out/effect)
    const remainingTags = {};
    for (const [key, value] of Object.entries(taggedUrn.tags)) {
      if (key !== 'in' && key !== 'out' && key !== 'effect') {
        remainingTags[key] = value;
      }
    }

    return new CapUrn(inSpec, outSpec, effect, remainingTags);
  }

  /**
   * Create a Cap URN from a tags object.
   * Missing structural coordinates default exactly as they do in string
   * parsing (`in=media:`, `out=media:`, `effect=declared`).
   *
   * @param {Object} tags - Object containing all tags including 'in' and 'out'
   * @returns {CapUrn} The parsed Cap URN
   * @throws {CapUrnError} If `in` or `out` tags are missing or invalid
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

    if (inSpec === '') {
      throw new CapUrnError(ErrorCodes.INVALID_IN_SPEC, "Empty value for 'in' tag is not allowed");
    }
    if (outSpec === '') {
      throw new CapUrnError(ErrorCodes.INVALID_OUT_SPEC, "Empty value for 'out' tag is not allowed");
    }

    const effect = normalizeEffectValue(tags['effect'] || tags['EFFECT']);

    // Build remaining tags (excluding in/out/effect)
    const remainingTags = {};
    for (const [key, value] of Object.entries(tags)) {
      const keyLower = key.toLowerCase();
      if (keyLower !== 'in' && keyLower !== 'out' && keyLower !== 'effect') {
        remainingTags[keyLower] = value;
      }
    }

    return new CapUrn(inSpec, outSpec, effect, remainingTags);
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
    // `in` and `out` segments are emitted only when they refine beyond
    // the trivial wildcard `media:`. Missing `effect` means the default
    // `declared`; `effect=none` is preserved.
    const allTags = { ...this.tags };
    if (this.inSpec !== 'media:') {
      allTags['in'] = this.inSpec;
    }
    if (this.outSpec !== 'media:') {
      allTags['out'] = this.outSpec;
    }
    if (this.effectValue !== CapEffect.DECLARED) {
      allTags['effect'] = this.effectValue;
    }

    const taggedUrn = new TaggedUrn('cap', allTags, true);
    return taggedUrn.toString();
  }

  /**
   * Get the value of a specific tag
   * Key is normalized to lowercase for lookup
   * Returns inSpec for "in" key, outSpec for "out" key, and the effect
   * coordinate for "effect".
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
    if (keyLower === 'effect') {
      return this.effectValue;
    }
    return this.tags[keyLower];
  }

  /**
   * Check if this cap has a specific tag with a specific value
   * Key is normalized to lowercase; value comparison is case-sensitive
   * Checks inSpec for "in" key, outSpec for "out" key, and effect for "effect"
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
    if (keyLower === 'effect') {
      return this.effectValue === value;
    }
    const tagValue = this.tags[keyLower];
    return tagValue !== undefined && tagValue === value;
  }

  /**
   * Check whether a marker tag (a tag whose value is "*") is present at the
   * given key. Equivalent to hasTag(tagName, "*") but expresses authorial
   * intent: this tag is present as a marker (a wildcard-valued tag that
   * serializes as just the key), not as a key=value pair. Direction specs
   * (in/out) are not markers.
   * Example: cap:constrained;... has marker tag "constrained".
   *
   * @param {string} tagName - The marker key
   * @returns {boolean} Whether the tag exists with value "*"
   */
  hasMarkerTag(tagName) {
    const keyLower = tagName.toLowerCase();
    if (keyLower === 'in' || keyLower === 'out' || keyLower === 'effect') {
      return false;
    }
    return this.tags[keyLower] === '*';
  }

  /**
   * Create a new cap URN with an added or updated tag.
   * Reserved structural coordinates must be changed through dedicated
   * accessors.
   *
   * @param {string} key - The tag key
   * @param {string} value - The tag value
   * @returns {CapUrn} A new CapUrn instance with the tag added/updated
   */
  withTag(key, value) {
    if (value === '') {
      throw new CapUrnError(ErrorCodes.EMPTY_VALUE, `Empty value for key '${key}' (use '*' for wildcard)`);
    }
    const keyLower = key.toLowerCase();
    if (keyLower === 'in' || keyLower === 'out' || keyLower === 'effect') {
      throw new CapUrnError(
        ErrorCodes.INVALID_TAG_FORMAT,
        `Reserved structural key '${keyLower}' must be changed via withInSpec(), withOutSpec(), or withEffect()`
      );
    }
    const newTags = { ...this.tags };
    newTags[keyLower] = value;
    return new CapUrn(this.inSpec, this.outSpec, this.effectValue, newTags);
  }

  /**
   * Create a new cap URN with a different input spec
   *
   * @param {string} inSpec - The new input spec ID
   * @returns {CapUrn} A new CapUrn instance with the updated inSpec
   */
  withInSpec(inSpec) {
    return new CapUrn(
      validatePreservedDirectionSpec(inSpec, 'in'),
      this.outSpec,
      this.effectValue,
      this.tags
    );
  }

  /**
   * Create a new cap URN with a different output spec
   *
   * @param {string} outSpec - The new output spec ID
   * @returns {CapUrn} A new CapUrn instance with the updated outSpec
   */
  withOutSpec(outSpec) {
    return new CapUrn(
      this.inSpec,
      validatePreservedDirectionSpec(outSpec, 'out'),
      this.effectValue,
      this.tags
    );
  }

  /**
   * Create a new cap URN with a different effect coordinate.
   *
   * @param {string} effect
   * @returns {CapUrn}
   */
  withEffect(effect) {
    return new CapUrn(this.inSpec, this.outSpec, normalizeEffectValue(effect), this.tags);
  }

  /**
   * Create a new cap URN with a tag removed
   * Key is normalized to lowercase for case-insensitive removal
   * Reserved structural coordinates must be changed through dedicated accessors.
   *
   * @param {string} key - The tag key to remove
   * @returns {CapUrn} A new CapUrn instance with the tag removed
   */
  withoutTag(key) {
    const keyLower = key.toLowerCase();
    if (keyLower === 'in' || keyLower === 'out' || keyLower === 'effect') {
      throw new CapUrnError(
        ErrorCodes.INVALID_TAG_FORMAT,
        `Reserved structural key '${keyLower}' cannot be removed via withoutTag()`
      );
    }
    const newTags = { ...this.tags };
    delete newTags[keyLower];
    return new CapUrn(this.inSpec, this.outSpec, this.effectValue, newTags);
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
    // Decided by the proved model (CapDAG.Exec.accepts). The cap-tag axis runs
    // opposite to isDispatchable's: this is the pattern relation, dispatch is
    // the routing one.
    return model.accepts(this.formal, request.formal);
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
   * Calculate specificity score for cap matching.
   *
   * Weighted sum of the per-tag truth-table score across the three
   * axes (`out`, `in`, `y`):
   *
   *   spec_C(c) = WEIGHT_OUT * spec_U(c.out)
   *             + WEIGHT_IN  * spec_U(c.in)
   *             +              spec_U(c.y)
   *
   * Per-tag ladder:
   *
   *   "?"            -> 0   (no constraint)
   *   starts "?="    -> 1   (absent or not v)
   *   "*"            -> 2   (must-have-any)
   *   starts "!="    -> 3   (present and not v)
   *   exact value    -> 4   (exact match)
   *   "!"            -> 5   (must-not-have)
   *
   * The lexicographic priority `(out, in, y)` reflects the routing
   * intent: producing different things is the largest semantic
   * difference between two caps; consuming different things is next;
   * descriptive y-axis metadata is last.
   *
   * @returns {number} The specificity score
   */
  specificity() {
    // Computed by the proved model (CapDAG.Exec.specificity).
    return Number(model.specificity(this.formal));
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
      return this.withInSpec('media:');
    }
    if (keyLower === 'out') {
      return this.withOutSpec('media:');
    }
    if (keyLower === 'effect') {
      return this.withEffect(CapEffect.ANY);
    }
    if (this.tags.hasOwnProperty(keyLower)) {
      return this.withTag(key, '*');
    }
    return this;
  }

  /**
   * Create a new cap with only specified tags
   * Always preserves inSpec, outSpec, and effect.
   *
   * @param {string[]} keys - Array of tag keys to include
   * @returns {CapUrn} A new CapUrn instance with only the specified tags (plus in/out)
   */
  subset(keys) {
    const newTags = {};
    for (const key of keys) {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey !== 'in' && normalizedKey !== 'out' && normalizedKey !== 'effect') {
        if (this.tags.hasOwnProperty(normalizedKey)) {
          newTags[normalizedKey] = this.tags[normalizedKey];
        }
      }
    }
    return new CapUrn(this.inSpec, this.outSpec, this.effectValue, newTags);
  }

  /**
   * Merge with another cap (other takes precedence for conflicts)
   * Structural coordinates are taken from other.
   *
   * @param {CapUrn} other - The cap to merge with
   * @returns {CapUrn} A new CapUrn instance with merged tags
   */
  merge(other) {
    if (!other) {
      return new CapUrn(this.inSpec, this.outSpec, this.effectValue, this.tags);
    }
    const newTags = { ...this.tags, ...other.tags };
    return new CapUrn(other.inSpec, other.outSpec, other.effectValue, newTags);
  }

  /**
   * Check if two cap URNs are comparable (on the same specialization chain).
   * isComparable(other) ≡ accepts(other) || other.accepts(this)
   * @param {CapUrn} other
   * @returns {boolean}
   */
  isComparable(other) {
    return model.comparable(this.formal, other.formal);
  }

  /**
   * Check if two cap URNs are equivalent in the order-theoretic sense.
   * Two URNs are equivalent if each accepts (subsumes) the other.
   * isEquivalent(other) ≡ accepts(other) && other.accepts(this)
   * @param {CapUrn} other
   * @returns {boolean}
   */
  isEquivalent(other) {
    return model.equivalent(this.formal, other.formal);
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
    if (this.inSpec !== other.inSpec || this.outSpec !== other.outSpec || this.effectValue !== other.effectValue) {
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

  /**
   * Check if this candidate can dispatch the given request.
   *
   * @param {CapUrn} request
   * @returns {boolean}
   */
  isDispatchable(request) {
    // Decided by the proved model (CapDAG.Exec.dispatch): every axis is a type.
    // The request's input refines the candidate's, the candidate's output
    // refines the request's, the effect matches unless the request says
    // ?effect, and the candidate's cap-tags refine the request's. `media:` on
    // a request's input is a type — "may send anything" — so only a candidate
    // that accepts anything serves it, which is what makes dispatch compose.
    return model.dispatch(this.formal, request.formal);
  }

  /**
   * Infer the runtime output media for a concrete runtime input.
   *
   * @param {MediaUrn} runtimeInput
   * @returns {MediaUrn}
   */
  inferRuntimeOutputMedia(runtimeInput) {
    const declaredIn = this.inMediaUrn();
    const declaredOut = this.outMediaUrn();

    if (!runtimeInput.conformsTo(declaredIn)) {
      throw new CapUrnError(
        ErrorCodes.INVALID_EFFECT_APPLICATION,
        `Runtime input '${runtimeInput}' does not conform to declared input '${declaredIn}'`
      );
    }

    let runtimeOut;
    switch (this.effectValue) {
      case CapEffect.DECLARED:
        runtimeOut = declaredOut;
        break;
      case CapEffect.NONE:
        runtimeOut = runtimeInput;
        break;
      case CapEffect.PATCH: {
        const delta = declaredOut.deltaFrom(declaredIn);
        runtimeOut = runtimeInput.applyDelta(delta);
        break;
      }
      case CapEffect.ANY:
        throw new CapUrnError(
          ErrorCodes.INVALID_EFFECT_APPLICATION,
          'Cannot infer runtime output for an unconstrained effect request'
        );
      default:
        throw new CapUrnError(
          ErrorCodes.INVALID_EFFECT_APPLICATION,
          `Unexpected effect '${this.effectValue}' during runtime output inference`
        );
    }

    if (!runtimeOut.conformsTo(declaredOut)) {
      throw new CapUrnError(
        ErrorCodes.INVALID_EFFECT_APPLICATION,
        `Inferred runtime output '${runtimeOut}' does not conform to declared output '${declaredOut}'`
      );
    }
    return runtimeOut;
  }

  /**
   * THE effect-audit predicate: does an actually-emitted runtime output
   * satisfy this cap's declared effect contract for the given runtime
   * input? Every check of "did the cap emit what its effect promised"
   * must go through this — never a hand-rolled combination of
   * inferRuntimeOutputMedia with equality or conformance checks, so the
   * contract has exactly one definition.
   *
   * The condition is deliberately asymmetric per effect:
   * - effect=none / effect=patch compute an EXACT runtime output type,
   *   so the emission must be tag-equivalent to the inference. A more
   *   specific emission would still be a lie: the effect promises the
   *   type is fully determined by the input.
   * - effect=declared promises only the declared out=, so an emission
   *   that is MORE specific than the declaration is legal and desirable;
   *   the emission must conform to the declared output. A more generic
   *   emission breaks downstream plan refinement and fails.
   *
   * Throws (rather than returning false) when the inference itself is
   * impossible: the runtime input does not conform to the declared
   * input, the effect is the unconstrained request form (?effect), or
   * the URN state is internally inconsistent — those are upstream
   * contract breaks, not emission mismatches.
   *
   * @param {MediaUrn} runtimeInput
   * @param {MediaUrn} runtimeOutput
   * @returns {boolean}
   */
  isConformantRuntimeOutput(runtimeInput, runtimeOutput) {
    const inferred = this.inferRuntimeOutputMedia(runtimeInput);
    switch (this.effectValue) {
      case CapEffect.NONE:
      case CapEffect.PATCH:
        return runtimeOutput.isEquivalent(inferred);
      case CapEffect.DECLARED:
        return runtimeOutput.conformsTo(inferred);
      default:
        throw new CapUrnError(
          ErrorCodes.INVALID_EFFECT_APPLICATION,
          'Cannot audit an emission against an unconstrained effect request'
        );
    }
  }

  _validateAdmissible() {
    const inMedia = this.inMediaUrn();
    const outMedia = this.outMediaUrn();
    const noExtraTags = Object.keys(this.tags).length === 0;

    if (inMedia.isTop() && outMedia.isTop() && noExtraTags && this.effectValue === CapEffect.DECLARED) {
      throw new CapUrnError(
        ErrorCodes.ILLEGAL_DECLARATION,
        'illegal bare top cap; use cap:effect=none for identity, or declare a non-vacuous input/output/effect/tag'
      );
    }

    if (this.effectValue === CapEffect.NONE) {
      if (!inMedia.conformsTo(outMedia)) {
        throw new CapUrnError(
          ErrorCodes.ILLEGAL_DECLARATION,
          `effect=none requires declared input '${inMedia}' to conform to declared output '${outMedia}'`
        );
      }
      return;
    }

    if (this.effectValue === CapEffect.PATCH) {
      const delta = outMedia.deltaFrom(inMedia);
      const witness = inMedia.applyDelta(delta);
      if (!witness.conformsTo(outMedia)) {
        throw new CapUrnError(
          ErrorCodes.ILLEGAL_DECLARATION,
          `effect=patch witness '${witness}' does not conform to declared output '${outMedia}'`
        );
      }
    }
  }
}

/**
 * Cap URN Builder for fluent construction
 */
class CapUrnBuilder {
  constructor() {
    this._inSpec = null;
    this._outSpec = null;
    this._effect = CapEffect.DECLARED;
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

  effect(effect) {
    this._effect = normalizeEffectValue(effect);
    return this;
  }

  /**
   * Add or update a tag
   * Key is normalized to lowercase; value is preserved as-is
   * Structural coordinates are reserved; use dedicated methods instead.
   *
   * @param {string} key - The tag key
   * @param {string} value - The tag value
   * @returns {CapUrnBuilder} This builder instance for chaining
   */
  tag(key, value) {
    const keyLower = key.toLowerCase();
    if (keyLower === 'in' || keyLower === 'out' || keyLower === 'effect') {
      throw new CapUrnError(
        ErrorCodes.INVALID_TAG_FORMAT,
        `Reserved structural key '${keyLower}' must be set via inSpec(), outSpec(), or effect()`
      );
    }
    const nextTags = { ...this._tags, [keyLower]: value };
    validateNonStructuralTags(nextTags);
    this._tags[keyLower] = value;
    return this;
  }

  /**
   * Add a marker tag (a wildcard-valued tag that serializes as just the key).
   * Equivalent to tag(key, "*") but expresses authorial intent: this tag is
   * present as a marker, not a key=value pair.
   *
   * @param {string} key - The marker key
   * @returns {CapUrnBuilder} This builder instance for chaining
   */
  marker(key) {
    const keyLower = key.toLowerCase();
    if (keyLower === 'in' || keyLower === 'out' || keyLower === 'effect') {
      throw new CapUrnError(
        ErrorCodes.INVALID_TAG_FORMAT,
        `Reserved structural key '${keyLower}' cannot be used as a marker`
      );
    }
    const nextTags = { ...this._tags, [keyLower]: '*' };
    validateNonStructuralTags(nextTags);
    this._tags[keyLower] = '*';
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
    return new CapUrn(this._inSpec, this._outSpec, this._effect, this._tags);
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
      if (request.accepts(cap)) {
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
    const matches = caps.filter(cap => request.accepts(cap));

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
// MEDIA DEFINITION PARSING
// ============================================================================

/**
 * MediaDef error types
 */
class MediaDefError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MediaDefError';
    this.code = code;
  }
}

const MediaDefErrorCodes = {
  UNRESOLVABLE_MEDIA_URN: 1,
  DUPLICATE_MEDIA_URN: 2
};

// ============================================================================
// BUILT-IN SPEC IDS AND DEFINITIONS
// ============================================================================

/**
 * Well-known built-in media URN constants
 * These media URNs are implicitly available and do not need to be declared in mediaDefs
 *
 * Cardinality and Structure use orthogonal marker tags:
 * - `list` marker: presence = list/array, absence = scalar (default)
 * - `record` marker: presence = has internal fields, absence = opaque (default)
 *
 * Examples:
 * - `media:ext=pdf` → scalar, opaque (no markers)
 * - `media:enc=utf-8;list` → list, opaque (has list marker)
 * - `media:fmt=json;record` → scalar, record (has record marker)
 * - `media:fmt=json;list;record` → list of records (has both markers)
 */

// Primitive types - URNs must match base.toml definitions
// Media URN for void (no input/output) - no coercion tags
const MEDIA_VOID = 'media:void';
// Media URN for string type — bare UTF-8 text (enc=utf-8), scalar by default (no list marker)
const MEDIA_STRING = 'media:enc=utf-8';
// Media URN for integer type — numeric (math ops valid), scalar by default
const MEDIA_INTEGER = 'media:integer;numeric';
// Media URN for number type — numeric, scalar by default
const MEDIA_NUMBER = 'media:numeric';
// Media URN for boolean type - uses "bool" not "boolean" per base.toml
const MEDIA_BOOLEAN = 'media:bool;enc=utf-8';
// Media URN for a generic record/object type - has internal key-value structure,
// no content-format claim. Use MEDIA_JSON for JSON-serialized objects.
const MEDIA_OBJECT = 'media:record';
// Media URN for the top type - the most general media type (no constraints)
const MEDIA_IDENTITY = 'media:';

// List types - URNs must match base.toml definitions
// Media URN for generic list type
const MEDIA_LIST = 'media:list';
// Media URN for string list type — bare UTF-8 text with list marker
const MEDIA_STRING_LIST = 'media:enc=utf-8;list';
// Media URN for integer list type — numeric with list marker
const MEDIA_INTEGER_LIST = 'media:integer;list;numeric';
// Media URN for number list type — numeric with list marker
const MEDIA_NUMBER_LIST = 'media:list;numeric';
// Media URN for boolean list type - uses "bool" with list marker
const MEDIA_BOOLEAN_LIST = 'media:bool;enc=utf-8;list';
// Media URN for object list type - list of records (no content-format claim).
// Use a specific format like JSON array for serialized object lists.
const MEDIA_OBJECT_LIST = 'media:list;record';

// Semantic media types for specialized content
// Media URN for PNG image data
const MEDIA_PNG = 'media:ext=png;image';
// Media URN for JPEG image data
const MEDIA_JPEG = 'media:ext=jpeg;image';
// Media URN for GIF image data
const MEDIA_GIF = 'media:ext=gif;image';
// Media URN for BMP image data
const MEDIA_BMP = 'media:ext=bmp;image';
// Media URN for TIFF image data
const MEDIA_TIFF = 'media:ext=tiff;image';
// Media URN for WebP image data
const MEDIA_WEBP = 'media:ext=webp;image';
// Media URN for audio data (wav, mp3, flac, etc.)
const MEDIA_AUDIO = 'media:audio;ext=wav';
// Media URN for MP3 audio data
const MEDIA_MP3 = 'media:audio;ext=mp3';
// Media URN for WAV audio data
const MEDIA_WAV = 'media:audio;ext=wav';
// Media URN for FLAC audio data
const MEDIA_FLAC = 'media:audio;ext=flac';
// Media URN for OGG audio data
const MEDIA_OGG = 'media:audio;ext=ogg';
// Media URN for AAC audio data
const MEDIA_AAC = 'media:audio;ext=aac';
// Media URN for M4A audio data
const MEDIA_M4A = 'media:audio;ext=m4a';
// Media URN for AIFF audio data
const MEDIA_AIFF = 'media:audio;ext=aiff';
// Media URN for Opus audio data
const MEDIA_OPUS = 'media:audio;ext=opus';
// Media URN for video data (mp4, webm, mov, etc.)
const MEDIA_VIDEO = 'media:video';
// Media URN for MP4 video data
const MEDIA_MP4 = 'media:ext=mp4;video';
// Media URN for MOV video data
const MEDIA_MOV = 'media:ext=mov;video';
// Media URN for WebM video data
const MEDIA_WEBM = 'media:ext=webm;video';
// Media URN for MKV video data
const MEDIA_MKV = 'media:ext=mkv;video';

// Semantic AI input types - distinguished by their purpose/context
// Media URN for audio input containing speech for transcription (Whisper)
const MEDIA_AUDIO_SPEECH = 'media:audio;ext=wav;speech';

// Document types (PRIMARY naming - type IS the format)
// Media URN for PDF documents
const MEDIA_PDF = 'media:ext=pdf';
// Media URN for EPUB documents
const MEDIA_EPUB = 'media:ext=epub';

// Text format types (PRIMARY naming - type IS the format)
// Media URN for Markdown text
const MEDIA_MD = 'media:enc=utf-8;ext=md';
// Media URN for plain text
const MEDIA_TXT = 'media:enc=utf-8;ext=txt';
// Media URN for reStructuredText
const MEDIA_RST = 'media:enc=utf-8;ext=rst';
// Media URN for log files
const MEDIA_LOG = 'media:enc=utf-8;ext=log';
// Media URN for HTML documents
const MEDIA_HTML = 'media:enc=utf-8;ext=html';
// Media URN for XML documents
const MEDIA_XML = 'media:enc=utf-8;ext=xml';
// Media URN for JSON data - has record marker (structured key-value)
const MEDIA_JSON = 'media:fmt=json;record';
// Media URN for JSON with schema constraint (input for structured queries)
const MEDIA_JSON_SCHEMA = 'media:fmt=json;json-schema;record';
// Media URN for YAML data - has record marker (structured key-value)
const MEDIA_YAML = 'media:fmt=yaml;record';

// Format-specific variants for JSON, YAML, CSV
const MEDIA_JSON_VALUE = 'media:fmt=json';
const MEDIA_JSON_RECORD = 'media:fmt=json;record';
const MEDIA_JSON_LIST = 'media:fmt=json;list';
const MEDIA_JSON_LIST_RECORD = 'media:fmt=json;list;record';
const MEDIA_YAML_VALUE = 'media:fmt=yaml';
const MEDIA_YAML_RECORD = 'media:fmt=yaml;record';
const MEDIA_YAML_LIST = 'media:fmt=yaml;list';
const MEDIA_YAML_LIST_RECORD = 'media:fmt=yaml;list;record';
const MEDIA_CSV = 'media:fmt=csv;list;record';
const MEDIA_CSV_LIST = 'media:fmt=csv;list;record';

// File path type — for arguments that represent filesystem paths.
// There is a single media URN; cardinality (single file vs many files)
// is carried on the wire via is_sequence, not via URN tags.
const MEDIA_FILE_PATH = 'media:enc=utf-8;file-path';

// Semantic text input types - distinguished by their purpose/context
// Media URN for model spec (provider:model format, HuggingFace name, etc.) - scalar by default
const MEDIA_MODEL_SPEC = 'media:enc=utf-8;model-spec';
// Media URN for MLX model path - scalar by default
const MEDIA_MLX_MODEL_PATH = 'media:enc=utf-8;mlx-model-path';
// Media URN for model repository (input for list-models) - has record marker
const MEDIA_MODEL_REPO = 'media:enc=utf-8;model-repo;record';

// CAPDAG output types - record marker for structured JSON objects, list marker for arrays
// Media URN for model dimension output - scalar by default (no list marker)
const MEDIA_MODEL_DIM = 'media:integer;model-dim;numeric';
// Media URN for model download output - has record marker
const MEDIA_DOWNLOAD_OUTPUT = 'media:download-result;enc=utf-8;record';
// Media URN for model list output - has record marker
const MEDIA_LIST_OUTPUT = 'media:enc=utf-8;model-list;record';
// Media URN for model status output - has record marker
const MEDIA_STATUS_OUTPUT = 'media:enc=utf-8;model-status;record';
// Media URN for model contents output - has record marker
const MEDIA_CONTENTS_OUTPUT = 'media:enc=utf-8;model-contents;record';
// Media URN for model availability output - has record marker
const MEDIA_AVAILABILITY_OUTPUT = 'media:enc=utf-8;model-availability;record';
// Media URN for model path output - has record marker
const MEDIA_PATH_OUTPUT = 'media:enc=utf-8;model-path;record';
// Media URN for embedding vector output - has record marker
const MEDIA_EMBEDDING_VECTOR = 'media:embedding-vector;enc=utf-8;record';
// Media URN for vision inference output — a concrete plain-text terminal.
// Carries `image-description` (the vision-specific marker), `plain-text` (the
// finalised-text marker that opts into cap:save-as-txt's persistence path),
// and `file-type=txt` (binds the URN to the `.txt` extension).
const MEDIA_IMAGE_DESCRIPTION = 'media:enc=utf-8;ext=txt;image-description;plain-text';
// Media URN for finalised plain text — the canonical input/output of cap:save-as-txt.
// Producers of user-facing prose (LLM text-generation, OCR's digitized text,
// summarisation) declare this URN as their `out` so the planner restricts the .txt
// persistence path to those caps. See fabric/media/plain-text.toml.
const MEDIA_PLAIN_TEXT = 'media:enc=utf-8;ext=txt;plain-text';
// Media URN for transcription output - has record marker
const MEDIA_TRANSCRIPTION_OUTPUT = 'media:enc=utf-8;record;transcription';
// Media URN for decision output - JSON record
const MEDIA_DECISION = 'media:decision;fmt=json;record';
// Media URN for a single page of finalised plain text extracted from a document
const MEDIA_TEXTABLE_PAGE = 'media:enc=utf-8;ext=txt;page;plain-text';
// Media URN for Hugging Face API token (secret)
const MEDIA_HF_TOKEN = 'media:enc=utf-8;hf-token;secret';
// Media URN for a list of model architectures — JSON record
const MEDIA_MODEL_ARCH_LIST = 'media:fmt=json;model-arch-list;record';
// Media URN for a model search request — JSON record
const MEDIA_MODEL_SEARCH_REQUEST = 'media:fmt=json;model-search-request;record';
// Media URN for a model search response — JSON record
const MEDIA_MODEL_SEARCH_RESPONSE = 'media:fmt=json;model-search-response;record';
// Media URN for model filter resolution — JSON record
const MEDIA_MODEL_FILTER_RESOLUTION = 'media:fmt=json;model-filter-resolution;record';
// Collection types
const MEDIA_COLLECTION = 'media:collection;record';
const MEDIA_COLLECTION_LIST = 'media:collection;list;record';
// Media URN for adapter selection output - JSON record
const MEDIA_ADAPTER_SELECTION = 'media:adapter-selection;fmt=json;record';
// Fabric registry lookup wire types (consumed/produced by cap:lookup-cap;fabric
// and cap:lookup-media-def;fabric, both implemented by fetchcartridge).
const MEDIA_CAP_URN = 'media:cap-urn;enc=utf-8';
const MEDIA_MEDIA_URN = 'media:enc=utf-8;media-urn';
const MEDIA_FABRIC_DEFVER = 'media:defver;enc=utf-8';
const MEDIA_CAP_DEFINITION = 'media:cap-definition;fmt=json;record';
const MEDIA_MEDIA_DEFINITION = 'media:fmt=json;media-definition;record';

// =============================================================================
// STANDARD CAP URN CONSTANTS
// =============================================================================

// Standard identity capability URN.
// Accepts any media type as input and preserves the runtime media identity.
const CAP_IDENTITY = 'cap:effect=none';

// Adapter-selection capability. Default implementation returns empty END (no match).
// Cartridges that inspect file content override this with a handler that returns {"media_urns": [...]}.
const CAP_ADAPTER_SELECTION = 'cap:in="media:";out="media:adapter-selection;fmt=json;record"';

// Fabric registry lookup caps. Implemented by fetchcartridge.
// CAP_LOOKUP_CAP_FABRIC resolves a canonical cap URN to its full flattened
// cap definition; CAP_LOOKUP_MEDIA_DEF_FABRIC does the same for media defs.
const CAP_LOOKUP_CAP_FABRIC = 'cap:in="media:cap-urn;enc=utf-8";fabric;lookup-cap;out="media:cap-definition;fmt=json;record"';
const CAP_LOOKUP_MEDIA_DEF_FABRIC = 'cap:in="media:enc=utf-8;media-urn";fabric;lookup-media-def;out="media:fmt=json;media-definition;record"';

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
  /** `media:void` was combined with one or more other tags. The unit
   * type is atomic — there is no lattice underneath it. Reasons for
   * "why void was used" belong on cap-tags or args, not on the
   * media URN. */
  VOID_NOT_ATOMIC: 'VOID_NOT_ATOMIC',
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
    // Enforce media:void atomicity. The unit type has no lattice
    // underneath it; refinements are conceptually wrong.
    const tagKeys = Object.keys(taggedUrn.tags);
    if (tagKeys.includes('void') && tagKeys.length > 1) {
      const extras = tagKeys.filter((k) => k !== 'void').sort();
      throw new MediaUrnError(
        MediaUrnErrorCodes.VOID_NOT_ATOMIC,
        `media:void is atomic and cannot be refined; got extra tag(s): ${extras.join(', ')}. ` +
          'Move why/how this void is used into cap-tags or args, not the media URN.'
      );
    }
    this._urn = taggedUrn;
  }

  /**
   * Parse a media URN string. Validates the prefix is 'media'.
   * @param {string} str - The media URN string (e.g., "media:ext=pdf")
   * @returns {MediaUrn}
   * @throws {MediaUrnError} If prefix is not 'media'
   */
  static fromString(str) {
    const urn = TaggedUrn.fromString(str);
    return new MediaUrn(urn);
  }

  // =========================================================================
  // CARDINALITY (list marker)
  // =========================================================================

  /**
   * Returns true if this media URN describes list-type data (has `list` marker tag).
   * This is a semantic type check — it means "the data format IS a list/array".
   * This does NOT indicate input cardinality (single vs multiple items).
   * Cardinality is tracked by is_sequence on the wire protocol, not by URN tags.
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

  /** @returns {boolean} True if the content format is JSON (`fmt=json`) */
  isJson() { return this._urn.getTag('fmt') === 'json'; }

  /** @returns {boolean} True if the "void" marker tag is present —
   *  the **unit type** in the type-theoretic reading. media:void is
   *  the nullary value; NOT "invalid" or "absent". */
  isVoid() { return this._urn.getTag('void') !== undefined; }

  /** @returns {boolean} True if this is the **top** media URN — the
   *  universal wildcard `media:` with no tags. Order-theoretically,
   *  every other media URN conformsTo this one. Distinct from
   *  isVoid(): top means "any data type accepted here," void means
   *  "no data flows here." */
  isTop() { return Object.keys(this._urn.tags).length === 0; }

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
   * Returns true if this value's content format is YAML (`fmt=yaml`).
   * @returns {boolean}
   */
  isYaml() {
    return this._urn.getTag('fmt') === 'yaml';
  }

  /**
   * Returns true if this value's content format is CSV (`fmt=csv`).
   * @returns {boolean}
   */
  isCsv() {
    return this._urn.getTag('fmt') === 'csv';
  }

  /**
   * True if this URN specializes `media:file-path`. There is a single
   * file-path media URN; cardinality (single file vs many) is carried on
   * the wire via `is_sequence`, not via URN tags.
   * @returns {boolean}
   */
  isFilePath() { return this._hasMarkerTag('file-path'); }

  /**
   * True if this URN carries the `live` marker tag — a live-feed
   * REFERENCE (13.2 §Reference Media): the arg value is a selector record
   * the runtime resolves into an unbounded content stream via a registered
   * provider, the same transport-resolution family as `media:file-path`.
   * This is the canonical membership predicate for that family; callers
   * must not test the `live` tag themselves.
   * @returns {boolean}
   */
  isLiveFeed() { return this._hasMarkerTag('live'); }

  /**
   * Check if this represents a collection type.
   * Returns true if the "collection" marker tag is present.
   * @returns {boolean}
   */
  isCollection() { return this._hasMarkerTag('collection'); }

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
   * Compute the coordinate-space delta from `base` to this media URN.
   * @param {MediaUrn} base
   * @returns {TaggedUrnCoordinateDelta}
   */
  deltaFrom(base) { return this._urn.deltaFrom(base._urn); }

  /**
   * Apply a coordinate-space delta to this media URN.
   * @param {TaggedUrnCoordinateDelta} delta
   * @returns {MediaUrn}
   */
  applyDelta(delta) { return new MediaUrn(this._urn.applyDelta(delta)); }

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
 * Build URN for LLM generate-text capability
 * @returns {CapUrn}
 */
function llmGenerateTextUrn() {
  return new CapUrnBuilder()
    .marker('generate_text')
    .tag('llm', '*')
    .tag('ml-model', '*')
    .inSpec(MEDIA_STRING)
    .outSpec(MEDIA_STRING)
    .build();
}

/**
 * Build URN for render-page-image capability
 * @param {string} inputMedia - The input media URN string
 * @returns {CapUrn}
 */
function renderPageImageUrn(inputMedia) {
  return new CapUrnBuilder()
    .marker('render_page_image')
    .inSpec(inputMedia)
    .outSpec(MEDIA_PNG)
    .build();
}

/**
 * Build URN for format conversion capability
 * @param {string} inMedia - The input media URN string
 * @param {string} outMedia - The output media URN string
 * @returns {CapUrn}
 */
function formatConversionUrn(inMedia, outMedia) {
  return new CapUrnBuilder()
    .marker('convert_format')
    .inSpec(inMedia)
    .outSpec(outMedia)
    .build();
}

/**
 * Map a primitive type name to the corresponding media URN string.
 * @param {string} typeName - The type name (e.g., 'string', 'integer', 'string-list')
 * @returns {string|null} The media URN string, or null if not recognized
 */
function mediaUrnForType(typeName) {
  switch (typeName) {
    case 'string': return MEDIA_STRING;
    case 'integer': return MEDIA_INTEGER;
    case 'number': return MEDIA_NUMBER;
    case 'boolean': return MEDIA_BOOLEAN;
    case 'object': return MEDIA_OBJECT;
    case 'string-list': return MEDIA_STRING_LIST;
    case 'integer-list': return MEDIA_INTEGER_LIST;
    case 'number-list': return MEDIA_NUMBER_LIST;
    case 'boolean-list': return MEDIA_BOOLEAN_LIST;
    case 'object-list': return MEDIA_OBJECT_LIST;
    default: return null;
  }
}

/**
 * Build URN for model-availability capability
 * @returns {CapUrn}
 */
function modelAvailabilityUrn() {
  return new CapUrnBuilder()
    .marker('model-availability')
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
    .marker('model-path')
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
 * 1. CDG_SCHEMA_BASE_URL environment variable
 * 2. CDG_FABRIC_REGISTRY_URL environment variable + "/schema"
 * 3. Default: "https://capdag.com/schema"
 *
 * @returns {string} The schema base URL
 */
function getSchemaBaseURL() {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.CDG_SCHEMA_BASE_URL) {
      return process.env.CDG_SCHEMA_BASE_URL;
    }
    if (process.env.CDG_FABRIC_REGISTRY_URL) {
      return process.env.CDG_FABRIC_REGISTRY_URL + '/schema';
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

/**
 * Validate a build-time `MFR_CARTRIDGE_REGISTRY_URL` value and reduce it to
 * the registry identity the build is published against.
 *
 * Mirrors capdag::bifaci::manifest::registry_url_from_build_env. The Rust
 * version is a compile-time `const fn` fed `option_env!(...)`; in JS the
 * equivalent input is the raw env value at process start
 * (`process.env.MFR_CARTRIDGE_REGISTRY_URL`), where an absent variable is
 * `undefined`.
 *
 * Valid states:
 * - `null`/`undefined` => dev build; registry identity is absent and the
 *   build must use the on-disk `dev/` slot. Returns `null`.
 * - a non-empty string => published-registry build. Returned verbatim.
 *
 * Invalid state:
 * - the empty string => the caller exported the variable with an empty value.
 *   This is neither a dev build nor a valid registry identity, and it MUST
 *   fail hard (throw) so the build can never silently hash the empty string
 *   into a fake registry slug. The Rust port panics here; the JS port throws
 *   with the same message — no fallback.
 *
 * @param {string|null|undefined} raw - The raw build-env value.
 * @returns {string|null} `null` for a dev build, or the verbatim non-empty URL.
 * @throws {Error} when `raw` is the empty string.
 */
function registryUrlFromBuildEnv(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (raw === '') {
    throw new Error(
      'MFR_CARTRIDGE_REGISTRY_URL must be unset for dev builds or set to a non-empty registry URL for published builds; empty string is invalid'
    );
  }
  return raw;
}

// =============================================================================
// MEDIA URN TAG UTILITIES
// =============================================================================
// NOTE: The MEDIA_X constants above are convenience values for referencing
// common media URNs in code. Resolution must go through mediaDefs tables -
// there is NO built-in resolution.

/**
 * Resolved MediaDef structure
 *
 * A MediaDef is a resolved media definition containing information about
 * a value type in the CAPDAG system. MediaDefs are identified by unique media URNs
 * and contain fields like media_type, profile_uri, schema, etc.
 *
 * MediaDefs are defined in JSON files in the registry or inline in cap definitions.
 */
class MediaDef {
  /**
   * Create a new MediaDef
   * @param {string} contentType - The MIME content type
   * @param {string|null} profile - Optional profile URL
   * @param {Object|null} schema - Optional JSON Schema for local validation
   * @param {string|null} title - Optional display-friendly title
   * @param {string|null} description - Optional short plain-text description
   * @param {string|null} mediaUrn - Source media URN for tag-based checks
   * @param {Object|null} validation - Optional validation rules (min, max, min_length, max_length, pattern, allowed_values)
   * @param {Object|null} metadata - Optional metadata (arbitrary key-value pairs for display/categorization)
   * @param {string[]} extensions - File extensions for storing this media type (e.g., ['pdf'], ['jpg', 'jpeg'])
   * @param {string|null} documentation - Optional long-form markdown documentation. Rendered in media info panels, the cap navigator, capdag-dot-com, and anywhere else a rich-text explanation of the media def is useful.
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

  /** @returns {boolean} True if binary (no `enc` encoding tag — not text-representable) */
  isBinary() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.getTag('enc') === undefined : false;
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

  /** @returns {boolean} True if text-representable (has `enc` encoding tag) */
  isText() {
    const mu = this.parsedMediaUrn();
    return mu ? mu.getTag('enc') !== undefined : false;
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
   * @returns {string} The media_def as a string
   */
  toString() {
    if (this.profile) {
      return `${this.contentType}; profile="${this.profile}"`;
    }
    return this.contentType;
  }

  /**
   * Get MediaDef from a CapUrn using the output media URN
   * NOTE: outSpec is now a required first-class field on CapUrn
   * @param {CapUrn} capUrn - The cap URN
   * @param {Object} mediaDefs - Optional mediaDefs lookup table for resolution
   * @returns {MediaDef} The resolved MediaDef
   * @throws {MediaDefError} If media URN cannot be resolved
   */
  static fromCapUrn(capUrn, mediaDefs = []) {
    // outSpec is now a required field, so it's always present
    const mediaUrn = capUrn.getOutSpec();

    // Resolve the media URN to a MediaDef - no fallbacks, fail hard
    return resolveMediaUrn(mediaUrn, mediaDefs);
  }
}

/**
 * Resolve a media URN to a MediaDef
 *
 * Resolution: Look up mediaUrn in mediaDefs array (by urn field), FAIL HARD if not found.
 * There is no built-in resolution - all media URNs must be in mediaDefs.
 *
 * @param {string} mediaUrn - The media URN (e.g., "media:enc=utf-8")
 * @param {Array} mediaDefs - The mediaDefs array (each item has urn, media_type, title, etc.)
 * @returns {MediaDef} The resolved MediaDef
 * @throws {MediaDefError} If media URN cannot be resolved
 */
function resolveMediaUrn(mediaUrn, mediaDefs = []) {
  // Look up in mediaDefs array by urn field
  if (mediaDefs && Array.isArray(mediaDefs)) {
    const def = mediaDefs.find(spec => spec.urn === mediaUrn);

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
        throw new MediaDefError(
          MediaDefErrorCodes.UNRESOLVABLE_MEDIA_URN,
          `Media URN '${mediaUrn}' has invalid definition: missing media_type`
        );
      }

      return new MediaDef(mediaType, profileUri, schema, title, description, mediaUrn, validation, metadata, extensions, documentation);
    }
  }

  // FAIL HARD - media URN must be in mediaDefs array
  throw new MediaDefError(
    MediaDefErrorCodes.UNRESOLVABLE_MEDIA_URN,
    `Cannot resolve media URN: '${mediaUrn}'. Not found in mediaDefs array.`
  );
}

/**
 * Build an extension index from a mediaDefs array.
 * Maps lowercase extension strings to arrays of media URNs that use that extension.
 *
 * @param {Array} mediaDefs - The mediaDefs array
 * @returns {Map<string, string[]>} Map from extension to list of URNs
 */
function buildExtensionIndex(mediaDefs) {
  const index = new Map();
  if (!mediaDefs || !Array.isArray(mediaDefs)) {
    return index;
  }

  for (const spec of mediaDefs) {
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
 * @param {Array} mediaDefs - The mediaDefs array
 * @returns {string[]} Array of media URNs for the extension
 * @throws {MediaDefError} If no media def is registered for the given extension
 *
 * @example
 * const urns = mediaUrnsForExtension('pdf', mediaDefs);
 * // May return ['media:ext=pdf']
 */
function mediaUrnsForExtension(extension, mediaDefs) {
  const index = buildExtensionIndex(mediaDefs);
  const extLower = extension.toLowerCase();
  const urns = index.get(extLower);

  if (!urns || urns.length === 0) {
    throw new MediaDefError(
      MediaDefErrorCodes.UNRESOLVABLE_MEDIA_URN,
      `No media def registered for extension '${extension}'. ` +
      `Ensure the media def is defined with an 'extensions' array containing '${extension}'.`
    );
  }

  return urns;
}

/**
 * Get all registered extensions and their corresponding media URNs.
 *
 * Returns an array of [extension, urns] pairs for debugging and introspection.
 *
 * @param {Array} mediaDefs - The mediaDefs array
 * @returns {Array<[string, string[]]>} Array of [extension, urns] pairs
 */
function getExtensionMappings(mediaDefs) {
  const index = buildExtensionIndex(mediaDefs);
  return Array.from(index.entries());
}

/**
 * Validate that media_defs array has no duplicate URNs.
 *
 * @param {Array} mediaDefs - The mediaDefs array to validate
 * @returns {{valid: boolean, error?: string, duplicates?: string[]}}
 */
function validateNoMediaDefDuplicates(mediaDefs) {
  if (!mediaDefs || !Array.isArray(mediaDefs) || mediaDefs.length === 0) {
    return { valid: true };
  }

  const seen = new Set();
  const duplicates = [];

  for (const spec of mediaDefs) {
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
      error: `Duplicate media URNs in media_defs: ${duplicates.join(', ')}`,
      duplicates
    };
  }

  return { valid: true };
}

/**
 * XV5: Validate that inline media_defs don't redefine existing registry specs.
 *
 * Validation requires a registryLookup function to check if media URNs exist.
 * If no registryLookup is provided, validation passes (graceful degradation).
 *
 * @param {Array} mediaDefs - The inline media_defs array from a capability
 * @param {Object} [options] - Validation options
 * @param {Function} [options.registryLookup] - Function to check if media URN exists in registry
 *                                              Returns true if exists, false otherwise
 *                                              Should handle errors gracefully (return false)
 * @returns {Promise<{valid: boolean, error?: string, redefines?: string[]}>}
 */
async function validateNoMediaDefRedefinition(mediaDefs, options = {}) {
  if (!mediaDefs || !Array.isArray(mediaDefs) || mediaDefs.length === 0) {
    return { valid: true };
  }

  const { registryLookup } = options;

  // If no registry lookup provided, degrade gracefully and allow
  if (!registryLookup || typeof registryLookup !== 'function') {
    return { valid: true };
  }

  const redefines = [];

  for (const spec of mediaDefs) {
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
      error: `XV5: Inline media defs redefine existing registry specs: ${redefines.join(', ')}`,
      redefines
    };
  }

  return { valid: true };
}

/**
 * XV5: Synchronous version that checks against a provided lookup function.
 * If no registryLookup is provided, validation passes (graceful degradation).
 *
 * @param {Array} mediaDefs - The inline media_defs array from a capability
 * @param {Function} [registryLookup] - Synchronous function to check if media URN exists
 *                                       Returns true if exists, false otherwise
 * @returns {{valid: boolean, error?: string, redefines?: string[]}}
 */
function validateNoMediaDefRedefinitionSync(mediaDefs, registryLookup = null) {
  if (!mediaDefs || !Array.isArray(mediaDefs) || mediaDefs.length === 0) {
    return { valid: true };
  }

  // If no registry lookup provided, degrade gracefully and allow
  if (!registryLookup || typeof registryLookup !== 'function') {
    return { valid: true };
  }

  const redefines = [];

  for (const spec of mediaDefs) {
    const mediaUrn = spec.urn;
    if (!mediaUrn) continue;
    if (registryLookup(mediaUrn)) {
      redefines.push(mediaUrn);
    }
  }

  if (redefines.length > 0) {
    return {
      valid: false,
      error: `XV5: Inline media defs redefine existing registry specs: ${redefines.join(', ')}`,
      redefines
    };
  }

  return { valid: true };
}

/**
 * Check if a CapUrn represents binary output.
 * Throws error if the output spec cannot be resolved - no fallbacks.
 * @param {CapUrn} capUrn - The cap URN
 * @param {Array} mediaDefs - Optional mediaDefs array
 * @returns {boolean} True if binary
 * @throws {MediaDefError} If 'out' tag is missing or spec ID cannot be resolved
 */
function isBinaryCapUrn(capUrn, mediaDefs = []) {
  const mediaDef = MediaDef.fromCapUrn(capUrn, mediaDefs);
  return mediaDef.isBinary();
}

/**
 * Check if a CapUrn represents JSON output.
 * Note: This checks for explicit JSON format marker only.
 * Throws error if the output spec cannot be resolved - no fallbacks.
 * @param {CapUrn} capUrn - The cap URN
 * @param {Array} mediaDefs - Optional mediaDefs array
 * @returns {boolean} True if explicit JSON tag present
 * @throws {MediaDefError} If 'out' tag is missing or spec ID cannot be resolved
 */
function isJSONCapUrn(capUrn, mediaDefs = []) {
  const mediaDef = MediaDef.fromCapUrn(capUrn, mediaDefs);
  return mediaDef.isJSON();
}

/**
 * Check if a CapUrn represents structured output (map or list).
 * Structured data can be serialized as JSON when transmitted as text.
 * Throws error if the output spec cannot be resolved - no fallbacks.
 * @param {CapUrn} capUrn - The cap URN
 * @param {Array} mediaDefs - Optional mediaDefs array
 * @returns {boolean} True if structured (map or list)
 * @throws {MediaDefError} If 'out' tag is missing or spec ID cannot be resolved
 */
function isStructuredCapUrn(capUrn, mediaDefs = []) {
  const mediaDef = MediaDef.fromCapUrn(capUrn, mediaDefs);
  return mediaDef.isStructured();
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
  constructor(obj = null) {
    this.stdin = null;    // string (media URN) or null
    this.position = null; // number or null
    this.cli_flag = null; // string or null
    if (obj !== null) {
      if (obj.stdin !== undefined) this.stdin = obj.stdin;
      if (obj.position !== undefined) this.position = obj.position;
      if (obj.cli_flag !== undefined) this.cli_flag = obj.cli_flag;
    }
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

/** The definition's argument keys — what every capdag mirror's CapArg carries. */
const CAP_ARG_KEYS = Object.freeze(['media_urn', 'required', 'sources', 'arg_description', 'default_value', 'metadata', 'is_sequence', 'streaming']);
/** The definition's output keys — what every capdag mirror's CapOutput carries. */
const CAP_OUTPUT_KEYS = Object.freeze(['media_urn', 'output_description', 'metadata', 'is_sequence', 'streaming']);

function refuseUnknownDefinitionKeys(json, known, what) {
  const unknown = Object.keys(json).filter(key => !known.includes(key)).sort();
  if (unknown.length > 0) {
    throw new Error(
      `${what} carries field(s) this capdag does not know: ${unknown.join(', ')} — ` +
      `the definition comes from a fabric newer than this capdag; the contract is ${known.join(', ')}`
    );
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
    // Consumed WITHOUT a length promise (a feed): the cap processes items as
    // they arrive and may be wired live to an unbounded producer. Orthogonal
    // to is_sequence (cardinality), not part of the URN. Only the main input
    // may stream (RULE14).
    this.streaming = options.streaming || false;
    this.sources = sources;  // Array of ArgSource
    this.arg_description = options.arg_description !== undefined ? options.arg_description : null;
    this.default_value = options.default_value !== undefined ? options.default_value : null;
    this.metadata = options.metadata !== undefined ? options.metadata : null;
  }

  /**
   * Create a CapArg from JSON
   * @param {Object} json - The JSON representation
   * @returns {CapArg} The CapArg instance
   */
  static fromJSON(json) {
    // A key this definition does not know is a fabric NEWER than this
    // capdag — a contract this build cannot honour. Dropping it would let a
    // cartridge advertise a contract the fabric never made (this is how a
    // `streaming` argument once went out as bounded); it is refused, named.
    // Mirrors Rust `deny_unknown_fields`.
    refuseUnknownDefinitionKeys(json, CAP_ARG_KEYS, 'cap argument');
    const sources = (json.sources || []).map(s => ArgSource.fromJSON(s));
    return new CapArg(
      json.media_urn,
      json.required,
      sources,
      {
        is_sequence: json.is_sequence,
        streaming: json.streaming,
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
    if (this.streaming) result.streaming = true;
    if (this.arg_description !== null && this.arg_description !== undefined) {
      result.arg_description = this.arg_description;
    }
    if (this.default_value !== null && this.default_value !== undefined) {
      result.default_value = this.default_value;
    }
    if (this.metadata !== null && this.metadata !== undefined) {
      result.metadata = this.metadata;
    }
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
   * The media URN the runtime demuxes this arg's input stream by: its
   * stdin source URN if it declares one, otherwise its declared slot
   * media URN. A cap need not declare any stdin source at all — a
   * producer-fed arg may be delivered by its declared URN — so this
   * never assumes a stdin source exists.
   * Mirrors Rust: CapArg::stream_urn()
   * @returns {string} The stream media URN
   */
  streamUrn() {
    const stdinSource = this.sources.find(s => s.stdin !== null);
    return stdinSource ? stdinSource.stdin : this.media_urn;
  }

  /**
   * Whether this arg is the cap's MAIN input relative to `inSpec` (the cap
   * URN's `in=` value): it declares a stdin source whose URN is `in=`. The
   * main input is always the value piped in on stdin (like a Unix command's
   * stdin), so the main arg always declares a stdin source carrying `in=`.
   * Its DECLARED slot URN may differ from that stdin URN (e.g. a `file-path`
   * slot whose piped content is a `pdf-stream`) — the stdin URN, not the
   * slot URN, is `in=`. The main input may ALSO be delivered by
   * position/cli-flag, but stdin is the defining route. Compared by
   * tagged-URN equivalence, never as strings.
   * Mirrors Rust: CapArg::is_main_input(&in_spec)
   * @param {MediaUrn|string} inSpec - The cap URN's in= spec (parsed if given as string)
   * @returns {boolean} True if this arg is the cap's main input
   */
  isMainInput(inSpec) {
    const spec = inSpec instanceof MediaUrn ? inSpec : MediaUrn.fromString(inSpec);
    return this.sources.some(s => {
      if (s.stdin === null) return false;
      try {
        return MediaUrn.fromString(s.stdin).isEquivalent(spec);
      } catch (_) {
        return false;
      }
    });
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
  constructor(urn, title, aliases, capDescription = null, metadata = {}, metadataJson = null, documentation = null) {
    if (!(urn instanceof CapUrn)) {
      throw new Error('URN must be a CapUrn instance');
    }
    if (!title || typeof title !== 'string') {
      throw new Error('Title is required and must be a string');
    }
    if (!Array.isArray(aliases) || aliases.length === 0) {
      throw new Error('Aliases are required and must be a non-empty array');
    }

    this.urn = urn;
    this.version = 0;
    this.title = title;
    this.aliases = aliases;
    this.is_abstract = false;
    this.cap_description = capDescription;
    this.documentation = documentation;
    this.metadata = metadata || {};
    this.args = [];  // Array of CapArg - unified argument format
    this.output = null;
    this.metadata_json = metadataJson;
    this.registered_by = null;  // Registration attribution
    this.supported_model_types = [];  // Model types this cap supports (omitted when empty)
    this.default_model_spec = null;   // Default model spec string (omitted when null)
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
           JSON.stringify([...this.aliases].sort()) === JSON.stringify([...other.aliases].sort()) &&
           this.is_abstract === other.is_abstract &&
           this.cap_description === other.cap_description &&
           this.documentation === other.documentation &&
           JSON.stringify(this.metadata) === JSON.stringify(other.metadata) &&
           JSON.stringify(this.args.map(a => a.toJSON())) === JSON.stringify(other.args.map(a => a.toJSON())) &&
           JSON.stringify(this.output) === JSON.stringify(other.output) &&
           JSON.stringify(this.metadata_json) === JSON.stringify(other.metadata_json) &&
           JSON.stringify(this.registered_by) === JSON.stringify(other.registered_by) &&
           JSON.stringify(this.supported_model_types) === JSON.stringify(other.supported_model_types) &&
           this.default_model_spec === other.default_model_spec;
  }

  /**
   * Convert to JSON representation
   * @returns {Object} JSON representation
   */
  toJSON() {
    const result = {
      urn: this.urn.toString(),
      title: this.title,
      aliases: this.aliases,
      cap_description: this.cap_description,
      metadata: this.metadata,
      args: this.args.map(a => a.toJSON()),
      output: this.output
    };

    if (this.version !== 0) {
      result.version = this.version;
    }

    if (this.is_abstract) {
      result.abstract = true;
    }

    // Long-form markdown documentation. Only emitted when set, to match
    // the Rust serializer which skips this field when None.
    if (typeof this.documentation === 'string' && this.documentation.length > 0) {
      result.documentation = this.documentation;
    }

    if (this.metadata_json !== null && this.metadata_json !== undefined) {
      result.metadata_json = this.metadata_json;
    }

    // supported_model_types: omit when empty, matching Rust skip_serializing_if = is_empty
    if (Array.isArray(this.supported_model_types) && this.supported_model_types.length > 0) {
      result.supported_model_types = this.supported_model_types;
    }

    // default_model_spec: omit when null, matching Rust skip_serializing_if = is_none
    if (this.default_model_spec !== null && this.default_model_spec !== undefined) {
      result.default_model_spec = this.default_model_spec;
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
    if (!Array.isArray(json.aliases) || json.aliases.length === 0) {
      throw new Error(`cap '${json.urn}' must declare at least one alias (the 'aliases' field is required and non-empty)`);
    }
    const cap = new Cap(urn, json.title, json.aliases, json.cap_description, json.metadata, json.metadata_json, documentation);
    cap.is_abstract = json.abstract === true;
    cap.version = (typeof json.version === 'number' && json.version !== 0) ? json.version : 0;
    // Parse args (new format)
    if (json.args && Array.isArray(json.args)) {
      cap.args = json.args.map(a => CapArg.fromJSON(a));
    } else {
      cap.args = [];
    }
    if (json.output !== undefined && json.output !== null) {
      refuseUnknownDefinitionKeys(json.output, CAP_OUTPUT_KEYS, 'cap output');
    }
    cap.output = json.output;
    cap.registered_by = json.registered_by ? RegisteredBy.fromJSON(json.registered_by) : null;
    cap.supported_model_types = Array.isArray(json.supported_model_types) ? json.supported_model_types : [];
    cap.default_model_spec = (typeof json.default_model_spec === 'string') ? json.default_model_spec : null;
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
 * A cap group bundles caps and adapter URNs as an atomic registration unit.
 *
 * If any adapter in the group creates ambiguity with an already-registered
 * adapter, the entire group is rejected — none of its caps or adapters get
 * registered. Mirrors CSCapGroup / capdag::cap_group::CapGroup.
 */
class CapGroup {
  /**
   * @param {string} name - Group name (for diagnostics and error messages)
   * @param {Cap[]} caps - Caps in this group
   * @param {string[]} adapterUrns - Media URNs this group's adapter handles
   */
  constructor(name, caps = [], adapterUrns = []) {
    if (!name || typeof name !== 'string') {
      throw new Error('CapGroup name is required and must be a string');
    }
    this.name = name;
    this.caps = caps;
    this.adapter_urns = adapterUrns;
  }

  /**
   * Create a CapGroup from JSON representation
   * @param {Object} json - The JSON data
   * @returns {CapGroup} The CapGroup instance
   */
  static fromJSON(json) {
    if (!json.name) {
      throw new Error('CapGroup missing required field: name');
    }
    const caps = Array.isArray(json.caps) ? json.caps.map(c => Cap.fromJSON(c)) : [];
    const adapterUrns = Array.isArray(json.adapter_urns) ? json.adapter_urns : [];
    return new CapGroup(json.name, caps, adapterUrns);
  }

  /**
   * Convert to JSON representation
   * @returns {Object} The JSON representation
   */
  toJSON() {
    return {
      name: this.name,
      caps: this.caps.map(c => c.toJSON()),
      adapter_urns: this.adapter_urns
    };
  }
}

/**
 * Unified cap-based manifest for components (cartridges).
 *
 * `(registry_url, channel, name, version)` is the cartridge's full
 * identity — each (registry, channel) pair is an independent namespace.
 * Mirrors CSCapManifest / capdag::cap_manifest::CapManifest.
 */
class CapManifest {
  /**
   * @param {string} name - Component name
   * @param {string} version - Semver version string
   * @param {string} channel - Distribution channel: 'release' or 'nightly'
   * @param {string|null} registryUrl - Verbatim registry URL, or null for dev builds
   * @param {string} description - Short plain-text description
   * @param {CapGroup[]} capGroups - Cap groups (all caps must be in a group)
   */
  constructor(name, version, channel, registryUrl, description, capGroups = []) {
    if (typeof name !== 'string') {
      throw new Error('CapManifest name is required and must be a string');
    }
    if (typeof version !== 'string') {
      throw new Error('CapManifest version is required and must be a string');
    }
    if (channel !== 'release' && channel !== 'nightly') {
      throw new Error(`CapManifest channel must be 'release' or 'nightly', got: '${channel}'`);
    }
    if (registryUrl !== null && registryUrl !== undefined && typeof registryUrl !== 'string') {
      throw new Error("CapManifest registry_url must be null (dev build) or a string");
    }
    if (typeof description !== 'string') {
      throw new Error('CapManifest description is required and must be a string');
    }

    this.name = name;
    this.version = version;
    this.channel = channel;
    this.registry_url = registryUrl !== undefined ? registryUrl : null;
    this.description = description;
    this.cap_groups = capGroups;
    this.author = null;
    this.page_url = null;
  }

  /**
   * Returns all caps flattened across all cap groups.
   * @returns {Cap[]}
   */
  allCaps() {
    return this.cap_groups.flatMap(g => g.caps);
  }

  /**
   * Create a CapManifest from JSON / dictionary representation.
   *
   * `registry_url` must be present as a key; it may be `null` (dev build)
   * or a non-empty string (registry build). A missing key is a hard parse
   * error so old-schema payloads never silently pass.
   *
   * @param {Object} json - The JSON data
   * @returns {CapManifest} The CapManifest instance
   * @throws {Error} If required fields are missing or invalid
   */
  static fromJSON(json) {
    if (!Object.prototype.hasOwnProperty.call(json, 'name')) throw new Error('CapManifest missing required field: name');
    if (!Object.prototype.hasOwnProperty.call(json, 'version')) throw new Error('CapManifest missing required field: version');
    if (!Object.prototype.hasOwnProperty.call(json, 'channel')) throw new Error('CapManifest missing required field: channel');
    if (!Object.prototype.hasOwnProperty.call(json, 'description')) throw new Error('CapManifest missing required field: description');
    if (!Array.isArray(json.cap_groups)) throw new Error('CapManifest missing required field: cap_groups');

    // registry_url must be present as a key (may be null for dev builds)
    if (!Object.prototype.hasOwnProperty.call(json, 'registry_url')) {
      throw new Error(
        'CapManifest missing required field: registry_url. ' +
        'It must be present with value null for dev builds or a URL string for registry builds.'
      );
    }

    if (json.channel !== 'release' && json.channel !== 'nightly') {
      throw new Error(`CapManifest channel must be 'release' or 'nightly', got: '${json.channel}'`);
    }

    const registryUrl = (json.registry_url !== null && json.registry_url !== undefined)
      ? json.registry_url
      : null;

    if (registryUrl !== null && typeof registryUrl !== 'string') {
      throw new Error("CapManifest registry_url must be null or a string");
    }

    const capGroups = json.cap_groups.map(g => CapGroup.fromJSON(g));
    const manifest = new CapManifest(
      json.name,
      json.version,
      json.channel,
      registryUrl,
      json.description,
      capGroups
    );

    if (Object.prototype.hasOwnProperty.call(json, 'author')) {
      if (typeof json.author !== 'string') {
        throw new Error('CapManifest author must be a string when present');
      }
      manifest.author = json.author;
    }
    if (Object.prototype.hasOwnProperty.call(json, 'page_url')) {
      if (typeof json.page_url !== 'string') {
        throw new Error('CapManifest page_url must be a string when present');
      }
      manifest.page_url = json.page_url;
    }

    return manifest;
  }

  /**
   * Convert to JSON representation
   * @returns {Object} The JSON representation
   */
  toJSON() {
    const result = {
      name: this.name,
      version: this.version,
      channel: this.channel,
      registry_url: this.registry_url,
      description: this.description,
      cap_groups: this.cap_groups.map(g => g.toJSON())
    };
    if (this.author !== null && this.author !== undefined) result.author = this.author;
    if (this.page_url !== null && this.page_url !== undefined) result.page_url = this.page_url;
    return result;
  }
}

/**
 * Helper functions for creating capabilities
 */
function createCap(urn, title, aliases) {
  return new Cap(urn, title, aliases);
}

function createCapWithDescription(urn, title, aliases, description) {
  return new Cap(urn, title, aliases, description);
}

function createCapWithMetadata(urn, title, aliases, metadata) {
  return new Cap(urn, title, aliases, null, metadata);
}

function createCapWithDescriptionAndMetadata(urn, title, aliases, description, metadata) {
  return new Cap(urn, title, aliases, description, metadata);
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
        if (details.expectedMediaDef) {
          const errors = details.schemaErrors ? details.schemaErrors.join(', ') : 'validation failed';
          return `Cap '${capUrn}' argument '${details.argumentName}' expects media_def '${details.expectedMediaDef}' but ${errors} for value: ${JSON.stringify(details.actualValue)}`;
        }
        return `Cap '${capUrn}' argument '${details.argumentName}' expects type '${details.expectedType}' but received '${details.actualType}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'MediaValidationFailed':
        return `Cap '${capUrn}' argument '${details.argumentName}' failed validation rule '${details.validationRule}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'MediaDefValidationFailed':
        return `Cap '${capUrn}' argument '${details.argumentName}' failed media def '${details.mediaUrn}' validation rule '${details.validationRule}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'InvalidOutputType':
        if (details.expectedMediaDef) {
          const errors = details.schemaErrors ? details.schemaErrors.join(', ') : 'validation failed';
          return `Cap '${capUrn}' output expects media_def '${details.expectedMediaDef}' but ${errors} for value: ${JSON.stringify(details.actualValue)}`;
        }
        return `Cap '${capUrn}' output expects type '${details.expectedType}' but received '${details.actualType}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'OutputValidationFailed':
        return `Cap '${capUrn}' output failed validation rule '${details.validationRule}' with value: ${JSON.stringify(details.actualValue)}`;
      case 'OutputMediaDefValidationFailed':
        return `Cap '${capUrn}' output failed media def '${details.mediaUrn}' validation rule '${details.validationRule}' with value: ${JSON.stringify(details.actualValue)}`;
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

  // RULE11: Stdin source consistency with in= spec
  // If in= is media:void, no args may have stdin sources.
  // If in= is anything other than media:void, at least one arg must have a stdin source.
  const inMediaUrn = cap.urn.inMediaUrn();
  const voidUrn = MediaUrn.fromString(MEDIA_VOID);
  const inIsVoid = inMediaUrn.isEquivalent(voidUrn);
  if (inIsVoid && stdinUrns.length > 0) {
    throw new ValidationError('InvalidCapSchema', capUrn, {
      issue: `RULE11: Cap has in="${MEDIA_VOID}" but argument(s) declare stdin source`
    });
  }
  if (!inIsVoid && stdinUrns.length === 0 && args.length > 0) {
    throw new ValidationError('InvalidCapSchema', capUrn, {
      issue: `RULE11: Cap has non-void in= spec but no argument declares a stdin source`
    });
  }

  // RULE14: Only the main input may stream. `streaming: true` declares that
  // an argument is consumed without a length promise — a feed. Side
  // arguments (options, model specs, prompts alongside the main input) are
  // values the runtime demuxes whole; a feed there has no meaning and would
  // let an unbounded stream reach a collector that must refuse it (L16).
  for (const arg of args) {
    if (arg.streaming && !arg.isMainInput(inMediaUrn)) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `RULE14: Argument '${arg.media_urn}' declares streaming=true but is not the main input (no stdin source equivalent to in='${cap.urn.getInSpec()}') — only the main input may be consumed without a length promise`
      });
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

}

/**
 * Input argument validator
 */
class InputValidator {
  /**
   * Validate positional arguments against cap input schema.
   *
   * @param {Cap} cap
   * @param {Array} argValues
   * @param {Array} mediaDefs - Media defs the cap's args reference;
   *   threaded through to `resolveMediaUrn` for schema resolution.
   *   Required for any cap whose args reference media URNs that
   *   resolve through the registry.
   */
  static validatePositionalArguments(cap, argValues, mediaDefs = []) {
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

      InputValidator.validateSingleArgument(cap, args.required[i], argValues[i], mediaDefs);
    }

    // Validate optional arguments if provided
    const requiredCount = args.required.length;
    for (let i = 0; i < args.optional.length; i++) {
      const argIndex = requiredCount + i;
      if (argIndex < argValues.length) {
        InputValidator.validateSingleArgument(cap, args.optional[i], argValues[argIndex], mediaDefs);
      }
    }
  }

  /**
   * Validate named arguments against cap input schema.
   *
   * @param {Cap} cap
   * @param {Array} namedArgs
   * @param {Array} mediaDefs - Media defs the cap's args reference;
   *   threaded through to `resolveMediaUrn` for schema resolution.
   */
  static validateNamedArguments(cap, namedArgs, mediaDefs = []) {
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
      InputValidator.validateSingleArgument(cap, reqArg, providedValue, mediaDefs);
    }

    // Validate optional arguments if provided
    for (const optArg of args.optional) {
      if (providedArgs.has(optArg.name)) {
        const providedValue = providedArgs.get(optArg.name);
        InputValidator.validateSingleArgument(cap, optArg, providedValue, mediaDefs);
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
   * 1. Type validation + media def validation rules (inherent to semantic type)
   */
  static validateSingleArgument(cap, argDef, value, mediaDefs = []) {
    // Type validation - returns the resolved MediaDef
    const mediaDef = InputValidator.validateArgumentType(cap, argDef, value, mediaDefs);

    // Media def validation rules (inherent to the semantic type)
    if (mediaDef && mediaDef.validation) {
      InputValidator.validateMediaDefRules(cap, argDef, mediaDef, value);
    }
  }

  /**
   * Validate argument type using MediaDef
   * Resolves spec ID to MediaDef before validation
   * @returns {MediaDef|null} The resolved MediaDef
   */
  static validateArgumentType(cap, argDef, value, mediaDefs = []) {
    const capUrn = cap.urnString();

    // Get mediaUrn field (now contains a media URN)
    const mediaUrn = argDef.mediaUrn || argDef.media_urn;
    if (!mediaUrn) {
      // No media_urn - skip validation
      return null;
    }

    // Resolve media URN to MediaDef - FAIL HARD if unresolvable
    let mediaDef;
    try {
      mediaDef = resolveMediaUrn(mediaUrn, mediaDefs);
    } catch (e) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `Cannot resolve media URN '${mediaUrn}' for argument '${argDef.name}': ${e.message}`
      });
    }

    // For binary media types, expect base64-encoded string
    if (mediaDef.isBinary()) {
      if (typeof value !== 'string') {
        throw new ValidationError('InvalidArgumentType', capUrn, {
          argumentName: argDef.name,
          expectedMediaDef: mediaUrn,
          actualValue: value,
          schemaErrors: ['Expected base64-encoded string for binary type']
        });
      }
      return mediaDef;
    }

    // If the resolved media def has a local schema, validate against it
    if (mediaDef.schema) {
      // TODO: Full JSON Schema validation would require a JSON Schema library
      // For now, skip local schema validation
    }

    // For types with profile, validate against profile
    if (mediaDef.profile) {
      const valid = InputValidator.validateAgainstProfile(mediaDef.profile, value);
      if (!valid) {
        throw new ValidationError('InvalidArgumentType', capUrn, {
          argumentName: argDef.name,
          expectedMediaDef: mediaUrn,
          actualValue: value,
          schemaErrors: [`Value does not match profile schema`]
        });
      }
    }

    return mediaDef;
  }

  /**
   * Validate value against media def's inherent validation rules (first pass)
   * @param {Cap} cap - The capability
   * @param {Object} argDef - The argument definition
   * @param {MediaDef} mediaDef - The resolved media def
   * @param {*} value - The value to validate
   */
  static validateMediaDefRules(cap, argDef, mediaDef, value) {
    const capUrn = cap.urnString();
    const validation = mediaDef.validation;
    const mediaUrn = mediaDef.mediaUrn;

    // Min/max validation for numbers
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        throw new ValidationError('MediaDefValidationFailed', capUrn, {
          argumentName: argDef.name,
          mediaUrn: mediaUrn,
          validationRule: `min value ${validation.min}`,
          actualValue: value
        });
      }
      if (validation.max !== undefined && value > validation.max) {
        throw new ValidationError('MediaDefValidationFailed', capUrn, {
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
        throw new ValidationError('MediaDefValidationFailed', capUrn, {
          argumentName: argDef.name,
          mediaUrn: mediaUrn,
          validationRule: `min length ${validation.min_length}`,
          actualValue: value
        });
      }
      if (validation.max_length !== undefined && length > validation.max_length) {
        throw new ValidationError('MediaDefValidationFailed', capUrn, {
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
        throw new ValidationError('MediaDefValidationFailed', capUrn, {
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
        throw new ValidationError('MediaDefValidationFailed', capUrn, {
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
   * Validate output against cap output schema using MediaDef.
   *
   * @param {Cap} cap
   * @param {*} output
   * @param {Array} mediaDefs - Media defs the cap output references;
   *   threaded through to `resolveMediaUrn` for schema resolution.
   */
  static validateOutput(cap, output, mediaDefs = []) {
    const outputDef = cap.output;

    if (!outputDef) return; // No output definition to validate against

    // Type validation - returns the resolved MediaDef
    const mediaDef = OutputValidator.validateOutputType(cap, outputDef, output, mediaDefs);

    // Media def validation rules (inherent to the semantic type)
    if (mediaDef && mediaDef.validation) {
      OutputValidator.validateOutputMediaDefRules(cap, mediaDef, output);
    }
  }

  /**
   * Validate output type using MediaDef
   * @returns {MediaDef|null} The resolved MediaDef
   */
  static validateOutputType(cap, outputDef, value, mediaDefs = []) {
    const capUrn = cap.urnString();

    // Get mediaUrn field (now contains a media URN)
    const mediaUrn = outputDef.mediaUrn || outputDef.media_urn;
    if (!mediaUrn) {
      // No media_urn - skip validation
      return null;
    }

    // Resolve media URN to MediaDef - FAIL HARD if unresolvable
    let mediaDef;
    try {
      mediaDef = resolveMediaUrn(mediaUrn, mediaDefs);
    } catch (e) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `Cannot resolve media URN '${mediaUrn}' for output: ${e.message}`
      });
    }

    // For binary media types, expect base64-encoded string
    if (mediaDef.isBinary()) {
      if (typeof value !== 'string') {
        throw new ValidationError('InvalidOutputType', capUrn, {
          expectedMediaDef: mediaUrn,
          actualValue: value,
          schemaErrors: ['Expected base64-encoded string for binary type']
        });
      }
      return mediaDef;
    }

    // If the resolved media def has a local schema, validate against it
    if (mediaDef.schema) {
      // TODO: Full JSON Schema validation would require a JSON Schema library
      // For now, skip local schema validation
    }

    // For types with profile, validate against profile
    if (mediaDef.profile) {
      const valid = InputValidator.validateAgainstProfile(mediaDef.profile, value);
      if (!valid) {
        throw new ValidationError('InvalidOutputType', capUrn, {
          expectedMediaDef: mediaUrn,
          actualValue: value,
          schemaErrors: [`Value does not match profile schema`]
        });
      }
    }

    return mediaDef;
  }

  /**
   * Validate output against media def's inherent validation rules (first pass)
   */
  static validateOutputMediaDefRules(cap, mediaDef, value) {
    const capUrn = cap.urnString();
    const validation = mediaDef.validation;
    const mediaUrn = mediaDef.mediaUrn;

    // Min/max validation for numbers
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        throw new ValidationError('OutputMediaDefValidationFailed', capUrn, {
          mediaUrn: mediaUrn,
          validationRule: `min value ${validation.min}`,
          actualValue: value
        });
      }
      if (validation.max !== undefined && value > validation.max) {
        throw new ValidationError('OutputMediaDefValidationFailed', capUrn, {
          mediaUrn: mediaUrn,
          validationRule: `max value ${validation.max}`,
          actualValue: value
        });
      }
    }

    // Length validation for strings
    if (typeof value === 'string') {
      if (validation.min_length !== undefined && value.length < validation.min_length) {
        throw new ValidationError('OutputMediaDefValidationFailed', capUrn, {
          mediaUrn: mediaUrn,
          validationRule: `min length ${validation.min_length}`,
          actualValue: value
        });
      }
      if (validation.max_length !== undefined && value.length > validation.max_length) {
        throw new ValidationError('OutputMediaDefValidationFailed', capUrn, {
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
        throw new ValidationError('OutputMediaDefValidationFailed', capUrn, {
          mediaUrn: mediaUrn,
          validationRule: `pattern ${validation.pattern}`,
          actualValue: value
        });
      }
    }

    // Allowed values validation
    if (validation.allowed_values && Array.isArray(validation.allowed_values)) {
      if (!validation.allowed_values.includes(value)) {
        throw new ValidationError('OutputMediaDefValidationFailed', capUrn, {
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

    if (!Array.isArray(cap.aliases) || cap.aliases.length === 0) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: 'Cap must have at least one alias'
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
 * Result from a cap execution.
 *
 * Scalar outputs carry raw materialized bytes (e.g. UTF-8 text, raw binary).
 * List outputs carry a CBOR sequence of values, one per list item.
 * Empty represents a void cap with no output.
 */
class CapResult {
  static KIND_SCALAR = 'scalar';
  static KIND_LIST = 'list';
  static KIND_EMPTY = 'empty';

  /**
   * @param {'scalar'|'list'|'empty'} kind
   * @param {Uint8Array|null} data - Bytes for scalar or CBOR sequence for list, null for empty
   */
  constructor(kind, data = null) {
    this.kind = kind;
    this.data = data;
  }

  /** Create a CapResult carrying raw bytes (scalar output). */
  static scalar(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || []);
    return new CapResult(CapResult.KIND_SCALAR, bytes);
  }

  /** Create a CapResult carrying a CBOR sequence (list output). */
  static list(cborSequence) {
    const bytes = cborSequence instanceof Uint8Array ? cborSequence : new Uint8Array(cborSequence || []);
    return new CapResult(CapResult.KIND_LIST, bytes);
  }

  /** Create a CapResult for void caps. */
  static empty() {
    return new CapResult(CapResult.KIND_EMPTY, null);
  }

  /** Returns true if this is a scalar result. */
  isScalar() { return this.kind === CapResult.KIND_SCALAR; }

  /** Returns true if this is a list result. */
  isList() { return this.kind === CapResult.KIND_LIST; }

  /** Returns true if this is an empty result. */
  isEmpty() { return this.kind === CapResult.KIND_EMPTY; }
}

// ============================================================================

/**
 * Unified argument type - arguments are identified by media_urn.
 * The cap definition's sources specify how to extract values (stdin, position, cli_flag).
 */
class CapArgumentValue {
  /**
   * Create a new CapArgumentValue
   * @param {string} mediaUrn - Semantic identifier, e.g., "media:enc=utf-8;model-spec"
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
// CAPFAB - Directed graph of capability conversions
// ============================================================================

/**
 * An edge in the capability graph representing a conversion from one media URN to another.
 */
class CapFabEdge {
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
class CapFabStats {
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
class CapFab {
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
    const edge = new CapFabEdge(fromUrn, toUrn, cap, registryName, specificity);
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
   * Get all nodes (media URNs) in the graph.
   * @returns {Set<string>}
   */
  getNodes() {
    return new Set(this.nodes);
  }

  /**
   * Get all edges in the graph.
   * @returns {CapFabEdge[]}
   */
  getEdges() {
    return [...this.edges];
  }

  /**
   * Get all edges where the provided URN satisfies the edge's input requirement.
   * Uses conformsTo-based matching instead of exact string matching.
   * @param {string} urn - The media URN
   * @returns {CapFabEdge[]}
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
   * @returns {CapFabEdge[]}
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
   * @returns {CapFabEdge[]}
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
   * @returns {CapFabEdge[]|null} Array of edges representing the path, or null if no path exists
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
   * @returns {CapFabEdge[][]} Array of paths (each path is an array of edges)
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
   * @returns {CapFabEdge[]|null} Array of edges representing the best path, or null if no path exists
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
   * @returns {CapFabStats}
   */
  stats() {
    return new CapFabStats(
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
 * Cartridge cap group from registry
 */
class CartridgeCapGroup {
  constructor(data) {
    if (!data.name) throw new Error('CapGroup missing name');
    this.name = data.name;
    this.caps = (data.caps || []).map(c => new CartridgeCapSummary(c.urn, c.title, c.description || ''));
    this.adapter_urns = data.adapter_urns || [];
  }

  /** Flat caps in this group */
  allCaps() {
    return this.caps;
  }
}

// =============================================================================
// Cartridge registry slug
// =============================================================================
//
// Deterministic mapping from a registry URL to a top-level folder
// name under the cartridges install root. Mirrors
// capdag::cartridge_slug byte-for-byte: SHA-256 of the URL bytes,
// lowercase hex, first 16 chars. The literal string "dev" is
// reserved for dev cartridges that have no registry.
//
// JS uses Web Crypto's SubtleCrypto for SHA-256. The function is
// async because `crypto.subtle.digest` returns a Promise; consumers
// in synchronous contexts must await.

const DEV_SLUG = "dev";

/**
 * The authority (host[:port]) of a registry URL: after `://` up to the next
 * `/`, `?`, or `#` (path/query/fragment discarded).
 */
function authorityOfRegistryUrl(url) {
  const i = url.indexOf("://");
  const afterScheme = i >= 0 ? url.slice(i + 3) : url;
  const m = afterScheme.search(/[/?#]/);
  return m >= 0 ? afterScheme.slice(0, m) : afterScheme;
}

/**
 * Compute the on-disk slug for a registry URL. Mirrors
 * capdag::cartridge_slug::slug_for byte-for-byte: `DEV_SLUG` for null/undefined,
 * otherwise a path-safe transform of the URL's authority (host[:port]) —
 * ASCII-lowercased, every character outside `[a-z0-9.-]` replaced by `-`.
 * Depends ONLY on the authority; path/version/query/trailing-slash/host-case
 * do not change it.
 *
 * @param {string|null|undefined} registryUrl
 * @returns {string}
 */
function slugForRegistryUrlSync(registryUrl) {
  if (registryUrl === null || registryUrl === undefined) {
    return DEV_SLUG;
  }
  let out = "";
  for (const ch of authorityOfRegistryUrl(registryUrl)) {
    const lc = ch >= "A" && ch <= "Z" ? ch.toLowerCase() : ch;
    out += (lc >= "a" && lc <= "z") || (lc >= "0" && lc <= "9") || lc === "." || lc === "-" ? lc : "-";
  }
  return out;
}

/**
 * Async wrapper retained for callers that `await` the slug. The computation is
 * synchronous (no hashing) — the authority transform needs no crypto.
 * @returns {Promise<string>}
 */
async function slugForRegistryUrl(registryUrl) {
  return slugForRegistryUrlSync(registryUrl);
}

function isRegistrySlug(s) {
  return typeof s === "string"
      && s.length > 0
      && s !== DEV_SLUG
      && /^[a-z0-9.-]+$/.test(s);
}

// =============================================================================
// Host-compatibility resolution for registry cartridges
// =============================================================================
//
// Mirrors capdag::bifaci::cartridge_repo: host_platform(), CompatStatus,
// CartridgeBuild::primary_package and CartridgeInfo::resolve_for_host.

/**
 * The platform string ({os}-{arch}) of the runtime that calls this, in the
 * exact form the registry uses (`darwin-arm64`, `darwin-x86_64`,
 * `linux-x86_64`, `windows-x86_64`). Single source of truth: every consumer
 * that needs "what am I running on?" calls this rather than re-deriving the
 * os/arch mapping.
 *
 * Mirrors capdag::bifaci::cartridge_repo::host_platform. The Rust version
 * derives os/arch from `cfg!`/`std::env::consts` at compile time; the Node
 * equivalent reads `process.platform`/`process.arch` at runtime — the engine
 * binary literally runs on this platform, so this is the authoritative host
 * string for compatibility resolution. Node's `darwin`/`linux`/`win32` map to
 * the registry's `darwin`/`linux`/`windows`; Node's `arm64`/`x64` map to the
 * registry's `arm64`/`x86_64`. Any platform/arch Node reports that has no
 * mapping passes through unchanged, exactly as the Rust fallback does.
 *
 * @returns {string} The normalized `{os}-{arch}` host platform string.
 */
function hostPlatform() {
  const rawOs = process.platform;
  let os;
  if (rawOs === 'darwin') {
    os = 'darwin';
  } else if (rawOs === 'linux') {
    os = 'linux';
  } else if (rawOs === 'win32') {
    os = 'windows';
  } else {
    os = rawOs;
  }
  const rawArch = process.arch;
  let arch;
  if (rawArch === 'arm64') {
    arch = 'arm64';
  } else if (rawArch === 'x64') {
    arch = 'x86_64';
  } else {
    arch = rawArch;
  }
  return `${os}-${arch}`;
}

/**
 * Host-compatibility status of a registry cartridge, resolved against a
 * specific host platform string. Mirrors Rust CompatStatus.
 */
const CompatStatus = Object.freeze({
  // The latest version has a build for this host platform — install as-is.
  COMPATIBLE: 'compatible',
  // The latest version has no host build, but an older version does;
  // resolvedVersion names that older version. Install it, mark outdated.
  COMPATIBLE_OUTDATED: 'compatible_outdated',
  // No version has a build for this host platform. Nothing to install.
  INCOMPATIBLE: 'incompatible',
});

/**
 * The installer package the host should use for a build, preferring the
 * platform's native format. Falls back to the legacy singular `package` when
 * `packages[]` is empty (pre-dual-write manifests). Returns `null` only when
 * the build ships no installer at all.
 *
 * Mirrors CartridgeBuild::primary_package. Builds in the JS model are plain
 * objects (`{platform, packages?, package?}`), so this is a free function
 * taking the build object rather than a method.
 *
 * @param {Object} build - A platform build object with `platform`, optional
 *   `packages` array and optional legacy `package`.
 * @returns {Object|null} The chosen distribution-info object, or null.
 */
function primaryPackage(build) {
  const os = String(build.platform || '').split('-')[0];
  let preference;
  switch (os) {
    case 'darwin': preference = ['pkg']; break;
    case 'linux': preference = ['deb', 'rpm']; break;
    case 'windows': preference = ['msi', 'exe']; break;
    default: preference = []; break;
  }
  const packages = Array.isArray(build.packages) ? build.packages : [];
  for (const format of preference) {
    const pkg = packages.find(p => p.format === format);
    if (pkg) return pkg;
  }
  if (packages.length > 0) return packages[0];
  return build.package || null;
}

/**
 * The resolved verdict the engine attaches to an available cartridge: which
 * version/package the host should install (if any) and a human reason when it
 * is not the latest-and-greatest. Mirrors CartridgeCompatibilityResolution.
 */
class CartridgeCompatibilityResolution {
  /**
   * @param {Object} opts
   * @param {string} opts.status - A CompatStatus value.
   * @param {string} opts.hostPlatform - The host platform this was resolved for.
   * @param {string|null} [opts.resolvedVersion] - Newest version with a host
   *   build (null when Incompatible).
   * @param {Object|null} [opts.resolvedPackage] - Host-preferred installer
   *   package within resolvedVersion (null when Incompatible).
   * @param {string|null} [opts.reason] - Explanation when status is not Compatible.
   */
  constructor({ status, hostPlatform, resolvedVersion = null, resolvedPackage = null, reason = null }) {
    this.status = status;
    this.hostPlatform = hostPlatform;
    this.resolvedVersion = resolvedVersion;
    this.resolvedPackage = resolvedPackage;
    this.reason = reason;
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
    if (!Array.isArray(data.cap_groups)) throw new Error(`CartridgeInfo ${data.id || '?'}: missing cap_groups array`);
    this.cap_groups = data.cap_groups.map(g => new CartridgeCapGroup(g));
    this.categories = data.categories || [];
    this.tags = data.tags || [];
    // Versions with platform-specific builds
    this.versions = data.versions || {};
    this.availableVersions = data.availableVersions || [];
    // Channel: 'release' or 'nightly'. Required — set by the registry
    // transformer when flattening the channel-partitioned registry.
    if (data.channel !== 'release' && data.channel !== 'nightly') {
      throw new Error(`CartridgeInfo ${data.id || '?'}: invalid or missing channel '${data.channel}'`);
    }
    this.channel = data.channel;
    // Registry URL: verbatim string the registry was fetched from.
    // Required and non-empty — every CartridgeInfo carries the URL of
    // the registry that served it so downstream consumers can build
    // the (registryUrl, channel, id) identity tuple without
    // re-deriving it. The registry transformer stamps this onto every
    // entry at flatten time.
    if (typeof data.registryUrl !== 'string' || data.registryUrl.length === 0) {
      throw new Error(`CartridgeInfo ${data.id || '?'}: registryUrl is required and must be a non-empty string`);
    }
    this.registryUrl = data.registryUrl;
  }

  /** All caps flattened across all cap_groups, deduplicated by URN */
  allCaps() {
    const seen = new Set();
    const result = [];
    for (const group of this.cap_groups) {
      for (const cap of group.caps) {
        if (!seen.has(cap.urn)) {
          seen.add(cap.urn);
          result.push(cap);
        }
      }
    }
    return result;
  }

  /**
   * Check if cartridge is signed (has team_id and signed_at)
   */
  isSigned() {
    return this.teamId.length > 0 && this.signedAt.length > 0;
  }

  /**
   * Get the build for a specific platform from the latest version
   */
  buildForPlatform(platform) {
    const latestVersionData = this.versions[this.version];
    if (!latestVersionData) return null;
    return (latestVersionData.builds || []).find(b => b.platform === platform) || null;
  }

  /**
   * Get all platforms available across all versions
   */
  availablePlatforms() {
    const platforms = new Set();
    for (const versionData of Object.values(this.versions)) {
      for (const build of (versionData.builds || [])) {
        platforms.add(build.platform);
      }
    }
    return Array.from(platforms).sort();
  }

  /**
   * Find this cartridge's build for `hostPlatform` within a given version, if
   * any. The host package within it is then chosen by `primaryPackage`.
   * Mirrors CartridgeInfo::build_for_host.
   *
   * @param {string} version
   * @param {string} hostPlatform
   * @returns {Object|null}
   */
  buildForHost(version, hostPlatform) {
    const versionData = this.versions[version];
    if (!versionData) return null;
    return (versionData.builds || []).find(b => b.platform === hostPlatform) || null;
  }

  /**
   * Resolve which version/package this host should install, scanning versions
   * newest-first (`availableVersions` is the authoritative newest-first
   * ordering). The newest version with a usable host build wins:
   *   - it IS the latest version (`this.version`) → Compatible
   *   - it is older than the latest → CompatibleOutdated
   *   - no version has a usable host build → Incompatible
   *
   * A build whose primaryPackage is null ships no installer at all; it is
   * SKIPPED (not resolved to an un-downloadable version) and the scan
   * continues to older versions. "Latest" is `this.version` — the same field
   * `buildForPlatform` trusts — not `availableVersions[0]`. We do not paper
   * over a `this.version` with no host build by silently calling it latest.
   *
   * Mirrors CartridgeInfo::resolve_for_host.
   *
   * @param {string} hostPlatform - Normally `hostPlatform()`; passed in so the
   *   resolution is unit-testable for arbitrary hosts.
   * @returns {CartridgeCompatibilityResolution}
   */
  resolveForHost(hostPlatform) {
    const latest = this.version;

    for (const ver of this.availableVersions) {
      const build = this.buildForHost(ver, hostPlatform);
      if (!build) continue;
      // primaryPackage returns null only when the build ships no installer at
      // all — a build entry with an empty packages[] and no legacy package.
      // That is a malformed registry build; skip it rather than resolve to a
      // version the host cannot actually download, and keep scanning older
      // versions for a usable one.
      const pkg = primaryPackage(build);
      if (!pkg) continue;
      if (ver === latest) {
        return new CartridgeCompatibilityResolution({
          status: CompatStatus.COMPATIBLE,
          hostPlatform,
          resolvedVersion: ver,
          resolvedPackage: pkg,
          reason: null,
        });
      }
      return new CartridgeCompatibilityResolution({
        status: CompatStatus.COMPATIBLE_OUTDATED,
        hostPlatform,
        resolvedVersion: ver,
        resolvedPackage: pkg,
        reason: `Latest ${latest} has no ${hostPlatform} build; newest compatible is ${ver}`,
      });
    }

    return new CartridgeCompatibilityResolution({
      status: CompatStatus.INCOMPATIBLE,
      hostPlatform,
      resolvedVersion: null,
      resolvedPackage: null,
      reason: `No installable ${hostPlatform} build available in any version`,
    });
  }
}

/**
 * Cartridge suggestion for a missing cap.
 *
 * `(registryUrl, channel, cartridgeId)` is the suggesting
 * cartridge's full identity — installs of the same id from
 * different registries × channels are independent records and the
 * client keeps both visible. `registryUrl` is required and
 * non-empty; suggestions never come from dev installs.
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
    if (data.channel !== 'release' && data.channel !== 'nightly') {
      throw new Error(`CartridgeSuggestion: invalid or missing channel '${data.channel}'`);
    }
    this.channel = data.channel;
    if (typeof data.registryUrl !== 'string' || data.registryUrl.length === 0) {
      throw new Error("CartridgeSuggestion: registryUrl is required and must be a non-empty string");
    }
    this.registryUrl = data.registryUrl;
  }
}

/**
 * Cartridge registry cache entry. The cartridges map is keyed by
 * `<registryUrl>:<channel>:<id>` so the same id can independently
 * coexist across multiple registries × both channels.
 */
class CartridgeRepoCache {
  constructor(repoUrl) {
    this.cartridges = new Map(); // "<registryUrl>:<channel>:<id>" -> CartridgeInfo
    this.capToCartridges = new Map(); // cap_urn -> [{registryUrl, channel, id}]
    this.lastUpdated = Date.now();
    this.repoUrl = repoUrl;
  }
}

function _cacheKey(registryUrl, channel, id) {
  return `${registryUrl}:${channel}:${id}`;
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
   * Fetch a v5.0 channel-partitioned registry from a URL and flatten
   * to a list of `CartridgeInfo`, one per `(channel, id)` pair.
   */
  async fetchRegistry(repoUrl) {
    const response = await fetch(repoUrl);
    if (response.status === 404) {
      // Manifest not published yet — return an empty list so the
      // caller's cache reflects "no cartridges available" without
      // poisoning future syncs.
      return [];
    }
    if (!response.ok) {
      throw new Error(`Cartridge registry request failed: HTTP ${response.status} from ${repoUrl}`);
    }

    const data = await response.json();
    if (data.schemaVersion !== '5.0') {
      throw new Error(`Cartridge registry from ${repoUrl} has schemaVersion '${data.schemaVersion}'; required: 5.0`);
    }
    // Cartridge registry regime version. v0 was the pre-versioning legacy at
    // the bare /manifest path; this speaks only v1 at /v1/manifest. A manifest
    // from a different regime version is rejected, not reinterpreted.
    if (data.registryVersion !== 1) {
      throw new Error(`Cartridge registry from ${repoUrl} has registryVersion '${data.registryVersion}'; this build speaks v1`);
    }
    // A cartridge registry must declare the fabric its caps resolve against. The
    // client cross-checks this equals its own fabric (so every registry it uses
    // shares one fabric); here we require it is at least present.
    if (typeof data.fabricRegistryUrl !== 'string' || data.fabricRegistryUrl.length === 0) {
      throw new Error(`Cartridge registry from ${repoUrl}: missing required 'fabricRegistryUrl' (the fabric its caps resolve against)`);
    }
    // Self-referential check: the manifest declares its own URL via
    // `registryUrl`. It must match the URL we just fetched from
    // byte-for-byte — a mismatch is a manifest-corruption signal
    // (publisher wrote the wrong URL, or manifest is being served
    // from an unexpected mirror). Identity downstream depends on
    // this string; refuse to ingest on mismatch.
    if (typeof data.registryUrl !== 'string' || data.registryUrl.length === 0) {
      throw new Error(`Cartridge registry from ${repoUrl}: missing required top-level 'registryUrl' field`);
    }
    if (data.registryUrl !== repoUrl) {
      throw new Error(
        `Cartridge registry from ${repoUrl}: declared registryUrl '${data.registryUrl}' ` +
        `does not match the URL it was fetched from. These must match byte-for-byte.`
      );
    }
    if (!data.channels || typeof data.channels !== 'object') {
      throw new Error(`Cartridge registry from ${repoUrl}: missing channels object`);
    }

    const out = [];
    for (const channel of ['release', 'nightly']) {
      const entry = data.channels[channel];
      if (!entry || typeof entry !== 'object' || !entry.cartridges || typeof entry.cartridges !== 'object') {
        throw new Error(`Cartridge registry from ${repoUrl}: channels.${channel}.cartridges must be an object`);
      }
      for (const [id, c] of Object.entries(entry.cartridges)) {
        out.push(new CartridgeInfo({
          ...c,
          id,
          version: c.latestVersion,
          channel,
          // Stamp registryUrl onto every entry — verbatim from the
          // registry self-reference (which we just verified equals
          // the fetched URL). Identity comparison downstream is
          // byte equality.
          registryUrl: data.registryUrl
        }));
      }
    }
    return out;
  }

  /**
   * Update cache from registry data.
   *
   * The cartridges map is keyed by `<channel>:<id>` so the same id can
   * coexist in release and nightly with separate metadata/versions. The
   * cap-to-cartridges index keys on the *normalized* tagged-URN form
   * (parse via CapUrn.fromString, then take toString()) and stores
   * `{channel, id}` references so suggestions preserve channel
   * provenance. A cap URN that fails to parse is a registry corruption:
   * we throw rather than silently keep the malformed string in the
   * index.
   */
  updateCache(repoUrl, cartridges) {
    const cache = new CartridgeRepoCache(repoUrl);

    for (const cartridge of cartridges) {
      cache.cartridges.set(
        _cacheKey(cartridge.registryUrl, cartridge.channel, cartridge.id),
        cartridge
      );

      for (const cap of cartridge.allCaps()) {
        const normalized = CapUrn.fromString(cap.urn).toString();
        if (!cache.capToCartridges.has(normalized)) {
          cache.capToCartridges.set(normalized, []);
        }
        cache.capToCartridges.get(normalized).push({
          registryUrl: cartridge.registryUrl,
          channel: cartridge.channel,
          id: cartridge.id
        });
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
   * Get cartridge suggestions for a cap URN.
   *
   * `capUrn` is parsed via CapUrn.fromString; the parsed-and-
   * re-serialized form is the canonical key into the cap-to-cartridges
   * index. Inside each candidate cartridge we walk its caps via
   * `allCaps()` and match each one with `isEquivalent`. The `op` tag
   * has no functional role — only `in` and `out` predicates participate
   * in dispatch.
   */
  getSuggestionsForCap(capUrn) {
    const requested = CapUrn.fromString(capUrn);
    const normalized = requested.toString();
    const suggestions = [];

    for (const cache of this.caches.values()) {
      const refs = cache.capToCartridges.get(normalized);
      if (!refs) continue;

      for (const ref of refs) {
        const cartridge = cache.cartridges.get(_cacheKey(ref.registryUrl, ref.channel, ref.id));
        if (!cartridge) continue;

        const capInfo = cartridge.allCaps().find(c => {
          let parsed;
          try {
            parsed = CapUrn.fromString(c.urn);
          } catch (_e) {
            return false;
          }
          return parsed.isEquivalent(requested);
        });
        if (!capInfo) continue;

        const pageUrl = cartridge.pageUrl || cache.repoUrl;

        suggestions.push(new CartridgeSuggestion({
          cartridgeId: cartridge.id,
          cartridgeName: cartridge.name,
          cartridgeDescription: cartridge.description,
          capUrn: normalized,
          capTitle: capInfo.title,
          latestVersion: cartridge.version,
          repoUrl: cache.repoUrl,
          pageUrl: pageUrl,
          channel: cartridge.channel,
          registryUrl: cartridge.registryUrl
        }));
      }
    }

    return suggestions;
  }

  /**
   * Get all available cartridges from all repos as
   * `[channel, id, cartridgeInfo]` tuples — the channel is first-class
   * so consumers don't have to look it up separately.
   */
  getAllCartridges() {
    const cartridges = [];
    for (const cache of this.caches.values()) {
      for (const cartridgeInfo of cache.cartridges.values()) {
        cartridges.push([cartridgeInfo.channel, cartridgeInfo.id, cartridgeInfo]);
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
   * Get cartridge info by `(registryUrl, channel, id)`. All three
   * are required — the same id can independently exist across
   * multiple registries × both channels with different metadata.
   * Returns `null` when not found. `registryUrl` is the verbatim
   * URL the cache was indexed under.
   */
  getCartridge(registryUrl, channel, cartridgeId) {
    if (typeof registryUrl !== 'string' || registryUrl.length === 0) {
      throw new Error('getCartridge: registryUrl must be a non-empty string');
    }
    if (channel !== 'release' && channel !== 'nightly') {
      throw new Error(`Invalid channel '${channel}' — must be 'release' or 'nightly'`);
    }
    const key = _cacheKey(registryUrl, channel, cartridgeId);
    // Cache outer key is also the registry URL, so look up directly.
    const cache = this.caches.get(registryUrl);
    if (cache) {
      const cartridge = cache.cartridges.get(key);
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
/**
 * Distribution channel for a cartridge entry — mirrors capdag's
 * `CartridgeChannel` and the registry's `channels.<channel>` keys.
 *
 * `release` is the user-facing channel; `nightly` is the in-flight
 * channel. Always one of these two strings — no other values are valid.
 */
const CartridgeChannel = Object.freeze({
  Release: 'release',
  Nightly: 'nightly'
});

function _validChannel(c) {
  return c === CartridgeChannel.Release || c === CartridgeChannel.Nightly;
}

/**
 * Reads a v5.0 channel-partitioned cartridge registry. Both `release`
 * and `nightly` channels are always present (possibly empty); every
 * `CartridgeInfo` returned carries the channel it came from so consumers
 * can render the release/nightly distinction without re-deriving.
 */
class CartridgeRepoServer {
  constructor(registry) {
    this.registry = registry;
    this.validateRegistry();
  }

  validateRegistry() {
    if (!this.registry) {
      throw new Error('Registry is required');
    }
    if (this.registry.schemaVersion !== '5.0') {
      throw new Error(`Unsupported registry schema version: ${this.registry.schemaVersion}. Required: 5.0`);
    }
    if (this.registry.registryVersion !== 1) {
      throw new Error(`Unsupported cartridge registry version: ${this.registry.registryVersion}. This build speaks v1.`);
    }
    if (typeof this.registry.fabricRegistryUrl !== 'string' || this.registry.fabricRegistryUrl.length === 0) {
      throw new Error('Registry must declare a non-empty `fabricRegistryUrl` (the fabric its caps resolve against)');
    }
    if (typeof this.registry.registryUrl !== 'string' || this.registry.registryUrl.length === 0) {
      throw new Error('Registry must have a non-empty top-level `registryUrl` field (self-referential URL)');
    }
    const channels = this.registry.channels;
    if (!channels || typeof channels !== 'object') {
      throw new Error('Registry must have a channels object');
    }
    for (const ch of [CartridgeChannel.Release, CartridgeChannel.Nightly]) {
      const entry = channels[ch];
      if (!entry || typeof entry !== 'object') {
        throw new Error(`Registry must have channels.${ch}`);
      }
      if (!entry.cartridges || typeof entry.cartridges !== 'object') {
        throw new Error(`Registry: channels.${ch}.cartridges must be an object`);
      }
    }
  }

  validateVersionData(channel, id, version, versionData) {
    if (!Array.isArray(versionData.builds) || versionData.builds.length === 0) {
      throw new Error(`Cartridge ${id} (${channel}) v${version}: no builds`);
    }
    for (let i = 0; i < versionData.builds.length; i++) {
      const build = versionData.builds[i];
      if (!build.platform) {
        throw new Error(`Cartridge ${id} (${channel}) v${version}: build[${i}] missing platform`);
      }
      if (!build.package || !build.package.name) {
        throw new Error(`Cartridge ${id} (${channel}) v${version}: build[${i}] (${build.platform}) missing package.name`);
      }
      if (!build.package.url) {
        throw new Error(`Cartridge ${id} (${channel}) v${version}: build[${i}] (${build.platform}) missing package.url`);
      }
    }
  }

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
   * Convert one channel-entry into a flat CartridgeInfo. Throws if the
   * entry's `latestVersion` is not present in `versions` or if the
   * latest version's builds are malformed.
   */
  _entryToCartridgeInfo(channel, id, cartridge) {
    const latestVersion = cartridge.latestVersion;
    const versionData = cartridge.versions[latestVersion];
    if (!versionData) {
      throw new Error(`Cartridge ${id} (${channel}): latestVersion ${latestVersion} not found in versions`);
    }
    this.validateVersionData(channel, id, latestVersion, versionData);

    const availableVersions = Object.keys(cartridge.versions).sort((a, b) => this.compareVersions(b, a));

    if (!Array.isArray(cartridge.cap_groups)) {
      throw new Error(`Cartridge ${id} (${channel}): missing cap_groups array`);
    }

    return {
      id,
      name: cartridge.name,
      version: latestVersion,
      description: cartridge.description,
      author: cartridge.author,
      pageUrl: cartridge.pageUrl || '',
      teamId: cartridge.teamId,
      signedAt: versionData.releaseDate,
      minAppVersion: versionData.minAppVersion || cartridge.minAppVersion,
      cap_groups: cartridge.cap_groups,
      categories: cartridge.categories,
      tags: cartridge.tags,
      versions: cartridge.versions,
      availableVersions,
      channel,
      // Stamp the manifest's self-referential URL onto every entry —
      // verbatim from the registry. Identity comparison downstream is
      // byte equality.
      registryUrl: this.registry.registryUrl
    };
  }

  /**
   * Walk both channels and emit a flat array of CartridgeInfo. Release
   * entries appear before nightly entries — UIs that paint in array
   * order get the user-facing channel at the top by default.
   */
  transformToCartridgeArray() {
    const out = [];
    for (const channel of [CartridgeChannel.Release, CartridgeChannel.Nightly]) {
      const map = (this.registry.channels[channel].cartridges) || {};
      for (const [id, cartridge] of Object.entries(map)) {
        out.push(this._entryToCartridgeInfo(channel, id, cartridge));
      }
    }
    return out;
  }

  /**
   * Get all cartridges (API response format) — both channels.
   */
  getCartridges() {
    return { cartridges: this.transformToCartridgeArray() };
  }

  /**
   * Get cartridge by `(channel, id)`. Channel is required because the
   * same id can independently exist in both channels. Returns
   * `undefined` if the cartridge isn't in the requested channel.
   */
  getCartridgeById(channel, id) {
    if (!_validChannel(channel)) {
      throw new Error(`Invalid channel '${channel}' — must be 'release' or 'nightly'`);
    }
    const cartridge = this.registry.channels[channel].cartridges[id];
    if (!cartridge) return undefined;
    return this._entryToCartridgeInfo(channel, id, cartridge);
  }

  /**
   * Search cartridges by free-text query across both channels.
   *
   * Matches against cartridge name, description, tags, and cap titles.
   * Cap URN strings are not substring-matched: a cap URN is a tagged
   * identifier and substring matching against it is a category error.
   * Use `getCartridgesByCap` to look up cartridges that provide a
   * specific cap.
   */
  searchCartridges(query) {
    const cartridges = this.transformToCartridgeArray();
    const lowerQuery = query.toLowerCase();
    return cartridges.filter(p => {
      const allCaps = (p.cap_groups || []).flatMap(g => g.caps || []);
      return p.name.toLowerCase().includes(lowerQuery) ||
        p.description.toLowerCase().includes(lowerQuery) ||
        p.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
        allCaps.some(c => c.title.toLowerCase().includes(lowerQuery));
    });
  }

  /**
   * Get cartridges by category — both channels.
   */
  getCartridgesByCategory(category) {
    const cartridges = this.transformToCartridgeArray();
    return cartridges.filter(p => p.categories.includes(category));
  }

  /**
   * Get cartridges that provide a specific cap.
   *
   * The request URN is parsed via CapUrn.fromString. Each declared
   * cartridge cap is parsed and matched with `conformsTo`: cap dispatch
   * is the partial-order question "does the declared cap conform to
   * (i.e. refine, equal, or be more specific than) the requested
   * pattern?". Only `in` and `out` tags are semantically meaningful —
   * no string comparison, no special role for the `op` tag. A malformed
   * input URN throws; a malformed declared URN in the registry also
   * throws (registry corruption is not a fallback condition).
   */
  getCartridgesByCap(capUrn) {
    const requested = CapUrn.fromString(capUrn);
    const cartridges = this.transformToCartridgeArray();
    return cartridges.filter(p =>
      (p.cap_groups || []).some(g =>
        (g.caps || []).some(c => {
          const declared = CapUrn.fromString(c.urn);
          return declared.conformsTo(requested);
        })
      )
    );
  }
}

// ============================================================================
// Bifaci — cartridge attachment & runtime identity types
// ============================================================================

/**
 * Reasons why a cartridge attachment attempt failed.
 * Mirrors Rust CartridgeAttachmentErrorKind.
 */
const CartridgeLifecycle = Object.freeze({
  // Discovery scan has found the version directory and is about
  // to inspect it. Transient.
  DISCOVERED: 'discovered',
  // Reading cartridge.json, computing directory hash, validating
  // on-disk install context. Hashing can take seconds for large
  // model cartridges; runs on a background queue so other
  // cartridges' inspections proceed in parallel.
  INSPECTING: 'inspecting',
  // Inspection succeeded; awaiting a verdict from the registry
  // verifier service. Skipped for dev cartridges
  // (registry_url == null) and bundle cartridges.
  VERIFYING: 'verifying',
  // Cleared every gate. Caps are registered with the engine and
  // dispatch can route requests to this cartridge.
  OPERATIONAL: 'operational',
});

/**
 * Format discriminator for release-key certificates.
 * Mirrors Rust `RELEASE_KEY_CERT_FORMAT` (bifaci/release_cert.rs).
 *
 * THE WIRE FORMAT IS NOT A PRODUCT NAME. Every verifier — this library, the
 * desktop clients' in-process verifiers, the publisher — must compare against
 * THIS constant. A client that keeps its own copy can be renamed away from the
 * protocol by a search-and-replace, verify nothing, and report the registry as
 * unreachable; that is exactly what happened, and it is why these live here.
 */
const RELEASE_KEY_CERT_FORMAT = 'machinefabric-release-key-cert/1';

/** Format discriminator for manifest signature envelopes.
 *  Mirrors Rust `MANIFEST_SIG_FORMAT`. */
const MANIFEST_SIG_FORMAT = 'machinefabric-manifest-sig/1';

/**
 * What a consumer concluded about a cartridge registry.
 * Mirrors Rust `RegistryVerdictState` (bifaci/registry_verdict.rs).
 *
 * A REGISTRY IS NOT A CARTRIDGE: this is one fact per registry URL, shared by
 * every cartridge that claims provenance from it. The vocabulary separates the
 * two things a consumer can conclude — that it could not get an answer
 * (OFFLINE, UNREACHABLE, HTTP_ERROR, MALFORMED) and that it got one and refused
 * it (UNSIGNED, UNTRUSTED, UNVERIFIABLE) — because those have opposite
 * remedies.
 */
const RegistryVerdictState = Object.freeze({
  // Fetched, chain-verified and parsed. The only state that lets a cartridge
  // from this registry attach.
  VERIFIED: 'verified',
  // No verdict yet — the first check has not run. NOT a failure.
  PENDING: 'pending',
  // The consumer's own network policy forbade the request. The remedy is a
  // setting, not the network.
  OFFLINE: 'offline',
  // DNS, refused, timeout, TLS. The only state where "check your connection"
  // is sound advice.
  UNREACHABLE: 'unreachable',
  // The registry answered with an HTTP error; the status travels with it.
  HTTP_ERROR: 'http_error',
  // The registry answered with a body this build cannot read as a manifest.
  MALFORMED: 'malformed',
  // No signature sidecar where one is required.
  UNSIGNED: 'unsigned',
  // The chain was evaluated and REJECTED — the registry's problem.
  UNTRUSTED: 'untrusted',
  // The chain could NOT be evaluated: a format this build does not implement.
  // Our problem, remedied by updating the client — never by distrusting the
  // registry, and never by checking the network.
  UNVERIFIABLE: 'unverifiable',
  // This build bakes no trust anchors, so there is no regime to verify against
  // and the manifest was accepted without proof. A development build, and only
  // ever that. It permits attachment — a dev build has to work — and is a
  // SEPARATE state rather than being reported as VERIFIED, because "we checked
  // and it passed" and "we did not check" are different facts.
  UNENFORCED: 'unenforced',
});

/**
 * WHAT TO DO ABOUT A REGISTRY IN A GIVEN STATE. Mirrors Rust `RegistryRemedy`.
 *
 * The remedy follows from the state and nothing else. It used to be a sentence
 * glued onto the failure message at the point the record was built — "Check the
 * network connection and try again." — appended whatever the cause, so a
 * signature a build could not read sent operators to their router. A remedy
 * asserted as fact regardless of what failed is worse than none.
 *
 * This is the ACTION, not its wording: a CLI prints a line, a desktop client
 * offers a control. Both derive them from here.
 */
const RegistryRemedy = Object.freeze({
  // Nothing to do — the registry verified.
  NONE: 'none',
  // A check is in flight and will answer on its own.
  WAIT: 'wait',
  // The machine cannot reach the registry. Check the connection.
  CHECK_NETWORK: 'check_network',
  // This build was told not to go out. Change the network policy.
  CHANGE_NETWORK_POLICY: 'change_network_policy',
  // The registry answered badly; it is the registry's side to fix.
  RETRY_LATER: 'retry_later',
  // This build cannot read the registry's signature format. Update the client —
  // the registry is not at fault and the network is not involved.
  UPDATE_CLIENT: 'update_client',
  // The registry's answer was rejected. Do not proceed.
  DO_NOT_PROCEED: 'do_not_proceed',
});

const _REGISTRY_REMEDY_BY_STATE = Object.freeze({
  verified: RegistryRemedy.NONE,
  pending: RegistryRemedy.WAIT,
  offline: RegistryRemedy.CHANGE_NETWORK_POLICY,
  unreachable: RegistryRemedy.CHECK_NETWORK,
  http_error: RegistryRemedy.RETRY_LATER,
  malformed: RegistryRemedy.RETRY_LATER,
  unsigned: RegistryRemedy.DO_NOT_PROCEED,
  untrusted: RegistryRemedy.DO_NOT_PROCEED,
  unverifiable: RegistryRemedy.UPDATE_CLIENT,
  unenforced: RegistryRemedy.NONE,
});

/** The one thing to do about a registry in this state. */
function registryVerdictRemedy(state) {
  const remedy = _REGISTRY_REMEDY_BY_STATE[state];
  if (remedy === undefined) {
    throw new Error(`unknown registry verdict state '${state}'`);
  }
  return remedy;
}

/** Why a signature chain failed. Mirrors Rust `ChainFailureReason`. */
const ChainFailureReason = Object.freeze({
  MALFORMED_ENVELOPE: 'malformed_envelope',
  UNSUPPORTED_ENVELOPE_FORMAT: 'unsupported_envelope_format',
  MALFORMED_CERTIFICATE: 'malformed_certificate',
  UNSUPPORTED_CERTIFICATE_FORMAT: 'unsupported_certificate_format',
  EMPTY_CERTIFICATE_LIST: 'empty_certificate_list',
  INSUFFICIENT_ROOT_SIGNATURES: 'insufficient_root_signatures',
  EXPIRED_CERTIFICATE: 'expired_certificate',
  NOT_YET_VALID_CERTIFICATE: 'not_yet_valid_certificate',
  ENVIRONMENT_MISMATCH: 'environment_mismatch',
  KEY_ID_MISMATCH: 'key_id_mismatch',
  NO_AUTHORIZING_CERTIFICATE: 'no_authorizing_certificate',
  MANIFEST_SIGNATURE_INVALID: 'manifest_signature_invalid',
});

const REGISTRY_VERDICT_STATES = Object.freeze(Object.values(RegistryVerdictState));
const CHAIN_FAILURE_REASONS = Object.freeze(Object.values(ChainFailureReason));

/** The reasons that mean the chain could not be EVALUATED, as opposed to being
 *  evaluated and rejected. */
const UNEVALUABLE_CHAIN_FAILURES = Object.freeze([
  ChainFailureReason.MALFORMED_ENVELOPE,
  ChainFailureReason.UNSUPPORTED_ENVELOPE_FORMAT,
  ChainFailureReason.MALFORMED_CERTIFICATE,
  ChainFailureReason.UNSUPPORTED_CERTIFICATE_FORMAT,
  ChainFailureReason.EMPTY_CERTIFICATE_LIST,
]);

/**
 * The verdict a chain failure produces.
 *
 * Could the chain be evaluated at all? A format this build does not implement
 * means no judgement was reached (UNVERIFIABLE — update the client). Anything
 * else means the chain WAS judged and found wanting (UNTRUSTED — do not
 * proceed). Leaving this decision to each consumer is how one client reported
 * an unreadable signature format as a network outage.
 */
function registryVerdictStateForChainFailure(reason) {
  if (!CHAIN_FAILURE_REASONS.includes(reason)) {
    throw new Error(`unknown chain failure reason '${reason}'`);
  }
  return UNEVALUABLE_CHAIN_FAILURES.includes(reason)
    ? RegistryVerdictState.UNVERIFIABLE
    : RegistryVerdictState.UNTRUSTED;
}

/** Whether a cartridge from a registry in this state may attach. */
function registryVerdictPermitsAttachment(state) {
  if (!REGISTRY_VERDICT_STATES.includes(state)) {
    throw new Error(`unknown registry verdict state '${state}'`);
  }
  return state === RegistryVerdictState.VERIFIED || state === RegistryVerdictState.UNENFORCED;
}

/** Whether the state is a refusal of an answer we DID get. Never changes on retry. */
function registryVerdictIsTrustFailure(state) {
  if (!REGISTRY_VERDICT_STATES.includes(state)) {
    throw new Error(`unknown registry verdict state '${state}'`);
  }
  return state === RegistryVerdictState.UNSIGNED
    || state === RegistryVerdictState.UNTRUSTED
    || state === RegistryVerdictState.UNVERIFIABLE;
}

/** Whether an unattended retry could plausibly reach a different verdict. */
function registryVerdictIsTransient(state) {
  if (!REGISTRY_VERDICT_STATES.includes(state)) {
    throw new Error(`unknown registry verdict state '${state}'`);
  }
  return state === RegistryVerdictState.PENDING
    || state === RegistryVerdictState.UNREACHABLE
    || state === RegistryVerdictState.HTTP_ERROR
    || state === RegistryVerdictState.MALFORMED;
}

/**
 * What a consumer concluded about one registry, and why.
 * Mirrors Rust `RegistryVerdict`.
 *
 * Illegal combinations are unrepresentable: the constructors take exactly what
 * their state requires and `validate()` refuses every contradiction, so a
 * verdict that says "http_error" without a status, or "verified" with a failure
 * detail, is refused at the boundary instead of rendered as a contradiction.
 */
class RegistryVerdict {
  constructor(registryUrl, state, detail, httpStatus, chainFailure, checkedAtUnixSeconds) {
    this.registry_url = registryUrl;
    this.state = state;
    this.detail = detail;
    this.http_status = httpStatus === undefined ? null : httpStatus;
    this.chain_failure = chainFailure === undefined ? null : chainFailure;
    this.checked_at_unix_seconds = checkedAtUnixSeconds;
    this.validate();
  }

  static verified(registryUrl, checkedAtUnixSeconds) {
    return new RegistryVerdict(registryUrl, RegistryVerdictState.VERIFIED, '', null, null, checkedAtUnixSeconds);
  }

  /** This build bakes no trust anchors: the manifest was accepted without
   *  proof, and says so rather than claiming it verified. */
  static unenforced(registryUrl, checkedAtUnixSeconds) {
    return new RegistryVerdict(registryUrl, RegistryVerdictState.UNENFORCED, '', null, null, checkedAtUnixSeconds);
  }

  /** No verdict yet. Carries no time, because nothing has been checked. */
  static pending(registryUrl) {
    return new RegistryVerdict(registryUrl, RegistryVerdictState.PENDING, '', null, null, 0);
  }

  /** A state carrying only a detail line: OFFLINE, UNREACHABLE, MALFORMED, UNSIGNED. */
  static stated(registryUrl, state, detail, checkedAtUnixSeconds) {
    return new RegistryVerdict(registryUrl, state, detail, null, null, checkedAtUnixSeconds);
  }

  static httpError(registryUrl, status, detail, checkedAtUnixSeconds) {
    return new RegistryVerdict(registryUrl, RegistryVerdictState.HTTP_ERROR, detail, status, null, checkedAtUnixSeconds);
  }

  /** A signature chain that failed. The state FOLLOWS from the reason, so a
   *  caller cannot file an unreadable format as a rejected key. */
  static chainFailed(registryUrl, reason, detail, checkedAtUnixSeconds) {
    return new RegistryVerdict(
      registryUrl,
      registryVerdictStateForChainFailure(reason),
      detail,
      null,
      reason,
      checkedAtUnixSeconds,
    );
  }

  validate() {
    if (typeof this.registry_url !== 'string' || this.registry_url.length === 0) {
      throw new Error('a registry verdict must name the registry it is about');
    }
    if (!REGISTRY_VERDICT_STATES.includes(this.state)) {
      throw new Error(`unknown registry verdict state '${this.state}'`);
    }
    if (typeof this.detail !== 'string') {
      throw new Error('a registry verdict detail must be a string');
    }
    const statesNoFailure = this.state === RegistryVerdictState.VERIFIED
      || this.state === RegistryVerdictState.PENDING
      || this.state === RegistryVerdictState.UNENFORCED;
    if (statesNoFailure && this.detail.length > 0) {
      throw new Error(`a '${this.state}' verdict states no failure, so it carries no detail (got ${JSON.stringify(this.detail)})`);
    }
    if (!statesNoFailure && this.detail.length === 0) {
      throw new Error(`a '${this.state}' verdict must carry the detail that explains it`);
    }
    if (this.state === RegistryVerdictState.HTTP_ERROR) {
      if (!Number.isInteger(this.http_status)) {
        throw new Error("an 'http_error' verdict must carry the status the registry answered with");
      }
    } else if (this.http_status !== null) {
      throw new Error(`only an 'http_error' verdict carries an HTTP status (got one on '${this.state}')`);
    }
    const chainStates = this.state === RegistryVerdictState.UNTRUSTED
      || this.state === RegistryVerdictState.UNVERIFIABLE;
    if (chainStates) {
      if (this.chain_failure === null) {
        throw new Error(`a '${this.state}' verdict must carry the chain failure reason that produced it`);
      }
      if (registryVerdictStateForChainFailure(this.chain_failure) !== this.state) {
        throw new Error(`only a trust failure carries a chain failure reason (got one on '${this.state}')`);
      }
    } else if (this.chain_failure !== null) {
      throw new Error(`only a trust failure carries a chain failure reason (got one on '${this.state}')`);
    }
    if (!Number.isFinite(this.checked_at_unix_seconds)) {
      throw new Error('a registry verdict must say when it was reached');
    }
  }

  permitsAttachment() {
    return registryVerdictPermitsAttachment(this.state);
  }

  /**
   * WHETHER TWO VERDICTS SAY THE SAME THING ABOUT THE REGISTRY.
   *
   * Not a deep-equality check. A verdict carries `checked_at_unix_seconds`,
   * which is provenance about the CHECK and not about the registry — so a
   * consumer asking "did this change?" by comparing whole verdicts is told yes
   * on every re-check, forever. Both desktop clients asked exactly that to
   * decide whether to re-run cartridge discovery, and the answer drove a loop
   * that left the engine discovering cartridges and never reaching ready.
   */
  statesTheSameAs(other) {
    if (!(other instanceof RegistryVerdict)) {
      throw new Error('statesTheSameAs compares two registry verdicts');
    }
    return this.registry_url === other.registry_url
      && this.state === other.state
      && this.detail === other.detail
      && this.http_status === other.http_status
      && this.chain_failure === other.chain_failure;
  }

  toJSON() {
    return {
      registry_url: this.registry_url,
      state: this.state,
      detail: this.detail,
      http_status: this.http_status,
      chain_failure: this.chain_failure,
      checked_at_unix_seconds: this.checked_at_unix_seconds,
    };
  }

  static fromJSON(d) {
    return new RegistryVerdict(
      d.registry_url,
      d.state,
      d.detail,
      d.http_status === undefined ? null : d.http_status,
      d.chain_failure === undefined ? null : d.chain_failure,
      d.checked_at_unix_seconds,
    );
  }
}

const CartridgeAttachmentErrorKind = Object.freeze({
  INCOMPATIBLE: 'incompatible',
  MANIFEST_INVALID: 'manifest_invalid',
  HANDSHAKE_FAILED: 'handshake_failed',
  IDENTITY_REJECTED: 'identity_rejected',
  ENTRY_POINT_MISSING: 'entry_point_missing',
  QUARANTINED: 'quarantined',
  // On-disk install context disagrees with the cartridge.json the cartridge
  // declares — the slug folder doesn't match slug_for(registry_url), the
  // channel folder doesn't match the manifest's channel, or a bundled-cartridge
  // integrity proof failed. Structurally well-formed but cannot be trusted
  // because its placement on disk does not match what it claims to be.
  // Recovery is "reinstall".
  MISPLACED: 'misplaced',
  // The cartridge's registry verified, and does not list this
  // (channel, id, version): the artefact says it came from somewhere that has
  // never heard of it. Recovery is "wait for the publish, or rebuild as dev".
  NOT_LISTED: 'not_listed',
  // Operator explicitly disabled this cartridge through the host UI.
  DISABLED: 'disabled',
  // The cartridge declares a non-null registry_url and that registry's verdict
  // is not `verified`, so its provenance claim is unconfirmed. WHY belongs to
  // the registry, not the cartridge — consumers join on registry_url and read
  // the RegistryVerdict, which is one fact per registry rather than one per
  // cartridge that claims it.
  REGISTRY_UNVERIFIED: 'registry_unverified',
  // The cartridge was built against a different fabric registry manifest
  // version than this host is pinned to.
  FABRIC_MANIFEST_VERSION_MISMATCH: 'fabric_manifest_version_mismatch',
});

/**
 * Describes a failed cartridge attachment attempt.
 * Mirrors Rust CartridgeAttachmentError.
 */
class CartridgeAttachmentError {
  /**
   * @param {string} kind - CartridgeAttachmentErrorKind value
   * @param {string} message - Human-readable error message
   * @param {number|null} detectedAtUnixSeconds - Unix timestamp of detection
   */
  constructor(kind, message, detectedAtUnixSeconds) {
    this.kind = kind;
    this.message = message;
    this.detected_at_unix_seconds = detectedAtUnixSeconds;
  }

  toJSON() {
    return {
      kind: this.kind,
      message: this.message,
      detected_at_unix_seconds: this.detected_at_unix_seconds,
    };
  }

  static fromJSON(d) {
    return new CartridgeAttachmentError(d.kind, d.message, d.detected_at_unix_seconds);
  }
}

/**
 * Runtime statistics for a running (or stopped) cartridge process.
 * Mirrors Rust CartridgeRuntimeStats.
 */
class CartridgeRuntimeStats {
  /**
   * @param {Object} opts
   * @param {boolean} [opts.running=false]
   * @param {number|null} [opts.pid=null]
   * @param {number} [opts.activeRequestCount=0]
   * @param {number} [opts.peerRequestCount=0]
   * @param {number} [opts.memoryFootprintMb=0]
   * @param {number} [opts.memoryRssMb=0]
   * @param {number|null} [opts.lastHeartbeatUnixSeconds=null]
   * @param {number} [opts.restartCount=0]
   */
  constructor({
    running = false,
    pid = null,
    activeRequestCount = 0,
    peerRequestCount = 0,
    memoryFootprintMb = 0,
    memoryRssMb = 0,
    lastHeartbeatUnixSeconds = null,
    restartCount = 0,
  } = {}) {
    this.running = running;
    this.pid = pid;
    this.active_request_count = activeRequestCount;
    this.peer_request_count = peerRequestCount;
    this.memory_footprint_mb = memoryFootprintMb;
    this.memory_rss_mb = memoryRssMb;
    this.last_heartbeat_unix_seconds = lastHeartbeatUnixSeconds;
    this.restart_count = restartCount;
  }

  /** Convenience constructor for a cartridge that is not running. */
  static notRunning() {
    return new CartridgeRuntimeStats();
  }

  toJSON() {
    const obj = { running: this.running };
    if (this.pid !== null) obj.pid = this.pid;
    if (this.active_request_count) obj.active_request_count = this.active_request_count;
    if (this.peer_request_count) obj.peer_request_count = this.peer_request_count;
    if (this.memory_footprint_mb) obj.memory_footprint_mb = this.memory_footprint_mb;
    if (this.memory_rss_mb) obj.memory_rss_mb = this.memory_rss_mb;
    if (this.last_heartbeat_unix_seconds !== null) obj.last_heartbeat_unix_seconds = this.last_heartbeat_unix_seconds;
    if (this.restart_count) obj.restart_count = this.restart_count;
    return obj;
  }

  static fromJSON(d) {
    return new CartridgeRuntimeStats({
      running: d.running || false,
      pid: d.pid !== undefined ? d.pid : null,
      activeRequestCount: d.active_request_count || 0,
      peerRequestCount: d.peer_request_count || 0,
      memoryFootprintMb: d.memory_footprint_mb || 0,
      memoryRssMb: d.memory_rss_mb || 0,
      lastHeartbeatUnixSeconds: d.last_heartbeat_unix_seconds !== undefined ? d.last_heartbeat_unix_seconds : null,
      restartCount: d.restart_count || 0,
    });
  }
}

/**
 * Full identity of an installed cartridge, including optional attachment error
 * and runtime statistics.
 * Mirrors Rust InstalledCartridgeRecord.
 */
class InstalledCartridgeRecord {
  /**
   * @param {Object} opts
   * @param {string|null} [opts.registryUrl=null]
   * @param {string} opts.channel
   * @param {string} opts.id
   * @param {string} opts.version
   * @param {string} opts.sha256
   * @param {Array<Object>} [opts.capGroups=[]] - Cartridge's manifest cap_groups; each element is `{name, caps, adapter_urns}`.
   * @param {CartridgeAttachmentError|null} [opts.attachmentError=null]
   * @param {CartridgeRuntimeStats|null} [opts.runtimeStats=null]
   * @param {string} [opts.lifecycle='discovered'] - One of `discovered` | `inspecting` | `verifying` | `operational`. Mutually exclusive with attachmentError; see `macfloom/docs/cartridge state machine.md`.
   */
  constructor({ registryUrl = null, channel, id, version, sha256, capGroups = [], attachmentError = null, runtimeStats = null, lifecycle = 'discovered' }) {
    this.registry_url = registryUrl;
    this.channel = channel;
    this.id = id;
    this.version = version;
    this.sha256 = sha256;
    this.cap_groups = capGroups;
    this.attachment_error = attachmentError;
    this.runtime_stats = runtimeStats;
    this.lifecycle = lifecycle;
  }

  toJSON() {
    const obj = {
      channel: this.channel,
      id: this.id,
      version: this.version,
      sha256: this.sha256,
      lifecycle: this.lifecycle,
    };
    if (this.registry_url !== null) obj.registry_url = this.registry_url;
    if (this.cap_groups && this.cap_groups.length > 0) obj.cap_groups = this.cap_groups;
    if (this.attachment_error !== null) obj.attachment_error = this.attachment_error.toJSON();
    if (this.runtime_stats !== null) obj.runtime_stats = this.runtime_stats.toJSON();
    return obj;
  }

  static fromJSON(d) {
    return new InstalledCartridgeRecord({
      registryUrl: d.registry_url !== undefined ? d.registry_url : null,
      channel: d.channel,
      id: d.id,
      version: d.version,
      sha256: d.sha256,
      capGroups: Array.isArray(d.cap_groups) ? d.cap_groups : [],
      attachmentError: d.attachment_error ? CartridgeAttachmentError.fromJSON(d.attachment_error) : null,
      runtimeStats: d.runtime_stats ? CartridgeRuntimeStats.fromJSON(d.runtime_stats) : null,
      // Default to 'discovered' (the safe sentinel) — never
      // 'operational' — when the field is missing from the wire.
      lifecycle: typeof d.lifecycle === 'string' ? d.lifecycle : 'discovered',
    });
  }

  /**
   * Flat de-duplicated cap-URN view across this cartridge's groups,
   * preserving first-seen order.
   * @returns {Array<string>}
   */
  capUrns() {
    const seen = new Set();
    const out = [];
    for (const group of this.cap_groups) {
      const caps = (group && Array.isArray(group.caps)) ? group.caps : [];
      for (const cap of caps) {
        const urn = (cap && typeof cap.urn === 'string') ? cap.urn : '';
        if (!urn || seen.has(urn)) continue;
        seen.add(urn);
        out.push(urn);
      }
    }
    return out;
  }
}

// ============================================================================
// Cartridge discovery — on-disk scan + identity validation + HELLO probe
// ============================================================================
//
// Mirrors capdag::cartridge_discovery plus its dependencies
// capdag::bifaci::cartridge_json (CartridgeJson, validate_registry_url_scheme,
// hash_cartridge_directory) and the synchronous slug helper from
// capdag::bifaci::cartridge_slug::slug_for.
//
// This is the single source of truth for classifying each installed cartridge
// version directory as attachable (`directory`) or `incompatible`. Node
// built-ins (`fs`, `path`, `crypto`, `child_process`) are required lazily
// inside the functions so the browser bundle — which never performs disk
// discovery — never references them.

/**
 * Synchronous on-disk slug for a registry URL. Mirrors
 * capdag::bifaci::cartridge_slug::slug_for byte-for-byte: `null`/`undefined`
 * (a dev cartridge) → the literal `DEV_SLUG`; otherwise a path-safe transform
 * of the URL's authority (host[:port]). Identical output to the async
 * `slugForRegistryUrl` above — no hashing, so both are trivially in sync.
 *
 * @param {string|null|undefined} registryUrl
 * @returns {string}
 */
function slugForSync(registryUrl) {
  return slugForRegistryUrlSync(registryUrl);
}

/**
 * How a cartridge was installed. Exactly ONE value is semantic: BUNDLE
 * selects the bundled-cartridge integrity path at discovery. Every other
 * value is provenance telemetry, and the vocabulary GROWS as installers do —
 * so an unrecognized spelling is preserved verbatim on the record and
 * round-trips, never failing the cartridge.json parse. Mirrors Rust
 * CartridgeInstallSource; the on-disk JSON uses snake_case values.
 */
const CartridgeInstallSource = Object.freeze({
  REGISTRY: 'registry',
  DEV: 'dev',
  BUNDLE: 'bundle',
  APP_INSTALLER: 'app_installer',
});

/**
 * Verdict from `validateRegistryUrlScheme`. Mirrors Rust
 * RegistryUrlSchemeResult: distinguishes OK from each rejection reason so
 * callers can render an actionable message. `kind` is one of `ok`,
 * `not_a_url`, `non_https`.
 */
const RegistryUrlSchemeResultKind = Object.freeze({
  OK: 'ok',
  NOT_A_URL: 'not_a_url',
  NON_HTTPS: 'non_https',
});

/**
 * Validate that a non-null `registry_url` uses the `https` scheme — UNLESS
 * `devMode` is set, in which case any well-formed URL is accepted (so
 * developers can point at `http://localhost:port` during integration
 * testing). Mirrors capdag::bifaci::cartridge_json::validate_registry_url_scheme.
 *
 * Cheap parse: split once on `://`. The rule is "scheme must be the literal
 * bytes `https`" (case-insensitive); full URL validation is the caller's job.
 *
 * @param {string} url
 * @param {boolean} devMode
 * @returns {{kind: string, url?: string, scheme?: string}}
 */
function validateRegistryUrlScheme(url, devMode) {
  const idx = url.indexOf('://');
  if (idx < 0) {
    return { kind: RegistryUrlSchemeResultKind.NOT_A_URL, url };
  }
  const scheme = url.slice(0, idx);
  const rest = url.slice(idx + 3);
  if (rest.length === 0) {
    return { kind: RegistryUrlSchemeResultKind.NOT_A_URL, url };
  }
  if (devMode) {
    return { kind: RegistryUrlSchemeResultKind.OK };
  }
  if (scheme.toLowerCase() === 'https') {
    return { kind: RegistryUrlSchemeResultKind.OK };
  }
  return { kind: RegistryUrlSchemeResultKind.NON_HTTPS, scheme };
}

/**
 * Error kinds for CartridgeJson reading/validation. Mirrors the variants of
 * Rust CartridgeJsonError. `RegistrySlugMismatch` is the three-place
 * consistency failure that discovery maps to MISPLACED.
 */
const CartridgeJsonErrorKind = Object.freeze({
  NOT_FOUND: 'not_found',
  READ_FAILED: 'read_failed',
  INVALID_JSON: 'invalid_json',
  ENTRY_POINT_MISSING: 'entry_point_missing',
  ENTRY_POINT_NOT_EXECUTABLE: 'entry_point_not_executable',
  ENTRY_PATH_ESCAPE: 'entry_path_escape',
  REGISTRY_SLUG_MISMATCH: 'registry_slug_mismatch',
});

/**
 * Error thrown by CartridgeJson.readFromDir. Carries a structured `kind` so
 * discovery can map a slug mismatch to MISPLACED and everything else
 * to MANIFEST_INVALID. Mirrors Rust CartridgeJsonError.
 */
class CartridgeJsonError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'CartridgeJsonError';
    this.kind = kind;
  }
}

/**
 * Install-context metadata stored in `cartridge.json` inside each cartridge
 * version directory. Mirrors capdag::bifaci::cartridge_json::CartridgeJson.
 *
 * Identity tuple: `(registryUrl, channel, name, version)`. `registryUrl` is
 * required-but-nullable: a MISSING `registry_url` key is a parse error
 * (forces the new schema across every install path); only `null` means dev.
 */
class CartridgeJson {
  /**
   * @param {Object} fields
   */
  constructor(fields) {
    this.name = fields.name;
    this.version = fields.version;
    this.channel = fields.channel;
    this.registryUrl = fields.registryUrl;
    this.entry = fields.entry;
    this.installedAt = fields.installedAt;
    this.installedFrom = fields.installedFrom !== undefined ? fields.installedFrom : null;
    this.sourceUrl = fields.sourceUrl || '';
    this.packageSha256 = fields.packageSha256 || '';
    this.packageSize = fields.packageSize || 0;
    this.fabricManifestVersion = fields.fabricManifestVersion || 0;
  }

  /**
   * Parse a cartridge.json object. Enforces the "required-but-nullable"
   * contract on `registry_url` — the JSON key MUST be present (missing key is
   * a parse error); the value MAY be null (dev) or a string (registry). Stock
   * JSON parsing would collapse absent and explicit-null, so the presence
   * check is explicit, mirroring the Rust manual deserializer.
   *
   * @param {Object} obj - The parsed JSON object.
   * @returns {CartridgeJson}
   * @throws {CartridgeJsonError} with kind INVALID_JSON on any schema violation.
   */
  static fromObject(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new CartridgeJsonError(CartridgeJsonErrorKind.INVALID_JSON, 'cartridge.json must be a JSON object');
    }
    if (!Object.prototype.hasOwnProperty.call(obj, 'registry_url')) {
      throw new CartridgeJsonError(CartridgeJsonErrorKind.INVALID_JSON, 'cartridge.json missing required field: registry_url');
    }
    for (const required of ['name', 'version', 'channel', 'entry', 'installed_at']) {
      if (typeof obj[required] !== 'string') {
        throw new CartridgeJsonError(CartridgeJsonErrorKind.INVALID_JSON, `cartridge.json missing required string field: ${required}`);
      }
    }
    if (obj.channel !== CartridgeChannel.Release && obj.channel !== CartridgeChannel.Nightly) {
      throw new CartridgeJsonError(CartridgeJsonErrorKind.INVALID_JSON, `cartridge.json invalid channel: ${obj.channel}`);
    }
    const reg = obj.registry_url;
    if (reg !== null && typeof reg !== 'string') {
      throw new CartridgeJsonError(CartridgeJsonErrorKind.INVALID_JSON, 'cartridge.json registry_url must be null or a string');
    }
    let installedFrom = null;
    if (obj.installed_from !== undefined && obj.installed_from !== null) {
      if (typeof obj.installed_from !== 'string') {
        throw new CartridgeJsonError(CartridgeJsonErrorKind.INVALID_JSON, 'cartridge.json installed_from must be a string');
      }
      // An unknown spelling is preserved VERBATIM: the provenance vocabulary
      // grows as installers do, and a telemetry hint must never fail the
      // parse and take the cartridge down with it. Only BUNDLE is semantic.
      installedFrom = obj.installed_from;
    }
    return new CartridgeJson({
      name: obj.name,
      version: obj.version,
      channel: obj.channel,
      registryUrl: reg,
      entry: obj.entry,
      installedAt: obj.installed_at,
      installedFrom,
      sourceUrl: typeof obj.source_url === 'string' ? obj.source_url : '',
      packageSha256: typeof obj.package_sha256 === 'string' ? obj.package_sha256 : '',
      packageSize: typeof obj.package_size === 'number' ? obj.package_size : 0,
      fabricManifestVersion: typeof obj.fabric_manifest_version === 'number' ? obj.fabric_manifest_version : 0,
    });
  }

  /**
   * Read and validate a `cartridge.json` from a version directory, enforcing
   * the three-place rule against `expectedSlug` (the slug folder the host
   * walked through). Mirrors CartridgeJson::read_from_dir.
   *
   * Validates: file exists and is valid JSON; the declared registry_url
   * hashes to `expectedSlug` (else RegistrySlugMismatch); the entry point
   * exists, does not escape the version directory, and is executable.
   *
   * @param {string} versionDir - Absolute path to the version directory.
   * @param {string} expectedSlug - The on-disk slug folder name.
   * @returns {CartridgeJson}
   * @throws {CartridgeJsonError}
   */
  static readFromDir(versionDir, expectedSlug) {
    const { fs, path } = nodeModules('reading cartridge.json');
    const jsonPath = path.join(versionDir, 'cartridge.json');

    if (!fs.existsSync(jsonPath)) {
      throw new CartridgeJsonError(CartridgeJsonErrorKind.NOT_FOUND, `cartridge.json not found at ${jsonPath}`);
    }

    let contents;
    try {
      contents = fs.readFileSync(jsonPath, 'utf8');
    } catch (e) {
      throw new CartridgeJsonError(CartridgeJsonErrorKind.READ_FAILED, `failed to read cartridge.json at ${jsonPath}: ${e.message}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(contents);
    } catch (e) {
      throw new CartridgeJsonError(CartridgeJsonErrorKind.INVALID_JSON, `invalid cartridge.json at ${jsonPath}: ${e.message}`);
    }
    const cj = CartridgeJson.fromObject(parsed);

    // Three-place consistency rule (places 1 + 2): the folder slug must match
    // the slug derived from the provenance's registry_url. None+`dev` and
    // Some(url)+slug(url) are the only valid pairings.
    const derivedSlug = slugForSync(cj.registryUrl);
    if (derivedSlug !== expectedSlug) {
      throw new CartridgeJsonError(
        CartridgeJsonErrorKind.REGISTRY_SLUG_MISMATCH,
        `cartridge.json at ${jsonPath}: registry slug mismatch — registry_url=${JSON.stringify(cj.registryUrl)} ` +
        `hashes to slug='${derivedSlug}' but the directory tree placed it under '${expectedSlug}'`
      );
    }

    // Validate entry point exists.
    const entryPath = path.join(versionDir, cj.entry);
    if (!fs.existsSync(entryPath)) {
      throw new CartridgeJsonError(CartridgeJsonErrorKind.ENTRY_POINT_MISSING, `cartridge.json at ${jsonPath}: entry point '${cj.entry}' does not exist`);
    }

    // Validate entry path does not escape version directory.
    let canonicalDir;
    let canonicalEntry;
    try { canonicalDir = fs.realpathSync(versionDir); } catch (_e) { canonicalDir = path.resolve(versionDir); }
    try { canonicalEntry = fs.realpathSync(entryPath); } catch (_e) { canonicalEntry = path.resolve(entryPath); }
    const dirWithSep = canonicalDir.endsWith(path.sep) ? canonicalDir : canonicalDir + path.sep;
    if (canonicalEntry !== canonicalDir && !canonicalEntry.startsWith(dirWithSep)) {
      throw new CartridgeJsonError(CartridgeJsonErrorKind.ENTRY_PATH_ESCAPE, `cartridge.json at ${jsonPath}: entry path '${cj.entry}' escapes version directory`);
    }

    // Validate entry point is executable (unix permission bits).
    if (process.platform !== 'win32') {
      let mode;
      try {
        mode = fs.statSync(entryPath).mode;
      } catch (e) {
        throw new CartridgeJsonError(CartridgeJsonErrorKind.READ_FAILED, `failed to read cartridge.json at ${jsonPath}: ${e.message}`);
      }
      if ((mode & 0o111) === 0) {
        throw new CartridgeJsonError(CartridgeJsonErrorKind.ENTRY_POINT_NOT_EXECUTABLE, `cartridge.json at ${jsonPath}: entry point '${cj.entry}' is not executable`);
      }
    }

    return cj;
  }

  /** True when installed as a dev build (no registry URL). */
  isDevInstall() {
    return this.registryUrl === null || this.registryUrl === undefined;
  }

  /** The on-disk slug this provenance must live under. */
  registrySlug() {
    return slugForSync(this.registryUrl);
  }

  /**
   * Resolve the absolute path to the entry point binary.
   * @param {string} versionDir
   * @returns {string}
   */
  resolveEntryPoint(versionDir) {
    const { path } = nodeModules('resolving an entry point');
    return path.join(versionDir, this.entry);
  }
}

/**
 * Compute a deterministic SHA256 hash of a directory tree. Walks all files
 * recursively, sorts them by relative path, then hashes each file's relative
 * path (UTF-8 bytes) followed by its contents — a stable identity hash
 * regardless of filesystem ordering. `cartridge.json` itself is excluded (it
 * holds install-time metadata that varies between installs of identical
 * content). Mirrors capdag::bifaci::cartridge_json::hash_cartridge_directory.
 *
 * @param {string} dir - Absolute path to the directory.
 * @returns {string} Lowercase hex SHA256.
 */
function hashCartridgeDirectory(dir) {
  const { fs, path, crypto } = nodeModules('hashing a cartridge directory');

  const files = [];
  const collect = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        collect(full);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        let relative = path.relative(dir, full);
        // Normalize to the same separator the Rust to_string_lossy yields on
        // the platform — on POSIX both use '/'. Windows separators differ but
        // the cartridge tree is POSIX in practice; keep relative verbatim.
        if (relative === 'cartridge.json') continue;
        files.push([relative, full]);
      }
    }
  };
  collect(dir);
  files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const hasher = crypto.createHash('sha256');
  for (const [relativePath, fullPath] of files) {
    hasher.update(Buffer.from(relativePath, 'utf8'));
    hasher.update(fs.readFileSync(fullPath));
  }
  return hasher.digest('hex');
}

// ---------------------------------------------------------------------------
// Bundled-cartridge integrity (non-macOS).
// ---------------------------------------------------------------------------
//
// Mirrors capdag::cartridge_discovery::verify_bundled_cartridge_hash and the
// BUNDLED_CARTRIDGE_HASHES const codegen'd by build.rs. Under a plain build —
// and in this mirror, which bundles no cartridges — the set is empty, so any
// `installed_from: bundle` cartridge has no baked hash and is rejected.
const BUNDLED_CARTRIDGE_HASHES = Object.freeze([]); // [name, version, hash] triples

/**
 * Look up the baked expected directory hash for a bundled cartridge, or null if
 * (name, version) was not recorded at build time.
 * @returns {string|null}
 */
function bundledCartridgeExpectedHash(name, version) {
  for (const [n, v, h] of BUNDLED_CARTRIDGE_HASHES) {
    if (n === name && v === version) return h;
  }
  return null;
}

/**
 * Verify a bundled cartridge's on-disk content against the hash baked into this
 * build. Returns null on success, or an error-reason string. Mirrors
 * verify_bundled_cartridge_hash. Non-macOS only: macOS bundled-cartridge
 * integrity is the OS code-signature, so the engine there neither bakes nor
 * checks these hashes.
 *
 * @returns {string|null} null on OK, else the failure reason.
 */
function verifyBundledCartridgeHash(name, version, versionDir) {
  const expected = bundledCartridgeExpectedHash(name, version);
  if (expected === null) {
    return `no baked hash for bundled cartridge ${name} ${version} — this build did not record it (MFR_BUNDLED_CARTRIDGE_HASHES)`;
  }
  let actual;
  try {
    actual = hashCartridgeDirectory(versionDir);
  } catch (e) {
    return `failed to hash bundled cartridge directory: ${e.message}`;
  }
  if (actual === expected) return null;
  return `content hash mismatch — baked ${expected}, on-disk ${actual}; the shipped cartridge differs from what this build was compiled to ship`;
}

/**
 * The identity a host accepts cartridges for. A cartridge whose cartridge.json
 * diverges from this on channel, registry URL, registry scheme, or fabric
 * manifest version is surfaced as incompatible — never hosted. Mirrors Rust
 * DiscoveryIdentity.
 */
class DiscoveryIdentity {
  /**
   * @param {Object} opts
   * @param {string} opts.channel - A CartridgeChannel value.
   * @param {string|null} opts.registryUrl - Some(url) for release/nightly
   *   hosts, null for dev hosts.
   * @param {number} opts.fabricManifestVersion
   * @param {number} opts.cartridgeRegistryVersion - The registry regime version
   *   this host speaks; an on-disk PATH level ({slug}/v{N}/{channel}/…), pinned
   *   like the channel so a v1 host never scans a v2 tree.
   */
  constructor({ channel, registryUrl, fabricManifestVersion, cartridgeRegistryVersion }) {
    if (channel !== CartridgeChannel.Release && channel !== CartridgeChannel.Nightly) {
      throw new Error(`DiscoveryIdentity: invalid channel '${channel}'`);
    }
    if (!Number.isInteger(cartridgeRegistryVersion) || cartridgeRegistryVersion < 1) {
      throw new Error(`DiscoveryIdentity: cartridgeRegistryVersion must be an integer >= 1, got '${cartridgeRegistryVersion}'`);
    }
    this.channel = channel;
    this.registryUrl = registryUrl !== undefined ? registryUrl : null;
    this.fabricManifestVersion = fabricManifestVersion;
    this.cartridgeRegistryVersion = cartridgeRegistryVersion;
  }

  /** This host's own baked-registry slug (`dev` when registryUrl is null). */
  slug() {
    return slugForSync(this.registryUrl);
  }
}

/**
 * A discovered cartridge version directory, classified. Mirrors Rust
 * DiscoveredCartridge — a tagged union with `kind` of `directory` (passed all
 * checks and its HELLO probe succeeded) or `incompatible` (found on disk but
 * failed a check; carries a structured `error`).
 */
class DiscoveredCartridge {
  constructor(kind, fields) {
    this.kind = kind; // 'directory' | 'incompatible'
    Object.assign(this, fields);
  }
  static directory(fields) { return new DiscoveredCartridge('directory', fields); }
  static incompatible(fields) { return new DiscoveredCartridge('incompatible', fields); }
}

/** Current wall-clock time as Unix seconds. A pre-epoch clock returns 0. */
function unixSecondsNow() {
  const s = Math.floor(Date.now() / 1000);
  return s >= 0 ? s : 0;
}

// Default protocol limits / version, mirroring capdag::bifaci::frame.
const BIFACI_PROTOCOL_VERSION = 4;
const BIFACI_DEFAULT_MAX_FRAME = 3670016;
const BIFACI_DEFAULT_MAX_CHUNK = 262144;
const BIFACI_DEFAULT_MAX_REORDER_BUFFER = 64;
const BIFACI_DEFAULT_INITIAL_CREDIT = 32;
const BIFACI_FRAME_TYPE_HELLO = 0;
// Frame CBOR integer keys (capdag::bifaci::frame::keys).
const BIFACI_KEY_VERSION = 0;
const BIFACI_KEY_FRAME_TYPE = 1;
const BIFACI_KEY_ID = 2;
const BIFACI_KEY_SEQ = 3;
const BIFACI_KEY_META = 5;

/**
 * Minimal CBOR encoder covering the value shapes the bifaci HELLO frame uses:
 * unsigned/negative integers, byte strings, text strings, booleans, and maps.
 * Faithful to RFC 8949 major-type encoding so the bytes are wire-compatible
 * with the Rust `ciborium` encoder. Map keys are emitted in the order given.
 *
 * @param {*} value - One of: number (integer), {__bytes: Buffer}, string,
 *   boolean, or {__map: [[key, val], ...]}.
 * @returns {Buffer}
 */
function cborEncode(value) {
  const out = [];
  const pushTypeLen = (major, n) => {
    const mt = major << 5;
    if (n < 24) {
      out.push(mt | n);
    } else if (n < 0x100) {
      out.push(mt | 24, n);
    } else if (n < 0x10000) {
      out.push(mt | 25, (n >> 8) & 0xff, n & 0xff);
    } else if (n < 0x100000000) {
      out.push(mt | 26, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
    } else {
      // 64-bit: split into high/low 32-bit halves.
      const hi = Math.floor(n / 0x100000000);
      const lo = n >>> 0;
      out.push(mt | 27,
        (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
        (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);
    }
  };
  const enc = (v) => {
    if (typeof v === 'number') {
      if (!Number.isInteger(v)) throw new Error('cborEncode: only integers supported');
      if (v >= 0) pushTypeLen(0, v);
      else pushTypeLen(1, -v - 1);
    } else if (typeof v === 'boolean') {
      out.push(v ? 0xf5 : 0xf4);
    } else if (typeof v === 'string') {
      const buf = Buffer.from(v, 'utf8');
      pushTypeLen(3, buf.length);
      for (const b of buf) out.push(b);
    } else if (v && v.__bytes !== undefined) {
      const buf = Buffer.isBuffer(v.__bytes) ? v.__bytes : Buffer.from(v.__bytes);
      pushTypeLen(2, buf.length);
      for (const b of buf) out.push(b);
    } else if (v && v.__map !== undefined) {
      pushTypeLen(5, v.__map.length);
      for (const [k, val] of v.__map) { enc(k); enc(val); }
    } else {
      throw new Error('cborEncode: unsupported value');
    }
  };
  enc(value);
  return Buffer.from(out);
}

/**
 * Minimal CBOR decoder returning a JS view of the value. Integers → number,
 * byte strings → {__bytes: Buffer}, text → string, bool → boolean, maps →
 * Map. Sufficient to parse a bifaci HELLO response frame. Throws on
 * unsupported/truncated input. Returns {value, offset}.
 */
function cborDecodeAt(buf, pos) {
  if (pos >= buf.length) throw new Error('cbor: unexpected end');
  const ib = buf[pos++];
  const major = ib >> 5;
  const minor = ib & 0x1f;
  const readLen = () => {
    if (minor < 24) return minor;
    if (minor === 24) { return buf[pos++]; }
    if (minor === 25) { const n = (buf[pos] << 8) | buf[pos + 1]; pos += 2; return n; }
    if (minor === 26) { const n = (buf[pos] * 0x1000000) + (buf[pos + 1] << 16) + (buf[pos + 2] << 8) + buf[pos + 3]; pos += 4; return n; }
    if (minor === 27) {
      let n = 0;
      for (let i = 0; i < 8; i++) { n = n * 256 + buf[pos++]; }
      return n;
    }
    throw new Error('cbor: bad length encoding');
  };
  switch (major) {
    case 0: { const n = readLen(); return { value: n, offset: pos }; }
    case 1: { const n = readLen(); return { value: -1 - n, offset: pos }; }
    case 2: { const len = readLen(); const b = buf.slice(pos, pos + len); pos += len; return { value: { __bytes: b }, offset: pos }; }
    case 3: { const len = readLen(); const s = buf.slice(pos, pos + len).toString('utf8'); pos += len; return { value: s, offset: pos }; }
    case 5: {
      const len = readLen();
      const m = new Map();
      for (let i = 0; i < len; i++) {
        const k = cborDecodeAt(buf, pos); pos = k.offset;
        const v = cborDecodeAt(buf, pos); pos = v.offset;
        m.set(k.value, v.value);
      }
      return { value: m, offset: pos };
    }
    case 7: {
      if (minor === 20) return { value: false, offset: pos };
      if (minor === 21) return { value: true, offset: pos };
      if (minor === 22) return { value: null, offset: pos };
      throw new Error('cbor: unsupported simple value');
    }
    default:
      throw new Error(`cbor: unsupported major type ${major}`);
  }
}

/**
 * Encode the engine-side HELLO frame as a length-prefixed CBOR frame, exactly
 * as capdag::bifaci::io::write_frame does: a 4-byte big-endian length prefix
 * followed by the CBOR-encoded frame map. Mirrors Frame::hello with default
 * Limits.
 *
 * @returns {Buffer}
 */
function encodeHelloFrame() {
  const meta = {
    __map: [
      ['max_frame', BIFACI_DEFAULT_MAX_FRAME],
      ['max_chunk', BIFACI_DEFAULT_MAX_CHUNK],
      ['max_reorder_buffer', BIFACI_DEFAULT_MAX_REORDER_BUFFER],
      ['initial_credit', BIFACI_DEFAULT_INITIAL_CREDIT],
      ['version', BIFACI_PROTOCOL_VERSION],
    ],
  };
  const frame = {
    __map: [
      [BIFACI_KEY_VERSION, BIFACI_PROTOCOL_VERSION],
      [BIFACI_KEY_FRAME_TYPE, BIFACI_FRAME_TYPE_HELLO],
      [BIFACI_KEY_ID, 0],
      [BIFACI_KEY_SEQ, 0],
      [BIFACI_KEY_META, meta],
    ],
  };
  const body = cborEncode(frame);
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(body.length, 0);
  return Buffer.concat([prefix, body]);
}

/**
 * Probe a cartridge binary for its capability surface. Spawns the binary,
 * performs the bifaci HELLO handshake (engine sends first), parses the
 * manifest from the cartridge's HELLO response, then kills the process. A
 * binary that fails to spawn, fails HELLO, or returns an unparseable manifest
 * is an error — the caller surfaces it as HandshakeFailed.
 *
 * Mirrors capdag::cartridge_discovery::probe_cartridge_cap_groups. The handshake
 * is the real length-prefixed CBOR frame exchange (capdag::bifaci::io); a
 * non-bifaci binary closes its pipes without emitting a HELLO frame, so the
 * read of the length-prefixed response hits EOF and the probe fails — exactly
 * as it must.
 *
 * @param {string} entryPath - Absolute path to the entry binary.
 * @returns {Promise<Array<Object>>} The manifest's cap_groups.
 * @throws {Error} when the handshake/probe fails.
 */
function probeCartridgeCapGroups(entryPath) {
  const { spawn } = nodeModules('probing a cartridge').childProcess;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(entryPath, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    } catch (e) {
      reject(new Error(`Failed to spawn cartridge ${entryPath}: ${e.message}`));
      return;
    }

    let settled = false;
    let buf = Buffer.alloc(0);
    let timer = null;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch (_e) { /* already gone */ }
      if (err) reject(err); else resolve(value);
    };

    child.on('error', (e) => finish(new Error(`cartridge ${entryPath} spawn error: ${e.message}`)));
    child.on('close', () => finish(new Error(`cartridge ${entryPath} HELLO failed: connection closed before receiving HELLO`)));

    // A cartridge that exits or closes its stdin before reading our HELLO
    // surfaces the broken pipe as an ASYNCHRONOUS 'error' event on the pipe
    // (EPIPE), not as a synchronous throw from write(). Without a listener,
    // Node treats that as an unhandled 'error' and aborts the whole host
    // process. Catch it here and route it through finish() so a single
    // misbehaving cartridge fails its own probe instead of killing discovery.
    child.stdin.on('error', (e) => finish(new Error(`cartridge ${entryPath} HELLO failed: ${e.message}`)));

    timer = setTimeout(() => finish(new Error(`cartridge ${entryPath} HELLO failed: timeout`)), 5000);

    // Send our HELLO first (host side).
    try {
      child.stdin.write(encodeHelloFrame());
    } catch (e) {
      finish(new Error(`cartridge ${entryPath} HELLO failed: ${e.message}`));
      return;
    }

    const tryParse = () => {
      if (buf.length < 4) return;
      const len = buf.readUInt32BE(0);
      if (buf.length < 4 + len) return;
      const body = buf.slice(4, 4 + len);
      let decoded;
      try {
        decoded = cborDecodeAt(body, 0).value;
      } catch (e) {
        finish(new Error(`cartridge ${entryPath} HELLO failed: ${e.message}`));
        return;
      }
      if (!(decoded instanceof Map)) {
        finish(new Error(`cartridge ${entryPath} HELLO failed: expected frame map`));
        return;
      }
      const frameType = decoded.get(BIFACI_KEY_FRAME_TYPE);
      if (frameType !== BIFACI_FRAME_TYPE_HELLO) {
        finish(new Error(`cartridge ${entryPath} HELLO failed: expected HELLO, got frame_type ${frameType}`));
        return;
      }
      const version = decoded.get(BIFACI_KEY_VERSION);
      if (version !== BIFACI_PROTOCOL_VERSION) {
        finish(new Error(`cartridge ${entryPath} HELLO failed: protocol version ${version} does not match required version ${BIFACI_PROTOCOL_VERSION}`));
        return;
      }
      const meta = decoded.get(BIFACI_KEY_META);
      if (!(meta instanceof Map)) {
        finish(new Error(`cartridge ${entryPath} HELLO failed: HELLO meta must be a map`));
        return;
      }
      const metaVersion = meta.get('version');
      if (metaVersion !== BIFACI_PROTOCOL_VERSION) {
        finish(new Error(`cartridge ${entryPath} HELLO failed: meta.version ${metaVersion} does not match required version ${BIFACI_PROTOCOL_VERSION}`));
        return;
      }
      // The concurrency-pool state map is MANDATORY on a cartridge HELLO
      // (bifaci pools, protocol v4): JSON bytes under meta key "pools". A
      // missing or malformed map is a protocol violation, never a default.
      const poolsVal = meta.get('pools');
      if (!poolsVal || poolsVal.__bytes === undefined) {
        finish(new Error(`cartridge ${entryPath} HELLO failed: missing required concurrency-pool state map`));
        return;
      }
      try {
        const poolStates = JSON.parse(Buffer.from(poolsVal.__bytes).toString('utf8'));
        if (poolStates === null || typeof poolStates !== 'object' || Array.isArray(poolStates)) {
          throw new Error('pool-state map must be a JSON object');
        }
      } catch (e) {
        finish(new Error(`cartridge ${entryPath} HELLO failed: malformed pool-state map: ${e.message}`));
        return;
      }
      const manifestVal = meta.get('manifest');
      if (!manifestVal || manifestVal.__bytes === undefined) {
        finish(new Error(`cartridge ${entryPath} HELLO failed: Cartridge HELLO missing required manifest`));
        return;
      }
      let manifest;
      try {
        manifest = JSON.parse(Buffer.from(manifestVal.__bytes).toString('utf8'));
      } catch (e) {
        finish(new Error(`cartridge ${entryPath} invalid manifest: ${e.message}`));
        return;
      }
      finish(null, Array.isArray(manifest.cap_groups) ? manifest.cap_groups : []);
    };

    child.stdout.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      tryParse();
    });
    // Guard the read side too: an error on the child's stdout (e.g. the pipe
    // breaking mid-read) must not become an unhandled 'error' event.
    child.stdout.on('error', (e) => finish(new Error(`cartridge ${entryPath} HELLO failed: ${e.message}`)));
  });
}

/**
 * Discover every cartridge under `{cartridgesRoot}/{slug}/{channel}/`. Scans
 * EVERY slug folder present on disk (full parity) — the host's baked
 * `identity.registryUrl` does NOT restrict which slugs are scanned; each
 * cartridge is validated in place against the slug folder it sits under (the
 * three-place rule in `CartridgeJson.readFromDir`). The channel folder IS
 * pinned to the host's channel. An empty/absent scan root yields an empty
 * roster; a real IO failure reading an existing root is an error.
 *
 * Mirrors capdag::cartridge_discovery::discover_cartridges.
 *
 * @param {string} cartridgesRoot
 * @param {DiscoveryIdentity} identity
 * @returns {Promise<Array<DiscoveredCartridge>>}
 */
async function discoverCartridges(cartridgesRoot, identity) {
  const { fs, path } = nodeModules('discovering cartridges');
  const discovered = [];

  let rootStat;
  try { rootStat = fs.statSync(cartridgesRoot); } catch (_e) { return discovered; }
  if (!rootStat.isDirectory()) return discovered;

  let slugEntries;
  try {
    slugEntries = fs.readdirSync(cartridgesRoot, { withFileTypes: true });
  } catch (e) {
    throw new Error(`read_dir(${cartridgesRoot}): ${e.message}`);
  }

  for (const slugEntry of slugEntries) {
    const slugDir = path.join(cartridgesRoot, slugEntry.name);
    if (!slugEntry.isDirectory()) {
      // Unmanaged file in cartridges root — only registry-slug / dev
      // directories belong here. Skipped (logged in the reference).
      continue;
    }
    const expectedSlug = slugEntry.name;
    // {slug}/v{cartridgeRegistryVersion}/{channel}/… — the registry regime
    // version is a path level pinned to the host's version (like the channel).
    const scanRoot = path.join(slugDir, `v${identity.cartridgeRegistryVersion}`, identity.channel);
    let scanStat;
    try { scanStat = fs.statSync(scanRoot); } catch (_e) { continue; }
    if (!scanStat.isDirectory()) continue;
    await scanChannelRoot(scanRoot, expectedSlug, identity, discovered);
  }

  return discovered;
}

/**
 * Scan one `{slug}/{channel}/` root: classify each cartridge name directory's
 * newest version against the host identity and the slug folder it sits under.
 * Mirrors capdag::cartridge_discovery::scan_channel_root.
 */
async function scanChannelRoot(scanRoot, expectedSlug, identity, discovered) {
  const { fs, path } = nodeModules('discovering cartridges');

  let nameEntries;
  try {
    nameEntries = fs.readdirSync(scanRoot, { withFileTypes: true });
  } catch (e) {
    throw new Error(`read_dir(${scanRoot}): ${e.message}`);
  }

  for (const entry of nameEntries) {
    const nameDir = path.join(scanRoot, entry.name);
    if (!entry.isDirectory()) continue;

    let subEntries;
    try {
      subEntries = fs.readdirSync(nameDir, { withFileTypes: true });
    } catch (_e) {
      continue;
    }

    const versionDirs = [];
    for (const sub of subEntries) {
      if (sub.isDirectory()) versionDirs.push(path.join(nameDir, sub.name));
    }
    if (versionDirs.length === 0) continue;

    // Prefer the newest version (lexical-descending on the version folder name).
    versionDirs.sort((a, b) => {
      const va = path.basename(a);
      const vb = path.basename(b);
      return vb < va ? -1 : vb > va ? 1 : 0;
    });
    const versionDir = versionDirs[0];

    const pathDerivedName = path.basename(nameDir);
    const pathDerivedVersion = path.basename(versionDir);
    const detectedAt = unixSecondsNow();

    // read_from_dir enforces the three-place rule against the ACTUAL slug
    // folder (expectedSlug): the cartridge's declared registry_url must hash
    // to it. A slug mismatch is a BadInstallation; an unreadable/garbage
    // cartridge.json is ManifestInvalid. Both surfaced, never hosted.
    let cj;
    try {
      cj = CartridgeJson.readFromDir(versionDir, expectedSlug);
    } catch (e) {
      const kind = (e instanceof CartridgeJsonError && e.kind === CartridgeJsonErrorKind.REGISTRY_SLUG_MISMATCH)
        ? CartridgeAttachmentErrorKind.MISPLACED
        : CartridgeAttachmentErrorKind.MANIFEST_INVALID;
      discovered.push(DiscoveredCartridge.incompatible({
        version_dir: versionDir,
        id: pathDerivedName,
        channel: identity.channel,
        registry_url: identity.registryUrl,
        version: pathDerivedVersion,
        error: new CartridgeAttachmentError(
          kind,
          `cartridge.json failed to load under slug '${expectedSlug}': ${e.message}`,
          detectedAt
        ),
      }));
      continue;
    }

    if (cj.channel !== identity.channel) {
      discovered.push(DiscoveredCartridge.incompatible({
        version_dir: versionDir,
        id: cj.name,
        channel: cj.channel,
        registry_url: cj.registryUrl,
        version: cj.version,
        error: new CartridgeAttachmentError(
          CartridgeAttachmentErrorKind.MISPLACED,
          `Channel mismatch: cartridge declares '${cj.channel}' but host is pinned to '${identity.channel}'. Release and nightly artefacts must not mix.`,
          detectedAt
        ),
      }));
      continue;
    }

    // Scheme check is per-cartridge: a dev cartridge (null registry_url) never
    // reaches here; a registry cartridge must use https (devMode=false).
    if (cj.registryUrl !== null && cj.registryUrl !== undefined) {
      const res = validateRegistryUrlScheme(cj.registryUrl, false);
      if (res.kind === RegistryUrlSchemeResultKind.NON_HTTPS) {
        discovered.push(DiscoveredCartridge.incompatible({
          version_dir: versionDir,
          id: cj.name,
          channel: cj.channel,
          registry_url: cj.registryUrl,
          version: cj.version,
          error: new CartridgeAttachmentError(
            CartridgeAttachmentErrorKind.INCOMPATIBLE,
            `registry_url uses '${res.scheme}' scheme, must be https in non-dev builds. Rebuild the cartridge with an https registry URL.`,
            detectedAt
          ),
        }));
        continue;
      }
      if (res.kind === RegistryUrlSchemeResultKind.NOT_A_URL) {
        discovered.push(DiscoveredCartridge.incompatible({
          version_dir: versionDir,
          id: cj.name,
          channel: cj.channel,
          registry_url: cj.registryUrl,
          version: cj.version,
          error: new CartridgeAttachmentError(
            CartridgeAttachmentErrorKind.INCOMPATIBLE,
            `registry_url '${res.url}' is not a well-formed URL.`,
            detectedAt
          ),
        }));
        continue;
      }
    }

    if (cj.fabricManifestVersion !== identity.fabricManifestVersion) {
      discovered.push(DiscoveredCartridge.incompatible({
        version_dir: versionDir,
        id: cj.name,
        channel: cj.channel,
        registry_url: cj.registryUrl,
        version: cj.version,
        error: new CartridgeAttachmentError(
          CartridgeAttachmentErrorKind.FABRIC_MANIFEST_VERSION_MISMATCH,
          `Cartridge built against fabric manifest version ${cj.fabricManifestVersion}, but host is pinned to ${identity.fabricManifestVersion}. Rebuild the cartridge with MFR_FABRIC_MANIFEST_VERSION=${identity.fabricManifestVersion}.`,
          detectedAt
        ),
      }));
      continue;
    }

    // Bundled-cartridge integrity. A cartridge marked installed_from=bundle is
    // shipped INSIDE this build and has no upstream registry to verify against,
    // so it needs its own integrity proof. Platform-split: on macOS the OS
    // code-signature is the guard (baked-hash verification intentionally
    // skipped); on non-macOS the on-disk directory must hash to the baked
    // value, else BadInstallation.
    if (cj.installedFrom === CartridgeInstallSource.BUNDLE) {
      if (process.platform !== 'darwin') {
        const reason = verifyBundledCartridgeHash(cj.name, cj.version, versionDir);
        if (reason !== null) {
          discovered.push(DiscoveredCartridge.incompatible({
            version_dir: versionDir,
            id: cj.name,
            channel: cj.channel,
            registry_url: cj.registryUrl,
            version: cj.version,
            error: new CartridgeAttachmentError(
              CartridgeAttachmentErrorKind.MISPLACED,
              `bundled cartridge integrity check failed: ${reason}`,
              detectedAt
            ),
          }));
          continue;
        }
      }
    }

    const entryPoint = cj.resolveEntryPoint(versionDir);
    try {
      const capGroups = await probeCartridgeCapGroups(entryPoint);
      discovered.push(DiscoveredCartridge.directory({
        entry_point: entryPoint,
        version_dir: versionDir,
        id: cj.name,
        channel: cj.channel,
        registry_url: cj.registryUrl,
        version: cj.version,
        cap_groups: capGroups,
      }));
    } catch (e) {
      discovered.push(DiscoveredCartridge.incompatible({
        version_dir: versionDir,
        id: cj.name,
        channel: cj.channel,
        registry_url: cj.registryUrl,
        version: cj.version,
        error: new CartridgeAttachmentError(
          CartridgeAttachmentErrorKind.HANDSHAKE_FAILED,
          `HELLO handshake / cap discovery probe failed: ${e.message}`,
          detectedAt
        ),
      }));
    }
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
//
// Per-item map (`is_loop`) is a derived cardinality property, never authored
// syntax — there is no LOOP marker in the grammar.
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
    // Debug-only marker for a per-item map edge. Not notation syntax (the
    // `LOOP` keyword is retired); `is_loop` is a derived cardinality property.
    const loopPrefix = this.isLoop ? 'map ' : '';
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

      // `is_loop` is NOT emitted into notation text: it is a derived cardinality
      // property, not authored syntax (the `LOOP` keyword is retired).
      if (sources.length === 1) {
        output += `[${sources[0]} -> ${alias} -> ${targetName}]`;
      } else {
        const group = sources.join(', ');
        output += `[(${group}) -> ${alias} -> ${targetName}]`;
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

      // `is_loop` is NOT emitted into notation text: it is a derived cardinality
      // property, not authored syntax (the `LOOP` keyword is retired).
      if (sources.length === 1) {
        lines.push(`[${sources[0]} -> ${alias} -> ${targetName}]`);
      } else {
        const group = sources.join(', ');
        lines.push(`[(${group}) -> ${alias} -> ${targetName}]`);
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

      // `is_loop` is NOT emitted into notation text: it is a derived cardinality
      // property, not authored syntax (the `LOOP` keyword is retired).
      if (sources.length === 1) {
        lines.push(`${open}${sources[0]} -> ${alias} -> ${targetName}${close}`);
      } else {
        const group = sources.join(', ');
        lines.push(`${open}(${group}) -> ${alias} -> ${targetName}${close}`);
      }
    }

    return bracketed ? lines.join('') : lines.join('\n');
  }

  /**
   * Serialize to machine notation rendering each cap by its registered display
   * alias (shortest name, ties alphabetical) when one exists, falling back to
   * the canonical-URN `edge_N` header form otherwise. This is the "store
   * aliased" form: generated and persisted machines use it so the saved
   * notation reads in terms of aliases.
   *
   * Semantics (mirrors Rust Machine::to_machine_notation_aliased):
   *  - A cap WITH a display alias is referenced DIRECTLY in the wiring's
   *    cap-position by its alias name, with NO `[edge_N cap:...]` header (the
   *    grammar forbids an alias in a header's cap position anyway, and a header
   *    would be redundant).
   *  - A cap WITHOUT an alias keeps the synthetic `edge_N` wiring token plus its
   *    `[edge_N cap:...]` header binding it to the canonical cap URN.
   *
   * The canonical `edge_N` numbering and node naming are inherited unchanged
   * from the canonical serializer, so an un-aliased machine produces byte-
   * identical output to toMachineNotationFormatted.
   *
   * @param {FabricRegistryClient} registry - resolves URN → display alias
   * @param {'bracketed' | 'line-based'} format
   * @returns {string}
   */
  toMachineNotationAliased(registry, format) {
    if (this._edges.length === 0) {
      return '';
    }

    const { aliases, nodeNames, edgeOrder } = this._buildSerializationMaps();
    const bracketed = format === 'bracketed';
    const open = bracketed ? '[' : '';
    const close = bracketed ? ']' : '';

    // Resolve, per edge index, the cap-position token and whether it needs a
    // header. An aliased cap uses its display alias directly (no header); an
    // un-aliased cap keeps its synthetic `edge_N` token (with a header).
    const edgeToken = new Map();   // edgeIdx → token used in the wiring
    const edgeNeedsHeader = new Map(); // edgeIdx → bool
    for (const [edgeAlias, info] of aliases) {
      const edge = this._edges[info.edgeIdx];
      const displayAlias = registry.displayAliasForUrn(edge.capUrn.toString());
      if (displayAlias !== null && displayAlias !== undefined) {
        edgeToken.set(info.edgeIdx, displayAlias);
        edgeNeedsHeader.set(info.edgeIdx, false);
      } else {
        edgeToken.set(info.edgeIdx, edgeAlias);
        edgeNeedsHeader.set(info.edgeIdx, true);
      }
    }

    const lines = [];

    // Headers only for edges that kept a synthetic `edge_N` token (un-aliased
    // caps). Emit in alias-sorted order to match the canonical serializer.
    const sortedAliases = Array.from(aliases.entries()).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    for (const [, info] of sortedAliases) {
      if (edgeNeedsHeader.get(info.edgeIdx)) {
        const edge = this._edges[info.edgeIdx];
        lines.push(`${open}${edgeToken.get(info.edgeIdx)} ${edge.capUrn}${close}`);
      }
    }

    // Wirings in canonical edge order, using the resolved cap-position token.
    for (const edgeIdx of edgeOrder) {
      const edge = this._edges[edgeIdx];
      const token = edgeToken.get(edgeIdx);

      const sources = edge.sources.map(s => nodeNames.get(s.toString()));
      const targetName = nodeNames.get(edge.target.toString());

      // `is_loop` is NOT emitted into notation text: it is a derived cardinality
      // property, not authored syntax (the `LOOP` keyword is retired).
      if (sources.length === 1) {
        lines.push(`${open}${sources[0]} -> ${token} -> ${targetName}${close}`);
      } else {
        const group = sources.join(', ');
        lines.push(`${open}(${group}) -> ${token} -> ${targetName}${close}`);
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

    // Step 2: Generate edge aliases. The Rust reference implementation
    // uses `edge_<idx>` unconditionally — there is no privileged tag (such
    // as the legacy `op=…` tag) we can derive a friendlier name from, so
    // we mirror the same pure-index scheme here.
    // Number aliases by position in the canonical (sorted) edge order so
    // that two graphs with the same edges in different insertion orders
    // produce identical notation. Without this the alias number tracks
    // insertion order and serialization is non-canonical.
    const aliases = new Map();
    edgeOrder.forEach((idx, position) => {
      const edge = this._edges[idx];
      const alias = `edge_${position}`;
      const capStr = edge.capUrn.toString();
      aliases.set(alias, { edgeIdx: idx, capStr });
    });

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
   * - Per-item map edges (`is_loop`): dotted line style — `is_loop` is a
   *   derived render property, never the retired `LOOP` keyword
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
      // Find alias for this edge. The label on the rendered diagram is the
      // edge's alias (`edge_<idx>`), matching the Rust serializer which
      // also uses pure-index aliases — no special tag (like the legacy
      // `op=…`) is privileged for label derivation.
      let label = null;
      for (const [a, info] of aliases) {
        if (info.edgeIdx === edgeIdx) {
          label = a;
          break;
        }
      }

      const targetKey = edge.target.toString();
      const targetName = nodeNames.get(targetKey);

      for (const src of edge.sources) {
        const srcKey = src.toString();
        const srcName = nodeNames.get(srcKey);

        if (edge.isLoop) {
          // Dotted line renders the derived per-item map (`is_loop`) property.
          // No "LOOP" text — that keyword is retired.
          lines.push(`  ${srcName} -. "${label}" .-> ${targetName}`);
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

    // `is_loop` is a derived cardinality property, not authored syntax (the
    // `LOOP` keyword is retired). The pure-JS parse path has no cap definitions
    // — it derives media only from the cap URN's in=/out= specs — so it cannot
    // evaluate the ForEach rule (a sequence source feeding a scalar-input cap).
    // Editors obtain the derived `is_loop` from the engine server's resolved
    // graph; here it defaults to false.
    edges.push(new MachineEdge(sourceUrns, capUrn, capOutMedia, false));
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
   * Add a linear chain of edges from CapFabEdge[] (from CapFab.findAllPaths).
   *
   * Each CapFabEdge has fromUrn, toUrn, and cap (with cap.urn).
   * This converts the path into a series of MachineEdges.
   *
   * @param {CapFabEdge[]} capFabEdges - Array of CapFabEdge from pathfinding
   * @returns {MachineBuilder} this (for chaining)
   */
  addCapFabPath(capFabEdges) {
    for (const edge of capFabEdges) {
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
 *
 * Wire shape mirrors the flattened entries published at
 *   <base>/api/capabilities                    (the flat array)
 *   <base>/views/capabilities                  (alias)
 *   <base>/views/capabilities-by-urn           (map keyed by canonical URN)
 *   <base>/caps/<sha256(canonical-urn)>        (per-URN object)
 *
 * Equality between an entry's URN and any caller-supplied URN MUST go
 * through the CapUrn parser's `isEquivalent()` predicate — never via
 * string comparison. The wire form is already canonical (the writer
 * canonicalises before publishing), but a caller's URN may not be, so
 * lookups parse both sides and compare via the parser's order-theoretic
 * relations.
 */
class FabricRegistryEntry {
  constructor(data) {
    this.urn = data.urn;
    this.title = data.title || '';
    this.aliases = data.aliases || [];
    this.isAbstract = data.abstract === true;
    this.description = data.cap_description || '';
    this.args = data.args || [];
    this.output = data.output || null;
    this.urnTags = data.urn_tags || {};
    this.inSpec = data.in_spec || '';
    this.outSpec = data.out_spec || '';
    this.inMediaTitle = data.in_media_title || '';
    this.outMediaTitle = data.out_media_title || '';
  }
}

/**
 * A media def entry from the registry.
 *
 * Wire shape mirrors the per-URN objects published at
 *   <base>/media/<sha256(canonical-urn)>
 * and the values of `<base>/views/media-by-urn`.
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
 * SHA-256 hex digest of `s` UTF-8 bytes.
 *
 * Used to derive registry object keys from canonical URN strings, so
 * the URL surface is colon/quote/semicolon-free. All capdag
 * implementations (capdag, capdag-js, capdag-py, capdag-go, capdag-objc)
 * use this same algorithm so a URN's key is identical across languages.
 *
 * `crypto.subtle` is on `globalThis` in browsers and in every Node this
 * package supports.
 */
async function sha256Hex(s) {
  const utf8 = new TextEncoder().encode(s);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', utf8);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Client for fetching and caching capabilities and media defs.
 *
 * Reads from `<baseUrl>/api/capabilities` (the flat catalogue) and
 * `<baseUrl>/{caps,media}/<sha256>` (per-URN).
 *
 * URL safety: per-URN lookups hash the canonical URN string with SHA-256
 * before constructing the URL, so the path contains only the literal
 * prefix and a 64-character hex digest — no colons, quotes, semicolons,
 * or equals signs to percent-encode.
 *
 * URN comparison: the cache lookup parses both sides through CapUrn /
 * MediaUrn and uses the parser's `isEquivalent()` predicate. Two
 * spellings of the same URN (different tag order, etc.) resolve to the
 * same entry.
 */
class FabricRegistryClient {
  /**
   * @param {string} [baseUrl='https://fabric.capdag.com'] - Registry base URL
   * @param {number} [cacheTtlSeconds=300] - Cache TTL in seconds
   */
  constructor(baseUrl = 'https://fabric.capdag.com', cacheTtlSeconds = 300) {
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._cacheTtl = cacheTtlSeconds * 1000;
    // The full-catalogue cache is keyed by no key — there's only one.
    this._capCache = null;
    // Per-URN media cache, keyed by the canonical URN string. The
    // canonical key only needs to be unique per equivalence class; we
    // store one entry per equivalence class.
    this._mediaCache = new Map();
    // Normalized alias name → StoredAlias. Mirrors Rust
    // FabricRegistry::cached_aliases. The display/serialization surfaces
    // read this synchronously; it is warmed by insertCachedAliasForTest (and,
    // in the heavier mirrors, a background prefetch this lightweight client
    // does not implement).
    this._cachedAliases = new Map();
  }

  /**
   * Fetch the full flat capability catalogue (cached).
   *
   * @returns {Promise<FabricRegistryEntry[]>}
   */
  async fetchCapabilities() {
    if (this._capCache && (Date.now() - this._capCache.fetchedAt) < this._cacheTtl) {
      return this._capCache.entries;
    }

    const url = `${this._baseUrl}/api/capabilities`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Cap registry request failed: HTTP ${response.status} from ${url}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(`Invalid cap registry response: expected array, got ${typeof data}`);
    }

    const entries = data.map(d => new FabricRegistryEntry(d));
    this._capCache = { entries, fetchedAt: Date.now() };
    return entries;
  }

  /**
   * Lookup a single capability by URN.
   *
   * Canonicalises the input URN through CapUrn, then either:
   *   - returns the cache entry whose URN `isEquivalent()` to the
   *     canonical input, OR
   *   - GETs `<base>/caps/<sha256(canonical)>` and returns its body.
   *
   * @param {string} capUrnStr — caller's cap URN (any valid form)
   * @returns {Promise<FabricRegistryEntry|null>}
   */
  async lookupCap(capUrnStr) {
    const requested = CapUrn.fromString(capUrnStr);

    if (this._capCache && (Date.now() - this._capCache.fetchedAt) < this._cacheTtl) {
      for (const entry of this._capCache.entries) {
        const entryUrn = CapUrn.fromString(entry.urn);
        if (entryUrn.isEquivalent(requested)) return entry;
      }
    }

    const canonical = requested.toString();
    const hash = await sha256Hex(canonical);
    const url = `${this._baseUrl}/caps/${hash}`;
    const response = await fetch(url);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Cap lookup failed: HTTP ${response.status} for ${canonical} (${url})`);
    }

    const data = await response.json();
    return new FabricRegistryEntry(data);
  }

  /**
   * Lookup a single media def by URN.
   *
   * Canonicalises through MediaUrn and looks up by SHA-256 hash.
   *
   * @param {string} mediaUrnStr
   * @returns {Promise<MediaRegistryEntry|null>}
   */
  async lookupMedia(mediaUrnStr) {
    const requested = MediaUrn.fromString(mediaUrnStr);
    const canonical = requested.toString();

    const cached = this._mediaCache.get(canonical);
    if (cached && (Date.now() - cached.fetchedAt) < this._cacheTtl) {
      return cached.entry;
    }

    const hash = await sha256Hex(canonical);
    const url = `${this._baseUrl}/media/${hash}`;
    const response = await fetch(url);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Media lookup failed: HTTP ${response.status} for ${canonical} (${url})`);
    }

    const data = await response.json();
    const entry = new MediaRegistryEntry(data);
    this._mediaCache.set(canonical, { entry, fetchedAt: Date.now() });
    return entry;
  }

  /**
   * All canonical media URNs referenced as in/out specs by any cap in
   * the cached catalogue.
   *
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
   * All distinct `op=` tag values present on any cap in the cached
   * catalogue.
   *
   * `op` is just another arbitrary tag; this helper exists for the
   * cap-navigator UI which surfaces operation labels. It is NOT part of
   * dispatch — only the in/out tags carry functional meaning.
   *
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
   * Insert an alias directly into the in-memory cache, keyed by its
   * normalized name. Mirrors Rust
   * FabricRegistry::insert_cached_alias_for_test — it is the warm-cache seam
   * the display/serialization primitives read from. The lightweight JS client
   * has no background alias prefetch, so callers seed the cache through here.
   *
   * @param {StoredAlias} alias
   */
  insertCachedAliasForTest(alias) {
    const normalized = normalizeAliasName(alias.name);
    this._cachedAliases.set(normalized, alias);
  }

  /**
   * Reverse lookup: the display alias for a `cap:`/`media:` URN, or null if no
   * cached alias points at it. This is the canonical primitive every UI surface
   * and notation generator uses to render an aliased name in place of a raw URN.
   *
   * The query URN is canonicalised through its own parser (cap vs media by
   * prefix) before matching, because alias targets are stored canonically — a
   * non-canonical query (different tag order, redundant whitespace) would
   * otherwise miss. A URN that is neither a cap nor a media URN, or that fails
   * to parse, returns null (it cannot have an alias).
   *
   * When multiple aliases target the same URN, the winner is the SHORTEST name,
   * ties broken alphabetically (see selectDisplayAlias). This is deterministic
   * and stable across processes for a given alias set.
   *
   * Mirrors Rust FabricRegistry::display_alias_for_urn.
   * @param {string} urn
   * @returns {string|null}
   */
  displayAliasForUrn(urn) {
    // Canonicalise by kind. classifyAliasTarget keys off the parser (cap vs
    // media), the same classifier the alias publisher uses for targets, so a
    // query and a stored target canonicalise identically.
    const kind = classifyAliasTarget(urn);
    let canonical;
    if (kind === ALIAS_TARGET_CAP) {
      canonical = CapUrn.fromString(urn).toString();
    } else if (kind === ALIAS_TARGET_MEDIA) {
      canonical = MediaUrn.fromString(urn).toString();
    } else {
      return null;
    }

    const names = [];
    for (const alias of this._cachedAliases.values()) {
      if (alias.target === canonical) {
        names.push(alias.name);
      }
    }
    return selectDisplayAlias(names);
  }

  /**
   * All cached aliases whose target is a CAP URN, as [name, capUrn] pairs.
   * Used by the notation editor to offer registered cap aliases as wiring
   * completions. Order is unspecified (the caller sorts/filters). Synchronous,
   * cache-only — relies on the alias cache having been warmed.
   *
   * Mirrors Rust FabricRegistry::cached_cap_aliases.
   * @returns {Array<[string, string]>}
   */
  cachedCapAliases() {
    const pairs = [];
    for (const alias of this._cachedAliases.values()) {
      if (classifyAliasTarget(alias.target) === ALIAS_TARGET_CAP) {
        pairs.push([alias.name, alias.target]);
      }
    }
    return pairs;
  }

  /**
   * Invalidate all caches. Next call to any method fetches fresh data.
   */
  invalidate() {
    this._capCache = null;
    this._mediaCache.clear();
    this._cachedAliases.clear();
  }
}

// ===========================================================================
// Aliases (the DNS-analogue translation layer over URNs)
// ===========================================================================
//
// An alias is a first-class fabric definition: a short, contiguous,
// case-insensitive name that resolves to exactly one cap or media URN. This
// lightweight JS mirror provides the pure alias primitives (name rules,
// URN-vs-alias detection, target classification), the StoredAlias wire shape,
// and Manifest (de)serialization of the aliases map — the pieces the web UIs
// and LSP need to recognize and present aliases. Full registry-side alias
// resolution lives in the heavier mirrors (Rust/Go/Py/ObjC).

const ALIAS_TARGET_CAP = 'cap';
const ALIAS_TARGET_MEDIA = 'media';
const ALIAS_NAME_RE = /^[a-z0-9._-]+$/;

/**
 * A contiguous token "looks like a URN" iff it contains ':'. Every tagged URN
 * has the shape prefix:..., so the presence of ':' is the unambiguous
 * discriminator between a URN and an alias name.
 */
function tokenIsUrn(token) {
  return typeof token === 'string' && token.includes(':');
}

/** Complement of tokenIsUrn: a colon-free token is an alias candidate. */
function isAliasToken(token) {
  return !tokenIsUrn(token);
}

/**
 * Normalize and validate an alias name. Lowercases the input, then requires it
 * non-empty, free of ':' (so it can never look like a tagged URN), free of
 * whitespace, and matching [a-z0-9._-]+. Returns the canonical lowercased
 * name or throws — there is no lenient path.
 */
function normalizeAliasName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('alias name is empty');
  }
  if (name.includes(':')) {
    throw new Error(`alias name '${name}' contains ':' — aliases must never look like a tagged URN`);
  }
  if (/\s/.test(name)) {
    throw new Error(`alias name '${name}' contains whitespace`);
  }
  const lowered = name.toLowerCase();
  if (!ALIAS_NAME_RE.test(lowered)) {
    throw new Error(`alias name '${name}' contains invalid characters; allowed: lowercase letters, digits, '.', '_', '-'`);
  }
  return lowered;
}

/**
 * Classify an alias target URN by prefix. Returns 'cap', 'media', or null
 * (not a cap/media URN).
 */
function classifyAliasTarget(target) {
  try {
    CapUrn.fromString(target);
    return ALIAS_TARGET_CAP;
  } catch (_) { /* not a cap URN */ }
  try {
    MediaUrn.fromString(target);
    return ALIAS_TARGET_MEDIA;
  } catch (_) { /* not a media URN */ }
  return null;
}

/**
 * Pick the display alias from a set of alias names that all target the same
 * URN: the SHORTEST name, ties broken alphabetically. Returns null for an
 * empty set.
 *
 * The ordering is total and deterministic: (length, name) lexicographic. So
 * `png` beats `png-image` (shorter), and between equal-length `a16` / `a09`
 * the alphabetical-smaller `a09` wins. Stable across processes for a given
 * alias set, which is what makes aliased UI/notation reproducible.
 *
 * Mirrors Rust select_display_alias.
 * @param {Iterable<string>} names
 * @returns {string|null}
 */
function selectDisplayAlias(names) {
  let best = null;
  for (const name of names) {
    if (
      best === null ||
      name.length < best.length ||
      (name.length === best.length && name < best)
    ) {
      best = name;
    }
  }
  return best;
}

/**
 * The published wire/cache shape of a single fabric alias. Mirrors
 * fabric/alias.schema.json: { name, target, version }.
 */
class StoredAlias {
  constructor(name, target, version) {
    this.name = name;
    this.target = target;
    this.version = version;
  }
  toJSON() {
    return { name: this.name, target: this.target, version: this.version };
  }
  static fromJSON(obj) {
    return new StoredAlias(obj.name, obj.target, obj.version);
  }
}

/**
 * A versioned registry snapshot. Mirrors fabric/manifest.schema.json:
 * { version, previous, caps, media, aliases } where each map is
 * name/urn -> defver.
 */
class Manifest {
  constructor(version, previous, caps = {}, media = {}, aliases = {}) {
    this.version = version;
    this.previous = previous;
    this.caps = caps;
    this.media = media;
    this.aliases = aliases;
  }
  static empty(version) {
    return new Manifest(version, Math.max(0, version - 1), {}, {}, {});
  }
  toJSON() {
    return {
      version: this.version,
      previous: this.previous,
      caps: this.caps,
      media: this.media,
      aliases: this.aliases,
    };
  }
  static fromJSON(obj) {
    return new Manifest(
      obj.version,
      obj.previous,
      obj.caps || {},
      obj.media || {},
      obj.aliases || {},
    );
  }
}

export {
  // Registry trust vocabulary — one verdict per registry, shared by every
  // cartridge that claims provenance from it.
  RegistryVerdict,
  RegistryVerdictState,
  ChainFailureReason,
  REGISTRY_VERDICT_STATES,
  CHAIN_FAILURE_REASONS,
  registryVerdictStateForChainFailure,
  registryVerdictPermitsAttachment,
  registryVerdictIsTrustFailure,
  registryVerdictIsTransient,
  RegistryRemedy,
  registryVerdictRemedy,
  MANIFEST_SIG_FORMAT,
  RELEASE_KEY_CERT_FORMAT,
  ALIAS_TARGET_CAP,
  ALIAS_TARGET_MEDIA,
  tokenIsUrn,
  isAliasToken,
  normalizeAliasName,
  classifyAliasTarget,
  selectDisplayAlias,
  StoredAlias,
  Manifest,
  CapUrn,
  CapKind,
  CapEffect,
  CapUrnBuilder,
  CapMatcher,
  CapUrnError,
  ErrorCodes,
  MediaUrn,
  MediaUrnError,
  MediaUrnErrorCodes,
  Cap,
  CapGroup,
  CapManifest,
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
  MediaDef,
  MediaDefError,
  MediaDefErrorCodes,
  isBinaryCapUrn,
  isJSONCapUrn,
  isStructuredCapUrn,
  resolveMediaUrn,
  buildExtensionIndex,
  mediaUrnsForExtension,
  getExtensionMappings,
  validateNoMediaDefRedefinition,
  validateNoMediaDefRedefinitionSync,
  validateNoMediaDefDuplicates,
  getSchemaBaseURL,
  getProfileURL,
  MEDIA_STRING,
  MEDIA_INTEGER,
  MEDIA_NUMBER,
  MEDIA_BOOLEAN,
  MEDIA_OBJECT,
  // List types
  MEDIA_LIST,
  MEDIA_STRING_LIST as MEDIA_TEXTABLE_LIST,
  MEDIA_STRING_LIST,
  MEDIA_INTEGER_LIST,
  MEDIA_NUMBER_LIST,
  MEDIA_BOOLEAN_LIST,
  MEDIA_OBJECT_LIST,
  MEDIA_IDENTITY,
  MEDIA_VOID,
  MEDIA_PNG,
  MEDIA_JPEG,
  MEDIA_GIF,
  MEDIA_BMP,
  MEDIA_TIFF,
  MEDIA_WEBP,
  MEDIA_AUDIO,
  MEDIA_MP3,
  MEDIA_WAV,
  MEDIA_FLAC,
  MEDIA_OGG,
  MEDIA_AAC,
  MEDIA_M4A,
  MEDIA_AIFF,
  MEDIA_OPUS,
  MEDIA_VIDEO,
  MEDIA_MP4,
  MEDIA_MOV,
  MEDIA_WEBM,
  MEDIA_MKV,
  MEDIA_AUDIO_SPEECH,
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
  // Format-specific variants
  MEDIA_JSON_VALUE,
  MEDIA_JSON_RECORD,
  MEDIA_JSON_LIST,
  MEDIA_JSON_LIST_RECORD,
  MEDIA_YAML_VALUE,
  MEDIA_YAML_RECORD,
  MEDIA_YAML_LIST,
  MEDIA_YAML_LIST_RECORD,
  MEDIA_CSV,
  MEDIA_CSV_LIST,
  MEDIA_MODEL_SPEC,
  MEDIA_MODEL_REPO,
  MEDIA_MODEL_DIM,
  MEDIA_DECISION,
  MEDIA_TEXTABLE_PAGE,
  // Semantic output types - model management
  MEDIA_DOWNLOAD_OUTPUT,
  MEDIA_LIST_OUTPUT,
  MEDIA_STATUS_OUTPUT,
  MEDIA_CONTENTS_OUTPUT,
  MEDIA_AVAILABILITY_OUTPUT,
  MEDIA_PATH_OUTPUT,
  // Semantic output types - inference
  MEDIA_EMBEDDING_VECTOR,
  MEDIA_IMAGE_DESCRIPTION,
  MEDIA_PLAIN_TEXT,
  MEDIA_TRANSCRIPTION_OUTPUT,
  // File path type — single URN; cardinality lives on is_sequence.
  MEDIA_FILE_PATH,
  MEDIA_MLX_MODEL_PATH,
  // HF token and model search types
  MEDIA_HF_TOKEN,
  MEDIA_MODEL_ARCH_LIST,
  MEDIA_MODEL_SEARCH_REQUEST,
  MEDIA_MODEL_SEARCH_RESPONSE,
  MEDIA_MODEL_FILTER_RESOLUTION,
  // Collection types
  MEDIA_COLLECTION,
  MEDIA_COLLECTION_LIST,
  MEDIA_ADAPTER_SELECTION,
  // Fabric registry lookup wire types
  MEDIA_CAP_URN,
  MEDIA_MEDIA_URN,
  MEDIA_FABRIC_DEFVER,
  MEDIA_CAP_DEFINITION,
  MEDIA_MEDIA_DEFINITION,
  // Standard cap URN constants
  CAP_IDENTITY,
  CAP_ADAPTER_SELECTION,
  CAP_LOOKUP_CAP_FABRIC,
  CAP_LOOKUP_MEDIA_DEF_FABRIC,
  // Cap execution result
  CapResult,
  // Unified argument type
  CapArgumentValue,
  // Standard cap URN builders
  llmGenerateTextUrn,
  renderPageImageUrn,
  formatConversionUrn,
  mediaUrnForType,
  modelAvailabilityUrn,
  modelPathUrn,
  CapFabEdge,
  CapFabStats,
  CapFab,
  StdinSource,
  StdinSourceKind,
  // Cartridge Repository
  CartridgeCapSummary,
  CartridgeInfo,
  CartridgeSuggestion,
  CartridgeRepoCache,
  CartridgeRepoClient,
  CartridgeRepoServer,
  CartridgeChannel,
  // Bifaci — cartridge attachment & runtime identity
  CartridgeLifecycle,
  CartridgeAttachmentErrorKind,
  CartridgeAttachmentError,
  CartridgeRuntimeStats,
  InstalledCartridgeRecord,
  // Host-compatibility resolution
  hostPlatform,
  CompatStatus,
  primaryPackage,
  CartridgeCompatibilityResolution,
  // Build-env registry identity
  registryUrlFromBuildEnv,
  // Cartridge discovery
  slugForSync,
  CartridgeInstallSource,
  RegistryUrlSchemeResultKind,
  validateRegistryUrlScheme,
  CartridgeJsonErrorKind,
  CartridgeJsonError,
  CartridgeJson,
  hashCartridgeDirectory,
  BUNDLED_CARTRIDGE_HASHES,
  verifyBundledCartridgeHash,
  DiscoveryIdentity,
  DiscoveredCartridge,
  probeCartridgeCapGroups,
  discoverCartridges,
  // Registry slug
  DEV_SLUG,
  slugForRegistryUrlSync,
  slugForRegistryUrl,
  isRegistrySlug,
  // Machine notation
  MachineSyntaxError,
  MachineSyntaxErrorCodes,
  MachineEdge,
  Machine,
  MachineBuilder,
  parseMachine,
  parseMachineWithAST,
  // Cap & Media Registry
  FabricRegistryEntry,
  MediaRegistryEntry,
  FabricRegistryClient,
};

// Unified configurable planner vocabulary (mirrors Rust plan_space.rs and the
// PlanMachines/DiscoverConvergentTargets proto surface).
export {
  PlanStateError,
  ConvergencePresence,
  ConvergenceLocation,
  ConvergenceMechanism,
  ConvergenceArity,
  DivergencePresence,
  DivergenceLocation,
  RankPolicy,
  PlanMode,
  PlanRequest,
  parsePlanApex,
  parsePlanProfile,
  parsePlanCost,
  parsePlanCandidate,
  parsePlanCandidates,
  parseConvergentTarget,
  parseConvergentTargets,
} from './planner.js';
