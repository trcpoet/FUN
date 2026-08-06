import { describe, it, expect } from "vitest";
import { findVenueCoverageGaps, VENUE_COVERAGE_MATCH_RADIUS_M } from "./venueCoverageInvariant";

/**
 * The invariant that makes "pitch on screen, no icon" impossible to ship unnoticed.
 *
 * The Mapbox basemap paints its own `landuse` pitch polygons everywhere, independent of
 * `osm_sports_venues`. When the two disagree the user sees a pitch with no marker and
 * nothing anywhere reports it — which is exactly how the original bug survived.
 */

const DOUG_RUSSELL_PITCH = { lat: 32.7273042, lng: -97.1172948 };

describe("findVenueCoverageGaps", () => {
  it("reports a gap when the basemap shows a pitch we rendered nothing for", () => {
    const gaps = findVenueCoverageGaps([DOUG_RUSSELL_PITCH], []);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual(DOUG_RUSSELL_PITCH);
  });

  it("reports no gap when a venue marker sits on the pitch", () => {
    expect(findVenueCoverageGaps([DOUG_RUSSELL_PITCH], [DOUG_RUSSELL_PITCH])).toHaveLength(0);
  });

  it("tolerates the offset between a polygon centroid and our point row", () => {
    // ~30m away — the same pitch, labelled from a slightly different centroid.
    const nearby = { lat: DOUG_RUSSELL_PITCH.lat + 0.00027, lng: DOUG_RUSSELL_PITCH.lng };
    expect(findVenueCoverageGaps([DOUG_RUSSELL_PITCH], [nearby])).toHaveLength(0);
  });

  it("still reports a gap when the nearest venue is well beyond the match radius", () => {
    const farAway = { lat: DOUG_RUSSELL_PITCH.lat + 0.01, lng: DOUG_RUSSELL_PITCH.lng }; // ~1.1km
    expect(findVenueCoverageGaps([DOUG_RUSSELL_PITCH], [farAway])).toHaveLength(1);
  });

  it("reports nothing when the basemap shows no pitches", () => {
    expect(findVenueCoverageGaps([], [])).toHaveLength(0);
  });

  it("reports each uncovered pitch independently", () => {
    const second = { lat: 32.7320183, lng: -97.1186601 };
    const gaps = findVenueCoverageGaps([DOUG_RUSSELL_PITCH, second], [second]);
    expect(gaps).toEqual([DOUG_RUSSELL_PITCH]);
  });

  it("uses a match radius big enough for real centroid drift", () => {
    expect(VENUE_COVERAGE_MATCH_RADIUS_M).toBeGreaterThanOrEqual(50);
  });
});
