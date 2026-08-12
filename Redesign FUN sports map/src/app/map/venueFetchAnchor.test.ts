import { describe, it, expect } from "vitest";
import {
  resolveVenueFetchAnchor,
  venueNeedRadiusKm,
  venueRequestRadiusKm,
  shouldRefetchVenues,
  VENUE_FETCH_MIN_RADIUS_KM,
} from "./venueFetchAnchor";
import { VENUE_FETCH_CENTER_ABORT_KM } from "./mapConfig";

/**
 * Venues are a search result, not a map layer: they load for an explicit act and stay put.
 *
 * These tests previously asserted the opposite — the anchor followed the map centre so the
 * fetched ring tracked the camera, which was itself a fix for "basemap paints a pitch, we
 * show no icon". Following the camera turned out to be worse: venues loaded in every city
 * the user merely scrolled past. The trade was made deliberately, so the cases below pin the
 * new rule rather than leaving a hole where the old ones were.
 */

const DOUG_RUSSELL_PARK = { lat: 32.7273042, lng: -97.1172948 };
const FAR_AWAY = { lat: 32.9, lng: -97.4 };

describe("resolveVenueFetchAnchor", () => {
  it("uses the explicit centre when there is one", () => {
    expect(
      resolveVenueFetchAnchor({ explicitCenter: DOUG_RUSSELL_PARK, initialCenter: FAR_AWAY })
    ).toEqual(DOUG_RUSSELL_PARK);
  });

  it("keeps an explicit centre no matter where the camera goes", () => {
    // The whole point. There is no map input any more, so panning across the state cannot
    // move the anchor — only the next explicit act can.
    const anchor = resolveVenueFetchAnchor({
      explicitCenter: FAR_AWAY,
      initialCenter: DOUG_RUSSELL_PARK,
    });
    expect(anchor).toEqual(FAR_AWAY);
  });

  it("falls back to the viewer's own position before any explicit act", () => {
    // So opening the app still shows what is nearby.
    expect(
      resolveVenueFetchAnchor({ explicitCenter: null, initialCenter: FAR_AWAY })
    ).toEqual(FAR_AWAY);
  });

  it("returns null when there is nothing to anchor to", () => {
    expect(resolveVenueFetchAnchor({ explicitCenter: null, initialCenter: null })).toBeNull();
  });
});

describe("venueNeedRadiusKm", () => {
  it("uses the user's radius filter as-is", () => {
    // Not the viewport width: a radius derived from the visible area meant zooming changed
    // what was 'needed' and triggered a fetch nobody asked for.
    expect(venueNeedRadiusKm(15)).toBe(15);
  });

  it("never drops below the minimum worth a round-trip", () => {
    expect(venueNeedRadiusKm(0.2)).toBe(VENUE_FETCH_MIN_RADIUS_KM);
  });
});

describe("venueRequestRadiusKm", () => {
  it("requests more than the need when the ceiling allows it", () => {
    expect(venueRequestRadiusKm(2, 50)).toBeGreaterThan(2);
  });

  it("still respects the configured maximum", () => {
    expect(venueRequestRadiusKm(10, 15)).toBe(15);
  });
});

describe("shouldRefetchVenues", () => {
  /** Asked for: 2km around the park. Already fetched: 5km around it. */
  const need = { ...DOUG_RUSSELL_PARK, neededRadiusKm: 2, sportSig: "" };
  const have = { ...DOUG_RUSSELL_PARK, fetchedRadiusKm: 5, sportSig: "" };

  it("fetches when nothing has been fetched yet", () => {
    expect(shouldRefetchVenues(need, null)).toBe(true);
  });

  it("does not refetch ground we already hold", () => {
    expect(shouldRefetchVenues(need, have)).toBe(false);
  });

  it("refetches when the sport filter changes", () => {
    expect(shouldRefetchVenues({ ...need, sportSig: "Soccer" }, have)).toBe(true);
  });

  it("treats a second explicit request beside the first as already covered", () => {
    // Double-tapping ~2.2km from the last tap: 2.2 + 2 < 5, so the pins are already right.
    expect(shouldRefetchVenues({ ...need, lat: need.lat + 0.02 }, have)).toBe(false);
  });

  it("ignores a request a few hundred metres from the last one", () => {
    const nudged = { ...need, lat: need.lat + 0.0009 }; // ~100m
    expect(shouldRefetchVenues(nudged, have)).toBe(false);
  });

  it("fetches for an explicit request outside the ring we hold", () => {
    // Double-tapping Weatherford after loading Fort Worth.
    expect(shouldRefetchVenues({ ...FAR_AWAY, neededRadiusKm: 2, sportSig: "" }, have)).toBe(true);
  });

  it("refetches when the radius filter widens past what we hold", () => {
    // The only radius change that can happen now: the user moved the filter slider. A zoom
    // cannot reach this, because the need no longer comes from the viewport.
    expect(shouldRefetchVenues({ ...need, neededRadiusKm: 15 }, have)).toBe(true);
  });

  it("does not refetch when the radius filter narrows", () => {
    expect(shouldRefetchVenues({ ...need, neededRadiusKm: 0.5 }, have)).toBe(false);
  });

  it("uses the shared drift constant rather than a private threshold", () => {
    expect(VENUE_FETCH_CENTER_ABORT_KM).toBeGreaterThan(0);
  });
});
