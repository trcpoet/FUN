import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Trophy, Users, PenLine, MapPin, X, Clock } from "lucide-react";
import { supabase } from "../../lib/supabase";

const SPORTS = [
  { id: "Basketball", label: "Basketball", icon: "🏀" },
  { id: "Soccer", label: "Soccer", icon: "⚽" },
  { id: "Football", label: "Football", icon: "🏈" },
  { id: "Volleyball", label: "Volleyball", icon: "🏐" },
  { id: "Tennis", label: "Tennis", icon: "🎾" },
  { id: "Running", label: "Running", icon: "🏃" },
  { id: "Pickup", label: "Pickup", icon: "🎯" },
];

const SPOT_OPTIONS = [2, 4, 6, 8, 10, 12];

export type CreateGameModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Coords where user double-tapped (game location) */
  userCoords: { lat: number; lng: number } | null;
  /** Viewport position to anchor the modal next to (e.g. double-tap point). If null, modal is centered. */
  anchorPoint: { x: number; y: number } | null;
  onSuccess: () => void;
  ensureSession?: () => Promise<boolean>;
};

export function CreateGameModal({
  open,
  onOpenChange,
  userCoords,
  anchorPoint,
  onSuccess,
  ensureSession,
}: CreateGameModalProps) {
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("Basketball");
  const [spots, setSpots] = useState(4);
  const [dateTime, setDateTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setSport("Basketball");
      setSpots(4);
      setDateTime("");
      setError(null);
    }
  }, [open]);

  const minDateTime = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  })();

  const handleSubmit = async () => {
    if (!supabase || !userCoords) {
      setError("Location required. Double-tap a spot on the map.");
      return;
    }
    if (ensureSession && !(await ensureSession())) {
      setError("Sign-in required. In Supabase enable: Authentication → Providers → Anonymous.");
      return;
    }
    setLoading(true);
    setError(null);
    const startsAt = dateTime.trim() ? new Date(dateTime.trim()).toISOString() : null;
    const { error: err } = await supabase.rpc("create_game", {
      p_title: title.trim() || "Pickup game",
      p_sport: sport,
      p_spots_needed: spots,
      p_lat: userCoords.lat,
      p_lng: userCoords.lng,
      p_starts_at: startsAt,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    onOpenChange(false);
    onSuccess();
  };

  if (!open) return null;

  const modalWidth = 320;
  const gap = 12;
  const hasAnchor = anchorPoint != null;
  const rightEdge = typeof window !== "undefined" ? window.innerWidth : 400;
  const bottomEdge = typeof window !== "undefined" ? window.innerHeight : 600;
  const x = hasAnchor
    ? anchorPoint!.x + gap < rightEdge - modalWidth
      ? anchorPoint!.x + gap
      : anchorPoint!.x - modalWidth - gap
    : undefined;
  const y = hasAnchor
    ? anchorPoint!.y + gap < bottomEdge - 320
      ? anchorPoint!.y + gap
      : anchorPoint!.y - 320 - gap
    : undefined;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-labelledby="create-game-modal-title"
        aria-describedby="create-game-modal-desc"
        className="fixed z-[70] w-[320px] max-h-[85vh] flex flex-col rounded-xl border border-slate-600 bg-slate-900 shadow-xl overflow-hidden"
        style={
          hasAnchor
            ? { left: Math.max(12, x!), top: Math.max(12, y!), maxHeight: "min(85vh, 420px)" }
            : {
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                maxHeight: "min(85vh, 420px)",
              }
        }
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
          <h2 id="create-game-modal-title" className="text-white font-semibold text-sm">
            New game
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div id="create-game-modal-desc" className="sr-only">
          Create a pickup game. Choose sport, number of players, name, and confirm location.
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Location (double-tap spot or current location when opened from menu) */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/60 p-2.5">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <MapPin className="w-3.5 h-3.5" />
              Location
            </div>
            <p className="text-slate-200 text-xs font-mono">
              {userCoords
                ? `${userCoords.lat.toFixed(5)}, ${userCoords.lng.toFixed(5)}`
                : "Double-tap map to set"}
            </p>
            {userCoords && !anchorPoint && (
              <p className="text-slate-500 text-[11px] mt-1">
                Using your location. Close and double-tap the map to place elsewhere.
              </p>
            )}
          </div>

          {/* Sport */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1.5">
              <Trophy className="w-3.5 h-3.5" />
              Sport
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {SPORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSport(s.id)}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg border-2 transition-all text-xs font-medium ${
                    sport === s.id
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                      : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <span className="text-base">{s.icon}</span>
                  <span className="truncate w-full text-center">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Spots */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1.5">
              <Users className="w-3.5 h-3.5" />
              Players
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SPOT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSpots(n)}
                  className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all ${
                    spots === n
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                      : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Date & time */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1.5">
              <Clock className="w-3.5 h-3.5" />
              When
            </div>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              min={minDateTime}
              className="w-full h-9 px-3 text-sm bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 [color-scheme:dark]"
              aria-label="Date and time of the game"
            />
            <p className="text-slate-500 text-[11px] mt-1">
              Optional — leave blank for &quot;Time TBD&quot;
            </p>
          </div>

          {/* Title */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1.5">
              <PenLine className="w-3.5 h-3.5" />
              Name your game
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Friday Night Lights"
              className="h-9 text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 rounded-lg"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="p-3 border-t border-slate-700/50">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!userCoords || loading}
            className="w-full h-9 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg"
          >
            {loading ? "Creating…" : "Create game"}
          </Button>
        </div>
      </div>
    </>
  );
}
