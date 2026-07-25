export type NearbyQueryPlan = { fetchGames: boolean; fetchProfiles: boolean };

/**
 * Decides which nearby RPCs to run on the map.
 *
 * Games are visible to everyone (guests included) — that's the Phase 4 guest
 * browsing behaviour. Player profiles/locations are signed-in only for privacy,
 * so `get_profiles_nearby` runs only when `includeProfiles` (a live session) is
 * true, regardless of whether profile coords happen to be present.
 */
export function planNearbyQueries(input: {
  hasGamesCoords: boolean;
  hasProfilesCoords: boolean;
  includeProfiles: boolean;
}): NearbyQueryPlan {
  return {
    fetchGames: input.hasGamesCoords,
    fetchProfiles: input.hasProfilesCoords && input.includeProfiles,
  };
}
