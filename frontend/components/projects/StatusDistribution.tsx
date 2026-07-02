"use client";

// A labeled composition meter for the HTTP status-code distribution.
// Status colouring (good/info/warning/critical) is semantic and always paired
// with a labelled legend, so it is colourblind-safe by construction.

interface ClassInfo {
  key: string;
  label: string;
  bar: string;
  dot: string;
}

const CLASSES: ClassInfo[] = [
  { key: "2", label: "2xx", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  { key: "3", label: "3xx", bar: "bg-blue-500", dot: "bg-blue-500" },
  { key: "4", label: "4xx", bar: "bg-amber-500", dot: "bg-amber-500" },
  { key: "5", label: "5xx", bar: "bg-red-500", dot: "bg-red-500" },
  { key: "x", label: "other", bar: "bg-zinc-500", dot: "bg-zinc-500" },
];

function classOf(code: string): string {
  const c = code.charAt(0);
  return ["2", "3", "4", "5"].includes(c) ? c : "x";
}

export function StatusDistribution({
  distribution,
}: {
  distribution: Record<string, number>;
}) {
  const entries = Object.entries(distribution);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-zinc-500">No status codes were recorded.</p>
    );
  }

  // Aggregate raw codes into status classes.
  const byClass = new Map<string, number>();
  for (const [code, n] of entries) {
    const k = classOf(code);
    byClass.set(k, (byClass.get(k) ?? 0) + n);
  }

  const segments = CLASSES.filter((c) => (byClass.get(c.key) ?? 0) > 0).map(
    (c) => ({ ...c, count: byClass.get(c.key) as number }),
  );

  return (
    <div>
      {/* Composition meter — 2px surface gaps between segments, rounded ends. */}
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`${s.bar} first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${(s.count / total) * 100}%` }}
            title={`${s.label}: ${s.count} (${Math.round((s.count / total) * 100)}%)`}
          />
        ))}
      </div>

      {/* Legend — identity carried by label, not colour alone. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs">
            <span className={`h-2 w-2 rounded-full ${s.dot}`} />
            <span className="text-zinc-400">
              {s.label}
              <span className="ml-1 font-medium text-zinc-200">{s.count}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Exact per-code counts (table view for accessibility). */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {entries
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([code, n]) => (
            <span
              key={code}
              className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-300"
            >
              {code}×{n}
            </span>
          ))}
      </div>
    </div>
  );
}
