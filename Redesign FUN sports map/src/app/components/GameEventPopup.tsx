import React, { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { GameRow } from "../../lib/supabase";
import { cn } from "./ui/utils";
import { format } from "date-fns";
import { ArrowLeft, Clock, Info, Navigation, Share2, X, Users } from "lucide-react";
import { sportEmojiFor } from "../../lib/sportDisplay";
import { glassMessengerPanel } from "../styles/glass";
import { useRouteDirections } from "../../hooks/useRouteDirections";
import type { NavigateToOptions } from "../../lib/directions";
import { directionsHref } from "../lib/venueInfoHelpers";
import { GoogleMapsLinkButton } from "./GoogleMapsLinkButton";
import { GameActionBar } from "./game/GameActionBar";
import { GameDetailsView } from "./game/GameDetailsView";
import { gameViewerRole } from "../lib/gameViewerRole";

const SPORT_GRADIENT: Record<string, string> = {
  soccer:     'from-emerald-600 to-green-800',
  football:   'from-amber-600 to-orange-800',
  basketball: 'from-orange-500 to-red-700',
  tennis:     'from-yellow-500 to-lime-700',
  volleyball: 'from-blue-500 to-indigo-700',
  baseball:   'from-red-500 to-rose-800',
  hockey:     'from-sky-500 to-blue-800',
  cricket:    'from-teal-500 to-cyan-800',
  rugby:      'from-purple-600 to-violet-800',
  golf:       'from-lime-600 to-green-700',
};

function sportGradient(sport: string): string {
  return SPORT_GRADIENT[sport.toLowerCase()] ?? 'from-slate-600 to-slate-800';
}

function formatCoords(lat: number, lng: number): string {
  const latStr = Math.abs(lat).toFixed(2) + (lat >= 0 ? "°N" : "°S");
  const lngStr = Math.abs(lng).toFixed(2) + (lng >= 0 ? "°E" : "°W");
  return `${latStr}, ${lngStr}`;
}

type GameEventPopupProps = {
  game: GameRow;
  point?: { x: number; y: number };
  onClose: () => void;
  onJoin?: (game: GameRow) => void;
  onLeave?: (game: GameRow) => void;
  onOpenMessages?: (game: GameRow) => void;
  joined?: boolean;
  /** You created this game (host row in game_participants). Hide misleading "Unjoin" — you're organizing, not a guest who joined. */
  isHost?: boolean;
  /** Current user is on the waitlist as a substitute (joined when full). */
  isSubstitute?: boolean;
  /** Host-only: delete game for everyone. Return true when the row was removed. */
  onDeleteHostedGame?: (game: GameRow) => Promise<boolean>;
  /** Host-only: start the game (sets status=live). */
  onStartHostedGame?: (game: GameRow) => Promise<void> | void;
  /** Host-only: end the game (live -> completed; before live -> delete). */
  onEndHostedGame?: (game: GameRow) => Promise<void> | void;
  /** Viewer location for distance / directions (browser geolocation). */
  viewerCoords?: { lat: number; lng: number } | null;
  /** Draw Mapbox walking route on the map. */
  onNavigateTo?: (dest: { lat: number; lng: number }, opts?: NavigateToOptions) => void;
};

export function GameEventPopup({
  game,
  onClose,
  onJoin,
  onLeave,
  onOpenMessages,
  joined,
  isHost,
  isSubstitute = false,
  onDeleteHostedGame,
  onStartHostedGame,
  onEndHostedGame,
  viewerCoords = null,
  onNavigateTo,
}: GameEventPopupProps) {
  const [optimisticLive, setOptimisticLive] = useState(false);
  // Two views in one card: "actions" is what you do, "details" is what it is. Same pattern
  // (and the same reason) as the venue modal's ℹ️.
  const [view, setView] = useState<"actions" | "details">("actions");
  const reduceMotion = useReducedMotion();
  const hasCoords = typeof game.lat === "number" && typeof game.lng === "number";

  // Membership belongs to the caller — it reads `game_participants` — so feed those props
  // straight in rather than letting the role helper fall back to `created_by`.
  const role = useMemo(
    () =>
      gameViewerRole(game, {
        currentUserId: null,
        joinedGameIds: joined ? new Set([game.id]) : new Set<string>(),
        hostGameIds: isHost ? new Set([game.id]) : new Set<string>(),
        substituteGameIds: isSubstitute ? new Set([game.id]) : new Set<string>(),
        nowMs: Date.now(),
      }),
    [game, joined, isHost, isSubstitute],
  );
  const liveNow = role.isLive || optimisticLive;

  // Memoized, not inline: a fresh object here churns every consumer below it.
  const dest = useMemo(
    () => (hasCoords ? { lat: game.lat, lng: game.lng } : null),
    [hasCoords, game.lat, game.lng]
  );
  const {
    summary: walkSummary,
    loading: walkLoading,
    result: walkResult,
  } = useRouteDirections({
    from: viewerCoords,
    to: dest,
    enabled: hasCoords && Boolean(viewerCoords),
  });

  const mapsHref = useMemo(() => {
    if (!dest) return null;
    return directionsHref(dest, viewerCoords);
  }, [dest, viewerCoords]);

  const handleShowRoute = () => {
    if (!dest) return;
    // Hand over the route this popup already fetched for its ETA label — no second network call.
    onNavigateTo?.(dest, { result: walkResult, label: game.title || "Pickup game" });
  };

  const handleShare = async () => {
    const titleLine = game.title || "Pickup game";
    const whenLine = game.starts_at ? format(new Date(game.starts_at), "MMM d, h:mm a") : "Time on app";
    const coordsLine = hasCoords ? `📍 ${formatCoords(game.lat, game.lng)}` : "";
    const urlLine = mapsHref ?? "";
    const text = [titleLine, `${game.sport} · ${whenLine}`, coordsLine, urlLine].filter(Boolean).join("\n");

    const shareData: ShareData = { title: titleLine, text, url: urlLine || undefined };
    const canNativeShare =
      typeof navigator.share === "function" &&
      (!navigator.canShare || navigator.canShare(shareData));

    if (canNativeShare) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this game link:", urlLine || text);
    }
  };

  const participantCount = game.participant_count ?? 0;
  const shownAvatars = Math.min(participantCount, 4);
  const overflowCount = participantCount - shownAvatars;
  const gradient = sportGradient(game.sport);

  return (
    <div
      className={glassMessengerPanel(
        "absolute z-[1000] w-[min(20rem,calc(100vw-2rem))] max-w-[20rem] rounded-2xl overflow-hidden"
      )}
      style={{ transform: "translate(-50%, calc(-100% - 14px))" }}
    >
      {/* Gradient header */}
      <div className={cn("relative bg-gradient-to-br px-4 pt-4 pb-3", gradient)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-0.5">
              {sportEmojiFor(game.sport)} {game.sport}
              {liveNow && (
                <span className="ml-2 inline-flex items-center gap-1 text-orange-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                  Live
                </span>
              )}
            </p>
            <p className="font-bold text-white text-base leading-snug truncate">
              {game.title || "Pickup game"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setView((v) => (v === "details" ? "actions" : "details"))}
              className="inline-flex size-7 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
              aria-label={view === "details" ? "Back to game actions" : "Game details"}
              title={view === "details" ? "Back" : "Details"}
            >
              {view === "details" ? (
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Info className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex size-7 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
              aria-label="Share game"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-7 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Distance / ETA row — Mapbox walking time. Actions only: the details view is about
            the game itself, and the row is the tallest thing in the header. */}
        {view === "actions" && hasCoords && mapsHref ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2">
            {onNavigateTo && viewerCoords ? (
              <button
                type="button"
                onClick={handleShowRoute}
                className="flex min-w-0 flex-1 items-center gap-3 text-left hover:bg-black/10 rounded-lg -mx-1 px-1 py-0.5 transition-colors"
                aria-label={walkSummary ? `Show route — ${walkSummary}` : "Show route"}
              >
                <Navigation className="h-4 w-4 text-white/80 shrink-0" aria-hidden />
                {walkLoading ? (
                  <span className="text-sm text-white/80">Calculating walk…</span>
                ) : walkSummary ? (
                  <span className="text-sm font-bold text-white tabular-nums">{walkSummary}</span>
                ) : (
                  <span className="text-sm text-white/80">Show route</span>
                )}
              </button>
            ) : (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 flex-1 items-center gap-3"
                aria-label="Open in Maps"
              >
                <Navigation className="h-4 w-4 text-white/80 shrink-0" aria-hidden />
                <span className="text-sm text-white/80">Open in Maps</span>
              </a>
            )}
            {onNavigateTo && viewerCoords ? (
              <GoogleMapsLinkButton href={mapsHref} />
            ) : null}
          </div>
        ) : null}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {view === "details" ? (
          <motion.div
            key="details"
            initial={reduceMotion ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
            transition={{ duration: 0.16 }}
          >
            <GameDetailsView game={game} nowMs={Date.now()} />
          </motion.div>
        ) : (
          <motion.div
            key="actions"
            initial={reduceMotion ? false : { opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
            transition={{ duration: 0.16 }}
            className="px-4 py-3 space-y-3"
          >
            {/* Time + spots row */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                {game.starts_at ? format(new Date(game.starts_at), "MMM d, h:mm a") : "—"}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 shrink-0" />
                {game.spots_remaining != null
                  ? game.spots_remaining === 0
                    ? `Full${game.substitute_count ? ` +${game.substitute_count}` : ""}`
                    : `${participantCount} / ${game.spots_needed}`
                  : `${game.spots_needed} max`}
              </span>
            </div>

            {/* Avatar stack */}
            {participantCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  {Array.from({ length: shownAvatars }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-7 h-7 rounded-full border-2 border-slate-900 bg-gradient-to-br flex items-center justify-center",
                        i > 0 && "-ml-2",
                        ["from-emerald-500 to-teal-700","from-sky-500 to-blue-700","from-violet-500 to-purple-700","from-orange-500 to-amber-700"][i % 4]
                      )}
                    >
                      <Users className="w-3 h-3 text-white/80" />
                    </div>
                  ))}
                  {overflowCount > 0 && (
                    <div className="-ml-2 w-7 h-7 rounded-full border-2 border-slate-900 bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                      +{overflowCount}
                    </div>
                  )}
                </div>
                <span className="text-xs text-slate-500">
                  {participantCount === 1 ? "1 player in" : `${participantCount} players in`}
                </span>
              </div>
            )}

            {/* Description */}
            {game.description?.trim() ? (
              <p className="text-slate-400 text-xs leading-snug line-clamp-2">
                {game.description.trim()}
              </p>
            ) : null}

            {/* Action buttons */}
            <GameActionBar
              game={game}
              role={role}
              density="full"
              onJoin={onJoin}
              onLeave={onLeave}
              onChat={
                onOpenMessages
                  ? (g) => {
                      onOpenMessages(g);
                      onClose();
                    }
                  : undefined
              }
              onStart={onStartHostedGame}
              onEnd={onEndHostedGame}
              onDelete={onDeleteHostedGame}
              onDeleted={onClose}
              onStarted={() => setOptimisticLive(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
