"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, clearToken, getToken, setToken } from "@/lib/api";
import { clearPersistedCache } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { meOptions } from "@/lib/queries";
import { setUnauthorizedHandler } from "@/lib/session";
import type { AuthResponse, RegisterResponse, User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  /** True while the initial "am I logged in?" check is running. */
  loading: boolean;
  /** `identifier` is the account's email address or its username. */
  login: (identifier: string, password: string) => Promise<void>;
  /**
   * Starts a signup. Does **not** sign anyone in: no account exists until the
   * emailed code is entered. Resolves with whether that step is required, since
   * the server can have it switched off.
   */
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<{ verificationRequired: boolean }>;
  logout: () => void;
  /**
   * Replace the cached user with a row the server just returned. The settings
   * page changes fields the shell renders (display name, avatar), so without
   * this the header goes stale until reload.
   */
  applyUser: (user: User) => void;
  /** Adopt a session handed back by something other than login — i.e. signup. */
  applySession: (accessToken: string, user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  // Read once, lazily, rather than in an effect: the client's very first
  // render then already knows whether a session might exist. That matters
  // because the app shell redirects to /login the moment it sees "not loading
  // and no user", and an effect would let it see exactly that for one render.
  // Guarded because client components are still server-rendered, where there
  // is no localStorage — and `false` there renders the same spinner the client
  // shows while the profile loads, so the markup still matches.
  const [tokenPresent, setTokenPresent] = useState(
    () => typeof window !== "undefined" && getToken() !== null,
  );

  // The profile fetch that used to live in a useEffect. A stale or revoked
  // token yields 401, which the QueryCache turns into the sign-out below.
  const { data, isPending } = useQuery({
    ...meOptions(),
    enabled: tokenPresent,
  });

  const endSession = useCallback(() => {
    clearToken();
    setTokenPresent(false);
    // Both halves matter: `clear()` drops the in-memory cache, and the second
    // call drops the copy on disk. Leaving either behind would show one user's
    // projects to whoever signs in next on this browser.
    queryClient.clear();
    clearPersistedCache();
  }, [queryClient]);

  // The app's only session-revocation path: the backend rejects any token
  // minted before `passwordChangedAt`, and until now that left the user
  // stranded on a page of failed requests instead of back at the login form.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      endSession();
      router.replace("/login");
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession, router]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        auth: false,
        body: { identifier, password },
      });
      setToken(res.accessToken);
      setTokenPresent(true);
      queryClient.setQueryData(qk.me, res.user);
    },
    [queryClient],
  );

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      // Deliberately does not log in afterwards. Registration only parks a
      // pending signup — creating the account here is what used to let anyone
      // permanently claim an email address they did not own.
      const res = await apiFetch<RegisterResponse>("/auth/register", {
        method: "POST",
        auth: false,
        body: { username, email, password },
      });
      return { verificationRequired: res.verificationRequired };
    },
    [],
  );

  const logout = useCallback(() => endSession(), [endSession]);

  const applyUser = useCallback(
    (next: User) => {
      queryClient.setQueryData(qk.me, next);
    },
    [queryClient],
  );

  const applySession = useCallback(
    (accessToken: string, next: User) => {
      setToken(accessToken);
      setTokenPresent(true);
      queryClient.setQueryData(qk.me, next);
    },
    [queryClient],
  );

  return (
    <AuthContext.Provider
      value={{
        user: data ?? null,
        // Only "loading" when there is a token to check. Without one there is
        // nothing to wait for and the shell should redirect immediately.
        loading: tokenPresent && isPending,
        login,
        register,
        logout,
        applyUser,
        applySession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
