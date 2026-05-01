import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

if (!url || !anonKey) {
  console.warn(
    "[FUN] Missing Supabase config. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project (Settings → API). Map and create-game will not work until then."
  );
}

/** Trailing spaces / newlines in .env break JWT validation → REST 401. */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export type GameVisibility = "public" | "friends_only" | "invite_only";

export type GameRow = {
  id: string;
  title: string;
  sport: string;
  spots_needed: number;
  /** Real headcount — host + confirmed players. Excludes substitutes. */
  participant_count?: number;
  /** People on the waitlist (role = 'substitute'). */
  substitute_count?: number;
  /** `spots_needed - participant_count`, floored at 0. */
  spots_remaining?: number;
  starts_at: string | null;
  created_by: string | null;
  created_at: string;
  status?: "open" | "full" | "live" | "completed" | "cancelled";
  live_started_at?: string | null;
  ended_at?: string | null;
  /** Host-set duration window (minutes). Defaults to 90 server-side. */
  duration_minutes?: number | null;
  /** Scheduled end time = `starts_at + duration_minutes`. Null when no start time. */
  ends_at?: string | null;
  /** 'public' | 'friends_only' | 'invite_only'. Drives chat membership rules. */
  visibility?: GameVisibility | null;
  /** UUID for invite-only sharable links (`/g/<token>`). */
  invite_token?: string | null;
  location_label?: string | null;
  description?: string | null;
  /** Host preferences from create-game (skill, age, etc.). */
  requirements?: Record<string, unknown> | null;
  distance_km: number;
  lat: number;
  lng: number;
};

export type GameMessageRow = {
  id: string;
  game_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type GameInboxRow = {
  id: string;
  title: string;
  sport: string;
  starts_at: string | null;
  /** Scheduled end of the game window (`starts_at + duration_minutes`). */
  ends_at?: string | null;
  duration_minutes?: number | null;
  visibility?: GameVisibility | null;
  invite_token?: string | null;
  /** Game host id — needed to render host-only controls in the chat header. */
  created_by?: string | null;
  status?: "open" | "full" | "live" | "completed" | "cancelled";
  location_label: string | null;
  last_message_body: string | null;
  last_message_at: string | null;
  participant_count: number;
  spots_remaining: number;
  /** Convenience: lat/lng so "Plan rematch" can prefill without an extra round-trip. */
  lat?: number | null;
  lng?: number | null;
};

export type DmInboxRow = {
  thread_id: string;
  other_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  last_message_body: string | null;
  last_message_at: string | null;
};

export type DmMessageRow = {
  id: string;
  thread_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type MapNoteVisibility = "public" | "friends" | "private";

export type MapNoteRow = {
  id: string;
  created_at: string;
  created_by: string;
  lat: number;
  lng: number;
  body: string;
  visibility: MapNoteVisibility;
  place_name: string | null;
  /** Returned by nearby RPCs only. */
  distance_km?: number | null;
  /** Returned by nearby/unified feed RPCs only. */
  comment_count?: number | null;
};

export type MapNoteCommentRow = {
  id: string;
  created_at: string;
  note_id: string;
  user_id: string;
  body: string;
};

export type ProfileNearbyRow = {
  profile_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_id?: string | null;
  /** Optional: reputation rating out of 5 if the RPC provides it. */
  sportsmanship?: number | null;
  /** Optional 24h status if the RPC provides it. */
  status_body?: string | null;
  status_expires_at?: string | null;
  lat: number;
  lng: number;
  distance_km: number;
};

/** Public-safe row from `search_profiles` RPC (no lat/lng). */
export type ProfileSearchRow = {
  profile_id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
  city: string | null;
  favorite_sport: string | null;
  distance_km: number | null;
  rank_score: number | null;
};

export type UserStatsRow = {
  user_id: string;
  games_played_total: number;
  games_played_by_sport: Record<string, number>;
  current_streak_days: number;
  longest_streak_days: number;
  xp: number;
  level: number;
  last_game_date: string | null;
  updated_at: string;
};

export type BadgeRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  criteria: Record<string, unknown> | null;
};

export type UserBadgeRow = {
  id: string;
  user_id: string;
  badge_id: string;
  awarded_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};

export type GameParticipantRow = {
  id: string;
  game_id: string;
  user_id: string;
  role: "host" | "player";
  joined_at: string;
  confirmed_result: boolean;
};
