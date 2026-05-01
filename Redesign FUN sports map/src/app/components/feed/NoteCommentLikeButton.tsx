import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { cn } from "../ui/utils";
import { toggleNoteCommentLike } from "../../../lib/api";
import type { MapNoteCommentRow } from "../../../lib/supabase";

/**
 * Heart toggle + count for a single map-note comment. Used by the feed card,
 * the map dialog, and the messenger note thread so the like UX is identical
 * everywhere.
 *
 * Optimistically updates locally; the parent owns the comment list state and
 * may also want to refresh when it next re-fetches `fetchNoteComments`.
 */
export function NoteCommentLikeButton(props: {
  comment: Pick<MapNoteCommentRow, "id" | "like_count" | "liked_by_me">;
  /** Optional override styling (e.g. tighter messenger bubble). */
  className?: string;
}) {
  const { comment, className } = props;
  const [count, setCount] = useState<number>(comment.like_count ?? 0);
  const [liked, setLiked] = useState<boolean>(Boolean(comment.liked_by_me));
  const [busy, setBusy] = useState(false);

  // Re-sync if a fresh comments fetch lands with different counts.
  useEffect(() => {
    setCount(comment.like_count ?? 0);
    setLiked(Boolean(comment.liked_by_me));
  }, [comment.id, comment.like_count, comment.liked_by_me]);

  const handle = async () => {
    if (busy) return;
    setBusy(true);
    // Optimistic toggle so the heart feels instant.
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
    const { liked: serverLiked, error } = await toggleNoteCommentLike(comment.id);
    setBusy(false);
    if (error) {
      // Roll back on failure.
      setLiked(!nextLiked);
      setCount((c) => Math.max(0, c + (nextLiked ? -1 : 1)));
      return;
    }
    // Server is source of truth; reconcile if it disagrees with our optimistic guess.
    if (serverLiked !== nextLiked) {
      setLiked(serverLiked);
      setCount((c) => Math.max(0, c + (serverLiked ? 1 : -1) - (nextLiked ? 1 : -1)));
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void handle();
      }}
      disabled={busy}
      aria-pressed={liked}
      aria-label={liked ? "Unlike comment" : "Like comment"}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-50",
        liked
          ? "text-rose-400 hover:text-rose-300"
          : "text-slate-400 hover:text-rose-300",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Heart className={cn("size-3", liked && "fill-current")} />
      )}
      {count > 0 ? <span className="tabular-nums">{count}</span> : null}
    </button>
  );
}
