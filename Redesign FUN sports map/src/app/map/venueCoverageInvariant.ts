/**
 * Dev-only invariant: does every pitch the basemap draws have a venue marker on it?
 *
 * WHY
 * FUN renders venue icons from `osm_sports_venues`. The Mapbox basemap separately paints
 * `landuse` polygons of class `pitch` from its own vector tiles (see mapTheme.ts), for the
 * whole world, regardless of what we know. Those are two independent sources of truth for
 * "there is a pitch here", and when they disagree the user sees a pitch with no icon —
 * with nothing logged, because from the app's point of view everything succeeded.
 *
 * That is exactly how the Doug Russell Park ⚽ disappeared and stayed disappeared. This
 * check turns that silent class of failure into a console warning during development.
 *
 * Runs only under `import.meta.env.DEV`; ships nothing to production.
 */

import type { Map } from "mapbox-gl";
import { distanceKmBetween } from "./mapBounds";

export type LngLatPoint = { lat: number; lng: number };

/** How close a venue marker must be to count as "covering" a basemap pitch polygon. */
export const VENUE_COVERAGE_MATCH_RADIUS_M = 80;

/** Basemap pitches with no venue marker near them. Pure, so it is unit-testable. */
export function findVenueCoverageGaps(
  basemapPitches: LngLatPoint[],
  renderedVenues: LngLatPoint[]
): LngLatPoint[] {
  const radiusKm = VENUE_COVERAGE_MATCH_RADIUS_M / 1000;
  return basemapPitches.filter(
    (pitch) =>
      !renderedVenues.some(
        (venue) => distanceKmBetween(pitch.lat, pitch.lng, venue.lat, venue.lng) <= radiusKm
      )
  );
}

/** Average a polygon/multipolygon ring set down to a single representative point. */
function centroidOf(geometry: GeoJSON.Geometry | undefined): LngLatPoint | null {
  if (!geometry) return null;
  const rings: number[][][] =
    geometry.type === "Polygon"
      ? (geometry.coordinates as number[][][])
      : geometry.type === "MultiPolygon"
        ? (geometry.coordinates as number[][][][]).flat()
        : [];
  const ring = rings[0];
  if (!ring?.length) return null;

  let lng = 0;
  let lat = 0;
  for (const [x, y] of ring as [number, number][]) {
    lng += x;
    lat += y;
  }
  return { lng: lng / ring.length, lat: lat / ring.length };
}

/**
 * Compare the basemap's pitches against our rendered venue points and warn about any gap.
 *
 * `context` carries the state needed to tell the two failure modes apart: "we never fetched
 * this area" (anchor far away / small radius) vs "we fetched it and filtered the venue out"
 * (anchor covers it, but a sport filter is active).
 */
export function reportVenueCoverageGaps(
  map: Map,
  venueSourceId: string,
  context: {
    anchor?: LngLatPoint | null;
    radiusKm?: number;
    sportFilter?: string[];
    lastSource?: string;
  }
): void {
  if (!import.meta.env.DEV) return;

  try {
    const pitchFeatures = map.querySourceFeatures("composite", {
      sourceLayer: "landuse",
      filter: ["==", ["get", "class"], "pitch"],
    } as Parameters<Map["querySourceFeatures"]>[1]);

    if (!pitchFeatures.length) return;

    // Dedupe: tiled sources hand back the same polygon once per tile it touches.
    const seen = new Set<string>();
    const basemapPitches: LngLatPoint[] = [];
    for (const f of pitchFeatures) {
      const c = centroidOf(f.geometry as GeoJSON.Geometry);
      if (!c) continue;
      const key = `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      basemapPitches.push(c);
    }

    if (!map.getSource(venueSourceId)) return;
    const renderedVenues: LngLatPoint[] = map
      .querySourceFeatures(venueSourceId)
      .map((f) => {
        const g = f.geometry as GeoJSON.Geometry;
        if (g?.type !== "Point") return null;
        const [lng, lat] = g.coordinates as [number, number];
        return { lng, lat };
      })
      .filter((p): p is LngLatPoint => p !== null);

    const gaps = findVenueCoverageGaps(basemapPitches, renderedVenues);
    if (!gaps.length) return;

    const nearest = gaps[0]!;
    console.warn(
      `[FUN] venue coverage gap: the basemap shows ${gaps.length} pitch polygon(s) in view ` +
        `with no venue marker within ${VENUE_COVERAGE_MATCH_RADIUS_M}m.\n` +
        `  nearest gap: ${nearest.lat.toFixed(5)},${nearest.lng.toFixed(5)}\n` +
        `  fetch anchor: ${context.anchor ? `${context.anchor.lat.toFixed(5)},${context.anchor.lng.toFixed(5)}` : "none"}` +
        ` r=${context.radiusKm?.toFixed(1) ?? "?"}km\n` +
        `  venues rendered: ${renderedVenues.length} (source: ${context.lastSource ?? "?"})\n` +
        `  sport filter: ${context.sportFilter?.length ? context.sportFilter.join(", ") : "All Sports"}`
    );
  } catch {
    // Style not ready, or a basemap without a `landuse` layer (satellite). Never let a
    // diagnostic break the map.
  }
}
