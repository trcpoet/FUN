import type { GameRow } from "../../../lib/supabase";
import { formatUrgentCountdown, isGameEnded, isGameLive } from "../../../lib/mapGameTimer";
import { cn } from "../ui/utils";

/**
 * When the game starts, as the loudest thing on the card.
 *
 * It is the one fact that decides whether a person can go, and every surface was
 * either burying it in `text-xs text-slate-400` (the map popup, which also showed
 * an absolute wall-clock date rather than a countdown) or reimplementing this
 * logic — the feed card and the suggestion shelf had near-identical copies that
 * had already drifted on wording ("Starts in 2h" vs "in 2h").
 *
 * The caller supplies `nowMs`, so the countdown only ticks as often as that
 * caller's clock does. Pair it with `useSharedNow`.
 */
export type GameHeadlineProps = {
  game: GameRow;
  nowMs: number;
  /** `full` says "Starts in 2h 14m"; `short` says "in 2h 14m" for a dense card. */
  variant?: "full" | "short";
  className?: string;
};

/** The words alone, so a caller that needs a string rather than an element agrees. */
export function gameHeadlineText(
  game: GameRow,
  nowMs: number,
  variant: "full" | "short" = "full",
): string {
  if (isGameEnded(game, nowMs)) return "Ended";
  if (isGameLive(game, nowMs)) return "Playing now";

  const startMs = game.starts_at ? Date.parse(game.starts_at) : Number.NaN;
  if (Number.isNaN(startMs)) return "Any time";
  if (startMs <= nowMs) return "Starting now";

  const countdown = formatUrgentCountdown(startMs - nowMs);
  return variant === "short" ? `in ${countdown}` : `Starts in ${countdown}`;
}

export function GameHeadline({ game, nowMs, variant = "full", className }: GameHeadlineProps) {
  const ended = isGameEnded(game, nowMs);
  const live = isGameLive(game, nowMs);

  return (
    <p
      className={cn(
        "font-bold tabular-nums",
        variant === "full" ? "text-[15px]" : "text-[15px]",
        ended ? "text-slate-500" : live ? "text-alert" : "text-white",
        className,
      )}
    >
      {gameHeadlineText(game, nowMs, variant)}
    </p>
  );
}
