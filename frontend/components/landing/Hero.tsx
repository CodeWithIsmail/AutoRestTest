import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function Hero() {
  return (
    <section className="px-4 pb-12 pt-16 sm:px-6 sm:pt-24">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          Your API is stateful.
          <br className="hidden sm:block" /> Most API test tools aren&apos;t.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          AutoRestTest reads your OpenAPI spec, works out which endpoints feed
          which, and generates request sequences that get deep into your API —
          instead of a thousand independent calls that all 400 on a missing ID.
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
        <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-500">
          Bring an OpenAPI 3.0 spec — or a zip of your source code. No test
          scripts to write.
        </p>
      </div>
    </section>
  );
}
