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

  /** Race mirrors: return first 200; cancel slower requests to save upstream load. */
  const postFirstOk = async (): Promise<string | null> => {
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
      return text;
    } catch {
      return null;
    }
  };

  const text = await postFirstOk();
  if (text != null) {
    return new Response(text, {
      status: 200,
      headers: {
        ...extra,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  }

  return new Response(JSON.stringify({ elements: [] }), {
    status: 200,
    headers: {
      ...extra,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
