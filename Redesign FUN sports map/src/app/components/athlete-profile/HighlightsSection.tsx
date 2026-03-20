import type { HighlightEntry } from "../../../lib/athleteProfile";
import { HighlightCard } from "./HighlightCard";
import { cn } from "../ui/utils";

type Props = {
  items: HighlightEntry[];
  className?: string;
};

export function HighlightsSection({ items, className }: Props) {
  if (!items.length) {
    return (
      <section className={cn("rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] px-4 py-6", className)}>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Highlights</h2>
        <p className="text-sm text-slate-500">PRs, wins, streaks, and milestones appear here — your sports portfolio.</p>
      </section>
    );
  }

  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 px-1">Highlights</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <HighlightCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
