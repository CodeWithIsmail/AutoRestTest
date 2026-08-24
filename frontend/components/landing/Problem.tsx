const PROBLEMS = [
  {
    title: "A random ID is always a 404",
    body: "GET /orders/{id} never returns 200 until something created an order first. Tools that treat endpoints independently plateau at shallow coverage, and everything behind a create-then-read wall goes untested.",
  },
  {
    title: "Hand-written sequences rot",
    body: "You can wire the fixtures up yourself, but every new endpoint means working out again which call has to come first — and the wiring breaks the next time the schema moves.",
  },
  {
    title: "Schema-valid isn't semantically valid",
    body: 'A body can satisfy the schema and still be rejected when email is "string" and currency is "aaa". Coverage stalls out on 400s that were never bugs in the first place.',
  },
];

export function Problem() {
  return (
    <section className="border-y border-zinc-200 bg-white px-4 py-16 dark:border-zinc-800 dark:bg-zinc-900/40 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Why endpoint-at-a-time testing stalls
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-600 dark:text-zinc-400">
          Real APIs have order and state. Three things break testing that
          ignores them.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div key={p.title}>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
