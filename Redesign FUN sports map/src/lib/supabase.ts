import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "[FUN] Missing Supabase config. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase project (Settings → API). Map and create-game will not work until then."
  );
}

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export type GameRow = {
  id: string;
  title: string;
  sport: string;
  spots_needed: number;
  starts_at: string | null;
  created_by: string | null;
  created_at: string;
  status?: "open" | "full" | "completed" | "cancelled";
  distance_km: number;
  lat: number;
  lng: number;
};

export type ProfileNearbyRow = {
  profile_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_id?: string | null;
  lat: number;
  lng: number;
  distance_km: number;
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
