import type { HighlightEntry, HighlightKind } from "../../../lib/athleteProfile";
import { cn } from "../ui/utils";

type StoryDef = { kind: HighlightKind | "all"; label: string };

const RAIL_DEFS: StoryDef[] = [
  { kind: "pr", label: "PRs" },
  { kind: "training", label: "Training" },
  { kind: "win", label: "Wins" },
  { kind: "clip", label: "Clips" },
  { kind: "all", label: "All" },
];

type Props = {
  highlights: HighlightEntry[];
  onSelect?: (kind: HighlightKind | "all") => void;
  className?: string;
};

export function HighlightsStoryRail({ highlights, onSelect, className }: Props) {
  const countFor = (kind: HighlightKind | "all") => {
    if (kind === "all") return highlights.length;
    return highlights.filter((h) => h.kind === kind).length;
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Stories</span>
      </div>
      <div
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 snap-x"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {RAIL_DEFS.map((def) => {
          const n = countFor(def.kind);
          const sample = def.kind === "all" ? highlights[0] : highlights.find((h) => h.kind === def.kind);
          const ringBg = sample?.thumbUrl ? `url(${sample.thumbUrl})` : undefined;
          return (
            <button
              key={`${def.kind}-${def.label}`}
              type="button"
              onClick={() => {
                onSelect?.(def.kind);
                document.getElementById("profile-posts-reels")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="snap-start shrink-0 flex flex-col items-center gap-1.5 w-[72px]"
            >
              <div
                className={cn(
                  "size-[68px] rounded-full p-[2px] bg-gradient-to-br from-emerald-400/70 via-cyan-400/50 to-white/20",
                  n === 0 && "opacity-60",
                )}
              >
                <div
                  className="size-full rounded-full border-2 border-[#080c14] overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center"
                  style={
                    ringBg
                      ? { backgroundImage: ringBg, backgroundSize: "cover", backgroundPosition: "center" }
                      : undefined
                  }
                >
                  {!ringBg && <span className="text-[10px] font-bold text-slate-500">{n}</span>}
                </div>
              </div>
              <span className="text-[11px] text-slate-400 font-medium truncate w-full text-center">{def.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
