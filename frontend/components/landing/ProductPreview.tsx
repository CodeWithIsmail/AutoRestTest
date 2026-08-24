import { Card } from "@/components/ui/Card";
import { Badge, MethodBadge } from "@/components/ui/Badge";
import { MiniDependencyGraph } from "./MiniDependencyGraph";

const MOCK_ROWS: { method: string; path: string; status: number }[] = [
  { method: "POST", path: "/users", status: 201 },
  { method: "GET", path: "/users/{id}", status: 200 },
  { method: "POST", path: "/users/{id}/orders", status: 200 },
  { method: "GET", path: "/orders/{id}", status: 404 },
];

function statusTone(status: number) {
  if (status >= 500) return "red" as const;
  if (status >= 400) return "amber" as const;
  return "emerald" as const;
}

export function ProductPreview() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          See the shape of your API, not just a list of endpoints
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="overflow-hidden p-3 lg:col-span-3">
            <div className="aspect-[788/280] w-full">
              <MiniDependencyGraph />
            </div>
          </Card>
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Run report
              </h3>
              <div className="flex gap-1.5">
                <Badge tone="emerald">2xx 75%</Badge>
                <Badge tone="amber">4xx 25%</Badge>
              </div>
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
          </Card>
        </div>
      </div>
    </section>
  );
}
