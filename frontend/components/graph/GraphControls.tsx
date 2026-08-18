"use client";

import { Select } from "@/components/ui/Input";
import type { GraphStats } from "@/lib/types";
import type { LayoutMode } from "./layout";

/**
 * What to draw. The default is deliberately not "everything": a real spec's
 * semantic graph is near-complete, and showing all of it first is showing
 * nothing. Confirmed edges are the ones the RL agent actually stood behind.
 */
export type EdgeFilter = "confirmed" | "likely" | "all";

export type ViewMode = "graph" | "matrix";

const FILTER_LABEL: Record<EdgeFilter, string> = {
  confirmed: "Confirmed only",
  likely: "Confirmed + likely",
  all: "All dependencies",
};

export interface GraphControlsProps {
  stats: GraphStats;
  visibleEdges: number;
  view: ViewMode;
  onViewChange: (value: ViewMode) => void;
  filter: EdgeFilter;
  onFilterChange: (value: EdgeFilter) => void;
  minSimilarity: number;
  onMinSimilarityChange: (value: number) => void;
  hideIsolated: boolean;
  onHideIsolatedChange: (value: boolean) => void;
  layout: LayoutMode;
  onLayoutChange: (value: LayoutMode) => void;
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
  view,
  onViewChange,
  filter,
  onFilterChange,
  minSimilarity,
  onMinSimilarityChange,
  hideIsolated,
  onHideIsolatedChange,
  layout,
  onLayoutChange,
  search,
  onSearchChange,
  searchRef,
  hasLearned,
}: GraphControlsProps) {
  const hidden = stats.dependencies - visibleEdges;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
      <Toggle
        options={[
          { value: "graph", label: "Graph" },
          { value: "matrix", label: "Matrix" },
        ]}
        value={view}
        onChange={onViewChange}
      />

      <div className="h-5 w-px bg-zinc-100 dark:bg-zinc-800" aria-hidden />

      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        Show
        <Select
          aria-label="Which dependencies to show"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value as EdgeFilter)}
        >
          {(Object.keys(FILTER_LABEL) as EdgeFilter[]).map((value) => (
            <option
              key={value}
              value={value}
              disabled={value === "confirmed" && !hasLearned}
            >
              {FILTER_LABEL[value]}
            </option>
          ))}
        </Select>
      </label>

      {filter !== "all" && (
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          Similarity ≥
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={minSimilarity}
            onChange={(e) => onMinSimilarityChange(Number(e.target.value))}
            aria-label="Minimum similarity"
            className="w-24 accent-emerald-500"
          />
          <span className="w-8 font-mono text-zinc-700 dark:text-zinc-300">
            {minSimilarity.toFixed(2)}
          </span>
        </label>
      )}

      {view === "graph" && (
        <Toggle
          options={[
            { value: "layered", label: "Layered" },
            { value: "circular", label: "Circular" },
          ]}
          value={layout}
          onChange={onLayoutChange}
        />
      )}

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
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{stats.operations}</span>{" "}
          operations ·{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{visibleEdges}</span> of{" "}
          {stats.dependencies} dependencies
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

function Toggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md bg-white dark:bg-zinc-950 p-0.5" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            value === option.value
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A short dash sample, drawn in SVG so the dash pattern actually shows. */
function Stroke({
  color,
  dash,
}: {
  color: string;
  dash?: string;
}) {
  return (
    <svg width="26" height="6" viewBox="0 0 26 6" aria-hidden className="shrink-0">
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
export function GraphLegend({
  hasLearned,
  showCycles,
}: {
  hasLearned: boolean;
  showCycles: boolean;
}) {
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
            <span className="w-[26px] text-center text-emerald-600 dark:text-emerald-400" aria-hidden>
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
      {showCycles && (
        <span
          className="flex items-center gap-2"
          title="Two operations that each need something the other produces. No top-to-bottom ordering can satisfy both, so these are routed around the side."
        >
          <Stroke color="#71717a" dash="2 4" />
          Cyclic — curves out to the side
        </span>
      )}
      <span className="ml-auto">
        Arrows point from producer to consumer · click anything for detail
      </span>
    </div>
  );
}
