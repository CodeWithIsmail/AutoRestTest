"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/toast";
import { errMsg } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/Input";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const toast = useToast();

  // One field for both an email address and a username — the backend tells
  // them apart by the '@', which usernames may not contain.
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // A 401 here means "wrong password" and must stay on this form. That is why
  // the global unauthorized handler is wired to queries only, never mutations.
  const loginMutation = useMutation({
    mutationFn: () => login(identifier, password),
    onSuccess: () => {
      toast.success("Signed in successfully.");
      router.replace("/projects");
    },
    onError: (err) => toast.error(errMsg(err, "Something went wrong")),
  });

  const submitting = loginMutation.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    loginMutation.mutate();
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Sign in</h2>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Welcome back. Enter your credentials to continue.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          label="Email or username"
          name="identifier"
          autoComplete="username"
          placeholder="you@example.com"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <div>
          <FormField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="mt-1.5 text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-zinc-600 dark:text-zinc-400 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
            >
              Forgot your password?
            </Link>
          </div>
        </div>

        <Button type="submit" loading={submitting} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          Create one
        </Link>
      </p>
    </Card>
  );
}
