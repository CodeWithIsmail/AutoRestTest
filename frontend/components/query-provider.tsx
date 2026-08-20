"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import dynamic from "next/dynamic";
import { useState } from "react";
import {
  PERSIST_MAX_AGE,
  createQueryClient,
  createQueryPersister,
} from "@/lib/query-client";

// Devtools are a devDependency and must not reach the production bundle.
// `process.env.NODE_ENV` is statically replaced at build time, so the
// production branch collapses to a no-op component and the import behind it is
// never pulled into a chunk.
const Devtools =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@tanstack/react-query-devtools").then(
            (m) => m.ReactQueryDevtools,
          ),
        { ssr: false },
      )
    : () => null;

/**
 * Supplies the QueryClient, and restores the cache persisted to localStorage
 * so a hard refresh paints from what we already had instead of a screenful of
 * spinners.
 *
 * Both the client and the persister are built inside `useState` initialisers:
 * at module scope they would be shared across server renders, and inline they
 * would be rebuilt (throwing away the whole cache) on every re-render.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const [persister] = useState(createQueryPersister);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: PERSIST_MAX_AGE }}
    >
      {children}
      <Devtools initialIsOpen={false} buttonPosition="bottom-left" />
    </PersistQueryClientProvider>
  );
}
