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
   * Whether `cap` fits this cap read as a PATTERN over caps — what a search
   * asks: `cap`'s input is within this pattern's, its output covers the
   * pattern's, its effect is the pattern's (a pattern's `?effect` fits any),
   * and its cap-tags — complete: a cap has the tags it has — satisfy the
   * pattern's.
   *
   * A side the pattern leaves open is not asked about. `cap:candle` fits every
   * cap tagged `candle`, whatever it takes and gives: its open output is "not
   * established", not the type "anything".
   *
   * Decided by the proved model (CapDAG.Exec.accepts, which is CapDAG.fits).
   * For a question no cap URN can spell — "what gives this, whatever it
   * takes" — ask a CapQuery.
   *
   * @param {CapUrn} cap - The cap to test against this pattern
   * @returns {boolean} Whether the cap fits
   */
  accepts(cap) {
    if (!cap) {
      return true;
    }
    return model.accepts(this.formal, cap.formal);
  }

  /**
   * Whether this cap fits `pattern`: `pattern.accepts(this)`.
   *
   * @param {CapUrn} pattern
   * @returns {boolean}
   */
  conformsTo(pattern) {
    return pattern.accepts(this);
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
   * Whether this candidate SERVES `request` — the predicate routing and
   * dispatch act on.
   *
   * The candidate takes at least what the request sends, gives at least what
   * the request needs, has the effect asked for unless the request says
   * `?effect`, and has the cap-tags asked for — its own tags being complete, so
   * a request for `!x` is served by a candidate that does not mention `x`, and
   * a candidate may carry tags the request does not ask about.
   *
   * An input the request leaves open is not established: the caller has not
   * said what it will send, and every candidate passes that side. That is
   * "some input", not "any input" — `media:` on a CANDIDATE's input does mean
   * it takes anything.
   *
   * This is a guarantee. What only could serve does not; see mayDispatch and
   * CapQuery.grade. Decided by the proved model (CapDAG.Exec.dispatch, which is
   * CapDAG.serves). Not symmetric.
   *
   * @param {CapUrn} request
   * @returns {boolean}
   */
  isDispatchable(request) {
    return model.dispatch(this.formal, request.formal);
  }

  /**
   * Whether this candidate COULD serve `request`: not guaranteed, not
   * excluded. For exploring what the fabric might do — never for routing a
   * call, which must be served.
   *
   * @param {CapUrn} request
   * @returns {boolean}
   */
  mayDispatch(request) {
    return model.mayDispatch(this.formal, request.formal);
  }

  /**
   * Whether what this cap gives, `next` takes: the edge of a route.
   *
   * @param {CapUrn} next
   * @returns {boolean}
   */
  flowsInto(next) {
    return model.flows(this.formal, next.formal);
  }

  /**
   * Whether what this cap gives COULD be something `next` takes: an edge a
   * search may explore and a run has to check.
   *
   * @param {CapUrn} next
   * @returns {boolean}
   */
  mayFlowInto(next) {
    return model.mayFlow(this.formal, next.formal);
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

    // A runtime media URN is the media of a value that exists, so it is read
    // complete: it SATISFIES the declared type, or does not.
    if (!runtimeInput.satisfies(declaredIn)) {
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

    if (!runtimeOut.satisfies(declaredOut)) {
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
        return runtimeOutput.satisfies(inferred);
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
 * How a registered cap answers a CapQuery.
 *
 * - EXACT: guaranteed, and exactly what was asked on every side that was asked.
 * - GUARANTEED: whatever the cap takes and gives, it is what was asked.
 * - POSSIBLE: not guaranteed and not excluded — only running it tells. For
 *   exploring; a call is never routed on it.
 * - NONE: excluded.
 */
const MatchGrade = Object.freeze({
  EXACT: 'exact',
  GUARANTEED: 'guaranteed',
  POSSIBLE: 'possible',
  NONE: 'none',
});

/** Whether routing may act on a grade. */
function gradeIsGuaranteed(grade) {
  return grade === MatchGrade.EXACT || grade === MatchGrade.GUARANTEED;
}

/** The cap-tag pattern a query asks for: `cap:` with these tags (none asks for none). */
function queryTagPattern(tags) {
  return modelUrn(new TaggedUrn('cap', { ...(tags || {}) }));
}

/**
 * A question about caps.
 *
 * A request is not a cap. A cap takes this and gives that; a request is a
 * QUESTION about caps, and may leave a side unasked: "what gives me this file,
 * whatever it takes?", "what can this input become?". Those are not cap URNs
 * with `media:` on a side — `media:` is the type "anything", a claim about
 * every input — they are queries with that side unknown.
 *
 * A cap URN read as a request or as a pattern is one (fromRequest, fromPattern)
 * — which is what CapUrn.isDispatchable and CapUrn.accepts ask — and so are the
 * questions no cap URN can spell (producing, consuming, between). Every answer
 * is decided by the proved model (formal/CapDAG/Query.lean).
 */
class CapQuery {
  constructor(formal, asked) {
    Object.defineProperty(this, 'formal', { value: formal, enumerable: false });
    this.asked = asked;
    Object.freeze(this);
  }

  toString() {
    return this.asked;
  }

  /** The cap URN `request`, read as a request: an input it leaves open is not established. */
  static fromRequest(request) {
    return new CapQuery(model.queryOfRequest(request.formal), `request ${request}`);
  }

  /** The cap URN `pattern`, read as a pattern over caps: an output it leaves open is not established. */
  static fromPattern(pattern) {
    return new CapQuery(model.queryOfPattern(pattern.formal), `pattern ${pattern}`);
  }

  /** Caps that GIVE `output`, whatever they take, with the cap-tags `tags` asks for. */
  static producing(output, tags) {
    return new CapQuery(
      model.queryProducing(modelUrn(output._urn), queryTagPattern(tags)),
      `anything giving ${output}`);
  }

  /** Caps that TAKE `input`, whatever they give: what this input can become in one step. */
  static consuming(input, tags) {
    return new CapQuery(
      model.queryConsuming(modelUrn(input._urn), queryTagPattern(tags)),
      `anything taking ${input}`);
  }

  /** Caps that take `input` and give `output`: nothing unknown. */
  static between(input, output, tags) {
    return new CapQuery(
      model.queryBetween(modelUrn(input._urn), modelUrn(output._urn), queryTagPattern(tags)),
      `anything taking ${input} and giving ${output}`);
  }

  /** Whether `cap` is guaranteed to be what is asked. */
  admits(cap) {
    return model.queryAdmits(this.formal, cap.formal);
  }

  /** Whether `cap` could be what is asked. */
  mayAdmit(cap) {
    return model.queryMayAdmit(this.formal, cap.formal);
  }

  /** How `cap` answers: one of MatchGrade. */
  grade(cap) {
    const answer = model.queryGrade(this.formal, cap.formal);
    const grade = { exact: MatchGrade.EXACT, guaranteed: MatchGrade.GUARANTEED, possible: MatchGrade.POSSIBLE, none: MatchGrade.NONE }[answer.kind];
    if (grade === undefined) {
      throw new Error(`capdag: the model answered with a grade this mirror does not know: ${JSON.stringify(answer)}`);
    }
    return grade;
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
 * - `media:document;ext=pdf` → scalar, opaque (no markers)
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
// The mediums. Each is the type every format of that medium conforms to
// (`media:ext=png;image` is a `media:image`), and what an abstract cap over
// per-format caps declares.
// Media URN for an image in any format (png, jpeg, webp, etc.)
const MEDIA_IMAGE = 'media:image';
// Media URN for audio in any format (wav, mp3, flac, raw frames, etc.)
const MEDIA_AUDIO = 'media:audio';
// Media URN for a document in any format (pdf, docx, epub, etc.)
const MEDIA_DOCUMENT = 'media:document';
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
// Media URN for a video in any container (mp4, webm, mov, etc.)
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
const MEDIA_PDF = 'media:document;ext=pdf';
// Media URN for EPUB documents
const MEDIA_EPUB = 'media:document;ext=epub';

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
   * @param {string} str - The media URN string (e.g., "media:document;ext=pdf")
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

  /**
   * Whether this media type and `other` COULD describe the same value: not a
   * guarantee (conformsTo), and not excluded. `media:ext` meets
   * `media:document;ext=pdf`; `media:document;ext=pdf` does not meet `media:ext=png`.
   * @param {MediaUrn} other
   * @returns {boolean}
   */
  meets(other) { return this._urn.meets(other._urn); }

  /**
   * Whether a VALUE whose media this is satisfies the type `pattern`.
   *
   * conformsTo compares two types, and a type that does not mention a key
   * says nothing about it. A value that exists is complete: the tags it does
   * not have, it does not have. Use this where the receiver is the media of
   * actual data — a stream that arrived, an output that was produced.
   * @param {MediaUrn} pattern
   * @returns {boolean}
   */
  satisfies(pattern) { return this._urn.satisfies(pattern._urn); }

  /**
   * Whether a value whose media this is COULD satisfy `pattern`.
   * @param {MediaUrn} pattern
   * @returns {boolean}
   */
  maySatisfy(pattern) { return this._urn.maySatisfy(pattern._urn); }

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
 * // May return ['media:document;ext=pdf']
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
const CAP_ARG_KEYS = Object.freeze(['media_urn', 'name', 'accepts', 'required', 'sources', 'arg_description', 'default_value', 'metadata', 'is_sequence', 'streaming']);
/** The definition's output keys — what every capdag mirror's CapOutput carries. */
const CAP_OUTPUT_KEYS = Object.freeze(['media_urn', 'name', 'output_description', 'optional', 'carries', 'metadata', 'is_sequence', 'streaming']);
/** What an output carries when it carries the main input's type unchanged. */
const OUTPUT_CARRIES_INPUT = 'input';

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
 * A definition without its name is not a definition this capdag reads: the
 * name is how a machine says which arg or output it means.
 */
function requireDefinitionName(json, what) {
  if (typeof json.name !== 'string') {
    throw new Error(`${what} is missing field \`name\``);
  }
}

/**
 * Whether `name` can name an argument or an output (RULE17, RULE19): the
 * lexical form of a notation alias, and none of the words notation reads as
 * constants.
 * @param {string} name
 * @returns {boolean}
 */
function isValidDefinitionName(name) {
  if (typeof name !== 'string') return false;
  if (name === 'true' || name === 'false' || name === 'null') return false;
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name);
}

/**
 * Cap argument definition - media_urn is the unique identifier
 */
class CapArg {
  /**
   * Create a new CapArg
   * @param {string} mediaUrn - The unique media URN for this argument
   * @param {string} name - The label a machine selects this arg by: unique
   *   among the cap's args (RULE17). A label only — the arg is identified by
   *   its media URN, and nothing of the URN can be read from the name.
   * @param {boolean} required - Whether this argument is required
   * @param {Array<ArgSource>} sources - How this argument can be provided
   * @param {Object} options - Optional fields: arg_description, default_value, metadata, accepts
   */
  constructor(mediaUrn, name, required, sources, options = {}) {
    if (typeof name !== 'string') {
      throw new Error(`a cap argument's name is a string, not ${JSON.stringify(name)}`);
    }
    if (typeof required !== 'boolean') {
      throw new Error(`a cap argument's required flag is a boolean, not ${JSON.stringify(required)}`);
    }
    this.media_urn = mediaUrn;
    this.name = name;
    // The media type a value bound to this arg must conform to, when that is
    // not the arg's own URN: two args may then accept one type and stay two
    // args. An arg with a stdin source says what it accepts there, and
    // declares none (RULE18).
    this.accepts = (options.accepts !== undefined && options.accepts !== null) ? options.accepts : null;
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
    requireDefinitionName(json, 'cap argument');
    const sources = (json.sources || []).map(s => ArgSource.fromJSON(s));
    return new CapArg(
      json.media_urn,
      json.name,
      json.required === true,
      sources,
      {
        is_sequence: json.is_sequence,
        streaming: json.streaming,
        arg_description: json.arg_description,
        default_value: json.default_value,
        metadata: json.metadata,
        accepts: json.accepts
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
      name: this.name
    };
    if (this.accepts !== null) result.accepts = this.accepts;
    result.required = this.required;
    result.sources = this.sources.map(s => s.toJSON());
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
   * The label a machine selects this arg by.
   * @returns {string}
   */
  getName() {
    return this.name;
  }

  /**
   * This arg, declaring the type it accepts (see `accepts`). The arg it is
   * made from is not changed.
   * @param {string} accepts - The media URN a value bound to it must conform to
   * @returns {CapArg}
   */
  accepting(accepts) {
    return new CapArg(this.media_urn, this.name, this.required, this.sources, {
      is_sequence: this.is_sequence,
      streaming: this.streaming,
      arg_description: this.arg_description,
      default_value: this.default_value,
      metadata: this.metadata,
      accepts
    });
  }

  /**
   * The media URN a value bound to this arg must conform to: its stdin
   * source's URN when it declares one (the main input), else what it says it
   * accepts, else its own media URN. This is what matching reads. It is not
   * what the stream is delivered under — that is `streamUrn()`, which for an
   * arg with `accepts` is its own URN, so two args accepting one type stay
   * distinct on the wire.
   * @returns {string}
   */
  acceptedUrn() {
    const stdinSource = this.sources.find(s => s.stdin !== null);
    if (stdinSource) return stdinSource.stdin;
    if (this.accepts !== null) return this.accepts;
    return this.media_urn;
  }

  /**
   * Check if this argument has a stdin source: it is then the cap's main
   * input (RULE3, RULE15).
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
 * One output of a cap. A cap declares one per value it produces; exactly one
 * is the main one, whose media URN is the cap URN's `out=` (RULE21).
 */
class CapOutput {
  /**
   * @param {string} mediaUrn - The output's media URN: its identity
   * @param {string} name - The label a machine takes this output by: unique
   *   among the cap's outputs (RULE19). A label only.
   * @param {string} outputDescription - What the output is
   * @param {Object} options - Optional fields: metadata, is_sequence, streaming, optional, carries
   */
  constructor(mediaUrn, name, outputDescription, options = {}) {
    if (typeof name !== 'string') {
      throw new Error(`a cap output's name is a string, not ${JSON.stringify(name)}`);
    }
    this.media_urn = mediaUrn;
    this.name = name;
    this.output_description = (typeof outputDescription === 'string') ? outputDescription : '';
    this.metadata = options.metadata !== undefined ? options.metadata : null;
    this.is_sequence = options.is_sequence === true;
    // MAY be emitted without a length promise (unbounded).
    this.streaming = options.streaming === true;
    // The cap may end without producing this output. What needs it is then
    // skipped.
    this.optional = options.optional === true;
    // What the output carries when that is not its own media URN:
    // OUTPUT_CARRIES_INPUT or null. Only an output other than the main one,
    // of a cap that takes an input, may declare it (RULE22).
    const carries = (options.carries !== undefined && options.carries !== null) ? options.carries : null;
    if (carries !== null && carries !== OUTPUT_CARRIES_INPUT) {
      throw new Error(
        `cap output carries ${JSON.stringify(carries)}: an output carries its own type, or '${OUTPUT_CARRIES_INPUT}'`
      );
    }
    this.carries = carries;
  }

  /**
   * Parse from JSON, refusing unknown keys for the same reason as
   * `CapArg.fromJSON`: an unknown key is a newer fabric.
   * @param {Object} json
   * @returns {CapOutput}
   */
  static fromJSON(json) {
    refuseUnknownDefinitionKeys(json, CAP_OUTPUT_KEYS, 'cap output');
    requireDefinitionName(json, 'cap output');
    return new CapOutput(json.media_urn, json.name, json.output_description, {
      metadata: json.metadata,
      is_sequence: json.is_sequence,
      streaming: json.streaming,
      optional: json.optional,
      carries: json.carries
    });
  }

  toJSON() {
    const result = {
      media_urn: this.media_urn,
      name: this.name,
      output_description: this.output_description,
      optional: this.optional
    };
    if (this.carries !== null) result.carries = this.carries;
    if (this.metadata !== null && this.metadata !== undefined) result.metadata = this.metadata;
    if (this.is_sequence) result.is_sequence = true;
    if (this.streaming) result.streaming = true;
    return result;
  }

  /** The label a machine takes this output by. */
  getName() {
    return this.name;
  }

  _with(changes) {
    return new CapOutput(this.media_urn, this.name, this.output_description, {
      metadata: this.metadata,
      is_sequence: this.is_sequence,
      streaming: this.streaming,
      optional: this.optional,
      carries: this.carries,
      ...changes
    });
  }

  /**
   * This output, declared optional or not. The output it is made from is not
   * changed.
   * @param {boolean} optional
   * @returns {CapOutput}
   */
  asOptional(optional) {
    return this._with({ optional: optional === true });
  }

  /**
   * This output, declared to carry the main input's type unchanged.
   * @returns {CapOutput}
   */
  carryingInput() {
    return this._with({ carries: OUTPUT_CARRIES_INPUT });
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
    // Every output the cap declares (Array of CapOutput). Exactly one is the
    // main one, whose media URN is the cap URN's `out=`; a cap whose `out=`
    // is media:void declares none (RULE21).
    this.outputs = [];
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
   * Whether this capability, as a candidate, can serve the request
   * (CapUrn.isDispatchable).
   * @param {string} request - The request string
   * @returns {boolean} Whether this capability serves the request
   */
  acceptsRequest(request) {
    const requestUrn = CapUrn.fromString(request);
    return this.urn.isDispatchable(requestUrn);
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
   * The argument a machine names (`name = source`).
   * @param {string} name
   * @returns {CapArg|null}
   */
  argNamed(name) {
    return this.args.find(arg => arg.name === name) || null;
  }

  /**
   * Every output the cap declares.
   * @returns {Array<CapOutput>}
   */
  getOutputs() {
    return this.outputs;
  }

  /**
   * The main output: the one whose media URN is the cap URN's `out=`, by
   * tagged-URN equivalence. Null for a cap whose `out=` is media:void, which
   * declares none (RULE21).
   * @returns {CapOutput|null}
   */
  mainOutput() {
    return this.outputByUrn(this.urn.getOutSpec());
  }

  /**
   * The main input argument: the one whose stdin source is equivalent to the
   * cap URN's `in=`. Null for a void-input or argless cap.
   * Mirrors Rust: Cap::main_input_arg
   * @returns {CapArg|null}
   */
  mainInputArg() {
    const inSpec = MediaUrn.fromString(this.urn.getInSpec());
    return this.args.find(arg => arg.isMainInput(inSpec)) || null;
  }

  /**
   * The output a media URN identifies, by tagged-URN equivalence.
   * @param {string} mediaUrn
   * @returns {CapOutput|null}
   */
  outputByUrn(mediaUrn) {
    let wanted;
    try {
      wanted = MediaUrn.fromString(mediaUrn);
    } catch (_) {
      return null;
    }
    for (const output of this.outputs) {
      try {
        if (MediaUrn.fromString(output.media_urn).isEquivalent(wanted)) return output;
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  /**
   * The output a machine names (`name = node`).
   * @param {string} name
   * @returns {CapOutput|null}
   */
  outputNamed(name) {
    return this.outputs.find(output => output.name === name) || null;
  }

  /**
   * Replace the outputs this cap declares.
   * @param {Array<CapOutput>} outputs
   */
  setOutputs(outputs) {
    this.outputs = [...outputs];
  }

  /**
   * Declare one more output.
   * @param {CapOutput} output
   */
  addOutput(output) {
    if (!(output instanceof CapOutput)) {
      throw new Error('an output of a cap is a CapOutput');
    }
    this.outputs.push(output);
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
           JSON.stringify(this.outputs.map(o => o.toJSON())) === JSON.stringify(other.outputs.map(o => o.toJSON())) &&
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
      outputs: this.outputs.map(o => o.toJSON())
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
    if (json.outputs !== undefined && json.outputs !== null) {
      if (!Array.isArray(json.outputs)) {
        throw new Error(`cap '${json.urn}': 'outputs' is a list of outputs`);
      }
      cap.outputs = json.outputs.map(o => CapOutput.fromJSON(o));
    }
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
/**
 * The cap groups of a manifest a cartridge advertised, as it wrote them. The
 * definitions a host is about to route by are held to the definition rules
 * here, not taken on the cartridge's word: a manifest that is no manifest, or
 * that carries a definition breaking a rule, is refused.
 * @param {string|Uint8Array|Buffer} data - The manifest's JSON text or bytes
 * @returns {Array<Object>} The manifest's cap_groups
 * @throws {ManifestLoadError}
 */
function advertisedCapGroups(data) {
  CapManifest.fromAdvertised(data);
  const text = (typeof data === 'string') ? data : new TextDecoder('utf-8', { fatal: true }).decode(data);
  return JSON.parse(text).cap_groups;
}

/**
 * The canonical Identity cap definition: the one every cartridge advertises.
 * @returns {Cap}
 */
function identityCap() {
  const cap = new Cap(
    CapUrn.fromString(CAP_IDENTITY),
    'Identity',
    ['identity'],
    'The categorical identity morphism. Echoes input as output unchanged. Mandatory in every capability set.'
  );
  cap.addArg(new CapArg('media:', 'input', true, [new ArgSource({ stdin: 'media:' })]));
  cap.addOutput(new CapOutput('media:', 'output', 'The input data, unchanged'));
  return cap;
}

/**
 * Why a manifest another program advertised was not taken: its bytes are not
 * a manifest (`unparseable`), or it parsed and a cap definition in it breaks a
 * definition rule.
 */
class ManifestLoadError extends Error {
  constructor(unparseable, reason) {
    super(unparseable ? `not a manifest: ${reason}` : `invalid cap definition: ${reason}`);
    this.name = 'ManifestLoadError';
    this.unparseable = unparseable;
    this.reason = reason;
  }
}

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
   * Hold every definition in the manifest to the definition rules
   * (RULE1-RULE22). Throws naming the cap and the rule.
   */
  validateDefinitions() {
    for (const cap of this.allCaps()) {
      validateCapDefinition(cap);
    }
  }

  /**
   * Validate this manifest: it has CAP_IDENTITY, and every definition in it,
   * in any group, passes the definition rules. Identity alone being present
   * is not enough. Throws naming what is wrong.
   */
  validate() {
    const identity = CapUrn.fromString(CAP_IDENTITY);
    if (!this.allCaps().some(cap => identity.conformsTo(cap.urn))) {
      throw new Error(`Manifest missing required CAP_IDENTITY (${CAP_IDENTITY})`);
    }
    this.validateDefinitions();
  }

  /**
   * Take a manifest another program advertised: parse it and hold every
   * definition in it to the definition rules, in one step. The two refusals
   * are told apart (`ManifestLoadError.unparseable`): bytes that are no
   * manifest, and a manifest with a definition that breaks a rule.
   * @param {string|Uint8Array|Buffer} data - The manifest's JSON text or bytes
   * @returns {CapManifest}
   * @throws {ManifestLoadError}
   */
  static fromAdvertised(data) {
    let manifest;
    try {
      const text = (typeof data === 'string') ? data : new TextDecoder('utf-8', { fatal: true }).decode(data);
      manifest = CapManifest.fromJSON(JSON.parse(text));
    } catch (error) {
      throw new ManifestLoadError(true, error.message);
    }
    try {
      manifest.validateDefinitions();
    } catch (error) {
      throw new ManifestLoadError(false, error.message);
    }
    return manifest;
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
    if (json === null || typeof json !== 'object' || Array.isArray(json)) throw new Error('CapManifest must be a JSON object');
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
 * Hold a whole definition to the definition rules (RULE1-RULE22): its
 * arguments, then its outputs. A definition is held to them wherever it
 * crosses from one program to another.
 * @param {Cap} cap - The capability to validate
 * @throws {ValidationError} If any rule is broken
 */
function validateCapDefinition(cap) {
  validateCapArgs(cap);
  validateCapOutputs(cap);
}

/**
 * Enforce the rules on a cap's outputs.
 *
 * - RULE19: Output names: required, well-formed, unique
 * - RULE20: No duplicate output media_urns
 * - RULE21: Exactly one main output, matching out= (none when out= is media:void)
 * - RULE22: What an output carries
 * @param {Cap} cap - The capability to validate
 * @throws {ValidationError} If any rule is broken
 */
function validateCapOutputs(cap) {
  const capUrn = cap.urnString();
  const refuse = issue => new ValidationError('InvalidCapSchema', capUrn, { issue });

  const voidMedia = MediaUrn.fromString(MEDIA_VOID);
  let outMedia;
  try {
    outMedia = MediaUrn.fromString(cap.urn.getOutSpec());
  } catch (e) {
    throw refuse(`RULE21: Failed to parse out= spec: ${e.message}`);
  }
  let inMedia;
  try {
    inMedia = MediaUrn.fromString(cap.urn.getInSpec());
  } catch (e) {
    throw refuse(`RULE22: Failed to parse in= spec: ${e.message}`);
  }
  const outIsVoid = outMedia.isEquivalent(voidMedia);
  const inIsVoid = inMedia.isEquivalent(voidMedia);
  const outputs = cap.getOutputs();

  // RULE19: names
  const named = [];
  for (const output of outputs) {
    if (!output.name) {
      throw refuse(`RULE19: Output '${output.media_urn}' has no name`);
    }
    if (!isValidDefinitionName(output.name)) {
      throw refuse(`RULE19: Output name '${output.name}' is not a valid name`);
    }
    const seen = named.find(other => other.name === output.name);
    if (seen) {
      throw refuse(
        `RULE19: Outputs '${seen.media_urn}' and '${output.media_urn}' share the name '${output.name}'`
      );
    }
    named.push(output);
  }

  // RULE20: identities, compared as media URNs (tag order is not identity)
  const identities = [];
  for (const output of outputs) {
    let outputUrn;
    try {
      outputUrn = MediaUrn.fromString(output.media_urn);
    } catch (e) {
      throw refuse(`RULE20: Output media_urn '${output.media_urn}' is not a media URN: ${e.message}`);
    }
    if (identities.some(seen => seen.isEquivalent(outputUrn))) {
      throw refuse(`RULE20: Duplicate output media_urn '${output.media_urn}'`);
    }
    identities.push(outputUrn);
  }

  // RULE21: the main output
  if (outIsVoid) {
    if (outputs.length > 0) {
      throw refuse(`RULE21: out= is 'media:void' but ${outputs.length} output(s) are declared`);
    }
    return;
  }
  const main = [];
  identities.forEach((identity, index) => {
    if (identity.isEquivalent(outMedia)) main.push(index);
  });
  if (main.length !== 1) {
    throw refuse(
      `RULE21: out= is '${cap.urn.getOutSpec()}' but ${main.length} outputs are equivalent to it; exactly one must be`
    );
  }

  // RULE22: what an output carries
  outputs.forEach((output, index) => {
    if (output.carries === null) return;
    if (index === main[0]) {
      throw refuse(`RULE22: The main output '${output.media_urn}' declares carries`);
    }
    if (inIsVoid) {
      throw refuse(`RULE22: Output '${output.media_urn}' carries the input but the cap takes none`);
    }
  });
}

/**
 * Enforce structural rules on a cap's argument definitions. Every rule is
 * raised under the number the reference raises it under: a number names one
 * rule.
 *
 * - RULE1: No duplicate media_urns
 * - RULE2: sources must not be empty
 * - RULE3: At most one arg declares a stdin source
 * - RULE4: No arg may specify same source type more than once
 * - RULE5: No two args may have same position
 * - RULE6: Positions must be sequential (0-based, no gaps)
 * - RULE7: No arg may have both position and cli_flag
 * - RULE9: No two args may have same cli_flag
 * - RULE10: Reserved cli_flags cannot be used
 * - RULE14: Only the main input argument may declare streaming=true
 * - RULE15: The main input matches in= (void input declares no stdin; any
 *   other declares one, equivalent to in=)
 * - RULE17: Argument names: required, well-formed, unique
 * - RULE18: `accepts` only without a stdin source
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

  // RULE3: At most one arg declares a stdin source. `stdin` is a command
  // line's one piped input, and the arg that declares it is the main input.
  const stdinArgs = args.filter(arg => arg.hasStdinSource()).map(arg => arg.media_urn);
  if (stdinArgs.length > 1) {
    throw new ValidationError('InvalidCapSchema', capUrn, {
      issue: `RULE3: Arguments '${stdinArgs[0]}' and '${stdinArgs[1]}' both declare a stdin source; a cap has one main input`
    });
  }

  // RULE17: names
  const named = [];
  for (const arg of args) {
    if (!arg.name) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `RULE17: Argument '${arg.media_urn}' has no name`
      });
    }
    if (!isValidDefinitionName(arg.name)) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `RULE17: Argument name '${arg.name}' is not a valid name`
      });
    }
    const seen = named.find(other => other.name === arg.name);
    if (seen) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `RULE17: Arguments '${seen.media_urn}' and '${arg.media_urn}' share the name '${arg.name}'`
      });
    }
    named.push(arg);
  }

  // RULE18: an arg says what it accepts in one place.
  for (const arg of args) {
    if (arg.accepts !== null && arg.hasStdinSource()) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `RULE18: Argument '${arg.media_urn}' declares both a stdin source and accepts`
      });
    }
  }

  // RULE15: The main input matches in=. If in= is media:void, no arg may
  // have a stdin source (the cap takes no data-flow input). Otherwise exactly
  // one does (RULE3 caps it at one), and its URN is in= — compared as tagged
  // URNs, never as strings.
  let inMediaUrn;
  try {
    inMediaUrn = cap.urn.inMediaUrn();
  } catch (e) {
    throw new ValidationError('InvalidCapSchema', capUrn, {
      issue: `RULE15: Failed to parse in= spec: ${e.message}`
    });
  }
  const voidUrn = MediaUrn.fromString(MEDIA_VOID);
  const inIsVoid = inMediaUrn.isEquivalent(voidUrn);
  if (inIsVoid && stdinUrns.length > 0) {
    throw new ValidationError('InvalidCapSchema', capUrn, {
      issue: `RULE15: in= is 'media:void' but ${stdinUrns.length} arg(s) declare a stdin source`
    });
  }
  if (!inIsVoid) {
    const isIn = stdin => {
      try {
        return MediaUrn.fromString(stdin).isEquivalent(inMediaUrn);
      } catch (_) {
        return false;
      }
    };
    if (!stdinUrns.some(isIn)) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: `RULE15: in= is '${cap.urn.getInSpec()}' but no arg declares a stdin source equivalent to it`
      });
    }
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
    const outputDef = cap.mainOutput();

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

    const mediaUrn = outputDef.media_urn;

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
    if (!Array.isArray(cap.outputs) || cap.outputs.some(output => !(output instanceof CapOutput))) {
      throw new ValidationError('InvalidCapSchema', capUrn, {
        issue: 'Cap outputs must be a list of outputs'
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
   * Get every cartridge with a cap that can SERVE the requested URN.
   *
   * The request URN is parsed via CapUrn.fromString; each declared
   * cartridge cap is parsed too and asked `isDispatchable` — "can this
   * declared candidate serve the request?" (it takes at least what is
   * sent, gives at least what is needed, has the tags asked for; a side the
   * request leaves open is not asked about). This is deliberately looser
   * than the equivalence used to resolve an alias to its exact cap: here
   * everything capable is enumerated. A malformed input URN throws; a
   * malformed declared URN in the registry also throws (registry corruption
   * is not a fallback condition).
   */
  getCartridgesByCap(capUrn) {
    const requested = CapUrn.fromString(capUrn);
    const cartridges = this.transformToCartridgeArray();
    return cartridges.filter(p =>
      (p.cap_groups || []).some(g =>
        (g.caps || []).some(c => {
          const declared = CapUrn.fromString(c.urn);
          return declared.isDispatchable(requested);
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
// Protocol 5: a cap may answer with one stream per declared output, each
// stream other than the main output's naming the output it is.
const BIFACI_PROTOCOL_VERSION = 5;
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
      let capGroups;
      try {
        capGroups = advertisedCapGroups(Buffer.from(manifestVal.__bytes));
      } catch (e) {
        finish(new Error(`cartridge ${entryPath} invalid manifest: ${e.message}`));
        return;
      }
      finish(null, capGroups);
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
// Constants of machine notation.
//
// A constant is a JSON value. Here it is one of
//
//     null, boolean, string, bigint, number, Array, plain object
//
// A number written without a fraction or an exponent is a whole number (a
// `bigint`) while it fits sixty-four bits, signed or unsigned; any other
// number is a float (a `number`). `1` and `1.0` are therefore two different
// constants, as they are in the reference, whose JSON value keeps whole
// numbers and floats apart. JavaScript's own JSON reader cannot say so — it
// reads both as the same number — which is why constants have a reader of
// their own.
// ============================================================================

const WHOLE_MIN = -(2n ** 63n);
const WHOLE_MAX = 2n ** 64n - 1n;

/** Half of a surrogate pair without its other half. */
const HALF_CHARACTER = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function floatOf(text) {
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new Error(`${JSON.stringify(text)} is not a number a constant can hold`);
  }
  return value;
}

function wholeOf(text) {
  const value = BigInt(text);
  if (value === 0n && text.startsWith('-')) {
    // A whole number has no sign to keep at zero: `-0` is the float, as the
    // reference reads it.
    return -0;
  }
  if (value >= WHOLE_MIN && value <= WHOLE_MAX) return value;
  // Beyond sixty-four bits a number is the nearest float.
  return floatOf(text);
}

/**
 * Read one JSON value from its text. Throws on text that is not one JSON
 * value, on a number no float holds, and on a string with an escape for half
 * of a surrogate pair.
 * @param {string} text
 * @returns {null|boolean|string|bigint|number|Array|Object}
 */
function decodeConstant(text) {
  if (typeof text !== 'string') {
    throw new Error('a constant is read from its text');
  }
  let at = 0;
  const fail = what => new Error(`${text} is not a JSON value: ${what} at ${at}`);
  const skip = () => {
    while (at < text.length && ' \t\r\n'.includes(text[at])) at += 1;
  };
  const string = () => {
    const start = at;
    at += 1;
    while (true) {
      if (at >= text.length) throw fail('an unterminated string');
      const c = text[at];
      if (c === '"') break;
      if (c < ' ') throw fail('a control character in a string');
      at += c === '\\' ? 2 : 1;
    }
    at += 1;
    let value;
    try {
      value = JSON.parse(text.slice(start, at));
    } catch (e) {
      throw fail(e.message);
    }
    const half = HALF_CHARACTER.exec(value);
    if (half !== null) {
      throw new Error(
        `the escape \\u${half[0].charCodeAt(0).toString(16).padStart(4, '0')} names half a character`
      );
    }
    return value;
  };
  const value = () => {
    skip();
    if (at >= text.length) throw fail('the end of the text');
    const c = text[at];
    if (c === '"') return string();
    if (c === '{') {
      at += 1;
      const object = {};
      skip();
      if (text[at] === '}') { at += 1; return object; }
      while (true) {
        skip();
        if (text[at] !== '"') throw fail('an object key that is not a string');
        const key = string();
        skip();
        if (text[at] !== ':') throw fail('a key without its value');
        at += 1;
        // Defined as an own property whatever the key says (`__proto__` is a
        // key like any other).
        Object.defineProperty(object, key, { value: value(), enumerable: true, writable: true, configurable: true });
        skip();
        if (text[at] === ',') { at += 1; continue; }
        if (text[at] === '}') { at += 1; return object; }
        throw fail('an object that does not end');
      }
    }
    if (c === '[') {
      at += 1;
      const items = [];
      skip();
      if (text[at] === ']') { at += 1; return items; }
      while (true) {
        items.push(value());
        skip();
        if (text[at] === ',') { at += 1; continue; }
        if (text[at] === ']') { at += 1; return items; }
        throw fail('an array that does not end');
      }
    }
    for (const [word, read] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(word, at)) { at += word.length; return read; }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(at));
    if (number === null) throw fail('what is no value');
    at += number[0].length;
    return /[.eE]/.test(number[0]) ? floatOf(number[0]) : wholeOf(number[0]);
  };
  const read = value();
  skip();
  if (at !== text.length) throw fail('more than one value');
  return read;
}

/**
 * Whether a value is a JSON object as a constant holds one: a plain object,
 * not an array and not an instance of anything else (a Date, a Map).
 */
function isConstantObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Compare two constants as JSON values: a whole number and a float are never
 * equal, nor a boolean and a number; an object's keys carry no order.
 * @returns {boolean}
 */
function constantsEqual(a, b) {
  if (a === null || b === null) return a === null && b === null;
  if (typeof a !== typeof b) return false;
  // Floats compare as floats: -0.0 and 0.0 are one value.
  if (typeof a === 'number') return a === b;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((item, index) => constantsEqual(item, b[index]));
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length &&
    keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && constantsEqual(a[key], b[key]));
}

/** Order two strings by their code points: the order of their UTF-8 bytes. */
function compareCodePoints(a, b) {
  const left = Array.from(a);
  const right = Array.from(b);
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i += 1) {
    const difference = left[i].codePointAt(0) - right[i].codePointAt(0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

const STRING_ESCAPES = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/**
 * A JSON string with exactly the escapes the reference writes: the quote, the
 * backslash and the control characters. Everything else — `<`, `&`, any
 * character outside ASCII — is written as it is.
 */
function stringText(text) {
  let out = '"';
  for (const char of text) {
    const escaped = STRING_ESCAPES[char];
    if (escaped !== undefined) out += escaped;
    else if (char < ' ') out += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
    else out += char;
  }
  return out + '"';
}

/**
 * Write a float as the shortest decimal that reads back as the same float,
 * laid out as the reference lays it out: plain digits with a decimal point
 * while the number has at most sixteen digits before the point and fewer
 * than five zeros after it, an exponent (with its sign, `e+16` and `e-7`)
 * otherwise. A float that is a whole number keeps its `.0`, so it reads back
 * as a float.
 * @param {number} value
 * @returns {string}
 */
function floatText(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${value} is not a number a constant can hold`);
  }
  if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';
  const sign = value < 0 ? '-' : '';
  // `toExponential()` with no digit count is the shortest text that reads
  // back as this float: `d.ddd…e±x`.
  const [mantissa, exponent] = Math.abs(value).toExponential().split('e');
  const digits = mantissa.replace('.', '').replace(/0+$/, '');
  const count = digits.length;
  // The value is 0.DIGITS × 10^point.
  const point = Number(exponent) + 1;
  if (count <= point && point <= 16) return sign + digits + '0'.repeat(point - count) + '.0';
  if (point > 0 && point <= 16) return sign + digits.slice(0, point) + '.' + digits.slice(point);
  if (point > -5 && point <= 0) return sign + '0.' + '0'.repeat(-point) + digits;
  // An exponent carries its sign, `+` included.
  const power = (point > 0 ? '+' : '') + String(point - 1);
  if (count === 1) return sign + digits + 'e' + power;
  return sign + digits.slice(0, 1) + '.' + digits.slice(1) + 'e' + power;
}

/**
 * Write a constant as notation writes it: compact JSON, an object's keys in
 * order, numbers and strings spelled as the reference spells them. The same
 * value has one text in every implementation, so canonical notation is the
 * same text everywhere.
 * @returns {string}
 */
function constantText(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return stringText(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return floatText(value);
  if (Array.isArray(value)) return '[' + value.map(constantText).join(',') + ']';
  if (isConstantObject(value)) {
    return '{' + Object.keys(value).sort(compareCodePoints)
      .map(key => stringText(key) + ':' + constantText(value[key])).join(',') + '}';
  }
  throw new TypeError(`${Object.prototype.toString.call(value)} is not a constant of machine notation`);
}

/**
 * A constant as plain JSON: what a host is handed in a render payload or
 * sends as an argument's value. A whole number is a JSON number where a
 * double holds it exactly, and a float otherwise is the float it is.
 * @returns {*} A value `JSON.stringify` writes
 */
function constantToJSON(value) {
  if (typeof value === 'bigint') {
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
    throw new Error(`the whole number ${value} is beyond what a JSON number of this runtime holds exactly`);
  }
  if (Array.isArray(value)) return value.map(constantToJSON);
  if (isConstantObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(out, key, { value: constantToJSON(value[key]), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  return value;
}

// ============================================================================
// Errors of machine notation.
//
// Notation is read in two phases, each with its own error family: what the
// text alone decides (`MachineSyntaxError`), and what takes the cap
// definitions to decide (`MachineAbstractionError`). `parseMachine` throws one
// or the other.
// ============================================================================

/**
 * What the text alone decides.
 */
class MachineSyntaxError extends Error {
  /**
   * @param {string} code - Error code from MachineSyntaxErrorCodes
   * @param {string} message - Human-readable error message
   * @param {Object|null} [location] - Source location { start: {offset,line,column}, end: {offset,line,column} }
   * @param {Object} [fields] - What the error is about, by name
   */
  constructor(code, message, location, fields = {}) {
    super(message);
    this.name = 'MachineSyntaxError';
    this.code = code;
    this.location = location || null;
    Object.assign(this, fields);
  }
}

const MachineSyntaxErrorCodes = Object.freeze({
  EMPTY: 'Empty',
  INVALID_CAP_URN: 'InvalidCapUrn',
  UNDEFINED_ALIAS: 'UndefinedAlias',
  ALIAS_NOT_A_CAP: 'AliasNotACap',
  DUPLICATE_ALIAS: 'DuplicateAlias',
  INVALID_MEDIA_URN: 'InvalidMediaUrn',
  NO_EDGES: 'NoEdges',
  NODE_ALIAS_COLLISION: 'NodeAliasCollision',
  PARSE_ERROR: 'ParseError',
  MACHINE_REFERENCE_WITHOUT_SOURCE: 'MachineReferenceWithoutSource',
  UNNAMED_CONSTANT: 'UnnamedConstant',
  RESERVED_NODE_NAME: 'ReservedNodeName',
  SEVERAL_UNNAMED_TARGETS: 'SeveralUnnamedTargets',
  INVALID_POLICY: 'InvalidPolicy',
});

const syntaxError = Object.freeze({
  empty: () => new MachineSyntaxError(MachineSyntaxErrorCodes.EMPTY, 'machine notation is empty'),
  invalidCapUrn: (alias, details, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.INVALID_CAP_URN,
    `invalid cap URN in header '${alias}': ${details}`, location, { alias, details }),
  undefinedAlias: (alias, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.UNDEFINED_ALIAS,
    `wiring references undefined alias '${alias}' (not a local header and not a registered cap alias)`,
    location, { alias }),
  aliasNotACap: (alias, target, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.ALIAS_NOT_A_CAP,
    `alias '${alias}' in cap position resolves to a media URN ('${target}'), but a cap is required there`,
    location, { alias, target }),
  duplicateAlias: (alias, firstPosition, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.DUPLICATE_ALIAS,
    `duplicate alias '${alias}' (first defined at statement ${firstPosition})`,
    location, { alias, firstPosition }),
  invalidMediaUrn: (alias, details, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.INVALID_MEDIA_URN,
    `invalid media URN in cap '${alias}': ${details}`, location, { alias, details }),
  noEdges: location => new MachineSyntaxError(
    MachineSyntaxErrorCodes.NO_EDGES,
    'machine has headers but no wirings — define at least one edge', location),
  nodeAliasCollision: (name, alias, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.NODE_ALIAS_COLLISION,
    `node name '${name}' collides with cap alias '${alias}'`, location, { nodeName: name, alias }),
  parse: (details, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.PARSE_ERROR, `parse error: ${details}`, location, { details }),
  machineReferenceWithoutSource: (alias, reference, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.MACHINE_REFERENCE_WITHOUT_SOURCE,
    `machine header '${alias}' refers to "${reference}", and no machine source was given to resolve it`,
    location, { alias, reference }),
  unnamedConstant: (constant, position, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.UNNAMED_CONSTANT,
    `constant ${constant} in statement ${position} names no arg — write it as name=${constant}`,
    location, { constant, position }),
  reservedNodeName: (name, position, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.RESERVED_NODE_NAME,
    `'${name}' in statement ${position} is a constant, not a node name`,
    location, { nodeName: name, position }),
  severalUnnamedTargets: (position, targets, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.SEVERAL_UNNAMED_TARGETS,
    `statement ${position} has several unnamed targets (${targets.join(', ')}) — only the main output is taken without a name`,
    location, { position, targets: [...targets] }),
  invalidPolicy: (step, position, details, location) => new MachineSyntaxError(
    MachineSyntaxErrorCodes.INVALID_POLICY,
    `invalid policy on step '${step}' in statement ${position}: ${details}`,
    location, { step, position, details }),
});

/**
 * What takes the cap definitions to decide.
 */
class MachineAbstractionError extends Error {
  /**
   * @param {string} code - Error code from MachineAbstractionErrorCodes
   * @param {string} message - Human-readable error message
   * @param {Object} [fields] - What the error is about, by name
   */
  constructor(code, message, fields = {}) {
    super(message);
    this.name = 'MachineAbstractionError';
    this.code = code;
    Object.assign(this, fields);
  }
}

const MachineAbstractionErrorCodes = Object.freeze({
  NO_CAPABILITY_STEPS: 'NoCapabilitySteps',
  UNKNOWN_CAP: 'UnknownCap',
  UNMATCHED_SOURCE_IN_CAP_ARGS: 'UnmatchedSourceInCapArgs',
  AMBIGUOUS_MACHINE_NOTATION: 'AmbiguousMachineNotation',
  CYCLIC_MACHINE_STRAND: 'CyclicMachineStrand',
  CAP_DOES_NOT_DECLARE_INPUT: 'CapDoesNotDeclareInput',
  UNKNOWN_ARG_NAME: 'UnknownArgName',
  UNKNOWN_OUTPUT_NAME: 'UnknownOutputName',
  SOURCE_DOES_NOT_CONFORM_TO_ARG: 'SourceDoesNotConformToArg',
  CONSTANT_FAILS_VALIDATION: 'ConstantFailsValidation',
  ARG_BOUND_TWICE: 'ArgBoundTwice',
  MAIN_INPUT_UNBOUND: 'MainInputUnbound',
  OUTPUT_TAKEN_TWICE: 'OutputTakenTwice',
  NO_MAIN_OUTPUT: 'NoMainOutput',
  UNTYPED_MACHINE_INPUT: 'UntypedMachineInput',
  UNKNOWN_MACHINE_REFERENCE: 'UnknownMachineReference',
  CYCLIC_MACHINE_REFERENCE: 'CyclicMachineReference',
  INVALID_INCLUDED_MACHINE: 'InvalidIncludedMachine',
  POLICY_ON_MACHINE: 'PolicyOnMachine',
  UNKNOWN_MACHINE_INPUT: 'UnknownMachineInput',
  UNKNOWN_MACHINE_OUTPUT: 'UnknownMachineOutput',
  MACHINE_INPUT_BINDING: 'MachineInputBinding',
  MACHINE_OUTPUT_TAKEN_TWICE: 'MachineOutputTakenTwice',
  UNNAMED_MACHINE_TARGET: 'UnnamedMachineTarget',
  UNTYPED_MACHINE_MEMBER: 'UntypedMachineMember',
  UNMATCHED_MACHINE_MEMBER: 'UnmatchedMachineMember',
  AMBIGUOUS_MACHINE_MEMBERS: 'AmbiguousMachineMembers',
  SOURCE_DOES_NOT_CONFORM_TO_MACHINE_INPUT: 'SourceDoesNotConformToMachineInput',
  NODE_MEDIA_CONFLICT: 'NodeMediaConflict',
  UNCACHED_MEDIA_DEF: 'UncachedMediaDef',
  UNCACHED_CAP: 'UncachedCap',
});

/**
 * A member of a wiring whose arg the types alone do not decide.
 */
class UndecidedMember {
  /**
   * @param {string} node - The node, as the notation named it. Empty where no
   *   notation is at hand: the member is then known by its type alone.
   * @param {string} sourceUrn - The media URN the member holds.
   * @param {string[]} couldBe - The args — or, for a machine in step position,
   *   the inputs — it could go to, by name, in the order the definition
   *   declares them.
   */
  constructor(node, sourceUrn, couldBe) {
    this.node = node;
    this.sourceUrn = sourceUrn;
    this.couldBe = [...couldBe];
  }

  toString() {
    const who = this.node
      ? `'${this.node}' (${this.sourceUrn})`
      : `a member of type '${this.sourceUrn}'`;
    return `${who} could be ${this.couldBe.join(' or ')}`;
  }
}

const undecidedList = members => members.map(member => member.toString()).join('; ');
const inStrand = (code, strandIndex, message, fields) => new MachineAbstractionError(
  code, `strand ${strandIndex}: ${message}`, { strandIndex, ...fields });
const atStatement = (code, position, message, fields) => new MachineAbstractionError(
  code, `statement ${position}: ${message}`, { position, ...fields });
const AE = MachineAbstractionErrorCodes;

const abstractionError = Object.freeze({
  noCapabilitySteps: () => new MachineAbstractionError(
    AE.NO_CAPABILITY_STEPS, 'strand or wiring set contains no capability steps'),
  unknownCap: capUrn => new MachineAbstractionError(
    AE.UNKNOWN_CAP, `cap URN '${capUrn}' is not in the cap registry cache`, { capUrn }),
  unmatchedSourceInCapArgs: (strandIndex, capUrn, sourceUrn) => new MachineAbstractionError(
    AE.UNMATCHED_SOURCE_IN_CAP_ARGS,
    `in strand ${strandIndex}, cap '${capUrn}': source URN '${sourceUrn}' does not conform to any of the cap's input arguments`,
    { strandIndex, capUrn, sourceUrn }),
  ambiguousMachineNotation: (strandIndex, capUrn, members) => new MachineAbstractionError(
    AE.AMBIGUOUS_MACHINE_NOTATION,
    `in strand ${strandIndex}, cap '${capUrn}': the types do not say which arg these members are for — name them: ${undecidedList(members)}`,
    { strandIndex, capUrn, members: [...members] }),
  cyclicMachineStrand: strandIndex => new MachineAbstractionError(
    AE.CYCLIC_MACHINE_STRAND, `strand ${strandIndex}: resolved data-flow graph contains a cycle`, { strandIndex }),
  capDoesNotDeclareInput: (strandIndex, capUrn) => new MachineAbstractionError(
    AE.CAP_DOES_NOT_DECLARE_INPUT,
    `strand ${strandIndex}: cap '${capUrn}' does not declare its input (no argument declares a stdin source whose URN is its in=)`,
    { strandIndex, capUrn }),
  unknownArgName: (strandIndex, capUrn, name, declared) => inStrand(
    AE.UNKNOWN_ARG_NAME, strandIndex,
    `cap '${capUrn}' declares no arg named '${name}' (it declares: ${declared.join(', ')})`,
    { capUrn, argName: name, declared: [...declared] }),
  unknownOutputName: (strandIndex, capUrn, name, declared) => inStrand(
    AE.UNKNOWN_OUTPUT_NAME, strandIndex,
    `cap '${capUrn}' declares no output named '${name}' (it declares: ${declared.join(', ')})`,
    { capUrn, outputName: name, declared: [...declared] }),
  sourceDoesNotConformToArg: (strandIndex, capUrn, name, accepts, sourceUrn) => inStrand(
    AE.SOURCE_DOES_NOT_CONFORM_TO_ARG, strandIndex,
    `cap '${capUrn}' arg '${name}' accepts '${accepts}', and its source is '${sourceUrn}'`,
    { capUrn, argName: name, accepts, sourceUrn }),
  constantFailsValidation: (strandIndex, capUrn, name, constant, reason) => inStrand(
    AE.CONSTANT_FAILS_VALIDATION, strandIndex,
    `cap '${capUrn}' arg '${name}' refuses the constant ${constant}: ${reason}`,
    { capUrn, argName: name, constant, reason }),
  argBoundTwice: (strandIndex, capUrn, name, count) => inStrand(
    AE.ARG_BOUND_TWICE, strandIndex,
    `cap '${capUrn}' arg '${name}' takes one value and is named by ${count} members`,
    { capUrn, argName: name, count }),
  mainInputUnbound: (strandIndex, capUrn, mainInput) => inStrand(
    AE.MAIN_INPUT_UNBOUND, strandIndex,
    `cap '${capUrn}' takes an input ('${mainInput}') and no member of the wiring is bound to it`,
    { capUrn, mainInput }),
  outputTakenTwice: (strandIndex, capUrn, output) => inStrand(
    AE.OUTPUT_TAKEN_TWICE, strandIndex,
    `cap '${capUrn}' output '${output}' is taken twice in one wiring`, { capUrn, output }),
  noMainOutput: (strandIndex, capUrn) => inStrand(
    AE.NO_MAIN_OUTPUT, strandIndex,
    `cap '${capUrn}' has no main output to take (its out= is media:void)`, { capUrn }),
  untypedMachineInput: (position, capUrn, members) => atStatement(
    AE.UNTYPED_MACHINE_INPUT, position,
    `cap '${capUrn}' is given unnamed machine inputs whose arg nothing decides (${members.join(', ')}) — name them`,
    { capUrn, members: [...members] }),
  unknownMachineReference: (alias, reference, details) => new MachineAbstractionError(
    AE.UNKNOWN_MACHINE_REFERENCE,
    `machine header '${alias}' refers to "${reference}", which does not resolve: ${details}`,
    { alias, reference, details }),
  cyclicMachineReference: chain => new MachineAbstractionError(
    AE.CYCLIC_MACHINE_REFERENCE, `a machine includes itself: ${chain.join(' -> ')}`, { chain: [...chain] }),
  invalidIncludedMachine: (alias, reference, cause) => new MachineAbstractionError(
    AE.INVALID_INCLUDED_MACHINE,
    `machine '${alias}' ("${reference}") is not a valid machine: ${cause.message}`,
    { alias, reference, cause }),
  policyOnMachine: (position, alias) => atStatement(
    AE.POLICY_ON_MACHINE, position,
    `'${alias}' is a machine, and a policy is written on it — write it on the steps inside`, { alias }),
  unknownMachineInput: (position, alias, name, declared) => atStatement(
    AE.UNKNOWN_MACHINE_INPUT, position,
    `machine '${alias}' has no input named '${name}' (its inputs: ${declared.join(', ')})`,
    { alias, inputName: name, declared: [...declared] }),
  unknownMachineOutput: (position, alias, name, declared) => atStatement(
    AE.UNKNOWN_MACHINE_OUTPUT, position,
    `machine '${alias}' has no output named '${name}' (its outputs: ${declared.join(', ')})`,
    { alias, outputName: name, declared: [...declared] }),
  machineInputBinding: (position, alias, inputName, count) => atStatement(
    AE.MACHINE_INPUT_BINDING, position,
    `input '${inputName}' of machine '${alias}' is given ${count} members — every input of a machine takes exactly one`,
    { alias, inputName, count }),
  machineOutputTakenTwice: (position, alias, output) => atStatement(
    AE.MACHINE_OUTPUT_TAKEN_TWICE, position,
    `output '${output}' of machine '${alias}' is taken twice in one wiring`, { alias, output }),
  unnamedMachineTarget: (position, alias, left) => atStatement(
    AE.UNNAMED_MACHINE_TARGET, position,
    `an unnamed target of machine '${alias}' has ${left.length} output(s) left to take (${left.join(', ')}) — name it`,
    { alias, left: [...left] }),
  untypedMachineMember: (position, alias, members) => atStatement(
    AE.UNTYPED_MACHINE_MEMBER, position,
    `machine '${alias}' is given unnamed members that have no type to be matched by (${members.join(', ')}) — name them`,
    { alias, members: [...members] }),
  unmatchedMachineMember: (position, alias, sourceUrn) => atStatement(
    AE.UNMATCHED_MACHINE_MEMBER, position,
    `a member of type '${sourceUrn}' fits no input left of machine '${alias}'`, { alias, sourceUrn }),
  ambiguousMachineMembers: (position, alias, members) => atStatement(
    AE.AMBIGUOUS_MACHINE_MEMBERS, position,
    `the types do not say which input of machine '${alias}' these members are for — name them: ${undecidedList(members)}`,
    { alias, members: [...members] }),
  sourceDoesNotConformToMachineInput: (position, alias, name, accepts, sourceUrn) => atStatement(
    AE.SOURCE_DOES_NOT_CONFORM_TO_MACHINE_INPUT, position,
    `input '${name}' of machine '${alias}' holds '${accepts}', and its source is '${sourceUrn}'`,
    { alias, inputName: name, accepts, sourceUrn }),
  uncachedMediaDef: mediaUrn => new MachineAbstractionError(
    AE.UNCACHED_MEDIA_DEF,
    `media URN '${mediaUrn}' has no cached spec — cannot emit a display title for render payload`, { mediaUrn }),
  uncachedCap: capUrn => new MachineAbstractionError(
    AE.UNCACHED_CAP,
    `cap URN '${capUrn}' has no cached definition — cannot emit a display title for render payload`, { capUrn }),
  nodeMediaConflict: (node, first, second) => new MachineAbstractionError(
    AE.NODE_MEDIA_CONFLICT,
    `node '${node}' is given media URNs that are not on one specialization chain: '${first}' and '${second}'`,
    { node, first, second }),
});

// ============================================================================
// The syntax of machine notation: one walk of the parse tree into statements
// whose every part knows where it stands in the text.
//
// Nothing here knows a cap definition: a name is a name, a node is a node, and
// whether either exists is the resolver's question. What IS decided here is
// everything the text alone decides (capdag/docs/09-machine-notation.md
// §Statement kinds):
//
// - a constant is always named (UnnamedConstant);
// - `true`, `false` and `null` are constants, never node names
//   (ReservedNodeName);
// - at most one target of a wiring is unnamed (SeveralUnnamedTargets);
// - a step policy holds known keys, once each, with values from the table
//   (InvalidPolicy).
// ============================================================================

const SYNTAX_CAP_HEADER = 'cap_header';
const SYNTAX_MACHINE_HEADER = 'machine_header';
const SYNTAX_WIRING = 'wiring';

/** The words the notation reads as constants. A node may not bear one. */
const RESERVED_NODE_NAMES = Object.freeze(['true', 'false', 'null']);

function syntaxNode(name, position, location) {
  if (RESERVED_NODE_NAMES.includes(name)) {
    throw syntaxError.reservedNodeName(name, position, location);
  }
  return name;
}

function syntaxConstant(text, location) {
  // The grammar's `constant` is JSON's value grammar: this is where its text
  // is read as the value it writes, and what the grammar cannot say — a
  // number no float holds, an escape that names half a character — is
  // refused.
  try {
    return decodeConstant(text.trim());
  } catch (error) {
    throw syntaxError.parse(`${text.trim()} is not a JSON value: ${error.message}`, location);
  }
}

function syntaxPolicy(entries, step, position, location) {
  let retry = 0;
  let onError = ON_ERROR_FAIL;
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      throw syntaxError.invalidPolicy(step, position, `'${entry.key}' is given twice`, location);
    }
    if (entry.key === 'retry') {
      // A count of further attempts: a whole number, not negative.
      const whole = entry.isNumber && /^[0-9]+$/.test(entry.value);
      if (!whole || BigInt(entry.value) > BigInt(MAX_RETRY)) {
        throw syntaxError.invalidPolicy(step, position,
          `retry takes a whole number of further attempts, not '${entry.value}'`, location);
      }
      retry = Number(entry.value);
    } else if (entry.key === 'on_error') {
      if (entry.value !== 'absent') {
        throw syntaxError.invalidPolicy(step, position, `on_error takes 'absent', not '${entry.value}'`, location);
      }
      onError = ON_ERROR_ABSENT;
    } else {
      throw syntaxError.invalidPolicy(step, position,
        `unknown key '${entry.key}' (a policy takes retry and on_error)`, location);
    }
    seen.add(entry.key);
  }
  return new StepPolicy(retry, onError);
}

function syntaxWiring(stmt, position) {
  const sources = stmt.sources.map(member => {
    if (member.constantText !== undefined) {
      if (member.name === null) {
        // A constant has no type of its own to be matched by: it says which
        // arg it is for, or it is not a member.
        throw syntaxError.unnamedConstant(member.constantText.trim(), position, member.location);
      }
      return {
        name: member.name,
        nameLocation: member.nameLocation,
        isConstant: true,
        node: null,
        constant: syntaxConstant(member.constantText, member.valueLocation),
        location: member.location,
        valueLocation: member.valueLocation,
      };
    }
    return {
      name: member.name,
      nameLocation: member.nameLocation,
      isConstant: false,
      node: syntaxNode(member.node, position, member.valueLocation),
      constant: undefined,
      location: member.location,
      valueLocation: member.valueLocation,
    };
  });
  const policy = syntaxPolicy(stmt.policy, stmt.step, position, stmt.policyLocation);
  const targets = stmt.targets.map(target => ({
    name: target.name,
    nameLocation: target.nameLocation,
    node: syntaxNode(target.node, position, target.valueLocation),
    location: target.location,
    valueLocation: target.valueLocation,
  }));
  // The unnamed target is the main output, and a step has one.
  const unnamed = targets.filter(target => target.name === null).map(target => target.node);
  if (unnamed.length > 1) {
    throw syntaxError.severalUnnamedTargets(position, unnamed, stmt.targetsLocation);
  }
  return {
    sources,
    sourcesLocation: stmt.sourcesLocation,
    step: stmt.step,
    stepLocation: stmt.stepLocation,
    policy,
    policyLocation: stmt.policyLocation,
    arrowLocations: stmt.arrowLocations,
    targets,
    targetsLocation: stmt.targetsLocation,
  };
}

/**
 * Read `input` into its statements, in the order written.
 *
 * Throws a MachineSyntaxError on text the grammar does not accept
 * (ParseError) and on the rules the text alone decides. An input with no
 * statement at all is not an error here: what an empty program means is the
 * caller's question.
 *
 * @param {string} input
 * @returns {Object[]} The statements: `{ kind, position, location, ... }` —
 *   a cap header carries `alias` and `capUrn`, a machine header `alias` and
 *   `reference` (unescaped), a wiring `wiring`; every part has its location.
 */
function parseSyntax(input) {
  let tree;
  try {
    tree = machineParser.parse(input);
  } catch (error) {
    throw syntaxError.parse(error.message, error.location || null);
  }
  return tree.map((stmt, position) => {
    if (stmt.type === 'header') {
      return {
        kind: SYNTAX_CAP_HEADER, position, location: stmt.location,
        alias: stmt.alias, aliasLocation: stmt.aliasLocation,
        capUrn: stmt.capUrn, capUrnLocation: stmt.capUrnLocation,
      };
    }
    if (stmt.type === 'machine_header') {
      const text = stmt.referenceText.trim();
      let reference;
      try {
        reference = decodeConstant(text);
      } catch (_) {
        reference = null;
      }
      if (typeof reference !== 'string') {
        throw syntaxError.parse(`${text} is not a JSON string`, stmt.referenceLocation);
      }
      return {
        kind: SYNTAX_MACHINE_HEADER, position, location: stmt.location,
        alias: stmt.alias, aliasLocation: stmt.aliasLocation,
        reference, referenceLocation: stmt.referenceLocation,
      };
    }
    if (stmt.type === 'wiring') {
      return { kind: SYNTAX_WIRING, position, location: stmt.location, wiring: syntaxWiring(stmt, position) };
    }
    throw new Error(`a statement is a header or a wiring, not ${stmt.type}`);
  });
}

// ============================================================================
// The machine: strands of resolved steps over numbered data positions.
//
//     Machine
//      └── strands: MachineStrand[]             ordered, declaration order matters
//           ├── nodes: MediaUrn[]               data positions in this strand
//           ├── edges: MachineEdge[]            canonical-order resolved cap steps
//           │    ├── assignment: EdgeAssignmentBinding[]
//           │    │    └── (capArgMediaUrn, argName, source: a node or a constant)
//           │    ├── outputs: EdgeOutput[]
//           │    │    └── (outputMediaUrn, outputName, node)
//           │    └── policy, includedAs, isLoop, tokenId
//           ├── inputAnchorIds: NodeId[]        root nodes (no producer)
//           └── outputAnchorIds: NodeId[]       leaf nodes (no consumer)
//
// Equivalence: Machine.isEquivalent is strict and positional — the same
// number of strands, and strands[i].isEquivalent(other.strands[i]) for every
// i. MachineStrand.isEquivalent walks both strands in canonical edge order,
// building a node bijection on the fly. The edges decide which node is which;
// names never do.
// ============================================================================

/**
 * What a step does when it fails (capdag/docs/09-machine-notation.md §Step
 * policy). The default — no policy written — is to fail the run at once.
 */
class StepPolicy {
  /**
   * @param {number} [retry=0] - Further attempts after a failure whose class is retryable
   * @param {string} [onError='fail'] - What a failure that stands does: 'fail' or 'absent'
   */
  constructor(retry = 0, onError = ON_ERROR_FAIL) {
    if (!Number.isInteger(retry) || retry < 0 || retry > MAX_RETRY) {
      throw new Error(`retry is a whole number of further attempts, not ${JSON.stringify(retry)}`);
    }
    if (onError !== ON_ERROR_FAIL && onError !== ON_ERROR_ABSENT) {
      throw new Error(`unknown on_error: ${JSON.stringify(onError)}`);
    }
    this.retry = retry;
    this.onError = onError;
    Object.freeze(this);
  }

  /** Whether this is the policy of a step that wrote none. */
  isDefault() {
    return this.retry === 0 && this.onError === ON_ERROR_FAIL;
  }

  /** Whether two policies make a step behave the same. */
  equals(other) {
    return other instanceof StepPolicy && this.retry === other.retry && this.onError === other.onError;
  }

  /**
   * The policy as notation writes it after a step alias: `{retry=3}`,
   * `{on_error=absent}`, both in that order, or nothing for the default.
   */
  toNotation() {
    const entries = [];
    if (this.retry > 0) entries.push(`retry=${this.retry}`);
    if (this.onError === ON_ERROR_ABSENT) entries.push('on_error=absent');
    return entries.length === 0 ? '' : `{${entries.join(', ')}}`;
  }

  /** The policy as a plan carries it: both fields, always. */
  toJSON() {
    return { retry: this.retry, on_error: this.onError };
  }
}

/** The run fails. The default. */
const ON_ERROR_FAIL = 'fail';
/** The step's outputs are absent and the run goes on. */
const ON_ERROR_ABSENT = 'absent';
/** The largest count of further attempts a policy holds. */
const MAX_RETRY = 0xFFFFFFFF;

/**
 * Whether `value` is a constant of machine notation — a JSON value, whole
 * numbers within sixty-four bits, floats finite — refusing it if not.
 */
function checkedConstant(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'bigint') {
    if (value < WHOLE_MIN || value > WHOLE_MAX) {
      throw new Error(`${value} is not a whole number a constant can hold`);
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${value} is not a number a constant can hold`);
    return value;
  }
  if (Array.isArray(value)) return value.map(checkedConstant);
  if (isConstantObject(value)) {
    const checked = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(checked, key, { value: checkedConstant(value[key]), enumerable: true, writable: true, configurable: true });
    }
    return checked;
  }
  throw new Error(`${Object.prototype.toString.call(value)} is not a JSON value`);
}

/**
 * What feeds one cap argument of a step: a data position of the strand, or a
 * constant written in the machine (any JSON value). A constant is part of the
 * binding, not a node — nothing else can consume it.
 */
class BindingSource {
  constructor(isConstant, node, constant) {
    this.isConstant = isConstant;
    this.node = node;
    this.constant = constant;
    Object.freeze(this);
  }

  /** A binding source that is a node of the strand. */
  static ofNode(node) {
    if (!Number.isInteger(node) || node < 0) throw new Error(`a node is a position of the strand, not ${node}`);
    return new BindingSource(false, node, undefined);
  }

  /**
   * A binding source that is a constant: any JSON value. Whole numbers
   * (bigint) and floats (number) are kept apart as notation keeps them.
   */
  static ofConstant(value) {
    return new BindingSource(true, undefined, checkedConstant(value));
  }

  toString() {
    return this.isConstant ? constantText(this.constant) : `#${this.node}`;
  }
}

/**
 * One slot in a resolved MachineEdge's source-to-cap-arg assignment: which
 * cap argument (identified by its media URN) is fed by what.
 */
class EdgeAssignmentBinding {
  /**
   * @param {MediaUrn} capArgMediaUrn - Slot identity per the cap definition
   * @param {string} argName - The arg's name in the cap definition: the label
   *   notation writes the binding under. It is NOT identity — the media URN
   *   is, and equivalence never reads this.
   * @param {BindingSource} source
   */
  constructor(capArgMediaUrn, argName, source) {
    this.capArgMediaUrn = capArgMediaUrn;
    this.argName = argName;
    this.source = source;
  }

  /** The node feeding the arg, or null when a constant does. */
  node() {
    return this.source.isConstant ? null : this.source.node;
  }
}

/**
 * One output of a step that its wiring takes, and the node it goes to.
 */
class EdgeOutput {
  /**
   * @param {MediaUrn} outputMediaUrn - The output's identity per the cap definition
   * @param {string} outputName - Its name in the definition: a label, never compared
   * @param {number} node
   */
  constructor(outputMediaUrn, outputName, node) {
    this.outputMediaUrn = outputMediaUrn;
    this.outputName = outputName;
    this.node = node;
  }
}

/** A fresh identity for a step. */
function mintStepToken() {
  return globalThis.crypto.randomUUID();
}

/**
 * One resolved cap step inside a MachineStrand. The assignment is sorted by
 * the args' media URNs and the outputs by theirs, for canonical comparison.
 */
class MachineEdge {
  /**
   * @param {CapUrn} capUrn
   * @param {EdgeAssignmentBinding[]} assignment
   * @param {EdgeOutput[]} outputs - The outputs the wiring takes. An output the
   *   cap declares and no entry names is discarded; an empty list is a sink.
   * @param {string} tokenId - Stable identity of the step: what a run reports
   *   it under. Equivalence ignores it.
   * @param {Object} [options]
   * @param {StepPolicy} [options.policy] - What the step does when it fails
   * @param {string[]} [options.includedAs] - The machine steps this step was
   *   included through, outermost first, each as `alias#use`. A label:
   *   equivalence never reads it, and canonical notation does not write it.
   * @param {boolean} [options.isLoop] - Whether the step runs once per item
   */
  constructor(capUrn, assignment, outputs, tokenId, options = {}) {
    this.capUrn = capUrn;
    this.assignment = assignment;
    this.outputs = outputs;
    this.tokenId = tokenId;
    this.policy = options.policy || new StepPolicy();
    this.includedAs = [...(options.includedAs || [])];
    this.isLoop = options.isLoop === true;
  }

  /**
   * The node the step's MAIN output goes to: the taken output whose URN is
   * the cap URN's `out=`. Null when the wiring does not take it.
   */
  mainTarget() {
    const out = this.capUrn.outMediaUrn();
    const main = this.outputs.find(output => output.outputMediaUrn.isEquivalent(out));
    return main ? main.node : null;
  }

  /** Every node this step produces. */
  outputNodes() {
    return this.outputs.map(output => output.node);
  }

  /** Every node this step consumes. A constant is not a node. */
  sourceNodes() {
    return this.assignment.filter(binding => !binding.source.isConstant).map(binding => binding.source.node);
  }

  toString() {
    const assignments = this.assignment.map(b => `${b.capArgMediaUrn}<-${b.source}`).join(', ');
    const outputs = this.outputs.map(o => `${o.outputMediaUrn}->#${o.node}`).join(', ');
    // Debug-only marker for a per-item map edge: not notation syntax.
    const loopPrefix = this.isLoop ? 'map ' : '';
    return `${loopPrefix}${this.capUrn}${this.policy.toNotation()} (${assignments}) -> (${outputs})`;
  }
}

/**
 * Maps the nodes of one strand to the nodes of another during an equivalence
 * walk. Each bind records a new pair or confirms one already made; a node of
 * either strand paired with two nodes of the other is refused, and a refused
 * pairing leaves no trace.
 */
class NodeBijection {
  constructor(selfLength, otherLength) {
    this._selfToOther = new Array(selfLength).fill(null);
    this._otherToSelf = new Array(otherLength).fill(null);
  }

  bind(selfId, otherId) {
    const existingOther = this._selfToOther[selfId];
    if (existingOther !== null && existingOther !== otherId) return false;
    const existingSelf = this._otherToSelf[otherId];
    if (existingSelf !== null && existingSelf !== selfId) return false;
    this._selfToOther[selfId] = otherId;
    this._otherToSelf[otherId] = selfId;
    return true;
  }
}

/**
 * One connected component of resolved cap edges with explicit anchor
 * commitments: every edge shares at least one node (transitively) with every
 * other. Built once by the resolver; immutable after.
 */
class MachineStrand {
  /**
   * @param {MediaUrn[]} nodes
   * @param {MachineEdge[]} edges
   * @param {number[]} inputAnchorIds
   * @param {number[]} outputAnchorIds
   * @param {boolean[]} nodeIsSequence
   */
  constructor(nodes, edges, inputAnchorIds, outputAnchorIds, nodeIsSequence) {
    if (nodes.length !== nodeIsSequence.length) {
      throw new Error('every node of a strand has a cardinality');
    }
    this._nodes = nodes;
    this._edges = edges;
    this._inputAnchorIds = inputAnchorIds;
    this._outputAnchorIds = outputAnchorIds;
    this._nodeIsSequence = nodeIsSequence;
  }

  /**
   * Whether node `id` holds a sequence, as its producer's output declares (a
   * node nothing produces is a single value here). A sequence bound to an arg
   * that takes a single value is what makes a step run once per item.
   */
  nodeIsSequence(id) {
    return this._nodeIsSequence[id];
  }

  /** All distinct data positions in this strand, indexed by node id. */
  nodes() {
    return this._nodes;
  }

  /** The cap-step edges in canonical topological order. */
  edges() {
    return this._edges;
  }

  /** The strand's input anchors (roots: not produced by any edge). */
  inputAnchorIds() {
    return this._inputAnchorIds;
  }

  /** The strand's output anchors (leaves: not consumed by any edge). */
  outputAnchorIds() {
    return this._outputAnchorIds;
  }

  /** A node's media URN. Fails hard if `id` is out of range. */
  nodeUrn(id) {
    if (!Number.isInteger(id) || id < 0 || id >= this._nodes.length) {
      throw new Error(`node ${id} is not a node of this strand (it has ${this._nodes.length})`);
    }
    return this._nodes[id];
  }

  inputAnchors() {
    return this._inputAnchorIds.map(id => this._nodes[id]);
  }

  outputAnchors() {
    return this._outputAnchorIds.map(id => this._nodes[id]);
  }

  /**
   * Strict equivalence with another strand. Walks both strands in canonical
   * edge order, building a bijection between node ids on the fly. Any edge
   * mismatch (cap URN, policy, assignment, outputs, or isLoop) fails the
   * comparison, and so does an inconsistent bijection or two paired nodes that
   * hold different types.
   */
  isEquivalent(other) {
    if (this._edges.length !== other._edges.length) return false;
    const nodeMap = new NodeBijection(this._nodes.length, other._nodes.length);
    // The two nodes must hold equivalent URNs, whatever the bijection says:
    // nodes that stand for each other carry one type.
    const bind = (selfId, otherId) =>
      this._nodes[selfId].isEquivalent(other._nodes[otherId]) && nodeMap.bind(selfId, otherId);

    // The edges decide which node is which: every node is a source or an
    // output of some edge, and an edge says what each of its nodes is FOR.
    // Two inputs of one type are told apart by that and by nothing else.
    for (let index = 0; index < this._edges.length; index += 1) {
      const selfEdge = this._edges[index];
      const otherEdge = other._edges[index];
      if (selfEdge.isLoop !== otherEdge.isLoop) return false;
      if (!selfEdge.policy.equals(otherEdge.policy)) return false;
      if (!selfEdge.capUrn.isEquivalent(otherEdge.capUrn)) return false;
      if (selfEdge.assignment.length !== otherEdge.assignment.length) return false;
      if (selfEdge.outputs.length !== otherEdge.outputs.length) return false;
      // The assignment is sorted by the args' media URNs: positional
      // comparison is canonical.
      for (let b = 0; b < selfEdge.assignment.length; b += 1) {
        const selfBinding = selfEdge.assignment[b];
        const otherBinding = otherEdge.assignment[b];
        if (!selfBinding.capArgMediaUrn.isEquivalent(otherBinding.capArgMediaUrn)) return false;
        if (selfBinding.source.isConstant !== otherBinding.source.isConstant) return false;
        if (selfBinding.source.isConstant) {
          // Two machines that give an arg different constants behave differently.
          if (!constantsEqual(selfBinding.source.constant, otherBinding.source.constant)) return false;
        } else if (!bind(selfBinding.source.node, otherBinding.source.node)) {
          return false;
        }
      }
      // Sorted by output media URN, like the assignment.
      for (let o = 0; o < selfEdge.outputs.length; o += 1) {
        if (!selfEdge.outputs[o].outputMediaUrn.isEquivalent(otherEdge.outputs[o].outputMediaUrn)) return false;
        if (!bind(selfEdge.outputs[o].node, otherEdge.outputs[o].node)) return false;
      }
    }
    // Every node of a strand is a source or an output of one of its edges, so
    // the walk has paired every node of each strand with one of the other.
    return true;
  }

  toString() {
    return `MachineStrand(${this._nodes.length} nodes, ${this._edges.length} edges, ` +
      `inputs=[${this._inputAnchorIds}], outputs=[${this._outputAnchorIds}])`;
  }
}

/**
 * An ordered collection of resolved strands. Strand declaration order
 * matters: isEquivalent compares strand by strand, positionally.
 */
class Machine {
  /**
   * @param {MachineStrand[]} strands
   */
  constructor(strands) {
    this._strands = strands;
  }

  /** All resolved strands in declaration order. */
  strands() {
    return this._strands;
  }

  strandCount() {
    return this._strands.length;
  }

  isEmpty() {
    return this._strands.length === 0;
  }

  /**
   * Strict, positional equivalence: the same number of strands, and
   * strands[i].isEquivalent(other.strands[i]) for every i.
   */
  isEquivalent(other) {
    if (this._strands.length !== other._strands.length) return false;
    return this._strands.every((strand, index) => strand.isEquivalent(other._strands[index]));
  }

  toString() {
    return this.toMachineNotation();
  }
}

// ============================================================================
// Which steps of a machine run once per item, and inside which map.
//
// Notation never writes iteration: it follows from cardinality (docs 09
// §Iteration). This is the one place that rule is computed. The resolver asks
// it which steps map. Notation has no run, so its inputs are single values; a
// caller that knows a run says which inputs it binds a sequence to.
//
// Every node lives in a scope: the machine itself, or a map. A node in a map
// has one value per run of that map. Seen from outside the map it is the
// sequence of those values in item order — and when the map is itself inside
// another, seen from outside both it is one flat sequence.
//
// A map is what it iterates: the sequences it zips, in the scope it is opened
// in. Two steps that map over the same sequences in the same scope run in the
// same map, so what each produces for an item can be given to a third step for
// that item.
//
// A step is first placed in the deepest scope its members ask for, when those
// scopes lie on one line of nesting; when they do not, in the scope that
// encloses them all. What a member asks for:
// - bound to an arg that takes one value: the scope the node lives in;
// - a sequence bound to an arg that takes a sequence: the scope it lives in —
//   the step is given that sequence whole;
// - a single value bound to an arg that takes a sequence: the scope that
//   encloses the node's map — the step folds what the map collected.
//
// From its placement, each member bound to an arg that takes one value is one
// of: a single value there (given as it is); the sequence a map the placement
// is inside iterates (given as that map's item — the step joins the map); a
// sequence that lives in the placement, or was collected into it (mapped: the
// step runs in the map over it, opened inside the placement; several mapped
// members are zipped); or a sequence from outside that no enclosing map
// iterates — mapping it here would run every item of it for every item of the
// enclosing map, a cross product nobody wrote, so the step is placed further
// out instead, where that sequence lives.
// ============================================================================

/** The machine itself: what is not inside any map. */
const SCOPE_ROOT = 0;

/** The steps a machine cannot place because they wait on one another. */
class CyclicSteps extends Error {
  constructor(steps) {
    super(`steps [${steps.join(', ')}] wait on one another`);
    this.name = 'CyclicSteps';
    this.steps = [...steps];
  }
}

/** Where a step runs. */
class StepPlacement {
  constructor(placedIn, map = null, mapped = []) {
    /** The scope the step is placed in: where it is given its members. */
    this.placedIn = placedIn;
    /** The map the step runs in, when it maps: opened inside its placement. */
    this.map = map;
    /** The members the step maps over, zipped, in the order the step lists them. */
    this.mapped = mapped;
  }

  /** Whether the step maps. */
  get maps() {
    return this.map !== null;
  }

  /** The scope the step's invocations run in, and its outputs live in. */
  scope() {
    return this.map !== null ? this.map : this.placedIn;
  }
}

/** The scopes of a machine and the place of every step and node in them. */
class IterationStructure {
  constructor() {
    this._scopes = [{ parent: SCOPE_ROOT, sources: [], mappers: [] }];
    this._steps = [];
    this._nodeScope = new Map();
    this._nodeIsSequence = new Map();
  }

  _allPlaced(members) {
    return members.every(member => this._nodeScope.has(member.node));
  }

  _place(index, step) {
    // What each member asks for.
    const asked = step.members.map(member => {
      const scope = this._nodeScope.get(member.node);
      if (member.argIsSequence && !this._nodeIsSequence.get(member.node)) {
        return this._scopes[scope].parent;
      }
      return scope;
    });
    let deepest = SCOPE_ROOT;
    asked.forEach((scope, position) => {
      // Two different scopes of one depth are not on one line of nesting,
      // and then the deepest is not where the step is placed.
      if (position === 0 || this.depth(scope) > this.depth(deepest)) deepest = scope;
    });
    let placedIn = deepest;
    if (!asked.every(scope => this.encloses(scope, deepest))) {
      placedIn = asked.slice(1).reduce((common, scope) => this.commonScope(common, scope), asked[0]);
    }

    // What each member bound to an arg that takes one value is from there. A
    // sequence from outside that no enclosing map iterates moves the
    // placement out to where it lives, and the members are read again.
    let mapped;
    for (;;) {
      mapped = [];
      let moved = false;
      for (const member of step.members) {
        if (member.argIsSequence) continue;
        const livesIn = this._nodeScope.get(member.node);
        if (this.encloses(livesIn, placedIn)) {
          if (!this._nodeIsSequence.get(member.node)) continue; // one value here
          if (livesIn !== placedIn) {
            if (this._iteratedBetween(member.node, placedIn, livesIn)) continue; // the item of a map the step is inside
            placedIn = livesIn;
            moved = true;
            break;
          }
          // A sequence that lives here: mapped.
        }
        // Otherwise the node lives in a map the placement is not inside, and
        // the placement encloses that map: the node is seen here as what the
        // map collected — a sequence, mapped.
        if (!mapped.includes(member.node)) mapped.push(member.node);
      }
      if (!moved) break;
    }

    const placement = new StepPlacement(placedIn, null, mapped);
    if (mapped.length === 0) return placement;
    const sources = [...mapped].sort((a, b) => a - b);
    let found = this._scopes.findIndex(scope =>
      // The machine itself zips nothing, so it is never the map sought.
      scope !== this._scopes[SCOPE_ROOT] && scope.parent === placedIn &&
      scope.sources.length === sources.length && scope.sources.every((node, i) => node === sources[i])
    );
    if (found < 0) {
      this._scopes.push({ parent: placedIn, sources, mappers: [] });
      found = this._scopes.length - 1;
    }
    this._scopes[found].mappers.push(index);
    placement.map = found;
    return placement;
  }

  /** Whether a map from `inner` outward, short of `outer`, iterates `node`. */
  _iteratedBetween(node, inner, outer) {
    for (let at = inner; at !== outer; at = this._scopes[at].parent) {
      if (this._scopes[at].sources.includes(node)) return true;
    }
    return false;
  }

  /** Where each step runs, in the order the steps were given. */
  steps() {
    return this._steps;
  }

  /** How many scopes there are, the machine included. */
  scopeCount() {
    return this._scopes.length;
  }

  /** The scope that encloses `scope`. The machine encloses itself. */
  parent(scope) {
    return this._scopes[scope].parent;
  }

  /** The sequences map `scope` zips, in a fixed order; none for the machine. */
  sources(scope) {
    return [...this._scopes[scope].sources];
  }

  /** The first step that maps in `scope`: the one the map is opened by. */
  openedBy(scope) {
    const mappers = this._scopes[scope].mappers;
    return mappers.length > 0 ? mappers[0] : null;
  }

  /**
   * The map that gives a step running in `fromScope` the ITEM of `node`: the
   * innermost map at or around `fromScope` that iterates it. Null when no map
   * the step is inside iterates the node: the step is given it whole.
   */
  itemMap(node, fromScope) {
    for (let at = fromScope; at !== SCOPE_ROOT; at = this._scopes[at].parent) {
      if (this._scopes[at].sources.includes(node)) return at;
    }
    return null;
  }

  /** The scope a node lives in. */
  nodeScope(node) {
    return this._nodeScope.get(node);
  }

  /** How many maps enclose `scope`, itself included. */
  depth(scope) {
    let depth = 0;
    for (let at = scope; at !== SCOPE_ROOT; at = this._scopes[at].parent) depth += 1;
    return depth;
  }

  /** Whether `outer` is `inner` or encloses it. */
  encloses(outer, inner) {
    for (let at = inner; ; at = this._scopes[at].parent) {
      if (at === outer) return true;
      if (at === SCOPE_ROOT) return false;
    }
  }

  /** The deepest scope that encloses both. */
  commonScope(a, b) {
    let at = a;
    while (!this.encloses(at, b)) at = this._scopes[at].parent;
    return at;
  }

  /**
   * Whether `node` is a sequence as a step placed in `fromScope` is given it:
   * what it is in its own scope when that scope encloses `fromScope`, and the
   * collected sequence otherwise.
   */
  isSequenceFrom(node, fromScope) {
    if (this.encloses(this._nodeScope.get(node), fromScope)) return this._nodeIsSequence.get(node);
    return true;
  }
}

/**
 * Place every step. Each step is `{ members: [{node, argIsSequence}],
 * outputs: [{node, isSequence}] }`; a constant is not a member — it is one
 * value wherever the step runs. `inputIsSequence(node)` says, for a node no
 * step produces, whether it holds a sequence. Throws CyclicSteps naming the
 * steps that wait on one another.
 * @returns {IterationStructure}
 */
function iterationOf(steps, inputIsSequence) {
  const produced = new Set(steps.flatMap(step => step.outputs.map(output => output.node)));
  const structure = new IterationStructure();
  // An input of the machine lives in the machine.
  for (const step of steps) {
    for (const member of step.members) {
      if (!produced.has(member.node)) {
        structure._nodeScope.set(member.node, SCOPE_ROOT);
        structure._nodeIsSequence.set(member.node, inputIsSequence(member.node));
      }
    }
  }
  // A step is placed once every node it is given has a place. The order steps
  // are placed in does not change where any of them lands: a placement reads
  // only its members, and a map is found by what it iterates.
  const placements = new Array(steps.length).fill(null);
  let remaining = steps.length;
  while (remaining > 0) {
    const before = remaining;
    steps.forEach((step, index) => {
      if (placements[index] !== null || !structure._allPlaced(step.members)) return;
      const placement = structure._place(index, step);
      for (const output of step.outputs) {
        structure._nodeScope.set(output.node, placement.scope());
        structure._nodeIsSequence.set(output.node, output.isSequence);
      }
      placements[index] = placement;
      remaining -= 1;
    });
    if (remaining === before) {
      throw new CyclicSteps(placements.map((placement, i) => (placement === null ? i : -1)).filter(i => i >= 0));
    }
  }
  structure._steps = placements;
  for (const scope of structure._scopes) scope.mappers.sort((a, b) => a - b);
  return structure;
}

// ============================================================================
// URN order, and what a constant is held to.
// ============================================================================

function compareStrings(a, b) {
  return compareCodePoints(a, b);
}

function compareTagPairs(left, right) {
  const leftKeys = Object.keys(left).sort(compareStrings);
  const rightKeys = Object.keys(right).sort(compareStrings);
  const shared = Math.min(leftKeys.length, rightKeys.length);
  for (let i = 0; i < shared; i += 1) {
    const byKey = compareStrings(leftKeys[i], rightKeys[i]);
    if (byKey !== 0) return byKey;
    const byValue = compareStrings(String(left[leftKeys[i]]), String(right[rightKeys[i]]));
    if (byValue !== 0) return byValue;
  }
  return leftKeys.length - rightKeys.length;
}

/**
 * The order media URNs are sorted by: the tags as (key, stored value) pairs in
 * key order (every media URN has the one prefix). This is the reference's
 * structural order — NOT the order of the canonical text, which differs
 * wherever one key is the beginning of another (`file` and `file-path`).
 * Everything canonical that sorts by URN sorts by this.
 * @param {MediaUrn} a
 * @param {MediaUrn} b
 * @returns {number}
 */
function compareMediaUrns(a, b) {
  return compareTagPairs(a._urn.tags, b._urn.tags);
}

const EFFECT_ORDER = Object.freeze({ declared: 0, none: 1, patch: 2, '?': 3 });

/**
 * The order cap URNs are sorted by: `in=` and `out=` as media URNs, then the
 * effect (declared, none, patch, unspecified), then the remaining tags as
 * (key, stored value) pairs in key order.
 * @param {CapUrn} a
 * @param {CapUrn} b
 * @returns {number}
 */
function compareCapUrns(a, b) {
  const byIn = compareMediaUrns(a.inMediaUrn(), b.inMediaUrn());
  if (byIn !== 0) return byIn;
  const byOut = compareMediaUrns(a.outMediaUrn(), b.outMediaUrn());
  if (byOut !== 0) return byOut;
  const byEffect = EFFECT_ORDER[a.getEffect()] - EFFECT_ORDER[b.getEffect()];
  if (byEffect !== 0) return byEffect;
  return compareTagPairs(a.tags, b.tags);
}

function numberText(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

/**
 * The first rule of a media definition's `validation` that `value` breaks,
 * described, or null when it breaks none. Throws when a rule itself cannot be
 * applied (a pattern that is not a regular expression): a defect in the media
 * definition, not in the value.
 *
 * A rule applies to the values it is about and passes the rest: `min` and
 * `max` to numbers, the length rules to strings and arrays, `pattern` and
 * `allowed_values` to strings. A string's length is its UTF-8 bytes, as every
 * implementation measures it.
 * @param {Object} validation - { min, max, min_length, max_length, pattern, allowed_values }
 * @param {*} value - A constant
 * @returns {string|null}
 */
function validationViolation(validation, value) {
  const has = key => validation[key] !== undefined && validation[key] !== null;
  if (typeof value === 'number' || typeof value === 'bigint') {
    const number = Number(value);
    if (has('min') && number < validation.min) return `minimum value ${numberText(validation.min)}`;
    if (has('max') && number > validation.max) return `maximum value ${numberText(validation.max)}`;
  }
  let length = null;
  let kind = '';
  if (typeof value === 'string') length = new TextEncoder().encode(value).length;
  else if (Array.isArray(value)) { length = value.length; kind = 'array '; }
  if (length !== null) {
    if (has('min_length') && length < validation.min_length) return `minimum ${kind}length ${validation.min_length}`;
    if (has('max_length') && length > validation.max_length) return `maximum ${kind}length ${validation.max_length}`;
  }
  if (has('pattern') && typeof value === 'string') {
    let compiled;
    try {
      compiled = new RegExp(validation.pattern, 'u');
    } catch (error) {
      throw new Error(`Invalid regex pattern '${validation.pattern}': ${error.message}`);
    }
    if (!compiled.test(value)) return `pattern '${validation.pattern}'`;
  }
  if (has('allowed_values') && typeof value === 'string') {
    if (!validation.allowed_values.includes(value)) {
      return `allowed values: [${validation.allowed_values.map(each => JSON.stringify(each)).join(', ')}]`;
    }
  }
  return null;
}

/** Keywords a schema may carry that say nothing about a value. */
const SCHEMA_ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description', 'default', 'examples', 'definitions', '$defs']);

function jsonTypeOf(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'bigint') return 'integer';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (Array.isArray(value)) return 'array';
  return 'object';
}

function resolveSchemaRef(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) {
    throw new Error(`schema reference '${ref}' is not a reference into the schema itself`);
  }
  let at = root;
  for (const raw of ref.slice(1).split('/').filter(part => part !== '')) {
    const part = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    if (at === null || typeof at !== 'object' || !Object.prototype.hasOwnProperty.call(at, part)) {
      throw new Error(`schema reference '${ref}' names nothing in the schema`);
    }
    at = at[part];
  }
  return at;
}

/**
 * Hold a value to an inline JSON Schema, returning what it breaks, described
 * (empty when it breaks nothing). This is the reading of a media definition's
 * schema a constant written in a machine is held to when the machine is
 * resolved. It reads the keywords media definitions use — type, enum, const,
 * the numeric and length bounds, pattern, properties, required,
 * additionalProperties, items, anyOf, allOf, oneOf, not and local $ref — and
 * refuses a schema that uses any other: a rule nobody read is not a rule
 * passed.
 * @param {Object|boolean} schema
 * @param {*} value - A constant
 * @returns {string[]}
 */
function schemaViolations(schema, value) {
  const violations = [];
  const check = (node, at, path) => {
    if (node === true) return;
    if (node === false) { violations.push(`${path || '(root)'}: no value is valid here`); return; }
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      throw new Error(`a schema is an object or a boolean, not ${JSON.stringify(node)}`);
    }
    const where = path || '(root)';
    if (node.$ref !== undefined) {
      check(resolveSchemaRef(schema, node.$ref), at, path);
    }
    for (const keyword of Object.keys(node)) {
      if (SCHEMA_ANNOTATIONS.has(keyword) || keyword === '$ref') continue;
      const rule = node[keyword];
      switch (keyword) {
        case 'type': {
          const allowed = Array.isArray(rule) ? rule : [rule];
          const actual = jsonTypeOf(at);
          if (!allowed.some(type => type === actual || (type === 'number' && actual === 'integer'))) {
            violations.push(`${where}: ${constantText(at)} is not of type ${allowed.map(t => `"${t}"`).join(', ')}`);
          }
          break;
        }
        case 'enum':
          if (!rule.some(each => constantsEqual(decodeConstant(JSON.stringify(each)), at))) {
            violations.push(`${where}: ${constantText(at)} is not one of ${JSON.stringify(rule)}`);
          }
          break;
        case 'const':
          if (!constantsEqual(decodeConstant(JSON.stringify(rule)), at)) {
            violations.push(`${where}: ${JSON.stringify(rule)} was expected`);
          }
          break;
        case 'minimum': case 'maximum': case 'exclusiveMinimum': case 'exclusiveMaximum': {
          if (typeof at !== 'number' && typeof at !== 'bigint') break;
          const number = Number(at);
          const broken = (keyword === 'minimum' && number < rule) || (keyword === 'maximum' && number > rule) ||
            (keyword === 'exclusiveMinimum' && number <= rule) || (keyword === 'exclusiveMaximum' && number >= rule);
          if (broken) violations.push(`${where}: ${constantText(at)} breaks ${keyword} ${rule}`);
          break;
        }
        case 'minLength': case 'maxLength': {
          if (typeof at !== 'string') break;
          const length = Array.from(at).length;
          if ((keyword === 'minLength' && length < rule) || (keyword === 'maxLength' && length > rule)) {
            violations.push(`${where}: ${constantText(at)} breaks ${keyword} ${rule}`);
          }
          break;
        }
        case 'pattern':
          if (typeof at === 'string' && !new RegExp(rule, 'u').test(at)) {
            violations.push(`${where}: ${constantText(at)} does not match '${rule}'`);
          }
          break;
        case 'minItems': case 'maxItems':
          if (Array.isArray(at) && ((keyword === 'minItems' && at.length < rule) || (keyword === 'maxItems' && at.length > rule))) {
            violations.push(`${where}: an array of ${at.length} breaks ${keyword} ${rule}`);
          }
          break;
        case 'items':
          if (!Array.isArray(at)) break;
          at.forEach((item, index) => {
            const itemSchema = Array.isArray(rule) ? rule[index] : rule;
            if (itemSchema !== undefined) check(itemSchema, item, `${path}/${index}`);
          });
          break;
        case 'properties':
          if (!isConstantObject(at)) break;
          for (const name of Object.keys(rule)) {
            if (Object.prototype.hasOwnProperty.call(at, name)) check(rule[name], at[name], `${path}/${name}`);
          }
          break;
        case 'required':
          if (!isConstantObject(at)) break;
          for (const name of rule) {
            if (!Object.prototype.hasOwnProperty.call(at, name)) violations.push(`${where}: "${name}" is a required property`);
          }
          break;
        case 'additionalProperties':
          if (!isConstantObject(at)) break;
          for (const name of Object.keys(at)) {
            if (node.properties && Object.prototype.hasOwnProperty.call(node.properties, name)) continue;
            if (rule === false) violations.push(`${where}: additional property "${name}" is not allowed`);
            else check(rule, at[name], `${path}/${name}`);
          }
          break;
        case 'anyOf': case 'oneOf': case 'allOf': {
          const passing = rule.filter(each => schemaViolationsUnder(schema, each, at).length === 0).length;
          const holds = keyword === 'anyOf' ? passing > 0 : keyword === 'oneOf' ? passing === 1 : passing === rule.length;
          if (!holds) violations.push(`${where}: ${constantText(at)} is not valid under ${keyword}`);
          break;
        }
        case 'not':
          if (schemaViolationsUnder(schema, rule, at).length === 0) {
            violations.push(`${where}: ${constantText(at)} must not be valid under the schema it is not to match`);
          }
          break;
        default:
          throw new Error(`the schema keyword '${keyword}' is not one this capdag reads`);
      }
    }
  };
  const schemaViolationsUnder = (root, node, at) => {
    const saved = violations.length;
    check(node, at, '');
    return violations.splice(saved);
  };
  check(schema, value, '');
  return violations;
}

// ============================================================================
// Resolution: a wiring set over numbered nodes into a MachineStrand whose
// every edge has an explicit source-to-cap-arg assignment and names the
// outputs it takes, anchored by the strand's input roots and output leaves.
//
// Members that name an arg bind first, each to the arg of that name; the
// source must conform to what that arg ACCEPTS. A name written more than once
// gathers, and only a sequence arg may be gathered into. A constant is held to
// the validation of the arg's media definition.
//
// The members that name no arg are matched by type over the args no name
// bound, by minimum-cost assignment in two phases of strict precedence:
// - Cost of pairing source s with arg a: spec(s) - spec(a) if s conforms to
//   what a accepts — how much more the source says than the arg asks;
//   otherwise the pair is impossible.
// - Phase 1 — product: each source claims a distinct arg. Whenever such an
//   assignment exists, this phase decides.
// - Phase 2 — gather: only when no such assignment exists, a sequence arg may
//   absorb several conforming sources (scalar args still take at most one).
// - The minimum-cost assignment of the deciding phase must be unique: a tie
//   is AmbiguousMachineNotation. Where a member stands in its group is never
//   a tiebreaker (it only fixes the item order within one gathered arg).
// ============================================================================

/**
 * Where a resolver reads the definitions a machine names: the caps its steps
 * run and the media definitions its constants are held to.
 *
 * Any object with these two methods serves; `CapDefinitions` is one held in
 * memory.
 * @typedef {Object} MachineDefinitions
 * @property {function(string): (Cap|null)} capDefinition - The definition of
 *   the cap a URN names, or null
 * @property {function(string): (MediaDef|null)} mediaDefinition - The
 *   definition of the media a URN names, or null
 */

/**
 * Definitions held in memory, found by URN equivalence: two spellings of one
 * URN find one definition.
 */
class CapDefinitions {
  constructor() {
    this._caps = [];
    this._media = [];
    this._aliases = new Map();
  }

  /** Add cap definitions. A later one for an equivalent URN replaces the earlier. */
  addCaps(caps) {
    for (const cap of caps) {
      if (!(cap instanceof Cap)) throw new Error('a cap definition is a Cap');
      this._caps = this._caps.filter(known => !known.urn.isEquivalent(cap.urn));
      this._caps.push(cap);
    }
    return this;
  }

  /** Add media definitions (each with its `mediaUrn`). */
  addMediaDefs(defs) {
    for (const def of defs) {
      if (!(def instanceof MediaDef) || typeof def.mediaUrn !== 'string') {
        throw new Error('a media definition is a MediaDef that names its media URN');
      }
      const urn = MediaUrn.fromString(def.mediaUrn);
      this._media = this._media.filter(known => !MediaUrn.fromString(known.mediaUrn).isEquivalent(urn));
      this._media.push(def);
    }
    return this;
  }

  /**
   * Register a fabric alias: a name for a cap URN or a media URN. The name is
   * held normalized and the target canonical, as the fabric holds them.
   */
  addAlias(name, target) {
    const kind = classifyAliasTarget(target);
    if (kind === null) throw new Error(`alias '${name}' names '${target}', which is neither a cap URN nor a media URN`);
    const canonical = kind === ALIAS_TARGET_CAP ? CapUrn.fromString(target).toString() : MediaUrn.fromString(target).toString();
    this._aliases.set(normalizeAliasName(name), canonical);
    return this;
  }

  capDefinition(capUrn) {
    const wanted = CapUrn.fromString(capUrn);
    return this._caps.find(cap => cap.urn.isEquivalent(wanted)) || null;
  }

  mediaDefinition(mediaUrn) {
    const wanted = MediaUrn.fromString(mediaUrn);
    return this._media.find(def => MediaUrn.fromString(def.mediaUrn).isEquivalent(wanted)) || null;
  }

  /**
   * The URN a fabric alias names, or null. A name that is not a well-formed
   * alias name is no alias.
   */
  aliasTarget(name) {
    if (!isAliasToken(name)) return null;
    const normalized = normalizeAliasName(name);
    return this._aliases.has(normalized) ? this._aliases.get(normalized) : null;
  }

  /**
   * The name a cap or media URN is displayed by: of the aliases that name
   * it, the shortest, ties alphabetical. Null when none does. The same
   * question FabricRegistryClient answers, so either can name the caps of a
   * machine written out.
   */
  displayAliasForUrn(urn) {
    const kind = classifyAliasTarget(urn);
    if (kind === null) return null;
    const canonical = kind === ALIAS_TARGET_CAP ? CapUrn.fromString(urn).toString() : MediaUrn.fromString(urn).toString();
    const names = [...this._aliases.entries()].filter(([, target]) => target === canonical).map(([name]) => name);
    return selectDisplayAlias(names);
  }
}

function mustMedia(text, what) {
  try {
    return MediaUrn.fromString(text);
  } catch (error) {
    throw new Error(`cap registry invariant: ${what} is a valid media URN: '${text}': ${error.message}`);
  }
}

/**
 * Hold a constant to the validation of the arg it is bound to: the rules and
 * the schema the arg's media definition declares. A constant is known when
 * the machine is resolved, so that is when it is checked.
 */
function checkConstant(definitions, capUrn, arg, value, strandIndex) {
  const refused = reason => abstractionError.constantFailsValidation(
    strandIndex, capUrn, arg.name, constantText(value), reason);
  // Without the definition there is nothing to hold the constant to, and a
  // constant nobody checked is not bound.
  const definition = definitions.mediaDefinition(arg.media_urn);
  if (definition === null) {
    throw refused(`the media definition of '${arg.media_urn}' is not available, so the constant cannot be validated`);
  }
  if (definition.validation !== null && definition.validation !== undefined) {
    let rule;
    try {
      rule = validationViolation(definition.validation, value);
    } catch (error) {
      throw refused(error.message);
    }
    if (rule !== null) throw refused(`it breaks the rule: ${rule}`);
  }
  if (definition.schema !== null && definition.schema !== undefined) {
    let details;
    try {
      details = schemaViolations(definition.schema, value);
    } catch (error) {
      throw refused(`its schema cannot be applied: ${error.message}`);
    }
    if (details.length > 0) throw refused(`it does not match the schema: ${details.join('; ')}`);
  }
}

/**
 * Why the unnamed members of a wiring could not be placed. It speaks in
 * positions — of the sources and args the matching was given — because what a
 * source or an arg is CALLED is its caller's to say.
 */
class MatchFailure extends Error {
  constructor(source = 0, undecided = null) {
    super(undecided !== null ? 'the types leave more than one answer' : `source ${source} fits no arg left for it`);
    this.name = 'MatchFailure';
    /** The types leave more than one answer, and `undecided` says about which sources. */
    this.ambiguous = undecided !== null;
    /** Otherwise, the source that fits no arg left for it. */
    this.source = source;
    /** Each source the minimum-cost assignments place differently, and the args they place it on. */
    this.undecided = undecided || [];
  }
}

/**
 * Every source→arg assignment of minimum total cost. `canGather[a]` gives arg
 * `a` unbounded capacity (a sequence arg in the gather phase); otherwise the
 * arg is claimed by at most one source. Empty when there is no assignment.
 */
function minimumAssignments(cost, mustBind, canGather) {
  const argCount = cost.length > 0 ? cost[0].length : 0;
  let bestCost = null;
  let best = [];
  const current = new Array(cost.length).fill(0);
  const used = new Array(argCount).fill(false);
  const place = source => {
    if (source === cost.length) {
      // A placement that leaves out the arg that must be bound is not an
      // assignment.
      if (mustBind !== null && !current.includes(mustBind)) return;
      const total = current.reduce((sum, arg, at) => sum + cost[at][arg], 0);
      if (bestCost === null || total < bestCost) {
        bestCost = total;
        best = [[...current]];
      } else if (total === bestCost) {
        best.push([...current]);
      }
      return;
    }
    for (let arg = 0; arg < argCount; arg += 1) {
      if ((used[arg] && !canGather[arg]) || cost[source][arg] === null) continue;
      const wasUsed = used[arg];
      used[arg] = true;
      current[source] = arg;
      place(source + 1);
      used[arg] = wasUsed;
    }
  };
  place(0);
  return best;
}

/**
 * The one minimum-cost assignment, as pairs — or, when several tie, a failure
 * naming the sources they disagree about.
 */
function oneAssignment(best, sources, args) {
  if (best.length === 1) {
    const pairs = best[0].map((arg, source) => [args[arg], sources[source]]);
    // Stable, and the pairs are in source order.
    pairs.sort((a, b) => compareMediaUrns(a[0], b[0]));
    return pairs;
  }
  const undecided = [];
  for (let source = 0; source < sources.length; source += 1) {
    const placed = [...new Set(best.map(assignment => assignment[source]))].sort((a, b) => a - b);
    if (placed.length >= 2) undecided.push([source, placed]);
  }
  throw new MatchFailure(0, undecided);
}

/**
 * Match a wiring's sources to a cap's args by minimum total
 * specificity-distance, with a uniqueness requirement.
 *
 * 1. Product — each source claims a distinct arg. It wins whenever such an
 *    assignment exists, including the hard failure on tied minimum-cost
 *    assignments.
 * 2. Gather — only when no such assignment exists: a sequence arg may absorb
 *    several conforming sources; a scalar arg still takes at most one.
 *
 * `mustBind` is the index of the arg an assignment MUST bind — the cap's main
 * input, when these sources are what can feed it — or null.
 *
 * @param {MediaUrn[]} sources
 * @param {MediaUrn[]} args - What each arg accepts
 * @param {boolean[]} argIsSequence
 * @param {number|null} mustBind
 * @returns {Array<[MediaUrn, MediaUrn]>} Pairs `[arg, source]` sorted by arg
 *   URN (stably: sources gathered into one arg keep their declaration order).
 * @throws {MatchFailure}
 */
function matchSourcesToArgs(sources, args, argIsSequence, mustBind) {
  const hasSequenceArg = argIsSequence.some(Boolean);
  const fitsSomething = source => args.some(arg => source.conformsTo(arg));
  const cost = sources.map((source, position) => {
    if (!fitsSomething(source)) throw new MatchFailure(position);
    return args.map(arg => {
      if (!source.conformsTo(arg)) return null;
      // How much more the source says than the arg asks: never negative.
      const distance = source.specificity() - arg.specificity();
      if (distance < 0) {
        throw new Error(`a source that conforms to an arg is never less specific than it: ${source} conforms to ${arg}`);
      }
      return distance;
    });
  });
  // An assignment binds the arg that MUST be bound: a way of placing the
  // sources that leaves the main input out is not an assignment at all. It is
  // a constraint, not a tiebreak.
  let bound = mustBind;
  if (bound !== null && !cost.some(row => row[bound] !== null)) bound = null;
  // Phase 1: product.
  if (sources.length <= args.length) {
    const best = minimumAssignments(cost, bound, new Array(args.length).fill(false));
    // A tie among minimum-cost assignments is a hard ambiguity; it never falls
    // through to gather, which would mask it.
    if (best.length > 0) return oneAssignment(best, sources, args);
  }
  // Phase 2: gather.
  if (!hasSequenceArg) throw new MatchFailure(0);
  const best = minimumAssignments(cost, bound, argIsSequence);
  if (best.length === 0) throw new MatchFailure(0);
  return oneAssignment(best, sources, args);
}

/**
 * The canonical structural order of edges that are ready together: the cap
 * URN; the assignment element-wise (the arg's slot URN, then the source — a
 * node by its URN, a constant by its text, after every node), a shorter one
 * that is a prefix of a longer one first; the outputs likewise (the output's
 * URN, then its node's URN); the isLoop flag.
 */
function compareEdges(a, b, nodes) {
  const byCap = compareCapUrns(a.capUrn, b.capUrn);
  if (byCap !== 0) return byCap;
  const compareSource = (left, right) => {
    if (left.isConstant !== right.isConstant) return left.isConstant ? 1 : -1;
    if (left.isConstant) return compareStrings(constantText(left.constant), constantText(right.constant));
    return compareMediaUrns(nodes[left.node], nodes[right.node]);
  };
  const shared = Math.min(a.assignment.length, b.assignment.length);
  for (let i = 0; i < shared; i += 1) {
    const bySlot = compareMediaUrns(a.assignment[i].capArgMediaUrn, b.assignment[i].capArgMediaUrn);
    if (bySlot !== 0) return bySlot;
    const bySource = compareSource(a.assignment[i].source, b.assignment[i].source);
    if (bySource !== 0) return bySource;
  }
  if (a.assignment.length !== b.assignment.length) return a.assignment.length - b.assignment.length;
  const sharedOutputs = Math.min(a.outputs.length, b.outputs.length);
  for (let i = 0; i < sharedOutputs; i += 1) {
    const byUrn = compareMediaUrns(a.outputs[i].outputMediaUrn, b.outputs[i].outputMediaUrn);
    if (byUrn !== 0) return byUrn;
    const byNode = compareMediaUrns(nodes[a.outputs[i].node], nodes[b.outputs[i].node]);
    if (byNode !== 0) return byNode;
  }
  if (a.outputs.length !== b.outputs.length) return a.outputs.length - b.outputs.length;
  return (a.isLoop ? 1 : 0) - (b.isLoop ? 1 : 0);
}

/**
 * Kahn's algorithm over the data-flow dependencies of the edges, ready edges
 * taken in canonical order. Edge B depends on edge A iff B is given a node A
 * produces. The edges given are acyclic: steps that wait on one another are
 * refused when the steps are placed.
 */
function topoSort(edges, nodes) {
  const producersOf = new Map();
  edges.forEach((edge, index) => {
    for (const node of edge.outputNodes()) {
      if (!producersOf.has(node)) producersOf.set(node, []);
      producersOf.get(node).push(index);
    }
  });
  const indegree = new Array(edges.length).fill(0);
  const successors = edges.map(() => []);
  edges.forEach((edge, bIndex) => {
    for (const source of edge.sourceNodes()) {
      for (const aIndex of producersOf.get(source) || []) {
        successors[aIndex].push(bIndex);
        indegree[bIndex] += 1;
      }
    }
  });
  const order = (i, j) => compareEdges(edges[i], edges[j], nodes) || i - j;
  const ready = edges.map((_, i) => i).filter(i => indegree[i] === 0).sort(order);
  const result = [];
  while (ready.length > 0) {
    const index = ready.shift();
    result.push(index);
    for (const successor of successors[index]) {
      indegree[successor] -= 1;
      if (indegree[successor] === 0) {
        ready.push(successor);
        ready.sort(order);
      }
    }
  }
  if (result.length < edges.length) {
    throw new Error(`${edges.length - result.length} of ${edges.length} placed steps wait on one another`);
  }
  return result;
}

/**
 * One wiring with its source and target slots already numbered against a
 * parallel nodes list. The resolver does no URN-based interning of its own:
 * two distinct nodes whose URNs are equivalent stay distinct, which is what
 * lets notation honor the identity of node names.
 *
 * @typedef {Object} PreInternedWiring
 * @property {string} tokenId - The step's stable identity
 * @property {CapUrn} capUrn
 * @property {Array<[string, BindingSource]>} namedSources - Members that say
 *   which arg they are for, by the arg's NAME; they bind first, as written
 * @property {number[]} sourceNodeIds - Members that name no arg: matched by type
 * @property {Array<{node: number, name: (string|null)}>} targets - The outputs
 *   taken, by their names (null: the main output). Empty: a sink.
 * @property {StepPolicy} policy
 * @property {string[]} includedAs
 */

/**
 * Resolve a wiring set into a MachineStrand.
 * @param {MediaUrn[]} nodes
 * @param {PreInternedWiring[]} wirings
 * @param {MachineDefinitions} definitions
 * @param {number} strandIndex
 * @returns {MachineStrand}
 */
function resolvePreInterned(nodes, wirings, definitions, strandIndex) {
  return resolveWirings(nodes, null, wirings, definitions, strandIndex);
}

/**
 * `resolvePreInterned` for wirings read from notation: `nodeNames` is the name
 * the text gave each node, so that a refusal about a member can say which.
 */
function resolveNamedWirings(nodes, nodeNames, wirings, definitions, strandIndex) {
  if (nodes.length !== nodeNames.length) {
    throw new Error('every node of a strand read from notation has a name');
  }
  return resolveWirings(nodes, nodeNames, wirings, definitions, strandIndex);
}

function resolveWirings(nodes, nodeNames, wirings, definitions, strandIndex) {
  if (wirings.length === 0) throw abstractionError.noCapabilitySteps();

  // Step 0: the outputs each wiring takes, by the names its targets wrote, and
  // with them the cardinality of every node: a node holds a sequence, in the
  // scope it lives in, iff the output that produces it is declared one.
  const nodeIsSequence = new Array(nodes.length).fill(false);
  const defs = [];
  const wiringOutputs = [];
  for (const wiring of wirings) {
    const capUrn = wiring.capUrn.toString();
    const definition = definitions.capDefinition(capUrn);
    if (definition === null) throw abstractionError.unknownCap(capUrn);
    defs.push(definition);
    const outputs = [];
    for (const target of wiring.targets) {
      let output;
      if (target.name === null) {
        // The unnamed target takes the main output.
        output = definition.mainOutput();
        if (output === null) throw abstractionError.noMainOutput(strandIndex, capUrn);
      } else {
        output = definition.outputNamed(target.name);
        if (output === null) {
          throw abstractionError.unknownOutputName(strandIndex, capUrn, target.name,
            definition.getOutputs().map(each => each.name));
        }
      }
      const outputMediaUrn = mustMedia(output.media_urn, 'every output media_urn');
      if (outputs.some(taken => taken.outputMediaUrn.isEquivalent(outputMediaUrn))) {
        throw abstractionError.outputTakenTwice(strandIndex, capUrn, output.name);
      }
      nodeIsSequence[target.node] = output.is_sequence === true;
      outputs.push(new EdgeOutput(outputMediaUrn, output.name, target.node));
    }
    // Canonical order, like the assignment's.
    outputs.sort((a, b) => compareMediaUrns(a.outputMediaUrn, b.outputMediaUrn));
    wiringOutputs.push(outputs);
  }

  // Step 1: per-wiring binding of sources to cap args. Named members bind
  // first; the rest are matched by type over the args no name bound.
  const voidUrn = mustMedia(MEDIA_VOID, 'media:void');
  const shapes = [];
  const assignments = [];
  wirings.forEach((wiring, index) => {
    const definition = defs[index];
    const capUrn = wiring.capUrn.toString();
    const args = definition.args;
    const capInSpec = mustMedia(definition.urn.getInSpec(), "a cap's in=");
    let primaryArgIndex = null;
    if (!capInSpec.isEquivalent(voidUrn)) {
      const found = args.findIndex(arg => arg.isMainInput(capInSpec));
      if (found < 0) throw abstractionError.capDoesNotDeclareInput(strandIndex, capUrn);
      primaryArgIndex = found;
    }
    // Every arg, by what it ACCEPTS (the type a source must conform to) and by
    // its SLOT (its media_urn, the identity a binding records and the URN its
    // stream is delivered under). How an arg is supplied on a command line
    // plays no part: every arg can be bound by a wiring.
    const argAccepts = args.map(arg => mustMedia(arg.acceptedUrn(), 'what every arg accepts'));
    const argSlots = args.map(arg => mustMedia(arg.media_urn, 'every cap arg media_urn'));

    // Named members bind first.
    const bindings = [];
    const namedCount = new Array(args.length).fill(0);
    for (const [name, source] of wiring.namedSources) {
      const argIndex = args.findIndex(arg => arg.name === name);
      if (argIndex < 0) {
        throw abstractionError.unknownArgName(strandIndex, capUrn, name, args.map(arg => arg.name));
      }
      if (source.isConstant) {
        checkConstant(definitions, capUrn, args[argIndex], source.constant, strandIndex);
      } else {
        const sourceUrn = nodes[source.node];
        if (!sourceUrn.conformsTo(argAccepts[argIndex])) {
          throw abstractionError.sourceDoesNotConformToArg(strandIndex, capUrn, name,
            argAccepts[argIndex].toString(), sourceUrn.toString());
        }
      }
      namedCount[argIndex] += 1;
      bindings.push(new EdgeAssignmentBinding(argSlots[argIndex], args[argIndex].name, source));
    }
    namedCount.forEach((count, argIndex) => {
      if (count > 1 && !args[argIndex].is_sequence) {
        throw abstractionError.argBoundTwice(strandIndex, capUrn, args[argIndex].name, count);
      }
    });

    // The unnamed members are matched by type over the args no name bound.
    const free = args.map((_, i) => i).filter(i => namedCount[i] === 0);
    const freeAccepts = free.map(i => argAccepts[i]);
    const freeIsSequence = free.map(i => args[i].is_sequence === true);
    // The main input, when no named member bound it.
    const mustBind = primaryArgIndex !== null && free.includes(primaryArgIndex) ? free.indexOf(primaryArgIndex) : null;
    const sourceUrns = wiring.sourceNodeIds.map(nodeId => nodes[nodeId]);
    if (sourceUrns.length > 0) {
      let matched;
      try {
        matched = matchSourcesToArgs(sourceUrns, freeAccepts, freeIsSequence, mustBind);
      } catch (failure) {
        if (!(failure instanceof MatchFailure)) throw failure;
        if (!failure.ambiguous) {
          throw abstractionError.unmatchedSourceInCapArgs(strandIndex, capUrn, sourceUrns[failure.source].toString());
        }
        // Which members the types leave open, by the names the text gave
        // them, and the args each could go to.
        const members = failure.undecided.map(([source, on]) => new UndecidedMember(
          nodeNames !== null ? nodeNames[wiring.sourceNodeIds[source]] : '',
          sourceUrns[source].toString(),
          on.map(arg => args[free[arg]].name),
        ));
        throw abstractionError.ambiguousMachineNotation(strandIndex, capUrn, members);
      }
      // The matching answers in URNs. Each accepted URN is translated back to
      // its slot identity, and each source URN to its position among the
      // wiring's unnamed sources, walking the positions not yet taken so that
      // two sources that share a URN stay two.
      const consumed = new Array(wiring.sourceNodeIds.length).fill(false);
      for (const [argUrn, sourceUrn] of matched) {
        const argAt = freeAccepts.findIndex(accepts => accepts.isEquivalent(argUrn));
        const sourceAt = wiring.sourceNodeIds.findIndex((nodeId, position) =>
          !consumed[position] && nodes[nodeId].isEquivalent(sourceUrn));
        if (argAt < 0 || sourceAt < 0) throw new Error('the matching answered in a URN it was not given');
        consumed[sourceAt] = true;
        bindings.push(new EdgeAssignmentBinding(argSlots[free[argAt]], args[free[argAt]].name,
          BindingSource.ofNode(wiring.sourceNodeIds[sourceAt])));
      }
    }
    // Sorted by slot identity, stably: several bindings gathered onto one arg
    // keep their declaration order — the gathered sequence's item order.
    bindings.sort((a, b) => compareMediaUrns(a.capArgMediaUrn, b.capArgMediaUrn));
    // A cap that takes an input is given it.
    if (primaryArgIndex !== null) {
      const mainSlot = argSlots[primaryArgIndex];
      if (!bindings.some(binding => binding.capArgMediaUrn.isEquivalent(mainSlot))) {
        throw abstractionError.mainInputUnbound(strandIndex, capUrn, args[primaryArgIndex].name);
      }
    }
    // What the step is given, as far as iteration is concerned. A constant
    // is one value wherever the step runs.
    const members = [];
    for (const binding of bindings) {
      if (binding.source.isConstant) continue;
      const argIndex = argSlots.findIndex(slot => slot.isEquivalent(binding.capArgMediaUrn));
      members.push({ node: binding.source.node, argIsSequence: args[argIndex].is_sequence === true });
    }
    const outputs = wiringOutputs[index].map(output => ({ node: output.node, isSequence: nodeIsSequence[output.node] }));
    shapes.push({ members, outputs });
    assignments.push(bindings);
  });

  // Step 2: which steps map. Iteration is DERIVED from cardinality, never
  // authored. Notation has no run, so an input of the machine is one value.
  let iteration;
  try {
    iteration = iterationOf(shapes, () => false);
  } catch (error) {
    if (error instanceof CyclicSteps) throw abstractionError.cyclicMachineStrand(strandIndex);
    throw error;
  }
  const indexedEdges = wirings.map((wiring, index) => new MachineEdge(
    wiring.capUrn, assignments[index], wiringOutputs[index], wiring.tokenId, {
      policy: wiring.policy,
      includedAs: wiring.includedAs,
      isLoop: iteration.steps()[index].maps,
    }));

  // Step 3: canonical edge order.
  const edges = topoSort(indexedEdges, nodes).map(index => indexedEdges[index]);

  // Step 4: anchors. Every node is a source or an output of some step; one
  // nothing produces is an input of the strand, one nothing consumes an
  // output of it.
  const produced = new Set(edges.flatMap(edge => edge.outputNodes()));
  const consumedNodes = new Set(edges.flatMap(edge => edge.sourceNodes()));
  const inputAnchorIds = [];
  const outputAnchorIds = [];
  for (let nodeId = 0; nodeId < nodes.length; nodeId += 1) {
    if (!produced.has(nodeId) && !consumedNodes.has(nodeId)) {
      throw new Error(`node ${nodeId} of strand ${strandIndex} is touched by no wiring`);
    }
    if (!produced.has(nodeId)) inputAnchorIds.push(nodeId);
    if (!consumedNodes.has(nodeId)) outputAnchorIds.push(nodeId);
  }
  // Anchors come by the URN they hold, then by node id, so the result is
  // stable across node-allocation orders that yield equivalent strands.
  const byUrnThenId = (a, b) => compareMediaUrns(nodes[a], nodes[b]) || a - b;
  inputAnchorIds.sort(byUrnThenId);
  outputAnchorIds.sort(byUrnThenId);
  return new MachineStrand(nodes, edges, inputAnchorIds, outputAnchorIds, nodeIsSequence);
}

// ============================================================================
// Machines in step position: where another machine's notation comes from, and
// what a machine looks like to the machine that includes it.
//
// A header `alias machine "<reference>"` names another machine. The reference
// is an opaque string: the host resolves it through one interface,
// MachineSource. The parser reads the referenced notation, resolves it on its
// own, and writes its steps into the including machine with node positions of
// their own (capdag/docs/09-machine-notation.md, §Machines in step position).
// ============================================================================

/** Why a reference did not yield a machine. */
class MachineSourceError extends Error {
  /**
   * @param {string} details - What the source found
   * @param {boolean} [noSource] - The notation is being read with nothing to
   *   resolve references against
   */
  constructor(details = '', noSource = false) {
    super(noSource ? 'there is nothing to resolve machine references against' : details);
    this.name = 'MachineSourceError';
    this.noSource = noSource;
    this.details = details;
  }
}

/**
 * Where the machines named in machine headers come from. `load(reference,
 * including)` returns `{ id, notation }`: what the source knows the machine by
 * (two references to one machine yield one id — it is what a circle of
 * inclusions is recognized by, and what a reference written inside it is
 * resolved relative to) and its notation. `including` is the id of the machine
 * whose header wrote the reference, or null when that machine came from no
 * place the source knows. It throws MachineSourceError when the reference
 * yields no machine.
 */
class MachineSource {
  load(_reference, _including) {
    throw new Error('a MachineSource says how it loads a machine');
  }
}

/** The source of a host that resolves no references. A machine header read against it is refused. */
class NoMachineSource extends MachineSource {
  load() {
    throw new MachineSourceError('', true);
  }
}

/**
 * The id a FileMachineSource gives the machine in the file at `path`: what to
 * name the including machine by, so that its own references are read relative
 * to it and an inclusion of it is recognized.
 */
function fileMachineId(filePath) {
  const { fs } = nodeModules('reading a machine from a file');
  try {
    return fs.realpathSync(filePath);
  } catch (error) {
    throw new MachineSourceError(`${filePath}: ${error.message}`);
  }
}

/**
 * Machines in files. A reference is a path: relative to the directory of the
 * including file, or to the base when the including machine came from no
 * file. A machine's id is its file's canonical path.
 */
class FileMachineSource extends MachineSource {
  constructor(base) {
    super();
    this._base = base;
  }

  load(reference, including) {
    const { fs, path } = nodeModules('reading a machine from a file');
    const directory = including === null ? this._base : path.dirname(including);
    const filePath = path.join(directory, reference);
    const id = fileMachineId(filePath);
    let notation;
    try {
      notation = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filePath));
    } catch (error) {
      throw new MachineSourceError(`${filePath}: ${error.message}`);
    }
    return { id, notation };
  }
}

/**
 * Machines in memory, each under the reference that names it. A reference
 * names the same machine wherever it is written. For a host that loads the
 * machines a notation refers to before it parses, and for tests.
 */
class MapMachineSource extends MachineSource {
  constructor() {
    super();
    this._machines = new Map();
  }

  /** Hold `notation` under `reference`. */
  insert(reference, notation) {
    this._machines.set(reference, notation);
    return this;
  }

  load(reference) {
    if (!this._machines.has(reference)) {
      throw new MachineSourceError(`no machine is held under "${reference}"`);
    }
    return { id: reference, notation: this._machines.get(reference) };
  }
}

/**
 * A machine as the machine that includes it sees it: its inputs and outputs,
 * by the names its notation wrote, and its steps — each step with every member
 * under the name of the arg its own resolution bound it to and every target
 * under the name of the output it takes. Written into another machine, a step
 * binds what it bound alone: nothing about where it is included can change it.
 */
class IncludedMachine {
  constructor() {
    /** Every input anchor, by name, with the media it holds. */
    this.inputs = [];
    this.outputs = [];
    /** Every node, by name, with the media it holds in the machine as it resolved alone. */
    this.nodeMedia = [];
    /** `{ capUrn, policy, members: [[argName, {isConstant, node, constant}]], targets: [[outputName, node]], includedAs }` */
    this.steps = [];
  }

  inputNames() {
    return this.inputs.map(([name]) => name);
  }

  outputNames() {
    return this.outputs.map(([name]) => name);
  }

  /** The media the input of that name holds, or null. */
  input(name) {
    const found = this.inputs.find(([each]) => each === name);
    return found ? found[1] : null;
  }

  /** The media the output of that name holds, or null. */
  output(name) {
    const found = this.outputs.find(([each]) => each === name);
    return found ? found[1] : null;
  }
}

/**
 * Read a resolved machine, with the names its notation wrote (`names[i]` maps
 * a node name of strand `i` to its node id).
 * @param {Machine} machine
 * @param {Array<Map<string, number>>} names
 * @returns {IncludedMachine}
 */
function includedMachineOf(machine, names) {
  const included = new IncludedMachine();
  machine.strands().forEach((strand, strandIndex) => {
    const nameOf = new Map([...names[strandIndex].entries()].map(([name, id]) => [id, name]));
    const name = id => {
      if (!nameOf.has(id)) throw new Error('the parser names every node of a strand it resolved');
      return nameOf.get(id);
    };
    const anchors = ids => ids.map(id => [name(id), strand.nodeUrn(id)])
      .sort((a, b) => compareStrings(a[0], b[0]));
    included.nodeMedia.push(...anchors(strand.nodes().map((_, id) => id)));
    included.inputs.push(...anchors(strand.inputAnchorIds()));
    included.outputs.push(...anchors(strand.outputAnchorIds()));
    for (const edge of strand.edges()) {
      included.steps.push({
        capUrn: edge.capUrn,
        policy: edge.policy,
        includedAs: [...edge.includedAs],
        members: edge.assignment.map(binding => [binding.argName, binding.source.isConstant
          ? { isConstant: true, node: null, constant: binding.source.constant }
          : { isConstant: false, node: name(binding.source.node), constant: undefined }]),
        targets: edge.outputs.map(output => [output.outputName, name(output.node)]),
      });
    }
  });
  return included;
}

// ============================================================================
// The notation parser: the grammar, then anchor realization.
//
// 1. Lexical / grammatical — `parseSyntax` reads the text into statements.
//    Failures here surface as MachineSyntaxError.
// 2. Resolution — the wirings are partitioned into connected components (one
//    per maximal set of wirings sharing node names), each component is given
//    to the resolver, and the resulting strands are assembled into a Machine
//    in the order each component first appears. Failures here surface as
//    MachineAbstractionError.
//
// The media URN of a node: every node has one URN, derived from the wirings
// that touch it; where a member stands in its group never decides it (09 §The
// URN of a node):
// - a node some step produces has the URN of what that output carries;
// - a node nothing produces, as a named member, has the accepted type of the
//   arg it names;
// - as an unnamed member that nothing else gives a URN, it has the accepted
//   type of the step's main input — at most one such member per wiring, and
//   only while no named member bound the main input (UntypedMachineInput
//   otherwise);
// - URNs given to one node must be on one specialization chain
//   (NodeMediaConflict otherwise); the node has the most specific.
// ============================================================================

function rawSourceNodes(wiring) {
  return wiring.sources.filter(member => !member.value.isConstant).map(member => member.value.node);
}

function rawNodes(wiring) {
  return [...rawSourceNodes(wiring), ...wiring.targets.map(target => target.node)];
}

function rawUnnamedNodes(wiring) {
  return wiring.sources.filter(member => member.name === null && !member.value.isConstant)
    .map(member => member.value.node);
}

/** A tiny union-find structure for the connected-components partition. */
class UnionFind {
  constructor(count) {
    this._parent = Array.from({ length: count }, (_, i) => i);
    this._rank = new Array(count).fill(0);
  }

  find(x) {
    while (this._parent[x] !== x) {
      this._parent[x] = this._parent[this._parent[x]];
      x = this._parent[x];
    }
    return x;
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (this._rank[ra] < this._rank[rb]) this._parent[ra] = rb;
    else if (this._rank[ra] > this._rank[rb]) this._parent[rb] = ra;
    else { this._parent[rb] = ra; this._rank[ra] += 1; }
  }
}

/**
 * The connected components of a wiring set: two wirings are in one iff a path
 * of shared node names joins them. A wiring that touches no node at all
 * (`() -> tick -> ()`) is a component of its own. Components come in the
 * order each first appears; each lists its wirings in the order written.
 */
function componentsOf(wirings) {
  const union = new UnionFind(wirings.length);
  const firstWiring = new Map();
  wirings.forEach((wiring, index) => {
    for (const node of rawNodes(wiring)) {
      if (firstWiring.has(node)) union.union(firstWiring.get(node), index);
      else firstWiring.set(node, index);
    }
  });
  const groups = new Map();
  wirings.forEach((_, index) => {
    const root = union.find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  });
  return [...groups.values()].sort((a, b) => a[0] - b[0]);
}

/**
 * Give `node` the URN `media`, beside any URN it was already given: the two
 * must be on one specialization chain, and the node holds the more specific.
 */
function giveMedia(nodeMedia, node, media) {
  const existing = nodeMedia.get(node);
  if (existing === undefined) {
    nodeMedia.set(node, media);
    return;
  }
  if (!existing.isComparable(media)) {
    throw abstractionError.nodeMediaConflict(node, existing.toString(), media.toString());
  }
  if (media.specificity() > existing.specificity()) nodeMedia.set(node, media);
}

/**
 * Give every node of one strand its media URN. The result does not depend on
 * the order of the wirings: what produces a node and what names it are read
 * first, for every wiring; only then is each wiring asked for the one unnamed
 * machine input its main input can type, against what the first two passes
 * left untyped.
 *
 * A node written in from an included machine comes with the type it held
 * there (`includedMedia`). A step that is a machine (`machines`) gives each
 * node it produces the type of the output that node takes, and each input of
 * this machine it is given BY NAME the type of that input; it has no main
 * input to type an unnamed one by.
 */
function typeNodes(wirings, aliasMap, machines, includedMedia, definitions, strandIndex) {
  const capOf = wiring => {
    const capUrn = aliasMap.get(wiring.capAlias).capUrn;
    const definition = definitions.capDefinition(capUrn.toString());
    if (definition === null) throw abstractionError.unknownCap(capUrn.toString());
    return [capUrn, definition];
  };
  const media = text => mustMedia(text, "a definition's media URNs");
  const voidUrn = media(MEDIA_VOID);
  const mainInputOf = (wiring, capUrn) => {
    let inMedia;
    try {
      inMedia = capUrn.inMediaUrn();
    } catch (error) {
      throw syntaxError.invalidMediaUrn(wiring.capAlias, `in= spec: ${error.message}`, wiring.stepLocation);
    }
    return inMedia.isEquivalent(voidUrn) ? null : inMedia;
  };

  const nodeMedia = new Map();
  for (const wiring of wirings) {
    for (const node of rawNodes(wiring)) {
      if (includedMedia.has(node)) giveMedia(nodeMedia, node, includedMedia.get(node));
    }
  }

  // What produces a node, and — for a node nothing produces — what names it.
  const produced = new Set(wirings.flatMap(wiring => wiring.targets.map(target => target.node)));
  for (const wiring of wirings) {
    const machine = machines.get(wiring.capAlias);
    if (machine !== undefined) {
      for (const target of wiring.targets) {
        // Every target of a machine step was named against its outputs.
        giveMedia(nodeMedia, target.node, machine.output(target.name));
      }
      for (const member of wiring.sources) {
        if (member.name === null || member.value.isConstant) continue;
        const accepts = machine.input(member.name);
        if (accepts === null) {
          throw abstractionError.unknownMachineInput(wiring.position, wiring.capAlias, member.name, machine.inputNames());
        }
        if (!produced.has(member.value.node)) giveMedia(nodeMedia, member.value.node, accepts);
      }
      continue;
    }
    const [capUrn, definition] = capOf(wiring);
    for (const target of wiring.targets) {
      let held;
      if (target.name === null) {
        // The main output: the cap URN's `out=`.
        try {
          held = capUrn.outMediaUrn();
        } catch (error) {
          throw syntaxError.invalidMediaUrn(wiring.capAlias, `out= spec: ${error.message}`, wiring.stepLocation);
        }
      } else {
        const output = definition.outputNamed(target.name);
        if (output === null) {
          throw abstractionError.unknownOutputName(strandIndex, capUrn.toString(), target.name,
            definition.getOutputs().map(each => each.name));
        }
        held = media(output.media_urn);
        if (output.carries !== null) {
          // An output that carries the input holds the input's type.
          const inMedia = mainInputOf(wiring, capUrn);
          if (inMedia !== null) held = inMedia;
        }
      }
      giveMedia(nodeMedia, target.node, held);
    }
    for (const member of wiring.sources) {
      if (member.name === null || member.value.isConstant) continue;
      const arg = definition.argNamed(member.name);
      if (arg === null) {
        throw abstractionError.unknownArgName(strandIndex, capUrn.toString(), member.name,
          definition.args.map(each => each.name));
      }
      // A node some step produces has that output's type; whether it conforms
      // to the arg it is named into is the resolver's to say. The name types
      // an input of the machine, which has no other type.
      if (!produced.has(member.value.node)) giveMedia(nodeMedia, member.value.node, media(arg.acceptedUrn()));
    }
  }

  // What a step's MAIN input says of the unnamed member that feeds it. Where
  // exactly one unnamed member can be it, that member's node is given the type
  // the main input accepts:
  // - a member nothing above gave a URN is an input of the machine whose arg
  //   nothing says: one such member per wiring is the main input, and only
  //   that (UntypedMachineInput otherwise);
  // - failing that, the one unnamed member whose URN is on the main input's
  //   specialization chain is refined to it.
  // Read against what the passes above left, for every wiring, before any of
  // it is applied: the order of the wirings changes nothing.
  const fromMainInput = [];
  for (const wiring of wirings) {
    if (machines.has(wiring.capAlias)) continue;
    const unnamed = rawUnnamedNodes(wiring);
    if (unnamed.length === 0) continue;
    const [capUrn, definition] = capOf(wiring);
    const mainInput = mainInputOf(wiring, capUrn);
    let mainNamed = false;
    if (mainInput !== null) {
      const mainArg = definition.args.find(arg => arg.isMainInput(mainInput));
      if (mainArg !== undefined) mainNamed = wiring.sources.some(member => member.name === mainArg.name);
    }
    const untyped = unnamed.filter(node => !nodeMedia.has(node));
    if (untyped.length === 0) {
      if (mainInput !== null && !mainNamed) {
        const onChain = unnamed.filter(node => nodeMedia.get(node).isComparable(mainInput));
        if (onChain.length === 1) fromMainInput.push([onChain[0], mainInput]);
      }
    } else if (untyped.length === 1 && mainInput !== null && !mainNamed) {
      fromMainInput.push([untyped[0], mainInput]);
    } else {
      throw abstractionError.untypedMachineInput(wiring.position, capUrn.toString(), untyped);
    }
  }
  for (const [node, given] of fromMainInput) giveMedia(nodeMedia, node, given);

  // A machine step has no main input: an unnamed member that nothing above
  // gave a type has none to be matched by.
  for (const wiring of wirings) {
    if (!machines.has(wiring.capAlias)) continue;
    const untyped = rawUnnamedNodes(wiring).filter(node => !nodeMedia.has(node));
    if (untyped.length > 0) throw abstractionError.untypedMachineMember(wiring.position, wiring.capAlias, untyped);
  }
  return nodeMedia;
}

/**
 * Write every step that is a machine out as the steps of that machine (09
 * §Machines in step position).
 *
 * A machine step binds like a cap step: a named member to the input of that
 * name, the unnamed members to the inputs left by type — read off the wirings
 * as they were written, before anything is written out. A machine has no main
 * input and no main output: an unnamed member with no type of its own has
 * nothing to be matched by, and an unnamed target takes the one output the
 * other targets leave.
 *
 * The steps written in are the included machine's as IT resolved them: each
 * member under the name of the arg it was bound to, each node holding the type
 * it held there (`includedMedia`). A node inside the included machine becomes
 * a node of this one under a name nothing written can bear (`alias#use/name`);
 * an input becomes what was bound to it; an output becomes the node that takes
 * it, and an output nothing takes is not taken from the step that produces it.
 */
function includeMachines(wirings, aliasMap, machines, includedMedia, definitions) {
  // What each machine step takes, by output name. Its unnamed target is given
  // its name here, so that everything after reads names alone.
  for (const wiring of wirings) {
    const machine = machines.get(wiring.capAlias);
    if (machine === undefined) continue;
    if (!wiring.policy.isDefault()) throw abstractionError.policyOnMachine(wiring.position, wiring.capAlias);
    const taken = new Set();
    for (const target of wiring.targets) {
      if (target.name === null) continue;
      if (machine.output(target.name) === null) {
        throw abstractionError.unknownMachineOutput(wiring.position, wiring.capAlias, target.name, machine.outputNames());
      }
      if (taken.has(target.name)) throw abstractionError.machineOutputTakenTwice(wiring.position, wiring.capAlias, target.name);
      taken.add(target.name);
    }
    for (const target of wiring.targets) {
      if (target.name !== null) continue;
      const left = machine.outputNames().filter(output => !taken.has(output));
      if (left.length !== 1) throw abstractionError.unnamedMachineTarget(wiring.position, wiring.capAlias, left);
      target.name = left[0];
    }
  }

  // The type of every node, as the wirings were written.
  const mediaOf = new Array(wirings.length).fill(null);
  componentsOf(wirings).forEach((memberIndices, strandIndex) => {
    if (!memberIndices.some(index => machines.has(wirings[index].capAlias))) return;
    const nodeMedia = typeNodes(memberIndices.map(index => wirings[index]), aliasMap, machines, includedMedia, definitions, strandIndex);
    for (const index of memberIndices) {
      if (machines.has(wirings[index].capAlias)) mediaOf[index] = nodeMedia;
    }
  });

  const uses = new Map();
  const written = [];
  wirings.forEach((wiring, index) => {
    const machine = machines.get(wiring.capAlias);
    if (machine === undefined) {
      written.push(wiring);
      return;
    }
    const nodeMedia = mediaOf[index];
    const alias = wiring.capAlias;
    const position = wiring.position;

    // Named members bind first, each to the input it names.
    const bound = new Map();
    for (const member of wiring.sources) {
      if (member.name === null) continue;
      const accepts = machine.input(member.name);
      if (accepts === null) throw abstractionError.unknownMachineInput(position, alias, member.name, machine.inputNames());
      if (bound.has(member.name)) {
        const count = wiring.sources.filter(other => other.name === member.name).length;
        throw abstractionError.machineInputBinding(position, alias, member.name, count);
      }
      if (!member.value.isConstant) {
        const held = nodeMedia.get(member.value.node);
        if (!held.conformsTo(accepts)) {
          throw abstractionError.sourceDoesNotConformToMachineInput(position, alias, member.name, accepts.toString(), held.toString());
        }
      }
      bound.set(member.name, member.value);
    }

    // The unnamed members, to the inputs left, by type alone.
    const unnamed = rawUnnamedNodes(wiring);
    if (unnamed.length > 0) {
      const free = machine.inputs.filter(([name]) => !bound.has(name));
      const sources = unnamed.map(node => nodeMedia.get(node));
      const accepted = free.map(([, media]) => media);
      let pairs;
      try {
        pairs = matchSourcesToArgs(sources, accepted, new Array(accepted.length).fill(false), null);
      } catch (failure) {
        if (!(failure instanceof MatchFailure)) throw failure;
        if (!failure.ambiguous) throw abstractionError.unmatchedMachineMember(position, alias, sources[failure.source].toString());
        const members = failure.undecided.map(([at, on]) => new UndecidedMember(
          unnamed[at], sources[at].toString(), on.map(inputAt => free[inputAt][0])));
        throw abstractionError.ambiguousMachineMembers(position, alias, members);
      }
      // Where the matching is unique no two members and no two inputs it
      // paired hold one type — two that did would swap — so each pair names
      // one member and one input.
      const placed = new Array(unnamed.length).fill(false);
      for (const [argUrn, sourceUrn] of pairs) {
        const inputAt = free.findIndex(([name, media]) => !bound.has(name) && media.toString() === argUrn.toString());
        const memberAt = unnamed.findIndex((_, i) => !placed[i] && sources[i].toString() === sourceUrn.toString());
        if (inputAt < 0 || memberAt < 0) throw new Error('the matching pairs every member with an input it was given');
        placed[memberAt] = true;
        bound.set(free[inputAt][0], { isConstant: false, node: unnamed[memberAt], constant: undefined });
      }
    }
    for (const [name] of machine.inputs) {
      if (!bound.has(name)) throw abstractionError.machineInputBinding(position, alias, name, 0);
    }

    // Output name → the node that takes it. Every target was named above.
    const takenBy = new Map(wiring.targets.map(target => [target.name, target.node]));

    // The steps, written in.
    uses.set(alias, (uses.get(alias) || 0) + 1);
    const instance = `${alias}#${uses.get(alias)}`;
    const inside = node => `${instance}/${node}`;
    for (const [name, media] of machine.nodeMedia) {
      if (machine.input(name) === null && !takenBy.has(name)) includedMedia.set(inside(name), media);
    }
    machine.steps.forEach((step, stepIndex) => {
      const stepAlias = `${instance}/${stepIndex}`;
      aliasMap.set(stepAlias, { capUrn: step.capUrn, position });
      const inlined = {
        sources: [],
        capAlias: stepAlias,
        stepLocation: wiring.stepLocation,
        policy: step.policy,
        targets: [],
        position,
        // The step came through this use, and then through whatever uses it
        // had already come through inside the included machine.
        includedAs: [instance, ...step.includedAs],
      };
      for (const [arg, value] of step.members) {
        let given;
        if (value.isConstant) given = { isConstant: true, node: null, constant: value.constant };
        else if (bound.has(value.node)) given = bound.get(value.node);
        else given = { isConstant: false, node: inside(value.node), constant: undefined };
        inlined.sources.push({ name: arg, value: given });
      }
      for (const [output, node] of step.targets) {
        if (takenBy.has(node)) inlined.targets.push({ name: output, node: takenBy.get(node) });
        else if (machine.output(node) === null) inlined.targets.push({ name: output, node: inside(node) });
        // Otherwise an output of the machine that nothing here takes.
      }
      written.push(inlined);
    });
  });
  return written;
}

/**
 * Parse one machine. `including` is every machine whose parse this one is
 * inside of, this one last when it has an id.
 */
function parseProgram(input, definitions, source, id, including) {
  if (input.trim().length === 0) throw syntaxError.empty();

  // Phase 1: the text, read into statements. The text is read whole — the
  // grammar takes whitespace around statements — so that every location is
  // where it stands in what was given.
  const statements = parseSyntax(input);

  // Phase 2: headers and wirings.
  const aliasMap = new Map();
  const machineHeaders = [];
  // Every alias a header declares, in the order written: cap headers and
  // machine headers name steps in one space.
  const declared = [];
  let wirings = [];
  for (const statement of statements) {
    if (statement.kind === SYNTAX_CAP_HEADER) {
      let parsed;
      try {
        parsed = CapUrn.fromString(statement.capUrn);
      } catch (error) {
        throw syntaxError.invalidCapUrn(statement.alias, error.message, statement.capUrnLocation);
      }
      declared.push(statement);
      if (!aliasMap.has(statement.alias)) {
        aliasMap.set(statement.alias, { capUrn: parsed, position: statement.position, location: statement.location, aliasLocation: statement.aliasLocation, capUrnLocation: statement.capUrnLocation });
      }
    } else if (statement.kind === SYNTAX_MACHINE_HEADER) {
      declared.push(statement);
      machineHeaders.push(statement);
    } else {
      const wiring = statement.wiring;
      wirings.push({
        sources: wiring.sources.map(member => ({
          name: member.name,
          location: member.valueLocation,
          value: { isConstant: member.isConstant, node: member.node, constant: member.constant },
        })),
        capAlias: wiring.step,
        stepLocation: wiring.stepLocation,
        policy: wiring.policy,
        targets: wiring.targets.map(target => ({ name: target.name, node: target.node, location: target.valueLocation })),
        position: statement.position,
        includedAs: [],
      });
    }
  }

  // Phase 3: no alias is declared twice.
  const firstDeclared = new Map();
  for (const statement of declared) {
    if (firstDeclared.has(statement.alias)) {
      throw syntaxError.duplicateAlias(statement.alias, firstDeclared.get(statement.alias), statement.aliasLocation);
    }
    firstDeclared.set(statement.alias, statement.position);
  }
  if (wirings.length === 0 && declared.length > 0) throw syntaxError.noEdges(declared[declared.length - 1].location);
  if (wirings.length === 0) throw syntaxError.empty();

  // Phase 3a: the machines the machine headers name, each resolved on its own
  // before anything here is. A machine is what it is alone: where it is
  // included changes nothing about it.
  const machines = new Map();
  for (const header of machineHeaders) {
    let loaded;
    try {
      loaded = source.load(header.reference, id);
    } catch (error) {
      if (!(error instanceof MachineSourceError)) throw error;
      if (error.noSource) throw syntaxError.machineReferenceWithoutSource(header.alias, header.reference, header.referenceLocation);
      throw abstractionError.unknownMachineReference(header.alias, header.reference, error.details);
    }
    const at = including.indexOf(loaded.id);
    if (at >= 0) throw abstractionError.cyclicMachineReference([...including.slice(at), loaded.id]);
    including.push(loaded.id);
    let parsed;
    try {
      parsed = parseProgram(loaded.notation, definitions, source, loaded.id, including);
    } catch (error) {
      // A circle is one fact about the whole, said once: it is not a defect
      // of each machine on the way round.
      if (error instanceof MachineAbstractionError && error.code === MachineAbstractionErrorCodes.CYCLIC_MACHINE_REFERENCE) throw error;
      if (error instanceof MachineSyntaxError || error instanceof MachineAbstractionError) {
        throw abstractionError.invalidIncludedMachine(header.alias, header.reference, error);
      }
      throw error;
    } finally {
      including.pop();
    }
    machines.set(header.alias, includedMachineOf(parsed.machine, parsed.nodeNames));
  }

  // Phase 3b: a step name no header defines is taken to be a fabric cap alias
  // and resolved through the definitions — before it is declared undefined.
  // An alias that points at a media URN in step position is a hard error; a
  // name that resolves to nothing is left for the undefined-alias error.
  const seenUnresolved = new Set();
  for (const wiring of wirings) {
    const name = wiring.capAlias;
    if (aliasMap.has(name) || machines.has(name) || seenUnresolved.has(name)) continue;
    seenUnresolved.add(name);
    const target = typeof definitions.aliasTarget === 'function' ? definitions.aliasTarget(name) : null;
    if (target === null || target === undefined) continue;
    let resolved;
    try {
      resolved = CapUrn.fromString(target);
    } catch (_) {
      throw syntaxError.aliasNotACap(name, target, wiring.stepLocation);
    }
    // A synthetic position past every real statement.
    aliasMap.set(name, { capUrn: resolved, position: declared.length + wirings.length + aliasMap.size, location: null, aliasLocation: null, capUrnLocation: null, fromFabric: true });
  }

  // Phase 4: every step is defined, and no node bears a step's name.
  const isStep = name => aliasMap.has(name) || machines.has(name);
  for (const wiring of wirings) {
    if (!isStep(wiring.capAlias)) throw syntaxError.undefinedAlias(wiring.capAlias, wiring.stepLocation);
    for (const member of wiring.sources) {
      if (!member.value.isConstant && isStep(member.value.node)) {
        throw syntaxError.nodeAliasCollision(member.value.node, member.value.node, member.location);
      }
    }
    for (const target of wiring.targets) {
      if (isStep(target.node)) throw syntaxError.nodeAliasCollision(target.node, target.node, target.location);
    }
  }

  // Phase 4a: every step that is a machine is written out as the steps of
  // that machine. From here on the wirings are of caps alone.
  const includedMedia = new Map();
  if (wirings.some(wiring => machines.has(wiring.capAlias))) {
    wirings = includeMachines(wirings, aliasMap, machines, includedMedia, definitions);
  }
  const noMachines = new Map();

  // Phase 5 and 6: connected components, in the order each first appears;
  // per component, node typing, numbering and resolution. Node ids are given
  // in the order node names are met, walking the wirings as written. Two
  // distinct node names that share a media URN stay two nodes.
  const strands = [];
  const nodeNames = [];
  const nodeMediaByName = new Map();
  componentsOf(wirings).forEach((memberIndices, strandIndex) => {
    const members = memberIndices.map(index => wirings[index]);
    const nodeMedia = typeNodes(members, aliasMap, noMachines, includedMedia, definitions, strandIndex);
    const nodes = [];
    const nameToId = new Map();
    const intern = name => {
      if (nameToId.has(name)) return nameToId.get(name);
      if (!nodeMedia.has(name)) throw new Error(`every node of the strand was given its URN: ${name}`);
      const nodeId = nodes.length;
      nodes.push(nodeMedia.get(name));
      nameToId.set(name, nodeId);
      return nodeId;
    };
    const preInterned = members.map(wiring => {
      const pre = {
        // Notation has no resolved-strand step to inherit an identity from:
        // each wiring's step is given its own.
        tokenId: mintStepToken(),
        capUrn: aliasMap.get(wiring.capAlias).capUrn,
        namedSources: [],
        sourceNodeIds: [],
        targets: [],
        policy: wiring.policy,
        includedAs: [...wiring.includedAs],
      };
      for (const member of wiring.sources) {
        if (member.name !== null && member.value.isConstant) {
          pre.namedSources.push([member.name, BindingSource.ofConstant(member.value.constant)]);
        } else if (member.name !== null) {
          pre.namedSources.push([member.name, BindingSource.ofNode(intern(member.value.node))]);
        } else if (member.value.isConstant) {
          throw new Error('the syntax refuses a constant that names no arg');
        } else {
          pre.sourceNodeIds.push(intern(member.value.node));
        }
      }
      for (const target of wiring.targets) pre.targets.push({ node: intern(target.node), name: target.name });
      return pre;
    });
    const namesById = new Array(nodes.length).fill('');
    for (const [name, nodeId] of nameToId) namesById[nodeId] = name;
    strands.push(resolveNamedWirings(nodes, namesById, preInterned, definitions, strandIndex));
    nodeNames.push(nameToId);
    for (const [name, nodeId] of nameToId) nodeMediaByName.set(name, nodes[nodeId]);
  });
  return { machine: new Machine(strands), nodeNames, statements, aliasMap, machines, nodeMedia: nodeMediaByName };
}

/**
 * Parse machine notation into a Machine.
 *
 * @param {string} input - Machine notation
 * @param {MachineDefinitions} definitions - Where the caps the machine names,
 *   and the media its constants are held to, are defined
 * @param {Object} [options]
 * @param {MachineSource} [options.source] - Where the machines its machine
 *   headers name come from; without one, a machine header is refused
 * @param {string} [options.id] - What the source knows this machine by: the
 *   references it writes are resolved relative to it, and an inclusion of it
 *   from inside is a circle
 * @returns {Machine}
 * @throws {MachineSyntaxError|MachineAbstractionError}
 */
function parseMachine(input, definitions, options = {}) {
  return parseMachineWithAST(input, definitions, options).machine;
}

/**
 * The machine a path of the cap fabric is: one strand, each edge a step whose
 * main input is fed by the step before it. A path carries the definitions of
 * its caps, so they are what it is read against. The counterpart of the
 * reference's `Machine::from_strand`: what a planner found becomes notation,
 * and runs as notation does.
 *
 * @param {CapFabEdge[]} path
 * @returns {Machine}
 * @throws {Error} on an empty path or an edge without its cap
 * @throws {MachineAbstractionError} when the caps do not chain
 */
function machineFromCapPath(path) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new Error('a path of the cap fabric has at least one edge');
  }
  path.forEach((edge, index) => {
    if (!(edge instanceof CapFabEdge) || !(edge.cap instanceof Cap)) {
      throw new Error(`path edge ${index} is not a cap fabric edge carrying its cap`);
    }
  });
  const headers = path.map((edge, index) => `[step_${index} ${edge.cap.urn.toString()}]`).join('');
  const wirings = path.map((_, index) => `[n${index} -> step_${index} -> n${index + 1}]`).join('');
  return parseMachine(headers + wirings, new CapDefinitions().addCaps(path.map(edge => edge.cap)));
}

/**
 * Parse machine notation and keep what was read on the way: the statements
 * with every part's location (for editor support), the alias map, the names
 * the text gave each strand's nodes (`nodeNames[i]` maps a name of strand `i`
 * to its node id — a host addresses a machine's inputs and outputs by them)
 * and each node's media by name.
 *
 * What comes back is the inlined whole: every step of every included machine
 * is a step of this one, and no reference is left.
 *
 * @param {string} input
 * @param {MachineDefinitions} definitions
 * @param {Object} [options] - `source` and `id`, as for parseMachine
 * @returns {{ machine: Machine, statements: Object[], aliasMap: Map, nodeNames: Array<Map<string, number>>, nodeMedia: Map<string, MediaUrn> }}
 * @throws {MachineSyntaxError|MachineAbstractionError}
 */
function parseMachineWithAST(input, definitions, options = {}) {
  if (definitions === null || definitions === undefined || typeof definitions.capDefinition !== 'function') {
    throw new Error('parsing a machine takes the definitions of the caps it names');
  }
  const source = options.source || new NoMachineSource();
  const id = options.id !== undefined ? options.id : null;
  const result = parseProgram(input, definitions, source, id, id === null ? [] : [id]);
  return {
    machine: result.machine,
    statements: result.statements,
    aliasMap: result.aliasMap,
    nodeNames: result.nodeNames,
    nodeMedia: result.nodeMedia,
  };
}

// ============================================================================
// The canonical text of a Machine.
//
// The serializer walks the strands in declaration order and emits one notation
// document covering all of them. Two strictly-equivalent Machines produce
// byte-identical notation, because both the canonical edge order within each
// strand and the allocation of step and node names are deterministic functions
// of the resolved structure.
//
// All headers come first, then all wirings. Steps are named `edge_<n>` in the
// order of the walk across all strands; nodes are named `n<n>` in the order the
// walk first meets them. Strand boundaries are unmarked: the parser recovers
// them from shared node names, and each strand's node names are a range of its
// own.
// ============================================================================

/** Each statement wrapped in `[...]`: the canonical, single-line form used as a stable identifier. */
const NOTATION_FORMAT_BRACKETED = 'bracketed';
/** One statement per line, no brackets. */
const NOTATION_FORMAT_LINE_BASED = 'line-based';

/**
 * Name every step and node of the machine. With `aliases` (anything with
 * `displayAliasForUrn(capUrn)`: CapDefinitions, FabricRegistryClient), a cap
 * that has a display alias is written by it.
 */
function serializationPlan(machine, aliases) {
  const plans = [];
  let nextAlias = 0;
  let nextNode = 0;
  for (const strand of machine.strands()) {
    const plan = { edgeTokens: [], needsHeader: [], nodeNames: new Array(strand.nodes().length).fill('') };
    for (const edge of strand.edges()) {
      let token = `edge_${nextAlias}`;
      let needsHeader = true;
      if (aliases !== null) {
        const alias = aliases.displayAliasForUrn(edge.capUrn.toString());
        if (alias !== null && alias !== undefined) {
          token = alias;
          needsHeader = false;
        }
      }
      plan.edgeTokens.push(token);
      plan.needsHeader.push(needsHeader);
      nextAlias += 1;
    }
    // Nodes are named in the order the canonical edge walk first meets them:
    // each edge's sources in assignment order, then its outputs. The name of a
    // node is then a property of the machine, not of the order its nodes
    // happened to be allocated in.
    const named = new Array(strand.nodes().length).fill(false);
    for (const edge of strand.edges()) {
      for (const node of [...edge.sourceNodes(), ...edge.outputNodes()]) {
        if (!named[node]) {
          plan.nodeNames[node] = `n${nextNode}`;
          named[node] = true;
          nextNode += 1;
        }
      }
    }
    named.forEach((isNamed, node) => {
      if (!isNamed) throw new Error(`every node of a strand is a source or an output of an edge: node ${node} is neither`);
    });
    plans.push(plan);
  }
  return plans;
}

/**
 * One wiring statement for an edge, without brackets. Every binding is written
 * under its arg's name and every taken output under its output's name, in the
 * canonical (URN-sorted) order of the edge: nothing is left for a reader to
 * match by type. A gather writes its arg's name once per member, in item
 * order. The per-item map is not written: it is derived from cardinality.
 */
function formatWiring(edge, token, plan) {
  const members = edge.assignment.map(binding => binding.source.isConstant
    ? `${binding.argName}=${constantText(binding.source.constant)}`
    : `${binding.argName}=${plan.nodeNames[binding.source.node]}`);
  const targets = edge.outputs.map(output => `${output.outputName}=${plan.nodeNames[output.node]}`);
  return `(${members.join(', ')}) -> ${token}${edge.policy.toNotation()} -> (${targets.join(', ')})`;
}

/** Every statement between `opening` and `closing`, joined by `between`. */
function emitNotation(machine, plans, opening, closing, between) {
  if (machine.isEmpty()) return '';
  const statements = [];
  // Headers across all strands, only for a step written as a synthetic `edge_N`.
  machine.strands().forEach((strand, s) => {
    strand.edges().forEach((edge, index) => {
      if (plans[s].needsHeader[index]) statements.push(`${opening}${plans[s].edgeTokens[index]} ${edge.capUrn}${closing}`);
    });
  });
  // Wirings across all strands, in canonical edge order.
  machine.strands().forEach((strand, s) => {
    strand.edges().forEach((edge, index) => {
      statements.push(opening + formatWiring(edge, plans[s].edgeTokens[index], plans[s]) + closing);
    });
  });
  return statements.join(between);
}

function emitFormatted(machine, plans, format) {
  if (format === NOTATION_FORMAT_BRACKETED) return emitNotation(machine, plans, '[', ']', '');
  if (format === NOTATION_FORMAT_LINE_BASED) return emitNotation(machine, plans, '', '', '\n');
  throw new Error(`unknown notation format '${format}': it is '${NOTATION_FORMAT_BRACKETED}' or '${NOTATION_FORMAT_LINE_BASED}'`);
}

/** Canonical one-line bracketed notation. Caps are written by their canonical URN. */
Machine.prototype.toMachineNotation = function toMachineNotation() {
  return emitFormatted(this, serializationPlan(this, null), NOTATION_FORMAT_BRACKETED);
};

/** One statement per line, each wrapped in `[...]`: the canonical statements, with newlines between them. */
Machine.prototype.toMachineNotationMultiline = function toMachineNotationMultiline() {
  return emitNotation(this, serializationPlan(this, null), '[', ']', '\n');
};

/** Notation in the given format, caps written by their canonical URN. */
Machine.prototype.toMachineNotationFormatted = function toMachineNotationFormatted(format) {
  return emitFormatted(this, serializationPlan(this, null), format);
};

/**
 * Notation writing each cap by its display alias (shortest name, ties
 * alphabetical) when one exists, and by a header otherwise. An aliased cap is
 * written in step position with no header; the parser resolves the alias back
 * to its URN, so the form round-trips.
 * @param {{displayAliasForUrn: function(string): (string|null)}} aliases
 * @param {string} [format]
 */
Machine.prototype.toMachineNotationAliased = function toMachineNotationAliased(aliases, format = NOTATION_FORMAT_BRACKETED) {
  if (aliases === null || aliases === undefined || typeof aliases.displayAliasForUrn !== 'function') {
    throw new Error('writing a machine by its aliases takes something that knows them');
  }
  return emitFormatted(this, serializationPlan(this, aliases), format);
};

/**
 * The payload a graph view draws from (cap-fab-renderer's machine mode):
 *
 *     {"strands":[{"nodes":[{"id","urn","title"}],
 *                  "edges":[{"alias","cap_urn","title","is_loop","retry","on_error","included_as",
 *                            "assignment":[{"cap_arg_media_urn","arg_name","source_node"|"constant"}],
 *                            "outputs":[{"output_media_urn","output_name","node"}]}],
 *                  "input_anchor_nodes":[...],"output_anchor_nodes":[...]}]}
 *
 * Node names are those of the canonical notation, so a notation string and its
 * render payload share node identities; each step is its canonical `edge_N`.
 * Each node carries the title of its media definition and each step the title
 * of its cap definition: one that is not at hand is refused, since a title is
 * never made up from a URN. A constant is written as its JSON text, so a whole
 * number past 2^53 keeps every digit.
 * @param {MachineDefinitions} definitions
 * @returns {string}
 * @throws {MachineAbstractionError} UncachedMediaDef, UncachedCap
 */
Machine.prototype.toRenderPayloadJson = function toRenderPayloadJson(definitions) {
  if (definitions === null || definitions === undefined || typeof definitions.mediaDefinition !== 'function') {
    throw new Error('a render payload takes the definitions its titles come from');
  }
  if (this.isEmpty()) return '{"strands":[]}';
  const plans = serializationPlan(this, null);
  const mediaTitle = urn => {
    const found = definitions.mediaDefinition(urn);
    if (found === null || typeof found.title !== 'string') throw abstractionError.uncachedMediaDef(urn);
    return found.title;
  };
  const capDefinition = urn => {
    const found = definitions.capDefinition(urn);
    if (found === null || typeof found.title !== 'string') throw abstractionError.uncachedCap(urn);
    return found;
  };
  const text = value => JSON.stringify(value);
  const listed = items => `[${items.join(',')}]`;
  const strands = this.strands().map((strand, s) => {
    const plan = plans[s];
    const nodes = strand.nodes().map((urn, id) =>
      `{"id":${text(plan.nodeNames[id])},"urn":${text(urn.toString())},"title":${text(mediaTitle(urn.toString()))}}`);
    const edges = strand.edges().map((edge, index) => {
      const definition = capDefinition(edge.capUrn.toString());
      // A binding and an output carry the name the resolver read from this
      // same definition, where a name is unique: the definition's main arg
      // and main output are found by it.
      const mainArg = definition.mainInputArg();
      const mainOutput = definition.mainOutput();
      const assignment = edge.assignment.map(binding => {
        const fed = binding.source.isConstant
          ? `"constant":${constantText(binding.source.constant)}`
          : `"source_node":${text(plan.nodeNames[binding.source.node])}`;
        const main = mainArg !== null && mainArg.name === binding.argName;
        return `{"cap_arg_media_urn":${text(binding.capArgMediaUrn.toString())},"arg_name":${text(binding.argName)},"is_main_input":${main},${fed}}`;
      });
      const outputs = edge.outputs.map(output => {
        const main = mainOutput !== null && mainOutput.name === output.outputName;
        return `{"output_media_urn":${text(output.outputMediaUrn.toString())},"output_name":${text(output.outputName)},"is_main_output":${main},"node":${text(plan.nodeNames[output.node])}}`;
      });
      return `{"alias":${text(plan.edgeTokens[index])},"cap_urn":${text(edge.capUrn.toString())}` +
        `,"title":${text(definition.title)}` +
        `,"is_loop":${edge.isLoop ? 'true' : 'false'},"retry":${edge.policy.retry},"on_error":${text(edge.policy.onError)}` +
        // The machine steps the step was included through, outermost first:
        // what a view groups the steps of an included machine by.
        `,"included_as":${listed(edge.includedAs.map(text))}` +
        `,"assignment":${listed(assignment)},"outputs":${listed(outputs)}}`;
    });
    return `{"nodes":${listed(nodes)},"edges":${listed(edges)}` +
      `,"input_anchor_nodes":${listed(strand.inputAnchorIds().map(id => text(plan.nodeNames[id])))}` +
      `,"output_anchor_nodes":${listed(strand.outputAnchorIds().map(id => text(plan.nodeNames[id])))}}`;
  });
  return `{"strands":${listed(strands)}}`;
};

/**
 * A Mermaid flowchart of the machine, for a view that draws one. Every data
 * node is a rounded box labelled with its canonical name and media URN (an
 * input or output of the machine a stadium), every step a box of its own
 * labelled with its alias, every constant a box with its text. An edge into a
 * step is labelled with the arg it binds, an edge out of one with the output
 * it takes; the edges of a step that runs once per item are dotted.
 * @param {{displayAliasForUrn: function(string): (string|null)}|null} [aliases]
 * @returns {string}
 */
Machine.prototype.toMermaid = function toMermaid(aliases = null) {
  if (this.isEmpty()) return 'flowchart LR\n  empty["(empty machine)"]';
  const plans = serializationPlan(this, aliases);
  // Mermaid reads a quoted label up to the next quote; one inside is written
  // as its entity.
  const label = text => `"${text.replace(/"/g, '#quot;')}"`;
  const lines = ['flowchart LR'];
  let stepNumber = 0;
  let constantNumber = 0;
  this.strands().forEach((strand, s) => {
    const plan = plans[s];
    const anchors = new Set([...strand.inputAnchorIds(), ...strand.outputAnchorIds()]);
    strand.nodes().forEach((urn, id) => {
      const text = label(`${plan.nodeNames[id]}: ${urn}`);
      lines.push(anchors.has(id) ? `  ${plan.nodeNames[id]}([${text}])` : `  ${plan.nodeNames[id]}(${text})`);
    });
    strand.edges().forEach((edge, index) => {
      const step = `s${stepNumber}`;
      stepNumber += 1;
      lines.push(`  ${step}[${label(plan.edgeTokens[index] + edge.policy.toNotation())}]`);
      const arrow = edge.isLoop ? '-.' : '--';
      const head = edge.isLoop ? '.->' : '-->';
      for (const binding of edge.assignment) {
        let from;
        if (binding.source.isConstant) {
          from = `k${constantNumber}`;
          constantNumber += 1;
          lines.push(`  ${from}[/${label(constantText(binding.source.constant))}/]`);
        } else {
          from = plan.nodeNames[binding.source.node];
        }
        lines.push(`  ${from} ${arrow} ${label(binding.argName)} ${head} ${step}`);
      }
      for (const output of edge.outputs) {
        lines.push(`  ${step} ${arrow} ${label(output.outputName)} ${head} ${plan.nodeNames[output.node]}`);
      }
    });
  });
  return lines.join('\n');
};

// ============================================================================
// The fabric registry: versioned definitions of caps, media and aliases
// ============================================================================

/**
 * SHA-256 hex digest of `s` UTF-8 bytes.
 *
 * Registry object keys are derived from canonical URN strings and alias names
 * this way, so the URL surface is colon/quote/semicolon-free. Every capdag
 * implementation uses this same algorithm, so a URN's key is identical across
 * languages. `crypto.subtle` is on `globalThis` in browsers and in every Node
 * this package supports.
 */
async function sha256Hex(s) {
  const utf8 = new TextEncoder().encode(s);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', utf8);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const FabricRegistryErrorCodes = Object.freeze({
  /** The registry holds no such object, or the manifest names no such definition. */
  NOT_FOUND: 'NotFound',
  /** The registry could not be reached, or answered with an error status. */
  HTTP: 'Http',
  /** What the registry served is not the object it was asked for. */
  PARSE: 'Parse',
  /** What the registry served breaks a definition rule. */
  VALIDATION: 'Validation',
});

/** Why the fabric registry did not give a definition. */
class FabricRegistryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FabricRegistryError';
    this.code = code;
  }
}

const isPositiveWhole = value => Number.isInteger(value) && value >= 1;

/** How many definitions `loadAll` fetches at once. */
const LOAD_ALL_AT_ONCE = 16;

/**
 * Read a manifest as the registry serves it, refusing one that is not whole:
 * `version` and `previous` are whole numbers, and `caps`, `media` and
 * `aliases` map each name to a positive per-definition version.
 */
function manifestFromJSON(obj, expectedVersion) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE, `manifest v${expectedVersion} is not an object`);
  }
  if (!isPositiveWhole(obj.version) || !Number.isInteger(obj.previous) || obj.previous < 0) {
    throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE,
      `manifest v${expectedVersion} does not say its version and the one before it`);
  }
  if (obj.version !== expectedVersion) {
    throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE,
      `manifest fetched as v${expectedVersion} reports version ${obj.version}`);
  }
  for (const section of ['caps', 'media', 'aliases']) {
    const held = obj[section];
    if (held === null || typeof held !== 'object' || Array.isArray(held)) {
      throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE, `manifest v${expectedVersion} has no '${section}' map`);
    }
    for (const [name, defver] of Object.entries(held)) {
      if (!isPositiveWhole(defver)) {
        throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE,
          `manifest v${expectedVersion} pins '${name}' at ${JSON.stringify(defver)}, which is no definition version`);
      }
    }
  }
  return new Manifest(obj.version, obj.previous, { ...obj.caps }, { ...obj.media }, { ...obj.aliases });
}

/**
 * Read a media definition as the registry serves it: `urn`, `media_type` and
 * `title` are strings, `version` the per-definition version the manifest pins.
 */
function mediaDefFromStored(obj, expectedUrn, expectedVersion) {
  const refused = what => new FabricRegistryError(FabricRegistryErrorCodes.PARSE,
    `the registry's media definition of '${expectedUrn}' ${what}`);
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw refused('is not an object');
  for (const key of ['urn', 'media_type', 'title']) {
    if (typeof obj[key] !== 'string' || obj[key].length === 0) throw refused(`has no '${key}'`);
  }
  if (MediaUrn.fromString(obj.urn).toString() !== expectedUrn) throw refused(`is of '${obj.urn}'`);
  if (obj.version !== expectedVersion) {
    throw refused(`reports version ${JSON.stringify(obj.version)} but the manifest pins ${expectedVersion}`);
  }
  if (obj.extensions !== undefined && !Array.isArray(obj.extensions)) throw refused("has 'extensions' that are not a list");
  const def = new MediaDef(obj.media_type, obj.profile_uri || null, obj.schema === undefined ? null : obj.schema,
    obj.title, obj.description || null, expectedUrn, obj.validation || null, obj.metadata || null,
    obj.extensions || [], typeof obj.documentation === 'string' && obj.documentation.length > 0 ? obj.documentation : null);
  def.version = obj.version;
  return def;
}

/**
 * Read a cap definition as the registry serves it and hold it to the
 * definition rules before anything caches it: a definition is held to them by
 * the side that receives it as well as the side that sends it.
 */
function capFromStored(obj, expectedUrn, expectedVersion) {
  let cap;
  try {
    cap = Cap.fromJSON(obj);
  } catch (error) {
    throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE,
      `the registry's definition of cap '${expectedUrn}' does not parse: ${error.message}`);
  }
  if (cap.urn.toString() !== expectedUrn) {
    throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE,
      `the registry served cap '${cap.urn}' for '${expectedUrn}'`);
  }
  if (cap.version !== expectedVersion) {
    throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE,
      `the registry's definition of cap '${expectedUrn}' reports version ${cap.version} but the manifest pins ${expectedVersion}`);
  }
  try {
    validateCapDefinition(cap);
  } catch (error) {
    throw new FabricRegistryError(FabricRegistryErrorCodes.VALIDATION,
      `the registry's definition of cap '${expectedUrn}' breaks a definition rule: ${error.message}`);
  }
  return cap;
}

/**
 * A client of the fabric registry, pinned to one manifest version.
 *
 * The manifest names every cap URN, media URN and alias of its snapshot with
 * the version of each definition; each definition is one object at
 * `<base>/{caps,media,aliases}/<sha256 of its canonical name>/<version>.json`.
 * Nothing outside the pinned manifest is fetched: a URN it does not name is
 * not found, never read from another snapshot.
 *
 * Fetches are asynchronous; what they bring is held in memory and read
 * synchronously, which makes a client one of the definitions a machine is
 * parsed against (`capDefinition`, `mediaDefinition`, `aliasTarget`) and the
 * alias source a machine is written with (`displayAliasForUrn`). A cap is
 * cached only once every media URN it names is: a cap whose media cannot be
 * read is not held at all.
 */
class FabricRegistryClient {
  /**
   * @param {string} baseUrl - The registry's base URL
   * @param {number} manifestVersion - The manifest this client reads
   * @param {Object} [options]
   * @param {function(string): Promise<Response>} [options.fetch] - How a URL
   *   is fetched (the runtime's `fetch` when not given)
   */
  constructor(baseUrl, manifestVersion, options = {}) {
    if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
      throw new Error('a fabric registry client is given the registry URL');
    }
    if (!isPositiveWhole(manifestVersion)) {
      throw new Error(`a fabric registry client reads a manifest version from 1 up, not ${JSON.stringify(manifestVersion)}`);
    }
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._manifestVersion = manifestVersion;
    this._fetch = options.fetch || ((url) => globalThis.fetch(url));
    this._manifest = null;
    this._caps = new Map();
    this._media = new Map();
    this._aliases = new Map();
    // A fetch under way, by what it fetches: one asked for again while it
    // runs is the same fetch.
    this._pending = new Map();
  }

  /**
   * A client pinned to the manifest the registry has promoted as its latest
   * (`<base>/manifest/latest.json`): for a host that follows the fabric
   * rather than one snapshot of it.
   * @param {string} baseUrl
   * @param {Object} [options] - As for the constructor
   * @returns {Promise<FabricRegistryClient>}
   */
  static async latest(baseUrl, options = {}) {
    const probe = new FabricRegistryClient(baseUrl, 1, options);
    const url = `${probe._baseUrl}/manifest/latest.json`;
    const latest = await probe._get(url, 'the latest manifest');
    if (latest === null || typeof latest !== 'object' || !isPositiveWhole(latest.version)) {
      throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE, `${url} does not name a manifest version`);
    }
    return new FabricRegistryClient(baseUrl, latest.version, options);
  }

  /** The manifest version this client reads. */
  get manifestVersion() {
    return this._manifestVersion;
  }

  async _get(url, what) {
    let response;
    try {
      response = await this._fetch(url);
    } catch (error) {
      throw new FabricRegistryError(FabricRegistryErrorCodes.HTTP, `${what}: the registry could not be reached at ${url}: ${error.message}`);
    }
    if (response.status === 404) {
      throw new FabricRegistryError(FabricRegistryErrorCodes.NOT_FOUND, `${what}: the registry holds nothing at ${url}`);
    }
    if (!response.ok) {
      throw new FabricRegistryError(FabricRegistryErrorCodes.HTTP, `${what}: the registry answered HTTP ${response.status} at ${url}`);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE, `${what}: the registry's answer at ${url} is not JSON: ${error.message}`);
    }
  }

  /** The pinned manifest, fetched once. */
  async manifest() {
    if (this._manifest !== null) return this._manifest;
    return this._once('manifest', async () => {
      const url = `${this._baseUrl}/manifest/${this._manifestVersion}.json`;
      this._manifest = manifestFromJSON(await this._get(url, `manifest v${this._manifestVersion}`), this._manifestVersion);
      return this._manifest;
    });
  }

  /** Fetch `key` once, however many ask for it while it runs. */
  _once(key, fetchIt) {
    if (!this._pending.has(key)) {
      const running = fetchIt().finally(() => this._pending.delete(key));
      this._pending.set(key, running);
    }
    return this._pending.get(key);
  }

  async _defver(section, name, what) {
    const manifest = await this.manifest();
    const defver = manifest[section][name];
    if (defver === undefined) {
      throw new FabricRegistryError(FabricRegistryErrorCodes.NOT_FOUND, `${what} is not part of manifest v${this._manifestVersion}`);
    }
    return defver;
  }

  /**
   * The media definition a media URN names.
   * @returns {Promise<MediaDef>}
   */
  async getMediaDef(urn) {
    const canonical = MediaUrn.fromString(urn).toString();
    if (this._media.has(canonical)) return this._media.get(canonical);
    return this._once(`media ${canonical}`, async () => {
      const defver = await this._defver('media', canonical, `media definition '${canonical}'`);
      const url = `${this._baseUrl}/media/${await sha256Hex(canonical)}/${defver}.json`;
      const def = mediaDefFromStored(await this._get(url, `media definition '${canonical}'`), canonical, defver);
      this._media.set(canonical, def);
      return def;
    });
  }

  /**
   * The cap a cap URN or a cap alias names, held to the definition rules,
   * with every media definition it names.
   * @returns {Promise<Cap>}
   */
  async getCap(urnOrAlias) {
    const urn = isAliasToken(urnOrAlias) ? await this._aliasTargetOfKind(urnOrAlias, ALIAS_TARGET_CAP) : urnOrAlias;
    const canonical = CapUrn.fromString(urn).toString();
    if (this._caps.has(canonical)) return this._caps.get(canonical);
    return this._once(`cap ${canonical}`, () => this._fetchCap(canonical));
  }

  async _fetchCap(canonical) {
    const defver = await this._defver('caps', canonical, `cap '${canonical}'`);
    const url = `${this._baseUrl}/caps/${await sha256Hex(canonical)}/${defver}.json`;
    const cap = capFromStored(await this._get(url, `cap '${canonical}'`), canonical, defver);
    // Every media URN the cap names, the bare `media:` aside (it is the
    // universal type, not a definition).
    const named = new Set();
    const name = text => {
      const media = MediaUrn.fromString(text);
      if (!media.isTop()) named.add(media.toString());
    };
    name(cap.urn.getInSpec());
    name(cap.urn.getOutSpec());
    for (const arg of cap.args) {
      name(arg.media_urn);
      name(arg.acceptedUrn());
    }
    for (const output of cap.getOutputs()) name(output.media_urn);
    for (const media of named) await this.getMediaDef(media);
    this._caps.set(canonical, cap);
    return cap;
  }

  /**
   * The alias of that name, matched against what was asked: its name and
   * the version the manifest pins, and a target that is a cap or a media URN.
   * @returns {Promise<StoredAlias>}
   */
  async getAlias(name) {
    const normalized = normalizeAliasName(name);
    if (this._aliases.has(normalized)) return this._aliases.get(normalized);
    return this._once(`alias ${normalized}`, () => this._fetchAlias(normalized));
  }

  async _fetchAlias(normalized) {
    const defver = await this._defver('aliases', normalized, `alias '${normalized}'`);
    const url = `${this._baseUrl}/aliases/${await sha256Hex(normalized)}/${defver}.json`;
    const obj = await this._get(url, `alias '${normalized}'`);
    if (obj === null || typeof obj !== 'object' || typeof obj.name !== 'string' || typeof obj.target !== 'string') {
      throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE, `the registry's alias '${normalized}' is not an alias`);
    }
    if (obj.name !== normalized) {
      throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE, `alias object name '${obj.name}' does not match requested name '${normalized}'`);
    }
    if (obj.version !== defver) {
      throw new FabricRegistryError(FabricRegistryErrorCodes.PARSE,
        `alias '${normalized}' object reports version ${JSON.stringify(obj.version)} but manifest pins defver ${defver}`);
    }
    const kind = classifyAliasTarget(obj.target);
    if (kind === null) {
      throw new FabricRegistryError(FabricRegistryErrorCodes.VALIDATION, `alias '${normalized}' target '${obj.target}' is neither a cap nor a media URN`);
    }
    const target = kind === ALIAS_TARGET_CAP ? CapUrn.fromString(obj.target).toString() : MediaUrn.fromString(obj.target).toString();
    const alias = new StoredAlias(normalized, target, defver);
    this._aliases.set(normalized, alias);
    return alias;
  }

  async _aliasTargetOfKind(name, kind) {
    const alias = await this.getAlias(name);
    if (classifyAliasTarget(alias.target) !== kind) {
      throw new FabricRegistryError(FabricRegistryErrorCodes.VALIDATION,
        `alias '${alias.name}' names '${alias.target}', which is not a ${kind} URN`);
    }
    return alias.target;
  }

  /**
   * Fetch every alias and every cap the pinned manifest names, each cap with
   * the media definitions it names: what reading any machine of the fabric
   * takes. Media no cap names are not fetched; `getMediaDef` reads one.
   * Fetches run a few at a time, and the first failure is the answer.
   */
  async loadAll() {
    const manifest = await this.manifest();
    const inTurn = async (names, fetchOne) => {
      for (let at = 0; at < names.length; at += LOAD_ALL_AT_ONCE) {
        await Promise.all(names.slice(at, at + LOAD_ALL_AT_ONCE).map(fetchOne));
      }
    };
    await inTurn(Object.keys(manifest.aliases), name => this.getAlias(name));
    await inTurn(Object.keys(manifest.caps), urn => this.getCap(urn));
  }

  /** Every cap fetched so far. */
  cachedCaps() {
    return [...this._caps.values()];
  }

  /** Every media definition fetched so far. */
  cachedMediaDefs() {
    return [...this._media.values()];
  }

  /** The fetched definition of the cap a URN names, or null. */
  capDefinition(urn) {
    return this._caps.get(CapUrn.fromString(urn).toString()) || null;
  }

  /** The fetched definition of the media a URN names, or null. */
  mediaDefinition(urn) {
    return this._media.get(MediaUrn.fromString(urn).toString()) || null;
  }

  /** The URN a fetched alias names, or null. */
  aliasTarget(name) {
    if (!isAliasToken(name)) return null;
    const alias = this._aliases.get(normalizeAliasName(name));
    return alias ? alias.target : null;
  }

  /**
   * Insert an alias into the cache, keyed by its normalized name: the seam a
   * host or a test seeds aliases through without a registry behind it.
   * @param {StoredAlias} alias
   */
  insertCachedAliasForTest(alias) {
    this._aliases.set(normalizeAliasName(alias.name), alias);
  }

  /**
   * The display alias for a `cap:`/`media:` URN among the fetched aliases:
   * the SHORTEST name that names it, ties broken alphabetically. Null when
   * none does, or when the text is neither kind of URN.
   * @param {string} urn
   * @returns {string|null}
   */
  displayAliasForUrn(urn) {
    const kind = classifyAliasTarget(urn);
    let canonical;
    if (kind === ALIAS_TARGET_CAP) canonical = CapUrn.fromString(urn).toString();
    else if (kind === ALIAS_TARGET_MEDIA) canonical = MediaUrn.fromString(urn).toString();
    else return null;
    const names = [];
    for (const alias of this._aliases.values()) {
      if (alias.target === canonical) names.push(alias.name);
    }
    return selectDisplayAlias(names);
  }

  /**
   * Every fetched alias whose target is a cap URN, as [name, capUrn] pairs.
   * @returns {Array<[string, string]>}
   */
  cachedCapAliases() {
    const pairs = [];
    for (const alias of this._aliases.values()) {
      if (classifyAliasTarget(alias.target) === ALIAS_TARGET_CAP) pairs.push([alias.name, alias.target]);
    }
    return pairs;
  }

  /** Forget everything fetched: the next lookup reads the registry again. */
  invalidate() {
    this._manifest = null;
    this._caps.clear();
    this._media.clear();
    this._aliases.clear();
    this._pending.clear();
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
  CapQuery,
  MatchGrade,
  gradeIsGuaranteed,
  CapUrnError,
  ErrorCodes,
  MediaUrn,
  MediaUrnError,
  MediaUrnErrorCodes,
  Cap,
  CapGroup,
  CapManifest,
  CapArg,
  CapOutput,
  OUTPUT_CARRIES_INPUT,
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
  validateCapOutputs,
  validateCapDefinition,
  isValidDefinitionName,
  ManifestLoadError,
  advertisedCapGroups,
  identityCap,
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
  MEDIA_IMAGE,
  MEDIA_DOCUMENT,
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
  MachineAbstractionError,
  MachineAbstractionErrorCodes,
  UndecidedMember,
  SYNTAX_CAP_HEADER,
  SYNTAX_MACHINE_HEADER,
  SYNTAX_WIRING,
  RESERVED_NODE_NAMES,
  parseSyntax,
  decodeConstant,
  constantText,
  constantsEqual,
  constantToJSON,
  StepPolicy,
  ON_ERROR_FAIL,
  ON_ERROR_ABSENT,
  MAX_RETRY,
  mintStepToken,
  BindingSource,
  EdgeAssignmentBinding,
  EdgeOutput,
  MachineEdge,
  NodeBijection,
  MachineStrand,
  Machine,
  SCOPE_ROOT,
  CyclicSteps,
  StepPlacement,
  IterationStructure,
  iterationOf,
  compareMediaUrns,
  compareCapUrns,
  validationViolation,
  schemaViolations,
  CapDefinitions,
  MatchFailure,
  matchSourcesToArgs,
  resolvePreInterned,
  resolveNamedWirings,
  MachineSourceError,
  MachineSource,
  NoMachineSource,
  FileMachineSource,
  MapMachineSource,
  fileMachineId,
  IncludedMachine,
  includedMachineOf,
  parseMachine,
  machineFromCapPath,
  parseMachineWithAST,
  NOTATION_FORMAT_BRACKETED,
  NOTATION_FORMAT_LINE_BASED,
  // The fabric registry
  FabricRegistryClient,
  FabricRegistryError,
  FabricRegistryErrorCodes,
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
