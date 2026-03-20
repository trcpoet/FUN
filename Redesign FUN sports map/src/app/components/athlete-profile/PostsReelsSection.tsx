import React, { useMemo, useState } from "react";
import type { ActivityPost, HighlightEntry } from "../../../lib/athleteProfile";
import { HighlightsGrid } from "./HighlightsGrid";
import { PostGrid, PinnedProfileRibbon } from "./PostGrid";
import { cn } from "../ui/utils";

export type ProfileFeedTab = "all" | "posts" | "reels";

type Props = {
  /** Saved as `highlights` in athlete_profile — shown as Reels. */
  reels: HighlightEntry[];
  posts: ActivityPost[];
  pinnedPost: ActivityPost | null;
  onAddReel: () => void;
  onAddPost: () => void;
  className?: string;
};

function ReelCell({ cell }: { cell: HighlightEntry }) {
  const thumb = cell.thumbUrl?.trim();
  return (
    <div
      className="aspect-square relative bg-gradient-to-br from-slate-800 to-slate-950 min-h-0 group"
      style={
        thumb
          ? {
              backgroundImage: `url(${thumb})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/25 transition-colors" />
      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-[10px] font-medium text-white line-clamp-2 leading-tight">{cell.title || "Reel"}</p>
      </div>
    </div>
  );
}

function PostCell({ post }: { post: ActivityPost }) {
  const src = post.mediaUrl?.trim();
  return (
    <div className="aspect-square relative bg-slate-900 min-h-0 overflow-hidden group" title={post.caption}>
      {src ? (
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
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
      <div className="grid grid-cols-3 gap-[2px] rounded-lg overflow-hidden bg-white/[0.06]">
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
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-square bg-white/[0.02]" aria-hidden />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-[2px] rounded-lg overflow-hidden bg-white/[0.06]">
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

const TABS: { id: ProfileFeedTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "posts", label: "Posts" },
  { id: "reels", label: "Reels" },
];

export function PostsReelsSection({
  reels,
  posts,
  pinnedPost,
  onAddReel,
  onAddPost,
  className,
}: Props) {
  const [tab, setTab] = useState<ProfileFeedTab>("all");

  return (
    <section id="profile-posts-reels" className={cn("space-y-0", className)}>
      <div className="flex items-stretch border-t border-white/[0.08]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 py-3 text-[13px] font-semibold transition-colors relative",
              tab === t.id ? "text-white" : "text-slate-500 hover:text-slate-300"
            )}
          >
            {t.label}
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
