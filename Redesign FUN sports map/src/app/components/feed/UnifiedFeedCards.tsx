import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageCircle,
  MapPin,
  Send,
  Loader2,
  Trash2,
  ChevronRight,
  Image as ImageIcon,
  Clapperboard,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../ui/utils";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { PostEngagementBar } from "./PostEngagementBar";
import {
  addGameComment,
  addNoteComment,
  addStatusComment,
  deleteHostedGame,
  deleteMapNote,
  deleteMyStatus,
  fetchGameComments,
  fetchNoteComments,
  fetchStatusComments,
  feedItemToGameRow,
  feedMediaLooksVideo,
  feedMediaPublicUrl,
  toggleGameLike,
  toggleMapNoteLike,
  toggleStatusLike,
  type GameCommentRow,
  type LiveFeedItem,
  type UnifiedFeedItem,
} from "../../../lib/api";
import type { FeedMediaPostRow, GameRow, MapNoteCommentRow, StatusCommentRow } from "../../../lib/supabase";
import { GameActionBar } from "../game/GameActionBar";
import { GameHeadline } from "../game/GameHeadline";
import { GameStatusChip } from "../game/GameStatusChip";
import { SpotsBar } from "../game/SpotsBar";
import { gameViewerRole } from "../../lib/gameViewerRole";
import { sportEmojiFor } from "../../../lib/sportDisplay";
import { useSharedNow } from "../../../hooks/useSharedNow";
import { glassMessengerPanel } from "../../styles/glass";
import { noteVisibilityLabel } from "../../lib/noteVisibility";
import { LikeButton } from "./LikeButton";
import { NoteCommentLikeButton } from "./NoteCommentLikeButton";

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
  const [deleteBusy, setDeleteBusy] = useState(false);

  const isOwner = Boolean(currentUserId && item.created_by && currentUserId === item.created_by);

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
    } else {
      setError("Comment saved, but couldn't display it yet. Pull to refresh to see it.");
    }
    // Do not invalidate the entire feed on a new comment; we already have the
    // newly inserted row and can update local UI without triggering global
    // loading states / scroll jumps.
  };

  const noteId = item.id;
  const handleLike = useCallback(() => toggleMapNoteLike(noteId), [noteId]);

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
              {noteVisibilityLabel(item.visibility)}
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
            <LikeButton
              rowId={item.id}
              likeCount={item.like_count}
              likedByMe={item.liked_by_me}
              toggle={handleLike}
              label="note"
              variant="chip"
              onError={setError}
            />
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

/**
 * A game, as a post you can read, ask about and join.
 *
 * Games have always been in `get_unified_feed` and the feed has always thrown
 * them away, because the row it got back had a title, a description and nothing
 * else — no time, no spots, no status, no counts. `unified_feed_games_v2` returns
 * all of that in `item.game`, and `feedItemToGameRow` turns it into the same
 * `GameRow` the map popup reasons with, so Join here behaves exactly as Join
 * there rather than being a second implementation of the same rules.
 *
 * The conversation is `game_comments` — public, for people deciding whether to
 * come — and is deliberately not the squad chat, which stays private to the
 * people who already did.
 */
export function GameFeedCard(props: {
  item: Extract<UnifiedFeedItem, { kind: "game" }>;
  currentUserId?: string | null;
  onOpenOnMap?: () => void;
  onInvalidate?: () => void;
  /** Join / leave, owned by the page so the rest of the app learns about it. */
  onJoin?: (game: GameRow) => void | Promise<void>;
  onLeave?: (game: GameRow) => void | Promise<void>;
  onOpenChat?: (game: GameRow) => void;
  /** Games the viewer holds a participant row for, when the page knows. */
  joinedGameIds?: Set<string>;
}) {
  const { item, currentUserId, onInvalidate } = props;
  const [comments, setComments] = useState<GameCommentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const nowMs = useSharedNow(30_000);

  const row = useMemo(() => feedItemToGameRow(item), [item]);
  const isHost = Boolean(currentUserId && item.created_by && currentUserId === item.created_by);

  // The feed row already says whether you are in; fall back to the page's set
  // when the RPC predates that column.
  const joined = useMemo(() => {
    const ids = new Set(props.joinedGameIds ?? []);
    if (item.game?.joined_by_me) ids.add(item.id);
    return ids;
  }, [props.joinedGameIds, item.game?.joined_by_me, item.id]);

  const role = useMemo(
    () => gameViewerRole(row, { currentUserId: currentUserId ?? null, joinedGameIds: joined, nowMs }),
    [row, currentUserId, joined, nowMs],
  );

  useEffect(() => {
    if (loaded || (item.comment_count ?? 0) === 0) return;
    let cancelled = false;
    setLoadingComments(true);
    void fetchGameComments(item.id).then((r) => {
      if (cancelled) return;
      setLoadingComments(false);
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

  const gameId = item.id;
  const handleLike = useCallback(() => toggleGameLike(gameId), [gameId]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await addGameComment({ gameId, body });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft("");
    if (data) {
      setComments((prev) => [...prev, data]);
      setLoaded(true);
    } else {
      setError("Comment saved, but couldn't display it yet. Pull to refresh to see it.");
    }
  };

  const handleDelete = async () => {
    if (!isHost || deleteBusy) return;
    if (!window.confirm("Delete this game for all players?")) return;
    setDeleteBusy(true);
    const err = await deleteHostedGame(item.id);
    setDeleteBusy(false);
    if (err) {
      toast.error("Couldn't delete game", { description: err.message });
      return;
    }
    toast.success("Game deleted");
    onInvalidate?.();
  };

  const venue = item.game?.location_label?.trim();
  const distanceKm = item.game?.distance_km;

  return (
    <article
      className={cn(
        glassMessengerPanel("group relative overflow-hidden transition-all duration-300 rounded-3xl"),
        "hover:shadow-[var(--glow-md)]",
      )}
    >
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none" aria-hidden>
                {sportEmojiFor(item.sport ?? "")}
              </span>
              <Badge className="border-white/10 bg-black/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">
                {item.sport?.trim() || "Sport"}
              </Badge>
              <GameStatusChip game={row} nowMs={nowMs} size="xs" />
            </div>
            <GameHeadline game={row} nowMs={nowMs} />
            <p className="truncate text-sm font-semibold text-slate-200">
              {item.title?.trim() || "Pickup game"}
            </p>
          </div>
          {isHost ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleteBusy}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
              aria-label="Delete game"
            >
              {deleteBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
          ) : null}
        </div>

        {venue || distanceKm != null ? (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <MapPin className="size-3.5 shrink-0 text-slate-500" aria-hidden />
            <span className="truncate">
              {venue || "On the map"}
              {distanceKm != null ? ` · ${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away` : ""}
            </span>
          </p>
        ) : null}

        {item.body?.trim() ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-slate-300">{item.body.trim()}</p>
        ) : null}

        <SpotsBar game={row} />

        <GameActionBar
          game={row}
          role={role}
          density="compact"
          onJoin={props.onJoin}
          onLeave={props.onLeave}
          onChat={props.onOpenChat}
          onOpenDetails={props.onOpenOnMap ? () => props.onOpenOnMap?.() : undefined}
        />

        <div className="flex items-center gap-2 pt-0.5">
          <LikeButton
            rowId={item.id}
            likeCount={item.like_count}
            likedByMe={item.liked_by_me}
            toggle={handleLike}
            label="game"
            variant="chip"
            onError={setError}
          />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-400">
            <MessageCircle className="size-3.5" aria-hidden />
            {totalCount}
          </span>
          {props.onOpenOnMap ? (
            <button
              type="button"
              onClick={props.onOpenOnMap}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <MapPin className="size-3.5" aria-hidden />
              Map
            </button>
          ) : null}
        </div>

        {/* The public thread. Same shape as a note's, because a person reading
            both should not have to learn two of them. */}
        <div className="space-y-2 border-t border-white/5 pt-3">
          {loadingComments ? (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading questions…
            </p>
          ) : null}

          {hiddenCount > 0 && !showAll ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 transition-colors hover:text-white"
            >
              Show {hiddenCount} earlier {hiddenCount === 1 ? "comment" : "comments"}
              <ChevronRight className="size-3" aria-hidden />
            </button>
          ) : null}

          {visibleComments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 rounded-2xl bg-surface-1 px-3 py-2">
              <p className="min-w-0 flex-1 break-words text-[13px] leading-relaxed text-slate-300">
                {c.body}
              </p>
              <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-slate-600">
                {relTime(c.created_at)}
              </span>
            </div>
          ))}

          {comments.length === 0 && !loadingComments ? (
            <p className="text-xs text-slate-500">
              Ask the host anything before you commit — is it beginners welcome, is there parking.
            </p>
          ) : null}

          {error ? (
            <p className="rounded-xl bg-rose-500/12 px-3 py-2 text-xs text-rose-200" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Ask about this game…"
              maxLength={2000}
              className="min-h-10 min-w-0 flex-1 rounded-full bg-surface-3 px-4 text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label="Ask about this game"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!draft.trim() || sending}
              className={cn(
                "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
                draft.trim() && !sending
                  ? "bg-primary text-primary-foreground hover:bg-primary-container"
                  : "bg-surface-2 text-slate-600",
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
  const [deleteBusy, setDeleteBusy] = useState(false);

  const isOwner = Boolean(currentUserId && item.created_by && currentUserId === item.created_by);

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
    } else {
      setError("Comment saved, but couldn't display it yet. Pull to refresh to see it.");
    }
    // Same as notes: avoid full-feed refresh on comment send.
  };

  const statusId = item.id;
  const handleLike = useCallback(() => toggleStatusLike(statusId), [statusId]);

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
          <LikeButton
            rowId={item.id}
            likeCount={item.like_count}
            likedByMe={item.liked_by_me}
            toggle={handleLike}
            label="status"
            variant="chip"
            onError={setError}
          />
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

/** Photo or reel card for the global network stream (`feed_media_posts`). */
export function MediaFeedCard(props: {
  item: FeedMediaPostRow;
  variant: "post" | "reel";
  onOpenProfile?: () => void;
}) {
  const { item, variant, onOpenProfile } = props;
  const url = feedMediaPublicUrl(item.storage_path);
  const isVideo = feedMediaLooksVideo(item.storage_path, url);
  const label = variant === "reel" ? "Reel" : "Photo";

  return (
    <article
      className={cn(
        glassMessengerPanel("group relative overflow-hidden transition-all duration-300 rounded-3xl"),
        "hover:border-sky-400/25 hover:shadow-[0_0_30px_-12px_rgba(56,189,248,0.28)]",
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onOpenProfile}
            disabled={!onOpenProfile}
            aria-label={`View ${item.authorName?.trim() || "athlete"}'s profile`}
            className="flex items-center gap-2 min-w-0 text-left rounded-2xl transition-opacity hover:opacity-90 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
          >
            {item.authorAvatarUrl ? (
              <img
                src={item.authorAvatarUrl}
                alt=""
                loading="lazy"
                className="size-9 shrink-0 rounded-2xl border border-sky-400/10 object-cover"
              />
            ) : (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-300 border border-sky-400/10">
                {variant === "reel" ? <Clapperboard className="size-4" /> : <ImageIcon className="size-4" />}
              </div>
            )}
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs font-bold text-white line-clamp-1">{item.authorName?.trim() || label}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 line-clamp-1">
                {label} · {relTime(item.created_at)}
              </p>
            </div>
          </button>
          <Badge className="bg-black/40 backdrop-blur-md border-white/10 text-[10px] font-bold uppercase tracking-wider py-0.5 px-2.5 shrink-0">
            {item.visibility ?? "Public"}
          </Badge>
        </div>

        {item.body?.trim() ? (
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{item.body.trim()}</p>
        ) : null}

        <div className="aspect-square overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40">
          {!url ? (
            <div className="flex h-full items-center justify-center px-4 py-10 text-center text-xs text-slate-500">
              Media unavailable (check storage path).
            </div>
          ) : isVideo ? (
            <video
              className="h-full w-full object-contain bg-black"
              controls
              playsInline
              preload="metadata"
              src={url}
            />
          ) : (
            <img
              src={url}
              alt=""
              loading="lazy"
              width={1080}
              height={1080}
              className="h-full w-full object-contain bg-black/60"
            />
          )}
        </div>

        <PostEngagementBar postId={item.id} shareUrl={url} caption={item.body} />
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
