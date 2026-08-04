/**
 * Google Places API (New) — match OSM sports venues to nearby places with photos.
 * Server-only; requires GOOGLE_PLACES_API_KEY.
 */

const PLACES_BASE = "https://places.googleapis.com/v1";

/** Max photos captured per place. Google returns up to 10; six fills a carousel. */
export const MAX_GOOGLE_PHOTOS = 6;

/** One Places photo. `name` is a resource name, never a URL — /api/venue-photo resolves it. */
export type GooglePhotoRef = {
  name: string;
  attribution: string | null;
  attributionUrl: string | null;
};

/**
 * Google's non-photo content.
 *
 * Deliberately has no review field: Places terms forbid commingling Google
 * review text with first-party reviews, so we never request it. Only the
 * aggregate rating is kept, and it is displayed as a separately-labelled chip.
 */
export type GooglePlaceDetails = {
  rating: number | null;
  userRatingCount: number | null;
  formattedAddress: string | null;
  phone: string | null;
  /** Human-readable weekday lines, straight from Google. */
  openingHours: string[] | null;
  openNow: boolean | null;
  editorialSummary: string | null;
  wheelchairAccessible: boolean | null;
  freeParking: boolean | null;
  businessStatus: string | null;
  googleMapsUri: string | null;
  /** ISO timestamp — drives the 24h details TTL. */
  fetchedAt: string;
};

export type GooglePlacesEnrichment = {
  googlePlaceId: string;
  photos: GooglePhotoRef[];
  label: string | null;
};

type PlacesLocation = { latitude: number; longitude: number };

type PlacePhoto = {
  name?: string;
  authorAttributions?: Array<{ displayName?: string; uri?: string }>;
};

type PlaceResult = {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  location?: PlacesLocation;
  photos?: PlacePhoto[];
};

type PlaceDetailsResult = PlaceResult & {
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  editorialSummary?: { text?: string };
  accessibilityOptions?: { wheelchairAccessibleEntrance?: boolean };
  parkingOptions?: { freeParkingLot?: boolean; freeStreetParking?: boolean };
  businessStatus?: string;
  googleMapsUri?: string;
};

type SearchResponse = { places?: PlaceResult[] };

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h =
    s1 * s1 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * s2 * s2;
  return R * (2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

function nameOverlapScore(a: string | null, b: string | null): number {
  if (!a?.trim() || !b?.trim()) return 0;
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) overlap += 1;
  }
  return overlap / Math.max(ta.size, tb.size);
}

function nearbyTypesForVenue(sport: string | null, leisure: string | null): string[] {
  const s = (sport ?? "").toLowerCase();
  const l = (leisure ?? "").toLowerCase();
  if (l === "sports_centre" || l === "stadium") return ["sports_complex", "stadium", "gym"];
  if (s.includes("swim") || s.includes("pool")) return ["swimming_pool", "sports_complex"];
  if (s.includes("skate")) return ["park", "sports_complex"];
  if (s.includes("climb")) return ["gym", "sports_complex"];
  return ["sports_complex", "park", "gym", "stadium"];
}

function scoreCandidate(
  venue: { lat: number; lng: number; name: string | null },
  place: PlaceResult
): number | null {
  const loc = place.location;
  if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") {
    return null;
  }
  const dist = haversineMeters(venue.lat, venue.lng, loc.latitude, loc.longitude);
  const displayName = place.displayName?.text?.trim() ?? place.name?.trim() ?? null;
  const nameScore = nameOverlapScore(venue.name, displayName);
  if (dist > 120 && nameScore < 0.35) return null;
  if (dist > 250) return null;
  // Lower distance is better; name overlap is a tie-breaker (0–30 m equivalent).
  return dist - nameScore * 30;
}

async function placesPost(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
  fieldMask: string
): Promise<SearchResponse | null> {
  const res = await fetch(`${PLACES_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn("[googlePlaces] request failed", path, res.status);
    return null;
  }
  return (await res.json()) as SearchResponse;
}

function pickBestPlace(
  venue: { lat: number; lng: number; name: string | null },
  places: PlaceResult[] | undefined
): PlaceResult | null {
  if (!places?.length) return null;
  let best: PlaceResult | null = null;
  let bestScore = Infinity;
  for (const place of places) {
    if (!place.photos?.length) continue;
    const score = scoreCandidate(venue, place);
    if (score == null || score >= bestScore) continue;
    bestScore = score;
    best = place;
  }
  return best;
}

function photoRef(photo: PlacePhoto): GooglePhotoRef | null {
  const name = photo.name?.trim();
  if (!name) return null;
  const author = photo.authorAttributions?.[0];
  return {
    name,
    attribution: author?.displayName?.trim() || null,
    attributionUrl: author?.uri?.trim() || null,
  };
}

function enrichmentFromPlace(place: PlaceResult): GooglePlacesEnrichment | null {
  const placeId = place.id?.trim();
  if (!placeId) return null;
  // Keep the whole strip, not just photos[0] — that single-photo read is why
  // the venue modal could never show a carousel.
  const photos = (place.photos ?? [])
    .slice(0, MAX_GOOGLE_PHOTOS)
    .map(photoRef)
    .filter((p): p is GooglePhotoRef => p !== null);
  if (photos.length === 0) return null;
  const label = place.displayName?.text?.trim() ?? place.name?.trim() ?? null;
  return { googlePlaceId: placeId, photos, label };
}

// Search stays on this narrow mask on purpose. Adding rating/hours here would
// promote every searchText/searchNearby call to a pricier SKU across up to 8
// results; the richer fields come from ONE Place Details call on the winner.
const FIELD_MASK = "places.id,places.displayName,places.location,places.photos";

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "internationalPhoneNumber",
  "rating",
  "userRatingCount",
  "regularOpeningHours",
  "editorialSummary",
  "accessibilityOptions",
  "parkingOptions",
  "businessStatus",
  "googleMapsUri",
].join(",");

export async function fetchGooglePlacesEnrichment(
  apiKey: string,
  venue: {
    lat: number;
    lng: number;
    name: string | null;
    sport: string | null;
    leisure: string | null;
  }
): Promise<GooglePlacesEnrichment | null> {
  const center = { latitude: venue.lat, longitude: venue.lng };
  const venueName = venue.name?.trim() ?? null;

  let places: PlaceResult[] | undefined;

  if (venueName) {
    const textRes = await placesPost(
      apiKey,
      "/places:searchText",
      {
        textQuery: venueName,
        maxResultCount: 8,
        locationBias: { circle: { center, radius: 150 } },
      },
      FIELD_MASK
    );
    places = textRes?.places;
  }

  if (!places?.some((p) => p.photos?.length)) {
    const types = nearbyTypesForVenue(venue.sport, venue.leisure);
    const nearbyRes = await placesPost(
      apiKey,
      "/places:searchNearby",
      {
        includedTypes: types.slice(0, 5),
        maxResultCount: 8,
        locationRestriction: { circle: { center, radius: 100 } },
      },
      FIELD_MASK
    );
    places = nearbyRes?.places ?? places;
  }

  const best = pickBestPlace(venue, places);
  if (!best) return null;
  return enrichmentFromPlace(best);
}

/**
 * One Place Details lookup for the place the search already picked.
 *
 * Kept separate from the search so the richer fields cost a single call
 * instead of being billed across every search result.
 */
export async function fetchGooglePlaceDetails(
  apiKey: string,
  placeId: string
): Promise<GooglePlaceDetails | null> {
  const res = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
    method: "GET",
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_FIELD_MASK },
  });
  if (!res.ok) {
    console.warn("[googlePlaces] details failed", placeId, res.status);
    return null;
  }
  const place = (await res.json()) as PlaceDetailsResult;
  const parking = place.parkingOptions;
  return {
    rating: typeof place.rating === "number" ? place.rating : null,
    userRatingCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    formattedAddress: place.formattedAddress?.trim() || null,
    phone: place.internationalPhoneNumber?.trim() || null,
    openingHours: place.regularOpeningHours?.weekdayDescriptions?.length
      ? place.regularOpeningHours.weekdayDescriptions
      : null,
    openNow:
      typeof place.regularOpeningHours?.openNow === "boolean"
        ? place.regularOpeningHours.openNow
        : null,
    editorialSummary: place.editorialSummary?.text?.trim() || null,
    wheelchairAccessible:
      typeof place.accessibilityOptions?.wheelchairAccessibleEntrance === "boolean"
        ? place.accessibilityOptions.wheelchairAccessibleEntrance
        : null,
    freeParking:
      parking && (parking.freeParkingLot || parking.freeStreetParking) ? true : null,
    businessStatus: place.businessStatus?.trim() || null,
    googleMapsUri: place.googleMapsUri?.trim() || null,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Same-origin photo URL served by /api/venue-photo, so the API key never
 * reaches the browser.
 *
 * `i` selects the slide; `v` is the enrichment version, present only to bust
 * the CDN entry when the pipeline changes (nothing reads it server-side).
 */
export function venuePhotoProxyUrl(venueId: string, index = 0, version = 0): string {
  const q = `venueId=${encodeURIComponent(venueId)}&i=${index}`;
  return version > 0 ? `/api/venue-photo?${q}&v=${version}` : `/api/venue-photo?${q}`;
}

export async function fetchGooglePlacePhotoBytes(
  apiKey: string,
  photoName: string
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const url = `${PLACES_BASE}/${photoName}/media?maxWidthPx=800&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const bytes = await res.arrayBuffer();
  return { bytes, contentType };
}
