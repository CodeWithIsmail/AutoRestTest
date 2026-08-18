"use client";

import { useAuth } from "@/components/auth-provider";
import { DangerZoneCard } from "@/components/settings/DangerZoneCard";
import { NotificationsCard } from "@/components/settings/NotificationsCard";
import { PasswordCard } from "@/components/settings/PasswordCard";
import { ProfileCard } from "@/components/settings/ProfileCard";
import { Spinner } from "@/components/ui/Spinner";

export default function SettingsPage() {
  // The app shell already blocks rendering until auth resolves, so `user` is
  // effectively always present here; the guard is for the redirect frame.
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Account settings</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage your profile, password and notifications.
        </p>
      </div>

      <ProfileCard user={user} />
      <PasswordCard />
      <NotificationsCard user={user} />
      <DangerZoneCard userId={user.id} />
    </div>
  );
}
