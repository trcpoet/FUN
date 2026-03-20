import type { ActivityPost } from "../../../lib/athleteProfile";
import { Pin } from "lucide-react";
import { cn } from "../ui/utils";

export function PinnedProfileRibbon({ post }: { post?: ActivityPost | null }) {
  if (!post) return null;
  const src = post.mediaUrl?.trim();
  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-amber-500/25">
      <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-amber-200/90 bg-amber-500/10 border-b border-amber-500/15">
        <Pin className="size-3" />
        Pinned
      </div>
      <div className="relative aspect-[16/9] max-h-48 bg-slate-900">
        {src ? (
          post.mediaKind === "video" ? (
            <video src={src} className="absolute inset-0 size-full object-cover" muted playsInline controls />
          ) : (
            <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <p className="text-sm text-slate-200 text-center">{post.caption}</p>
          </div>
        )}
      </div>
      {src && post.caption && <p className="px-3 py-2 text-xs text-slate-400 line-clamp-2">{post.caption}</p>}
    </div>
  );
}

type Props = {
  posts: ActivityPost[];
  onAdd?: () => void;
  className?: string;
};

export function PostGrid({ posts, onAdd, className }: Props) {
  const gridPosts = posts.filter((p) => !p.pinned);

  if (gridPosts.length === 0) {
    return (
      <div className={cn("grid grid-cols-3 gap-[2px]", className)}>
        {Array.from({ length: 9 }, (_, i) => i).map((i) => (
          <button
            key={i}
            type="button"
            onClick={onAdd}
            className="aspect-square bg-white/[0.03] flex items-center justify-center text-[10px] text-slate-500 hover:bg-white/[0.06]"
          >
            {i === 0 ? "Add post" : ""}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-3 gap-[2px]", className)}>
      {gridPosts.map((p) => {
        const src = p.mediaUrl?.trim();
        const isVideo = p.mediaKind === "video";
        return (
          <div
            key={p.id}
            className="aspect-square relative bg-slate-900 min-h-0 overflow-hidden group"
            title={p.caption}
          >
            {src ? (
              isVideo ? (
                <video
                  src={src}
                  className="absolute inset-0 size-full object-cover"
                  muted
                  playsInline
                  loop
                />
              ) : (
                <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-1 bg-gradient-to-br from-slate-800 to-slate-950">
                <span className="text-[9px] text-slate-500 text-center line-clamp-4">{p.caption || "Post"}</span>
              </div>
            )}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 flex items-end p-1">
              <span className="text-[9px] text-white line-clamp-2">{p.caption}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
