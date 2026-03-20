import type { HighlightEntry } from "../../../lib/athleteProfile";
import { cn } from "../ui/utils";

const TARGET = 9;

type Props = {
  highlights: HighlightEntry[];
  onAdd?: () => void;
  className?: string;
};

export function ProfileMediaGrid({ highlights, onAdd, className }: Props) {
  const cells: (HighlightEntry | "empty")[] = [...highlights];
  while (cells.length < TARGET) cells.push("empty");

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-3 gap-[2px] rounded-lg overflow-hidden bg-white/[0.06]">
        {cells.slice(0, TARGET).map((cell, i) => {
          if (cell === "empty") {
            return (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={onAdd}
                className="aspect-square bg-white/[0.03] flex flex-col items-center justify-center gap-1 text-center p-1 hover:bg-white/[0.06] transition-colors min-h-0"
              >
                <span className="text-[10px] font-medium text-slate-500 leading-tight px-1">Add highlight</span>
              </button>
            );
          }
          const thumb = cell.thumbUrl;
          return (
            <div
              key={cell.id}
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
                <p className="text-[10px] font-medium text-white line-clamp-2 leading-tight">{cell.title || "Highlight"}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
