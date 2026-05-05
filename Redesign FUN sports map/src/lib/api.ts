/**
 * Central API layer for Supabase: games, profiles, stats, notifications, complete-game.
 * Use these from components/hooks instead of calling supabase directly for consistency.
 */

import { supabase } from "./supabase";
import { parseAthleteProfile, type AthleteProfilePayload } from "./athleteProfile";
import { searchPeople } from "./searchPeople";
import type {
  GameRow,
  GameVisibility,
  MapNoteCommentRow,
  MapNoteRow,
  MapNoteVisibility,
  ProfileNearbyRow,
  ProfileSearchRow,
  UserStatsRow,
  BadgeRow,
  UserBadgeRow,
  NotificationRow,
  StatusCommentRow,
  FeedMediaPostRow,
} from "./supabase";
import { cachedAsync, cacheClear } from "./requestCache";
import { getAuthUserDeduped } from "./authDedup";

const DEFAULT_RADIUS_KM = 15;
const DEFAULT_PROFILES_LIMIT = 50;

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim() || undefined;

const MAP_NOTES_MIGRATION =
  "supabase/migrations/20260501130000_map_notes_and_unified_feed.sql";

async function reverseGeocodeLocationLabel(lat: number, lng: number): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null;
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("types", "poi,place,locality,neighborhood");
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;
    const main = feature.text as string | undefined;
    const place = feature.context?.find((c: { id?: string }) =>
      typeof c.id === "string" && (c.id.startsWith("place.") || c.id.startsWith("locality.") || c.id.startsWith("region."))
    );
    if (main && place?.text) return `${main}, ${place.text}`;
    return main ?? null;
  } catch {
    return null;
  }
}

function isMissingMapNotesRpc(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    err.code === "PGRST202" ||
    /not found|could not find function|404/i.test(m) ||
    m.includes("schema cache") ||
    m.includes("map_notes") ||
    m.includes("map_note_comments") ||
    m.includes("create_map_note") ||
    m.includes("get_notes_nearby") ||
    m.includes("get_unified_feed") ||
    m.includes("get_live_nearby")
  );
}

export async function createMapNote(params: {
  lat: number;
  lng: number;
  body: string;
  visibility: MapNoteVisibility;
  placeName?: string | null;
}): Promise<{ data: MapNoteRow | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const trimmed = params.body.trim();
  if (!trimmed) return { data: null, error: new Error("Note is empty") };
  const { data, error } = await supabase.rpc("create_map_note", {
    p_lat: params.lat,
    p_lng: params.lng,
    p_body: trimmed.slice(0, 2000),
    p_visibility: params.visibility,
    p_place_name: params.placeName?.trim() ? params.placeName.trim() : null,
  });
  if (error && isMissingMapNotesRpc(error)) {
    return {
      data: null,
      error: new Error(
        `Map Notes are not deployed yet. Run ${MAP_NOTES_MIGRATION} in the Supabase SQL Editor, then NOTIFY pgrst, 'reload schema'.`
      ),
    };
  }
  return { data: (data as MapNoteRow) ?? null, error: error ? new Error(error.message) : null };
}

export async function fetchNotesNearby(params: {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
}): Promise<{ data: MapNoteRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_notes_nearby", {
    p_lat: params.lat,
    p_lng: params.lng,
    p_radius_km: params.radiusKm ?? 10,
    p_limit: params.limit ?? 50,
  });
  if (error && isMissingMapNotesRpc(error)) {
    return { data: [], error: null };
  }
  return { data: (data as MapNoteRow[]) ?? [], error: error ? new Error(error.message) : null };
}

export async function fetchNoteComments(noteId: string): Promise<{ data: MapNoteCommentRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  // Prefer the richer RPC (per-comment like_count + liked_by_me). Fall back to
  // the legacy `get_note_comments` if the new function isn't deployed yet.
  const withLikes = await supabase.rpc("get_note_comments_with_likes", { p_note_id: noteId });
  if (!withLikes.error) {
    return { data: (withLikes.data as MapNoteCommentRow[]) ?? [], error: null };
  }
  if (!isMissingMapNotesRpc(withLikes.error)) {
    return { data: [], error: new Error(withLikes.error.message) };
  }
  const { data, error } = await supabase.rpc("get_note_comments", { p_note_id: noteId });
  if (error && isMissingMapNotesRpc(error)) {
    return { data: [], error: null };
  }
  return { data: (data as MapNoteCommentRow[]) ?? [], error: error ? new Error(error.message) : null };
}

export async function addNoteComment(params: {
  noteId: string;
  body: string;
}): Promise<{ data: MapNoteCommentRow | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const trimmed = params.body.trim();
  if (!trimmed) return { data: null, error: new Error("Comment is empty") };
  const { data, error } = await supabase.rpc("add_note_comment", {
    p_note_id: params.noteId,
    p_body: trimmed.slice(0, 2000),
  });
  if (error && isMissingMapNotesRpc(error)) {
    return {
      data: null,
      error: new Error(
        `Map Notes comments are not deployed yet. Run ${MAP_NOTES_MIGRATION} in the Supabase SQL Editor, then NOTIFY pgrst, 'reload schema'.`
      ),
    };
  }
  return { data: (data as MapNoteCommentRow) ?? null, error: error ? new Error(error.message) : null };
}

// Map-notes inbox + realtime live in `./mapNotes.ts`. Re-export here so the
// rest of the app keeps importing data helpers from the centralized API layer.
export {
  fetchMyNoteInbox,
  fetchNoteById,
  subscribeNoteComments,
} from "./mapNotes";

let missingUnifiedFeedUntilMs = 0;

export type UnifiedFeedItem =
  | {
      kind: "note";
      id: string;
      created_at: string;
      lat: number;
      lng: number;
      body: string;
      visibility: MapNoteVisibility;
      comment_count: number;
      created_by: string | null;
      like_count: number;
    }
  | {
      kind: "game";
      id: string;
      created_at: string;
      lat: number;
      lng: number;
      title: string | null;
      body: string | null;
      sport: string | null;
      visibility: GameVisibility;
      comment_count: number;
      created_by: string | null;
      like_count: number;
    }
  | {
      kind: "status";
      id: string;
      created_at: string;
      body: string;
      lat: number | null;
      lng: number | null;
      title: string | null;
      sport: string | null;
      visibility: string | null;
      comment_count: number;
      created_by: string | null;
      like_count: number;
    };

/** Games + map notes within a tight radius (default 25 km) for Discovery “Live”. */
export type LiveFeedItem = Extract<UnifiedFeedItem, { kind: "game" | "note" }>;

export async function fetchLiveNearby(params: {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
}): Promise<{ data: LiveFeedItem[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_live_nearby", {
    p_lat: params.lat,
    p_lng: params.lng,
    p_radius_km: params.radiusKm ?? 25,
    p_limit: params.limit ?? 40,
  });
  if (error && isMissingMapNotesRpc(error)) {
    return { data: [], error: null };
  }
  return { data: (data as LiveFeedItem[]) ?? [], error: error ? new Error(error.message) : null };
}

export async function fetchUnifiedFeed(params: {
  lat: number;
  lng: number;
  /** Radius (km) for map games + notes. Statuses ignore geo. Default 120. */
  mapRadiusKm?: number;
  limit?: number;
}): Promise<{ data: UnifiedFeedItem[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  // Avoid spamming the network if PostgREST briefly can't see the function yet (schema cache / grants).
  // We retry after a short cool-down.
  if (missingUnifiedFeedUntilMs > Date.now()) return { data: [], error: null };
  const { data, error } = await supabase.rpc("get_unified_feed", {
    p_lat: params.lat,
    p_lng: params.lng,
    // DB function signature uses `p_radius_km` (not `p_map_radius_km`).
    // If we send the wrong arg name, PostgREST returns 404 "function not found" due to signature mismatch.
    p_radius_km: params.mapRadiusKm ?? 120,
    p_limit: params.limit ?? 80,
  });
  if (error && isMissingMapNotesRpc(error)) {
    missingUnifiedFeedUntilMs = Date.now() + 30_000;
    return { data: [], error: null };
  }
  return { data: (data as UnifiedFeedItem[]) ?? [], error: error ? new Error(error.message) : null };
}

export async function deleteMapNote(noteId: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.from("map_notes").delete().eq("id", noteId);
  return { error: error ? new Error(error.message) : null };
}

export async function deleteMyStatus(statusId: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.rpc("delete_my_status", { p_status_id: statusId });
  return { error: error ? new Error(error.message) : null };
}

export async function toggleMapNoteLike(noteId: string): Promise<{ liked: boolean; error: Error | null }> {
  if (!supabase) return { liked: false, error: new Error("Supabase not configured") };
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return { liked: false, error: new Error("Sign in to like notes.") };
  const { data: removed, error: delErr } = await supabase
    .from("map_note_likes")
    .delete()
    .eq("note_id", noteId)
    .eq("user_id", uid)
    .select("note_id");
  if (delErr) return { liked: false, error: new Error(delErr.message) };
  if (removed && removed.length > 0) return { liked: false, error: null };
  const { error: insErr } = await supabase.from("map_note_likes").insert({ note_id: noteId, user_id: uid });
  if (insErr) return { liked: false, error: new Error(insErr.message) };
  return { liked: true, error: null };
}

export async function toggleNoteCommentLike(commentId: string): Promise<{ liked: boolean; error: Error | null }> {
  if (!supabase) return { liked: false, error: new Error("Supabase not configured") };
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return { liked: false, error: new Error("Sign in to like comments.") };
  const { data: removed, error: delErr } = await supabase
    .from("map_note_comment_likes")
    .delete()
    .eq("comment_id", commentId)
    .eq("user_id", uid)
    .select("comment_id");
  if (delErr) return { liked: false, error: new Error(delErr.message) };
  if (removed && removed.length > 0) return { liked: false, error: null };
  const { error: insErr } = await supabase
    .from("map_note_comment_likes")
    .insert({ comment_id: commentId, user_id: uid });
  if (insErr) return { liked: false, error: new Error(insErr.message) };
  return { liked: true, error: null };
}

export async function toggleStatusLike(statusId: string): Promise<{ liked: boolean; error: Error | null }> {
  if (!supabase) return { liked: false, error: new Error("Supabase not configured") };
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return { liked: false, error: new Error("Sign in to like statuses.") };
  const { data: removed, error: delErr } = await supabase
    .from("status_likes")
    .delete()
    .eq("status_id", statusId)
    .eq("user_id", uid)
    .select("status_id");
  if (delErr) return { liked: false, error: new Error(delErr.message) };
  if (removed && removed.length > 0) return { liked: false, error: null };
  const { error: insErr } = await supabase.from("status_likes").insert({ status_id: statusId, user_id: uid });
  if (insErr) return { liked: false, error: new Error(insErr.message) };
  return { liked: true, error: null };
}

export async function fetchStatusComments(statusId: string): Promise<{ data: StatusCommentRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_status_comments", { p_status_id: statusId });
  return { data: (data as StatusCommentRow[]) ?? [], error: error ? new Error(error.message) : null };
}

export async function addStatusComment(params: {
  statusId: string;
  body: string;
}): Promise<{ data: StatusCommentRow | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const trimmed = params.body.trim();
  if (!trimmed) return { data: null, error: new Error("Comment is empty") };
  const { data, error } = await supabase.rpc("add_status_comment", {
    p_status_id: params.statusId,
    p_body: trimmed.slice(0, 2000),
  });
  return { data: (data as StatusCommentRow) ?? null, error: error ? new Error(error.message) : null };
}

/** Recent image/video posts for the feed (empty until clients upload). */
export async function fetchRecentFeedMediaPosts(limit = 12): Promise<{ data: FeedMediaPostRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from("feed_media_posts")
    .select("id, user_id, body, storage_path, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data: (data as FeedMediaPostRow[]) ?? [], error: error ? new Error(error.message) : null };
}

/** Public URL for a row in `feed_media_posts.storage_path` (avatars bucket). */
export function feedMediaPublicUrl(storagePath: string): string | null {
  if (!supabase) return null;
  const p = storagePath?.trim();
  if (!p) return null;
  const { data } = supabase.storage.from("avatars").getPublicUrl(p);
  return data.publicUrl ?? null;
}

export function feedMediaVariantFromPath(storagePath: string): "post" | "reel" {
  const p = storagePath.toLowerCase();
  if (p.includes("/reels/") || p.includes("feed/reels")) return "reel";
  return "post";
}

export function feedMediaLooksVideo(storagePath: string, publicUrl: string | null): boolean {
  const blob = `${storagePath} ${publicUrl ?? ""}`.toLowerCase();
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(blob);
}

/**
 * Recent photo/reel posts, excluding creators whose `athlete_profile.is_private` is true.
 * The viewer always sees their own uploads.
 */
export async function fetchPublicFeedMediaPosts(params: {
  limit?: number;
  viewerUserId?: string | null;
}): Promise<{ data: FeedMediaPostRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const cap = Math.min(Math.max(1, params.limit ?? 24), 80);
  const { data: rows, error } = await supabase
    .from("feed_media_posts")
    .select("id, user_id, body, storage_path, created_at")
    .order("created_at", { ascending: false })
    .limit(cap * 3);

  if (error) return { data: [], error: new Error(error.message) };
  const list = (rows as FeedMediaPostRow[]) ?? [];
  if (!list.length) return { data: [], error: null };

  const userIds = [...new Set(list.map((r) => r.user_id))];
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, athlete_profile")
    .in("id", userIds);

  if (profErr || !profiles?.length) {
    return { data: list.slice(0, cap), error: null };
  }

  const viewer = params.viewerUserId?.trim() ?? null;
  const privateByUser = new Map<string, boolean>();
  for (const row of profiles as { id: string; athlete_profile?: unknown }[]) {
    privateByUser.set(row.id, Boolean(parseAthleteProfile(row.athlete_profile).is_private));
  }

  const filtered = list.filter((r) => {
    if (viewer && r.user_id === viewer) return true;
    return !privateByUser.get(r.user_id);
  });

  return { data: filtered.slice(0, cap), error: null };
}

/** Single chronological stream: unified RPC rows + media posts (Explore / Feed “Global network”). */
export type GlobalNetworkItem =
  | { type: "unified"; item: UnifiedFeedItem }
  | { type: "media"; item: FeedMediaPostRow; variant: "post" | "reel" };

export function mergeGlobalNetworkChronological(
  unified: UnifiedFeedItem[],
  media: FeedMediaPostRow[]
): GlobalNetworkItem[] {
  const merged: GlobalNetworkItem[] = [
    ...unified.map((item) => ({ type: "unified" as const, item })),
    ...media.map((item) => ({
      type: "media" as const,
      item,
      variant: feedMediaVariantFromPath(item.storage_path),
    })),
  ];
  merged.sort((a, b) => {
    const ta = new Date(a.type === "unified" ? a.item.created_at : a.item.created_at).getTime();
    const tb = new Date(b.type === "unified" ? b.item.created_at : b.item.created_at).getTime();
    return tb - ta;
  });
  return merged;
}

// —— Auth (email/password, OWASP-aligned) ——

const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(password: string): { ok: boolean; message?: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, message: "Password must include letters and numbers" };
  }
  return { ok: true };
}

export async function signUp(email: string, password: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error("Supabase not configured") };
  const validation = validatePassword(password);
  if (!validation.ok) return { error: new Error(validation.message) };
  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error: error ? new Error(error.message) : null };
}

export async function signIn(email: string, password: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  return { error: error ? new Error(error.message) : null };
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}

export async function resetPassword(email: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/login`,
  });
  return { error: error ? new Error(error.message) : null };
}

export async function uploadAvatarImage(file: File): Promise<{ url: string | null; error: Error | null }> {
  if (!supabase) return { url: null, error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { url: null, error: new Error("Not signed in") };

  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });
  if (uploadError) {
    const hint =
      uploadError.message?.toLowerCase().includes("row-level security") ||
      uploadError.message?.toLowerCase().includes("policy")
        ? " Run supabase/migrations/20250322000000_storage_avatars_bucket.sql in the SQL Editor (bucket + RLS)."
        : "";
    return { url: null, error: new Error(`${uploadError.message}${hint}`) };
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: data.publicUrl ?? null, error: null };
}

/** Images/videos for profile stories (same public bucket, `stories/` prefix). */
export async function uploadProfileStoryMedia(file: File): Promise<{ url: string | null; error: Error | null }> {
  if (!supabase) return { url: null, error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { url: null, error: new Error("Not signed in") };

  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `stories/${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (uploadError) return { url: null, error: new Error(uploadError.message) };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: data.publicUrl ?? null, error: null };
}

/** Profile post / reel media in the public `avatars` bucket (`feed/posts|reels/…`). */
export async function uploadProfileFeedMedia(
  file: File,
  folder: "posts" | "reels"
): Promise<{ url: string | null; error: Error | null }> {
  if (!supabase) return { url: null, error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { url: null, error: new Error("Not signed in") };

  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `feed/${folder}/${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (uploadError) return { url: null, error: new Error(uploadError.message) };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: data.publicUrl ?? null, error: null };
}

// —— Games ——

export async function getGamesNearby(
  lat: number,
  lng: number,
  radiusKm: number = DEFAULT_RADIUS_KM
): Promise<{ data: GameRow[] | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_games_nearby", {
    lat,
    lng,
    radius_km: radiusKm,
  });
  return { data: (data as GameRow[]) ?? null, error: error ? new Error(error.message) : null };
}

export async function createGame(params: {
  title: string;
  sport: string;
  lat: number;
  lng: number;
  spotsNeeded?: number;
  /** ISO date-time string for when the game starts (optional). */
  startsAt?: string | null;
  /** Short social-style blurb (optional). */
  description?: string | null;
  /** Structured preferences shown to players (optional). */
  requirements?: Record<string, unknown> | null;
  /** How long the game stays Live on the map (minutes, 15–480). Default 90. */
  durationMinutes?: number;
  /** Chat membership / map visibility rule. Default 'public'. */
  visibility?: GameVisibility;
  /** Optional override (e.g. selected venue name) — skips reverse-geocode. */
  locationLabel?: string | null;
}): Promise<{ gameId: string | null; error: Error | null }> {
  if (!supabase) return { gameId: null, error: new Error("Supabase not configured") };
  let locationLabel: string | null = params.locationLabel?.trim() || null;
  if (!locationLabel) {
    try {
      locationLabel = await reverseGeocodeLocationLabel(params.lat, params.lng);
    } catch {
      locationLabel = null;
    }
  }
  const rpcArgs: Record<string, unknown> = {
    p_title: params.title.trim() || "Pickup game",
    p_sport: params.sport,
    p_lat: params.lat,
    p_lng: params.lng,
    p_spots_needed: params.spotsNeeded ?? 2,
    p_starts_at: params.startsAt ?? null,
    p_location_label: locationLabel,
    p_description: params.description?.trim() ? params.description.trim() : null,
    p_requirements:
      params.requirements && Object.keys(params.requirements).length > 0 ? params.requirements : {},
    p_duration_minutes: clampDurationMinutes(params.durationMinutes ?? 90),
    p_visibility: normalizeVisibility(params.visibility),
  };

  let { data, error } = await supabase.rpc("create_game", rpcArgs);

  // If the deployed `create_game` predates the duration/visibility migration,
  // fall back to the legacy signature so creation still works. Surface a
  // friendly hint so the operator knows to apply the migration.
  if (error && isMissingDurationVisibilityArg(error)) {
    const legacy = await supabase.rpc("create_game", {
      p_title: rpcArgs.p_title,
      p_sport: rpcArgs.p_sport,
      p_lat: rpcArgs.p_lat,
      p_lng: rpcArgs.p_lng,
      p_spots_needed: rpcArgs.p_spots_needed,
      p_starts_at: rpcArgs.p_starts_at,
      p_location_label: rpcArgs.p_location_label,
      p_description: rpcArgs.p_description,
      p_requirements: rpcArgs.p_requirements,
    });
    data = legacy.data;
    error = legacy.error;
    if (!error) {
      console.warn(
        "[FUN] create_game: duration_minutes / visibility ignored. Apply supabase/migrations/20260501080000_game_duration_and_visibility.sql, then NOTIFY pgrst, 'reload schema'."
      );
    }
  }

  return { gameId: data as string | null, error: error ? new Error(error.message) : null };
}

const ALLOWED_VISIBILITIES: GameVisibility[] = ["public", "friends_only", "invite_only"];

function normalizeVisibility(v: GameVisibility | undefined): GameVisibility {
  return v && ALLOWED_VISIBILITIES.includes(v) ? v : "public";
}

function clampDurationMinutes(n: number): number {
  if (!Number.isFinite(n)) return 90;
  return Math.max(15, Math.min(480, Math.round(n)));
}

function isMissingDurationVisibilityArg(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    err.code === "PGRST202" ||
    m.includes("p_duration_minutes") ||
    m.includes("p_visibility") ||
    (m.includes("could not find") && m.includes("function")) ||
    m.includes("schema cache")
  );
}

export async function joinGame(gameId: string): Promise<{
  error: Error | null;
  role?: "player" | "substitute";
  spotsInfo?: { spotsNeeded: number; currentParticipants: number };
}> {
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Not signed in") };

  const { data, error } = await supabase.rpc("join_game", { p_game_id: gameId });

  if (error) return { error: new Error(error.message) };

  const result = data as {
    success?: boolean;
    role?: "player" | "substitute";
    error?: string;
    spots_needed?: number;
    current_participants?: number;
  } | null;

  if (!result?.success) {
    return {
      error: new Error(result?.error ?? "Failed to join game"),
      spotsInfo: result?.spots_needed && result?.current_participants ? {
        spotsNeeded: result.spots_needed,
        currentParticipants: result.current_participants,
      } : undefined,
    };
  }

  return { error: null, role: result.role };
}

export async function leaveGame(gameId: string): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Error("Not signed in");

  // Atomic RPC: if a substitute is waiting, promotes them automatically
  const { data, error } = await supabase.rpc("leave_game", { p_game_id: gameId });
  if (error) return new Error(error.message);

  const result = data as { success?: boolean; error?: string } | null;
  return result?.success ? null : new Error(result?.error ?? "Failed to leave game");
}

/** Remove a game you created (`created_by`). Cascades participants, messages, etc. Requires RLS policy `Hosts can delete own games`. */
export async function deleteHostedGame(gameId: string): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Error("Not signed in");

  // `.select()` so we can tell 0-row deletes (RLS / wrong id) from success — otherwise PostgREST can return no error.
  const { data, error } = await supabase
    .from("games")
    .delete()
    .eq("id", gameId)
    .eq("created_by", user.id)
    .select("id");

  if (error) return new Error(error.message);
  if (!data?.length) {
    return new Error(
      "Could not delete this game. If you created it, run the latest Supabase migrations (Hosts can delete own games) or check that created_by matches your account."
    );
  }
  return null;
}

const HOST_GAME_RPC_MIGRATION =
  "supabase/migrations/20260325030000_live_game_ttl_and_inactive_locations.sql";

function hostGameRpcError(error: { code?: string; message?: string }): Error {
  const msg = error.message ?? "";
  const missing =
    error.code === "PGRST202" ||
    /not found|could not find function|404/i.test(msg);
  if (missing) {
    return new Error(
      `Start/End game RPCs are not deployed. Run ${HOST_GAME_RPC_MIGRATION} in the Supabase SQL Editor (run earlier migrations first if the script errors), then reload the app.`
    );
  }
  return new Error(msg);
}

export async function startGame(gameId: string): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase.rpc("start_game", { p_game_id: gameId });
  return error ? hostGameRpcError(error) : null;
}

export async function endGame(gameId: string): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase.rpc("end_game", { p_game_id: gameId });
  return error ? hostGameRpcError(error) : null;
}

export async function getGameLatLng(gameId: string): Promise<{ lat: number; lng: number } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_game_lat_lng", {
    p_game_id: gameId,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  const lat = (row as any).lat;
  const lng = (row as any).lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
}

export async function completeGame(params: {
  gameId: string;
  winnerTeamOrUser?: string | null;
  score?: Record<string, unknown> | null;
}): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase.rpc("complete_game", {
    p_game_id: params.gameId,
    p_winner_team_or_user: params.winnerTeamOrUser ?? null,
    p_score: params.score ?? null,
  });
  return error ? new Error(error.message) : null;
}

// —— Profiles (incl. 3D avatar) ——

export async function getProfilesNearby(
  lat: number,
  lng: number,
  radiusKm: number = 5,
  limit: number = DEFAULT_PROFILES_LIMIT
): Promise<{ data: ProfileNearbyRow[] | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_profiles_nearby", {
    lat,
    lng,
    radius_km: radiusKm,
    limit_count: limit,
  });
  return { data: (data as ProfileNearbyRow[]) ?? null, error: error ? new Error(error.message) : null };
}

/** Full profile row when `athlete_profile` migration has been applied. */
const PROFILE_SELECT_WITH_ATHLETE =
  "avatar_id, display_name, avatar_url, onboarding_completed, athlete_profile";
/** Works on older DBs before the athlete_profile jsonb column exists. */
const PROFILE_SELECT_BASE = "avatar_id, display_name, avatar_url, onboarding_completed";
const PROFILE_SELECT_MIN = "avatar_id, display_name, avatar_url";

const ATHLETE_PROFILE_COLUMN_LS_KEY = "fun_profiles_athlete_column";

type AthleteProfileColumnState = "unknown" | "present" | "absent";

function readAthleteProfileColumnState(): AthleteProfileColumnState {
  try {
    const v = localStorage.getItem(ATHLETE_PROFILE_COLUMN_LS_KEY);
    if (v === "present") return "present";
    if (v === "absent") return "absent";
  } catch {
    /* private mode */
  }
  return "unknown";
}

function writeAthleteProfileColumnState(s: "present" | "absent") {
  try {
    localStorage.setItem(ATHLETE_PROFILE_COLUMN_LS_KEY, s);
  } catch {
    /* ignore */
  }
}

/** Call after you add `profiles.athlete_profile` in Supabase so the app retries the full select. */
export function clearAthleteProfileColumnCache() {
  try {
    localStorage.removeItem(ATHLETE_PROFILE_COLUMN_LS_KEY);
  } catch {
    /* ignore */
  }
}

function isMissingAthleteProfileColumnError(err: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} | null): boolean {
  if (!err) return false;
  const blob = `${err.message ?? ""} ${err.details ?? ""} ${err.hint ?? ""} ${err.code ?? ""}`.toLowerCase();
  if (blob.includes("athlete_profile")) return true;
  if (blob.includes("could not find") && blob.includes("column")) return true;
  if (blob.includes("column") && blob.includes("does not exist")) return true;
  return err.code === "42703";
}

/** One in-flight probe per user so parallel getMyProfile() calls only trigger a single failing select. */
const athleteProfileProbeByUser = new Map<
  string,
  Promise<{ ok: true; row: Record<string, unknown> } | { ok: false }>
>();

async function probeProfileRowWithAthlete(userId: string): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false }> {
  const existing = athleteProfileProbeByUser.get(userId);
  if (existing) return existing;

  const p = (async () => {
    const res = await supabase!
      .from("profiles")
      .select(PROFILE_SELECT_WITH_ATHLETE)
      .eq("id", userId)
      .maybeSingle();
    if (!res.error && res.data) {
      writeAthleteProfileColumnState("present");
      return { ok: true, row: res.data as Record<string, unknown> };
    }
    if (res.error && isMissingAthleteProfileColumnError(res.error)) {
      writeAthleteProfileColumnState("absent");
    }
    return { ok: false };
  })().finally(() => {
    athleteProfileProbeByUser.delete(userId);
  });

  athleteProfileProbeByUser.set(userId, p);
  return p;
}

async function fetchProfileRow(
  userId: string
): Promise<{
  row: Record<string, unknown> | null;
  athleteProfileRaw: unknown;
  error: Error | null;
}> {
  return cachedAsync(`profiles:row:${userId}`, 15_000, async () => {
    if (!supabase) return { row: null, athleteProfileRaw: null, error: new Error("Supabase not configured") };

    const colState = readAthleteProfileColumnState();

    if (colState === "present") {
      const res = await supabase
        .from("profiles")
        .select(PROFILE_SELECT_WITH_ATHLETE)
        .eq("id", userId)
        .maybeSingle();
      if (!res.error && res.data) {
        const r = res.data as Record<string, unknown>;
        return { row: r, athleteProfileRaw: r.athlete_profile, error: null };
      }
      clearAthleteProfileColumnCache();
    }

    if (readAthleteProfileColumnState() !== "absent") {
      const probed = await probeProfileRowWithAthlete(userId);
      if (probed.ok) {
        const r = probed.row;
        return { row: r, athleteProfileRaw: r.athlete_profile, error: null };
      }
    }

    let { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT_BASE)
      .eq("id", userId)
      .maybeSingle();

    if (!error && data) {
      const r = data as Record<string, unknown>;
      return { row: r, athleteProfileRaw: null, error: null };
    }

    const last = await supabase.from("profiles").select(PROFILE_SELECT_MIN).eq("id", userId).maybeSingle();
    if (last.error || !last.data) {
      return {
        row: null,
        athleteProfileRaw: null,
        error: new Error(last.error?.message ?? error?.message ?? "Profile fetch failed"),
      };
    }
    const r = last.data as Record<string, unknown>;
    return { row: r, athleteProfileRaw: null, error: null };
  });
}

export async function updateMyAvatarId(avatarId: string | null): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Error("Not signed in");
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_id: avatarId, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (!error) cacheClear(`profiles:row:${user.id}`);
  return error ? new Error(error.message) : null;
}

/** Read any profile by id (RLS: profiles are publicly readable). */
export async function getPublicProfileById(userId: string): Promise<{
  avatarId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  onboardingCompleted: boolean;
  athleteProfile: AthleteProfilePayload;
  error: Error | null;
}> {
  if (!supabase) {
    return {
      avatarId: null,
      displayName: null,
      avatarUrl: null,
      onboardingCompleted: false,
      athleteProfile: parseAthleteProfile(null),
      error: new Error("Supabase not configured"),
    };
  }
  const { row, athleteProfileRaw, error } = await fetchProfileRow(userId);
  if (error || !row) {
    return {
      avatarId: null,
      displayName: null,
      avatarUrl: null,
      onboardingCompleted: false,
      athleteProfile: parseAthleteProfile(null),
      error: error ?? new Error("Profile not found"),
    };
  }
  return {
    avatarId: (row.avatar_id as string | undefined) ?? null,
    displayName: (row.display_name as string | undefined) ?? null,
    avatarUrl: (row.avatar_url as string | undefined) ?? null,
    onboardingCompleted: (row.onboarding_completed as boolean | undefined) ?? true,
    athleteProfile: parseAthleteProfile(athleteProfileRaw),
    error: null,
  };
}

export async function getMyProfile(): Promise<{
  avatarId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  onboardingCompleted: boolean;
  athleteProfile: AthleteProfilePayload;
  error: Error | null;
}> {
  if (!supabase) {
    return {
      avatarId: null,
      displayName: null,
      avatarUrl: null,
      onboardingCompleted: false,
      athleteProfile: parseAthleteProfile(null),
      error: new Error("Supabase not configured"),
    };
  }
  const user = await getAuthUserDeduped();
  if (!user) {
    return {
      avatarId: null,
      displayName: null,
      avatarUrl: null,
      onboardingCompleted: false,
      athleteProfile: parseAthleteProfile(null),
      error: new Error("Not signed in"),
    };
  }

  const { row, athleteProfileRaw, error } = await fetchProfileRow(user.id);
  if (error || !row) {
    return {
      avatarId: null,
      displayName: null,
      avatarUrl: null,
      onboardingCompleted: false,
      athleteProfile: parseAthleteProfile(null),
      error: error ?? new Error("Profile not found"),
    };
  }

  return {
    avatarId: (row.avatar_id as string | undefined) ?? null,
    displayName: (row.display_name as string | undefined) ?? null,
    avatarUrl: (row.avatar_url as string | undefined) ?? null,
    onboardingCompleted: (row.onboarding_completed as boolean | undefined) ?? true,
    athleteProfile: parseAthleteProfile(athleteProfileRaw),
    error: null,
  };
}

export async function updateMyProfile(updates: {
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_id?: string | null;
  onboarding_completed?: boolean;
  athlete_profile?: AthleteProfilePayload;
}): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const user = await getAuthUserDeduped();
  if (!user) return new Error("Not signed in");
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.display_name !== undefined) set.display_name = updates.display_name;
  if (updates.avatar_url !== undefined) set.avatar_url = updates.avatar_url;
  if (updates.avatar_id !== undefined) set.avatar_id = updates.avatar_id;
  if (updates.onboarding_completed !== undefined) set.onboarding_completed = updates.onboarding_completed;
  if (updates.athlete_profile !== undefined) set.athlete_profile = updates.athlete_profile;

  const { error } = await supabase.from("profiles").update(set).eq("id", user.id);

  if (error && updates.athlete_profile !== undefined) {
    // Only treat as "missing column" when Postgres/PostgREST actually says so; otherwise a
    // successful retry without athlete_profile would falsely claim the column is missing.
    if (!isMissingAthleteProfileColumnError(error)) {
      return new Error(error.message);
    }
    writeAthleteProfileColumnState("absent");
    const withoutAthlete = { ...set };
    delete withoutAthlete.athlete_profile;
    const { error: err2 } = await supabase.from("profiles").update(withoutAthlete).eq("id", user.id);
    if (err2) return new Error(err2.message);
    cacheClear(`profiles:row:${user.id}`);
    return new Error(
      "Athlete card data was not saved: your Supabase project is missing the column profiles.athlete_profile (jsonb). " +
        "Run the migration in supabase/migrations/20250320000000_athlete_profile_jsonb.sql (SQL Editor). " +
        "If the column already exists, run NOTIFY pgrst, 'reload schema'; in the SQL Editor so the API picks it up. " +
        "Other profile fields were updated.",
    );
  }

  if (!error && updates.athlete_profile !== undefined) {
    writeAthleteProfileColumnState("present");
  }
  if (!error) cacheClear(`profiles:row:${user.id}`);

  return error ? new Error(error.message) : null;
}

// —— User stats & badges ——

export async function getMyStats(): Promise<{ data: UserStatsRow | null; error: Error | null }> {
  if (!supabase) return { data: null, error: null };
  const user = await getAuthUserDeduped();
  if (!user) return { data: null, error: null };
  const { data, error } = await supabase
    .from("user_stats")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return { data: null, error: null };
  return { data: data as UserStatsRow | null, error: null };
}

export async function getMyBadges(): Promise<{ data: UserBadgeRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const user = await getAuthUserDeduped();
  if (!user) return { data: [], error: new Error("Not signed in") };
  const { data, error } = await supabase
    .from("user_badges")
    .select("*, badges(*)")
    .eq("user_id", user.id)
    .order("awarded_at", { ascending: false });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data as UserBadgeRow[]) ?? [], error: null };
}

// —— Notifications ——

export async function getMyNotifications(limit = 20): Promise<{
  data: NotificationRow[];
  error: Error | null;
}> {
  if (!supabase) return { data: [], error: null };
  const user = await getAuthUserDeduped();
  if (!user) return { data: [], error: null };
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { data: [], error: null };
  return { data: (data as NotificationRow[]) ?? [], error: null };
}

export async function markNotificationRead(notificationId: string): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
  return error ? new Error(error.message) : null;
}

/** Subscribe to new notifications for the current user (Realtime). Call returned fn to unsubscribe. */
export function subscribeToNotifications(args: {
  userId: string;
  onInsert: (row: NotificationRow) => void;
}): (() => void) | null {
  if (!supabase) return null;
  const client = supabase; // capture non-null reference; type narrowing doesn't extend into closures
  const userId = args.userId.trim();
  if (!userId) return null;

  const channel = client
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        args.onInsert(payload.new as NotificationRow);
      }
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

function profileNearbyToSearchRow(r: ProfileNearbyRow): ProfileSearchRow {
  return {
    profile_id: r.profile_id,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    handle: null,
    city: null,
    favorite_sport: null,
    distance_km: r.distance_km,
    rank_score: null,
  };
}

/**
 * Nearby profiles when lat/lng are known, otherwise similar athletes by sport / generic browse.
 */
export async function fetchDiscoveredAthletes(params: {
  excludeUserId: string;
  lat?: number | null;
  lng?: number | null;
  primarySports?: string[];
  limit?: number;
}): Promise<ProfileSearchRow[]> {
  const limit = Math.min(params.limit ?? 12, 25);
  const { excludeUserId } = params;

  if (params.lat != null && params.lng != null) {
    const { data, error } = await getProfilesNearby(params.lat, params.lng, 40, limit + 10);
    if (!error && data?.length) {
      return data
        .filter((r) => r.profile_id !== excludeUserId)
        .slice(0, limit)
        .map(profileNearbyToSearchRow);
    }
  }

  for (const sport of params.primarySports ?? []) {
    const s = sport.trim();
    if (s.length < 2) continue;
    const rows = await searchPeople({
      q: s,
      lat: params.lat ?? null,
      lng: params.lng ?? null,
      limit,
      excludeUserId,
    });
    if (rows.length) return rows;
  }

  return searchPeople({
    q: "athlete",
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    limit,
    excludeUserId,
  });
}

// —— Helpers for 3D avatar URL ——

/** Build Ready Player Me GLB URL from avatar_id (from profiles). */
export function avatarIdToGlbUrl(avatarId: string | null, quality: "low" | "medium" | "high" = "low"): string | null {
  if (!avatarId?.trim()) return null;
  return `https://models.readyplayer.me/${avatarId.trim()}.glb?quality=${quality}`;
}
