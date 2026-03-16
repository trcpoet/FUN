import React, { useState, useRef, useEffect } from 'react';
import { Search, Filter, MapPin, Activity, Calendar, Users, Settings, Navigation } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useIsMobile } from './ui/use-mobile';

const NAV_ITEMS = [
  { id: 'map', label: 'Map', Icon: MapPin, active: true },
  { id: 'activity', label: 'Activity', Icon: Activity, active: false },
  { id: 'events', label: 'Events', Icon: Calendar, active: false },
  { id: 'social', label: 'Social', Icon: Users, active: false },
  { id: 'settings', label: 'Settings', Icon: Settings, active: false },
];

export type TopNavigationProps = {
  liveNowOpen?: boolean;
  onLiveNowToggle?: () => void;
  onCenterOnUser?: () => void;
};

export const TopNavigation = (props: TopNavigationProps) => {
  const { liveNowOpen = false, onLiveNowToggle, onCenterOnUser } = props;
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Shrink search when clicking outside (e.g. on the map)
  useEffect(() => {
    if (!searchExpanded) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (searchWrapRef.current && !searchWrapRef.current.contains(target)) {
        setSearchExpanded(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [searchExpanded]);

  return (
    <div className="absolute top-0 left-0 right-0 z-50 pt-12 px-4 pb-4 bg-gradient-to-b from-[#0A0F1C]/90 via-[#0A0F1C]/50 to-transparent pointer-events-none">
      <div className="flex flex-col items-end gap-2 pointer-events-auto">
        {/* Row: search, profile, filter */}
        <div ref={searchWrapRef} className="flex items-center justify-end gap-3 w-full">
          <div className="flex items-center justify-end flex-1 min-w-0">
            <AnimatePresence mode="wait">
              {searchExpanded ? (
                <motion.div
                  key="search-bar"
                  initial={{ width: 48, opacity: 0 }}
                  animate={{ width: '100%', opacity: 1 }}
                  exit={{ width: 48, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="relative flex items-center h-12 overflow-hidden"
                >
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-emerald-400">
                    <Search className="w-5 h-5 shrink-0" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search sports, venues, players..."
                    autoFocus
                    className="w-full h-full pl-10 pr-4 rounded-full bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 shadow-lg text-[15px] font-medium"
                  />
                </motion.div>
              ) : (
                <motion.button
                  key="search-icon"
                  type="button"
                  onClick={() => setSearchExpanded(true)}
                  className="w-12 h-12 rounded-full border border-slate-700/50 bg-slate-800/60 backdrop-blur-xl flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors shadow-lg shrink-0"
                  aria-label="Open search"
                >
                  <Search className="w-5 h-5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Filter button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="w-12 h-12 rounded-full border border-slate-700/50 bg-slate-800/60 backdrop-blur-md shrink-0 flex items-center justify-center text-slate-300 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors shadow-lg"
            aria-label="Filter"
          >
            <Filter className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Row 1: Live Now + Menu (one line). Row 2: Location icon under them. */}
        <div className="relative flex flex-col items-end gap-1.5 w-full">
          {/* One line: Live Now + Menu */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onLiveNowToggle}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors",
                liveNowOpen
                  ? "bg-orange-500/30 text-orange-300 border-orange-500 shadow-orange-500/20"
                  : "bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-orange-500/20"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              Live Now
            </button>

            {!isMobile && (
              <>
                <button
                  type="button"
                  onClick={() => setNavOpen((v) => !v)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors",
                    navOpen
                      ? "bg-slate-600/80 text-white border-slate-500"
                      : "text-slate-400 hover:text-white border-slate-600 hover:border-slate-500 bg-slate-800/60"
                  )}
                >
                  Menu
                </button>
                {navOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[55]"
                      aria-hidden
                      onClick={() => setNavOpen(false)}
                    />
                    <div className="absolute top-full right-0 mt-2 w-52 rounded-xl bg-slate-800/95 border border-slate-600 shadow-xl py-2 z-[60] pointer-events-auto backdrop-blur-md">
                      {NAV_ITEMS.map(({ id, label, Icon, active }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setNavOpen(false)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg",
                            active ? "text-emerald-400 bg-emerald-500/10" : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                          )}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Location icon under Live Now + Menu */}
          {onCenterOnUser && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={onCenterOnUser}
              className="w-10 h-10 rounded-full border border-slate-700/50 bg-slate-800/60 backdrop-blur-md flex items-center justify-center text-slate-300 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors shadow-lg"
              aria-label="Center map on my location"
            >
              <Navigation className="w-5 h-5" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

