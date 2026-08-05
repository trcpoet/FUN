/**
 * Where to load venues for, and when to load them again.
 *
 * WHY THIS EXISTS
 * The Mapbox basemap paints `landuse` class `pitch` polygons for the whole world
 * (see mapTheme.ts) — a pitch is on screen whether or not FUN knows about it. Venue
 * icons, by contrast, only exist where we actually fetched `osm_sports_venues`.
 *
 * Venue fetching used to be anchored to the user's GPS (or their last explicit
 * search) and never re-ran on pan, so panning anywhere else produced a visible
 * pitch with no icon — and nothing errored, because the fetch had succeeded. These
 * helpers keep the fetched ring tied to what the user is actually looking at.
 *
 * Kept pure (no mapbox-gl import) so the rules are unit-testable without a map.
 */

import { distanceKmBetween } from "./mapBounds";
import { VENUE_FETCH_CENTER_ABORT_KM } from "./mapConfig";

export type VenueAnchor = { lat: number; lng: number };

/** What the current view needs covered. */
export type VenueViewportNeed = VenueAnchor & {
  /** Radius that actually has to be on screen right now. */
  viewportRadiusKm: number;
  /** Serialized sport filter — a different filter means different rows, so it must refetch. */
  sportSig: string;
};

/** A ring we have already fetched: where it was centred, how wide, and under which filter. */
export type VenueFetchCoverage = VenueAnchor & {
  /** Radius we actually requested — larger than the viewport, so pans are free for a while. */
  fetchedRadiusKm: number;
  sportSig: string;
};

/** Smallest ring worth requesting; below this a zoomed-in user would refetch constantly. */
export const VENUE_FETCH_MIN_RADIUS_KM = 2;

/**
 * Viewport width → the radius that must be on screen. The half-diagonal of a W-wide
 * square viewport is ~0.71W, so anything at or below W/2 leaves the corners uncovered.
 */
export const VENUE_FETCH_VIEWPORT_RADIUS_FACTOR = 0.75;

/**
 * Fetch this much more than the screen needs, so ordinary panning is served from data we
 * already hold. Without a buffer the fetched ring exactly equals the visible one, and then
 * *any* pan past the hysteresis threshold leaves coverage and costs a request.
 */
export const VENUE_FETCH_BUFFER_FACTOR = 2.5;

/**
 * Pick the point venues load around.
 *
 * An explicit centre (search result, tapped venue/game/note) wins only while the map
 * is still looking at it — otherwise a search from ten minutes ago keeps the venue
 * layer pinned to a place the user has long since left. Once they pan away, the
 * viewport takes over.
 */
export function resolveVenueFetchAnchor(opts: {
  explicitCenter?: VenueAnchor | null;
  mapCenter?: VenueAnchor | null;
  userCoords?: VenueAnchor | null;
}): VenueAnchor | null {
  const { explicitCenter, mapCenter, userCoords } = opts;

  if (explicitCenter) {
    // No map yet (first paint): the explicit centre is all we have.
    if (!mapCenter) return explicitCenter;
    const drift = distanceKmBetween(
      explicitCenter.lat,
      explicitCenter.lng,
      mapCenter.lat,
      mapCenter.lng
    );
    // Still within the drift window — the map is likely mid-flight toward it.
    if (drift <= VENUE_FETCH_CENTER_ABORT_KM) return explicitCenter;
  }

  return mapCenter ?? userCoords ?? null;
}

/** Radius the current viewport needs on screen, clamped to something worth a round-trip. */
export function venueFetchRadiusKm(visibleWidthKm: number, maxRadiusKm: number): number {
  const ceiling = Math.max(VENUE_FETCH_MIN_RADIUS_KM, maxRadiusKm);
  const wanted = visibleWidthKm * VENUE_FETCH_VIEWPORT_RADIUS_FACTOR;
  return Math.min(ceiling, Math.max(VENUE_FETCH_MIN_RADIUS_KM, wanted));
}

/** How wide a ring to actually request for a given on-screen need. */
export function venueRequestRadiusKm(viewportRadiusKm: number, maxRadiusKm: number): number {
  const ceiling = Math.max(VENUE_FETCH_MIN_RADIUS_KM, maxRadiusKm);
  return Math.min(ceiling, viewportRadiusKm * VENUE_FETCH_BUFFER_FACTOR);
}

/**
 * Should we fetch venues again?
 *
 * Refetch when we hold nothing, when the filter changed, when zooming out needs more
 * than we fetched, or once the visible ring pokes outside the fetched one. Note the
 * asymmetry: the *viewport* radius is tested against the *fetched* radius, so panning
 * inside the buffer is free.
 */
export function shouldRefetchVenues(
  need: VenueViewportNeed,
  have: VenueFetchCoverage | null
): boolean {
  if (!have) return true;
  if (need.sportSig !== have.sportSig) return true;

  // Zoomed out past the edge of our data — needed wherever the centre is.
  if (need.viewportRadiusKm > have.fetchedRadiusKm) return true;

  const drift = distanceKmBetween(need.lat, need.lng, have.lat, have.lng);

  // The visible ring is still entirely inside what we fetched.
  if (drift + need.viewportRadiusKm <= have.fetchedRadiusKm) return false;

  // Outside — but ignore a nudge past the boundary so we don't thrash on its edge.
  return drift > VENUE_FETCH_CENTER_ABORT_KM;
}
