"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/Input";
import { ApiError } from "@/lib/api";
import { forgotPassword } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      // The endpoint refuses to say whether the address exists, so the only
      // errors that reach here are rate limiting and the server being down.
      setError(
        err instanceof ApiError ? err.message : "Something went wrong",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Card className="p-6">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
          <svg
            className="h-5 w-5 text-emerald-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="m3.5 6.5 8.5 6 8.5-6" />
          </svg>
        </div>
        <h2 className="mb-1 text-lg font-semibold text-zinc-50">
          Check your inbox
        </h2>
        {/* Deliberately hedged: confirming that the address is registered would
            turn this page into an account enumerator. */}
        <p className="mb-6 text-sm text-zinc-400">
          If an account exists for{" "}
          <span className="font-medium text-zinc-200">{email}</span>, a reset
          link is on its way. It works once and expires in 30 minutes.
        </p>
        <Link
          href="/login"
          className="text-sm font-medium text-emerald-500 hover:text-emerald-400"
        >
          Back to sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold text-zinc-50">
        Reset your password
      </h2>
      <p className="mb-6 text-sm text-zinc-400">
        Enter the email address on your account and we&apos;ll send you a link
        to choose a new password.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error ?? undefined}
        />

        <Button type="submit" loading={submitting} className="w-full">
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-400">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium text-emerald-500 hover:text-emerald-400"
        >
          Sign in
        </Link>
      </p>
    </Card>
  );
}
