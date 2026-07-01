import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  MapPin,
  Activity,
  ChevronRight,
  MessageCircle,
  Navigation,
  Share2,
  Clock,
  Globe,
  ExternalLink,
  Sun,
  Lock,
} from "lucide-react";
import type { VenueSelection } from "./mapboxMapTypes";
import type { GameRow } from "../../lib/supabase";
import { formatVenueGameTimerSummary } from "../../lib/mapGameTimer";
import { groupGamesBySport, haversineDistanceMeters } from "../lib/gamesAtVenue";
import { getSportIconEmoji } from "../map/gameSportIcons";
import { fetchVenueById, fetchVenueEnrichment } from "../../lib/api";
import { useRouteDirections } from "../../hooks/useRouteDirections";
import { directionsHref } from "../lib/venueInfoHelpers";
import { Sheet, SheetContent } from "./ui/sheet";
import { useIsMobile } from "./ui/use-mobile";

type VenueInfoSheetProps = {
  venue: VenueSelection;
  open: boolean;
  openGamesNearbyCount: number;
  gamesNearby?: GameRow[];
  joinedGameIds?: Set<string>;
  onClose: () => void;
  onCreateGame?: (venue: VenueSelection) => void;
  onJoinGame?: (game: GameRow) => void;
  onOpenChat?: (game: GameRow) => void;
  viewerCoords?: { lat: number; lng: number } | null;
  onNavigateTo?: (dest: { lat: number; lng: number }) => void;
};

function formatCoords(lat: number, lng: number): string {
  const latStr = Math.abs(lat).toFixed(2) + (lat >= 0 ? "°N" : "°S");
  const lngStr = Math.abs(lng).toFixed(2) + (lng >= 0 ? "°E" : "°W");
  return `${latStr}, ${lngStr}`;
}

function prettyLabel(s: string | undefined | null): string | null {
  const raw = s?.trim();
  if (!raw) return null;
  return raw.replace(/_/g, " ").replace(/\s+/g, " ");
}

function formatLit(value: string | undefined): string | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (v === "yes") return "Lit";
  if (v === "no") return "Unlit";
  return prettyLabel(v);
}

function formatAccess(value: string | undefined): string | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (v === "yes" || v === "public") return "Public";
  if (v === "private") return "Private";
  if (v === "customers") return "Members only";
  return prettyLabel(v);
}

function osmUrl(venue: VenueSelection): string | null {
  if (venue.osm_type && venue.osm_id != null) {
    return `https://www.openstreetmap.org/${venue.osm_type}/${venue.osm_id}`;
  }
  return null;
}

export function VenueInfoSheet({
  venue,
  open,
  openGamesNearbyCount,
  gamesNearby = [],
  joinedGameIds = new Set(),
  onClose,
  onCreateGame,
  onJoinGame,
  onOpenChat,
  viewerCoords = null,
  onNavigateTo,
}: VenueInfoSheetProps) {
  const isMobile = useIsMobile();
  const [now, setNow] = useState(() => Date.now());
  const [details, setDetails] = useState(venue);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(venue.hero_image_url ?? null);
  const [photoAttributions, setPhotoAttributions] = useState<string[]>(
    venue.photo_attributions ?? []
  );
  const [enrichingHero, setEnrichingHero] = useState(false);

  useEffect(() => {
    setDetails(venue);
    setHeroImageUrl(venue.hero_image_url ?? null);
    setPhotoAttributions(venue.photo_attributions ?? []);
  }, [venue]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void fetchVenueById(venue.id).then(({ data }) => {
      if (cancelled || !data) return;
      setDetails((prev) => ({ ...prev, ...data, center: prev.center }));
      if (data.hero_image_url) setHeroImageUrl(data.hero_image_url);
    });

    setEnrichingHero(true);
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
        if (!cancelled) setEnrichingHero(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, venue.id]);

  const name = prettyLabel(details.name) ?? prettyLabel(details.wikidata_label);
  const sport = prettyLabel(details.sport);
  const leisure = prettyLabel(details.leisure);

  const title =
    name ??
    (sport && leisure ? `${sport} ${leisure}` : sport ?? leisure ?? "Sports venue");

  const sub =
    details.sport?.trim() || details.leisure?.trim()
      ? `${details.sport?.trim() ? details.sport.trim() : details.leisure?.trim() ?? ""}${details.sport?.trim() && details.leisure?.trim() ? " · " : ""}${
          details.sport?.trim() && details.leisure?.trim() ? details.leisure.trim() : ""
        }`
      : "Pickup games nearby";

  const chips = useMemo(() => {
    const items: { key: string; label: string; icon?: React.ReactNode }[] = [];
    const surface = prettyLabel(details.surface);
    if (surface) items.push({ key: "surface", label: surface });
    const lit = formatLit(details.lit);
    if (lit) items.push({ key: "lit", label: lit, icon: <Sun className="w-3 h-3" /> });
    const access = formatAccess(details.access);
    if (access) items.push({ key: "access", label: access, icon: <Lock className="w-3 h-3" /> });
    const operator = prettyLabel(details.operator);
    if (operator) items.push({ key: "operator", label: operator });
    return items;
  }, [details]);

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

  const handleShare = async () => {
    const titleLine = title;
    const coordsLine = `📍 ${formatCoords(details.center.lat, details.center.lng)}`;
    const urlLine = mapsHref;
    const text = [titleLine, sub, coordsLine, urlLine].filter(Boolean).join("\n");

    const shareData: ShareData = { title: titleLine, text, url: urlLine };
    const canNativeShare =
      typeof navigator.share === "function" &&
      (!navigator.canShare || navigator.canShare(shareData));

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
      window.prompt("Copy this venue link:", urlLine);
    }
  };

  const websiteUrl = details.website?.trim();
  const websiteHref =
    websiteUrl && /^https?:\/\//i.test(websiteUrl) ? websiteUrl : websiteUrl ? `https://${websiteUrl}` : null;
  const osmLink = osmUrl(details);

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        hideCloseButton
        className={
          isMobile
            ? "h-[85vh] max-h-[85vh] rounded-t-2xl border-t border-white/10 p-0 gap-0 overflow-hidden bg-[#0A0F1C]/95"
            : "w-full sm:max-w-[420px] border-l border-white/10 p-0 gap-0 overflow-hidden bg-[#0A0F1C]/95"
        }
      >
        <div className="flex h-full flex-col overflow-y-auto scrollbar-hide">
          <div className="relative aspect-[16/9] w-full shrink-0 bg-gradient-to-br from-emerald-900/40 via-slate-900 to-violet-900/30">
            {heroImageUrl ? (
              <img
                src={heroImageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
            ) : enrichingHero ? (
              <div className="absolute inset-0 animate-pulse bg-white/5" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C] via-transparent to-black/20" />
            {photoAttributions.length > 0 ? (
              <p className="absolute bottom-2 left-3 right-3 text-[10px] text-slate-400/90 drop-shadow">
                Photo: {photoAttributions.join(", ")}
              </p>
            ) : null}
            <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleShare()}
                className="rounded-full bg-black/40 p-2 text-slate-200 backdrop-blur-sm hover:bg-black/55"
                aria-label="Share venue"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-black/40 p-2 text-slate-200 backdrop-blur-sm hover:bg-black/55"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="text-sm text-slate-400 mt-0.5">{sub}</p>
              {details.wikidata_description ? (
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{details.wikidata_description}</p>
              ) : null}
            </div>

            {chips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <span
                    key={chip.key}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-200"
                  >
                    {chip.icon}
                    {chip.label}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex items-center gap-2 text-slate-300 text-sm">
              <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">
                {openGamesNearbyCount} open game{openGamesNearbyCount === 1 ? "" : "s"}
              </span>
              <span className="text-slate-500 text-xs">near this venue</span>
            </div>

            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {formatCoords(details.center.lat, details.center.lng)}
              </div>
              {details.opening_hours ? (
                <div className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="font-mono text-[11px] leading-relaxed break-words">{details.opening_hours}</span>
                </div>
              ) : null}
              {websiteHref ? (
                <a
                  href={websiteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Website
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              ) : null}
              {osmLink ? (
                <a
                  href={osmLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300"
                >
                  View on OpenStreetMap
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              ) : null}
            </div>

            {viewerCoords && (walkSummary || walkLoading) ? (
              <p className="text-center text-xs text-slate-400 tabular-nums">
                {walkLoading ? "Calculating walk time…" : walkSummary}
              </p>
            ) : null}

            <div className="flex items-center gap-2">
              {onNavigateTo && viewerCoords ? (
                <button
                  type="button"
                  onClick={() => onNavigateTo({ lat: details.center.lat, lng: details.center.lng })}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-600/80 bg-slate-800/90 px-3 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-emerald-500/50 hover:bg-slate-800"
                >
                  <Navigation className="w-4 h-4 text-emerald-400" aria-hidden />
                  Show route
                </button>
              ) : (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-600/80 bg-slate-800/90 px-3 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-emerald-500/50 hover:bg-slate-800"
                >
                  <Navigation className="w-4 h-4 text-emerald-400" aria-hidden />
                  Directions
                </a>
              )}
              {onNavigateTo && viewerCoords ? (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Maps
                </a>
              ) : null}
            </div>

            {gamesNearby.length > 0 ? (
              <div className="space-y-2 border-t border-white/10 pt-3">
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
                                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600/90 hover:bg-teal-500 text-white text-xs font-medium"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    Chat
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onJoinGame?.(g)}
                                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-medium"
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
            ) : null}

            {onCreateGame ? (
              <button
                type="button"
                onClick={() => {
                  onCreateGame(details);
                  onClose();
                }}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
              >
                Create game here
              </button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
