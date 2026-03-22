import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { GameRow, ProfileNearbyRow } from "../lib/supabase";

const PROFILES_LIMIT = 50;

/** In-memory cache to skip duplicate Supabase round-trips when params unchanged (e.g. remount). */
const NEARBY_CACHE_TTL_MS = 75_000;
const MAX_CACHE_ENTRIES = 8;
type NearbyCacheEntry = { games: GameRow[]; profiles: ProfileNearbyRow[]; ts: number };
const nearbyCache = new Map<string, NearbyCacheEntry>();

function cacheKey(p: {
  gamesLat: number | null;
  gamesLng: number | null;
  gamesRadiusKm: number;
  profilesLat: number | null;
  profilesLng: number | null;
  athletesRadiusKm: number;
}): string {
  return [
    p.gamesLat ?? "x",
    p.gamesLng ?? "x",
    p.gamesRadiusKm,
    p.profilesLat ?? "x",
    p.profilesLng ?? "x",
    p.athletesRadiusKm,
  ].join(":");
}

function pruneNearbyCache() {
  const now = Date.now();
  for (const [k, v] of nearbyCache) {
    if (now - v.ts > NEARBY_CACHE_TTL_MS) nearbyCache.delete(k);
  }
  while (nearbyCache.size > MAX_CACHE_ENTRIES) {
    let oldestK = "";
    let oldestTs = Infinity;
    for (const [k, v] of nearbyCache) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestK = k;
      }
    }
    if (oldestK) nearbyCache.delete(oldestK);
    else break;
  }
}

/**
 * Single effect: runs `get_games_nearby` and `get_profiles_nearby` together via Promise.all
 * so both requests start in the same tick (games and profiles can use different lat/lng).
 */
export function useNearbyMapQueries(params: {
  gamesLat: number | null;
  gamesLng: number | null;
  gamesRadiusKm: number;
  profilesLat: number | null;
  profilesLng: number | null;
  athletesRadiusKm: number;
}) {
  const { gamesLat, gamesLng, gamesRadiusKm, profilesLat, profilesLng, athletesRadiusKm } = params;

  const [games, setGames] = useState<GameRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileNearbyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refetch = useCallback(() => setRefreshTrigger((t) => t + 1), []);

  useEffect(() => {
    if (!supabase) {
      setGames([]);
      setProfiles([]);
      return;
    }

    const needGames = gamesLat != null && gamesLng != null;
    const needProfiles = profilesLat != null && profilesLng != null;

    if (!needGames && !needProfiles) {
      setGames([]);
      setProfiles([]);
      setLoading(false);
      setGamesError(null);
      return;
    }

    const key = cacheKey({
      gamesLat,
      gamesLng,
      gamesRadiusKm,
      profilesLat,
      profilesLng,
      athletesRadiusKm,
    });

    if (refreshTrigger === 0) {
      pruneNearbyCache();
      const hit = nearbyCache.get(key);
      if (hit && Date.now() - hit.ts < NEARBY_CACHE_TTL_MS) {
        setGames(hit.games);
        setProfiles(hit.profiles);
        setLoading(false);
        setGamesError(null);
        return;
      }
    }

    let cancelled = false;
    setLoading(true);
    setGamesError(null);

    const gamesRpc = needGames
      ? supabase.rpc("get_games_nearby", {
          lat: gamesLat,
          lng: gamesLng,
          radius_km: gamesRadiusKm,
        })
      : Promise.resolve({ data: null, error: null });

    const profilesRpc = needProfiles
      ? supabase.rpc("get_profiles_nearby", {
          lat: profilesLat,
          lng: profilesLng,
          radius_km: athletesRadiusKm,
          limit_count: PROFILES_LIMIT,
        })
      : Promise.resolve({ data: null, error: null });

    Promise.all([gamesRpc, profilesRpc])
      .then(([gamesRes, profilesRes]) => {
        if (cancelled) return;
        setLoading(false);

        let nextGames: GameRow[] = [];
        let nextProfiles: ProfileNearbyRow[] = [];

        if (needGames) {
          if (gamesRes.error) {
            setGamesError(gamesRes.error.message);
            setGames([]);
          } else {
            setGamesError(null);
            nextGames = (gamesRes.data as GameRow[]) ?? [];
            setGames(nextGames);
          }
        } else {
          setGames([]);
        }

        if (needProfiles) {
          if (profilesRes.error) {
            setProfiles([]);
          } else {
            nextProfiles = (profilesRes.data as ProfileNearbyRow[]) ?? [];
            setProfiles(nextProfiles);
          }
        } else {
          setProfiles([]);
        }

        if (
          !gamesRes.error &&
          (!needProfiles || !profilesRes.error) &&
          (needGames || needProfiles)
        ) {
          pruneNearbyCache();
          nearbyCache.set(key, {
            games: needGames ? nextGames : [],
            profiles: needProfiles ? nextProfiles : [],
            ts: Date.now(),
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoading(false);
          setGamesError(String(e));
          setGames([]);
          setProfiles([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    gamesLat,
    gamesLng,
    gamesRadiusKm,
    profilesLat,
    profilesLng,
    athletesRadiusKm,
    refreshTrigger,
  ]);

  return { games, profiles, loading, gamesError, refetch };
}
