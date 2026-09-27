import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Press → loading → navigated, for a button that opens a lazy route.
 *
 * React Router wraps navigation in `startTransition`, so a route whose chunk has
 * not been fetched leaves the current screen up with nothing happening — the
 * "tapping it does nothing" problem. Prefetching removes the wait when it works;
 * this covers the case where it hasn't finished (cold cache, slow network) by
 * showing the wait on the control the person actually pressed, rather than
 * replacing the whole map with a full-screen loader.
 *
 * Two deliberate timings:
 *  - nothing is shown for the first `SHOW_AFTER_MS`, so a warm chunk navigates
 *    with no flash of a spinner nobody needed;
 *  - once shown, it stays for at least `MIN_VISIBLE_MS`, so it reads as feedback
 *    rather than a glitch.
 */
const SHOW_AFTER_MS = 110;
const MIN_VISIBLE_MS = 320;

export function useNavLoading() {
  const [pending, setPending] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    return () => {
      alive.current = false;
      for (const t of timers.current) window.clearTimeout(t);
    };
  }, []);

  /**
   * `key` identifies which control is busy. `load` is the chunk import (or any
   * promise worth waiting on); `go` runs once it settles, whether or not it did.
   */
  const start = useCallback(
    async (key: string, load: (() => Promise<unknown>) | undefined, go: () => void) => {
      const startedAt = Date.now();
      let shown = false;
      const showTimer = window.setTimeout(() => {
        if (!alive.current) return;
        shown = true;
        setPending(key);
      }, SHOW_AFTER_MS);
      timers.current.push(showTimer);

      try {
        await load?.();
      } catch {
        // A failed prefetch is not a reason to refuse to navigate: the router's
        // own error boundary handles a chunk that genuinely cannot load.
      }

      window.clearTimeout(showTimer);
      if (!alive.current) return;

      const remaining = shown ? MIN_VISIBLE_MS - (Date.now() - startedAt) : 0;
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          const t = window.setTimeout(resolve, remaining);
          timers.current.push(t);
        });
      }
      if (!alive.current) return;
      go();
      setPending(null);
    },
    []
  );

  return { pending, start };
}
