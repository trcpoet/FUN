import { supabase } from "./supabase";
import type { DmInboxRow, DmMessageRow } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

function rpcMissing(error: { message?: string; code?: string } | null, fnName: string): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("schema cache") || m.includes("could not find the function") || m.includes(fnName.toLowerCase());
}

function isDmMessagesSchemaCacheMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const m = (error.message ?? "").toLowerCase();
  return m.includes("schema cache") && (m.includes("dm_messages") || m.includes("public.dm_messages"));
}

/**
 * Server-side check: can the current user open a DM with `otherUserId`?
 *
 * Returns `true` when:
 *   - The two users follow each other (or one direction), OR
 *   - They have at least one shared `game_participants` row.
 *
 * Until the migration that defines `can_dm` is applied, this returns `true`
 * (open by default) so existing flows keep working.
 */
export async function canDm(otherUserId: string): Promise<{
  allowed: boolean;
  error: Error | null;
}> {
  if (!supabase) return { allowed: false, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("can_dm", { p_other_user_id: otherUserId });
  if (error) {
    if (rpcMissing(error, "can_dm")) return { allowed: true, error: null };
    return { allowed: false, error: new Error(error.message) };
  }
  return { allowed: Boolean(data), error: null };
}

export async function getOrCreateDmThread(otherUserId: string): Promise<{
  threadId: string | null;
  error: Error | null;
}> {
  if (!supabase) return { threadId: null, error: new Error("Supabase not configured") };
  try {
    // Stranger DMs are blocked: enforce the same rule the server-side trigger
    // would, but with a friendlier client-side message before the round-trip.
    const guard = await canDm(otherUserId);
    if (guard.error) return { threadId: null, error: guard.error };
    if (!guard.allowed) {
      return {
        threadId: null,
        error: new Error(
          "You can DM after you've played a game together or follow each other. Tap Follow on their profile or join a shared game first."
        ),
      };
    }

    const { data, error } = await supabase.rpc("get_or_create_dm_thread", { p_other: otherUserId });
    if (!error) return { threadId: (data as string | null) ?? null, error: null };
    if (rpcMissing(error, "get_or_create_dm_thread")) {
      return {
        threadId: null,
        error: new Error(
          "Direct messages are not deployed yet. Run supabase/migrations/20260325000000_direct_messages.sql in Supabase SQL Editor, then reload PostgREST (NOTIFY pgrst, 'reload schema')."
        ),
      };
    }
    return { threadId: null, error: new Error(error.message) };
  } catch (e) {
    return { threadId: null, error: new Error((e as Error).message || "Failed to create DM thread") };
  }
}

export async function fetchMyDmInbox(): Promise<{ data: DmInboxRow[] | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  try {
    const { data, error } = await supabase.rpc("get_my_dm_inbox");
    if (!error) return { data: (data as DmInboxRow[]) ?? [], error: null };
    if (rpcMissing(error, "get_my_dm_inbox")) {
      return {
        data: [],
        error: new Error(
          "Direct messages are not deployed yet. Run supabase/migrations/20260325000000_direct_messages.sql in Supabase SQL Editor, then reload PostgREST (NOTIFY pgrst, 'reload schema')."
        ),
      };
    }
    return { data: null, error: new Error(error.message) };
  } catch (e) {
    return { data: null, error: new Error((e as Error).message || "Failed to load DM inbox") };
  }
}

export async function fetchDmMessages(threadId: string): Promise<{ data: DmMessageRow[] | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from("dm_messages")
    .select("id, thread_id, user_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error && isDmMessagesSchemaCacheMissing(error)) {
    return { data: [], error: null };
  }
  return { data: (data as DmMessageRow[]) ?? null, error: error ? new Error(error.message) : null };
}

export async function sendDmMessage(threadId: string, body: string): Promise<{ data: DmMessageRow | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const trimmed = body.trim();
  if (!trimmed) return { data: null, error: new Error("Message is empty") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error("Not signed in") };

  const { data, error } = await supabase
    .from("dm_messages")
    .insert({ thread_id: threadId, user_id: user.id, body: trimmed.slice(0, 2000) })
    .select("id, thread_id, user_id, body, created_at")
    .single();

  return { data: (data as DmMessageRow) ?? null, error: error ? new Error(error.message) : null };
}

export function subscribeDmMessages(args: {
  threadId: string;
  onInsert: (m: DmMessageRow) => void;
}): { channel: RealtimeChannel | null; unsubscribe: () => void } {
  if (!supabase) return { channel: null, unsubscribe: () => {} };
  const client = supabase;
  const channel = client
    .channel(`dm_messages:${args.threadId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${args.threadId}` },
      (payload) => {
        const row = payload.new as unknown as DmMessageRow;
        args.onInsert(row);
      },
    )
    .subscribe();

  return { channel, unsubscribe: () => void client.removeChannel(channel) };
}

