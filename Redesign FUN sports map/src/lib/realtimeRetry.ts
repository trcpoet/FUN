import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Builds a fresh channel with its `.on(...)` handlers attached but WITHOUT
 * calling `.subscribe()` — `subscribeWithRetry` owns the subscribe call and
 * its status callback. Called again on every reconnect (a dead channel's join
 * ref cannot be reused), so it should mint a new unique topic each time.
 */
export type ChannelBuilder = () => RealtimeChannel;

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Subscribe to a Supabase Realtime channel with automatic reconnect.
 *
 * The raw factories called `.subscribe()` with no status callback, so a
 * `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` from a network blip or token refresh
 * killed the channel silently and messages/notifications stopped arriving with
 * no resubscribe. This helper rebuilds the channel on those states with capped
 * exponential backoff (1s → 30s, reset on success) and re-kicks immediately
 * when the tab comes back online / visible. The returned fn stops all retries.
 */
export function subscribeWithRetry(build: ChannelBuilder): () => void {
  if (!supabase) return () => {};
  const client = supabase;

  let current: RealtimeChannel | null = null;
  let disposed = false;
  let healthy = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const removeCurrent = () => {
    if (current) {
      void client.removeChannel(current);
      current = null;
    }
  };

  const scheduleReconnect = () => {
    if (disposed || retryTimer) return;
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (disposed) return;
    removeCurrent();
    healthy = false;
    const channel = build();
    current = channel;
    channel.subscribe((status) => {
      // Ignore callbacks from a channel we've already replaced or removed
      // (removeChannel fires CLOSED asynchronously).
      if (disposed || current !== channel) return;
      if (status === "SUBSCRIBED") {
        healthy = true;
        attempt = 0;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        healthy = false;
        scheduleReconnect();
      }
    });
  };

  // Reconnect eagerly when connectivity returns, but skip needless churn if the
  // channel is still healthy.
  const kick = () => {
    if (disposed || healthy) return;
    clearRetry();
    attempt = 0;
    connect();
  };
  const onVisible = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") kick();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", kick);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  }

  connect();

  return () => {
    disposed = true;
    clearRetry();
    removeCurrent();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", kick);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    }
  };
}
