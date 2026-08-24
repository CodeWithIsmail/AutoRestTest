import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-zinc-200 px-4 py-8 dark:border-zinc-800 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-sm text-zinc-500 dark:text-zinc-400 sm:flex-row">
        <div className="text-center sm:text-left">
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
            Auto<span className="text-emerald-600 dark:text-emerald-500">Rest</span>Test
          </span>
          <span className="ml-2">AI-powered platform for automated REST API testing</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="hover:text-zinc-700 dark:hover:text-zinc-200">
            Log in
          </Link>
          <Link href="/register" className="hover:text-zinc-700 dark:hover:text-zinc-200">
            Sign up
          </Link>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-600">
        &copy; {new Date().getFullYear()} AutoRestTest
      </p>
    </footer>
  );
}
