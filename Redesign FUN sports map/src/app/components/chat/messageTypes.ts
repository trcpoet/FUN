import type { DmMessageRow, GameMessageRow, MapNoteCommentRow } from "../../../lib/supabase";

/**
 * One shape for a chat message, whichever table it came from.
 *
 * Before this, the sheet held four near-copies of the same bubble because each
 * one destructured a different row type — a game message, a DM, a note comment —
 * and the differences between the rows leaked into the markup. Normalising at the
 * edge means the bubble takes a `ChatMessage` and cannot know or care; the three
 * real differences (who is speaking, whether they are a stranger, whether there
 * is a Like button) become props rather than separate components.
 */
export type ChatThreadKind = "game" | "dm" | "note";

export type ChatMessage = {
  id: string;
  threadKind: ChatThreadKind;
  /** Author's user id. Never null today; typed nullable for deleted accounts. */
  authorId: string | null;
  body: string;
  createdAt: string;
  /** Parsed once here rather than in every neighbour comparison downstream. */
  createdAtMs: number;
  /**
   * The original note-comment row, kept only because `NoteCommentLikeButton`
   * takes the row itself (it reads `like_count` / `liked_by_me`). Nothing else
   * may reach for this — it is the seam, not an escape hatch.
   */
  noteComment?: MapNoteCommentRow;
};

export function gameMessageToChat(row: GameMessageRow): ChatMessage {
  return {
    id: row.id,
    threadKind: "game",
    authorId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
    createdAtMs: Date.parse(row.created_at),
  };
}

export function dmMessageToChat(row: DmMessageRow): ChatMessage {
  return {
    id: row.id,
    threadKind: "dm",
    authorId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
    createdAtMs: Date.parse(row.created_at),
  };
}

export function noteCommentToChat(row: MapNoteCommentRow): ChatMessage {
  return {
    id: row.id,
    threadKind: "note",
    authorId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
    createdAtMs: Date.parse(row.created_at),
    noteComment: row,
  };
}
