import { useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { getMyNotifications, markNotificationRead, subscribeToNotifications } from "../lib/api";
import type { NotificationRow } from "../lib/supabase";
import { useAuth } from "../app/contexts/AuthContext";
import { useCachedQuery } from "./useCachedQuery";
import { persistUnder } from "../lib/requestCache";

/**
 * Notifications reach three screens — the map's bell, the feed's Alerts tab and the
 * profile header — and each refetched on mount, so the Alerts tab opened on "you're
 * all caught up" until the request landed. They share one cached list per user now:
 * the map loads it while idle and the other two paint it at once.
 */
const NOTIFICATIONS_TTL_MS = 30_000;

/** Every screen asks for twelve, so all three share one cache entry. */
export const NOTIFICATIONS_LIMIT = 12;

const NONE: NotificationRow[] = [];

// The unread badge, on the first frame of a cold start.
persistUnder("notifications:");

export function useNotifications(options?: { limit?: number; enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const limit = options?.limit ?? NOTIFICATIONS_LIMIT;
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const key = supabase && enabled && userId ? `notifications:${userId}:${limit}` : null;

  const query = useCachedQuery<NotificationRow[]>(
    key,
    async () => {
      const { data, error } = await getMyNotifications(limit);
      if (error) {
        console.warn("[FUN] notifications fetch failed:", error.message);
        throw error;
      }
      return data;
    },
    NOTIFICATIONS_TTL_MS
  );
  const { mutate } = query;

  useEffect(() => {
    if (!supabase || !userId) return;
    const unsub = subscribeToNotifications({
      userId,
      onInsert: (row) => {
        // By id, because two screens can hold this subscription at once and both
        // write into the same cached list.
        mutate((prev = []) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev].slice(0, limit)));
      },
    });
    return () => {
      if (unsub) unsub();
    };
  }, [userId, limit, mutate]);

  const markRead = useCallback(
    async (id: string) => {
      if (!supabase) return;
      mutate((prev = []) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      await markNotificationRead(id);
    },
    [mutate]
  );

  return {
    notifications: query.data ?? NONE,
    loading: query.loading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    markRead,
  };
}
