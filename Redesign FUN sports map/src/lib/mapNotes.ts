import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { MapNoteCommentRow, MapNoteRow, NoteInboxRow } from "./supabase";

/**
 * Centralized helpers for the perpetual map-notes inbox + realtime fan-out.
 * Mirrors the patterns in `src/lib/gameChat.ts` (rich RPC + table fallback).
 */

function inboxRpcMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const m = (error.message ?? "").toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("could not find the function") ||
    m.includes("get_my_note_inbox")
  );
}

/** Build NoteInboxRow[] without the RPC — joins map_notes + map_note_comments client-side. */
async function fetchMyNoteInboxFromTables(): Promise<{
  data: NoteInboxRow[] | null;
  error: Error | null;
}> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error("Not signed in") };

  // Notes I commented on (note_ids).
  const { data: myComments, error: cErr } = await supabase
    .from("map_note_comments")
    .select("note_id")
    .eq("user_id", user.id);
  if (cErr) return { data: null, error: new Error(cErr.message) };

  const commentNoteIds = [...new Set((myComments ?? []).map((r: { note_id: string }) => r.note_id))];

  // All notes that I authored OR commented on (one round-trip via OR).
  const orFilter = commentNoteIds.length > 0
    ? `created_by.eq.${user.id},id.in.(${commentNoteIds.join(",")})`
    : `created_by.eq.${user.id}`;

  const { data: notes, error: nErr } = await supabase
    .from("map_notes")
    .select("id, body, visibility, created_at, created_by, lat, lng, place_name")
    .or(orFilter);
  if (nErr) return { data: null, error: new Error(nErr.message) };

  const noteIds = (notes ?? []).map((r: { id: string }) => r.id);
  if (noteIds.length === 0) return { data: [], error: null };

  // Bulk fetch every comment for these notes (counts + last comment).
  const { data: allComments, error: aErr } = await supabase
    .from("map_note_comments")
    .select("id, note_id, body, created_at")
    .in("note_id", noteIds)
    .order("created_at", { ascending: false });
  if (aErr) return { data: null, error: new Error(aErr.message) };

  const countByNote = new Map<string, number>();
  const lastByNote = new Map<string, { body: string; created_at: string }>();
  for (const row of allComments ?? []) {
    const r = row as { note_id: string; body: string; created_at: string };
    countByNote.set(r.note_id, (countByNote.get(r.note_id) ?? 0) + 1);
    if (!lastByNote.has(r.note_id)) {
      lastByNote.set(r.note_id, { body: r.body, created_at: r.created_at });
    }
  }

  const rows: NoteInboxRow[] = (notes ?? []).map((raw) => {
    const n = raw as MapNoteRow;
    const last = lastByNote.get(n.id) ?? null;
    return {
      id: n.id,
      body: n.body,
      visibility: n.visibility,
      created_at: n.created_at,
      created_by: n.created_by,
      lat: n.lat,
      lng: n.lng,
      place_name: n.place_name,
      comment_count: countByNote.get(n.id) ?? 0,
      last_comment_body: last?.body ?? null,
      last_comment_at: last?.created_at ?? null,
      is_author: n.created_by === user.id,
    };
  });

  rows.sort((a, b) => {
    const aKey = Date.parse(a.last_comment_at ?? "") || Date.parse(a.created_at) || 0;
    const bKey = Date.parse(b.last_comment_at ?? "") || Date.parse(b.created_at) || 0;
    return bKey - aKey;
  });

  return { data: rows, error: null };
}

/** Notes the current user has authored or commented on. */
export async function fetchMyNoteInbox(): Promise<{
  data: NoteInboxRow[] | null;
  error: Error | null;
}> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_my_note_inbox");
  if (!error) return { data: (data as NoteInboxRow[]) ?? [], error: null };
  if (!inboxRpcMissing(error)) return { data: null, error: new Error(error.message) };
  return fetchMyNoteInboxFromTables();
}

/** Single-note lookup for deep-links / messenger header. */
export async function fetchNoteById(
  id: string,
): Promise<{ data: MapNoteRow | null; error: Error | null }> {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from("map_notes")
    .select("id, body, visibility, created_at, created_by, lat, lng, place_name")
    .eq("id", id)
    .maybeSingle();
  return {
    data: (data as MapNoteRow) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

/** Realtime: new comments on one note. Returns cleanup. */
export function subscribeNoteComments(
  noteId: string,
  onInsert: (row: MapNoteCommentRow) => void,
): () => void {
  const client = supabase;
  if (!client) return () => {};

  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const channel: RealtimeChannel = client
    .channel(`map-note-comments:${noteId}-${randomSuffix}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "map_note_comments",
        filter: `note_id=eq.${noteId}`,
      },
      (payload) => {
        const row = payload.new as MapNoteCommentRow;
        if (row?.id) onInsert(row);
      },
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
