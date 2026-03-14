import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { GameRow } from "../lib/supabase";

const DEFAULT_RADIUS_KM = 15;

export function useGamesNearby(lat: number | null, lng: number | null) {
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refetch = useCallback(() => setRefreshTrigger((t) => t + 1), []);

  useEffect(() => {
    if (lat == null || lng == null || !supabase) {
      setGames([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .rpc("get_games_nearby", {
        lat,
        lng,
        radius_km: DEFAULT_RADIUS_KM,
      })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setLoading(false);
        if (err) {
          setError(err.message);
          setGames([]);
          return;
        }
        setGames((data as GameRow[]) ?? []);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoading(false);
          setError(String(e));
          setGames([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng, refreshTrigger]);

  return { games, loading, error, refetch };
}
