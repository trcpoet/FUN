/**
 * Secure import: Overpass → upsert into `public.osm_sports_venues` (service role).
 * POST JSON: { minLat, minLng, maxLat, maxLng }
 * Header: Authorization: Bearer <OSM_IMPORT_SECRET>
 *
 * Run on a schedule (e.g. Vercel Cron) or locally via scripts/import-osm-venues.mjs
 */
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
    const text = await Promise.any(
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
  tags?: { name?: string; sport?: string; leisure?: string };
};

function elementsToRows(elements: unknown[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const raw of elements) {
    const el = raw as OsmEl;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    if (el.type == null || el.id == null) continue;
    const id = `${el.type}/${el.id}`;
    rows.push({
      id,
      lat,
      lng: lon,
      name: el.tags?.name ?? null,
      sport: el.tags?.sport ?? null,
      leisure: el.tags?.leisure ?? null,
      osm_type: el.type,
      osm_id: el.id,
      imported_at: new Date().toISOString(),
    });
  }
  return rows;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secret = process.env.OSM_IMPORT_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
  const rows = elementsToRows(elements);

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, serviceKey);

  const CHUNK = 400;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("osm_sports_venues").upsert(chunk, { onConflict: "id" });
    if (error) {
      return new Response(JSON.stringify({ error: error.message, upserted }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    upserted += chunk.length;
  }

  return new Response(JSON.stringify({ ok: true, upserted, elements: elements.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
