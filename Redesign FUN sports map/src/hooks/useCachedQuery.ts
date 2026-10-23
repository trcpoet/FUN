import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { cachedAsync, cacheInvalidate, cacheIsFresh, cachePeek, cacheSet } from "../lib/requestCache";

type State<T> = {
  key: string | null;
  data: T | undefined;
  error: Error | null;
  fetching: boolean;
};

function stateFor<T>(key: string | null): State<T> {
  return {
    key,
    data: key ? cachePeek<T>(key) : undefined,
    error: null,
    fetching: key != null && !cacheIsFresh(key),
  };
}

export type CachedQuery<T> = {
  /** The freshest copy there is: cached on the first frame, replaced when the request lands. */
  data: T | undefined;
  error: Error | null;
  /** Nothing to show yet — the only time a skeleton is the right answer. */
  loading: boolean;
  /** Showing a cached copy while a newer one loads. Worth a small hint, never a skeleton. */
  refreshing: boolean;
  /** Fetch again now, keeping the current copy on screen meanwhile. */
  refetch: () => void;
  /** Edit the cached copy in place, e.g. a realtime insert or an optimistic toggle. */
  mutate: (update: (prev: T | undefined) => T) => void;
};

/**
 * Stale-while-revalidate over `requestCache`.
 *
 * Every list screen here fetched on mount into empty state, so leaving and coming
 * back — map, feed, a profile, back to the feed — repainted skeletons for data the
 * app had held a moment before. This reads whatever the cache last stored for
 * `key` on the very first render, then asks again unless that copy is younger than
 * `ttlMs`. Concurrent callers (a prefetch, a second component) share one request.
 *
 * `key` must encode everything `fetcher` depends on; a `null` key fetches nothing.
 * `fetcher` should throw on failure — only successes are cached, and a failure
 * keeps the previous copy on screen.
 */
export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  ttlMs: number
): CachedQuery<T> {
  const [state, setState] = useState<State<T>>(() => stateFor<T>(key));
  const [nonce, setNonce] = useState(0);

  // A new key re-reads the cache during render, so its first frame is already
  // right — an effect would paint the old key's rows for a frame first.
  let current = state;
  if (state.key !== key) {
    current = stateFor<T>(key);
    setState(current);
  }

  const load = useEffectEvent(() => fetcher());

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    if (!cacheIsFresh(key)) {
      setState((s) => (s.key === key && !s.fetching ? { ...s, fetching: true } : s));
    }
    cachedAsync(key, ttlMs, () => load()).then(
      (data) => {
        if (cancelled) return;
        setState((s) =>
          s.key === key && s.data === data && !s.fetching && !s.error
            ? s
            : { key, data, error: null, fetching: false }
        );
      },
      (e: unknown) => {
        if (cancelled) return;
        const error = e instanceof Error ? e : new Error(String(e));
        setState((s) => (s.key === key ? { ...s, error, fetching: false } : s));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, ttlMs, nonce]);

  const refetch = useCallback(() => {
    if (!key) return;
    cacheInvalidate(key);
    setNonce((n) => n + 1);
  }, [key]);

  const mutate = useCallback(
    (update: (prev: T | undefined) => T) => {
      if (!key) return;
      cacheSet<T>(key, update);
      setState((s) => (s.key === key ? { ...s, data: update(s.data) } : s));
    },
    [key]
  );

  return {
    data: current.data,
    error: current.error,
    loading: current.data === undefined && current.fetching,
    refreshing: current.data !== undefined && current.fetching,
    refetch,
    mutate,
  };
}

/** `useCachedQuery` for a `{ key, fetch }` pair, as `feedQueries` builds them. `null` waits. */
export function useQuery<T>(
  query: { key: string; fetch: () => Promise<T> } | null,
  ttlMs: number
): CachedQuery<T> {
  return useCachedQuery(query?.key ?? null, () => query!.fetch(), ttlMs);
}
