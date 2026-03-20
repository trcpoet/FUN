import type { ExperienceEntry } from "../../../lib/athleteProfile";
import { cn } from "../ui/utils";

type Props = {
  item: ExperienceEntry;
  isLast?: boolean;
  className?: string;
};

export function ExperienceCard({ item, isLast, className }: Props) {
  return (
    <div className={cn("relative pl-6", className)}>
      {!isLast && (
        <div
          className="absolute left-[7px] top-8 bottom-0 w-px bg-gradient-to-b from-white/15 to-transparent"
          aria-hidden
        />
      )}
      <div
        className="absolute left-0 top-2 size-3.5 rounded-full border-2 border-emerald-500/40 bg-[#0A0F1C] shadow-[0_0_10px_rgba(52,211,153,0.2)]"
        aria-hidden
      />
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <p className="text-sm font-semibold text-slate-100">{item.organization}</p>
        <p className="text-xs text-emerald-400/90 mt-0.5">
          {item.role}
          {item.dateRange ? ` · ${item.dateRange}` : ""}
        </p>
        {item.detail && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{item.detail}</p>}
      </div>
    </div>
  );
}
