/**
 * Google Places API (New) — match OSM sports venues to nearby places with photos.
 * Server-only; requires GOOGLE_PLACES_API_KEY.
 */

const PLACES_BASE = "https://places.googleapis.com/v1";

export type GooglePlacesEnrichment = {
  googlePlaceId: string;
  googlePhotoName: string;
  photoAttributions: string[];
  label: string | null;
};

type PlacesLocation = { latitude: number; longitude: number };

type PlacePhoto = {
  name?: string;
  authorAttributions?: Array<{ displayName?: string }>;
};

type PlaceResult = {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  location?: PlacesLocation;
  photos?: PlacePhoto[];
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

function enrichmentFromPlace(place: PlaceResult): GooglePlacesEnrichment | null {
  const photo = place.photos?.[0];
  const photoName = photo?.name?.trim();
  const placeId = place.id?.trim();
  if (!photoName || !placeId) return null;
  const attributions =
    photo.authorAttributions
      ?.map((a) => a.displayName?.trim())
      .filter((n): n is string => Boolean(n)) ?? [];
  const label = place.displayName?.text?.trim() ?? place.name?.trim() ?? null;
  return {
    googlePlaceId: placeId,
    googlePhotoName: photoName,
    photoAttributions: attributions,
    label,
  };
}

const FIELD_MASK = "places.id,places.displayName,places.location,places.photos";

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

/** Build a same-origin hero image URL served by /api/venue-photo (no API key in browser). */
export function venuePhotoProxyUrl(venueId: string): string {
  return `/api/venue-photo?venueId=${encodeURIComponent(venueId)}`;
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
