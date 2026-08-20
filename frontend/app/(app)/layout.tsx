"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/ui/Avatar";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { Spinner } from "@/components/ui/Spinner";
import { myInvitationsOptions } from "@/lib/queries";
import { useQuery } from "@tanstack/react-query";

// Inline SVGs keep the app dependency-free (no icon library). 20px, 1.6 stroke.
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

/**
 * The application shell.
 *
 * Navigation lives entirely in this one top bar. There is no sidebar: the app
 * has four top-level routes and all the real depth is the tab row inside a
 * project, so a persistent 240px column was spending a lot of chrome on two
 * links. What it did do — switch projects — the switcher below does in one
 * click instead of two, and the reclaimed width goes to the content that wants
 * it (the dependency graph canvas, the request-log and report tables).
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const toast = useToast();

  // Pending invites are the app's only in-app notification, so the count is
  // surfaced in the bar itself rather than only inside the account menu —
  // something you have to open to discover is not a notification.
  const { data: myInvites } = useQuery(myInvitationsOptions());
  const pendingInvites = myInvites?.length ?? 0;

  // Guard: once the initial auth check is done, redirect out if not signed in.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  function onLogout() {
    logout();
    toast.success("You have been signed out.");
    router.replace("/login");
  }

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
      </div>
    );
  }

  // No verification branch here any more: an account cannot exist until its
  // address has been proven, so every user that reaches this shell is verified.
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
        <Link
          href="/projects"
          className="shrink-0 text-base font-semibold tracking-tight text-zinc-900 transition-opacity hover:opacity-80 dark:text-zinc-50"
        >
          Auto<span className="text-emerald-600 dark:text-emerald-500">Rest</span>Test
        </Link>

        <ProjectSwitcher />

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {/* Rendered only when there is something waiting. `findMine` returns
              pending invitations only, so at zero there is genuinely nothing to
              look at — hiding it costs no reachability and no permanent chrome.
              The account menu still carries the link either way. */}
          {pendingInvites > 0 && (
            <Link
              href="/invitations"
              title={`${pendingInvites} pending invitation${pendingInvites === 1 ? "" : "s"}`}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <InvitationsIcon className="h-5 w-5" />
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">
                {pendingInvites}
              </span>
            </Link>
          )}

          <span className="hidden text-sm text-zinc-600 dark:text-zinc-400 sm:inline">
            {user.name?.trim() || user.username}
          </span>

          <ThemeToggle />

          <DropdownMenu
            label="Account menu"
            triggerClassName="p-0.5"
            menuClassName="w-44"
            trigger={<Avatar user={user} title={user.email} />}
            items={[
              {
                label: "Invitations",
                badge: pendingInvites,
                onClick: () => router.push("/invitations"),
              },
              { label: "Settings", onClick: () => router.push("/settings") },
              {
                label: "Sign out",
                separated: true,
                danger: true,
                onClick: onLogout,
              },
            ]}
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
