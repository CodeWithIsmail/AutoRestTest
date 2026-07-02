"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-run the fetch (e.g. after a mutation). */
  reload: () => void;
}

/**
 * Small data-fetching hook for client components. Runs `fn` on mount and
 * whenever `deps` change, tracking loading/error state. Use `reload()` to
 * refetch after a mutation.
 *
 * The caller is responsible for passing a stable `deps` array; `fn` is read
 * fresh on each run so it does not need to be memoized.
 */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList = [],
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const result = await fn();
        if (active) setData(result);
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError ? err.message : "Failed to load data",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void run();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, reload };
}
