// Graph layout, hand-rolled so the app stays dependency-free (see the note in
// app/(app)/layout.tsx). Pure functions over plain data — no React, no DOM —
// so the awkward parts (cycles, crossings) can be reasoned about and tested on
// their own.
//
// One layout: layered left to right, producers to the left of their consumers,
// so reading the drawing is reading execution order. There used to be a second
// (a ring) because the graph being drawn was the raw semantic candidate set —
// a 76-operation spec produced 2,589 edges and no arrangement of those is
// legible. The backend now resolves that set down to the dependencies the agent
// actually takes (69 edges for the same spec), which is sparse enough that a
// layered drawing is simply the right answer.

import type { GraphEdge, GraphNode } from "@/lib/types";

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 48;
/** Horizontal gap between layers; wide enough for a weight label to sit in. */
const LAYER_GAP = 120;
const NODE_GAP = 24;
const PADDING = 48;

export interface PositionedNode {
  node: GraphNode;
  x: number;
  y: number;
}

export interface RoutedEdge {
  edge: GraphEdge;
  /** SVG path `d`. */
  path: string;
  /** Midpoint, for the weight label. */
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

/** Layer = one past the *deepest* producer. The textbook choice. */
function longestPathLayers(
  nodes: GraphNode[],
  adj: Adjacency,
): Map<string, number> {
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
 * Layer = one past the *shallowest* producer, i.e. BFS distance from an entry
 * point. Reads as "how many operations must run before this one can".
 */
function shortestPathLayers(
  nodes: GraphNode[],
  adj: Adjacency,
): Map<string, number> {
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
 * Choose a layer for every node.
 *
 * Longest-path layering is the right answer for a sparse graph and a disaster
 * for a dense one: once cycles are broken, a near-complete graph still has a
 * path running through nearly every node, so the depth equals the node count —
 * one node per column, a drawing that is all width and no structure. Resolution
 * makes that unlikely rather than impossible, so the BFS fallback stays: it asks
 * "how far is this from an entry point" rather than "how far from every
 * ancestor", which collapses the chain into a handful of tall columns.
 */
function assignLayers(
  nodes: GraphNode[],
  edges: GraphEdge[],
  back: Set<number>,
): Map<string, number> {
  const adj = buildAdjacency(nodes, edges, back);

  const layer = longestPathLayers(nodes, adj);
  const depth = Math.max(0, ...layer.values());
  // A healthy layered drawing is about as deep as the square root of its size.
  // Past that it is turning into a line.
  if (depth > Math.max(3, 1.3 * Math.sqrt(nodes.length))) {
    return shortestPathLayers(nodes, adj);
  }
  return layer;
}

/**
 * Reduce crossings by repeatedly moving each node to the median position of its
 * neighbours in the adjacent layer — the standard heuristic, and enough here
 * given how few layers a REST API produces.
 */
function orderLayers(
  columns: string[][],
  edges: GraphEdge[],
  back: Set<number>,
): void {
  const live = edges.filter((_, i) => !back.has(i));

  for (let sweep = 0; sweep < 4; sweep++) {
    const forward = sweep % 2 === 0;
    const from = forward ? 1 : columns.length - 2;
    const to = forward ? columns.length : -1;
    const step = forward ? 1 : -1;

    for (let c = from; forward ? c < to : c > to; c += step) {
      const adjacent = columns[c - step];
      const position = new Map(adjacent.map((id, i) => [id, i]));

      const median = (id: string): number => {
        const neighbours = live
          .filter((e) => (forward ? e.to === id : e.from === id))
          .map((e) => position.get(forward ? e.from : e.to))
          .filter((p): p is number => p !== undefined)
          .sort((a, b) => a - b);
        if (neighbours.length === 0) return Number.MAX_SAFE_INTEGER;
        return neighbours[Math.floor(neighbours.length / 2)];
      };

      const keys = new Map(columns[c].map((id) => [id, median(id)]));
      // Stable within equal medians, so nodes without neighbours keep their
      // relative order instead of jittering between sweeps.
      columns[c] = [...columns[c]].sort((a, b) => keys.get(a)! - keys.get(b)!);
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
  const columns: string[][] = Array.from({ length: depth + 1 }, () => []);
  nodes.forEach((n) => columns[layer.get(n.id) ?? 0].push(n.id));

  orderLayers(columns, edges, back);

  // Most REST specs are shallow and wide: a great many operations depend on
  // nothing, or on one thing, so a rank can hold thirty-odd nodes while the
  // whole graph is four ranks deep. Stacked literally that is a tall ribbon in
  // a viewport that is short and wide, and fitting it makes every label
  // unreadable. So an over-full rank is split across adjacent slots instead —
  // the whole rank still sits between the ranks either side of it, so nothing
  // about the precedence reading changes.
  const cap = Math.max(6, Math.ceil(Math.sqrt(nodes.length * 1.2)));
  const slots: string[][] = [];
  for (const column of columns) {
    for (let i = 0; i < column.length; i += cap) {
      slots.push(column.slice(i, i + cap));
    }
    if (column.length === 0) slots.push([]);
  }

  const tallest = Math.max(1, ...slots.map((c) => c.length));
  const columnHeight = tallest * NODE_HEIGHT + (tallest - 1) * NODE_GAP;

  const positioned: PositionedNode[] = [];
  slots.forEach((slot, c) => {
    const span = slot.length * NODE_HEIGHT + (slot.length - 1) * NODE_GAP;
    const offset = PADDING + (columnHeight - span) / 2; // centre each column
    slot.forEach((id, i) => {
      positioned.push({
        node: byId.get(id)!,
        x: PADDING + c * (NODE_WIDTH + LAYER_GAP),
        y: offset + i * (NODE_HEIGHT + NODE_GAP),
      });
    });
  });
  return positioned;
}

// ---------------------------------------------------------------------------
// Edge routing
// ---------------------------------------------------------------------------

function routeEdge(
  from: PositionedNode,
  to: PositionedNode,
  back: boolean,
  centreY: number,
): { path: string; midX: number; midY: number } {
  if (back) {
    // A back edge runs against the layer order — the two operations depend on
    // each other, directly or through a chain, so no layering can put both
    // producers before their consumers. Routed over or under rather than
    // straight back through every column in between.
    //
    // Anchored on the top or bottom *face* of each box, not the centre: a curve
    // starting at the node's midpoint appears to sprout from inside it. It bows
    // away from the middle of the drawing so these arcs collect at the margins
    // instead of over the nodes.
    const outward = (from.y + to.y) / 2 >= centreY ? 1 : -1;
    const y1 = outward === 1 ? from.y + NODE_HEIGHT : from.y;
    const y2 = outward === 1 ? to.y + NODE_HEIGHT : to.y;
    const x1 = from.x + NODE_WIDTH / 2;
    const x2 = to.x + NODE_WIDTH / 2;
    const bow = Math.min(140, 40 + Math.abs(x2 - x1) * 0.18);
    const cy1 = y1 + outward * bow;
    const cy2 = y2 + outward * bow;
    return {
      path: `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`,
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2 + outward * bow * 0.75,
    };
  }

  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;

  // Horizontal control points: the curve leaves the producer rightward and
  // enters the consumer rightward, so the direction is legible even where an
  // arrowhead is hidden under another line.
  const dx = Math.max(24, (x2 - x1) / 2);
  return {
    path: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
  };
}

// ---------------------------------------------------------------------------

/** Position the nodes and route the edges. Deterministic for a given input. */
export function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): Layout {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const back = findBackEdges(nodes, edges);
  const positioned = layeredPositions(nodes, edges, back);
  const byId = new Map(positioned.map((p) => [p.node.id, p]));

  const width = Math.max(...positioned.map((p) => p.x + NODE_WIDTH)) + PADDING;
  const height = Math.max(...positioned.map((p) => p.y + NODE_HEIGHT)) + PADDING;
  const centreY = height / 2;

  const routed: RoutedEdge[] = [];
  edges.forEach((edge, i) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    // An edge to a filtered-out node has nothing to attach to.
    if (!from || !to || from === to) return;
    routed.push({
      edge,
      back: back.has(i),
      ...routeEdge(from, to, back.has(i), centreY),
    });
  });

  return { nodes: positioned, edges: routed, width, height };
}
