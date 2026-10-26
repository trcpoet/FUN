import { useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../app/contexts/AuthContext";
import { getMyProfile, updateMyAvatarId, updateMyProfile } from "../lib/api";
import type { AthleteProfilePayload } from "../lib/athleteProfile";
import { emptyAthleteProfile } from "../lib/athleteProfile";
import type { Gender } from "../lib/gamePreferenceOptions";
import { cachedAsync, cacheInvalidate, persistUnder } from "../lib/requestCache";
import { useCachedQuery } from "./useCachedQuery";

type MyProfile = Awaited<ReturnType<typeof getMyProfile>>;

/**
 * Your own profile is read by the map, the feed, Recommended Games, Onboarding and
 * Profile, and each mount used to start from `loading: true` and an empty profile.
 * That was the Profile tab's skeleton on every visit, and the half-second the feed's
 * Similar tab spent on a spinner before it knew whether you had opted in. One cached
 * copy per user now; a mount paints it at once and refreshes behind it.
 */
const MY_PROFILE_TTL_MS = 30_000;

const EMPTY_PROFILE: AthleteProfilePayload = emptyAthleteProfile();

// Your name, avatar and sports, on the first frame of a cold start.
persistUnder("me:profile:");

async function fetchMyProfile(): Promise<MyProfile> {
  const res = await getMyProfile();
  // Thrown so a failure is never cached as "this person has an empty profile".
  if (res.error) throw res.error;
  return res;
}

export function useMyProfile() {
  /**
   * Keyed on the signed-in user, because this used to fetch once per mount and
   * never again: signing in from the profile tab left the map holding the guest's
   * empty profile until the next full page load.
   */
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const key = supabase && userId ? `me:profile:${userId}` : null;
  const query = useCachedQuery<MyProfile>(key, fetchMyProfile, MY_PROFILE_TTL_MS);
  const { mutate } = query;
  const me = query.data;

  /** Resolves once the fresh copy is on screen, so callers can `await` it before reading. */
  const refetch = useCallback(async () => {
    if (!key) return;
    cacheInvalidate(key);
    try {
      const fresh = await cachedAsync(key, MY_PROFILE_TTL_MS, fetchMyProfile);
      mutate(() => fresh);
    } catch {
      // Keep the copy on screen; the next mount tries again.
    }
  }, [key, mutate]);

  const setAvatar = useCallback(
    async (newAvatarId: string | null) => {
      if (!supabase) return;
      const err = await updateMyAvatarId(newAvatarId);
      if (!err) await refetch();
      return err;
    },
    [refetch]
  );

  const updateProfile = useCallback(
    async (updates: {
      display_name?: string | null;
      avatar_url?: string | null;
      avatar_id?: string | null;
      onboarding_completed?: boolean;
      gender?: Gender | null;
      athlete_profile?: AthleteProfilePayload;
      discoverable_for_matching?: boolean;
    }) => {
      const err = await updateMyProfile(updates);
      if (!err) await refetch();
      return err;
    },
    [refetch]
  );

  return {
    avatarId: me?.avatarId ?? null,
    displayName: me?.displayName ?? null,
    avatarUrl: me?.avatarUrl ?? null,
    athleteProfile: me?.athleteProfile ?? EMPTY_PROFILE,
    onboardingCompleted: me?.onboardingCompleted ?? true,
    gender: me?.gender ?? null,
    discoverableForMatching: me?.discoverableForMatching ?? false,
    loading: query.loading,
    error: query.error?.message ?? null,
    refetch,
    setAvatar,
    updateProfile,
  };
}
