"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

/**
 * Renders nothing, always — that's what keeps this safe from a hydration
 * mismatch regardless of what useAuth() returns on the client's first pass
 * (see (app)/layout.tsx for the guard this deliberately avoids mirroring: it
 * branches its JSX on loading/user, which is fine for the auth-gated shell
 * but would flash a spinner at every anonymous visitor here).
 */
export function AuthRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/projects");
  }, [loading, user, router]);

  return null;
}
