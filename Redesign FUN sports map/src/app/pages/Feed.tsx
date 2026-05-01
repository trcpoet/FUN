import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Compass,
  Globe,
  HeartPulse,
  PenSquare,
  Sparkles,
  Users,
  Search,
  ChevronRight,
  MapPin,
  Flame,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { cn } from "../components/ui/utils";
import { useNotifications } from "../../hooks/useNotifications";
import { useGeolocation } from "../../hooks/useGeolocation";
import { Badge } from "../components/ui/badge";
import { ScrollArea, ScrollBar } from "../components/ui/scroll-area";
import { fetchLiveNearby, fetchUnifiedFeed, type LiveFeedItem, type UnifiedFeedItem } from "../../lib/api";
import { GameFeedCard, LiveNearbyStripCard, NoteFeedCard, StatusFeedCard } from "../components/feed/UnifiedFeedCards";
import LightRays from "../components/feed/LightRays";
import { glassMessengerPage } from "../styles/glass";
import { useAuth } from "../contexts/AuthContext";

function notificationLabel(n: { type: string; payload?: unknown }): string {
  const p = (n.payload ?? {}) as Record<string, unknown>;
  if (n.type === "badge_earned") {
    return `Badge earned: ${(p.badge_slug as string | undefined) ?? "?"}`;
  }
  if (n.type === "game_completed") return "A game you joined was completed.";
  if (n.type === "new_follower") return "Someone new is following you.";
  if (n.type === "game_nearby") return `New game nearby: ${(p.sport as string | undefined)?.trim() || "Pickup"}`;
  if (n.type === "map_note_nearby") return "New map note near you.";
  if (n.type === "game_invite") return "You were invited to a game.";
  if (n.type === "note_new_activity") return "New replies on a note you follow.";
  return "New notification";
}

function notificationActorUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const v =
    p.user_id ??
    p.profile_id ??
    p.actor_id ??
    p.from_user_id ??
    p.follower_id ??
    p.invited_by ??
    p.created_by;
  return typeof v === "string" && v.trim() ? v : null;
}

function handleNotificationNavigate(
  navigate: (to: string) => void,
  n: { type: string; payload?: unknown },
): void {
  const p = (n.payload ?? {}) as Record<string, unknown>;
  if (n.type === "game_nearby" || n.type === "game_invite") {
    const gid = typeof p.game_id === "string" ? p.game_id : null;
    if (gid) navigate(`/?focusGameId=${encodeURIComponent(gid)}`);
    return;
  }
  if (n.type === "map_note_nearby" || n.type === "note_new_activity") {
    const nid = typeof p.note_id === "string" ? p.note_id : null;
    if (nid) navigate(`/?focusNoteId=${encodeURIComponent(nid)}`);
    return;
  }
  if (n.type === "new_follower") {
    const fid = typeof p.follower_id === "string" ? p.follower_id : null;
    if (fid) navigate(`/athlete/${encodeURIComponent(fid)}`);
    return;
  }
  const actorId = notificationActorUserId(n.payload);
  if (actorId) navigate(`/athlete/${encodeURIComponent(actorId)}`);
}

type TabId = "discovery" | "activity" | "similar" | "friends" | "notifications";

function TabButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const { active, label, onClick, icon: Icon } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all duration-300",
        active
          ? "bg-primary text-white shadow-[0_8px_16px_-4px_rgba(225,29,72,0.4)] scale-105 z-10"
          : "bg-white/[0.03] text-muted-foreground border border-white/5 hover:bg-white/[0.08] hover:text-white"
      )}
    >
      <Icon className={cn("size-3.5", active && "animate-pulse")} />
      {label}
    </button>
  );
}

export default function Feed() {
  const [tab, setTab] = useState<TabId>("discovery");
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { notifications, markRead } = useNotifications({ limit: 12 });
  const { coords } = useGeolocation();
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const [unified, setUnified] = useState<UnifiedFeedItem[]>([]);
  const [unifiedLoading, setUnifiedLoading] = useState(false);
  const [liveItems, setLiveItems] = useState<LiveFeedItem[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);

  const refreshFeeds = useCallback(() => {
    if (!coords) return;
    setUnifiedLoading(true);
    setLiveLoading(true);
    void fetchUnifiedFeed({ lat: coords.lat, lng: coords.lng, mapRadiusKm: 120, limit: 80 }).then((r) => {
      setUnifiedLoading(false);
      setUnified(r.data ?? []);
    });
    void fetchLiveNearby({ lat: coords.lat, lng: coords.lng, radiusKm: 25, limit: 40 }).then((r) => {
      setLiveLoading(false);
      setLiveItems(r.data ?? []);
    });
  }, [coords?.lat, coords?.lng]);

  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const t = qs.get("tab");
    if (t === "notifications") setTab("notifications");
    else if (t === "friends") setTab("friends");
    else if (t === "similar") setTab("similar");
    else if (t === "activity") setTab("activity");
    else if (t === "discovery") setTab("discovery");
  }, [location.search]);

  useEffect(() => {
    refreshFeeds();
  }, [refreshFeeds]);

  return (
    <div className="min-h-screen bg-[#050505] text-foreground selection:bg-primary selection:text-white">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={cn("absolute inset-0 opacity-90", glassMessengerPage())} />
        <div className="absolute -top-[10%] -left-[10%] size-[40%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute top-[20%] -right-[5%] size-[30%] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <header className="sticky top-0 z-[60] relative overflow-hidden border-b border-white/[0.05]">
        <div className="pointer-events-none absolute inset-0 z-0">
          <LightRays
            raysOrigin="top-center"
            raysColor="#ffffff"
            raysSpeed={1}
            lightSpread={0.5}
            rayLength={3}
            followMouse
            mouseInfluence={0.1}
            noiseAmount={0}
            distortion={0}
            className="opacity-40"
            pulsating={false}
            fadeDistance={1}
            saturation={1}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-0 z-[1] bg-black/60 backdrop-blur-2xl"
          aria-hidden
        />
        <div className="relative z-10 mx-auto max-w-3xl w-full px-4 pt-6 pb-4">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex size-10 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/5 text-primary transition-all hover:bg-primary hover:text-white hover:scale-110 active:scale-95"
                aria-label="Back to map"
              >
                <Globe className="size-5" />
              </button>
              <div>
                <h1 className="text-2xl font-black italic tracking-tighter uppercase text-white leading-none">
                  Discovery
                </h1>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pulse Active</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                className="flex size-10 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/5 text-muted-foreground hover:text-white hover:bg-white/[0.08] transition-all"
                aria-label="Search"
              >
                <Search className="size-5" />
              </button>
              <button 
                onClick={() => setTab("notifications")}
                className={cn(
                  "relative flex size-10 items-center justify-center rounded-2xl transition-all",
                  tab === "notifications" 
                    ? "bg-primary text-white" 
                    : "bg-white/[0.03] border border-white/5 text-muted-foreground hover:text-white hover:bg-white/[0.08]"
                )}
              >
                <Bell className="size-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black ring-2 ring-black">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex w-max space-x-3 pb-2">
              <TabButton
                active={tab === "discovery"}
                label="Explore"
                icon={Compass}
                onClick={() => setTab("discovery")}
              />
              <TabButton
                active={tab === "activity"}
                label="Feed"
                icon={HeartPulse}
                onClick={() => setTab("activity")}
              />
              <TabButton
                active={tab === "similar"}
                label="Similar"
                icon={Users}
                onClick={() => setTab("similar")}
              />
              <TabButton
                active={tab === "friends"}
                label="Following"
                icon={Sparkles}
                onClick={() => setTab("friends")}
              />
            </div>
            <ScrollBar orientation="horizontal" className="opacity-0" />
          </ScrollArea>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-3xl px-4 py-8 pb-32">
        {tab === "discovery" && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Live: games + map notes within 25 km */}
            {coords ? (
              <section className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                      <MapPin className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black uppercase tracking-widest text-white">Live near you</h2>
                      <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-tight mt-0.5">
                        Games & map notes · 25 km
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab("activity")}
                    className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
                  >
                    Full feed
                  </button>
                </div>
                {liveLoading ? (
                  <p className="text-xs text-slate-500 px-1">Loading live activity…</p>
                ) : liveItems.length === 0 ? (
                  <p className="text-xs text-slate-500 px-1">No games or notes in range yet — check the map or widen your search from Feed.</p>
                ) : (
                  <ScrollArea className="w-full">
                    <div className="flex space-x-4 pb-4">
                      {liveItems.map((it) => (
                        <LiveNearbyStripCard
                          key={`${it.kind}:${it.id}`}
                          item={it}
                          onOpen={() =>
                            it.kind === "game"
                              ? navigate(`/?focusGameId=${encodeURIComponent(it.id)}`)
                              : navigate(`/?focusNoteId=${encodeURIComponent(it.id)}`)
                          }
                        />
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" className="hidden" />
                  </ScrollArea>
                )}
              </section>
            ) : null}

            {/* Recommendations Grid */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Flame className="size-4" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white">Hot Picks</h2>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <button className="group relative h-48 overflow-hidden rounded-[32px] border border-white/[0.08] bg-card p-6 text-left transition-all hover:border-primary/40 hover:shadow-[0_20px_40px_-15px_rgba(225,29,72,0.15)]">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                    <Compass className="size-24 -rotate-12" />
                  </div>
                  <div className="relative h-full flex flex-col justify-between">
                    <div>
                      <Badge className="bg-primary/20 text-primary border-none text-[9px] font-black uppercase tracking-[0.2em] mb-3">AI Choice</Badge>
                      <h3 className="text-xl font-black italic tracking-tighter text-white uppercase leading-none">Recommended<br/>Games</h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground group-hover:text-white transition-colors">
                      Explore Personalized Runs <ChevronRight className="size-4 text-primary" />
                    </div>
                  </div>
                </button>

                <button className="group relative h-48 overflow-hidden rounded-[32px] border border-white/[0.08] bg-card p-6 text-left transition-all hover:border-blue-500/40 hover:shadow-[0_20px_40px_-15px_rgba(37,99,235,0.15)]">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                    <MapPin className="size-24 -rotate-12 text-blue-500" />
                  </div>
                  <div className="relative h-full flex flex-col justify-between">
                    <div>
                      <Badge className="bg-blue-500/20 text-blue-500 border-none text-[9px] font-black uppercase tracking-[0.2em] mb-3">Trending</Badge>
                      <h3 className="text-xl font-black italic tracking-tighter text-white uppercase leading-none">Popular<br/>Venues</h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground group-hover:text-white transition-colors">
                      See where the energy is <ChevronRight className="size-4 text-blue-500" />
                    </div>
                  </div>
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === "activity" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <section className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    Feed
                    <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" />
                  </h2>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">
                    Map posts within 120 km · statuses worldwide
                  </p>
                </div>
              </div>

              {!coords ? (
                <div className="rounded-[32px] border border-white/[0.08] bg-card/40 backdrop-blur-md p-10 text-center">
                  <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">Location needed</p>
                  <p className="text-xs text-slate-500 mt-2">
                    Allow location to see nearby games and notes.
                  </p>
                </div>
              ) : unifiedLoading ? (
                <div className="rounded-[32px] border border-white/[0.08] bg-card/40 backdrop-blur-md p-10 text-center">
                  <p className="text-sm text-slate-400">Loading nearby activity…</p>
                </div>
              ) : unified.length === 0 ? (
                <div className="rounded-[32px] border border-white/[0.08] bg-card/40 backdrop-blur-md p-10 text-center">
                  <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">No activity yet</p>
                  <p className="text-xs text-slate-500 mt-2">
                    Create a game or drop a note on the map to start the conversation.
                  </p>
                </div>
              ) : (
                <ul className="grid gap-6">
                  {unified.map((it) => (
                    <li key={`${it.kind}:${it.id}`}>
                      {it.kind === "note" ? (
                        <NoteFeedCard
                          item={it}
                          currentUserId={user?.id ?? null}
                          onOpenOnMap={() => navigate(`/?focusNoteId=${encodeURIComponent(it.id)}`)}
                          onInvalidate={refreshFeeds}
                        />
                      ) : it.kind === "game" ? (
                        <GameFeedCard
                          item={it}
                          currentUserId={user?.id ?? null}
                          onOpenOnMap={() => navigate(`/?focusGameId=${encodeURIComponent(it.id)}`)}
                          onInvalidate={refreshFeeds}
                        />
                      ) : (
                        <StatusFeedCard item={it} currentUserId={user?.id ?? null} onInvalidate={refreshFeeds} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "similar" && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-20">
            <div className="size-20 bg-white/[0.03] border border-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="size-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-black italic uppercase text-white mb-2">Finding Rivals</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">We're scanning the city for athletes that match your vibe and skill level.</p>
          </section>
        )}

        {tab === "friends" && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-20">
            <div className="size-20 bg-white/[0.03] border border-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sparkles className="size-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-black italic uppercase text-white mb-2">Following</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">Updates from your squad will appear here. Start following players from the map!</p>
          </section>
        )}

        {tab === "notifications" && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
             <div className="flex items-center justify-between px-2 mb-6">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  Alerts
                </h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Stay updated</p>
              </div>
              {unreadCount > 0 && (
                <Badge className="bg-rose-500/20 text-rose-500 border-none font-black tabular-nums">{unreadCount} NEW</Badge>
              )}
            </div>

            <div className="overflow-hidden rounded-[32px] border border-white/[0.08] bg-card/40 backdrop-blur-md">
              <ul className="divide-y divide-white/[0.05]">
                {notifications.length === 0 ? (
                  <li className="px-6 py-20 text-center flex flex-col items-center gap-4">
                    <div className="size-16 rounded-full bg-white/[0.03] flex items-center justify-center">
                      <Bell className="size-6 text-slate-700" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">Clear Skies</p>
                      <p className="text-xs text-slate-500">You're all caught up for now.</p>
                    </div>
                  </li>
                ) : (
                  notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!n.is_read) markRead(n.id);
                          handleNotificationNavigate(navigate, n);
                        }}
                        className={cn(
                          "flex w-full items-center gap-4 px-6 py-5 text-left transition-all hover:bg-white/[0.03]",
                          !n.is_read && "bg-primary/[0.03] relative",
                        )}
                      >
                        {!n.is_read && (
                          <div className="absolute left-2 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-primary" />
                        )}
                        <div className="size-10 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0">
                          {n.type === "badge_earned" ? (
                            <Sparkles className="size-5 text-amber-500" />
                          ) : n.type === "new_follower" ? (
                            <Users className="size-5 text-sky-400" />
                          ) : n.type === "game_nearby" || n.type === "game_invite" ? (
                            <MapPin className="size-5 text-violet-400" />
                          ) : n.type === "map_note_nearby" || n.type === "note_new_activity" ? (
                            <Compass className="size-5 text-cyan-400" />
                          ) : (
                            <HeartPulse className="size-5 text-primary" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold text-white tracking-tight">{notificationLabel(n)}</span>
                          <span className="text-[10px] text-muted-foreground mt-1 uppercase tracking-tighter">
                            {new Date(n.created_at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground ml-auto" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>
        )}
      </main>

      {/* Persistent Action Bar */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[70] w-full max-w-xs px-4">
        <button
          type="button"
          onClick={() => {
            // Wire to post composer
          }}
          className="flex w-full items-center justify-center gap-3 rounded-[32px] bg-primary px-8 py-5 text-sm font-black uppercase italic tracking-tighter text-white shadow-[0_20px_40px_-10px_rgba(225,29,72,0.4)] transition-all hover:scale-105 active:scale-95 group"
        >
          <PenSquare className="size-5 group-hover:rotate-12 transition-transform" />
          Post Update
        </button>
      </div>
    </div>
  );
}
