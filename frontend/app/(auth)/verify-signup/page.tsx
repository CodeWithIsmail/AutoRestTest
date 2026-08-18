"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import { resendSignupCode, verifySignup } from "@/lib/auth";

const LENGTH = 6;

/** Seconds before Resend is offered again — the backend allows 3 per 15 min. */
const RESEND_COOLDOWN = 60;

/**
 * `useSearchParams` forces the client tree up to the nearest Suspense boundary
 * to be client-rendered, and a static page that calls it without one fails the
 * production build outright. Hence the split: the page owns the boundary, the
 * child owns the hook. Same shape as /reset-password.
 */
export default function VerifySignupPage() {
  return (
    <Suspense
      fallback={
        <Card className="flex items-center justify-center p-10">
          <Spinner className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
        </Card>
      }
    >
      <VerifySignupForm />
    </Suspense>
  );
}

function VerifySignupForm() {
  const router = useRouter();
  const toast = useToast();
  const { applySession } = useAuth();
  const email = useSearchParams().get("email") ?? "";

  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const code = digits.join("");

  if (!email) {
    return (
      <Card className="p-6">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Nothing to verify
        </h2>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          We don&apos;t know which signup this is for. Start again and
          we&apos;ll send you a fresh code.
        </p>
        <Link
          href="/register"
          className="text-sm font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          Back to sign up
        </Link>
      </Card>
    );
  }

  async function submit(value: string) {
    setSubmitting(true);
    setError(null);
    try {
      // The account is created by this call — not by /auth/register — so this
      // is also where the session begins.
      const res = await verifySignup(email, value);
      applySession(res.accessToken, res.user);
      toast.success("Welcome aboard — your account is ready.");
      router.replace("/projects");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setDigits(Array(LENGTH).fill(""));
      inputs.current[0]?.focus();
      setSubmitting(false);
    }
  }

  function setDigit(index: number, value: string) {
    // A pasted code lands entirely in one box; spread it across the row.
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length > 1) {
      const next = Array<string>(LENGTH).fill("");
      cleaned
        .slice(0, LENGTH)
        .split("")
        .forEach((d, i) => (next[i] = d));
      setDigits(next);
      const last = Math.min(cleaned.length, LENGTH) - 1;
      inputs.current[last]?.focus();
      if (cleaned.length >= LENGTH) void submit(next.join(""));
      return;
    }

    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);
    if (cleaned && index < LENGTH - 1) inputs.current[index + 1]?.focus();
    // Auto-submit on the last digit — there is nothing else to fill in.
    if (cleaned && index === LENGTH - 1) void submit(next.join(""));
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  async function onResend() {
    setCooldown(RESEND_COOLDOWN);
    setError(null);
    try {
      const res = await resendSignupCode(email);
      toast.success(res.message);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not resend");
      setCooldown(0);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Confirm your email
      </h2>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        We sent a six-digit code to{" "}
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{email}</span>. Your account
        is created once you enter it.
      </p>

      <div className="flex justify-between gap-2">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={digit}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            disabled={submitting}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={`Digit ${i + 1}`}
            maxLength={LENGTH}
            autoFocus={i === 0}
            className="h-14 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-center font-mono text-xl text-zinc-900 dark:text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
          />
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Button
        className="mt-5 w-full"
        loading={submitting}
        disabled={code.length < LENGTH}
        onClick={() => void submit(code)}
      >
        Create my account
      </Button>

      <div className="mt-6 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4 text-sm">
        <span className="text-zinc-500">Didn&apos;t get it?</span>
        <button
          type="button"
          onClick={() => void onResend()}
          disabled={cooldown > 0}
          className="font-medium text-emerald-600 dark:text-emerald-500 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 disabled:cursor-not-allowed disabled:text-zinc-400 dark:disabled:text-zinc-600"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend the code"}
        </button>
      </div>

      {/* Mistyping your own address is the common failure here, and there is no
          session to sign out of — so the way back has to be an explicit link. */}
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Wrong address?{" "}
        <Link
          href="/register"
          className="font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          Sign up again
        </Link>
      </p>
    </Card>
  );
}
