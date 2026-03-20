import React, { useState, useEffect, useMemo } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Trophy,
  Users,
  PenLine,
  MapPin,
  X,
  Clock,
  Search,
  AlignLeft,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getSportsForPicker, filterSportsByQuery } from "../../lib/sportDisplay";
import {
  LEVEL_OPTIONS,
  AGE_RANGE_OPTIONS,
  AVAILABILITY_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  GAME_TYPE_OPTIONS,
  emptyGameRequirements,
  type GameRequirementsPayload,
} from "../../lib/gamePreferenceOptions";
import { cn } from "./ui/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Label } from "./ui/label";

const MIN_SPOTS = 2;
const MAX_SPOTS = 20;

export type CreateGameModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Coords where user double-tapped (game location) */
  userCoords: { lat: number; lng: number } | null;
  /** Optional human-readable location label (e.g. selected venue name). */
  locationLabel?: string | null;
  /** Viewport position to anchor the modal next to (e.g. double-tap point). If null, modal is centered. */
  anchorPoint: { x: number; y: number } | null;
  onSuccess: () => void;
  ensureSession?: () => Promise<boolean>;
};

const ALL_SPORTS = getSportsForPicker();

function toggleStr(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function CreateGameModal({
  open,
  onOpenChange,
  userCoords,
  locationLabel = null,
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

  const clampSpots = (n: number): number => Math.max(MIN_SPOTS, Math.min(MAX_SPOTS, n));

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
      p_location_label: locationLabel?.trim() ? locationLabel.trim() : null,
      p_description: description.trim() ? description.trim() : null,
      p_requirements: playerPrefsOpen
        ? {
            skillLevel: req.skillLevel,
            ageRange: req.ageRange,
            availability: req.availability,
            timeOfDay: req.timeOfDay,
            gameTypes: req.gameTypes,
            school: req.school.trim() ? req.school.trim() : null,
          }
        : null,
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
  // Clamp modal to viewport so it never goes below the screen.
  const modalMaxHeightPx =
    typeof window !== "undefined" ? Math.min(Math.round(bottomEdge * 0.88), 520) : 520;
  const x = hasAnchor
    ? anchorPoint!.x + gap < rightEdge - modalWidth
      ? anchorPoint!.x + gap
      : anchorPoint!.x - modalWidth - gap
    : undefined;
  const y = hasAnchor
    ? (() => {
        // Prefer below the anchor, but flip above if needed.
        const preferredTop = anchorPoint!.y + gap;
        const maxTop = bottomEdge - modalMaxHeightPx - 12;
        const minTop = 12;

        if (preferredTop <= maxTop) {
          return Math.max(minTop, Math.min(preferredTop, maxTop));
        }
        const aboveTop = anchorPoint!.y - modalMaxHeightPx - gap;
        return Math.max(minTop, Math.min(aboveTop, maxTop));
      })()
    : undefined;

  const centeredTop = !hasAnchor ? Math.max(12, Math.min(bottomEdge - modalMaxHeightPx - 12, bottomEdge / 2 - modalMaxHeightPx / 2)) : undefined;
  const centeredLeft = !hasAnchor ? Math.max(12, Math.min(rightEdge - modalWidth - 12, rightEdge / 2 - modalWidth / 2)) : undefined;

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
            ? {
                left: Math.max(12, Math.min(x!, rightEdge - modalWidth - 12)),
                top: Math.max(12, y!),
                maxHeight: modalMaxHeightPx,
              }
            : {
                left: centeredLeft,
                top: centeredTop,
                transform: "none",
                maxHeight: modalMaxHeightPx,
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
            <p className={cn("text-slate-200 text-xs", locationLabel ? "font-medium" : "font-mono")}>
              {locationLabel?.trim()
                ? locationLabel.trim()
                : userCoords
                  ? `${userCoords.lat.toFixed(5)}, ${userCoords.lng.toFixed(5)}`
                  : "Double-tap map to set"}
            </p>
            {userCoords && anchorPoint && (
              <p className="text-slate-500 text-[11px] mt-1.5">
                {locationLabel?.trim() ? "Using selected sports venue." : "Using the spot you tapped on the map."}
              </p>
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
                      "w-full flex min-h-[2.5rem] items-center gap-2.5 rounded-lg py-2 px-2.5 text-left text-sm transition-all",
                      sport === s.id
                        ? "bg-violet-500/15 text-violet-100 ring-1 ring-violet-500/35"
                        : "text-slate-300 hover:bg-white/5"
                    )}
                  >
                    <span
                      className="shrink-0 text-xl leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                      aria-hidden
                    >
                      {s.icon}
                    </span>
                    <span className="min-w-0 truncate font-medium">{s.label}</span>
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
            <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-slate-200 text-sm font-semibold tabular-nums">{spots}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="w-9 h-9 rounded-lg border border-white/10 bg-slate-900/40 text-slate-200 hover:bg-slate-800/50 transition-colors"
                    aria-label="Decrease athletes"
                    onClick={() => setSpots((s) => clampSpots(s - 1))}
                  >
                    -
                  </button>
                  <button
                    type="button"
                    className="w-9 h-9 rounded-lg border border-white/10 bg-slate-900/40 text-slate-200 hover:bg-slate-800/50 transition-colors"
                    aria-label="Increase athletes"
                    onClick={() => setSpots((s) => clampSpots(s + 1))}
                  >
                    +
                  </button>
                </div>
              </div>

              <input
                type="range"
                min={MIN_SPOTS}
                max={MAX_SPOTS}
                step={1}
                value={spots}
                onChange={(e) => setSpots(clampSpots(Number(e.target.value)))}
                className="w-full mt-3 accent-violet-500/80"
                aria-label="Total spots for this game"
              />

              <p className="text-slate-600 text-[10px] mt-1.5">
                Max roster shown is {MAX_SPOTS}. If full, players after the cap can still join (as subs).
              </p>
            </div>
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
              placeholder="What to bring, house rules…"
              rows={3}
              className="min-h-[72px] text-sm rounded-xl bg-slate-900/60 border-white/10 text-slate-200 placeholder:text-slate-600 focus-visible:ring-violet-500/30 resize-none"
            />
          </div>

          <Collapsible open={playerPrefsOpen} onOpenChange={setPlayerPrefsOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  "w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                  playerPrefsOpen
                    ? "border-violet-500/40 bg-violet-500/10 text-violet-100"
                    : "border-white/10 bg-slate-900/40 text-slate-300 hover:bg-slate-900/60 hover:border-white/15",
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <SlidersHorizontal className="w-4 h-4 text-violet-400/90 shrink-0" aria-hidden />
                  Add player preferences &amp; filters
                </span>
                <ChevronDown
                  className={cn("w-4 h-4 shrink-0 text-slate-500 transition-transform", playerPrefsOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Optional details for who should join. These are stored on the game (not map filters).
              </p>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">Skill level</Label>
                <div className="flex flex-wrap gap-1.5">
                  {LEVEL_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setReq((r) => ({ ...r, skillLevel: opt }))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        req.skillLevel === opt
                          ? "border-violet-400 bg-violet-500/20 text-violet-100"
                          : "border-white/10 bg-slate-900/50 text-slate-400 hover:border-white/20",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">Age range</Label>
                <div className="flex flex-wrap gap-1.5">
                  {AGE_RANGE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setReq((r) => ({ ...r, ageRange: opt }))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        req.ageRange === opt
                          ? "border-violet-400 bg-violet-500/20 text-violet-100"
                          : "border-white/10 bg-slate-900/50 text-slate-400 hover:border-white/20",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">Availability</Label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABILITY_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setReq((r) => ({ ...r, availability: toggleStr(r.availability, opt) }))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        req.availability.includes(opt)
                          ? "border-violet-400 bg-violet-500/20 text-violet-100"
                          : "border-white/10 bg-slate-900/50 text-slate-400 hover:border-white/20",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">Time of day</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TIME_OF_DAY_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setReq((r) => ({ ...r, timeOfDay: toggleStr(r.timeOfDay, opt) }))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        req.timeOfDay.includes(opt)
                          ? "border-violet-400 bg-violet-500/20 text-violet-100"
                          : "border-white/10 bg-slate-900/50 text-slate-400 hover:border-white/20",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">Game type</Label>
                <div className="flex flex-wrap gap-1.5">
                  {GAME_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setReq((r) => ({ ...r, gameTypes: toggleStr(r.gameTypes, opt) }))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        req.gameTypes.includes(opt)
                          ? "border-violet-400 bg-violet-500/20 text-violet-100"
                          : "border-white/10 bg-slate-900/50 text-slate-400 hover:border-white/20",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">School / org (optional)</Label>
                <Input
                  value={req.school}
                  onChange={(e) => setReq((r) => ({ ...r, school: e.target.value }))}
                  placeholder="e.g. Lincoln High"
                  className="h-9 text-sm bg-slate-900/60 border-white/10 text-slate-200 placeholder:text-slate-600 rounded-xl focus-visible:ring-violet-500/30"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

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
