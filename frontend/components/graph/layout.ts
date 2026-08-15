// Graph layout, hand-rolled so the app stays dependency-free (see the note in
// app/(app)/layout.tsx). Pure functions over plain data — no React, no DOM —
// so the awkward parts (cycles, crossings) can be reasoned about and tested on
// their own.
//
// Two layouts, because one does not fit both cases the data produces:
//
//  - **Layered** is the default. Producers sit above consumers, so reading top
//    to bottom is reading execution order. Right when the view is filtered down
//    to what the RL agent confirmed, which is sparse and close to a tree.
//  - **Circular** takes over when everything is shown. A real spec's semantic
//    graph is dense — a 9-operation API already yields 40 edges across 72
//    possible pairs — and a layered drawing of that is a hairball, while a ring
//    with chords across it stays readable.

import type { GraphEdge, GraphNode } from "@/lib/types";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 56;
/** Vertical gap between layers; wide enough for an edge label to sit in. */
const LAYER_GAP = 96;
const NODE_GAP = 28;
const PADDING = 48;

export type LayoutMode = "layered" | "circular";

/** Above this many visible edges, layered stops being readable. */
export const CIRCULAR_THRESHOLD = 120;

export interface PositionedNode {
  node: GraphNode;
  x: number;
  y: number;
}

export interface RoutedEdge {
  edge: GraphEdge;
  /** SVG path `d`. */
  path: string;
  /** Midpoint, for the arrowhead and any marker. */
  midX: number;
  midY: number;
  /** True when the edge runs against the layer order (part of a cycle). */
  back: boolean;
}

export interface Layout {
  nodes: PositionedNode[];
  edges: RoutedEdge[];
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Cycle breaking
// ---------------------------------------------------------------------------

/**
 * Find edges that close a cycle, by depth-first search.
 *
 * Layering only works on a DAG, and this graph is genuinely cyclic —
 * `createUser` needs an id that `getUserById` returns, and `getUserById` needs
 * a name that `createUser` accepts. Rather than drop those edges (they are real
 * dependencies) they are set aside for layering and drawn afterwards as curves,
 * which is also how a reader can tell a cycle is there.
 */
export function findBackEdges(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Set<number> {
  const outgoing = new Map<string, { to: string; index: number }[]>();
  nodes.forEach((n) => outgoing.set(n.id, []));
  edges.forEach((e, index) => outgoing.get(e.from)?.push({ to: e.to, index }));

  const back = new Set<number>();
  const state = new Map<string, 0 | 1 | 2>(); // unvisited | on stack | done

  // Iterative DFS: a deep chain would blow the call stack on a large spec.
  for (const start of nodes) {
    if (state.get(start.id)) continue;
    const stack: { id: string; next: number }[] = [{ id: start.id, next: 0 }];
    state.set(start.id, 1);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbours = outgoing.get(frame.id) ?? [];

      if (frame.next >= neighbours.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }

      const { to, index } = neighbours[frame.next++];
      const seen = state.get(to);
      if (seen === 1) {
        // Points back at something still on the stack: this closes a cycle.
        back.add(index);
      } else if (!seen) {
        state.set(to, 1);
        stack.push({ id: to, next: 0 });
      }
    }
  }
  return back;
}

// ---------------------------------------------------------------------------
// Layered layout
// ---------------------------------------------------------------------------

interface Adjacency {
  producers: Map<string, string[]>;
  consumers: Map<string, string[]>;
  indegree: Map<string, number>;
}

function buildAdjacency(
  nodes: GraphNode[],
  edges: GraphEdge[],
  back: Set<number>,
): Adjacency {
  const producers = new Map<string, string[]>();
  const consumers = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  nodes.forEach((n) => {
    producers.set(n.id, []);
    consumers.set(n.id, []);
    indegree.set(n.id, 0);
  });
  edges.forEach((e, i) => {
    if (back.has(i)) return;
    if (!producers.has(e.to) || !producers.has(e.from)) return;
    producers.get(e.to)!.push(e.from);
    consumers.get(e.from)!.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  });
  return { producers, consumers, indegree };
}

/** Layer = one below the *deepest* producer. The textbook choice. */
function longestPathLayers(nodes: GraphNode[], adj: Adjacency): Map<string, number> {
  const layer = new Map<string, number>();
  const resolving = new Set<string>();
  const depth = (id: string): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    if (resolving.has(id)) return 0; // cycle the back-edge pass missed
    resolving.add(id);
    const ps = adj.producers.get(id) ?? [];
    const value = ps.length ? Math.max(...ps.map((p) => depth(p) + 1)) : 0;
    resolving.delete(id);
    layer.set(id, value);
    return value;
  };
  nodes.forEach((n) => depth(n.id));
  return layer;
}

/**
 * Layer = one below the *shallowest* producer, i.e. BFS distance from an entry
 * point. Reads as "how many operations must run before this one can".
 */
function shortestPathLayers(nodes: GraphNode[], adj: Adjacency): Map<string, number> {
  const layer = new Map<string, number>();
  const queue: string[] = [];
  nodes.forEach((n) => {
    if ((adj.indegree.get(n.id) ?? 0) === 0) {
      layer.set(n.id, 0);
      queue.push(n.id);
    }
  });

  // Every node in a cycle with no acyclic ancestor: seed it so the BFS still
  // reaches the rest of its component instead of leaving it unplaced.
  if (queue.length === 0 && nodes.length > 0) {
    layer.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const next = (layer.get(id) ?? 0) + 1;
    for (const consumer of adj.consumers.get(id) ?? []) {
      if (layer.has(consumer)) continue;
      layer.set(consumer, next);
      queue.push(consumer);
    }
  }

  const deepest = Math.max(0, ...layer.values());
  nodes.forEach((n) => {
    if (!layer.has(n.id)) layer.set(n.id, deepest + 1);
  });
  return layer;
}

/**
 * Choose a layer for every node, then cap how wide any one layer may get.
 *
 * Longest-path layering is the right answer for a sparse graph and a disaster
 * for a dense one: once cycles are broken, a near-complete graph still has a
 * path running through nearly every node, so the depth equals the node count.
 * That is not a cosmetic problem — it renders a 15-operation API as a 2000px
 * vertical line, one node per row. Width-capping cannot rescue it either,
 * because the precedence constraints themselves form a chain.
 *
 * So: use longest-path, and fall back to BFS depth when it degenerates. BFS
 * asks "how far is this from an entry point" rather than "how far from every
 * ancestor", which collapses that chain into a handful of wide layers. Some
 * edges then run sideways within a layer, which is a far smaller price.
 */
function assignLayers(
  nodes: GraphNode[],
  edges: GraphEdge[],
  back: Set<number>,
): Map<string, number> {
  const adj = buildAdjacency(nodes, edges, back);

  let layer = longestPathLayers(nodes, adj);
  const depth = Math.max(0, ...layer.values());
  // A healthy layered drawing is about as deep as the square root of its size.
  // Past that it is turning into a line — measured on the real 9-operation
  // sample API, which longest-path renders as 7 layers of roughly one node.
  if (depth > Math.max(3, 1.3 * Math.sqrt(nodes.length))) {
    layer = shortestPathLayers(nodes, adj);
  }

  // Spill over-full layers downward so one crowded rank does not stretch the
  // canvas sideways. Order within a layer is settled later by the median pass.
  const maxWidth = Math.min(9, Math.max(4, Math.ceil(Math.sqrt(nodes.length * 1.8))));
  const byLayer = new Map<number, string[]>();
  nodes.forEach((n) => {
    const l = layer.get(n.id) ?? 0;
    byLayer.set(l, [...(byLayer.get(l) ?? []), n.id]);
  });

  const balanced = new Map<string, number>();
  let cursor = 0;
  for (const l of [...byLayer.keys()].sort((a, b) => a - b)) {
    const members = byLayer.get(l)!;
    for (let i = 0; i < members.length; i += maxWidth) {
      members.slice(i, i + maxWidth).forEach((id) => balanced.set(id, cursor));
      cursor++;
    }
  }
  return balanced;
}

/**
 * Reduce crossings by repeatedly moving each node to the median position of its
 * neighbours in the adjacent layer — the standard heuristic, and enough here
 * given how few layers a REST API produces.
 */
function orderLayers(
  rows: string[][],
  edges: GraphEdge[],
  back: Set<number>,
): void {
  const live = edges.filter((_, i) => !back.has(i));

  for (let sweep = 0; sweep < 4; sweep++) {
    const downward = sweep % 2 === 0;
    const from = downward ? 1 : rows.length - 2;
    const to = downward ? rows.length : -1;
    const step = downward ? 1 : -1;

    for (let r = from; downward ? r < to : r > to; r += step) {
      const adjacent = rows[r - step];
      const position = new Map(adjacent.map((id, i) => [id, i]));

      const median = (id: string): number => {
        const neighbours = live
          .filter((e) => (downward ? e.to === id : e.from === id))
          .map((e) => position.get(downward ? e.from : e.to))
          .filter((p): p is number => p !== undefined)
          .sort((a, b) => a - b);
        if (neighbours.length === 0) return Number.MAX_SAFE_INTEGER;
        return neighbours[Math.floor(neighbours.length / 2)];
      };

      const keys = new Map(rows[r].map((id) => [id, median(id)]));
      // Stable within equal medians, so nodes without neighbours keep their
      // relative order instead of jittering between sweeps.
      rows[r] = [...rows[r]].sort((a, b) => keys.get(a)! - keys.get(b)!);
    }
  }
}

function layeredPositions(
  nodes: GraphNode[],
  edges: GraphEdge[],
  back: Set<number>,
): PositionedNode[] {
  const layer = assignLayers(nodes, edges, back);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const depth = Math.max(0, ...layer.values());
  const rows: string[][] = Array.from({ length: depth + 1 }, () => []);
  nodes.forEach((n) => rows[layer.get(n.id) ?? 0].push(n.id));

  orderLayers(rows, edges, back);

  const widest = Math.max(1, ...rows.map((r) => r.length));
  const rowWidth = widest * NODE_WIDTH + (widest - 1) * NODE_GAP;

  const positioned: PositionedNode[] = [];
  rows.forEach((row, r) => {
    const span = row.length * NODE_WIDTH + (row.length - 1) * NODE_GAP;
    const offset = PADDING + (rowWidth - span) / 2; // centre each row
    row.forEach((id, i) => {
      positioned.push({
        node: byId.get(id)!,
        x: offset + i * (NODE_WIDTH + NODE_GAP),
        y: PADDING + r * (NODE_HEIGHT + LAYER_GAP),
      });
    });
  });
  return positioned;
}

// ---------------------------------------------------------------------------
// Circular layout
// ---------------------------------------------------------------------------

function circularPositions(
  nodes: GraphNode[],
  edges: GraphEdge[],
): PositionedNode[] {
  // Order by degree so the busiest operations end up adjacent, which keeps
  // their chords short instead of dragging them across the middle.
  const degree = new Map<string, number>();
  nodes.forEach((n) => degree.set(n.id, 0));
  edges.forEach((e) => {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  });
  const ordered = [...nodes].sort(
    (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0),
  );

  // Circumference has to fit every node box plus a gap between them.
  const circumference = ordered.length * (NODE_WIDTH + NODE_GAP);
  const radius = Math.max(220, circumference / (2 * Math.PI));
  const cx = PADDING + radius + NODE_WIDTH / 2;
  const cy = PADDING + radius + NODE_HEIGHT / 2;

  return ordered.map((node, i) => {
    // Start at the top and go clockwise, so reading order matches the eye.
    const angle = (i / ordered.length) * 2 * Math.PI - Math.PI / 2;
    return {
      node,
      x: cx + radius * Math.cos(angle) - NODE_WIDTH / 2,
      y: cy + radius * Math.sin(angle) - NODE_HEIGHT / 2,
    };
  });
}

// ---------------------------------------------------------------------------
// Edge routing
// ---------------------------------------------------------------------------

function routeLayered(
  from: PositionedNode,
  to: PositionedNode,
  back: boolean,
  centreX: number,
): { path: string; midX: number; midY: number } {
  if (back) {
    // A back edge runs against the layer order — the two operations depend on
    // each other, directly or through a chain, so no layering can put both
    // producers above their consumers. Routed out to the side rather than
    // straight up, which would drive it through every row in between.
    //
    // Anchored on the left or right *face* of each box, not the centre: an
    // earlier version started the curve at the node's midpoint, so the line
    // appeared to sprout from inside the box. It bows away from the middle of
    // the drawing so these arcs collect at the margins instead of over the
    // nodes, and the bow stays small — with half the edges in a dense graph
    // being back edges, generous arcs swamp everything else.
    const outward = (from.x + to.x) / 2 >= centreX ? 1 : -1;
    const x1 = outward === 1 ? from.x + NODE_WIDTH : from.x;
    const x2 = outward === 1 ? to.x + NODE_WIDTH : to.x;
    const y1 = from.y + NODE_HEIGHT / 2;
    const y2 = to.y + NODE_HEIGHT / 2;
    const bow = Math.min(150, 36 + Math.abs(y2 - y1) * 0.18);
    const cx1 = x1 + outward * bow;
    const cx2 = x2 + outward * bow;
    return {
      path: `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`,
      midX: (x1 + x2) / 2 + outward * bow * 0.75,
      midY: (y1 + y2) / 2,
    };
  }

  const x1 = from.x + NODE_WIDTH / 2;
  const y1 = from.y + NODE_HEIGHT;
  const x2 = to.x + NODE_WIDTH / 2;
  const y2 = to.y;

  // Vertical control points: the curve leaves the producer downward and enters
  // the consumer downward, so the direction is legible without an arrowhead.
  const dy = Math.max(24, (y2 - y1) / 2);
  return {
    path: `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`,
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
  };
}

function routeCircular(
  from: PositionedNode,
  to: PositionedNode,
  cx: number,
  cy: number,
): { path: string; midX: number; midY: number } {
  const x1 = from.x + NODE_WIDTH / 2;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x + NODE_WIDTH / 2;
  const y2 = to.y + NODE_HEIGHT / 2;
  // Bend each chord toward the centre so parallel chords fan out rather than
  // overlapping into a single dark band.
  const qx = (x1 + x2) / 2 + (cx - (x1 + x2) / 2) * 0.55;
  const qy = (y1 + y2) / 2 + (cy - (y1 + y2) / 2) * 0.55;
  return {
    path: `M ${x1} ${y1} Q ${qx} ${qy}, ${x2} ${y2}`,
    // Quadratic midpoint at t=0.5.
    midX: 0.25 * x1 + 0.5 * qx + 0.25 * x2,
    midY: 0.25 * y1 + 0.5 * qy + 0.25 * y2,
  };
}

// ---------------------------------------------------------------------------

/** Position the nodes and route the edges. Deterministic for a given input. */
export function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  mode: LayoutMode,
): Layout {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const back = mode === "layered" ? findBackEdges(nodes, edges) : new Set<number>();
  const positioned =
    mode === "layered"
      ? layeredPositions(nodes, edges, back)
      : circularPositions(nodes, edges);

  const byId = new Map(positioned.map((p) => [p.node.id, p]));

  const width =
    Math.max(...positioned.map((p) => p.x + NODE_WIDTH)) + PADDING;
  const height =
    Math.max(...positioned.map((p) => p.y + NODE_HEIGHT)) + PADDING;
  const cx = width / 2;
  const cy = height / 2;

  const routed: RoutedEdge[] = [];
  edges.forEach((edge, i) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    // An edge to a filtered-out node has nothing to attach to.
    if (!from || !to || from === to) return;
    const geometry =
      mode === "layered"
        ? routeLayered(from, to, back.has(i), cx)
        : routeCircular(from, to, cx, cy);
    routed.push({ edge, back: back.has(i), ...geometry });
  });

  return { nodes: positioned, edges: routed, width, height };
}

/** Pick a layout that suits the density unless the user has chosen one. */
export function suggestLayout(edgeCount: number): LayoutMode {
  return edgeCount > CIRCULAR_THRESHOLD ? "circular" : "layered";
}
