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
  distance_km: number;
  lat: number;
  lng: number;
};

export type ProfileNearbyRow = {
  profile_id: string;
  display_name: string | null;
  avatar_url: string | null;
  lat: number;
  lng: number;
  distance_km: number;
};
