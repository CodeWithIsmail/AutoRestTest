import { Card } from "@/components/ui/Card";
import { Badge, type Tone } from "@/components/ui/Badge";

const FEATURES: { tone: Tone; title: string; body: string }[] = [
  {
    tone: "emerald",
    title: "Two ways in",
    body: "Upload a raw OpenAPI spec, or let OOPS generate one straight from a codebase that doesn't have one yet.",
  },
  {
    tone: "blue",
    title: "Semantic dependency graph",
    body: "Not just an endpoint list — a graph of operation relationships (SPDG), visualized interactively in the app.",
  },
  {
    tone: "amber",
    title: "MARL / Q-learning generation",
    body: "Multi-agent reinforcement learning plus LLM-backed value generation drives which requests get sent, instead of static fuzzing.",
  },
  {
    tone: "purple",
    title: "Reporting",
    body: "Coverage, status-code distribution, server-error surfacing, and full request/response logs for every call.",
  },
];

export function Features() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="p-5">
              <Badge tone={feature.tone}>{feature.title}</Badge>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                {feature.body}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
