"use client";

import { Select } from "@/components/ui/Input";

/** Outcome classes a per-endpoint result can be narrowed to. */
export type OutcomeFilter = "all" | "successful" | "client" | "server";

const OUTCOMES: { value: OutcomeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "successful", label: "Successful" },
  { value: "client", label: "Client error" },
  { value: "server", label: "Server error" },
];

interface EndpointFilterBarProps {
  query: string;
  onQuery: (value: string) => void;
  outcome: OutcomeFilter;
  onOutcome: (value: OutcomeFilter) => void;
  code: string;
  onCode: (value: string) => void;
  /** Status codes this run actually produced, already sorted. */
  codes: string[];
  shown: number;
  total: number;
  /** Drives the count line. Passed in rather than inferred from
   *  `shown !== total` so a filter that happens to match every row still
   *  confirms itself instead of looking like it did nothing. */
  active: boolean;
}

/**
 * Filter controls for the per-endpoint results table — the SRS asks for
 * filtering by endpoint, response status, and HTTP response code, which map
 * onto the search box, the outcome chips, and the code dropdown respectively.
 *
 * Presentational only: the owning page holds the state and does the filtering,
 * so the table and the "showing N of M" count can never drift apart.
 */
export function EndpointFilterBar({
  query,
  onQuery,
  outcome,
  onOutcome,
  code,
  onCode,
  codes,
  shown,
  total,
  active,
}: EndpointFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-zinc-800 px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Filter by method or path…"
          aria-label="Filter endpoints by method or path"
          className="h-8 w-56 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />

        {/* Outcome chips — styling matches the status filters on the captured
            requests page so the two filter bars read as one control. */}
        <div className="flex flex-wrap gap-1">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onOutcome(o.value)}
              aria-pressed={outcome === o.value}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                outcome === o.value
                  ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {codes.length > 0 && (
          <Select
            value={code}
            onChange={(e) => onCode(e.target.value)}
            aria-label="Filter endpoints by HTTP response code"
          >
            <option value="">Any code</option>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
      </div>

      {active && (
        <p className="text-xs text-zinc-500">
          Showing {shown} of {total} endpoints
        </p>
      )}
    </div>
  );
}
