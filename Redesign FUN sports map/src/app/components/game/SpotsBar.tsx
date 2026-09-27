import type { GameRow } from "../../../lib/supabase";
import { cn } from "../ui/utils";

/**
 * How full a game is, as a bar rather than as the words "1 of 4 in".
 *
 * The same fact was spelled three different ways: `SpotsBar` inline in the feed
 * card, a plain label in the suggestion shelf, and `squadCountLabel()` in
 * guestAccess.ts producing "1 of 4 in". A bar answers "can I still get in?" at a
 * glance, which is the only reason anyone reads the number.
 *
 * Substitutes are reported past the end of the roster, so "full, with three
 * people waiting" reads differently from "full".
 */
export type SpotsBarProps = {
  game: GameRow;
  /** `bar` is the default; `label` is the text line alone, for a dense row. */
  variant?: "bar" | "label";
  className?: string;
};

/** The sentence form, shared so the bar and the bare label cannot disagree. */
export function spotsLabel(game: GameRow): string {
  const total = Math.max(0, game.spots_needed ?? 0);
  const taken = Math.min(Math.max(0, game.participant_count ?? 0), total || Number.MAX_SAFE_INTEGER);
  const subs = game.substitute_count ?? 0;
  const remaining = game.spots_remaining ?? Math.max(0, total - taken);

  if (remaining > 0) return `${remaining} ${remaining === 1 ? "spot" : "spots"} left`;
  return subs > 0 ? `Full · ${subs} waiting` : "Full";
}

export function SpotsBar({ game, variant = "bar", className }: SpotsBarProps) {
  const total = Math.max(1, game.spots_needed ?? 1);
  const taken = Math.min(Math.max(0, game.participant_count ?? 0), total);
  const remaining = game.spots_remaining ?? Math.max(0, total - taken);
  const label = spotsLabel(game);

  if (variant === "label") {
    return (
      <span className={cn("text-[11px] tabular-nums text-slate-500", className)}>{label}</span>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-slate-500">
          {taken}/{total}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={taken}
        aria-label={`${taken} of ${total} spots taken`}
      >
        <div
          className={cn("h-full rounded-full", remaining > 0 ? "bg-primary" : "bg-slate-500")}
          style={{ width: `${(taken / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
