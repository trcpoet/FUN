/**
 * Local ops tool — backfill a bbox into osm_sports_venues using the CURRENT
 * venue Overpass query (reuses the real importer code, so rows match exactly).
 *
 * Writes DIRECTLY to the DB with the service-role key from .env (bypasses the
 * OSM_IMPORT_SECRET endpoint) — for local backfills only. The client is DB-first,
 * so this is how you refresh an already-cached area after the query changes;
 * brand-new areas backfill themselves via /api/auto-cache-venues.
 *
 * Usage:
 *   npx tsx scripts/backfill-venues.mts <minLat> <minLng> <maxLat> <maxLng>
 * Example (Arlington / UT-Arlington):
 *   npx tsx scripts/backfill-venues.mts 32.68 -97.20 32.78 -97.05
 */
import { readFileSync } from "node:fs";
import { buildVenueOverpassQuery } from "../server/lib/osmVenueQuery";
import { buildOsmVenueRow, type OsmVenueTags } from "../server/lib/osmVenueTags";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2).map(Number);
if (args.length !== 4 || args.some((n) => Number.isNaN(n))) {
  console.error("Usage: npx tsx scripts/backfill-venues.mts <minLat> <minLng> <maxLat> <maxLng>");
  process.exit(1);
}
const [minLat, minLng, maxLat, maxLng] = args;
const BBOX = `${minLat},${minLng},${maxLat},${maxLng}`;

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

async function fetchOverpass(query: string): Promise<OsmEl[]> {
  const body = new URLSearchParams({ data: query }).toString();
  const ROUNDS = 4;
  for (let round = 0; round < ROUNDS; round++) {
    for (const url of UPSTREAMS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        });
        if (!res.ok) {
          console.warn(`  ${url} → ${res.status}, trying next`);
          continue;
        }
        const json = (await res.json()) as { elements?: OsmEl[] };
        return json.elements ?? [];
      } catch (e) {
        console.warn(`  ${url} failed: ${(e as Error).message}, trying next`);
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

async function main() {
  console.log("Fetching Overpass for", BBOX, "…");
  const elements = await fetchOverpass(buildVenueOverpassQuery(BBOX));
  console.log(`  ${elements.length} OSM elements`);

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null || el.type == null || el.id == null) continue;
    rows.push(buildOsmVenueRow(el.type, el.id, lat, lon, el.tags, now));
  }
  console.log(`  ${rows.length} venue rows`);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const CHUNK = 400;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("osm_sports_venues").upsert(rows.slice(i, i + CHUNK), {
      onConflict: "id",
    });
    if (error) {
      console.error("upsert failed:", error.message);
      process.exit(1);
    }
    upserted += Math.min(CHUNK, rows.length - i);
  }
  console.log(`Upserted ${upserted} rows for ${BBOX}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
