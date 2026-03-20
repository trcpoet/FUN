import React, { useState, useRef, useEffect } from 'react';
import { Search, Filter, MapPin, Activity, Calendar, Users, Settings, Navigation, MapPinned, X, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useIsMobile } from './ui/use-mobile';
import type { ForwardGeocodeFeature } from '../../lib/geocoding';

const NAV_ITEMS = [
  { id: 'map', label: 'Map', Icon: MapPin, active: true },
  { id: 'activity', label: 'Activity', Icon: Activity, active: false },
  { id: 'events', label: 'Events', Icon: Calendar, active: false },
  { id: 'social', label: 'Social', Icon: Users, active: false },
  { id: 'settings', label: 'Settings', Icon: Settings, active: false },
];

export type MapSearchBarProps = {
  query: string;
  onQueryChange: (q: string) => void;
  geocodeLoading: boolean;
  geocodeResults: ForwardGeocodeFeature[];
  onPickGeocode: (f: ForwardGeocodeFeature) => void;
  sportSuggestion: { sport: string; label: string } | null;
  onPickSport: (sport: string) => void;
  onClear: () => void;
};

export type TopNavigationProps = {
  liveNowOpen?: boolean;
  onLiveNowToggle?: () => void;
  onCenterOnUser?: () => void;
  onOpenFilters?: () => void;
  /** Open game chat inbox (threads for joined games). */
  onOpenMessages?: () => void;
  /** Badge on messenger (e.g. number of joined games). */
  joinedGameCount?: number;
  /** Wired search: debounced geocode + sport hints (pass from App). */
  mapSearch?: MapSearchBarProps | null;
};

function SearchResultsSkeleton() {
  return (
    <div className="px-2 py-1 space-y-2" role="status" aria-label="Loading results">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-11 rounded-xl bg-slate-700/40 animate-pulse"
          style={{ animationDelay: `${i * 75}ms` }}
        />
      ))}
    </div>
  );
}

export const TopNavigation = (props: TopNavigationProps) => {
  const {
    liveNowOpen = false,
    onLiveNowToggle,
    onCenterOnUser,
    onOpenFilters,
    onOpenMessages,
    joinedGameCount = 0,
    mapSearch = null,
  } = props;
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
                  className="relative flex flex-col w-full gap-2 z-[70]"
                >
                  <div className="relative flex items-center h-12 shrink-0">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-emerald-400">
                      <Search className="w-5 h-5 shrink-0" />
                    </div>
                    <input
                      type="text"
                      placeholder="Place or sport (e.g. Brooklyn, Soccer)…"
                      autoFocus
                      value={mapSearch?.query ?? ''}
                      onChange={(e) => mapSearch?.onQueryChange(e.target.value)}
                      className="w-full h-full pl-10 pr-11 rounded-full bg-slate-800/90 backdrop-blur-xl border border-slate-700/50 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 shadow-lg text-[15px] font-medium"
                    />
                    {(mapSearch?.query?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => mapSearch?.onClear()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/80 transition-colors"
                        aria-label="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {mapSearch && mapSearch.query.trim().length === 1 && !mapSearch.geocodeLoading && (
                    <p className="text-xs text-slate-500 px-3">Type at least 2 characters — results load as you pause typing.</p>
                  )}

                  {mapSearch &&
                    (mapSearch.geocodeLoading ||
                      mapSearch.geocodeResults.length > 0 ||
                      mapSearch.sportSuggestion) && (
                      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/95 backdrop-blur-xl shadow-2xl max-h-64 overflow-y-auto py-2 text-left">
                        {mapSearch.sportSuggestion && (
                          <button
                            type="button"
                            onClick={() => mapSearch.onPickSport(mapSearch.sportSuggestion!.sport)}
                            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-emerald-500/10 border-b border-slate-800/80 transition-colors"
                          >
                            <span className="mt-0.5 text-emerald-400 shrink-0">
                              <Activity className="w-4 h-4" />
                            </span>
                            <span>
                              <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-400/90">
                                Sport
                              </span>
                              <span className="text-sm text-slate-100 font-medium">{mapSearch.sportSuggestion.label}</span>
                              <span className="block text-xs text-slate-500 mt-0.5">
                                Over 5 km away: fly to the closest game. Within 5 km: show every match on the map.
                              </span>
                            </span>
                          </button>
                        )}

                        {mapSearch.geocodeLoading && mapSearch.query.trim().length >= 2 && <SearchResultsSkeleton />}

                        {!mapSearch.geocodeLoading && mapSearch.geocodeResults.length > 0 && (
                          <div className="px-2 pt-1">
                            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              Places
                            </p>
                            <ul className="space-y-0.5">
                              {mapSearch.geocodeResults.map((f) => (
                                <li key={f.id}>
                                  <button
                                    type="button"
                                    onClick={() => mapSearch.onPickGeocode(f)}
                                    className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-slate-200 hover:bg-slate-800/90 transition-colors flex items-start gap-2"
                                  >
                                    <MapPinned className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                                    <span>{f.place_name}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {!mapSearch.geocodeLoading &&
                          mapSearch.query.trim().length >= 2 &&
                          mapSearch.geocodeResults.length === 0 &&
                          !mapSearch.sportSuggestion && (
                            <p className="px-4 py-3 text-sm text-slate-500">No place matches. Try another spelling.</p>
                          )}
                      </div>
                    )}
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
            type="button"
            className="w-12 h-12 rounded-full border border-slate-700/50 bg-slate-800/60 backdrop-blur-md shrink-0 flex items-center justify-center text-slate-300 hover:text-emerald-400 hover:border-emerald-500/50 transition-colors shadow-lg"
            aria-label="Filter"
            onClick={onOpenFilters}
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

          {/* Location, then game chats — stacked under Live Now row */}
          <div className="flex flex-col items-end gap-1.5">
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
            {onOpenMessages && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={onOpenMessages}
                className="relative w-10 h-10 rounded-full border border-slate-700/50 bg-slate-800/60 backdrop-blur-md flex items-center justify-center text-slate-300 hover:text-sky-400 hover:border-sky-500/50 transition-colors shadow-lg"
                aria-label="Game chats"
              >
                <MessageCircle className="w-5 h-5" />
                {joinedGameCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500 text-[10px] font-bold text-white flex items-center justify-center border-2 border-[#0A0F1C]">
                    {joinedGameCount > 9 ? "9+" : joinedGameCount}
                  </span>
                )}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

