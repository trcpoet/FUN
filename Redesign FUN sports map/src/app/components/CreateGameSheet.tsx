import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "./ui/sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ChevronRight, Trophy, Users, PenLine, Sparkles, Timer } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { addHours, format } from "date-fns";
import { supabase } from "../../lib/supabase";
import { createGame, createMapNote } from "../../lib/api";
import { glassMessengerPanel } from "../styles/glass";
import {
  durationPresetsForSport,
  defaultDurationForSport,
  formatDurationLabel,
  MIN_DURATION_MIN,
  MAX_DURATION_MIN,
} from "../../lib/gamePreferenceOptions";
import type { MapNoteVisibility } from "../../lib/supabase";

const SPORTS = [
  { id: "Basketball", label: "Basketball", icon: "🏀" },
  { id: "Soccer", label: "Soccer", icon: "⚽" },
  { id: "Football", label: "Football", icon: "🏈" },
  { id: "Volleyball", label: "Volleyball", icon: "🏐" },
  { id: "Tennis", label: "Tennis", icon: "🎾" },
  { id: "Running", label: "Running", icon: "🏃" },
  { id: "Pickup", label: "Pickup", icon: "🎯" },
];

const MIN_SPOTS = 2;
const MAX_SPOTS = 20;

type CreateGameSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userCoords: { lat: number; lng: number } | null;
  onSuccess: () => void;
  ensureSession?: () => Promise<boolean>;
};

const STEPS = [
  { key: "sport", title: "Pick your sport", icon: Trophy },
  { key: "spots", title: "How many players?", icon: Users },
  { key: "title", title: "Name your game", icon: PenLine },
  { key: "confirm", title: "Ready to go", icon: Sparkles },
];

export function CreateGameSheet({
  open,
  onOpenChange,
  userCoords,
  onSuccess,
  ensureSession,
}: CreateGameSheetProps) {
  const [createKind, setCreateKind] = useState<"game" | "note">("game");
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("Basketball");
  const [spots, setSpots] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nearbyGames, setNearbyGames] = useState<any[]>([]);
  const [showWarning, setShowWarning] = useState(false);
  const [startsAtLocal, setStartsAtLocal] = useState(format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm"));
  const [durationMin, setDurationMin] = useState<number>(defaultDurationForSport("Basketball"));
  const [durationDirty, setDurationDirty] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<MapNoteVisibility>("public");

  const stepKey = STEPS[step]?.key ?? "sport";

  useEffect(() => {
    if (open) {
      setCreateKind("game");
      setStep(0);
      setTitle("");
      setSport("Basketball");
      setSpots(4);
      setStartsAtLocal(format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm"));
      setDurationMin(defaultDurationForSport("Basketball"));
      setDurationDirty(false);
      setError(null);
      setNearbyGames([]);
      setShowWarning(false);
      setNoteBody("");
      setNoteVisibility("public");
    }
  }, [open]);

  useEffect(() => {
    if (!open || durationDirty) return;
    setDurationMin(defaultDurationForSport(sport));
  }, [open, sport, durationDirty]);

  const clampSpots = (n: number): number => Math.max(MIN_SPOTS, Math.min(MAX_SPOTS, n));

  const handleSubmit = async () => {
    if (createKind !== "game") return;
    if (!supabase || !userCoords) {
      setError("Location required. Allow browser location or pick a spot on the map.");
      return;
    }
    if (ensureSession && !(await ensureSession())) {
      setError("Sign-in required. In Supabase enable: Authentication → Providers → Anonymous.");
      return;
    }
    if (!startsAtLocal.trim()) {
      setError("Pick a start time.");
      return;
    }
    const startD = new Date(startsAtLocal);
    if (Number.isNaN(startD.getTime())) {
      setError("Invalid start time.");
      return;
    }
    if (startD.getTime() < Date.now()) {
      setError("Pick a time in the future.");
      return;
    }

    // Check Rate Limiting
    setLoading(true);
    setError(null);
    const { data: activeCount, error: countErr } = await supabase.rpc("get_active_hosted_games_count");
    if (!countErr && typeof activeCount === 'number' && activeCount >= 3) {
      setLoading(false);
      setError("You've reached your active hosting limit (max 3 at a time). Join existing games!");
      return;
    }

    // Check Nearby Games
    if (!showWarning) {
      const { data: nearby, error: nearbyErr } = await supabase.rpc("check_nearby_similar_games", {
        p_sport: sport,
        p_lat: userCoords.lat,
        p_lng: userCoords.lng,
        p_starts_at: startD.toISOString(),
        p_radius_km: 5.0,
      });
      if (!nearbyErr && nearby && nearby.length > 0) {
        setLoading(false);
        setNearbyGames(nearby);
        setShowWarning(true);
        return; // Pause creation
      }
    }

    const { error: err } = await createGame({
      title: title.trim() || "Pickup game",
      sport,
      spotsNeeded: spots,
      lat: userCoords.lat,
      lng: userCoords.lng,
      startsAt: startD.toISOString(),
      description: null,
      durationMinutes: Math.max(MIN_DURATION_MIN, Math.min(MAX_DURATION_MIN, durationMin)),
      visibility: "public",
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    onOpenChange(false);
    onSuccess();
  };

  const handleSubmitNote = async () => {
    if (createKind !== "note") return;
    if (!userCoords) {
      setError("Location required. Allow browser location or pick a spot on the map.");
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
      placeName: null,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    onOpenChange(false);
    onSuccess();
  };

  const canNext =
    createKind === "note"
      ? Boolean(noteBody.trim())
      : (stepKey === "sport" && sport) ||
        (stepKey === "spots" && spots >= 2) ||
        (stepKey === "title") ||
        stepKey === "confirm";

  const handleNext = () => {
    if (createKind === "note") {
      void handleSubmitNote();
      return;
    }
    if (stepKey === "confirm") {
      handleSubmit();
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const currentStepTitle = createKind === "note" ? "New note" : (STEPS[step]?.title ?? "Create game");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={glassMessengerPanel(
          "rounded-t-3xl max-h-[72vh] flex flex-col p-4 border-t border-border/80 border-l-0 border-r-0 border-b-0"
        )}
        aria-describedby="create-game-desc"
      >
        <SheetDescription id="create-game-desc" className="sr-only">
          Create a new pickup game. Choose sport, players, and name.
        </SheetDescription>
        <SheetHeader className="text-left pb-2 border-b border-border/70 px-0">
          <div className="flex items-center gap-2 pb-2">
            <button
              type="button"
              onClick={() => {
                setCreateKind("game");
                setError(null);
              }}
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                createKind === "game"
                  ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.06]"
              }`}
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
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                createKind === "note"
                  ? "border-cyan-400/45 bg-cyan-400/12 text-cyan-100"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.06]"
              }`}
              aria-label="Create a new note"
            >
              Note
            </button>
          </div>
          {createKind === "game" ? (
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            {STEPS.map((s, i) => (
              <span key={s.key}>
                {i > 0 && " → "}
                <span className={i === step ? "text-primary font-semibold" : ""}>
                  {i + 1}
                </span>
              </span>
            ))}
            </div>
          ) : null}
          <SheetTitle className="text-foreground text-base flex items-center gap-1.5 pt-0.5">
            {React.createElement(STEPS[step]?.icon ?? Trophy, { className: "w-4 h-4 text-primary shrink-0" })}
            {currentStepTitle}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-3 px-0 min-h-0">
          <AnimatePresence mode="wait">
            {createKind === "note" && (
              <motion.div
                key="note"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="rounded-2xl border border-border/80 bg-card/70 p-3 space-y-2 shadow-[var(--shadow-control)]">
                  <p className="text-xs font-semibold text-muted-foreground">Ask about this location</p>
                  <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="What’s happening here?"
                    rows={4}
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                    aria-label="Note text"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Nearby players will see it in Feed and can comment.
                  </p>
                </div>

                <div className="rounded-2xl border border-border/80 bg-card/70 p-3 space-y-2 shadow-[var(--shadow-control)]">
                  <p className="text-xs font-semibold text-muted-foreground">Visibility</p>
                  <div className="flex flex-wrap gap-2">
                    {(["public", "friends", "private"] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setNoteVisibility(opt)}
                        className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                          noteVisibility === opt
                            ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100"
                            : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.06]"
                        }`}
                        aria-label={`Set note visibility to ${opt}`}
                      >
                        {opt === "public" ? "Public" : opt === "friends" ? "Friends" : "Private"}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
            {stepKey === "sport" && (
              <motion.div
                key="sport"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-3 sm:grid-cols-4 gap-2"
              >
                {SPORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSport(s.id)}
                    className={`flex min-h-[2.75rem] items-center justify-center gap-2 rounded-xl border-2 px-2 py-2 text-center transition-all font-medium ${
                      sport === s.id
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                        : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                    }`}
                  >
                    <span
                      className="shrink-0 text-xl leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] sm:text-2xl"
                      aria-hidden
                    >
                      {s.icon}
                    </span>
                    <span className="text-xs leading-tight text-left min-w-0">{s.label}</span>
                  </button>
                ))}
              </motion.div>
            )}

            {stepKey === "spots" && (
              <motion.div
                key="spots"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-slate-300 text-sm font-semibold">Athletes</p>
                    <p className="text-white text-base font-bold tabular-nums">{spots}</p>
                  </div>

                  <input
                    type="range"
                    min={MIN_SPOTS}
                    max={MAX_SPOTS}
                    step={1}
                    value={spots}
                    onChange={(e) => setSpots(clampSpots(Number(e.target.value)))}
                    className="w-full accent-emerald-400/80"
                    aria-label="Total spots for this game"
                  />

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="w-10 h-10 rounded-xl border border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700 transition-colors font-semibold"
                      aria-label="Decrease athletes"
                      onClick={() => setSpots((s) => clampSpots(s - 1))}
                    >
                      -
                    </button>
                    <Input
                      value={spots}
                      type="number"
                      min={MIN_SPOTS}
                      max={MAX_SPOTS}
                      step={1}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next)) return;
                        setSpots(clampSpots(next));
                      }}
                      className="h-10 w-20 text-center text-base bg-slate-800 border-slate-600 text-white rounded-xl"
                      aria-label="Total athletes"
                    />
                    <button
                      type="button"
                      className="w-10 h-10 rounded-xl border border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700 transition-colors font-semibold"
                      aria-label="Increase athletes"
                      onClick={() => setSpots((s) => clampSpots(s + 1))}
                    >
                      +
                    </button>
                  </div>
                  <p className="text-slate-400 text-xs">
                    Max roster shown is {MAX_SPOTS}. If full, players after the cap can still join (as subs).
                  </p>
                </div>
              </motion.div>
            )}

            {stepKey === "title" && (
              <motion.div
                key="title"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Friday Night Lights"
                  className="text-base"
                />
                <p className="text-muted-foreground text-xs mt-1.5">
                  Optional — or leave blank for &quot;Pickup game&quot;
                </p>
              </motion.div>
            )}

            {stepKey === "confirm" && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="text-left">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Start time (required)</p>
                  <Input
                    type="datetime-local"
                    value={startsAtLocal}
                    min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                    onChange={(e) => setStartsAtLocal(e.target.value)}
                    className="h-11 bg-slate-900 border-slate-600 text-white rounded-xl"
                  />
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-emerald-400/80" />
                    Duration — pin disappears after this
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {durationPresetsForSport(sport).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setDurationMin(preset);
                          setDurationDirty(true);
                        }}
                        className={`rounded-full border px-3 py-1 text-[12px] font-semibold tabular-nums transition-colors ${
                          durationMin === preset
                            ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                            : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        {formatDurationLabel(preset)}
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    min={MIN_DURATION_MIN}
                    max={240}
                    step={5}
                    value={durationMin}
                    onChange={(e) => {
                      setDurationMin(Number(e.target.value));
                      setDurationDirty(true);
                    }}
                    className="mt-2 w-full accent-emerald-400/80"
                    aria-label="Game duration in minutes"
                  />
                </div>
                <div className="rounded-2xl border border-border/80 bg-card/70 p-3 space-y-1 shadow-[var(--shadow-control)]">
                <p className="flex min-h-[2rem] items-center gap-2 text-foreground/90">
                  <span
                    className="shrink-0 text-2xl leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                    aria-hidden
                  >
                    {SPORTS.find((x) => x.id === sport)?.icon ?? "🎯"}
                  </span>
                  <span className="font-semibold text-foreground text-sm">{sport}</span>
                </p>
                <p className="text-muted-foreground text-xs">
                  <span className="text-foreground font-semibold">{spots}</span> spots
                  · <span className="text-foreground font-semibold">{title.trim() || "Pickup game"}</span>
                </p>
                </div>
                {showWarning && nearbyGames.length > 0 && (
                  <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 mt-3">
                    <h3 className="text-amber-500 font-semibold mb-1 text-sm">Similar games nearby!</h3>
                    <ul className="text-xs text-amber-500/80 mb-2 space-y-1">
                      {nearbyGames.map(g => (
                        <li key={g.id}>• {g.title} ({g.sport}) starting around {format(new Date(g.starts_at), "h:mm a")}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-amber-500">Are you sure you want to create a new game?</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && (
          <div
            className="mx-0.5 mb-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground"
            role="alert"
            aria-live="assertive"
          >
            <span className="font-semibold text-destructive">Fix this:</span>{" "}
            <span className="text-foreground/90">{error}</span>
          </div>
        )}

        <SheetFooter className="flex-row gap-2 border-t border-border/70 pt-3 mt-auto">
          {createKind === "game" && step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              className="h-11 text-sm rounded-xl"
            >
              Back
            </Button>
          ) : (
            <div />
          )}
          <Button
            type="button"
            onClick={handleNext}
            disabled={!canNext || loading}
            className="flex-1 h-11 text-sm rounded-xl"
          >
            {loading
              ? createKind === "note"
                ? "Posting…"
                : "Creating…"
              : createKind === "note"
                ? "Post note"
                : stepKey === "confirm"
                  ? "Create game"
                  : "Next"}
            {createKind === "game" && stepKey !== "confirm" && <ChevronRight className="w-4 h-4 ml-0.5" />}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
