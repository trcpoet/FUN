import type { GameRow } from "../../../lib/supabase";
import { gameStatus, type GameStatusTone } from "../../../lib/mapGameTimer";
import { cn } from "../ui/utils";

/**
 * One word for what state a game is in.
 *
 * Six surfaces hand-rolled a binary Live pill — the map popup, the venue card, the
 * feed card, the suggestion shelf, the colocated chooser and the map badge — each
 * with its own colours, and none able to say anything except "Live" or nothing.
 * A game two players short looked exactly like a full one.
 *
 * The decision lives in `gameStatus()` in mapGameTimer.ts, which is pure and
 * tested; this only paints it.
 */

const TONE_CLASS: Record<GameStatusTone, string> = {
  // Blaze Orange is reserved for live and alerts. This is the one that earns it.
  live: "bg-alert text-alert-foreground",
  // Filling up is a nudge, not an alarm — amber sits between teal and orange
  // without borrowing the meaning of either.
  filling: "bg-amber-400/20 text-amber-200",
  waitlist: "bg-amber-400/15 text-amber-200/90",
  open: "bg-primary/15 text-primary",
  full: "bg-white/[0.06] text-slate-300",
  ended: "bg-white/[0.04] text-slate-500",
};

export type GameStatusChipProps = {
  game: GameRow;
  nowMs: number;
  /** `sm` is the in-card default; `xs` is for a dense list row. */
  size?: "xs" | "sm";
  className?: string;
};

export function GameStatusChip({ game, nowMs, size = "sm", className }: GameStatusChipProps) {
  const { label, tone } = gameStatus(game, nowMs);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-bold uppercase",
        size === "xs"
          ? "px-2 py-0.5 text-[9px] tracking-[0.14em]"
          : "px-2.5 py-0.5 text-[10px] tracking-wider",
        TONE_CLASS[tone],
        className,
      )}
    >
      {tone === "live" ? (
        <span
          className="size-1.5 rounded-full bg-current motion-safe:animate-pulse"
          aria-hidden
        />
      ) : null}
      {label}
    </span>
  );
}
