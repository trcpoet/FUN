/**
 * One source of truth for how a map note describes itself.
 *
 * The label logic had drifted into four hand-synced copies — NoteThreadDialog,
 * UnifiedFeedCards (`visibilityChip`), ColocatedNotesModal (`visibilityMeta`) and
 * VenueInfoPopup, the last of which carried the comment "Matches the wording in
 * NoteThreadDialog so a note reads the same wherever it appears". That comment was the
 * bug report: keeping four copies in step by hand is exactly what stops working. Only one
 * of the four accepted the legacy `friends_only` / `invite_only` values, so the same note
 * could read "Friends" in the feed and "Public" on the map.
 *
 * The stored vocabulary is `public | friends | private` (see the `map_notes` visibility
 * CHECK constraint), but rows written before that constraint — and game rows, which share
 * these helpers by shape — still use the `_only` spellings, so both are accepted here.
 */
import { Globe, Lock, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

/** Lucide components are all the same shape; `Globe` is just a convenient stand-in. */
type NoteVisibilityIcon = typeof Globe;

export type NoteVisibilityLabel = "Public" | "Friends" | "Private";

/**
 * Anything at all, because callers hold this value at several different type widths:
 * `MapNoteVisibility` from a typed row, a bare `string` from an RPC projection, and
 * `null | undefined` from feed items where the column is optional.
 */
export function noteVisibilityLabel(v: string | null | undefined): NoteVisibilityLabel {
  if (v === "friends" || v === "friends_only") return "Friends";
  if (v === "private" || v === "invite_only") return "Private";
  return "Public";
}

/** Paired with the label so an icon can never contradict the word next to it. */
export function noteVisibilityIcon(v: string | null | undefined): NoteVisibilityIcon {
  const label = noteVisibilityLabel(v);
  if (label === "Friends") return Users;
  if (label === "Private") return Lock;
  return Globe;
}

/**
 * Relative timestamp for a note or comment.
 *
 * Falls back to "Recently" rather than an empty string: these labels sit in a
 * "<place> · <time>" run, and an empty half leaves a dangling separator.
 */
export function noteCreatedLabel(iso: string | null | undefined): string {
  if (!iso) return "Recently";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Recently";
  return formatDistanceToNow(d, { addSuffix: true });
}
