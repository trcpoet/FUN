import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import {
  X,
  MapPin,
  ChevronRight,
  ChevronLeft,
  MessageCircle,
  Navigation,
  Share2,
  Info,
  Clock,
  Globe,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type { VenueSelection } from "./mapboxMapTypes";
import type { GameRow, MapNoteRow } from "../../lib/supabase";
import { formatVenueGameTimerSummary, isGameLive } from "../../lib/mapGameTimer";
import { haversineDistanceMeters } from "../lib/gamesAtVenue";
import { getSportIconEmoji } from "../map/gameSportIcons";
import { venueSportEmoji } from "../lib/venueSportIcon";
import { fetchVenueById, fetchVenueEnrichment } from "../../lib/api";
import { useRouteDirections } from "../../hooks/useRouteDirections";
import type { NavigateToOptions } from "../../lib/directions";
import { useModalA11y } from "../../hooks/useModalA11y";
import { usePressAnimation } from "../../hooks/usePressAnimation";
import { glassMessengerPanel } from "../styles/glass";
import {
  prettyLabel,
  formatCoords,
  normalizeWebsite,
  directionsHref,
  formatOpeningHours,
  formatGoogleRating,
  nextEnrichKey,
  osmHref,
} from "../lib/venueInfoHelpers";
import type { VenueGoogleDetails, VenuePhoto } from "../../lib/api";
import { deleteVenuePhoto, fetchVenuePhotos, reportVenuePhoto } from "../../lib/venueSocial";
import type { VenuePhotoRow } from "../../lib/venueSocial";
import { mergeVenuePhotos } from "../lib/venuePhotos";
import { StarRating } from "./ui/StarRating";
import { VenuePhotoCarousel } from "./venue/VenuePhotoCarousel";
import { VenuePhotoUploadPanel } from "./venue/VenuePhotoUploadPanel";
import { VenueFactGrid } from "./venue/VenueFactGrid";
import { VenueReviewsSection } from "./venue/VenueReviewsSection";
import { VenueCommentsSection } from "./venue/VenueCommentsSection";
import { GoogleMapsLinkButton } from "./GoogleMapsLinkButton";

type View = "actions" | "details";
type Tab = "games" | "notes";

type VenueInfoPopupProps = {
  /** Whether the modal is mounted/visible. */
  open: boolean;
  venue: VenueSelection;
  /**
   * Games sitting *on* this venue — the exact set its composite map pin absorbed, so the
   * badge on the map and the "At this venue" list here can never disagree. Pre-sorted
   * live-first by the caller.
   */
  gamesNearby?: GameRow[];
  /**
   * Games in the wider discovery ring around the venue. These keep their own map pins, so
   * they are listed under a separate "Nearby" heading rather than claimed as this venue's.
   */
  gamesNearbyRing?: GameRow[];
  /**
   * Notes left at this venue. They intentionally have no pin of their own — a note marker
   * is a DOM element and would cover the venue's GL icon and swallow its click — so this
   * modal is the only place they can be read.
   */
  notesAtVenue?: MapNoteRow[];
  /** Open a note's comment thread. */
  onOpenNote?: (note: MapNoteRow) => void;
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
  onNavigateTo?: (dest: { lat: number; lng: number }, opts?: NavigateToOptions) => void;
  /** Marks the viewer's own reviews, comments and photos. */
  currentUserId?: string | null;
  /** Opens the sign-in gate for guests instead of failing a write. */
  ensureSession?: () => Promise<boolean>;
};

const ICON_BTN =
  "p-2 rounded-full text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40";

/** Same button, but sitting on the hero image — needs its own scrim to stay legible. */
const HERO_ICON_BTN =
  "p-2 rounded-full bg-slate-950/70 text-slate-200 backdrop-blur-md hover:bg-slate-900/90 hover:text-white " +
  "transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40";

/** Matches the wording in NoteThreadDialog so a note reads the same wherever it appears. */
function noteVisibilityLabel(v: MapNoteRow["visibility"]): string {
  if (v === "friends") return "Friends";
  if (v === "private") return "Private";
  return "Public";
}

function noteCreatedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Recently";
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * One game in the venue's list.
 *
 * A live game is the thing a player most wants to spot, so it gets the loudest treatment the
 * card has: an emerald pulse chip, matching the LIVE badge used on the recommended-games list
 * and the map's live tone.
 */
function GameListRow({
  game,
  now,
  joined,
  onJoin,
  onChat,
  distanceLabel,
}: {
  game: GameRow;
  now: number;
  joined: boolean;
  onJoin?: (g: GameRow) => void;
  onChat?: (g: GameRow) => void;
  distanceLabel?: string;
}) {
  const live = isGameLive(game, now);
  const filled = game.participant_count ?? 0;
  const total = game.spots_needed;

  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-2">
      <span
        className={
          "flex size-10 shrink-0 items-center justify-center rounded-2xl text-2xl " +
          (live ? "bg-emerald-500/12" : "bg-violet-500/10")
        }
        aria-hidden
      >
        {getSportIconEmoji(game.sport)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-100">
            {game.title || "Pickup"}
          </span>
          {live ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />
              Live
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {formatVenueGameTimerSummary(game, now)}
          {distanceLabel ? ` · ${distanceLabel}` : ""}
        </p>
      </div>

      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400" aria-label={`${filled} of ${total} spots filled`}>
        {filled}/{total}
      </span>

      {joined ? (
        <button
          type="button"
          onClick={() => onChat?.(game)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-teal-600/90 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-500"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Chat
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onJoin?.(game)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-amber-600/90 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-500"
        >
          Join
          <ChevronRight className="h-3.5 w-3.5 opacity-80" />
        </button>
      )}
    </li>
  );
}

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
  gamesNearby = [],
  gamesNearbyRing = [],
  notesAtVenue = [],
  onOpenNote,
  joinedGameIds = new Set(),
  onClose,
  onCreateGame,
  onJoinGame,
  onOpenChat,
  viewerCoords = null,
  onNavigateTo,
  currentUserId = null,
  ensureSession,
}: VenueInfoPopupProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>("actions");
  const [tab, setTab] = useState<Tab>("games");
  const [details, setDetails] = useState<VenueSelection>(venue);
  const [now, setNow] = useState(() => Date.now());
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(venue.hero_image_url ?? null);
  const [photoAttributions, setPhotoAttributions] = useState<string[]>(
    venue.photo_attributions ?? []
  );
  const [enriching, setEnriching] = useState(false);
  const [enrichKey, setEnrichKey] = useState<string | null>(null);
  const [enrichPhotos, setEnrichPhotos] = useState<VenuePhoto[]>([]);
  const [googleDetails, setGoogleDetails] = useState<VenueGoogleDetails | null>(null);
  const [userPhotos, setUserPhotos] = useState<VenuePhotoRow[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Reset per-venue state if the selected venue changes while the modal stays mounted.
  useEffect(() => {
    setView("actions");
    // Open on whichever tab actually has something in it: a venue with notes and no games
    // would otherwise greet you with an empty list.
    setTab(
      gamesNearby.length === 0 && gamesNearbyRing.length === 0 && notesAtVenue.length > 0
        ? "notes"
        : "games"
    );
    setDetails(venue);
    setHeroImageUrl(venue.hero_image_url ?? null);
    setPhotoAttributions(venue.photo_attributions ?? []);
    setEnriching(false);
    setEnrichKey((k) => nextEnrichKey(k, venue.id, "venue-changed"));
    setEnrichPhotos([]);
    setGoogleDetails(null);
    setUserPhotos([]);
    setUploadOpen(false);
  }, [venue.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick for live game countdowns.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Focus trap + Escape + focus restore (replaces the manual Escape handler).
  useModalA11y(panelRef, open, onClose);

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
  //
  // Driven by `enrichKey`, which only the open-details handler writes. Nothing
  // this effect sets appears in its own dep array: an earlier version depended
  // on a flag it set itself, so the re-render tore the effect down and the
  // cleanup cancelled the in-flight fetch before it could ever resolve.
  useEffect(() => {
    if (!enrichKey) return;
    setEnriching(true);
    let cancelled = false;
    void fetchVenueEnrichment(enrichKey)
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (data.heroImageUrl) setHeroImageUrl(data.heroImageUrl);
        if (data.photoAttributions?.length) setPhotoAttributions(data.photoAttributions);
        if (data.photos?.length) setEnrichPhotos(data.photos);
        if (data.google) setGoogleDetails(data.google);
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
  }, [enrichKey]);

  // Opening details is the only thing that arms enrichment.
  const openDetails = useCallback(() => {
    setView("details");
    setEnrichKey((k) => nextEnrichKey(k, venue.id, "open-details"));
  }, [venue.id]);

  // Member photos load alongside enrichment, on the same open-details trigger.
  useEffect(() => {
    if (!enrichKey) return;
    let cancelled = false;
    void fetchVenuePhotos(enrichKey).then(({ data }) => {
      if (!cancelled) setUserPhotos(data);
    });
    return () => {
      cancelled = true;
    };
  }, [enrichKey]);

  /**
   * The gallery, merged from every source.
   *
   * `heroImageUrl` is the pre-v2 single-photo path and still feeds slide 0 for
   * rows that haven't been re-enriched yet; once `photos` arrives it supersedes
   * it, and mergeVenuePhotos de-duplicates by URL so the two cannot double up.
   */
  const gallery = useMemo(() => {
    const legacy: VenuePhoto[] =
      enrichPhotos.length === 0 && heroImageUrl
        ? [
            {
              source: (details.enrichment_source as VenuePhoto["source"]) || "google",
              url: heroImageUrl,
              attribution: photoAttributions[0] ?? null,
              attribution_url: null,
            },
          ]
        : [];
    return mergeVenuePhotos({
      enrichmentPhotos: enrichPhotos.length > 0 ? enrichPhotos : legacy,
      userPhotos,
      currentUserId,
    });
  }, [
    enrichPhotos,
    userPhotos,
    currentUserId,
    heroImageUrl,
    photoAttributions,
    details.enrichment_source,
  ]);

  const googleRating = formatGoogleRating(googleDetails?.rating, googleDetails?.userRatingCount);
  const osmLink = osmHref(details.id);

  const handleAddPhoto = async () => {
    if (ensureSession && !(await ensureSession())) return;
    setUploadOpen(true);
  };

  const handleDeletePhoto = async (photoId: string) => {
    const prev = userPhotos;
    setUserPhotos((p) => p.filter((x) => x.id !== photoId));
    const { error } = await deleteVenuePhoto(photoId);
    if (error) {
      setUserPhotos(prev);
      toast.error("Couldn't delete that photo", { description: error.message });
    }
  };

  const handleReportPhoto = async (photoId: string) => {
    if (ensureSession && !(await ensureSession())) return;
    const { error } = await reportVenuePhoto({ photoId });
    if (error) {
      toast.error("Couldn't report that photo", { description: error.message });
      return;
    }
    toast.success("Reported — thanks", { description: "We'll hide it if others agree." });
  };

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

  const operator = prettyLabel(details.operator);
  const hours = useMemo(() => formatOpeningHours(details.opening_hours), [details.opening_hours]);
  const websiteHref = normalizeWebsite(details.website);
  // Google's editorial summary is a real sentence about the place; Wikidata's
  // is usually a bare classifier ("sports venue in Texas"), so it plays backup.
  const description =
    googleDetails?.editorialSummary?.trim() || details.wikidata_description?.trim() || null;
  // Chips and amenity rows now live in VenueFactGrid; this only decides whether
  // to show the "nothing here yet" line, so it asks about the same inputs.
  const hasAnyDetails = Boolean(
    details.surface ||
      details.lit ||
      details.access ||
      details.tags ||
      googleDetails ||
      operator ||
      hours.length ||
      websiteHref ||
      description ||
      gallery.length
  );

  const totalGames = gamesNearby.length + gamesNearbyRing.length;

  /** Stands in for a missing photo — same glyph the venue draws on the map. */
  const venueEmoji = useMemo(
    () => venueSportEmoji(details.sport, details.leisure),
    [details.sport, details.leisure]
  );

  /**
   * Header summary — "0.4 mi away · 2 games · 1 note".
   *
   * Counts are tinted to match the map pin's badges and the tabs below (violet games, cyan
   * notes), so the same colour means the same thing from pin to card without a legend.
   */
  const viewerDistanceMiles = useMemo(() => {
    if (!viewerCoords) return null;
    const m = haversineDistanceMeters(
      viewerCoords.lat,
      viewerCoords.lng,
      details.center.lat,
      details.center.lng
    );
    return m / 1609.34;
  }, [viewerCoords, details.center.lat, details.center.lng]);

  const distanceMiles = (g: GameRow) => {
    const m = haversineDistanceMeters(details.center.lat, details.center.lng, g.lat, g.lng);
    return (m / 1609.34).toFixed(1);
  };

  const mapsHref = useMemo(
    () => directionsHref({ lat: details.center.lat, lng: details.center.lng }, viewerCoords),
    [viewerCoords, details.center.lat, details.center.lng]
  );

  const {
    summary: walkSummary,
    loading: walkLoading,
    result: walkResult,
  } = useRouteDirections({
    from: viewerCoords,
    to: details.center,
    enabled: open && Boolean(viewerCoords),
  });

  // One press scope per footer action — each animates its own element.
  const showRoutePress = usePressAnimation();
  const directionsPress = usePressAnimation();
  const createGamePress = usePressAnimation();

  const handleShowRoute = () => {
    // Hand over the route this popup already fetched for its ETA label — no second network call.
    onNavigateTo?.(
      { lat: details.center.lat, lng: details.center.lng },
      { result: walkResult, label: title }
    );
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
              {/*
                Hero band. Uses only `hero_image_url`, which is already on the venue row — the
                billed Google Photos call stays behind the Details view, exactly as before.
                With no photo, a sport-tinted wash carries the venue's own emoji so the card
                still opens on something rather than a grey rectangle.
              */}
              <div className="relative shrink-0 overflow-hidden">
                <div className="relative aspect-[16/7] w-full bg-gradient-to-br from-emerald-900/40 via-slate-900 to-violet-900/30">
                  {heroImageUrl ? (
                    <img
                      src={heroImageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-[64px] opacity-[0.18] select-none"
                      aria-hidden
                    >
                      {venueEmoji}
                    </div>
                  )}
                  {/* Scrim so the title stays legible over any photo. */}
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C] via-[#0A0F1C]/55 to-transparent"
                    aria-hidden
                  />
                </div>

                {/* Controls float over the image, top-right. */}
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetails();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-slate-950/70 px-3 py-1.5 text-sm font-medium text-emerald-300 backdrop-blur-md transition-colors hover:border-emerald-400/70 hover:bg-emerald-500/20 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
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
                    className={HERO_ICON_BTN}
                    aria-label="Share venue"
                    title="Share"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className={HERO_ICON_BTN}
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Title block sits on the scrim, mockup-style. */}
                <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
                  <h2 className="truncate text-lg font-semibold text-white drop-shadow-[0_1px_3px_rgba(2,6,23,0.9)]">
                    {title}
                  </h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-slate-300">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    {viewerDistanceMiles != null ? (
                      <span className="tabular-nums">{viewerDistanceMiles.toFixed(1)} mi away</span>
                    ) : (
                      <span className="truncate">{sub}</span>
                    )}
                    {totalGames > 0 ? (
                      <>
                        <span aria-hidden className="text-slate-600">·</span>
                        <span className="font-medium text-violet-300">
                          {totalGames} game{totalGames === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : null}
                    {notesAtVenue.length > 0 ? (
                      <>
                        <span aria-hidden className="text-slate-600">·</span>
                        <span className="font-medium text-cyan-300">
                          {notesAtVenue.length} note{notesAtVenue.length === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 scrollbar-hide">
                {/* Games are violet and notes are cyan everywhere else in the app — the create
                    modal's toggle, the note map marker, the composite pin's badges — so the
                    sliding indicator inherits that, and colour alone says which list you are
                    looking at. */}
                <div
                  role="tablist"
                  aria-label="Venue activity"
                  className="relative flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.04] p-1"
                >
                  {(
                    [
                      { key: "games" as const, label: "Games", count: totalGames },
                      { key: "notes" as const, label: "Notes", count: notesAtVenue.length },
                    ]
                  ).map(({ key, label, count }) => {
                    const selected = tab === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`venue-tab-${key}`}
                        aria-selected={selected}
                        aria-controls={`venue-panel-${key}`}
                        onClick={() => setTab(key)}
                        className={
                          "relative flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors " +
                          "focus-visible:outline-none focus-visible:ring-2 " +
                          (key === "games"
                            ? "focus-visible:ring-violet-400/40 "
                            : "focus-visible:ring-cyan-400/40 ") +
                          (selected
                            ? key === "games"
                              ? "text-violet-100"
                              : "text-cyan-100"
                            : "text-slate-400 hover:text-slate-200")
                        }
                      >
                        {selected ? (
                          <motion.span
                            layoutId="venue-tab-indicator"
                            transition={
                              reduceMotion
                                ? { duration: 0 }
                                : { type: "spring", stiffness: 420, damping: 34 }
                            }
                            className={
                              "absolute inset-0 -z-10 rounded-lg border " +
                              (key === "games"
                                ? "border-violet-400/50 bg-violet-500/20"
                                : "border-cyan-400/45 bg-cyan-400/12")
                            }
                            aria-hidden
                          />
                        ) : null}
                        {label}
                        <span
                          className={
                            "ml-1.5 tabular-nums " +
                            (selected
                              ? key === "games"
                                ? "text-violet-200/80"
                                : "text-cyan-200/80"
                              : "text-slate-500")
                          }
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {tab === "notes" ? (
                  <div
                    id="venue-panel-notes"
                    role="tabpanel"
                    aria-labelledby="venue-tab-notes"
                    className="mt-3 border-t border-white/10 pt-3"
                  >
                    {notesAtVenue.length > 0 ? (
                      <ul className="space-y-2">
                        {notesAtVenue.map((n) => (
                          <li key={n.id}>
                            <button
                              type="button"
                              onClick={() => onOpenNote?.(n)}
                              className="flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-2 text-left transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm text-slate-100">{n.body}</p>
                                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                                  {noteVisibilityLabel(n.visibility)}
                                  <span aria-hidden>·</span>
                                  {noteCreatedLabel(n.created_at)}
                                  {(n.comment_count ?? 0) > 0 ? (
                                    <>
                                      <span aria-hidden>·</span>
                                      <MessageCircle className="h-3 w-3 shrink-0" aria-hidden />
                                      {n.comment_count}
                                    </>
                                  ) : null}
                                </p>
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500">
                        No notes here yet. Leave the first one from the map.
                      </p>
                    )}
                  </div>
                ) : (
                <div id="venue-panel-games" role="tabpanel" aria-labelledby="venue-tab-games">
                  {totalGames > 0 ? (
                    <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                      {/*
                        Two sections, because they mean different things on the map: the first
                        set has no pins of its own (this card is the only way to reach them),
                        the second still does. Headings are dropped when only one set exists —
                        a lone "AT THIS VENUE" over the only list is noise.
                      */}
                      {gamesNearby.length > 0 ? (
                        <section>
                          {gamesNearbyRing.length > 0 ? (
                            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              At this venue
                            </p>
                          ) : null}
                          <ul className="space-y-2">
                            {gamesNearby.map((g) => (
                              <GameListRow
                                key={g.id}
                                game={g}
                                now={now}
                                joined={joinedGameIds.has(g.id)}
                                onJoin={onJoinGame}
                                onChat={onOpenChat}
                              />
                            ))}
                          </ul>
                        </section>
                      ) : null}

                      {gamesNearbyRing.length > 0 ? (
                        <section>
                          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            Nearby
                          </p>
                          <ul className="space-y-2">
                            {gamesNearbyRing.map((g) => (
                              <GameListRow
                                key={g.id}
                                game={g}
                                now={now}
                                joined={joinedGameIds.has(g.id)}
                                onJoin={onJoinGame}
                                onChat={onOpenChat}
                                distanceLabel={`${distanceMiles(g)} mi`}
                              />
                            ))}
                          </ul>
                        </section>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 border-t border-white/10 pt-3 text-sm text-slate-500">
                      No games here yet — start one below.
                    </p>
                  )}
                </div>
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
                      onClick={openDetails}
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
                    <motion.button
                      {...showRoutePress}
                      type="button"
                      initial={{ scale: 1 }}
                      onClick={handleShowRoute}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-emerald-300 transition-colors hover:border-emerald-400/70 hover:bg-emerald-500/15 cursor-pointer"
                    >
                      <Navigation className="w-4 h-4" aria-hidden />
                      Show route
                    </motion.button>
                  ) : (
                    <motion.a
                      {...directionsPress}
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ scale: 1 }}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-emerald-300 transition-colors hover:border-emerald-400/70 hover:bg-emerald-500/15 cursor-pointer"
                    >
                      <Navigation className="w-4 h-4" aria-hidden />
                      Directions
                    </motion.a>
                  )}
                  {onNavigateTo && viewerCoords ? (
                    <GoogleMapsLinkButton href={mapsHref} />
                  ) : null}
                  {onCreateGame ? (
                    <motion.button
                      {...createGamePress}
                      type="button"
                      initial={{ scale: 1 }}
                      onClick={() => {
                        onCreateGame(details);
                        onClose();
                      }}
                      className="inline-flex flex-1 items-center justify-center rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 cursor-pointer"
                    >
                      Create game
                    </motion.button>
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
                <VenuePhotoCarousel
                  photos={gallery}
                  fallbackEmoji={getSportIconEmoji(details.sport || details.leisure || "")}
                  title={title}
                  loading={enriching && gallery.length === 0}
                  onAddPhoto={() => void handleAddPhoto()}
                  onDeletePhoto={(photoId) => void handleDeletePhoto(photoId)}
                  onReportPhoto={(photoId) => void handleReportPhoto(photoId)}
                />

                {uploadOpen ? (
                  <VenuePhotoUploadPanel
                    venue={details}
                    onUploaded={(photo) => setUserPhotos((prev) => [photo, ...prev])}
                    onClose={() => setUploadOpen(false)}
                  />
                ) : null}

                <div className="px-4 pt-3">
                  <h2 className="text-lg font-semibold text-white">{title}</h2>
                  <p className="text-sm text-slate-400 mt-0.5">{sub}</p>
                  {googleRating ? (
                    // Google's aggregate stays visually separate from FUN's own
                    // reviews and is always labelled — Places terms forbid
                    // presenting the two as interchangeable.
                    <a
                      href={googleDetails?.googleMapsUri ?? mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-white/20 hover:text-white"
                    >
                      <StarRating value={googleDetails?.rating ?? null} size={10} />
                      <span className="tabular-nums">{googleRating}</span>
                      <span className="text-slate-500">on Google</span>
                    </a>
                  ) : null}
                </div>

                <VenueFactGrid venue={details} google={googleDetails} />

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

                <VenueReviewsSection
                  venue={details}
                  currentUserId={currentUserId}
                  ensureSession={ensureSession}
                />

                <VenueCommentsSection
                  venue={details}
                  currentUserId={currentUserId}
                  ensureSession={ensureSession}
                />

                {/* Fix-it-at-the-source link: most of the facts above come from
                    OSM, and editing there is the only way they ever improve. */}
                {osmLink ? (
                  <div className="mt-3 px-4">
                    <a
                      href={osmLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      View on OpenStreetMap
                      <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                    </a>
                  </div>
                ) : null}

                {/* Attribution — license requirement, footer text only (no link-out as primary). */}
                <p className="mt-4 px-4 text-[10px] text-slate-400">
                  Data © OpenStreetMap contributors{details.wikidata ? " · Wikidata" : ""}
                  {googleDetails ? " · Places data © Google" : ""}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
