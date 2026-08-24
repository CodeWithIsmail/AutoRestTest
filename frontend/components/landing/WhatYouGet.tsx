const ITEMS = [
  {
    title: "Coverage that means something",
    body: "Covered vs. total endpoints, pass rate across every generated test case, and a status-code breakdown per operation — not one number for the whole API.",
  },
  {
    title: "Server errors, isolated",
    body: "5xx responses are flagged separately from 4xx. A 400 is usually the test's fault. A 500 is usually yours, and those are the ones worth your morning.",
  },
  {
    title: "Failures explained in English",
    body: "Every failing endpoint gets a written explanation of what actually went wrong, generated from its real responses — not a stack trace to decode.",
  },
  {
    title: "The dependency graph, interactive",
    body: "Explore the graph in the app, with what the agents learned during the run layered over it, so you can see which paths paid off and which were dead ends.",
  },
  {
    title: "Runs you control",
    body: "Set a time budget, dial fault-injection up or down, pass custom auth headers, and exclude any endpoint you don't want called.",
  },
  {
    title: "Built for a team",
    body: "Projects with roles and invitations, so specs, runs, and reports live somewhere your whole team can read them.",
  },
];

export function WhatYouGet() {
  return (
    <section className="border-y border-zinc-200 bg-white px-4 py-16 dark:border-zinc-800 dark:bg-zinc-900/40 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          What you get back
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item) => (
            <div key={item.title}>
              <h3 className="flex items-baseline gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                <span
                  className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-emerald-500"
                  aria-hidden
                />
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
