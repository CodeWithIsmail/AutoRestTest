import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function FinalCta() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Stop writing test sequences by hand.
        </h2>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Upload a spec and get a coverage report on your API this afternoon.
        </p>
        <div className="mt-7">
          <Link href="/register">
            <Button variant="primary" size="md">
              Start testing free
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
