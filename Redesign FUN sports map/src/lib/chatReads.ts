import { supabase } from "./supabase";
import { isMissingRpc } from "./rpcErrors";
import { subscribeWithRetry } from "./realtimeRetry";

/**
 * Read state, unread counts and "Seen", from the server rather than from this
 * browser's localStorage.
 *
 * Every function here degrades the way the rest of this codebase does: a missing
 * RPC means the feature is not deployed yet, which returns empty rather than
 * throwing, and the caller falls back to what it did before.
 */
export type ChatThreadKind = "game" | "dm" | "note";

export type UnreadRow = {
  thread_kind: ChatThreadKind;
  thread_id: string;
  unread_count: number;
  /** The count hit the server's ceiling, so render "99+" rather than a total. */
  unread_capped: boolean;
};

export type ReadReceiptRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  last_read_at: string;
};

/** True when the backend predates the chat_reads migration. */
export type MaybeMissing<T> = { data: T; missing: boolean };

export async function fetchMyUnreadCounts(): Promise<MaybeMissing<UnreadRow[]>> {
  if (!supabase) return { data: [], missing: true };
  const { data, error } = await supabase.rpc("get_my_unread_counts");
  if (error) {
    if (isMissingRpc(error)) return { data: [], missing: true };
    console.warn("[FUN] unread counts", error.message);
    return { data: [], missing: false };
  }
  return { data: (data as UnreadRow[]) ?? [], missing: false };
}

/**
 * Move my watermark in one thread.
 *
 * Returns the resulting watermark, which for a backward or repeat mark is the
 * one that was already there — the server writes nothing in that case, so
 * calling this more often than necessary is cheap but not free of a round trip.
 */
export async function markThreadRead(
  kind: ChatThreadKind,
  threadId: string,
  at?: Date,
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("mark_thread_read", {
    p_kind: kind,
    p_thread_id: threadId,
    ...(at ? { p_at: at.toISOString() } : {}),
  });
  if (error) {
    if (!isMissingRpc(error)) console.warn("[FUN] mark read", error.message);
    return null;
  }
  return (data as string) ?? null;
}

export async function fetchThreadReadReceipts(
  kind: ChatThreadKind,
  threadId: string,
): Promise<ReadReceiptRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_thread_read_receipts", {
    p_kind: kind,
    p_thread_id: threadId,
  });
  if (error) {
    if (!isMissingRpc(error)) console.warn("[FUN] read receipts", error.message);
    return [];
  }
  return (data as ReadReceiptRow[]) ?? [];
}

/**
 * Watch one thread's read watermarks.
 *
 * `event: "*"` because the first time someone reads a thread it is an INSERT and
 * every time after that it is an UPDATE — listening for one of the two means
 * "Seen" either never appears or never moves.
 */
export function subscribeThreadReads(
  threadId: string,
  onChange: () => void,
): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  return subscribeWithRetry(() => {
    const suffix = Math.random().toString(36).slice(2, 10);
    return client.channel(`chat-reads:${threadId}-${suffix}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chat_reads",
        filter: `thread_id=eq.${threadId}`,
      },
      () => onChange(),
    );
  });
}

/**
 * Every new message anywhere I can see one, on a single channel per table.
 *
 * Unfiltered is safe and is the whole point: `game_messages` and `dm_messages`
 * both carry participant-scoped SELECT policies, and Realtime evaluates them
 * with the subscriber's own JWT, so an unfiltered subscription delivers exactly
 * the rows a filtered one would have — for every thread at once. That is how 50
 * per-thread channels collapse into 2, and how they keep working with the
 * messenger shut.
 */
export function subscribeAllMessages(args: {
  onGameMessage: (row: { id: string; game_id: string; user_id: string }) => void;
  onDmMessage: (row: { id: string; thread_id: string; user_id: string }) => void;
}): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const stop: Array<() => void> = [];

  stop.push(
    subscribeWithRetry(() => {
      const suffix = Math.random().toString(36).slice(2, 10);
      return client
        .channel(`all-game-messages:${suffix}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "game_messages" },
          (payload) => {
            const row = payload.new as { id: string; game_id: string; user_id: string };
            if (row?.id) args.onGameMessage(row);
          },
        );
    }),
  );

  stop.push(
    subscribeWithRetry(() => {
      const suffix = Math.random().toString(36).slice(2, 10);
      return client
        .channel(`all-dm-messages:${suffix}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "dm_messages" },
          (payload) => {
            const row = payload.new as { id: string; thread_id: string; user_id: string };
            if (row?.id) args.onDmMessage(row);
          },
        );
    }),
  );

  return () => stop.forEach((fn) => fn());
}

/**
 * My own notifications.
 *
 * Note activity comes this way rather than through an unfiltered
 * `map_note_comments` subscription, because that table's SELECT policy
 * ("read if can see note") never checks `map_notes.visibility` — an unfiltered
 * subscription would therefore deliver every note comment in the database to
 * every user. That policy is a pre-existing bug worth fixing on its own; this
 * route sidesteps it rather than depending on it.
 */
export function subscribeMyNotifications(
  userId: string,
  onInsert: () => void,
): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  return subscribeWithRetry(() => {
    const suffix = Math.random().toString(36).slice(2, 10);
    return client.channel(`my-notifications:${userId}-${suffix}`).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      () => onInsert(),
    );
  });
}
