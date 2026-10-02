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
  // The map's search bar still refuses to fire on one character — a trigram
  // match on a single letter is noise there. `browsePeople` below is the door
  // for "show me everyone", which is a different question.
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


/** How many players the browse list asks for. The RPC caps at 100. */
export const BROWSE_PEOPLE_LIMIT = 100;

/**
 * Everyone you could play with, optionally narrowed by a query.
 *
 * Unlike `searchPeople` this does not require a query: an empty one lists every
 * eligible player, which is what the feed's search button opens on. Both go
 * through `search_profiles`, so the rules about who is listed at all — not
 * anonymous, email or phone confirmed, never yourself — live in one place and
 * cannot drift apart.
 */
export async function browsePeople(params: {
  q?: string;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
  limit?: number;
  excludeUserId?: string | null;
}): Promise<{ data: ProfileSearchRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };

  const { data, error } = await supabase.rpc("search_profiles", {
    q: (params.q ?? "").trim(),
    // No radius unless the caller gives a location: a browse should show
    // everyone, not silently hide anyone whose location we happen to know.
    p_lat: params.lat ?? null,
    p_lng: params.lng ?? null,
    radius_km: params.radiusKm ?? PEOPLE_SEARCH_RADIUS_KM,
    limit_n: Math.min(params.limit ?? BROWSE_PEOPLE_LIMIT, 100),
    p_exclude: params.excludeUserId ?? null,
  });

  if (error) {
    console.warn("[FUN] browsePeople", error.message);
    return { data: [], error: new Error(error.message) };
  }
  return { data: (data as ProfileSearchRow[]) ?? [], error: null };
}
