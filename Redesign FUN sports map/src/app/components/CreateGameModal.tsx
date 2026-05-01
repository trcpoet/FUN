import React, { useState, useEffect, useMemo, useCallback } from "react";
import { format, isSameDay, startOfToday } from "date-fns";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
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
  Timer,
  Globe,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { motion, useAnimate } from "motion/react";
import { supabase } from "../../lib/supabase";
import { createGame, createMapNote } from "../../lib/api";
import { getSportsForPicker, filterSportsByQuery, sportEmojiFor } from "../../lib/sportDisplay";
import { glassMessengerPanel } from "../styles/glass";
import {
  LEVEL_OPTIONS,
  AGE_RANGE_OPTIONS,
  MATCH_TYPE_OPTIONS,
  VISIBILITY_OPTIONS,
  emptyGameRequirements,
  durationPresetsForSport,
  defaultDurationForSport,
  formatDurationLabel,
  MIN_DURATION_MIN,
  MAX_DURATION_MIN,
  visibilityLabelToEnum,
  type GameRequirementsPayload,
  type VisibilityLabel,
} from "../../lib/gamePreferenceOptions";
import { cn } from "./ui/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Label } from "./ui/label";
import type { MapNoteVisibility } from "../../lib/supabase";

const MIN_SPOTS = 2;
const MAX_SPOTS = 20;

export type CreateGamePrefill = {
  /** Sport id used as the initial selection. */
  sport?: string;
  /** Recommended title for the new game (e.g. "Rematch — Sunday Hoops"). */
  title?: string;
  /** Game roster cap. */
  spotsNeeded?: number;
  /** Duration in minutes (clamped to 15–480). */
  durationMinutes?: number;
  /** Visibility label as shown in the picker. */
  visibility?: VisibilityLabel;
  /** Optional rematch metadata: copied to the new chat as a system message. */
  rematchOfGameId?: string;
  rematchOfTitle?: string;
};

export type CreateGameModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Coords where user double-tapped (game location) */
  userCoords: { lat: number; lng: number } | null;
  /** Optional human-readable location label (e.g. selected venue name). */
  locationLabel?: string | null;
  /** Viewport position to anchor the modal next to (e.g. double-tap point). If null, modal is centered. */
  anchorPoint: { x: number; y: number } | null;
  onSuccess: (gameId?: string | null) => void;
  ensureSession?: () => Promise<boolean>;
  /** Pre-fill the form (used by the "Plan rematch" CTA). */
  prefill?: CreateGamePrefill | null;
};

const ALL_SPORTS = getSportsForPicker();

const SPORT_ROW_EASE: [number, number, number, number] = [0.22, 0.1, 0.22, 1];

/** Pointer-driven press so release always eases back (whileTap alone feels abrupt). */
function SportOptionRow({
  selected,
  icon,
  label,
  onSelect,
}: {
  selected: boolean;
  icon: string;
  label: string;
  onSelect: () => void;
}) {
  const [scope, animate] = useAnimate();

  const settle = () => {
    if (!scope.current) return;
    void animate(scope.current, { scale: 1 }, { duration: 0.72, ease: SPORT_ROW_EASE });
  };

  const press = () => {
    if (!scope.current) return;
    void animate(scope.current, { scale: 0.96 }, { duration: 0.58, ease: SPORT_ROW_EASE });
  };

  return (
    <motion.button
      ref={scope}
      type="button"
      role="option"
      aria-selected={selected}
      initial={{ scale: 1 }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        press();
      }}
      onPointerUp={settle}
      onPointerLeave={settle}
      onPointerCancel={settle}
      onClick={onSelect}
      className={cn(
        "w-full flex min-h-[2.5rem] items-center gap-2.5 rounded-lg py-2 px-2.5 text-left text-sm transition-colors",
        selected
          ? "text-violet-100 ring-1 ring-violet-500/50"
          : "text-slate-300 hover:bg-white/5"
      )}
    >
      <span className="shrink-0 text-xl leading-none" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 truncate font-medium">{label}</span>
    </motion.button>
  );
}

function toggleStr(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function clampDuration(n: number): number {
  if (!Number.isFinite(n)) return 90;
  return Math.max(MIN_DURATION_MIN, Math.min(MAX_DURATION_MIN, Math.round(n)));
}

const VISIBILITY_META: Record<
  VisibilityLabel,
  { hint: string; icon: typeof Globe }
> = {
  "Public (Map)": {
    hint: "Anyone can see the pin and join the chat.",
    icon: Globe,
  },
  "Friends Only": {
    hint: "Mutuals join directly. Strangers need host approval.",
    icon: ShieldCheck,
  },
  "Invite Only": {
    hint: "Hidden from the map. Only people with your invite link can join.",
    icon: Lock,
  },
};

export function CreateGameModal({
  open,
  onOpenChange,
  userCoords,
  locationLabel = null,
  anchorPoint,
  onSuccess,
  ensureSession,
  prefill = null,
}: CreateGameModalProps) {
  const [createKind, setCreateKind] = useState<"game" | "note">("game");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sport, setSport] = useState<string>(ALL_SPORTS[0]?.id ?? "Basketball");
  const [sportQuery, setSportQuery] = useState("");
  const [spots, setSpots] = useState<number>(4);
  const [dateTime, setDateTime] = useState("");
  const [durationMin, setDurationMin] = useState<number>(90);
  /** Set true after the user (or prefill) explicitly chose a duration so we don't auto-overwrite on sport change. */
  const [durationDirty, setDurationDirty] = useState(false);
  /** Popover date/time picker (replaces native datetime-local so we can use a "Done" label, not OS "Today"). */
  const [whenPickerOpen, setWhenPickerOpen] = useState(false);
  const [pickDate, setPickDate] = useState<Date | undefined>(undefined);
  const [pickTime, setPickTime] = useState("12:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerPrefsOpen, setPlayerPrefsOpen] = useState(false);
  const [req, setReq] = useState<GameRequirementsPayload>(emptyGameRequirements());
  const [nearbyGames, setNearbyGames] = useState<any[]>([]);
  const [showWarning, setShowWarning] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<MapNoteVisibility>("public");

  useEffect(() => {
    if (open) {
      setCreateKind("game");
      const initialSport = prefill?.sport?.trim() || (ALL_SPORTS[0]?.id ?? "Basketball");
      setTitle(prefill?.title ?? "");
      setDescription("");
      setSport(initialSport);
      setSportQuery("");
      setSpots(prefill?.spotsNeeded ?? 4);
      const t = new Date(Date.now() + 60 * 60 * 1000);
      setDateTime(format(t, "yyyy-MM-dd'T'HH:mm"));
      setError(null);
      setPlayerPrefsOpen(prefill?.visibility != null);
      setReq({
        ...emptyGameRequirements(),
        ...(prefill?.visibility ? { visibility: prefill.visibility } : {}),
      });
      setNearbyGames([]);
      setShowWarning(false);
      const initialDuration =
        prefill?.durationMinutes ?? defaultDurationForSport(initialSport);
      setDurationMin(clampDuration(initialDuration));
      setDurationDirty(prefill?.durationMinutes != null);
      setNoteBody("");
      setNoteVisibility("public");
    }
  }, [open, prefill]);

  // When the host changes sport before touching the duration, snap the
  // duration to the new sport's recommended default so the chip looks right.
  useEffect(() => {
    if (!open) return;
    if (durationDirty) return;
    setDurationMin(clampDuration(defaultDurationForSport(sport)));
  }, [sport, durationDirty, open]);

  const clampSpots = (n: number): number => Math.max(MIN_SPOTS, Math.min(MAX_SPOTS, n));

  const filteredSports = useMemo(
    () => filterSportsByQuery(ALL_SPORTS, sportQuery),
    [sportQuery]
  );

  const combineLocalDateTime = useCallback((d: Date, timeHHmm: string): string => {
    const parts = timeHHmm.split(":").map((x) => parseInt(x, 10));
    const hh = Number.isFinite(parts[0]) ? parts[0]! : 0;
    const mm = Number.isFinite(parts[1]) ? parts[1]! : 0;
    const out = new Date(d);
    out.setHours(hh, mm, 0, 0);
    return format(out, "yyyy-MM-dd'T'HH:mm");
  }, []);

  const syncPickerFromDateTimeString = useCallback(() => {
    if (dateTime.trim()) {
      const d = new Date(dateTime.trim());
      if (!Number.isNaN(d.getTime())) {
        setPickDate(d);
        setPickTime(format(d, "HH:mm"));
        return;
      }
    }
    const now = new Date();
    setPickDate(now);
    setPickTime(format(now, "HH:mm"));
  }, [dateTime]);

  const handleWhenOpenChange = useCallback(
    (open: boolean) => {
      if (open) syncPickerFromDateTimeString();
      setWhenPickerOpen(open);
    },
    [syncPickerFromDateTimeString]
  );

  const applyWhenDone = useCallback(() => {
    if (!pickDate) {
      setWhenPickerOpen(false);
      return;
    }
    const combined = combineLocalDateTime(pickDate, pickTime);
    const asDate = new Date(combined);
    if (Number.isNaN(asDate.getTime())) {
      setError("Please enter a valid date and time.");
      return;
    }
    if (asDate.getTime() < Date.now()) {
      setError("Pick a date and time in the future.");
      return;
    }
    setDateTime(combined);
    setError(null);
    setWhenPickerOpen(false);
  }, [pickDate, pickTime, combineLocalDateTime]);

  const clearWhen = useCallback(() => {
    const t = new Date(Date.now() + 60 * 60 * 1000);
    setDateTime(format(t, "yyyy-MM-dd'T'HH:mm"));
    setError(null);
    setWhenPickerOpen(false);
  }, []);

  const whenTriggerLabel = useMemo(() => {
    if (!dateTime.trim()) return "Pick date & time";
    const d = new Date(dateTime.trim());
    if (Number.isNaN(d.getTime())) return "Invalid — tap to fix";
    return format(d, "MMM d, yyyy · h:mm a");
  }, [dateTime]);

  const minTimeHHmm = useMemo(() => {
    if (!pickDate || !isSameDay(pickDate, new Date())) return undefined;
    return format(new Date(), "HH:mm");
  }, [pickDate]);

  const handleSubmit = async () => {
    if (createKind !== "game") return;
    if (!supabase || !userCoords) {
      setError("Location required. Double-tap a spot on the map.");
      return;
    }
    if (ensureSession && !(await ensureSession())) {
      setError("Sign-in required. In Supabase enable: Authentication → Providers → Anonymous.");
      return;
    }

    if (!dateTime.trim()) {
      setError("Pick a date and time for the game.");
      return;
    }
    const startDate = new Date(dateTime.trim());
    if (Number.isNaN(startDate.getTime())) {
      setError("Please enter a valid date and time.");
      return;
    }
    if (startDate.getTime() < Date.now()) {
      setError("Pick a date and time in the future.");
      return;
    }
    const startsAt = startDate.toISOString();

    // Check rate limits
    setLoading(true);
    setError(null);
    const { data: activeCount, error: countErr } = await supabase.rpc("get_active_hosted_games_count");
    if (!countErr && typeof activeCount === 'number' && activeCount >= 3) {
      setLoading(false);
      setError("You've reached your active hosting limit (max 3 at a time). Join existing games!");
      return;
    }

    // Check nearby
    if (!showWarning) {
      const { data: nearby, error: nearbyErr } = await supabase.rpc("check_nearby_similar_games", {
        p_sport: sport,
        p_lat: userCoords.lat,
        p_lng: userCoords.lng,
        p_starts_at: startsAt,
        p_radius_km: 5.0,
      });
      if (!nearbyErr && nearby && nearby.length > 0) {
        setLoading(false);
        setNearbyGames(nearby);
        setShowWarning(true);
        return;
      }
    }

    const visibility = visibilityLabelToEnum(req.visibility);
    const { gameId, error: err } = await createGame({
      title: title.trim() || "Pickup game",
      sport,
      lat: userCoords.lat,
      lng: userCoords.lng,
      spotsNeeded: spots,
      startsAt,
      locationLabel: locationLabel?.trim() || null,
      description: description.trim() || null,
      durationMinutes: clampDuration(durationMin),
      visibility,
      requirements: playerPrefsOpen
        ? {
            skillLevel: req.skillLevel,
            ageRange: req.ageRange,
            matchType: req.matchType,
            visibility: req.visibility,
            school: req.school.trim() ? req.school.trim() : null,
            ...(prefill?.rematchOfGameId
              ? { rematch_of: prefill.rematchOfGameId, rematch_of_title: prefill.rematchOfTitle ?? null }
              : {}),
          }
        : prefill?.rematchOfGameId
        ? { rematch_of: prefill.rematchOfGameId, rematch_of_title: prefill.rematchOfTitle ?? null }
        : null,
    });

    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    onOpenChange(false);
    onSuccess(gameId);
  };

  const handleSubmitNote = async () => {
    if (createKind !== "note") return;
    if (!userCoords) {
      setError("Location required. Double-tap a spot on the map.");
      return;
    }
    if (ensureSession && !(await ensureSession())) {
      setError("Sign-in required. In Supabase enable: Authentication → Providers → Anonymous.");
      return;
    }

    setLoading(true);
    setError(null);
    const { error: err } = await createMapNote({
      lat: userCoords.lat,
      lng: userCoords.lng,
      body: noteBody,
      visibility: noteVisibility,
      placeName: locationLabel,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    onOpenChange(false);
    onSuccess(null);
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
        className={glassMessengerPanel(
          "fixed z-[70] w-[360px] max-h-[88vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl shadow-violet-950/20"
        )}
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
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 bg-gradient-to-r from-slate-900/80 to-violet-950/20">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id="create-game-modal-title" className="text-white font-semibold text-sm tracking-tight">
              {createKind === "game" ? "New game" : "New note"}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreateKind("game");
                  setError(null);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  createKind === "game"
                    ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.06]",
                )}
                aria-label="Create a new game"
              >
                New Game
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateKind("note");
                  setError(null);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  createKind === "note"
                    ? "border-cyan-400/45 bg-cyan-400/12 text-cyan-100"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.06]",
                )}
                aria-label="Create a new note"
              >
                Note
              </button>
            </div>
          </div>
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

          {createKind === "note" ? (
            <>
              <div>
                <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium uppercase tracking-wider mb-2">
                  <AlignLeft className="w-3.5 h-3.5 text-cyan-400/80" />
                  Note
                </div>
                <Textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder={locationLabel?.trim() ? `Ask about ${locationLabel.trim()}…` : "Ask a question about this location…"}
                  rows={4}
                  className="min-h-[110px] text-sm bg-slate-900/60 border-white/10 text-slate-200 placeholder:text-slate-600 rounded-xl focus-visible:ring-cyan-500/30"
                  aria-label="Note text"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Nearby players will see it in Feed and can reply in comments.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">Visibility</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(["public", "friends", "private"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setNoteVisibility(opt)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        noteVisibility === opt
                          ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100"
                          : "border-white/10 bg-slate-900/50 text-slate-400 hover:border-white/20",
                      )}
                      aria-label={`Set note visibility to ${opt}`}
                    >
                      {opt === "public" ? "Public" : opt === "friends" ? "Friends" : "Private"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
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
              {sportQuery.trim().length > 0 && !ALL_SPORTS.some(s => s.id.toLowerCase() === sportQuery.trim().toLowerCase()) && (
                <SportOptionRow
                  selected={sport === sportQuery.trim()}
                  icon={sportEmojiFor(sportQuery.trim())}
                  label={`Use custom: "${sportQuery.trim()}"`}
                  onSelect={() => {
                    setSport(sportQuery.trim());
                  }}
                />
              )}
              {sport && !ALL_SPORTS.some(s => s.id === sport) && sport !== sportQuery.trim() && (
                <SportOptionRow
                  selected={true}
                  icon={sportEmojiFor(sport)}
                  label={sport}
                  onSelect={() => {}}
                />
              )}
              {filteredSports.map((s) => (
                <SportOptionRow
                  key={s.id}
                  selected={sport === s.id}
                  icon={s.icon}
                  label={s.label}
                  onSelect={() => {
                    setSport(s.id);
                  }}
                />
              ))}
              {filteredSports.length === 0 && sportQuery.trim().length === 0 && (
                <p className="text-slate-500 text-xs py-3 text-center">Type to search sports</p>
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
              <Popover open={whenPickerOpen} onOpenChange={handleWhenOpenChange}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-xl border-0 bg-slate-950/50 px-3 py-2.5 text-sm text-left text-slate-200",
                      "focus:outline-none focus:ring-1 focus:ring-violet-500/35",
                      !dateTime.trim() && "text-slate-500"
                    )}
                    aria-label="Date and time of the game"
                  >
                    {whenTriggerLabel}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="z-[100] w-auto max-w-[min(100vw-1.5rem,20rem)] border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-xl"
                >
                  <div className="border-b border-slate-800 p-1">
                    <Calendar
                      mode="single"
                      selected={pickDate}
                      onSelect={setPickDate}
                      disabled={{ before: startOfToday() }}
                      initialFocus
                      className="bg-transparent text-slate-100"
                    />
                  </div>
                  <div className="space-y-3 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Time
                      </span>
                      <input
                        type="time"
                        value={pickTime}
                        min={minTimeHHmm}
                        onChange={(e) => setPickTime(e.target.value)}
                        className={cn(
                          "flex-1 rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1.5 text-sm text-slate-200",
                          "focus:outline-none focus:ring-1 focus:ring-violet-500/40 [color-scheme:dark]"
                        )}
                        aria-label="Time of the game"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 text-xs text-slate-400 hover:text-slate-200"
                        onClick={clearWhen}
                      >
                        +1h from now
                      </Button>
                      <Button
                        type="button"
                        className="h-8 rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500"
                        onClick={applyWhenDone}
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-slate-600 text-[10px] mt-1.5">Required — players need a real start time.</p>
          </div>

          {/* Duration */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium uppercase tracking-wider mb-2">
              <Timer className="w-3.5 h-3.5 text-violet-400/80" />
              Duration
              <span className="ml-1 normal-case tracking-normal text-[10px] font-normal text-slate-600">
                (when the pin disappears)
              </span>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {durationPresetsForSport(sport).map((preset) => {
                  const selected = durationMin === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setDurationMin(preset);
                        setDurationDirty(true);
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12px] font-semibold tabular-nums transition-colors",
                        selected
                          ? "border-violet-400 bg-violet-500/20 text-violet-100"
                          : "border-white/10 bg-slate-900/50 text-slate-300 hover:border-white/20",
                      )}
                      aria-pressed={selected}
                    >
                      {formatDurationLabel(preset)}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setDurationDirty(true);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] font-semibold tabular-nums transition-colors",
                    !durationPresetsForSport(sport).includes(durationMin)
                      ? "border-violet-400 bg-violet-500/20 text-violet-100"
                      : "border-white/10 bg-slate-900/50 text-slate-400 hover:border-white/20",
                  )}
                >
                  Custom: {formatDurationLabel(durationMin)}
                </button>
              </div>
              <input
                type="range"
                min={MIN_DURATION_MIN}
                max={240}
                step={5}
                value={durationMin}
                onChange={(e) => {
                  setDurationMin(clampDuration(Number(e.target.value)));
                  setDurationDirty(true);
                }}
                className="w-full accent-violet-500/80"
                aria-label="Game duration in minutes"
              />
              <p className="text-slate-600 text-[10px]">
                After this much time, the game pin disappears from the map and the chat flips to “Game ended · Plan rematch”.
              </p>
            </div>
          </div>

          {/* Visibility — promoted from prefs because it now drives chat membership rules. */}
          <div>
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium uppercase tracking-wider mb-2">
              {React.createElement(VISIBILITY_META[req.visibility as VisibilityLabel]?.icon ?? Globe, {
                className: "w-3.5 h-3.5 text-violet-400/80",
              })}
              Who can see &amp; join
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-900/40 p-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {VISIBILITY_OPTIONS.map((opt) => {
                  const Icon = VISIBILITY_META[opt].icon;
                  const selected = req.visibility === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setReq((r) => ({ ...r, visibility: opt }))}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors",
                        selected
                          ? "border-violet-400 bg-violet-500/20 text-violet-100"
                          : "border-white/10 bg-slate-900/50 text-slate-300 hover:border-white/20",
                      )}
                      aria-pressed={selected}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {opt}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                {VISIBILITY_META[req.visibility as VisibilityLabel]?.hint ??
                  VISIBILITY_META["Public (Map)"].hint}
              </p>
            </div>
          </div>

          {/* Rematch banner — only shown when CreateGameModal was opened from a "Plan rematch" CTA. */}
          {prefill?.rematchOfTitle ? (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-[11px] text-cyan-100">
              <span className="font-semibold">Rematch</span> of{" "}
              <span className="text-cyan-50">{prefill.rematchOfTitle}</span>. We'll prefill sport, location,
              roster size, duration, and who-can-join — tweak anything and create.
            </div>
          ) : null}

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
                <Label className="text-[11px] uppercase tracking-wide text-slate-500">Match Type</Label>
                <div className="flex flex-wrap gap-1.5">
                  {MATCH_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setReq((r) => ({ ...r, matchType: opt }))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        req.matchType === opt
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

          {showWarning && nearbyGames.length > 0 && (
            <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 mt-1">
              <h3 className="text-amber-500 font-semibold mb-1 text-xs">Similar games nearby!</h3>
              <ul className="text-[11px] text-amber-500/80 mb-2 space-y-1">
                {nearbyGames.map(g => (
                  <li key={g.id}>• {g.title} ({g.sport}) starting around {format(new Date(g.starts_at), "h:mm a")}</li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-500">Are you sure you want to create a new game?</p>
            </div>
          )}
            </>
          )}
        </div>

        <div className="p-4 pt-2 border-t border-white/5 bg-slate-950/80">
          <Button
            type="button"
            onClick={createKind === "note" ? handleSubmitNote : handleSubmit}
            disabled={!userCoords || loading || (createKind === "note" && !noteBody.trim())}
            className="w-full h-10 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-semibold shadow-lg shadow-violet-900/30 border-0"
          >
            {loading ? (createKind === "note" ? "Posting…" : "Creating…") : (createKind === "note" ? "Post note" : "Create game")}
          </Button>
        </div>
      </div>
    </>
  );
}
