/**
 * Venue social layer: reviews, comments, and member photos.
 *
 * Re-exported from src/lib/api.ts so components keep importing from one place
 * (the "never call supabase directly from a component" rule).
 *
 * Two conventions inherited from the map-notes code, both load-bearing:
 *
 *  - Every function returns `{ data, error }` and never throws.
 *  - READS degrade silently when the RPC is genuinely missing (a DB that hasn't
 *    run the migration shows an empty section rather than an error), while
 *    WRITES surface a message naming the exact migration file. Classification
 *    goes through rpcErrors so a 42501 permission failure is never mistaken for
 *    "not deployed" — that mix-up previously blanked the notes layer.
 */
import { supabase } from "./supabase";
import type { VenueSelection } from "../app/components/mapboxMapTypes";
import { isMissingRpc } from "./rpcErrors";

const REVIEWS_MIGRATION =
  "Venue reviews aren't deployed yet. Run supabase/migrations/20260804091000_venue_reviews_and_comments.sql " +
  "in the Supabase SQL editor, then NOTIFY pgrst, 'reload schema'.";
const PHOTOS_MIGRATION =
  "Venue photos aren't deployed yet. Run supabase/migrations/20260804092000_venue_photos_and_moderation.sql " +
  "and 20260804093000_avatars_storage_venues_path.sql in the Supabase SQL editor, " +
  "then NOTIFY pgrst, 'reload schema'.";

const NOT_CONFIGURED = () => new Error("Supabase not configured");

export type VenueAuthor = {
  authorName: string | null;
  authorAvatarUrl: string | null;
};

export type VenueReviewRow = {
  id: string;
  created_at: string;
  updated_at: string;
  venue_id: string;
  user_id: string;
  rating: number;
  body: string | null;
  is_mine: boolean;
} & VenueAuthor;

export type VenueReviewSummary = { count: number; average: number | null };

export type VenueCommentRow = {
  id: string;
  created_at: string;
  venue_id: string;
  user_id: string;
  body: string;
  like_count: number;
  liked_by_me: boolean;
} & VenueAuthor;

export type VenuePhotoRow = {
  id: string;
  created_at: string;
  venue_id: string;
  user_id: string;
  storage_path: string;
  caption: string | null;
  status: string;
  /** Derived client-side from storage_path — never stored. */
  url: string;
} & VenueAuthor;

const EMPTY_SUMMARY: VenueReviewSummary = { count: 0, average: null };

/**
 * Venue ids contain a slash ("way/12345"). Storage RLS checks the uid at a
 * fixed path segment, so an unescaped slash would shift every later segment
 * and silently fail the policy.
 */
export function venueStorageSlug(venueId: string): string {
  return venueId.replace(/\//g, "_");
}

/** The venue fields ensure_venue_row() needs to materialise a not-yet-cached row. */
function venueArgs(venue: VenueSelection) {
  return {
    p_venue_id: venue.id,
    p_lat: venue.center.lat,
    p_lng: venue.center.lng,
    p_name: venue.name ?? null,
    p_sport: venue.sport ?? null,
    p_leisure: venue.leisure ?? null,
  };
}

/**
 * Attach display name + avatar to rows that carry only a user_id.
 *
 * One batched profiles read rather than a join, because the RPCs are
 * SECURITY INVOKER and profiles has its own RLS — the same approach
 * getPostComments uses.
 */
async function hydrateAuthors<T extends { user_id: string }>(
  rows: T[]
): Promise<(T & VenueAuthor)[]> {
  if (!supabase || rows.length === 0) {
    return rows.map((r) => ({ ...r, authorName: null, authorAvatarUrl: null }));
  }
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", ids);
  const byId = new Map(
    ((profs ?? []) as { id: string; display_name?: string | null; avatar_url?: string | null }[]).map(
      (p) => [p.id, p]
    )
  );
  return rows.map((r) => ({
    ...r,
    authorName: byId.get(r.user_id)?.display_name ?? null,
    authorAvatarUrl: byId.get(r.user_id)?.avatar_url ?? null,
  }));
}

// —— Reviews ——

type RawReview = Omit<VenueReviewRow, keyof VenueAuthor> & {
  total_count: number | null;
  avg_rating: number | string | null;
};

export async function fetchVenueReviews(params: {
  venueId: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: VenueReviewRow[]; summary: VenueReviewSummary; error: Error | null }> {
  if (!supabase) return { data: [], summary: EMPTY_SUMMARY, error: NOT_CONFIGURED() };
  const { data, error } = await supabase.rpc("get_venue_reviews", {
    p_venue_id: params.venueId,
    p_limit: params.limit ?? 20,
    p_offset: params.offset ?? 0,
  });
  if (error) {
    if (isMissingRpc(error)) return { data: [], summary: EMPTY_SUMMARY, error: null };
    return { data: [], summary: EMPTY_SUMMARY, error: new Error(error.message) };
  }

  const rows = (data as RawReview[] | null) ?? [];
  // The aggregate is repeated on every row (one round-trip); zero rows just
  // means zero reviews.
  const first = rows[0];
  const summary: VenueReviewSummary = first
    ? {
        count: first.total_count ?? rows.length,
        average: first.avg_rating === null ? null : Number(first.avg_rating),
      }
    : EMPTY_SUMMARY;

  const hydrated = await hydrateAuthors(
    rows.map(({ total_count: _t, avg_rating: _a, ...r }) => r)
  );
  return { data: hydrated, summary, error: null };
}

export async function upsertVenueReview(params: {
  venue: VenueSelection;
  rating: number;
  body?: string | null;
}): Promise<{ data: VenueReviewRow | null; error: Error | null }> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED() };
  const { data, error } = await supabase.rpc("upsert_venue_review", {
    ...venueArgs(params.venue),
    p_rating: params.rating,
    p_body: params.body?.trim() || null,
  });
  if (error) {
    return { data: null, error: new Error(isMissingRpc(error) ? REVIEWS_MIGRATION : error.message) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as VenueReviewRow | null;
  if (!row) return { data: null, error: null };
  const [hydrated] = await hydrateAuthors([{ ...row, is_mine: true }]);
  return { data: hydrated ?? null, error: null };
}

export async function deleteVenueReview(venueId: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: NOT_CONFIGURED() };
  const { error } = await supabase.rpc("delete_venue_review", { p_venue_id: venueId });
  if (error) return { error: new Error(isMissingRpc(error) ? REVIEWS_MIGRATION : error.message) };
  return { error: null };
}

// —— Comments ——

export async function fetchVenueComments(params: {
  venueId: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: VenueCommentRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: NOT_CONFIGURED() };
  const { data, error } = await supabase.rpc("get_venue_comments_with_likes", {
    p_venue_id: params.venueId,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });
  if (error) {
    if (isMissingRpc(error)) return { data: [], error: null };
    return { data: [], error: new Error(error.message) };
  }
  const rows = (data as Omit<VenueCommentRow, keyof VenueAuthor>[] | null) ?? [];
  return { data: await hydrateAuthors(rows), error: null };
}

export async function addVenueComment(params: {
  venue: VenueSelection;
  body: string;
}): Promise<{ data: VenueCommentRow | null; error: Error | null }> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED() };
  const { data, error } = await supabase.rpc("add_venue_comment", {
    ...venueArgs(params.venue),
    p_body: params.body,
  });
  if (error) {
    return { data: null, error: new Error(isMissingRpc(error) ? REVIEWS_MIGRATION : error.message) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | Omit<VenueCommentRow, keyof VenueAuthor | "like_count" | "liked_by_me">
    | null;
  if (!row) return { data: null, error: null };
  const [hydrated] = await hydrateAuthors([{ ...row, like_count: 0, liked_by_me: false }]);
  return { data: hydrated ?? null, error: null };
}

export async function deleteVenueComment(commentId: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: NOT_CONFIGURED() };
  const { error } = await supabase.rpc("delete_venue_comment", { p_comment_id: commentId });
  if (error) return { error: new Error(isMissingRpc(error) ? REVIEWS_MIGRATION : error.message) };
  return { error: null };
}

/** Atomic server-side toggle; returns the resulting liked state. */
export async function toggleVenueCommentLike(
  commentId: string
): Promise<{ liked: boolean; error: Error | null }> {
  if (!supabase) return { liked: false, error: NOT_CONFIGURED() };
  const { data, error } = await supabase.rpc("toggle_venue_comment_like", {
    p_comment_id: commentId,
  });
  if (error) {
    return { liked: false, error: new Error(isMissingRpc(error) ? REVIEWS_MIGRATION : error.message) };
  }
  return { liked: Boolean(data), error: null };
}

// —— Photos ——

function publicUrlFor(storagePath: string): string {
  if (!supabase) return "";
  return supabase.storage.from("avatars").getPublicUrl(storagePath).data.publicUrl ?? "";
}

export async function fetchVenuePhotos(
  venueId: string
): Promise<{ data: VenuePhotoRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: NOT_CONFIGURED() };
  const { data, error } = await supabase.rpc("get_venue_photos", {
    p_venue_id: venueId,
    p_limit: 30,
  });
  if (error) {
    if (isMissingRpc(error)) return { data: [], error: null };
    return { data: [], error: new Error(error.message) };
  }
  const rows = (data as Omit<VenuePhotoRow, keyof VenueAuthor | "url">[] | null) ?? [];
  const hydrated = await hydrateAuthors(rows);
  return {
    data: hydrated.map((r) => ({ ...r, url: publicUrlFor(r.storage_path) })),
    error: null,
  };
}

/**
 * Upload bytes then register the row.
 *
 * Path shape is venues/<uid>/<venueSlug>/<ts>-<name>, which the storage policy
 * added in 20260804093000 expects; add_venue_photo re-checks the uid segment so
 * a mismatched path can never produce an orphan row.
 */
export async function uploadVenuePhoto(params: {
  venue: VenueSelection;
  file: File;
  caption?: string | null;
}): Promise<{ data: VenuePhotoRow | null; error: Error | null }> {
  if (!supabase) return { data: null, error: NOT_CONFIGURED() };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error("Not signed in") };

  const safeName = params.file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `venues/${user.id}/${venueStorageSlug(params.venue.id)}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, params.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: params.file.type || undefined,
    });
  if (uploadError) return { data: null, error: new Error(uploadError.message) };

  const { data, error } = await supabase.rpc("add_venue_photo", {
    ...venueArgs(params.venue),
    p_storage_path: path,
    p_caption: params.caption?.trim() || null,
  });
  if (error) {
    // Don't strand the object when the row insert fails (quota, RLS, missing RPC).
    void supabase.storage.from("avatars").remove([path]);
    return { data: null, error: new Error(photoWriteMessage(error)) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | Omit<VenuePhotoRow, keyof VenueAuthor | "url">
    | null;
  if (!row) return { data: null, error: null };
  const [hydrated] = await hydrateAuthors([row]);
  return {
    data: hydrated ? { ...hydrated, url: publicUrlFor(hydrated.storage_path) } : null,
    error: null,
  };
}

/** Server-side quota messages, mapped to something a person can act on. */
function photoWriteMessage(error: { message?: string; code?: string; hint?: string | null }): string {
  if (isMissingRpc(error)) return PHOTOS_MIGRATION;
  const msg = error.message ?? "";
  if (msg.includes("photo_limit_venue")) return "You've already added 5 photos to this venue.";
  if (msg.includes("photo_limit_daily")) return "You've hit today's photo limit. Try again tomorrow.";
  if (msg.includes("not_signed_in")) return "Sign in to add a photo.";
  return msg || "Couldn't add that photo.";
}

export async function deleteVenuePhoto(photoId: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: NOT_CONFIGURED() };
  const { data, error } = await supabase.rpc("delete_venue_photo", { p_photo_id: photoId });
  if (error) return { error: new Error(isMissingRpc(error) ? PHOTOS_MIGRATION : error.message) };
  // The RPC hands back the path so the object goes too, not just its row.
  const path = typeof data === "string" ? data : null;
  if (path) void supabase.storage.from("avatars").remove([path]);
  return { error: null };
}

export type VenuePhotoReportReason =
  | "not_this_place"
  | "offensive"
  | "spam"
  | "private"
  | "other";

export async function reportVenuePhoto(params: {
  photoId: string;
  reason?: VenuePhotoReportReason;
}): Promise<{ error: Error | null }> {
  if (!supabase) return { error: NOT_CONFIGURED() };
  const { error } = await supabase.rpc("report_venue_photo", {
    p_photo_id: params.photoId,
    p_reason: params.reason ?? "other",
  });
  if (error) return { error: new Error(isMissingRpc(error) ? PHOTOS_MIGRATION : error.message) };
  return { error: null };
}
