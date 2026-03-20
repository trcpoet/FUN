import React, { useState } from "react";
import type { GameRow } from "../../lib/supabase";
import { cn } from "./MapCanvas";
import { format } from "date-fns";
import { MapPin, Clock, Trash2 } from "lucide-react";

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
  /** Host-only: delete game for everyone. Return true when the row was removed. */
  onDeleteHostedGame?: (game: GameRow) => Promise<boolean>;
};

export function GameEventPopup({
  game,
  onClose,
  onJoin,
  onLeave,
  onOpenMessages,
  joined,
  isHost,
  onDeleteHostedGame,
}: GameEventPopupProps) {
  const [deleting, setDeleting] = useState(false);
  const hasCoords = typeof game.lat === "number" && typeof game.lng === "number";
  const isFull = game.spots_remaining != null && game.spots_remaining <= 0;

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
              {isFull ? "Join as sub" : "Join"}
            </button>
          )}
          {joined && isHost && (
            <span className="flex-1 py-2 px-3 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-sm font-medium text-center">
              You&apos;re hosting
            </span>
          )}
          {joined && !isHost && (
            <>
              {onLeave ? (
                <button
                  type="button"
                  onClick={() => onLeave(game)}
                  className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-medium border border-slate-600"
                >
                  {isFull ? "You're going (Sub)" : "You're going"}
                </button>
              ) : (
                <span className="py-2 px-3 text-emerald-400 text-sm font-medium">
                  {isFull ? "You're going (Sub)" : "You're going"}
                </span>
              )}
              {onOpenMessages && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenMessages(game);
                    // Close the game popup so the chat drawer takes focus.
                    onClose();
                  }}
                  className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-100 text-sm font-medium border border-slate-700"
                >
                  Messages
                </button>
              )}
            </>
          )}
          {joined && isHost && onOpenMessages && (
            <button
              type="button"
              onClick={() => {
                onOpenMessages(game);
                onClose();
              }}
              className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-100 text-sm font-medium border border-slate-700"
            >
              Messages
            </button>
          )}
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
