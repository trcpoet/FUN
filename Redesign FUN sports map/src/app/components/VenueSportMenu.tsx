import React, { useMemo, useState } from "react";
import { MapPinned, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "./ui/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { POPULAR_SPORT_LABELS } from "../../lib/sportsCatalog";
import { getSportsForPicker, filterSportsByQuery } from "../../lib/sportDisplay";
import { sportEmoji } from "../../lib/sportVisuals";
import type { VenueSportIntent } from "../lib/venueSportIntent";

const TRIGGER_BTN =
  "relative w-10 h-10 rounded-full shrink-0 flex items-center justify-center transition-all duration-200 " +
  "border border-white/20 bg-gradient-to-b from-white/[0.2] to-white/[0.04] " +
  "backdrop-blur-2xl backdrop-saturate-150 text-slate-200 " +
  "hover:text-cyan-300 hover:border-cyan-400/45 hover:from-cyan-500/18 hover:to-white/[0.08] " +
  "active:scale-95";

/** Selected-state paint, shared by the grid tiles and the expanded rows. */
const SELECTED = "bg-cyan-500/20 ring-1 ring-cyan-400/50";

/** Built once — the catalog is static. */
const ALL_SPORTS = getSportsForPicker();

type VenueSportMenuProps = {
  value: VenueSportIntent;
  onChange: (next: VenueSportIntent) => void;
  className?: string;
};

/**
 * Courts/venues sport picker — right-rail dropdown.
 *
 * Two views. The default grid is the ten popular sports plus All, which covers the overwhelming
 * majority of filtering: tennis, basketball, baseball and soccer alone account for ~21,600 of the
 * visible venues. "More sports" opens the full catalog with a search box, so the long tail
 * (softball, skateboarding, equestrian…) is reachable — it previously was not selectable at all,
 * even though those venues are in the database.
 *
 * Search reuses `filterSportsByQuery`/`getSportsForPicker`, the same helpers CreateGameModal's
 * picker uses, so "type to narrow" behaves identically in both places.
 */
export function VenueSportMenu({ value, onChange, className }: VenueSportMenuProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");

  const items = useMemo(() => [...POPULAR_SPORT_LABELS, null], []);
  const results = useMemo(() => filterSportsByQuery(ALL_SPORTS, query), [query]);

  const triggerEmoji = value === null ? "🌐" : sportEmoji(value);
  const triggerLabel = value === null ? "All venues" : `${value} venues`;

  /** The fast path is always what opens, so reset the expanded view on close. */
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setExpanded(false);
      setQuery("");
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
        className={cn(
          // z-[60] beats the guest "Games are hidden" banner (z-[54] in App.tsx). The collapsed
          // grid is short enough to sit clear of it, but the expanded list is ~400px tall and
          // ran straight underneath, which made the options unreadable while signed out. A
          // popover the user just opened should win over a passive banner.
          "z-[60] border border-border/80 bg-popover/95 text-popover-foreground backdrop-blur-xl p-3",
          expanded ? "w-[min(20rem,calc(100vw-2rem))]" : "w-[min(16rem,calc(100vw-2rem))]"
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          {expanded ? (
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setQuery("");
              }}
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground cursor-pointer"
              aria-label="Back to popular sports"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              All sports
            </button>
          ) : (
            <>
              <MapPinned className="size-3.5 text-cyan-400" aria-hidden />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Courts &amp; venues
              </p>
            </>
          )}
        </div>

        {expanded ? (
          <>
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sports…"
                aria-label="Search sports"
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-2 text-sm text-white placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400/50"
              />
            </div>
            <div
              className="max-h-[240px] space-y-0.5 overflow-y-auto rounded-lg"
              role="listbox"
              aria-label="Sport options"
            >
              {/* All stays reachable from the expanded view — it is the way back to an unfiltered map. */}
              <button
                type="button"
                role="option"
                aria-selected={value === null}
                onClick={() => onChange(null)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                  value === null ? SELECTED : "text-slate-300 hover:bg-white/5"
                )}
              >
                <span className="shrink-0 text-base leading-none" aria-hidden>
                  🌐
                </span>
                <span className="min-w-0 truncate font-medium">All venues</span>
              </button>

              {results.map((choice) => {
                const selected = value === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onChange(choice.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                      selected ? SELECTED : "text-slate-300 hover:bg-white/5"
                    )}
                    title={`${choice.label} venues`}
                  >
                    <span className="shrink-0 text-base leading-none" aria-hidden>
                      {sportEmoji(choice.id)}
                    </span>
                    <span className="min-w-0 truncate font-medium">{choice.label}</span>
                  </button>
                );
              })}

              {results.length === 0 ? (
                <p className="py-3 text-center text-xs text-slate-500">No sports match “{query}”</p>
              ) : null}
            </div>
          </>
        ) : (
          <>
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
                      selected ? SELECTED : "hover:bg-white/5"
                    )}
                    aria-pressed={selected}
                    title={isAll ? "All sports venues" : `${sport} venues`}
                  >
                    <span className="text-base leading-none select-none" aria-hidden>
                      {emoji}
                    </span>
                    <span className="max-w-full truncate text-[9px] font-medium text-slate-300">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/*
              The escape hatch from ten sports to fifty-seven. Shows the current selection when it
              is not one of the popular ten, so a filter set from here is never invisible after the
              menu collapses back to the grid.
            */}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.07] cursor-pointer"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Search className="size-3.5 shrink-0 text-cyan-400" aria-hidden />
                <span className="truncate text-xs font-medium text-slate-300">More sports</span>
              </span>
              {value !== null && !POPULAR_SPORT_LABELS.includes(value) ? (
                <span className="flex min-w-0 items-center gap-1 text-[10px] font-medium text-cyan-300">
                  <span aria-hidden>{sportEmoji(value)}</span>
                  <span className="truncate">{value}</span>
                </span>
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              )}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
