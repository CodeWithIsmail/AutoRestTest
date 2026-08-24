import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/theme-toggle";

export function LandingNav() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800 sm:px-6">
      <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Auto<span className="text-emerald-600 dark:text-emerald-500">Rest</span>Test
      </span>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link href="/login">
          <Button variant="ghost" size="sm">
            Log in
          </Button>
        </Link>
        <Link href="/register">
          <Button variant="primary" size="sm">
            Sign up
          </Button>
        </Link>
      </div>
    </header>
  );
}
