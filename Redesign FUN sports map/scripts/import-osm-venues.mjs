#!/usr/bin/env node
/**
 * Upsert OSM sports venues into Supabase via the secure import API.
 *
 * Usage:
 *   OSM_IMPORT_SECRET=your-secret \
 *   IMPORT_URL=https://your-app.vercel.app/api/osm-venues-import \
 *   node scripts/import-osm-venues.mjs <minLat> <minLng> <maxLat> <maxLng>
 *
 * Example (NYC-ish bbox):
 *   node scripts/import-osm-venues.mjs 40.7 -74.05 40.78 -73.92
 *
 * Requires: migration `20260321000001_osm_sports_venues.sql` applied in Supabase.
 * Vercel env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OSM_IMPORT_SECRET
 */

const secret = process.env.OSM_IMPORT_SECRET;
const importUrl = process.env.IMPORT_URL || "http://localhost:5173/api/osm-venues-import";

const argv = process.argv.slice(2).map(Number);
if (argv.length !== 4 || argv.some((n) => Number.isNaN(n))) {
  console.error(
    "Usage: OSM_IMPORT_SECRET=... IMPORT_URL=... node scripts/import-osm-venues.mjs <minLat> <minLng> <maxLat> <maxLng>"
  );
  process.exit(1);
}

if (!secret) {
  console.error("Set OSM_IMPORT_SECRET (same value as Vercel env).");
  process.exit(1);
}

const [minLat, minLng, maxLat, maxLng] = argv;

const res = await fetch(importUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
  },
  body: JSON.stringify({ minLat, minLng, maxLat, maxLng }),
});

const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
