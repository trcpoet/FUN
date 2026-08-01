import { describe, it, expect } from "vitest";
import { enrichVenueGeoJSON, parkFilteredSportIconId } from "./venueClusterEngine";
import { venueMatchesSelectedSports } from "../../lib/osmSportTags";
import { getGameMapboxIconId } from "../map/gameSportIcons";
import type { SportsVenueGeoJSON, SportsVenueFeature } from "./sportsVenueTypes";

function feat(id: string, lng: number, lat: number, sport: string | undefined, leisure: string): SportsVenueFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: { id, osm_type: "way", osm_id: 1, sport, leisure },
  };
}

// Vandergriff-like: a park with tennis + softball pitches inside it.
const PARK = feat("park1", -97.1107, 32.6975, undefined, "park");
const TENNIS = feat("t1", -97.1105, 32.6993, "tennis", "pitch"); // ~200m from park
const SOFTBALL = feat("s1", -97.1104, 32.6962, "softball", "pitch"); // ~150m from park
const FAR_TENNIS = feat("t2", -97.05, 32.75, "tennis", "pitch"); // far away

const STADIUM = getGameMapboxIconId("recreation");

describe("venueMatchesSelectedSports keeps parks under a filter (fix #2)", () => {
  it("keeps a park even when filtering by a sport it carries no sport tag for", () => {
    expect(venueMatchesSelectedSports(undefined, ["Tennis"], "park")).toBe(true);
  });
  it("shows all parks when no filter is active", () => {
    expect(venueMatchesSelectedSports(undefined, [], "park")).toBe(true);
  });
});

describe("parkFilteredSportIconId", () => {
  it("returns the filtered sport's icon when a matching pitch is within radius", () => {
    expect(parkFilteredSportIconId(-97.1107, 32.6975, [TENNIS, SOFTBALL], new Set(["tennis"]))).toBe(
      getGameMapboxIconId("tennis"),
    );
  });
  it("returns null when the only matching pitch is beyond the radius", () => {
    expect(parkFilteredSportIconId(-97.1107, 32.6975, [FAR_TENNIS], new Set(["tennis"]))).toBeNull();
  });
  it("returns null when no nearby pitch matches the filter", () => {
    expect(parkFilteredSportIconId(-97.1107, 32.6975, [SOFTBALL], new Set(["tennis"]))).toBeNull();
  });
});

describe("enrichVenueGeoJSON — a filtered park shows its contained sport's icon", () => {
  const gj: SportsVenueGeoJSON = { type: "FeatureCollection", features: [PARK, TENNIS, SOFTBALL] };

  it("park shows the stadium icon when no filter is active", () => {
    const out = enrichVenueGeoJSON(gj, []);
    expect(out.features.find((f) => f.properties.id === "park1")?.properties.sport_map_icon).toBe(STADIUM);
  });

  it("park shows the tennis icon when filtering by Tennis (it contains tennis)", () => {
    const out = enrichVenueGeoJSON(gj, ["Tennis"]);
    expect(out.features.find((f) => f.properties.id === "park1")?.properties.sport_map_icon).toBe(
      getGameMapboxIconId("tennis"),
    );
    // All three survive: tennis pitch matches by sport, softball pitch matches by
    // leisure (Tennis osmLeisure=['pitch'] keeps every pitch), park kept by fix #2.
    // The park still resolves to tennis because only the tennis pitch matches the
    // filter *suffix* — the softball pitch doesn't seed the park icon.
    expect(out.features.map((f) => f.properties.id).sort()).toEqual(["park1", "s1", "t1"]);
  });

  it("park keeps the stadium icon when filtering by a sport it does NOT contain", () => {
    const out = enrichVenueGeoJSON(gj, ["Basketball"]);
    expect(out.features.find((f) => f.properties.id === "park1")?.properties.sport_map_icon).toBe(STADIUM);
  });
});
