"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/ui/Spinner";
import { listMyInvitations } from "@/lib/collaboration";
import { useApi } from "@/lib/useApi";

// Inline SVGs keep the app dependency-free (no icon library). 20px, 1.6 stroke.
function ProjectsIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function InvitationsIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

const NAV = [
  { href: "/projects", label: "Projects", Icon: ProjectsIcon },
  { href: "/invitations", label: "Invitations", Icon: InvitationsIcon },
];

const SIDEBAR_KEY = "art:sidebar-collapsed";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const toast = useToast();
  // Pending-invite count powers the sidebar badge (the invitee's notification).
  const { data: myInvites } = useApi(listMyInvitations, []);
  const pendingInvites = myInvites?.length ?? 0;

  // Sidebar collapse — persisted so it survives navigation/reload. Read lazily
  // from localStorage (guarded for SSR). Safe from hydration mismatch because
  // the sidebar only renders after auth resolves client-side (SSR shows the
  // spinner branch below, not the sidebar).
  const [collapsed, setCollapsed] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem(SIDEBAR_KEY) === "1",
  );
  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  }

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
      {/* Sidebar — collapsible to an icon rail to give the main area more width. */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 transition-[width] duration-200 sm:flex ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div
          className={`flex h-14 items-center border-b border-zinc-800 ${
            collapsed ? "justify-center px-2" : "px-5"
          }`}
        >
          {collapsed ? (
            <span
              className="text-lg font-bold tracking-tight text-zinc-50"
              title="AutoRestTest"
            >
              A<span className="text-emerald-500">R</span>T
            </span>
          ) : (
            <span className="text-base font-semibold tracking-tight text-zinc-50">
              Auto<span className="text-emerald-500">Rest</span>Test
            </span>
          )}
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {!collapsed && (
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Workspace
            </p>
          )}
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const showBadge =
              item.href === "/invitations" && pendingInvites > 0;
            const { Icon } = item;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`relative flex items-center rounded-md text-sm font-medium transition-colors ${
                  collapsed
                    ? "h-10 justify-center"
                    : "justify-between px-3 py-2"
                } ${
                  active
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {collapsed ? (
                  <>
                    <Icon className="h-5 w-5" />
                    {showBadge && (
                      <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-zinc-900" />
                    )}
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-3">
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </span>
                    {showBadge && (
                      <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">
                        {pendingInvites}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>
        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`m-3 flex items-center rounded-md py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 ${
            collapsed ? "justify-center" : "gap-3 px-3"
          }`}
        >
          <ChevronIcon
            className={`h-5 w-5 transition-transform ${
              collapsed ? "rotate-180" : ""
            }`}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
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
