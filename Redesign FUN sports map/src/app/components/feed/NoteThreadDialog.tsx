import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, MessageCircle, Send, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { cn } from "../ui/utils";
import type { MapNoteCommentRow, MapNoteRow } from "../../../lib/supabase";
import {
  addNoteComment,
  deleteMapNote,
  fetchNoteComments,
  getPublicProfileById,
  toggleMapNoteLike,
} from "../../../lib/api";
import { glassMessengerPanel } from "../../styles/glass";
import {
  noteCreatedLabel,
  noteVisibilityIcon,
  noteVisibilityLabel,
} from "../../lib/noteVisibility";
import { LikeButton } from "./LikeButton";
import { NoteCommentLikeButton } from "./NoteCommentLikeButton";

/** `add_note_comment` slices the body at this length server-side (see api.ts). */
const COMMENT_MAX = 2000;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The whole row, not a `Pick`. This used to take five hand-copied fields, which meant
   * `created_by`, `lat`/`lng`, `comment_count` and `distance_km` were all fetched, held in
   * App state, and then thrown away at the prop boundary — so the dialog could not tell you
   * owned the note, how far away it was, or how many replies it had before loading them.
   */
  note: MapNoteRow;
  currentUserId?: string | null;
  /** Recenter the map on this note. Omit to hide the affordance. */
  onCenterOnMap?: () => void;
  /** Called after a successful delete so the caller can drop the pin without a refetch. */
  onDeleted?: () => void;
};

export function NoteThreadDialog({
  open,
  onOpenChange,
  note,
  currentUserId,
  onCenterOnMap,
  onDeleted,
}: Props) {
  const [comments, setComments] = useState<MapNoteCommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const isOwner = Boolean(currentUserId && note.created_by && currentUserId === note.created_by);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Clear first: the dialog stays mounted when the caller swaps `activeMapNote`
    // (colocated list → a different note), and showing the previous note's replies
    // under the new note's body reads as if they belong to it.
    setLoaded(false);
    setComments([]);
    void fetchNoteComments(note.id).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (r.error) {
        setError(r.error.message);
        setComments([]);
        return;
      }
      setComments(r.data ?? []);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, note.id]);

  useEffect(() => {
    if (!open || !note.created_by) {
      setAuthorName(null);
      return;
    }
    if (currentUserId && note.created_by === currentUserId) {
      setAuthorName("You");
      return;
    }
    let cancelled = false;
    void getPublicProfileById(note.created_by).then((r) => {
      if (cancelled) return;
      setAuthorName(r.error ? null : r.displayName?.trim() || null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, note.created_by, currentUserId]);

  const placeLabel = note.place_name?.trim() || "Pinned to this location";
  const createdLabel = noteCreatedLabel(note.created_at);
  const visibilityLabel = noteVisibilityLabel(note.visibility);
  const VisibilityIcon = noteVisibilityIcon(note.visibility);

  /**
   * `null` while genuinely unknown rather than `0`. Every read path now reports
   * `comment_count`, but a deployment that predates `get_note_by_id` still falls back to a
   * plain table read — and a `?? 0` there would flash "0 comments" on a note that has plenty.
   */
  const knownCount = loaded ? comments.length : note.comment_count ?? null;
  const commentCountLabel =
    knownCount == null ? "Comments" : `${knownCount} ${knownCount === 1 ? "comment" : "comments"}`;

  const noteId = note.id;
  const handleLike = useCallback(() => toggleMapNoteLike(noteId), [noteId]);

  /** Same source: null until the caller passes viewer coordinates to the note lookup. */
  const distanceLabel = useMemo(() => {
    const km = note.distance_km;
    if (km == null || !Number.isFinite(km)) return null;
    const mi = km * 0.621371;
    return `${mi < 0.1 ? "<0.1" : mi.toFixed(1)} mi`;
  }, [note.distance_km]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await addNoteComment({ noteId: note.id, body });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft("");
    if (!data) return;
    setComments((prev) => [...prev, data]);
    setLoaded(true);
    // The list is a fixed-height scroller, so a new reply otherwise lands below the fold.
    requestAnimationFrame(() => {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const handleDelete = async () => {
    if (!isOwner || deleteBusy) return;
    if (!window.confirm("Delete this map note for everyone?")) return;
    setDeleteBusy(true);
    const { error: err } = await deleteMapNote(note.id);
    setDeleteBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDeleted?.();
  };

  const remaining = COMMENT_MAX - draft.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={glassMessengerPanel(
          // Override the primitive's `grid gap-4 p-6 rounded-xl sm:max-w-lg`: this is a
          // flex column with a pinned composer and edge-to-edge dividers.
          "flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-[520px]",
        )}
      >
        {/* pr-12 clears the primitive's close button, which is pinned at top-4 right-4. */}
        <div className="shrink-0 px-4 pt-4 pb-3 pr-12">
          <div className="flex items-start gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/10 bg-cyan-500/10 text-cyan-300">
              <MapPin className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Map note
              </p>
              <DialogTitle className="truncate text-sm font-semibold leading-snug text-slate-100">
                {placeLabel}
              </DialogTitle>
              <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500">
                <VisibilityIcon className="size-3 shrink-0" aria-hidden />
                {visibilityLabel}
                {authorName ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="truncate">{authorName}</span>
                  </>
                ) : null}
                {distanceLabel ? (
                  <>
                    <span aria-hidden>·</span>
                    {distanceLabel}
                  </>
                ) : null}
                <span aria-hidden>·</span>
                {createdLabel}
              </p>
            </div>
          </div>
        </div>

        <DialogDescription className="sr-only">
          {`${visibilityLabel} map note at ${placeLabel}, posted ${createdLabel}.`}
        </DialogDescription>

        <div className="shrink-0 px-4 pb-3">
          <p className="whitespace-pre-wrap break-words text-[15px] font-medium leading-[1.6] text-slate-200">
            {note.body}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3">
          <LikeButton
            rowId={note.id}
            likeCount={note.like_count}
            likedByMe={note.liked_by_me}
            toggle={handleLike}
            label="note"
            variant="chip"
            onError={setError}
          />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-bold text-slate-300">
            <MessageCircle className="size-3.5" aria-hidden />
            <span className="tabular-nums">{commentCountLabel}</span>
          </span>
          {onCenterOnMap ? (
            <button
              type="button"
              onClick={onCenterOnMap}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
            >
              <MapPin className="size-3.5" aria-hidden />
              View on map
            </button>
          ) : null}
          {isOwner ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleteBusy}
              className="ml-auto inline-flex size-8 items-center justify-center rounded-xl border border-white/10 text-slate-400 transition-colors hover:border-rose-500/30 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40 disabled:opacity-50"
              aria-label="Delete note"
            >
              {deleteBusy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
            </button>
          ) : null}
        </div>

        <div
          ref={scrollerRef}
          className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 px-4 py-3 scrollbar-hide"
        >
          {loading ? (
            <p className="py-6 text-center text-xs text-slate-500">Loading replies…</p>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">Be the first to reply.</p>
          ) : (
            <ul className="space-y-2">
              {comments.map((c) => {
                const isMine = Boolean(currentUserId && c.user_id === currentUserId);
                return (
                  <li
                    key={c.id}
                    className={cn(
                      "rounded-2xl border px-3 py-2",
                      isMine
                        ? "border-cyan-400/20 bg-cyan-400/[0.06]"
                        : "border-white/[0.06] bg-white/[0.02]",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-200">
                      {c.body}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-[10px] text-slate-500">
                        {isMine ? (
                          <>
                            <span className="font-semibold text-cyan-300/80">You</span>
                            <span aria-hidden> · </span>
                          </>
                        ) : null}
                        {noteCreatedLabel(c.created_at)}
                      </p>
                      <NoteCommentLikeButton comment={c} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error ? (
            <p className="mb-2 text-xs text-amber-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              maxLength={COMMENT_MAX}
              placeholder="Write a reply…"
              className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || !draft.trim()}
              className={cn(
                "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
                "bg-gradient-to-r from-cyan-500/90 to-emerald-400/80 hover:from-cyan-400 hover:to-emerald-300",
                "text-slate-950 transition-colors disabled:opacity-50",
              )}
              aria-label="Send reply"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
            </button>
          </div>
          {remaining <= 200 ? (
            <p className="mt-1 text-right text-[10px] tabular-nums text-slate-500">
              {remaining} left
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
