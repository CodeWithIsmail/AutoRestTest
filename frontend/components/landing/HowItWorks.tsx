import { Card } from "@/components/ui/Card";

const STEPS = [
  {
    title: "Bring your spec",
    body: "Upload an OpenAPI 3.0 spec, or point AutoRestTest at your source code — the vendored OOPS tool derives one automatically when you don't already have one.",
  },
  {
    title: "Build the dependency graph",
    body: "AutoRestTest parses every operation and builds a semantic dependency graph (SPDG) linking endpoints that depend on each other's data — the order a POST /users has to happen before a GET /users/{id} can succeed.",
  },
  {
    title: "Generate & run requests with MARL",
    body: "A multi-agent reinforcement learning system (Q-learning), backed by LLM-generated request values, explores that graph — sequencing, parameterizing, and firing real requests against your API.",
  },
  {
    title: "Read the results",
    body: "Coverage, status-code distribution, and every server error surface in a report, alongside an interactive view of the dependency graph itself so you can see exactly what got exercised and what didn't.",
  },
];

export function HowItWorks() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          How it works
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Card key={step.title} className="p-5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-400">
                {i + 1}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                {step.body}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
