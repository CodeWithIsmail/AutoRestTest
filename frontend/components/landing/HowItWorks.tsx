import { Card } from "@/components/ui/Card";

const STEPS = [
  {
    title: "Point it at your API",
    body: "Upload an OpenAPI 3.0 spec, or a zip of your source and let AutoRestTest derive one. Set a target URL, a time budget, and any auth headers.",
  },
  {
    title: "It maps the dependencies",
    body: "Every operation is linked to the ones whose responses can fill its parameters — a semantic dependency graph of your API, built from the spec.",
  },
  {
    title: "Agents learn what works",
    body: "Q-learning agents explore that graph while an LLM generates realistic values, learning which sequences and parameters actually get past your validation.",
  },
  {
    title: "You get a report, not a log dump",
    body: "Coverage, pass rate, and status codes per operation — with every server error called out and explained in plain language.",
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
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {step.body}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
