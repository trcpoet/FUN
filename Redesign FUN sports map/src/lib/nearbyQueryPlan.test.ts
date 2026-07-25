import { describe, it, expect } from "vitest";
import { planNearbyQueries } from "./nearbyQueryPlan";

describe("planNearbyQueries", () => {
  it("fetches games but NOT profiles for a guest (privacy)", () => {
    expect(
      planNearbyQueries({ hasGamesCoords: true, hasProfilesCoords: true, includeProfiles: false }),
    ).toEqual({ fetchGames: true, fetchProfiles: false });
  });

  it("fetches both for a signed-in user with coords", () => {
    expect(
      planNearbyQueries({ hasGamesCoords: true, hasProfilesCoords: true, includeProfiles: true }),
    ).toEqual({ fetchGames: true, fetchProfiles: true });
  });

  it("never fetches profiles without profile coords, even when signed in", () => {
    expect(
      planNearbyQueries({ hasGamesCoords: true, hasProfilesCoords: false, includeProfiles: true }),
    ).toEqual({ fetchGames: true, fetchProfiles: false });
  });

  it("fetches nothing when there are no coords", () => {
    expect(
      planNearbyQueries({ hasGamesCoords: false, hasProfilesCoords: false, includeProfiles: true }),
    ).toEqual({ fetchGames: false, fetchProfiles: false });
  });

  it("holds the privacy rule even when a guest somehow has profile coords", () => {
    expect(
      planNearbyQueries({ hasGamesCoords: true, hasProfilesCoords: true, includeProfiles: false }).fetchProfiles,
    ).toBe(false);
  });

  it("still shows games to a guest who only has games coords", () => {
    expect(
      planNearbyQueries({ hasGamesCoords: true, hasProfilesCoords: false, includeProfiles: false }),
    ).toEqual({ fetchGames: true, fetchProfiles: false });
  });
});
