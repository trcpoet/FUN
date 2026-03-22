import React from "react";
import type { GameRow } from "../../lib/supabase";
import { getSportIconEmoji } from "../map/gameSportIcons";

type ColocatedGamesPinProps = {
  games: GameRow[];
  /** Highlight when one of these games is selected or bumped. */
  selectedGameId?: string | null;
  bumpGameId?: string | null;
  onPress: () => void;
};

/**
 * Mapbox HTML marker: circular cluster with up to two sport emojis + total count badge.
 */
export function ColocatedGamesPin({ games, selectedGameId, bumpGameId, onPress }: ColocatedGamesPinProps) {
  const sportsOrdered = [...new Set(games.map((g) => (g.sport || "Other").trim() || "Other"))];
  const showIcons = sportsOrdered.slice(0, 2);
  const total = games.length;
  const active =
    games.some((g) => g.id === selectedGameId) ||
    games.some((g) => g.id === bumpGameId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      className={[
        "relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 shadow-lg backdrop-blur-sm transition-transform duration-500 ease-out",
        active
          ? "border-cyan-300 bg-slate-900/95 ring-2 ring-cyan-400/50 scale-105"
          : "border-cyan-500/60 bg-slate-950/90 hover:border-cyan-400 hover:scale-[0.96]",
      ].join(" ")}
      aria-label={`${total} games at this location`}
    >
      <span className="flex items-center justify-center gap-0.5 px-1">
        {showIcons.map((s) => (
          <span key={s} className="text-[22px] leading-none select-none" aria-hidden>
            {getSportIconEmoji(s)}
          </span>
        ))}
      </span>
      {total > 1 ? (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-[22px] h-[22px] items-center justify-center rounded-full bg-cyan-400 px-1 text-[11px] font-bold text-slate-950 shadow-md border border-slate-900/40">
          {total}
        </span>
      ) : null}
    </button>
  );
}
