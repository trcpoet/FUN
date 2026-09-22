import { useEffect, useState } from "react";

/**
 * One clock for every component that needs "what time is it now".
 *
 * WHY
 * ---
 * `GameMapCountdownPill` ran its own `setInterval(…, 1000)`. Each pill is
 * rendered into its own isolated React root (one `createRoot` per DOM marker),
 * so with up to 72 game pins on screen that was 72 independent timers on 72
 * uncoordinated phases — waking the main thread ~72 times a second on average,
 * with no opportunity for React to batch the renders together.
 *
 * A single module-level interval with a subscriber set collapses that to one
 * timer, and because every subscriber is notified inside the same tick their
 * state updates batch into one render pass.
 *
 * The interval only exists while something is subscribed, so an empty map
 * costs nothing.
 */

type Subscriber = (now: number) => void;

/** One registry per period, so a 1s clock and a 60s clock don't interfere. */
const registries = new Map<number, { subs: Set<Subscriber>; timer: number | null }>();

function registryFor(periodMs: number) {
  let reg = registries.get(periodMs);
  if (!reg) {
    reg = { subs: new Set(), timer: null };
    registries.set(periodMs, reg);
  }
  return reg;
}

function subscribe(periodMs: number, fn: Subscriber): () => void {
  const reg = registryFor(periodMs);
  reg.subs.add(fn);
  if (reg.timer == null) {
    reg.timer = window.setInterval(() => {
      const now = Date.now();
      // Copy before iterating: a subscriber that unmounts during notification
      // would otherwise mutate the set we are walking.
      for (const sub of [...reg.subs]) sub(now);
    }, periodMs);
  }
  return () => {
    reg.subs.delete(fn);
    if (reg.subs.size === 0 && reg.timer != null) {
      window.clearInterval(reg.timer);
      reg.timer = null;
    }
  };
}

/**
 * `Date.now()`, refreshed every `periodMs`, shared across all callers using the
 * same period. Returns a number so callers can keep treating it as a plain
 * timestamp.
 */
export function useSharedNow(periodMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribe(periodMs, setNow), [periodMs]);
  return now;
}

/** Test seam: drop every timer and subscriber. */
export function __resetSharedNow(): void {
  for (const reg of registries.values()) {
    if (reg.timer != null) window.clearInterval(reg.timer);
    reg.subs.clear();
  }
  registries.clear();
}
