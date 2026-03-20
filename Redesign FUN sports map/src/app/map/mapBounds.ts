import type { Map } from "mapbox-gl";
import type { GameRow } from "../../lib/supabase";

/**
 * Approximate visible map width in km (east–west at map center latitude).
 * Used to decide if “near me” / local discovery is meaningful at current view.
 */
export function approxVisibleBoundsWidthKm(map: Map): number {
  const b = map.getBounds();
  if (!b) return 0;
  const ne = b.getNorthEast();
  const sw = b.getSouthWest();
  const midLat = (ne.lat + sw.lat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const dLng = Math.abs(ne.lng - sw.lng);
  const dLat = Math.abs(ne.lat - sw.lat);
  // Rough km: 1° lat ~111km; 1° lng ~111km * cos(lat)
  const wKm = dLng * 111.32 * Math.max(0.2, cosLat);
  const hKm = dLat * 111.32;
  return Math.max(wKm, hKm * 0.85);
}

function distanceKmToPoint(lat: number, lng: number, centerLat: number, centerLng: number): number {
  const R = 6371;
  const dLat = ((centerLat - lat) * Math.PI) / 180;
  const dLng = ((centerLng - lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat * Math.PI) / 180) * Math.cos((centerLat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * When there are many games, keep the nearest ones to the map center so the GL stack stays light
 * and the view matches “what’s in front of you”.
 */
export function limitGamesForMapViewport(games: GameRow[], map: Map, max: number): GameRow[] {
  if (games.length <= max) return games;
  const c = map.getCenter();
  return [...games]
    .sort((a, b) => distanceKmToPoint(a.lat, a.lng, c.lat, c.lng) - distanceKmToPoint(b.lat, b.lng, c.lat, c.lng))
    .slice(0, max);
}
