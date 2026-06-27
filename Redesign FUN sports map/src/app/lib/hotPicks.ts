import type { GameRow } from "../../lib/supabase";
import type { SportsVenueGeoJSON, SportsVenueProperties } from "./sportsVenueTypes";
import { distanceKmBetween } from "../map/mapBounds";

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

const ENDED_STATUSES = new Set(["completed", "cancelled"]);

/** A game still worth surfacing: not ended, not cancelled. */
export function isLiveGame(g: GameRow): boolean {
  if (g.ended_at) return false;
  if (g.status && ENDED_STATUSES.has(g.status)) return false;
  return true;
}

/**
 * Live games near the viewer, best-first: primary-sport overlap, then nearest
 * (RPC-provided distance_km), then fullest, then newest. Ended/cancelled games
 * are dropped so the list is only things you can actually still join.
 */
export function rankLiveGameRows(
  games: GameRow[],
  opts: { primarySports?: string[]; limit?: number } = {},
): GameRow[] {
  const prim = new Set((opts.primarySports ?? []).map(normSport).filter(Boolean));

  const sorted = games.filter(isLiveGame).slice().sort((a, b) => {
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
  if (km < 1) return "<1 km";
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
