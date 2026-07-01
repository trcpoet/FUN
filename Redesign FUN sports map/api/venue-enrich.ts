/**
 * Lazy venue enrichment: Google Places photos (primary) + Wikidata fallback.
 * POST JSON: { id: "way/12345" }
 */
import { rateLimit, apiResponse } from "../server/lib/apiGuards";
import {
  fetchGooglePlacePhotoBytes,
  fetchGooglePlacesEnrichment,
  venuePhotoProxyUrl,
} from "../server/lib/googlePlaces";

export const config = { runtime: "edge" };

const CACHE_MS = 30 * 24 * 60 * 60 * 1000;

type VenueRow = {
  id: string;
  lat: number;
  lng: number;
  name: string | null;
  sport: string | null;
  leisure: string | null;
  wikidata: string | null;
  hero_image_url: string | null;
  wikidata_label: string | null;
  wikidata_description: string | null;
  google_place_id: string | null;
  google_photo_name: string | null;
  photo_attributions: string[] | null;
  enrichment_source: string | null;
  enriched_at: string | null;
};

type WikidataEntityResponse = {
  entities?: Record<
    string,
    {
      labels?: Record<string, { value?: string }>;
      descriptions?: Record<string, { value?: string }>;
      claims?: {
        P18?: Array<{ mainsnak?: { datavalue?: { value?: string } } }>;
      };
    }
  >;
};

export type VenueEnrichmentResponse = {
  heroImageUrl: string | null;
  label: string | null;
  description: string | null;
  photoAttributions?: string[];
  source?: "google" | "wikidata" | null;
};

function normalizeWikidataId(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (/^Q\d+$/i.test(trimmed)) return trimmed.toUpperCase();
  const match = trimmed.match(/(Q\d+)/i);
  return match ? match[1]!.toUpperCase() : null;
}

function commonsImageUrl(filename: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=800`;
}

async function fetchWikidataEnrichment(wikidataId: string): Promise<{
  heroImageUrl: string | null;
  label: string | null;
  description: string | null;
}> {
  const res = await fetch(
    `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) {
    return { heroImageUrl: null, label: null, description: null };
  }

  const json = (await res.json()) as WikidataEntityResponse;
  const entity = json.entities?.[wikidataId];
  if (!entity) {
    return { heroImageUrl: null, label: null, description: null };
  }

  const label =
    entity.labels?.en?.value?.trim() ??
    Object.values(entity.labels ?? {})[0]?.value?.trim() ??
    null;
  const description =
    entity.descriptions?.en?.value?.trim() ??
    Object.values(entity.descriptions ?? {})[0]?.value?.trim() ??
    null;
  const imageClaim = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value?.trim();
  const heroImageUrl = imageClaim ? commonsImageUrl(imageClaim) : null;

  return { heroImageUrl, label, description };
}

function isCacheFresh(row: VenueRow): boolean {
  if (!row.enriched_at) return false;
  const ts = Date.parse(row.enriched_at);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < CACHE_MS;
}

function parseAttributions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function responseFromRow(row: VenueRow): VenueEnrichmentResponse {
  return {
    heroImageUrl: row.hero_image_url,
    label: row.wikidata_label,
    description: row.wikidata_description,
    photoAttributions: parseAttributions(row.photo_attributions),
    source:
      row.enrichment_source === "google" || row.enrichment_source === "wikidata"
        ? row.enrichment_source
        : null,
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return apiResponse.error("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
  }

  const limited = rateLimit(request, { key: "venue-enrich", limit: 30, windowMs: 60_000 });
  if (!limited.ok) {
    return apiResponse.error("RATE_LIMITED", "Too many requests", 429, {
      headers: { "Retry-After": String(limited.retryAfter) },
    });
  }

  let body: { id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiResponse.error("INVALID_JSON", "Invalid JSON", 400);
  }

  const id = body.id?.trim();
  if (!id || !/^(node|way|relation)\/\d+$/.test(id)) {
    return apiResponse.error("INVALID_ID", "Invalid venue id", 400);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return apiResponse.error(
      "CONFIG",
      "Missing SUPABASE_SERVICE_ROLE_KEY in .env — add it (server-only, not VITE_) and restart npm run dev",
      500
    );
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: row, error: readError } = await supabase
    .from("osm_sports_venues")
    .select(
      "id, lat, lng, name, sport, leisure, wikidata, hero_image_url, wikidata_label, wikidata_description, google_place_id, google_photo_name, photo_attributions, enrichment_source, enriched_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("[venue-enrich] read failed", readError.message);
    return apiResponse.error("DB_ERROR", "Lookup failed", 500);
  }

  if (!row) {
    return new Response(
      JSON.stringify({
        heroImageUrl: null,
        label: null,
        description: null,
        photoAttributions: [],
        source: null,
      } satisfies VenueEnrichmentResponse),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const venue = row as VenueRow;

  if (isCacheFresh(venue) && venue.enriched_at) {
    return new Response(JSON.stringify(responseFromRow(venue)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date().toISOString();
  const googleKey = process.env.GOOGLE_PLACES_API_KEY?.trim();

  if (googleKey) {
    try {
      const google = await fetchGooglePlacesEnrichment(googleKey, {
        lat: venue.lat,
        lng: venue.lng,
        name: venue.name,
        sport: venue.sport,
        leisure: venue.leisure,
      });

      if (google) {
        const heroImageUrl = venuePhotoProxyUrl(id);
        const photoAttributions = google.photoAttributions;

        await supabase
          .from("osm_sports_venues")
          .update({
            hero_image_url: heroImageUrl,
            google_place_id: google.googlePlaceId,
            google_photo_name: google.googlePhotoName,
            photo_attributions: photoAttributions,
            enrichment_source: "google",
            wikidata_label: google.label ?? venue.wikidata_label,
            enriched_at: now,
          })
          .eq("id", id);

        // Warm the photo cache in the background (validates the photo reference).
        void fetchGooglePlacePhotoBytes(googleKey, google.googlePhotoName);

        const payload: VenueEnrichmentResponse = {
          heroImageUrl,
          label: google.label ?? venue.wikidata_label,
          description: venue.wikidata_description,
          photoAttributions,
          source: "google",
        };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("[venue-enrich] google places failed", err);
    }
  }

  const wikidataId = normalizeWikidataId(venue.wikidata);
  if (wikidataId) {
    const enrichment = await fetchWikidataEnrichment(wikidataId);
    await supabase
      .from("osm_sports_venues")
      .update({
        hero_image_url: enrichment.heroImageUrl,
        wikidata_label: enrichment.label,
        wikidata_description: enrichment.description,
        enrichment_source: enrichment.heroImageUrl ? "wikidata" : null,
        enriched_at: now,
      })
      .eq("id", id);

    const payload: VenueEnrichmentResponse = {
      heroImageUrl: enrichment.heroImageUrl,
      label: enrichment.label,
      description: enrichment.description,
      photoAttributions: [],
      source: enrichment.heroImageUrl ? "wikidata" : null,
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  await supabase.from("osm_sports_venues").update({ enriched_at: now }).eq("id", id);

  return new Response(
    JSON.stringify({
      heroImageUrl: null,
      label: null,
      description: null,
      photoAttributions: [],
      source: null,
    } satisfies VenueEnrichmentResponse),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
