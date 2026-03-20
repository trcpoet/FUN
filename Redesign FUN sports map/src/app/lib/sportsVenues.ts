/**
 * Sports venue overlay: fetch from OpenStreetMap Overpass API.
 * leisure=pitch, leisure=sports_centre, sport=* for courts, pitches, sports centres.
 * Returns GeoJSON for rendering as a separate Source + layers.
 */

import type { Feature, FeatureCollection, Point } from "geojson";

export type SportsVenueProperties = {
  id: string;
  name?: string;
  sport?: string;
  leisure?: string;
  osm_type: string;
  osm_id: number;
};

export type SportsVenueFeature = Feature<Point, SportsVenueProperties>;
export type SportsVenueGeoJSON = FeatureCollection<Point, SportsVenueProperties>;

// Primary; fallback if rate-limited (429)
const OVERPASS_URLS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

/** Throttle duplicate Overpass calls for the *same* bbox only (saves quota). Filter/sport changes reuse cached raw features + client-side filter. */
const MIN_FETCH_INTERVAL_MS = 60_000;
let lastBboxKey: string | null = null;
let lastFetchTime = 0;
let lastGeojson: SportsVenueGeoJSON = { type: "FeatureCollection", features: [] };

function bboxCacheKey(bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number }): string {
  return [bbox.minLat, bbox.minLng, bbox.maxLat, bbox.maxLng].map((n) => n.toFixed(5)).join(",");
}

const KM_TO_DEG_LAT = 1 / 111;
const KM_TO_DEG_LNG = 1 / (111 * Math.cos((Math.PI * 40) / 180));

/** Compute bbox for a circle of given radius (km) around center. */
export function bboxFromCenterRadius(
  centerLat: number,
  centerLng: number,
  radiusKm: number
): { minLat: number; minLng: number; maxLat: number; maxLng: number } {
  const dLat = radiusKm * KM_TO_DEG_LAT;
  const dLng = radiusKm * KM_TO_DEG_LNG;
  return {
    minLat: centerLat - dLat,
    maxLat: centerLat + dLat,
    minLng: centerLng - dLng,
    maxLng: centerLng + dLng,
  };
}

/**
 * Fetch sports venues (pitches, sports centres) in a bounding box from OSM.
 */
export async function fetchSportsVenuesFromOverpass(bbox: {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}): Promise<SportsVenueGeoJSON> {
  const { minLat, minLng, maxLat, maxLng } = bbox;
  // Overpass bbox: (south, west, north, east)
  const cacheKey = bboxCacheKey({ minLat, minLng, maxLat, maxLng });
  const now = Date.now();
  if (cacheKey === lastBboxKey && now - lastFetchTime < MIN_FETCH_INTERVAL_MS) {
    return {
      type: "FeatureCollection",
      features: lastGeojson.features,
    };
  }

  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;
  const query = `
    [out:json][timeout:15];
    (
      node["leisure"="pitch"](${bboxStr});
      way["leisure"="pitch"](${bboxStr});
      node["leisure"="sports_centre"](${bboxStr});
      way["leisure"="sports_centre"](${bboxStr});
    );
    out center;
  `.replace(/\n\s+/g, " ");

  for (const OVERPASS_URL of OVERPASS_URLS) {
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        body: query,
        headers: { "Content-Type": "text/plain" },
      });
      if (res.status === 429) continue; // try next server
      if (!res.ok) return { type: "FeatureCollection", features: [] };
      const json = await res.json();
      const features: SportsVenueFeature[] = [];
      for (const el of json.elements || []) {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) continue;
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: {
            id: `${el.type}/${el.id}`,
            name: el.tags?.name,
            sport: el.tags?.sport,
            leisure: el.tags?.leisure,
            osm_type: el.type,
            osm_id: el.id,
          },
        });
      }
      const collection: SportsVenueGeoJSON = { type: "FeatureCollection", features };
      lastBboxKey = cacheKey;
      lastFetchTime = Date.now();
      lastGeojson = collection;
      return collection;
    } catch {
      continue;
    }
  }
  return { type: "FeatureCollection", features: [] };
}
