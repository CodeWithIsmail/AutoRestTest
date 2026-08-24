# AutoRestTest

**AI-powered automated REST API testing.**

Give AutoRestTest your API's OpenAPI spec — or just upload your source code
and let it write one for you — and it does the rest: it learns how your
endpoints depend on each other, then uses reinforcement-learning agents
backed by an LLM to actually exercise your API. Not random fuzzing — it
chains calls the way a real client would (register, then log in, then use the
ID it just got back), while mutating values to probe edge cases, and reports
back exactly what broke and why.

**🔗 Live app:** https://autoresttest.vercel.app

---

## What it does

- **Generate a spec from your source code.** No OpenAPI spec yet? Upload a
  zip of your API's codebase and AutoRestTest reads it with an LLM pipeline
  and writes one for you. You review the result before it's ever applied to
  your project — nothing is overwritten silently.

- **AI-driven test generation.** A multi-agent reinforcement-learning engine
  explores your API's operations, learning which sequences of calls actually
  work and which parameter values and payloads trigger real bugs — rather
  than firing requests at random.

- **See how your API is connected.** A dependency graph visualizes which
  operations feed into which (e.g. "the ID from `POST /orders` is used by
  `GET /orders/{id}`"), both as a static map derived from the spec and, after
  a run, with the engine's learned confidence values layered on top.

- **Full request/response capture.** Every request the engine sends and
  every response it gets back is recorded, so a failure is fully
  reproducible — not just a status code.

- **Plain-language failure explanations.** An LLM reads a failed
  request/response pair and explains, in plain language, what likely went
  wrong.

- **Built for teams.** Invite teammates to a project with admin, tester, or
  viewer roles, so testing an API doesn't have to be a one-person job.

- **Live-tunable AI settings.** An admin can change which model, provider,
  and rate limits power every AI-driven part of the platform from a settings
  page — no redeploy required.

## Getting started

The fastest way to try it is the live deployment:

1. Open **[autoresttest.vercel.app](https://autoresttest.vercel.app)** and
   register an account.
2. Create a project, then either upload an OpenAPI spec file or generate one
   from your API's source code.
3. Start a test run — give it your API's live base URL and a time budget.
4. Watch results come in: coverage, status codes, server errors, and every
   request the engine made. Open the dependency graph to see how it explored
   your API, and ask for a plain-language explanation of anything that
   failed.

## Developing or self-hosting

Want to run it against your own infrastructure, work on the codebase, or
understand how it's deployed? See:

- **[RUNNING.md](RUNNING.md)** — full local setup, running the platform,
  mock vs. real engine modes, and how the production deployment is built and
  operated.
- **[CLAUDE.md](CLAUDE.md)** — architecture and conventions across every
  part of the monorepo.

---

Research basis: *AutoRestTest* (ICSE 2025) — see `resources/paper/`.
