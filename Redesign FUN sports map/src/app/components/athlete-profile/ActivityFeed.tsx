import type { ActivityPost } from "../../../lib/athleteProfile";
import { MessageCircle, Heart, Pin, Share2, MoreHorizontal } from "lucide-react";
import { cn } from "../ui/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";

type Props = {
  posts: ActivityPost[];
  /** Shown when no pinned post exists (e.g. availability + city). */
  pinnedFallback?: { title: string; subtitle?: string } | null;
  onAddPost?: () => void;
  className?: string;
  userMeta?: {
    displayName?: string;
    avatarUrl?: string;
  };
};

function PostChrome({ p, pinned, userMeta }: { p: ActivityPost; pinned?: boolean; userMeta?: Props["userMeta"] }) {
  return (
    <article 
      className={cn(
        "group relative overflow-hidden transition-all duration-300",
        "rounded-3xl border border-white/[0.08] bg-card/40 backdrop-blur-sm",
        "hover:border-primary/30 hover:shadow-[0_0_30px_-10px_rgba(225,29,72,0.2)]",
        pinned && "border-amber-500/30 bg-amber-500/[0.02]"
      )}
    >
      {pinned && (
        <div className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-200 bg-amber-500/10 border-b border-amber-500/10">
          <Pin className="size-3 fill-current" />
          Pinned Activity
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-9 ring-2 ring-background border border-white/10">
            <AvatarImage src={userMeta?.avatarUrl} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
              {userMeta?.displayName?.slice(0, 2).toUpperCase() || "AT"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-white leading-none">
              {userMeta?.displayName || "Athlete"}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground mt-1 uppercase tracking-wider">
              {p.timeAgo ?? "Recently"}
            </span>
          </div>
        </div>
        <button type="button" className="p-2 text-muted-foreground hover:text-white transition-colors">
          <MoreHorizontal className="size-5" />
        </button>
      </div>

      {/* Media Content */}
      <div className="relative px-4">
        <div
          className={cn(
            "relative w-full aspect-[4/5] sm:aspect-video rounded-2xl overflow-hidden",
            "bg-gradient-to-br from-slate-800/50 to-slate-950/80",
            "border border-white/[0.05]"
          )}
        >
          {p.mediaUrl?.trim() ? (
            <img 
              src={p.mediaUrl.trim()} 
              alt="" 
              className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" 
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-40">
              <div className="size-12 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                <Compass className="size-6 text-white/40" />
              </div>
              <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">No Media</span>
            </div>
          )}
          
          {p.sport && (
            <div className="absolute top-3 right-3">
              <Badge variant="secondary" className="bg-black/60 backdrop-blur-md border-white/10 text-[10px] font-bold uppercase tracking-wider py-0.5 px-2.5">
                {p.sport}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Caption & Actions */}
      <div className="p-4 pt-4 space-y-4">
        <p className="text-[15px] text-slate-200 leading-[1.6] font-medium">
          {p.caption}
        </p>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-6">
            <button 
              type="button" 
              className="group/btn inline-flex items-center gap-2 text-slate-400 hover:text-rose-500 transition-colors"
            >
              <div className="flex size-8 items-center justify-center rounded-full bg-white/[0.03] group-hover/btn:bg-rose-500/10 transition-colors">
                <Heart className="size-4 group-hover/btn:fill-rose-500 transition-all" />
              </div>
              <span className="text-xs font-bold tabular-nums tracking-tight">{p.likes ?? 0}</span>
            </button>
            
            <button 
              type="button" 
              className="group/btn inline-flex items-center gap-2 text-slate-400 hover:text-blue-500 transition-colors"
            >
              <div className="flex size-8 items-center justify-center rounded-full bg-white/[0.03] group-hover/btn:bg-blue-500/10 transition-colors">
                <MessageCircle className="size-4 transition-all" />
              </div>
              <span className="text-xs font-bold tabular-nums tracking-tight">{p.comments ?? 0}</span>
            </button>
          </div>

          <button 
            type="button" 
            className="group/btn flex size-8 items-center justify-center rounded-full bg-white/[0.03] text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            <Share2 className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function ActivityFeed({ posts, pinnedFallback, onAddPost, className, userMeta }: Props) {
  const pinned = posts.find((p) => p.pinned);
  const rest = posts.filter((p) => !p.pinned);

  const showPinnedSlot = pinned || pinnedFallback;

  return (
    <section className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between px-2">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            Activity 
            <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" />
          </h2>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Latest highlights</p>
        </div>
        {onAddPost && (
          <button 
            type="button" 
            onClick={onAddPost} 
            className="rounded-full bg-primary/10 px-4 py-1.5 text-[11px] font-bold text-primary hover:bg-primary hover:text-white transition-all active:scale-95"
          >
            NEW POST
          </button>
        )}
      </div>

      {showPinnedSlot && (
        <div className="space-y-2">
          {pinned ? (
            <PostChrome p={pinned} pinned userMeta={userMeta} />
          ) : pinnedFallback ? (
            <div className="overflow-hidden rounded-3xl border border-amber-500/30 bg-amber-500/[0.03] group transition-all hover:border-amber-500/50">
              <div className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-200 bg-amber-500/10 border-b border-amber-500/10">
                <Pin className="size-3 fill-current" />
                Featured Update
              </div>
              <div className="relative w-full aspect-[16/9] flex items-center justify-center px-8 py-10">
                <div className="text-center space-y-3">
                  <p className="text-lg font-bold text-white tracking-tight">{pinnedFallback.title}</p>
                  {pinnedFallback.subtitle && (
                    <p className="text-xs font-medium text-slate-400 leading-relaxed max-w-[200px] mx-auto">
                      {pinnedFallback.subtitle}
                    </p>
                  )}
                  <div className="pt-2">
                    <button className="text-[10px] font-bold text-amber-400 uppercase tracking-widest border border-amber-500/20 rounded-full px-4 py-1 hover:bg-amber-500/10 transition-colors">
                      Learn More
                    </button>
                  </div>
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
          className="group w-full rounded-[32px] border-2 border-dashed border-white/5 bg-white/[0.01] py-16 text-center hover:border-primary/30 hover:bg-primary/[0.02] transition-all"
        >
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-white/[0.03] mb-4 group-hover:scale-110 group-hover:bg-primary/10 transition-all">
            <PenSquare className="size-6 text-slate-500 group-hover:text-primary" />
          </div>
          <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">No activity yet</p>
          <p className="text-[11px] text-slate-500 mt-2 font-medium">Share your training, games, or availability.</p>
        </button>
      ) : (
        <ul className="grid gap-6">
          {rest.map((p) => (
            <li key={p.id}>
              <PostChrome p={p} userMeta={userMeta} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Re-export Lucide components that might be needed
import { Compass } from "lucide-react";
