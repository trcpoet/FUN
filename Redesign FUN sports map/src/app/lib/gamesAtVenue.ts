import type { GameRow } from "../../lib/supabase";

/** Haversine distance in meters. */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadius = 6378137;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

/** Open games near a point (same default radius as MapboxMap venue popup). */
export function openGamesNearPoint(
  games: GameRow[],
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): GameRow[] {
  return games.filter((g) => {
    const isOpen = g.status === "open" || !g.status;
    if (!isOpen) return false;
    const d = haversineDistanceMeters(centerLat, centerLng, g.lat, g.lng);
    return d <= radiusMeters;
  });
}

/** Group games by normalized sport label for section headers. */
export function groupGamesBySport(games: GameRow[]): Map<string, GameRow[]> {
  const map = new Map<string, GameRow[]>();
  for (const g of games) {
    const key = (g.sport || "Other").trim() || "Other";
    const list = map.get(key) ?? [];
    list.push(g);
    map.set(key, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => {
      const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
      const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
      return ta - tb;
    });
  }
  return map;
}
