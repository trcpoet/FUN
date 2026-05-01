import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
/** Same order as `api/overpass.ts` — Vite's http-proxy often 504s on slow upstreams. */
const UPSTREAMS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

type OsmEl = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: { name?: string; sport?: string; leisure?: string };
};

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

async function fetchOverpassText(body: string): Promise<string> {
  const controllers = UPSTREAMS.map(() => new AbortController());
  const hardTimeoutMs = 18_000;
  const hardTimeout = setTimeout(() => {
    controllers.forEach((c) => c.abort());
  }, hardTimeoutMs);

  try {
    return await Promise.any(
      UPSTREAMS.map((url, i) =>
        fetch(url, {
          method: "POST",
          body,
          headers: {
            "Content-Type": "text/plain",
            "User-Agent": "FUN-Sports-App/1.0 (local dev)",
          },
          signal: controllers[i].signal,
        }).then(async (r) => {
          if (r.status === 429 || !r.ok) throw new Error(`upstream ${r.status}`);
          const t = await r.text();
          controllers.forEach((c, j) => { if (j !== i) c.abort(); });
          return t;
        })
      )
    );
  } finally {
    clearTimeout(hardTimeout);
  }
}

export function overpassDevProxy(): Plugin {
  return {
    name: "overpass-dev-proxy",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const urlPath = req.url?.split("?")[0] ?? "";

          // Legacy direct Overpass proxy (kept for any other callers)
          if (urlPath === "/api/overpass") {
            if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
            if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
            const body = await readBody(req);
            let text = JSON.stringify({ elements: [] });
            try { text = await fetchOverpassText(body); } catch { /* fall through */ }
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.statusCode = 200;
            res.end(text);
            return;
          }

          // Auto-cache endpoint: fetch Overpass, return GeoJSON (no DB save in dev)
          if (urlPath === "/api/auto-cache-venues") {
            if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
            if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
            const raw = await readBody(req);
            let bbox: { minLat?: number; minLng?: number; maxLat?: number; maxLng?: number } = {};
            try { bbox = JSON.parse(raw); } catch { /* ignore */ }
            const { minLat, minLng, maxLat, maxLng } = bbox;
            const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;
            let features: unknown[] = [];
            let rows: Record<string, unknown>[] = [];
            try {
              const text = await fetchOverpassText(bboxQuery(bboxStr));
              const json = JSON.parse(text) as { elements?: unknown[] };
              const now = new Date().toISOString();
              for (const raw of json.elements ?? []) {
                const el = raw as OsmEl;
                const lat = el.lat ?? el.center?.lat;
                const lon = el.lon ?? el.center?.lon;
                if (lat == null || lon == null || el.type == null || el.id == null) continue;
                const id = `${el.type}/${el.id}`;
                features.push({
                  type: "Feature",
                  geometry: { type: "Point", coordinates: [lon, lat] },
                  properties: {
                    id,
                    name: el.tags?.name,
                    sport: el.tags?.sport,
                    leisure: el.tags?.leisure,
                    osm_type: el.type,
                    osm_id: el.id,
                  },
                });
                rows.push({ id, lat, lng: lon, name: el.tags?.name ?? null, sport: el.tags?.sport ?? null, leisure: el.tags?.leisure ?? null, osm_type: el.type, osm_id: el.id, imported_at: now });
              }
            } catch (err) {
              console.error("[Overpass proxy] failed:", err);
            }
            // Save to DB in background so subsequent fetches are instant
            const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (supabaseUrl && serviceKey && rows.length > 0) {
              const { createClient } = await import("@supabase/supabase-js");
              const supabase = createClient(supabaseUrl, serviceKey);
              const CHUNK = 400;
              for (let i = 0; i < rows.length; i += CHUNK) {
                supabase.from("osm_sports_venues").upsert(rows.slice(i, i + CHUNK), { onConflict: "id" }).then(() => {});
              }
            }

            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.statusCode = 200;
            res.end(JSON.stringify({ type: "FeatureCollection", features }));
            return;
          }

          next();
        }
      );
    },
  };
}
