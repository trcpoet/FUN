import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Clock, Globe, Loader2, MapPin, Radio } from "lucide-react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { bboxFromCenterRadius, fetchSportsVenuesFromDb } from "../lib/sportsVenues";
import {
  rankHotPickVenues,
  formatKm,
  pickActiveVenues,
  venueActivity,
  type HotPickVenue,
  type VenueActivity,
} from "../lib/hotPicks";
import { partitionGamesByVenue } from "../lib/venueActivity";
import { VENUE_GAME_LIST_RADIUS_METERS } from "../map/mapConfig";
import { getGamesNearby } from "../../lib/api";
import { sportEmoji } from "../../lib/sportVisuals";
import { getSportIconEmoji } from "../map/gameSportIcons";
import { isOpenNow, formatOpeningHours } from "../lib/openingHours";
import { reverseGeocodeLabel } from "../../lib/geocoding";
import { cn } from "../components/ui/utils";
import { glassMessengerPage } from "../styles/glass";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { primaryVenueSportSuffix } from "../lib/venueSportIcon";
import { SPORTS_CATALOG } from "../../lib/sportsCatalog";

const START_RADIUS_KM = 25;
const RADIUS_STEP_KM = 25;

/**
 * Live headlines count down in MM:SS, so the page ticks every second. Rows below the shelf
 * only need to know whether something is live, so they get a coarser clock and a `memo`
 * boundary — otherwise a list of several hundred venues would re-render once a second.
 */
const TICK_MS = 1000;
const COARSE_TICK_MS = 30_000;

/** OSM values are snake_case (`sports_centre`, `multi;soccer`) — make them readable. */
function cap(s: string): string {
  return s
    .replace(/[_;]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function venueKind(v: HotPickVenue): string {
  const parts = [v.sport, v.leisure].filter(Boolean) as string[];
  return parts.length ? parts.map(cap).join(" · ") : "Sports venue";
}

/** mapbox suffix → display label + emoji, for grouping venues by sport. */
const SUFFIX_META = new Map<string, { label: string; emoji: string }>(
  SPORTS_CATALOG.map((s) => [s.mapboxSuffix, { label: s.id, emoji: s.emoji }])
);
const OTHER_GROUP = { key: "other", label: "Other venues", emoji: "🏟️" };

type VenueGroup = { key: string; label: string; emoji: string; venues: HotPickVenue[] };

/** Bucket distance-ranked venues by their primary sport; keep nearest-sport groups first. */
function groupVenuesBySport(venues: HotPickVenue[]): VenueGroup[] {
  const groups = new Map<string, VenueGroup>();
  for (const v of venues) {
    const suffix = primaryVenueSportSuffix(v.sport, v.leisure);
    const meta = SUFFIX_META.get(suffix);
    const key = meta ? suffix : OTHER_GROUP.key;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: meta?.label ?? OTHER_GROUP.label,
        emoji: meta?.emoji ?? OTHER_GROUP.emoji,
        venues: [],
      });
    }
    groups.get(key)!.venues.push(v);
  }
  // `venues` is already distance-ranked, so venues[0] is each group's nearest.
  return [...groups.values()].sort(
    (a, b) => (a.venues[0]?.distanceKm ?? Infinity) - (b.venues[0]?.distanceKm ?? Infinity)
  );
}

/** Place-quality line: the reason to go when nothing is on. */
function qualityMeta(v: HotPickVenue): string {
  return [v.surface, v.access, v.lit === "yes" ? "lit" : null]
    .filter(Boolean)
    .map((s) => cap(s as string))
    .join(" · ");
}

function ActivityChip({ activity }: { activity: VenueActivity }) {
  if (activity.tier === "live") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-400">
        <span
          className="size-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse"
          aria-hidden
        />
        Live
      </span>
    );
  }
  if (activity.tier === "soon") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-300">
        <Clock className="size-2.5 shrink-0" aria-hidden />
        Soon
      </span>
    );
  }
  return null;
}

/**
 * `null` from the parser means "we could not read this venue's hours", which is different from
 * "closed" — say nothing rather than guess.
 */
function OpenChip({ hours, now }: { hours: string | null; now: number }) {
  const open = isOpenNow(hours, new Date(now));
  if (open === null) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest",
        open
          ? "border-white/10 bg-white/[0.04] text-slate-200"
          : "border-white/[0.06] bg-white/[0.02] text-slate-500",
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", open ? "bg-emerald-400" : "bg-slate-600")}
        aria-hidden
      />
      {open ? "Open now" : "Closed"}
    </span>
  );
}

/**
 * One venue.
 *
 * The middle column always carries three lines, so activity and quality rows scan at the same
 * rhythm. The third line is where the two jobs meet: it reads out what's happening when there
 * is something, and falls back to why the place is worth a trip when there isn't.
 */
const VenueRow = React.memo(function VenueRow({
  v,
  now,
  onOpen,
}: {
  v: HotPickVenue;
  now: number;
  /** Takes the id so the parent can pass one stable callback and keep `memo` effective. */
  onOpen: (venueId: string) => void;
}) {
  const activity = venueActivity(v.games, now);
  const active = activity.tier !== "none";
  const meta = qualityMeta(v);
  const hours = formatOpeningHours(v.openingHours) ?? v.openingHours;

  return (
    <button
      type="button"
      onClick={() => onOpen(v.id)}
      className={cn(
        "flex w-full items-center gap-3 sm:gap-4 rounded-3xl border p-3 sm:p-4 text-left transition-all",
        active
          ? activity.tier === "live"
            ? "border-emerald-500/25 bg-emerald-500/[0.04] hover:border-emerald-500/45 hover:bg-emerald-500/[0.07]"
            : "border-amber-500/20 bg-amber-500/[0.03] hover:border-amber-500/40 hover:bg-amber-500/[0.06]"
          : "border-white/[0.08] bg-white/[0.02] hover:border-blue-500/30 hover:bg-white/[0.04]",
      )}
    >
      {v.heroImageUrl ? (
        <img
          src={v.heroImageUrl}
          alt=""
          loading="lazy"
          className="size-12 shrink-0 rounded-2xl object-cover"
        />
      ) : v.sport ? (
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl",
            active ? "bg-emerald-500/10" : "bg-blue-500/10",
          )}
        >
          {sportEmoji(v.sport)}
        </span>
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
          <MapPin className="size-5" />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-bold text-white">{v.name}</span>
          {active ? (
            <ActivityChip activity={activity} />
          ) : (
            <OpenChip hours={v.openingHours} now={now} />
          )}
        </span>

        <span className="mt-0.5 block truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {venueKind(v)}
        </span>

        {active ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]">
            <span className="shrink-0" aria-hidden>
              {activity.sports.slice(0, 3).map((s) => getSportIconEmoji(s)).join("")}
            </span>
            <span
              className={cn(
                "truncate font-semibold",
                activity.tier === "live" ? "text-emerald-300" : "text-amber-200",
              )}
            >
              {activity.headline}
            </span>
            {activity.upcomingCount > 1 && (
              <span className="shrink-0 text-slate-500">+{activity.upcomingCount - 1} more</span>
            )}
          </span>
        ) : (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500">
            {meta && <span className="truncate">{meta}</span>}
            {hours && (
              <span className="flex items-center gap-1 truncate">
                <Clock className="size-3 shrink-0" /> {hours}
              </span>
            )}
            {v.website && (
              <span className="flex items-center gap-1 text-blue-400">
                <Globe className="size-3 shrink-0" /> Website
              </span>
            )}
          </span>
        )}
      </span>

      {formatKm(v.distanceKm) && (
        <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
          {formatKm(v.distanceKm)}
        </span>
      )}
    </button>
  );
});

function RowSkeleton() {
  return (
    <div
      className="flex animate-pulse gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4"
      aria-hidden
    >
      <div className="size-12 shrink-0 rounded-2xl bg-white/10" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 w-1/2 rounded bg-white/10" />
        <div className="h-2.5 w-1/3 rounded bg-white/5" />
      </div>
    </div>
  );
}

export default function PopularVenues() {
  const navigate = useNavigate();
  const { coords } = useGeolocation();
  const [radiusKm, setRadiusKm] = useState(START_RADIUS_KM);
  const [venues, setVenues] = useState<HotPickVenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const prevCountRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const groups = useMemo(() => groupVenuesBySport(venues), [venues]);
  // Expand the two nearest sport groups by default.
  const defaultOpenGroups = useMemo(() => groups.slice(0, 2).map((g) => g.key), [groups]);
  const active = useMemo(() => pickActiveVenues(venues, now), [venues, now]);
  // Rows in the accordion only care about live-or-not, so round the clock down and let `memo`
  // skip them on the other 29 ticks.
  const coarseNow = Math.floor(now / COARSE_TICK_MS) * COARSE_TICK_MS;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!coords) {
      setPlaceLabel(null);
      return;
    }
    let cancelled = false;
    void reverseGeocodeLabel(coords.lat, coords.lng).then((l) => {
      if (!cancelled) setPlaceLabel(l);
    });
    return () => {
      cancelled = true;
    };
  }, [coords?.lat, coords?.lng]);

  // Fetch (and re-rank) every time the search radius grows.
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    setLoading(true);
    const bbox = bboxFromCenterRadius(coords.lat, coords.lng, radiusKm);

    // Games are advisory: if the RPC fails the page still renders as a place directory, which
    // is the whole point of having place quality as the always-on layer.
    void Promise.all([
      fetchSportsVenuesFromDb(bbox).catch(() => null),
      getGamesNearby(coords.lat, coords.lng, radiusKm).catch(() => ({ data: null, error: null })),
    ])
      .then(([outcome, gamesResult]) => {
        if (cancelled) return;
        const fc = outcome?.status === "ok" ? outcome.geojson : null;
        const ranked = rankHotPickVenues(fc, { center: coords });

        // Same 120 m discovery radius the venue modal lists games at — not the tighter 42 m
        // absorb radius, which is about pins covering each other on the map.
        const { anchored } = partitionGamesByVenue(
          gamesResult?.data ?? [],
          ranked,
          VENUE_GAME_LIST_RADIUS_METERS,
          Date.now(),
        );
        const withGames = ranked.map((v) =>
          anchored.has(v.id) ? { ...v, games: anchored.get(v.id)! } : v,
        );

        // No growth after widening the radius => we've exhausted the area.
        if (radiusKm > START_RADIUS_KM && withGames.length <= prevCountRef.current) {
          setReachedEnd(true);
        }
        prevCountRef.current = withGames.length;
        setVenues(withGames);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coords?.lat, coords?.lng, radiusKm]);

  // Keep state readable from the (stable) observer callback.
  const stateRef = useRef({ loading, reachedEnd });
  stateRef.current = { loading, reachedEnd };
  const loadMore = useCallback(() => {
    if (stateRef.current.loading || stateRef.current.reachedEnd) return;
    setRadiusKm((r) => r + RADIUS_STEP_KM);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const openVenue = useCallback(
    (id: string) => navigate(`/?focusVenueId=${encodeURIComponent(id)}`),
    [navigate],
  );

  return (
    <div className="min-h-screen bg-[#050505] text-foreground">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={cn("absolute inset-0 opacity-90", glassMessengerPage())} />
        <div className="absolute top-[20%] -right-[5%] size-[30%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/[0.05] bg-black/40 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5">
          <button
            type="button"
            onClick={() => navigate("/feed")}
            className="flex size-10 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.03] text-blue-400 transition-all hover:scale-110 hover:bg-blue-500 hover:text-white active:scale-95"
            aria-label="Back to Explore"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black italic uppercase leading-none tracking-tighter text-white">
              Popular Venues
            </h1>
            <div className="mt-1 flex items-center gap-1.5">
              <MapPin className="size-3 text-blue-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Near {placeLabel ?? "you"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-3xl px-4 py-8 pb-32">
        {!coords ? (
          <div className="rounded-[28px] border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-100/90">
            Turn on location to find venues near you.
          </div>
        ) : venues.length === 0 && loading ? (
          <div className="grid gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        ) : venues.length === 0 ? (
          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.02] px-5 py-10 text-center">
            <p className="text-sm font-bold text-slate-300">No venues nearby yet</p>
            <p className="mt-1 text-xs text-slate-500">We don&apos;t have any imported venues in this area.</p>
          </div>
        ) : (
          <>
            {/*
              The activity shelf is a promotion, not a move: these venues still appear under
              their sport below, so someone scrolling to "Basketball" sees what's on there too.
              When nothing is live the shelf simply isn't rendered and the page is a place
              directory, which is the fallback job.
            */}
            {active.length > 0 && (
              <section className="mb-8" aria-labelledby="happening-now-heading">
                <div className="mb-4 flex items-center gap-2 px-1">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <Radio className="size-4" />
                  </div>
                  <h2
                    id="happening-now-heading"
                    className="text-sm font-black uppercase tracking-widest text-white"
                  >
                    Happening now
                  </h2>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-emerald-400">
                    {active.length}
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-2">
                  {active.map((v) => (
                    <li key={v.id}>
                      <VenueRow v={v} now={now} onOpen={openVenue} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/*
              `grid-cols-1` rather than a bare `grid`: an implicit `auto` track is sized by its
              items' min-content, and a long venue name blew the track out to 643px inside a
              430px viewport — which pushed the distance off-screen and made the page scroll
              sideways. `minmax(0, 1fr)` caps it at the container.
            */}
            <Accordion
              type="multiple"
              defaultValue={defaultOpenGroups}
              className="grid grid-cols-1 gap-3"
            >
              {groups.map((g) => (
                <AccordionItem
                  key={g.key}
                  value={g.key}
                  className="rounded-3xl border border-white/[0.08] bg-white/[0.015] px-3 sm:px-4 last:border-b"
                >
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl leading-none" aria-hidden>{g.emoji}</span>
                      <span className="truncate text-sm font-black uppercase tracking-wider text-white">
                        {g.label}
                      </span>
                      <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-400">
                        {g.venues.length}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="grid grid-cols-1 gap-2 pb-1">
                      {g.venues.map((v) => (
                        <li key={v.id}>
                          <VenueRow v={v} now={coarseNow} onOpen={openVenue} />
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <div ref={sentinelRef} className="flex items-center justify-center py-8">
              {loading ? (
                <Loader2 className="size-5 animate-spin text-blue-400" aria-label="Loading more venues" />
              ) : reachedEnd ? (
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                  That&apos;s everything nearby
                </span>
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
