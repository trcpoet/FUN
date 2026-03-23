import React, { useCallback, useEffect, useRef } from "react";
import type { GameRow } from "../../lib/supabase";
import { getSportIconEmoji } from "../map/gameSportIcons";
import * as MapCfg from "../map/mapConfig";
import { GameMapCountdownPill } from "./GameMapCountdownPill";

type Props = {
  game: GameRow;
  selectedGameId?: string | null;
  bumpGameId?: string | null;
  onPress: () => void;
};

/**
 * HTML marker for a game placed via map tap (no venue label): sport emoji only (no circle),
 * roster under the icon, urgent countdown badge on the top-right of the icon.
 *
 * Click feedback: `htmlPinPressScale` on the wrapper (slow zoom-out / return). Avoid Framer
 * `motion` scale here — it fights rAF and feels snappy.
 */
export function RandomLocationGamePin({ game, selectedGameId, bumpGameId, onPress }: Props) {
  const active = game.id === selectedGameId || game.id === bumpGameId;
  const roster = `${game.participant_count ?? 0}/${game.spots_needed}`;
  const bumpRef = useRef<HTMLSpanElement>(null);
  const bumpRafRef = useRef(0);

  const runClickBump = useCallback(() => {
    const el = bumpRef.current;
    if (!el) return;
    if (bumpRafRef.current) cancelAnimationFrame(bumpRafRef.current);
    const dur = MapCfg.GAME_ICON_HTML_BUMP_DURATION_MS;
    const start = performance.now();
    const tick = () => {
      const now = performance.now();
      const elapsed = now - start;
      if (elapsed >= dur) {
        el.style.transform = "";
        bumpRafRef.current = 0;
        return;
      }
      const s = MapCfg.htmlPinPressScale(elapsed, dur);
      el.style.transform = `scale(${s})`;
      bumpRafRef.current = requestAnimationFrame(tick);
    };
    bumpRafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => {
      if (bumpRafRef.current) cancelAnimationFrame(bumpRafRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        runClickBump();
        onPress();
      }}
      className={[
        "group relative flex min-h-[52px] min-w-[52px] shrink-0 flex-col items-center justify-center overflow-visible p-0",
        "border-0 bg-transparent shadow-none outline-none",
        "rounded-md focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
      ].join(" ")}
      aria-label={`${game.title || game.sport} game`}
    >
      <GameMapCountdownPill game={game} />
      <span
        ref={bumpRef}
        className="inline-flex flex-col items-center justify-center origin-center will-change-transform"
      >
        <span className="flex flex-col items-center justify-center gap-0.5 px-0.5 origin-center transition-transform duration-200 group-hover:scale-[0.97]">
          <span
            className={[
              "game-sport-icon-wobble text-[34px] leading-none select-none transition-[filter] duration-300 ease-out",
              active
                ? "drop-shadow-[0_0_14px_rgba(34,211,238,0.65)]"
                : "drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]",
            ].join(" ")}
            aria-hidden
          >
            {getSportIconEmoji(game.sport)}
          </span>
          <span className="pointer-events-none max-w-[52px] truncate text-center text-[8px] font-semibold tabular-nums text-slate-200/95">
            {roster}
          </span>
        </span>
      </span>
    </button>
  );
}
