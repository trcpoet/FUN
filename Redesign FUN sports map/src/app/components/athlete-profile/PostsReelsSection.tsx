import React, { useMemo, useState } from "react";
import { MessageCircle, Heart, Repeat, Share, Grid3X3, PlaySquare, Mail, UserSquare2, Play, Share2 } from "lucide-react";
import type { ActivityPost, HighlightEntry } from "../../../lib/athleteProfile";
import { HighlightsGrid } from "./HighlightsGrid";
import { PostGrid, PinnedProfileRibbon } from "./PostGrid";
import { cn } from "../ui/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

export type ProfileFeedTab = "all" | "posts" | "reels";

export type HubFeedTab = "posts" | "reels" | "statuses" | "tagged";

type Props = {
  /** Saved as `highlights` in athlete_profile — shown as Reels. */
  reels: HighlightEntry[];
  posts: ActivityPost[];
  pinnedPost: ActivityPost | null;
  onAddReel: () => void;
  onAddPost: () => void;
  /** Performance Hub layout: Instagram-style tabs + cyan accent. */
  variant?: "default" | "hub";
  userMeta?: { name?: string; handle?: string; avatarUrl?: string | null };
  className?: string;
};

function ReelCell({ cell }: { cell: HighlightEntry }) {
  const thumb = cell.thumbUrl?.trim();
  const isVideo = cell.mediaKind === "video" && thumb;
  return (
    <div className="group aspect-[9/16] relative bg-slate-900 rounded-3xl overflow-hidden border border-white/[0.05] transition-all hover:border-primary/30">
      {isVideo ? (
        <video src={thumb} className="absolute inset-0 size-full object-cover" muted playsInline loop />
      ) : thumb ? (
        <img src={thumb} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
      
      <div className="absolute top-3 right-3 size-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
        <Play className="size-3 text-white fill-current" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="text-[11px] font-black italic uppercase tracking-tighter text-white line-clamp-2 leading-none">
          {cell.title || "Highlight"}
        </p>
      </div>
    </div>
  );
}

function StatusFeedItem({ post, userMeta }: { post: ActivityPost; userMeta?: Props["userMeta"] }) {
  return (
    <div className="group flex gap-4 px-6 py-6 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-all">
      <div className="shrink-0">
        <Avatar className="size-11 border border-white/10 ring-2 ring-black/50">
          <AvatarImage src={userMeta?.avatarUrl ?? undefined} />
          <AvatarFallback className="bg-primary/20 text-primary font-black text-xs italic">
            {userMeta?.name?.slice(0, 2).toUpperCase() || "??"}
          </AvatarFallback>
        </Avatar>
      </div>
      
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black italic uppercase tracking-tighter text-white">
              {userMeta?.name || "Athlete"}
            </span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {post.timeAgo || "now"}
            </span>
          </div>
          <button className="text-slate-600 hover:text-white transition-colors">
            <Share2 className="size-3.5" />
          </button>
        </div>
        
        <p className="text-base font-medium text-slate-300 leading-relaxed italic">
          "{post.caption}"
        </p>
        
        <div className="flex items-center gap-8 mt-4">
          <button type="button" className="flex items-center gap-2 group/btn text-slate-500 hover:text-rose-500 transition-colors">
            <div className="p-2 rounded-xl bg-white/[0.03] group-hover/btn:bg-rose-500/10 transition-colors">
              <Heart className="size-4 group-hover/btn:fill-rose-500 transition-all" />
            </div>
            <span className="text-[11px] font-black tabular-nums">{(post as any).likes || 0}</span>
          </button>
          
          <button type="button" className="flex items-center gap-2 group/btn text-slate-500 hover:text-blue-500 transition-colors">
            <div className="p-2 rounded-xl bg-white/[0.03] group-hover/btn:bg-blue-500/10 transition-colors">
              <MessageCircle className="size-4 transition-all" />
            </div>
            <span className="text-[11px] font-black tabular-nums">{(post as any).comments || 0}</span>
          </button>

          <button type="button" className="flex items-center gap-2 group/btn text-slate-500 hover:text-emerald-500 transition-colors ml-auto">
            <div className="p-2 rounded-xl bg-white/[0.03] group-hover/btn:bg-emerald-500/10 transition-colors">
              <Repeat className="size-4 transition-all" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export function PostsReelsSection({
  reels,
  posts,
  pinnedPost,
  onAddReel,
  onAddPost,
  variant = "default",
  userMeta,
  className,
}: Props) {
  const [hubTab, setHubTab] = useState<HubFeedTab>("posts");

  const mediaPosts = useMemo(
    () => posts.filter((p) => !p.pinned && Boolean(p.mediaUrl?.trim())),
    [posts],
  );
  const statusPosts = useMemo(
    () => posts.filter((p) => !p.pinned && !p.mediaUrl?.trim()),
    [posts],
  );

  return (
    <section id="profile-posts-reels" className={cn("space-y-6", className)}>
      {/* Navigation Tabs */}
      <div className="sticky top-14 z-40 px-2 py-4 bg-[#0D1117]/80 backdrop-blur-md">
        <div className="flex items-center p-1.5 rounded-[24px] bg-white/[0.03] border border-white/5">
          {HUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setHubTab(t.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-[18px] transition-all duration-300",
                hubTab === t.id 
                  ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]" 
                  : "text-slate-500 hover:text-white hover:bg-white/[0.05]"
              )}
            >
              {React.cloneElement(t.icon as React.ReactElement, { className: "size-4" })}
              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
                {t.id}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {hubTab === "posts" && (
          <div className="space-y-6">
            {pinnedPost && (
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-orange-600 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <div className="relative">
                  <PinnedProfileRibbon post={pinnedPost} />
                </div>
              </div>
            )}
            <PostGrid posts={mediaPosts} onAdd={onAddPost} />
          </div>
        )}

        {hubTab === "reels" && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {reels.length === 0 ? (
              <button
                onClick={onAddReel}
                className="aspect-[9/16] col-span-2 md:col-span-1 rounded-3xl border-2 border-dashed border-white/5 bg-white/[0.01] flex flex-col items-center justify-center gap-3 hover:bg-white/[0.03] hover:border-primary/30 transition-all"
              >
                <div className="size-12 rounded-full bg-white/[0.03] flex items-center justify-center">
                  <PlaySquare className="size-6 text-slate-500" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Add Highlight</span>
              </button>
            ) : (
              reels.map((r, idx) => <ReelCell key={`reel-${r.id}-${idx}`} cell={r} />)
            )}
          </div>
        )}

        {hubTab === "statuses" && (
          <div className="rounded-[32px] border border-white/[0.08] bg-card/40 backdrop-blur-md overflow-hidden">
            {statusPosts.length === 0 ? (
              <div className="px-6 py-20 text-center flex flex-col items-center gap-4">
                <div className="size-16 rounded-full bg-white/[0.03] flex items-center justify-center">
                  <Mail className="size-6 text-slate-700" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">Quiet Field</p>
                  <p className="text-xs text-slate-500">No status updates yet.</p>
                  <button onClick={onAddPost} className="mt-4 text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
                    Broadcast Update
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {statusPosts.map((s) => (
                  <StatusFeedItem key={s.id} post={s} userMeta={userMeta} />
                ))}
              </div>
            )}
          </div>
        )}

        {hubTab === "tagged" && (
          <div className="rounded-[32px] border-2 border-dashed border-white/5 bg-white/[0.01] py-24 text-center">
            <div className="size-16 rounded-full bg-white/[0.03] mx-auto mb-6 flex items-center justify-center">
              <UserSquare2 className="size-8 text-slate-700" />
            </div>
            <p className="text-sm font-black italic uppercase tracking-tighter text-slate-400">Team Play Only</p>
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-2">Tagged posts appear here</p>
          </div>
        )}
      </div>
    </section>
  );
}

const HUB_TABS = [
  { id: "posts" as HubFeedTab, icon: <Grid3X3 /> },
  { id: "reels" as HubFeedTab, icon: <PlaySquare /> },
  { id: "statuses" as HubFeedTab, icon: <Mail /> },
  { id: "tagged" as HubFeedTab, icon: <UserSquare2 /> },
];
