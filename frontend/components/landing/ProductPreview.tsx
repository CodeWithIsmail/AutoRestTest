import { Card } from "@/components/ui/Card";
import { Badge, MethodBadge } from "@/components/ui/Badge";
import { MiniDependencyGraph } from "./MiniDependencyGraph";

const MOCK_ROWS: { method: string; path: string; status: number }[] = [
  { method: "POST", path: "/users", status: 201 },
  { method: "GET", path: "/users/{id}", status: 200 },
  { method: "POST", path: "/users/{id}/orders", status: 200 },
  { method: "GET", path: "/orders/{id}", status: 500 },
];

function statusTone(status: number) {
  if (status >= 500) return "red" as const;
  if (status >= 400) return "amber" as const;
  return "emerald" as const;
}

/** Small caps label used as the header of each mock panel. */
function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {children}
    </span>
  );
}

export function ProductPreview() {
  return (
    <section className="px-4 pb-16 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="flex flex-col overflow-hidden lg:col-span-3">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
              <PanelLabel>Dependency graph</PanelLabel>
              <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                    aria-hidden
                  />
                  passing
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-red-500"
                    aria-hidden
                  />
                  server error
                </span>
                <span className="hidden items-center gap-1.5 sm:flex">
                  <span
                    className="h-1.5 w-1.5 rounded-full border border-dashed border-zinc-400"
                    aria-hidden
                  />
                  never reached
                </span>
              </div>
            </div>
            {/* min-h keeps the graph readable on narrow screens, flex-1 lets it
                take up the slack when the report card next to it is taller. */}
            <div className="min-h-[260px] w-full flex-1 bg-[var(--graph-canvas)] p-2">
              <MiniDependencyGraph />
            </div>
          </Card>

          <Card className="overflow-hidden lg:col-span-2">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
              <PanelLabel>Run report</PanelLabel>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                24 endpoints
              </span>
            </div>
            <div className="p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  87%
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  coverage
                </span>
                <Badge tone="red" className="ml-auto">
                  1 server error
                </Badge>
              </div>
              <div className="mt-4 space-y-2">
                {MOCK_ROWS.map((row) => (
                  <div
                    key={row.method + row.path}
                    className="flex items-center gap-2 text-sm"
                  >
                    <MethodBadge method={row.method} />
                    <span className="flex-1 truncate font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {row.path}
                    </span>
                    <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                  </div>
                ))}
              </div>
              <p className="mt-4 border-t border-zinc-200 pt-3 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  GET /orders/&#123;id&#125;
                </span>{" "}
                returned 500 when called with an order created moments earlier —
                the handler assumes a shipping address that POST /orders
                doesn&apos;t require.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
