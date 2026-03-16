import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { getMyProfile, updateMyAvatarId, updateMyProfile } from "../lib/api";

export function useMyProfile() {
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const res = await getMyProfile();
    setAvatarId(res.avatarId);
    setDisplayName(res.displayName);
    setAvatarUrl(res.avatarUrl ?? null);
    setOnboardingCompleted(res.onboardingCompleted);
    setError(res.error?.message ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    refetch();
  }, [refetch]);

  const setAvatar = useCallback(async (newAvatarId: string | null) => {
    if (!supabase) return;
    const err = await updateMyAvatarId(newAvatarId);
    if (!err) setAvatarId(newAvatarId);
    return err;
  }, []);

  const updateProfile = useCallback(
    async (updates: { display_name?: string | null; avatar_url?: string | null; avatar_id?: string | null; onboarding_completed?: boolean }) => {
      const err = await updateMyProfile(updates);
      if (!err) await refetch();
      return err;
    },
    [refetch]
  );

  return {
    avatarId,
    displayName,
    avatarUrl,
    onboardingCompleted,
    loading,
    error,
    refetch,
    setAvatar,
    updateProfile,
  };
}
