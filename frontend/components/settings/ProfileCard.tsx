"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { Avatar, avatarColorClass } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/Input";
import { ApiError } from "@/lib/api";
import { AVATAR_COLORS, type User } from "@/lib/types";
import { updateProfile } from "@/lib/users";

export function ProfileCard({ user }: { user: User }) {
  const toast = useToast();
  const { applyUser } = useAuth();

  const [name, setName] = useState(user.name ?? "");
  const [color, setColor] = useState(user.avatarColor ?? "emerald");
  const [submitting, setSubmitting] = useState(false);

  const dirty =
    name.trim() !== (user.name ?? "") || color !== (user.avatarColor ?? "emerald");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const updated = await updateProfile({ name, avatarColor: color });
      applyUser(updated);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Something went wrong",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-zinc-100">Profile</h2>
      <p className="mt-0.5 text-sm text-zinc-500">
        How you appear to your teammates.
      </p>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-5">
        <div className="flex items-center gap-4">
          {/* Previews the unsaved choice, not the saved one. */}
          <Avatar
            user={{ username: user.username, name, avatarColor: color }}
            size="lg"
          />
          <div>
            <p className="text-sm font-medium text-zinc-300">Avatar colour</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  aria-pressed={color === c}
                  className={`h-7 w-7 rounded-full transition-transform ${avatarColorClass(
                    c,
                  )} ${
                    color === c
                      ? "scale-110 ring-2 ring-zinc-100 ring-offset-2 ring-offset-zinc-900"
                      : "hover:scale-105"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <FormField
          label="Display name"
          name="name"
          placeholder={user.username}
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="-mt-3 text-xs text-zinc-500">
          Leave this empty to go by your username.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnly
            label="Username"
            value={user.username}
            hint="You sign in with this, so it cannot be changed."
          />
          {/* Always verified — the account could not have been created
              otherwise — so there is no unverified branch to render. */}
          <ReadOnly
            label="Email"
            value={user.email}
            badge={<Badge tone="emerald">Verified</Badge>}
          />
        </div>

        <div>
          <Button type="submit" loading={submitting} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ReadOnly({
  label,
  value,
  hint,
  badge,
}: {
  label: string;
  value: string;
  hint?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-300">{label}</span>
      <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/50 px-3">
        <span className="truncate text-sm text-zinc-400" title={value}>
          {value}
        </span>
        {badge}
      </div>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
