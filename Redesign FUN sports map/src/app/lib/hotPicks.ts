import type { LiveFeedItem } from "../../lib/api";
import type { SportsVenueGeoJSON } from "./sportsVenueTypes";
import { distanceKmBetween } from "../map/mapBounds";

export type LatLng = { lat: number; lng: number };

export type HotPickGame = {
  id: string;
  title: string;
  sport: string | null;
  lat: number;
  lng: number;
  distanceKm: number | null;
};

export type HotPickVenue = {
  id: string;
  name: string;
  sport: string | null;
  lat: number;
  lng: number;
  distanceKm: number | null;
};

type GameItem = Extract<LiveFeedItem, { kind: "game" }>;

function normSport(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function gameTitle(g: GameItem): string {
  const t = g.title?.trim();
  if (t) return t;
  const sport = g.sport?.trim();
  return sport ? `${sport} game` : "Pickup game";
}

/**
 * "For you" games: viewer's primary-sport overlap first, then nearest, then
 * most engagement (likes + comments). An honest heuristic — the live-feed RPC
 * exposes no participant_count, so popularity is approximated by engagement.
 */
export function rankHotPickGames(
  items: LiveFeedItem[],
  opts: { center?: LatLng | null; primarySports?: string[]; limit?: number } = {},
): HotPickGame[] {
  const limit = opts.limit ?? 5;
  const center = opts.center ?? null;
  const prim = new Set((opts.primarySports ?? []).map(normSport).filter(Boolean));

  const scored = items
    .filter((it): it is GameItem => it.kind === "game")
    .map((g) => {
      const distanceKm = center ? distanceKmBetween(center.lat, center.lng, g.lat, g.lng) : null;
      const sportMatch = prim.size > 0 && prim.has(normSport(g.sport)) ? 1 : 0;
      const engagement = (g.like_count ?? 0) + (g.comment_count ?? 0);
      return { g, distanceKm, sportMatch, engagement };
    });

  scored.sort(
    (a, b) =>
      b.sportMatch - a.sportMatch ||
      (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) ||
      b.engagement - a.engagement,
  );

  return scored.slice(0, limit).map(({ g, distanceKm }) => ({
    id: g.id,
    title: gameTitle(g),
    sport: g.sport,
    lat: g.lat,
    lng: g.lng,
    distanceKm,
  }));
}

/**
 * "Near you" venues: nearest sports venues first (closest→furthest). Source is
 * the OSM venue cache as GeoJSON, whose Point coordinates are [lng, lat].
 */
export function rankHotPickVenues(
  fc: SportsVenueGeoJSON | null,
  opts: { center?: LatLng | null; limit?: number } = {},
): HotPickVenue[] {
  const limit = opts.limit ?? 30;
  const center = opts.center ?? null;
  const features = fc?.features ?? [];

  const mapped: HotPickVenue[] = [];
  for (const f of features) {
    const lng = f.geometry.coordinates[0];
    const lat = f.geometry.coordinates[1];
    if (typeof lng !== "number" || typeof lat !== "number") continue;
    const distanceKm = center ? distanceKmBetween(center.lat, center.lng, lat, lng) : null;
    mapped.push({
      id: f.properties.id,
      name: f.properties.name?.trim() || "Unnamed venue",
      sport: f.properties.sport ?? null,
      lat,
      lng,
      distanceKm,
    });
  }

  mapped.sort(
    (a, b) =>
      (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
  );

  return mapped.slice(0, limit);
}
