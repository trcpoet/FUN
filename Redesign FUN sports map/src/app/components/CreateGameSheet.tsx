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
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!supabase || !userCoords) {
      setError("Location required. Allow browser location or pick a spot on the map.");
      return;
    }
    if (ensureSession && !(await ensureSession())) {
      setError("Sign-in required. In Supabase enable: Authentication → Providers → Anonymous.");
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
        className="bg-slate-900 border-slate-700 text-white rounded-t-2xl max-h-[70vh] flex flex-col p-4"
        aria-describedby="create-game-desc"
      >
        <SheetDescription id="create-game-desc" className="sr-only">
          Create a new pickup game. Choose sport, players, and name.
        </SheetDescription>
        <SheetHeader className="text-left pb-1.5 border-b border-slate-700/50 px-0">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            {STEPS.map((s, i) => (
              <span key={s.key}>
                {i > 0 && " → "}
                <span className={i === step ? "text-emerald-400 font-semibold" : ""}>
                  {i + 1}
                </span>
              </span>
            ))}
          </div>
          <SheetTitle className="text-white text-base flex items-center gap-1.5 pt-0.5">
            {React.createElement(STEPS[step]?.icon ?? Trophy, { className: "w-4 h-4 text-emerald-400 shrink-0" })}
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
                    className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl border-2 transition-all font-medium ${
                      sport === s.id
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                        : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                    }`}
                  >
                    <span className="text-xl">{s.icon}</span>
                    <span className="text-xs">{s.label}</span>
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
                className="flex flex-wrap justify-center gap-2"
              >
                {SPOT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSpots(n)}
                    className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center text-sm font-bold transition-all ${
                      spots === n
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                        : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <p className="w-full text-center text-slate-400 text-xs mt-1.5">Spots needed</p>
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
                  className="h-11 text-base bg-slate-800 border-slate-600 text-white placeholder-slate-500 rounded-xl"
                />
                <p className="text-slate-400 text-xs mt-1.5">Optional — or leave blank for &quot;Pickup game&quot;</p>
              </motion.div>
            )}

            {stepKey === "confirm" && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 space-y-1"
              >
                <p className="flex items-center gap-1.5 text-slate-300">
                  <span className="text-xl">{SPORTS.find((s) => s.id === sport)?.icon ?? "🎯"}</span>
                  <span className="font-semibold text-white text-sm">{sport}</span>
                </p>
                <p className="text-slate-400 text-xs">
                  <span className="text-white font-medium">{spots}</span> spots
                  · <span className="text-white font-medium">{title.trim() || "Pickup game"}</span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && (
          <p className="text-sm text-red-400 px-1 pb-2" role="alert">
            {error}
          </p>
        )}

        <SheetFooter className="flex-row gap-2 border-t border-slate-700/50 pt-3 mt-auto">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              className="border-slate-600 text-slate-300 hover:bg-slate-800 h-9 text-sm rounded-lg"
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
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white h-9 text-sm font-semibold rounded-lg"
          >
            {loading ? "Creating…" : stepKey === "confirm" ? "Create game" : "Next"}
            {stepKey !== "confirm" && <ChevronRight className="w-4 h-4 ml-0.5" />}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
