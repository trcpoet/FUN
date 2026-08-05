import { describe, it, expect } from "vitest";
import { venueMatchesSelectedSports } from "./osmSportTags";

/**
 * `venueMatchesSelectedSports` is the ONE predicate deciding whether a venue survives
 * a sport filter — used by both the Supabase read and the render/cluster path. They
 * used to be two separate implementations with different rules, so a venue could pass
 * one and fail the other.
 *
 * The cases below use real production tag shapes: essentially every row in
 * `osm_sports_venues` carries `leisure=pitch`, including all four soccer pitches
 * around UTA. Any rule keyed on `leisure` alone therefore matches everything.
 */

describe("venueMatchesSelectedSports", () => {
  it("keeps everything when no filter is active", () => {
    expect(venueMatchesSelectedSports("tennis", [], "pitch")).toBe(true);
    expect(venueMatchesSelectedSports(null, [], null)).toBe(true);
  });

  it("keeps a venue whose sport matches the filter", () => {
    expect(venueMatchesSelectedSports("soccer", ["Soccer"], "pitch")).toBe(true);
  });

  it("matches any of a multi-sport venue's tokens", () => {
    expect(venueMatchesSelectedSports("soccer;american_football", ["Soccer"], "pitch")).toBe(true);
    expect(venueMatchesSelectedSports("american_football;soccer", ["Soccer"], "pitch")).toBe(true);
  });

  it("accepts the catalog's alternate OSM tokens for a sport", () => {
    expect(venueMatchesSelectedSports("association_football", ["Soccer"], "pitch")).toBe(true);
  });

  it("normalizes separators and whitespace the way OSM data actually arrives", () => {
    expect(venueMatchesSelectedSports("soccer, tennis", ["Tennis"], "pitch")).toBe(true);
    expect(venueMatchesSelectedSports(" Soccer ", ["Soccer"], "pitch")).toBe(true);
  });

  it("REGRESSION: a declared sport is not smuggled past a non-matching filter by its leisure tag", () => {
    // Both Tennis and Soccer list osmLeisure: ["pitch"], so a leisure-based fallback
    // made every pitch match every sport — the filter was silently a no-op.
    expect(venueMatchesSelectedSports("tennis", ["Soccer"], "pitch")).toBe(false);
    expect(venueMatchesSelectedSports("basketball", ["Tennis"], "pitch")).toBe(false);
    expect(venueMatchesSelectedSports("soccer", ["Basketball"], "pitch")).toBe(false);
  });

  it("keeps generic venues that declare no sport, so real places are never hidden", () => {
    // We cannot tell what these are; hiding them loses genuine venues.
    for (const leisure of ["pitch", "sports_centre", "recreation_ground", "park"]) {
      expect(venueMatchesSelectedSports(null, ["Soccer"], leisure)).toBe(true);
      expect(venueMatchesSelectedSports("", ["Soccer"], leisure)).toBe(true);
    }
  });

  it("uses a specific leisure type to identify a sport when there is no sport tag", () => {
    expect(venueMatchesSelectedSports(null, ["Swimming"], "swimming_pool")).toBe(true);
    expect(venueMatchesSelectedSports(null, ["Soccer"], "swimming_pool")).toBe(false);
  });

  it("drops a venue with neither a matching sport nor a usable leisure", () => {
    expect(venueMatchesSelectedSports("chess", ["Soccer"], "")).toBe(false);
  });
});
