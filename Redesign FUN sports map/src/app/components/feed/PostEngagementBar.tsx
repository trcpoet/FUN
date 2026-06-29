import { useEffect, useState } from "react";
import { Heart, Loader2, MessageCircle, Send, Share2 } from "lucide-react";
import { cn } from "../ui/utils";
import {
  addPostComment,
  getPostComments,
  getPostEngagement,
  togglePostLike,
  type FeedPostComment,
} from "../../../lib/feedPosts";

function relShort(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Like + comment thread + share for a feed media post. Fetches counts on mount. */
export function PostEngagementBar(props: {
  postId: string;
  shareUrl?: string | null;
  caption?: string | null;
}) {
  const { postId, shareUrl, caption } = props;
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [busyLike, setBusyLike] = useState(false);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<FeedPostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPostEngagement(postId).then((e) => {
      if (cancelled) return;
      setLikeCount(e.likeCount);
      setCommentCount(e.commentCount);
      setLiked(e.likedByMe);
    });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const like = async () => {
    if (busyLike) return;
    setBusyLike(true);
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    const err = await togglePostLike(postId, next);
    setBusyLike(false);
    if (err) {
      setLiked(!next);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
    }
  };

  const openThread = async () => {
    const next = !open;
    setOpen(next);
    if (next && comments.length === 0) {
      setLoadingComments(true);
      const { data } = await getPostComments(postId);
      setComments(data);
      setCommentCount(data.length);
      setLoadingComments(false);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const { error } = await addPostComment(postId, body);
    setSending(false);
    if (error) return;
    setDraft("");
    setCommentCount((c) => c + 1);
    const { data } = await getPostComments(postId);
    setComments(data);
  };

  const share = async () => {
    const url = shareUrl ?? (typeof window !== "undefined" ? `${window.location.origin}/feed` : "");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "FUN", text: caption?.trim() || "Check this out on FUN", url });
      } else if (typeof navigator !== "undefined" && navigator.clipboard && url) {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 1500);
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => void like()}
          disabled={busyLike}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-bold transition-colors disabled:opacity-50",
            liked ? "text-rose-400" : "text-slate-400 hover:text-rose-300",
          )}
        >
          {busyLike ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Heart className={cn("size-4", liked && "fill-current")} />
          )}
          {likeCount > 0 ? <span className="tabular-nums">{likeCount}</span> : null}
        </button>
        <button
          type="button"
          onClick={() => void openThread()}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 transition-colors hover:text-sky-300"
        >
          <MessageCircle className="size-4" />
          {commentCount > 0 ? <span className="tabular-nums">{commentCount}</span> : null}
        </button>
        <button
          type="button"
          onClick={() => void share()}
          aria-label="Share"
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 transition-colors hover:text-emerald-300"
        >
          <Share2 className="size-4" />
          {shared ? <span>Copied</span> : null}
        </button>
      </div>

      {open ? (
        <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200">
          {loadingComments ? (
            <div className="flex items-center gap-2 px-1 py-2 text-xs text-slate-500">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : comments.length === 0 ? (
            <p className="px-1 py-2 text-xs text-slate-500">No comments yet — be the first.</p>
          ) : (
            <ul className="space-y-2.5">
              {comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2.5">
                  {c.authorAvatarUrl ? (
                    <img
                      src={c.authorAvatarUrl}
                      alt=""
                      loading="lazy"
                      className="size-7 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="size-7 shrink-0 rounded-full bg-sky-500/10" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px]">
                      <span className="font-bold text-white">{c.authorName?.trim() || "Member"}</span>
                      <span className="ml-2 text-slate-500">{relShort(c.created_at)}</span>
                    </p>
                    <p className="break-words text-sm text-slate-200">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Add a comment…"
              maxLength={2000}
              className="flex-1 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-400/40"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!draft.trim() || sending}
              aria-label="Send comment"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
