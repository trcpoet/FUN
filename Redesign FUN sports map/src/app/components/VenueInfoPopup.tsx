import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, MapPin, Activity, ChevronRight, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import type { VenueSelection } from "./MapboxMap";
import type { GameRow } from "../../lib/supabase";
import { groupGamesBySport, haversineDistanceMeters } from "../lib/gamesAtVenue";
import { getSportIconEmoji } from "../map/gameSportIcons";

type VenueInfoPopupProps = {
  venue: VenueSelection;
  /** Viewport pixel position of the venue pin (bottom of popup sits above this point). */
  anchorClient: { x: number; y: number };
  openGamesNearbyCount: number;
  /** Open games within radius of venue (for per-sport list). */
  gamesNearby?: GameRow[];
  joinedGameIds?: Set<string>;
  onClose: () => void;
  onCreateGame?: (venue: VenueSelection) => void;
  /** Join a specific game at this venue (unlock chat). */
  onJoinGame?: (game: GameRow) => void;
  /** Open messenger for a game (user should already be joined for chat). */
  onOpenChat?: (game: GameRow) => void;
};

function formatCoords(lat: number, lng: number): string {
  const latStr = Math.abs(lat).toFixed(2) + (lat >= 0 ? "°N" : "°S");
  const lngStr = Math.abs(lng).toFixed(2) + (lng >= 0 ? "°E" : "°W");
  return `${latStr}, ${lngStr}`;
}

function prettyLabel(s: string | undefined | null): string | null {
  const raw = s?.trim();
  if (!raw) return null;
  const cleaned = raw.replace(/_/g, " ").replace(/\s+/g, " ");
  return cleaned;
}

const VIEW_MARGIN = 8;

export function VenueInfoPopup({
  venue,
  anchorClient,
  openGamesNearbyCount,
  gamesNearby = [],
  joinedGameIds = new Set(),
  onClose,
  onCreateGame,
  onJoinGame,
  onOpenChat,
}: VenueInfoPopupProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  /** Extra offset after measuring so the card stays inside the viewport. */
  const [nudge, setNudge] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxX = window.innerWidth - VIEW_MARGIN;
    const maxY = window.innerHeight - VIEW_MARGIN;
    let dx = 0;
    let dy = 0;
    if (rect.left < VIEW_MARGIN) dx = VIEW_MARGIN - rect.left;
    if (rect.right > maxX) dx += maxX - rect.right;
    if (rect.top < VIEW_MARGIN) dy = VIEW_MARGIN - rect.top;
    if (rect.bottom > maxY) dy += maxY - rect.bottom;
    if (dx !== 0 || dy !== 0) {
      setNudge((n) => ({ x: n.x + dx, y: n.y + dy }));
    }
  }, [anchorClient.x, anchorClient.y, nudge.x, nudge.y]);
  const name = prettyLabel(venue.name);
  const sport = prettyLabel(venue.sport);
  const leisure = prettyLabel(venue.leisure);

  const title =
    name ??
    (sport && leisure ? `${sport} ${leisure}` : sport ?? leisure ?? "Sports venue");

  const sub =
    venue.sport?.trim() || venue.leisure?.trim()
      ? `${venue.sport?.trim() ? venue.sport.trim() : venue.leisure?.trim() ?? ""}${venue.sport?.trim() && venue.leisure?.trim() ? " · " : ""}${
          venue.sport?.trim() && venue.leisure?.trim() ? venue.leisure.trim() : ""
        }`
      : "Pickup games nearby";

  const bySport = useMemo(() => groupGamesBySport(gamesNearby), [gamesNearby]);
  const sportKeys = useMemo(() => [...bySport.keys()].sort((a, b) => a.localeCompare(b)), [bySport]);

  const distanceMiles = (g: GameRow) => {
    const m = haversineDistanceMeters(venue.center.lat, venue.center.lng, g.lat, g.lng);
    return (m / 1609.34).toFixed(1);
  };

  const left = anchorClient.x + nudge.x;
  const top = anchorClient.y + nudge.y;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      className="fixed z-[1000] w-[min(20rem,calc(100vw-2rem))] max-h-[min(28rem,70vh)] overflow-auto rounded-xl border border-slate-600 bg-slate-900/95 shadow-xl backdrop-blur-sm pointer-events-auto"
      style={{
        left,
        top,
        transform: "translate(-50%, calc(-100% - 12px))",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white truncate">{title}</p>
            <p className="text-slate-400 text-sm mt-0.5 truncate">{sub}</p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 rounded-full hover:bg-slate-800 text-slate-300 shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{openGamesNearbyCount} open game{openGamesNearbyCount === 1 ? "" : "s"}</span>
            <span className="text-slate-500 text-xs">near this venue</span>
          </div>

          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <MapPin className="w-3 h-3 shrink-0" />
            {formatCoords(venue.center.lat, venue.center.lng)}
          </div>

          {gamesNearby.length > 0 && (
            <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Games by sport</p>
              <ul className="space-y-2">
                {sportKeys.map((sportKey) => {
                  const list = bySport.get(sportKey) ?? [];
                  return (
                    <li key={sportKey}>
                      <p className="text-xs text-emerald-400/90 font-semibold mb-1 flex items-center gap-1.5">
                        <span aria-hidden>{getSportIconEmoji(sportKey)}</span>
                        {sportKey}
                        <span className="text-slate-500 font-normal">({list.length})</span>
                      </p>
                      <ul className="space-y-1 pl-0.5">
                        {list.map((g) => {
                          const joined = joinedGameIds.has(g.id);
                          return (
                            <li
                              key={g.id}
                              className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-slate-100 truncate">{g.title || "Pickup"}</p>
                                <p className="text-[11px] text-slate-500">
                                  {g.starts_at
                                    ? format(new Date(g.starts_at), "MMM d · h:mm a")
                                    : "Time TBD"}{" "}
                                  · {distanceMiles(g)} mi
                                </p>
                              </div>
                              {joined ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenChat?.(g);
                                  }}
                                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600/90 hover:bg-teal-500 text-white text-xs font-medium"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  Chat
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onJoinGame?.(g);
                                  }}
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
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {onCreateGame && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCreateGame(venue);
                onClose();
              }}
              className="mt-1 w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
            >
              Create game
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
