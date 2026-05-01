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

function isGameMessagesSchemaCacheMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const m = (error.message ?? "").toLowerCase();
  // PostgREST returns a schema cache miss when the table exists in DB but not in PostgREST cache.
  return m.includes("schema cache") && (m.includes("game_messages") || m.includes("public.game_messages"));
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

  // Try the rich select first (post-migration: includes visibility / invite_token / ends_at / location).
  // If those columns don't exist yet (older schema), retry with the minimal set.
  let games: Array<Record<string, unknown>> | null = null;
  let e2: { message?: string; code?: string } | null = null;
  {
    const richSelect =
      "id, title, sport, starts_at, spots_needed, created_at, ends_at, duration_minutes, visibility, invite_token, created_by, status, location_label, lat, lng";
    const res = await supabase.from("games").select(richSelect).in("id", gameIds);
    if (res.error) {
      // Probe legacy schemas (missing duration_minutes / visibility / invite_token / lat / lng / etc.).
      const m = (res.error.message ?? "").toLowerCase();
      const isLegacyColumnMissing =
        res.error.code === "42703" || (m.includes("column") && m.includes("does not exist"));
      if (!isLegacyColumnMissing) {
        e2 = res.error;
      } else {
        const fallback = await supabase
          .from("games")
          .select("id, title, sport, starts_at, spots_needed, created_at")
          .in("id", gameIds);
        if (fallback.error) {
          e2 = fallback.error;
        } else {
          games = (fallback.data ?? []) as Array<Record<string, unknown>>;
        }
      }
    } else {
      games = (res.data ?? []) as Array<Record<string, unknown>>;
    }
  }
  if (e2) return { data: null, error: new Error(e2.message ?? "Failed to load games") };

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
  if (e4) {
    // If schema cache is temporarily out of date, still show conversation cards
    // (without last-message info) instead of failing the entire inbox.
    if (isGameMessagesSchemaCacheMissing(e4)) {
      // eslint-disable-next-line no-console
      console.warn("[FUN] game_messages schema cache missing; inbox will load without last messages.", e4.message);
    } else {
      return { data: null, error: new Error(e4.message) };
    }
  }

  const lastMsgByGame = new Map<string, { body: string; created_at: string }>();
  for (const m of msgs ?? []) {
    const row = m as { game_id: string; body: string; created_at: string };
    if (!lastMsgByGame.has(row.game_id)) {
      lastMsgByGame.set(row.game_id, { body: row.body, created_at: row.created_at });
    }
  }

  const rows: GameInboxRow[] = (games ?? []).map((raw) => {
    const g = raw as {
      id: string;
      title: string;
      sport: string;
      starts_at: string | null;
      spots_needed: number;
      created_at: string;
      ends_at?: string | null;
      duration_minutes?: number | null;
      visibility?: "public" | "friends_only" | "invite_only" | null;
      invite_token?: string | null;
      created_by?: string | null;
      status?: GameInboxRow["status"];
      location_label?: string | null;
      lat?: number | null;
      lng?: number | null;
    };
    const cnt = countByGame.get(g.id) ?? 0;
    const spots = g.spots_needed ?? 2;
    const lm = lastMsgByGame.get(g.id);
    return {
      id: g.id,
      title: g.title,
      sport: g.sport,
      starts_at: g.starts_at,
      ends_at: g.ends_at ?? null,
      duration_minutes: g.duration_minutes ?? null,
      visibility: g.visibility ?? null,
      invite_token: g.invite_token ?? null,
      created_by: g.created_by ?? null,
      status: g.status,
      location_label: g.location_label ?? null,
      last_message_body: lm?.body ?? null,
      last_message_at: lm?.created_at ?? null,
      participant_count: cnt,
      spots_remaining: Math.max(0, spots - cnt),
      lat: g.lat ?? null,
      lng: g.lng ?? null,
    };
  });

  rows.sort((a, b) => {
    // Most-recently-active wins: the larger of last_message_at, ends_at, or starts_at.
    const aKey =
      Date.parse(a.last_message_at ?? "") ||
      Date.parse(a.ends_at ?? "") ||
      Date.parse(a.starts_at ?? "") ||
      0;
    const bKey =
      Date.parse(b.last_message_at ?? "") ||
      Date.parse(b.ends_at ?? "") ||
      Date.parse(b.starts_at ?? "") ||
      0;
    if (aKey !== bKey) return bKey - aKey;
    const ga = games ?? [];
    const ca = (ga.find((x) => (x as { id: string }).id === a.id) as { created_at?: string } | undefined)?.created_at;
    const cb = (ga.find((x) => (x as { id: string }).id === b.id) as { created_at?: string } | undefined)?.created_at;
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
  if (error && isGameMessagesSchemaCacheMissing(error)) {
    // Treat as empty thread while we wait for schema cache reload.
    return { data: [], error: null };
  }
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

export type GameChatMember = {
  user_id: string;
  role: "host" | "player";
  joined_at: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** Roster for the game chat sidebar. Two queries avoid PostgREST embed when FK isn’t in schema cache. */
export async function fetchGameChatMembers(gameId: string): Promise<{
  data: GameChatMember[] | null;
  error: Error | null;
}> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };

  const { data: parts, error: partsErr } = await supabase
    .from("game_participants")
    .select("user_id, role, joined_at")
    .eq("game_id", gameId);

  if (partsErr) return { data: null, error: new Error(partsErr.message) };

  type PartRow = { user_id: string; role: "host" | "player"; joined_at: string };
  const partRows = (parts ?? []) as PartRow[];
  const userIds = [...new Set(partRows.map((p) => p.user_id))];

  const profileById = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  if (userIds.length > 0) {
    const { data: profs, error: profErr } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", userIds);

    if (profErr) return { data: null, error: new Error(profErr.message) };

    for (const row of profs ?? []) {
      const r = row as { id: string; display_name: string | null; avatar_url: string | null };
      profileById.set(r.id, { display_name: r.display_name, avatar_url: r.avatar_url });
    }
  }

  const members: GameChatMember[] = partRows.map((r) => {
    const p = profileById.get(r.user_id);
    return {
      user_id: r.user_id,
      role: r.role,
      joined_at: r.joined_at,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
    };
  });

  members.sort((a, b) => {
    if (a.role === "host" && b.role !== "host") return -1;
    if (a.role !== "host" && b.role === "host") return 1;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });

  return { data: members, error: null };
}

/** Subscribe to new rows for one game. Returns cleanup to unsubscribe. */
export function subscribeGameMessages(
  gameId: string,
  onInsert: (row: GameMessageRow) => void
): () => void {
  if (!supabase) return () => {};

  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const channel: RealtimeChannel = supabase
    .channel(`game-messages:${gameId}-${randomSuffix}`)
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
