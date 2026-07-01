import React, { useMemo } from "react";
import { MapPinned } from "lucide-react";
import { cn } from "./ui/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { POPULAR_SPORT_LABELS } from "../../lib/sportsCatalog";
import { sportEmoji } from "../../lib/sportVisuals";
import type { VenueSportIntent } from "../lib/venueSportIntent";

const TRIGGER_BTN =
  "relative w-10 h-10 rounded-full shrink-0 flex items-center justify-center transition-all duration-200 " +
  "border border-white/20 bg-gradient-to-b from-white/[0.2] to-white/[0.04] " +
  "backdrop-blur-2xl backdrop-saturate-150 text-slate-200 " +
  "hover:text-cyan-300 hover:border-cyan-400/45 hover:from-cyan-500/18 hover:to-white/[0.08] " +
  "active:scale-95";

type VenueSportMenuProps = {
  value: VenueSportIntent;
  onChange: (next: VenueSportIntent) => void;
  className?: string;
};

/** Compact courts/venues sport picker — right-rail dropdown (replaces center slider). */
export function VenueSportMenu({ value, onChange, className }: VenueSportMenuProps) {
  const items = useMemo(() => [...POPULAR_SPORT_LABELS, null], []);

  const triggerEmoji = value === null ? "🌐" : sportEmoji(value);
  const triggerLabel = value === null ? "All venues" : `${value} venues`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(TRIGGER_BTN, className)}
          aria-label={`Courts and venues: ${triggerLabel}`}
          title={triggerLabel}
        >
          <span className="text-lg leading-none select-none" aria-hidden>
            {triggerEmoji}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="left"
        className="w-[min(16rem,calc(100vw-2rem))] border border-border/80 bg-popover/95 text-popover-foreground backdrop-blur-xl p-3"
      >
        <div className="mb-2 flex items-center gap-2">
          <MapPinned className="size-3.5 text-cyan-400" aria-hidden />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Courts &amp; venues
          </p>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {items.map((sport) => {
            const isAll = sport === null;
            const selected = isAll ? value === null : value === sport;
            const label = isAll ? "All" : sport!;
            const emoji = isAll ? "🌐" : sportEmoji(sport!);
            return (
              <button
                key={isAll ? "__all__" : sport}
                type="button"
                onClick={() => onChange(isAll ? null : sport)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-center transition-all",
                  selected
                    ? "bg-cyan-500/20 ring-1 ring-cyan-400/50"
                    : "hover:bg-white/5"
                )}
                aria-pressed={selected}
                title={isAll ? "All sports venues" : `${sport} venues`}
              >
                <span className="text-base leading-none select-none" aria-hidden>
                  {emoji}
                </span>
                <span className="max-w-full truncate text-[9px] font-medium text-slate-300">{label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
