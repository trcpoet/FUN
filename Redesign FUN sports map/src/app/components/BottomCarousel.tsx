import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Flame,
  MapPin,
  ChevronRight,
  Activity,
  Users,
  Calendar,
  Settings,
  MessageCircle,
  X,
  Plus,
} from "lucide-react";
import { cn } from "./MapCanvas";
import { useIsMobile } from "./ui/use-mobile";
import type { GameRow } from "../../lib/supabase";

function formatDistance(km: number): string {
  const mi = km * 0.621371;
  if (mi < 0.1) return "Nearby";
  return `${mi.toFixed(1)} mi away`;
}

const NAV_ITEMS = [
  { id: "map", label: "Map", Icon: MapPin, active: true },
  { id: "activity", label: "Activity", Icon: Activity, active: false },
  { id: "events", label: "Events", Icon: Calendar, active: false },
  { id: "social", label: "Social", Icon: Users, active: false },
  { id: "settings", label: "Settings", Icon: Settings, active: false },
];

export type BottomCarouselProps = {
  games: GameRow[];
  selectedGame: GameRow | null;
  onSelectGame: (game: GameRow | null) => void;
  onJoin: (game: GameRow) => void;
  joinedGameIds: Set<string>;
  chatOpenForGameId: string | null;
  onCloseChat: () => void;
  liveNowOpen?: boolean;
  onCreateGame?: () => void;
};

export const BottomCarousel = ({
  games,
  selectedGame,
  onSelectGame,
  onJoin,
  joinedGameIds,
  chatOpenForGameId,
  onCloseChat,
  liveNowOpen = false,
  onCreateGame,
}: BottomCarouselProps) => {
  const isMobile = useIsMobile();
  const [radialMenuOpen, setRadialMenuOpen] = useState(false);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 pb-6 pt-12 bg-gradient-to-t from-[#0A0F1C] via-[#0A0F1C]/80 to-transparent pointer-events-none flex flex-col justify-end">
      {/* Event chat placeholder (opens after join) */}
      {chatOpenForGameId && (
        <div className="pointer-events-auto absolute left-4 right-4 bottom-48 rounded-2xl bg-slate-800 border border-slate-600 shadow-xl p-4 z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              Event chat
            </span>
            <button
              onClick={onCloseChat}
              className="p-1 rounded-full hover:bg-slate-700 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-slate-400 text-sm">
            Chat with participants will go here. (Placeholder for MVP.)
          </p>
        </div>
      )}

      {/* Live Now carousel: only when Live Now button is pressed */}
      {liveNowOpen && (
        <>
          <div className="flex justify-center mb-4 pointer-events-auto">
            <div
              className="w-12 h-1.5 rounded-full bg-slate-700 cursor-grab active:cursor-grabbing hover:bg-slate-600 transition-colors"
              role="presentation"
              aria-hidden
            />
          </div>

          <div
            className="flex gap-4 overflow-x-auto px-4 pb-4 snap-x snap-mandatory hide-scrollbars pointer-events-auto"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
        {games.map((game, idx) => {
          const isSelected = selectedGame?.id === game.id;
          const isJoined = joinedGameIds.has(game.id);
          return (
            <motion.div
              key={game.id}
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                delay: idx * 0.05,
                type: "spring",
                stiffness: 200,
                damping: 20,
              }}
              onClick={() => onSelectGame(game)}
              className={cn(
                "relative min-w-[280px] w-[85vw] max-w-[340px] h-[160px] rounded-3xl overflow-hidden shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] snap-center shrink-0 border flex flex-col justify-end bg-slate-900 cursor-pointer",
                isSelected
                  ? "border-orange-500/70 ring-2 ring-orange-500/30"
                  : "border-slate-700/50"
              )}
            >
              <div className="absolute inset-0 bg-slate-800 z-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-700 via-slate-800 to-slate-900" />

              <div className="relative z-20 p-4 w-full">
                <div className="flex justify-between items-start mb-2">
                  <span className="px-2.5 py-1 text-xs font-bold rounded-full flex items-center gap-1.5 uppercase tracking-wider backdrop-blur-md shadow-lg bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    <Flame className="w-3 h-3" />
                    Live Now
                  </span>
                  <span className="text-xs font-medium text-slate-300 flex items-center gap-1 bg-slate-900/60 backdrop-blur-md px-2 py-1 rounded-full border border-slate-700/50">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    {formatDistance(game.distance_km)}
                  </span>
                </div>

                <h3 className="text-lg font-black text-white mb-0.5 leading-tight tracking-tight drop-shadow-md">
                  {game.title}
                </h3>
                <p className="text-sm text-slate-300 font-medium mb-3 drop-shadow-md">
                  {game.sport} • {game.spots_needed} spots left
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center -space-x-2 drop-shadow-lg">
                    <div className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                      ?
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onJoin(game);
                    }}
                    disabled={isJoined}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 z-30",
                      isJoined
                        ? "bg-slate-600 text-slate-400 cursor-default"
                        : "bg-orange-500 text-slate-950 shadow-orange-500/30"
                    )}
                  >
                    {isJoined ? (
                      <span className="text-xs font-bold">In</span>
                    ) : (
                      <ChevronRight className="w-5 h-5" strokeWidth={3} />
                    )}
                  </button>
                </div>
              </div>

              <div className="absolute bottom-0 left-0 h-1 w-full blur-[2px] opacity-70 z-30 bg-orange-500" />
            </motion.div>
          );
        })}

            {/* Start a Game card (inside Live Now carousel) */}
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
              onClick={() => onCreateGame?.()}
              className="relative min-w-[200px] w-[60vw] h-[160px] rounded-3xl overflow-hidden snap-center shrink-0 border-2 border-dashed border-slate-700/50 flex flex-col items-center justify-center bg-slate-800/40 backdrop-blur-md cursor-pointer hover:bg-slate-800/60 transition-colors group pointer-events-auto"
            >
              <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 group-hover:text-emerald-400 group-hover:border-emerald-500/50 flex items-center justify-center mb-3 transition-colors border border-slate-700">
                <Plus className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">
                Start a Game
              </p>
            </motion.div>
          </div>
        </>
      )}

      {/* Mobile only: circular nav — center Map button reveals four others on press */}
      {isMobile && (
        <div className="flex justify-center mt-4 mb-4 pointer-events-auto relative z-[50]">
          <div className="relative w-28 h-28">
            {/* Backdrop: tap to close radial menu */}
            <AnimatePresence>
              {radialMenuOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-[45]"
                  aria-hidden
                  onClick={() => setRadialMenuOpen(false)}
                />
              )}
            </AnimatePresence>

            {/* Center = Map (active); press to open/close radial menu */}
            <motion.button
              type="button"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-slate-800/95 border-2 border-emerald-500/50 shadow-xl flex items-center justify-center text-emerald-400 hover:border-emerald-500 transition-colors z-10"
              aria-label={radialMenuOpen ? "Close menu" : "Map"}
              onClick={() => setRadialMenuOpen((v) => !v)}
              whileTap={{ scale: 0.95 }}
            >
              <MapPin className="w-6 h-6 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            </motion.button>

            {/* Four items: hidden until center is pressed; wrapper handles position so motion doesn't override translate */}
            <AnimatePresence>
              {radialMenuOpen &&
                NAV_ITEMS.filter((i) => i.id !== "map").map(({ id, label, Icon }, i) => {
                  const angle = (i / 4) * 360 - 90;
                  const r = 44;
                  const x = Math.cos((angle * Math.PI) / 180) * r;
                  const y = Math.sin((angle * Math.PI) / 180) * r;
                  return (
                    <div
                      key={id}
                      className="absolute w-11 h-11 flex items-center justify-center z-10"
                      style={{
                        left: `calc(50% + ${x}px)`,
                        top: `calc(50% + ${y}px)`,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <motion.button
                        type="button"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 24,
                          delay: 0.03 * i,
                        }}
                        className="w-11 h-11 rounded-full bg-slate-800/95 border border-slate-600 shadow-lg flex items-center justify-center text-slate-300 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors"
                        title={label}
                      >
                        <Icon className="w-5 h-5" />
                      </motion.button>
                    </div>
                  );
                })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
};
