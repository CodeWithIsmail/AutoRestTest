"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { DependencyGraph, GraphEdge } from "@/lib/types";
import { GraphCanvas } from "./GraphCanvas";
import { GraphControls, GraphLegend, type EdgeFilter } from "./GraphControls";
import { GraphInspector } from "./GraphInspector";

/** Kinds a filter setting lets through. */
const ALLOWED: Record<EdgeFilter, GraphEdge["kind"][]> = {
  confirmed: ["confirmed", "penalized", "discovered"],
  all: ["confirmed", "penalized", "discovered", "predicted"],
};

export interface DependencyGraphViewProps {
  graph: DependencyGraph;
  /** Links a node through to its captured requests, on the run view. */
  requestsHref?: (operationId: string) => string | null;
}

export function DependencyGraphView({
  graph,
  requestsHref,
}: DependencyGraphViewProps) {
  const hasLearned = graph.stats.confirmed + graph.stats.penalized > 0;

  // Default to the strongest signal available: what the agent acted on if a
  // run has produced any, otherwise everything the spec resolved to.
  const [filter, setFilter] = useState<EdgeFilter>(
    hasLearned ? "confirmed" : "all",
  );
  const [hideIsolated, setHideIsolated] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const visibleEdges = useMemo(() => {
    const kinds = new Set(ALLOWED[filter]);
    return graph.edges.filter((e) => kinds.has(e.kind));
  }, [graph.edges, filter]);

  const visibleNodes = useMemo(() => {
    if (!hideIsolated) return graph.nodes;
    const connected = new Set<string>();
    visibleEdges.forEach((e) => {
      connected.add(e.from);
      connected.add(e.to);
    });
    return graph.nodes.filter((n) => connected.has(n.id));
  }, [graph.nodes, visibleEdges, hideIsolated]);

  // A selection the filters have just hidden would leave the inspector
  // describing something no longer on screen. Derived rather than cleared in an
  // effect, so there is never a frame showing the stale panel.
  const visibleSelectedId =
    selectedId && visibleNodes.some((n) => n.id === selectedId)
      ? selectedId
      : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedId(null);
        setSelectedEdge(null);
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return visibleNodes.filter(
      (n) =>
        n.id.toLowerCase().includes(term) ||
        (n.path ?? "").toLowerCase().includes(term),
    );
  }, [search, visibleNodes]);

  const inspectorOpen = Boolean(visibleSelectedId || selectedEdge);

  return (
    <div className="flex flex-col gap-4">
      <InsightsStrip graph={graph} />

      <GraphControls
        stats={graph.stats}
        visibleEdges={visibleEdges.length}
        filter={filter}
        onFilterChange={setFilter}
        hideIsolated={hideIsolated}
        onHideIsolatedChange={setHideIsolated}
        search={search}
        onSearchChange={setSearch}
        searchRef={searchRef}
        hasLearned={hasLearned}
      />

      {search.trim() && (
        <Card className="max-h-40 overflow-y-auto p-1">
          {matches.length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-zinc-500">
              No matching operation.
            </p>
          ) : (
            matches.slice(0, 8).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setSelectedId(n.id);
                  setSelectedEdge(null);
                  setSearch("");
                }}
                className="block w-full rounded px-3 py-1.5 text-left text-xs text-zinc-800 dark:text-zinc-200 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {n.id}
                <span className="ml-2 font-mono text-zinc-500">{n.path}</span>
              </button>
            ))
          )}
        </Card>
      )}

      {graph.truncated && (
        <Card className="border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            This spec resolves to more dependencies than the diagram can hold,
            so the weakest were left out. Everything the agent acted on is
            shown.
          </p>
        </Card>
      )}

      {/* Canvas and inspector sit side by side rather than the panel floating
          over the diagram, so opening details never hides what it describes. */}
      <div className="flex flex-col gap-4 lg:flex-row">
        <Card
          className={`h-[38rem] overflow-hidden p-0 ${inspectorOpen ? "lg:flex-1" : "w-full"}`}
        >
          <GraphCanvas
            nodes={visibleNodes}
            edges={visibleEdges}
            selectedId={visibleSelectedId}
            onSelectNode={setSelectedId}
            onSelectEdge={setSelectedEdge}
          />
        </Card>

        {inspectorOpen && (
          <div className="lg:h-[38rem] lg:w-80 lg:shrink-0">
            <GraphInspector
              graph={graph}
              selectedId={visibleSelectedId}
              selectedEdge={selectedEdge}
              onSelectNode={(id) => {
                setSelectedId(id);
                setSelectedEdge(null);
              }}
              onClose={() => {
                setSelectedId(null);
                setSelectedEdge(null);
              }}
              requestsHref={requestsHref}
            />
          </div>
        )}
      </div>

      <GraphLegend hasLearned={hasLearned} />
    </div>
  );
}

/**
 * The reading of the graph that a diagram alone does not give: where a run can
 * start, what everything hinges on, and how much of the semantic search space
 * the engine actually resolved.
 */
function InsightsStrip({ graph }: { graph: DependencyGraph }) {
  const { stats } = graph;
  const items: { label: string; value: string; tone?: string; hint?: string }[] =
    [
      { label: "Entry points", value: String(stats.entryPoints.length) },
      {
        label: "Most depended on",
        value: stats.mostDependedUpon
          ? `${stats.mostDependedUpon.id} (${stats.mostDependedUpon.count})`
          : "—",
      },
      {
        label: "Dependencies",
        value: `${stats.dependencies} of ${stats.candidates}`,
        // The one place the discarded candidates are acknowledged: the semantic
        // pass proposes every plausible producer, and the agent takes one per
        // parameter. Drawing the rest is what made this view unreadable.
        hint: `${stats.candidates} candidate pairs were proposed by semantic matching; ${stats.dependencies} of them resolve to a parameter the engine would actually fill.`,
      },
    ];

  if (graph.source === "run") {
    items.push({
      label: "Discovered at run time",
      value: String(stats.discovered),
      tone:
        stats.discovered > 0
          ? "text-emerald-600 dark:text-emerald-400"
          : undefined,
    });
  } else {
    items.push({
      label: "Operations",
      value: String(stats.operations),
    });
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="p-4" title={item.hint}>
          <p className="text-xs uppercase tracking-wider text-zinc-500">
            {item.label}
          </p>
          <p
            className={`mt-1 truncate text-lg font-semibold ${item.tone ?? "text-zinc-900 dark:text-zinc-100"}`}
            title={item.value}
          >
            {item.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
