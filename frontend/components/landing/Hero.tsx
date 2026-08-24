import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge, MethodBadge } from "@/components/ui/Badge";

export function Hero() {
  return (
    <section className="px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
      <div className="mx-auto max-w-3xl text-center">
        <Badge tone="emerald">OpenAPI-native</Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          REST API testing that understands how your endpoints depend on each other.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          Upload an OpenAPI spec — or generate one straight from your source code —
          and AutoRestTest builds a semantic dependency graph of your API, then
          drives test generation with multi-agent reinforcement learning to find
          the request sequences that actually exercise your endpoints.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/register">
            <Button variant="primary" size="md">
              Start testing free
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" size="md">
              Log in
            </Button>
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          <MethodBadge method="GET" />
          <MethodBadge method="POST" />
          <MethodBadge method="PUT" />
          <MethodBadge method="PATCH" />
          <MethodBadge method="DELETE" />
        </div>
      </div>
    </section>
  );
}
