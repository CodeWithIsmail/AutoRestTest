"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { GraphEdge, GraphNode } from "@/lib/types";

/*
 * The dependency graph, one operation at a time.
 *
 * Drawn whole, the resolved graph is hub-and-spoke: dozens of operations need
 * the same identifier and one producer supplies it, so on the 76-operation
 * sample spec 49 of the 69 dependencies leave a single node. No layout makes
 * that legible, and nothing about it is redundant — every spoke is a real
 * dependency. What *is* legible is one operation's own neighbourhood: measured
 * across five real specs the median operation has 1-3 neighbours and the 90th
 * percentile has 2-10.
 *
 * So the drawing is bounded by one node's degree rather than by the size of the
 * spec, and a 500-operation API renders exactly like a 10-operation one.
 */

// SVG `fill`/`stroke` cannot take a Tailwind class, so these hex values mirror
// the classes used elsewhere. The neutral/surface colours read the CSS custom
// properties in globals.css, since those must flip between light and dark.
const EMERALD = "#10b981";
const BLUE = "#3b82f6";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const EMERALD_LIGHT = "#34d399";
const PURPLE = "#a855f7";
const ZINC_500 = "#71717a";
const NEUTRAL = "var(--graph-neutral)";
const SURFACE = "var(--graph-surface)";
const CANVAS = "var(--graph-canvas)";
const TEXT = "var(--graph-text)";
const MUTED = "var(--graph-muted)";

/** Matches `methodTone` in components/ui/Badge.tsx. */
const METHOD_COLOR: Record<string, string> = {
  GET: EMERALD,
  POST: AMBER,
  PUT: BLUE,
  PATCH: PURPLE,
  DELETE: RED,
};

const EDGE_COLOR: Record<GraphEdge["kind"], string> = {
  confirmed: EMERALD,
  discovered: EMERALD_LIGHT,
  penalized: AMBER,
  predicted: ZINC_500,
};

const EDGE_OPACITY: Record<GraphEdge["kind"], number> = {
  confirmed: 0.95,
  discovered: 1,
  penalized: 0.9,
  predicted: 0.5,
};

const NODE_W = 232;
const NODE_H = 54;
const COL_GAP = 132;
const ROW_GAP = 18;
const PAD = 16;

/**
 * How many neighbours to draw before folding the rest into a "+N more" row.
 * A hub's fan-out is a fact worth *stating*; drawing all fifty spokes is what
 * this view exists to avoid.
 */
const MAX_SIDE = 8;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Paths are cut from the *front*, not the back. REST paths share long prefixes
 * — half a spec is `/api/vehicle/...` — so trimming the tail renders a dozen
 * distinct operations as the same string. The tail is what identifies them.
 */
function truncatePath(path: string, max: number): string {
  return path.length > max ? `…${path.slice(path.length - max + 1)}` : path;
}

/** Outcome colour for a node's border on the run view. */
function outcomeColor(node: GraphNode): string {
  if (!node.statusCodes) return NEUTRAL; // never called
  const codes = Object.keys(node.statusCodes);
  if (node.hasServerErrors || codes.some((c) => c.startsWith("5"))) return RED;
  if (codes.some((c) => c.startsWith("4"))) return AMBER;
  if (codes.some((c) => c.startsWith("2"))) return EMERALD;
  return NEUTRAL;
}

/**
 * The number on the edge, as in the paper's own figure. It is one quantity with
 * two phases: the semantic similarity the comparator assigned, replaced by the
 * agent's learned confidence once the agent has used the dependency.
 */
function weightLabel(edge: GraphEdge): string | null {
  if (edge.weight === null) return null;
  return edge.weight.toFixed(2);
}

function edgeTitle(edge: GraphEdge): string {
  const parts = [`${edge.from} → ${edge.to}`];
  for (const m of edge.matches) {
    parts.push(`${m.param} ← ${m.producedBy} (${m.producedIn})`);
  }
  parts.push(
    edge.weightKind === "confidence"
      ? `learned confidence ${edge.maxQ?.toFixed(3) ?? "—"}`
      : `similarity ${edge.maxSimilarity?.toFixed(2) ?? "—"}`,
  );
  return parts.join(" · ");
}

interface Neighbour {
  node: GraphNode;
  edge: GraphEdge;
}

interface Side {
  /** Neighbours drawn, strongest first. */
  shown: Neighbour[];
  /** Neighbours folded away behind the "+N more" card. */
  rest: Neighbour[];
}

export interface FocusViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** True once a run has attached learned weights, which colours the edges. */
  hasLearned: boolean;
  /** Present on the run view: links through to that endpoint's requests. */
  requestsHref?: (operationId: string) => string | null;
}

export function FocusView({
  nodes,
  edges,
  hasLearned,
  requestsHref,
}: FocusViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  const byId = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  /** Degree counts for the list, computed once for all operations. */
  const degrees = useMemo(() => {
    const map = new Map<string, { needs: number; gives: number }>();
    for (const n of nodes) map.set(n.id, { needs: 0, gives: 0 });
    for (const e of edges) {
      const to = map.get(e.to);
      if (to) to.needs += 1;
      const from = map.get(e.from);
      if (from) from.gives += 1;
    }
    return map;
  }, [nodes, edges]);

  // Operations that participate in a dependency first, then by how much: sorted
  // alphabetically, every interesting operation is buried.
  const listed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? nodes.filter(
          (n) =>
            n.id.toLowerCase().includes(term) ||
            (n.path ?? "").toLowerCase().includes(term),
        )
      : nodes;
    return [...filtered].sort((a, b) => {
      const da = degrees.get(a.id) ?? { needs: 0, gives: 0 };
      const db = degrees.get(b.id) ?? { needs: 0, gives: 0 };
      const ta = da.needs + da.gives;
      const tb = db.needs + db.gives;
      if (ta !== tb) return tb - ta;
      return a.id.localeCompare(b.id);
    });
  }, [nodes, degrees, search]);

  const focusId = selectedId ?? listed[0]?.id ?? null;
  const focus = focusId ? (byId.get(focusId) ?? null) : null;

  const { needs, provides } = useMemo(() => {
    const empty: Side = { shown: [], rest: [] };
    if (!focus) return { needs: empty, provides: empty };
    const split = (list: Neighbour[]): Side => {
      const sorted = [...list].sort(
        (a, b) => (b.edge.weight ?? 0) - (a.edge.weight ?? 0),
      );
      return expanded
        ? { shown: sorted, rest: [] }
        : { shown: sorted.slice(0, MAX_SIDE), rest: sorted.slice(MAX_SIDE) };
    };
    const inbound: Neighbour[] = [];
    const outbound: Neighbour[] = [];
    for (const e of edges) {
      if (e.to === focus.id) {
        const n = byId.get(e.from);
        if (n) inbound.push({ node: n, edge: e });
      }
      if (e.from === focus.id) {
        const n = byId.get(e.to);
        if (n) outbound.push({ node: n, edge: e });
      }
    }
    return { needs: split(inbound), provides: split(outbound) };
  }, [focus, edges, byId, expanded]);

  const hidden = needs.rest.length + provides.rest.length;
  const href = focus ? (requestsHref?.(focus.id) ?? null) : null;

  function select(id: string) {
    setExpanded(false);
    setSelectedId(id);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Card className="flex h-[34rem] w-full flex-col overflow-hidden p-0 lg:w-72 lg:shrink-0">
        <div className="border-b border-zinc-200 p-2 dark:border-zinc-800">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search operations"
            aria-label="Search operations"
            className="h-8 w-full rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <ul className="flex-1 overflow-y-auto p-1">
          {listed.length === 0 && (
            <li className="px-3 py-2 text-xs text-zinc-500">
              No matching operation.
            </li>
          )}
          {listed.map((n) => {
            const d = degrees.get(n.id) ?? { needs: 0, gives: 0 };
            const active = n.id === focusId;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => select(n.id)}
                  aria-current={active ? "true" : undefined}
                  className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${
                    active
                      ? "bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className="shrink-0 font-mono text-[10px] font-semibold"
                      style={{ color: METHOD_COLOR[n.method ?? ""] ?? MUTED }}
                    >
                      {n.method ?? "—"}
                    </span>
                    <span className="truncate font-mono text-[11px] text-zinc-800 dark:text-zinc-200">
                      {n.path ?? n.id}
                    </span>
                  </span>
                  <span className="mt-1 block text-[10px] text-zinc-500">
                    {d.needs === 0 && d.gives === 0 ? (
                      <span className="text-zinc-400 dark:text-zinc-600">
                        no dependencies
                      </span>
                    ) : (
                      `needs ${d.needs} · gives ${d.gives}`
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="flex h-[34rem] flex-1 flex-col overflow-hidden p-0">
        {focus ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <span
                className="font-mono text-[11px] font-semibold"
                style={{ color: METHOD_COLOR[focus.method ?? ""] ?? MUTED }}
              >
                {focus.method ?? "—"}
              </span>
              <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
                {focus.path ?? focus.id}
              </span>
              {href && (
                <a
                  href={href}
                  className="ml-auto text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400"
                >
                  View captured requests →
                </a>
              )}
            </div>

            <Diagram
              focus={focus}
              needs={needs}
              provides={provides}
              onSelect={select}
            />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
              <span>
                needs {needs.shown.length + needs.rest.length} · gives{" "}
                {provides.shown.length + provides.rest.length}
              </span>
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400"
                >
                  show {hidden} more
                </button>
              )}
              {expanded && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400"
                >
                  collapse
                </button>
              )}
              <span className="ml-auto">
                arrows run producer → consumer · number is{" "}
                {hasLearned
                  ? "similarity, or the agent's learned confidence once used"
                  : "semantic similarity"}
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-10 text-center">
            <p className="text-sm text-zinc-500">
              Select an operation to see what it depends on.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * Three fixed columns — producers, the focused operation, consumers. There is
 * no layout algorithm on purpose: the column assignment is given by the
 * question being asked, so positions are arithmetic and the drawing always fits
 * its box. No pan, no zoom, nothing to get lost in.
 */
function Diagram({
  focus,
  needs,
  provides,
  onSelect,
}: {
  focus: GraphNode;
  needs: Side;
  provides: Side;
  onSelect: (id: string) => void;
}) {
  const leftRows = needs.shown.length + (needs.rest.length > 0 ? 1 : 0);
  const rightRows = provides.shown.length + (provides.rest.length > 0 ? 1 : 0);
  const rows = Math.max(leftRows, rightRows, 1);

  const height = PAD * 2 + rows * NODE_H + (rows - 1) * ROW_GAP;
  const width = PAD * 2 + NODE_W * 3 + COL_GAP * 2;
  const midY = height / 2;
  const colX = [PAD, PAD + NODE_W + COL_GAP, PAD + (NODE_W + COL_GAP) * 2];

  /** Vertically centre a column of `count` rows within the drawing. */
  function rowY(index: number, count: number): number {
    const block = count * NODE_H + (count - 1) * ROW_GAP;
    return midY - block / 2 + index * (NODE_H + ROW_GAP);
  }

  const alone = needs.shown.length === 0 && provides.shown.length === 0;

  return (
    <div className="relative flex-1 overflow-auto" style={{ background: CANVAS }}>
      {alone && (
        <p className="absolute inset-x-0 top-4 z-10 px-4 text-center text-xs text-zinc-500">
          This operation depends on nothing and nothing depends on it — it can be
          called on its own.
        </p>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Direct dependencies of ${focus.id}`}
      >
        <defs>
          {(["confirmed", "discovered", "penalized", "predicted"] as const).map(
            (kind) => (
              <marker
                key={kind}
                id={`fx-arrow-${kind}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLOR[kind]} />
              </marker>
            ),
          )}
        </defs>

        {/* Curves first, then the weight pills as a layer of their own: drawn
            inside each edge's group, a later curve paints over an earlier
            pill. */}
        <g>
          {needs.shown.map((n, i) => (
            <Connector
              key={`in-${n.node.id}-${i}`}
              edge={n.edge}
              x1={colX[0] + NODE_W}
              y1={rowY(i, leftRows) + NODE_H / 2}
              x2={colX[1]}
              y2={midY}
            />
          ))}
          {provides.shown.map((p, i) => (
            <Connector
              key={`out-${p.node.id}-${i}`}
              edge={p.edge}
              x1={colX[1] + NODE_W}
              y1={midY}
              x2={colX[2]}
              y2={rowY(i, rightRows) + NODE_H / 2}
            />
          ))}
        </g>
        <g>
          {needs.shown.map((n, i) => (
            <WeightPill
              key={`inw-${n.node.id}-${i}`}
              edge={n.edge}
              x={(colX[0] + NODE_W + colX[1]) / 2}
              y={(rowY(i, leftRows) + NODE_H / 2 + midY) / 2}
            />
          ))}
          {provides.shown.map((p, i) => (
            <WeightPill
              key={`outw-${p.node.id}-${i}`}
              edge={p.edge}
              x={(colX[1] + NODE_W + colX[2]) / 2}
              y={(midY + rowY(i, rightRows) + NODE_H / 2) / 2}
            />
          ))}
        </g>

        {needs.shown.map((n, i) => (
          <OperationCard
            key={`l-${n.node.id}-${i}`}
            node={n.node}
            x={colX[0]}
            y={rowY(i, leftRows)}
            onSelect={onSelect}
          />
        ))}
        {needs.rest.length > 0 && (
          <MoreCard
            x={colX[0]}
            y={rowY(leftRows - 1, leftRows)}
            count={needs.rest.length}
          />
        )}

        <OperationCard node={focus} x={colX[1]} y={midY - NODE_H / 2} focused />

        {provides.shown.map((p, i) => (
          <OperationCard
            key={`r-${p.node.id}-${i}`}
            node={p.node}
            x={colX[2]}
            y={rowY(i, rightRows)}
            onSelect={onSelect}
          />
        ))}
        {provides.rest.length > 0 && (
          <MoreCard
            x={colX[2]}
            y={rowY(rightRows - 1, rightRows)}
            count={provides.rest.length}
          />
        )}
      </svg>
    </div>
  );
}

/** Producer's right face to the consumer's left face. */
function Connector({
  edge,
  x1,
  y1,
  x2,
  y2,
}: {
  edge: GraphEdge;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  const dx = Math.max(24, (x2 - x1) / 2);
  return (
    <g opacity={EDGE_OPACITY[edge.kind]}>
      <title>{edgeTitle(edge)}</title>
      <path
        d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
        stroke={EDGE_COLOR[edge.kind]}
        strokeWidth={edge.kind === "predicted" ? 1.25 : 2}
        strokeLinecap="round"
        strokeDasharray={edge.kind === "predicted" ? "6 5" : undefined}
        fill="none"
        markerEnd={`url(#fx-arrow-${edge.kind})`}
      />
    </g>
  );
}

function WeightPill({ edge, x, y }: { edge: GraphEdge; x: number; y: number }) {
  const label = weightLabel(edge);
  if (!label) return null;
  // No text measurement in SVG, so size the pill by character count.
  const w = 10 + label.length * 6.4;
  return (
    <g pointerEvents="none">
      <rect
        x={x - w / 2}
        y={y - 10}
        width={w}
        height={20}
        rx={10}
        fill={SURFACE}
        stroke={NEUTRAL}
        strokeWidth={0.75}
      />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fontSize={11}
        fontFamily="ui-monospace, monospace"
        fill={TEXT}
      >
        {label}
      </text>
    </g>
  );
}

function OperationCard({
  node,
  x,
  y,
  focused = false,
  onSelect,
}: {
  node: GraphNode;
  x: number;
  y: number;
  focused?: boolean;
  onSelect?: (id: string) => void;
}) {
  const method = node.method ?? "";
  const color = METHOD_COLOR[method] ?? MUTED;
  return (
    <g
      className={focused ? undefined : "cursor-pointer"}
      onClick={focused ? undefined : () => onSelect?.(node.id)}
    >
      <title>
        {`${method} ${node.path ?? ""}\n${node.id}${node.summary ? `\n${node.summary}` : ""}`}
      </title>
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={9}
        fill={SURFACE}
        stroke={focused ? EMERALD : outcomeColor(node)}
        strokeWidth={focused ? 2 : 1}
      />
      <rect
        x={x + 10}
        y={y + 9}
        width={48}
        height={16}
        rx={4}
        fill={color}
        opacity={0.16}
      />
      <text
        x={x + 34}
        y={y + 21}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={600}
        fontFamily="ui-monospace, monospace"
        fill={color}
      >
        {method || "—"}
      </text>
      <text
        x={x + 66}
        y={y + 22}
        fontSize={11}
        fontFamily="ui-monospace, monospace"
        fill={TEXT}
      >
        {truncatePath(node.path ?? node.id, 22)}
      </text>
      <text x={x + 11} y={y + 42} fontSize={10} fill={MUTED}>
        {truncate(node.id, 34)}
      </text>
    </g>
  );
}

/**
 * A hub's remaining spokes, stated rather than drawn. Fifty arrows out of one
 * node is the fact; fifty lines is what made the whole-graph drawing
 * unreadable.
 */
function MoreCard({ x, y, count }: { x: number; y: number; count: number }) {
  return (
    <g pointerEvents="none">
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={9}
        fill="none"
        stroke={NEUTRAL}
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <text
        x={x + NODE_W / 2}
        y={y + NODE_H / 2 + 4}
        textAnchor="middle"
        fontSize={11}
        fill={MUTED}
      >
        +{count} more
      </text>
    </g>
  );
}
