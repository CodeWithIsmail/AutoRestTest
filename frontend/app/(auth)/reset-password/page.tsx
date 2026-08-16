"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import { resetPassword } from "@/lib/auth";

/**
 * `useSearchParams` forces the client tree up to the nearest Suspense boundary
 * to be client-rendered, and a static page that calls it without one fails the
 * production build outright. Hence the split: the page owns the boundary, the
 * child owns the hook.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <Card className="flex items-center justify-center p-10">
          <Spinner className="h-6 w-6 text-emerald-500" />
        </Card>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const toast = useToast();
  const token = useSearchParams().get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Card className="p-6">
        <h2 className="mb-1 text-lg font-semibold text-zinc-50">
          This link is incomplete
        </h2>
        <p className="mb-6 text-sm text-zinc-400">
          The reset link is missing its token. Some mail clients split long
          URLs — try copying the whole link, or request a fresh one.
        </p>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-emerald-500 hover:text-emerald-400"
        >
          Request a new link
        </Link>
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(token!, password);
      toast.success("Password updated. Sign in with your new password.");
      router.replace("/login");
    } catch (err) {
      // 401 unknown, 409 already used, 410 expired — the backend's message
      // already says which, and each one ends with "request a new one".
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold text-zinc-50">
        Choose a new password
      </h2>
      <p className="mb-6 text-sm text-zinc-400">
        This signs you out everywhere else.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormField
          label="Confirm new password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={error ?? undefined}
        />

        <Button type="submit" loading={submitting} className="w-full">
          Set new password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-400">
        Link expired?{" "}
        <Link
          href="/forgot-password"
          className="font-medium text-emerald-500 hover:text-emerald-400"
        >
          Request a new one
        </Link>
      </p>
    </Card>
  );
}
