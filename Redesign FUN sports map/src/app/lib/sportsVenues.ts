/**
 * Sports venue overlay: prefer Supabase cache, fallback to OpenStreetMap Overpass API.
 * leisure=pitch, leisure=sports_centre; optional sport=* filter for smaller Overpass payloads.
 */

import { expectedOsmTokensForDisplaySports, venueMatchesSelectedSports } from "../../lib/osmSportTags";
import { supabase } from "../../lib/supabase";
import type { OsmSportsVenueRow } from "../../lib/supabase";
import { OSM_VENUE_MAP_SELECT } from "../../lib/osmVenueColumns";
import type { SportsVenueFeature, SportsVenueGeoJSON } from "./sportsVenueTypes";
import { dbRowToVenueProperties } from "./venueSelection";

export type { SportsVenueProperties, SportsVenueFeature, SportsVenueGeoJSON } from "./sportsVenueTypes";

export type VenueFetchSource = "db" | "overpass" | "cache";

export type VenueFetchResult = {
  geojson: SportsVenueGeoJSON;
  source?: VenueFetchSource;
  error?: string;
};

/**
 * Result of a venue read, keeping "nothing here" and "could not find out" apart.
 *
 * These used to both be `null`, which is precisely how a venue could silently stop
 * rendering: a failed read looked exactly like an empty neighbourhood, so nothing
 * retried, nothing logged, and the basemap kept drawing the pitch regardless.
 */
export type VenueDbOutcome =
  | { status: "ok"; geojson: SportsVenueGeoJSON }
  | { status: "empty" }
  | { status: "unavailable"; error: string };

const EMPTY_GEOJSON: SportsVenueGeoJSON = { type: "FeatureCollection", features: [] };

/** Auto-cache endpoint: fetches from Overpass server-side and persists to DB. Returns GeoJSON directly. */
const AUTO_CACHE_PATH = "/api/auto-cache-venues";

/** How long a bbox result stays valid (memory + sessionStorage). */
const CACHE_TTL_MS = 12 * 60 * 1000;
/** Max bbox entries kept in memory (LRU by oldest timestamp). */
const MAX_MEMORY_ENTRIES = 10;
/** Max entries persisted in sessionStorage (smaller — quota). */
const SESSION_LIMIT = 4;
const SESSION_STORAGE_KEY = "fun.sportsVenues.cache.v2";

/**
 * How long to stop querying after PostgREST says `osm_sports_venues` is missing.
 *
 * This used to latch for the entire tab session (and persist to sessionStorage), so a
 * single blip — a schema-cache reload, a migration mid-deploy — left the venue layer
 * dead until the user reopened the tab, with no way to tell. A short cooldown still
 * avoids hammering a genuinely absent table, but always recovers on its own.
 */
const DB_SKIP_COOLDOWN_MS = 60_000;

/** Timestamp of the last "table is missing" response; 0 = never. */
let venuesDbSkipUntil = 0;

function venuesDbReadSkipped(): boolean {
  return Date.now() < venuesDbSkipUntil;
}

/** Call after you create `public.osm_sports_venues` in Supabase so the app retries reading venues from the DB. */
export function clearSportsVenuesDbSkip(): void {
  venuesDbSkipUntil = 0;
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

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new Error("Aborted");
    err.name = "AbortError";
    throw err;
  }
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

type OverpassNetworkResult = { geojson: SportsVenueGeoJSON; error?: string };

async function fetchOverpassNetwork(
  bboxStr: string,
  _sportRegex: string | null,
  signal?: AbortSignal
): Promise<OverpassNetworkResult> {
  const [minLat, minLng, maxLat, maxLng] = bboxStr.split(",").map(Number);
  const controller = new AbortController();
  const timeoutMs = 18_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(AUTO_CACHE_PATH, {
      method: "POST",
      body: JSON.stringify({ minLat, minLng, maxLat, maxLng }),
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      let message = `Venue fetch failed (${res.status})`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        /* ignore */
      }
      return { geojson: EMPTY_GEOJSON, error: message };
    }
    try {
      const geojson = (await res.json()) as SportsVenueGeoJSON;
      return { geojson };
    } catch {
      return { geojson: EMPTY_GEOJSON, error: "Invalid venue response" };
    }
  } catch (e) {
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "AbortError") {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    }
    return { geojson: EMPTY_GEOJSON, error: "Venue network request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Read pre-synced venues from Supabase (fast).
 *
 * Distinguishes "no venues in this bbox" (`empty`) from "the read failed" (`unavailable`)
 * so callers can retry the right one — only `unavailable` deserves a network fallback.
 *
 * Sport filtering goes through the shared `venueMatchesSelectedSports` predicate, the
 * same one the render path uses. It used to have a second, subtly different copy right
 * here (split on `;` only, no token normalization, bare pitches always dropped), so a
 * venue could pass one filter and fail the other depending on which layer you asked.
 */
export async function fetchSportsVenuesFromDb(
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  options?: { signal?: AbortSignal; sportFilter?: string[] }
): Promise<VenueDbOutcome> {
  if (!supabase) return { status: "unavailable", error: "Supabase client not configured" };
  if (venuesDbReadSkipped()) return { status: "unavailable", error: "Venue table unavailable" };
  throwIfAborted(options?.signal);
  const { minLat, minLng, maxLat, maxLng } = bbox;

  let query = supabase
    .from("osm_sports_venues")
    .select(OSM_VENUE_MAP_SELECT)
    // Stable ordering: without it the 8000-row cap would truncate an arbitrary,
    // shifting subset — venues would appear and vanish as rows were re-written.
    .order("id", { ascending: true })
    .gte("lat", minLat)
    .lte("lat", maxLat)
    .gte("lng", minLng)
    .lte("lng", maxLng)
    .limit(8000);

  if (options?.signal) {
    query = query.abortSignal(options.signal);
  }

  const { data, error } = await query;
  throwIfAborted(options?.signal);
  if (error) {
    if (isMissingVenuesTableError(error)) {
      venuesDbSkipUntil = Date.now() + DB_SKIP_COOLDOWN_MS;
    }
    const message = error.message ?? "Venue read failed";
    // This branch used to be completely dark — an unreadable table looked identical
    // to an empty neighbourhood.
    console.warn("[FUN] venue DB read failed:", error.code ?? "", message);
    return { status: "unavailable", error: message };
  }
  if (!data?.length) return { status: "empty" };

  const sportFilter = options?.sportFilter ?? [];

  const features: SportsVenueFeature[] = [];
  for (const row of data) {
    throwIfAborted(options?.signal);
    // Via unknown: the client is untyped, so PostgREST hands back a loose row shape.
    const typed = row as unknown as OsmSportsVenueRow;
    if (!venueMatchesSelectedSports(typed.sport, sportFilter, typed.leisure)) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [typed.lng, typed.lat] },
      properties: dbRowToVenueProperties(typed),
    });
  }

  // Rows existed but the filter removed them all — that is an empty *result*, not a
  // broken database, and must not trigger a full Overpass re-import.
  return features.length ? { status: "ok", geojson: { type: "FeatureCollection", features } } : { status: "empty" };
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
): Promise<VenueFetchResult> {
  const { minLat, minLng, maxLat, maxLng } = bbox;
  const sportRegex = buildPitchSportRegex(options?.sportFilter ?? []);
  const sportSig = sportRegex ?? "all";
  const cacheKey = bboxCacheKey({ minLat, minLng, maxLat, maxLng }, sportSig);
  const now = Date.now();

  hydrateFromSessionOnce();
  pruneMemory();

  const hit = memoryCache.get(cacheKey);
  if (hit && now - hit.ts < CACHE_TTL_MS) {
    return { geojson: { type: "FeatureCollection", features: hit.geojson.features }, source: "cache" };
  }

  const pending = inflight.get(cacheKey);
  if (pending) {
    const geojson = await pending;
    return { geojson, source: "overpass" };
  }

  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;

  const work = (async (): Promise<SportsVenueGeoJSON> => {
    try {
      const { geojson, error } = await fetchOverpassNetwork(bboxStr, sportRegex, options?.signal);
      if (error && geojson.features.length === 0) {
        throw new Error(error);
      }
      // Only cache real results. Caching an empty collection used to pin a bbox to
      // "no venues" for 12 minutes across reloads (sessionStorage), so a single bad
      // response outlived the condition that caused it.
      if (geojson.features.length > 0) {
        const entry: CacheEntry = { geojson, ts: Date.now() };
        memoryCache.set(cacheKey, entry);
        pruneMemory();
        persistSession();
      }
      return geojson;
    } catch (e) {
      if (e && typeof e === "object" && "name" in e && (e as { name: string }).name === "AbortError") {
        throw e;
      }
      return EMPTY_GEOJSON;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, work);
  try {
    const geojson = await work;
    return { geojson, source: "overpass" };
  } catch (e) {
    if (e && typeof e === "object" && "name" in e && (e as { name: string }).name === "AbortError") {
      throw e;
    }
    const message = e instanceof Error ? e.message : "Venue fetch failed";
    return { geojson: EMPTY_GEOJSON, source: "overpass", error: message };
  }
}

/**
 * Prefer Supabase (`osm_sports_venues`); fall back to Overpass only when the DB read
 * actually failed. A genuinely empty area is an answer, not a reason to re-import.
 */
export async function fetchSportsVenues(
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  options?: { signal?: AbortSignal; sportFilter?: string[] }
): Promise<VenueFetchResult> {
  const fromDb = await fetchSportsVenuesFromDb(bbox, options);
  if (fromDb.status === "ok") return { geojson: fromDb.geojson, source: "db" };
  if (fromDb.status === "empty") return { geojson: EMPTY_GEOJSON, source: "db" };
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
): Promise<VenueFetchResult> {
  const fullBbox = bboxFromCenterRadius(centerLat, centerLng, radiusKm);
  const fromDb = await fetchSportsVenuesFromDb(fullBbox, options);
  if (fromDb.status === "ok") return { geojson: fromDb.geojson, source: "db" };
  if (fromDb.status === "empty") return { geojson: EMPTY_GEOJSON, source: "db" };

  if (radiusKm <= PROGRESSIVE_NEAR_RADIUS_KM) {
    return fetchSportsVenuesFromOverpass(fullBbox, options);
  }

  const nearKm = Math.min(PROGRESSIVE_NEAR_RADIUS_KM, radiusKm);
  const innerBbox = bboxFromCenterRadius(centerLat, centerLng, nearKm);
  const nearResult = await fetchSportsVenuesFromOverpass(innerBbox, options);
  if (options?.onNearRing) {
    await Promise.resolve(options.onNearRing(nearResult.geojson));
  }

  const fullResult = await fetchSportsVenuesFromOverpass(fullBbox, options);
  if (fullResult.geojson.features.length > 0) {
    return fullResult;
  }

  // One retry: smaller near ring only (helps slow mobile networks).
  if (!fullResult.error && nearResult.geojson.features.length > 0) {
    return nearResult;
  }

  if (fullResult.error && nearResult.geojson.features.length === 0) {
    const retry = await fetchSportsVenuesFromOverpass(innerBbox, options);
    if (retry.geojson.features.length > 0) return retry;
    return { geojson: EMPTY_GEOJSON, source: "overpass", error: fullResult.error };
  }

  return fullResult;
}
