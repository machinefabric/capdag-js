// CapGraphRenderer — unified graph rendering for capdag-js
//
// One class, four modes:
//
//   * "browse"  — freely-browsable capability registry (capdag-dot-com).
//                 Nodes are media URNs, edges are capabilities from
//                 /api/capabilities. Supports selection, path exploration
//                 between two media nodes, and bidirectional navigator
//                 sync.
//
//   * "strand"  — one abstract strand (linear capability chain) focused on
//                 a specific source → target path. ForEach / Collect steps
//                 label the edges bounding the body span; they are not
//                 rendered as distinct nodes.
//
//   * "run"     — realized machine with per-body outcomes. Strand backbone
//                 plus body replicas colored by success/failure, grouped
//                 pagination (first N successes and first K failures,
//                 with independent show-more controls).
//
//   * "machine" — machine editor live preview (Monaco host). Arbitrary DAG
//                 of "node" and "cap" elements with "edge" connections.
//                 Supports cross-highlight with the editor via element
//                 `tokenId` round-trips.
//
// Dependencies (must be loaded before this file):
//   * cytoscape
//   * cytoscape-elk extension (registers itself on `cytoscape`)
//   * elkjs (via cytoscape-elk)
//   * TaggedUrn (from tagged-urn browser build)
//   * CapUrn, MediaUrn, Cap, createCap, CapGraph (from capdag.js)
//
// The renderer owns its own theme observer (<html data-theme>) so hosts do
// nothing to drive theme sync. It owns its own tooltip element and its own
// cytoscape instance. No implicit defaults: every required option and
// every required input field is validated up front, and every missing
// dependency throws immediately.
//
// NAMING RULE: core Rust capdag (`capdag/src/...`) is authoritative for
// every field name this module reads on the wire. Where a payload producer
// uses a different name for the same concept, the fix is at the producer,
// not here.

'use strict';

// =============================================================================
// Host dependencies — resolved at call time. When this file runs inside
// Node (for tests) the globals are on `global`.
// =============================================================================

function requireHostDependency(name) {
  const g = (typeof window !== 'undefined') ? window
           : (typeof global !== 'undefined') ? global
           : null;
  if (g === null) {
    throw new Error(
      `CapGraphRenderer: no global object (window/global) — cannot resolve '${name}'`
    );
  }
  const value = g[name];
  if (value === undefined) {
    throw new Error(
      `CapGraphRenderer: required host dependency '${name}' is not loaded. ` +
      `Load cytoscape, cytoscape-elk, tagged-urn.js, and capdag.js before this script.`
    );
  }
  return value;
}

// =============================================================================
// Cardinality labels — derived from is_sequence booleans. The naming
// follows core Rust capdag: `CapArg.is_sequence` / `CapOutput.is_sequence`
// at the cap level (browse mode) and `StrandStepType::Cap.input_is_sequence`
// / `.output_is_sequence` at the strand step level (strand/run modes).
// =============================================================================

function cardinalityLabel(input_is_sequence, output_is_sequence) {
  const lhs = input_is_sequence ? 'n' : '1';
  const rhs = output_is_sequence ? 'n' : '1';
  return `${lhs}\u2192${rhs}`;
}

// Compute the cardinality marker for a cap as it appears in the
// /api/capabilities JSON. The main input arg is the one whose sources
// include a stdin source. Matches core Rust `CapArg.is_sequence` and
// `CapOutput.is_sequence` names exactly.
function cardinalityFromCap(cap) {
  if (!cap || typeof cap !== 'object') {
    throw new Error('CapGraphRenderer: cardinalityFromCap requires a cap object');
  }
  const args = cap.args || [];
  const mainArg = args.find(arg =>
    arg && arg.sources && arg.sources.some(src => src && src.stdin !== undefined)
  );
  const input_is_sequence = mainArg ? (mainArg.is_sequence === true) : false;
  const output_is_sequence = (cap.output && cap.output.is_sequence === true) || false;
  return cardinalityLabel(input_is_sequence, output_is_sequence);
}

// =============================================================================
// Media URN helpers. Every media URN that becomes a cytoscape node ID is
// first canonicalized via `TaggedUrn.toString()` so tag-order variation
// never produces distinct cytoscape nodes for the same semantic URN.
// =============================================================================

function canonicalMediaUrn(mediaUrnString) {
  const MediaUrn = requireHostDependency('MediaUrn');
  return MediaUrn.fromString(mediaUrnString).toString();
}

// Produce a multi-line node label from a canonical media URN, one line
// per tag. Marker tags render as bare keys; value tags render as
// `key: value`. TaggedUrn.getTags() is iterated in sorted order matching
// the canonical serialization.
function mediaNodeLabel(canonicalUrn) {
  const TaggedUrn = requireHostDependency('TaggedUrn');
  const parsed = TaggedUrn.fromString(canonicalUrn);
  const tags = parsed.tags;
  const lines = [];
  for (const key of Object.keys(tags).sort()) {
    const value = tags[key];
    if (value === '*') {
      lines.push(key);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join('\n');
}

// =============================================================================
// CSS variable helpers + theme observer hook.
// =============================================================================

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function cssVarNumber(name, fallback) {
  const raw = getCssVar(name);
  if (raw === '') return fallback;
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `CapGraphRenderer: CSS variable '${name}' value '${raw}' is not a number`
    );
  }
  return parsed;
}

// =============================================================================
// Layout configs per mode. Same ELK algorithm; spacing is tuned per mode
// to match the typical graph density and reading direction of each.
// =============================================================================

function layoutForMode(mode) {
  const base = {
    algorithm: 'layered',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': 'POLYLINE',
    'elk.layered.spacing.edgeEdgeBetweenLayers': 20,
    'elk.layered.spacing.edgeNodeBetweenLayers': 30,
    'elk.spacing.edgeEdge': 15,
    'elk.spacing.edgeNode': 25,
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  };
  if (mode === 'browse') {
    return Object.assign({}, base, {
      'elk.layered.spacing.nodeNodeBetweenLayers': 150,
      'elk.spacing.nodeNode': 50,
    });
  }
  if (mode === 'strand') {
    return Object.assign({}, base, {
      'elk.layered.spacing.nodeNodeBetweenLayers': 120,
      'elk.spacing.nodeNode': 40,
    });
  }
  if (mode === 'run') {
    return Object.assign({}, base, {
      'elk.layered.spacing.nodeNodeBetweenLayers': 100,
      'elk.spacing.nodeNode': 35,
    });
  }
  if (mode === 'machine') {
    // Editor graph is a small bipartite-ish DAG; orthogonal routing
    // reads more cleanly than polyline at this density.
    return {
      algorithm: 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': 40,
      'elk.layered.spacing.nodeNodeBetweenLayers': 90,
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    };
  }
  throw new Error(`CapGraphRenderer: unknown mode '${mode}'`);
}

// =============================================================================
// Stylesheet — reads CSS variables on every call so theme toggles work by
// re-running this and calling `cy.style(...)`.
// =============================================================================

function buildStylesheet() {
  const nodeText = getCssVar('--graph-node-text');
  const nodeBg = getCssVar('--graph-node-bg');
  const nodeBorder = getCssVar('--graph-node-border');
  const nodeBorderHighlighted = getCssVar('--graph-node-border-highlighted');
  const nodeBorderActive = getCssVar('--graph-node-border-active');
  const edgeTextBg = getCssVar('--graph-edge-text-bg');
  const edgeTextBgOpacity = cssVarNumber('--graph-edge-text-bg-opacity', 0.9);
  const fadedOpacity = cssVarNumber('--graph-faded-opacity', 0.15);
  const fadedEdgeOpacity = cssVarNumber('--graph-faded-edge-opacity', 0.1);
  const bodyNodeSuccess = getCssVar('--graph-body-node-success');
  const bodyNodeFailure = getCssVar('--graph-body-node-failure');
  const bodyEdgeSuccess = getCssVar('--graph-body-edge-success');
  const bodyEdgeFailure = getCssVar('--graph-body-edge-failure');

  return [
    {
      selector: 'node',
      style: {
        'label': 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '150px',
        'line-height': 1.3,
        'font-family': '"JetBrains Mono", ui-monospace, monospace',
        'font-size': '9px',
        'font-weight': '500',
        'color': nodeText,
        'background-color': nodeBg,
        'shape': 'round-rectangle',
        'width': 'label',
        'height': 'label',
        'padding': '12px',
        'border-width': '2px',
        'border-color': nodeBorder,
        'border-opacity': 0.8,
        'transition-property': 'opacity, border-color, border-width',
        'transition-duration': '0.2s',
      },
    },
    {
      selector: 'node.highlighted',
      style: { 'border-width': '3px', 'border-color': nodeBorderHighlighted },
    },
    {
      selector: 'node.active',
      style: { 'border-width': '3px', 'border-color': nodeBorderActive, 'z-index': 999 },
    },
    {
      selector: 'node.faded',
      style: { 'opacity': fadedOpacity },
    },
    {
      selector: 'node.body-success',
      style: { 'background-color': bodyNodeSuccess },
    },
    {
      selector: 'node.body-failure',
      style: { 'background-color': bodyNodeFailure },
    },
    {
      selector: 'node.show-more',
      style: {
        // Use the normal node fill; the dashed border is what
        // distinguishes a show-more node from a regular cap.
        // The renderer never reads `--graph-bg` — the graph
        // canvas background is entirely the host's concern.
        'background-color': nodeBg,
        'border-style': 'dashed',
        'border-width': '2px',
        'border-color': nodeBorderHighlighted,
      },
    },
    {
      selector: 'edge',
      style: {
        'label': 'data(label)',
        'font-family': '"JetBrains Mono", ui-monospace, monospace',
        'font-size': '9px',
        'font-weight': '500',
        'color': 'data(color)',
        'text-background-color': edgeTextBg,
        'text-background-opacity': edgeTextBgOpacity,
        'text-background-padding': '3px',
        'text-background-shape': 'roundrectangle',
        'text-rotation': 'autorotate',
        'text-margin-y': -8,
        'curve-style': 'bezier',
        'control-point-step-size': 40,
        'width': 1.5,
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'transition-property': 'opacity, width',
        'transition-duration': '0.2s',
      },
    },
    {
      selector: 'edge.highlighted',
      style: { 'width': 2.5, 'z-index': 999 },
    },
    {
      selector: 'edge.active',
      style: { 'width': 3, 'z-index': 1000 },
    },
    {
      selector: 'edge.faded',
      style: { 'opacity': fadedEdgeOpacity },
    },
    {
      selector: 'edge.body-success',
      style: { 'line-color': bodyEdgeSuccess, 'target-arrow-color': bodyEdgeSuccess },
    },
    {
      selector: 'edge.body-failure',
      style: { 'line-color': bodyEdgeFailure, 'target-arrow-color': bodyEdgeFailure },
    },
    {
      selector: 'node.path-highlighted',
      style: { 'border-width': '3px', 'border-color': nodeBorderHighlighted },
    },
    {
      selector: 'edge.path-highlighted',
      style: { 'width': 3, 'z-index': 999, 'line-style': 'solid' },
    },
  ];
}

// =============================================================================
// Tooltip element — fixed-position div that follows the cursor.
// =============================================================================

function createTooltipElement() {
  const el = document.createElement('div');
  el.className = 'graph-tooltip';
  el.style.cssText = [
    'position: fixed',
    'display: none',
    'background: var(--bg-elevated)',
    'border: 1px solid var(--border-primary)',
    'border-radius: 6px',
    'padding: 6px 10px',
    'font-family: var(--font-mono, ui-monospace, monospace)',
    'font-size: 11px',
    'color: var(--text-secondary)',
    'max-width: 400px',
    'word-break: break-all',
    'z-index: 10000',
    'pointer-events: none',
    'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)',
  ].join('; ') + ';';
  document.body.appendChild(el);
  return el;
}

// =============================================================================
// Validation — strict per-mode input shape checks. Every required field is
// enforced with a descriptive error naming the failing path. No fallback.
// =============================================================================

function assertString(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`CapGraphRenderer: ${path} must be a non-empty string`);
  }
}

function assertArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`CapGraphRenderer: ${path} must be an array`);
  }
}

function validateBrowseData(data) {
  assertArray(data, 'browse mode data');
  data.forEach((cap, idx) => {
    if (!cap || typeof cap !== 'object') {
      throw new Error(`CapGraphRenderer browse mode: data[${idx}] is not an object`);
    }
    assertString(cap.urn, `browse mode data[${idx}].urn`);
    assertString(cap.in_spec, `browse mode data[${idx}].in_spec (cap urn: ${cap.urn})`);
    assertString(cap.out_spec, `browse mode data[${idx}].out_spec (cap urn: ${cap.urn})`);
  });
}

// Validate a canonical `StrandStep` — the Rust-serialized form with
// externally-tagged step_type.
function validateStrandStep(step, path) {
  if (!step || typeof step !== 'object') {
    throw new Error(`CapGraphRenderer: ${path} is not an object`);
  }
  assertString(step.from_spec, `${path}.from_spec`);
  assertString(step.to_spec, `${path}.to_spec`);
  if (!step.step_type || typeof step.step_type !== 'object') {
    throw new Error(`CapGraphRenderer: ${path}.step_type must be an object`);
  }
  const keys = Object.keys(step.step_type);
  if (keys.length !== 1) {
    throw new Error(
      `CapGraphRenderer: ${path}.step_type must have exactly one variant key (got: ${keys.join(',')})`
    );
  }
  const variant = keys[0];
  if (variant !== 'Cap' && variant !== 'ForEach' && variant !== 'Collect') {
    throw new Error(
      `CapGraphRenderer: ${path}.step_type variant must be Cap | ForEach | Collect (got: ${variant})`
    );
  }
  const body = step.step_type[variant];
  if (!body || typeof body !== 'object') {
    throw new Error(`CapGraphRenderer: ${path}.step_type.${variant} must be an object`);
  }
  if (variant === 'Cap') {
    assertString(body.cap_urn, `${path}.step_type.Cap.cap_urn`);
    assertString(body.title, `${path}.step_type.Cap.title`);
    if (typeof body.input_is_sequence !== 'boolean') {
      throw new Error(`CapGraphRenderer: ${path}.step_type.Cap.input_is_sequence must be a boolean`);
    }
    if (typeof body.output_is_sequence !== 'boolean') {
      throw new Error(`CapGraphRenderer: ${path}.step_type.Cap.output_is_sequence must be a boolean`);
    }
  } else {
    assertString(body.media_spec, `${path}.step_type.${variant}.media_spec`);
  }
}

function validateStrandPayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('CapGraphRenderer strand mode: data must be an object');
  }
  assertString(data.source_spec, 'strand mode data.source_spec');
  assertString(data.target_spec, 'strand mode data.target_spec');
  assertArray(data.steps, 'strand mode data.steps');
  data.steps.forEach((step, idx) => {
    validateStrandStep(step, `strand mode data.steps[${idx}]`);
  });
  if (data.media_display_names !== undefined
      && (data.media_display_names === null || typeof data.media_display_names !== 'object')) {
    throw new Error('CapGraphRenderer strand mode: data.media_display_names must be an object when present');
  }
}

function validateBodyOutcome(outcome, path) {
  if (!outcome || typeof outcome !== 'object') {
    throw new Error(`CapGraphRenderer: ${path} is not an object`);
  }
  if (typeof outcome.body_index !== 'number' || !Number.isInteger(outcome.body_index) || outcome.body_index < 0) {
    throw new Error(`CapGraphRenderer: ${path}.body_index must be a non-negative integer`);
  }
  if (typeof outcome.success !== 'boolean') {
    throw new Error(`CapGraphRenderer: ${path}.success must be a boolean`);
  }
  assertArray(outcome.cap_urns, `${path}.cap_urns`);
  outcome.cap_urns.forEach((u, i) => assertString(u, `${path}.cap_urns[${i}]`));
  if (outcome.failed_cap !== undefined && outcome.failed_cap !== null
      && (typeof outcome.failed_cap !== 'string' || outcome.failed_cap.length === 0)) {
    throw new Error(`CapGraphRenderer: ${path}.failed_cap must be a non-empty string when present`);
  }
  if (!outcome.success && outcome.failed_cap === undefined) {
    // Failure without a failed_cap is allowed (e.g. infrastructure
    // failure before any cap ran) but we still expect the field to be
    // present — either null or a string. Rust's Option<String>
    // serializes as null or the string, never missing.
  }
}

function validateRunPayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('CapGraphRenderer run mode: data must be an object');
  }
  if (!data.resolved_strand || typeof data.resolved_strand !== 'object') {
    throw new Error('CapGraphRenderer run mode: data.resolved_strand must be an object');
  }
  validateStrandPayload(Object.assign({}, data.resolved_strand, {
    media_display_names: data.media_display_names,
  }));
  assertArray(data.body_outcomes, 'run mode data.body_outcomes');
  data.body_outcomes.forEach((o, idx) => {
    validateBodyOutcome(o, `run mode data.body_outcomes[${idx}]`);
  });
  if (typeof data.visible_success_count !== 'number' || data.visible_success_count < 0) {
    throw new Error('CapGraphRenderer run mode: data.visible_success_count must be a non-negative number');
  }
  if (typeof data.visible_failure_count !== 'number' || data.visible_failure_count < 0) {
    throw new Error('CapGraphRenderer run mode: data.visible_failure_count must be a non-negative number');
  }
  if (typeof data.total_body_count !== 'number' || data.total_body_count < 0) {
    throw new Error('CapGraphRenderer run mode: data.total_body_count must be a non-negative number');
  }
}

function validateMachinePayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('CapGraphRenderer machine mode: data must be an object');
  }
  assertArray(data.elements, 'machine mode data.elements');
  data.elements.forEach((el, idx) => {
    if (!el || typeof el !== 'object') {
      throw new Error(`CapGraphRenderer machine mode: data.elements[${idx}] is not an object`);
    }
    if (el.kind !== 'node' && el.kind !== 'cap' && el.kind !== 'edge') {
      throw new Error(
        `CapGraphRenderer machine mode: data.elements[${idx}].kind must be "node" | "cap" | "edge" (got: ${JSON.stringify(el.kind)})`
      );
    }
    assertString(el.graph_id, `machine mode data.elements[${idx}].graph_id`);
    if (el.kind === 'edge') {
      assertString(el.source_graph_id, `machine mode data.elements[${idx}].source_graph_id`);
      assertString(el.target_graph_id, `machine mode data.elements[${idx}].target_graph_id`);
    }
  });
}

// =============================================================================
// Per-mode graph builders. Each returns the cytoscape `elements` list plus
// any mode-specific bookkeeping stored on the renderer instance.
// =============================================================================

const GOLDEN_ANGLE = 137.508;

function goldenHue(index) {
  return (index * GOLDEN_ANGLE) % 360;
}

// Remap a raw 0..360 hue into bands that avoid red (330-30) and green
// (90-150). Used across all cap-style edges so success/failure greens and
// reds stay reserved for run-mode body outcomes.
function remapHue(raw) {
  const t = ((raw % 360) + 360) % 360 / 360;
  const safe = t * 240;
  if (safe < 60) return 30 + safe;
  return 150 + (safe - 60);
}

function edgeHueColor(edgeIdx) {
  const hue = remapHue(goldenHue(edgeIdx));
  return `hsl(${hue}, 60%, 55%)`;
}

// --------- Browse mode builder ----------------------------------------------

function buildBrowseGraphData(capabilities) {
  validateBrowseData(capabilities);

  const CapUrn = requireHostDependency('CapUrn');
  const createCap = requireHostDependency('createCap');
  const CapGraph = requireHostDependency('CapGraph');

  const nodesMap = new Map();
  const edges = [];
  const capGraph = new CapGraph();
  const mediaTitles = new Map();
  const capabilitiesByEdgeId = new Map();

  for (const capData of capabilities) {
    const inSpec = canonicalMediaUrn(capData.in_spec);
    const outSpec = canonicalMediaUrn(capData.out_spec);

    if (!nodesMap.has(inSpec)) nodesMap.set(inSpec, { id: inSpec });
    if (!nodesMap.has(outSpec)) nodesMap.set(outSpec, { id: outSpec });

    if (capData.in_media_title && !mediaTitles.has(inSpec)) {
      mediaTitles.set(inSpec, capData.in_media_title);
    }
    if (capData.out_media_title && !mediaTitles.has(outSpec)) {
      mediaTitles.set(outSpec, capData.out_media_title);
    }

    const edgeId = `edge-${edges.length}`;
    const title = capData.title || '';

    // Parsing the URN canonicalizes it and validates it — fail hard on
    // malformed registry data.
    const parsedUrn = CapUrn.fromString(capData.urn);
    const cap = createCap(parsedUrn, title, capData.command || '');
    const capGraphEdgeIndex = capGraph.edges.length;
    capGraph.addCap(cap, 'registry');

    edges.push({
      id: edgeId,
      source: inSpec,
      target: outSpec,
      title,
      capability: capData,
      capGraphEdgeIndex,
    });
    capabilitiesByEdgeId.set(edgeId, capData);
  }

  edges.forEach((edge, i) => {
    edge.color = edgeHueColor(i);
  });

  const nodes = Array.from(nodesMap.values());

  const adjacency = new Map();
  const reverseAdj = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    adjacency.get(edge.source).add(edge.target);
    if (!reverseAdj.has(edge.target)) reverseAdj.set(edge.target, new Set());
    reverseAdj.get(edge.target).add(edge.source);
  }

  return { nodes, edges, adjacency, reverseAdj, capGraph, mediaTitles, capabilitiesByEdgeId };
}

function browseCytoscapeElements(built) {
  const nodeElements = built.nodes.map(node => ({
    group: 'nodes',
    data: {
      id: node.id,
      label: mediaNodeLabel(node.id),
      mediaTitle: built.mediaTitles.get(node.id) || '',
      fullUrn: node.id,
    },
  }));
  const edgeElements = built.edges.map(edge => {
    const cardinality = cardinalityFromCap(edge.capability);
    const label = `${edge.title} (${cardinality})`;
    return {
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label,
        title: edge.title,
        cardinality,
        fullUrn: edge.capability.urn,
        capGraphEdgeIndex: edge.capGraphEdgeIndex,
        color: edge.color,
      },
    };
  });
  return nodeElements.concat(edgeElements);
}

// --------- Strand mode builder ----------------------------------------------

// Classify each Cap step by its adjacency to non-Cap neighbor steps
// (ForEach before, Collect after). Exported for testing.
function classifyStrandCapSteps(steps) {
  const capStepIndices = [];
  steps.forEach((step, idx) => {
    const variant = Object.keys(step.step_type)[0];
    if (variant === 'Cap') capStepIndices.push(idx);
  });
  const capFlags = new Map();
  for (const idx of capStepIndices) {
    const prevForEach = idx > 0
      && Object.keys(steps[idx - 1].step_type)[0] === 'ForEach';
    const nextCollect = idx < steps.length - 1
      && Object.keys(steps[idx + 1].step_type)[0] === 'Collect';
    capFlags.set(idx, { prevForEach, nextCollect });
  }
  return { capStepIndices, capFlags };
}

// Build the strand graph by mirroring capdag's plan builder
// (`capdag/src/planner/plan_builder.rs::build_plan_from_path`). The plan
// builder is the authoritative source of truth for how strand steps
// translate into a DAG of nodes and edges:
//
//   * Node IDs are positional: `input_slot`, `step_0`, `step_1`, …,
//     `output`. They are NOT media URN strings — URN comparisons for
//     graph topology are wrong because the planner connects steps by
//     the order-theoretic `conformsTo` relation, not by string equality.
//   * `prev_node_id` is a single running pointer, only advanced by Cap
//     steps. ForEach steps mark the start of a body span without
//     advancing prev; the body's first Cap still connects to whatever
//     was before the ForEach.
//   * Cap inside a ForEach body connects from `prev_node_id` like any
//     other cap, AND tracks `body_entry` (first cap in body) and
//     `body_exit` (most recent cap in body).
//   * Collect after a ForEach body creates a ForEach node with
//     boundaries, an iteration edge to body_entry, a Collect node, and
//     a collection edge from body_exit to Collect. prev_node_id becomes
//     the Collect node.
//   * Standalone Collect (no enclosing ForEach) creates a Collect node
//     consuming prev_node_id directly.
//   * Unclosed ForEach with no body caps is a terminal unwrap — the
//     ForEach node is skipped; prev_node_id stays as-is.
//   * Unclosed ForEach WITH body caps gets a ForEach node, iteration
//     edge to body_entry, and prev_node_id becomes body_exit.
//
// Node labels come from the `media_display_names` map keyed by the
// step's canonical URN (or source_spec/target_spec for the boundary
// nodes). ForEach and Collect nodes display "for each" / "collect".
// Cap edges carry the cap title plus cardinality marker when either
// input or output is a sequence.
function buildStrandGraphData(data) {
  validateStrandPayload(data);

  const mediaDisplayNames = data.media_display_names || {};
  const sourceSpec = canonicalMediaUrn(data.source_spec);
  const targetSpec = canonicalMediaUrn(data.target_spec);

  // Look up a display name for a media URN via the host-supplied map.
  // Uses `MediaUrn.isEquivalent` so tag-order variation doesn't defeat
  // the lookup — URNs are compared semantically, never as raw strings.
  const MediaUrn = requireHostDependency('MediaUrn');
  const displayEntries = [];
  for (const [urn, display] of Object.entries(mediaDisplayNames)) {
    if (typeof display !== 'string' || display.length === 0) continue;
    try {
      displayEntries.push({ media: MediaUrn.fromString(urn), display });
    } catch (_) {
      // Skip entries with unparseable URN keys — the host payload is
      // trusted, but malformed keys are not fatal.
    }
  }
  function displayNameFor(canonicalUrn) {
    const candidate = MediaUrn.fromString(canonicalUrn);
    for (const entry of displayEntries) {
      if (candidate.isEquivalent(entry.media)) return entry.display;
    }
    return mediaNodeLabel(canonicalUrn);
  }

  const nodes = [];
  const edges = [];
  const nodeIds = new Set();

  function addNode(id, label, fullUrn, nodeClass) {
    if (nodeIds.has(id)) return;
    nodeIds.add(id);
    nodes.push({
      id,
      label,
      fullUrn: fullUrn || '',
      nodeClass: nodeClass || '',
    });
  }
  let edgeCounter = 0;
  function addEdge(source, target, label, title, fullUrn, edgeClass, meta) {
    const m = meta || {};
    edges.push({
      id: `strand-edge-${edgeCounter}`,
      source,
      target,
      label: label || '',
      title: title || '',
      fullUrn: fullUrn || '',
      edgeClass: edgeClass || '',
      color: edgeHueColor(edgeCounter),
      // `foreachEntry` flags a cap edge as the first cap entering a
      // ForEach body (the "phantom direct edge" in plan builder's
      // terminology). Render-time collapse uses this to relabel the
      // edge with the cap title + (1→n) marker. Defaults to false.
      foreachEntry: m.foreachEntry === true,
      // `singleCapClosedBody` flags a foreach-entry cap edge whose
      // body is closed by a Collect AND contains exactly one cap.
      // Such a cap is both the body entry and the body exit; the
      // render labels the edge with (n→n) to combine iterate+collect.
      singleCapClosedBody: m.singleCapClosedBody === true,
    });
    edgeCounter++;
  }
  // Find the most recently added cap edge whose target is `nodeId`
  // and stamp it with `singleCapClosedBody=true`. Used by the Collect
  // handler when a closed body has exactly one cap (bodyEntry === bodyExit).
  function markSingleCapClosedBody(nodeId) {
    if (!nodeId) return;
    for (let idx = edges.length - 1; idx >= 0; idx--) {
      const e = edges[idx];
      if (e.edgeClass === 'strand-cap-edge' && e.target === nodeId) {
        e.singleCapClosedBody = true;
        return;
      }
    }
  }

  // Entry node — the strand's source media spec.
  const inputSlotId = 'input_slot';
  addNode(inputSlotId, displayNameFor(sourceSpec), sourceSpec, 'strand-source');

  let prevNodeId = inputSlotId;

  // Track ForEach body membership. `insideForEachBody = { index, nodeId }`
  // records which ForEach step we're inside and the id we'll give its
  // eventual node. `bodyEntry`/`bodyExit` track the first and most
  // recent Cap step inside that body.
  let insideForEachBody = null;
  let bodyEntry = null;
  let bodyExit = null;

  // Finalize an outer ForEach body when a nested ForEach starts before
  // the outer's Collect. Mirrors plan_builder.rs:238-289. The render
  // collapse will later drop the ForEach node and synthesize the
  // bridging edges, so we only need to emit the plan-builder
  // topology here.
  function finalizeOuterForEach(outerForEach, outerEntry, outerExit) {
    const outerForEachInput = outerForEach.index === 0
      ? inputSlotId
      : `step_${outerForEach.index - 1}`;
    addNode(outerForEach.nodeId, 'for each', '', 'strand-foreach');
    addEdge(outerForEachInput, outerForEach.nodeId, 'for each', 'for each', '', 'strand-iteration');
    addEdge(outerForEach.nodeId, outerEntry, '', '', '', 'strand-iteration');
    return outerExit;
  }

  data.steps.forEach((step, i) => {
    const variant = Object.keys(step.step_type)[0];
    const nodeId = `step_${i}`;

    if (variant === 'Cap') {
      const body = step.step_type.Cap;
      const toCanonical = canonicalMediaUrn(step.to_spec);
      addNode(nodeId, displayNameFor(toCanonical), toCanonical, 'strand-cap');

      // The first cap inside a ForEach body is the "foreach entry"
      // — its incoming edge crosses the foreach boundary. Strand
      // mode's render collapse relabels that edge with a (1→n)
      // cardinality marker regardless of the cap's own sequence
      // flags, because visually the transition IS the foreach.
      const isForeachEntry = insideForEachBody !== null && bodyEntry === null;

      let label = body.title;
      const cardinality = cardinalityLabel(body.input_is_sequence, body.output_is_sequence);
      if (cardinality !== '1\u21921') {
        label = `${label} (${cardinality})`;
      }
      addEdge(
        prevNodeId,
        nodeId,
        label,
        body.title,
        body.cap_urn,
        'strand-cap-edge',
        { foreachEntry: isForeachEntry }
      );

      if (insideForEachBody !== null) {
        if (bodyEntry === null) bodyEntry = nodeId;
        bodyExit = nodeId;
      }

      prevNodeId = nodeId;
      return;
    }

    if (variant === 'ForEach') {
      // If we're already inside a ForEach body when another ForEach
      // starts, finalize the outer one first.
      if (insideForEachBody !== null) {
        const outer = insideForEachBody;
        const entry = bodyEntry !== null ? bodyEntry : prevNodeId;
        const exit = bodyExit !== null ? bodyExit : prevNodeId;
        if (bodyEntry === null) {
          // Outer ForEach with no body caps is an illegal nesting; the
          // plan builder throws. Mirror that.
          throw new Error(
            `CapGraphRenderer strand: nested ForEach at step[${i}] but outer ForEach at step[${outer.index}] has no body caps`
          );
        }
        prevNodeId = finalizeOuterForEach(outer, entry, exit);
        bodyEntry = null;
        bodyExit = null;
      }
      insideForEachBody = { index: i, nodeId };
      bodyEntry = null;
      bodyExit = null;
      // Do NOT advance prevNodeId — the body's first cap will connect
      // to whatever was before the ForEach.
      return;
    }

    if (variant === 'Collect') {
      if (insideForEachBody !== null) {
        const outer = insideForEachBody;
        const entry = bodyEntry !== null ? bodyEntry : prevNodeId;
        const exit = bodyExit !== null ? bodyExit : prevNodeId;
        const outerForEachInput = outer.index === 0
          ? inputSlotId
          : `step_${outer.index - 1}`;

        addNode(outer.nodeId, 'for each', '', 'strand-foreach');
        addEdge(outerForEachInput, outer.nodeId, 'for each', 'for each', '', 'strand-iteration');
        addEdge(outer.nodeId, entry, '', '', '', 'strand-iteration');

        addNode(nodeId, 'collect', '', 'strand-collect');
        addEdge(exit, nodeId, 'collect', 'collect', '', 'strand-collection');

        // Single-cap closed body: the single cap serves as both the
        // body entry and the body exit. The render collapse uses
        // this flag to pick the (n→n) combined cardinality marker
        // for the entry edge and emit a plain unlabeled connector
        // for the synthesized exit edge.
        if (bodyEntry !== null && bodyEntry === bodyExit) {
          markSingleCapClosedBody(bodyEntry);
        }

        insideForEachBody = null;
        bodyEntry = null;
        bodyExit = null;
        prevNodeId = nodeId;
      } else {
        // Standalone Collect — scalar → list-of-one. Mirrors
        // plan_builder.rs:333-355. There is no enclosing foreach
        // body, so the preceding cap is NOT flagged as a
        // foreach-exit; the render-time collapse will synthesize a
        // plain "collect" marker on the synthesized edge replacing
        // the dropped Collect node.
        addNode(nodeId, 'collect', '', 'strand-collect');
        addEdge(prevNodeId, nodeId, 'collect', 'collect', '', 'strand-collection');
        prevNodeId = nodeId;
      }
      return;
    }

    throw new Error(`CapGraphRenderer strand: unknown step_type variant '${variant}' at step[${i}]`);
  });

  // Handle unclosed ForEach after the walk. Mirrors plan_builder.rs:362-428.
  // An unclosed ForEach with a body is NOT marked as `singleCapClosedBody`
  // because there's no Collect closing it — the body "fans out" but
  // never converges. The body entry still gets (1→n) on its incoming
  // edge via the foreachEntry flag set in the Cap handler.
  if (insideForEachBody !== null) {
    const outer = insideForEachBody;
    const hasBodyEntry = bodyEntry !== null;
    if (hasBodyEntry) {
      const entry = bodyEntry;
      const exit = bodyExit;
      const outerForEachInput = outer.index === 0
        ? inputSlotId
        : `step_${outer.index - 1}`;
      addNode(outer.nodeId, 'for each', '', 'strand-foreach');
      addEdge(outerForEachInput, outer.nodeId, 'for each', 'for each', '', 'strand-iteration');
      addEdge(outer.nodeId, entry, '', '', '', 'strand-iteration');
      prevNodeId = exit;
    }
    // hasBodyEntry === false is a terminal unwrap — skip the ForEach
    // node entirely, prev_node_id stays as-is.
    insideForEachBody = null;
    bodyEntry = null;
    bodyExit = null;
  }

  // Final output node. Mirrors plan_builder.rs:430-432.
  const outputId = 'output';
  addNode(outputId, displayNameFor(targetSpec), targetSpec, 'strand-target');
  addEdge(prevNodeId, outputId, '', '', '', 'strand-cap-edge');

  // Return the raw plan-builder topology. Strand mode collapses
  // ForEach/Collect nodes into edge labels at render time (see
  // `strandCytoscapeElements`); run mode keeps them as explicit
  // nodes because body replicas anchor at the ForEach/Collect
  // junctions.
  return { nodes, edges, sourceSpec, targetSpec };
}

// Transform the plan-builder strand topology into the render shape
// strand mode actually displays. Pure function; does NOT mutate the
// input. Run mode bypasses this transform and consumes the raw
// topology directly (see `runCytoscapeElements`).
//
// The display rules (per user spec):
//
//   1. ForEach and Collect are NOT rendered as nodes. They're
//      execution-layer concepts; the visible semantic is carried on
//      the surrounding cap edges.
//
//   2. The first cap edge entering a ForEach body is relabeled to
//      `<cap_title> (1→n)`. The builder flags those edges with
//      `foreachEntry: true`. The (1→n) overrides whatever cardinality
//      the cap's own `input_is_sequence`/`output_is_sequence` would
//      produce, because visually the transition is the foreach.
//
//   3. The last cap edge exiting a ForEach body is replaced by a
//      synthesized bridging edge labeled `<cap_title> (n→1)` — the
//      symmetric counterpart of the foreach-entry (1→n) label.
//      For a single-cap body (same cap is entry and exit) the flag
//      `singleCapClosedBody` collapses both markers into a single
//      `(n→n)` label on the entry edge, and the exit side becomes
//      a plain unlabeled connector.
//
//   4. Standalone Collect (not wrapping a ForEach) synthesizes a
//      plain edge labeled `"collect"` — the Collect is rendered
//      as a transition, not the preceding cap's own label.
//
//   4. If the last cap step's `to_spec` is semantically equivalent
//      to the strand's `target_spec` (via MediaUrn.isEquivalent),
//      the separate `output` target node is dropped and the last
//      cap edge lands on that merged endpoint. Removes the visible
//      duplicate node.
function collapseStrandShapeTransitions(built) {
  const MediaUrn = requireHostDependency('MediaUrn');
  const foreachCardinality = cardinalityLabel(false, true); // "1→n"
  const collectCardinality = cardinalityLabel(true, false); // "n→1"

  // Index for lookups.
  const nodeById = new Map();
  for (const n of built.nodes) nodeById.set(n.id, n);

  // Step 1: before dropping Collect nodes, synthesize the
  // bridging edge that replaces each dropped Collect. For a
  // Collect node C the plan builder produced:
  //   body_exit → C   (strand-collection, label="collect")
  //   C → next        (strand-cap-edge, label="")
  // The collapse drops C and its two touching edges. To preserve
  // the flow from body_exit to `next`, we synthesize a new edge
  // body_exit → next. Its label depends on the Collect's
  // context (determined by inspecting the body_exit cap's own
  // incoming edge):
  //
  //   * Standalone Collect (no enclosing foreach; body_exit is a
  //     plain cap with no foreach markers): synthesize a plain
  //     edge labeled "collect" — the Collect itself is the
  //     transition the user sees.
  //
  //   * Closed-body Collect with a single-cap body (the body_exit
  //     cap edge is flagged `singleCapClosedBody`): synthesize an
  //     unlabeled connector. The single cap's own entry edge is
  //     relabeled with (n→n) in step 2 and carries both the
  //     iterate and collect semantics at once.
  //
  //   * Closed-body Collect with a multi-cap body (body_exit cap
  //     edge is a plain cap edge inside the body, NOT marked as
  //     foreachEntry or singleCapClosedBody): label the synth
  //     edge with the body-exit cap's title + (n→1) — the
  //     symmetric counterpart of the foreach-entry (1→n) label.
  const synthesizedExitEdges = [];
  for (const node of built.nodes) {
    if (node.nodeClass !== 'strand-collect') continue;
    const incoming = built.edges.filter(e =>
      e.target === node.id && e.edgeClass === 'strand-collection');
    const outgoing = built.edges.filter(e =>
      e.source === node.id && e.edgeClass === 'strand-cap-edge');
    for (const inEdge of incoming) {
      for (const outEdge of outgoing) {
        const bodyExitNodeId = inEdge.source;
        const bodyExitCapEdge = built.edges.find(e =>
          e.edgeClass === 'strand-cap-edge' && e.target === bodyExitNodeId);
        // Is the Collect part of a closed foreach body? A Collect
        // is "closed" when the body_exit cap is reachable from the
        // same foreach that the Collect closes. We detect this by
        // checking whether the Collect's target node has any
        // incoming iteration edge (i.e. there's a strand-foreach
        // node whose outgoing iteration reaches the body_exit or
        // one of its upstream cap nodes). Simpler heuristic that
        // works for every shape we emit: the body_exit has an
        // ancestor that is a strand-foreach node.
        let hasEnclosingForeach = false;
        {
          const visited = new Set();
          const stack = [bodyExitNodeId];
          while (stack.length > 0) {
            const cur = stack.pop();
            if (visited.has(cur)) continue;
            visited.add(cur);
            const curNode = built.nodes.find(n => n.id === cur);
            if (curNode && curNode.nodeClass === 'strand-foreach') {
              hasEnclosingForeach = true;
              break;
            }
            for (const up of built.edges) {
              if (up.target === cur) stack.push(up.source);
            }
          }
        }
        let synthLabel;
        let synthTitle;
        let synthFullUrn;
        if (!hasEnclosingForeach) {
          // Standalone Collect.
          synthLabel = 'collect';
          synthTitle = 'collect';
          synthFullUrn = '';
        } else if (bodyExitCapEdge && bodyExitCapEdge.singleCapClosedBody) {
          // Single-cap closed body. The cap's own entry edge is
          // relabeled with (n→n) in step 2; the exit side is just
          // a connector with no duplicate label.
          synthLabel = '';
          synthTitle = '';
          synthFullUrn = '';
        } else {
          // Multi-cap closed body. The body_exit cap's own
          // incoming edge stays unmodified (carrying just the
          // cap title, no cardinality markers). The synthesized
          // exit edge carries the (n→1) collect marker.
          const title = bodyExitCapEdge ? bodyExitCapEdge.title : '';
          synthLabel = `${title} (${collectCardinality})`;
          synthTitle = title;
          synthFullUrn = bodyExitCapEdge ? bodyExitCapEdge.fullUrn : '';
        }
        synthesizedExitEdges.push({
          id: `${node.id}-collapsed-exit-${synthesizedExitEdges.length}`,
          source: bodyExitNodeId,
          target: outEdge.target,
          label: synthLabel,
          title: synthTitle,
          fullUrn: synthFullUrn,
          edgeClass: 'strand-cap-edge',
          color: bodyExitCapEdge ? bodyExitCapEdge.color : inEdge.color,
          foreachEntry: false,
          singleCapClosedBody: false,
        });
      }
    }
  }

  // Drop all ForEach/Collect nodes and every edge that touches
  // them (direct, iteration, collection, and the trailing collect
  // cap-edge connector). The render never shows those nodes.
  const dropNodeIds = new Set();
  for (const node of built.nodes) {
    if (node.nodeClass === 'strand-foreach' || node.nodeClass === 'strand-collect') {
      dropNodeIds.add(node.id);
    }
  }
  let nodes = built.nodes.filter(n => !dropNodeIds.has(n.id));
  let edges = built.edges.filter(e =>
    !dropNodeIds.has(e.source) &&
    !dropNodeIds.has(e.target) &&
    e.edgeClass !== 'strand-iteration' &&
    e.edgeClass !== 'strand-collection');
  edges = edges.concat(synthesizedExitEdges);

  // Step 2: relabel flagged foreach-entry cap edges with the
  // cap title + cardinality marker.
  //
  // When the body is a single cap (bodyEntry === bodyExit under a
  // closed Collect), the cap edge has `singleCapClosedBody: true`
  // and we use (n→n) — the outer sequence is iterated, the cap
  // runs per-item, and the result is collected back into a
  // sequence. Otherwise we use plain (1→n) for the foreach entry.
  const iterAndCollectCardinality = cardinalityLabel(true, true); // "n→n"
  edges = edges.map(e => {
    if (e.edgeClass !== 'strand-cap-edge') return e;
    if (e.foreachEntry && e.singleCapClosedBody) {
      return Object.assign({}, e, {
        label: `${e.title} (${iterAndCollectCardinality})`,
      });
    }
    if (e.foreachEntry) {
      return Object.assign({}, e, {
        label: `${e.title} (${foreachCardinality})`,
      });
    }
    return e;
  });

  // Step 3: merge the trailing `step_N → output` edge when step_N
  // and output represent the same media URN. The strand builder
  // always emits a separate `output` node with a (possibly empty)
  // connector edge from the last prev; when the URNs coincide the
  // output is a visible duplicate.
  //
  // Find the `strand-target` node and look for a single incoming
  // edge from a `strand-cap` (or `strand-source`) node. Compare the
  // endpoints' `fullUrn` semantically.
  const targetNode = nodes.find(n => n.nodeClass === 'strand-target');
  if (targetNode) {
    const incomingToTarget = edges.filter(e => e.target === targetNode.id);
    if (incomingToTarget.length === 1) {
      const trailing = incomingToTarget[0];
      const upstreamNode = nodes.find(n => n.id === trailing.source);
      if (upstreamNode && upstreamNode.fullUrn && targetNode.fullUrn) {
        let equivalent = false;
        try {
          const a = MediaUrn.fromString(upstreamNode.fullUrn);
          const b = MediaUrn.fromString(targetNode.fullUrn);
          equivalent = a.isEquivalent(b);
        } catch (_) {
          equivalent = false;
        }
        // Merge only if the trailing edge is the unadorned connector
        // (empty label). A labeled last-cap edge carries meaningful
        // info and must not be collapsed away.
        if (equivalent && (!trailing.label || trailing.label.length === 0)) {
          // Drop the trailing connector edge and the target node.
          // The upstream node effectively becomes the target visually.
          // Rename its display label to the target's display to
          // preserve the user-configured media_display_names entry.
          edges = edges.filter(e => e.id !== trailing.id);
          nodes = nodes
            .filter(n => n.id !== targetNode.id)
            .map(n => n.id === upstreamNode.id
              ? Object.assign({}, n, { label: targetNode.label, nodeClass: 'strand-target' })
              : n);
        }
      }
    }
  }

  return { nodes, edges };
}

function strandCytoscapeElements(built, options) {
  // Strand mode presents ForEach and Collect as edge labels, not as
  // boxed nodes. Apply the cosmetic collapse right before emitting
  // cytoscape elements so the underlying plan-builder topology stays
  // intact for any callers that need it.
  //
  // Run mode opts out (`options.collapse === false`) because its body
  // replicas visually fan out from the ForEach node and merge at the
  // Collect node — those junctions must remain as explicit graph
  // nodes for the fan-in/fan-out to be visible.
  const shouldCollapse = !(options && options.collapse === false);
  const source = shouldCollapse ? collapseStrandShapeTransitions(built) : built;
  const nodeElements = source.nodes.map(node => ({
    group: 'nodes',
    data: {
      id: node.id,
      label: node.label,
      fullUrn: node.fullUrn,
    },
    classes: node.nodeClass || '',
  }));
  const edgeElements = source.edges.map(edge => ({
    group: 'edges',
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      title: edge.title,
      fullUrn: edge.fullUrn,
      color: edge.color,
    },
    classes: edge.edgeClass || '',
  }));
  return nodeElements.concat(edgeElements);
}

// --------- Run mode builder -------------------------------------------------

// Find a cap step in the resolved strand whose Cap.cap_urn semantically
// matches the supplied URN string. Uses CapUrn.isEquivalent — never
// string equality.
function findCapStepIndexByUrn(steps, targetUrnString) {
  const CapUrn = requireHostDependency('CapUrn');
  const target = CapUrn.fromString(targetUrnString);
  for (let i = 0; i < steps.length; i++) {
    const variant = Object.keys(steps[i].step_type)[0];
    if (variant !== 'Cap') continue;
    const candidate = CapUrn.fromString(steps[i].step_type.Cap.cap_urn);
    if (candidate.isEquivalent(target)) return i;
  }
  return -1;
}

// Remove body-interior cap nodes (caps strictly AFTER the first
// body cap) from a COLLAPSED strand backbone so that per-body
// replicas are the only visible path through the foreach body.
// The FIRST body cap node is retained — its incoming foreachEntry
// edge is the backbone "fallback connector" that keeps the graph
// connected when zero bodies succeed.
//
// Dropping interior body caps also drops their outgoing edges,
// including any synthesized collect-exit edge that would have
// connected the last body cap to the post-collect target. To
// preserve connectivity, the function replaces those with a
// plain bridging edge from the first body cap directly to the
// post-collect target.
function stripRunBackboneBodyInterior(built, steps, foreachStepIdx, collectStepIdx) {
  if (foreachStepIdx < 0) return built;
  const bodyEnd = collectStepIdx >= 0 ? collectStepIdx : steps.length;

  const interiorStepIdxs = [];
  for (let i = foreachStepIdx + 1; i < bodyEnd; i++) {
    if (Object.keys(steps[i].step_type)[0] === 'Cap') {
      interiorStepIdxs.push(i);
    }
  }
  if (interiorStepIdxs.length <= 1) {
    // Zero or one body cap — no prototype chain to strip.
    return built;
  }

  const firstBodyStepId = `step_${interiorStepIdxs[0]}`;
  const lastBodyStepId = `step_${interiorStepIdxs[interiorStepIdxs.length - 1]}`;
  const dropInteriorIds = new Set();
  for (let i = 1; i < interiorStepIdxs.length; i++) {
    dropInteriorIds.add(`step_${interiorStepIdxs[i]}`);
  }

  // Find the post-body target: the node that the last body cap's
  // outgoing edge points at in the collapsed backbone. This is
  // usually `output` or (after the collect-exit synth) the merged
  // target node.
  const postBodyEdge = built.edges.find(e => e.source === lastBodyStepId);
  const postBodyTarget = postBodyEdge ? postBodyEdge.target : null;

  const keptNodes = built.nodes.filter(n => !dropInteriorIds.has(n.id));
  let keptEdges = built.edges.filter(e =>
    !dropInteriorIds.has(e.source) && !dropInteriorIds.has(e.target));

  // Bridge firstBody → postBodyTarget directly with a plain
  // unlabeled connector so the graph stays connected. Replicas
  // will overlay labeled chains alongside this connector.
  if (postBodyTarget && postBodyTarget !== firstBodyStepId) {
    const bridgeExists = keptEdges.some(e =>
      e.source === firstBodyStepId && e.target === postBodyTarget);
    if (!bridgeExists) {
      keptEdges = keptEdges.concat([{
        id: `run-bridge-${firstBodyStepId}-${postBodyTarget}`,
        source: firstBodyStepId,
        target: postBodyTarget,
        label: '',
        title: '',
        fullUrn: '',
        edgeClass: 'strand-cap-edge',
        color: postBodyEdge ? postBodyEdge.color : edgeHueColor(0),
        foreachEntry: false,
        singleCapClosedBody: false,
      }]);
    }
  }

  return {
    nodes: keptNodes,
    edges: keptEdges,
    sourceSpec: built.sourceSpec,
    targetSpec: built.targetSpec,
  };
}

function buildRunGraphData(data) {
  validateRunPayload(data);

  // Build the raw strand topology and then apply the cosmetic
  // collapse — run mode uses the SAME cleaned-up backbone that
  // strand mode uses (no ForEach/Collect nodes). Replicas are an
  // additional overlay on top of that collapsed backbone.
  const strandInput = Object.assign({}, data.resolved_strand, {
    media_display_names: data.media_display_names,
  });
  const strandBuiltRaw = buildStrandGraphData(strandInput);
  const strandBuiltCollapsed = collapseStrandShapeTransitions(strandBuiltRaw);

  // Locate the ForEach/Collect span in the raw steps. Positional IDs
  // survive the collapse (node IDs are `step_${i}` from the builder),
  // so we can still identify which collapsed nodes are the body caps.
  const steps = data.resolved_strand.steps;
  let foreachStepIdx = -1;
  let collectStepIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    const variant = Object.keys(steps[i].step_type)[0];
    if (variant === 'ForEach' && foreachStepIdx < 0) foreachStepIdx = i;
    if (variant === 'Collect' && collectStepIdx < 0) collectStepIdx = i;
  }
  const hasForeach = foreachStepIdx >= 0;

  // Drop interior body-cap nodes (caps 2..N inside the body) from
  // the collapsed backbone so the prototype chain doesn't duplicate
  // the per-body replicas visually. The FIRST body cap is retained
  // as the body-entry node so the backbone's foreachEntry edge
  // (`<cap_title> (1→n)`) still has a landing point.
  let strandBuilt = hasForeach
    ? stripRunBackboneBodyInterior(strandBuiltCollapsed, steps, foreachStepIdx, collectStepIdx)
    : strandBuiltCollapsed;

  // Filter and bound the outcomes.
  const allOutcomes = data.body_outcomes.slice().sort((a, b) => a.body_index - b.body_index);
  const successes = allOutcomes.filter(o => o.success);
  const failures = allOutcomes.filter(o => !o.success);
  const visibleSuccess = successes.slice(0, data.visible_success_count);
  const visibleFailure = failures.slice(0, data.visible_failure_count);
  const hiddenSuccessCount = successes.length - visibleSuccess.length;
  const hiddenFailureCount = failures.length - visibleFailure.length;

  // Collect the Cap steps inside the ForEach body. Each body replica
  // chains through these caps.
  const bodyCapSteps = [];
  const bodyStart = hasForeach ? foreachStepIdx + 1 : 0;
  const bodyEnd = collectStepIdx >= 0 ? collectStepIdx : steps.length;
  for (let i = bodyStart; i < bodyEnd; i++) {
    if (Object.keys(steps[i].step_type)[0] === 'Cap') {
      bodyCapSteps.push({ globalIndex: i, step: steps[i] });
    }
  }

  // Body replicas fan out from the node BEFORE the foreach (which,
  // in the collapsed backbone, is the source of the foreachEntry
  // edge). For a foreach at step index k, the pre-foreach node is
  // `step_${k-1}` when k > 0, or `input_slot` when k == 0. This
  // node survives the collapse as a regular `strand-cap` or
  // `strand-source` node.
  //
  // Replicas merge back at the node AFTER the body. After collapse,
  // this is the FIRST body cap node (`step_${bodyCapSteps[0]}`)
  // when the ForEach has a single-cap body, or the post-collect
  // node for multi-cap bodies. The post-collect node is whatever
  // the plan builder's Collect step connected to downstream, which
  // after collapse is either the next cap (`step_${collectStepIdx+1}`)
  // or the target/output node (possibly merged into the last body
  // cap if their URNs are equivalent).
  const anchorNodeId = hasForeach && foreachStepIdx > 0
    ? `step_${foreachStepIdx - 1}`
    : 'input_slot';

  // Find the merge node by scanning the collapsed backbone for the
  // node the body reaches after the foreach body. Start from the
  // first body cap node and follow forward edges until we leave
  // the body. For a single-body-cap strand where the body cap IS
  // the merged target, `mergeNodeId` resolves to that node.
  let mergeNodeId;
  {
    // Find body cap step indices in the resolved strand so we can
    // identify which step IDs are "inside body" (should be skipped
    // when finding the merge target).
    const bodyInteriorSet = new Set();
    const bodyEnd = collectStepIdx >= 0 ? collectStepIdx : steps.length;
    for (let i = foreachStepIdx + 1; i < bodyEnd; i++) {
      if (Object.keys(steps[i].step_type)[0] === 'Cap') {
        bodyInteriorSet.add(`step_${i}`);
      }
    }
    // Start from the first body cap and walk forward.
    const firstBodyCapIdx = (() => {
      for (let i = foreachStepIdx + 1; i < bodyEnd; i++) {
        if (Object.keys(steps[i].step_type)[0] === 'Cap') return i;
      }
      return -1;
    })();
    if (firstBodyCapIdx < 0) {
      mergeNodeId = 'output';
    } else {
      // Walk the collapsed strand's edges starting from the first
      // body cap node; the merge target is the first node reached
      // that isn't inside the body.
      let cursor = `step_${firstBodyCapIdx}`;
      let guard = 64;
      const collapsedNodeIds = new Set(strandBuilt.nodes.map(n => n.id));
      while (guard-- > 0) {
        // If the cursor is itself outside the body, we've found it.
        if (!bodyInteriorSet.has(cursor) && collapsedNodeIds.has(cursor)) {
          mergeNodeId = cursor;
          break;
        }
        // Otherwise follow the cursor's outgoing edge.
        const out = strandBuilt.edges.find(e => e.source === cursor);
        if (!out) {
          // Nothing to follow — the body cap IS the end of the
          // strand. Use the cursor as the merge point (it's
          // typically the merged target node).
          mergeNodeId = cursor;
          break;
        }
        cursor = out.target;
      }
      if (mergeNodeId === undefined) {
        // Guard exhausted — fall back to output. This is impossible
        // for any well-formed strand but keeps the runtime safe.
        mergeNodeId = 'output';
      }
    }
  }

  const replicaNodes = [];
  const replicaEdges = [];

  function buildBodyReplica(outcome) {
    const success = outcome.success;
    const successClass = success ? 'body-success' : 'body-failure';
    const edgeClass = success ? 'body-success' : 'body-failure';
    const colorVar = success ? '--graph-body-edge-success' : '--graph-body-edge-failure';

    // Trace end: failures stop at failed_cap. `CapUrn.isEquivalent`
    // is used for the match — never string equality.
    let traceEnd = bodyCapSteps.length;
    if (!success && typeof outcome.failed_cap === 'string' && outcome.failed_cap.length > 0) {
      const CapUrn = requireHostDependency('CapUrn');
      const target = CapUrn.fromString(outcome.failed_cap);
      for (let i = 0; i < bodyCapSteps.length; i++) {
        const candidate = CapUrn.fromString(bodyCapSteps[i].step.step_type.Cap.cap_urn);
        if (candidate.isEquivalent(target)) {
          traceEnd = i + 1;
          break;
        }
      }
    }
    if (traceEnd === 0) return;

    let prevBodyNodeId = anchorNodeId;
    const bodyKey = `body-${outcome.body_index}`;
    const titleLabel = typeof outcome.title === 'string' && outcome.title.length > 0
      ? outcome.title
      : `body ${outcome.body_index}`;

    for (let i = 0; i < traceEnd; i++) {
      const body = bodyCapSteps[i].step.step_type.Cap;
      const targetCanonical = canonicalMediaUrn(bodyCapSteps[i].step.to_spec);
      const replicaNodeId = `${bodyKey}-n-${i}`;
      replicaNodes.push({
        group: 'nodes',
        data: {
          id: replicaNodeId,
          label: mediaNodeLabel(targetCanonical),
          fullUrn: targetCanonical,
          bodyIndex: outcome.body_index,
          bodyTitle: titleLabel,
        },
        classes: successClass,
      });
      replicaEdges.push({
        group: 'edges',
        data: {
          id: `${bodyKey}-e-${i}`,
          source: prevBodyNodeId,
          target: replicaNodeId,
          // Replica edges carry no inline label — the cap title is
          // identical across every visible replica and would just
          // pile up as unreadable rotated text over the fan-out.
          // Hover tooltip exposes the title via `title`; the edge
          // color + the replica node identify the body.
          label: '',
          title: body.title,
          fullUrn: body.cap_urn,
          color: `var(${colorVar})`,
          bodyIndex: outcome.body_index,
        },
        classes: edgeClass,
      });
      prevBodyNodeId = replicaNodeId;
    }

    // Successful bodies merge their replica tail back into the Collect
    // node (or `output` if the ForEach is unclosed) so the graph
    // visibly fans in. Failed bodies do NOT merge — the trace
    // terminates at the failed cap.
    if (success) {
      replicaEdges.push({
        group: 'edges',
        data: {
          id: `${bodyKey}-merge`,
          source: prevBodyNodeId,
          target: mergeNodeId,
          label: '',
          title: 'collect',
          fullUrn: '',
          color: `var(${colorVar})`,
          bodyIndex: outcome.body_index,
        },
        classes: edgeClass,
      });
    }
  }

  visibleSuccess.forEach((o) => buildBodyReplica(o));
  visibleFailure.forEach((o) => buildBodyReplica(o));

  // Once any replicas are rendered (success or failure), the
  // backbone foreach-entry edge becomes a stale placeholder — the
  // replicas ARE the actual execution traces, so the user
  // shouldn't see a duplicate labeled "1→n" edge alongside them.
  // Drop the backbone foreach-entry edge whenever we emit
  // replicas, AND if there were zero successful replicas also
  // drop the orphaned merge node: nothing reached it, and
  // showing a disconnected node misleads the user into thinking
  // the target was reached.
  if (hasForeach && (visibleSuccess.length > 0 || visibleFailure.length > 0)) {
    const backboneForeachEntry = strandBuilt.edges.find(e =>
      e.edgeClass === 'strand-cap-edge' &&
      e.source === anchorNodeId &&
      e.foreachEntry === true);
    let newEdges = strandBuilt.edges;
    let newNodes = strandBuilt.nodes;
    if (backboneForeachEntry) {
      newEdges = newEdges.filter(e => e.id !== backboneForeachEntry.id);
    }
    // If no successful replica will merge into `mergeNodeId`, and
    // the merge node is now only reachable via the (just-dropped)
    // backbone edge, drop the merge node itself.
    if (visibleSuccess.length === 0 && mergeNodeId) {
      const stillIncoming = newEdges.some(e => e.target === mergeNodeId);
      const replicaIncoming = replicaEdges.some(e => e.data && e.data.target === mergeNodeId);
      if (!stillIncoming && !replicaIncoming) {
        newNodes = newNodes.filter(n => n.id !== mergeNodeId);
        newEdges = newEdges.filter(e => e.source !== mergeNodeId && e.target !== mergeNodeId);
      }
    }
    strandBuilt = {
      nodes: newNodes,
      edges: newEdges,
      sourceSpec: strandBuilt.sourceSpec,
      targetSpec: strandBuilt.targetSpec,
    };
  }

  // Build success and failure "show more" nodes when there are hidden
  // outcomes. Anchored at the ForEach node (or input_slot if none).
  const showMoreNodes = [];
  if (hasForeach && bodyCapSteps.length > 0) {
    if (hiddenSuccessCount > 0) {
      const nodeId = 'show-more-success';
      showMoreNodes.push({
        group: 'nodes',
        data: {
          id: nodeId,
          label: `+${hiddenSuccessCount} more succeeded`,
          fullUrn: '',
          showMoreGroup: 'success',
          hiddenCount: hiddenSuccessCount,
        },
        classes: 'show-more body-success',
      });
      replicaEdges.push({
        group: 'edges',
        data: {
          id: 'show-more-success-edge',
          source: anchorNodeId,
          target: nodeId,
          label: '',
          title: '',
          fullUrn: '',
          color: 'var(--graph-body-edge-success)',
        },
        classes: 'body-success',
      });
    }
    if (hiddenFailureCount > 0) {
      const nodeId = 'show-more-failure';
      showMoreNodes.push({
        group: 'nodes',
        data: {
          id: nodeId,
          label: `+${hiddenFailureCount} failed`,
          fullUrn: '',
          showMoreGroup: 'failure',
          hiddenCount: hiddenFailureCount,
        },
        classes: 'show-more body-failure',
      });
      replicaEdges.push({
        group: 'edges',
        data: {
          id: 'show-more-failure-edge',
          source: anchorNodeId,
          target: nodeId,
          label: '',
          title: '',
          fullUrn: '',
          color: 'var(--graph-body-edge-failure)',
        },
        classes: 'body-failure',
      });
    }
  }

  return {
    strandBuilt,
    replicaNodes,
    replicaEdges,
    showMoreNodes,
    totals: {
      hiddenSuccessCount,
      hiddenFailureCount,
      totalBodyCount: data.total_body_count,
      visibleSuccessCount: visibleSuccess.length,
      visibleFailureCount: visibleFailure.length,
    },
  };
}

function runCytoscapeElements(built) {
  // Do NOT collapse ForEach/Collect nodes in run mode — body replicas
  // anchor at the ForEach node (fan-out) and merge at the Collect
  // node (fan-in). Those junctions must stay visible.
  const strandElements = strandCytoscapeElements(built.strandBuilt, { collapse: false });
  return strandElements
    .concat(built.replicaNodes)
    .concat(built.showMoreNodes)
    .concat(built.replicaEdges);
}

// --------- Machine mode builder ---------------------------------------------

function buildMachineGraphData(data) {
  validateMachinePayload(data);
  const nodes = [];
  const edges = [];
  let capEdgeIdx = 0;
  for (const el of data.elements) {
    if (el.kind === 'node') {
      nodes.push({
        group: 'nodes',
        data: {
          id: el.graph_id,
          label: el.label || '',
          fullUrn: el.detail || el.label || '',
          tokenId: el.token_id || '',
          kind: 'node',
        },
        classes: 'machine-node',
      });
    } else if (el.kind === 'cap') {
      nodes.push({
        group: 'nodes',
        data: {
          id: el.graph_id,
          label: el.label || '',
          fullUrn: el.detail || el.label || '',
          tokenId: el.token_id || '',
          kind: 'cap',
        },
        classes: 'machine-cap' + (el.is_loop ? ' machine-loop' : ''),
      });
    } else if (el.kind === 'edge') {
      edges.push({
        group: 'edges',
        data: {
          id: el.graph_id,
          source: el.source_graph_id,
          target: el.target_graph_id,
          label: el.label || '',
          title: el.label || '',
          fullUrn: el.detail || '',
          tokenId: el.token_id || '',
          color: el.is_loop
            ? 'var(--graph-node-border-highlighted)'
            : edgeHueColor(capEdgeIdx),
        },
        classes: 'machine-edge' + (el.is_loop ? ' machine-loop' : ''),
      });
      capEdgeIdx++;
    }
  }
  return { nodes, edges };
}

function machineCytoscapeElements(built) {
  return built.nodes.concat(built.edges);
}

// A cheap signature for machine-mode inputs. The editor streams updates
// on every keystroke; we skip the expensive rebuild when the element
// shape is unchanged.
function machineGraphSignature(data) {
  if (!data || !Array.isArray(data.elements)) return '';
  const parts = [];
  for (const el of data.elements) {
    parts.push(`${el.kind}|${el.graph_id}|${el.token_id || ''}|${el.label || ''}|${el.source_graph_id || ''}|${el.target_graph_id || ''}|${el.is_loop ? '1' : '0'}`);
  }
  return parts.join(';');
}

// =============================================================================
// Renderer class.
// =============================================================================

class CapGraphRenderer {
  constructor(containerOrId, options) {
    if (options === undefined || options === null) {
      throw new Error('CapGraphRenderer: options object is required');
    }
    if (typeof options !== 'object') {
      throw new Error('CapGraphRenderer: options must be an object');
    }
    const mode = options.mode;
    if (mode !== 'browse' && mode !== 'strand' && mode !== 'run' && mode !== 'machine') {
      throw new Error(
        `CapGraphRenderer: options.mode must be one of "browse", "strand", "run", "machine" (got ${JSON.stringify(mode)})`
      );
    }

    // Resolve cytoscape. cytoscape-elk auto-registers when loaded via
    // script tag; we verify by checking the elk layout's presence.
    const cytoscape = requireHostDependency('cytoscape');
    if (!cytoscape.__elkRegistered) {
      // Some build bundles register the extension at load, others need
      // an explicit `cytoscape.use(...)`. We do it once per cytoscape
      // instance — the extension itself is a guarded no-op on repeat.
      const elkExt = (typeof window !== 'undefined') ? window.cytoscapeElk
                   : (typeof global !== 'undefined') ? global.cytoscapeElk
                   : undefined;
      if (elkExt !== undefined) {
        cytoscape.use(elkExt);
      }
      cytoscape.__elkRegistered = true;
    }
    this._cytoscape = cytoscape;

    let container;
    if (typeof containerOrId === 'string') {
      container = document.getElementById(containerOrId);
      if (!container) {
        throw new Error(`CapGraphRenderer: container element '${containerOrId}' not found`);
      }
    } else if (containerOrId instanceof Element) {
      container = containerOrId;
    } else {
      throw new Error('CapGraphRenderer: first argument must be a container id string or an Element');
    }

    this.container = container;
    this.mode = mode;
    this.interaction = options.interaction && typeof options.interaction === 'object'
      ? options.interaction
      : {};
    this.bottomExcludedRegion = typeof options.bottomExcludedRegion === 'function'
      ? options.bottomExcludedRegion
      : () => 0;

    // State — shared fields.
    this.cy = null;
    this.selectedElement = null;
    this._layoutReady = false;
    this.tooltip = createTooltipElement();

    // Browse-mode state.
    this.navigator = null;
    this.nodes = [];
    this.edges = [];
    this.adjacency = new Map();
    this.reverseAdj = new Map();
    this.capGraph = null;
    this.capabilitiesByEdgeId = new Map();
    this._mediaTitles = new Map();
    this._pendingFocusCap = null;
    this.pathMode = null;

    // Strand/run state.
    this._strandBuilt = null;
    this._runBuilt = null;

    // Machine state.
    this._machineSignature = null;
    this._machineBuilt = null;

    // Theme observer.
    this.themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-theme') {
          if (this.cy) this.cy.style(buildStylesheet());
        }
      }
    });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  // ===========================================================================
  // Navigator bridge — browse mode only.
  // ===========================================================================

  setNavigator(navigator) {
    if (this.mode !== 'browse') {
      throw new Error(`CapGraphRenderer: setNavigator is only valid in browse mode (current: ${this.mode})`);
    }
    this.navigator = navigator;
  }

  // ===========================================================================
  // Data entry points.
  // ===========================================================================

  setData(data) {
    if (this.mode === 'browse') {
      const built = buildBrowseGraphData(data);
      this.nodes = built.nodes;
      this.edges = built.edges;
      this.adjacency = built.adjacency;
      this.reverseAdj = built.reverseAdj;
      this.capGraph = built.capGraph;
      this._mediaTitles = built.mediaTitles;
      this.capabilitiesByEdgeId = built.capabilitiesByEdgeId;
      return this;
    }
    if (this.mode === 'strand') {
      this._strandBuilt = buildStrandGraphData(data);
      return this;
    }
    if (this.mode === 'run') {
      this._runBuilt = buildRunGraphData(data);
      return this;
    }
    if (this.mode === 'machine') {
      const signature = machineGraphSignature(data);
      if (signature === this._machineSignature && this.cy) {
        // Same shape — restyle for theme changes and return.
        this.cy.style(buildStylesheet());
        return this;
      }
      this._machineSignature = signature;
      this._machineBuilt = buildMachineGraphData(data);
      return this;
    }
    throw new Error(`CapGraphRenderer: unreachable mode '${this.mode}'`);
  }

  // Compatibility shim for capdag-dot-com browse callers: `buildFromCapabilities`
  // is an explicit name that reads clearly at call sites like `graph.buildFromCapabilities(registry)`.
  buildFromCapabilities(capabilities) {
    if (this.mode !== 'browse') {
      throw new Error(
        `CapGraphRenderer: buildFromCapabilities is only valid in browse mode (current: ${this.mode})`
      );
    }
    return this.setData(capabilities);
  }

  // ===========================================================================
  // Render — creates (or recreates) the cytoscape instance.
  // ===========================================================================

  render() {
    if (!this.container) {
      throw new Error('CapGraphRenderer: container is missing');
    }

    const elements = this._buildCytoscapeElements();
    if (elements.length === 0) {
      this.container.innerHTML = '<div class="cap-graph-empty"><p>No graph data</p></div>';
      return this;
    }

    // Clear container and size it to the window.
    this.container.innerHTML = '';
    this.container.style.width = window.innerWidth + 'px';
    this.container.style.height = window.innerHeight + 'px';

    const self = this;
    this._layoutReady = false;

    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }

    this.cy = this._cytoscape({
      container: this.container,
      elements,
      layout: Object.assign(
        { name: 'elk', elk: layoutForMode(this.mode) },
        {
          stop: function () {
            self.cy.resize();
            self._layoutReady = true;
            if (self._pendingFocusCap) {
              const pending = self._pendingFocusCap;
              self._pendingFocusCap = null;
              self.highlightCapability(pending);
            }
            self.refitCurrentSelection();
          },
        }
      ),
      style: buildStylesheet(),
      minZoom: 0.05,
      maxZoom: 10,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false,
      autounselectify: this.mode === 'machine',
    });

    const resizeAndRefit = () => {
      if (!this.cy) return;
      this.cy.resize();
      this.refitCurrentSelection();
    };
    this.cy.on('ready', resizeAndRefit);
    requestAnimationFrame(resizeAndRefit);
    setTimeout(resizeAndRefit, 100);
    setTimeout(resizeAndRefit, 300);

    this._setupEventHandlers();
    return this;
  }

  _buildCytoscapeElements() {
    if (this.mode === 'browse') {
      return browseCytoscapeElements({
        nodes: this.nodes,
        edges: this.edges,
        mediaTitles: this._mediaTitles,
      });
    }
    if (this.mode === 'strand') {
      if (!this._strandBuilt) return [];
      return strandCytoscapeElements(this._strandBuilt);
    }
    if (this.mode === 'run') {
      if (!this._runBuilt) return [];
      return runCytoscapeElements(this._runBuilt);
    }
    if (this.mode === 'machine') {
      if (!this._machineBuilt) return [];
      return machineCytoscapeElements(this._machineBuilt);
    }
    throw new Error(`CapGraphRenderer: unreachable mode '${this.mode}'`);
  }

  // ===========================================================================
  // Event handlers. All modes share mouse handling; browse mode adds the
  // navigator bridge, run mode adds show-more click handling, machine mode
  // fires interaction callbacks with the element's tokenId for editor
  // cross-highlight.
  // ===========================================================================

  _setupEventHandlers() {
    const self = this;

    this.cy.on('tap', 'node', function (evt) {
      evt.stopPropagation();
      self._handleNodeTap(evt.target);
    });
    this.cy.on('tap', 'edge', function (evt) {
      evt.stopPropagation();
      self._handleEdgeTap(evt.target);
    });
    this.cy.on('tap', function (evt) {
      if (evt.target === self.cy) self.clearSelection();
    });
    this.cy.on('dbltap', function (evt) {
      if (evt.target === self.cy) {
        self.clearSelection();
        self.fitToVisibleViewport(undefined, 50);
      }
    });

    this.cy.on('mouseover', 'node', function (evt) {
      const node = evt.target;
      self._showTooltip(self._tooltipTextForNode(node), evt.originalEvent);
      if (self.mode === 'browse' && !self._hasActiveSelection()) {
        self._highlightConnected(node.id());
      }
      if (typeof self.interaction.onNodeHover === 'function') {
        self.interaction.onNodeHover(node.data());
      }
    });
    this.cy.on('mousemove', 'node', function (evt) {
      const node = evt.target;
      self._showTooltip(self._tooltipTextForNode(node), evt.originalEvent);
    });
    this.cy.on('mouseout', 'node', function () {
      self._hideTooltip();
      if (self.mode === 'browse' && !self._hasActiveSelection()) {
        self._clearHighlighting();
      }
      if (typeof self.interaction.onNodeHoverEnd === 'function') {
        self.interaction.onNodeHoverEnd();
      }
    });

    this.cy.on('mouseover', 'edge', function (evt) {
      const edge = evt.target;
      self._showTooltip(self._tooltipTextForEdge(edge), evt.originalEvent);
      if (self.mode === 'browse' && !self._hasActiveSelection()) {
        self._highlightEdge(edge);
      }
      if (typeof self.interaction.onEdgeHover === 'function') {
        self.interaction.onEdgeHover(edge.data());
      }
    });
    this.cy.on('mousemove', 'edge', function (evt) {
      const edge = evt.target;
      self._showTooltip(self._tooltipTextForEdge(edge), evt.originalEvent);
    });
    this.cy.on('mouseout', 'edge', function () {
      self._hideTooltip();
      if (self.mode === 'browse' && !self._hasActiveSelection()) {
        self._clearHighlighting();
      }
      if (typeof self.interaction.onEdgeHoverEnd === 'function') {
        self.interaction.onEdgeHoverEnd();
      }
    });
  }

  _tooltipTextForNode(node) {
    if (this.mode === 'run') {
      const bodyTitle = node.data('bodyTitle');
      if (bodyTitle) return `${bodyTitle}: ${node.data('fullUrn') || node.id()}`;
    }
    return node.data('fullUrn') || node.id();
  }

  _tooltipTextForEdge(edge) {
    const full = edge.data('fullUrn');
    if (typeof full === 'string' && full.length > 0) return full;
    return edge.data('title') || '';
  }

  _handleNodeTap(node) {
    // Show-more node in run mode: forward to host and return early.
    if (this.mode === 'run') {
      const group = node.data('showMoreGroup');
      if (group === 'success' || group === 'failure') {
        if (typeof this.interaction.onShowMoreBodies === 'function') {
          this.interaction.onShowMoreBodies(group);
        }
        return;
      }
    }

    if (this.mode === 'browse') {
      // Second-click on a highlighted node while another is already
      // selected → enter path exploration.
      if (this.selectedElement && this.selectedElement.type === 'node' && !this.pathMode) {
        const source = this.selectedElement.element;
        if (!source.same(node) && node.hasClass('highlighted')) {
          this.enterPathMode(source.id(), node.id());
          return;
        }
      }
      if (this.pathMode) this.exitPathMode();
      this.selectedElement = { type: 'node', element: node };
      this._highlightConnected(node.id());
      node.addClass('active');
      if (this.navigator) this.navigator.showNodeDetail(node.data());
    } else {
      this.selectedElement = { type: 'node', element: node };
    }

    if (typeof this.interaction.onNodeClick === 'function') {
      this.interaction.onNodeClick(node.data());
    }
  }

  _handleEdgeTap(edge) {
    this.selectedElement = { type: 'edge', element: edge };
    if (this.mode === 'browse') {
      this._highlightEdge(edge);
      edge.addClass('active');
      const edgeId = edge.id();
      const capability = this.capabilitiesByEdgeId.get(edgeId) || null;
      if (this.navigator) this.navigator.showEdgeDetail(edge.data(), capability);
    }
    if (typeof this.interaction.onEdgeClick === 'function') {
      this.interaction.onEdgeClick(edge.data());
    }
  }

  // ===========================================================================
  // Browse-mode selection API. Used by cap-navigator.js via the
  // bidirectional setNavigator / setGraph wiring.
  // ===========================================================================

  highlightCapability(cap) {
    if (this.mode !== 'browse') {
      throw new Error(`CapGraphRenderer: highlightCapability is only valid in browse mode (current: ${this.mode})`);
    }
    if (!this.cy || !this._layoutReady) {
      this._pendingFocusCap = cap;
      return;
    }

    const CapUrn = requireHostDependency('CapUrn');
    const target = CapUrn.fromString(this._capUrnString(cap));

    for (const [edgeId, edgeCap] of this.capabilitiesByEdgeId) {
      const candidate = CapUrn.fromString(edgeCap.urn);
      if (candidate.isEquivalent(target)) {
        const edge = this.cy.getElementById(edgeId);
        if (edge && edge.length > 0) {
          this.selectedElement = { type: 'edge', element: edge };
          this._highlightEdge(edge);
          edge.addClass('active');
        }
        return;
      }
    }
  }

  _capUrnString(cap) {
    if (!cap || typeof cap !== 'object') {
      throw new Error('CapGraphRenderer: cap must be an object');
    }
    if (typeof cap.urn !== 'string' || cap.urn.length === 0) {
      throw new Error('CapGraphRenderer: cap.urn must be a non-empty string');
    }
    return cap.urn;
  }

  selectNodeById(nodeId) {
    if (!this.cy) return;
    const node = this.cy.getElementById(nodeId);
    if (node && node.length > 0) this._handleNodeTap(node);
  }

  getNodeData(nodeId) {
    if (!this.cy) return null;
    const node = this.cy.getElementById(nodeId);
    return node && node.length > 0 ? node.data() : null;
  }

  getEdgeDataByCapUrn(capUrnString) {
    if (this.mode !== 'browse') return null;
    if (!this.cy || typeof capUrnString !== 'string' || capUrnString.length === 0) return null;
    const CapUrn = requireHostDependency('CapUrn');
    const target = CapUrn.fromString(capUrnString);
    for (const [edgeId, edgeCap] of this.capabilitiesByEdgeId) {
      const candidate = CapUrn.fromString(edgeCap.urn);
      if (candidate.isEquivalent(target)) {
        const edge = this.cy.getElementById(edgeId);
        if (edge && edge.length > 0) return edge.data();
      }
    }
    return null;
  }

  selectEdgeByCapUrn(capUrnString) {
    if (this.mode !== 'browse') {
      throw new Error(`CapGraphRenderer: selectEdgeByCapUrn is only valid in browse mode (current: ${this.mode})`);
    }
    if (!this.cy || typeof capUrnString !== 'string' || capUrnString.length === 0) return;
    const CapUrn = requireHostDependency('CapUrn');
    const target = CapUrn.fromString(capUrnString);
    for (const [edgeId, edgeCap] of this.capabilitiesByEdgeId) {
      const candidate = CapUrn.fromString(edgeCap.urn);
      if (candidate.isEquivalent(target)) {
        const edge = this.cy.getElementById(edgeId);
        if (edge && edge.length > 0) {
          this._handleEdgeTap(edge);
          return;
        }
      }
    }
  }

  clearSelection() {
    if (this.pathMode) this.exitPathMode();
    this.selectedElement = null;
    this._clearHighlighting();
    if (this.mode === 'browse' && this.navigator) {
      this.navigator.clearGraphSelection();
    }
  }

  fitAll() {
    if (!this.cy) return;
    this.fitToVisibleViewport(this.cy.elements(), 50);
  }

  // ===========================================================================
  // Theme sync — the renderer owns a MutationObserver on <html
  // data-theme>, so hosts that use that attribute do not need to call
  // anything. Hosts that use a different attribute (e.g. the editor's
  // data-appearance) can call setTheme() explicitly after their own
  // theme toggle to force a stylesheet re-read.
  // ===========================================================================

  setTheme() {
    if (!this.cy) return;
    this.cy.style(buildStylesheet());
  }

  // ===========================================================================
  // Machine mode API — used by the editor for cross-highlight.
  // ===========================================================================

  applyMachineActiveTokenIds(tokenIds) {
    if (this.mode !== 'machine') {
      throw new Error(`CapGraphRenderer: applyMachineActiveTokenIds is only valid in machine mode (current: ${this.mode})`);
    }
    if (!this.cy) return;
    const wanted = new Set(tokenIds || []);
    this.cy.batch(() => {
      this.cy.elements().forEach(el => {
        const id = el.data('tokenId');
        if (id && wanted.has(id)) {
          el.addClass('active');
        } else {
          el.removeClass('active');
        }
      });
    });
  }

  // ===========================================================================
  // Path exploration (browse mode).
  // ===========================================================================

  enterPathMode(sourceId, targetId) {
    if (this.mode !== 'browse') {
      throw new Error(`CapGraphRenderer: enterPathMode is only valid in browse mode (current: ${this.mode})`);
    }
    if (!this.capGraph) return;

    const MAX_PATHS = 10;
    let paths = this.capGraph.findAllPaths(sourceId, targetId, MAX_PATHS);
    let actualSource = sourceId;
    let actualTarget = targetId;
    if (paths.length === 0) {
      const reverse = this.capGraph.findAllPaths(targetId, sourceId, MAX_PATHS);
      if (reverse.length === 0) return;
      paths = reverse;
      actualSource = targetId;
      actualTarget = sourceId;
    }

    this.pathMode = { sourceId: actualSource, targetId: actualTarget, paths, selectedIndex: 0 };
    this.selectedElement = { type: 'path' };
    this._highlightPath(paths[0]);

    if (this.navigator) {
      const sourceNode = this.cy.getElementById(actualSource);
      const targetNode = this.cy.getElementById(actualTarget);
      this.navigator.showPathDetail(
        sourceNode.length > 0 ? sourceNode.data() : { id: actualSource },
        targetNode.length > 0 ? targetNode.data() : { id: actualTarget },
        paths,
        0
      );
    }
  }

  selectPath(index) {
    if (!this.pathMode) return;
    if (index < 0 || index >= this.pathMode.paths.length) return;
    this.pathMode.selectedIndex = index;
    this._highlightPath(this.pathMode.paths[index]);
  }

  exitPathMode() {
    this.pathMode = null;
  }

  _highlightPath(pathEdges) {
    const pathNodeIds = new Set();
    const pathEdgeIndices = new Set();
    for (const pathEdge of pathEdges) {
      pathNodeIds.add(canonicalMediaUrn(pathEdge.fromUrn));
      pathNodeIds.add(canonicalMediaUrn(pathEdge.toUrn));
      const idx = this.capGraph.edges.indexOf(pathEdge);
      if (idx !== -1) pathEdgeIndices.add(idx);
    }

    this.cy.elements().removeClass('highlighted active faded path-highlighted');
    this.cy.elements().addClass('faded');

    this.cy.nodes().forEach(node => {
      if (pathNodeIds.has(node.id())) node.removeClass('faded').addClass('path-highlighted');
    });
    this.cy.edges().forEach(edge => {
      const cyIdx = edge.data('capGraphEdgeIndex');
      if (cyIdx !== undefined && pathEdgeIndices.has(cyIdx)) {
        edge.removeClass('faded').addClass('path-highlighted');
      }
    });

    if (this.pathMode) {
      const source = this.cy.getElementById(this.pathMode.sourceId);
      const target = this.cy.getElementById(this.pathMode.targetId);
      if (source.length > 0) source.addClass('active');
      if (target.length > 0) target.addClass('active');
    }
  }

  // ===========================================================================
  // Highlight helpers.
  // ===========================================================================

  _hasActiveSelection() {
    return this.selectedElement !== null;
  }

  _highlightEdge(edge) {
    this.cy.elements().removeClass('highlighted active faded');
    this.cy.elements().addClass('faded');
    edge.removeClass('faded').addClass('highlighted');
    const src = edge.source();
    const tgt = edge.target();
    src.removeClass('faded').addClass('highlighted');
    tgt.removeClass('faded').addClass('highlighted');
  }

  _highlightConnected(nodeId) {
    const connected = this._findConnected(nodeId);
    this.cy.elements().removeClass('highlighted active faded');
    this.cy.elements().addClass('faded');
    this.cy.nodes().forEach(node => {
      if (connected.has(node.id())) node.removeClass('faded').addClass('highlighted');
    });
    this.cy.edges().forEach(edge => {
      const s = edge.source().id();
      const t = edge.target().id();
      if (connected.has(s) && connected.has(t)) edge.removeClass('faded').addClass('highlighted');
    });
  }

  _clearHighlighting() {
    if (!this.cy) return;
    this.cy.elements().removeClass('highlighted active faded path-highlighted');
  }

  _findReachableFrom(startId) {
    const reachable = new Set([startId]);
    const queue = [startId];
    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = this.adjacency.get(current);
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (!reachable.has(n)) {
          reachable.add(n);
          queue.push(n);
        }
      }
    }
    return reachable;
  }

  _findReachableTo(targetId) {
    const canReach = new Set([targetId]);
    const queue = [targetId];
    while (queue.length > 0) {
      const current = queue.shift();
      const preds = this.reverseAdj.get(current);
      if (!preds) continue;
      for (const p of preds) {
        if (!canReach.has(p)) {
          canReach.add(p);
          queue.push(p);
        }
      }
    }
    return canReach;
  }

  _findConnected(nodeId) {
    const from = this._findReachableFrom(nodeId);
    const to = this._findReachableTo(nodeId);
    return new Set([...from, ...to]);
  }

  // ===========================================================================
  // Viewport fit. Single entry point for all "re-fit" callers: layout
  // stop, resize, navigator-driven refit, dbltap-reset.
  // ===========================================================================

  refitCurrentSelection() {
    if (!this.cy || !this._layoutReady) return;

    if (this.pathMode) {
      const pathElements = this.cy.elements('.path-highlighted, .active');
      if (pathElements.length > 0) {
        this.fitToVisibleViewport(pathElements, 60);
        return;
      }
    }

    if (this.selectedElement) {
      if (this.selectedElement.type === 'node') {
        const nodeId = this.selectedElement.element.id();
        if (this.mode === 'browse') {
          const connected = this._findConnected(nodeId);
          const connectedElements = this.cy.nodes().filter(n => connected.has(n.id()));
          if (connectedElements.length > 0) {
            this.fitToVisibleViewport(connectedElements, 60);
            return;
          }
        } else {
          this.fitToVisibleViewport(this.selectedElement.element, 80);
          return;
        }
      } else if (this.selectedElement.type === 'edge') {
        const edge = this.selectedElement.element;
        this.fitToVisibleViewport(edge.union(edge.source()).union(edge.target()), 100);
        return;
      }
    }

    this.fitToVisibleViewport(undefined, 50);
  }

  fitToVisibleViewport(eles, padding, animate) {
    if (!this.cy) return;
    if (padding === undefined) padding = 50;
    if (animate === undefined) animate = true;

    this.cy.stop(true);
    if (!eles || eles.length === 0) eles = this.cy.elements();

    const bb = eles.boundingBox();
    if (bb.w === 0 && bb.h === 0) return;

    const containerWidth = this.cy.width();
    const containerHeight = this.cy.height();
    const excluded = Math.max(0, this.bottomExcludedRegion() | 0);

    const visibleWidth = containerWidth - padding * 2;
    const visibleHeight = containerHeight - excluded - padding * 2;
    if (visibleWidth <= 0 || visibleHeight <= 0) return;

    const zoom = Math.min(visibleWidth / bb.w, visibleHeight / bb.h);
    const clampedZoom = Math.min(Math.max(zoom, this.cy.minZoom()), this.cy.maxZoom());

    const modelCenterX = (bb.x1 + bb.x2) / 2;
    const modelCenterY = (bb.y1 + bb.y2) / 2;
    const screenCenterX = containerWidth / 2;
    const screenCenterY = (containerHeight - excluded) / 2;
    const panX = screenCenterX - modelCenterX * clampedZoom;
    const panY = screenCenterY - modelCenterY * clampedZoom;

    if (animate) {
      this.cy.animate({
        zoom: clampedZoom,
        pan: { x: panX, y: panY },
        duration: 400,
        easing: 'ease-out-cubic',
      });
    } else {
      this.cy.zoom(clampedZoom);
      this.cy.pan({ x: panX, y: panY });
    }
  }

  // ===========================================================================
  // Tooltip helpers.
  // ===========================================================================

  _showTooltip(text, mouseEvent) {
    if (!this.tooltip) return;
    if (!text) return;
    this.tooltip.textContent = text;
    this.tooltip.style.display = 'block';
    const x = mouseEvent ? mouseEvent.clientX : 0;
    const y = mouseEvent ? mouseEvent.clientY : 0;
    this.tooltip.style.left = (x + 12) + 'px';
    this.tooltip.style.top = (y + 12) + 'px';
    const rect = this.tooltip.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.tooltip.style.left = (x - rect.width - 12) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      this.tooltip.style.top = (y - rect.height - 12) + 'px';
    }
  }

  _hideTooltip() {
    if (this.tooltip) this.tooltip.style.display = 'none';
  }

  // ===========================================================================
  // Teardown.
  // ===========================================================================

  destroy() {
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
      this.tooltip = null;
    }
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
  }
}

// =============================================================================
// Module exports — CJS for Node tests. Browser-side the build-browser.js
// concatenation wraps these declarations in an IIFE and assigns
// `window.CapGraphRenderer`.
// =============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CapGraphRenderer,
    cardinalityLabel,
    cardinalityFromCap,
    canonicalMediaUrn,
    mediaNodeLabel,
    buildBrowseGraphData,
    buildStrandGraphData,
    collapseStrandShapeTransitions,
    buildRunGraphData,
    buildMachineGraphData,
    classifyStrandCapSteps,
    validateStrandPayload,
    validateRunPayload,
    validateMachinePayload,
    validateStrandStep,
    validateBodyOutcome,
  };
}
