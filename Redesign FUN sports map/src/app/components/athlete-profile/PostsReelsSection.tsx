import React, { useMemo, useState } from "react";
import { MessageCircle, Heart, Repeat, Share, Grid3X3, PlaySquare, Mail, UserSquare2 } from "lucide-react";
import type { ActivityPost, HighlightEntry } from "../../../lib/athleteProfile";
import { HighlightsGrid } from "./HighlightsGrid";
import { PostGrid, PinnedProfileRibbon } from "./PostGrid";
import { cn } from "../ui/utils";

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
    <div
      className="aspect-square relative bg-gradient-to-br from-slate-800 to-slate-950 min-h-0 group overflow-hidden"
      style={
        thumb && !isVideo
          ? {
              backgroundImage: `url(${thumb})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {isVideo ? (
        <video src={thumb} className="absolute inset-0 size-full object-cover" muted playsInline loop />
      ) : null}
      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/25 transition-colors" />
      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-[10px] font-medium text-white line-clamp-2 leading-tight">{cell.title || "Reel"}</p>
      </div>
    </div>
  );
}

function PostCell({ post }: { post: ActivityPost }) {
  const src = post.mediaUrl?.trim();
  const isVideo = post.mediaKind === "video";
  return (
    <div className="aspect-square relative bg-slate-900 min-h-0 overflow-hidden group" title={post.caption}>
      {src ? (
        isVideo ? (
          <video src={src} className="absolute inset-0 size-full object-cover" muted playsInline loop />
        ) : (
          <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-1 bg-gradient-to-br from-slate-800 to-slate-950">
          <span className="text-[9px] text-slate-500 text-center line-clamp-4">{post.caption || "Post"}</span>
        </div>
      )}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 flex items-end p-1">
        <span className="text-[9px] text-white line-clamp-2">{post.caption}</span>
      </div>
    </div>
  );
}

function CombinedGrid({
  reels,
  posts,
  onAddReel,
  onAddPost,
}: {
  reels: HighlightEntry[];
  posts: ActivityPost[];
  onAddReel: () => void;
  onAddPost: () => void;
}) {
  const gridPosts = posts.filter((p) => !p.pinned);
  const items = useMemo(
    () => [
      ...reels.map((r) => ({ kind: "reel" as const, reel: r })),
      ...gridPosts.map((p) => ({ kind: "post" as const, post: p })),
    ],
    [reels, gridPosts]
  );

  if (items.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-[2px] rounded-lg overflow-hidden bg-white/[0.06] md:grid-cols-3">
        <button
          type="button"
          onClick={onAddPost}
          className="aspect-square bg-white/[0.03] flex items-center justify-center text-[10px] font-medium text-slate-500 hover:bg-white/[0.06] transition-colors p-2 text-center"
        >
          Add post
        </button>
        <button
          type="button"
          onClick={onAddReel}
          className="aspect-square bg-white/[0.03] flex items-center justify-center text-[10px] font-medium text-slate-500 hover:bg-white/[0.06] transition-colors p-2 text-center"
        >
          Add reel
        </button>
        {Array.from({ length: 4 }, (_, i) => i).map((i) => (
          <div key={i} className="aspect-square bg-white/[0.02]" aria-hidden />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-[2px] rounded-lg overflow-hidden bg-white/[0.06] md:grid-cols-3">
      {items.map((it, idx) =>
        it.kind === "reel" ? (
          <ReelCell key={`reel-${it.reel.id}-${idx}`} cell={it.reel} />
        ) : (
          <PostCell key={`post-${it.post.id}-${idx}`} post={it.post} />
        )
      )}
    </div>
  );
}

const TABS: { id: ProfileFeedTab; icon: React.ReactNode }[] = [
  { id: "all", icon: <Grid3X3 className="size-6 sm:size-5" aria-label="All" /> },
  { id: "posts", icon: <Grid3X3 className="size-6 sm:size-5" aria-label="Posts" /> },
  { id: "reels", icon: <PlaySquare className="size-6 sm:size-5" aria-label="Reels" /> },
];

const HUB_TABS = [
  { id: "posts" as HubFeedTab, icon: <Grid3X3 className="size-6 sm:size-5" aria-label="Posts" /> },
  { id: "reels" as HubFeedTab, icon: <PlaySquare className="size-6 sm:size-5" aria-label="Reels" /> },
  { id: "statuses" as HubFeedTab, icon: <Mail className="size-6 sm:size-5" aria-label="Statuses" /> },
  { id: "tagged" as HubFeedTab, icon: <UserSquare2 className="size-6 sm:size-5" aria-label="Tagged" /> },
];

function StatusFeedItem({ post, userMeta }: { post: ActivityPost; userMeta?: Props["userMeta"] }) {
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-white/[0.08] last:border-0 hover:bg-white/[0.02] transition-colors relative">
      <div className="shrink-0 pt-0.5">
        <div className="size-10 rounded-full bg-[#161B22] overflow-hidden ring-1 ring-white/10">
          {userMeta?.avatarUrl ? (
            <img src={userMeta.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="size-full bg-[#161B22] flex items-center justify-center text-slate-400 font-bold text-sm">
              {userMeta?.name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
        </div>
      </div>
      
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[14px]">
          <span className="font-bold text-slate-200 truncate">{userMeta?.name || "Player"}</span>
          {userMeta?.handle && (
            <span className="text-slate-500 truncate text-[13px]">@{userMeta.handle}</span>
          )}
          <span className="text-slate-600 px-0.5">&middot;</span>
          <span className="text-slate-500 whitespace-nowrap text-[13px]">{post.timeAgo || "now"}</span>
        </div>
        
        <p className="text-[14px] text-slate-300 mt-0.5 whitespace-pre-wrap leading-snug break-words">
          {post.caption}
        </p>
        
        <div className="flex items-center justify-between max-w-sm mt-3 text-slate-500 pr-8">
          <button type="button" className="flex items-center gap-1.5 group hover:text-[#00F5FF] transition-colors" aria-label="Reply">
            <div className="p-1.5 rounded-full group-hover:bg-[#00F5FF]/10 transition-colors">
              <MessageCircle className="size-4" />
            </div>
            <span className="text-xs">{(post as any).comments || 0}</span>
          </button>
          <button type="button" className="flex items-center gap-1.5 group hover:text-emerald-500 transition-colors" aria-label="Repost">
            <div className="p-1.5 rounded-full group-hover:bg-emerald-500/10 transition-colors">
              <Repeat className="size-4" />
            </div>
          </button>
          <button type="button" className="flex items-center gap-1.5 group hover:text-rose-500 transition-colors" aria-label="Like">
            <div className="p-1.5 rounded-full group-hover:bg-rose-500/10 transition-colors">
              <Heart className="size-4" />
            </div>
            <span className="text-xs">{(post as any).likes || 0}</span>
          </button>
          <button type="button" className="flex items-center gap-1.5 group hover:text-[#00F5FF] transition-colors" aria-label="Share">
            <div className="p-1.5 rounded-full group-hover:bg-[#00F5FF]/10 transition-colors">
              <Share className="size-4" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusFeedList({ statuses, userMeta, onAdd }: { statuses: ActivityPost[]; userMeta?: Props["userMeta"]; onAdd: () => void }) {
  if (statuses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#161B22]/50 px-4 py-12 text-center text-sm text-slate-500">
        No statuses yet.
        <div className="mt-3">
          <button type="button" onClick={onAdd} className="text-[#00F5FF] hover:underline">Share an update</button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#161B22]/30 flex flex-col mb-4 overflow-hidden">
      {statuses.map((s) => (
        <StatusFeedItem key={s.id} post={s} userMeta={userMeta} />
      ))}
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
  const [tab, setTab] = useState<ProfileFeedTab>("all");
  const [hubTab, setHubTab] = useState<HubFeedTab>("posts");

  const mediaPosts = useMemo(
    () => posts.filter((p) => !p.pinned && Boolean(p.mediaUrl?.trim())),
    [posts],
  );
  const statusPosts = useMemo(
    () => posts.filter((p) => !p.pinned && !p.mediaUrl?.trim()),
    [posts],
  );

  if (variant === "hub") {
    const accent = "bg-[#00F5FF]";
    return (
      <section id="profile-posts-reels" className={cn("space-y-0", className)}>
        <div className="flex items-stretch overflow-x-auto border-t border-white/[0.08] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {HUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setHubTab(t.id)}
              className={cn(
                "flex-1 shrink-0 py-4 flex items-center justify-center transition-colors relative",
                hubTab === t.id ? "text-[#00F5FF]" : "text-slate-500 hover:text-slate-300",
              )}
            >
              {t.icon}
              {hubTab === t.id && (
                <span className={cn("absolute bottom-0 left-0 right-0 max-w-[4rem] mx-auto h-0.5 rounded-full", accent)} aria-hidden />
              )}
            </button>
          ))}
        </div>

        <div className="pt-3 space-y-2">
          {hubTab === "posts" && (
            <>
              {pinnedPost && <PinnedProfileRibbon post={pinnedPost} />}
              <PostGrid posts={mediaPosts} onAdd={onAddPost} />
            </>
          )}

          {hubTab === "reels" && (
            <HighlightsGrid highlights={reels} onAdd={onAddReel} gridClassName="rounded-xl" />
          )}

          {hubTab === "statuses" && (
            <StatusFeedList statuses={statusPosts} userMeta={userMeta} onAdd={onAddPost} />
          )}

          {hubTab === "tagged" && (
            <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#161B22]/50 px-4 py-12 text-center text-sm text-slate-500">
              When friends tag you in posts, they&apos;ll show up here.
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id="profile-posts-reels" className={cn("space-y-0", className)}>
      <div className="flex items-stretch border-t border-white/[0.08]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 py-3 flex items-center justify-center transition-colors relative", // Removed text-related classes
              tab === t.id ? "text-white" : "text-slate-500 hover:text-slate-300"
            )}
          >
            {t.icon} {/* Replaced t.label with t.icon */}
            {tab === t.id && (
              <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-white" aria-hidden />
            )}
          </button>
        ))}
      </div>

      <div className="pt-3 space-y-2">
        {tab === "all" && (
          <>
            {pinnedPost && <PinnedProfileRibbon post={pinnedPost} />}
            <CombinedGrid reels={reels} posts={posts} onAddReel={onAddReel} onAddPost={onAddPost} />
          </>
        )}

        {tab === "posts" && (
          <>
            {pinnedPost && <PinnedProfileRibbon post={pinnedPost} />}
            <PostGrid posts={posts} onAdd={onAddPost} />
          </>
        )}

        {tab === "reels" && <HighlightsGrid highlights={reels} onAdd={onAddReel} />}
      </div>
    </section>
  );
}
