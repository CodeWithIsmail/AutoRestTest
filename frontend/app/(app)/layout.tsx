"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/ui/Spinner";

const NAV = [{ href: "/projects", label: "Projects" }];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const toast = useToast();

  // Guard: once the initial auth check is done, redirect out if not signed in.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-6 w-6 text-emerald-500" />
      </div>
    );
  }

  function onLogout() {
    logout();
    toast.success("You have been signed out.");
    router.replace("/login");
  }

  return (
    <div className="flex flex-1">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 sm:flex">
        <div className="flex h-14 items-center border-b border-zinc-800 px-5">
          <span className="text-base font-semibold tracking-tight text-zinc-50">
            Auto<span className="text-emerald-500">Rest</span>Test
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Workspace
          </p>
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6">
          <span className="text-sm font-semibold text-zinc-100 sm:hidden">
            Auto<span className="text-emerald-500">Rest</span>Test
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-zinc-400">{user.username}</span>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white"
              title={user.email}
            >
              {user.username.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={onLogout}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
