/**
 * Central API layer for Supabase: games, profiles, stats, notifications, complete-game.
 * Use these from components/hooks instead of calling supabase directly for consistency.
 */

import { supabase } from "./supabase";
import type {
  GameRow,
  ProfileNearbyRow,
  UserStatsRow,
  BadgeRow,
  UserBadgeRow,
  NotificationRow,
} from "./supabase";

const DEFAULT_RADIUS_KM = 15;
const DEFAULT_PROFILES_LIMIT = 50;

// —— Auth (email/password, OWASP-aligned) ——

const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(password: string): { ok: boolean; message?: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, message: "Password must include letters and numbers" };
  }
  return { ok: true };
}

export async function signUp(email: string, password: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error("Supabase not configured") };
  const validation = validatePassword(password);
  if (!validation.ok) return { error: new Error(validation.message) };
  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error: error ? new Error(error.message) : null };
}

export async function signIn(email: string, password: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  return { error: error ? new Error(error.message) : null };
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}

export async function resetPassword(email: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/login`,
  });
  return { error: error ? new Error(error.message) : null };
}

export async function uploadAvatarImage(file: File): Promise<{ url: string | null; error: Error | null }> {
  if (!supabase) return { url: null, error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { url: null, error: new Error("Not signed in") };

  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (uploadError) return { url: null, error: new Error(uploadError.message) };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: data.publicUrl ?? null, error: null };
}

// —— Games ——

export async function getGamesNearby(
  lat: number,
  lng: number,
  radiusKm: number = DEFAULT_RADIUS_KM
): Promise<{ data: GameRow[] | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_games_nearby", {
    lat,
    lng,
    radius_km: radiusKm,
  });
  return { data: (data as GameRow[]) ?? null, error: error ? new Error(error.message) : null };
}

export async function createGame(params: {
  title: string;
  sport: string;
  lat: number;
  lng: number;
  spotsNeeded?: number;
  /** ISO date-time string for when the game starts (optional). */
  startsAt?: string | null;
}): Promise<{ gameId: string | null; error: Error | null }> {
  if (!supabase) return { gameId: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("create_game", {
    p_title: params.title.trim() || "Pickup game",
    p_sport: params.sport,
    p_lat: params.lat,
    p_lng: params.lng,
    p_spots_needed: params.spotsNeeded ?? 2,
    p_starts_at: params.startsAt ?? null,
  });
  return { gameId: data as string | null, error: error ? new Error(error.message) : null };
}

export async function joinGame(gameId: string): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Error("Not signed in");
  const { error } = await supabase.from("game_participants").insert({
    game_id: gameId,
    user_id: user.id,
    role: "player",
  });
  return error ? new Error(error.message) : null;
}

export async function completeGame(params: {
  gameId: string;
  winnerTeamOrUser?: string | null;
  score?: Record<string, unknown> | null;
}): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase.rpc("complete_game", {
    p_game_id: params.gameId,
    p_winner_team_or_user: params.winnerTeamOrUser ?? null,
    p_score: params.score ?? null,
  });
  return error ? new Error(error.message) : null;
}

// —— Profiles (incl. 3D avatar) ——

export async function getProfilesNearby(
  lat: number,
  lng: number,
  radiusKm: number = 5,
  limit: number = DEFAULT_PROFILES_LIMIT
): Promise<{ data: ProfileNearbyRow[] | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_profiles_nearby", {
    lat,
    lng,
    radius_km: radiusKm,
    limit_count: limit,
  });
  return { data: (data as ProfileNearbyRow[]) ?? null, error: error ? new Error(error.message) : null };
}

export async function updateMyAvatarId(avatarId: string | null): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Error("Not signed in");
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_id: avatarId, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  return error ? new Error(error.message) : null;
}

export async function getMyProfile(): Promise<{
  avatarId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  onboardingCompleted: boolean;
  error: Error | null;
}> {
  if (!supabase) {
    return {
      avatarId: null,
      displayName: null,
      avatarUrl: null,
      onboardingCompleted: false,
      error: new Error("Supabase not configured"),
    };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      avatarId: null,
      displayName: null,
      avatarUrl: null,
      onboardingCompleted: false,
      error: new Error("Not signed in"),
    };
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_id, display_name, avatar_url, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    const fallback = await supabase
      .from("profiles")
      .select("avatar_id, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    const fb = fallback.data as { avatar_id?: string; display_name?: string; avatar_url?: string } | null;
    return {
      avatarId: fb?.avatar_id ?? null,
      displayName: fb?.display_name ?? null,
      avatarUrl: fb?.avatar_url ?? null,
      onboardingCompleted: true,
      error: null,
    };
  }
  const row = data as {
    avatar_id?: string;
    display_name?: string;
    avatar_url?: string;
    onboarding_completed?: boolean;
  } | null;
  return {
    avatarId: row?.avatar_id ?? null,
    displayName: row?.display_name ?? null,
    avatarUrl: row?.avatar_url ?? null,
    onboardingCompleted: row?.onboarding_completed ?? true,
    error: null,
  };
}

export async function updateMyProfile(updates: {
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_id?: string | null;
  onboarding_completed?: boolean;
}): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Error("Not signed in");
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.display_name !== undefined) set.display_name = updates.display_name;
  if (updates.avatar_url !== undefined) set.avatar_url = updates.avatar_url;
  if (updates.avatar_id !== undefined) set.avatar_id = updates.avatar_id;
  if (updates.onboarding_completed !== undefined) set.onboarding_completed = updates.onboarding_completed;
  const { error } = await supabase.from("profiles").update(set).eq("id", user.id);
  return error ? new Error(error.message) : null;
}

// —— User stats & badges ——

export async function getMyStats(): Promise<{ data: UserStatsRow | null; error: Error | null }> {
  if (!supabase) return { data: null, error: null };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: null };
  const { data, error } = await supabase
    .from("user_stats")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return { data: null, error: null };
  return { data: data as UserStatsRow | null, error: null };
}

export async function getMyBadges(): Promise<{ data: UserBadgeRow[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: new Error("Not signed in") };
  const { data, error } = await supabase
    .from("user_badges")
    .select("*, badges(*)")
    .eq("user_id", user.id)
    .order("awarded_at", { ascending: false });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data as UserBadgeRow[]) ?? [], error: null };
}

// —— Notifications ——

export async function getMyNotifications(limit = 20): Promise<{
  data: NotificationRow[];
  error: Error | null;
}> {
  if (!supabase) return { data: [], error: null };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: null };
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { data: [], error: null };
  return { data: (data as NotificationRow[]) ?? [], error: null };
}

export async function markNotificationRead(notificationId: string): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
  return error ? new Error(error.message) : null;
}

/** Subscribe to new notifications for the current user (Realtime). Call returned fn to unsubscribe. */
export function subscribeToNotifications(
  onNotification: (row: NotificationRow) => void
): (() => void) | null {
  if (!supabase) return null;
  const state: { channel: ReturnType<typeof supabase.channel> | null } = { channel: null };
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    state.channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          onNotification(payload.new as NotificationRow);
        }
      )
      .subscribe();
  });
  return () => {
    if (state.channel) supabase.removeChannel(state.channel);
  };
}

// —— Helpers for 3D avatar URL ——

/** Build Ready Player Me GLB URL from avatar_id (from profiles). */
export function avatarIdToGlbUrl(avatarId: string | null, quality: "low" | "medium" | "high" = "low"): string | null {
  if (!avatarId?.trim()) return null;
  return `https://models.readyplayer.me/${avatarId.trim()}.glb?quality=${quality}`;
}
