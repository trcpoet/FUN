import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { getMyProfile, updateMyAvatarId } from "../lib/api";

export function useMyProfile() {
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { avatarId: id, displayName: name, error: err } = await getMyProfile();
    setAvatarId(id);
    setDisplayName(name);
    setError(err?.message ?? null);
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

  return { avatarId, displayName, loading, error, refetch, setAvatar };
}
