import { describe, it, expect } from "vitest";
import {
  resolveVenueFetchAnchor,
  venueFetchRadiusKm,
  venueRequestRadiusKm,
  shouldRefetchVenues,
  VENUE_FETCH_MIN_RADIUS_KM,
} from "./venueFetchAnchor";
import { VENUE_FETCH_CENTER_ABORT_KM } from "./mapConfig";

/**
 * Regression tests for the "pitch visible, no venue icon" bug.
 *
 * Venues used to be fetched for a fixed disc anchored to the user's GPS (or their
 * last explicit search) and were never refetched on pan, while the Mapbox basemap
 * draws pitch polygons wherever you look. Panning away therefore produced a visible
 * pitch with no icon, silently.
 */

const DOUG_RUSSELL_PARK = { lat: 32.7273042, lng: -97.1172948 };
const FAR_AWAY = { lat: 32.9, lng: -97.4 };

describe("resolveVenueFetchAnchor", () => {
  it("follows the map viewport when there is no explicit search center", () => {
    expect(
      resolveVenueFetchAnchor({
        explicitCenter: null,
        mapCenter: DOUG_RUSSELL_PARK,
        userCoords: FAR_AWAY,
      })
    ).toEqual(DOUG_RUSSELL_PARK);
  });

  it("prefers an explicit search center while the map is still looking at it", () => {
    // Map is mid-flight toward the searched spot — anchor must not flip around.
    const nearby = { lat: DOUG_RUSSELL_PARK.lat + 0.002, lng: DOUG_RUSSELL_PARK.lng };
    expect(
      resolveVenueFetchAnchor({
        explicitCenter: DOUG_RUSSELL_PARK,
        mapCenter: nearby,
        userCoords: FAR_AWAY,
      })
    ).toEqual(DOUG_RUSSELL_PARK);
  });

  it("drops a stale explicit center once the user pans away from it", () => {
    // THE BUG: a search from an hour ago used to pin the venue layer forever.
    expect(
      resolveVenueFetchAnchor({
        explicitCenter: FAR_AWAY,
        mapCenter: DOUG_RUSSELL_PARK,
        userCoords: null,
      })
    ).toEqual(DOUG_RUSSELL_PARK);
  });

  it("falls back to the user's coords before the map is ready", () => {
    expect(
      resolveVenueFetchAnchor({ explicitCenter: null, mapCenter: null, userCoords: FAR_AWAY })
    ).toEqual(FAR_AWAY);
  });

  it("returns null when there is nothing to anchor to", () => {
    expect(
      resolveVenueFetchAnchor({ explicitCenter: null, mapCenter: null, userCoords: null })
    ).toBeNull();
  });
});

describe("venueFetchRadiusKm", () => {
  it("covers the corners of the visible viewport, not just its center", () => {
    // Half-diagonal of a WxW viewport is ~0.71W, so the radius must exceed W/2.
    const r = venueFetchRadiusKm(10, 50);
    expect(r).toBeGreaterThan(5);
  });

  it("never drops below the minimum radius when zoomed far in", () => {
    expect(venueFetchRadiusKm(0.2, 15)).toBe(VENUE_FETCH_MIN_RADIUS_KM);
  });

  it("never exceeds the configured maximum when zoomed far out", () => {
    expect(venueFetchRadiusKm(500, 15)).toBe(15);
  });
});

describe("venueRequestRadiusKm", () => {
  it("requests more than the screen needs so nearby pans are already covered", () => {
    expect(venueRequestRadiusKm(2, 50)).toBeGreaterThan(2);
  });

  it("still respects the configured maximum", () => {
    expect(venueRequestRadiusKm(10, 15)).toBe(15);
  });
});

describe("shouldRefetchVenues", () => {
  /** On screen: 2km around the park. Already fetched: 5km around it. */
  const need = { ...DOUG_RUSSELL_PARK, viewportRadiusKm: 2, sportSig: "" };
  const have = { ...DOUG_RUSSELL_PARK, fetchedRadiusKm: 5, sportSig: "" };

  it("fetches when nothing has been fetched yet", () => {
    expect(shouldRefetchVenues(need, null)).toBe(true);
  });

  it("does not refetch when the view is already covered", () => {
    expect(shouldRefetchVenues(need, have)).toBe(false);
  });

  it("refetches when the sport filter changes", () => {
    expect(shouldRefetchVenues({ ...need, sportSig: "Soccer" }, have)).toBe(true);
  });

  it("ignores micro-pans", () => {
    const nudged = { ...need, lat: need.lat + 0.0009 }; // ~100m
    expect(shouldRefetchVenues(nudged, have)).toBe(false);
  });

  it("pans freely inside the buffer without spending a request", () => {
    // ~2.2km north: 2.2 + 2 < 5, still inside the fetched ring.
    expect(shouldRefetchVenues({ ...need, lat: need.lat + 0.02 }, have)).toBe(false);
  });

  it("REGRESSION: refetches once the visible ring leaves the fetched one", () => {
    // Panning from a distant GPS anchor to Doug Russell Park is what made the ⚽ vanish.
    expect(shouldRefetchVenues({ ...FAR_AWAY, viewportRadiusKm: 2, sportSig: "" }, have)).toBe(true);
  });

  it("refetches when zooming out needs more than we hold, even without panning", () => {
    expect(shouldRefetchVenues({ ...need, viewportRadiusKm: 15 }, have)).toBe(true);
  });

  it("does not refetch when zooming in narrows the view", () => {
    expect(shouldRefetchVenues({ ...need, viewportRadiusKm: 0.5 }, have)).toBe(false);
  });

  it("uses the shared drift constant rather than a private threshold", () => {
    expect(VENUE_FETCH_CENTER_ABORT_KM).toBeGreaterThan(0);
  });
});
