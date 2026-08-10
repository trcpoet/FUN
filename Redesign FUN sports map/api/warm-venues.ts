/**
 * Warm the venue cache for an area: Overpass → `osm_sports_venues` + `venue_coverage`.
 * No auth required — OSM venue data is public. POST JSON: { lat, lng, radiusKm? }
 *
 * WHY THIS IS NOT ON THE EDGE RUNTIME, AND WHY THE CLIENT DOES NOT AWAIT IT
 * The route this replaces (`/api/auto-cache-venues`) tried to answer a venue request live,
 * inside an 18-second budget. Measured against the real default 15 km radius, Overpass
 * needs 56.6s for Los Angeles and never answered at all for London — so that route aborted
 * every time it was called on a city, which is why it never persisted a single row.
 *
 * The work is inherently slow, so it moved off the request path instead of being squeezed
 * into it. The client fires this and immediately forgets about it (see `warmVenueArea` in
 * src/app/lib/sportsVenues.ts); the map shows whatever the DB already had and picks up the
 * new rows on a later read. Nobody is waiting, so this is free to take minutes.
 *
 * Work is committed per tile, not at the end: if the invocation is cut short — timeout,
 * client navigating away under Fluid request cancellation — every tile that finished is
 * already saved, and the next visitor resumes from there instead of starting over.
 */
import { buildOsmVenueRow, type OsmVenueTags } from "../server/lib/osmVenueTags";
import { buildVenueOverpassQuery } from "../server/lib/osmVenueQuery";
import { rateLimit, validateBbox, apiResponse } from "../server/lib/apiGuards";
import {
  bboxFromCenterRadius,
  isCoverageStale,
  sortTilesByProximity,
  tileRangeForBbox,
  tileToBbox,
  tilesForBbox,
  VENUE_WARM_MAX_TILES,
  VENUE_WARM_RADIUS_KM,
  type VenueTile,
} from "../server/lib/venueTiles";

export const config = { runtime: "nodejs", maxDuration: 300 };

/**
 * Same mirror list the ops backfill uses. More than the two the old route raced: public
 * Overpass instances shed load aggressively (a handful of requests in a row is enough to
 * start collecting 504s), so having somewhere else to go matters more than going fast.
 */
const UPSTREAMS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

/**
 * Hard deadline for all Overpass work, leaving headroom under `maxDuration` to respond.
 *
 * Enforced before every mirror attempt, not just between tiles. An earlier version checked
 * it only when starting a tile and let the tile itself run unbounded — a live run took
 * **1061s**, three times the function limit, because throttled mirrors kept it in retries.
 * Vercel would have killed it mid-tile.
 */
const TILE_BUDGET_MS = 200_000;

/**
 * Give up on a single mirror after this long and try the next one.
 *
 * A healthy mirror answers a tile in ~4-5s (measured: central Los Angeles 5.0s, central
 * London 4.0s). An unhealthy one does not fail fast — one mirror was observed accepting
 * the connection and then hanging past 120s. Without a per-attempt bound, a single dead
 * mirror would swallow the whole budget while three working ones sat unused.
 */
const UPSTREAM_TIMEOUT_MS = 12_000;

type OsmEl = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: OsmVenueTags;
};

/**
 * One tile's worth of Overpass, rotating mirrors and backing off between rounds.
 *
 * Returns `null` rather than throwing when every mirror refuses — the caller must be able
 * to tell "no venues here" from "could not find out", because only the former may be
 * written to `venue_coverage`. Recording a failed fetch as coverage would permanently
 * convince the client that a real city is empty.
 */
async function fetchTileElements(bboxStr: string, deadlineAt: number): Promise<OsmEl[] | null> {
  const body = new URLSearchParams({ data: buildVenueOverpassQuery(bboxStr) }).toString();

  // ONE pass over the mirrors, no backoff between them. The ops backfill can afford to sit
  // in escalating retries because nobody is waiting on it; this runs inside a request-scoped
  // function, where waiting out a throttled mirror just burns the budget for tiles that
  // would have succeeded. If all four refuse, leave the tile uncovered and let the next
  // visit try again — by then the mirrors have usually recovered.
  for (const url of UPSTREAMS) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) return null;

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), Math.min(UPSTREAM_TIMEOUT_MS, remaining));
    try {
      const res = await fetch(url, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        signal: abort.signal,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { elements?: OsmEl[] };
      return json.elements ?? [];
    } catch {
      // Refused, throttled, or hung past the timeout — try the next mirror.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function elementsToRows(elements: OsmEl[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null || el.type == null || el.id == null) continue;
    rows.push(buildOsmVenueRow(el.type, el.id, lat, lon, el.tags, now));
  }
  return rows;
}

type DbError = { message: string } | null;
type CoverageRow = { tile_x: number; tile_y: number; warmed_at: string };

/** Just the slice of the PostgREST builder this route uses, so the client stays untyped-safe. */
type CoverageQuery = PromiseLike<{ data: CoverageRow[] | null; error: DbError }> & {
  gte(column: string, value: number): CoverageQuery;
  lte(column: string, value: number): CoverageQuery;
};

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => CoverageQuery;
    upsert: (rows: unknown, opts?: unknown) => PromiseLike<{ error: DbError }>;
  };
};

/** Tiles we have already imported recently — skipped, so repeat visitors cost nothing. */
async function freshTileKeys(
  supabase: SupabaseLike,
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number }
): Promise<Set<string>> {
  const range = tileRangeForBbox(bbox);
  const fresh = new Set<string>();
  const { data, error } = await supabase
    .from("venue_coverage")
    .select("tile_x,tile_y,warmed_at")
    .gte("tile_x", range.minX)
    .lte("tile_x", range.maxX)
    .gte("tile_y", range.minY)
    .lte("tile_y", range.maxY);

  if (error || !data) return fresh;
  for (const row of data) {
    if (!isCoverageStale(row.warmed_at)) fresh.add(`${row.tile_x},${row.tile_y}`);
  }
  return fresh;
}

/** Import one tile and record that we looked. Returns the venue count, or null if it failed. */
async function warmTile(
  supabase: SupabaseLike,
  tile: VenueTile,
  deadlineAt: number
): Promise<number | null> {
  const b = tileToBbox(tile);
  const elements = await fetchTileElements(
    `${b.minLat},${b.minLng},${b.maxLat},${b.maxLng}`,
    deadlineAt
  );
  if (elements === null) return null;

  const rows = elementsToRows(elements);
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("osm_sports_venues")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) {
      console.error("[warm-venues] venue upsert failed", error.message);
      return null;
    }
  }

  // Only after the venues are safely stored: coverage is the client's promise that the
  // rows it can see are all the rows there are.
  const { error: coverageError } = await supabase.from("venue_coverage").upsert(
    { tile_x: tile.x, tile_y: tile.y, warmed_at: new Date().toISOString(), venue_count: rows.length },
    { onConflict: "tile_x,tile_y" }
  );
  if (coverageError) {
    console.error("[warm-venues] coverage upsert failed", coverageError.message);
    return null;
  }
  return rows.length;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return apiResponse.error("METHOD_NOT_ALLOWED", "Use POST", 405);
  }

  const limited = rateLimit(request, { key: "warm-venues", limit: 12, windowMs: 60_000 });
  if (!limited.ok) {
    return apiResponse.error("RATE_LIMITED", "Too many requests", 429, {
      headers: { "Retry-After": String(limited.retryAfter) },
    });
  }

  let body: { lat?: number; lng?: number; radiusKm?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiResponse.error("BAD_REQUEST", "Invalid JSON", 400);
  }

  const { lat, lng } = body;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return apiResponse.error("BAD_REQUEST", "Invalid lat", 400);
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return apiResponse.error("BAD_REQUEST", "Invalid lng", 400);
  }

  // The caller's radius is a request, not an instruction: the cap is what keeps a tile
  // count (and therefore the Overpass bill) bounded no matter what the map asks for.
  const requested = typeof body.radiusKm === "number" && Number.isFinite(body.radiusKm)
    ? body.radiusKm
    : VENUE_WARM_RADIUS_KM;
  const radiusKm = Math.min(Math.max(requested, 1), VENUE_WARM_RADIUS_KM);

  const bbox = bboxFromCenterRadius(lat, lng, radiusKm);
  const valid = validateBbox(bbox);
  if (!valid.ok) {
    return apiResponse.error("BAD_REQUEST", valid.error, 400);
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceKey) {
    // Loud on purpose. Without these the job silently fetches and discards, which looks
    // exactly like the bug this route exists to fix.
    console.error("[warm-venues] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return apiResponse.error("NOT_CONFIGURED", "Venue cache is not configured", 503);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceKey) as unknown as SupabaseLike;

  const fresh = await freshTileKeys(supabase, bbox);
  const tiles = sortTilesByProximity(tilesForBbox(bbox), lat, lng)
    .filter((t) => !fresh.has(`${t.x},${t.y}`))
    .slice(0, VENUE_WARM_MAX_TILES);

  const deadlineAt = Date.now() + TILE_BUDGET_MS;
  let warmed = 0;
  let venues = 0;
  let failed = 0;
  let skippedForBudget = 0;

  // Sequential on purpose. The tiles nearest the viewport go first and each is committed as
  // it lands, so the map fills in from the middle outward while this is still running —
  // and one client never has several requests in flight against the same mirror.
  for (const tile of tiles) {
    if (Date.now() >= deadlineAt) {
      skippedForBudget += 1;
      continue;
    }
    const count = await warmTile(supabase, tile, deadlineAt);
    if (count === null) {
      failed += 1;
    } else {
      warmed += 1;
      venues += count;
    }
  }

  return apiResponse.success({
    tilesRequested: tiles.length,
    tilesWarmed: warmed,
    tilesFailed: failed,
    tilesSkippedForBudget: skippedForBudget,
    tilesAlreadyFresh: fresh.size,
    venues,
  });
}
