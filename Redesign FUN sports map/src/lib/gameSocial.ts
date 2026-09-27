/**
 * The public conversation on a game.
 *
 * Distinct from `gameChat.ts`, which is the private thread for the people who
 * already joined. This is what someone reads while deciding whether to: "is this
 * beginner friendly?", "is there parking?", "anyone bringing a ball?".
 *
 * Shapes mirror the map-note equivalents exactly (`get_note_comments_with_likes`,
 * `add_note_comment`, `toggle_note_comment_like`), because the feed renders both
 * through the same components and a second, differently-shaped system would be a
 * second set of bugs.
 *
 * Every function degrades rather than throws when the migration is not deployed:
 * an un-migrated database shows a game with no conversation, not a broken feed.
 */
import { supabase } from "./supabase";
import { isMissingRpc } from "./rpcErrors";
import { isGuestSession } from "./guestRpc";

export const GAME_SOCIAL_MIGRATION = "supabase/migrations/20260927130000_game_social.sql";

export type GameCommentRow = {
  id: string;
  created_at: string;
  game_id: string;
  /** Null for a guest read — the wrapper projects no identity. */
  user_id: string | null;
  body: string;
  like_count: number;
  liked_by_me: boolean;
};

export type GameSocialCounts = {
  game_id: string;
  comment_count: number;
  like_count: number;
  liked_by_me: boolean;
};

function notDeployed(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (isMissingRpc(error)) return true;
  const m = (error.message ?? "").toLowerCase();
  // A table that does not exist yet reads as 42P01 through PostgREST.
  return error.code === "42P01" || m.includes("game_comments") || m.includes("game_likes");
}

export async function fetchGameComments(
  gameId: string,
): Promise<{ data: GameCommentRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const guest = await isGuestSession();
  const fn = guest ? "get_guest_game_comments" : "get_game_comments_with_likes";
  const { data, error } = await supabase.rpc(fn, { p_game_id: gameId });
  if (error) {
    if (notDeployed(error)) return { data: [], error: null };
    return { data: [], error: new Error(error.message) };
  }
  return { data: (data as GameCommentRow[]) ?? [], error: null };
}

export async function addGameComment(params: {
  gameId: string;
  body: string;
}): Promise<{ data: GameCommentRow | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const trimmed = params.body.trim();
  if (!trimmed) return { data: null, error: new Error("Comment is empty") };
  const { data, error } = await supabase.rpc("add_game_comment", {
    p_game_id: params.gameId,
    p_body: trimmed.slice(0, 2000),
  });
  if (error) {
    if (notDeployed(error)) {
      return {
        data: null,
        error: new Error(
          `Game comments are not deployed yet. Run ${GAME_SOCIAL_MIGRATION}, then NOTIFY pgrst, 'reload schema'.`,
        ),
      };
    }
    return { data: null, error: new Error(error.message) };
  }
  // `add_game_comment` returns the raw row; the two like fields are known.
  const row = data as Omit<GameCommentRow, "like_count" | "liked_by_me"> | null;
  return {
    data: row ? { ...row, like_count: 0, liked_by_me: false } : null,
    error: null,
  };
}

export async function deleteGameComment(
  commentId: string,
): Promise<{ deleted: boolean; error: Error | null }> {
  if (!supabase) return { deleted: false, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("delete_game_comment", { p_comment_id: commentId });
  if (error) return { deleted: false, error: new Error(error.message) };
  return { deleted: data === true, error: null };
}

/** Both toggles return the state AFTER the toggle, so callers can trust the answer. */
export async function toggleGameCommentLike(
  commentId: string,
): Promise<{ liked: boolean; error: Error | null }> {
  if (!supabase) return { liked: false, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("toggle_game_comment_like", { p_comment_id: commentId });
  if (error) return { liked: false, error: new Error(error.message) };
  return { liked: data === true, error: null };
}

export async function toggleGameLike(
  gameId: string,
): Promise<{ liked: boolean; error: Error | null }> {
  if (!supabase) return { liked: false, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("toggle_game_like", { p_game_id: gameId });
  if (error) {
    if (notDeployed(error)) {
      return {
        liked: false,
        error: new Error(`Game likes are not deployed yet. Run ${GAME_SOCIAL_MIGRATION}.`),
      };
    }
    return { liked: false, error: new Error(error.message) };
  }
  return { liked: data === true, error: null };
}

/** Counts for a batch of games, for a surface that lists them (the map carousel). */
export async function fetchGameSocialCounts(
  gameIds: string[],
): Promise<{ data: Map<string, GameSocialCounts>; error: Error | null }> {
  const empty = new Map<string, GameSocialCounts>();
  if (!supabase || gameIds.length === 0) return { data: empty, error: null };
  const { data, error } = await supabase.rpc("get_game_social_counts", { p_game_ids: gameIds });
  if (error) {
    if (notDeployed(error)) return { data: empty, error: null };
    return { data: empty, error: new Error(error.message) };
  }
  const out = new Map<string, GameSocialCounts>();
  for (const row of (data as GameSocialCounts[]) ?? []) out.set(row.game_id, row);
  return { data: out, error: null };
}
