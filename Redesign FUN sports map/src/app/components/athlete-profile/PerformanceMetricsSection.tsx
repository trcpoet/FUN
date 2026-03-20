import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { PerformanceMetricEntry } from "../../../lib/athleteProfile";
import { visibleMetrics } from "../../../lib/athleteProfile";
import { MetricChip } from "./MetricChip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { cn } from "../ui/utils";

type Props = {
  metrics: PerformanceMetricEntry[];
  primarySports: string[];
  className?: string;
  hideHeading?: boolean;
};

export function PerformanceMetricsSection({ metrics, primarySports, className, hideHeading }: Props) {
  const [open, setOpen] = useState(false);
  const visible = visibleMetrics(metrics, primarySports);

  if (visible.length === 0) {
    return (
      <section className={cn("rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4", className)}>
        {!hideHeading && (
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Performance</h2>
        )}
        <p className="text-sm text-slate-500">No metrics yet. Add PRs and max skills in edit — only what you want to show.</p>
      </section>
    );
  }

  const preview = visible.slice(0, 3);
  const rest = visible.slice(3);

  return (
    <section className={cn("rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4", className)}>
      {!hideHeading && (
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Performance metrics</h2>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {preview.map((m) => (
          <MetricChip key={m.id} label={m.label} value={m.value} verified={m.verified} />
        ))}
      </div>

      {rest.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
          <CollapsibleContent className="overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-white/[0.06]">
              {rest.map((m) => (
                <MetricChip key={m.id} label={m.label} value={m.value} verified={m.verified} />
              ))}
            </div>
          </CollapsibleContent>
          <CollapsibleTrigger className="flex w-full items-center justify-center gap-1 mt-3 text-xs font-medium text-emerald-400/90 hover:text-emerald-300 transition-colors">
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            {open ? "Show less" : `Show ${rest.length} more`}
          </CollapsibleTrigger>
        </Collapsible>
      )}
    </section>
  );
}
