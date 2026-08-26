"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/types";
import { computeLayout, NODE_HEIGHT, NODE_WIDTH } from "./layout";

// Hex values mirror the Tailwind classes used elsewhere, because SVG `fill` and
// `stroke` cannot take a class. Same palette as StatusDonut/StatusDistribution.
// The neutral/surface colours instead read the CSS custom properties in
// globals.css, since those are the ones that must flip between light and dark.
const EMERALD = "#10b981";
const BLUE = "#3b82f6";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const EMERALD_LIGHT = "#34d399"; // emerald-400
const PURPLE = "#a855f7";
const ZINC = "#71717a";
const ZINC_500 = "#71717a";
const ZINC_700 = "var(--graph-neutral)";
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

// Predicted edges were zinc-700 at 1px, which on this background is close to
// invisible — the whole graph read as empty. They are the least important thing
// on the diagram but they still have to be *seen*, so the hierarchy is carried
// by opacity and width rather than by fading the colour into the background.
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
  predicted: 0.45,
};

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Widest zoom range that stays useful: a whole large graph, or one node. */
const MIN_SCALE = 0.15;
const MAX_SCALE = 2.5;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Paths are cut from the *front*, not the back. REST paths share long prefixes
 * — half this spec is `/api/vehicle/...` — so trimming the tail renders a dozen
 * distinct operations as the same string. The tail is what identifies them.
 */
function truncatePath(path: string, max: number): string {
  return path.length > max ? `…${path.slice(path.length - max + 1)}` : path;
}

/** Outcome colour for a node's border in run mode. */
function outcomeColor(node: GraphNode): string {
  if (!node.statusCodes) return ZINC_700; // never called
  const codes = Object.keys(node.statusCodes);
  if (node.hasServerErrors || codes.some((c) => c.startsWith("5"))) return RED;
  if (codes.some((c) => c.startsWith("4"))) return AMBER;
  if (codes.some((c) => c.startsWith("2"))) return EMERALD;
  return ZINC_700;
}

function edgeWidth(edge: GraphEdge): number {
  if (edge.kind === "predicted") return 1.25;
  // Thickness carries confidence. Q-values are unbounded in principle but sit
  // near 0-1 in practice, so clamp rather than normalize across the graph —
  // an outlier should not flatten every other edge.
  const magnitude = Math.min(Math.abs(edge.maxQ ?? 0), 1);
  return 2 + magnitude * 2.5;
}

/**
 * Draw the quiet edges first so the meaningful ones sit on top. With a hundred
 * overlapping curves, paint order decides what the eye actually sees.
 */
const PAINT_ORDER: Record<GraphEdge["kind"], number> = {
  predicted: 0,
  penalized: 1,
  confirmed: 2,
  discovered: 3,
};

/**
 * The number drawn on the edge, as in the paper's own figure. It is one
 * quantity with two phases: the semantic similarity the comparator assigned,
 * replaced by the agent's learned confidence once the agent has used the
 * dependency. A discovered edge is prefixed, since it has no similarity phase.
 */
function weightLabel(edge: GraphEdge): string | null {
  if (edge.weight === null) return null;
  const value = edge.weight.toFixed(2);
  return edge.kind === "discovered" ? `✦ ${value}` : value;
}

/** No text measurement available in SVG, so size the pill by character count. */
function labelWidth(text: string): number {
  return 10 + text.length * 6.4;
}

function edgeTitle(edge: GraphEdge, back: boolean): string {
  const parts = [`${edge.from} → ${edge.to}`];
  for (const m of edge.matches) parts.push(`${m.param} ← ${m.producedBy}`);
  parts.push(
    edge.weightKind === "confidence"
      ? `learned confidence ${edge.maxQ?.toFixed(3) ?? "—"}`
      : `similarity ${edge.maxSimilarity?.toFixed(2) ?? "—"}`,
  );
  if (back) parts.push("part of a dependency cycle");
  return parts.join(" · ");
}

export interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (edge: GraphEdge | null) => void;
}

export function GraphCanvas({
  nodes,
  edges,
  selectedId,
  onSelectNode,
  onSelectEdge,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // `null` means "fitted to the drawing" rather than a stale box, so a fit
  // needs no effect and no measurement — it is just the layout's own extent.
  const [view, setView] = useState<ViewBox | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; view: ViewBox } | null>(null);

  const layout = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);

  // Reset the pan/zoom whenever the drawing changes shape. Done during render
  // (React's "adjusting state when props change") rather than in an effect,
  // which would paint the old viewBox over the new layout for one frame first.
  const shapeKey = `${nodes.length}:${edges.length}`;
  const [lastShape, setLastShape] = useState(shapeKey);
  if (shapeKey !== lastShape) {
    setLastShape(shapeKey);
    setView(null);
  }

  const extent: ViewBox = { x: 0, y: 0, w: layout.width, h: layout.height };
  const current = view ?? extent;
  // Weight labels are fixed-size text in user space, so below roughly half
  // scale they overlap into an unreadable smear. Drop them rather than let
  // them destroy the shape of the graph they are annotating.
  const showWeights = current.w > 0 && layout.width / current.w > 0.45;

  const fit = useCallback(() => setView(null), []);

  const zoom = useCallback(
    (factor: number) => {
      setView((prev) => {
        const from = prev ?? { x: 0, y: 0, w: layout.width, h: layout.height };
        if (from.w === 0) return prev;
        const scale = layout.width / from.w;
        const next = Math.min(Math.max(scale * factor, MIN_SCALE), MAX_SCALE);
        const w = layout.width / next;
        const h = (from.h / from.w) * w;
        // Zoom about the centre of what is currently on screen.
        const ax = from.x + from.w / 2;
        const ay = from.y + from.h / 2;
        return { x: ax - w / 2, y: ay - h / 2, w, h };
      });
    },
    [layout.width, layout.height],
  );

  /** Client coordinates -> user-space coordinates inside the current viewBox. */
  const toUserSpace = useCallback(
    (clientX: number, clientY: number, v: ViewBox) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: v.x, y: v.y };
      return {
        x: v.x + ((clientX - rect.left) / rect.width) * v.w,
        y: v.y + ((clientY - rect.top) / rect.height) * v.h,
      };
    },
    [],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Registered natively rather than via onWheel: React attaches wheel
    // listeners as passive, and a passive listener cannot preventDefault, so
    // the page would scroll behind the zoom.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((prev) => {
        const from = prev ?? { x: 0, y: 0, w: layout.width, h: layout.height };
        if (from.w === 0) return prev;
        const point = toUserSpace(e.clientX, e.clientY, from);
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const scale = layout.width / from.w;
        const next = Math.min(Math.max(scale * factor, MIN_SCALE), MAX_SCALE);
        const w = layout.width / next;
        const h = (from.h / from.w) * w;
        // Keep the point under the cursor fixed, so zooming feels anchored
        // rather than always pulling toward the top-left.
        const rx = (point.x - from.x) / from.w;
        const ry = (point.y - from.y) / from.h;
        return { x: point.x - rx * w, y: point.y - ry * h, w, h };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [layout.width, layout.height, toUserSpace]);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    drag.current = { x: e.clientX, y: e.clientY, view: current };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - start.x) / rect.width) * start.view.w;
    const dy = ((e.clientY - start.y) / rect.height) * start.view.h;
    setView({ ...start.view, x: start.view.x - dx, y: start.view.y - dy });
  }

  function endDrag(e: React.PointerEvent<SVGSVGElement>) {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  // One hop from the focused node, in either direction. Everything outside is
  // dimmed — on a dense graph this is what makes a single node readable.
  const focusId = hoverId ?? selectedId;
  const neighbourhood = useMemo(() => {
    if (!focusId) return null;
    const ids = new Set<string>([focusId]);
    edges.forEach((e) => {
      if (e.from === focusId) ids.add(e.to);
      if (e.to === focusId) ids.add(e.from);
    });
    return ids;
  }, [focusId, edges]);

  const dimmed = (id: string) => Boolean(neighbourhood && !neighbourhood.has(id));

  // Sorted once, then walked twice — curves first, then the weight labels over
  // them — so both passes agree on order and on the key each edge gets.
  const painted = useMemo(
    () =>
      [...layout.edges].sort(
        (a, b) => PAINT_ORDER[a.edge.kind] - PAINT_ORDER[b.edge.kind],
      ),
    [layout.edges],
  );

  if (layout.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-zinc-500">
          No operations match the current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        role="img"
        aria-label="API operation dependency graph"
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        viewBox={`${current.x} ${current.y} ${current.w} ${current.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          onSelectNode(null);
          onSelectEdge(null);
        }}
        style={{ backgroundColor: CANVAS }}
      >
        <defs>
          {[
            ["emerald", EMERALD],
            ["amber", AMBER],
            ["zinc", ZINC_700],
          ].map(([name, color]) => (
            <marker
              key={name}
              id={`arrow-${name}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
        </defs>

        <g>
          {painted.map(({ edge, path, back }, i) => {
            const color = EDGE_COLOR[edge.kind];
            const marker =
              edge.kind === "penalized"
                ? "amber"
                : edge.kind === "predicted"
                  ? "zinc"
                  : "emerald";
            const faded = dimmed(edge.from) && dimmed(edge.to);
            // Anything touching the focused node is brought fully forward,
            // which is what makes one operation legible in a dense graph.
            const lit = Boolean(
              focusId && (edge.from === focusId || edge.to === focusId),
            );
            const opacity = faded
              ? 0.07
              : lit
                ? 1
                : EDGE_OPACITY[edge.kind];
            return (
              <g
                key={`${edge.from}-${edge.to}-${i}`}
                opacity={opacity}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEdge(edge);
                  onSelectNode(null);
                }}
              >
                <title>{edgeTitle(edge, back)}</title>
                {/* Invisible fat stroke: a 1px curve is near-impossible to hit. */}
                <path
                  d={path}
                  stroke="transparent"
                  strokeWidth={14}
                  fill="none"
                />
                <path
                  d={path}
                  stroke={color}
                  strokeWidth={lit ? edgeWidth(edge) + 1 : edgeWidth(edge)}
                  strokeLinecap="round"
                  // A back edge is dotted rather than dashed, so a cyclic
                  // dependency is distinguishable from an ordinary predicted
                  // one instead of looking like the same line drawn wrong.
                  strokeDasharray={
                    back
                      ? "2 4"
                      : edge.kind === "predicted"
                        ? "6 5"
                        : undefined
                  }
                  fill="none"
                  markerEnd={`url(#arrow-${marker})`}
                />
              </g>
            );
          })}
        </g>

        {/* Weights are a layer of their own, above every curve. Drawn inside
            each edge's group instead, a later edge's stroke paints straight
            over an earlier edge's pill — which is exactly where curves are
            densest and the number is most needed. */}
        {showWeights && (
          <g>
            {painted.map(({ edge, midX, midY, back }, i) => {
              const label = weightLabel(edge);
              if (label === null) return null;
              const color = EDGE_COLOR[edge.kind];
              const w = labelWidth(label);
              const faded = dimmed(edge.from) && dimmed(edge.to);
              return (
                <g
                  key={`w-${edge.from}-${edge.to}-${i}`}
                  opacity={faded ? 0.07 : 1}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEdge(edge);
                    onSelectNode(null);
                  }}
                >
                  <title>{edgeTitle(edge, back)}</title>
                  <rect
                    x={midX - w / 2}
                    y={midY - 9}
                    width={w}
                    height={18}
                    rx={9}
                    fill={SURFACE}
                    stroke={color}
                    strokeOpacity={0.35}
                    strokeWidth={1}
                  />
                  <text
                    x={midX}
                    y={midY + 4}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill={edge.kind === "predicted" ? MUTED : color}
                    fontFamily="var(--font-geist-mono), monospace"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        <g>
          {layout.nodes.map(({ node, x, y }) => {
            const isSelected = node.id === selectedId;
            const method = node.method ?? "";
            const methodColor = METHOD_COLOR[method] ?? ZINC;
            return (
              <g
                key={node.id}
                transform={`translate(${x}, ${y})`}
                opacity={dimmed(node.id) ? 0.2 : 1}
                className="cursor-pointer"
                onMouseEnter={() => setHoverId(node.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(isSelected ? null : node.id);
                  onSelectEdge(null);
                }}
              >
                <title>
                  {`${method} ${node.path ?? ""}`.trim()}
                  {node.summary ? ` — ${node.summary}` : ""}
                </title>
                {(isSelected || node.id === focusId) && (
                  // A soft halo, so the focused node reads as lifted rather
                  // than merely outlined once the rest of the graph dims.
                  <rect
                    x={-4}
                    y={-4}
                    width={NODE_WIDTH + 8}
                    height={NODE_HEIGHT + 8}
                    rx={13}
                    fill={EMERALD}
                    fillOpacity={0.1}
                  />
                )}
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={10}
                  fill={SURFACE}
                  stroke={
                    isSelected || node.id === focusId
                      ? EMERALD
                      : outcomeColor(node)
                  }
                  strokeWidth={isSelected || node.id === focusId ? 2 : 1.25}
                />
                {/* Method chip */}
                <rect
                  x={9}
                  y={8}
                  width={48}
                  height={16}
                  rx={8}
                  fill={methodColor}
                  fillOpacity={0.15}
                />
                <text
                  x={33}
                  y={20}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill={methodColor}
                  fontFamily="var(--font-geist-mono), monospace"
                >
                  {method}
                </text>
                {/* `METHOD /path` is how the paper labels an operation and how
                    a tester recognizes one; the generated operationId is the
                    join key, so it stays but reads as the secondary line. */}
                <text
                  x={64}
                  y={20}
                  fontSize={10.5}
                  fontWeight={500}
                  fill={TEXT}
                  fontFamily="var(--font-geist-mono), monospace"
                >
                  {truncatePath(node.path ?? "—", 21)}
                </text>
                <text x={10} y={38} fontSize={9.5} fill={MUTED}>
                  {truncate(node.id, 30)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-3 right-3 flex gap-1">
        {[
          { label: "＋", title: "Zoom in", onClick: () => zoom(1.25) },
          { label: "－", title: "Zoom out", onClick: () => zoom(1 / 1.25) },
          { label: "⤢", title: "Fit to view", onClick: fit },
        ].map((btn) => (
          <button
            key={btn.title}
            type="button"
            title={btn.title}
            aria-label={btn.title}
            onClick={btn.onClick}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/90 text-sm text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
