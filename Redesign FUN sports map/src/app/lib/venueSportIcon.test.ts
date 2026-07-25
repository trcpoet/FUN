import { describe, it, expect } from "vitest";
import {
  primaryVenueSportSuffix,
  venueSportMapIconId,
  venueSportKey,
  mapboxIconIdFromSportKey,
  venueClusterIconImageExpression,
} from "./venueSportIcon";
import { getGameMapboxIconId } from "../map/gameSportIcons";

// Generic fields with no exact sport render the "Recreation Center" stadium (🏟️),
// not the game pickup pin (🎯).
const STADIUM = getGameMapboxIconId("recreation");

describe("venueSportMapIconId — generic fields get the stadium icon", () => {
  it("uses the stadium icon for a sports_centre with no sport (e.g. Maverick Activities Center)", () => {
    expect(venueSportMapIconId(null, "sports_centre")).toBe(STADIUM);
  });

  it("uses the stadium icon for a bare pitch with no sport", () => {
    expect(venueSportMapIconId(null, "pitch")).toBe(STADIUM);
  });

  it("uses the stadium icon for a multi-sport pitch", () => {
    expect(venueSportMapIconId("multi", "pitch")).toBe(STADIUM);
  });

  it("uses the stadium icon for a recreation_ground with no sport", () => {
    expect(venueSportMapIconId(null, "recreation_ground")).toBe(STADIUM);
  });

  it("does NOT use the stadium icon when the sport is exact (soccer pitch keeps the soccer icon)", () => {
    expect(venueSportMapIconId("soccer", "pitch")).toBe(getGameMapboxIconId("soccer"));
    expect(venueSportMapIconId("soccer", "pitch")).not.toBe(STADIUM);
  });

  it("keeps leisure-specific icons (swimming_pool → swimming, not stadium)", () => {
    expect(venueSportMapIconId(null, "swimming_pool")).toBe(getGameMapboxIconId("swimming"));
  });

  it("never falls back to the game pickup icon (fun-game-sport-other) for a venue", () => {
    expect(venueSportMapIconId(null, "sports_centre")).not.toBe(getGameMapboxIconId("other"));
  });

  it("regression: OSM sport=multi is NOT mis-resolved to gym or martial arts", () => {
    const multi = venueSportMapIconId("multi", "pitch");
    expect(multi).not.toBe(getGameMapboxIconId("gym"));
    expect(multi).not.toBe(getGameMapboxIconId("martial_arts"));
  });
});

describe("clustered generic venues also get the stadium icon", () => {
  it("resolves the stadium icon through the cluster sport-key path", () => {
    const key = venueSportKey(null, "sports_centre");
    expect(mapboxIconIdFromSportKey(key)).toBe(STADIUM);
  });

  it("uses the stadium icon as the cluster expression fallback (last element)", () => {
    const expr = venueClusterIconImageExpression();
    expect(expr[expr.length - 1]).toBe(STADIUM);
  });
});

describe("primaryVenueSportSuffix still classifies generics as 'other' internally", () => {
  it("keeps the 'other' grouping key for a bare pitch (so generics still cluster together)", () => {
    expect(primaryVenueSportSuffix(null, "pitch")).toBe("other");
  });
});
