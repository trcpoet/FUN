import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Heart, Loader2, MessageSquare, SendHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../ui/utils";
import { formatRelativeShort } from "../../../lib/formatRelative";
import {
  addVenueComment,
  deleteVenueComment,
  fetchVenueComments,
  toggleVenueCommentLike,
  type VenueCommentRow,
} from "../../../lib/venueSocial";
import type { VenueSelection } from "../mapboxMapTypes";

type Props = {
  venue: VenueSelection;
  currentUserId?: string | null;
  ensureSession?: () => Promise<boolean>;
};

/**
 * Open chatter thread for a venue — "anyone playing at 6?", "hoop on the north
 * end is bent".
 *
 * Separate from reviews by design: this is many-per-user, disposable, and
 * unrated, so mixing it into the rated table would either force a meaningless
 * rating or cap people at one message.
 *
 * No realtime subscription: the modal is short-lived, and a channel per venue
 * would add fan-out for a surface most people close in seconds.
 */
export function VenueCommentsSection({ venue, currentUserId, ensureSession }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<VenueCommentRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchVenueComments({ venueId: venue.id });
    setLoading(false);
    setLoaded(true);
    if (error) {
      toast.error("Couldn't load comments", { description: error.message });
      return;
    }
    setRows(data);
  }, [venue.id]);

  useEffect(() => {
    setOpen(false);
    setLoaded(false);
    setRows([]);
    setDraft("");
  }, [venue.id]);

  useEffect(() => {
    if (open && !loaded && !loading) void load();
  }, [open, loaded, loading, load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (ensureSession && !(await ensureSession())) return;

    setSending(true);
    const { data, error } = await addVenueComment({ venue, body });
    setSending(false);
    if (error) {
      toast.error("Couldn't post that", { description: error.message });
      return;
    }
    setDraft("");
    if (data) setRows((prev) => [data, ...prev]);
  };

  const remove = async (id: string) => {
    const prev = rows;
    setRows((r) => r.filter((c) => c.id !== id));
    const { error } = await deleteVenueComment(id);
    if (error) {
      setRows(prev); // put it back
      toast.error("Couldn't delete that", { description: error.message });
    }
  };

  const like = async (comment: VenueCommentRow) => {
    const nextLiked = !comment.liked_by_me;
    // Optimistic so the heart feels instant; reconciled against the server below.
    setRows((r) =>
      r.map((c) =>
        c.id === comment.id
          ? { ...c, liked_by_me: nextLiked, like_count: Math.max(0, c.like_count + (nextLiked ? 1 : -1)) }
          : c
      )
    );
    const { liked, error } = await toggleVenueCommentLike(comment.id);
    if (error) {
      setRows((r) =>
        r.map((c) =>
          c.id === comment.id
            ? { ...c, liked_by_me: !nextLiked, like_count: Math.max(0, c.like_count + (nextLiked ? -1 : 1)) }
            : c
        )
      );
      return;
    }
    if (liked !== nextLiked) {
      setRows((r) =>
        r.map((c) =>
          c.id === comment.id
            ? { ...c, liked_by_me: liked, like_count: Math.max(0, c.like_count + (liked ? 1 : -1) - (nextLiked ? 1 : -1)) }
            : c
        )
      );
    }
  };

  return (
    <section className="mt-3 border-t border-white/10 px-4 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 py-1 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded-lg"
      >
        <span className="flex min-w-0 items-center gap-2">
          <MessageSquare className="h-4 w-4 shrink-0 text-violet-400" aria-hidden />
          <span className="text-sm font-medium text-white">Chatter</span>
          {loaded && rows.length > 0 ? (
            <span className="text-xs text-slate-400 tabular-nums">{rows.length}</span>
          ) : (
            <span className="text-xs text-slate-500">Ask about pickup here</span>
          )}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="pb-1 pt-2">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Anyone playing tonight?"
              className="min-h-[38px] flex-1 resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
              aria-label="Post comment"
              className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition-colors hover:bg-violet-500 cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
            </button>
          </div>

          {loading ? (
            <div className="mt-3 space-y-2" aria-hidden>
              <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-white/5" />
            </div>
          ) : rows.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing here yet — start the thread.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {rows.map((c) => {
                const isMine = Boolean(currentUserId && c.user_id === currentUserId);
                return (
                  <li key={c.id} className="flex items-start gap-2.5">
                    {c.authorAvatarUrl ? (
                      <img
                        src={c.authorAvatarUrl}
                        alt=""
                        loading="lazy"
                        className="size-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="size-7 shrink-0 rounded-full bg-violet-500/10" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px]">
                        <span className="font-bold text-white">
                          {isMine ? "You" : c.authorName?.trim() || "Member"}
                        </span>
                        <span className="ml-2 text-slate-500">{formatRelativeShort(c.created_at)}</span>
                      </p>
                      <p className="break-words text-sm text-slate-200">{c.body}</p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => void like(c)}
                        aria-pressed={c.liked_by_me}
                        aria-label={c.liked_by_me ? "Unlike comment" : "Like comment"}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors cursor-pointer",
                          c.liked_by_me ? "text-rose-400 hover:text-rose-300" : "text-slate-400 hover:text-rose-300"
                        )}
                      >
                        <Heart className={cn("size-3", c.liked_by_me && "fill-current")} />
                        {c.like_count > 0 ? <span className="tabular-nums">{c.like_count}</span> : null}
                      </button>
                      {isMine ? (
                        <button
                          type="button"
                          onClick={() => void remove(c.id)}
                          className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-rose-300 cursor-pointer"
                          aria-label="Delete your comment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
