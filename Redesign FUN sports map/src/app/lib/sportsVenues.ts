/**
 * Sports venue overlay: read from the Supabase cache, and ask for un-imported areas to be
 * filled in the background.
 *
 * WHY THERE IS NO OVERPASS CALL HERE ANY MORE
 * This module used to fall back to a live Overpass fetch when the cache missed, and the
 * render path awaited it. That could not work for the places people actually search.
 * Measured against the 18s budget the route allowed itself: a 15 km bbox over Los Angeles
 * took 56.6s (6.4 MB, 19k elements) and London never answered at all. The awaited call
 * always aborted, and — because the error was swallowed on the way back — the map reported
 * a dead pipeline as "no sports venues here".
 *
 * So the request path is now DB-only and never blocks on OSM. A cache miss fires a
 * non-blocking warm request and reports `warming`; `/api/warm-venues` does the slow work
 * server-side and the map picks the rows up on its next read. Overpass is still the source
 * of truth — it just no longer sits between the user and the map.
 */

import { venueMatchesSelectedSports } from "../../lib/osmSportTags";
import { supabase } from "../../lib/supabase";
import { retryTransient } from "../../lib/retryTransient";
import type { OsmSportsVenueRow } from "../../lib/supabase";
import { OSM_VENUE_MAP_SELECT } from "../../lib/osmVenueColumns";
import {
  bboxFromCenterRadius,
  isCoverageStale,
  sortTilesByProximity,
  tileCountForBbox,
  tileRangeForBbox,
  tileToBbox,
  tilesForBbox,
  VENUE_WARM_MAX_TILES,
  VENUE_WARM_RADIUS_KM,
  type VenueTile,
} from "../../../server/lib/venueTiles";
import type { SportsVenueFeature, SportsVenueGeoJSON } from "./sportsVenueTypes";
import { dbRowToVenueProperties } from "./venueSelection";
import { venueAccessTier, VENUE_ACCESS_POSTGREST_FILTERS } from "./venueAccess";
import { isMissingRpc } from "../../lib/rpcErrors";

/**
 * Rows to ask for per venue read.
 *
 * Not a tuning knob — PostgREST enforces `db-max-rows = 1000` on this project, verified against
 * production (`?limit=5000` and `?limit=1500` both return exactly 1000). Asking for the 8000 the
 * code used to request only made the ceiling invisible: the map has always been seeing 1000
 * venues, and the reason that was a *bug* rather than a limit is that the old read ordered by
 * `id`, so those 1000 were an arbitrary geographic sample rather than the nearest ones.
 */
const VENUE_READ_LIMIT = 1000;

export type { SportsVenueProperties, SportsVenueFeature, SportsVenueGeoJSON } from "./sportsVenueTypes";

/**
 * Result of a venue read.
 *
 * `empty` and `uncached` are the distinction this whole module turns on. Both come back
 * with zero venues, but they mean opposite things: `empty` is an answer ("we looked, there
 * is nothing here"), `uncached` is the absence of one ("nobody has imported this area").
 * Collapsing them is what made Los Angeles show no venues indefinitely — and telling them
 * apart by row count alone is not possible, hence `public.venue_coverage`.
 */
export type VenueDbOutcome =
  | { status: "ok"; geojson: SportsVenueGeoJSON }
  | { status: "empty" }
  | { status: "uncached" }
  | { status: "unavailable"; error: string };

/** What a load produced, and what the map should tell the user about it. */
export type VenueLoadResult = {
  geojson: SportsVenueGeoJSON;
  /** `warming`: nothing yet, but an import is on its way — poll rather than give up. */
  status: "ok" | "empty" | "warming" | "unavailable";
  error?: string;
};

const EMPTY_GEOJSON: SportsVenueGeoJSON = { type: "FeatureCollection", features: [] };

/** Background import: fetches from Overpass server-side and persists. Returns 202 immediately. */
const WARM_PATH = "/api/warm-venues";

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

function isMissingTableError(
  error: { code?: string; message?: string; details?: string } | null,
  table: string
): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const blob = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (!blob.includes(table)) return false;
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

/**
 * Re-exported so callers keep importing venue geometry from the venue module, while the
 * implementation stays shared with the warm route — see `server/lib/venueTiles.ts`.
 */
export { bboxFromCenterRadius };

/**
 * Has every tile touching this bbox been imported (and recently enough to trust)?
 *
 * Only consulted when the venue read came back with zero rows, so the extra round-trip is
 * rare — the common case answers itself, since rows can only exist where we have looked.
 *
 * Returns `false` when it cannot tell (missing table, failed read). Guessing "covered"
 * would re-create the original bug — an un-imported city silently declared empty — whereas
 * guessing "not covered" costs at most one warm request, which the server de-duplicates
 * against this same table anyway.
 */
async function isAreaCovered(
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number },
  signal?: AbortSignal
): Promise<boolean> {
  if (!supabase) return false;
  const range = tileRangeForBbox(bbox);

  let query = supabase
    .from("venue_coverage")
    .select("tile_x,tile_y,warmed_at")
    .gte("tile_x", range.minX)
    .lte("tile_x", range.maxX)
    .gte("tile_y", range.minY)
    .lte("tile_y", range.maxY);

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) {
    if (!isMissingTableError(error, "venue_coverage")) {
      console.warn("[FUN] venue coverage read failed:", error.code ?? "", error.message ?? "");
    }
    return false;
  }
  if (!data?.length) return false;

  const now = Date.now();
  let fresh = 0;
  for (const row of data) {
    const { warmed_at: warmedAt } = row as unknown as { warmed_at: string };
    if (!isCoverageStale(warmedAt, now)) fresh += 1;
  }
  // Partial coverage is not coverage: one un-imported tile in view is a hole in the map.
  return fresh >= tileCountForBbox(bbox);
}

/**
 * How long to leave a tile alone after the server refused to warm it.
 *
 * A refusal used to make the tile immediately requestable again, which was half right: a bad
 * minute must not permanently poison ground the user can see. But `warmVenueArea` runs on every
 * map settle, so "forget it happened" meant re-asking within seconds — producing a stream of
 * 503s in the console and hammering the very Overpass mirrors that had just refused. Backing off
 * keeps the self-healing property without the storm.
 *
 * Same shape as `DB_SKIP_COOLDOWN_MS` above, for the same reason: recover on your own, but do
 * not hammer.
 */
const WARM_RETRY_COOLDOWN_MS = 5 * 60_000;

/**
 * Tiles we have already asked the server to import → the time before which we must not ask
 * again, so a map that re-reads while an import is still running does not re-request the same
 * ground on every pass.
 *
 * `Infinity` means "asked and accepted, never re-ask this session"; a finite timestamp is a
 * refusal we intend to retry after the cooldown.
 */
const warmRequested = new Map<string, number>();

/** Guards against several warm walks running at once — see `warmVenueArea`. */
let warmChainRunning = false;

const tileKey = (tile: VenueTile) => `${tile.x},${tile.y}`;

/** True while a tile is either already accepted or inside its post-refusal cooldown. */
function warmSuppressed(key: string, now: number): boolean {
  const until = warmRequested.get(key);
  return until !== undefined && now < until;
}

/** Ask the server to import one tile. Resolves either way; never throws. */
async function warmTile(tile: VenueTile): Promise<void> {
  const key = tileKey(tile);
  if (warmSuppressed(key, Date.now())) return;
  warmRequested.set(key, Infinity);

  const b = tileToBbox(tile);
  try {
    const res = await fetch(WARM_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Centre of the tile, so the server derives exactly the tile we mean.
      body: JSON.stringify({
        lat: (b.minLat + b.maxLat) / 2,
        lng: (b.minLng + b.maxLng) / 2,
      }),
    });
    // Only a request the server accepted counts as "asked". A rejected one (rate-limited, or
    // Overpass refusing every mirror, which answers 503) becomes retryable — but not until the
    // cooldown elapses, or the next map settle would ask again immediately.
    if (!res.ok) warmRequested.set(key, Date.now() + WARM_RETRY_COOLDOWN_MS);
  } catch {
    warmRequested.set(key, Date.now() + WARM_RETRY_COOLDOWN_MS);
  }
}

/**
 * Ask the server to import the area around a point. Fire-and-forget by design.
 *
 * Walks outward from the centre one tile at a time, so the ground under the viewport lands
 * first and the map can paint it while the rest is still arriving. Sequential rather than
 * parallel on purpose: a burst of concurrent requests is exactly what makes the public
 * Overpass mirrors start refusing us, and each tile is committed on its own anyway.
 *
 * Deliberately NOT wired to the caller's AbortController — the map aborts venue reads
 * constantly (every pan, every filter change), and cancelling those must not cancel an
 * import that is already underway, or it would restart from nothing and never finish.
 */
function warmVenueArea(centerLat: number, centerLng: number): void {
  // At most one chain at a time. The map re-reads every few seconds while an import is
  // outstanding, and without this each re-read would start a *second* chain for whichever
  // tiles the first had not reached yet — turning a deliberately sequential walk into the
  // concurrent burst that gets us refused by the Overpass mirrors.
  if (warmChainRunning) return;

  const bbox = bboxFromCenterRadius(centerLat, centerLng, VENUE_WARM_RADIUS_KM);
  const now = Date.now();
  const tiles = sortTilesByProximity(tilesForBbox(bbox), centerLat, centerLng)
    // Must ask `warmSuppressed`, not `warmRequested.has` — a refused tile keeps its entry as a
    // retry-after timestamp, so `.has()` would exclude it from the walk forever and the
    // cooldown would never actually expire.
    .filter((t) => !warmSuppressed(tileKey(t), now))
    .slice(0, VENUE_WARM_MAX_TILES);
  if (tiles.length === 0) return;

  warmChainRunning = true;
  void (async () => {
    try {
      for (const tile of tiles) {
        await warmTile(tile);
      }
    } finally {
      warmChainRunning = false;
    }
  })();
}

/**
 * Read pre-synced venues from Supabase (fast).
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

  // A PostgREST builder can only be awaited once, so the whole query is rebuilt per attempt.

  /**
   * Preferred read: nearest-first, ordered server-side.
   *
   * PostgREST caps every response at 1000 rows on this project, so whichever rows the database
   * decides to hand back are the only ones that exist as far as the map is concerned. Ordering
   * therefore has to happen before the cap, which a plain table read cannot express — `order=`
   * only takes real columns and distance depends on where the viewer is.
   */
  const buildRpc = () => {
    const query = supabase!.rpc("get_venues_in_bbox", {
      p_min_lat: minLat,
      p_min_lng: minLng,
      p_max_lat: maxLat,
      p_max_lng: maxLng,
      p_limit: VENUE_READ_LIMIT,
    });
    return options?.signal ? query.abortSignal(options.signal) : query;
  };

  /**
   * Fallback for a deployment that has not applied 20260812120000 yet.
   *
   * Returns the same shape and the same access filtering, just ordered by id — which is the old
   * behaviour, and still better than no venues at all.
   */
  const buildTableQuery = () => {
    let query = supabase!
      .from("osm_sports_venues")
      .select(OSM_VENUE_MAP_SELECT)
      // Stable ordering: without it the row cap would truncate an arbitrary, shifting
      // subset — venues would appear and vanish as rows were re-written.
      .order("id", { ascending: true })
      .gte("lat", minLat)
      .lte("lat", maxLat)
      .gte("lng", minLng)
      .lte("lng", maxLng)
      .limit(VENUE_READ_LIMIT);

    // Drop private and residential venues server-side, BEFORE the row cap applies. Over half
    // the table is unnamed backyard pools, so without this a dense suburb spends its whole row
    // budget on venues the client is about to discard, truncating the real pitches.
    // `venueAccessTier` below is still the rule — these filters are only ever allowed to be a
    // subset of it, which venueAccess.test.ts asserts.
    for (const filter of VENUE_ACCESS_POSTGREST_FILTERS) {
      query = query.or(filter);
    }

    if (options?.signal) {
      query = query.abortSignal(options.signal);
    }
    return query;
  };

  // Retried on a 5xx: the outcome union below already keeps "unavailable" distinct from
  // "empty", but a venue layer that gives up on the first blip still leaves the map bare.
  // Retries stop the moment the caller aborts — panning must not queue doomed requests.
  const shouldContinue = () => !options?.signal?.aborted;
  let { data, error } = await retryTransient(buildRpc, { shouldContinue });
  if (error && isMissingRpc(error)) {
    ({ data, error } = await retryTransient(buildTableQuery, { shouldContinue }));
  }
  throwIfAborted(options?.signal);
  if (error) {
    if (isMissingTableError(error, "osm_sports_venues")) {
      venuesDbSkipUntil = Date.now() + DB_SKIP_COOLDOWN_MS;
    }
    const message = error.message ?? "Venue read failed";
    // This branch used to be completely dark — an unreadable table looked identical
    // to an empty neighbourhood.
    console.warn("[FUN] venue DB read failed:", error.code ?? "", message);
    return { status: "unavailable", error: message };
  }

  // No rows is the ambiguous case, and the only one worth a coverage lookup.
  if (!data?.length) {
    const covered = await isAreaCovered(bbox, options?.signal);
    throwIfAborted(options?.signal);
    return covered ? { status: "empty" } : { status: "uncached" };
  }

  const sportFilter = options?.sportFilter ?? [];

  const features: SportsVenueFeature[] = [];
  for (const row of data) {
    throwIfAborted(options?.signal);
    // Via unknown: the client is untyped, so PostgREST hands back a loose row shape.
    const typed = row as unknown as OsmSportsVenueRow;
    if (!venueMatchesSelectedSports(typed.sport, sportFilter, typed.leisure)) continue;
    // Backstop for the query filter above, and the single source of truth for the tier. A row
    // reaching here that the classifier hides means the two have drifted.
    if (!venueAccessTier(typed).canRender) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [typed.lng, typed.lat] },
      properties: dbRowToVenueProperties(typed),
    });
  }

  // Rows existed but the filter removed them all — that is an empty *result*, not a
  // missing import, so it must not trigger a warm.
  return features.length ? { status: "ok", geojson: { type: "FeatureCollection", features } } : { status: "empty" };
}

/**
 * Areas already answered this session, so asking for one again costs nothing.
 *
 * Venues load only for an explicit act — a double-tap, a search, a venue opened from the feed —
 * and people revisit the same handful of places. Re-asking for one should be instant.
 *
 * This cache is for SPEED, NOT FOR DISPLAY. Nothing reads it except `loadVenuesForArea`, and
 * `loadVenuesForArea` only runs for an explicit request, so panning across a cached area can
 * never reveal it. Whatever the last explicit request returned is what stays on the map.
 */
const areaCache = new Map<string, VenueLoadResult>();

/** Plenty for a session's worth of revisits, small enough not to matter. */
const AREA_CACHE_MAX = 20;

/**
 * ~1km of latitude, which is well inside the smallest radius we ever request, so two taps that
 * round together genuinely describe the same ground.
 */
function areaCacheKey(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  sportFilter: string[]
): string {
  const lat = centerLat.toFixed(2);
  const lng = centerLng.toFixed(2);
  // Sorted so ["Tennis","Soccer"] and ["Soccer","Tennis"] are one entry, not two.
  return `${lat},${lng},${radiusKm},${[...sportFilter].sort().join("|")}`;
}

/** Drop the whole cache. Exported for tests and for a hard refresh of the venue layer. */
export function clearVenueAreaCache(): void {
  areaCache.clear();
}

/**
 * Load the venues around a point, and get an un-imported area moving without waiting for it.
 *
 * Never performs a slow network fetch: the read is a single indexed Supabase query, and the only
 * other thing that can happen is a fire-and-forget warm request.
 */
export async function loadVenuesForArea(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  options?: { signal?: AbortSignal; sportFilter?: string[] }
): Promise<VenueLoadResult> {
  const sportFilter = options?.sportFilter ?? [];
  const key = areaCacheKey(centerLat, centerLng, radiusKm, sportFilter);

  const cached = areaCache.get(key);
  if (cached) {
    // Refresh recency so the LRU keeps the places actually being revisited.
    areaCache.delete(key);
    areaCache.set(key, cached);
    return cached;
  }

  const bbox = bboxFromCenterRadius(centerLat, centerLng, radiusKm);
  const outcome = await fetchSportsVenuesFromDb(bbox, options);

  /**
   * Only answers get cached.
   *
   * `warming` and `unavailable` are both "we did not find out" — caching either would freeze
   * that ground as permanently empty for the rest of the session, which is the same trap
   * `venueCoverageRef` avoids in MapboxMap and the reason a failed Overpass fetch never writes
   * a `venue_coverage` row.
   */
  const remember = (result: VenueLoadResult): VenueLoadResult => {
    if (result.status !== "ok" && result.status !== "empty") return result;
    areaCache.set(key, result);
    if (areaCache.size > AREA_CACHE_MAX) {
      const oldest = areaCache.keys().next();
      if (!oldest.done) areaCache.delete(oldest.value);
    }
    return result;
  };

  switch (outcome.status) {
    case "ok":
      return remember({ geojson: outcome.geojson, status: "ok" });
    case "empty":
      return remember({ geojson: EMPTY_GEOJSON, status: "empty" });
    case "uncached":
      warmVenueArea(centerLat, centerLng);
      return { geojson: EMPTY_GEOJSON, status: "warming" };
    case "unavailable":
      return { geojson: EMPTY_GEOJSON, status: "unavailable", error: outcome.error };
  }
}
