import React from "react";
import { sportEmoji } from "../../lib/sportVisuals";
import { SPORT_OPTIONS } from "../../lib/sports";
import { cn } from "./ui/utils";

const PROMPT_SPORTS = ["Basketball", "Soccer", "Tennis", "Volleyball", "Pickleball"] as const;

type VenueSportPromptProps = {
  open: boolean;
  onPick: (sport: string) => void;
  onPickAll: () => void;
};

/** First-open gate when profile has no favorite sport. */
export function VenueSportPrompt({ open, onPick, onPickAll }: VenueSportPromptProps) {
  if (!open) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-x-4 top-28 z-[56] mx-auto max-w-md rounded-2xl border border-white/12 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-md"
      role="dialog"
      aria-labelledby="venue-sport-prompt-title"
    >
      <h2 id="venue-sport-prompt-title" className="text-base font-semibold text-white">
        What do you want to play?
      </h2>
      <p className="mt-1 text-sm text-slate-400">We&apos;ll show nearby courts for your sport. Games nearby stay visible.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PROMPT_SPORTS.filter((s) => (SPORT_OPTIONS as readonly string[]).includes(s)).map((sport) => (
          <button
            key={sport}
            type="button"
            onClick={() => onPick(sport)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-100",
              "hover:border-cyan-400/40 hover:bg-cyan-500/10"
            )}
          >
            <span aria-hidden>{sportEmoji(sport)}</span>
            {sport}
          </button>
        ))}
        <button
          type="button"
          onClick={onPickAll}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:border-white/30 hover:text-white"
        >
          <span aria-hidden>🌐</span>
          All sports
        </button>
      </div>
    </div>
  );
}
