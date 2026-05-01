import { supabase } from "./supabase";
import { cachedAsync } from "./requestCache";

export type StatusRow = {
  /** Row id (UUID) for comments/likes/deletes. */
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  expires_at: string;
};

export async function upsertMyStatus(body: string): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase.rpc("upsert_my_status", { p_body: body });
  return error ? new Error(error.message) : null;
}

export async function getRecentStatuses(limit = 40): Promise<{ data: StatusRow[]; error: Error | null }> {
  return cachedAsync(`status:recent:${limit}`, 10_000, async () => {
    if (!supabase) return { data: [], error: new Error("Supabase not configured") };
    const { data, error } = await supabase.rpc("get_recent_statuses", { p_limit: limit });
    const rows = (data as StatusRow[]) ?? [];
    return { data: rows, error: error ? new Error(error.message) : null };
  });
}

export async function getLatestStatus(userId: string): Promise<{ data: StatusRow | null; error: Error | null }> {
  return cachedAsync(`status:latest:${userId}`, 10_000, async () => {
    if (!supabase) return { data: null, error: new Error("Supabase not configured") };
    const { data, error } = await supabase.rpc("get_latest_status", { p_user: userId });
    const rows = (data as Omit<StatusRow, "user_id">[]) ?? [];
    const row = rows[0];
    return row
      ? { data: { user_id: userId, ...row }, error: error ? new Error(error.message) : null }
      : { data: null, error: error ? new Error(error.message) : null };
  });
}

