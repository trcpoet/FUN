import React from "react";
import type { GameRow } from "../../lib/supabase";
import { format } from "date-fns";

type GameEventPopupProps = {
  game: GameRow;
  point?: { x: number; y: number };
  onClose: () => void;
  onJoin?: (game: GameRow) => void;
  joined?: boolean;
};

export function GameEventPopup({ game, onClose, onJoin, joined }: GameEventPopupProps) {
  return (
    <div
      className="absolute z-[1000] w-56 rounded-xl border border-slate-600 bg-slate-900/95 shadow-xl backdrop-blur-sm"
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
            <p className="text-slate-400 text-sm mt-0.5">
              {game.sport} · {game.spots_needed} spots
            </p>
            {game.starts_at && (
              <p className="text-slate-500 text-xs mt-1">
                {format(new Date(game.starts_at), "MMM d, h:mm a")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-slate-400 hover:text-white hover:bg-slate-700"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
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
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-3 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
