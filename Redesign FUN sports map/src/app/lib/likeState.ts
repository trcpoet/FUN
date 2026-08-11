/**
 * Optimistic like/unlike bookkeeping, shared by every heart in the app
 * (map notes, note comments, statuses).
 *
 * This lives apart from the components because the arithmetic is the whole
 * bug surface. Toggling a heart has to survive three things at once: an
 * instant local flip, a server verdict that may disagree, and an unrelated
 * refetch landing mid-flight. Doing that with bare `+1 / -1` on the *current*
 * count double-applies whenever a clamp or a disagreement is involved, so
 * every transition here is derived from the snapshot taken before the toggle.
 */

/** What a read path tells us about one likeable row. */
export type LikeSource = {
  like_count?: number | null;
  liked_by_me?: boolean | null;
};

type LikeSnapshot = { count: number; liked: boolean };

export type LikeState = LikeSnapshot & {
  /** Pre-toggle values while a toggle is in flight; `null` when idle. */
  pending: LikeSnapshot | null;
};

function clamp(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

function snapshot(source: LikeSource): LikeSnapshot {
  return { count: clamp(source.like_count ?? 0), liked: Boolean(source.liked_by_me) };
}

/** Initial state for a row. Absent fields read as "0 likes, not liked". */
export function likeStateFrom(source: LikeSource): LikeState {
  return { ...snapshot(source), pending: null };
}

/** Flip locally and remember what to roll back to. */
export function beginToggle(state: LikeState): LikeState {
  const nextLiked = !state.liked;
  return {
    count: clamp(state.count + (nextLiked ? 1 : -1)),
    liked: nextLiked,
    // Keep the first base if this is somehow re-entered: rolling back to a
    // half-applied value would leave a like nobody made.
    pending: state.pending ?? { count: state.count, liked: state.liked },
  };
}

/** The write failed — restore exactly what was on screen before the tap. */
export function revertToggle(state: LikeState): LikeState {
  if (!state.pending) return state;
  return { ...state.pending, pending: null };
}

/**
 * The write returned. `serverLiked` is authoritative; the count is recomputed
 * from the pre-toggle base so a disagreement costs one adjustment, not two.
 */
export function settleToggle(state: LikeState, serverLiked: boolean): LikeState {
  const base = state.pending ?? { count: state.count, liked: state.liked };
  const delta = serverLiked === base.liked ? 0 : serverLiked ? 1 : -1;
  return { count: clamp(base.count + delta), liked: serverLiked, pending: null };
}

/**
 * A fresh row arrived from a read path. Ignored while a toggle is in flight,
 * because that row was fetched before the write and would visibly un-press
 * the heart the user just tapped.
 */
export function syncFromServer(state: LikeState, source: LikeSource): LikeState {
  if (state.pending) return state;
  return likeStateFrom(source);
}
