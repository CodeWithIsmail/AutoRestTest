"use client";

import { useMemo, useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/types";

/**
 * The dependency graph as a matrix: a row per consumer, a column per producer,
 * a cell where one depends on the other.
 *
 * This exists because a node-link diagram cannot honestly show this data. The
 * semantic graph is close to complete — a 9-operation API produces 40 edges out
 * of 72 possible pairs — and at that density every drawing is a hairball, no
 * matter how it is laid out. A matrix has no occlusion at all: every
 * relationship gets its own cell, nothing overlaps, and scanning a row answers
 * "what does this need" in one movement.
 */

const KIND_COLOR: Record<GraphEdge["kind"], string> = {
  confirmed: "bg-emerald-500",
  discovered: "bg-emerald-400",
  penalized: "bg-amber-500",
  predicted: "bg-zinc-500",
};

const METHOD_DOT: Record<string, string> = {
  GET: "bg-emerald-500",
  POST: "bg-amber-500",
  PUT: "bg-blue-500",
  PATCH: "bg-purple-500",
  DELETE: "bg-red-500",
};

const CELL = 26;
const LABEL_W = 190;
const HEADER_H = 132;

/** Cell opacity: strong for learned edges, similarity-scaled for guesses. */
function strength(edge: GraphEdge): number {
  if (edge.maxQ !== null) return 0.45 + Math.min(Math.abs(edge.maxQ), 1) * 0.55;
  return 0.3 + (edge.maxSimilarity ?? 0) * 0.4;
}

export interface GraphMatrixProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (edge: GraphEdge | null) => void;
}

export function GraphMatrix({
  nodes,
  edges,
  selectedId,
  onSelectNode,
  onSelectEdge,
}: GraphMatrixProps) {
  const [hover, setHover] = useState<{ row: string; col: string } | null>(null);

  // Order by how connected each operation is, so the busy corner of the matrix
  // gathers in one place rather than scattering across the diagonal.
  const ordered = useMemo(() => {
    const degree = new Map<string, number>();
    nodes.forEach((n) => degree.set(n.id, 0));
    edges.forEach((e) => {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    });
    return [...nodes].sort(
      (a, b) =>
        (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) ||
        a.id.localeCompare(b.id),
    );
  }, [nodes, edges]);

  const byPair = useMemo(() => {
    const map = new Map<string, GraphEdge>();
    edges.forEach((e) => map.set(`${e.to}→${e.from}`, e));
    return map;
  }, [edges]);

  if (ordered.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-zinc-500">
          No operations match the current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="inline-block min-w-full p-4">
        {/* Column headers — rotated so long operation names fit in 26px. */}
        <div className="flex" style={{ paddingLeft: LABEL_W }}>
          {ordered.map((col) => (
            <div
              key={col.id}
              className="flex items-end justify-center"
              style={{ width: CELL, height: HEADER_H }}
            >
              <span
                className={`whitespace-nowrap font-mono text-[10px] transition-colors ${
                  hover?.col === col.id || selectedId === col.id
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                {col.id}
              </span>
            </div>
          ))}
        </div>

        {ordered.map((row) => {
          const rowActive = hover?.row === row.id || selectedId === row.id;
          return (
            <div key={row.id} className="flex items-center">
              <button
                type="button"
                onClick={() =>
                  onSelectNode(selectedId === row.id ? null : row.id)
                }
                className={`flex shrink-0 items-center gap-2 truncate rounded px-2 py-0.5 text-left text-xs transition-colors ${
                  rowActive ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-300"
                } hover:bg-zinc-100 dark:hover:bg-zinc-800/60`}
                style={{ width: LABEL_W, height: CELL }}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    METHOD_DOT[row.method ?? ""] ?? "bg-zinc-600"
                  }`}
                  aria-hidden
                />
                <span className="truncate">{row.id}</span>
              </button>

              {ordered.map((col) => {
                const self = row.id === col.id;
                const edge = byPair.get(`${row.id}→${col.id}`);
                const crosshair =
                  hover && (hover.row === row.id || hover.col === col.id);

                return (
                  <div
                    key={col.id}
                    className="flex items-center justify-center"
                    style={{ width: CELL, height: CELL }}
                    onMouseEnter={() => setHover({ row: row.id, col: col.id })}
                    onMouseLeave={() => setHover(null)}
                  >
                    {self ? (
                      <span
                        className="h-1 w-1 rounded-full bg-zinc-200 dark:bg-zinc-700"
                        aria-hidden
                      />
                    ) : edge ? (
                      <button
                        type="button"
                        title={`${row.id} needs ${col.id}${
                          edge.matches[0]
                            ? ` · ${edge.matches[0].param} ← ${edge.matches[0].producedBy}`
                            : ""
                        }${edge.maxQ !== null ? ` · q ${edge.maxQ.toFixed(2)}` : ""}`}
                        onClick={() => {
                          onSelectEdge(edge);
                          onSelectNode(null);
                        }}
                        className={`h-[18px] w-[18px] rounded-[3px] transition-transform hover:scale-125 ${KIND_COLOR[edge.kind]}`}
                        style={{ opacity: strength(edge) }}
                        aria-label={`${row.id} depends on ${col.id}`}
                      />
                    ) : (
                      <span
                        className={`h-[18px] w-[18px] rounded-[3px] transition-colors ${
                          crosshair ? "bg-zinc-100 dark:bg-zinc-800/80" : "bg-zinc-100 dark:bg-zinc-800/25"
                        }`}
                        aria-hidden
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 pl-2 text-xs text-zinc-500">
          <span>
            Rows <span className="text-zinc-700 dark:text-zinc-300">need</span> · columns{" "}
            <span className="text-zinc-700 dark:text-zinc-300">provide</span>
          </span>
          {hover && hover.row !== hover.col && (
            <span className="font-mono text-zinc-600 dark:text-zinc-400">
              {hover.row} ← {hover.col}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
