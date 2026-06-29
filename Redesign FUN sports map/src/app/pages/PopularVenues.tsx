import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Clock, Globe, Loader2, MapPin } from "lucide-react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { fetchSportsVenuesFromDb } from "../lib/sportsVenues";
import { rankHotPickVenues, formatKm, type HotPickVenue } from "../lib/hotPicks";
import { sportEmoji } from "../../lib/sportVisuals";
import { reverseGeocodeLabel } from "../../lib/geocoding";
import { cn } from "../components/ui/utils";
import { glassMessengerPage } from "../styles/glass";

const START_RADIUS_KM = 25;
const RADIUS_STEP_KM = 25;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function venueKind(v: HotPickVenue): string {
  const parts = [v.sport, v.leisure].filter(Boolean) as string[];
  return parts.length ? parts.map(cap).join(" · ") : "Sports venue";
}

export default function PopularVenues() {
  const navigate = useNavigate();
  const { coords } = useGeolocation();
  const [radiusKm, setRadiusKm] = useState(START_RADIUS_KM);
  const [venues, setVenues] = useState<HotPickVenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const prevCountRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((coords.lat * Math.PI) / 180)));
    const bbox = {
      minLat: coords.lat - dLat,
      maxLat: coords.lat + dLat,
      minLng: coords.lng - dLng,
      maxLng: coords.lng + dLng,
    };
    void fetchSportsVenuesFromDb(bbox)
      .then((fc) => {
        if (cancelled) return;
        const ranked = rankHotPickVenues(fc, { center: coords });
        // No growth after widening the radius => we've exhausted the area.
        if (radiusKm > START_RADIUS_KM && ranked.length <= prevCountRef.current) {
          setReachedEnd(true);
        }
        prevCountRef.current = ranked.length;
        setVenues(ranked);
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
              <div
                key={i}
                className="flex animate-pulse gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4"
                aria-hidden
              >
                <div className="size-12 shrink-0 rounded-2xl bg-white/10" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 w-1/2 rounded bg-white/10" />
                  <div className="h-2.5 w-1/3 rounded bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : venues.length === 0 ? (
          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.02] px-5 py-10 text-center">
            <p className="text-sm font-bold text-slate-300">No venues nearby yet</p>
            <p className="mt-1 text-xs text-slate-500">We don&apos;t have any imported venues in this area.</p>
          </div>
        ) : (
          <>
            <ul className="grid gap-3">
              {venues.map((v) => {
                const info = [v.surface, v.access].filter(Boolean).map((s) => cap(s as string)).join(" · ");
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/?focusVenueId=${encodeURIComponent(v.id)}`)}
                      className="flex w-full items-center gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-all hover:border-blue-500/30 hover:bg-white/[0.04]"
                    >
                      {v.heroImageUrl ? (
                        <img
                          src={v.heroImageUrl}
                          alt=""
                          loading="lazy"
                          className="size-12 shrink-0 rounded-2xl object-cover"
                        />
                      ) : v.sport ? (
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-2xl">
                          {sportEmoji(v.sport)}
                        </span>
                      ) : (
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
                          <MapPin className="size-5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-white">{v.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {venueKind(v)}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2.5 text-[11px] text-slate-500">
                          {info && <span className="truncate">{info}</span>}
                          {v.openingHours && (
                            <span className="flex items-center gap-1 truncate">
                              <Clock className="size-3 shrink-0" /> {v.openingHours}
                            </span>
                          )}
                          {v.website && (
                            <span className="flex items-center gap-1 text-blue-400">
                              <Globe className="size-3 shrink-0" /> Website
                            </span>
                          )}
                        </span>
                      </span>
                      {formatKm(v.distanceKm) && (
                        <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                          {formatKm(v.distanceKm)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

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
