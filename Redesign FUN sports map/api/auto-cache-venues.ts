/**
 * Auto-cache venues: fetch from Overpass, save to osm_sports_venues, return GeoJSON.
 * No auth required — OSM venue data is public.
 * POST JSON: { minLat, minLng, maxLat, maxLng }
 *
 * First user in any area pays the Overpass cost (~2-5s).
 * Every subsequent user in that area gets an instant DB read.
 */
import { buildOsmVenueRow, osmVenueRowToGeoProperties, type OsmVenueTags } from "./lib/osmVenueTags";

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
    const text = await Promise.any(
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

  let body: { minLat?: number; minLng?: number; maxLat?: number; maxLng?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { minLat, minLng, maxLat, maxLng } = body;
  if (
    typeof minLat !== "number" ||
    typeof minLng !== "number" ||
    typeof maxLat !== "number" ||
    typeof maxLng !== "number" ||
    minLat >= maxLat ||
    minLng >= maxLng
  ) {
    return new Response(JSON.stringify({ error: "Invalid bbox" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;
  const json = await fetchOverpassJson(bboxQuery(bboxStr));
  const elements = json?.elements ?? [];
  const { features, rows } = elementsToFeatures(elements);

  // Save to DB in the background — don't block the response
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey && rows.length > 0) {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, serviceKey);
    const CHUNK = 400;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await supabase.from("osm_sports_venues").upsert(chunk, { onConflict: "id" });
    }
  }

  return new Response(
    JSON.stringify({ type: "FeatureCollection", features }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
