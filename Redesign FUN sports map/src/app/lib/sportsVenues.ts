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

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Fetch sports venues (pitches, sports centres) in a bounding box from OSM.
 * Stub: returns empty FeatureCollection; replace with real Overpass query when ready.
 * Example query for leisure=pitch and leisure=sports_centre:
 * [out:json]; node["leisure"="pitch"]({{bbox}}); node["leisure"="sports_centre"]({{bbox}}); out center;
 */
export async function fetchSportsVenuesFromOverpass(bbox: {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}): Promise<SportsVenueGeoJSON> {
  const { minLat, minLng, maxLat, maxLng } = bbox;
  // Overpass bbox: (south, west, north, east)
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

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      body: query,
      headers: { "Content-Type": "text/plain" },
    });
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
    return { type: "FeatureCollection", features };
  } catch {
    return { type: "FeatureCollection", features: [] };
  }
}
