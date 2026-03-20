import { supabase } from "./supabase";
import type { GameInboxRow, GameMessageRow } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

/** PostgREST: function missing from schema cache or not deployed (404). */
function inboxRpcMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const m = (error.message ?? "").toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("could not find the function") ||
    m.includes("get_my_game_inbox")
  );
}

/**
 * Same rows as `get_my_game_inbox` RPC, built from tables (3 round-trips).
 * Used when the RPC is not deployed or PostgREST has not reloaded schema yet.
 */
async function fetchMyGameInboxFromTables(): Promise<{
  data: GameInboxRow[] | null;
  error: Error | null;
}> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error("Not signed in") };

  const { data: mine, error: e1 } = await supabase
    .from("game_participants")
    .select("game_id")
    .eq("user_id", user.id);
  if (e1) return { data: null, error: new Error(e1.message) };

  const gameIds = [...new Set((mine ?? []).map((r: { game_id: string }) => r.game_id))];
  if (gameIds.length === 0) return { data: [], error: null };

  const { data: games, error: e2 } = await supabase
    .from("games")
    .select("id, title, sport, starts_at, spots_needed, created_at")
    .in("id", gameIds);
  if (e2) return { data: null, error: new Error(e2.message) };

  const { data: allParts, error: e3 } = await supabase
    .from("game_participants")
    .select("game_id")
    .in("game_id", gameIds);
  if (e3) return { data: null, error: new Error(e3.message) };

  const countByGame = new Map<string, number>();
  for (const row of allParts ?? []) {
    const gid = (row as { game_id: string }).game_id;
    countByGame.set(gid, (countByGame.get(gid) ?? 0) + 1);
  }

  const { data: msgs, error: e4 } = await supabase
    .from("game_messages")
    .select("game_id, body, created_at")
    .in("game_id", gameIds)
    .order("created_at", { ascending: false });
  if (e4) return { data: null, error: new Error(e4.message) };

  const lastMsgByGame = new Map<string, { body: string; created_at: string }>();
  for (const m of msgs ?? []) {
    const row = m as { game_id: string; body: string; created_at: string };
    if (!lastMsgByGame.has(row.game_id)) {
      lastMsgByGame.set(row.game_id, { body: row.body, created_at: row.created_at });
    }
  }

  type GameRow = {
    id: string;
    title: string;
    sport: string;
    starts_at: string | null;
    spots_needed: number;
    created_at: string;
  };

  const rows: GameInboxRow[] = (games as GameRow[] ?? []).map((g) => {
    const cnt = countByGame.get(g.id) ?? 0;
    const spots = g.spots_needed ?? 2;
    const lm = lastMsgByGame.get(g.id);
    return {
      id: g.id,
      title: g.title,
      sport: g.sport,
      starts_at: g.starts_at,
      location_label: null,
      last_message_body: lm?.body ?? null,
      last_message_at: lm?.created_at ?? null,
      participant_count: cnt,
      spots_remaining: Math.max(0, spots - cnt),
    };
  });

  rows.sort((a, b) => {
    const ta = Date.parse(a.last_message_at ?? a.starts_at ?? "") || 0;
    const tb = Date.parse(b.last_message_at ?? b.starts_at ?? "") || 0;
    if (ta !== tb) return tb - ta;
    const ga = games as GameRow[] | undefined;
    const ca = ga?.find((x) => x.id === a.id)?.created_at;
    const cb = ga?.find((x) => x.id === b.id)?.created_at;
    return (Date.parse(cb ?? "") || 0) - (Date.parse(ca ?? "") || 0);
  });

  return { data: rows, error: null };
}

export async function fetchMyGameInbox(): Promise<{
  data: GameInboxRow[] | null;
  error: Error | null;
}> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_my_game_inbox");
  if (!error) return { data: (data as GameInboxRow[]) ?? [], error: null };
  if (!inboxRpcMissing(error)) return { data: null, error: new Error(error.message) };
  return fetchMyGameInboxFromTables();
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
