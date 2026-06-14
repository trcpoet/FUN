import { useEffect, useState } from "react";

/** Becomes true after the browser is idle — use to defer non-critical fetches. */
export function useIdleReady(timeoutMs = 2000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const run = () => setReady(true);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: timeoutMs });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, Math.min(timeoutMs, 500));
    return () => window.clearTimeout(t);
  }, [timeoutMs]);

  return ready;
}
