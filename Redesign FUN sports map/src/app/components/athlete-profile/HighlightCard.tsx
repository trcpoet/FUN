import type { HighlightEntry } from "../../../lib/athleteProfile";
import { cn } from "../ui/utils";

const kindLabel: Record<HighlightEntry["kind"], string> = {
  pr: "PR",
  win: "Win",
  clip: "Clip",
  tournament: "Event",
  streak: "Streak",
  training: "Training",
  other: "Highlight",
};

type Props = {
  item: HighlightEntry;
  className?: string;
};

export function HighlightCard({ item, className }: Props) {
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-transparent p-4 min-h-[112px] flex flex-col justify-between",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
          {kindLabel[item.kind]}
        </span>
        {item.date && <span className="text-[10px] text-slate-500 tabular-nums">{item.date}</span>}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-100 leading-snug">{item.title}</h4>
        {item.subtitle && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.subtitle}</p>}
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-emerald-500/5 to-transparent" />
    </article>
  );
}
