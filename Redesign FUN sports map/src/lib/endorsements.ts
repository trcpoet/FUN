import { supabase } from "./supabase";
import { cachedAsync } from "./requestCache";

export type SharedCompletedGameRow = {
  game_id: string;
  title: string | null;
  sport: string | null;
  starts_at: string | null;
  completed_at: string | null;
};

export type AthleteReputationRow = {
  sportsmanship_avg: number;
  sportsmanship_count: number;
};

export async function getSharedCompletedGames(otherUserId: string): Promise<{
  data: SharedCompletedGameRow[] | null;
  error: Error | null;
}> {
  return cachedAsync(`endorsements:sharedGames:${otherUserId}`, 30_000, async () => {
    if (!supabase) return { data: null, error: new Error("Supabase not configured") };
    const { data, error } = await supabase.rpc("get_shared_completed_games", { p_other: otherUserId });
    return {
      data: (data as SharedCompletedGameRow[]) ?? null,
      error: error ? new Error(error.message) : null,
    };
  });
}

export async function endorseAthlete(params: {
  athleteId: string;
  gameId: string;
  rating: number;
  tags: string[];
}): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase.rpc("endorse_athlete", {
    p_athlete: params.athleteId,
    p_game: params.gameId,
    p_rating: params.rating,
    p_tags: params.tags,
  });
  return error ? new Error(error.message) : null;
}

export async function getAthleteReputation(athleteId: string): Promise<{
  data: AthleteReputationRow | null;
  error: Error | null;
}> {
  return cachedAsync(`endorsements:reputation:${athleteId}`, 60_000, async () => {
    if (!supabase) return { data: null, error: new Error("Supabase not configured") };
    const { data, error } = await supabase.rpc("get_athlete_reputation", { p_athlete: athleteId });
    const rows = (data as AthleteReputationRow[]) ?? [];
    return {
      data: rows[0] ?? null,
      error: error ? new Error(error.message) : null,
    };
  });
}

