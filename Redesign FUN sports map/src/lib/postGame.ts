/**
 * The loop that closes after the game: did it happen, who was good, run it back.
 *
 * The trust system this feeds has been built and unused since it shipped —
 * `athlete_endorsements`, `endorse_athlete`, `get_athlete_reputation`,
 * `profiles.sportsmanship_avg`, `TrustRatingsBlock`, the badge in chat. Every
 * rating in the database is zero because nothing has ever asked for one. What
 * was missing was the moment, not the machinery, and the moment is the game's
 * own thread once the game is over.
 *
 * Every read degrades to "nothing to show" when the migration is not deployed,
 * so an un-migrated database gets a chat thread with no prompt rather than an
 * error under every finished game.
 */
import { supabase } from "./supabase";
import { isMissingRpc } from "./rpcErrors";

export const POST_GAME_MIGRATION = "supabase/migrations/20260927160000_post_game_loop.sql";

/** `played` = it happened and I was there. `no_show` = I went, it did not. */
export type GameOutcome = "played" | "no_show" | "missed_it";

export type GameOutcomeSummary = {
  my_outcome: GameOutcome | null;
  played_count: number;
  no_show_count: number;
  missed_count: number;
  total_reports: number;
  participants: number;
};

export type RateableTeammate = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  /** 1-5, or null when you have not rated them for this game yet. */
  my_rating: number | null;
};

export type RematchPoll = {
  poll_id: string;
  created_by: string;
  question: string | null;
  created_at: string;
  closed_at: string | null;
  in_count: number;
  out_count: number;
  my_choice: "in" | "out" | null;
};

function absent(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (isMissingRpc(error)) return true;
  const m = (error.message ?? "").toLowerCase();
  return error.code === "42P01" || m.includes("game_outcome_reports") || m.includes("game_polls");
}

export async function fetchGameOutcomeSummary(
  gameId: string,
): Promise<{ data: GameOutcomeSummary | null; error: Error | null }> {
  if (!supabase) return { data: null, error: null };
  const { data, error } = await supabase.rpc("get_game_outcome_summary", { p_game_id: gameId });
  if (error) {
    if (absent(error)) return { data: null, error: null };
    return { data: null, error: new Error(error.message) };
  }
  const rows = (data as GameOutcomeSummary[]) ?? [];
  return { data: rows[0] ?? null, error: null };
}

export async function reportGameOutcome(
  gameId: string,
  outcome: GameOutcome,
): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase.rpc("report_game_outcome", {
    p_game_id: gameId,
    p_outcome: outcome,
  });
  if (!error) return null;
  if (absent(error)) {
    return new Error(`Not deployed yet. Run ${POST_GAME_MIGRATION}, then NOTIFY pgrst, 'reload schema'.`);
  }
  return new Error(error.message);
}

export async function fetchRateableTeammates(
  gameId: string,
): Promise<{ data: RateableTeammate[]; error: Error | null }> {
  if (!supabase) return { data: [], error: null };
  const { data, error } = await supabase.rpc("get_rateable_teammates", { p_game_id: gameId });
  if (error) {
    if (absent(error)) return { data: [], error: null };
    return { data: [], error: new Error(error.message) };
  }
  return { data: (data as RateableTeammate[]) ?? [], error: null };
}

/** Straight into the RPC that has existed all along. */
export async function rateTeammate(params: {
  gameId: string;
  athleteId: string;
  rating: number;
  tags?: string[];
}): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase.rpc("endorse_athlete", {
    p_athlete: params.athleteId,
    p_game: params.gameId,
    p_rating: params.rating,
    p_tags: params.tags ?? [],
  });
  return error ? new Error(error.message) : null;
}

export async function fetchRematchPoll(
  gameId: string,
): Promise<{ data: RematchPoll | null; error: Error | null }> {
  if (!supabase) return { data: null, error: null };
  const { data, error } = await supabase.rpc("get_rematch_poll", { p_game_id: gameId });
  if (error) {
    if (absent(error)) return { data: null, error: null };
    return { data: null, error: new Error(error.message) };
  }
  const rows = (data as RematchPoll[]) ?? [];
  return { data: rows[0] ?? null, error: null };
}

/** Host only — enforced by the insert policy, not here. Idempotent server-side. */
export async function createRematchPoll(
  gameId: string,
  question?: string | null,
): Promise<{ pollId: string | null; error: Error | null }> {
  if (!supabase) return { pollId: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("create_rematch_poll", {
    p_game_id: gameId,
    p_question: question ?? null,
  });
  if (error) {
    if (absent(error)) {
      return { pollId: null, error: new Error(`Not deployed yet. Run ${POST_GAME_MIGRATION}.`) };
    }
    return { pollId: null, error: new Error(error.message) };
  }
  return { pollId: (data as string) ?? null, error: null };
}

export async function voteRematchPoll(
  pollId: string,
  choice: "in" | "out",
): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase.rpc("vote_rematch_poll", {
    p_poll_id: pollId,
    p_choice: choice,
  });
  return error ? new Error(error.message) : null;
}

export async function closeRematchPoll(pollId: string): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase.rpc("close_rematch_poll", { p_poll_id: pollId });
  return error ? new Error(error.message) : null;
}
