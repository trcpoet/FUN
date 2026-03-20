import React, { useState, useEffect, useMemo } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Trophy, Users, PenLine, MapPin, X, Clock, Search, AlignLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getSportsForPicker, filterSportsByQuery } from "../../lib/sportDisplay";
import { cn } from "./ui/utils";

const SPOT_OPTIONS = [2, 4, 6, 8, 10, 12] as const;

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

const ALL_SPORTS = getSportsForPicker();

export function CreateGameModal({
  open,
  onOpenChange,
  userCoords,
  anchorPoint,
  onSuccess,
  ensureSession,
}: CreateGameModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sport, setSport] = useState<string>(ALL_SPORTS[0]?.id ?? "Basketball");
  const [sportQuery, setSportQuery] = useState("");
  const [spots, setSpots] = useState<number>(4);
  const [dateTime, setDateTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setSport(ALL_SPORTS[0]?.id ?? "Basketball");
      setSportQuery("");
      setSpots(4);
      setDateTime("");
      setError(null);
    }
  }, [open]);

  const filteredSports = useMemo(
    () => filterSportsByQuery(ALL_SPORTS, sportQuery),
    [sportQuery]
  );

  const minDateTime = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }, []);

  const handleSubmit = async () => {
    if (!supabase || !userCoords) {
      setError("Location required. Double-tap a spot on the map.");
      return;
    }
    if (ensureSession && !(await ensureSession())) {
      setError("Sign-in required. In Supabase enable: Authentication → Providers → Anonymous.");
      return;
    }

    let startsAt: string | null = null;
    if (dateTime.trim()) {
      const d = new Date(dateTime.trim());
      if (Number.isNaN(d.getTime())) {
        setError("Please enter a valid date and time.");
        return;
      }
      startsAt = d.toISOString();
    }

    setLoading(true);
    setError(null);

    const { error: err } = await supabase.rpc("create_game", {
      p_title: title.trim() || "Pickup game",
      p_sport: sport,
      p_spots_needed: spots,
      p_lat: userCoords.lat,
      p_lng: userCoords.lng,
      p_starts_at: startsAt,
      p_description: description.trim() ? description.trim() : null,
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

  const modalWidth = 360;
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
    ? anchorPoint!.y + gap < bottomEdge - 380
      ? anchorPoint!.y + gap
      : anchorPoint!.y - 380 - gap
    : undefined;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-labelledby="create-game-modal-title"
        aria-describedby="create-game-modal-desc"
        className="fixed z-[70] w-[360px] max-h-[88vh] flex flex-col rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-violet-950/20 overflow-hidden backdrop-blur-xl"
        style={
          hasAnchor
            ? { left: Math.max(12, x!), top: Math.max(12, y!), maxHeight: "min(88vh, 520px)" }
            : {
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                maxHeight: "min(88vh, 520px)",
              }
        }
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-gradient-to-r from-slate-900/80 to-violet-950/20">
          <h2 id="create-game-modal-title" className="text-white font-semibold text-sm tracking-tight">
            New game
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div id="create-game-modal-desc" className="sr-only">
          Create a pickup game. Search for a sport, choose players with radio options, set time, name, and
          description.
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Location */}
          <div className="rounded-xl border border-white/5 bg-slate-900/50 p-3">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium uppercase tracking-wider mb-1.5">
              <MapPin className="w-3.5 h-3.5 text-violet-400/80" />
              Location
            </div>
            <p className="text-slate-200 text-xs font-mono">
              {userCoords
                ? `${userCoords.lat.toFixed(5)}, ${userCoords.lng.toFixed(5)}`
                : "Double-tap map to set"}
            </p>
            {userCoords && anchorPoint && (
              <p className="text-slate-500 text-[11px] mt-1.5">Using the spot you tapped on the map.</p>
            )}
            {userCoords && !anchorPoint && (
              <p className="text-slate-500 text-[11px] mt-1.5">
                Using your current location. Close and double-tap the map to place elsewhere.
              </p>
            )}
          </div>

          {/* Sport + search */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium uppercase tracking-wider mb-2">
              <Trophy className="w-3.5 h-3.5 text-violet-400/80" />
              Sport
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <Input
                value={sportQuery}
                onChange={(e) => setSportQuery(e.target.value)}
                placeholder="Search sports…"
                className="h-9 pl-9 text-sm bg-slate-900/60 border-white/10 text-slate-200 placeholder:text-slate-600 rounded-xl focus-visible:ring-violet-500/30"
                aria-label="Search sports"
              />
            </div>
            <div
              className="max-h-[140px] overflow-y-auto rounded-xl border border-white/5 bg-slate-900/40 p-1.5 space-y-1"
              role="listbox"
              aria-label="Sport options"
            >
              {filteredSports.length === 0 ? (
                <p className="text-slate-500 text-xs py-3 text-center">No sports match &quot;{sportQuery}&quot;</p>
              ) : (
                filteredSports.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={sport === s.id}
                    onClick={() => setSport(s.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-all",
                      sport === s.id
                        ? "bg-violet-500/15 text-violet-100 ring-1 ring-violet-500/35"
                        : "text-slate-300 hover:bg-white/5"
                    )}
                  >
                    <span className="text-lg shrink-0" aria-hidden>
                      {s.icon}
                    </span>
                    <span className="truncate font-medium">{s.label}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Players — radios */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium uppercase tracking-wider mb-2">
              <Users className="w-3.5 h-3.5 text-violet-400/80" />
              Athletes
            </div>
            <RadioGroup
              value={String(spots)}
              onValueChange={(v) => setSpots(Number(v))}
              className="grid grid-cols-3 gap-2"
            >
              {SPOT_OPTIONS.map((n) => (
                <div key={n}>
                  <Label
                    htmlFor={`create-game-spots-${n}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-xl border px-2 py-2.5 text-sm transition-all",
                      spots === n
                        ? "border-violet-500/45 bg-violet-500/10 text-violet-100 ring-1 ring-violet-500/25"
                        : "border-white/8 bg-slate-900/35 text-slate-400 hover:border-white/12 hover:bg-slate-800/50"
                    )}
                  >
                    <RadioGroupItem
                      value={String(n)}
                      id={`create-game-spots-${n}`}
                      className="border-slate-500 text-violet-400 size-3.5 shrink-0"
                    />
                    <span className="tabular-nums font-semibold text-xs">{n}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <p className="text-slate-600 text-[10px] mt-1.5">Total spots for this game</p>
          </div>

          {/* When — subtle gamified calendar */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium uppercase tracking-wider mb-2">
              <Clock className="w-3.5 h-3.5 text-violet-400/80" />
              When
            </div>
            <div className="rounded-2xl border border-white/6 bg-gradient-to-b from-slate-900/60 to-slate-950/80 p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                min={minDateTime}
                className={cn(
                  "w-full rounded-xl border-0 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-200",
                  "placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/35",
                  "[color-scheme:dark] accent-violet-500/70"
                )}
                style={{ colorScheme: "dark" }}
                aria-label="Date and time of the game"
              />
            </div>
            <p className="text-slate-600 text-[10px] mt-1.5">Optional — leave blank for &quot;time TBD&quot;</p>
          </div>

          {/* Name */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium uppercase tracking-wider mb-2">
              <PenLine className="w-3.5 h-3.5 text-violet-400/80" />
              Name your game
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Friday Night Lights"
              className="h-9 text-sm bg-slate-900/60 border-white/10 text-slate-200 placeholder:text-slate-600 rounded-xl focus-visible:ring-violet-500/30"
            />
          </div>

          {/* Description under name */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium uppercase tracking-wider mb-2">
              <AlignLeft className="w-3.5 h-3.5 text-violet-400/80" />
              Description
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Skill level, what to bring, house rules…"
              rows={3}
              className="min-h-[72px] text-sm rounded-xl bg-slate-900/60 border-white/10 text-slate-200 placeholder:text-slate-600 focus-visible:ring-violet-500/30 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400/95" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="p-4 pt-2 border-t border-white/5 bg-slate-950/80">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!userCoords || loading}
            className="w-full h-10 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-semibold shadow-lg shadow-violet-900/30 border-0"
          >
            {loading ? "Creating…" : "Create game"}
          </Button>
        </div>
      </div>
    </>
  );
}
