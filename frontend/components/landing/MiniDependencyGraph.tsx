// Static illustration for the landing page's product preview — not the real
// interactive graph (see components/graph/GraphCanvas.tsx for that). Reuses
// the same --graph-* tokens and method hex constants as the real canvas so it
// reads as "the same graph" rather than a generic marketing illustration.
const EMERALD = "#10b981";
const EMERALD_LIGHT = "#34d399";
const AMBER = "#f59e0b";
const BLUE = "#3b82f6";

const NODES = [
  { x: 16, y: 140, w: 136, h: 40, method: "POST", methodColor: AMBER, path: "/users" },
  { x: 194, y: 76, w: 154, h: 40, method: "GET", methodColor: EMERALD, path: "/users/{id}" },
  { x: 388, y: 140, w: 194, h: 40, method: "POST", methodColor: AMBER, path: "/users/{id}/orders" },
  { x: 622, y: 76, w: 150, h: 40, method: "GET", methodColor: EMERALD, path: "/orders/{id}" },
];

// Unconnected on purpose — a node the graph builds but no generated request
// sequence has reached yet, drawn dashed/muted to read as "not yet covered".
const DANGLING = { x: 194, y: 220, w: 150, h: 40, method: "GET", methodColor: BLUE, path: "/reports" };

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
];

function center(n: (typeof NODES)[number]) {
  return { x: n.x + n.w, y: n.y + n.h / 2, x0: n.x, x1: n.x + n.w };
}

export function MiniDependencyGraph() {
  return (
    <svg
      viewBox="0 0 788 280"
      className="h-full w-full"
      role="img"
      aria-label="Illustration of a semantic dependency graph linking API endpoints"
    >
      <rect width="788" height="280" rx="16" fill="var(--graph-canvas)" />

      {EDGES.map(([from, to]) => {
        const a = center(NODES[from]);
        const b = center(NODES[to]);
        const midX = (a.x + b.x0) / 2;
        return (
          <path
            key={`${from}-${to}`}
            d={`M${a.x},${a.y} Q${midX},${(a.y + b.y) / 2} ${b.x0},${b.y}`}
            fill="none"
            stroke={EMERALD_LIGHT}
            strokeWidth="1.5"
            strokeOpacity="0.7"
          />
        );
      })}

      {NODES.map((n) => (
        <g key={`${n.method}-${n.path}`}>
          <rect
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            rx="9"
            fill="var(--graph-surface)"
            stroke={n.methodColor}
            strokeWidth="1.5"
          />
          <circle cx={n.x + 16} cy={n.y + n.h / 2} r="4" fill={n.methodColor} />
          <text
            x={n.x + 28}
            y={n.y + n.h / 2}
            dominantBaseline="middle"
            fontSize="11"
            fontFamily="var(--font-geist-mono, monospace)"
          >
            <tspan fontWeight="600" fill={n.methodColor}>
              {n.method}{" "}
            </tspan>
            <tspan fill="var(--graph-text)">{n.path}</tspan>
          </text>
        </g>
      ))}

      {/* Dangling node: dashed stroke, dimmer, no incoming/outgoing edge. */}
      <g opacity="0.55">
        <rect
          x={DANGLING.x}
          y={DANGLING.y}
          width={DANGLING.w}
          height={DANGLING.h}
          rx="9"
          fill="var(--graph-surface)"
          stroke={DANGLING.methodColor}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <circle
          cx={DANGLING.x + 16}
          cy={DANGLING.y + DANGLING.h / 2}
          r="4"
          fill={DANGLING.methodColor}
        />
        <text
          x={DANGLING.x + 28}
          y={DANGLING.y + DANGLING.h / 2}
          dominantBaseline="middle"
          fontSize="11"
          fontFamily="var(--font-geist-mono, monospace)"
          fill="var(--graph-muted)"
        >
          <tspan fontWeight="600">{DANGLING.method} </tspan>
          {DANGLING.path}
        </text>
      </g>
    </svg>
  );
}
