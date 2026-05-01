import React, { useMemo, useState } from "react";
import type { GameRow } from "../../lib/supabase";
import { cn } from "./MapCanvas";
import { format } from "date-fns";
import { Clock, Trash2, Navigation, Share2, Play, Square, MessageCircle, X, Users } from "lucide-react";
import { sportEmojiFor } from "../../lib/sportDisplay";
import { glassMessengerPanel } from "../styles/glass";

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

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h =
    s1 * s1 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * s2 * s2;
  return R * (2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/** Rough urban driving ETA (no routing API). */
function estimateDriveMinutes(km: number): number {
  const avgKmh = 32;
  return Math.max(1, Math.round((km / avgKmh) * 60));
}

function formatDistanceShort(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

function googleMapsDirectionsUrl(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): string {
  const o = `${from.lat},${from.lng}`;
  const d = `${to.lat},${to.lng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=driving`;
}

function googleMapsPlaceUrl(to: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${to.lat},${to.lng}`;
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
}: GameEventPopupProps) {
  const [deleting, setDeleting] = useState(false);
  const [hostBusy, setHostBusy] = useState<"start" | "end" | null>(null);
  const [optimisticLive, setOptimisticLive] = useState(false);
  const hasCoords = typeof game.lat === "number" && typeof game.lng === "number";
  const isFull = game.spots_remaining != null && game.spots_remaining <= 0;
  const isLive = game.status === "live";
  const liveNow = isLive || optimisticLive;

  const routeMeta = useMemo(() => {
    if (!hasCoords) return null;
    const dest = { lat: game.lat, lng: game.lng };
    if (
      viewerCoords &&
      Number.isFinite(viewerCoords.lat) &&
      Number.isFinite(viewerCoords.lng)
    ) {
      const km = haversineKm(viewerCoords.lat, viewerCoords.lng, dest.lat, dest.lng);
      return {
        km,
        minutes: estimateDriveMinutes(km),
        href: googleMapsDirectionsUrl(viewerCoords, dest),
        hasOrigin: true as const,
      };
    }
    return {
      km: null as number | null,
      minutes: null as number | null,
      href: googleMapsPlaceUrl(dest),
      hasOrigin: false as const,
    };
  }, [hasCoords, game.lat, game.lng, viewerCoords]);

  const handleShare = async () => {
    const titleLine = game.title || "Pickup game";
    const whenLine = game.starts_at ? format(new Date(game.starts_at), "MMM d, h:mm a") : "Time on app";
    const coordsLine = hasCoords ? `📍 ${formatCoords(game.lat, game.lng)}` : "";
    const urlLine = routeMeta?.href ?? "";
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

        {/* Distance / ETA row — prominent */}
        {routeMeta && (
          <a
            href={routeMeta.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2 hover:bg-black/30 transition-colors"
            aria-label={routeMeta.hasOrigin ? `Directions — ${formatDistanceShort(routeMeta.km!)} away` : "Open in Maps"}
          >
            <Navigation className="h-4 w-4 text-white/80 shrink-0" aria-hidden />
            {routeMeta.hasOrigin && routeMeta.km != null ? (
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold text-white tabular-nums">
                  {formatDistanceShort(routeMeta.km)}
                </span>
                <span className="text-xs text-white/65">·</span>
                <span className="text-xs text-white/70">~{routeMeta.minutes} min drive</span>
              </div>
            ) : (
              <span className="text-sm text-white/80">Open in Maps</span>
            )}
          </a>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
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
        <div className="grid grid-cols-2 gap-2">
          {onJoin && !joined ? (
            <button
              type="button"
              onClick={() => onJoin(game)}
              className={cn(
                "col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-lg text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2",
                isFull
                  ? "bg-amber-600/80 hover:bg-amber-500 focus-visible:ring-amber-500/40"
                  : "bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-500/40"
              )}
            >
              <span className="inline-flex items-center gap-2">
                <Play className="w-4 h-4 opacity-90" aria-hidden />
                {isFull ? "Join Waitlist" : "I'm In"}
              </span>
            </button>
          ) : null}

          {joined && isHost ? (
            <span className="col-span-2 inline-flex h-10 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-sm font-semibold">
              You&apos;re hosting
            </span>
          ) : null}

          {isHost && onStartHostedGame && !liveNow ? (
            <button
              type="button"
              disabled={hostBusy !== null}
              onClick={() => {
                setHostBusy("start");
                void Promise.resolve(onStartHostedGame(game))
                  .then(() => setOptimisticLive(true))
                  .finally(() => setHostBusy(null));
              }}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors",
                "border-rose-500/40 bg-rose-600/15 text-rose-100 hover:bg-rose-600/22",
                "disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"
              )}
              aria-label="Start game"
            >
              <Play className="w-4 h-4" aria-hidden />
              {hostBusy === "start" ? "Starting…" : "Start game"}
            </button>
          ) : null}

          {isHost && onEndHostedGame && liveNow ? (
            <button
              type="button"
              disabled={hostBusy !== null}
              onClick={() => {
                setHostBusy("end");
                void Promise.resolve(onEndHostedGame(game)).finally(() => setHostBusy(null));
              }}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors",
                "border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800",
                "disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/20"
              )}
              aria-label="End game"
            >
              <Square className="w-4 h-4" aria-hidden />
              {hostBusy === "end" ? "Ending…" : "End game"}
            </button>
          ) : null}

          {joined && !isHost ? (
            onLeave ? (
              <button
                type="button"
                onClick={() => onLeave(game)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-950/35 text-rose-100 text-sm font-semibold transition-colors hover:bg-rose-950/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/30"
              >
                {isSubstitute ? "Leave Waitlist" : "I'm Out"}
              </button>
            ) : (
              <span className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-sm font-semibold">
                {isSubstitute ? "On Waitlist" : "You're In"}
              </span>
            )
          ) : null}

          {joined && onOpenMessages ? (
            <button
              type="button"
              onClick={() => {
                onOpenMessages(game);
                onClose();
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 text-sm font-semibold transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/20"
              aria-label="Messages"
            >
              <MessageCircle className="w-4 h-4" aria-hidden />
              Messages
            </button>
          ) : null}
        </div>
        {joined && isHost && onDeleteHostedGame && (
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              if (
                !window.confirm(
                  "Delete this game for everyone? Players will be removed and chat history will be lost. This cannot be undone."
                )
              ) {
                return;
              }
              setDeleting(true);
              try {
                const ok = await onDeleteHostedGame(game);
                if (ok) onClose();
              } finally {
                setDeleting(false);
              }
            }}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-500/50 bg-red-950/40 text-red-200 text-sm font-medium hover:bg-red-950/70 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {deleting ? "Deleting…" : "Delete game"}
          </button>
        )}
      </div>
    </div>
  );
}
