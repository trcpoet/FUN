/**
 * Mapbox Directions proxy — walking/cycling/driving ETA and route geometry.
 * POST JSON: { from: { lat, lng }, to: { lat, lng }, profile?: "walking" | "cycling" | "driving" }
 */
import { rateLimit, apiResponse } from "../server/lib/apiGuards";
import {
  fetchMapboxDirections,
  resolveMapboxToken,
  type DirectionsProfile,
} from "../server/lib/mapboxDirections";

export const config = { runtime: "edge" };

function isCoord(v: unknown): v is { lat: number; lng: number } {
  if (!v || typeof v !== "object") return false;
  const { lat, lng } = v as { lat?: unknown; lng?: unknown };
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

const PROFILES: DirectionsProfile[] = ["walking", "cycling", "driving"];

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return apiResponse.error("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  const limited = rateLimit(request, { key: "directions", limit: 40, windowMs: 60_000 });
  if (!limited.ok) {
    return apiResponse.error("RATE_LIMITED", "Too many requests", 429, {
      headers: { "Retry-After": String(limited.retryAfter) },
    });
  }

  let body: {
    from?: unknown;
    to?: unknown;
    profile?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiResponse.error("INVALID_JSON", "Invalid JSON", 400);
  }

  if (!isCoord(body.from) || !isCoord(body.to)) {
    return apiResponse.error("INVALID_COORDS", "from and to { lat, lng } required", 400);
  }

  const profile = PROFILES.includes(body.profile as DirectionsProfile)
    ? (body.profile as DirectionsProfile)
    : "walking";

  const token = resolveMapboxToken();
  if (!token) {
    return apiResponse.error(
      "CONFIG",
      "Missing MAPBOX_ACCESS_TOKEN or VITE_MAPBOX_ACCESS_TOKEN",
      500
    );
  }

  const result = await fetchMapboxDirections({
    from: body.from,
    to: body.to,
    profile,
    accessToken: token,
  });

  if (!result) {
    return apiResponse.error("NO_ROUTE", "Could not compute route", 404);
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
