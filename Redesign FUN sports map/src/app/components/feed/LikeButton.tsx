import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import { cn } from "../ui/utils";
import {
  beginToggle,
  likeStateFrom,
  revertToggle,
  settleToggle,
  syncFromServer,
  type LikeState,
} from "../../lib/likeState";

/**
 * The one heart in the app. Map notes, note comments and statuses all render
 * this, so "liked" means the same thing and behaves the same way everywhere.
 *
 * The caller owns the row and passes the *server's* view of it (`likeCount` /
 * `likedByMe`); this component owns only the in-flight optimistic state, whose
 * transitions live in `likeState.ts`.
 */
export function LikeButton(props: {
  /** Row identity. A change hard-resets, so a recycled button can't inherit a like. */
  rowId: string;
  /** Server truth. Both absent means the read path doesn't report likes yet. */
  likeCount?: number | null;
  likedByMe?: boolean | null;
  /** Performs the write and reports the authoritative new state. */
  toggle: () => Promise<{ liked: boolean; error: Error | null }>;
  /** Noun for the a11y label, e.g. "note" → "Like note" / "Unlike note". */
  label: string;
  /** `chip` is the bordered pill on cards; `inline` is the bare comment heart. */
  variant?: "chip" | "inline";
  className?: string;
  onError?: (message: string) => void;
}) {
  const {
    rowId,
    likeCount,
    likedByMe,
    toggle,
    label,
    variant = "inline",
    className,
    onError,
  } = props;

  const [state, setState] = useState<LikeState>(() =>
    likeStateFrom({ like_count: likeCount, liked_by_me: likedByMe }),
  );

  const seenRow = useRef(rowId);
  useEffect(() => {
    const source = { like_count: likeCount, liked_by_me: likedByMe };
    const switchedRow = seenRow.current !== rowId;
    seenRow.current = rowId;
    // A different row is a different subject: take the server values outright.
    // The same row mid-toggle keeps the optimistic value (see syncFromServer).
    setState((s) => (switchedRow ? likeStateFrom(source) : syncFromServer(s, source)));
  }, [rowId, likeCount, likedByMe]);

  const busy = state.pending !== null;

  const handle = useCallback(async () => {
    if (state.pending) return;
    setState(beginToggle);
    const { liked, error } = await toggle();
    if (error) {
      setState(revertToggle);
      onError?.(error.message);
      return;
    }
    setState((s) => settleToggle(s, liked));
  }, [state.pending, toggle, onError]);

  const chip = variant === "chip";

  return (
    <button
      type="button"
      onClick={(e) => {
        // Cards and comment rows are themselves clickable in some surfaces.
        e.stopPropagation();
        void handle();
      }}
      disabled={busy}
      aria-pressed={state.liked}
      aria-label={`${state.liked ? "Unlike" : "Like"} ${label}`}
      className={cn(
        "inline-flex items-center transition-colors disabled:opacity-50",
        chip
          ? "gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-bold"
          : "gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        state.liked
          ? chip
            ? "border-rose-500/30 text-rose-400"
            : "text-rose-400 hover:text-rose-300"
          : chip
            ? "text-slate-300 hover:text-rose-300"
            : "text-slate-400 hover:text-rose-300",
        className,
      )}
    >
      {busy ? (
        <Loader2 className={cn(chip ? "size-3.5" : "size-3", "animate-spin")} aria-hidden />
      ) : (
        <Heart
          className={cn(chip ? "size-3.5" : "size-3", state.liked && "fill-current")}
          aria-hidden
        />
      )}
      {/* Cards keep a stable footprint; the bare comment heart hides a zero. */}
      {chip || state.count > 0 ? (
        <span className="tabular-nums">{state.count}</span>
      ) : null}
    </button>
  );
}
