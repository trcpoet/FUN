import React, { useMemo, useState } from "react";
import type { GameRow } from "../../lib/supabase";
import { cn } from "./MapCanvas";
import { format } from "date-fns";
import { MapPin, Clock, Trash2, Navigation, Share2, Play, Square, MessageCircle } from "lucide-react";

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

  return (
    <div
      className="absolute z-[1000] w-[min(18rem,calc(100vw-2rem))] max-w-[18rem] rounded-xl border border-slate-600 bg-slate-900/95 shadow-xl backdrop-blur-sm"
      style={{
        transform: "translate(-50%, calc(-100% - 12px))",
      }}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate">
            {game.title || "Pickup game"}
          </p>
          {game.description?.trim() ? (
            <p className="text-slate-500 text-xs mt-1 leading-snug line-clamp-3">
              {game.description.trim()}
            </p>
          ) : null}
          <p
            className={cn(
              "text-slate-400 text-sm",
              game.description?.trim() ? "mt-1.5" : "mt-0.5"
            )}
          >
            {game.sport} ·{" "}
            {game.spots_remaining != null
              ? game.spots_remaining === 0
                ? `Full${game.substitute_count ? ` · ${game.substitute_count} on waitlist` : ""}`
                : `${game.spots_remaining} spots left`
              : `${game.spots_needed} max`}
          </p>
          <div className="flex flex-col gap-0.5 mt-1.5 text-slate-500 text-xs">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 shrink-0 text-slate-500" />
              {game.starts_at
                ? format(new Date(game.starts_at), "MMM d, h:mm a")
                : "—"}
            </span>
            {hasCoords && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 shrink-0 text-slate-500" />
                {formatCoords(game.lat, game.lng)}
              </span>
            )}
          </div>
          </div>
          <div className="shrink-0 flex items-start gap-1.5">
            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-600/80 bg-slate-800/90 text-slate-200 transition-colors hover:border-slate-400/70 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              aria-label="Share game"
              title="Share"
            >
              <Share2 className="h-4 w-4" aria-hidden />
            </button>
            {routeMeta && (
              <a
                href={routeMeta.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "shrink-0 flex flex-col items-end gap-0.5 rounded-lg border border-slate-600/80 bg-slate-800/90 px-2 py-1.5 text-right transition-colors",
                  "hover:border-emerald-500/50 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                )}
                aria-label={
                  routeMeta.hasOrigin
                    ? `Open Google Maps directions, ${formatDistanceShort(routeMeta.km!)} about ${routeMeta.minutes} minutes drive estimated`
                    : "Open this location in Google Maps"
                }
              >
                <Navigation className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                {routeMeta.hasOrigin && routeMeta.km != null ? (
                  <>
                    <span className="text-[11px] font-semibold tabular-nums text-white leading-tight">
                      {formatDistanceShort(routeMeta.km)}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      ~{routeMeta.minutes} min drive
                    </span>
                    <span className="text-[9px] text-slate-500 leading-tight">est.</span>
                  </>
                ) : (
                  <span className="text-[10px] font-medium text-slate-300 leading-tight max-w-[4.5rem]">
                    Maps
                  </span>
                )}
              </a>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
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
                {isFull ? "Join Waitlist" : "Join"}
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
                {isSubstitute ? "Leave Waitlist" : "Can't make it"}
              </button>
            ) : (
              <span className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-sm font-semibold">
                {isSubstitute ? "On Waitlist" : "You're going"}
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
