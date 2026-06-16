/**
 * RETIRED. The runtime venue path is /api/auto-cache-venues (Overpass fetch + DB cache).
 * This route used to be an open, unauthenticated Overpass proxy (CORS `*`) — an abuse
 * vector with no remaining client callers — so it now returns 410 Gone. Kept as a
 * tombstone to make the retirement explicit and avoid a silent 404.
 */
import { apiResponse } from "../server/lib/apiGuards";

export const config = { runtime: "edge" };

/** Public, credential-free; `*` avoids reflecting an untrusted Origin on the 410 body. */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default function handler(request: Request): Response {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return apiResponse.error(
    "GONE",
    "This endpoint has been retired. Venue data is served via /api/auto-cache-venues.",
    410,
    { headers: CORS_HEADERS },
  );
}
