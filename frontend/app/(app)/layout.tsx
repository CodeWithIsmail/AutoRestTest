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
        <Spinner className="h-6 w-6 text-indigo-600" />
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
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white sm:flex">
        <div className="flex h-14 items-center border-b border-zinc-200 px-5">
          <span className="text-base font-semibold tracking-tight text-zinc-900">
            AutoRestTest
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-zinc-600 hover:bg-zinc-100"
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
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
          <span className="text-sm font-medium text-zinc-500 sm:hidden">
            AutoRestTest
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-zinc-600">{user.username}</span>
            <button
              onClick={onLogout}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
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
