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
  login: (email: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
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

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    setToken(res.accessToken);
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      // Register does not return a token, so log in immediately afterwards.
      await apiFetch<RegisterResponse>("/auth/register", {
        method: "POST",
        auth: false,
        body: { username, email, password },
      });
      const res = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        auth: false,
        body: { email, password },
      });
      setToken(res.accessToken);
      setUser(res.user);
    },
    [],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
