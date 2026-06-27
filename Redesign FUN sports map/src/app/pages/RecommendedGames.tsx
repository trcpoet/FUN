import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Loader2, MapPin } from "lucide-react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useMyProfile } from "../../hooks/useMyProfile";
import { getGamesNearby } from "../../lib/api";
import type { GameRow } from "../../lib/supabase";
import { rankLiveGameRows, formatKm } from "../lib/hotPicks";
import { sportEmoji } from "../../lib/sportVisuals";
import { cn } from "../components/ui/utils";
import { glassMessengerPage } from "../styles/glass";

const SEARCH_RADIUS_KM = 50;

function spotsLabel(g: GameRow): string {
  const going = g.participant_count ?? 0;
  const left = g.spots_remaining;
  if (left != null && left > 0) return `${going} going · ${left} ${left === 1 ? "spot" : "spots"} left`;
  return `${going} going · full`;
}

export default function RecommendedGames() {
  const navigate = useNavigate();
  const { coords } = useGeolocation();
  const { athleteProfile } = useMyProfile();
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    setLoading(true);
    void getGamesNearby(coords.lat, coords.lng, SEARCH_RADIUS_KM)
      .then((r) => {
        if (cancelled) return;
        setGames(
          rankLiveGameRows(r.data ?? [], { primarySports: athleteProfile.primarySports ?? [] }),
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [coords?.lat, coords?.lng, athleteProfile.primarySports]);

  return (
    <div className="min-h-screen bg-[#050505] text-foreground">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={cn("absolute inset-0 opacity-90", glassMessengerPage())} />
        <div className="absolute -top-[10%] -left-[10%] size-[40%] rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/[0.05] bg-black/40 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5">
          <button
            type="button"
            onClick={() => navigate("/feed")}
            className="flex size-10 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.03] text-primary transition-all hover:scale-110 hover:bg-primary hover:text-white active:scale-95"
            aria-label="Back to Explore"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black italic uppercase leading-none tracking-tighter text-white">
              Recommended Games
            </h1>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Live games near you · {SEARCH_RADIUS_KM} km
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-3xl px-4 py-8 pb-32">
        {!coords ? (
          <div className="rounded-[28px] border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-100/90">
            Turn on location to find live games near you.
          </div>
        ) : loading && !loaded ? (
          <div className="grid gap-3">
            {[0, 1, 2, 3].map((i) => (
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
        ) : games.length === 0 ? (
          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.02] px-5 py-10 text-center">
            <p className="text-sm font-bold text-slate-300">No live games nearby</p>
            <p className="mt-1 text-xs text-slate-500">
              Long-press the map to start one, or check back soon.
            </p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-primary/15 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-primary transition-colors hover:bg-primary/25"
            >
              Open map
            </button>
          </div>
        ) : (
          <ul className="grid gap-3">
            {games.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/?focusGameId=${encodeURIComponent(g.id)}`)}
                  className="flex w-full items-center gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-all hover:border-primary/30 hover:bg-white/[0.04]"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                    {sportEmoji(g.sport ?? "")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-white">
                        {g.title?.trim() || (g.sport?.trim() ? `${g.sport} game` : "Pickup game")}
                      </span>
                      {g.status === "live" && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {spotsLabel(g)}
                    </span>
                    {g.location_label?.trim() && (
                      <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                        <MapPin className="size-3 shrink-0" /> {g.location_label.trim()}
                      </span>
                    )}
                  </span>
                  {formatKm(g.distance_km) && (
                    <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                      {formatKm(g.distance_km)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
