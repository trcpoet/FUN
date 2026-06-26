import type { IncomingMessage, ServerResponse } from "node:http";
import { loadEnv, type Plugin } from "vite";
import { buildOsmVenueRow, osmVenueRowToGeoProperties, type OsmVenueTags } from "./server/lib/osmVenueTags";

/** Vite middleware runs outside the client env graph — hydrate server-only .env keys here. */
function applyServerEnv(mode: string, root: string): void {
  const env = loadEnv(mode, root, "");
  for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
    const value = env[key]?.trim();
    if (value) process.env[key] = value;
  }
  if (!process.env.SUPABASE_URL?.trim() && process.env.VITE_SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL.trim();
  }
}
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

async function forwardToApiHandler(
  req: IncomingMessage,
  res: ServerResponse,
  handler: (request: Request) => Promise<Response>,
  body: string
): Promise<void> {
  const url = `http://${req.headers.host ?? "localhost"}${req.url ?? ""}`;
  const request = new Request(url, {
    method: req.method ?? "GET",
    headers: req.headers as HeadersInit,
    body: body || undefined,
  });
  const response = await handler(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(await response.text());
}

type OsmEl = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: OsmVenueTags;
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
      const { mode, root } = server.config;
      applyServerEnv(mode, root);
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const urlPath = req.url?.split("?")[0] ?? "";
          const isApiRoute =
            urlPath === "/api/overpass" ||
            urlPath === "/api/auto-cache-venues" ||
            urlPath === "/api/venue-enrich";
          if (isApiRoute) applyServerEnv(mode, root);

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
                const row = buildOsmVenueRow(el.type, el.id, lat, lon, el.tags, now);
                features.push({
                  type: "Feature",
                  geometry: { type: "Point", coordinates: [lon, lat] },
                  properties: osmVenueRowToGeoProperties(row.id, row.osm_type, row.osm_id, row),
                });
                rows.push(row);
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

          // Same handler as `api/venue-enrich.ts` — Wikidata hero image + description enrichment.
          if (urlPath === "/api/venue-enrich") {
            if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
            if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
            try {
              const body = await readBody(req);
              const { default: handler } = await import("./api/venue-enrich");
              await forwardToApiHandler(req, res, handler, body);
            } catch (err) {
              console.error("[venue-enrich proxy] failed:", err);
              res.setHeader("Content-Type", "application/json");
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: { code: "PROXY_ERROR", message: "Dev proxy failed" } }));
            }
            return;
          }

          next();
        }
      );
    },
  };
}
