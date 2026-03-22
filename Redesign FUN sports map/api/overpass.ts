/**
 * Server-side Overpass proxy: browsers cannot call overpass-api.de / mirrors (no CORS).
 * Vercel Edge forwards POST body to public Overpass endpoints.
 */
export const config = { runtime: "edge" };

const UPSTREAMS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** Public read proxy; no credentials — `*` is valid and avoids reflecting untrusted `Origin`. */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const body = await request.text();
  const extra = CORS_HEADERS;

  for (const url of UPSTREAMS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body,
        headers: { "Content-Type": "text/plain" },
      });
      if (res.status === 429) continue;
      if (!res.ok) continue;
      const text = await res.text();
      return new Response(text, {
        status: 200,
        headers: {
          ...extra,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      });
    } catch {
      continue;
    }
  }

  return new Response(JSON.stringify({ elements: [] }), {
    status: 200,
    headers: {
      ...extra,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
