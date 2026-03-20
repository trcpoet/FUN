import React from "react";
import type { GameRow } from "../../lib/supabase";
import { cn } from "./MapCanvas";
import { format } from "date-fns";
import { MapPin, Clock } from "lucide-react";

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
  joined?: boolean;
};

export function GameEventPopup({ game, onClose, onJoin, joined }: GameEventPopupProps) {
  const hasCoords = typeof game.lat === "number" && typeof game.lng === "number";

  return (
    <div
      className="absolute z-[1000] w-[min(18rem,calc(100vw-2rem))] max-w-[18rem] rounded-xl border border-slate-600 bg-slate-900/95 shadow-xl backdrop-blur-sm"
      style={{
        transform: "translate(-50%, calc(-100% - 12px))",
      }}
    >
      <div className="p-3">
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
              ? `${game.spots_remaining} spots left`
              : `${game.spots_needed} max`}
          </p>
          <div className="flex flex-col gap-0.5 mt-1.5 text-slate-500 text-xs">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 shrink-0 text-slate-500" />
              {game.starts_at
                ? format(new Date(game.starts_at), "MMM d, h:mm a")
                : "Time TBD"}
            </span>
            {hasCoords && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 shrink-0 text-slate-500" />
                {formatCoords(game.lat, game.lng)}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          {onJoin && !joined && (
            <button
              type="button"
              onClick={() => onJoin(game)}
              className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
            >
              Join
            </button>
          )}
          {joined && (
            <span className="py-2 px-3 text-emerald-400 text-sm font-medium">Joined</span>
          )}
        </div>
      </div>
    </div>
  );
}
