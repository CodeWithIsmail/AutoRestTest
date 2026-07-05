"use client";

// An SVG donut for the HTTP status-code distribution, aggregated into status
// classes. Colours are the reserved status palette (good/info/warning/critical)
// shared with StatusDistribution's meter, and identity is always carried by the
// labelled legend — never colour alone — so it is colourblind-safe.

interface ClassInfo {
  key: string;
  label: string;
  hex: string;
  dot: string;
}

// Hex values mirror the Tailwind classes used in StatusDistribution:
// emerald-500 / blue-500 / amber-500 / red-500 / zinc-500.
const CLASSES: ClassInfo[] = [
  { key: "2", label: "2xx", hex: "#10b981", dot: "bg-emerald-500" },
  { key: "3", label: "3xx", hex: "#3b82f6", dot: "bg-blue-500" },
  { key: "4", label: "4xx", hex: "#f59e0b", dot: "bg-amber-500" },
  { key: "5", label: "5xx", hex: "#ef4444", dot: "bg-red-500" },
  { key: "x", label: "other", hex: "#71717a", dot: "bg-zinc-500" },
];

function classOf(code: string): string {
  const c = code.charAt(0);
  return ["2", "3", "4", "5"].includes(c) ? c : "x";
}

const SIZE = 168;
const STROKE = 24;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const GAP = 3; // px surface gap between segments

export function StatusDonut({
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

  const byClass = new Map<string, number>();
  for (const [code, n] of entries) {
    const k = classOf(code);
    byClass.set(k, (byClass.get(k) ?? 0) + n);
  }

  const segments = CLASSES.filter((c) => (byClass.get(c.key) ?? 0) > 0).map(
    (c) => ({ ...c, count: byClass.get(c.key) as number }),
  );

  // Compute each arc as a rotation + dash length. A single 100% segment gets no
  // gap (a clean full ring); otherwise every segment loses GAP px to a spacer.
  // Rotation is a prefix sum of preceding fractions (no mutation during render).
  const single = segments.length === 1;
  const arcs = segments.map((s, i) => {
    const frac = s.count / total;
    const startFrac = segments
      .slice(0, i)
      .reduce((sum, x) => sum + x.count / total, 0);
    const dash = frac * C;
    const visible = single ? dash : Math.max(dash - GAP, 0.5);
    return {
      ...s,
      rotation: startFrac * 360,
      visible,
      pct: Math.round(frac * 100),
    };
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label="Status-code distribution donut chart"
        >
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((a) => (
              <circle
                key={a.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={a.hex}
                strokeWidth={STROKE}
                strokeDasharray={`${a.visible} ${C - a.visible}`}
                transform={`rotate(${a.rotation} ${SIZE / 2} ${SIZE / 2})`}
              >
                <title>{`${a.label}: ${a.count} (${a.pct}%)`}</title>
              </circle>
            ))}
          </g>
        </svg>
        {/* Center hero number — total requests */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-zinc-50">
            {total.toLocaleString()}
          </span>
          <span className="text-xs text-zinc-500">requests</span>
        </div>
      </div>

      {/* Legend — identity carried by label, not colour alone. */}
      <ul className="flex w-full flex-col gap-2">
        {arcs.map((a) => (
          <li key={a.key} className="flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.dot}`} />
            <span className="text-zinc-400">{a.label}</span>
            <span className="ml-auto font-medium text-zinc-200">
              {a.count.toLocaleString()}
            </span>
            <span className="w-10 text-right text-xs text-zinc-500">
              {a.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
