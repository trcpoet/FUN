/**
 * Proxy Google Places photos without exposing the API key to the browser.
 * GET ?venueId=way/12345
 */
import { rateLimit, apiResponse } from "../server/lib/apiGuards";
import { fetchGooglePlacePhotoBytes } from "../server/lib/googlePlaces";

export const config = { runtime: "edge" };

/**
 * `s-maxage` is the important half: it parks the bytes in Vercel's SHARED edge
 * cache for 30 days instead of each browser holding its own copy, so a six-slide
 * carousel costs six billed Photo API calls once globally rather than per user.
 * 30 days also matches Google's photo caching allowance and the photo TTL in
 * api/venue-enrich.ts.
 */
const CACHE_CONTROL =
  "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800";

/** Mirrors MAX_GOOGLE_PHOTOS — anything beyond it cannot exist. */
const MAX_INDEX = 5;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return apiResponse.error("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  // 180/min, not 60: one carousel is up to 6 requests, so a handful of users
  // behind a single NAT would trip the old limit on legitimate browsing.
  const limited = rateLimit(request, { key: "venue-photo", limit: 180, windowMs: 60_000 });
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

  // Carousel slide index. `v` is also accepted but never read — it exists only
  // so an enrichment version bump produces a new URL and misses the CDN.
  const rawIndex = url.searchParams.get("i");
  const index = rawIndex === null ? 0 : Number.parseInt(rawIndex, 10);
  if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) {
    return apiResponse.error("INVALID_INDEX", "Invalid photo index", 400);
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
    .select("google_photo_name, photos")
    .eq("id", venueId)
    .maybeSingle();

  if (error) {
    console.error("[venue-photo] read failed", error.message);
    return apiResponse.error("DB_ERROR", "Lookup failed", 500);
  }

  const venue = row as {
    google_photo_name?: string | null;
    photos?: Array<{ source?: string; ref?: string }> | null;
  } | null;

  // Only Google entries route through this proxy; every other source is a
  // directly loadable URL the client already has.
  const entry = venue?.photos?.[index];
  let photoName = entry?.source === "google" ? entry.ref?.trim() : undefined;

  // Rows enriched before v2 have no `photos` array — fall back to the legacy
  // single-photo column for slide 0 so they keep working until re-enrichment.
  if (!photoName && index === 0) {
    photoName = venue?.google_photo_name?.trim();
  }

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
