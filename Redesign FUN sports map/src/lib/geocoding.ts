import { PLACE_QUERY_CACHE_MAX, PLACE_QUERY_CACHE_TTL_MS } from "./searchConstants";

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim() || undefined;

export type ForwardGeocodeFeature = {
  id: string;
  place_name: string;
  /** [lng, lat] */
  center: [number, number];
  /** Mapbox relevance score 0–1. Higher = better match for the query text. */
  relevance: number;
  /** e.g. ["place"], ["poi"], ["region"], ["address"] */
  place_type: string[];
};

type CacheEntry = { at: number; rows: ForwardGeocodeFeature[] };
const placeCache = new Map<string, CacheEntry>();

function cacheKey(q: string, limit: number, proximity?: [number, number]): string {
  const px = proximity ? `${proximity[0].toFixed(3)},${proximity[1].toFixed(3)}` : "";
  return `${q.toLowerCase()}|${limit}|${px}`;
}

function readPlaceCache(key: string): ForwardGeocodeFeature[] | null {
  const hit = placeCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > PLACE_QUERY_CACHE_TTL_MS) {
    placeCache.delete(key);
    return null;
  }
  return hit.rows;
}

function writePlaceCache(key: string, rows: ForwardGeocodeFeature[]) {
  if (placeCache.size >= PLACE_QUERY_CACHE_MAX) {
    const first = placeCache.keys().next().value as string | undefined;
    if (first) placeCache.delete(first);
  }
  placeCache.set(key, { at: Date.now(), rows });
}

/**
 * Forward geocode (debounced callers should pass trimmed query, min length 2).
 * Uses optional in-memory cache and supports AbortSignal to drop stale responses.
 */
export async function forwardGeocodeSearch(
  query: string,
  options?: { limit?: number; proximity?: [number, number]; signal?: AbortSignal }
): Promise<ForwardGeocodeFeature[]> {
  const q = query.trim();
  if (!MAPBOX_TOKEN || q.length < 2) return [];

  const limit = options?.limit ?? 5;
  const key = cacheKey(q, limit, options?.proximity);
  const cached = readPlaceCache(key);
  if (cached) return cached;

  const encoded = encodeURIComponent(q);
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json`);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("types", "country,region,postcode,district,place,locality,neighborhood,address,poi");
  url.searchParams.set("limit", String(limit));
  if (options?.proximity) {
    url.searchParams.set("proximity", `${options.proximity[0]},${options.proximity[1]}`);
  }

  try {
    const res = await fetch(url.toString(), { signal: options?.signal });
    if (options?.signal?.aborted) return [];
    if (!res.ok) return [];
    const data = await res.json();
    const features = data.features as Array<{
      id: string;
      place_name: string;
      center: [number, number];
      relevance: number;
      place_type: string[];
    }>;
    if (!Array.isArray(features)) return [];
    const rows = features.map((f) => ({
      id: f.id,
      place_name: f.place_name,
      center: f.center,
      relevance: typeof f.relevance === "number" ? f.relevance : 0,
      place_type: Array.isArray(f.place_type) ? f.place_type : [],
    }));
    writePlaceCache(key, rows);
    return rows;
  } catch (e) {
    if (options?.signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) return [];
    return [];
  }
}
