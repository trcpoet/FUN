/**
 * Associating notes with venues.
 *
 * Notes have no `venue_id` — a note knows only its own coordinates — so "is this note at
 * that venue?" is always a distance test. Mirrors `openGamesNearPoint` in `gamesAtVenue.ts`
 * and reuses the same haversine.
 */
import type { MapNoteRow } from "../../lib/supabase";
import { haversineDistanceMeters } from "./gamesAtVenue";

/** The subset of a venue this module needs: an id and a position. */
export type VenueAnchor = { id: string; lat: number; lng: number };

/** Notes within `radiusMeters` of a point. */
export function notesNearPoint(
  notes: MapNoteRow[],
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): MapNoteRow[] {
  return notes.filter(
    (n) => haversineDistanceMeters(centerLat, centerLng, n.lat, n.lng) <= radiusMeters
  );
}

/**
 * Split notes into those sitting on a venue and those floating free on the map.
 *
 * A note close enough to two venues attaches to the nearest one only, so it can never be
 * absorbed twice and never double-counts in a badge. Ties resolve to the first venue in
 * `venues`, which keeps the result stable across renders for a stable venue list.
 */
export function partitionNotesByVenue(
  notes: MapNoteRow[],
  venues: VenueAnchor[],
  radiusMeters: number
): { anchored: Map<string, MapNoteRow[]>; floating: MapNoteRow[] } {
  const anchored = new Map<string, MapNoteRow[]>();
  const floating: MapNoteRow[] = [];

  for (const note of notes) {
    let nearestId: string | null = null;
    let nearestDistance = Infinity;

    for (const venue of venues) {
      const d = haversineDistanceMeters(venue.lat, venue.lng, note.lat, note.lng);
      if (d <= radiusMeters && d < nearestDistance) {
        nearestDistance = d;
        nearestId = venue.id;
      }
    }

    if (nearestId === null) {
      floating.push(note);
      continue;
    }
    const list = anchored.get(nearestId) ?? [];
    list.push(note);
    anchored.set(nearestId, list);
  }

  return { anchored, floating };
}
