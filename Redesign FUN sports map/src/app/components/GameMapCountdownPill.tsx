import React, { useEffect, useState } from "react";
import type { GameRow } from "../../lib/supabase";
import {
  formatUrgentCountdown,
  getCountdownRemainingMs,
  getCountdownUrgency,
  isGameLive,
  isVenueGame,
  minCountdownAmongRandomGames,
} from "../../lib/mapGameTimer";

/** Anchored to the pin’s top-right rim (not centered above the circle). */
const posTopRight = "absolute right-0 top-0 z-20 translate-x-[28%] -translate-y-[28%]";
const posTopLeft = "absolute left-0 top-0 z-20 -translate-x-[28%] -translate-y-[28%]";

const urgentPillBase =
  "pointer-events-none select-none whitespace-nowrap rounded-md border border-orange-300/90 " +
  "bg-gradient-to-br from-red-500 via-red-600 to-orange-700 px-1 py-[3px] " +
  "text-[7px] font-black leading-none tracking-wide text-white " +
  "tabular-nums uppercase shadow-[0_0_8px_rgba(239,68,68,0.75),inset_0_1px_0_rgba(255,255,255,0.18)] " +
  "ring-1 ring-red-300/45 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]";

function countdownPillClass(ms: number): string {
  const tier = getCountdownUrgency(ms);
  if (tier === "critical") {
    return `${urgentPillBase} animate-pulse`;
  }
  if (tier === "high") {
    return `${urgentPillBase} shadow-[0_0_18px_rgba(251,146,60,0.75)]`;
  }
  return urgentPillBase;
}

function livePillClass(): string {
  return `${urgentPillBase} animate-pulse`;
}

/** Top-right badge: urgent countdown or LIVE (random-location / non-venue games). */
export function GameMapCountdownPill({ game }: { game: GameRow }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (isVenueGame(game)) return null;
  if (isGameLive(game, now)) {
    return (
      <span className={`${posTopRight} ${livePillClass()}`} aria-hidden>
        LIVE
      </span>
    );
  }
  const rem = getCountdownRemainingMs(game, now);
  if (rem == null) return null;
  return (
    <span className={`${posTopRight} ${countdownPillClass(rem)}`} aria-hidden>
      {formatUrgentCountdown(rem)}
    </span>
  );
}

/** Colocated cluster: only when the cluster includes at least one non-venue game. */
export function ColocatedGameCountdownPill({
  games,
  countBadgeVisible,
}: {
  games: GameRow[];
  countBadgeVisible: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (games.every(isVenueGame)) return null;

  const r = minCountdownAmongRandomGames(games, now);
  if (r == null) return null;

  const pos = countBadgeVisible ? posTopLeft : posTopRight;

  if (r.mode === "live") {
    return (
      <span className={`${pos} ${livePillClass()}`} aria-hidden>
        LIVE
      </span>
    );
  }
  return (
    <span className={`${pos} ${countdownPillClass(r.ms)}`} aria-hidden>
      {formatUrgentCountdown(r.ms)}
    </span>
  );
}
