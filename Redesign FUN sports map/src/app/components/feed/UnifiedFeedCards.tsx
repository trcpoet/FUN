import { useEffect, useState } from "react";
import { MessageCircle, MapPin, Send, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "../ui/utils";
import { Badge } from "../ui/badge";
import { addNoteComment, fetchNoteComments, type UnifiedFeedItem } from "../../../lib/api";
import type { MapNoteCommentRow } from "../../../lib/supabase";

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
  onOpenOnMap?: () => void;
}) {
  const { item } = props;
  const [comments, setComments] = useState<MapNoteCommentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy-load comments on mount when the post has any. If the post has no
  // comments yet, skip the round-trip — first reply will be appended locally.
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
  };

  return (
    <article
      className={cn(
        "group relative overflow-hidden transition-all duration-300",
        "rounded-3xl border border-white/[0.08] bg-card/40 backdrop-blur-sm",
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
          <Badge className="bg-black/40 backdrop-blur-md border-white/10 text-[10px] font-bold uppercase tracking-wider py-0.5 px-2.5">
            {visibilityChip(item.visibility)}
          </Badge>
        </div>

        <p className="text-[15px] text-slate-200 leading-[1.6] font-medium whitespace-pre-wrap break-words">
          {item.body}
        </p>

        <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 text-slate-400">
            <div className="flex size-8 items-center justify-center rounded-full bg-white/[0.03]">
              <MessageCircle className="size-4" />
            </div>
            <span className="text-xs font-bold tabular-nums tracking-tight">
              {totalCount} {totalCount === 1 ? "comment" : "comments"}
            </span>
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

        {/* Comments thread */}
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
              <p className="text-[10px] mt-0.5 text-slate-500">{relTime(c.created_at)}</p>
            </div>
          ))}

          {error ? (
            <p className="text-[11px] text-amber-400" role="alert">{error}</p>
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
  onOpenOnMap?: () => void;
}) {
  const { item } = props;
  return (
    <article
      className={cn(
        "group relative overflow-hidden transition-all duration-300",
        "rounded-3xl border border-white/[0.08] bg-card/40 backdrop-blur-sm",
        "hover:border-violet-400/25 hover:shadow-[0_0_30px_-12px_rgba(124,58,237,0.35)]",
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Game</p>
            <p className="text-sm font-bold text-white truncate">
              {item.title?.trim() || "Pickup game"}
            </p>
          </div>
          <Badge className="bg-black/40 backdrop-blur-md border-white/10 text-[10px] font-bold uppercase tracking-wider py-0.5 px-2.5">
            {item.sport?.trim() || "Sport"}
          </Badge>
        </div>

        {item.body?.trim() ? (
          <p className="text-sm text-slate-300 leading-relaxed line-clamp-3 italic">
            “{item.body.trim()}”
          </p>
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

export function StatusFeedCard(props: { item: Extract<UnifiedFeedItem, { kind: "status" }> }) {
  const { item } = props;
  return (
    <article
      className={cn(
        "group relative overflow-hidden transition-all duration-300",
        "rounded-3xl border border-white/[0.08] bg-card/40 backdrop-blur-sm",
        "hover:border-primary/25 hover:shadow-[0_0_30px_-12px_rgba(225,29,72,0.25)]",
      )}
    >
      <div className="p-4 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
          Status
        </p>
        <p className="text-[15px] text-slate-200 leading-[1.6] font-medium italic">
          “{item.body}”
        </p>
      </div>
    </article>
  );
}
