import React, { useCallback, useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import type { GameRow, MapNoteRow } from "../../lib/supabase";
import { isGameLive } from "../../lib/mapGameTimer";
import { getSportIconEmoji } from "../map/gameSportIcons";
import * as MapCfg from "../map/mapConfig";
import { leadGameForPin, summarizeVenueActivity } from "../lib/venueActivity";
import { GameMapCountdownPill } from "./GameMapCountdownPill";

/** Stagger wobble phase between emojis (matches GL icon-rotate on map). */
function sportIconWobbleDelayMs(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return Math.abs(h % MapCfg.GAME_ICON_ROTATE_PERIOD_MS);
}

type VenueActivityPinProps = {
  venueName: string;
  /** Emoji for the venue itself (🎾, 🏟️…) — the pin's stable identity. */
  venueEmoji: string;
  /** Games absorbed by this venue (they have no pin of their own). */
  games: GameRow[];
  /** Notes absorbed by this venue (they have never had a pin). */
  notes: MapNoteRow[];
  selected?: boolean;
  onPress: () => void;
};

/**
 * The composite venue pin: one marker standing for a venue plus everything sitting on top of
 * it.
 *
 * A game created from a venue card inherits that venue's exact centre, so its GL sport icon
 * landed pixel-on-pixel over the venue's own icon and — because the game layer paints last and
 * `onVenuePointClick` bails whenever a game hit-tests — made the venue invisible *and*
 * unclickable. On a tennis court both glyphs are 🎾, so there was nothing on screen to even
 * suggest a venue was under there.
 *
 * This pin is the fix. It is a DOM marker on purpose: DOM always paints above every GL layer,
 * and a React `onClick` with `stopPropagation()` never reaches Mapbox, so neither the paint
 * order nor the hit-test guard can take the venue away again.
 *
 * Colour carries meaning, matching the venue card and the rest of the app: **cyan = notes,
 * violet = games, orange = live**.
 */
export function VenueActivityPin({
  venueName,
  venueEmoji,
  games,
  notes,
  selected = false,
  onPress,
}: VenueActivityPinProps) {
  const reduceMotion = useReducedMotion();
  const pulseInnerRef = useRef<HTMLSpanElement>(null);
  const bumpRafRef = useRef(0);

  const gameCount = games.length;
  const noteCount = notes.length;
  const now = Date.now();
  const lead = leadGameForPin(games, now);
  const anyLive = games.some((g) => isGameLive(g, now));

  // Only worth showing a second glyph when the game isn't the sport the venue already is —
  // a tennis game on a tennis court would just be the same emoji twice.
  const leadEmoji = lead ? getSportIconEmoji(lead.sport) : null;
  const secondaryEmoji = leadEmoji && leadEmoji !== venueEmoji ? leadEmoji : null;

  const runClickBump = useCallback(() => {
    const el = pulseInnerRef.current;
    if (!el) return;
    if (bumpRafRef.current) cancelAnimationFrame(bumpRafRef.current);
    const dur = MapCfg.GAME_ICON_HTML_BUMP_DURATION_MS;
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= dur) {
        el.style.transform = "";
        bumpRafRef.current = 0;
        return;
      }
      el.style.transform = `scale(${MapCfg.htmlPinPressScale(elapsed, dur)})`;
      bumpRafRef.current = requestAnimationFrame(tick);
    };
    bumpRafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => {
      if (bumpRafRef.current) cancelAnimationFrame(bumpRafRef.current);
    };
  }, []);

  const summary = summarizeVenueActivity(gameCount, noteCount);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        runClickBump();
        onPress();
      }}
      style={{
        height: MapCfg.VENUE_ACTIVITY_PIN_SIZE_PX,
        width: MapCfg.VENUE_ACTIVITY_PIN_SIZE_PX,
      }}
      className={[
        "group relative flex shrink-0 cursor-pointer items-center justify-center overflow-visible",
        "rounded-full border-2 shadow-lg backdrop-blur-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
        selected
          ? "border-cyan-300 bg-slate-900/95 ring-2 ring-cyan-400/50"
          : "border-cyan-500/60 bg-slate-950/90 hover:border-cyan-400",
      ].join(" ")}
      aria-label={summary ? `${venueName} — ${summary}` : venueName}
    >
      <span
        ref={pulseInnerRef}
        className="flex h-full w-full origin-center items-center justify-center px-1 will-change-transform"
      >
        <span className="flex h-full w-full items-center justify-center gap-0.5 transition-transform duration-200 group-hover:scale-[0.97]">
          <span
            className="game-sport-icon-wobble select-none text-[28px] leading-none"
            style={{ animationDelay: `${sportIconWobbleDelayMs(venueName)}ms` }}
            aria-hidden
          >
            {venueEmoji}
          </span>
          {secondaryEmoji ? (
            <span
              className="game-sport-icon-wobble select-none text-[18px] leading-none"
              style={{ animationDelay: `${sportIconWobbleDelayMs(lead?.id ?? venueName)}ms` }}
              aria-hidden
            >
              {secondaryEmoji}
            </span>
          ) : null}
        </span>
      </span>

      {/* Notes — top-right. Deliberately the same corner and cyan as the GL `venue-note-badge`
          it stands in for, so a venue picking up its first game doesn't appear to move it. */}
      {noteCount > 0 ? (
        <span
          className="pointer-events-none absolute -right-0.5 -top-0.5 z-[5] flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-slate-900/40 bg-cyan-400 px-1 text-[11px] font-bold text-slate-950 shadow-md"
          aria-hidden
        >
          {noteCount}
        </span>
      ) : null}

      {/* Games — bottom-right, violet like the card's Games tab; orange once something is
          actually under way, matching the live tone used by the strip and countdown pills. */}
      {gameCount > 0 ? (
        <span
          className={[
            "pointer-events-none absolute -bottom-0.5 -right-0.5 z-[5] flex h-[22px] min-w-[22px]",
            "items-center justify-center rounded-full border border-slate-900/40 px-1",
            "text-[11px] font-bold shadow-md",
            anyLive
              ? "bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.75)]"
              : "bg-violet-500 text-white",
            anyLive && !reduceMotion ? "animate-pulse" : "",
          ].join(" ")}
          aria-hidden
        >
          {gameCount}
        </span>
      ) : null}

      {/* Countdown / LIVE — top-left, because the note badge owns top-right. */}
      {lead ? <GameMapCountdownPill game={lead} corner="top-left" /> : null}

      {/* Roster, only when there is exactly one game — with more than one the numbers would be
          ambiguous, and the card lists them properly anyway. */}
      {gameCount === 1 && lead ? (
        <span
          className="pointer-events-none absolute -bottom-[18px] left-1/2 -translate-x-1/2 select-none whitespace-nowrap text-[11px] font-semibold tabular-nums text-slate-200 drop-shadow-[0_1px_2px_rgba(2,6,23,0.95)]"
          aria-hidden
        >
          {lead.participant_count ?? 0}/{lead.spots_needed}
        </span>
      ) : null}
    </button>
  );
}
