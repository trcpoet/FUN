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
  Clock,
} from "lucide-react";
import { format } from "date-fns";
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
  /** Fly to the game on the map and open the join modal (does not join). */
  onOpenGame: (game: GameRow) => void;
  joinedGameIds: Set<string>;
  /** Used to show Host vs In on cards (hosts are in game_participants but aren’t “guest joins”). */
  currentUserId?: string | null;
  liveNowOpen?: boolean;
};

export const BottomCarousel = ({
  games,
  selectedGame,
  onSelectGame,
  onOpenGame,
  joinedGameIds,
  currentUserId = null,
  liveNowOpen = false,
}: BottomCarouselProps) => {
  const isMobile = useIsMobile();
  const [radialMenuOpen, setRadialMenuOpen] = useState(false);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 pb-6 pt-12 bg-gradient-to-t from-[#0A0F1C] via-[#0A0F1C]/80 to-transparent pointer-events-none flex flex-col justify-end">
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
          const isHost = Boolean(currentUserId) && game.created_by === currentUserId;
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

              <div className="relative z-20 p-3 w-full">
                <div className="flex justify-between items-start mb-1.5">
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full flex items-center gap-1 uppercase tracking-wider backdrop-blur-md shadow-lg bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    <Flame className="w-2.5 h-2.5" />
                    Live Now
                  </span>
                  <span className="text-[11px] font-medium text-slate-300 flex items-center gap-1 bg-slate-900/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-slate-700/50">
                    <MapPin className="w-2.5 h-2.5 text-slate-400" />
                    {formatDistance(game.distance_km)}
                  </span>
                </div>

                <h3 className="text-[15px] font-black text-white mb-0.5 leading-tight tracking-tight drop-shadow-md">
                  {game.title}
                </h3>
                {game.description?.trim() ? (
                  <p className="text-[11px] text-slate-400 leading-snug mb-1 line-clamp-2 drop-shadow-md">
                    {game.description.trim()}
                  </p>
                ) : null}
                <p className="text-[13px] text-slate-300 font-medium mb-1 drop-shadow-md">
                  {game.sport} •{" "}
                  {game.spots_remaining != null
                    ? `${game.spots_remaining} spots left`
                    : `${game.spots_needed} player cap`}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400 mb-2">
                  <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {game.starts_at
                      ? format(new Date(game.starts_at), "MMM d, h:mm a")
                      : "Time TBD"}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5" />
                    {game.location_label?.trim()
                      ? game.location_label
                      : `${game.lat.toFixed(2)}°, ${game.lng.toFixed(2)}°`}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center -space-x-2 drop-shadow-lg">
                    <div className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                      ?
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenGame(game);
                    }}
                    className={cn(
                      "flex items-center justify-center w-9 h-9 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 z-30",
                      isJoined
                        ? isHost
                          ? "bg-amber-600/30 text-amber-200 border border-amber-500/40 cursor-pointer"
                          : "bg-slate-600 text-slate-400 cursor-pointer"
                        : "bg-orange-500 text-slate-950 shadow-orange-500/30"
                    )}
                  >
                    {isJoined ? (
                      <span className="text-[10px] font-bold leading-tight text-center px-0.5">
                        {isHost ? "Host" : "In"}
                      </span>
                    ) : (
                      <ChevronRight className="w-4 h-4" strokeWidth={3} />
                    )}
                  </button>
                </div>
              </div>

              <div className="absolute bottom-0 left-0 h-1 w-full blur-[2px] opacity-70 z-30 bg-orange-500" />
            </motion.div>
          );
        })}

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
