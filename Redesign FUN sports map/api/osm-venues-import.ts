/**
 * Secure import: Overpass → upsert into `public.osm_sports_venues` (service role).
 * POST JSON: { minLat, minLng, maxLat, maxLng }
 * Header: Authorization: Bearer <OSM_IMPORT_SECRET>
 *
 * Run on a schedule (e.g. Vercel Cron) or locally via scripts/import-osm-venues.mjs
 */
import { buildOsmVenueRow, type OsmVenueTags } from "../server/lib/osmVenueTags";
import { promiseAny } from "../server/lib/promiseAny";
import { validateBbox, apiResponse } from "../server/lib/apiGuards";

export const config = { runtime: "edge" };

const UPSTREAMS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

function bboxQuery(bboxStr: string): string {
  return `
    [out:json][timeout:60];
    (
      node["leisure"="pitch"](${bboxStr});
      way["leisure"="pitch"](${bboxStr});
      node["leisure"="sports_centre"](${bboxStr});
      way["leisure"="sports_centre"](${bboxStr});
    );
    out center;
  `.replace(/\n\s+/g, " ");
}

async function fetchOverpassJson(body: string): Promise<{ elements?: unknown[] } | null> {
  const controllers = UPSTREAMS.map(() => new AbortController());
  try {
    const text = await promiseAny(
      UPSTREAMS.map((url, i) =>
        fetch(url, {
          method: "POST",
          body,
          headers: { "Content-Type": "text/plain" },
          signal: controllers[i].signal,
        }).then(async (res) => {
          if (res.status === 429 || !res.ok) {
            throw new Error(`upstream ${res.status}`);
          }
          const t = await res.text();
          controllers.forEach((c, j) => {
            if (j !== i) c.abort();
          });
          return t;
        })
      )
    );
    return JSON.parse(text) as { elements?: unknown[] };
  } catch {
    return null;
  }
}

type OsmEl = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: OsmVenueTags;
};

function elementsToRows(elements: unknown[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  for (const raw of elements) {
    const el = raw as OsmEl;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    if (el.type == null || el.id == null) continue;
    rows.push(buildOsmVenueRow(el.type, el.id, lat, lon, el.tags, now));
  }
  return rows;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return apiResponse.error("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  const secret = process.env.OSM_IMPORT_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return apiResponse.error("UNAUTHORIZED", "Unauthorized", 401);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return apiResponse.error("CONFIG", "Server misconfigured", 500);
  }

  let body: {
    minLat?: number;
    minLng?: number;
    maxLat?: number;
    maxLng?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiResponse.error("INVALID_JSON", "Invalid JSON", 400);
  }

  const v = validateBbox(body);
  if (!v.ok) {
    return apiResponse.error("INVALID_BBOX", v.error, 400);
  }
  const { minLat, minLng, maxLat, maxLng } = v.bbox;

  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;
  const json = await fetchOverpassJson(bboxQuery(bboxStr));
  const elements = json?.elements ?? [];
  const rows = elementsToRows(elements);

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey);

  const CHUNK = 400;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("osm_sports_venues").upsert(chunk, { onConflict: "id" });
    if (error) {
      console.error("[osm-venues-import] upsert failed", error.message);
      return apiResponse.error("DB_ERROR", "Upsert failed", 500);
    }
    upserted += chunk.length;
  }

  return new Response(JSON.stringify({ ok: true, upserted, elements: elements.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
