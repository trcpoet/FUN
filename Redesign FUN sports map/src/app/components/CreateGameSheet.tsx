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
import { ChevronRight, Trophy, Users, PenLine, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { addHours, format } from "date-fns";
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
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("Basketball");
  const [spots, setSpots] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepKey = STEPS[step]?.key ?? "sport";

  useEffect(() => {
    if (open) {
      setStep(0);
      setTitle("");
      setSport("Basketball");
      setSpots(4);
      setStartsAtLocal(format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm"));
      setError(null);
    }
  }, [open]);

  const clampSpots = (n: number): number => Math.max(MIN_SPOTS, Math.min(MAX_SPOTS, n));

  const handleSubmit = async () => {
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
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.rpc("create_game", {
      p_title: title.trim() || "Pickup game",
      p_sport: sport,
      p_spots_needed: spots,
      p_lat: userCoords.lat,
      p_lng: userCoords.lng,
      p_starts_at: startD.toISOString(),
      p_location_label: null,
      p_description: null,
      p_requirements: null,
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
    (stepKey === "sport" && sport) ||
    (stepKey === "spots" && spots >= 2) ||
    (stepKey === "title") ||
    stepKey === "confirm";

  const handleNext = () => {
    if (stepKey === "confirm") {
      handleSubmit();
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const currentStepTitle = STEPS[step]?.title ?? "Create game";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl max-h-[72vh] flex flex-col p-4 border-border/80 bg-popover/95 text-popover-foreground backdrop-blur-xl"
        aria-describedby="create-game-desc"
      >
        <SheetDescription id="create-game-desc" className="sr-only">
          Create a new pickup game. Choose sport, players, and name.
        </SheetDescription>
        <SheetHeader className="text-left pb-2 border-b border-border/70 px-0">
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
          <SheetTitle className="text-foreground text-base flex items-center gap-1.5 pt-0.5">
            {React.createElement(STEPS[step]?.icon ?? Trophy, { className: "w-4 h-4 text-primary shrink-0" })}
            {currentStepTitle}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-3 px-0 min-h-0">
          <AnimatePresence mode="wait">
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
          {step > 0 ? (
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
            {loading ? "Creating…" : stepKey === "confirm" ? "Create game" : "Next"}
            {stepKey !== "confirm" && <ChevronRight className="w-4 h-4 ml-0.5" />}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
