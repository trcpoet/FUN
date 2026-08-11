/**
 * Warm ONE tile of the venue cache: Overpass → `osm_sports_venues` + `venue_coverage`.
 * No auth required — OSM venue data is public. POST JSON: { lat, lng }
 *
 * WHY ONE TILE PER REQUEST
 * The route this replaces (`/api/auto-cache-venues`) tried to answer a venue request live,
 * inside an 18-second budget. Measured against the real default 15 km radius, Overpass
 * needs 56.6s for Los Angeles and never answered at all for London — so that route aborted
 * every time it was called on a city, and never persisted a single row.
 *
 * Splitting the work by tile is what makes it tractable: the same query that needs 56.6s
 * for an LA bbox needs 5.0s for one 0.1° LA tile, and 4.0s for central London. That fits
 * an Edge invocation with room to spare, so no request ever runs long.
 *
 * It also has to be Edge. This project's Vercel root directory is "Redesign FUN sports
 * map", and Vercel bakes that path into serverless function names, which may not contain
 * spaces — a Node-runtime function here fails to deploy with `invalid_function_name`.
 * Edge functions are exempt, which is why every other route in this repo is Edge too.
 *
 * The client fires these one tile at a time and never awaits them (see `warmVenueArea` in
 * src/app/lib/sportsVenues.ts). Each tile is committed on its own, so the map fills in
 * progressively and an interrupted sequence keeps everything that already landed.
 */
import { buildOsmVenueRow, type OsmVenueTags } from "../server/lib/osmVenueTags";
import { buildVenueOverpassQuery } from "../server/lib/osmVenueQuery";
import { rateLimit, validateBbox, apiResponse } from "../server/lib/apiGuards";
import {
  isCoverageStale,
  tileToBbox,
  tileXForLng,
  tileYForLat,
  type VenueTile,
} from "../server/lib/venueTiles";

export const config = { runtime: "edge" };

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
 * Give up on a single mirror after this long and try the next one.
 *
 * A healthy mirror answers a tile in ~4-5s. An unhealthy one does not fail fast — one was
 * observed accepting the connection and then hanging past 120s. Without a per-attempt
 * bound, a single dead mirror would consume the whole invocation while three working ones
 * sat unused.
 */
const UPSTREAM_TIMEOUT_MS = 8_000;

/** Hard ceiling for the whole request, keeping it well inside the Edge response budget. */
const REQUEST_BUDGET_MS = 22_000;

type OsmEl = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: OsmVenueTags;
};

type DbError = { message: string } | null;
type CoverageRow = { warmed_at: string };

/** Just the slice of the PostgREST builder this route uses, so the client stays untyped-safe. */
type CoverageQuery = PromiseLike<{ data: CoverageRow[] | null; error: DbError }> & {
  eq(column: string, value: number): CoverageQuery;
};

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => CoverageQuery;
    upsert: (rows: unknown, opts?: unknown) => PromiseLike<{ error: DbError }>;
  };
};

/**
 * One tile's worth of Overpass, rotating mirrors until one answers.
 *
 * Returns `null` rather than throwing when every mirror refuses — the caller must be able
 * to tell "no venues here" from "could not find out", because only the former may be
 * written to `venue_coverage`. Recording a failed fetch as coverage would permanently
 * convince the client that a real city is empty.
 *
 * One pass, no backoff between mirrors: this runs inside a request, where waiting out a
 * throttled mirror just burns the budget. If all four refuse, leave the tile uncovered and
 * let the next visit retry — by then they have usually recovered.
 */
async function fetchTileElements(bboxStr: string, deadlineAt: number): Promise<OsmEl[] | null> {
  const body = new URLSearchParams({ data: buildVenueOverpassQuery(bboxStr) }).toString();

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

/** Already imported recently? Then this request is free — repeat visitors cost nothing. */
async function isTileFresh(supabase: SupabaseLike, tile: VenueTile): Promise<boolean> {
  const { data, error } = await supabase
    .from("venue_coverage")
    .select("warmed_at")
    .eq("tile_x", tile.x)
    .eq("tile_y", tile.y);
  if (error || !data?.length) return false;
  return !isCoverageStale(data[0]!.warmed_at);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return apiResponse.error("METHOD_NOT_ALLOWED", "Use POST", 405);
  }

  // One tile per request, so the cap is per tile rather than per area. Generous enough for
  // a client walking outward from a viewport, tight enough to bound the Overpass bill.
  const limited = rateLimit(request, { key: "warm-venues", limit: 40, windowMs: 60_000 });
  if (!limited.ok) {
    return apiResponse.error("RATE_LIMITED", "Too many requests", 429, {
      headers: { "Retry-After": String(limited.retryAfter) },
    });
  }

  let body: { lat?: number; lng?: number };
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

  const tile: VenueTile = { x: tileXForLng(lng), y: tileYForLat(lat) };
  const b = tileToBbox(tile);
  const valid = validateBbox(b);
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

  if (await isTileFresh(supabase, tile)) {
    return apiResponse.success({ tile, status: "already-fresh", venues: 0 });
  }

  const deadlineAt = Date.now() + REQUEST_BUDGET_MS;
  const elements = await fetchTileElements(
    `${b.minLat},${b.minLng},${b.maxLat},${b.maxLng}`,
    deadlineAt
  );
  if (elements === null) {
    // No coverage row: we did not find out, so the next visit must try again.
    return apiResponse.error("UPSTREAM_UNAVAILABLE", "Overpass mirrors unavailable", 503);
  }

  const rows = elementsToRows(elements);
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("osm_sports_venues")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) {
      console.error("[warm-venues] venue upsert failed", error.message);
      return apiResponse.error("WRITE_FAILED", "Could not store venues", 500);
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
    return apiResponse.error("WRITE_FAILED", "Could not record coverage", 500);
  }

  return apiResponse.success({ tile, status: "warmed", venues: rows.length });
}
