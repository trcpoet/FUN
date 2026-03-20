import { SPORT_OPTIONS } from "./sports";
import type { GameRow } from "./supabase";

/** Match user query to a canonical sport label, or null. */
export function findSportMatch(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return null;

  for (const s of SPORT_OPTIONS) {
    const sl = s.toLowerCase();
    if (sl === q) return s;
    if (sl.startsWith(q)) return s;
    if (q.length >= 3 && sl.includes(q)) return s;
  }
  return null;
}

export function gameMatchesSport(gameSport: string, canonicalSport: string): boolean {
  return gameSport.trim().toLowerCase() === canonicalSport.trim().toLowerCase();
}

export function gamesMatchingSport(games: GameRow[], canonicalSport: string): GameRow[] {
  return games.filter((g) => gameMatchesSport(g.sport, canonicalSport));
}

/** Nearest game by `distance_km` from RPC (already sorted by distance optional). */
export function closestGame(games: GameRow[]): GameRow | null {
  if (games.length === 0) return null;
  return games.reduce((a, b) => (a.distance_km <= b.distance_km ? a : b));
}
