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

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const toast = useToast();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const registerMutation = useMutation({
    mutationFn: () => register(username, email, password),
    onSuccess: ({ verificationRequired }) => {
      if (!verificationRequired) {
        // Server has verification switched off, so the account already exists.
        toast.success("Account created — sign in to continue.");
        router.replace("/login");
        return;
      }

      // No session yet: the account is created when the code comes back. The
      // address rides along so the next screen knows who is verifying.
      router.replace(`/verify-signup?email=${encodeURIComponent(email)}`);
    },
    onError: (err) => toast.error(errMsg(err, "Something went wrong")),
  });

  const submitting = registerMutation.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    registerMutation.mutate();
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Create your account
      </h2>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Start testing your REST APIs in minutes.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          label="Username"
          name="username"
          autoComplete="username"
          placeholder="jane_doe"
          required
          minLength={3}
          maxLength={32}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" loading={submitting} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-emerald-600 dark:text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          Sign in
        </Link>
      </p>
    </Card>
  );
}
