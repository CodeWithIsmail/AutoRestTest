import { ThemeToggle } from "@/components/theme-toggle";

// Centered card layout for the public auth pages (login / register).
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-1 items-center justify-center px-4 py-12">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Auto<span className="text-emerald-600 dark:text-emerald-500">Rest</span>Test
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            AI-powered REST API testing
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
