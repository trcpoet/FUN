import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  X,
  MapPin,
  Activity,
  ChevronRight,
  ChevronLeft,
  MessageCircle,
  Navigation,
  Share2,
  Info,
  Clock,
  Globe,
  ExternalLink,
  Sun,
  Lock,
  Layers,
  Building2,
} from "lucide-react";
import type { VenueSelection } from "./mapboxMapTypes";
import type { GameRow } from "../../lib/supabase";
import { formatVenueGameTimerSummary } from "../../lib/mapGameTimer";
import { groupGamesBySport, haversineDistanceMeters } from "../lib/gamesAtVenue";
import { getSportIconEmoji } from "../map/gameSportIcons";
import { fetchVenueById, fetchVenueEnrichment } from "../../lib/api";
import { useRouteDirections } from "../../hooks/useRouteDirections";
import { glassMessengerPanel } from "../styles/glass";
import {
  prettyLabel,
  formatSurface,
  formatLit,
  formatAccess,
  formatCoords,
  normalizeWebsite,
  directionsHref,
  formatOpeningHours,
} from "../lib/venueInfoHelpers";

type View = "actions" | "details";

type VenueInfoPopupProps = {
  /** Whether the modal is mounted/visible. */
  open: boolean;
  venue: VenueSelection;
  openGamesNearbyCount: number;
  /** Open games within radius of venue (for per-sport list). */
  gamesNearby?: GameRow[];
  joinedGameIds?: Set<string>;
  onClose: () => void;
  onCreateGame?: (venue: VenueSelection) => void;
  /** Join a specific game at this venue (unlock chat). */
  onJoinGame?: (game: GameRow) => void;
  /** Open messenger for a game (user should already be joined for chat). */
  onOpenChat?: (game: GameRow) => void;
  /** Viewer location for directions shortcut. */
  viewerCoords?: { lat: number; lng: number } | null;
  /** Draw Mapbox walking route on the map. */
  onNavigateTo?: (dest: { lat: number; lng: number }) => void;
};

const ICON_BTN =
  "p-2 rounded-full text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40";

/**
 * Centered venue modal with two views inside one surface:
 *  - "actions" (default): open games, per-sport Join/Chat, Directions, Create game.
 *  - "details": OSM facts (chips/hours/operator/website) + lazy Wikidata hero/description.
 *
 * Wikidata enrichment (/api/venue-enrich) is fired ONLY when the details view first
 * opens — never on mount — so the common action-first flow stays cheap.
 */
export function VenueInfoPopup({
  open,
  venue,
  openGamesNearbyCount,
  gamesNearby = [],
  joinedGameIds = new Set(),
  onClose,
  onCreateGame,
  onJoinGame,
  onOpenChat,
  viewerCoords = null,
  onNavigateTo,
}: VenueInfoPopupProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>("actions");
  const [details, setDetails] = useState<VenueSelection>(venue);
  const [now, setNow] = useState(() => Date.now());
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(venue.hero_image_url ?? null);
  const [photoAttributions, setPhotoAttributions] = useState<string[]>(
    venue.photo_attributions ?? []
  );
  const [enriching, setEnriching] = useState(false);
  const [enrichRequested, setEnrichRequested] = useState(false);

  // Reset per-venue state if the selected venue changes while the modal stays mounted.
  useEffect(() => {
    setView("actions");
    setDetails(venue);
    setHeroImageUrl(venue.hero_image_url ?? null);
    setPhotoAttributions(venue.photo_attributions ?? []);
    setEnriching(false);
    setEnrichRequested(false);
  }, [venue.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick for live game countdowns.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Close on Escape; focus the panel on open for keyboard users.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lightweight load on open: full OSM row (+ any already-cached hero/description).
  // This is a direct table read, NOT the /api/venue-enrich call.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchVenueById(venue.id).then(({ data }) => {
      if (cancelled || !data) return;
      setDetails((prev) => ({ ...prev, ...data, center: prev.center }));
      if (data.hero_image_url) setHeroImageUrl(data.hero_image_url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, venue.id]);

  // Lazy Wikidata enrichment — only the first time the details view is opened.
  useEffect(() => {
    if (view !== "details" || enrichRequested) return;
    setEnrichRequested(true);
    setEnriching(true);
    let cancelled = false;
    void fetchVenueEnrichment(venue.id)
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (data.heroImageUrl) setHeroImageUrl(data.heroImageUrl);
        if (data.photoAttributions?.length) setPhotoAttributions(data.photoAttributions);
        setDetails((prev) => ({
          ...prev,
          hero_image_url: data.heroImageUrl ?? prev.hero_image_url,
          wikidata_label: data.label ?? prev.wikidata_label,
          wikidata_description: data.description ?? prev.wikidata_description,
          photo_attributions: data.photoAttributions ?? prev.photo_attributions,
          enrichment_source: data.source ?? prev.enrichment_source,
        }));
      })
      .finally(() => {
        if (!cancelled) setEnriching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, enrichRequested, venue.id]);

  const name = prettyLabel(details.name) ?? prettyLabel(details.wikidata_label);
  const sportLabel = prettyLabel(details.sport);
  const leisureLabel = prettyLabel(details.leisure);
  const title =
    name ?? (sportLabel && leisureLabel ? `${sportLabel} ${leisureLabel}` : sportLabel ?? leisureLabel ?? "Sports venue");

  const sub = useMemo(() => {
    const s = prettyLabel(details.sport);
    const l = prettyLabel(details.leisure);
    if (s && l) return `${s} · ${l}`;
    return s || l || "Pickup games nearby";
  }, [details.sport, details.leisure]);

  const chips = useMemo(() => {
    const items: { key: string; label: string; icon: React.ReactNode }[] = [];
    const surface = formatSurface(details.surface);
    if (surface) items.push({ key: "surface", label: surface, icon: <Layers className="w-3 h-3" /> });
    const lit = formatLit(details.lit);
    if (lit) items.push({ key: "lit", label: lit, icon: <Sun className="w-3 h-3" /> });
    const access = formatAccess(details.access);
    if (access) items.push({ key: "access", label: access, icon: <Lock className="w-3 h-3" /> });
    return items;
  }, [details.surface, details.lit, details.access]);

  const operator = prettyLabel(details.operator);
  const hours = useMemo(() => formatOpeningHours(details.opening_hours), [details.opening_hours]);
  const websiteHref = normalizeWebsite(details.website);
  const description = details.wikidata_description?.trim() || null;
  const hasAnyDetails = Boolean(
    chips.length || operator || hours.length || websiteHref || description || heroImageUrl
  );

  const bySport = useMemo(() => groupGamesBySport(gamesNearby), [gamesNearby]);
  const sportKeys = useMemo(() => [...bySport.keys()].sort((a, b) => a.localeCompare(b)), [bySport]);

  const distanceMiles = (g: GameRow) => {
    const m = haversineDistanceMeters(details.center.lat, details.center.lng, g.lat, g.lng);
    return (m / 1609.34).toFixed(1);
  };

  const mapsHref = useMemo(
    () => directionsHref({ lat: details.center.lat, lng: details.center.lng }, viewerCoords),
    [viewerCoords, details.center.lat, details.center.lng]
  );

  const { summary: walkSummary, loading: walkLoading } = useRouteDirections({
    from: viewerCoords,
    to: details.center,
    enabled: open && Boolean(viewerCoords),
  });

  const handleShowRoute = () => {
    onNavigateTo?.({ lat: details.center.lat, lng: details.center.lng });
  };

  const handleShare = async () => {
    const coordsLine = `📍 ${formatCoords(details.center.lat, details.center.lng)}`;
    const text = [title, sub, coordsLine, mapsHref].filter(Boolean).join("\n");
    const shareData: ShareData = { title, text, url: mapsHref };
    const canNativeShare =
      typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(shareData));
    if (canNativeShare) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this venue link:", mapsHref);
    }
  };

  const viewTransition = reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" as const };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
        className={glassMessengerPanel(
          "relative flex w-full max-w-md max-h-[85vh] flex-col overflow-hidden rounded-2xl outline-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <AnimatePresence mode="wait" initial={false}>
          {view === "actions" ? (
            <motion.div
              key="actions"
              initial={{ opacity: 0, x: reduceMotion ? 0 : -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduceMotion ? 0 : -12 }}
              transition={viewTransition}
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-white truncate">{title}</h2>
                  <p className="text-sm text-slate-400 mt-0.5 truncate">{sub}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setView("details");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-300 transition-colors hover:border-emerald-400/70 hover:bg-emerald-500/15 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                    aria-label="Venue info"
                    title="Venue info"
                  >
                    <Info className="w-4 h-4" aria-hidden />
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleShare();
                    }}
                    className={ICON_BTN}
                    aria-label="Share venue"
                    title="Share"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={onClose} className={ICON_BTN} aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 scrollbar-hide">
                <div className="flex items-center gap-2 text-slate-300 text-sm">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${openGamesNearbyCount > 0 ? "bg-emerald-400" : "bg-slate-600"}`}
                    aria-hidden
                  />
                  <Activity className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                  <span className="font-medium">
                    {openGamesNearbyCount} open game{openGamesNearbyCount === 1 ? "" : "s"}
                  </span>
                  <span className="text-slate-500 text-xs">near this venue</span>
                </div>

                {gamesNearby.length > 0 ? (
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">Games by sport</p>
                    <ul className="space-y-2">
                      {sportKeys.map((sportKey) => {
                        const list = bySport.get(sportKey) ?? [];
                        return (
                          <li key={sportKey}>
                            <p className="text-xs text-emerald-400/90 font-semibold mb-1 flex items-center gap-1.5">
                              <span aria-hidden>{getSportIconEmoji(sportKey)}</span>
                              {sportKey}
                              <span className="text-slate-500 font-normal">({list.length})</span>
                            </p>
                            <ul className="space-y-1 pl-0.5">
                              {list.map((g) => {
                                const joined = joinedGameIds.has(g.id);
                                return (
                                  <li
                                    key={g.id}
                                    className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm text-slate-100 truncate">{g.title || "Pickup"}</p>
                                      <p className="text-[11px] text-slate-500">
                                        {formatVenueGameTimerSummary(g, now)} · {distanceMiles(g)} mi
                                      </p>
                                    </div>
                                    {joined ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenChat?.(g)}
                                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600/90 hover:bg-teal-500 text-white text-xs font-medium cursor-pointer transition-colors"
                                      >
                                        <MessageCircle className="w-3.5 h-3.5" />
                                        Chat
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => onJoinGame?.(g)}
                                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-medium cursor-pointer transition-colors"
                                      >
                                        Join
                                        <ChevronRight className="w-3.5 h-3.5 opacity-80" />
                                      </button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-3 border-t border-white/10 pt-3 text-sm text-slate-500">
                    No open games here yet — start one below.
                  </p>
                )}

                {hours.length > 0 || websiteHref ? (
                  <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">At a glance</p>
                    {hours.length > 0 ? (
                      <div className="flex items-start gap-2 text-sm text-slate-300">
                        <Clock className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" aria-hidden />
                        <span className="min-w-0 break-words">{hours.join(" · ")}</span>
                      </div>
                    ) : null}
                    {websiteHref ? (
                      <a
                        href={websiteHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-fit items-center gap-2 text-sm text-slate-300 transition-colors hover:text-white"
                      >
                        <Globe className="w-4 h-4 shrink-0 text-emerald-400" aria-hidden />
                        Visit website
                        <ExternalLink className="w-3.5 h-3.5 opacity-60" aria-hidden />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setView("details")}
                      className="inline-flex w-fit items-center gap-1 text-sm font-medium text-emerald-400 transition-colors hover:text-emerald-300 cursor-pointer"
                    >
                      More details
                      <ChevronRight className="w-4 h-4" aria-hidden />
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Footer actions */}
              <div className="flex flex-col gap-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {viewerCoords && (walkSummary || walkLoading) ? (
                  <p className="text-center text-xs text-slate-400 tabular-nums">
                    {walkLoading ? "Calculating walk time…" : walkSummary}
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  {onNavigateTo && viewerCoords ? (
                    <button
                      type="button"
                      onClick={handleShowRoute}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-emerald-300 transition-colors hover:border-emerald-400/70 hover:bg-emerald-500/15 cursor-pointer"
                    >
                      <Navigation className="w-4 h-4" aria-hidden />
                      Show route
                    </button>
                  ) : (
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-emerald-300 transition-colors hover:border-emerald-400/70 hover:bg-emerald-500/15 cursor-pointer"
                    >
                      <Navigation className="w-4 h-4" aria-hidden />
                      Directions
                    </a>
                  )}
                  {onNavigateTo && viewerCoords ? (
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-slate-400 transition-colors hover:text-white hover:bg-white/5"
                      title="Open in Google Maps"
                    >
                      Maps
                    </a>
                  ) : null}
                  {onCreateGame ? (
                    <button
                      type="button"
                      onClick={() => {
                        onCreateGame(details);
                        onClose();
                      }}
                      className="inline-flex flex-1 items-center justify-center rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 cursor-pointer"
                    >
                      Create game
                    </button>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: reduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduceMotion ? 0 : 12 }}
              transition={viewTransition}
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* Details header with back navigation */}
              <div className="flex items-center justify-between gap-2 px-2 py-2">
                <button
                  type="button"
                  onClick={() => setView("actions")}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                  aria-label="Back to games"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleShare()}
                    className={ICON_BTN}
                    aria-label="Share venue"
                    title="Share"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={onClose} className={ICON_BTN} aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide pb-[max(1rem,env(safe-area-inset-bottom))]">
                {/* Hero — gradient fallback, skeleton while enriching, image when available */}
                <div className="relative mx-4 aspect-[16/9] overflow-hidden rounded-xl bg-gradient-to-br from-emerald-900/40 via-slate-900 to-violet-900/30">
                  {heroImageUrl ? (
                    <img
                      src={heroImageUrl}
                      alt={`Photo of ${title}`}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : enriching ? (
                    <div className="absolute inset-0 animate-pulse bg-white/5" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-80" aria-hidden>
                      {getSportIconEmoji(details.sport || details.leisure || "")}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C] via-transparent to-transparent" />
                </div>
                {photoAttributions.length > 0 ? (
                  <p className="mx-4 mt-1 text-[10px] leading-snug text-slate-500">
                    Photo: {photoAttributions.join(", ")}
                  </p>
                ) : null}

                <div className="px-4 pt-3">
                  <h2 className="text-lg font-semibold text-white">{title}</h2>
                  <p className="text-sm text-slate-400 mt-0.5">{sub}</p>
                </div>

                {/* Chips */}
                {chips.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 px-4">
                    {chips.map((chip) => (
                      <span
                        key={chip.key}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-slate-200"
                      >
                        <span className="text-emerald-400">{chip.icon}</span>
                        {chip.label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Fact rows */}
                <div className="mt-3 space-y-2.5 px-4 text-sm text-slate-300">
                  {operator ? (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 shrink-0 text-slate-500" aria-hidden />
                      <span className="text-slate-400">Operated by</span>
                      <span className="font-medium text-slate-200 truncate">{operator}</span>
                    </div>
                  ) : null}

                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" aria-hidden />
                    {hours.length > 0 ? (
                      <div className="min-w-0">
                        <p className="text-slate-400 text-xs uppercase tracking-wide font-medium">Hours</p>
                        <div className="mt-0.5 font-mono text-[12px] leading-relaxed text-slate-200">
                          {hours.map((line, i) => (
                            <div key={i} className="break-words">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500">Hours not listed</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 shrink-0 text-slate-500" aria-hidden />
                    <span className="text-slate-400">{formatCoords(details.center.lat, details.center.lng)}</span>
                  </div>
                </div>

                {/* Description */}
                {description ? (
                  <p className="mt-3 px-4 text-sm leading-relaxed text-slate-300">{description}</p>
                ) : enriching ? (
                  <div className="mt-3 space-y-2 px-4" aria-hidden>
                    <div className="h-3 w-full animate-pulse rounded bg-white/5" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
                  </div>
                ) : !hasAnyDetails ? (
                  <p className="mt-3 px-4 text-sm text-slate-500">No extra details for this court yet.</p>
                ) : null}

                {/* Website CTA */}
                {websiteHref ? (
                  <div className="mt-4 px-4">
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-emerald-500/40 hover:bg-white/[0.06] cursor-pointer"
                    >
                      <Globe className="w-4 h-4 text-emerald-400" aria-hidden />
                      Visit website
                      <ExternalLink className="w-3.5 h-3.5 opacity-60" aria-hidden />
                    </a>
                  </div>
                ) : null}

                {/* Attribution — license requirement, footer text only (no link-out as primary). */}
                <p className="mt-4 px-4 text-[10px] text-slate-600">
                  Data © OpenStreetMap contributors{details.wikidata ? " · Wikidata" : ""}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
