import type { ActivityPost } from "../../../lib/athleteProfile";
import { MessageCircle, Heart, Pin } from "lucide-react";
import { cn } from "../ui/utils";

type Props = {
  posts: ActivityPost[];
  /** Shown when no pinned post exists (e.g. availability + city). */
  pinnedFallback?: { title: string; subtitle?: string } | null;
  onAddPost?: () => void;
  className?: string;
};

function PostChrome({ p, pinned }: { p: ActivityPost; pinned?: boolean }) {
  return (
    <article className={cn("overflow-hidden", pinned && "ring-1 ring-amber-500/25 rounded-2xl")}>
      {pinned && (
        <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-amber-200/90 bg-amber-500/10 border-b border-amber-500/15">
          <Pin className="size-3.5" />
          Pinned
        </div>
      )}
      <div className="bg-white/[0.02]">
        <div
          className={cn(
            "relative w-full aspect-[4/5] max-h-[420px] sm:aspect-video sm:max-h-none bg-gradient-to-br from-slate-800/80 to-slate-950",
          )}
        >
          {p.mediaUrl?.trim() ? (
            <img src={p.mediaUrl.trim()} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-slate-600 font-medium">Add media in edit</span>
            </div>
          )}
        </div>
        <div className="px-3 py-3 space-y-2 border-t border-white/[0.06]">
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>{p.timeAgo ?? "Recently"}</span>
            {p.sport && (
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-slate-400">{p.sport}</span>
            )}
          </div>
          <p className="text-sm text-slate-100 leading-relaxed">{p.caption}</p>
          <div className="flex items-center gap-5 text-xs text-slate-500 pt-0.5">
            <button type="button" className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors">
              <Heart className="size-4 opacity-80" />
              <span className="tabular-nums">{p.likes ?? 0}</span>
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 hover:text-slate-300 transition-colors">
              <MessageCircle className="size-4 opacity-80" />
              <span className="tabular-nums">{p.comments ?? 0}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ActivityFeed({ posts, pinnedFallback, onAddPost, className }: Props) {
  const pinned = posts.find((p) => p.pinned);
  const rest = posts.filter((p) => !p.pinned);

  const showPinnedSlot = pinned || pinnedFallback;

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-white tracking-tight">Posts</h2>
        {onAddPost && (
          <button type="button" onClick={onAddPost} className="text-xs font-medium text-emerald-400/90 hover:text-emerald-300">
            Add in edit
          </button>
        )}
      </div>

      {showPinnedSlot && (
        <div className="space-y-1">
          {pinned ? (
            <PostChrome p={pinned} pinned />
          ) : pinnedFallback ? (
            <div className="overflow-hidden ring-1 ring-amber-500/25 rounded-2xl">
              <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-amber-200/90 bg-amber-500/10 border-b border-amber-500/15">
                <Pin className="size-3.5" />
                Pinned
              </div>
              <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-emerald-900/30 to-cyan-950/40 flex items-center justify-center px-6">
                <div className="text-center space-y-1">
                  <p className="text-base font-semibold text-white">{pinnedFallback.title}</p>
                  {pinnedFallback.subtitle && <p className="text-sm text-slate-400">{pinnedFallback.subtitle}</p>}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {rest.length === 0 && !showPinnedSlot ? (
        <button
          type="button"
          onClick={onAddPost}
          className="w-full rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center"
        >
          <p className="text-sm text-slate-500">No posts yet</p>
          <p className="text-xs text-slate-600 mt-1">Share training, games, or availability.</p>
        </button>
      ) : (
        <ul className="space-y-4">
          {rest.map((p) => (
            <li key={p.id}>
              <PostChrome p={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
