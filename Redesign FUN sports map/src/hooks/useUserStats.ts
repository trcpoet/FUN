import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { getMyStats } from "../lib/api";
import type { UserStatsRow } from "../lib/supabase";

export function useUserStats() {
  const [stats, setStats] = useState<UserStatsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await getMyStats();
    setStats(data ?? null);
    setError(err?.message ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    refetch();
  }, [refetch]);

  return { stats, loading, error, refetch };
}
