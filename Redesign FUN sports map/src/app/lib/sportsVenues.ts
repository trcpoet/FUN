/**
 * Sports venue overlay: prefer Supabase cache, fallback to OpenStreetMap Overpass API.
 * leisure=pitch, leisure=sports_centre; optional sport=* filter for smaller Overpass payloads.
 */

import { expectedOsmTokensForDisplaySports } from "../../lib/osmSportTags";
import { supabase } from "../../lib/supabase";
import type { SportsVenueFeature, SportsVenueGeoJSON } from "./sportsVenueTypes";

export type { SportsVenueProperties, SportsVenueFeature, SportsVenueGeoJSON } from "./sportsVenueTypes";

/** Auto-cache endpoint: fetches from Overpass server-side and persists to DB. Returns GeoJSON directly. */
const AUTO_CACHE_PATH = "/api/auto-cache-venues";

/** How long a bbox result stays valid (memory + sessionStorage). */
const CACHE_TTL_MS = 12 * 60 * 1000;
/** Max bbox entries kept in memory (LRU by oldest timestamp). */
const MAX_MEMORY_ENTRIES = 10;
/** Max entries persisted in sessionStorage (smaller — quota). */
const SESSION_LIMIT = 4;
const SESSION_STORAGE_KEY = "fun.sportsVenues.cache.v2";
/** Set when `osm_sports_venues` is missing from PostgREST (migration not applied); avoids repeated 404s. */
const SESSION_SKIP_DB_KEY = "fun.sportsVenues.skipOsmDb";

let venuesDbReadDisabled =
  typeof sessionStorage !== "undefined"
    ? (() => {
        try {
          return sessionStorage.getItem(SESSION_SKIP_DB_KEY) === "1";
        } catch {
          return false;
        }
      })()
    : false;

function persistVenuesDbSkip() {
  try {
    sessionStorage.setItem(SESSION_SKIP_DB_KEY, "1");
  } catch {
    /* quota / private mode */
  }
}

/** Call after you create `public.osm_sports_venues` in Supabase so the app retries reading venues from the DB. */
export function clearSportsVenuesDbSkip(): void {
  venuesDbReadDisabled = false;
  try {
    sessionStorage.removeItem(SESSION_SKIP_DB_KEY);
  } catch {
    /* ignore */
  }
}

function isMissingVenuesTableError(error: { code?: string; message?: string; details?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const blob = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (!blob.includes("osm_sports_venues")) return false;
  return (
    blob.includes("could not find") ||
    blob.includes("does not exist") ||
    blob.includes("schema cache")
  );
}

type CacheEntry = { geojson: SportsVenueGeoJSON; ts: number };

const memoryCache = new Map<string, CacheEntry>();
/** Deduplicate concurrent Overpass calls for the same bbox + sport query. */
const inflight = new Map<string, Promise<SportsVenueGeoJSON>>();
let sessionHydrated = false;

function escapeRegexToken(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build Overpass sport regex from app sport labels (empty → no sport predicate on pitches). */
export function buildPitchSportRegex(displaySports: string[]): string | null {
  if (!displaySports.length) return null;
  const tokens = [...expectedOsmTokensForDisplaySports(displaySports)];
  if (tokens.length === 0) return null;
  return tokens.map(escapeRegexToken).join("|");
}

function bboxCacheKey(
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  sportSig: string
): string {
  const base = [bbox.minLat, bbox.minLng, bbox.maxLat, bbox.maxLng].map((n) => n.toFixed(5)).join(",");
  return sportSig ? `${base}|s:${sportSig}` : base;
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


async function fetchOverpassNetwork(
  bboxStr: string,
  _sportRegex: string | null,
  signal?: AbortSignal
): Promise<SportsVenueGeoJSON> {
  const [minLat, minLng, maxLat, maxLng] = bboxStr.split(",").map(Number);
  const res = await fetch(AUTO_CACHE_PATH, {
    method: "POST",
    body: JSON.stringify({ minLat, minLng, maxLat, maxLng }),
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) return { type: "FeatureCollection", features: [] };
  try {
    return (await res.json()) as SportsVenueGeoJSON;
  } catch {
    return { type: "FeatureCollection", features: [] };
  }
}

/**
 * Read pre-synced venues from Supabase (fast). Returns null if unavailable or empty.
 */
export async function fetchSportsVenuesFromDb(
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  _signal?: AbortSignal
): Promise<SportsVenueGeoJSON | null> {
  if (!supabase || venuesDbReadDisabled) return null;
  const { minLat, minLng, maxLat, maxLng } = bbox;

  const { data, error } = await supabase
    .from("osm_sports_venues")
    .select("id, lat, lng, name, sport, leisure, osm_type, osm_id")
    .gte("lat", minLat)
    .lte("lat", maxLat)
    .gte("lng", minLng)
    .lte("lng", maxLng)
    .limit(8000);
  if (error) {
    if (isMissingVenuesTableError(error)) {
      venuesDbReadDisabled = true;
      persistVenuesDbSkip();
    }
    return null;
  }
  if (!data?.length) return null;

  const features: SportsVenueFeature[] = data.map((row) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [row.lng as number, row.lat as number] },
    properties: {
      id: row.id as string,
      name: (row.name as string | null) ?? undefined,
      sport: (row.sport as string | null) ?? undefined,
      leisure: (row.leisure as string | null) ?? undefined,
      osm_type: row.osm_type as string,
      osm_id: Number(row.osm_id),
    },
  }));

  return { type: "FeatureCollection", features };
}

/**
 * Fetch sports venues from OSM only (with optional tighter pitch query when sport filter is set).
 */
export async function fetchSportsVenuesFromOverpass(
  bbox: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  },
  options?: { signal?: AbortSignal; sportFilter?: string[] }
): Promise<SportsVenueGeoJSON> {
  const { minLat, minLng, maxLat, maxLng } = bbox;
  const sportRegex = buildPitchSportRegex(options?.sportFilter ?? []);
  const sportSig = sportRegex ?? "all";
  const cacheKey = bboxCacheKey({ minLat, minLng, maxLat, maxLng }, sportSig);
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
      const collection = await fetchOverpassNetwork(bboxStr, sportRegex, options?.signal);
      const entry: CacheEntry = { geojson: collection, ts: Date.now() };
      memoryCache.set(cacheKey, entry);
      pruneMemory();
      persistSession();
      return collection;
    } catch (e) {
      if (e && typeof e === "object" && "name" in e && (e as { name: string }).name === "AbortError") {
        throw e;
      }
      return { type: "FeatureCollection", features: [] };
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, work);
  return work;
}

/**
 * Prefer Supabase (`osm_sports_venues`); if empty, use Overpass + client cache.
 */
export async function fetchSportsVenues(
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  options?: { signal?: AbortSignal; sportFilter?: string[] }
): Promise<SportsVenueGeoJSON> {
  const fromDb = await fetchSportsVenuesFromDb(bbox, options?.signal);
  if (fromDb && fromDb.features.length > 0) {
    return fromDb;
  }
  return fetchSportsVenuesFromOverpass(bbox, options);
}

/** Inner Overpass ring radius (km). Larger map searches do a small bbox first, then the full radius. */
const PROGRESSIVE_NEAR_RADIUS_KM = 5;

/**
 * Same as {@link fetchSportsVenues}, but when falling back to Overpass with a radius **larger** than
 * {@link PROGRESSIVE_NEAR_RADIUS_KM}, loads a **nearby ring first** (faster), then the full bbox.
 * `onNearRing` runs after the first ring so the map can paint local venues before the outer request finishes.
 * Supabase hits stay a single request (no splitting).
 */
export async function fetchSportsVenuesWithProgress(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  options?: {
    signal?: AbortSignal;
    sportFilter?: string[];
    /** Runs after the inner bbox returns; await so the full Overpass request starts after the first paint/cluster work. */
    onNearRing?: (geojson: SportsVenueGeoJSON) => void | Promise<void>;
  }
): Promise<SportsVenueGeoJSON> {
  const fullBbox = bboxFromCenterRadius(centerLat, centerLng, radiusKm);
  const fromDb = await fetchSportsVenuesFromDb(fullBbox, options?.signal);
  if (fromDb && fromDb.features.length > 0) {
    return fromDb;
  }

  if (radiusKm <= PROGRESSIVE_NEAR_RADIUS_KM) {
    return fetchSportsVenuesFromOverpass(fullBbox, options);
  }

  const nearKm = Math.min(PROGRESSIVE_NEAR_RADIUS_KM, radiusKm);
  const innerBbox = bboxFromCenterRadius(centerLat, centerLng, nearKm);
  const nearGeo = await fetchSportsVenuesFromOverpass(innerBbox, options);
  if (options?.onNearRing) {
    await Promise.resolve(options.onNearRing(nearGeo));
  }

  return fetchSportsVenuesFromOverpass(fullBbox, options);
}
