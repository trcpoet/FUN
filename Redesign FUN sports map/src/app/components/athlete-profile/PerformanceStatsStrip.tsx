import type { PerformanceMetricEntry } from "../../../lib/athleteProfile";
import { visibleMetrics } from "../../../lib/athleteProfile";
import { cn } from "../ui/utils";

type Props = {
  metrics: PerformanceMetricEntry[];
  primarySports: string[];
  className?: string;
};

export function PerformanceStatsStrip({ metrics, primarySports, className }: Props) {
  const visible = visibleMetrics(metrics, primarySports);

  if (visible.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-white/[0.1] bg-[#161B22]/80 px-4 py-6 text-center text-sm text-slate-500",
          className,
        )}
      >
        Add performance metrics in <span className="text-slate-400">Edit profile</span> to show your stats here.
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Mobile metrics live inside ProfileHubHero; desktop uses this horizontal strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((m) => (
          <div
            key={m.id}
            className="min-w-[7.5rem] shrink-0 rounded-xl border border-white/[0.08] bg-[#161B22] px-3 py-2.5 shadow-sm"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{m.label}</p>
            <p className="mt-1 truncate text-base font-semibold tabular-nums text-[#00F5FF]">{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
