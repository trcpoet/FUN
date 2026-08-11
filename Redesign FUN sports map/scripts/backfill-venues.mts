/**
 * Local ops tool — seed osm_sports_venues (and venue_coverage) for a bbox using the
 * CURRENT venue Overpass query, so rows match what the runtime warm route would write.
 *
 * Writes DIRECTLY to the DB with the service-role key from .env (bypasses the
 * OSM_IMPORT_SECRET endpoint) — for local backfills only.
 *
 * WHY YOU WOULD RUN THIS
 * `/api/warm-venues` fills areas on demand, but a first visitor still waits on Overpass,
 * which is slow for a dense city and throttled by the public mirrors. Seeding the metros
 * you actually launch in means almost nobody hits that path: the DB read is instant, and
 * the warm route stays a long-tail fallback.
 *
 * Work is split along the SAME 0.1° grid as `venue_coverage` (server/lib/venueTiles.ts).
 * Whole-metro bboxes are far too large for one Overpass query — 15 km of Los Angeles
 * already takes ~57s and London times out — so the split is what makes a metro possible
 * at all, and aligning it to the coverage grid is what lets the client tell "imported,
 * genuinely empty" from "never imported".
 *
 * Usage:
 *   npx tsx scripts/backfill-venues.mts <minLat> <minLng> <maxLat> <maxLng>
 * Example (Arlington / UT-Arlington):
 *   npx tsx scripts/backfill-venues.mts 32.68 -97.20 32.78 -97.05
 * Example (Los Angeles metro — expect several minutes):
 *   npx tsx scripts/backfill-venues.mts 33.70 -118.70 34.35 -118.10
 */
import { readFileSync } from "node:fs";
import { buildVenueOverpassQuery } from "../server/lib/osmVenueQuery";
import { buildOsmVenueRow, type OsmVenueTags } from "../server/lib/osmVenueTags";
import {
  isCoverageStale,
  tileRangeForBbox,
  tileToBbox,
  tilesForBbox,
  type VenueTile,
} from "../server/lib/venueTiles";
import { createClient } from "@supabase/supabase-js";

const rawArgs = process.argv.slice(2);
/** Re-import tiles we already have. Off by default so a re-run only retries what failed. */
const force = rawArgs.includes("--force");
const args = rawArgs.filter((a) => !a.startsWith("--")).map(Number);
if (args.length !== 4 || args.some((n) => Number.isNaN(n))) {
  console.error(
    "Usage: npx tsx scripts/backfill-venues.mts <minLat> <minLng> <maxLat> <maxLng> [--force]",
  );
  process.exit(1);
}
const [minLat, minLng, maxLat, maxLng] = args as [number, number, number, number];

// --- env from .env ---
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const SUPABASE_URL = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").trim();
const SERVICE_KEY = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const UPSTREAMS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type OsmEl = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: OsmVenueTags;
};

/**
 * Abandon a mirror after this long and try the next.
 *
 * A healthy mirror returns a 0.1° tile in ~4-5s. An unhealthy one has been seen accepting
 * the connection and then hanging past 120s — with four mirrors and four rounds, a couple
 * of those would stall a metro seed for the better part of an hour.
 */
const UPSTREAM_TIMEOUT_MS = 30_000;

async function fetchOverpass(query: string): Promise<OsmEl[]> {
  const body = new URLSearchParams({ data: query }).toString();
  const ROUNDS = 4;
  for (let round = 0; round < ROUNDS; round++) {
    for (const url of UPSTREAMS) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          signal: abort.signal,
        });
        if (!res.ok) {
          console.warn(`  ${url} → ${res.status}, trying next`);
          continue;
        }
        const json = (await res.json()) as { elements?: OsmEl[] };
        return json.elements ?? [];
      } catch (e) {
        console.warn(`  ${url} failed: ${(e as Error).message}, trying next`);
      } finally {
        clearTimeout(timer);
      }
    }
    if (round < ROUNDS - 1) {
      const wait = 8000 * (round + 1);
      console.log(`  all mirrors busy — waiting ${wait / 1000}s before retry ${round + 2}/${ROUNDS}…`);
      await sleep(wait);
    }
  }
  throw new Error("all Overpass upstreams failed after retries");
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

/** Import one grid tile and record the coverage row. Returns venues written. */
async function backfillTile(tile: VenueTile): Promise<number> {
  const b = tileToBbox(tile);
  const bboxStr = `${b.minLat},${b.minLng},${b.maxLat},${b.maxLng}`;
  const elements = await fetchOverpass(buildVenueOverpassQuery(bboxStr));

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null || el.type == null || el.id == null) continue;
    rows.push(buildOsmVenueRow(el.type, el.id, lat, lon, el.tags, now));
  }

  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("osm_sports_venues")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) throw new Error(`venue upsert failed: ${error.message}`);
  }

  // Written last, and only on success: coverage is the client's promise that the rows it
  // can see are all the rows there are. Recording it after a failed fetch would convince
  // the map that a real city is empty — permanently, and silently.
  const { error: coverageError } = await supabase.from("venue_coverage").upsert(
    { tile_x: tile.x, tile_y: tile.y, warmed_at: new Date().toISOString(), venue_count: rows.length },
    { onConflict: "tile_x,tile_y" },
  );
  if (coverageError) throw new Error(`coverage upsert failed: ${coverageError.message}`);

  return rows.length;
}

/** Tiles already imported and still fresh — skipped, so a re-run only retries what failed. */
async function freshTileKeys(): Promise<Set<string>> {
  const range = tileRangeForBbox({ minLat, minLng, maxLat, maxLng });
  const fresh = new Set<string>();
  const { data, error } = await supabase
    .from("venue_coverage")
    .select("tile_x,tile_y,warmed_at")
    .gte("tile_x", range.minX)
    .lte("tile_x", range.maxX)
    .gte("tile_y", range.minY)
    .lte("tile_y", range.maxY);

  if (error) {
    console.warn(`Could not read venue_coverage (${error.message}) — importing every tile.`);
    return fresh;
  }
  for (const row of (data ?? []) as { tile_x: number; tile_y: number; warmed_at: string }[]) {
    if (!isCoverageStale(row.warmed_at)) fresh.add(`${row.tile_x},${row.tile_y}`);
  }
  return fresh;
}

async function main() {
  const allTiles = tilesForBbox({ minLat, minLng, maxLat, maxLng });
  const fresh = force ? new Set<string>() : await freshTileKeys();
  const tiles = allTiles.filter((t) => !fresh.has(`${t.x},${t.y}`));

  console.log(
    `Backfilling ${minLat},${minLng},${maxLat},${maxLng} — ${allTiles.length} tile(s) of 0.1°` +
      (fresh.size ? `, ${fresh.size} already imported (use --force to redo).` : "."),
  );
  if (tiles.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let venues = 0;
  let failed = 0;
  for (const [i, tile] of tiles.entries()) {
    const b = tileToBbox(tile);
    const label = `[${i + 1}/${tiles.length}] tile ${tile.x},${tile.y} (${b.minLat.toFixed(1)},${b.minLng.toFixed(1)})`;
    try {
      const count = await backfillTile(tile);
      venues += count;
      console.log(`${label} → ${count} venues`);
    } catch (e) {
      failed += 1;
      // Keep going: one unreachable tile should not abandon the rest of a metro, and the
      // tiles that did land are already committed.
      console.error(`${label} → FAILED: ${(e as Error).message}`);
    }
  }

  console.log(`\nDone. ${venues} venues across ${tiles.length - failed}/${tiles.length} tiles.`);
  if (failed > 0) {
    console.log(`${failed} tile(s) failed — re-run the same bbox to retry just those.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
