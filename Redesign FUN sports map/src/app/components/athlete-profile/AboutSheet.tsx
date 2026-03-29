import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../ui/utils";
import type { PerformanceMetricEntry } from "../../../lib/athleteProfile";
import { visibleMetrics } from "../../../lib/athleteProfile";
import { Zap } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "bottom" | "right";
  wide?: boolean;
  children: React.ReactNode;
  className?: string;
  performanceMetrics?: PerformanceMetricEntry[];
  primarySports?: string[];
};

export function AboutSheet({
  open,
  onOpenChange,
  side = "right",
  wide,
  children,
  className,
  performanceMetrics = [],
  primarySports = [],
}: Props) {
  const visibleMetricList = visibleMetrics(performanceMetrics, primarySports);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          "border-white/10 bg-[#080c14] text-white p-0 flex flex-col gap-0 min-h-0 max-h-[100dvh] overflow-hidden",
          side === "right" && cn("w-full sm:max-w-md", wide && "md:max-w-lg lg:max-w-xl"),
          side === "bottom" && "h-[88vh] max-h-[720px] rounded-t-2xl",
          className,
        )}
      >
        <SheetHeader className="shrink-0 border-b border-white/10 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] pr-12 text-left">
          <SheetTitle className="text-lg">About</SheetTitle>
          <SheetDescription className="text-slate-500">
            Location, school, games you&apos;ve played, and your journey.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea
          className={cn(
            "min-h-0 flex-1",
            side === "bottom" ? "h-[calc(88vh-5.5rem)]" : "",
          )}
        >
          <div className="space-y-8 px-4 py-4 pb-10">
            {/* Performance Metrics Section */}
            {visibleMetricList.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Highlights</h3>
                <div className="flex flex-wrap gap-2">
                  {visibleMetricList.map((m) => (
                    <div key={m.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white/[0.03] border border-white/5">
                      <Zap className="size-3 text-primary fill-current" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{m.label}</span>
                      <span className="text-xs font-black text-white">{m.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {children}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
