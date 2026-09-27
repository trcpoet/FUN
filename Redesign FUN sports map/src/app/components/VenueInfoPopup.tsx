import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  X,
  MapPin,
  Navigation,
  Share2,
  Bookmark,
  StickyNote,
  Globe,
  ExternalLink,
  KeyRound,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "./ui/utils";
import type { VenueSelection } from "./mapboxMapTypes";
import type { GameRow, MapNoteRow } from "../../lib/supabase";
import { formatVenueGameTimerSummary, isGameLive } from "../../lib/mapGameTimer";
import { haversineDistanceMeters } from "../lib/gamesAtVenue";
import { getSportIconEmoji } from "../map/gameSportIcons";
import { venueSportEmoji } from "../lib/venueSportIcon";
import { venueAccessTier } from "../lib/venueAccess";
import { noteCreatedLabel, noteVisibilityLabel } from "../lib/noteVisibility";
import {
  fetchSavedVenueIds,
  fetchVenueById,
  fetchVenueEnrichment,
  getGamesAtVenue,
  toggleSavedVenue,
} from "../../lib/api";
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
  nextEnrichKey,
  osmHref,
} from "../lib/venueInfoHelpers";
import type { VenueGameRow, VenueGoogleDetails, VenuePhoto } from "../../lib/api";
import { deleteVenuePhoto, fetchVenuePhotos, fetchVenueReviews, reportVenuePhoto } from "../../lib/venueSocial";
import type { VenuePhotoRow } from "../../lib/venueSocial";
import { mergeVenuePhotos } from "../lib/venuePhotos";
import { VenuePhotoCarousel } from "./venue/VenuePhotoCarousel";
import { VenuePhotoUploadPanel } from "./venue/VenuePhotoUploadPanel";
import { VenueOpenChip } from "./venue/VenueOpenChip";
import { VenueRatingLine } from "./venue/VenueRatingLine";
import { VenuePlayedHere } from "./venue/VenuePlayedHere";
import { VenueFactGrid } from "./venue/VenueFactGrid";
import { VenueReviewsSection } from "./venue/VenueReviewsSection";
import { VenueCommentsSection } from "./venue/VenueCommentsSection";
import { GoogleMapsLinkButton } from "./GoogleMapsLinkButton";
import { GameActionBar } from "./game/GameActionBar";
import { GameStatusChip } from "./game/GameStatusChip";
import { gameViewerRole } from "../lib/gameViewerRole";

/**
 * One card, four tabs.
 *
 * This used to be two screens: a compact card, and a separate "details" view
 * behind an ℹ️ pill with its own Back button. Six kinds of content across two
 * screens meant the photos, the rating, the facts and the reviews were all one
 * tap and one context switch away, and the card had two headers. Merged, with
 * the tab strip doing the work — four labels still fit a phone, where one long
 * stacked scroll would not.
 */
type Tab = "games" | "notes" | "reviews" | "about";

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
  /** Leave a note at this venue. Same shape as onCreateGame; App opens the same sheet. */
  onCreateNote?: (venue: VenueSelection) => void;
  /** Join a specific game at this venue (unlock chat). */
  onJoinGame?: (game: GameRow) => void;
  /** Leave a game listed here. */
  onLeaveGame?: (game: GameRow) => void;
  /** Open messenger for a game (user should already be joined for chat). */
  onOpenChat?: (game: GameRow) => void;
  /**
   * Open a listed game's full card. Games absorbed by this venue's composite pin have no pin
   * of their own, so without this the card — walk time, roster, Start/End/Delete — is only
   * reachable while the game happens to sit inside the live strip's 3-hour window.
   */
  onOpenGameDetails?: (game: GameRow) => void;
  /**
   * Host-only controls for games listed here. Without these a host could see their own game
   * at a venue but had no way to start, end or delete it — the map popup was the only place
   * those existed.
   */
  onStartHostedGame?: (game: GameRow) => Promise<void> | void;
  onEndHostedGame?: (game: GameRow) => Promise<void> | void;
  onDeleteHostedGame?: (game: GameRow) => Promise<boolean> | void;
  /** Viewer location for directions shortcut. */
  viewerCoords?: { lat: number; lng: number } | null;
  /** Draw Mapbox walking route on the map. */
  onNavigateTo?: (dest: { lat: number; lng: number }, opts?: NavigateToOptions) => void;
  /** Marks the viewer's own reviews, comments and photos. */
  currentUserId?: string | null;
  /** Opens the sign-in gate for guests instead of failing a write. */
  ensureSession?: () => Promise<boolean>;
};

/** Same button, but sitting on the hero image — needs its own scrim to stay legible. */
const HERO_ICON_BTN =
  "p-2 rounded-full bg-slate-950/70 text-slate-200 backdrop-blur-md hover:bg-slate-900/90 hover:text-white " +
  "transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40";

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
  currentUserId,
  onJoin,
  onLeave,
  onChat,
  onOpenDetails,
  onStart,
  onEnd,
  onDelete,
  distanceLabel,
}: {
  game: GameRow;
  now: number;
  joined: boolean;
  currentUserId: string | null;
  onJoin?: (g: GameRow) => void;
  onLeave?: (g: GameRow) => void;
  onChat?: (g: GameRow) => void;
  onOpenDetails?: (g: GameRow) => void;
  onStart?: (g: GameRow) => Promise<void> | void;
  onEnd?: (g: GameRow) => Promise<void> | void;
  onDelete?: (g: GameRow) => Promise<boolean> | void;
  distanceLabel?: string;
}) {
  const live = isGameLive(game, now);
  const filled = game.participant_count ?? 0;
  const total = game.spots_needed;

  // No `hostGameIds` here — the venue modal only ever receives `currentUserId`, so the role
  // helper falls back to `created_by`, the same test the live strip uses.
  const role = gameViewerRole(game, {
    currentUserId,
    joinedGameIds: joined ? new Set([game.id]) : new Set<string>(),
    nowMs: now,
  });

  // The whole row opens the game's card, because for a game absorbed by this venue's pin
  // there is no other way in. Same shape as the messenger's inbox rows: a role="button"
  // container with the action strip stopping propagation so its buttons still fire.
  const openDetails = onOpenDetails ? () => onOpenDetails(game) : undefined;

  return (
    <li
      role={openDetails ? "button" : undefined}
      tabIndex={openDetails ? 0 : undefined}
      onClick={openDetails}
      onKeyDown={
        openDetails
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openDetails();
              }
            }
          : undefined
      }
      aria-label={openDetails ? `${game.title || "Pickup"} — open game details` : undefined}
      className={
        "flex flex-wrap items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-2 outline-none" +
        (openDetails
          ? " cursor-pointer transition-colors hover:border-cyan-300/20 hover:bg-white/[0.055] focus-visible:ring-2 focus-visible:ring-cyan-500/40"
          : "")
      }
    >
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
          <GameStatusChip game={game} nowMs={now} size="xs" />
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {formatVenueGameTimerSummary(game, now)}
          {distanceLabel ? ` · ${distanceLabel}` : ""}
        </p>
      </div>

      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400" aria-label={`${filled} of ${total} spots filled`}>
        {filled}/{total}
      </span>

      {/* Buttons keep their own meaning — without this the row would swallow every one. */}
      <span onClick={(e) => e.stopPropagation()} className="contents">
        <GameActionBar
          game={game}
          role={role}
          density="compact"
          onJoin={onJoin}
          onLeave={onLeave}
          onChat={onChat}
          onOpenDetails={onOpenDetails}
          onStart={onStart}
          onEnd={onEnd}
          onDelete={onDelete}
        />
      </span>
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
  onCreateNote,
  onJoinGame,
  onLeaveGame,
  onOpenChat,
  onOpenGameDetails,
  onStartHostedGame,
  onEndHostedGame,
  onDeleteHostedGame,
  viewerCoords = null,
  onNavigateTo,
  currentUserId = null,
  ensureSession,
}: VenueInfoPopupProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("games");
  const [details, setDetails] = useState<VenueSelection>(venue);
  /**
   * Hours, website and the hero now arrive from the single-row read rather than
   * riding along on every pin in the viewport (see osmVenueColumns.ts). That is
   * ~300ms after open, so the card says so instead of rearranging itself.
   */
  const [detailsLoading, setDetailsLoading] = useState(true);
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
  /** "Played here" — our own DB, so it loads with the card rather than on a tab. */
  const [playedHere, setPlayedHere] = useState<VenueGameRow[]>([]);
  const [playedHereLoading, setPlayedHereLoading] = useState(true);
  /** FUN's own rating aggregate for the header line. One row, not the list. */
  const [funReviews, setFunReviews] = useState<{ avg: number | null; count: number }>({
    avg: null,
    count: 0,
  });
  /** null until we know; avoids a bookmark that flickers filled on open. */
  const [saved, setSaved] = useState<boolean | null>(null);
  const [savingVenue, setSavingVenue] = useState(false);

  // Reset per-venue state if the selected venue changes while the modal stays mounted.
  useEffect(() => {
    // Open on whichever tab actually has something in it: a venue with notes and no games
    // would otherwise greet you with an empty list.
    setTab(
      gamesNearby.length === 0 && gamesNearbyRing.length === 0 && notesAtVenue.length > 0
        ? "notes"
        : "games"
    );
    setDetails(venue);
    setDetailsLoading(true);
    setHeroImageUrl(venue.hero_image_url ?? null);
    setPhotoAttributions(venue.photo_attributions ?? []);
    setEnriching(false);
    setEnrichKey((k) => nextEnrichKey(k, venue.id, "venue-changed"));
    setEnrichPhotos([]);
    setGoogleDetails(null);
    setUserPhotos([]);
    setUploadOpen(false);
    setPlayedHere([]);
    setPlayedHereLoading(true);
    setFunReviews({ avg: null, count: 0 });
    setSaved(null);
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
      if (cancelled) return;
      setDetailsLoading(false);
      if (!data) return;
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

  /**
   * Arm the billed Google enrichment.
   *
   * `/api/venue-enrich` is a Places call, so it stays behind an explicit
   * intent rather than firing on every venue tap. With the details view gone
   * that intent is "opened the About or Reviews tab" — the only two places its
   * output is rendered. The rating and open/closed in the header come from the
   * `google_details` column already on the row, so the header needs nothing.
   */
  const armEnrichment = useCallback(() => {
    setEnrichKey((k) => (k ? k : nextEnrichKey(k, venue.id, "open-details")));
  }, [venue.id]);

  /**
   * "Played here" and the FUN rating aggregate.
   *
   * Both read our own Postgres, not Google, so they load with the card rather
   * than waiting for a tab: the rating belongs in the header, and the history
   * is the venue's most distinguishing fact. `getGamesAtVenue` swallows a
   * missing RPC, and `fetchVenueReviews` returns an empty summary the same way,
   * so neither can break a card.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPlayedHereLoading(true);
    void getGamesAtVenue({
      lat: venue.center.lat,
      lng: venue.center.lng,
      radiusM: 150,
      includeCompleted: true,
      limit: 30,
    }).then((r) => {
      if (cancelled) return;
      setPlayedHereLoading(false);
      setPlayedHere(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, venue.id, venue.center.lat, venue.center.lng]);

  useEffect(() => {
    if (!open || !currentUserId) return;
    let cancelled = false;
    void fetchSavedVenueIds([venue.id]).then((ids) => {
      if (!cancelled) setSaved(ids.has(venue.id));
    });
    return () => {
      cancelled = true;
    };
  }, [open, venue.id, currentUserId]);

  const handleToggleSave = async () => {
    if (savingVenue) return;
    if (ensureSession && !(await ensureSession())) return;
    setSavingVenue(true);
    // Optimistic: the bookmark is the feedback, so it must not wait on a round-trip.
    const next = !(saved ?? false);
    setSaved(next);
    const { saved: confirmed, error } = await toggleSavedVenue(venue.id);
    setSavingVenue(false);
    if (error) {
      setSaved(!next);
      toast.error("Couldn't save that", { description: error.message });
      return;
    }
    setSaved(confirmed);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // limit 1: the aggregate repeats on every row, so one is enough for the header.
    void fetchVenueReviews({ venueId: venue.id, limit: 1 }).then(({ summary }) => {
      if (cancelled) return;
      setFunReviews({ avg: summary.average, count: summary.count });
    });
    return () => {
      cancelled = true;
    };
  }, [open, venue.id]);

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

  /**
   * The type line under the name.
   *
   * OSM packs multiple sports into one semicolon-joined value, so a leisure
   * centre arrives as "basketball;volleyball;climbing;martial_arts;gymnastics;
   * weightlifting;hiking;cycling" — which, printed whole, is a wall of text that
   * gets ellipsised mid-word and tells you nothing. Lead with two and count the
   * rest; the full list is in the About tab's amenities.
   */
  const sub = useMemo(() => {
    const sports = (details.sport ?? "")
      .split(";")
      .map((x) => prettyLabel(x.trim()))
      .filter((x): x is string => Boolean(x));
    const l = prettyLabel(details.leisure);

    const s =
      sports.length > 2
        ? `${sports.slice(0, 2).join(", ")} +${sports.length - 2}`
        : sports.join(", ");

    if (s && l) return `${s} · ${l}`;
    return s || l || "Pickup games nearby";
  }, [details.sport, details.leisure]);

  const operator = prettyLabel(details.operator);
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
      Boolean(details.opening_hours?.trim()) ||
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
   * Whether this venue may host a game, and what to say if not.
   *
   * `hidden` venues are filtered out of the map layer, so the only way to land on one here is a
   * shared link or a stale selection — which is exactly why the gate lives on the verdict rather
   * than on "did this render as a pin".
   */
  const accessVerdict = useMemo(
    () => venueAccessTier({ access: details.access, leisure: details.leisure, name: details.name }),
    [details.access, details.leisure, details.name]
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

  /** Arm the billed enrichment the first time a tab that renders it is opened. */
  const selectTab = (next: Tab) => {
    setTab(next);
    if (next === "about" || next === "reviews") armEnrichment();
  };

  const TAB_META: { key: Tab; label: string; count?: number; accent: string }[] = [
    { key: "games", label: "Games", count: totalGames, accent: "violet" },
    { key: "notes", label: "Notes", count: notesAtVenue.length, accent: "cyan" },
    { key: "reviews", label: "Reviews", count: funReviews.count || undefined, accent: "amber" },
    { key: "about", label: "About", accent: "slate" },
  ];

  const ACCENT: Record<string, { text: string; pill: string; ring: string; count: string }> = {
    violet: {
      text: "text-violet-100",
      pill: "border-violet-400/50 bg-violet-500/20",
      ring: "focus-visible:ring-violet-400/40",
      count: "text-violet-200/80",
    },
    cyan: {
      text: "text-cyan-100",
      pill: "border-cyan-400/45 bg-cyan-400/12",
      ring: "focus-visible:ring-cyan-400/40",
      count: "text-cyan-200/80",
    },
    amber: {
      text: "text-amber-100",
      pill: "border-amber-400/45 bg-amber-400/15",
      ring: "focus-visible:ring-amber-400/40",
      count: "text-amber-200/80",
    },
    slate: {
      text: "text-slate-100",
      pill: "border-white/20 bg-white/[0.08]",
      ring: "focus-visible:ring-white/30",
      count: "text-slate-300",
    },
  };

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
        {/*
          Photo strip. Full-bleed and short — the card has five other things to
          fit above the tabs, and the old feature-sized hero was the reason the
          details view existed at all. Works from `hero_image_url` on the row,
          so it costs nothing until someone opens About and arms enrichment.
        */}
        <div className="relative shrink-0">
          <VenuePhotoCarousel
            compact
            photos={gallery}
            fallbackEmoji={venueEmoji}
            title={title}
            loading={enriching && gallery.length === 0}
            onAddPhoto={() => void handleAddPhoto()}
            onDeletePhoto={(photoId) => void handleDeletePhoto(photoId)}
            onReportPhoto={(photoId) => void handleReportPhoto(photoId)}
          />
          <div className="absolute right-2 top-2 flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleToggleSave();
              }}
              className={HERO_ICON_BTN}
              aria-label={saved ? "Remove from saved" : "Save venue"}
              aria-pressed={saved ?? false}
              title={saved ? "Saved" : "Save"}
            >
              <Bookmark
                className={cn("w-5 h-5", saved ? "fill-primary text-primary" : "")}
                aria-hidden
              />
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
            <button type="button" onClick={onClose} className={HERO_ICON_BTN} aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Header. Everything that decides whether you would go, above the fold. */}
        <div className="shrink-0 px-4 pb-3 pt-3">
          <h2 className="truncate text-lg font-semibold text-white">{title}</h2>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-slate-400">
            <span className="truncate">{sub}</span>
            {/* Renders nothing unless the hours can be answered honestly. */}
            <VenueOpenChip
              key={detailsLoading ? "loading" : "ready"}
              spec={details.opening_hours}
              googleOpenNow={googleDetails?.openNow ?? details.google_details?.openNow ?? null}
              now={new Date(now)}
            />
          </p>

          {/*
            The lean map row carries nine columns; hours, google_details and the
            rest arrive ~300ms later with fetchVenueById. Hold the space rather
            than letting two lines pop in under the title.
          */}
          {detailsLoading ? (
            <div className="mt-1.5 space-y-1.5" aria-hidden>
              <div className="h-3 w-40 animate-pulse rounded bg-white/5" />
              <div className="h-3 w-28 animate-pulse rounded bg-white/5" />
            </div>
          ) : null}

          <VenueRatingLine
            className="mt-1.5"
            funRating={funReviews.avg}
            funCount={funReviews.count}
            googleRating={googleDetails?.rating ?? details.google_details?.rating ?? null}
            googleCount={
              googleDetails?.userRatingCount ?? details.google_details?.userRatingCount ?? null
            }
            onOpenReviews={() => selectTab("reviews")}
          />

          {/*
            Distance and walk time together. They used to be 250 lines apart —
            distance on the hero scrim, walk time down in the footer — and the
            scrim showed distance INSTEAD of the venue type, so having a location
            cost you the sport line entirely.
          */}
          {viewerDistanceMiles != null || walkSummary || walkLoading ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13px] text-slate-400">
              {viewerDistanceMiles != null ? (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {viewerDistanceMiles.toFixed(1)} mi
                </span>
              ) : null}
              {viewerDistanceMiles != null && (walkSummary || walkLoading) ? (
                <span aria-hidden className="text-slate-600">·</span>
              ) : null}
              {walkLoading ? (
                <span className="text-slate-500">calculating walk…</span>
              ) : walkSummary ? (
                <span className="tabular-nums">{walkSummary}</span>
              ) : null}
            </p>
          ) : null}

          {accessVerdict.advisory ? (
            <div
              className={`mt-2.5 flex items-start gap-2.5 rounded-xl px-3 py-2 ${
                accessVerdict.tier === "restricted"
                  ? "bg-amber-500/10 text-amber-300"
                  : "bg-surface-1 text-slate-300"
              }`}
            >
              {accessVerdict.tier === "restricted" ? (
                <KeyRound className="mt-0.5 w-4 h-4 shrink-0" aria-hidden />
              ) : (
                <Lock className="mt-0.5 w-4 h-4 shrink-0" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-tight">{accessVerdict.advisory}</p>
                {accessVerdict.advisoryDetail ? (
                  <p className="mt-0.5 text-xs leading-snug opacity-80">
                    {accessVerdict.advisoryDetail}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* One action row, where Share used to be on the hero and Directions in the footer. */}
          <div className="mt-3 flex items-center gap-2">
            {onNavigateTo && viewerCoords ? (
              <motion.button
                {...showRoutePress}
                type="button"
                initial={{ scale: 1 }}
                onClick={handleShowRoute}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-surface-2 px-3 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-surface-3 cursor-pointer"
              >
                <Navigation className="w-4 h-4" aria-hidden />
                Route
              </motion.button>
            ) : (
              <motion.a
                {...directionsPress}
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ scale: 1 }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-surface-2 px-3 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-surface-3 cursor-pointer"
              >
                <Navigation className="w-4 h-4" aria-hidden />
                Directions
              </motion.a>
            )}
            {onNavigateTo && viewerCoords ? <GoogleMapsLinkButton href={mapsHref} /> : null}
            {onCreateGame && accessVerdict.canCreateGame ? (
              <motion.button
                {...createGamePress}
                type="button"
                initial={{ scale: 1 }}
                onClick={() => {
                  onCreateGame(details);
                  onClose();
                }}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--glow-md)] transition hover:bg-primary-container cursor-pointer"
              >
                Start game
              </motion.button>
            ) : null}
            {onCreateNote ? (
              <button
                type="button"
                onClick={() => {
                  onCreateNote(details);
                  onClose();
                }}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-slate-300 transition-colors hover:bg-surface-3 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                aria-label="Leave a note at this venue"
                title="Leave a note"
              >
                <StickyNote className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        {/* Tabs + scrolling body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] scrollbar-hide">
          <div
            role="tablist"
            aria-label="Venue"
            className="sticky top-0 z-10 -mx-1 flex items-center gap-1 rounded-xl bg-surface-1/95 p-1 backdrop-blur"
          >
            {TAB_META.map(({ key, label, count, accent }) => {
              const selected = tab === key;
              const a = ACCENT[accent];
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  id={`venue-tab-${key}`}
                  aria-selected={selected}
                  aria-controls={`venue-panel-${key}`}
                  onClick={() => selectTab(key)}
                  className={
                    "relative flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 " +
                    a.ring +
                    " " +
                    (selected ? a.text : "text-slate-400 hover:text-slate-200")
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
                      className={"absolute inset-0 -z-10 rounded-lg border " + a.pill}
                      aria-hidden
                    />
                  ) : null}
                  {label}
                  {count ? (
                    <span className={"ml-1 tabular-nums " + (selected ? a.count : "text-slate-500")}>
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {tab === "games" ? (
            <div id="venue-panel-games" role="tabpanel" aria-labelledby="venue-tab-games" className="pt-3">
              {gamesNearby.length > 0 || gamesNearbyRing.length > 0 ? (
                <div className="space-y-3">
                  {gamesNearby.length > 0 ? (
                    <div className="space-y-2">
                      {gamesNearbyRing.length > 0 ? (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          At this venue
                        </p>
                      ) : null}
                      {gamesNearby.map((game) => (
                        <GameListRow
                          key={game.id}
                          game={game}
                          now={now}
                          joined={joinedGameIds.has(game.id)}
                          currentUserId={currentUserId}
                          onJoin={onJoinGame}
                          onLeave={onLeaveGame}
                          onChat={onOpenChat}
                          onOpenDetails={onOpenGameDetails}
                          onStart={onStartHostedGame}
                          onEnd={onEndHostedGame}
                          onDelete={onDeleteHostedGame}
                        />
                      ))}
                    </div>
                  ) : null}
                  {gamesNearbyRing.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Nearby
                      </p>
                      {gamesNearbyRing.map((game) => (
                        <GameListRow
                          key={game.id}
                          game={game}
                          now={now}
                          distanceLabel={distanceMiles(game)}
                          joined={joinedGameIds.has(game.id)}
                          currentUserId={currentUserId}
                          onJoin={onJoinGame}
                          onLeave={onLeaveGame}
                          onChat={onOpenChat}
                          onOpenDetails={onOpenGameDetails}
                          onStart={onStartHostedGame}
                          onEnd={onEndHostedGame}
                          onDelete={onDeleteHostedGame}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="py-2 text-sm text-slate-500">No games here yet.</p>
              )}

              <VenuePlayedHere
                rows={playedHere}
                loading={playedHereLoading}
                className="mt-4 border-t border-white/[0.06] pt-3"
              />
            </div>
          ) : null}

          {tab === "notes" ? (
            <div id="venue-panel-notes" role="tabpanel" aria-labelledby="venue-tab-notes" className="pt-3">
              {notesAtVenue.length > 0 ? (
                <ul className="space-y-2">
                  {notesAtVenue.map((note) => (
                    <li key={note.id}>
                      <button
                        type="button"
                        onClick={() => onOpenNote?.(note)}
                        disabled={!onOpenNote}
                        className="w-full rounded-xl bg-surface-1 px-3 py-2.5 text-left transition-colors enabled:hover:bg-surface-2 disabled:cursor-default"
                      >
                        <p className="line-clamp-3 text-sm leading-relaxed text-slate-200">
                          {note.body}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span>{noteVisibilityLabel(note.visibility)}</span>
                          <span aria-hidden className="text-slate-700">·</span>
                          <span>{noteCreatedLabel(note.created_at)}</span>
                          {note.comment_count ? (
                            <>
                              <span aria-hidden className="text-slate-700">·</span>
                              <span>
                                {note.comment_count}{" "}
                                {note.comment_count === 1 ? "reply" : "replies"}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-slate-500">No notes here yet.</p>
              )}
            </div>
          ) : null}

          {/* Reviews and the open comment thread are both people talking about the
              venue, so they share a tab and the strip stays at four labels. */}
          {tab === "reviews" ? (
            <div id="venue-panel-reviews" role="tabpanel" aria-labelledby="venue-tab-reviews" className="-mx-4 pt-1">
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
            </div>
          ) : null}

          {tab === "about" ? (
            <div id="venue-panel-about" role="tabpanel" aria-labelledby="venue-tab-about" className="-mx-4 pt-1">
              <VenueFactGrid venue={details} google={googleDetails} />

              {description ? (
                <p className="mt-3 px-4 text-sm leading-relaxed text-slate-300">{description}</p>
              ) : enriching ? (
                <div className="mt-3 space-y-2 px-4" aria-hidden>
                  <div className="h-3 w-full animate-pulse rounded bg-white/5" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
                </div>
              ) : !hasAnyDetails ? (
                <p className="mt-3 px-4 text-sm text-slate-500">
                  No extra details for this court yet.
                </p>
              ) : null}

              {websiteHref ? (
                <div className="mt-4 px-4">
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-surface-3 cursor-pointer"
                  >
                    <Globe className="w-4 h-4 text-primary" aria-hidden />
                    Visit website
                    <ExternalLink className="w-3.5 h-3.5 opacity-60" aria-hidden />
                  </a>
                </div>
              ) : null}

              {uploadOpen ? (
                <VenuePhotoUploadPanel
                  venue={details}
                  onUploaded={(photo) => setUserPhotos((prev) => [photo, ...prev])}
                  onClose={() => setUploadOpen(false)}
                />
              ) : null}

              {/* Fix-it-at-the-source: most facts above come from OSM, and editing
                  there is the only way they ever improve. */}
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

              {/* Attribution — a licence requirement, not decoration. */}
              <p className="mt-4 px-4 text-[10px] text-slate-400">
                Data © OpenStreetMap contributors{details.wikidata ? " · Wikidata" : ""}
                {googleDetails || details.google_details ? " · Places data © Google" : ""}
              </p>
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
