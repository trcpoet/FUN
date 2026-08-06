import type { GameRow } from "../../lib/supabase";
import type { SportsVenueGeoJSON, SportsVenueProperties } from "./sportsVenueTypes";
import { distanceKmBetween } from "../map/mapBounds";
import {
  getGameEndsAtMs as gameEndTimeMs,
  isGameEnded,
  isGameLive as isLiveGame,
  isUntimedGameExpired,
} from "../../lib/mapGameTimer";

export type LatLng = { lat: number; lng: number };

export type HotPickVenue = {
  id: string;
  name: string;
  sport: string | null;
  leisure: string | null;
  lat: number;
  lng: number;
  distanceKm: number | null;
  surface: string | null;
  access: string | null;
  openingHours: string | null;
  website: string | null;
  operator: string | null;
  heroImageUrl: string | null;
};

function normSport(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Liveness lives in one place: `src/lib/mapGameTimer.ts`.
 *
 * This module used to carry its own `gameEndTimeMs` / `isGameEnded` / `isLiveGame`, and they
 * quietly disagreed with the canonical ones in two ways. It short-circuited `status === 'live'`
 * to not-ended, so a game whose window had elapsed stayed "live" until the cron caught it; and
 * it invented an end of `created_at + duration` for untimed games, which treats posting a
 * pickup game as starting it. Worst of all `isLiveGame` was just `!isGameEnded`, so a game
 * starting next week counted as live — which is why the "Live" accordion listed it.
 *
 * Re-exported rather than deleted so existing callers keep working.
 */
export { gameEndTimeMs, isGameEnded, isLiveGame };

/** Rank games best-first: sport overlap, nearest, fullest, newest. No filtering. */
export function rankGameRows(
  games: GameRow[],
  opts: { primarySports?: string[]; limit?: number } = {},
): GameRow[] {
  const prim = new Set((opts.primarySports ?? []).map(normSport).filter(Boolean));
  const sorted = games.slice().sort((a, b) => {
    const am = prim.size > 0 && prim.has(normSport(a.sport)) ? 1 : 0;
    const bm = prim.size > 0 && prim.has(normSport(b.sport)) ? 1 : 0;
    return (
      bm - am ||
      (a.distance_km ?? Number.POSITIVE_INFINITY) - (b.distance_km ?? Number.POSITIVE_INFINITY) ||
      (b.participant_count ?? 0) - (a.participant_count ?? 0) ||
      (b.created_at ?? "").localeCompare(a.created_at ?? "")
    );
  });
  return opts.limit != null ? sorted.slice(0, opts.limit) : sorted;
}

/**
 * Split games into what is happening now, what is still to come, and what is over.
 *
 * "Live" previously meant merely "not ended", which swept in everything scheduled for next
 * week. Those games are real and worth showing — they just aren't live — so they get their own
 * bucket rather than being hidden or mislabelled.
 *
 * Untimed pickup games past the map's TTL are dropped outright: nothing about them ever ends,
 * so they would otherwise sit in "Upcoming" indefinitely.
 */
export function splitGamesByLiveness(
  games: GameRow[],
  opts: { primarySports?: string[] } = {},
): { live: GameRow[]; upcoming: GameRow[]; ended: GameRow[] } {
  const now = Date.now();
  const live: GameRow[] = [];
  const upcoming: GameRow[] = [];
  const ended: GameRow[] = [];

  for (const g of games) {
    if (isGameEnded(g, now)) {
      ended.push(g);
    } else if (isUntimedGameExpired(g, now)) {
      continue;
    } else if (isLiveGame(g, now)) {
      live.push(g);
    } else {
      upcoming.push(g);
    }
  }

  return {
    live: rankGameRows(live, opts),
    // Soonest first — the next thing you could turn up to is the useful one.
    upcoming: upcoming
      .slice()
      .sort((a, b) => (startTimeMs(a) ?? Infinity) - (startTimeMs(b) ?? Infinity)),
    ended: ended.slice().sort((a, b) => (gameEndTimeMs(b) ?? 0) - (gameEndTimeMs(a) ?? 0)),
  };
}

function startTimeMs(g: GameRow): number | null {
  if (!g.starts_at?.trim()) return null;
  const t = Date.parse(g.starts_at);
  return Number.isNaN(t) ? null : t;
}

function optStr(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/**
 * Nearest sports venues first (closest→furthest), keeping display info. Source
 * is the OSM venue cache GeoJSON, whose Point coordinates are [lng, lat].
 */
export function rankHotPickVenues(
  fc: SportsVenueGeoJSON | null,
  opts: { center?: LatLng | null; limit?: number } = {},
): HotPickVenue[] {
  const center = opts.center ?? null;
  const features = fc?.features ?? [];

  const mapped: HotPickVenue[] = [];
  for (const f of features) {
    const lng = f.geometry.coordinates[0];
    const lat = f.geometry.coordinates[1];
    if (typeof lng !== "number" || typeof lat !== "number") continue;
    const p: SportsVenueProperties = f.properties;
    const distanceKm = center ? distanceKmBetween(center.lat, center.lng, lat, lng) : null;
    mapped.push({
      id: p.id,
      name: optStr(p.name) ?? "Unnamed venue",
      sport: optStr(p.sport),
      leisure: optStr(p.leisure),
      lat,
      lng,
      distanceKm,
      surface: optStr(p.surface),
      access: optStr(p.access),
      openingHours: optStr(p.opening_hours),
      website: optStr(p.website),
      operator: optStr(p.operator),
      heroImageUrl: optStr(p.hero_image_url),
    });
  }

  mapped.sort(
    (a, b) =>
      (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
  );

  return opts.limit != null ? mapped.slice(0, opts.limit) : mapped;
}

/** Distance formatted for compact rows. */
export function formatKm(km: number | null | undefined): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
