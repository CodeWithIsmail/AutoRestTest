// Typed client for the NestJS backend.
//
// The whole app talks to the backend over JWT Bearer auth, so this module is
// the single place that: knows the base URL, attaches the token, parses JSON,
// and surfaces the backend's Nest exception messages as a typed ApiError.

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

const TOKEN_KEY = "autoresttest.token";

// --- token storage (localStorage, browser-only) ----------------------------

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

// --- error type -------------------------------------------------------------

/** Thrown for any non-2xx response; carries the HTTP status + backend message. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Nest's exceptions serialize `message` as either a string or a string[]
 * (class-validator returns arrays). Normalize both into a single string.
 */
function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const msg = (body as { message: unknown }).message;
    if (typeof msg === "string") return msg;
    if (Array.isArray(msg) && msg.length > 0) return String(msg[0]);
  }
  return fallback;
}

// --- core fetch -------------------------------------------------------------

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Set false for public endpoints (login/register). Defaults to true. */
  auth?: boolean;
}

export async function apiFetch<T>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the backend running?");
  }

  // 204 No Content and other empty bodies.
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      extractMessage(data, `Request failed (${res.status})`),
    );
  }

  return data as T;
}
