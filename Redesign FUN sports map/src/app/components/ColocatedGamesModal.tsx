import React, { useMemo, useState } from "react";
import { X, MapPin, ChevronRight, MessageCircle, Share2 } from "lucide-react";
import { format } from "date-fns";
import type { GameRow } from "../../lib/supabase";
import { groupGamesBySport, haversineDistanceMeters } from "../lib/gamesAtVenue";
import { getSportIconEmoji } from "../map/gameSportIcons";

type ColocatedGamesModalProps = {
  games: GameRow[];
  viewerCoords?: { lat: number; lng: number } | null;
  joinedGameIds?: Set<string>;
  onClose: () => void;
  onJoinGame?: (game: GameRow) => void;
  onOpenChat?: (game: GameRow) => void;
};

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineDistanceMeters(lat1, lng1, lat2, lng2) / 1609.34;
}

function commonLocationLabel(games: GameRow[]): string | null {
  const labels = games.map((g) => g.location_label?.trim()).filter(Boolean) as string[];
  if (labels.length === 0) return null;
  const first = labels[0]!;
  return labels.every((l) => l === first) ? first : null;
}

function googleMapsPlaceUrl(to: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${to.lat},${to.lng}`;
}

export function ColocatedGamesModal({
  games,
  viewerCoords,
  joinedGameIds = new Set(),
  onClose,
  onJoinGame,
  onOpenChat,
}: ColocatedGamesModalProps) {
  const [expandedSport, setExpandedSport] = useState<string | null>(null);
  const g0 = games[0]!;
  const title = commonLocationLabel(games) ?? "Games at this spot";

  const distanceMi = useMemo(() => {
    if (!viewerCoords) return null;
    return haversineMiles(viewerCoords.lat, viewerCoords.lng, g0.lat, g0.lng);
  }, [viewerCoords, g0.lat, g0.lng]);

  const bySport = useMemo(() => groupGamesBySport(games), [games]);
  const sportKeys = useMemo(() => [...bySport.keys()].sort((a, b) => a.localeCompare(b)), [bySport]);

  const activeCount = (list: GameRow[]) =>
    list.filter((g) => g.status === "open" || !g.status).length;

  const handleShare = async () => {
    const titleLine = title || "Games at this spot";
    const coords = { lat: g0.lat, lng: g0.lng };
    const urlLine = googleMapsPlaceUrl(coords);
    const text = [titleLine, urlLine].filter(Boolean).join("\n");

    const shareData: ShareData = { title: titleLine, text, url: urlLine };
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
      window.prompt("Copy this link:", urlLine || text);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="colocated-games-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[min(32rem,85vh)] overflow-hidden rounded-2xl border border-slate-600/80 bg-slate-950/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="colocated-games-title" className="text-lg font-semibold text-white truncate">
                {title}
              </h2>
              {distanceMi != null && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
                  <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  {distanceMi.toFixed(1)} miles away
                </p>
              )}
            </div>
            <div className="flex items-start gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => void handleShare()}
                className="p-2 rounded-full hover:bg-slate-800 text-slate-300"
                aria-label="Share"
                title="Share"
              >
                <Share2 className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full hover:bg-slate-800 text-slate-300"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[min(24rem,70vh)] p-2">
          <p className="px-2 pt-1 pb-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
            Sports here
          </p>
          <ul className="space-y-1">
            {sportKeys.map((sportKey) => {
              const list = bySport.get(sportKey) ?? [];
              const active = activeCount(list);
              const expanded = expandedSport === sportKey;
              return (
                <li key={sportKey} className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.05] transition-colors"
                    onClick={() => setExpandedSport(expanded ? null : sportKey)}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 border border-slate-600/60 text-xl">
                      {getSportIconEmoji(sportKey)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white truncate">{sportKey}</p>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />
                        {active} Active
                      </p>
                    </div>
                    <ChevronRight
                      className={`w-5 h-5 text-slate-500 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                    />
                  </button>
                  {expanded && (
                    <ul className="border-t border-white/[0.06] bg-black/20 px-2 py-2 space-y-2">
                      {list.map((g) => {
                        const joined = joinedGameIds.has(g.id);
                        return (
                          <li
                            key={g.id}
                            className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-slate-100 truncate">{g.title || "Pickup game"}</p>
                              <p className="text-[11px] text-slate-500">
                                {g.starts_at ? format(new Date(g.starts_at), "MMM d · h:mm a") : "—"}
                              </p>
                            </div>
                            {joined ? (
                              <button
                                type="button"
                                onClick={() => onOpenChat?.(g)}
                                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600/90 hover:bg-teal-500 text-white text-xs font-medium"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                Chat
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onJoinGame?.(g)}
                                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-medium"
                              >
                                Join
                                <ChevronRight className="w-3.5 h-3.5 opacity-80" />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
