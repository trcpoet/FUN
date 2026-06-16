/**
 * Auto-cache venues: fetch from Overpass, save to osm_sports_venues, return GeoJSON.
 * No auth required — OSM venue data is public.
 * POST JSON: { minLat, minLng, maxLat, maxLng }
 *
 * First user in any area pays the Overpass cost (~2-5s).
 * Every subsequent user in that area gets an instant DB read.
 */
import { buildOsmVenueRow, osmVenueRowToGeoProperties, type OsmVenueTags } from "../server/lib/osmVenueTags";
import { promiseAny } from "../server/lib/promiseAny";
import { validateBbox, rateLimit } from "../server/lib/apiGuards";

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
  const hardTimeoutMs = 18_000;
  const hardTimeout = setTimeout(() => {
    controllers.forEach((c) => c.abort());
  }, hardTimeoutMs);
  try {
    const text = await promiseAny(
      UPSTREAMS.map((url, i) =>
        fetch(url, {
          method: "POST",
          body,
          headers: { "Content-Type": "text/plain" },
          signal: controllers[i].signal,
        }).then(async (res) => {
          if (res.status === 429 || !res.ok) throw new Error(`upstream ${res.status}`);
          const t = await res.text();
          controllers.forEach((c, j) => { if (j !== i) c.abort(); });
          return t;
        })
      )
    );
    return JSON.parse(text) as { elements?: unknown[] };
  } catch {
    return null;
  } finally {
    clearTimeout(hardTimeout);
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

type GeoFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: ReturnType<typeof osmVenueRowToGeoProperties>;
};

function elementsToFeatures(elements: unknown[]): { features: GeoFeature[]; rows: Record<string, unknown>[] } {
  const features: GeoFeature[] = [];
  const rows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const raw of elements) {
    const el = raw as OsmEl;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    if (el.type == null || el.id == null) continue;
    const row = buildOsmVenueRow(el.type, el.id, lat, lon, el.tags, now);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: osmVenueRowToGeoProperties(row.id, row.osm_type, row.osm_id, row),
    });
    rows.push(row);
  }
  return { features, rows };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Public read, but cap per-IP burst so one client can't hammer the Overpass upstream.
  const limited = rateLimit(request, { key: "auto-cache", limit: 30, windowMs: 60_000 });
  if (!limited.ok) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(limited.retryAfter) },
    });
  }

  let body: { minLat?: number; minLng?: number; maxLat?: number; maxLng?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const v = validateBbox(body);
  if (!v.ok) {
    return new Response(JSON.stringify({ error: v.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { minLat, minLng, maxLat, maxLng } = v.bbox;

  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;
  const json = await fetchOverpassJson(bboxQuery(bboxStr));
  if (!json) {
    return new Response(
      JSON.stringify({ success: false, error: "Overpass upstream unavailable", type: "FeatureCollection", features: [] }),
      { status: 504, headers: { "Content-Type": "application/json" } }
    );
  }
  const elements = json.elements ?? [];
  const { features, rows } = elementsToFeatures(elements);

  // Persist to DB without blocking the GeoJSON response.
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey && rows.length > 0) {
    void (async () => {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, serviceKey);
        const CHUNK = 400;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          const { error } = await supabase.from("osm_sports_venues").upsert(chunk, { onConflict: "id" });
          if (error) console.error("[auto-cache-venues] upsert failed", error.message);
        }
      } catch (err) {
        console.error("[auto-cache-venues] background upsert error", err);
      }
    })();
  }

  return new Response(
    JSON.stringify({ type: "FeatureCollection", features }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
