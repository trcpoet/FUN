import { motion, useReducedMotion } from "motion/react";
import { Navigation, X } from "lucide-react";

type ActiveRouteChipProps = {
  /** Pre-formatted trip summary, e.g. "12 min walk · 0.6 mi". */
  summary: string;
  /** Where the route ends — venue or game title, when known. */
  destLabel: string | null;
  /** Frame the whole route in the viewport. */
  onFit: () => void;
  /** Drop the route from the map. */
  onClear: () => void;
};

/**
 * Shown while a route is drawn on the map. A route outlives the popup that started it, so this is
 * the only affordance that clears one — and, because the venue camera sits at zoom >= 17, it also
 * doubles as the way to pull back and see the whole line.
 */
export function ActiveRouteChip({ summary, destLabel, onFit, onClear }: ActiveRouteChipProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
      className="pointer-events-auto mx-auto mb-2 flex max-w-[92vw] items-center gap-0.5 rounded-full border border-emerald-500/30 bg-[#0A0F1C]/85 p-1 shadow-[var(--shadow-control)] backdrop-blur-md"
    >
      <button
        type="button"
        onClick={onFit}
        aria-label={destLabel ? `Show the whole route to ${destLabel}` : "Show the whole route"}
        className="flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 cursor-pointer"
      >
        <Navigation className="size-4 shrink-0 text-emerald-400" aria-hidden />
        <span className="shrink-0 tabular-nums">{summary}</span>
        {destLabel ? (
          <span className="min-w-0 truncate text-slate-400">to {destLabel}</span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear route"
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 cursor-pointer"
      >
        <X className="size-4" aria-hidden />
      </button>
    </motion.div>
  );
}
