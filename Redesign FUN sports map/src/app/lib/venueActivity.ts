/**
 * Associating games with venues.
 *
 * Games have no `venue_id` — a game knows only its own coordinates and a free-text
 * `location_label` — so "is this game at that venue?" is always a distance test. Mirrors
 * `partitionNotesByVenue` in `notesAtVenue.ts` and reuses the same haversine.
 *
 * Two radii, two meanings (see `mapConfig.ts`):
 *   · GAME_VENUE_ABSORB_RADIUS_METERS — occlusion. The game gives up its own pin.
 *   · VENUE_GAME_LIST_RADIUS_METERS   — discovery. The venue card lists it under "Nearby".
 */
import type { GameRow } from "../../lib/supabase";
import { isGameEnded, isGameLive } from "../../lib/mapGameTimer";
import { haversineDistanceMeters } from "./gamesAtVenue";
import type { VenueAnchor } from "./notesAtVenue";

export type { VenueAnchor };

/**
 * Games that are still worth showing at a point.
 *
 * Replaces the old `status === "open"` test, which silently dropped `status === 'live'` — the
 * moment a host pressed Start, the game disappeared from the venue's Active games tab. The
 * question a venue card asks is "has this finished?", not "is this still accepting players",
 * so the predicate is the canonical `isGameEnded` (handles completed/cancelled plus a past
 * `ends_at`) rather than a status allowlist.
 */
export function activeGamesNearPoint(
  games: GameRow[],
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  nowMs: number
): GameRow[] {
  return games.filter((g) => {
    if (isGameEnded(g, nowMs)) return false;
    return haversineDistanceMeters(centerLat, centerLng, g.lat, g.lng) <= radiusMeters;
  });
}

/**
 * Split games into those sitting on a venue and those standing alone on the map.
 *
 * A game close enough to two venues attaches to the nearest one only, so it can never be
 * absorbed twice and never double-counts in a badge. Ties resolve to the first venue in
 * `venues`, which keeps the result stable across renders for a stable venue list.
 *
 * Ended games are excluded outright — an absorbed game loses its own pin, so letting a
 * finished one through would inflate the venue's badge with something the card won't list.
 */
export function partitionGamesByVenue(
  games: GameRow[],
  venues: VenueAnchor[],
  radiusMeters: number,
  nowMs: number
): { anchored: Map<string, GameRow[]>; floating: GameRow[] } {
  const anchored = new Map<string, GameRow[]>();
  const floating: GameRow[] = [];

  for (const game of games) {
    if (isGameEnded(game, nowMs)) {
      floating.push(game);
      continue;
    }

    let nearestId: string | null = null;
    let nearestDistance = Infinity;

    for (const venue of venues) {
      const d = haversineDistanceMeters(venue.lat, venue.lng, game.lat, game.lng);
      if (d <= radiusMeters && d < nearestDistance) {
        nearestDistance = d;
        nearestId = venue.id;
      }
    }

    if (nearestId === null) {
      floating.push(game);
      continue;
    }
    const list = anchored.get(nearestId) ?? [];
    list.push(game);
    anchored.set(nearestId, list);
  }

  return { anchored, floating };
}

/**
 * Reading order for a venue's game list: what's happening now, then what's happening soonest.
 *
 * Untimed pickup games sort last among the not-live — they have no start to be "soon" for —
 * and fall back to newest-first so a game someone just posted surfaces above a stale one.
 */
export function sortGamesForVenueList(games: GameRow[], nowMs: number): GameRow[] {
  const startMs = (g: GameRow): number | null => {
    if (!g.starts_at?.trim()) return null;
    const t = new Date(g.starts_at).getTime();
    return Number.isNaN(t) ? null : t;
  };

  return [...games].sort((a, b) => {
    const aLive = isGameLive(a, nowMs);
    const bLive = isGameLive(b, nowMs);
    if (aLive !== bLive) return aLive ? -1 : 1;

    const aStart = startMs(a);
    const bStart = startMs(b);
    if (aStart != null && bStart != null) return aStart - bStart;
    if (aStart != null) return -1;
    if (bStart != null) return 1;

    // Both untimed: newest first.
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * The "2 games · 1 note" fragment.
 *
 * Shared by the composite pin's `aria-label` and the venue card's summary line so the two can
 * never drift apart. Returns an empty string when there is nothing to report, letting callers
 * omit the separator rather than render a dangling "·".
 */
export function summarizeVenueActivity(gameCount: number, noteCount: number): string {
  const parts: string[] = [];
  if (gameCount > 0) parts.push(`${gameCount} game${gameCount === 1 ? "" : "s"}`);
  if (noteCount > 0) parts.push(`${noteCount} note${noteCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** The game a composite pin should count down to: the live one, else the soonest. */
export function leadGameForPin(games: GameRow[], nowMs: number): GameRow | null {
  return sortGamesForVenueList(games, nowMs)[0] ?? null;
}
