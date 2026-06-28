import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ChevronDown, MapPin } from "lucide-react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useMyProfile } from "../../hooks/useMyProfile";
import { getGamesNearby } from "../../lib/api";
import type { GameRow } from "../../lib/supabase";
import { splitGamesByLiveness, formatKm } from "../lib/hotPicks";
import { sportEmoji } from "../../lib/sportVisuals";
import { cn } from "../components/ui/utils";
import { glassMessengerPage } from "../styles/glass";

const SEARCH_RADIUS_KM = 50;

function gameTitle(g: GameRow): string {
  return g.title?.trim() || (g.sport?.trim() ? `${g.sport} game` : "Pickup game");
}

function spotsLabel(g: GameRow): string {
  const going = g.participant_count ?? 0;
  const left = g.spots_remaining;
  if (left != null && left > 0) return `${going} going · ${left} ${left === 1 ? "spot" : "spots"} left`;
  return `${going} going · full`;
}

function GameRowButton({ g, ended, onOpen }: { g: GameRow; ended: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition-all",
        ended
          ? "border-white/[0.05] bg-white/[0.015] opacity-80 hover:opacity-100"
          : "border-white/[0.08] bg-white/[0.02] hover:border-primary/30 hover:bg-white/[0.04]",
      )}
    >
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl",
          ended ? "bg-white/[0.04] grayscale" : "bg-primary/10",
        )}
      >
        {sportEmoji(g.sport ?? "")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-sm font-bold", ended ? "text-slate-300" : "text-white")}>
            {gameTitle(g)}
          </span>
          {ended ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-slate-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
              Ended
            </span>
          ) : g.status === "live" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
            </span>
          ) : null}
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
  );
}

function Accordion({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2">
          <h2 className="text-sm font-black uppercase tracking-widest text-white">{title}</h2>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-black tabular-nums text-muted-foreground">
            {count}
          </span>
        </span>
        <ChevronDown
          className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200">
          {children}
        </div>
      )}
    </section>
  );
}

export default function RecommendedGames() {
  const navigate = useNavigate();
  const { coords } = useGeolocation();
  const { athleteProfile } = useMyProfile();
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [openLive, setOpenLive] = useState(true);
  const [openEnded, setOpenEnded] = useState(false);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    setLoading(true);
    void getGamesNearby(coords.lat, coords.lng, SEARCH_RADIUS_KM)
      .then((r) => {
        if (!cancelled) setGames(r.data ?? []);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [coords?.lat, coords?.lng]);

  const { live, ended } = useMemo(
    () => splitGamesByLiveness(games, { primarySports: athleteProfile.primarySports ?? [] }),
    [games, athleteProfile.primarySports],
  );

  const openGame = (id: string) => navigate(`/?focusGameId=${encodeURIComponent(id)}`);

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
                Games near you · {SEARCH_RADIUS_KM} km
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-3xl px-4 py-8 pb-32">
        {!coords ? (
          <div className="rounded-[28px] border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-100/90">
            Turn on location to find games near you.
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
            <p className="text-sm font-bold text-slate-300">No games nearby</p>
            <p className="mt-1 text-xs text-slate-500">Long-press the map to start one.</p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-primary/15 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-primary transition-colors hover:bg-primary/25"
            >
              Open map
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            <Accordion title="Live" count={live.length} open={openLive} onToggle={() => setOpenLive((o) => !o)}>
              {live.length === 0 ? (
                <p className="px-2 py-3 text-xs text-slate-500">No live games nearby right now.</p>
              ) : (
                <ul className="grid gap-2">
                  {live.map((g) => (
                    <li key={g.id}>
                      <GameRowButton g={g} ended={false} onOpen={() => openGame(g.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </Accordion>

            <Accordion title="Ended" count={ended.length} open={openEnded} onToggle={() => setOpenEnded((o) => !o)}>
              {ended.length === 0 ? (
                <p className="px-2 py-3 text-xs text-slate-500">No recently ended games.</p>
              ) : (
                <ul className="grid gap-2">
                  {ended.map((g) => (
                    <li key={g.id}>
                      <GameRowButton g={g} ended onOpen={() => openGame(g.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </Accordion>
          </div>
        )}
      </main>
    </div>
  );
}
