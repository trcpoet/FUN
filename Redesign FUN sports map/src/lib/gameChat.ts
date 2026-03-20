import { supabase } from "./supabase";
import type { GameInboxRow, GameMessageRow } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export async function fetchMyGameInbox(): Promise<{
  data: GameInboxRow[] | null;
  error: Error | null;
}> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_my_game_inbox");
  return { data: (data as GameInboxRow[]) ?? null, error: error ? new Error(error.message) : null };
}

export async function fetchGameMessages(gameId: string): Promise<{
  data: GameMessageRow[] | null;
  error: Error | null;
}> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from("game_messages")
    .select("id, game_id, user_id, body, created_at")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true })
    .limit(200);
  return { data: (data as GameMessageRow[]) ?? null, error: error ? new Error(error.message) : null };
}

export async function sendGameMessage(gameId: string, body: string): Promise<{
  data: GameMessageRow | null;
  error: Error | null;
}> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const trimmed = body.trim();
  if (!trimmed) return { data: null, error: new Error("Message is empty") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error("Not signed in") };
  const { data, error } = await supabase
    .from("game_messages")
    .insert({
      game_id: gameId,
      user_id: user.id,
      body: trimmed.slice(0, 2000),
    })
    .select("id, game_id, user_id, body, created_at")
    .single();
  return {
    data: (data as GameMessageRow) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

/** Subscribe to new rows for one game. Returns cleanup to unsubscribe. */
export function subscribeGameMessages(
  gameId: string,
  onInsert: (row: GameMessageRow) => void
): () => void {
  if (!supabase) return () => {};

  const channel: RealtimeChannel = supabase
    .channel(`game-messages:${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "game_messages",
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        const row = payload.new as GameMessageRow;
        if (row?.id) onInsert(row);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
