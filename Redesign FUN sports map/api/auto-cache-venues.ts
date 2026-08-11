/**
 * RETIRED. The runtime venue path is /api/warm-venues.
 *
 * This route tried to satisfy a venue request live: fetch Overpass for the map's whole
 * bbox and return GeoJSON, inside an 18-second hard timeout. At the real default 15 km
 * radius that budget is not close to enough — Los Angeles takes 56.6s (6.4 MB, 19k
 * elements) and London does not answer at all — so on any dense city it aborted and
 * returned 504. It never persisted a single row in production.
 *
 * Its replacement keeps the same idea (first visitor pays, everyone after reads the DB)
 * but off the request path: the client never waits on Overpass, and `/api/warm-venues`
 * imports tile by tile in the background. Kept as a tombstone to make the retirement
 * explicit and avoid a silent 404 for any cached client still calling it.
 */
import { apiResponse } from "../server/lib/apiGuards";

export const config = { runtime: "edge" };

export default function handler(request: Request): Response {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  return apiResponse.error(
    "GONE",
    "This endpoint has been retired. Venue imports are served via /api/warm-venues.",
    410,
  );
}
