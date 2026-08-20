// QueryClient construction, defaults, and the localStorage persister.
//
// Kept out of the provider component so `logout()` can reach
// `clearPersistedCache()` without importing React or the provider itself.

import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ApiError } from "./api";
import { notifyUnauthorized } from "./session";

/** Where the dehydrated cache lives. Namespaced like the other keys here. */
export const PERSIST_KEY = "autoresttest.query-cache";

/** How long a persisted cache is trusted before being thrown away. */
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    // The 401 handler is on the *query* cache only, never the mutation cache.
    // POST /auth/login answers 401 for a wrong password, and that has to read
    // as "invalid credentials" on the login form rather than bouncing the user
    // to the page they are already on. Mutations keep their own toast handling.
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) {
          notifyUnauthorized();
        }
      },
    }),
    defaultOptions: {
      queries: {
        // Long enough that moving between tabs of a project is free, short
        // enough that a stale badge corrects itself almost immediately.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          // A 4xx is an answer, not a hiccup: retrying a 401/403/404 cannot
          // change the outcome and only delays showing the user what happened.
          // Network failures (status 0) and 5xx are worth a second look.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function createQueryPersister() {
  return createSyncStoragePersister({
    // Client components are still server-rendered, so this module can be
    // evaluated without a window.
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    key: PERSIST_KEY,
  });
}

/**
 * Drops the persisted cache.
 *
 * Called on sign-out, and it is not optional: the cache holds one user's
 * projects, members and runs, so leaving it behind would show them to whoever
 * signs in next on the same browser.
 */
export function clearPersistedCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PERSIST_KEY);
  } catch {
    // Storage can be unavailable (private browsing). The in-memory cache is
    // cleared separately, so the session is still ended correctly.
  }
}
