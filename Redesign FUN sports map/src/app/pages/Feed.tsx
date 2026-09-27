import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ArrowUpRight,
  MapPin,
  Flame,
  Loader2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "../components/ui/utils";
import { useNotifications } from "../../hooks/useNotifications";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useMyProfile } from "../../hooks/useMyProfile";
import { Badge } from "../components/ui/badge";
import { ScrollArea, ScrollBar } from "../components/ui/scroll-area";
import {
  fetchLiveNearby,
  fetchLocalNews,
  fetchFeedMediaPosts,
  fetchUnifiedFeed,
  getSimilarAthletes,
  fetchMyFollowedIds,
  joinGame,
  leaveGame,
  upsertMyStatus,
  mergeGlobalNetworkChronological,
  type GlobalNetworkItem,
  type LiveFeedItem,
  type LocalNewsItem,
  type UnifiedFeedItem,
} from "../../lib/api";
import type { FeedMediaPostRow, GameRow, SimilarAthleteRow } from "../../lib/supabase";
import { AVAILABILITY_OPTIONS } from "../../lib/athleteProfile";
import {
  GameFeedCard,
  MediaFeedCard,
  NoteFeedCard,
  StatusFeedCard,
} from "../components/feed/UnifiedFeedCards";
import LightRays from "../components/feed/LightRays";
import { SuggestedGamesShelf } from "../components/feed/SuggestedGamesShelf";
import { LocalNewsSection } from "../components/feed/LocalNewsSection";
import { glassMessengerPage } from "../styles/glass";
import { useAuth } from "../contexts/AuthContext";
import { reverseGeocodeLabel } from "../../lib/geocoding";
import { friendlyRpcError } from "../../lib/rpcErrors";

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
  if (n.type === "note_comment_liked") return "Someone liked your comment.";
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
  if (
    n.type === "map_note_nearby" ||
    n.type === "note_new_activity" ||
    n.type === "note_comment_liked"
  ) {
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

function availabilityLabel(value: string | null): string | null {
  if (!value) return null;
  return AVAILABILITY_OPTIONS.find((a) => a.value === value)?.label ?? null;
}

function LiveSectionSkeleton() {
  return (
    <div className="grid gap-4 px-1" aria-hidden>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5 animate-pulse flex gap-4"
        >
          <div className="size-12 shrink-0 rounded-2xl bg-white/10" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2.5 w-24 rounded bg-white/10" />
            <div className="h-3 w-full rounded bg-white/10" />
            <div className="h-3 w-4/5 rounded bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function GlobalNetworkSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 animate-pulse space-y-3"
        >
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-2xl bg-white/10" />
            <div className="h-2.5 w-28 rounded bg-white/10" />
          </div>
          <div className="h-3 w-full rounded bg-white/10" />
          <div className="h-3 w-[88%] rounded bg-white/5" />
          <div className="h-40 w-full rounded-2xl bg-white/5" />
        </div>
      ))}
    </div>
  );
}

function globalNetworkRowKey(row: GlobalNetworkItem, index: number): string {
  if (row.type === "media") return `m:${row.item.id}`;
  return `${row.item.kind}:${row.item.id}:${index}`;
}

/** Explore shows only public content; treat items without a visibility field as public. */
function unifiedItemIsPublic(it: UnifiedFeedItem): boolean {
  const v = (it as { visibility?: string | null }).visibility;
  return v == null || v === "public";
}

function renderGlobalNetworkItem(
  row: GlobalNetworkItem,
  ctx: {
    userId: string | null | undefined;
    navigate: (to: string) => void;
    refreshFeeds: () => void;
    onJoinGame: (game: GameRow) => Promise<void>;
    onLeaveGame: (game: GameRow) => Promise<void>;
  },
): React.ReactNode {
  const { userId, navigate, refreshFeeds, onJoinGame, onLeaveGame } = ctx;
  if (row.type === "media") {
    return (
      <MediaFeedCard
        item={row.item}
        variant={row.variant}
        onOpenProfile={() => navigate(`/athlete/${encodeURIComponent(row.item.user_id)}`)}
      />
    );
  }
  const it = row.item;
  if (it.kind === "note") {
    return (
      <NoteFeedCard
        item={it}
        currentUserId={userId ?? null}
        onOpenOnMap={() => navigate(`/?focusNoteId=${encodeURIComponent(it.id)}`)}
        onInvalidate={refreshFeeds}
      />
    );
  }
  if (it.kind === "game") {
    return (
      <GameFeedCard
        item={it}
        currentUserId={userId ?? null}
        onOpenOnMap={() => navigate(`/?focusGameId=${encodeURIComponent(it.id)}`)}
        onInvalidate={refreshFeeds}
        onJoin={onJoinGame}
        onLeave={onLeaveGame}
        // Chat is on the map, where the messenger lives. Landing on the game and
        // opening its thread from there beats a second messenger in the feed.
        onOpenChat={(g) => navigate(`/?focusGameId=${encodeURIComponent(g.id)}&chat=1`)}
      />
    );
  }
  return <StatusFeedCard item={it} currentUserId={userId ?? null} onInvalidate={refreshFeeds} />;
}

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
  const {
    athleteProfile,
    discoverableForMatching,
    loading: myProfileLoading,
    updateProfile: updateMyProfileFields,
  } = useMyProfile();
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const [unified, setUnified] = useState<UnifiedFeedItem[]>([]);
  const [unifiedLoading, setUnifiedLoading] = useState(false);
  const [liveItems, setLiveItems] = useState<LiveFeedItem[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [mediaPosts, setMediaPosts] = useState<FeedMediaPostRow[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [localNews, setLocalNews] = useState<LocalNewsItem[]>([]);
  const [localNewsAvailable, setLocalNewsAvailable] = useState(0);
  const [localNewsLoading, setLocalNewsLoading] = useState(false);
  const [localNewsLoadingMore, setLocalNewsLoadingMore] = useState(false);
  const [localNewsError, setLocalNewsError] = useState<Error | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [similarAthletes, setSimilarAthletes] = useState<SimilarAthleteRow[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<Error | null>(null);
  const [enablingDiscovery, setEnablingDiscovery] = useState(false);

  /**
   * Join and leave, from the feed.
   *
   * The same two RPCs the map's popup calls; the refetch afterwards is what makes
   * the card's spots bar and "You're in" state agree with the server, since the
   * feed row carries `joined_by_me` from the same query.
   */
  const refreshFeedsRef = useRef<(() => void) | null>(null);

  /** The composer behind the "Post update" button, which used to do nothing. */
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDraft, setComposerDraft] = useState("");
  const [composerBusy, setComposerBusy] = useState(false);

  /** Who you follow, so "Following" can be the people you follow. */
  const [followedIds, setFollowedIds] = useState<Set<string> | null>(null);

  const handleJoinGame = useCallback(
    async (game: GameRow) => {
      const { error: err, role } = await joinGame(game.id);
      if (err) {
        toast.error("Couldn't join", { description: err.message });
        return;
      }
      toast.success(
        role === "substitute" ? "You're on the waitlist" : "You're in",
        { description: role === "substitute" ? "We'll tell you if a spot opens." : "The squad chat is on the map." },
      );
      refreshFeedsRef.current?.();
    },
    [],
  );

  const handleLeaveGame = useCallback(
    async (game: GameRow) => {
      const err = await leaveGame(game.id);
      if (err) {
        toast.error("Couldn't leave", { description: err.message });
        return;
      }
      toast.success("You're out");
      refreshFeedsRef.current?.();
    },
    [],
  );

  const handlePostUpdate = useCallback(async () => {
    const body = composerDraft.trim();
    if (!body || composerBusy) return;
    setComposerBusy(true);
    const err = await upsertMyStatus(body);
    setComposerBusy(false);
    if (err) {
      toast.error("Couldn't post that", { description: err.message });
      return;
    }
    setComposerDraft("");
    setComposerOpen(false);
    toast.success("Posted");
    refreshFeedsRef.current?.();
  }, [composerDraft, composerBusy]);

  const refreshFeeds = useCallback(() => {
    setMediaLoading(true);
    // Fetch the personal set (public + squad + own via RLS); Explore derives the public subset.
    void fetchFeedMediaPosts({ limit: 28, viewerUserId: user?.id ?? null, scope: "personal" }).then((r) => {
      setMediaLoading(false);
      setMediaPosts(r.data ?? []);
    });

    if (!coords) {
      setUnifiedLoading(false);
      setLiveLoading(false);
      setUnified([]);
      setLiveItems([]);
      return;
    }

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
  }, [coords?.lat, coords?.lng, user?.id]);
  /**
   * The follow graph, loaded when the Following tab is first opened.
   *
   * Deferred rather than loaded on mount: most visits never open this tab, and
   * the query is a round-trip the map already pays for elsewhere.
   */
  useEffect(() => {
    if (tab !== "friends" || followedIds !== null || !user?.id) return;
    let cancelled = false;
    void fetchMyFollowedIds().then((r) => {
      if (cancelled) return;
      setFollowedIds(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, followedIds, user?.id]);

  /** Everything from the people you actually follow, newest first. */
  const followingStream = useMemo(() => {
    if (!followedIds || followedIds.size === 0) return [];
    return mergeGlobalNetworkChronological(
      unified.filter((it) => it.created_by != null && followedIds.has(it.created_by)),
      mediaPosts.filter((m) => followedIds.has(m.user_id)),
    );
  }, [followedIds, unified, mediaPosts]);

  // The join/leave handlers are declared above this and must not close over
  // `refreshFeeds` directly — that would rebuild them on every feed change, and
  // GameActionBar resets its busy state when its handlers change identity.
  refreshFeedsRef.current = refreshFeeds;


  const publicMedia = useMemo(
    () => mediaPosts.filter((m) => (m.visibility ?? "public") === "public" && !m.authorIsPrivate),
    [mediaPosts],
  );

  /**
   * Explore: everything public near you, games included.
   *
   * Games were filtered out here and in the activity stream below, on the
   * grounds that they "live on the Recommended Games page". That made the one
   * thing this app is about the one thing its feed would not show — and a game
   * is a better post than a status, because you can act on it. The card is a
   * real one now (schedule, spots, Join, a public thread), so there is nothing
   * to protect the feed from.
   */
  const mergedGlobal = useMemo(
    () =>
      mergeGlobalNetworkChronological(
        coords ? unified.filter((it) => unifiedItemIsPublic(it)) : [],
        publicMedia,
      ),
    [coords, unified, publicMedia],
  );

  // Feed (activity): your squad's photos and statuses, plus the games near you —
  // the same reasoning as Explore, and the reason someone opens this tab at all.
  const activitySocial = useMemo(
    () =>
      mergeGlobalNetworkChronological(
        unified.filter((it) => it.kind === "status" || it.kind === "game"),
        mediaPosts,
      ),
    [unified, mediaPosts],
  );

  const liveNotes = useMemo(() => liveItems.filter((it) => it.kind === "note"), [liveItems]);

  const globalStreamLoading = (coords ? unifiedLoading : false) || mediaLoading;

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

  useEffect(() => {
    if (tab !== "similar" || !coords || !discoverableForMatching) return;
    let cancelled = false;
    setSimilarLoading(true);
    setSimilarError(null);
    void getSimilarAthletes({ lat: coords.lat, lng: coords.lng, radiusKm: 25, limit: 20 }).then((r) => {
      if (cancelled) return;
      setSimilarLoading(false);
      setSimilarAthletes(r.data ?? []);
      setSimilarError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, coords?.lat, coords?.lng, discoverableForMatching]);

  const handleEnableDiscovery = useCallback(async () => {
    setEnablingDiscovery(true);
    await updateMyProfileFields({ discoverable_for_matching: true });
    setEnablingDiscovery(false);
  }, [updateMyProfileFields]);

  useEffect(() => {
    if (!coords) {
      setPlaceLabel(null);
      setLocalNews([]);
      setLocalNewsAvailable(0);
      setLocalNewsError(null);
      setLocalNewsLoading(false);
      setLocalNewsLoadingMore(false);
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

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    setLocalNewsLoading(true);
    setLocalNewsError(null);
    setLocalNews([]);
    setLocalNewsAvailable(0);
    void fetchLocalNews({ lat: coords.lat, lng: coords.lng, radiusKm: 25, limit: 10, offset: 0 }).then((r) => {
      if (cancelled) return;
      setLocalNewsLoading(false);
      setLocalNews(r.data ?? []);
      setLocalNewsAvailable(r.available);
      setLocalNewsError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [coords?.lat, coords?.lng]);

  const handleLoadMoreLocalNews = useCallback(() => {
    if (!coords || localNewsLoadingMore) return;
    setLocalNewsLoadingMore(true);
    void fetchLocalNews({
      lat: coords.lat,
      lng: coords.lng,
      radiusKm: 25,
      limit: 10,
      offset: localNews.length,
    }).then((r) => {
      setLocalNewsLoadingMore(false);
      if (r.error) {
        setLocalNewsError(r.error);
        return;
      }
      setLocalNewsAvailable(r.available);
      setLocalNews((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const next = [...prev];
        for (const item of r.data ?? []) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            next.push(item);
          }
        }
        return next;
      });
    });
  }, [coords, localNews.length, localNewsLoadingMore]);

  return (
    <div className="min-h-screen bg-[#050505] text-foreground selection:bg-primary selection:text-white">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={cn("absolute inset-0 opacity-90", glassMessengerPage())} />
        <div className="absolute -top-[10%] -left-[10%] size-[40%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute top-[20%] -right-[5%] size-[30%] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <header className="sticky top-0 z-[60] relative overflow-hidden border-b border-white/[0.05] min-h-[148px]">
        <div className="pointer-events-none absolute inset-0 z-0">
          {/* Fallback glow if WebGL fails to init */}
          <div className="absolute inset-0 bg-[radial-gradient(80%_140%_at_50%_0%,rgba(225,29,72,0.18)_0%,rgba(2,6,23,0)_65%)]" />
          <LightRays
            raysOrigin="top-center"
            raysColor="#ffe9ef"
            raysSpeed={1.15}
            lightSpread={0.6}
            rayLength={3.2}
            followMouse
            mouseInfluence={0.1}
            noiseAmount={0}
            distortion={0}
            className="opacity-90"
            pulsating={false}
            fadeDistance={1}
            saturation={1.15}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-0 z-[1] bg-black/35 backdrop-blur-2xl"
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
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {tab === "activity"
                      ? "Feed · Map notes near you"
                      : "Explore · Global network"}
                  </span>
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <p className="text-xs text-muted-foreground font-medium">
                Games and map notes near you live on{" "}
                <span className="text-white font-bold">Feed</span>.
              </p>
              <button
                type="button"
                onClick={() => setTab("activity")}
                className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
              >
                Open Feed
              </button>
            </div>

            {/* The one surface that ranks games for the person reading it. The two
                tiles below are navigation; this is the answer. */}
            <SuggestedGamesShelf
              lat={coords?.lat ?? null}
              lng={coords?.lng ?? null}
              mySports={athleteProfile?.primarySports ?? undefined}
              onOpenGame={(gameId) => navigate(`/?focusGameId=${encodeURIComponent(gameId)}`)}
              onHostGame={() => navigate("/?host=1")}
            />

            {/* Hot Picks — quick entry to the dedicated pages */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Flame className="size-4" />
                </div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white">Hot Picks</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => navigate("/feed/games")}
                  className="group relative h-48 overflow-hidden rounded-[32px] border border-white/[0.08] bg-card p-6 text-left transition-all hover:border-primary/40 hover:shadow-[0_20px_40px_-15px_rgba(225,29,72,0.18)]"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10 transition-opacity group-hover:opacity-30">
                    <Compass className="size-24 -rotate-12" />
                  </div>
                  <div className="relative flex h-full flex-col justify-between">
                    <div>
                      <Badge className="mb-3 border-none bg-primary/20 text-[9px] font-black uppercase tracking-[0.2em] text-primary">All games</Badge>
                      <h3 className="text-xl font-black italic uppercase leading-none tracking-tighter text-white">Games<br/>near you</h3>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground transition-colors group-hover:text-white">
                      <span>Live games near you</span>
                      <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"><ArrowUpRight className="size-4" /></span>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/feed/venues")}
                  className="group relative h-48 overflow-hidden rounded-[32px] border border-white/[0.08] bg-card p-6 text-left transition-all hover:border-blue-500/40 hover:shadow-[0_20px_40px_-15px_rgba(37,99,235,0.18)]"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10 transition-opacity group-hover:opacity-30">
                    <MapPin className="size-24 -rotate-12 text-blue-500" />
                  </div>
                  <div className="relative flex h-full flex-col justify-between">
                    <div>
                      <Badge className="mb-3 border-none bg-blue-500/20 text-[9px] font-black uppercase tracking-[0.2em] text-blue-500">Near you</Badge>
                      <h3 className="text-xl font-black italic uppercase leading-none tracking-tighter text-white">Popular<br/>Venues</h3>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground transition-colors group-hover:text-white">
                      <span>Places to play near you</span>
                      <span className="flex size-8 items-center justify-center rounded-full bg-blue-500/15 text-blue-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"><ArrowUpRight className="size-4" /></span>
                    </div>
                  </div>
                </button>
              </div>
            </section>

            <LocalNewsSection
              items={localNews}
              loading={localNewsLoading}
              loadingMore={localNewsLoadingMore}
              error={localNewsError}
              locationLabel={placeLabel}
              available={localNewsAvailable}
              onLoadMore={handleLoadMoreLocalNews}
            />

            {/* Global network: games, notes, statuses, photos & reels */}
            <section className="space-y-4">
              <div className="flex items-center justify-between px-1 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                    <Globe className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black uppercase tracking-widest text-white">Global network</h2>
                    <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-tight mt-0.5 truncate">
                      Games & notes (120 km) · statuses · photos & reels
                    </p>
                  </div>
                </div>
              </div>
              {globalStreamLoading ? (
                <GlobalNetworkSkeleton />
              ) : mergedGlobal.length === 0 ? (
                <p className="text-xs text-slate-500 px-1">
                  Nothing in the network stream yet — post a status, drop a map note, or share a photo from your profile.
                </p>
              ) : (
                <ul className="grid gap-6">
                  {mergedGlobal.map((row, i) => (
                    <li key={globalNetworkRowKey(row, i)}>
                      {renderGlobalNetworkItem(row, {
                        userId: user?.id,
                        navigate,
                        refreshFeeds,
                        onJoinGame: handleJoinGame,
                        onLeaveGame: handleLeaveGame,
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <section className="space-y-3 px-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  Feed
                  <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" />
                </h2>
                {coords && liveLoading ? (
                  <Loader2 className="size-4 animate-spin text-primary" aria-label="Loading" />
                ) : null}
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">
                Public + squad photos, reels &amp; statuses — plus map notes near you
              </p>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <div className="flex size-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                  <Globe className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-white">From your squad</h2>
                  <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-tight mt-0.5">
                    Public + squad · photos, reels &amp; statuses
                  </p>
                </div>
              </div>
              {globalStreamLoading ? (
                <GlobalNetworkSkeleton />
              ) : activitySocial.length === 0 ? (
                <p className="text-xs text-slate-500 px-1">
                  Nothing from your squad yet — follow players and share photos to fill this in.
                </p>
              ) : (
                <ul className="grid gap-6">
                  {activitySocial.map((row, i) => (
                    <li key={globalNetworkRowKey(row, i)}>
                      {renderGlobalNetworkItem(row, {
                        userId: user?.id,
                        navigate,
                        refreshFeeds,
                        onJoinGame: handleJoinGame,
                        onLeaveGame: handleLeaveGame,
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <div className="flex size-8 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                  <MapPin className="size-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-white">Map notes near you</h2>
                  <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-tight mt-0.5">
                    Map notes · 25 km
                  </p>
                </div>
              </div>
              {!coords ? (
                <div className="rounded-[28px] border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-100/90">
                  Turn on location to load nearby map notes.
                </div>
              ) : liveLoading ? (
                <LiveSectionSkeleton />
              ) : liveNotes.length === 0 ? (
                <p className="text-xs text-slate-500 px-1">No map notes in range yet.</p>
              ) : (
                <ul className="grid gap-6">
                  {liveNotes.map((it) => (
                    <li key={`feed-note:${it.id}`}>
                      <NoteFeedCard
                        item={it}
                        currentUserId={user?.id ?? null}
                        onOpenOnMap={() => navigate(`/?focusNoteId=${encodeURIComponent(it.id)}`)}
                        onInvalidate={refreshFeeds}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "similar" && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {!coords ? (
              <div className="rounded-[28px] border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-100/90 text-center">
                Turn on location to find athletes like you nearby.
              </div>
            ) : myProfileLoading ? (
              <div className="flex justify-center py-20" aria-hidden>
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : !discoverableForMatching ? (
              <div className="text-center py-20">
                <div className="size-20 bg-white/[0.03] border border-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Users className="size-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-black italic uppercase text-white mb-2">Find Your Rivals</h2>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
                  Opt in to show up in other athletes&apos; Similar lists and see who nearby shares your sports and
                  availability. This is separate from your map visibility.
                </p>
                <button
                  type="button"
                  onClick={handleEnableDiscovery}
                  disabled={enablingDiscovery}
                  className="rounded-2xl bg-primary px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-[0_8px_16px_-4px_rgba(225,29,72,0.4)] transition-opacity disabled:opacity-60"
                >
                  {enablingDiscovery ? "Enabling…" : "Enable discovery"}
                </button>
              </div>
            ) : similarLoading ? (
              <LiveSectionSkeleton />
            ) : similarError ? (
              <p className="text-xs text-rose-300 px-1 text-center py-20">
                {friendlyRpcError(similarError, "athlete matching")}
              </p>
            ) : similarAthletes.length === 0 ? (
              <div className="text-center py-20">
                <div className="size-20 bg-white/[0.03] border border-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Users className="size-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-black italic uppercase text-white mb-2">Finding Rivals</h2>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">We're scanning the city for athletes that match your vibe and skill level.</p>
              </div>
            ) : (
              <ul className="grid gap-4">
                {similarAthletes.map((a) => (
                  <li key={a.profile_id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/athlete/${encodeURIComponent(a.profile_id)}`)}
                      className="w-full flex items-center gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-all hover:border-primary/40"
                    >
                      <div className="size-12 shrink-0 rounded-2xl bg-white/10 overflow-hidden flex items-center justify-center">
                        {a.avatar_url ? (
                          <img src={a.avatar_url} alt="" className="size-full object-cover" />
                        ) : (
                          <Users className="size-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{a.display_name ?? "Athlete"}</p>
                        {a.shared_sports.length > 0 && (
                          <p className="text-[10px] text-primary font-semibold uppercase tracking-wide truncate">
                            {a.shared_sports.slice(0, 3).join(" · ")}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground font-medium mt-0.5 flex items-center gap-1">
                          <MapPin className="size-3" />
                          {a.distance_km < 1 ? "< 1 km away" : `${a.distance_km.toFixed(1)} km away`}
                          {availabilityLabel(a.availability) ? ` · ${availabilityLabel(a.availability)}` : ""}
                        </p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "friends" && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {followedIds === null ? (
              <GlobalNetworkSkeleton />
            ) : followingStream.length === 0 ? (
              <div className="py-20 text-center">
                <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-surface-1">
                  <Sparkles className="size-8 text-muted-foreground" />
                </div>
                <h2 className="mb-2 text-xl font-black uppercase italic text-white">
                  {followedIds.size === 0 ? "Nobody yet" : "Nothing new"}
                </h2>
                <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                  {followedIds.size === 0
                    ? "Follow the players you meet and their games, notes and photos land here."
                    : "The people you follow have not posted or hosted anything nearby lately."}
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--glow-md)] transition hover:bg-primary-container"
                >
                  Find players on the map
                </button>
              </div>
            ) : (
              <ul className="grid gap-6">
                {followingStream.map((row, i) => (
                  <li key={globalNetworkRowKey(row, i)}>
                    {renderGlobalNetworkItem(row, {
                      userId: user?.id,
                      navigate,
                      refreshFeeds,
                      onJoinGame: handleJoinGame,
                      onLeaveGame: handleLeaveGame,
                    })}
                  </li>
                ))}
              </ul>
            )}
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

      {/* Post an update. This button was a no-op with a "Wire to post composer"
          comment behind it, under a rose-coloured shadow it never matched. */}
      <div className="fixed bottom-8 left-1/2 z-[70] w-full max-w-sm -translate-x-1/2 px-4">
        {composerOpen ? (
          <div className="rounded-[28px] bg-surface-2/95 p-3 shadow-[var(--glow-lg)] backdrop-blur-xl">
            <textarea
              value={composerDraft}
              onChange={(e) => setComposerDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setComposerOpen(false);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handlePostUpdate();
              }}
              rows={3}
              maxLength={280}
              autoFocus
              placeholder="What are you playing today?"
              className="w-full resize-none rounded-2xl bg-surface-3 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label="Your update"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="pl-1 text-[11px] tabular-nums text-slate-500">
                {composerDraft.trim().length}/280
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="min-h-10 rounded-full px-4 text-sm font-semibold text-slate-400 transition hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handlePostUpdate()}
                  disabled={!composerDraft.trim() || composerBusy}
                  aria-busy={composerBusy}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--glow-md)] transition hover:bg-primary-container disabled:opacity-50"
                >
                  {composerBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {composerBusy ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="group flex w-full items-center justify-center gap-3 rounded-[32px] bg-primary px-8 py-5 text-sm font-black uppercase italic tracking-tighter text-primary-foreground shadow-[var(--glow-lg)] transition-all hover:scale-[1.03] active:scale-95"
          >
            <PenSquare className="size-5 transition-transform group-hover:rotate-12" />
            Post update
          </button>
        )}
      </div>
    </div>
  );
}
