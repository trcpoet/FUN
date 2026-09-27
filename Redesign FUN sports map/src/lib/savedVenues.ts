/**
 * Venues a member bookmarked.
 *
 * Server-side rather than localStorage: a saved court that vanishes when you
 * open the app on a different phone is worse than not offering Save at all,
 * because the person already trusted it once.
 *
 * Every read degrades to "nothing saved" when the migration is not deployed,
 * the way the rest of this codebase does (`isMissingRpc`), so a card never
 * breaks over a bookmark.
 */
import { supabase } from "./supabase";
import { isMissingRpc } from "./rpcErrors";

export const SAVED_VENUES_MIGRATION = "supabase/migrations/20260928110000_saved_venues.sql";

export type SavedVenueRow = {
  venue_id: string;
  saved_at: string;
  name: string | null;
  sport: string | null;
  leisure: string | null;
  lat: number;
  lng: number;
};

function absent(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (isMissingRpc(error)) return true;
  return error.code === "42P01" || (error.message ?? "").includes("saved_venues");
}

/** Returns the state AFTER the toggle, so the caller can trust the answer. */
export async function toggleSavedVenue(
  venueId: string,
): Promise<{ saved: boolean; error: Error | null }> {
  if (!supabase) return { saved: false, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("toggle_saved_venue", { p_venue_id: venueId });
  if (error) {
    if (absent(error)) {
      return { saved: false, error: new Error(`Saving is not deployed yet. Run ${SAVED_VENUES_MIGRATION}.`) };
    }
    return { saved: false, error: new Error(error.message) };
  }
  return { saved: data === true, error: null };
}

export async function fetchMySavedVenues(
  limit = 100,
): Promise<{ data: SavedVenueRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: null };
  const { data, error } = await supabase.rpc("get_my_saved_venues", { p_limit: limit });
  if (error) {
    if (absent(error)) return { data: [], error: null };
    return { data: [], error: new Error(error.message) };
  }
  return { data: (data as SavedVenueRow[]) ?? [], error: null };
}

/** Which of these are already saved. One round-trip for a whole list. */
export async function fetchSavedVenueIds(venueIds: string[]): Promise<Set<string>> {
  if (!supabase || venueIds.length === 0) return new Set();
  const { data, error } = await supabase.rpc("get_saved_venue_ids", { p_venue_ids: venueIds });
  if (error) return new Set();
  return new Set(((data as { venue_id: string }[]) ?? []).map((r) => r.venue_id));
}
