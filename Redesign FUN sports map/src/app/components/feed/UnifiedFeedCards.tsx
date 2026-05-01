import { useEffect, useState } from "react";
import { Heart, MessageCircle, MapPin, Send, Loader2, Trash2, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../ui/utils";
import { Badge } from "../ui/badge";
import {
  addNoteComment,
  addStatusComment,
  deleteHostedGame,
  deleteMapNote,
  deleteMyStatus,
  fetchNoteComments,
  fetchStatusComments,
  toggleMapNoteLike,
  toggleStatusLike,
  type LiveFeedItem,
  type UnifiedFeedItem,
} from "../../../lib/api";
import type { MapNoteCommentRow, StatusCommentRow } from "../../../lib/supabase";
import { glassMessengerPanel } from "../../styles/glass";
import { NoteCommentLikeButton } from "./NoteCommentLikeButton";

export function visibilityChip(v: string | null | undefined): string {
  if (!v) return "Public";
  if (v === "friends" || v === "friends_only") return "Friends";
  if (v === "private" || v === "invite_only") return "Private";
  return "Public";
}

const PREVIEW_COUNT = 3;

function relTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatDistanceToNow(d, { addSuffix: true });
}

/** Inline feed-style note card: comment thread expands under the post. */
export function NoteFeedCard(props: {
  item: Extract<UnifiedFeedItem, { kind: "note" }>;
  currentUserId?: string | null;
  onOpenOnMap?: () => void;
  onInvalidate?: () => void;
}) {
  const { item, currentUserId, onInvalidate } = props;
  const [comments, setComments] = useState<MapNoteCommentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(item.like_count ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [liked, setLiked] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const isOwner = Boolean(currentUserId && item.created_by && currentUserId === item.created_by);

  useEffect(() => {
    setLikeCount(item.like_count ?? 0);
  }, [item.id, item.like_count]);

  useEffect(() => {
    if (loaded || (item.comment_count ?? 0) === 0) return;
    let cancelled = false;
    setLoading(true);
    void fetchNoteComments(item.id).then((r) => {
      if (cancelled) return;
      setLoading(false);
      setLoaded(true);
      if (r.error) {
        setError(r.error.message);
        return;
      }
      setComments(r.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.comment_count, loaded]);

  const totalCount = Math.max(comments.length, item.comment_count ?? 0);
  const visibleComments = showAll ? comments : comments.slice(-PREVIEW_COUNT);
  const hiddenCount = Math.max(0, comments.length - visibleComments.length);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await addNoteComment({ noteId: item.id, body });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft("");
    if (data) {
      setComments((prev) => [...prev, data]);
      setLoaded(true);
    }
    onInvalidate?.();
  };

  const handleLike = async () => {
    if (likeBusy) return;
    setLikeBusy(true);
    setError(null);
    const { liked: nowLiked, error: err } = await toggleMapNoteLike(item.id);
    setLikeBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setLiked(nowLiked);
    setLikeCount((c) => Math.max(0, c + (nowLiked ? 1 : -1)));
  };

  const handleDelete = async () => {
    if (!isOwner || deleteBusy) return;
    if (!window.confirm("Delete this map note for everyone?")) return;
    setDeleteBusy(true);
    const { error: err } = await deleteMapNote(item.id);
    setDeleteBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onInvalidate?.();
  };

  return (
    <article
      className={cn(
        glassMessengerPanel("group relative overflow-hidden transition-all duration-300 rounded-3xl"),
        "hover:border-cyan-400/25 hover:shadow-[0_0_34px_-14px_rgba(34,211,238,0.35)]",
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300 border border-cyan-400/10">
              <MapPin className="size-4" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Map note</p>
              <p className="text-xs font-semibold text-slate-200 line-clamp-1">
                Pinned · {relTime(item.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="bg-black/40 backdrop-blur-md border-white/10 text-[10px] font-bold uppercase tracking-wider py-0.5 px-2.5">
              {visibilityChip(item.visibility)}
            </Badge>
            {isOwner ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteBusy}
                className="inline-flex size-8 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition-colors disabled:opacity-50"
                aria-label="Delete note"
              >
                {deleteBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </button>
            ) : null}
          </div>
        </div>

        <p className="text-[15px] text-slate-200 leading-[1.6] font-medium whitespace-pre-wrap break-words">
          {item.body}
        </p>

        <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
          <div className="inline-flex items-center gap-3 text-slate-400">
            <button
              type="button"
              onClick={() => void handleLike()}
              disabled={likeBusy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-50",
                liked ? "text-rose-400 border-rose-500/30" : "text-slate-300 hover:text-rose-300",
              )}
              aria-label="Like note"
            >
              {likeBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Heart className={cn("size-3.5", liked && "fill-current")} />}
              {likeCount}
            </button>
            <div className="inline-flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-white/[0.03]">
                <MessageCircle className="size-4" />
              </div>
              <span className="text-xs font-bold tabular-nums tracking-tight">
                {totalCount} {totalCount === 1 ? "comment" : "comments"}
              </span>
            </div>
          </div>
          {props.onOpenOnMap ? (
            <button
              type="button"
              onClick={props.onOpenOnMap}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors"
              aria-label="View note on map"
            >
              <MapPin className="size-3.5" />
              View on map
            </button>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5 space-y-2">
          {loading && !loaded ? (
            <p className="text-xs text-slate-500 py-2 text-center">Loading replies…</p>
          ) : null}

          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-[11px] font-semibold text-cyan-300/90 hover:text-cyan-200 transition-colors"
            >
              View all {comments.length} comments
            </button>
          ) : null}

          {visibleComments.map((c) => (
            <div key={c.id} className="rounded-xl px-2.5 py-1.5">
              <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{c.body}</p>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p className="text-[10px] text-slate-500">{relTime(c.created_at)}</p>
                <NoteCommentLikeButton comment={c} />
              </div>
            </div>
          ))}

          {error ? (
            <p className="text-[11px] text-amber-400" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex items-end gap-2 pt-1">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Write a comment…"
              className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || !draft.trim()}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-xl",
                "bg-gradient-to-r from-cyan-500/90 to-emerald-400/80 hover:from-cyan-400 hover:to-emerald-300",
                "text-slate-950 disabled:opacity-50",
              )}
              aria-label="Send comment"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function GameFeedCard(props: {
  item: Extract<UnifiedFeedItem, { kind: "game" }>;
  currentUserId?: string | null;
  onOpenOnMap?: () => void;
  onInvalidate?: () => void;
}) {
  const { item, currentUserId, onInvalidate } = props;
  const [deleteBusy, setDeleteBusy] = useState(false);
  const isHost = Boolean(currentUserId && item.created_by && currentUserId === item.created_by);

  const handleDelete = async () => {
    if (!isHost || deleteBusy) return;
    if (!window.confirm("Delete this game for all players?")) return;
    setDeleteBusy(true);
    const err = await deleteHostedGame(item.id);
    setDeleteBusy(false);
    if (err) {
      window.alert(err.message);
      return;
    }
    onInvalidate?.();
  };

  return (
    <article
      className={cn(
        glassMessengerPanel("group relative overflow-hidden transition-all duration-300 rounded-3xl"),
        "hover:border-violet-400/25 hover:shadow-[0_0_30px_-12px_rgba(124,58,237,0.35)]",
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Game</p>
            <p className="text-sm font-bold text-white truncate">{item.title?.trim() || "Pickup game"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="bg-black/40 backdrop-blur-md border-white/10 text-[10px] font-bold uppercase tracking-wider py-0.5 px-2.5">
              {item.sport?.trim() || "Sport"}
            </Badge>
            {isHost ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteBusy}
                className="inline-flex size-8 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition-colors disabled:opacity-50"
                aria-label="Delete game"
              >
                {deleteBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </button>
            ) : null}
          </div>
        </div>

        {item.body?.trim() ? (
          <p className="text-sm text-slate-300 leading-relaxed line-clamp-3 italic">“{item.body.trim()}”</p>
        ) : (
          <p className="text-xs text-slate-500">No description yet.</p>
        )}

        {props.onOpenOnMap ? (
          <button
            type="button"
            onClick={props.onOpenOnMap}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <MapPin className="size-3.5" />
            View on map
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function StatusFeedCard(props: {
  item: Extract<UnifiedFeedItem, { kind: "status" }>;
  currentUserId?: string | null;
  onInvalidate?: () => void;
}) {
  const { item, currentUserId, onInvalidate } = props;
  const [comments, setComments] = useState<StatusCommentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(item.like_count ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [liked, setLiked] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const isOwner = Boolean(currentUserId && item.created_by && currentUserId === item.created_by);

  useEffect(() => {
    setLikeCount(item.like_count ?? 0);
  }, [item.id, item.like_count]);

  useEffect(() => {
    if (loaded || (item.comment_count ?? 0) === 0) return;
    let cancelled = false;
    setLoading(true);
    void fetchStatusComments(item.id).then((r) => {
      if (cancelled) return;
      setLoading(false);
      setLoaded(true);
      if (r.error) {
        setError(r.error.message);
        return;
      }
      setComments(r.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.comment_count, loaded]);

  const totalCount = Math.max(comments.length, item.comment_count ?? 0);
  const visibleComments = showAll ? comments : comments.slice(-PREVIEW_COUNT);
  const hiddenCount = Math.max(0, comments.length - visibleComments.length);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await addStatusComment({ statusId: item.id, body });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft("");
    if (data) {
      setComments((prev) => [...prev, data]);
      setLoaded(true);
    }
    onInvalidate?.();
  };

  const handleLike = async () => {
    if (likeBusy) return;
    setLikeBusy(true);
    setError(null);
    const { liked: nowLiked, error: err } = await toggleStatusLike(item.id);
    setLikeBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setLiked(nowLiked);
    setLikeCount((c) => Math.max(0, c + (nowLiked ? 1 : -1)));
  };

  const handleDelete = async () => {
    if (!isOwner || deleteBusy) return;
    if (!window.confirm("Delete this status?")) return;
    setDeleteBusy(true);
    const { error: err } = await deleteMyStatus(item.id);
    setDeleteBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    onInvalidate?.();
  };

  return (
    <article
      className={cn(
        glassMessengerPanel("group relative overflow-hidden transition-all duration-300 rounded-3xl"),
        "hover:border-primary/25 hover:shadow-[0_0_30px_-12px_rgba(225,29,72,0.25)]",
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Status</p>
          {isOwner ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleteBusy}
              className="inline-flex size-8 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition-colors disabled:opacity-50"
              aria-label="Delete status"
            >
              {deleteBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
          ) : null}
        </div>
        <p className="text-[15px] text-slate-200 leading-[1.6] font-medium italic">“{item.body}”</p>

        <div className="inline-flex items-center gap-3 text-slate-400">
          <button
            type="button"
            onClick={() => void handleLike()}
            disabled={likeBusy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-50",
              liked ? "text-rose-400 border-rose-500/30" : "text-slate-300 hover:text-rose-300",
            )}
            aria-label="Like status"
          >
            {likeBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Heart className={cn("size-3.5", liked && "fill-current")} />}
            {likeCount}
          </button>
          <div className="inline-flex items-center gap-2">
            <MessageCircle className="size-4" />
            <span className="text-xs font-bold tabular-nums">
              {totalCount} {totalCount === 1 ? "comment" : "comments"}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5 space-y-2">
          {loading && !loaded ? (
            <p className="text-xs text-slate-500 py-2 text-center">Loading replies…</p>
          ) : null}
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-[11px] font-semibold text-primary/90 hover:text-primary transition-colors"
            >
              View all {comments.length} comments
            </button>
          ) : null}
          {visibleComments.map((c) => (
            <div key={c.id} className="rounded-xl px-2.5 py-1.5">
              <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{c.body}</p>
              <p className="text-[10px] mt-0.5 text-slate-500">{relTime(c.created_at)}</p>
            </div>
          ))}
          {error ? (
            <p className="text-[11px] text-amber-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-end gap-2 pt-1">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Write a comment…"
              className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || !draft.trim()}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-xl",
                "bg-gradient-to-r from-primary/90 to-rose-500/80 hover:from-primary hover:to-rose-400",
                "text-white disabled:opacity-50",
              )}
              aria-label="Send comment"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Compact horizontal card for Discovery “Live” (25 km games + notes). */
export function LiveNearbyStripCard(props: {
  item: LiveFeedItem;
  onOpen: () => void;
}) {
  const { item, onOpen } = props;
  const isGame = item.kind === "game";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative w-[min(260px,85vw)] shrink-0 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-all",
        "hover:bg-white/[0.05] hover:border-primary/25",
        isGame ? "hover:shadow-[0_0_24px_-8px_rgba(124,58,237,0.35)]" : "hover:shadow-[0_0_24px_-8px_rgba(34,211,238,0.3)]",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-xl border",
            isGame ? "bg-violet-500/10 text-violet-300 border-violet-400/15" : "bg-cyan-500/10 text-cyan-300 border-cyan-400/15",
          )}
        >
          {isGame ? <span className="text-lg leading-none">🏟</span> : <MapPin className="size-4" />}
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{isGame ? "Game" : "Note"}</span>
      </div>
      <p className="text-sm font-bold text-white line-clamp-2 leading-snug">
        {isGame ? item.title?.trim() || "Pickup game" : item.body}
      </p>
      <p className="text-[10px] text-slate-500 mt-2">{relTime(item.created_at)}</p>
      <div className="absolute bottom-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[9px] font-black uppercase tracking-widest text-primary">Map</span>
        <ChevronRight className="size-3 text-primary" />
      </div>
    </button>
  );
}
