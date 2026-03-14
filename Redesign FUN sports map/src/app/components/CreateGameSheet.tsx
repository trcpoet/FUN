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
        className="bg-slate-900 border-slate-700 text-white rounded-t-3xl max-h-[85vh] flex flex-col"
        aria-describedby="create-game-desc"
      >
        <SheetDescription id="create-game-desc" className="sr-only">
          Create a new pickup game. Choose sport, players, and name.
        </SheetDescription>
        <SheetHeader className="text-left pb-2 border-b border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            {STEPS.map((s, i) => (
              <span key={s.key}>
                {i > 0 && " → "}
                <span className={i === step ? "text-emerald-400 font-semibold" : ""}>
                  {i + 1}
                </span>
              </span>
            ))}
          </div>
          <SheetTitle className="text-white text-xl flex items-center gap-2">
            {React.createElement(STEPS[step]?.icon ?? Trophy, { className: "w-6 h-6 text-emerald-400" })}
            {currentStepTitle}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-6 px-1">
          <AnimatePresence mode="wait">
            {stepKey === "sport" && (
              <motion.div
                key="sport"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-2 sm:grid-cols-3 gap-3"
              >
                {SPORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSport(s.id)}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all font-semibold ${
                      sport === s.id
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                        : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                    }`}
                  >
                    <span className="text-3xl">{s.icon}</span>
                    <span className="text-sm">{s.label}</span>
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
                className="flex flex-wrap justify-center gap-3"
              >
                {SPOT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSpots(n)}
                    className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-lg font-bold transition-all ${
                      spots === n
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                        : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <p className="w-full text-center text-slate-400 text-sm mt-2">Spots needed</p>
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
                  className="h-14 text-lg bg-slate-800 border-slate-600 text-white placeholder-slate-500 rounded-2xl"
                />
                <p className="text-slate-400 text-sm mt-2">Optional — or leave blank for &quot;Pickup game&quot;</p>
              </motion.div>
            )}

            {stepKey === "confirm" && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4 space-y-2"
              >
                <p className="flex items-center gap-2 text-slate-300">
                  <span className="text-2xl">{SPORTS.find((s) => s.id === sport)?.icon ?? "🎯"}</span>
                  <span className="font-semibold text-white">{sport}</span>
                </p>
                <p className="text-slate-400">
                  <span className="text-white font-medium">{spots}</span> spots
                </p>
                <p className="text-slate-400">
                  <span className="text-white font-medium">{title.trim() || "Pickup game"}</span>
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

        <SheetFooter className="flex-row gap-2 border-t border-slate-700/50 pt-4">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
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
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white h-12 text-base font-semibold rounded-xl"
          >
            {loading ? "Creating…" : stepKey === "confirm" ? "Create game" : "Next"}
            {stepKey !== "confirm" && <ChevronRight className="w-5 h-5 ml-1" />}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
