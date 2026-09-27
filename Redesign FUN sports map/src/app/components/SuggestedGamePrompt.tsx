import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { getSuggestedGames, type SuggestedGameRow } from "../../lib/api";
import { formatUrgentCountdown, isGameLive } from "../../lib/mapGameTimer";
import { sportEmojiFor } from "../../lib/sportDisplay";
import { useSharedNow } from "../../hooks/useSharedNow";
import { cn } from "./ui/utils";

/**
 * "There's a basketball game 1.2 km away, starting in 40 minutes."
 *
 * The map shows everything; this points at the one thing. It only ever speaks
 * when the top-ranked game is in a sport the person actually plays and is close
 * enough in time to reach — a nudge you can act on, not another badge.
 *
 * Shares `get_suggested_games` with Explore's shelf, so what the map calls your
 * best option and what the feed calls it are the same game.
 *
 * Deliberately quiet:
 *  - silent for guests (`get_suggested_games` returns nothing without a viewer)
 *    and for anyone who has not told us what they play;
 *  - silent for a game more than `MAX_LEAD_MS` out — that is a plan, not a nudge;
 *  - dismissable, and a dismissal sticks for the session per game, so it cannot
 *    become the thing you swipe away every time the map re-centres.
 */

/** Beyond this, a game is something to plan for rather than something to go to. */
const MAX_LEAD_MS = 6 * 60 * 60 * 1000;

/** Re-ask no more often than this, however much the map moves. */
const REFRESH_MS = 3 * 60 * 1000;

export function SuggestedGamePrompt(props: {
  lat: number | null;
  lng: number | null;
  /** Null while signed out — the prompt stays silent. */
  currentUserId: string | null;
  radiusKm?: number;
  onOpenGame: (game: SuggestedGameRow) => void;
  className?: string;
}) {
  const { lat, lng, currentUserId, onOpenGame } = props;
  const [rows, setRows] = useState<SuggestedGameRow[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const lastFetchRef = useRef(0);
  const nowMs = useSharedNow(30_000);

  // Coarse key: a few hundred metres of drift is not new information, and the
  // map's centre changes on every pan.
  const cellKey =
    lat == null || lng == null ? null : `${lat.toFixed(2)}:${lng.toFixed(2)}`;

  useEffect(() => {
    if (!currentUserId || lat == null || lng == null || cellKey == null) return;
    const now = Date.now();
    if (now - lastFetchRef.current < REFRESH_MS) return;
    lastFetchRef.current = now;

    let cancelled = false;
    void getSuggestedGames({ lat, lng, radiusKm: props.radiusKm ?? 25, limit: 8 }).then((r) => {
      if (cancelled || r.error) return;
      setRows(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, cellKey, lat, lng, props.radiusKm]);

  const pick = useMemo(() => {
    for (const g of rows) {
      if (!g.sport_match) continue; // only ever speaks about a sport you play
      if (dismissed.has(g.id)) continue;
      if (isGameLive(g, nowMs)) return g;
      if (!g.starts_at) continue;
      const startMs = Date.parse(g.starts_at);
      if (Number.isNaN(startMs)) continue;
      if (startMs < nowMs) continue;
      if (startMs - nowMs > MAX_LEAD_MS) continue;
      return g;
    }
    return null;
  }, [rows, dismissed, nowMs]);

  if (!pick) return null;

  const live = isGameLive(pick, nowMs);
  const startMs = pick.starts_at ? Date.parse(pick.starts_at) : Number.NaN;
  const when = live
    ? "playing now"
    : !Number.isNaN(startMs)
    ? `in ${formatUrgentCountdown(startMs - nowMs)}`
    : "";
  const distance =
    pick.distance_km == null
      ? ""
      : pick.distance_km < 1
      ? `${Math.round(pick.distance_km * 1000)} m`
      : `${pick.distance_km.toFixed(1)} km`;

  return (
    <div className={cn("pointer-events-auto mx-4 mb-3 flex justify-center", props.className)}>
      <div
        className="flex w-full max-w-md items-center gap-3 rounded-full bg-surface-2/95 py-2 pl-3 pr-2 shadow-[var(--glow-md)] backdrop-blur-xl"
        role="status"
      >
        <button
          type="button"
          onClick={() => onOpenGame(pick)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full text-lg",
              live ? "bg-alert/20" : "bg-primary/15",
            )}
            aria-hidden
          >
            {sportEmojiFor(pick.sport ?? "")}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-white">
              {pick.sport?.trim() || "A game"} {when}
            </span>
            <span className="block truncate text-[11px] text-slate-400">
              {distance ? `${distance} away` : "Nearby"}
              {pick.spots_remaining != null && pick.spots_remaining > 0
                ? ` · ${pick.spots_remaining} ${pick.spots_remaining === 1 ? "spot" : "spots"} left`
                : " · waitlist"}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setDismissed((prev) => new Set(prev).add(pick.id))}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label="Dismiss this suggestion"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
