import { useCallback, useEffect, useRef } from "react";
import { StickyNote } from "lucide-react";
import type { MapNoteRow } from "../../lib/supabase";
import * as MapCfg from "../map/mapConfig";

type NoteClusterPinProps = {
  notes: MapNoteRow[];
  onPress: () => void;
};

/**
 * Mapbox HTML marker for several notes sharing one coordinate.
 *
 * Reads as a stack of paper rather than a disc: single notes are squarish cyan chips
 * (`.fun-note-marker`), games are circles, so the silhouette alone says which is which
 * before the count badge is legible. Uses the same `htmlPinPressScale` press feedback as
 * ColocatedGamesPin so every clustered pin on the map responds identically.
 */
export function NoteClusterPin({ notes, onPress }: NoteClusterPinProps) {
  const total = notes.length;
  const pressRef = useRef<HTMLSpanElement>(null);
  const bumpRafRef = useRef(0);

  const runClickBump = useCallback(() => {
    const el = pressRef.current;
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

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        runClickBump();
        onPress();
      }}
      className="group relative flex h-[48px] w-[48px] shrink-0 items-center justify-center overflow-visible"
      aria-label={`${total} notes at this spot`}
    >
      <span
        ref={pressRef}
        className="relative flex h-full w-full items-center justify-center origin-center will-change-transform"
      >
        {/* Back cards, peeking out to read as a stack. */}
        <span
          className="absolute h-[30px] w-[30px] rounded-[10px] border border-cyan-400/25 bg-cyan-400/[0.07] rotate-[-8deg] translate-x-[3px] translate-y-[3px]"
          aria-hidden
        />
        <span
          className="absolute h-[30px] w-[30px] rounded-[10px] border border-cyan-400/35 bg-cyan-400/10 rotate-[5deg] -translate-x-[2px] -translate-y-[1px]"
          aria-hidden
        />
        {/* Front card carries the icon. */}
        <span
          className="relative flex h-[32px] w-[32px] items-center justify-center rounded-[10px] border border-cyan-400/60 bg-[linear-gradient(135deg,rgba(34,211,238,0.28),rgba(16,185,129,0.22))] text-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_6px_18px_rgba(8,47,73,0.5)] transition-transform duration-200 group-hover:scale-[1.06]"
          aria-hidden
        >
          <StickyNote className="h-[17px] w-[17px]" strokeWidth={2.2} />
        </span>
      </span>
      <span
        className="absolute -right-1 -top-1 flex h-[20px] min-w-[20px] items-center justify-center rounded-full border border-slate-900/40 bg-cyan-400 px-1 text-[11px] font-bold text-slate-950 shadow-md pointer-events-none z-[5]"
        aria-hidden
      >
        {total}
      </span>
    </button>
  );
}
