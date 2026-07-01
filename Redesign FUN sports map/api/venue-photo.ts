/**
 * Proxy Google Places photos without exposing the API key to the browser.
 * GET ?venueId=way/12345
 */
import { rateLimit, apiResponse } from "../server/lib/apiGuards";
import { fetchGooglePlacePhotoBytes } from "../server/lib/googlePlaces";

export const config = { runtime: "edge" };

const CACHE_CONTROL = "public, max-age=604800, stale-while-revalidate=86400";

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return apiResponse.error("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  const limited = rateLimit(request, { key: "venue-photo", limit: 60, windowMs: 60_000 });
  if (!limited.ok) {
    return apiResponse.error("RATE_LIMITED", "Too many requests", 429, {
      headers: { "Retry-After": String(limited.retryAfter) },
    });
  }

  const url = new URL(request.url);
  const venueId = url.searchParams.get("venueId")?.trim();
  if (!venueId || !/^(node|way|relation)\/\d+$/.test(venueId)) {
    return apiResponse.error("INVALID_ID", "Invalid venue id", 400);
  }

  const googleKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!googleKey) {
    return apiResponse.error("CONFIG", "GOOGLE_PLACES_API_KEY not configured", 503);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return apiResponse.error("CONFIG", "Supabase service role not configured", 500);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: row, error } = await supabase
    .from("osm_sports_venues")
    .select("google_photo_name")
    .eq("id", venueId)
    .maybeSingle();

  if (error) {
    console.error("[venue-photo] read failed", error.message);
    return apiResponse.error("DB_ERROR", "Lookup failed", 500);
  }

  const photoName = (row as { google_photo_name?: string | null } | null)?.google_photo_name?.trim();
  if (!photoName) {
    return apiResponse.error("NOT_FOUND", "No photo for this venue", 404);
  }

  const photo = await fetchGooglePlacePhotoBytes(googleKey, photoName);
  if (!photo) {
    return apiResponse.error("UPSTREAM", "Photo unavailable", 502);
  }

  return new Response(photo.bytes, {
    status: 200,
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": CACHE_CONTROL,
    },
  });
}
