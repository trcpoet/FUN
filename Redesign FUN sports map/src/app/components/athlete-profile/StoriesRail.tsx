import { useState } from "react";
import type { StoryEntry } from "../../../lib/athleteProfile";
import { cn } from "../ui/utils";
import { Plus, Film } from "lucide-react";
import { CreateStoryDialog } from "./CreateStoryDialog";

type Props = {
  stories: StoryEntry[];
  className?: string;
  /** Show the add ring + create flow (own profile). */
  allowCreate?: boolean;
  onCreateStory?: (story: StoryEntry) => Promise<void>;
};

export function StoriesRail({ stories, className, allowCreate, onCreateStory }: Props) {
  const [createOpen, setCreateOpen] = useState(false);

  const showEmptyHint = stories.length === 0 && !allowCreate;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Stories</span>
      </div>

      {allowCreate && onCreateStory && (
        <CreateStoryDialog open={createOpen} onOpenChange={setCreateOpen} onSave={onCreateStory} />
      )}

      {showEmptyHint ? (
        <p className="text-xs text-slate-600 px-0.5">
          Tap the + ring to create a story, or add rings with labels in settings.
        </p>
      ) : (
        <div
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {allowCreate && onCreateStory && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex flex-col items-center gap-1.5 w-[72px] shrink-0 rounded-none border-0 bg-transparent p-0 cursor-pointer"
            >
              <div className="size-[68px] rounded-full p-[2px] bg-gradient-to-br from-violet-400/70 via-fuchsia-400/50 to-white/20 ring-0">
                <div className="size-full rounded-full border-2 border-[#080c14] bg-slate-800/90 flex items-center justify-center">
                  <Plus className="size-7 text-slate-200" strokeWidth={2.5} />
                </div>
              </div>
              <span className="text-[11px] text-slate-400 font-medium truncate w-full text-center">New</span>
            </button>
          )}

          {stories.map((s) => {
            const bg = s.thumbUrl?.trim();
            const videoOnly =
              Array.isArray(s.media) &&
              s.media.length > 0 &&
              s.media.every((m) => m.type === "video");
            return (
              <div key={s.id} className="flex flex-col items-center gap-1.5 w-[72px] shrink-0">
                <div className="size-[68px] rounded-full p-[2px] bg-gradient-to-br from-emerald-400/70 via-cyan-400/50 to-white/20">
                  <div
                    className="size-full rounded-full border-2 border-[#080c14] overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center"
                    style={
                      bg
                        ? {
                            backgroundImage: `url(${bg})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : undefined
                    }
                  >
                    {!bg && videoOnly && <Film className="size-6 text-slate-400" />}
                    {!bg && !videoOnly && (
                      <span className="text-[9px] font-semibold text-slate-500 text-center px-1 line-clamp-3">
                        {s.label}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 font-medium truncate w-full text-center">{s.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
