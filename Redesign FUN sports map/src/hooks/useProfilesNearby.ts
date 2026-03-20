import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { ProfileNearbyRow } from "../lib/supabase";

const DEFAULT_LIMIT = 50;

export function useProfilesNearby(lat: number | null, lng: number | null, radiusKm: number = 10) {
  const [profiles, setProfiles] = useState<ProfileNearbyRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    if (lat == null || lng == null || !supabase) return;
    setLoading(true);
    supabase
      .rpc("get_profiles_nearby", {
        lat,
        lng,
        radius_km: radiusKm,
        limit_count: DEFAULT_LIMIT,
      })
      .then(({ data, error }) => {
        setLoading(false);
        if (!error) setProfiles((data as ProfileNearbyRow[]) ?? []);
      });
  }, [lat, lng, radiusKm]);

  useEffect(() => {
    if (lat == null || lng == null || !supabase) {
      setProfiles([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc("get_profiles_nearby", {
        lat,
        lng,
        radius_km: radiusKm,
        limit_count: DEFAULT_LIMIT,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setProfiles([]);
          return;
        }
        setProfiles((data as ProfileNearbyRow[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng, radiusKm]);

  return { profiles, loading, refetch };
}
