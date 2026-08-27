"use client";

import { useMemo } from "react";
import type { DependencyGraph } from "@/lib/types";
import { FocusView } from "./FocusView";

/**
 * The dependency graph as the product shows it: a one-line summary, then one
 * operation's own dependencies at a time.
 *
 * There is deliberately no whole-graph drawing. The resolved graph is
 * hub-and-spoke — 49 of the 69 dependencies on the 76-operation sample spec
 * leave a single node — and every layout of it, layered or circular, was a
 * hairball that said nothing. See FocusView for the measurements.
 */
export interface DependencyGraphViewProps {
  graph: DependencyGraph;
  /** Links a node through to its captured requests, on the run view. */
  requestsHref?: (operationId: string) => string | null;
}

export function DependencyGraphView({
  graph,
  requestsHref,
}: DependencyGraphViewProps) {
  const { stats } = graph;
  const hasLearned = stats.confirmed + stats.penalized > 0;

  // Pairs that each need a value the other produces. The one structural fact a
  // single-operation view cannot show from where it stands.
  const cycles = useMemo(() => {
    const pairs = new Set(graph.edges.map((e) => `${e.from}\u0000${e.to}`));
    let count = 0;
    for (const e of graph.edges) {
      if (e.from < e.to && pairs.has(`${e.to}\u0000${e.from}`)) count += 1;
    }
    return count;
  }, [graph.edges]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-500">
        <Stat value={stats.operations} label="operations" />
        {" · "}
        <Stat value={stats.dependencies} label="dependencies" />
        {" · "}
        <Stat value={stats.entryPoints.length} label="entry points" />
        {" · "}
        <Stat value={cycles} label={cycles === 1 ? "cycle" : "cycles"} />
        {graph.source === "run" && (
          <>
            {" · "}
            <Stat value={stats.discovered} label="discovered at run time" />
          </>
        )}
      </p>

      <FocusView
        nodes={graph.nodes}
        edges={graph.edges}
        hasLearned={hasLearned}
        requestsHref={requestsHref}
      />
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <>
      <span className="font-medium text-zinc-700 dark:text-zinc-300">
        {value}
      </span>{" "}
      {label}
    </>
  );
}
