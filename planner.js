// Unified configurable planner — the plan-space vocabulary for JS clients.
//
// Mirrors core Rust `capdag/src/planner/plan_space.rs` and the proto surface
// (`floom-engine/proto/cap.proto` PlanMachines/DiscoverConvergentTargets): the knob
// enums, the request shape with the same validation the engine applies, and
// parsers for the proto-JSON response shapes (ts-proto `snakeToCamel=false`,
// so wire field names are snake_case). This is what lets floom-uikit represent
// and manipulate the FULL planner state — knobs, ranked candidates, apexes —
// both standalone (fixtures) and fed over gRPC by the desktop clients.
//
// Every parser fails hard on malformed input: a missing/mistyped field is a
// wire bug to surface, never a value to default away.

// ============================================================================
// Knob enums — string values ⇄ proto enum numbers
// ============================================================================
//
// Each knob is a frozen map of canonical string values. The string values are
// the cross-layer currency (UI state, IPC, fixtures); `toProto`/`fromProto`
// convert to the proto enum numbers at the wire boundary.

function makeKnob(name, entries) {
  const values = Object.freeze(entries.map(([value]) => value));
  const toProtoMap = new Map(entries);
  const fromProtoMap = new Map(entries.map(([value, num]) => [num, value]));
  return Object.freeze({
    name,
    values,
    /** The knob's default (always the first entry — proto 0). */
    default: entries[0][0],
    isValid(value) {
      return toProtoMap.has(value);
    },
    toProto(value) {
      if (!toProtoMap.has(value)) {
        throw new PlanStateError(
          `${name} must be one of ${values.join(' | ')}, got ${JSON.stringify(value)}`
        );
      }
      return toProtoMap.get(value);
    },
    fromProto(num) {
      if (!fromProtoMap.has(num)) {
        throw new PlanStateError(`unknown ${name} proto value ${JSON.stringify(num)}`);
      }
      return fromProtoMap.get(num);
    },
  });
}

class PlanStateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlanStateError';
  }
}

/** Axis C — whether the source legs meet. */
const ConvergencePresence = makeKnob('convergencePresence', [
  ['auto', 0],
  ['converged', 1],
  ['independent', 2],
]);

/** Axis D — where the apex sits (the meet-in-the-middle cut). */
const ConvergenceLocation = makeKnob('convergenceLocation', [
  ['auto', 0],
  ['at-source', 1],
  ['earliest', 2],
  ['at-depth', 3],
  ['latest', 4],
  ['at-target', 5],
]);

/** Axis E — how the apex is realized. */
const ConvergenceMechanism = makeKnob('convergenceMechanism', [
  ['any', 0],
  ['generalize', 1],
  ['collect', 2],
  ['merge', 3],
]);

/** Axis G — the colimit shape. */
const ConvergenceArity = makeKnob('convergenceArity', [
  ['auto', 0],
  ['single', 1],
  ['staged', 2],
  ['partial', 3],
]);

/** Axis H — whether/how the plan fans out. */
const DivergencePresence = makeKnob('divergencePresence', [
  ['auto', 0],
  ['none', 1],
  ['broadcast', 2],
  ['split', 3],
]);

/** Axis I — where a fan-out sits. */
const DivergenceLocation = makeKnob('divergenceLocation', [
  ['auto', 0],
  ['at-source', 1],
  ['at-depth', 2],
  ['at-target', 3],
]);

/** Axis K — how candidates are ranked. "intent" is the magic default. */
const RankPolicy = makeKnob('ranking', [
  ['intent', 0],
  ['shortest', 1],
  ['cost', 2],
]);

/** Who sets the knobs. Both modes return a ranked list. */
const PlanMode = makeKnob('mode', [
  ['auto', 0],
  ['configured', 1],
]);

// ============================================================================
// PlanRequest — the full knob surface, validated like the engine validates
// ============================================================================

/**
 * One source anchor: `{ mediaUrn, isSequence }`. Heterogeneous inputs are
 * several specs with different media URNs; N same-typed files are one spec
 * with `isSequence: true`.
 */
function validateSourceSpec(spec, index) {
  if (spec === null || typeof spec !== 'object') {
    throw new PlanStateError(`sources[${index}] must be an object`);
  }
  if (typeof spec.mediaUrn !== 'string' || spec.mediaUrn.length === 0) {
    throw new PlanStateError(`sources[${index}].mediaUrn must be a non-empty string`);
  }
  if (typeof spec.isSequence !== 'boolean') {
    throw new PlanStateError(`sources[${index}].isSequence must be a boolean`);
  }
  return { mediaUrn: spec.mediaUrn, isSequence: spec.isSequence };
}

/**
 * The full plan request. Every field is a knob; `auto` mode fills unset knobs
 * by intent inference engine-side. Constructing one validates the same
 * invariants the engine enforces (at-depth requires a depth; a depth is only
 * valid at at-depth; ≥1 source; ≥1 exact target), so a bad configuration
 * fails at the UI boundary with the same message shape it would fail with on
 * the wire.
 */
class PlanRequest {
  constructor({
    sources,
    exactTargets,
    convergencePresence = ConvergencePresence.default,
    convergenceLocation = ConvergenceLocation.default,
    convergenceAtDepth = null,
    convergenceMechanism = ConvergenceMechanism.default,
    convergenceAtType = null,
    convergenceArity = ConvergenceArity.default,
    divergencePresence = DivergencePresence.default,
    divergenceLocation = DivergenceLocation.default,
    divergenceAtDepth = null,
    ranking = RankPolicy.default,
    mode = PlanMode.default,
    maxDepth = 0,
    maxPaths = 0,
    maxCandidates = 0,
  }) {
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new PlanStateError('sources must be a non-empty array');
    }
    this.sources = sources.map(validateSourceSpec);
    if (!Array.isArray(exactTargets) || exactTargets.length === 0) {
      throw new PlanStateError('exactTargets must be a non-empty array of media URNs');
    }
    for (const [i, target] of exactTargets.entries()) {
      if (typeof target !== 'string' || target.length === 0) {
        throw new PlanStateError(`exactTargets[${i}] must be a non-empty string`);
      }
    }
    this.exactTargets = [...exactTargets];

    for (const [knob, value] of [
      [ConvergencePresence, convergencePresence],
      [ConvergenceLocation, convergenceLocation],
      [ConvergenceMechanism, convergenceMechanism],
      [ConvergenceArity, convergenceArity],
      [DivergencePresence, divergencePresence],
      [DivergenceLocation, divergenceLocation],
      [RankPolicy, ranking],
      [PlanMode, mode],
    ]) {
      knob.toProto(value); // throws on an invalid value
    }
    this.convergencePresence = convergencePresence;
    this.convergenceLocation = convergenceLocation;
    this.convergenceMechanism = convergenceMechanism;
    this.convergenceAtType = convergenceAtType;
    this.convergenceArity = convergenceArity;
    this.divergencePresence = divergencePresence;
    this.divergenceLocation = divergenceLocation;
    this.ranking = ranking;
    this.mode = mode;

    const depthAt = (value, location, field, atValue) => {
      if (location === atValue) {
        if (!Number.isInteger(value) || value < 1) {
          throw new PlanStateError(`${field} must be a positive integer when the location is "${atValue}"`);
        }
        return value;
      }
      if (value !== null && value !== undefined) {
        throw new PlanStateError(`${field} is only valid when the location is "${atValue}"`);
      }
      return 0;
    };
    this.convergenceAtDepth = depthAt(convergenceAtDepth, convergenceLocation, 'convergenceAtDepth', 'at-depth');
    this.divergenceAtDepth = depthAt(divergenceAtDepth, divergenceLocation, 'divergenceAtDepth', 'at-depth');

    for (const [field, value] of [
      ['maxDepth', maxDepth],
      ['maxPaths', maxPaths],
      ['maxCandidates', maxCandidates],
    ]) {
      if (!Number.isInteger(value) || value < 0) {
        throw new PlanStateError(`${field} must be a non-negative integer (0 = engine default)`);
      }
    }
    this.maxDepth = maxDepth;
    this.maxPaths = maxPaths;
    this.maxCandidates = maxCandidates;
    Object.freeze(this.sources);
    Object.freeze(this.exactTargets);
    Object.freeze(this);
  }

  /** True iff any space-constraining knob is set — the CONFIGURED trigger.
   *  Ranking never counts: it re-orders, it doesn't constrain. */
  get isConfigured() {
    return (
      this.convergencePresence !== 'auto' ||
      this.convergenceLocation !== 'auto' ||
      this.convergenceMechanism !== 'any' ||
      this.convergenceArity !== 'auto' ||
      this.convergenceAtType !== null ||
      this.divergencePresence !== 'auto' ||
      this.divergenceLocation !== 'auto'
    );
  }

  /** The proto-JSON wire shape (`PlanMachinesRequest`, snake_case fields). */
  toProtoJSON() {
    return {
      sources: this.sources.map((s) => ({ media_urn: s.mediaUrn, is_sequence: s.isSequence })),
      exact_targets: [...this.exactTargets],
      convergence: {
        presence: ConvergencePresence.toProto(this.convergencePresence),
        location: ConvergenceLocation.toProto(this.convergenceLocation),
        at_depth: this.convergenceAtDepth,
        mechanism: ConvergenceMechanism.toProto(this.convergenceMechanism),
        at_type: this.convergenceAtType === null ? undefined : this.convergenceAtType,
        arity: ConvergenceArity.toProto(this.convergenceArity),
      },
      divergence: {
        presence: DivergencePresence.toProto(this.divergencePresence),
        location: DivergenceLocation.toProto(this.divergenceLocation),
        at_depth: this.divergenceAtDepth,
      },
      ranking: RankPolicy.toProto(this.ranking),
      mode: PlanMode.toProto(this.isConfigured ? 'configured' : this.mode),
      max_depth: this.maxDepth,
      max_paths: this.maxPaths,
      max_candidates: this.maxCandidates,
    };
  }
}

// ============================================================================
// Response parsers — proto-JSON → typed plan state
// ============================================================================

function requireString(record, field, context) {
  const value = record[field];
  if (typeof value !== 'string') {
    throw new PlanStateError(`${context}.${field} must be a string, got ${typeof value}`);
  }
  return value;
}

function requireNumber(record, field, context) {
  const value = record[field];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new PlanStateError(`${context}.${field} must be a number, got ${typeof value}`);
  }
  return value;
}

function requireBoolean(record, field, context) {
  const value = record[field];
  if (typeof value !== 'boolean') {
    throw new PlanStateError(`${context}.${field} must be a boolean, got ${typeof value}`);
  }
  return value;
}

function requireRecord(value, context) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PlanStateError(`${context} must be an object`);
  }
  return value;
}

function requireArray(value, context) {
  if (!Array.isArray(value)) {
    throw new PlanStateError(`${context} must be an array`);
  }
  return value;
}

/** `PlanApexMessage`: where legs meet, by which mechanism, at what depth. */
function parsePlanApex(raw, context = 'apex') {
  const record = requireRecord(raw, context);
  return Object.freeze({
    mediaUrn: requireString(record, 'media_urn', context),
    mechanism: ConvergenceMechanism.fromProto(requireNumber(record, 'mechanism', context)),
    depth: requireNumber(record, 'depth', context),
  });
}

/** `PlanProfileMessage`: the candidate's (sources, apexes, targets) shape. */
function parsePlanProfile(raw, context = 'profile') {
  const record = requireRecord(raw, context);
  return Object.freeze({
    sourceMedia: requireArray(record.source_media, `${context}.source_media`).map(String),
    targetMedia: requireArray(record.target_media, `${context}.target_media`).map(String),
    apexes: requireArray(record.apexes, `${context}.apexes`).map((apex, i) =>
      parsePlanApex(apex, `${context}.apexes[${i}]`)
    ),
    converged: requireBoolean(record, 'converged', context),
    diverged: requireBoolean(record, 'diverged', context),
  });
}

/** `PlanCostMessage`. */
function parsePlanCost(raw, context = 'cost') {
  const record = requireRecord(raw, context);
  return Object.freeze({
    capSteps: requireNumber(record, 'cap_steps', context),
    totalSteps: requireNumber(record, 'total_steps', context),
    maxLegDepth: requireNumber(record, 'max_leg_depth', context),
    intentScore: requireNumber(record, 'intent_score', context),
  });
}

/**
 * `PlanCandidateMessage`: one ranked plan. `notation` IS the plan — canonical
 * machine notation, parseable by `parseMachine` and executable by the engine.
 */
function parsePlanCandidate(raw, context = 'candidate') {
  const record = requireRecord(raw, context);
  return Object.freeze({
    notation: requireString(record, 'notation', context),
    profile: parsePlanProfile(record.profile, `${context}.profile`),
    cost: parsePlanCost(record.cost, `${context}.cost`),
    label: requireString(record, 'label', context),
    rank: requireNumber(record, 'rank', context),
  });
}

/** `PlanMachinesResponse` → candidates sorted by rank. */
function parsePlanCandidates(raw, context = 'planMachines') {
  const record = requireRecord(raw, context);
  const candidates = requireArray(record.candidates, `${context}.candidates`).map(
    (candidate, i) => parsePlanCandidate(candidate, `${context}.candidates[${i}]`)
  );
  return candidates.slice().sort((a, b) => a.rank - b.rank);
}

/**
 * `ConvergentTargetMessage`: one discovered target — combined through an apex
 * (`convergent: true`, `apex` set) or reachable by every source on its own.
 */
function parseConvergentTarget(raw, context = 'target') {
  const record = requireRecord(raw, context);
  const hasApex = record.apex !== undefined && record.apex !== null;
  return Object.freeze({
    mediaDef: requireString(record, 'media_def', context),
    displayName: requireString(record, 'display_name', context),
    minTotalSteps: requireNumber(record, 'min_total_steps', context),
    apex: hasApex ? parsePlanApex(record.apex, `${context}.apex`) : null,
    convergent: requireBoolean(record, 'convergent', context),
    fileExtension: typeof record.file_extension === 'string' ? record.file_extension : '',
  });
}

/** `DiscoverConvergentTargetsResponse` → convergent-first, then by steps. */
function parseConvergentTargets(raw, context = 'discoverConvergentTargets') {
  const record = requireRecord(raw, context);
  return requireArray(record.targets, `${context}.targets`).map((target, i) =>
    parseConvergentTarget(target, `${context}.targets[${i}]`)
  );
}

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
};
