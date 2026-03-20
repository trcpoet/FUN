import type { ExperienceEntry } from "../../../lib/athleteProfile";
import { ExperienceCard } from "./ExperienceCard";
import { cn } from "../ui/utils";

type Props = {
  items: ExperienceEntry[];
  className?: string;
  /** Hide inner section title when the page already has a section heading. */
  hideHeading?: boolean;
};

export function ExperienceTimeline({ items, className, hideHeading }: Props) {
  if (!items.length) {
    return (
      <section className={cn("rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] px-4 py-6", className)}>
        {!hideHeading && (
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Athletic journey</h2>
        )}
        <p className="text-sm text-slate-500">Add teams, leagues, and roles to show your playing background.</p>
      </section>
    );
  }

  return (
    <section className={cn("space-y-4", className)}>
      {!hideHeading && (
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 px-1">Athletic journey</h2>
      )}
      <div className="space-y-4">
        {items.map((item, i) => (
          <ExperienceCard key={item.id} item={item} isLast={i === items.length - 1} />
        ))}
      </div>
    </section>
  );
}
