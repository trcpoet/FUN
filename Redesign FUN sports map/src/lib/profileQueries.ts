import { getMyFollowState, getPublicProfileById, type FollowState } from "./api";
import type { AthleteProfilePayload } from "./athleteProfile";
import { cachedAsync } from "./requestCache";

/** Younger than this, a player's cached profile opens without asking again. */
export const PUBLIC_PROFILE_TTL_MS = 60_000;

export type PublicProfileData = {
  displayName: string | null;
  avatarUrl: string | null;
  athleteProfile: AthleteProfilePayload;
  /**
   * Fetched with the profile, not after it: a private profile's content depends on
   * it, and fetched second it showed a follower the "Private Profile" lock until it
   * arrived.
   */
  followState: FollowState;
};

/** Another player's profile as you see it. Cleared on sign-out, since `followState` is yours. */
export const publicProfileQuery = (userId: string) => ({
  key: `profile:public:${userId}`,
  fetch: async (): Promise<PublicProfileData> => {
    const [res, followState] = await Promise.all([getPublicProfileById(userId), getMyFollowState(userId)]);
    if (res.error) throw res.error;
    return {
      displayName: res.displayName,
      avatarUrl: res.avatarUrl,
      athleteProfile: res.athleteProfile,
      followState,
    };
  },
});

/**
 * Start loading a player's profile as a finger lands on their row (or a pointer
 * hovers it), so their page has it on its first frame instead of a skeleton.
 */
export function prefetchPublicProfile(userId: string | null | undefined): void {
  if (!userId) return;
  const q = publicProfileQuery(userId);
  void cachedAsync(q.key, PUBLIC_PROFILE_TTL_MS, q.fetch).catch(() => undefined);
}
