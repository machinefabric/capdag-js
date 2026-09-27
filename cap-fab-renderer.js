// CapFabRenderer — unified graph rendering for capdag-js
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
//   * CapUrn, MediaUrn, Cap, createCap, CapFab (from capdag.js)
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

import { CapUrn, CapFab, MediaUrn, createCap } from './capdag.js';

// =============================================================================
// Host dependencies — the page's: cytoscape and cytoscape-elk, loaded as
// scripts, resolved from the global object when a graph is drawn.
// =============================================================================

function requireHostDependency(name) {
  const value = globalThis[name];
  if (value === undefined) {
    throw new Error(
      `CapFabRenderer: required host dependency '${name}' is not loaded. ` +
      `Load cytoscape and cytoscape-elk before drawing a graph.`
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
    throw new Error('CapFabRenderer: cardinalityFromCap requires a cap object');
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
  return MediaUrn.fromString(mediaUrnString).toString();
}

// Graph labels must be provided explicitly by the host. The renderer is not
// allowed to synthesize user-facing labels from URNs.
function mediaNodeLabel() {
  throw new Error(
    'CapFabRenderer: mediaNodeLabel() is no longer supported. ' +
    'Pass explicit media titles/display names to the renderer.'
  );
}

function requireExplicitDisplayName(canonicalUrn, displayEntries, context) {
  const candidate = MediaUrn.fromString(canonicalUrn);
  for (const entry of displayEntries) {
    if (candidate.isEquivalent(entry.media)) return entry.display;
  }
  throw new Error(
    `CapFabRenderer: missing explicit display name for ${context} '${canonicalUrn}'`
  );
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
      `CapFabRenderer: CSS variable '${name}' value '${raw}' is not a number`
    );
  }
  return parsed;
}

// =============================================================================
// Label shaping — fit-to-content with a soft max width. The renderer's
// node sizing is `width: 'label'` / `height: 'label'` (the cytoscape style
// rule), which means each node grows or shrinks to its text. We pre-shape
// every label so:
//
//   * a single short label produces a single short line (no preset width);
//   * a label longer than the soft max wraps to a second line;
//   * a label longer than two soft-max-width lines is truncated with a
//     trailing horizontal ellipsis instead of overflowing or wrapping
//     further. Ellipses appear only past the second line.
//
// Cytoscape's label-wrap implementation respects newlines and the
// `text-max-width` style rule, but it cannot truncate-after-N-lines on
// its own. So we do the wrap+truncate here in JS, set the label to the
// shaped string, and drop `text-max-width` from the stylesheet — the
// label text itself dictates the node's width.
// =============================================================================

// Soft node label width in pixels. Picked to keep nodes readable on the
// inline (non-expanded) panel while still tolerating the longer media
// titles. Edge labels are NOT wrapped; their length feeds the layout
// engine's between-layer spacing instead.
const NODE_LABEL_SOFT_MAX_WIDTH_PX = 160;
// Maximum number of wrapped lines for a node label. Beyond this we
// truncate with `…` rather than letting the label overflow.
const NODE_LABEL_MAX_LINES = 2;

// Shared offscreen canvas used for label width measurement. Lives at
// module scope so we don't churn the GC creating one per call.
let __sharedMeasureCtx = null;
function measureTextWidth(text, font) {
  if (typeof document === 'undefined') {
    // Non-DOM environment (e.g. node tests). Approximate with a
    // monospace-ish constant so the wrap heuristic still produces
    // sensible output and tests can exercise it without a canvas.
    return text.length * 6.5;
  }
  if (__sharedMeasureCtx === null) {
    const canvas = document.createElement('canvas');
    __sharedMeasureCtx = canvas.getContext('2d');
  }
  __sharedMeasureCtx.font = font;
  return __sharedMeasureCtx.measureText(text).width;
}

// Break `text` into chunks each of which fits within `maxWidth` when
// rendered with `font`. Word-aware: prefers to break at whitespace, but
// will hard-break a single word that is wider than `maxWidth`.
function wrapTextToWidth(text, font, maxWidth) {
  if (text.length === 0) return [''];
  const words = text.split(/(\s+)/); // keep the whitespace runs
  const lines = [];
  let current = '';
  function pushCurrent() {
    if (current.length > 0) {
      lines.push(current);
      current = '';
    }
  }
  for (const piece of words) {
    if (piece.length === 0) continue;
    const candidate = current + piece;
    if (measureTextWidth(candidate, font) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (/^\s+$/.test(piece)) {
      // The whitespace itself overflows — start a new line and skip it.
      pushCurrent();
      continue;
    }
    if (current.length === 0) {
      // Single word wider than maxWidth — hard-break it character by
      // character. The terminal piece becomes `current` for the next
      // round so a subsequent short word can still join it.
      let chunk = '';
      for (const ch of piece) {
        if (measureTextWidth(chunk + ch, font) <= maxWidth) {
          chunk += ch;
        } else {
          if (chunk.length > 0) lines.push(chunk);
          chunk = ch;
        }
      }
      current = chunk;
    } else {
      pushCurrent();
      current = piece.replace(/^\s+/, '');
    }
  }
  pushCurrent();
  return lines.length === 0 ? [''] : lines;
}

// Truncate a single line so that it fits within `maxWidth` once a
// trailing horizontal ellipsis has been appended. Used only for the
// final line of an overflowing wrapped label.
function truncateLineWithEllipsis(line, font, maxWidth) {
  const ellipsis = '…';
  if (measureTextWidth(line + ellipsis, font) <= maxWidth) return line + ellipsis;
  let truncated = line;
  while (truncated.length > 0 && measureTextWidth(truncated + ellipsis, font) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + ellipsis;
}

// Shape a node label: fit-to-content with a soft cap, wrap to at most
// NODE_LABEL_MAX_LINES, and truncate the last line with `…` only when
// the underlying text would otherwise need a third line.
//
// Returns `{ shaped, widthPx }`. `widthPx` is the natural width of the
// shaped label (the longer of the two line widths), which the renderer
// uses to seed ELK's per-graph spacing.
function shapeNodeLabel(rawLabel, font) {
  const text = (rawLabel == null) ? '' : String(rawLabel);
  if (text.length === 0) return { shaped: '', widthPx: 0 };
  // Honour pre-existing newlines (some payload builders embed them on
  // purpose, e.g. body titles): wrap each segment separately and
  // concatenate.
  const segments = text.split('\n');
  const lines = [];
  for (const segment of segments) {
    const wrapped = wrapTextToWidth(segment, font, NODE_LABEL_SOFT_MAX_WIDTH_PX);
    for (const line of wrapped) lines.push(line);
  }
  if (lines.length <= NODE_LABEL_MAX_LINES) {
    const widthPx = lines.reduce(
      (acc, line) => Math.max(acc, measureTextWidth(line, font)),
      0
    );
    return { shaped: lines.join('\n'), widthPx };
  }
  const kept = lines.slice(0, NODE_LABEL_MAX_LINES - 1);
  // Re-flow the leftover into the final line so the truncation
  // happens at a natural boundary rather than mid-second-line.
  const overflow = lines.slice(NODE_LABEL_MAX_LINES - 1).join(' ');
  const finalLine = truncateLineWithEllipsis(
    overflow, font, NODE_LABEL_SOFT_MAX_WIDTH_PX
  );
  kept.push(finalLine);
  const widthPx = kept.reduce(
    (acc, line) => Math.max(acc, measureTextWidth(line, font)),
    0
  );
  return { shaped: kept.join('\n'), widthPx };
}

// Walk the cytoscape elements list once, returning a NEW array in
// which every node has its `data.label` replaced by the shaped form.
// Edges and non-shape-relevant fields are passed through by reference
// to avoid an unnecessary clone — only the node objects whose labels
// we touched get shallow-copied (one level into `data`) so re-renders
// from the same source payload don't compound their shaping.
//
// Returns the metrics alongside the new elements so the renderer can
// thread them to the layout engine and the zoom backstop.
function shapeLabelsInElements(elements) {
  // Cytoscape resolves node `font-size` against the element's computed
  // style at render time; we shape against the renderer's static node
  // font (defined in `buildStylesheet`). Kept in sync manually — bump
  // both together.
  const nodeFont = '500 9px "JetBrains Mono", ui-monospace, monospace';
  const edgeFont = '500 8px "JetBrains Mono", ui-monospace, monospace';
  let maxEdgeLabelPx = 0;
  let maxNodeLabelPx = 0;
  const reshaped = new Array(elements.length);
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (!element || !element.data) {
      reshaped[i] = element;
      continue;
    }
    const isEdge = !!element.data.source && !!element.data.target;
    if (isEdge) {
      const edgeLabel = element.data.label;
      const w = (typeof edgeLabel === 'string' && edgeLabel.length > 0)
        ? measureTextWidth(edgeLabel, edgeFont)
        : 0;
      if (w > maxEdgeLabelPx) maxEdgeLabelPx = w;
      // Stamp the per-edge label width onto the element's data so the
      // post-layout per-edge stretcher can size each edge individually
      // (rather than inflating the whole graph by the longest label).
      reshaped[i] = Object.assign({}, element, {
        data: Object.assign({}, element.data, { _labelPx: w }),
      });
      continue;
    }
    const { shaped, widthPx } = shapeNodeLabel(element.data.label, nodeFont);
    if (widthPx > maxNodeLabelPx) maxNodeLabelPx = widthPx;
    if (shaped === element.data.label) {
      reshaped[i] = element;
    } else {
      reshaped[i] = Object.assign({}, element, {
        data: Object.assign({}, element.data, { label: shaped }),
      });
    }
  }
  return { elements: reshaped, maxNodeLabelPx, maxEdgeLabelPx };
}

// =============================================================================
// Layout configs per mode. Same ELK algorithm; spacing is tuned per mode
// to match the typical graph density and reading direction of each.
//
// We do NOT inflate `nodeNodeBetweenLayers` to fit the longest edge
// label — that punishes every short-labelled edge in the graph with
// pointless empty space. Instead, the renderer post-processes the
// laid-out positions in `_stretchLayersForEdgeLabels` to give each
// edge the horizontal room its own label needs, leaving short-labelled
// edges short. The per-mode defaults below are the floor; the
// stretcher only ever pushes nodes further apart, never closer.
// =============================================================================

function layoutForMode(mode) {
  const base = {
    algorithm: 'layered',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': 'POLYLINE',
    'elk.layered.spacing.edgeEdgeBetweenLayers': 30,
    'elk.layered.spacing.edgeNodeBetweenLayers': 40,
    'elk.spacing.edgeEdge': 25,
    'elk.spacing.edgeNode': 35,
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  };
  if (mode === 'browse') {
    return Object.assign({}, base, {
      'elk.layered.spacing.nodeNodeBetweenLayers': 220,
      'elk.layered.spacing.edgeEdgeBetweenLayers': 44,
      'elk.layered.spacing.edgeNodeBetweenLayers': 52,
      'elk.layered.spacing.baseValue': 40,
      'elk.layered.nodePlacement.favorStraightEdges': true,
      'elk.spacing.edgeEdge': 34,
      'elk.spacing.edgeNode': 42,
      'elk.spacing.nodeNode': 168,
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
  if (mode === 'editor-graph') {
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
  if (mode === 'machine') {
    // Resolved-machine graph: a (potentially multi-strand) DAG laid
    // out left-to-right with the same spacing the strand mode uses
    // for single strands. Multiple disconnected strands are placed
    // side by side by elk's component packer.
    return Object.assign({}, base, {
      'elk.layered.spacing.nodeNodeBetweenLayers': 120,
      'elk.spacing.nodeNode': 40,
    });
  }
  throw new Error(`CapFabRenderer: unknown mode '${mode}'`);
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

  // Machine mode uses a dedicated palette exposed by the notation
  // editor's CSS (`--graph-node-color`, `--graph-loop-color`,
  // `--graph-edge-color`, `--graph-text`, `--graph-muted`). Caps
  // are collapsed into edges so there's no cap-node color.
  const machineNodeColor = getCssVar('--graph-node-color');
  const machineLoopColor = getCssVar('--graph-loop-color');
  const machineEdgeColor = getCssVar('--graph-edge-color');
  const machineText = getCssVar('--graph-text');
  const machineMuted = getCssVar('--graph-muted');

  return [
    {
      selector: 'node',
      style: {
        'label': 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        // Labels are pre-shaped in JS (see `shapeNodeLabel`): wrapped
        // to a soft max width with a 2-line cap and trailing ellipsis
        // when the text would otherwise need a third line. We honour
        // the embedded newlines but never re-wrap, so `text-max-width`
        // is intentionally absent — `width: 'label'` then makes each
        // node fit its actual shaped text.
        'text-wrap': 'wrap',
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
        // Slightly smaller than the node label font (9px) so edge
        // labels read as secondary metadata rather than primary
        // identity. Kept in sync with the `edgeFont` constant in
        // `shapeLabelsInElements`.
        'font-size': '8px',
        'font-weight': '500',
        'color': 'data(color)',
        'text-background-color': edgeTextBg,
        'text-background-opacity': 1,
        'text-background-padding': '4px',
        'text-background-shape': 'roundrectangle',
        // Align labels along their edges so perpendicular/misaligned
        // text no longer reads as floating metadata.
        'text-rotation': 'autorotate',
        'text-margin-y': -6,
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
      selector: 'edge.crowded-edge',
      style: {
        'curve-style': 'unbundled-bezier',
        'control-point-step-size': 'data(controlPointStepSize)',
        'control-point-distances': 'data(controlPointDistances)',
        'control-point-weights': 'data(controlPointWeights)',
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
      selector: 'edge.strand-shape-edge',
      style: {
        'line-style': 'dashed',
        'width': 2,
        'text-background-opacity': 0.92,
      },
    },
    {
      selector: 'edge.strand-foreach-edge',
      style: {
        'target-arrow-shape': 'triangle',
      },
    },
    {
      selector: 'edge.strand-collect-edge',
      style: {
        'target-arrow-shape': 'tee',
      },
    },
    {
      // A convergence (fan-in) edge: a second producer feeding a cap's
      // non-main argument. Dotted + diamond-tail to read as a merging
      // side-input distinct from the solid main backbone edge.
      selector: 'edge.strand-convergence',
      style: {
        'line-style': 'dotted',
        'width': 2,
        'source-arrow-shape': 'diamond',
        'source-arrow-color': machineEdgeColor || 'data(color)',
      },
    },
    {
      selector: 'edge.faded',
      style: { 'opacity': fadedEdgeOpacity },
    },
    {
      selector: 'edge.body-success',
      style: {
        'line-color': bodyEdgeSuccess,
        'target-arrow-color': bodyEdgeSuccess,
        // Label text uses the resolved success color too, not the
        // unresolved `var(...)` string stored in `data.color`.
        'color': bodyEdgeSuccess,
      },
    },
    {
      selector: 'edge.body-failure',
      style: {
        'line-color': bodyEdgeFailure,
        'target-arrow-color': bodyEdgeFailure,
        'color': bodyEdgeFailure,
      },
    },
    {
      selector: 'node.path-highlighted',
      style: { 'border-width': '3px', 'border-color': nodeBorderHighlighted },
    },
    {
      selector: 'edge.path-highlighted',
      style: { 'width': 3, 'z-index': 999, 'line-style': 'solid' },
    },

    // -------- Machine / editor-graph mode ------------------------------
    // Shared between the resolved-machine view (`mode: 'machine'`,
    // canonical `Machine::to_render_payload_json`) and the notation
    // editor's live graph (`mode: 'editor-graph'`, ast-driven). Both
    // collapse each cap application into a single labeled edge
    // between its input and output data slots — caps do NOT appear
    // as separate nodes. Only data slots are nodes; cap semantics
    // are carried on edges.
    //
    // Reads the editor's dedicated palette so nodes, edges and
    // loop markers match the text theme.
    {
      selector: 'node.machine-node',
      style: {
        'background-color': machineNodeColor || nodeBg,
        'border-color': machineNodeColor || nodeBorder,
        'color': machineText || nodeText,
        'border-opacity': 1,
      },
    },
    {
      selector: 'edge.machine-edge',
      style: {
        'line-color': machineEdgeColor || 'data(color)',
        'target-arrow-color': machineEdgeColor || 'data(color)',
        'color': machineMuted || nodeText,
      },
    },
    {
      selector: 'edge.machine-loop',
      style: {
        'line-color': machineLoopColor || nodeBorderActive,
        'target-arrow-color': machineLoopColor || nodeBorderActive,
        'color': machineLoopColor || nodeBorderActive,
        'line-style': 'dashed',
      },
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
    throw new Error(`CapFabRenderer: ${path} must be a non-empty string`);
  }
}

function assertArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`CapFabRenderer: ${path} must be an array`);
  }
}

function assertObject(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`CapFabRenderer: ${path} must be an object`);
  }
}

function validateBrowseData(data) {
  assertArray(data, 'browse mode data');
  data.forEach((cap, idx) => {
    if (!cap || typeof cap !== 'object') {
      throw new Error(`CapFabRenderer browse mode: data[${idx}] is not an object`);
    }
    assertString(cap.urn, `browse mode data[${idx}].urn`);
    assertString(cap.in_spec, `browse mode data[${idx}].in_spec (cap urn: ${cap.urn})`);
    assertString(cap.out_spec, `browse mode data[${idx}].out_spec (cap urn: ${cap.urn})`);
    assertString(cap.title, `browse mode data[${idx}].title (cap urn: ${cap.urn})`);
    assertString(cap.in_media_title, `browse mode data[${idx}].in_media_title (cap urn: ${cap.urn})`);
    assertString(cap.out_media_title, `browse mode data[${idx}].out_media_title (cap urn: ${cap.urn})`);
  });
}

// Validate a canonical `StrandStep` — the Rust-serialized form with
// externally-tagged step_type.
function validateStrandStep(step, path) {
  if (!step || typeof step !== 'object') {
    throw new Error(`CapFabRenderer: ${path} is not an object`);
  }
  assertString(step.token_id, `${path}.token_id`);
  assertString(step.from_spec, `${path}.from_spec`);
  assertString(step.to_spec, `${path}.to_spec`);
  if (!step.step_type || typeof step.step_type !== 'object') {
    throw new Error(`CapFabRenderer: ${path}.step_type must be an object`);
  }
  const keys = Object.keys(step.step_type);
  if (keys.length !== 1) {
    throw new Error(
      `CapFabRenderer: ${path}.step_type must have exactly one variant key (got: ${keys.join(',')})`
    );
  }
  const variant = keys[0];
  if (variant !== 'Cap' && variant !== 'ForEach' && variant !== 'Collect') {
    throw new Error(
      `CapFabRenderer: ${path}.step_type variant must be Cap | ForEach | Collect (got: ${variant})`
    );
  }
  const body = step.step_type[variant];
  if (!body || typeof body !== 'object') {
    throw new Error(`CapFabRenderer: ${path}.step_type.${variant} must be an object`);
  }
  if (variant === 'Cap') {
    assertString(body.cap_urn, `${path}.step_type.Cap.cap_urn`);
    assertString(body.title, `${path}.step_type.Cap.title`);
    if (typeof body.input_is_sequence !== 'boolean') {
      throw new Error(`CapFabRenderer: ${path}.step_type.Cap.input_is_sequence must be a boolean`);
    }
    if (typeof body.output_is_sequence !== 'boolean') {
      throw new Error(`CapFabRenderer: ${path}.step_type.Cap.output_is_sequence must be a boolean`);
    }
    // `inputs` is the authoritative data-flow graph: the primary input plus
    // every convergence input, with each producer named by stable token.
    assertArray(body.inputs, `${path}.step_type.Cap.inputs`);
    if (body.inputs.length === 0) {
      throw new Error(`CapFabRenderer: ${path}.step_type.Cap.inputs must include the primary input`);
    }
    const argUrns = new Set();
    body.inputs.forEach((input, inputIdx) => {
      const inputPath = `${path}.step_type.Cap.inputs[${inputIdx}]`;
      assertObject(input, inputPath);
      assertString(input.arg_urn, `${inputPath}.arg_urn`);
      if (argUrns.has(input.arg_urn)) {
        throw new Error(`CapFabRenderer: ${inputPath}.arg_urn duplicates '${input.arg_urn}'`);
      }
      argUrns.add(input.arg_urn);
      // serde: unit variant → the string "StrandInput"; struct variant →
      // { Step: { token_id } }. Anything else is malformed.
      if (input.source === 'StrandInput') return;
      if (input.source && typeof input.source === 'object' && input.source.Step) {
        assertString(input.source.Step.token_id, `${inputPath}.source.Step.token_id`);
        return;
      }
      throw new Error(
        `CapFabRenderer: ${inputPath}.source must be "StrandInput" or { Step: { token_id } }`
      );
    });
  } else {
    assertString(body.media_def, `${path}.step_type.${variant}.media_def`);
  }
}

function validateStrandPayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('CapFabRenderer strand mode: data must be an object');
  }
  assertString(data.source_media_urn, 'strand mode data.source_media_urn');
  assertString(data.target_media_urn, 'strand mode data.target_media_urn');
  assertArray(data.steps, 'strand mode data.steps');
  const tokenIds = new Set();
  data.steps.forEach((step, idx) => {
    validateStrandStep(step, `strand mode data.steps[${idx}]`);
    if (tokenIds.has(step.token_id)) {
      throw new Error(`CapFabRenderer strand mode: duplicate step token_id '${step.token_id}'`);
    }
    tokenIds.add(step.token_id);
  });
  data.steps.forEach((step, idx) => {
    if (!step.step_type.Cap) return;
    step.step_type.Cap.inputs.forEach((input, inputIdx) => {
      if (input.source === 'StrandInput') return;
      const producerToken = input.source.Step.token_id;
      if (!tokenIds.has(producerToken)) {
        throw new Error(
          `CapFabRenderer strand mode: data.steps[${idx}].step_type.Cap.inputs[${inputIdx}]` +
          `.source.Step.token_id '${producerToken}' does not resolve to a strand step`
        );
      }
    });
  });
  if (data.media_display_names !== undefined
      && (data.media_display_names === null || typeof data.media_display_names !== 'object')) {
    throw new Error('CapFabRenderer strand mode: data.media_display_names must be an object when present');
  }
  if (data.source_display !== undefined && typeof data.source_display !== 'string') {
    throw new Error('CapFabRenderer strand mode: data.source_display must be a string when present');
  }
}

function validateBodyOutcome(outcome, path) {
  if (!outcome || typeof outcome !== 'object') {
    throw new Error(`CapFabRenderer: ${path} is not an object`);
  }
  if (typeof outcome.body_index !== 'number' || !Number.isSafeInteger(outcome.body_index) || outcome.body_index < 0) {
    throw new Error(`CapFabRenderer: ${path}.body_index must be a non-negative safe integer`);
  }
  if (!Object.prototype.hasOwnProperty.call(outcome, 'foreach_token_id')) {
    throw new Error(
      `CapFabRenderer: ${path}.foreach_token_id must be present as null or a stable ForEach step token`
    );
  }
  if (outcome.foreach_token_id !== null
      && (typeof outcome.foreach_token_id !== 'string' || outcome.foreach_token_id.length === 0)) {
    throw new Error(`CapFabRenderer: ${path}.foreach_token_id must be null or a non-empty string`);
  }
  if (outcome.foreach_token_id === null && outcome.body_index !== 0) {
    throw new Error(`CapFabRenderer: ${path} is linear and must use body_index 0`);
  }
  if (typeof outcome.success !== 'boolean') {
    throw new Error(`CapFabRenderer: ${path}.success must be a boolean`);
  }
  assertArray(outcome.cap_urns, `${path}.cap_urns`);
  outcome.cap_urns.forEach((u, i) => assertString(u, `${path}.cap_urns[${i}]`));
  if (outcome.failed_token_id !== undefined && outcome.failed_token_id !== null
      && (typeof outcome.failed_token_id !== 'string' || outcome.failed_token_id.length === 0)) {
    throw new Error(`CapFabRenderer: ${path}.failed_token_id must be a non-empty string when present`);
  }
  if (!Object.prototype.hasOwnProperty.call(outcome, 'failed_token_id')) {
    throw new Error(
      `CapFabRenderer: ${path}.failed_token_id must be present as null or a stable step token`
    );
  }
  if (!Object.prototype.hasOwnProperty.call(outcome, 'failed_arg_urn')) {
    throw new Error(
      `CapFabRenderer: ${path}.failed_arg_urn must be present as null or an attributed argument URN`
    );
  }
  if (outcome.failed_arg_urn !== null
      && (typeof outcome.failed_arg_urn !== 'string' || outcome.failed_arg_urn.length === 0)) {
    throw new Error(`CapFabRenderer: ${path}.failed_arg_urn must be null or a non-empty string`);
  }
}

function validateRunIOItem(item, path) {
  assertObject(item, path);
  assertString(item.label, `${path}.label`);
  assertString(item.path, `${path}.path`);
  if (typeof item.is_directory !== 'boolean') {
    throw new Error(`CapFabRenderer run mode: ${path}.is_directory must be a boolean`);
  }
  if (typeof item.file_count !== 'number' || item.file_count < 0) {
    throw new Error(`CapFabRenderer run mode: ${path}.file_count must be a non-negative number`);
  }
}

function validateRunPayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('CapFabRenderer run mode: data must be an object');
  }
  if (!data.resolved_strand || typeof data.resolved_strand !== 'object') {
    throw new Error('CapFabRenderer run mode: data.resolved_strand must be an object');
  }
  validateStrandPayload(Object.assign({}, data.resolved_strand, {
    media_display_names: data.media_display_names,
  }));
  assertArray(data.body_outcomes, 'run mode data.body_outcomes');
  const bodyCoordinates = new Set();
  data.body_outcomes.forEach((o, idx) => {
    validateBodyOutcome(o, `run mode data.body_outcomes[${idx}]`);
    if (typeof o.foreach_token_id === 'string'
        && !data.resolved_strand.steps.some(step => (
          step.token_id === o.foreach_token_id
          && Object.keys(step.step_type)[0] === 'ForEach'
        ))) {
      throw new Error(
        `CapFabRenderer run mode: body_outcomes[${idx}].foreach_token_id '${o.foreach_token_id}' does not resolve to a ForEach strand step`
      );
    }
    if (typeof o.failed_token_id === 'string'
        && !data.resolved_strand.steps.some(step => step.token_id === o.failed_token_id)) {
      throw new Error(
        `CapFabRenderer run mode: body_outcomes[${idx}].failed_token_id '${o.failed_token_id}' does not resolve to a strand step`
      );
    }
    const coordinate = `${o.foreach_token_id === null ? 'linear' : o.foreach_token_id}:${o.body_index}`;
    if (bodyCoordinates.has(coordinate)) {
      throw new Error(`CapFabRenderer run mode: duplicate body coordinate '${coordinate}'`);
    }
    bodyCoordinates.add(coordinate);
  });
  if (typeof data.visible_success_count !== 'number' || data.visible_success_count < 0) {
    throw new Error('CapFabRenderer run mode: data.visible_success_count must be a non-negative number');
  }
  if (typeof data.visible_failure_count !== 'number' || data.visible_failure_count < 0) {
    throw new Error('CapFabRenderer run mode: data.visible_failure_count must be a non-negative number');
  }
  if (typeof data.total_body_count !== 'number' || data.total_body_count < 0) {
    throw new Error('CapFabRenderer run mode: data.total_body_count must be a non-negative number');
  }
  if (data.input_items !== undefined) {
    assertArray(data.input_items, 'run mode data.input_items');
    data.input_items.forEach((item, idx) => {
      validateRunIOItem(item, `run mode data.input_items[${idx}]`);
    });
  }
  if (data.input_runs !== undefined) {
    assertArray(data.input_runs, 'run mode data.input_runs');
    data.input_runs.forEach((run, idx) => {
      assertObject(run, `run mode data.input_runs[${idx}]`);
      validateRunIOItem(run.input, `run mode data.input_runs[${idx}].input`);
      assertArray(run.outputs, `run mode data.input_runs[${idx}].outputs`);
      run.outputs.forEach((output, outIdx) => {
        validateRunIOItem(output, `run mode data.input_runs[${idx}].outputs[${outIdx}]`);
      });
    });
  }
}

function validateEditorGraphPayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('CapFabRenderer editor-graph mode: data must be an object');
  }
  assertArray(data.elements, 'editor-graph mode data.elements');
  data.elements.forEach((el, idx) => {
    if (!el || typeof el !== 'object') {
      throw new Error(`CapFabRenderer editor-graph mode: data.elements[${idx}] is not an object`);
    }
    if (el.kind !== 'node' && el.kind !== 'cap' && el.kind !== 'edge') {
      throw new Error(
        `CapFabRenderer editor-graph mode: data.elements[${idx}].kind must be "node" | "cap" | "edge" (got: ${JSON.stringify(el.kind)})`
      );
    }
    assertString(el.graph_id, `editor-graph mode data.elements[${idx}].graph_id`);
    if (el.kind === 'edge') {
      assertString(el.source_graph_id, `editor-graph mode data.elements[${idx}].source_graph_id`);
      assertString(el.target_graph_id, `editor-graph mode data.elements[${idx}].target_graph_id`);
    }
  });
}

// `validateResolvedMachinePayload` checks the canonical machine
// render payload produced by Rust `Machine::to_render_payload_json`.
// Shape:
//   {
//     "strands": [
//       {
//         "nodes": [{"id": "n0", "urn": "media:ext=pdf"}, ...],
//         "edges": [{
//           "alias": "edge_0",
//           "cap_urn": "...",
//           "is_loop": false,
//           "assignment": [{"cap_arg_media_urn": "media:ext=pdf", "source_node": "n0"}, ...],
//           "target_node": "n1"
//         }, ...],
//         "input_anchor_nodes": ["n0"],
//         "output_anchor_nodes": ["n2"]
//       },
//       ...
//     ]
//   }
function validateResolvedMachinePayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('CapFabRenderer machine mode: data must be an object');
  }
  assertArray(data.strands, 'machine mode data.strands');
  data.strands.forEach((strand, sIdx) => {
    if (!strand || typeof strand !== 'object') {
      throw new Error(`CapFabRenderer machine mode: data.strands[${sIdx}] is not an object`);
    }
    assertArray(strand.nodes, `machine mode data.strands[${sIdx}].nodes`);
    strand.nodes.forEach((n, nIdx) => {
      if (!n || typeof n !== 'object') {
        throw new Error(`CapFabRenderer machine mode: data.strands[${sIdx}].nodes[${nIdx}] is not an object`);
      }
      assertString(n.id, `machine mode data.strands[${sIdx}].nodes[${nIdx}].id`);
      assertString(n.urn, `machine mode data.strands[${sIdx}].nodes[${nIdx}].urn`);
      assertString(n.title, `machine mode data.strands[${sIdx}].nodes[${nIdx}].title`);
    });
    assertArray(strand.edges, `machine mode data.strands[${sIdx}].edges`);
    strand.edges.forEach((e, eIdx) => {
      if (!e || typeof e !== 'object') {
        throw new Error(`CapFabRenderer machine mode: data.strands[${sIdx}].edges[${eIdx}] is not an object`);
      }
      assertString(e.alias, `machine mode data.strands[${sIdx}].edges[${eIdx}].alias`);
      assertString(e.cap_urn, `machine mode data.strands[${sIdx}].edges[${eIdx}].cap_urn`);
      assertString(e.title, `machine mode data.strands[${sIdx}].edges[${eIdx}].title`);
      if (typeof e.is_loop !== 'boolean') {
        throw new Error(`CapFabRenderer machine mode: data.strands[${sIdx}].edges[${eIdx}].is_loop must be boolean`);
      }
      assertArray(e.assignment, `machine mode data.strands[${sIdx}].edges[${eIdx}].assignment`);
      e.assignment.forEach((b, bIdx) => {
        if (!b || typeof b !== 'object') {
          throw new Error(`CapFabRenderer machine mode: data.strands[${sIdx}].edges[${eIdx}].assignment[${bIdx}] is not an object`);
        }
        assertString(b.cap_arg_media_urn, `machine mode data.strands[${sIdx}].edges[${eIdx}].assignment[${bIdx}].cap_arg_media_urn`);
        assertString(b.source_node, `machine mode data.strands[${sIdx}].edges[${eIdx}].assignment[${bIdx}].source_node`);
      });
      assertString(e.target_node, `machine mode data.strands[${sIdx}].edges[${eIdx}].target_node`);
    });
    assertArray(strand.input_anchor_nodes, `machine mode data.strands[${sIdx}].input_anchor_nodes`);
    strand.input_anchor_nodes.forEach((id, iIdx) => {
      assertString(id, `machine mode data.strands[${sIdx}].input_anchor_nodes[${iIdx}]`);
    });
    assertArray(strand.output_anchor_nodes, `machine mode data.strands[${sIdx}].output_anchor_nodes`);
    strand.output_anchor_nodes.forEach((id, oIdx) => {
      assertString(id, `machine mode data.strands[${sIdx}].output_anchor_nodes[${oIdx}]`);
    });
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

function centeredOrdinal(index, total) {
  if (!Number.isInteger(index) || !Number.isInteger(total) || total <= 0) {
    throw new Error('CapFabRenderer: centeredOrdinal requires integer index/total');
  }
  return index - ((total - 1) / 2);
}

function crowdOffsets(index, total, step, maxAbs) {
  if (total <= 1) return 0;
  const raw = centeredOrdinal(index, total) * step;
  if (maxAbs === undefined) return raw;
  return Math.max(-maxAbs, Math.min(maxAbs, raw));
}

function annotateCrowdedBrowseEdges(edges) {
  const bySource = new Map();
  const byTarget = new Map();

  for (const edge of edges) {
    if (!bySource.has(edge.source)) bySource.set(edge.source, []);
    bySource.get(edge.source).push(edge);
    if (!byTarget.has(edge.target)) byTarget.set(edge.target, []);
    byTarget.get(edge.target).push(edge);
  }

  const stableSort = (a, b) => {
    const targetCmp = a.target.localeCompare(b.target);
    if (targetCmp !== 0) return targetCmp;
    const titleCmp = a.title.localeCompare(b.title);
    if (titleCmp !== 0) return titleCmp;
    return a.id.localeCompare(b.id);
  };
  const reverseStableSort = (a, b) => {
    const sourceCmp = a.source.localeCompare(b.source);
    if (sourceCmp !== 0) return sourceCmp;
    const titleCmp = a.title.localeCompare(b.title);
    if (titleCmp !== 0) return titleCmp;
    return a.id.localeCompare(b.id);
  };

  for (const group of bySource.values()) group.sort(stableSort);
  for (const group of byTarget.values()) group.sort(reverseStableSort);

  const sourceIndex = new Map();
  const targetIndex = new Map();
  for (const group of bySource.values()) {
    group.forEach((edge, idx) => sourceIndex.set(edge.id, idx));
  }
  for (const group of byTarget.values()) {
    group.forEach((edge, idx) => targetIndex.set(edge.id, idx));
  }

  for (const edge of edges) {
    const sourceGroup = bySource.get(edge.source) || [edge];
    const targetGroup = byTarget.get(edge.target) || [edge];
    const sourceCount = sourceGroup.length;
    const targetCount = targetGroup.length;
    const crowdCount = Math.max(sourceCount, targetCount);

    if (crowdCount <= 2) {
      edge.crowdedClass = '';
      continue;
    }

    const sourceOffset = crowdOffsets(sourceIndex.get(edge.id), sourceCount, 18, 64);
    const targetOffset = crowdOffsets(targetIndex.get(edge.id), targetCount, 18, 64);

    edge.crowdedClass = 'crowded-edge';
    edge.controlPointDistances = `${sourceOffset} ${targetOffset}`;
    edge.controlPointWeights = '0.22 0.78';
    edge.controlPointStepSize = 56;
  }
}

// --------- Browse mode builder ----------------------------------------------

function buildBrowseGraphData(capabilities) {
  validateBrowseData(capabilities);


  const nodesMap = new Map();
  const edges = [];
  const capFab = new CapFab();
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
    const cap = createCap(parsedUrn, title, capData.aliases || []);
    const capFabEdgeIndex = capFab.edges.length;
    capFab.addCap(cap, 'registry');

    edges.push({
      id: edgeId,
      source: inSpec,
      target: outSpec,
      title,
      capability: capData,
      capFabEdgeIndex,
    });
    capabilitiesByEdgeId.set(edgeId, capData);
  }

  edges.forEach((edge, i) => {
    edge.color = edgeHueColor(i);
  });
  annotateCrowdedBrowseEdges(edges);

  const nodes = Array.from(nodesMap.values());
  for (const node of nodes) {
    if (!mediaTitles.has(node.id)) {
      throw new Error(
        `CapFabRenderer browse mode: missing explicit media title for '${node.id}'`
      );
    }
  }

  const adjacency = new Map();
  const reverseAdj = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    adjacency.get(edge.source).add(edge.target);
    if (!reverseAdj.has(edge.target)) reverseAdj.set(edge.target, new Set());
    reverseAdj.get(edge.target).add(edge.source);
  }

  return { nodes, edges, adjacency, reverseAdj, capFab, mediaTitles, capabilitiesByEdgeId };
}

function browseCytoscapeElements(built) {
  const nodeElements = built.nodes.map(node => ({
    group: 'nodes',
    data: {
      id: node.id,
      label: built.mediaTitles.get(node.id),
      mediaTitle: built.mediaTitles.get(node.id),
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
        capFabEdgeIndex: edge.capFabEdgeIndex,
        color: edge.color,
        controlPointStepSize: edge.controlPointStepSize || 56,
        controlPointDistances: edge.controlPointDistances || '0 0',
        controlPointWeights: edge.controlPointWeights || '0.22 0.78',
      },
      classes: edge.crowdedClass || '',
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
// step's canonical URN (or source_media_urn/target_media_urn for the boundary
// nodes). ForEach and Collect nodes display "for each" / "collect".
// Cap edges carry the cap title plus cardinality marker when either
// input or output is a sequence.
function buildStrandGraphData(data) {
  validateStrandPayload(data);

  const mediaDisplayNames = data.media_display_names || {};
  const sourceMediaUrn = canonicalMediaUrn(data.source_media_urn);
  const targetMediaUrn = canonicalMediaUrn(data.target_media_urn);

  // Look up a display name for a media URN via the host-supplied map.
  // Uses `MediaUrn.isEquivalent` so tag-order variation doesn't defeat
  // the lookup — URNs are compared semantically, never as raw strings.
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
    return requireExplicitDisplayName(canonicalUrn, displayEntries, 'strand node');
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
    });
    edgeCounter++;
  }

  // Entry node — the strand's source media def.
  const inputSlotId = 'input_slot';
  addNode(inputSlotId, displayNameFor(sourceMediaUrn), sourceMediaUrn, 'strand-source');

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

  // Map every step's stable token_id to its output node id. A cap
  // step's node (`step_${i}`) IS its `to_spec` output, so a convergence
  // input naming a producer by token resolves to that producer's output
  // node — the value flowing into the fan-in arg.
  const tokenToNodeId = new Map();
  data.steps.forEach((step, i) => {
    if (step && typeof step.token_id === 'string' && step.token_id.length > 0) {
      tokenToNodeId.set(step.token_id, `step_${i}`);
    }
  });

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
      // Resolve this cap's actual data-flow producers from `body.inputs`
      // (capdag CapInput serde shape): each `source` is the string
      // "StrandInput" (fed by the strand's input anchor → the input slot
      // node) or `{ Step: { token_id } }` (fed by a producing cap → that
      // step's output node). This is the authoritative topology; step
      // ORDER is not — the realizer emits edges greedily in dependency
      // order, so `prevNodeId` (the previously-emitted step) need not be
      // one of this cap's inputs at all.
      const capInputs = body.inputs;
      const producerNodeIds = [];
      for (const input of capInputs) {
        const src = input && input.source;
        if (src === 'StrandInput') {
          producerNodeIds.push(inputSlotId);
          continue;
        }
        const producerToken = src && typeof src === 'object' && src.Step && src.Step.token_id;
        if (typeof producerToken !== 'string' || producerToken.length === 0) {
          throw new Error(`CapFabRenderer strand: cap step '${step.token_id}' has an invalid producer token`);
        }
        const producerNodeId = tokenToNodeId.get(producerToken);
        if (!producerNodeId) {
          throw new Error(
            `CapFabRenderer strand: cap step '${step.token_id}' references unknown producer '${producerToken}'`
          );
        }
        producerNodeIds.push(producerNodeId);
      }

      // Pick the source of the single labeled "backbone" edge (the one
      // carrying the cap title + cardinality). Inside a ForEach body, keep
      // the linear `prevNodeId` thread so the boundary handling and its
      // (1→n) entry marker are preserved exactly. Otherwise anchor it on a REAL
      // input: `prevNodeId` if it is genuinely one, else the first actual
      // producer — so a non-input step ordered just before this cap can
      // never become a spurious backbone edge.
      const isForeachContext = isForeachEntry || insideForEachBody !== null;
      let backboneSource = prevNodeId;
      if (!isForeachContext && producerNodeIds.length > 0 && !producerNodeIds.includes(prevNodeId)) {
        backboneSource = producerNodeIds[0];
      }
      addEdge(
        backboneSource,
        nodeId,
        label,
        body.title,
        body.cap_urn,
        'strand-cap-edge',
        { foreachEntry: isForeachEntry }
      );

      // Convergence (fan-in): draw an edge from every other producer that
      // isn't the backbone source, so a cap fed by several producers renders
      // as a DAG, not a chain. Deduplicated against the backbone edge and
      // against a self-loop.
      const drawnSources = new Set([backboneSource, nodeId]);
      for (const producerNodeId of producerNodeIds) {
        if (drawnSources.has(producerNodeId)) continue;
        drawnSources.add(producerNodeId);
        addEdge(
          producerNodeId,
          nodeId,
          '',
          body.title,
          body.cap_urn,
          'strand-convergence',
          {}
        );
      }

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
            `CapFabRenderer strand: nested ForEach at step[${i}] but outer ForEach at step[${outer.index}] has no body caps`
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

    throw new Error(`CapFabRenderer strand: unknown step_type variant '${variant}' at step[${i}]`);
  });

  // Handle unclosed ForEach after the walk. Mirrors plan_builder.rs:362-428.
  // An unclosed ForEach with a body just creates the synthetic
  // ForEach node + iteration edge and leaves `prev_node_id` at
  // the last body cap. The render collapse drops the ForEach node;
  // the cap edges inside the body keep their own labels verbatim.
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
  addNode(outputId, displayNameFor(targetMediaUrn), targetMediaUrn, 'strand-target');
  addEdge(prevNodeId, outputId, '', '', '', 'strand-cap-edge');

  // Return the raw plan-builder topology. Strand mode collapses
  // ForEach/Collect nodes into edge labels at render time (see
  // `strandCytoscapeElements`); run mode keeps them as explicit
  // nodes because body replicas anchor at the ForEach/Collect
  // junctions.
  return { nodes, edges, sourceMediaUrn, targetMediaUrn };
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
//      `foreachEntry: true`. The collapse does NOT relabel this
//      edge — the cap's own cardinality marker (from its
//      `input_is_sequence`/`output_is_sequence`) is the single
//      source of truth. A `(1→n)` marker on a strand edge means
//      the cap on that edge produces a sequence, and that's
//      already reflected in the builder's label.
//
//   3. Every Collect (whether closing a body or standalone) is
//      replaced by a plain unlabeled bridging edge from the
//      body-exit node to the post-collect target. Any cardinality
//      shift introduced by the collect is already visible on the
//      post-collect cap's `input_is_sequence=true` flag.
//
//   4. If the last cap step's `to_spec` is semantically equivalent
//      to the strand's `target_media_urn` (via MediaUrn.isEquivalent),
//      the separate `output` target node is dropped and the last
//      cap edge lands on that merged endpoint. Removes the visible
//      duplicate node.
function collapseStrandShapeTransitions(built) {

  // Index for lookups.
  const nodeById = new Map();
  for (const n of built.nodes) nodeById.set(n.id, n);

  // Step 1: before dropping Collect nodes, synthesize a plain
  // bridging edge that replaces each dropped Collect. For a
  // Collect node C the plan builder produced:
  //   body_exit → C   (strand-collection, label="collect")
  //   C → next        (strand-cap-edge, label="")
  // The collapse drops C and its two touching edges. We emit an
  // unlabeled `body_exit → next` cap edge in their place. The
  // Collect transition itself is invisible — any cardinality
  // shift is already on the post-collect cap's own label.
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
        // The Collect transition is invisible in the render.
        // Every Collect becomes a plain unlabeled bridge edge
        // from the body-exit node to the post-collect target.
        // Any cardinality shift is already visible on the
        // body-exit cap's own label (via its input/output
        // sequence flags) or on the post-collect cap's label.
        synthesizedExitEdges.push({
          id: `${node.id}-collapsed-exit-${synthesizedExitEdges.length}`,
          source: bodyExitNodeId,
          target: outEdge.target,
          label: '',
          title: '',
          fullUrn: '',
          edgeClass: 'strand-cap-edge strand-shape-edge strand-collect-edge',
          color: bodyExitCapEdge ? bodyExitCapEdge.color : inEdge.color,
          foreachEntry: false,
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

  // Step 2: surface shape transitions as distinct edge semantics.
  // The cap edge that enters a foreach body keeps its original cap
  // label; only the edge styling changes. Collect bridges are
  // synthesized above as dedicated dashed edges.
  edges = edges.map(edge => {
    if (!edge.foreachEntry) return edge;
    return Object.assign({}, edge, {
      edgeClass: `${edge.edgeClass} strand-shape-edge strand-foreach-edge`,
    });
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
  const target = CapUrn.fromString(targetUrnString);
  for (let i = 0; i < steps.length; i++) {
    const variant = Object.keys(steps[i].step_type)[0];
    if (variant !== 'Cap') continue;
    const candidate = CapUrn.fromString(steps[i].step_type.Cap.cap_urn);
    if (candidate.isEquivalent(target)) return i;
  }
  return -1;
}

// Remove backbone cap nodes that will be replaced by per-body
// replicas from the collapsed strand backbone. Every step_id in
// `dropStepIds` is erased along with its incoming and outgoing
// edges. Replicas own the per-body rendering of those nodes.
//
// The function does NOT try to stitch the backbone back together —
// the replicas are responsible for connecting the anchor to the
// merge target, and the "no outcomes yet" case is handled by
// `buildRunGraphData`'s backbone-drop logic which also removes the
// now-dangling target node when there are zero successful replicas.
function stripRunBackboneReplicaNodes(built, dropStepIds) {
  if (dropStepIds.size === 0) return built;
  const keptNodes = built.nodes.filter(n => !dropStepIds.has(n.id));
  const keptEdges = built.edges.filter(e =>
    !dropStepIds.has(e.source) && !dropStepIds.has(e.target));
  return {
    nodes: keptNodes,
    edges: keptEdges,
    sourceMediaUrn: built.sourceMediaUrn,
    targetMediaUrn: built.targetMediaUrn,
  };
}

function emptyRunBackbone() {
  return {
    nodes: [],
    edges: [],
    sourceMediaUrn: '',
    targetMediaUrn: '',
  };
}

function buildExternalInputRunGraphData(
  data,
  inputRuns,
  allOutcomes,
  visibleSuccess,
  visibleFailure,
  hiddenSuccessCount,
  hiddenFailureCount,
  displayNameFor
) {
  if (inputRuns.length <= 1 || allOutcomes.length === 0) return null;

  const capSteps = data.resolved_strand.steps
    .filter(step => Object.keys(step.step_type)[0] === 'Cap');
  if (capSteps.length === 0) {
    throw new Error('CapFabRenderer run mode: external multi-input runs require at least one Cap step in resolved_strand.');
  }

  const visibleOutcomes = visibleSuccess.concat(visibleFailure);
  const sourceCanonical = canonicalMediaUrn(data.resolved_strand.source_media_urn);
  const targetCanonical = canonicalMediaUrn(data.resolved_strand.target_media_urn);
  const anchorNodeId = 'external-input-anchor';
  const replicaNodes = [{
    group: 'nodes',
    data: {
      id: anchorNodeId,
      label: displayNameFor(sourceCanonical),
      fullUrn: sourceCanonical,
    },
    classes: 'strand-source',
  }];
  const replicaEdges = [];
  const showMoreNodes = [];

  for (const outcome of allOutcomes) {
    if (outcome.body_index >= inputRuns.length) {
      throw new Error(
        `CapFabRenderer run mode: body_outcomes[body_index=${outcome.body_index}] exceeds input_runs length ${inputRuns.length}`
      );
    }
  }

  function buildReplica(outcome) {
    const runDef = inputRuns[outcome.body_index];
    const success = outcome.success;
    const nodeClass = success ? 'body-success' : 'body-failure';
    const edgeClass = success ? 'body-success' : 'body-failure';
    const edgeColor = success ? 'var(--graph-body-edge-success)' : 'var(--graph-body-edge-failure)';
    const bodyKey = `external-body-${outcome.body_index}`;
    const sourceNodeId = `${bodyKey}-input`;
    const sourceLabel = typeof outcome.title === 'string' && outcome.title.length > 0
      ? outcome.title
      : runDef.input.label;

    replicaNodes.push({
      group: 'nodes',
      data: {
        id: sourceNodeId,
        label: sourceLabel,
        fullUrn: runDef.input.path,
        bodyIndex: outcome.body_index,
        bodyTitle: sourceLabel,
      },
      classes: `${nodeClass} run-input-item`,
    });
    replicaEdges.push({
      group: 'edges',
      data: {
        id: `${bodyKey}-entry`,
        source: anchorNodeId,
        target: sourceNodeId,
        label: '',
        title: runDef.input.path,
        fullUrn: '',
        color: getCssVar('--graph-edge-color'),
        bodyIndex: outcome.body_index,
      },
      classes: edgeClass,
    });

    let traceEnd = capSteps.length;
    if (!success) {
      if (typeof outcome.failed_token_id === 'string' && outcome.failed_token_id.length > 0) {
        traceEnd = 0;
        for (let i = 0; i < capSteps.length; i++) {
          if (capSteps[i].token_id === outcome.failed_token_id) {
            traceEnd = i + 1;
            break;
          }
        }
      } else {
        traceEnd = 0;
      }
    }

    let prevNodeId = sourceNodeId;
    for (let i = 0; i < traceEnd; i++) {
      const capStep = capSteps[i];
      const cap = capStep.step_type.Cap;
      const targetMedia = canonicalMediaUrn(
        i === capSteps.length - 1
          ? data.resolved_strand.target_media_urn
          : capStep.to_spec
      );
      const isLastExecutedStep = i === traceEnd - 1;
      const outputs = success ? runDef.outputs : [];

      if (success && isLastExecutedStep && outputs.length > 0) {
        outputs.forEach((output, outputIdx) => {
          const outputNodeId = `${bodyKey}-output-${outputIdx}`;
          replicaNodes.push({
            group: 'nodes',
            data: {
              id: outputNodeId,
              label: output.label,
              fullUrn: output.path,
              bodyIndex: outcome.body_index,
              bodyTitle: sourceLabel,
            },
            classes: nodeClass,
          });
          replicaEdges.push({
            group: 'edges',
            data: {
              id: `${bodyKey}-output-edge-${i}-${outputIdx}`,
              source: prevNodeId,
              target: outputNodeId,
              label: outputIdx === 0 ? cap.title : '',
              title: cap.title,
              fullUrn: cap.cap_urn,
              color: edgeColor,
              bodyIndex: outcome.body_index,
            },
            classes: edgeClass,
          });
        });
        return;
      }

      const stepNodeId = `${bodyKey}-step-${i}`;
      replicaNodes.push({
        group: 'nodes',
        data: {
          id: stepNodeId,
          label: displayNameFor(isLastExecutedStep ? targetCanonical : targetMedia),
          fullUrn: isLastExecutedStep ? targetCanonical : targetMedia,
          bodyIndex: outcome.body_index,
          bodyTitle: sourceLabel,
        },
        classes: nodeClass,
      });
      replicaEdges.push({
        group: 'edges',
        data: {
          id: `${bodyKey}-step-edge-${i}`,
          source: prevNodeId,
          target: stepNodeId,
          label: cap.title,
          title: cap.title,
          fullUrn: cap.cap_urn,
          color: edgeColor,
          bodyIndex: outcome.body_index,
        },
        classes: edgeClass,
      });
      prevNodeId = stepNodeId;
    }
  }

  visibleOutcomes.forEach(buildReplica);

  if (hiddenSuccessCount > 0) {
    showMoreNodes.push({
      group: 'nodes',
      data: {
        id: 'show-more-success',
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
        target: 'show-more-success',
        label: '',
        title: '',
        fullUrn: '',
        color: 'var(--graph-body-edge-success)',
      },
      classes: 'body-success',
    });
  }
  if (hiddenFailureCount > 0) {
    showMoreNodes.push({
      group: 'nodes',
      data: {
        id: 'show-more-failure',
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
        target: 'show-more-failure',
        label: '',
        title: '',
        fullUrn: '',
        color: 'var(--graph-body-edge-failure)',
      },
      classes: 'body-failure',
    });
  }

  return {
    strandBuilt: emptyRunBackbone(),
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

function buildRunGraphData(data) {
  validateRunPayload(data);

  // Build the raw strand topology and then apply the strand
  // collapse so the run backbone inherits the same cosmetic
  // transform (no ForEach/Collect nodes, fix-up edges for
  // foreach-entry, merged trailing target).
  const strandInput = Object.assign({}, data.resolved_strand, {
    media_display_names: data.media_display_names,
  });
  const strandBuiltRaw = buildStrandGraphData(strandInput);
  let strandBuiltCollapsed = collapseStrandShapeTransitions(strandBuiltRaw);

  const inputItems = Array.isArray(data.input_items) ? data.input_items : [];
  const inputRuns = Array.isArray(data.input_runs) ? data.input_runs : [];
  const inputReplicaNodes = [];
  const inputReplicaEdges = [];
  inputItems.forEach((item, idx) => {
    const nodeId = `input-item-${idx}`;
    inputReplicaNodes.push({
      group: 'nodes',
      data: {
        id: nodeId,
        label: item.label,
        fullUrn: item.path,
        inputIndex: idx,
        inputPath: item.path,
      },
      classes: 'run-input-item',
    });
    inputReplicaEdges.push({
      group: 'edges',
      data: {
        id: `input-item-edge-${idx}`,
        source: nodeId,
        target: 'input_slot',
        label: '',
        title: item.path,
        fullUrn: '',
        color: getCssVar('--graph-edge-color'),
      },
    });
  });

  // Locate the ForEach/Collect span in the raw steps. Positional
  // IDs survive the collapse (node IDs are `step_${i}` from the
  // builder), so we can still identify which collapsed nodes
  // correspond to body-interior caps.
  const steps = data.resolved_strand.steps;
  let foreachStepIdx = -1;
  let collectStepIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    const variant = Object.keys(steps[i].step_type)[0];
    if (variant === 'ForEach' && foreachStepIdx < 0) foreachStepIdx = i;
    if (variant === 'Collect' && collectStepIdx < 0) collectStepIdx = i;
  }
  const hasForeach = foreachStepIdx >= 0;
  const hasCollect = collectStepIdx >= 0;

  // Filter and bound the outcomes.
  const allOutcomes = data.body_outcomes.slice().sort((a, b) => a.body_index - b.body_index);
  const successes = allOutcomes.filter(o => o.success);
  const failures = allOutcomes.filter(o => !o.success);
  const visibleSuccess = successes.slice(0, data.visible_success_count);
  const visibleFailure = failures.slice(0, data.visible_failure_count);
  const hiddenSuccessCount = successes.length - visibleSuccess.length;
  const hiddenFailureCount = failures.length - visibleFailure.length;
  const visibleOutcomes = visibleSuccess.concat(visibleFailure);

  // Look up a display name for a media URN via the host-supplied
  // `media_display_names` map. Uses `MediaUrn.isEquivalent` for
  // semantic URN equality.
  const mediaDisplayNames = data.media_display_names || {};
  const displayEntries = [];
  for (const [urn, display] of Object.entries(mediaDisplayNames)) {
    if (typeof display !== 'string' || display.length === 0) continue;
    try {
      displayEntries.push({ media: MediaUrn.fromString(urn), display });
    } catch (_) { /* ignore malformed keys */ }
  }
  function displayNameFor(canonicalUrn) {
    return requireExplicitDisplayName(canonicalUrn, displayEntries, 'run node');
  }

  const externalInputRunBuilt = buildExternalInputRunGraphData(
    data,
    inputRuns,
    allOutcomes,
    visibleSuccess,
    visibleFailure,
    hiddenSuccessCount,
    hiddenFailureCount,
    displayNameFor
  );
  if (externalInputRunBuilt !== null) {
    return externalInputRunBuilt;
  }

  // Per-body replicas only fire when there's a ForEach AND at
  // least one visible outcome. Without outcomes, the strand
  // backbone renders the "plan preview" unchanged.
  const shouldExpand = hasForeach && visibleOutcomes.length > 0;

  // Body-interior Cap steps — each body iteration chains through
  // these caps once. Only valid when `shouldExpand` is true.
  const bodyCapSteps = [];
  if (hasForeach) {
    const bodyStart = foreachStepIdx + 1;
    const bodyEnd = hasCollect ? collectStepIdx : steps.length;
    for (let i = bodyStart; i < bodyEnd; i++) {
      if (Object.keys(steps[i].step_type)[0] === 'Cap') {
        bodyCapSteps.push({ globalIndex: i, step: steps[i] });
      }
    }
  }

  // Short-circuit: no outcomes → the backbone IS the render.
  // `anchorNodeId` and `mergeNodeId` are unused in this path.
  if (!shouldExpand) {
    return {
      strandBuilt: strandBuiltCollapsed,
      replicaNodes: inputReplicaNodes,
      replicaEdges: inputReplicaEdges,
      showMoreNodes: [],
      totals: {
        hiddenSuccessCount,
        hiddenFailureCount,
        totalBodyCount: data.total_body_count,
        visibleSuccessCount: visibleSuccess.length,
        visibleFailureCount: visibleFailure.length,
      },
    };
  }

  // Expanding. The plan uses the renderer's established fan-out layout:
  //
  //   pre-foreach backbone ... → [anchor]
  //                                 │
  //                                 │ (Disbind PDF Into Pages, fork)
  //                                 ▼
  //             body_N_entry (per-body page, e.g. "page_3")
  //                   │ (Make a Decision)
  //                   ▼
  //             body_N_step_0 (per-body Decision output)
  //                   │
  //                   ▼  (if Collect exists) → shared collect target
  //                      (else terminal leaf)
  //
  // If the cap immediately before the ForEach has
  // `output_is_sequence=true`, THAT cap is the fan-out point:
  // its output IS the sequence the ForEach iterates. Its
  // backbone output node is dropped (replicas own the per-body
  // rendering), and its step becomes the "fork cap" whose title
  // labels the anchor→entry edge on the first body.
  //
  // Without such a preceding sequence cap, the source itself is
  // already a list (e.g. `media:ext=pdf;list` source_media_urn) and the
  // ForEach iterates it directly.
  let seqProducerStepIdx = -1;
  let seqProducerStep = null;
  if (hasForeach && foreachStepIdx > 0) {
    const preStep = steps[foreachStepIdx - 1];
    if (Object.keys(preStep.step_type)[0] === 'Cap'
        && preStep.step_type.Cap.output_is_sequence === true) {
      seqProducerStepIdx = foreachStepIdx - 1;
      seqProducerStep = preStep;
    }
  }

  // The anchor is the node BEFORE the sequence producer (or
  // before the ForEach if there is none). Every body iteration
  // shares this node as its starting point; per-body entries fan
  // out from here.
  let anchorNodeId;
  if (seqProducerStepIdx >= 0) {
    anchorNodeId = seqProducerStepIdx > 0
      ? `step_${seqProducerStepIdx - 1}`
      : 'input_slot';
  } else {
    anchorNodeId = foreachStepIdx > 0
      ? `step_${foreachStepIdx - 1}`
      : 'input_slot';
  }

  // Strip nodes whose per-body replicas will replace them:
  // the sequence producer's backbone output (if any) AND every
  // body-interior cap. The foreach-entry edge is dropped
  // automatically because its source/target is in this set.
  const dropStepIds = new Set(bodyCapSteps.map(b => `step_${b.globalIndex}`));
  if (seqProducerStepIdx >= 0) {
    dropStepIds.add(`step_${seqProducerStepIdx}`);
  }
  let strandBuilt = stripRunBackboneReplicaNodes(strandBuiltCollapsed, dropStepIds);

  // If there's a Collect, find the post-collect target in the
  // backbone — the node successful replicas merge into. This is
  // the first node reachable forward from the last body cap that
  // isn't itself a body cap. Walk the pre-strip backbone so we
  // can cross over the now-dropped body cap nodes.
  let collectTargetId = null;
  if (hasCollect && bodyCapSteps.length > 0) {
    const lastBodyStepId = `step_${bodyCapSteps[bodyCapSteps.length - 1].globalIndex}`;
    let cursor = lastBodyStepId;
    let guard = 64;
    while (guard-- > 0) {
      const out = strandBuiltCollapsed.edges.find(e => e.source === cursor);
      if (!out) break;
      cursor = out.target;
      if (!dropStepIds.has(cursor)) {
        collectTargetId = cursor;
        break;
      }
    }
    // If the last-body-step is itself the merged terminal (no
    // outgoing edge), there's no separate collect target —
    // replicas simply don't merge and the terminal node stays
    // dropped.
  }

  const replicaNodes = [];
  const replicaEdges = [];
  replicaNodes.push(...inputReplicaNodes);
  replicaEdges.push(...inputReplicaEdges);
  let replicasBuiltCount = 0;

  // The per-body "entry" node represents one item of the
  // sequence being iterated. Its URN is:
  //   * the sequence producer cap's `to_spec` (if such a cap
  //     precedes the ForEach) — this is what Disbind produces,
  //     one-per-body.
  //   * otherwise the ForEach step's own `to_spec` — used when
  //     the source spec is already a list.
  // Its label defaults to the display name of that URN and is
  // overridden by the host's per-body `outcome.title` (e.g.
  // "page_3") when provided.
  const entryUrn = seqProducerStep
    ? canonicalMediaUrn(seqProducerStep.to_spec)
    : canonicalMediaUrn(steps[foreachStepIdx].to_spec);
  const entryDefaultLabel = displayNameFor(entryUrn);

  // Label shown on the anchor → first-body-entry edge. When the
  // fan-out is caused by a sequence-producing cap, its title
  // (e.g. "Disbind PDF Into Pages") labels that edge. The label
  // appears on the FIRST body's fork edge only to avoid N copies
  // of the same title cluttering the fan.
  const forkEdgeTitle = seqProducerStep
    ? seqProducerStep.step_type.Cap.title
    : '';
  const forkEdgeFullUrn = seqProducerStep
    ? seqProducerStep.step_type.Cap.cap_urn
    : '';

  function buildBodyReplica(outcome) {
    const success = outcome.success;
    const successClass = success ? 'body-success' : 'body-failure';
    const edgeClass = success ? 'body-success' : 'body-failure';
    const colorVar = success ? '--graph-body-edge-success' : '--graph-body-edge-failure';

    // Trace end: failures stop at the exact stable step token.
    let traceEnd = success ? bodyCapSteps.length : 0;
    if (!success && typeof outcome.failed_token_id === 'string' && outcome.failed_token_id.length > 0) {
      const failedIndex = bodyCapSteps.findIndex(
        bodyStep => bodyStep.step.token_id === outcome.failed_token_id
      );
      if (failedIndex >= 0) traceEnd = failedIndex + 1;
    }

    const bodyKey = `body-${outcome.body_index}`;
    const titleLabel = typeof outcome.title === 'string' && outcome.title.length > 0
      ? outcome.title
      : entryDefaultLabel;

    // Per-body entry node: one item from the iterated sequence.
    const entryNodeId = `${bodyKey}-entry`;
    replicaNodes.push({
      group: 'nodes',
      data: {
        id: entryNodeId,
        label: titleLabel,
        fullUrn: entryUrn,
        bodyIndex: outcome.body_index,
        bodyTitle: titleLabel,
      },
      classes: successClass,
    });

    // Fan-out edge from the pre-foreach anchor to this body's
    // entry. The fork label (cap title) shows on the FIRST body
    // only to avoid N copies of the same title cluttering the
    // fan. The `title` tooltip always exposes the cap title.
    const isFirstReplica = replicasBuiltCount === 0;
    const forkLabel = (forkEdgeTitle && isFirstReplica) ? forkEdgeTitle : '';
    replicaEdges.push({
      group: 'edges',
      data: {
        id: `${bodyKey}-fork`,
        source: anchorNodeId,
        target: entryNodeId,
        label: forkLabel,
        title: forkEdgeTitle || `body ${outcome.body_index}`,
        fullUrn: forkEdgeFullUrn,
        color: `var(${colorVar})`,
        bodyIndex: outcome.body_index,
      },
      classes: edgeClass,
    });

    let prevBodyNodeId = entryNodeId;

    for (let i = 0; i < traceEnd; i++) {
      const body = bodyCapSteps[i].step.step_type.Cap;
      const targetCanonical = canonicalMediaUrn(bodyCapSteps[i].step.to_spec);
      const replicaNodeId = `${bodyKey}-n-${i}`;
      replicaNodes.push({
        group: 'nodes',
        data: {
          id: replicaNodeId,
          label: displayNameFor(targetCanonical),
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
          // identical across every visible replica and would pile
          // up as unreadable rotated text across the fan-out. The
          // hover tooltip exposes the title via `title`.
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

    // Successful bodies merge into the collect target ONLY when a
    // Collect closes the foreach body. Without a Collect (the
    // common "unclosed foreach" case in floom-engine realize_strand),
    // replicas terminate at their last body step — each body has
    // its own separate output, no shared merge.
    if (success && hasCollect && collectTargetId) {
      replicaEdges.push({
        group: 'edges',
        data: {
          id: `${bodyKey}-collect`,
          source: prevBodyNodeId,
          target: collectTargetId,
          label: '',
          title: 'collect',
          fullUrn: '',
          color: `var(${colorVar})`,
          bodyIndex: outcome.body_index,
        },
        classes: edgeClass,
      });
    }

    replicasBuiltCount++;
  }

  visibleOutcomes.forEach((o) => buildBodyReplica(o));

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
  // Run mode's `buildRunGraphData` already applied the strand
  // collapse to its backbone (and dropped body-interior caps
  // that are replaced by per-body replicas). Emit the backbone
  // verbatim — `{ collapse: false }` prevents a second pass.
  const strandElements = strandCytoscapeElements(built.strandBuilt, { collapse: false });
  return strandElements
    .concat(built.replicaNodes)
    .concat(built.showMoreNodes)
    .concat(built.replicaEdges);
}

// --------- Machine mode builder ---------------------------------------------

// The notation analyzer emits a bipartite graph where each cap
// application is a 3-element chain:
//
//   data_node → [argument edge] → cap_node → [argument edge] → data_node
//
// The render collapses that chain into a single labeled data→data
// edge carrying the cap's name (and cardinality marker derived
// from the source/target data nodes' `is_sequence` flags). Cap
// nodes and argument edges are dropped. The result is a clean
// abstract-machine view that matches strand mode's rendering
// style: one edge per cap application, labeled with the cap
// title, with cardinality markers where relevant.
function buildEditorGraphData(data) {
  validateEditorGraphPayload(data);

  // Index elements by kind for quick lookup.
  const dataNodes = new Map(); // graph_id → element
  const capNodes = new Map();  // graph_id → element
  const argEdges = [];         // list of edge elements
  for (const el of data.elements) {
    if (el.kind === 'node') {
      dataNodes.set(el.graph_id, el);
    } else if (el.kind === 'cap') {
      capNodes.set(el.graph_id, el);
    } else if (el.kind === 'edge') {
      argEdges.push(el);
    }
  }

  // For each cap, identify its incoming and outgoing argument
  // edges. Incoming edges connect a data-slot source → this cap.
  // Outgoing edges connect this cap → a data-slot target.
  const capIncoming = new Map(); // capId → [argEdge, ...]
  const capOutgoing = new Map(); // capId → [argEdge, ...]
  for (const e of argEdges) {
    if (capNodes.has(e.target_graph_id)) {
      if (!capIncoming.has(e.target_graph_id)) capIncoming.set(e.target_graph_id, []);
      capIncoming.get(e.target_graph_id).push(e);
    }
    if (capNodes.has(e.source_graph_id)) {
      if (!capOutgoing.has(e.source_graph_id)) capOutgoing.set(e.source_graph_id, []);
      capOutgoing.get(e.source_graph_id).push(e);
    }
  }

  const nodes = [];
  const edges = [];

  // Emit the data slot nodes verbatim.
  for (const el of dataNodes.values()) {
    nodes.push({
      group: 'nodes',
      data: {
        id: el.graph_id,
        label: el.label || '',
        fullUrn: el.detail || el.label || '',
        tokenId: el.token_id || '',
        kind: 'node',
        isSequence: el.is_sequence === true,
      },
      classes: 'machine-node',
    });
  }

  // Collapse each cap into one labeled edge per (input, output)
  // data-slot pair. For a simple single-input single-output cap
  // that's one edge. Multi-arg caps emit one edge per combination,
  // preserving the argument structure while still using a single
  // visual target per cap application.
  let capEdgeIdx = 0;
  for (const [capId, capEl] of capNodes) {
    const incoming = capIncoming.get(capId) || [];
    const outgoing = capOutgoing.get(capId) || [];

    // Degenerate cases: a cap with no incoming or no outgoing
    // argument edges (e.g. partially-written notation). Render
    // nothing for it — the user sees a missing edge where they
    // need to complete the notation.
    if (incoming.length === 0 || outgoing.length === 0) continue;

    // Cardinality of the cap's visual edge comes from the
    // source-side and target-side data-slot `is_sequence` flags.
    // When a cap has multiple inputs/outputs, use the MOST
    // restrictive reading (any seq input → `is_sequence=true` on
    // that side). This mirrors how cardinalityLabel collapses
    // multi-arg caps in the strand/browse builders.
    const inputIsSequence = incoming.some(e => {
      const src = dataNodes.get(e.source_graph_id);
      return src && src.is_sequence === true;
    });
    const outputIsSequence = outgoing.some(e => {
      const tgt = dataNodes.get(e.target_graph_id);
      return tgt && tgt.is_sequence === true;
    });
    const cardinality = cardinalityLabel(inputIsSequence, outputIsSequence);
    const capTitle = capEl.label || '';
    const label = cardinality === '1\u21921'
      ? capTitle
      : `${capTitle} (${cardinality})`;

    const color = capEl.is_loop
      ? 'var(--graph-loop-color)'
      : edgeHueColor(capEdgeIdx);
    const baseClasses = capEl.is_loop ? 'machine-edge machine-loop' : 'machine-edge';

    // Cartesian over incoming × outgoing.  For the common case
    // of one incoming + one outgoing, that's exactly one emitted
    // edge.
    for (const inEdge of incoming) {
      for (const outEdge of outgoing) {
        edges.push({
          group: 'edges',
          data: {
            id: `${capId}-${inEdge.graph_id}-${outEdge.graph_id}`,
            source: inEdge.source_graph_id,
            target: outEdge.target_graph_id,
            label,
            title: capTitle,
            fullUrn: capEl.linked_cap_urn || capEl.detail || '',
            // The cap node's token id is what the editor uses
            // for cross-highlighting; prefer that over the arg
            // edge token ids so clicking the rendered edge
            // selects the cap in the source text.
            tokenId: capEl.token_id || '',
            color: color,
          },
          classes: baseClasses,
        });
      }
    }
    capEdgeIdx++;
  }

  return { nodes, edges };
}

function editorGraphCytoscapeElements(built) {
  return built.nodes.concat(built.edges);
}

// A cheap signature for editor-graph mode inputs. The editor streams
// updates on every keystroke; we skip the expensive rebuild when the
// element shape is unchanged.
function editorGraphSignature(data) {
  if (!data || !Array.isArray(data.elements)) return '';
  const parts = [];
  for (const el of data.elements) {
    parts.push(`${el.kind}|${el.graph_id}|${el.token_id || ''}|${el.label || ''}|${el.source_graph_id || ''}|${el.target_graph_id || ''}|${el.is_loop ? '1' : '0'}`);
  }
  return parts.join(';');
}

// `buildResolvedMachineGraphData` consumes the canonical
// `Machine::to_render_payload_json` shape and produces the cytoscape
// elements list directly. Each strand contributes its own nodes and
// edges to the same graph; cytoscape lays disconnected components
// side by side.
//
// Node ids and edge aliases are globally unique across all strands
// (the Rust serializer assigns them from a single global counter),
// so we can pass them straight through to cytoscape without name
// collisions.
//
// Each cap edge is rendered as one cytoscape edge per
// (assignment.source_node, target_node) pair. The common
// single-input cap produces exactly one rendered edge; multi-input
// (fan-in) caps produce one edge per source-arg slot, all sharing
// the cap title and color so they read as a single fan-in.
function buildResolvedMachineGraphData(data) {
  validateResolvedMachinePayload(data);

  const nodes = [];
  const edges = [];
  const seenNodeIds = new Set();
  let edgeCounter = 0;

  data.strands.forEach((strand, strandIdx) => {
    const inputAnchorSet = new Set(strand.input_anchor_nodes);
    const outputAnchorSet = new Set(strand.output_anchor_nodes);

    for (const node of strand.nodes) {
      // Each node id is unique across the whole machine; the
      // Rust side guarantees this via its global counter. If a
      // duplicate appears it indicates a malformed payload, so
      // fail hard rather than silently dropping.
      if (seenNodeIds.has(node.id)) {
        throw new Error(
          `CapFabRenderer machine mode: duplicate node id "${node.id}" in strand ${strandIdx}`
        );
      }
      seenNodeIds.add(node.id);

      const nodeClasses = ['machine-node'];
      if (inputAnchorSet.has(node.id)) nodeClasses.push('strand-source');
      if (outputAnchorSet.has(node.id)) nodeClasses.push('strand-target');

      nodes.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: node.title,
          fullUrn: node.urn,
          strandIndex: strandIdx,
        },
        classes: nodeClasses.join(' '),
      });
    }

    for (const edge of strand.edges) {
      const cardinality = edge.is_loop ? 'n\u21921' : '1\u21921';
      const capUrn = edge.cap_urn;
      const capTitle = edge.title;
      const label = cardinality === '1\u21921'
        ? edge.alias
        : `${edge.alias} (${cardinality})`;

      const color = edge.is_loop
        ? 'var(--graph-loop-color)'
        : edgeHueColor(edgeCounter);
      const baseClasses = edge.is_loop
        ? 'machine-edge machine-loop'
        : 'machine-edge';

      for (const binding of edge.assignment) {
        edges.push({
          group: 'edges',
          data: {
            id: `machine-edge-${edgeCounter}`,
            source: binding.source_node,
            target: edge.target_node,
            label,
            title: `${capTitle} (${binding.cap_arg_media_urn})`,
            fullUrn: capUrn,
            color,
            strandIndex: strandIdx,
            capArgMediaUrn: binding.cap_arg_media_urn,
            isLoop: edge.is_loop,
          },
          classes: baseClasses,
        });
        edgeCounter++;
      }
    }
  });

  return { nodes, edges };
}

function resolvedMachineCytoscapeElements(built) {
  return built.nodes.concat(built.edges);
}

// =============================================================================
// Renderer class.
// =============================================================================

class CapFabRenderer {
  constructor(containerOrId, options) {
    if (options === undefined || options === null) {
      throw new Error('CapFabRenderer: options object is required');
    }
    if (typeof options !== 'object') {
      throw new Error('CapFabRenderer: options must be an object');
    }
    const mode = options.mode;
    if (mode !== 'browse' && mode !== 'strand' && mode !== 'run' && mode !== 'machine' && mode !== 'editor-graph') {
      throw new Error(
        `CapFabRenderer: options.mode must be one of "browse", "strand", "run", "machine", "editor-graph" (got ${JSON.stringify(mode)})`
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
        throw new Error(`CapFabRenderer: container element '${containerOrId}' not found`);
      }
    } else if (containerOrId instanceof Element) {
      container = containerOrId;
    } else {
      throw new Error('CapFabRenderer: first argument must be a container id string or an Element');
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
    this.capFab = null;
    this.capabilitiesByEdgeId = new Map();
    this._mediaTitles = new Map();
    this._pendingFocusCap = null;
    this.pathMode = null;

    // Strand/run state.
    this._strandBuilt = null;
    this._runBuilt = null;

    // Editor-graph state (Monaco machine-notation editor live view).
    this._editorGraphSignature = null;
    this._editorGraphBuilt = null;

    // Resolved-machine state (canonical Machine render payload from
    // Rust `Machine::to_render_payload_json`).
    this._machineBuilt = null;

    // True until the user first interacts with the graph (taps a
    // node/edge, drags, or zooms via wheel). While false, every
    // post-layout refit re-centers the entire graph in the viewport
    // without animation — so the very first paint, plus the 100/300ms
    // post-paint resize ticks (which catch container-size settling in
    // WebKit), all land at a stable centered fit. Flipped to true on
    // the first user gesture so subsequent refits respect selection,
    // path-mode focus, and animate normally.
    this._initialFitDone = false;

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
      throw new Error(`CapFabRenderer: setNavigator is only valid in browse mode (current: ${this.mode})`);
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
      this.capFab = built.capFab;
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
    if (this.mode === 'editor-graph') {
      const signature = editorGraphSignature(data);
      if (signature === this._editorGraphSignature && this.cy) {
        // Same shape — restyle for theme changes and return.
        this.cy.style(buildStylesheet());
        return this;
      }
      this._editorGraphSignature = signature;
      this._editorGraphBuilt = buildEditorGraphData(data);
      return this;
    }
    if (this.mode === 'machine') {
      this._machineBuilt = buildResolvedMachineGraphData(data);
      return this;
    }
    throw new Error(`CapFabRenderer: unreachable mode '${this.mode}'`);
  }

  // Compatibility shim for capdag-dot-com browse callers: `buildFromCapabilities`
  // is an explicit name that reads clearly at call sites like `graph.buildFromCapabilities(registry)`.
  buildFromCapabilities(capabilities) {
    if (this.mode !== 'browse') {
      throw new Error(
        `CapFabRenderer: buildFromCapabilities is only valid in browse mode (current: ${this.mode})`
      );
    }
    return this.setData(capabilities);
  }

  // ===========================================================================
  // Render — creates (or recreates) the cytoscape instance.
  // ===========================================================================

  render() {
    if (!this.container) {
      throw new Error('CapFabRenderer: container is missing');
    }

    const rawElements = this._buildCytoscapeElements();
    if (rawElements.length === 0) {
      this.container.innerHTML = '<div class="cap-fab-empty"><p>No graph data</p></div>';
      return this;
    }

    // Shape every node label up-front (fit-to-content with a 2-line
    // soft cap and trailing ellipsis past that) and measure the
    // longest edge label in pixels. The latter feeds into ELK's
    // between-layer spacing so edges are always long enough for their
    // labels. Both the per-node label width and the per-graph edge
    // label width are recorded on the renderer so the zoom-backstop
    // logic can reason about them after layout-stop.
    const labelMetrics = shapeLabelsInElements(rawElements);
    const elements = labelMetrics.elements;
    this._labelMaxNodeWidthPx = labelMetrics.maxNodeLabelPx;
    this._labelMaxEdgeWidthPx = labelMetrics.maxEdgeLabelPx;

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
            // Per-edge stretch FIRST (mutates node x-coordinates so
            // each edge has the horizontal room its own label needs),
            // THEN lock the cytoscape wheel-zoom limits to the
            // dynamic per-graph values, THEN fit the (possibly
            // stretched) bounding box to the viewport so the user
            // always opens at a fully-visible padded fit. Order
            // matters: `_recomputeZoomLimits` needs the final
            // post-stretch bounding box; `fitToVisibleViewport` needs
            // the relaxed minZoom (it sits above the tight-fit zoom)
            // so its padding actually shows.
            self._stretchLayersForEdgeLabels();
            self._recomputeZoomLimits();
            const hadPendingFocus = !!self._pendingFocusCap;
            if (hadPendingFocus) {
              const pending = self._pendingFocusCap;
              self._pendingFocusCap = null;
              self.highlightCapability(pending);
            }
            // First paint with no preselected focus: snap (no
            // animation) to a centered fit of the full, post-stretch
            // graph. Going through `_centerOnGraphInitial` rather
            // than `refitCurrentSelection` guarantees three things
            // on the bootstrap pass that the selection-aware refit
            // can't:
            //   - never animate, so the user never sees a transient
            //     un-centered state on the way to the final fit;
            //   - always operate on the entire element set, so
            //     per-edge stretching can't push the centered focus
            //     off-viewport;
            //   - reapply on every post-paint resize tick (see
            //     `resizeAndRefit` below) until the user first
            //     interacts, absorbing late WebKit container-size
            //     settling without surprising a user who's already
            //     scrolled or zoomed.
            //
            // If a focus cap WAS pending (browse-mode deep link from
            // capdag-dot-com), defer to the selection-aware refit so
            // the linked element lands centered instead.
            if (hadPendingFocus) {
              self.refitCurrentSelection();
              // Treat the deep-link landing as the user's chosen
              // viewport — late resize ticks shouldn't yank them
              // back to a fit-of-all.
              self._markInitialFitDone();
            } else {
              self._centerOnGraphInitial();
            }
          },
        }
      ),
      style: buildStylesheet(),
      // Initial loose limits — `_recomputeZoomLimits()` tightens them
      // on every layout-stop and resize. We keep an absolute safety
      // floor/ceiling so a degenerate graph (zero bbox) can't make us
      // pass NaN/Infinity to cytoscape.
      minZoom: 0.01,
      maxZoom: 100,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false,
      autounselectify: this.mode === 'editor-graph' || this.mode === 'machine',
    });

    const resizeAndRefit = () => {
      if (!this.cy) return;
      this.cy.resize();
      // Container size may have changed — recompute the zoom limits
      // so "fit the entire graph" still corresponds to actual pixel
      // capacity, not the size we had at first paint.
      this._recomputeZoomLimits();
      // Until the user first interacts with the graph we keep
      // re-centering on every resize tick. WebKit's container
      // dimensions can lag the layout-stop callback by a frame or
      // two (especially in the editor split view, where the graph
      // pane width depends on a CSS grid that's still resolving),
      // and the `setTimeout(_, 100/300)` ticks below are how we
      // catch those late settles without an animation. Once the
      // user has tapped, dragged, or zoomed we explicitly do NOT
      // touch their viewport on these late ticks — the `cy.resize()`
      // and `_recomputeZoomLimits` calls above are enough to keep
      // the engine internally consistent with the new container
      // size; yanking them back to a fit would be a hostile
      // surprise.
      if (!this._initialFitDone) {
        this._centerOnGraphInitial();
      }
    };
    this.cy.on('ready', resizeAndRefit);
    this.cy.on('resize', () => this._recomputeZoomLimits());
    requestAnimationFrame(resizeAndRefit);
    setTimeout(resizeAndRefit, 100);
    setTimeout(resizeAndRefit, 300);

    this._setupEventHandlers();
    this._installZoomBackstop();
    return this;
  }

  // ===========================================================================
  // Zoom backstop — dynamic per-graph minimum and maximum zoom levels.
  //
  // Minimum zoom = the zoom at which the entire graph's bounding box just
  //   fits inside the container. Below that the user is asking for more
  //   blank canvas, which is what the parent scroll view should be doing.
  // Maximum zoom = the zoom at which a representative ("default") node
  //   would occupy more than a quarter of the *bigger* viewport dimension.
  //   Past that the user is zoomed in past the point where any single
  //   node still fits visually, so further wheel events are forwarded
  //   to the parent responder instead of continuing to zoom.
  //
  // The wheel listener reports `{ atLimit, zoomingOut }` to
  // `interaction.onZoomLimit` on every wheel event so the host can
  // latch the direction and forward subsequent wheel events up the
  // responder chain (see `ScrollPassthroughWebView` on the Swift side).
  // ===========================================================================

  // Slack below the strict "graph fits the viewport" zoom that the
  // backstop allows. With the strict zoom (1.0× of fit) the graph
  // touches all four viewport edges; the user expects a little visual
  // padding at the zoomed-out limit, so we let cytoscape zoom out a
  // further `1 - ZOOM_OUT_FIT_SLACK` of fit before forwarding the
  // wheel to the parent responder. Picked to match the padding
  // `fitToVisibleViewport(undefined, 50)` produces on a typical
  // viewport (≈15% slack at 800×600).
  static get ZOOM_OUT_FIT_SLACK() { return 0.15; }

  // Fit padding must scale down in very short viewports. The compact
  // machine-select graph pane is only ~100px tall; a fixed 50px inset
  // leaves no vertical room, so the bootstrap fit degenerates and the
  // graph opens at Cytoscape's fallback zoom instead of a true fit.
  // Keep the requested desktop padding where there is room, but cap it
  // to a small fraction of the actual visible viewport in compact
  // hosts.
  _resolvedFitPadding(requestedPadding, containerWidth, containerHeight, excluded) {
    const requested = Math.max(0, requestedPadding | 0);
    const availableHeight = Math.max(0, containerHeight - excluded);
    const limitingDim = Math.max(0, Math.min(containerWidth, availableHeight));
    if (limitingDim <= 0) return 0;
    const capped = Math.floor(limitingDim * 0.12);
    return Math.max(0, Math.min(requested, capped));
  }

  // Bootstrap fit: snap (no animation) to a centered, padded fit of
  // the entire graph. Used during the first paint and the post-paint
  // resize ticks while `_initialFitDone` is false. The padding here
  // matches `fitToVisibleViewport(undefined, 50)` so the visual
  // result is identical to the steady-state refit, just without the
  // animation and without the selection-aware branching.
  //
  // Math: ELK lays the graph out at an arbitrary pan; we override
  // both zoom and pan in one synchronous pair so the user never sees
  // an intermediate state. We deliberately read the bbox AFTER
  // `_stretchLayersForEdgeLabels` has run (the caller's
  // responsibility) so the centering accounts for the per-edge
  // stretch — without that, a graph whose layers shifted right would
  // appear hugging the right edge of the viewport.
  _centerOnGraphInitial() {
    if (!this.cy) return;
    const cy = this.cy;
    const containerWidth = cy.width();
    const containerHeight = cy.height();
    if (containerWidth <= 0 || containerHeight <= 0) return;
    const elements = cy.elements();
    if (elements.length === 0) return;
    const bb = elements.boundingBox({ includeLabels: true, includeOverlays: false });
    if (bb.w === 0 && bb.h === 0) return;

    const excluded = Math.max(0, this.bottomExcludedRegion() | 0);
    const padding = this._resolvedFitPadding(50, containerWidth, containerHeight, excluded);
    const visibleWidth = containerWidth - padding * 2;
    const visibleHeight = containerHeight - excluded - padding * 2;
    if (visibleWidth <= 0 || visibleHeight <= 0) return;

    const fitZoom = Math.min(visibleWidth / bb.w, visibleHeight / bb.h);
    // Clamp to the dynamic per-graph limits set by
    // `_recomputeZoomLimits` so the centered fit can't exceed them
    // (the relaxed minZoom is `strictFit * (1 - ZOOM_OUT_FIT_SLACK)`,
    // which sits a hair below `fitZoom` for typical viewports — so
    // the clamp is usually a no-op, but we still apply it for
    // tiny-viewport degenerate cases).
    const clampedZoom = Math.min(Math.max(fitZoom, cy.minZoom()), cy.maxZoom());

    const modelCenterX = (bb.x1 + bb.x2) / 2;
    const modelCenterY = (bb.y1 + bb.y2) / 2;
    const screenCenterX = containerWidth / 2;
    const screenCenterY = (containerHeight - excluded) / 2;
    const panX = screenCenterX - modelCenterX * clampedZoom;
    const panY = screenCenterY - modelCenterY * clampedZoom;

    // Stop any in-flight animation before snapping — otherwise a
    // late-arriving `cy.animate` from an earlier path could fight
    // our zoom/pan write and leave the graph drifting.
    cy.stop(true);
    this._internalPanZoom = true;
    cy.zoom(clampedZoom);
    cy.pan({ x: panX, y: panY });
    this._internalPanZoom = false;
  }

  // Mark the bootstrap centering as complete so subsequent refits
  // respect selection state, path-mode focus, and animation.
  // Idempotent — safe to call from every interaction handler.
  _markInitialFitDone() {
    if (this._initialFitDone) return;
    this._initialFitDone = true;
  }

  _recomputeZoomLimits() {
    if (!this.cy) return;
    const w = this.cy.width();
    const h = this.cy.height();
    if (w <= 0 || h <= 0) return;
    // A "default node" is what a typical (single-line, average-width)
    // node looks like in this graph. We use the longest shaped node
    // label width measured during element construction, falling back
    // to a sensible constant when the graph has no labelled nodes
    // (browse-mode title bars, blank slates, etc.).
    const fallbackNodeWidthPx = 120;
    const defaultNodePx = Math.max(
      fallbackNodeWidthPx,
      (this._labelMaxNodeWidthPx || 0) + /* node padding × 2 */ 24
    );
    // Maximum zoom: one default node fills > 1/4 of the bigger
    // viewport dimension. Solving for the boundary:
    //   defaultNodePx * zoomMax = max(w, h) / 4
    const biggerDim = Math.max(w, h);
    const zoomMax = (biggerDim / 4) / defaultNodePx;
    // Minimum zoom: the entire graph's bounding box fits, with a
    // small slack so the user can pull back a bit further for visual
    // padding before the parent-scroll forwarding kicks in. The
    // strict-fit zoom is `min(w/bb.w, h/bb.h)`; we multiply by
    // `(1 - ZOOM_OUT_FIT_SLACK)` to relax it. The initial
    // `fitToVisibleViewport(undefined, 50)` lands at a padded zoom
    // that sits comfortably above this relaxed minimum, so opening
    // the view shows the graph centred with margin rather than
    // bleeding to all four edges.
    const bb = this.cy.elements().boundingBox({ includeLabels: true, includeOverlays: false });
    let zoomMin;
    if (bb.w > 0 && bb.h > 0) {
      const strictFit = Math.min(w / bb.w, h / bb.h);
      zoomMin = strictFit * (1 - CapFabRenderer.ZOOM_OUT_FIT_SLACK);
    } else {
      // Empty / degenerate graph — leave the min loose; there's
      // nothing to fit.
      zoomMin = 0.05;
    }
    // Order-preserving guard: a graph small enough to fit the
    // viewport at any zoom would otherwise produce zoomMin > zoomMax.
    // Pin them together so cytoscape's internal `setZoom` clamp can't
    // throw or oscillate.
    if (zoomMin > zoomMax) zoomMin = zoomMax;
    // Avoid infinitesimal / non-finite values reaching cytoscape.
    if (!Number.isFinite(zoomMin) || zoomMin <= 0) zoomMin = 0.01;
    if (!Number.isFinite(zoomMax) || zoomMax <= 0) zoomMax = 100;
    this._dynamicMinZoom = zoomMin;
    this._dynamicMaxZoom = zoomMax;
    this.cy.minZoom(zoomMin);
    this.cy.maxZoom(zoomMax);
  }

  // ===========================================================================
  // Per-edge layer stretching.
  //
  // ELK's layered algorithm assigns each node to a discrete layer; every
  // edge between layers L and L+1 gets the same horizontal length (the
  // `nodeNodeBetweenLayers` spacing). That means we can size the gap per
  // pair of consecutive layers, but not per individual edge. We do that
  // here, after the layout has run: the source-side x-coordinate of
  // each layer's nodes is shifted right just enough that every incoming
  // edge has room for its own label, plus a small padding allowance.
  // Edges with short labels keep the engine's tight default spacing;
  // edges with long labels push their target layer (and every layer
  // downstream) further to the right.
  //
  // Algorithm:
  //   1. Snap nodes into layer buckets by their post-layout x.
  //   2. Walk the buckets left-to-right.
  //   3. For each edge whose source is in the previous layer and target
  //      in the current one, compute the minimum target-x that would
  //      give the edge label clearance:
  //        srcEdge.x + sourceWidth/2 + targetWidth/2 + labelPx + pad
  //      Take the max across the layer's incoming edges.
  //   4. If that max exceeds the layer's current x, shift every node in
  //      the layer (and only that layer) right by the difference.
  //
  // Cross-layer edges (skipping a layer) are accounted for by the same
  // walk — the per-layer max is computed over every edge that lands in
  // the layer, regardless of how many layers it skipped.
  // ===========================================================================

  _stretchLayersForEdgeLabels() {
    if (!this.cy) return;
    const cy = this.cy;
    const nodes = cy.nodes();
    if (nodes.length === 0) return;

    // Padding around an edge label so its background and the source/
    // target node's right/left edges don't touch. Sized to the
    // stylesheet's `text-background-padding: 4px` plus arrow-head
    // clearance and a few pixels of breathing room.
    const LABEL_GAP_PX = 24;
    // Layer-bucketing tolerance. Nodes within `EPS` of each other on x
    // are treated as one layer. ELK places nodes within a layer at the
    // same x within rounding error.
    const EPS = 1.0;

    // Group nodes into ordered layer buckets by current x.
    const sortedNodes = nodes.toArray().slice().sort(
      (a, b) => a.position('x') - b.position('x')
    );
    const layers = [];
    for (const node of sortedNodes) {
      const x = node.position('x');
      const last = layers.length > 0 ? layers[layers.length - 1] : null;
      if (last !== null && Math.abs(last.x - x) <= EPS) {
        last.nodes.push(node);
      } else {
        layers.push({ x, nodes: [node] });
      }
    }
    if (layers.length < 2) return; // Nothing to stretch.

    // Build a quick layer-index lookup so we can ask "what layer is
    // this node in?" in O(1) when iterating edges.
    const layerIndexById = new Map();
    for (let li = 0; li < layers.length; li++) {
      for (const n of layers[li].nodes) layerIndexById.set(n.id(), li);
    }

    // Pre-bucket edges by their target layer so the per-layer pass
    // below is O(layer-edges) rather than O(all-edges) per layer.
    const incomingByTarget = layers.map(() => []);
    cy.edges().forEach((edge) => {
      const srcLayer = layerIndexById.get(edge.source().id());
      const tgtLayer = layerIndexById.get(edge.target().id());
      if (srcLayer === undefined || tgtLayer === undefined) return;
      if (tgtLayer <= srcLayer) return; // Back-edge or self-loop.
      incomingByTarget[tgtLayer].push(edge);
    });

    // Walk layers left-to-right. For each layer, compute the minimum
    // x its nodes need based on the CURRENT positions of source-layer
    // nodes (which already include any shift from earlier iterations).
    // Only ever shift right — never compress. This way a long-labelled
    // edge between layers k and k+1 stretches only the gap between
    // those two layers, while every later layer shifts right by the
    // same amount as a side-effect (so layer k+2 sits at its own
    // tight default distance from k+1, never inflating the whole
    // graph by the longest single label).
    for (let li = 1; li < layers.length; li++) {
      let minLayerX = layers[li].x;
      for (const edge of incomingByTarget[li]) {
        const labelPx = (typeof edge.data('_labelPx') === 'number')
          ? edge.data('_labelPx')
          : 0;
        const srcNode = edge.source();
        const tgtNode = edge.target();
        // `outerWidth` includes the node's border so the gap sits
        // outside the visible node, not under it.
        const srcHalf = srcNode.outerWidth() / 2;
        const tgtHalf = tgtNode.outerWidth() / 2;
        const srcRightEdge = srcNode.position('x') + srcHalf;
        const candidate = srcRightEdge + LABEL_GAP_PX + labelPx + LABEL_GAP_PX + tgtHalf;
        if (candidate > minLayerX) minLayerX = candidate;
      }
      if (minLayerX > layers[li].x) {
        const dx = minLayerX - layers[li].x;
        for (const node of layers[li].nodes) {
          const p = node.position();
          node.position({ x: p.x + dx, y: p.y });
        }
        layers[li].x += dx;
        // Cascade: every later layer must shift right by at least the
        // same dx so the relative spacing produced by ELK between them
        // is preserved. The per-layer recomputation above will only
        // *add* to that, never subtract.
        for (let lj = li + 1; lj < layers.length; lj++) {
          for (const node of layers[lj].nodes) {
            const p = node.position();
            node.position({ x: p.x + dx, y: p.y });
          }
          layers[lj].x += dx;
        }
      }
    }
  }

  _installZoomBackstop() {
    if (!this.container) return;
    if (this._zoomBackstopInstalled) return;
    this._zoomBackstopInstalled = true;
    const self = this;
    // `passive: true` because we never call preventDefault — we only
    // observe and report. Cytoscape's own wheel listener (registered
    // separately on the same container) does the actual zoom and
    // honours the dynamic min/max we set on `cy`.
    this.container.addEventListener('wheel', function (evt) {
      if (!self.cy) return;
      const min = self._dynamicMinZoom;
      const max = self._dynamicMaxZoom;
      if (typeof min !== 'number' || typeof max !== 'number') return;
      const currentZoom = self.cy.zoom();
      // Tolerances to absorb the tiny rounding cytoscape's own
      // clamping introduces — without them we never report
      // at-limit because the actual zoom sits a few ulps inside.
      const atMin = currentZoom <= min * 1.01;
      const atMax = currentZoom >= max * 0.99;
      const zoomingOut = evt.deltaY > 0;
      const zoomingIn = evt.deltaY < 0;
      const atLimit = (zoomingOut && atMin) || (zoomingIn && atMax);
      if (typeof self.interaction.onZoomLimit === 'function') {
        self.interaction.onZoomLimit({ atLimit, zoomingOut });
      }
    }, { passive: true });
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
    if (this.mode === 'editor-graph') {
      if (!this._editorGraphBuilt) return [];
      return editorGraphCytoscapeElements(this._editorGraphBuilt);
    }
    if (this.mode === 'machine') {
      if (!this._machineBuilt) return [];
      return resolvedMachineCytoscapeElements(this._machineBuilt);
    }
    throw new Error(`CapFabRenderer: unreachable mode '${this.mode}'`);
  }

  // ===========================================================================
  // Event handlers. All modes share mouse handling; browse mode adds the
  // navigator bridge, run mode adds show-more click handling, machine mode
  // fires interaction callbacks with the element's tokenId for editor
  // cross-highlight.
  // ===========================================================================

  _setupEventHandlers() {
    const self = this;

    // First user interaction — tap, zoom, drag — flips
    // `_initialFitDone` so subsequent post-paint resize ticks stop
    // re-centering and let the user keep their viewport. Hooked here
    // (cytoscape-side) for taps and zoom; the wheel-based zoom path
    // also flips it from `_installZoomBackstop`.
    //
    // The zoom/pan listener checks `_internalPanZoom` so that
    // renderer-initiated centering (`_centerOnGraphInitial`,
    // `fitToVisibleViewport`) doesn't trip the flag — only genuine
    // user-initiated viewport changes do.
    this.cy.on('tap', function () { self._markInitialFitDone(); });
    this.cy.on('zoom pan', function () {
      if (!self._internalPanZoom) self._markInitialFitDone();
    });

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
      throw new Error(`CapFabRenderer: highlightCapability is only valid in browse mode (current: ${this.mode})`);
    }
    if (!this.cy || !this._layoutReady) {
      this._pendingFocusCap = cap;
      return;
    }

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
      throw new Error('CapFabRenderer: cap must be an object');
    }
    if (typeof cap.urn !== 'string' || cap.urn.length === 0) {
      throw new Error('CapFabRenderer: cap.urn must be a non-empty string');
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
      throw new Error(`CapFabRenderer: selectEdgeByCapUrn is only valid in browse mode (current: ${this.mode})`);
    }
    if (!this.cy || typeof capUrnString !== 'string' || capUrnString.length === 0) return;
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
  // Editor-graph mode API — used by the notation editor for
  // cross-highlight between source-text spans and graph elements.
  // ===========================================================================

  applyEditorGraphActiveTokenIds(tokenIds) {
    if (this.mode !== 'editor-graph') {
      throw new Error(`CapFabRenderer: applyEditorGraphActiveTokenIds is only valid in editor-graph mode (current: ${this.mode})`);
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
      throw new Error(`CapFabRenderer: enterPathMode is only valid in browse mode (current: ${this.mode})`);
    }
    if (!this.capFab) return;

    const MAX_PATHS = 10;
    let paths = this.capFab.findAllPaths(sourceId, targetId, MAX_PATHS);
    let actualSource = sourceId;
    let actualTarget = targetId;
    if (paths.length === 0) {
      const reverse = this.capFab.findAllPaths(targetId, sourceId, MAX_PATHS);
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
      const idx = this.capFab.edges.indexOf(pathEdge);
      if (idx !== -1) pathEdgeIndices.add(idx);
    }

    this.cy.elements().removeClass('highlighted active faded path-highlighted');
    this.cy.elements().addClass('faded');

    this.cy.nodes().forEach(node => {
      if (pathNodeIds.has(node.id())) node.removeClass('faded').addClass('path-highlighted');
    });
    this.cy.edges().forEach(edge => {
      const cyIdx = edge.data('capFabEdgeIndex');
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

    const bb = eles.boundingBox({ includeLabels: true, includeOverlays: false });
    if (bb.w === 0 && bb.h === 0) return;

    const containerWidth = this.cy.width();
    const containerHeight = this.cy.height();
    const excluded = Math.max(0, this.bottomExcludedRegion() | 0);
    padding = this._resolvedFitPadding(padding, containerWidth, containerHeight, excluded);

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

    // Same `_internalPanZoom` guard as `_centerOnGraphInitial` — a
    // renderer-driven fit (highlight, dbltap, refit-after-resize)
    // must not be mistaken for a user gesture, or the bootstrap
    // re-centering ticks below would stop firing prematurely.
    this._internalPanZoom = true;
    if (animate) {
      this.cy.animate({
        zoom: clampedZoom,
        pan: { x: panX, y: panY },
        duration: 400,
        easing: 'ease-out-cubic',
        complete: () => { this._internalPanZoom = false; },
        stop: () => { this._internalPanZoom = false; },
      });
    } else {
      this.cy.zoom(clampedZoom);
      this.cy.pan({ x: panX, y: panY });
      this._internalPanZoom = false;
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
// Module exports
// =============================================================================

export {
  CapFabRenderer,
  cardinalityLabel,
  cardinalityFromCap,
  canonicalMediaUrn,
  mediaNodeLabel,
  buildBrowseGraphData,
  buildStrandGraphData,
  collapseStrandShapeTransitions,
  buildRunGraphData,
  buildEditorGraphData,
  buildResolvedMachineGraphData,
  classifyStrandCapSteps,
  validateStrandPayload,
  validateRunPayload,
  validateEditorGraphPayload,
  validateResolvedMachinePayload,
  validateStrandStep,
  validateBodyOutcome,
};
