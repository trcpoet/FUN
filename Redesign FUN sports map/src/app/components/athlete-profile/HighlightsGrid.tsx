import { useEffect, useState } from "react";
import type { HighlightEntry } from "../../../lib/athleteProfile";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

const PAGE = 3;

type Props = {
  highlights: HighlightEntry[];
  onAdd?: () => void;
  className?: string;
};

export function HighlightsGrid({ highlights, onAdd, className }: Props) {
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    setVisible(PAGE);
  }, [highlights.length]);

  if (highlights.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="grid grid-cols-3 gap-[2px] rounded-lg overflow-hidden bg-white/[0.06]">
          {Array.from({ length: 9 }, (_, i) => i).map((i) => (
            <button
              key={i}
              type="button"
              onClick={onAdd}
              className="aspect-square bg-white/[0.03] flex items-center justify-center text-[10px] font-medium text-slate-500 hover:bg-white/[0.06] transition-colors p-2 text-center"
            >
              {i === 0 ? "Add reel" : ""}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const slice = highlights.slice(0, visible);
  const hasMore = highlights.length > visible;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-3 gap-[2px] rounded-lg overflow-hidden bg-white/[0.06]">
        {slice.map((cell) => {
          const thumb = cell.thumbUrl?.trim();
          const isVideo = cell.mediaKind === "video" && thumb;
          return (
            <div
              key={cell.id}
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
                <p className="text-[10px] font-medium text-white line-clamp-2 leading-tight">{cell.title || "Highlight"}</p>
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <Button
          type="button"
          variant="ghost"
          className="w-full text-sm text-emerald-400/90 hover:text-emerald-300 hover:bg-white/[0.04]"
          onClick={() => setVisible((v) => v + PAGE)}
        >
          Load more reels
        </Button>
      )}
    </div>
  );
}
