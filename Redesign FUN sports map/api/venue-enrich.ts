/**
 * Lazy venue enrichment: Google Places photos (primary) + Wikidata fallback.
 * POST JSON: { id: "way/12345" }
 */
import { rateLimit, apiResponse } from "../server/lib/apiGuards";
import {
  fetchGooglePlaceDetails,
  fetchGooglePlacePhotoBytes,
  fetchGooglePlacesEnrichment,
  venuePhotoProxyUrl,
} from "../server/lib/googlePlaces";
import type { GooglePlaceDetails } from "../server/lib/googlePlaces";
import type { OsmVenueTagBag } from "../server/lib/osmVenueTags";

export const config = { runtime: "edge" };

/**
 * Bump whenever the enrichment shape changes.
 *
 * Rows below this are stale no matter how recent `enriched_at` is, which is
 * what lets a pipeline improvement reach venues that were already visited.
 * Without it, every venue enriched before a change keeps serving its old
 * (often empty) result until the 30-day TTL lapses.
 *
 * v2: multi-photo galleries + Google Place Details + OSM/Wikidata photo sources.
 */
export const ENRICHMENT_VERSION = 2;

const PHOTO_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
/** Google's non-photo content gets a short TTL — see the ToS note on google_details. */
const DETAILS_CACHE_MS = 24 * 60 * 60 * 1000;

/** One entry in the merged gallery persisted to osm_sports_venues.photos. */
export type VenuePhoto = {
  source: "google" | "osm" | "wikimedia" | "wikidata";
  /** Google photo resource name — resolved by /api/venue-photo, never a URL. */
  ref?: string;
  /** Directly loadable URL for every non-Google source. */
  url?: string;
  attribution: string | null;
  attribution_url: string | null;
};

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
  tags: OsmVenueTagBag | null;
  photos: VenuePhoto[] | null;
  google_details: GooglePlaceDetails | null;
  enrichment_version: number | null;
};

const VENUE_SELECT =
  "id, lat, lng, name, sport, leisure, wikidata, hero_image_url, wikidata_label, " +
  "wikidata_description, google_place_id, google_photo_name, photo_attributions, " +
  "enrichment_source, enriched_at, tags, photos, google_details, enrichment_version";

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
  /** Back-compat: photos[0] resolved to a URL. Kept so an older client build keeps working. */
  heroImageUrl: string | null;
  label: string | null;
  description: string | null;
  photoAttributions?: string[];
  /** Where photos[0] came from. Widened in v2 — "osm"/"wikimedia" are now possible. */
  source?: VenuePhoto["source"] | null;
  /** The full gallery, already resolved to loadable URLs. */
  photos?: VenuePhoto[];
  /** Google's non-photo content. Never contains review text. */
  google?: GooglePlaceDetails | null;
  version?: number;
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
  imageUrls: string[];
  label: string | null;
  description: string | null;
}> {
  const res = await fetch(
    `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) {
    return { imageUrls: [], label: null, description: null };
  }

  const json = (await res.json()) as WikidataEntityResponse;
  const entity = json.entities?.[wikidataId];
  if (!entity) {
    return { imageUrls: [], label: null, description: null };
  }

  const label =
    entity.labels?.en?.value?.trim() ??
    Object.values(entity.labels ?? {})[0]?.value?.trim() ??
    null;
  const description =
    entity.descriptions?.en?.value?.trim() ??
    Object.values(entity.descriptions ?? {})[0]?.value?.trim() ??
    null;
  // Every P18 value, not just [0] — a venue with several Commons photos should
  // fill the carousel rather than contribute one image and drop the rest.
  const imageUrls = (entity.claims?.P18 ?? [])
    .map((c) => c.mainsnak?.datavalue?.value?.trim())
    .filter((v): v is string => Boolean(v))
    .map(commonsImageUrl);

  return { imageUrls, label, description };
}

/** Version-aware freshness: a bump invalidates every row regardless of age. */
function isVersionCurrent(row: VenueRow): boolean {
  return (row.enrichment_version ?? 0) >= ENRICHMENT_VERSION;
}

function isPhotoCacheFresh(row: VenueRow): boolean {
  if (!row.enriched_at || !isVersionCurrent(row)) return false;
  const ts = Date.parse(row.enriched_at);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < PHOTO_CACHE_MS;
}

function isDetailsCacheFresh(row: VenueRow): boolean {
  const fetchedAt = row.google_details?.fetchedAt;
  if (!fetchedAt || !isVersionCurrent(row)) return false;
  const ts = Date.parse(fetchedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < DETAILS_CACHE_MS;
}

/** "File:Foo.jpg" / "Category:Bar" → a Commons URL for the file form only. */
function commonsTagUrl(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v || /^category:/i.test(v)) return null;
  return commonsImageUrl(v.replace(/^file:/i, ""));
}

/**
 * Merge every photo source into one priority-ordered gallery.
 *
 * Google first (best coverage for real venues), then the OSM tags, then
 * Wikidata. Google entries keep a resource name and are fetched through
 * /api/venue-photo; everything else is a directly loadable URL.
 */
function buildPhotoList(
  googlePhotos: Array<{ name: string; attribution: string | null; attributionUrl: string | null }>,
  tags: OsmVenueTagBag | null,
  wikidataImageUrls: string[]
): VenuePhoto[] {
  const photos: VenuePhoto[] = [];
  const seen = new Set<string>();

  const push = (photo: VenuePhoto) => {
    const key = photo.ref ?? photo.url ?? "";
    if (!key || seen.has(key)) return;
    seen.add(key);
    photos.push(photo);
  };

  for (const p of googlePhotos) {
    push({
      source: "google",
      ref: p.name,
      attribution: p.attribution,
      attribution_url: p.attributionUrl,
    });
  }

  if (tags?.image) {
    push({
      source: "osm",
      url: tags.image,
      attribution: "OpenStreetMap contributors",
      attribution_url: "https://www.openstreetmap.org/copyright",
    });
  }

  const commons = commonsTagUrl(tags?.wikimedia_commons);
  if (commons) {
    push({
      source: "wikimedia",
      url: commons,
      attribution: "Wikimedia Commons",
      attribution_url: commons,
    });
  }

  for (const url of wikidataImageUrls) {
    push({ source: "wikidata", url, attribution: "Wikimedia Commons", attribution_url: url });
  }

  return photos;
}

/** photos[0] as a loadable URL — Google needs the proxy, others are direct. */
function heroUrlFor(venueId: string, photos: VenuePhoto[]): string | null {
  const first = photos[0];
  if (!first) return null;
  if (first.source === "google") return venuePhotoProxyUrl(venueId, 0, ENRICHMENT_VERSION);
  return first.url ?? null;
}

/**
 * Resolve every Google entry to its proxy URL and drop `ref`.
 *
 * The index is the position in the stored `photos` array, which is what
 * /api/venue-photo?i= looks up — buildPhotoList always emits Google entries
 * first, so those indices stay contiguous from 0.
 */
function resolvePhotoUrls(venueId: string, photos: VenuePhoto[]): VenuePhoto[] {
  return photos.map(({ ref: _ref, ...p }, i) =>
    p.source === "google" ? { ...p, url: venuePhotoProxyUrl(venueId, i, ENRICHMENT_VERSION) } : p
  );
}

function json(payload: VenueEnrichmentResponse): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function parseAttributions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function responseFromRow(row: VenueRow): VenueEnrichmentResponse {
  const photos = resolvePhotoUrls(row.id, row.photos ?? []);
  return {
    heroImageUrl: heroUrlFor(row.id, row.photos ?? []) ?? row.hero_image_url,
    label: row.wikidata_label,
    description: row.wikidata_description,
    photoAttributions: parseAttributions(row.photo_attributions),
    source:
      row.enrichment_source === "google" || row.enrichment_source === "wikidata"
        ? row.enrichment_source
        : null,
    photos,
    google: row.google_details ?? null,
    version: row.enrichment_version ?? 0,
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
    .select(VENUE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("[venue-enrich] read failed", readError.message);
    return apiResponse.error("DB_ERROR", "Lookup failed", 500);
  }

  if (!row) {
    // Venue not cached yet — nothing to enrich against. The importer will pick
    // it up; the client falls back to the sport emoji meanwhile.
    return json({
      heroImageUrl: null,
      label: null,
      description: null,
      photoAttributions: [],
      source: null,
      photos: [],
      google: null,
      version: ENRICHMENT_VERSION,
    });
  }

  const venue = row as unknown as VenueRow;

  const photosFresh = isPhotoCacheFresh(venue);
  const detailsFresh = isDetailsCacheFresh(venue);
  if (photosFresh && detailsFresh) {
    return json(responseFromRow(venue));
  }

  const now = new Date().toISOString();
  const googleKey = process.env.GOOGLE_PLACES_API_KEY?.trim();

  // Photos still good, only Google's 24h content expired: refresh that alone.
  // Skips the search entirely, which is the expensive half.
  if (photosFresh && googleKey && venue.google_place_id) {
    try {
      const details = await fetchGooglePlaceDetails(googleKey, venue.google_place_id);
      if (details) {
        const patched: VenueRow = {
          ...venue,
          google_details: details,
          enrichment_version: ENRICHMENT_VERSION,
        };
        await supabase
          .from("osm_sports_venues")
          .update({ google_details: details, enrichment_version: ENRICHMENT_VERSION })
          .eq("id", id);
        return json(responseFromRow(patched));
      }
    } catch (err) {
      console.error("[venue-enrich] google details refresh failed", err);
    }
  }

  // ---- Full re-enrichment -------------------------------------------------
  let googlePhotos: Array<{ name: string; attribution: string | null; attributionUrl: string | null }> = [];
  let googlePlaceId = venue.google_place_id;
  let googleLabel: string | null = null;
  let googleDetails = venue.google_details;

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
        googlePhotos = google.photos;
        googlePlaceId = google.googlePlaceId;
        googleLabel = google.label;
      }
    } catch (err) {
      console.error("[venue-enrich] google places failed", err);
    }

    if (googlePlaceId && !detailsFresh) {
      try {
        googleDetails = (await fetchGooglePlaceDetails(googleKey, googlePlaceId)) ?? googleDetails;
      } catch (err) {
        console.error("[venue-enrich] google details failed", err);
      }
    }
  }

  let wikidataImageUrls: string[] = [];
  let label = googleLabel ?? venue.wikidata_label;
  let description = venue.wikidata_description;

  const wikidataId = normalizeWikidataId(venue.wikidata);
  if (wikidataId) {
    try {
      const wd = await fetchWikidataEnrichment(wikidataId);
      wikidataImageUrls = wd.imageUrls;
      label = googleLabel ?? wd.label ?? label;
      description = wd.description ?? description;
    } catch (err) {
      console.error("[venue-enrich] wikidata failed", err);
    }
  }

  const photos = buildPhotoList(googlePhotos, venue.tags, wikidataImageUrls);
  const heroImageUrl = heroUrlFor(id, photos);
  const photoAttributions = [
    ...new Set(photos.map((p) => p.attribution).filter((a): a is string => Boolean(a))),
  ];

  const patched: VenueRow = {
    ...venue,
    photos,
    hero_image_url: heroImageUrl,
    google_place_id: googlePlaceId,
    google_details: googleDetails,
    photo_attributions: photoAttributions,
    enrichment_source: photos[0]?.source ?? null,
    wikidata_label: label,
    wikidata_description: description,
    enriched_at: now,
    enrichment_version: ENRICHMENT_VERSION,
  };

  // One write for every outcome — including "found nothing". Stamping the
  // version even on a miss is what stops photo-less venues from re-running the
  // full lookup on every single open after a version bump.
  await supabase
    .from("osm_sports_venues")
    .update({
      photos,
      hero_image_url: heroImageUrl,
      google_place_id: googlePlaceId,
      // Legacy single-photo column, still read by /api/venue-photo as the i=0 fallback.
      google_photo_name: googlePhotos[0]?.name ?? venue.google_photo_name,
      google_details: googleDetails,
      photo_attributions: photoAttributions,
      enrichment_source: photos[0]?.source ?? null,
      wikidata_label: label,
      wikidata_description: description,
      enriched_at: now,
      enrichment_version: ENRICHMENT_VERSION,
    })
    .eq("id", id);

  // Warm the CDN for slide 0 and validate the photo reference in one go.
  if (googleKey && googlePhotos[0]) {
    void fetchGooglePlacePhotoBytes(googleKey, googlePhotos[0].name);
  }

  return json(responseFromRow(patched));
}
