import { supabase } from "./supabase";
import type { ProfileSearchRow } from "./supabase";
import { MAX_PEOPLE_RESULTS, PEOPLE_SEARCH_RADIUS_KM } from "./searchConstants";

export type SearchPeopleParams = {
  q: string;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
  limit?: number;
  excludeUserId?: string | null;
};

/**
 * Bounded profile search via `search_profiles` RPC (trigram + optional geo).
 * Returns public-safe fields only; no precise coordinates in the row shape.
 */
export async function searchPeople(params: SearchPeopleParams): Promise<ProfileSearchRow[]> {
  const q = params.q.trim();
  if (!supabase || q.length < 2) return [];

  const limit = Math.min(params.limit ?? MAX_PEOPLE_RESULTS, 25);
  const radius = params.radiusKm ?? PEOPLE_SEARCH_RADIUS_KM;
  const lat = params.lat ?? null;
  const lng = params.lng ?? null;

  const { data, error } = await supabase.rpc("search_profiles", {
    q,
    p_lat: lat,
    p_lng: lng,
    radius_km: radius,
    limit_n: limit,
    p_exclude: params.excludeUserId ?? null,
  });

  if (error) {
    console.warn("[FUN] search_profiles", error.message);
    return [];
  }

  return (data as ProfileSearchRow[]) ?? [];
}
