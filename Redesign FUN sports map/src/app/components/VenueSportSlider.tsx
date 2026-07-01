import React, { useMemo } from "react";
import { cn } from "./ui/utils";
import { POPULAR_SPORT_LABELS } from "../../lib/sportsCatalog";
import { sportEmoji } from "../../lib/sportVisuals";
import type { VenueSportIntent } from "../lib/venueSportIntent";

type VenueSportSliderProps = {
  value: VenueSportIntent;
  onChange: (next: VenueSportIntent) => void;
  className?: string;
};

/**
 * Crescent-style sport picker for venue loading (not game filtering).
 * `null` = All Sports.
 */
export function VenueSportSlider({ value, onChange, className }: VenueSportSliderProps) {
  const items = useMemo(() => [...POPULAR_SPORT_LABELS, null], []);

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col items-center gap-1",
        className
      )}
      role="toolbar"
      aria-label="Venue sport"
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400/90">Courts &amp; venues</p>
      <div
        className="flex max-w-[min(100vw-2rem,28rem)] items-end justify-center gap-0.5 rounded-full border border-white/10 bg-slate-950/85 px-2 py-1.5 shadow-lg backdrop-blur-md"
        style={{
          clipPath: "ellipse(120% 100% at 50% 100%)",
        }}
      >
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
                "flex min-w-[2.35rem] flex-col items-center gap-0.5 rounded-full px-1.5 py-1 transition-all",
                selected
                  ? "scale-110 bg-cyan-500/20 ring-1 ring-cyan-400/50"
                  : "opacity-75 hover:opacity-100 hover:bg-white/5"
              )}
              aria-pressed={selected}
              title={isAll ? "All sports venues" : `${sport} venues`}
            >
              <span className="text-lg leading-none select-none" aria-hidden>
                {emoji}
              </span>
              <span className="max-w-[2.5rem] truncate text-[9px] font-medium text-slate-300">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
