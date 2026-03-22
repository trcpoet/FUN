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

/** Same-origin proxy (Vercel Edge `api/overpass.ts` or Vite dev proxy) — public Overpass APIs block browser CORS. */
const OVERPASS_PROXY_PATH = "/api/overpass";

/** How long a bbox result stays valid (memory + sessionStorage). */
const CACHE_TTL_MS = 12 * 60 * 1000;
/** Max bbox entries kept in memory (LRU by oldest timestamp). */
const MAX_MEMORY_ENTRIES = 10;
/** Max entries persisted in sessionStorage (smaller — quota). */
const SESSION_LIMIT = 4;
const SESSION_STORAGE_KEY = "fun.sportsVenues.cache.v1";

type CacheEntry = { geojson: SportsVenueGeoJSON; ts: number };

const memoryCache = new Map<string, CacheEntry>();
/** Deduplicate concurrent Overpass calls for the same bbox. */
const inflight = new Map<string, Promise<SportsVenueGeoJSON>>();
let sessionHydrated = false;

function bboxCacheKey(bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number }): string {
  return [bbox.minLat, bbox.minLng, bbox.maxLat, bbox.maxLng].map((n) => n.toFixed(5)).join(",");
}

function pruneMemory() {
  const now = Date.now();
  for (const [k, v] of memoryCache) {
    if (now - v.ts > CACHE_TTL_MS) memoryCache.delete(k);
  }
  while (memoryCache.size > MAX_MEMORY_ENTRIES) {
    let oldestKey = "";
    let oldestTs = Infinity;
    for (const [k, v] of memoryCache) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) memoryCache.delete(oldestKey);
    else break;
  }
}

function hydrateFromSessionOnce() {
  if (sessionHydrated) return;
  sessionHydrated = true;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      if (!v?.geojson?.features || now - v.ts > CACHE_TTL_MS) continue;
      if (!memoryCache.has(k)) memoryCache.set(k, v);
    }
    pruneMemory();
  } catch {
    /* ignore */
  }
}

function persistSession() {
  try {
    pruneMemory();
    const now = Date.now();
    const fresh = [...memoryCache.entries()].filter(([, v]) => now - v.ts < CACHE_TTL_MS);
    fresh.sort((a, b) => b[1].ts - a[1].ts);
    const slice = fresh.slice(0, SESSION_LIMIT);
    const obj: Record<string, CacheEntry> = {};
    for (const [k, v] of slice) obj[k] = v;
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* quota / private mode */
  }
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

async function fetchOverpassNetwork(bboxStr: string): Promise<SportsVenueGeoJSON> {
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

  const res = await fetch(OVERPASS_PROXY_PATH, {
    method: "POST",
    body: query,
    headers: { "Content-Type": "text/plain" },
  });
  if (!res.ok) return { type: "FeatureCollection", features: [] };
  const text = await res.text();
  let json: { elements?: unknown[] };
  try {
    json = JSON.parse(text) as { elements?: unknown[] };
  } catch {
    return { type: "FeatureCollection", features: [] };
  }

  type OsmEl = {
    type?: string;
    id?: number;
    lat?: number;
    lon?: number;
    center?: { lat?: number; lon?: number };
    tags?: { name?: string; sport?: string; leisure?: string };
  };
  const features: SportsVenueFeature[] = [];
  for (const raw of json.elements || []) {
    const el = raw as OsmEl;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    if (el.type == null || el.id == null) continue;
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
}

/**
 * Fetch sports venues (pitches, sports centres) in a bounding box from OSM.
 * Uses per-bbox cache (memory + sessionStorage) so panning back or revisiting an area avoids Overpass.
 */
export async function fetchSportsVenuesFromOverpass(bbox: {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}): Promise<SportsVenueGeoJSON> {
  const { minLat, minLng, maxLat, maxLng } = bbox;
  const cacheKey = bboxCacheKey({ minLat, minLng, maxLat, maxLng });
  const now = Date.now();

  hydrateFromSessionOnce();
  pruneMemory();

  const hit = memoryCache.get(cacheKey);
  if (hit && now - hit.ts < CACHE_TTL_MS) {
    return { type: "FeatureCollection", features: hit.geojson.features };
  }

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;

  const work = (async () => {
    try {
      const collection = await fetchOverpassNetwork(bboxStr);
      const entry: CacheEntry = { geojson: collection, ts: Date.now() };
      memoryCache.set(cacheKey, entry);
      pruneMemory();
      persistSession();
      return collection;
    } catch {
      return { type: "FeatureCollection", features: [] };
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, work);
  return work;
}
