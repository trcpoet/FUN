import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { getMyNotifications, markNotificationRead, subscribeToNotifications } from "../lib/api";
import type { NotificationRow } from "../lib/supabase";

export function useNotifications(options?: { limit?: number }) {
  const [list, setList] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = options?.limit ?? 20;

  const refetch = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await getMyNotifications(limit);
    setList(data ?? []);
    setError(err?.message ?? null);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!supabase) return;
    const unsub = subscribeToNotifications((row) => {
      setList((prev) => [row, ...prev].slice(0, limit));
    });
    return () => {
      if (unsub) unsub();
    };
  }, [limit]);

  const markRead = useCallback(async (id: string) => {
    if (!supabase) return;
    await markNotificationRead(id);
    setList((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }, []);

  return { notifications: list, loading, error, refetch, markRead };
}
