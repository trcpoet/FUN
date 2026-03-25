import React, { useState, useRef, useEffect } from 'react';
import { Search, Filter, MapPin, Activity, Calendar, Users, Settings, Navigation, MapPinned, X, MessageCircle, UserRound } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useIsMobile } from './ui/use-mobile';
import type { ForwardGeocodeFeature } from '../../lib/geocoding';
import type { ProfileSearchRow } from '../../lib/supabase';
import type { SearchSectionId } from '../../lib/mergeSearchResults';
import { sportEmojiFor } from '../../lib/sportDisplay';

const NAV_ITEMS = [
  { id: 'map', label: 'Map', Icon: MapPin, active: true },
  { id: 'activity', label: 'Activity', Icon: Activity, active: false },
  { id: 'events', label: 'Events', Icon: Calendar, active: false },
  { id: 'social', label: 'Social', Icon: Users, active: false },
  { id: 'settings', label: 'Settings', Icon: Settings, active: false },
];

/** Glass morphism for map toolbar round controls (search, filter). */
const MAP_GLASS_ICON_BTN =
  "w-12 h-12 rounded-full shrink-0 flex items-center justify-center transition-all duration-200 " +
  "border border-white/20 bg-gradient-to-b from-white/[0.2] to-white/[0.04] " +
  "backdrop-blur-2xl backdrop-saturate-150 " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_36px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.05)] " +
  "text-slate-200 hover:text-emerald-300 " +
  "hover:border-emerald-400/45 hover:from-emerald-500/18 hover:to-white/[0.08] " +
  "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_14px_44px_rgba(16,185,129,0.18)]";

/** Same glass look, smaller (location + game chats). */
const MAP_GLASS_ICON_BTN_SM_BASE =
  "w-10 h-10 rounded-full shrink-0 flex items-center justify-center transition-all duration-200 " +
  "border border-white/20 bg-gradient-to-b from-white/[0.2] to-white/[0.04] " +
  "backdrop-blur-2xl backdrop-saturate-150 " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_28px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.05)] " +
  "text-slate-200 ";

const MAP_GLASS_ICON_BTN_SM_EMERALD =
  MAP_GLASS_ICON_BTN_SM_BASE +
  "hover:text-emerald-300 hover:border-emerald-400/45 hover:from-emerald-500/18 hover:to-white/[0.08] " +
  "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_12px_40px_rgba(16,185,129,0.18)]";

const MAP_GLASS_ICON_BTN_SM_SKY =
  MAP_GLASS_ICON_BTN_SM_BASE +
  "hover:text-sky-300 hover:border-sky-400/45 hover:from-sky-500/18 hover:to-white/[0.08] " +
  "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_12px_40px_rgba(14,165,233,0.18)]";

export type SportSearchHitRow = {
  sport: string;
  nearbyCount: number;
  matchKind: string;
};

export type UnifiedMapSearchBarProps = {
  query: string;
  onQueryChange: (q: string) => void;
  onClear: () => void;
  placesLoading: boolean;
  places: ForwardGeocodeFeature[];
  sportHits: SportSearchHitRow[];
  peopleLoading: boolean;
  people: ProfileSearchRow[];
  sectionOrder: SearchSectionId[];
  playersNearMe: boolean;
  onPickPlace: (f: ForwardGeocodeFeature) => void;
  onPickSport: (sport: string) => void;
  onPickPerson: (p: ProfileSearchRow) => void;
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
  /** Unified search: places + sports + people (pass from App). */
  mapSearch?: UnifiedMapSearchBarProps | null;
};

function placeSubtitle(placeName: string): string | undefined {
  const i = placeName.indexOf(',');
  if (i === -1) return undefined;
  return placeName.slice(i + 1).trim() || undefined;
}

const SECTION_LABEL: Record<SearchSectionId, string> = {
  places: 'Places',
  sports: 'Sports & games',
  people: 'People',
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
                      placeholder="Places, sports, or people…"
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

                  {mapSearch && mapSearch.query.trim().length === 1 && !mapSearch.placesLoading && !mapSearch.peopleLoading && (
                    <p className="text-xs text-slate-500 px-3">Type at least 2 characters — results load as you pause typing.</p>
                  )}

                  {mapSearch && mapSearch.playersNearMe && (
                    <p className="text-xs text-sky-400/90 px-3">
                      Showing people near the map anchor. Turn on location if the list is empty.
                    </p>
                  )}

                  {mapSearch &&
                    (mapSearch.placesLoading ||
                      mapSearch.peopleLoading ||
                      mapSearch.places.length > 0 ||
                      mapSearch.sportHits.length > 0 ||
                      mapSearch.people.length > 0 ||
                      (mapSearch.query.trim().length >= 2 &&
                        !mapSearch.placesLoading &&
                        !mapSearch.peopleLoading &&
                        mapSearch.places.length === 0 &&
                        mapSearch.sportHits.length === 0 &&
                        mapSearch.people.length === 0)) && (
                      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/95 backdrop-blur-xl shadow-2xl max-h-[min(22rem,50vh)] overflow-y-auto py-2 text-left">
                        {(mapSearch.placesLoading || mapSearch.peopleLoading) &&
                          (mapSearch.query.trim().length >= 2 || mapSearch.playersNearMe) && (
                          <SearchResultsSkeleton />
                        )}

                        {mapSearch.sectionOrder.map((section) => {
                          if (section === 'places') {
                            if (mapSearch.places.length === 0) return null;
                            return (
                              <div key="places" className="px-2 pt-1 border-b border-slate-800/80 pb-2 mb-1">
                                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                  {SECTION_LABEL.places}
                                </p>
                                <ul className="space-y-0.5">
                                  {mapSearch.places.map((f) => {
                                    const sub = placeSubtitle(f.place_name);
                                    return (
                                      <li key={f.id}>
                                        <button
                                          type="button"
                                          onClick={() => mapSearch.onPickPlace(f)}
                                          className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-slate-200 hover:bg-slate-800/90 transition-colors flex items-start gap-2"
                                        >
                                          <MapPinned className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                                          <span className="min-w-0">
                                            <span className="block font-medium leading-snug">
                                              {sub ? f.place_name.slice(0, f.place_name.indexOf(',')).trim() : f.place_name}
                                            </span>
                                            {sub ? <span className="block text-xs text-slate-500 mt-0.5">{sub}</span> : null}
                                          </span>
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            );
                          }
                          if (section === 'sports') {
                            if (mapSearch.sportHits.length === 0) return null;
                            return (
                              <div key="sports" className="px-2 pt-1 border-b border-slate-800/80 pb-2 mb-1">
                                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                  {SECTION_LABEL.sports}
                                </p>
                                <ul className="space-y-0.5">
                                  {mapSearch.sportHits.map((h) => (
                                    <li key={h.sport}>
                                      <button
                                        type="button"
                                        onClick={() => mapSearch.onPickSport(h.sport)}
                                        className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-slate-200 hover:bg-emerald-500/10 transition-colors flex items-start gap-3"
                                      >
                                        <span className="text-lg shrink-0 mt-0.5" aria-hidden>
                                          {sportEmojiFor(h.sport)}
                                        </span>
                                        <span className="min-w-0">
                                          <span className="block font-medium text-slate-100">{h.sport}</span>
                                          <span className="block text-xs text-slate-500 mt-0.5">
                                            {h.nearbyCount > 0
                                              ? `${h.nearbyCount} game${h.nearbyCount === 1 ? '' : 's'} in current radius`
                                              : 'No games in radius — still filter the map to this sport'}
                                          </span>
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          }
                          if (section === 'people') {
                            if (mapSearch.people.length === 0) return null;
                            return (
                              <div key="people" className="px-2 pt-1 pb-1">
                                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                  {SECTION_LABEL.people}
                                </p>
                                <ul className="space-y-0.5">
                                  {mapSearch.people.map((p) => {
                                    const title = p.display_name?.trim() || 'Player';
                                    const handle = p.handle?.replace(/^@/, '') || '';
                                    const bits = [handle ? `@${handle}` : null, p.city, p.favorite_sport].filter(Boolean);
                                    const sub = bits.join(' · ');
                                    const dist =
                                      p.distance_km != null && Number.isFinite(p.distance_km)
                                        ? `${p.distance_km < 10 ? p.distance_km.toFixed(1) : Math.round(p.distance_km)} km`
                                        : null;
                                    return (
                                      <li key={p.profile_id}>
                                        <button
                                          type="button"
                                          onClick={() => mapSearch.onPickPerson(p)}
                                          className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-slate-200 hover:bg-violet-500/10 transition-colors flex items-start gap-3"
                                        >
                                          <div className="relative shrink-0 mt-0.5 size-9 rounded-full overflow-hidden bg-slate-800 border border-slate-600/80">
                                            {p.avatar_url?.trim() ? (
                                              <img src={p.avatar_url} alt="" className="size-full object-cover" />
                                            ) : (
                                              <div className="size-full flex items-center justify-center text-slate-500">
                                                <UserRound className="w-4 h-4" />
                                              </div>
                                            )}
                                          </div>
                                          <span className="min-w-0 flex-1">
                                            <span className="block font-medium text-slate-100 truncate">{title}</span>
                                            {sub ? (
                                              <span className="block text-xs text-slate-500 mt-0.5 truncate">{sub}</span>
                                            ) : null}
                                            {dist ? (
                                              <span className="block text-[11px] text-slate-600 mt-0.5">{dist} away</span>
                                            ) : null}
                                          </span>
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            );
                          }
                          return null;
                        })}

                        {mapSearch.query.trim().length >= 2 &&
                          !mapSearch.placesLoading &&
                          !mapSearch.peopleLoading &&
                          mapSearch.places.length === 0 &&
                          mapSearch.sportHits.length === 0 &&
                          mapSearch.people.length === 0 &&
                          !mapSearch.playersNearMe && (
                            <p className="px-4 py-3 text-sm text-slate-500">
                              No matches in places, sports, or people. Try another spelling or name.
                            </p>
                          )}

                        {mapSearch.playersNearMe &&
                          !mapSearch.peopleLoading &&
                          mapSearch.people.length === 0 && (
                            <p className="px-4 py-3 text-sm text-slate-500">
                              No players found near this map area. Pan the map or enable location.
                            </p>
                          )}
                      </div>
                    )}
                </motion.div>
              ) : (
                <motion.button
                  key="search-icon"
                  type="button"
                  onClick={() => setSearchExpanded(true)}
                  className={MAP_GLASS_ICON_BTN}
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
            className={MAP_GLASS_ICON_BTN}
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
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold",
                    "border border-border/80 bg-popover/70 backdrop-blur-xl",
                    "shadow-[var(--shadow-control)]",
                    "transition-[color,background-color,border-color,box-shadow,transform] duration-[var(--dur-hover)] ease-[var(--ease-out)]",
                    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0F1C]",
                    navOpen
                      ? "text-foreground border-ring/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
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
                    <div className="absolute top-full right-0 mt-2 w-56 rounded-2xl bg-popover/95 border border-border/80 shadow-[var(--shadow-panel)] py-2 z-[60] pointer-events-auto backdrop-blur-xl">
                      {NAV_ITEMS.map(({ id, label, Icon, active }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setNavOpen(false)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg",
                            active
                              ? "text-primary bg-accent"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/70"
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
                className={MAP_GLASS_ICON_BTN_SM_EMERALD}
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
                className={cn("relative", MAP_GLASS_ICON_BTN_SM_SKY)}
                aria-label="Game chats"
              >
                <MessageCircle className="w-5 h-5" />
                {joinedGameCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500 text-[10px] font-bold text-white flex items-center justify-center border-2 border-[#0A0F1C] shadow-sm">
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

