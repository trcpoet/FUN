/**
 * Where to load venues for, and when to load them again.
 *
 * VENUES ARE A SEARCH RESULT, NOT A MAP LAYER
 * They load in response to an explicit act — the first load at your own position, a
 * double-tap, a search, or opening a venue from the feed — and they stay put after
 * that. Panning and zooming never fetch.
 *
 * THIS REPLACED A VIEWPORT-FOLLOWING RULE, ON PURPOSE
 * The anchor used to fall back to the map centre so the fetched ring tracked whatever
 * the camera was looking at. That was itself a fix: the Mapbox basemap paints `landuse`
 * class `pitch` polygons for the whole world (see mapTheme.ts), so a pitch is on screen
 * whether or not FUN knows about it, and an anchor left behind by a pan showed a pitch
 * with no icon while nothing errored.
 *
 * Following the camera solved that by fetching everywhere the user drifted, which is the
 * behaviour being removed here: venues appeared in cities the user had merely scrolled
 * past. The trade is accepted deliberately — an un-asked-for fetch is worse than a pitch
 * without an icon — so expect basemap pitches with no marker outside the loaded area, and
 * do not "fix" it by reinstating the map-centre fallback.
 *
 * Kept pure (no mapbox-gl import) so the rules are unit-testable without a map.
 */

import { distanceKmBetween } from "./mapBounds";
import { VENUE_FETCH_CENTER_ABORT_KM } from "./mapConfig";

export type VenueAnchor = { lat: number; lng: number };

/** What the current request needs covered. */
export type VenueFetchNeed = VenueAnchor & {
  /**
   * Radius that has to be covered.
   *
   * Comes from the user's venue-radius filter, NOT from the viewport. A radius derived from
   * the visible width meant a zoom changed what was "needed" and tripped a refetch without
   * the user asking for anything.
   */
  neededRadiusKm: number;
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
 * Fetch this much more than the screen needs, so ordinary panning is served from data we
 * already hold. Without a buffer the fetched ring exactly equals the visible one, and then
 * *any* pan past the hysteresis threshold leaves coverage and costs a request.
 */
export const VENUE_FETCH_BUFFER_FACTOR = 2.5;

/**
 * Pick the point venues load around.
 *
 * Only two things can answer this, and the camera is not one of them. An explicit centre
 * (double-tap, search, a venue opened from the feed) holds until the *next* explicit act —
 * panning away from it does not release it, because a pan is not a request for venues
 * somewhere else. `initialCenter` is the user's own position and only gets a look in before
 * the first explicit act, so opening the app still shows what is nearby.
 *
 * Deliberately takes no map centre. See the module header before adding one back.
 */
export function resolveVenueFetchAnchor(opts: {
  explicitCenter?: VenueAnchor | null;
  initialCenter?: VenueAnchor | null;
}): VenueAnchor | null {
  return opts.explicitCenter ?? opts.initialCenter ?? null;
}

/**
 * Radius one explicit request should cover, clamped to something worth a round-trip.
 *
 * This used to take the visible viewport width. It takes the user's own venue-radius filter
 * now, which is the whole reason zooming no longer refetches — the need is a setting, not a
 * consequence of where the camera happens to be.
 */
export function venueNeedRadiusKm(filterRadiusKm: number): number {
  return Math.max(VENUE_FETCH_MIN_RADIUS_KM, filterRadiusKm);
}

/** How wide a ring to actually request for a given need. */
export function venueRequestRadiusKm(neededRadiusKm: number, maxRadiusKm: number): number {
  const ceiling = Math.max(VENUE_FETCH_MIN_RADIUS_KM, maxRadiusKm);
  return Math.min(ceiling, neededRadiusKm * VENUE_FETCH_BUFFER_FACTOR);
}

/**
 * Should this request actually go out?
 *
 * Only ever consulted for an explicit request now, so it is answering "do we already hold
 * this ground?" rather than "has the camera wandered off?". Refetch when we hold nothing,
 * when the sport filter changed, when the radius filter grew past what we fetched, or when
 * the requested ring is not inside the one we hold.
 */
export function shouldRefetchVenues(
  need: VenueFetchNeed,
  have: VenueFetchCoverage | null
): boolean {
  if (!have) return true;
  if (need.sportSig !== have.sportSig) return true;

  // The radius filter widened past the edge of our data.
  if (need.neededRadiusKm > have.fetchedRadiusKm) return true;

  const drift = distanceKmBetween(need.lat, need.lng, have.lat, have.lng);

  // Asking for ground we already hold — a second double-tap near the first, say.
  if (drift + need.neededRadiusKm <= have.fetchedRadiusKm) return false;

  // Outside — but ignore a nudge past the boundary so we don't thrash on its edge.
  return drift > VENUE_FETCH_CENTER_ABORT_KM;
}
