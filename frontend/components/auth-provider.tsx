"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  apiFetch,
  clearToken,
  getToken,
  setToken,
} from "@/lib/api";
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: if a token exists, verify it by fetching the profile. A stale or
  // revoked token yields 401 -> clear it and treat the user as logged out.
  useEffect(() => {
    let active = true;
    async function bootstrap() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await apiFetch<User>("/auth/me");
        if (active) setUser(me);
      } catch {
        clearToken();
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      auth: false,
      body: { identifier, password },
    });
    setToken(res.accessToken);
    setUser(res.user);
  }, []);

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

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const applyUser = useCallback((next: User) => setUser(next), []);

  const applySession = useCallback((accessToken: string, next: User) => {
    setToken(accessToken);
    setUser(next);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
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
