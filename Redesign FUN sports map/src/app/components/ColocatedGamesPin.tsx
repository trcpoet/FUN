import React, { useCallback, useEffect, useRef } from "react";
import type { GameRow } from "../../lib/supabase";
import { getSportIconEmoji } from "../map/gameSportIcons";
import * as MapCfg from "../map/mapConfig";
import { ColocatedGameCountdownPill } from "./GameMapCountdownPill";

/** Stagger wobble phase between emojis (matches GL icon-rotate on map). */
function sportIconWobbleDelayMs(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return Math.abs(h % MapCfg.GAME_ICON_ROTATE_PERIOD_MS);
}

type ColocatedGamesPinProps = {
  games: GameRow[];
  /** Highlight when one of these games is selected or bumped. */
  selectedGameId?: string | null;
  bumpGameId?: string | null;
  onPress: () => void;
};

/**
 * Mapbox HTML marker: circular cluster with up to two sport emojis + total count badge.
 * Click: same `htmlPinPressScale` as RandomLocationGamePin (no motion scale — avoids snap).
 */
export function ColocatedGamesPin({
  games,
  selectedGameId,
  bumpGameId,
  onPress,
}: ColocatedGamesPinProps) {
  const sportsOrdered = [...new Set(games.map((g) => (g.sport || "Other").trim() || "Other"))];
  const showIcons = sportsOrdered.slice(0, 2);
  const total = games.length;
  const active =
    games.some((g) => g.id === selectedGameId) ||
    games.some((g) => g.id === bumpGameId);

  const pulseInnerRef = useRef<HTMLSpanElement>(null);
  const bumpRafRef = useRef(0);

  const runClickBump = useCallback(() => {
    const el = pulseInnerRef.current;
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
        "group relative flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-visible rounded-full border-2 shadow-lg backdrop-blur-sm",
        active
          ? "border-cyan-300 bg-slate-900/95 ring-2 ring-cyan-400/50"
          : "border-cyan-500/60 bg-slate-950/90 hover:border-cyan-400",
      ].join(" ")}
      aria-label={`${total} games at this location`}
    >
      <span
        ref={pulseInnerRef}
        className="flex h-full w-full items-center justify-center px-1 origin-center will-change-transform"
      >
        <span className="flex h-full w-full items-center justify-center gap-0.5 transition-transform duration-200 group-hover:scale-[0.97]">
          {showIcons.map((s, idx) => {
            const seed =
              games.find((g) => (g.sport || "Other").trim() === (s || "Other").trim())?.id ?? `${s}-${idx}`;
            return (
              <span
                key={`${s}-${idx}`}
                className="game-sport-icon-wobble text-[28px] leading-none select-none"
                style={{ animationDelay: `${sportIconWobbleDelayMs(seed)}ms` }}
                aria-hidden
              >
                {getSportIconEmoji(s)}
              </span>
            );
          })}
        </span>
      </span>
      {total > 1 ? (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-[22px] h-[22px] items-center justify-center rounded-full bg-cyan-400 px-1 text-[11px] font-bold text-slate-950 shadow-md border border-slate-900/40 pointer-events-none z-[5]">
          {total}
        </span>
      ) : null}
      <ColocatedGameCountdownPill games={games} countBadgeVisible={total > 1} />
    </button>
  );
}
