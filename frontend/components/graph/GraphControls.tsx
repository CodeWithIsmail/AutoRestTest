"use client";

import { Select } from "@/components/ui/Select";
import type { GraphStats } from "@/lib/types";

/**
 * What to draw. Every edge on the diagram is already a dependency the engine
 * would take — the backend resolves the semantic candidate set down to one
 * producer per parameter — so this filters by how much the agent knows about
 * them, not by how plausible they are.
 */
export type EdgeFilter = "confirmed" | "all";

const FILTER_LABEL: Record<EdgeFilter, string> = {
  confirmed: "Used by the agent",
  all: "All dependencies",
};

export interface GraphControlsProps {
  stats: GraphStats;
  visibleEdges: number;
  filter: EdgeFilter;
  onFilterChange: (value: EdgeFilter) => void;
  hideIsolated: boolean;
  onHideIsolatedChange: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  /** Only meaningful once a run has attached learned weights. */
  hasLearned: boolean;
}

/**
 * One horizontal toolbar rather than a panel beside the canvas. The panel this
 * replaced took a third of the width and still needed its own scrollbar, which
 * left the diagram — the thing being looked at — in a letterbox.
 */
export function GraphControls({
  stats,
  visibleEdges,
  filter,
  onFilterChange,
  hideIsolated,
  onHideIsolatedChange,
  search,
  onSearchChange,
  searchRef,
  hasLearned,
}: GraphControlsProps) {
  const hidden = stats.dependencies - visibleEdges;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        Show
        <Select
          size="sm"
          aria-label="Which dependencies to show"
          value={filter}
          onChange={(v) => onFilterChange(v as EdgeFilter)}
          options={(Object.keys(FILTER_LABEL) as EdgeFilter[]).map((value) => ({
            value,
            label: FILTER_LABEL[value],
            disabled: value === "confirmed" && !hasLearned,
          }))}
        />
      </label>

      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={hideIsolated}
          onChange={(e) => onHideIsolatedChange(e.target.checked)}
          className="accent-emerald-500"
        />
        Hide unconnected
      </label>

      <input
        ref={searchRef}
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search  /"
        aria-label="Search operations"
        className="ml-auto h-8 w-44 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
      />

      <div className="flex w-full items-center gap-2 text-xs text-zinc-500">
        <span>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {stats.operations}
          </span>{" "}
          operations ·{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {visibleEdges}
          </span>{" "}
          of {stats.dependencies} dependencies
        </span>
        {hidden > 0 && filter !== "all" && (
          <button
            type="button"
            onClick={() => onFilterChange("all")}
            className="font-medium text-emerald-600 dark:text-emerald-500 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
          >
            show {hidden} hidden
          </button>
        )}
      </div>
    </div>
  );
}

/** A short dash sample, drawn in SVG so the dash pattern actually shows. */
function Stroke({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg
      width="26"
      height="6"
      viewBox="0 0 26 6"
      aria-hidden
      className="shrink-0"
    >
      <line
        x1="0"
        y1="3"
        x2="26"
        y2="3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={dash}
      />
    </svg>
  );
}

/** Inline legend, sized to sit under the canvas rather than beside it. */
export function GraphLegend({ hasLearned }: { hasLearned: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-zinc-500">
      {hasLearned && (
        <>
          <span className="flex items-center gap-2">
            <Stroke color="#10b981" />
            Confirmed by the agent
          </span>
          <span className="flex items-center gap-2">
            <Stroke color="#f59e0b" />
            Tried and penalized
          </span>
          <span className="flex items-center gap-2">
            <span
              className="w-[26px] text-center text-emerald-600 dark:text-emerald-400"
              aria-hidden
            >
              ✦
            </span>
            Discovered at run time
          </span>
        </>
      )}
      <span className="flex items-center gap-2">
        <Stroke color="#71717a" dash="6 5" />
        Predicted, never used
      </span>
      <span
        className="flex items-center gap-2"
        title="Two operations that each need something the other produces. No left-to-right ordering can satisfy both, so these curve over or under the rest."
      >
        <Stroke color="#71717a" dash="2 4" />
        Cyclic — curves around
      </span>
      <span
        className="ml-auto"
        title="An edge is weighted by the semantic similarity between the parameter and the field that supplies it, until the agent exercises the dependency — from then on the number is the agent's learned confidence."
      >
        Weight: similarity, then learned confidence · arrows run producer →
        consumer
      </span>
    </div>
  );
}
