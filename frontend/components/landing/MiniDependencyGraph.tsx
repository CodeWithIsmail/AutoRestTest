// Static illustration for the landing page's product preview — not the real
// interactive graph (see components/graph/GraphCanvas.tsx for that). It mirrors
// that canvas's conventions so the two read as the same thing: node border by
// outcome (emerald 2xx / red server error / dashed neutral never called), the
// method label in its own method colour, and the shared --graph-* tokens.
const EMERALD = "#10b981";
const EMERALD_LIGHT = "#34d399";
const RED = "#ef4444";
const AMBER = "#f59e0b";

type Node = {
  x: number;
  y: number;
  w: number;
  h: number;
  method: string;
  methodColor: string;
  path: string;
  border: string;
};

const NODES: Node[] = [
  { x: 16, y: 140, w: 150, h: 40, method: "POST", methodColor: AMBER, path: "/users", border: EMERALD },
  { x: 208, y: 74, w: 168, h: 40, method: "GET", methodColor: EMERALD, path: "/users/{id}", border: EMERALD },
  { x: 418, y: 140, w: 208, h: 40, method: "POST", methodColor: AMBER, path: "/users/{id}/orders", border: EMERALD },
  { x: 620, y: 216, w: 160, h: 40, method: "GET", methodColor: EMERALD, path: "/orders/{id}", border: RED },
];

// Unconnected on purpose: nothing in the spec produces what it needs, so no
// generated sequence ever reaches it.
const DANGLING = {
  x: 208,
  y: 216,
  w: 150,
  h: 40,
  method: "GET",
  path: "/reports",
};

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
];

export function MiniDependencyGraph() {
  return (
    <svg
      viewBox="0 0 796 280"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="A dependency graph: POST /users feeds GET /users/{id}, which feeds POST /users/{id}/orders, which feeds GET /orders/{id}. A separate GET /reports node is never reached."
    >
      {EDGES.map(([from, to]) => {
        const a = NODES[from];
        const b = NODES[to];
        const ax = a.x + a.w;
        const ay = a.y + a.h / 2;
        const bx = b.x;
        const by = b.y + b.h / 2;
        const midX = (ax + bx) / 2;
        return (
          <path
            key={`${from}-${to}`}
            d={`M${ax},${ay} C${midX},${ay} ${midX},${by} ${bx},${by}`}
            fill="none"
            stroke={EMERALD_LIGHT}
            strokeWidth="1.5"
            strokeOpacity="0.75"
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
            stroke={n.border}
            strokeWidth="1.5"
          />
          <text
            x={n.x + 14}
            y={n.y + n.h / 2}
            dominantBaseline="middle"
            fontSize="11"
            fontFamily="var(--font-geist-mono, monospace)"
          >
            <tspan fontWeight="700" fill={n.methodColor}>
              {n.method}{" "}
            </tspan>
            <tspan fill="var(--graph-text)">{n.path}</tspan>
          </text>
        </g>
      ))}

      {/* Never reached: dashed, dimmed, no edges. */}
      <g opacity="0.5">
        <rect
          x={DANGLING.x}
          y={DANGLING.y}
          width={DANGLING.w}
          height={DANGLING.h}
          rx="9"
          fill="var(--graph-surface)"
          stroke="var(--graph-muted)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <text
          x={DANGLING.x + 14}
          y={DANGLING.y + DANGLING.h / 2}
          dominantBaseline="middle"
          fontSize="11"
          fontFamily="var(--font-geist-mono, monospace)"
          fill="var(--graph-muted)"
        >
          <tspan fontWeight="700">{DANGLING.method} </tspan>
          {DANGLING.path}
        </text>
      </g>
    </svg>
  );
}
