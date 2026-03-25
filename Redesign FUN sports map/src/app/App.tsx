import React, { Suspense, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import type { MapCameraRequest, VenueSelection } from "./components/MapboxMap";
import { prefetchMapboxGl } from "./lib/mapboxCached";

const MapboxMap = React.lazy(() =>
  import("./components/MapboxMap").then((m) => ({ default: m.MapboxMap }))
);
import { TopNavigation } from "./components/TopUI";
import { BottomCarousel } from "./components/BottomCarousel";
import { GameMessengerSheet } from "./components/GameMessengerSheet";
import type { MessengerThreadFocus } from "./components/GameMessengerSheet";
import { CreateGameModal } from "./components/CreateGameModal";
import { FiltersModal, type FiltersState, DEFAULT_FILTERS } from "./components/FiltersModal";
import { useGeolocation } from "../hooks/useGeolocation";
import { useNearbyMapQueries } from "../hooks/useNearbyMapQueries";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useUnifiedSearch } from "../hooks/useUnifiedSearch";
import { SEARCH_DEBOUNCE_MS } from "../lib/searchConstants";
import type { ForwardGeocodeFeature } from "../lib/geocoding";
import { gamesMatchingSport, closestGame } from "../lib/sportSearch";
import type { ProfileSearchRow } from "../lib/supabase";
import { useMyProfile } from "../hooks/useMyProfile";
import { useUserStats } from "../hooks/useUserStats";
import { useNotifications } from "../hooks/useNotifications";
import { supabase } from "../lib/supabase";
import { joinGame, leaveGame, deleteHostedGame, getGameLatLng, avatarIdToGlbUrl } from "../lib/api";
import { getOrCreateDmThread } from "../lib/dmChat";
import { sportEmoji } from "../lib/sportVisuals";
import type { GameRow } from "../lib/supabase";
import { filterGamesVisibleOnMap } from "../lib/mapGameTimer";
import { readLocationVisibility, writeLocationVisibility, type LocationVisibilityMode } from "../lib/locationVisibility";
import { StarRating } from "./components/ui/StarRating";

const DEFAULT_AVATAR_IMAGE =
  "https://images.unsplash.com/photo-1624280184393-53ce60e214ea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=100";

const LOCATION_SEARCH_ZOOM = 12.5;
const FAR_SPORT_ZOOM = 11.5;
const EXTENDED_GAMES_RADIUS_KM = 120;

export default function App() {
  const { coords: userCoords, error: locationError } = useGeolocation();
  // For this experiment: keep the app usable even if location is blocked.
  // (Browsers control permission prompts; we can't force "Allow", but we can fall back.)
  const effectiveUserCoords = userCoords ?? { lat: 40.758, lng: -73.9855 }; // Times Square

  /** Minute tick: drop expired untimed games from UI and refresh map countdown labels. */
  const [mapMinuteEpoch, setMapMinuteEpoch] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setMapMinuteEpoch((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const [mapSearchLocation, setMapSearchLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [sportFocus, setSportFocus] = useState<{ sport: string } | null>(null);
  const [gamesRadiusKm, setGamesRadiusKm] = useState(DEFAULT_FILTERS.gamesRadiusKm);
  const [mapCameraRequest, setMapCameraRequest] = useState<MapCameraRequest | null>(null);
  const mapCameraIdRef = useRef(0);
  const sportCameraSigRef = useRef("");
  const emptySportToastSportRef = useRef<string | null>(null);

  const gamesFetchLat =
    sportFocus && userCoords
      ? userCoords.lat
      : mapSearchLocation?.lat ?? effectiveUserCoords.lat;
  const gamesFetchLng =
    sportFocus && userCoords
      ? userCoords.lng
      : mapSearchLocation?.lng ?? effectiveUserCoords.lng;

  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [filtersDraft, setFiltersDraft] = useState<FiltersState>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const {
    games,
    profiles: nearbyProfiles,
    loading: nearbyLoading,
    refetch: refetchGames,
    gamesError,
  } = useNearbyMapQueries({
    gamesLat: gamesFetchLat,
    gamesLng: gamesFetchLng,
    gamesRadiusKm,
    profilesLat: userCoords?.lat ?? null,
    profilesLng: userCoords?.lng ?? null,
    athletesRadiusKm: appliedFilters.athletesRadiusKm,
  });
  const [venuesFetchLoading, setVenuesFetchLoading] = useState(false);
  const [filterApplySync, setFilterApplySync] = useState(false);
  const filterApplyStartedAtRef = useRef<number | null>(null);

  const handleVenuesFetchLoading = useCallback((loading: boolean) => {
    setVenuesFetchLoading(loading);
  }, []);

  /** Keep "Applying filters" visible briefly so fast API/venue updates still show feedback (React may batch loading toggles). */
  useEffect(() => {
    if (!filterApplySync) return;
    const idle = !nearbyLoading && !venuesFetchLoading;
    if (!idle) return;

    const minMs = 550;
    const started = filterApplyStartedAtRef.current ?? 0;
    const elapsed = Date.now() - started;
    const finish = () => {
      setFilterApplySync(false);
      filterApplyStartedAtRef.current = null;
    };

    if (elapsed < minMs) {
      const id = window.setTimeout(finish, minMs - elapsed);
      return () => window.clearTimeout(id);
    }
    finish();
  }, [filterApplySync, nearbyLoading, venuesFetchLoading]);

  const showMapLoadingBanner = venuesFetchLoading || filterApplySync;

  const mapLoadingLines = useMemo(() => {
    const lines: string[] = [];
    if (filterApplySync) {
      lines.push("Applying your map filters…");
    }
    if (venuesFetchLoading) {
      lines.push("Loading sports venues from OpenStreetMap (radius / area)…");
    }
    if (filterApplySync && nearbyLoading) {
      lines.push("Fetching nearby games and athletes…");
    }
    return lines;
  }, [venuesFetchLoading, filterApplySync, nearbyLoading]);
  const { avatarId, avatarUrl, athleteProfile } = useMyProfile();
  const favoriteSport = athleteProfile.favoriteSport?.trim() ?? null;
  const { stats } = useUserStats();
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, markRead } = useNotifications({ limit: 10 });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [locationVisibility, setLocationVisibility] = useState<LocationVisibilityMode>(() => readLocationVisibility());
  const [toast, setToast] = useState<{ id: string; message: string; type: string } | null>(null);
  const toastShownIds = useRef<Set<string>>(new Set());
  const [selectedGame, setSelectedGame] = useState<GameRow | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenueSelection | null>(null);
  const [gamePopupRequest, setGamePopupRequest] = useState<{ nonce: number; gameId: string } | null>(null);
  const openGamePopupNonceRef = useRef(0);
  const [createGameOpen, setCreateGameOpen] = useState(false);
  const [createGameCoords, setCreateGameCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [createGameAnchorPoint, setCreateGameAnchorPoint] = useState<{ x: number; y: number } | null>(null);
  const [createGameLocationLabel, setCreateGameLocationLabel] = useState<string | null>(null);
  const [joinedGameIds, setJoinedGameIds] = useState<Set<string>>(new Set());
  const [hostGameIds, setHostGameIds] = useState<Set<string>>(new Set());
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messengerFocus, setMessengerFocus] = useState<MessengerThreadFocus | null>(null);
  const [liveNowOpen, setLiveNowOpen] = useState(false);
  const [centerOnUserTrigger, setCenterOnUserTrigger] = useState(0);
  const lastNearbyIdsRef = useRef<Set<string>>(new Set());
  const lastProxNotifAtRef = useRef<number>(0);

  const canFireProximityNotif = useCallback((): boolean => {
    try {
      const key = "fun_prox_notifs_v1";
      const raw = localStorage.getItem(key);
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const ts: number[] = raw ? (JSON.parse(raw) as number[]) : [];
      const recent = ts.filter((t) => typeof t === "number" && now - t < dayMs);
      if (recent.length >= 3) return false;
      // also avoid bursts (even within the cap)
      if (now - lastProxNotifAtRef.current < 60_000) return false;
      recent.push(now);
      localStorage.setItem(key, JSON.stringify(recent));
      lastProxNotifAtRef.current = now;
      return true;
    } catch {
      return false;
    }
  }, []);

  const distMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sLat = Math.sin(dLat / 2);
    const sLng = Math.sin(dLng / 2);
    const x = sLat * sLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sLng * sLng;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  };

  // Proximity notifications (top 3 signals, hard-capped)
  useEffect(() => {
    if (!userCoords) return;
    if (!nearbyProfiles) return;
    const prev = lastNearbyIdsRef.current;
    const next = new Set(nearbyProfiles.map((p) => p.profile_id));
    lastNearbyIdsRef.current = next;

    const prevCount = prev.size;
    const nextCount = next.size;
    const newCount = nearbyProfiles.filter((p) => !prev.has(p.profile_id)).length;

    // 1) First players nearby
    if (prevCount === 0 && nextCount > 0) {
      if (canFireProximityNotif()) {
        setToast({
          id: `prox-nearby-${Date.now()}`,
          type: "info",
          message: `${Math.min(99, nextCount)} player${nextCount === 1 ? "" : "s"} near you right now`,
        });
      }
      return;
    }

    // 2) A new player appeared near you
    if (newCount > 0) {
      if (canFireProximityNotif()) {
        setToast({
          id: `prox-new-${Date.now()}`,
          type: "info",
          message: `New player nearby (+${Math.min(9, newCount)})`,
        });
      }
      return;
    }

    // 3) Players near your currently selected venue
    if (selectedVenue) {
      const venueKey = `fun_prox_venue_once_${selectedVenue.id}`;
      let already = false;
      try {
        already = localStorage.getItem(venueKey) === "1";
      } catch {
        already = false;
      }
      if (!already) {
        const nearVenue = nearbyProfiles.some((p) => distMeters(selectedVenue.center, { lat: p.lat, lng: p.lng }) <= 250);
        if (nearVenue && canFireProximityNotif()) {
          try {
            localStorage.setItem(venueKey, "1");
          } catch {
            /* ignore */
          }
          setToast({
            id: `prox-venue-${selectedVenue.id}-${Date.now()}`,
            type: "info",
            message: "Players are active near this venue",
          });
        }
      }
    }
  }, [nearbyProfiles, selectedVenue?.id, selectedVenue?.center.lat, selectedVenue?.center.lng, userCoords?.lat, userCoords?.lng, canFireProximityNotif]);

  useEffect(() => {
    prefetchMapboxGl();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  /** Restore joined games from DB (uses getUser() so it works right after sign-in, before React state updates). */
  const reloadJoinedGameIds = useCallback(async () => {
    if (!supabase) {
      setJoinedGameIds(new Set());
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setJoinedGameIds(new Set());
      return;
    }
    const { data } = await supabase
      .from("game_participants")
      .select("game_id, role")
      .eq("user_id", user.id);

    const rows = data ?? [];
    setJoinedGameIds(new Set(rows.map((r) => r.game_id as string)));
    setHostGameIds(new Set(rows.filter((r) => r.role === "host").map((r) => r.game_id as string)));
  }, []);

  useEffect(() => {
    void reloadJoinedGameIds();
  }, [currentUserId, reloadJoinedGameIds]);

  const ensureSession = async (): Promise<boolean> => {
    if (!supabase) return false;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setCurrentUserId(session.user?.id ?? null);
      return true;
    }
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn("[FUN] Anonymous sign-in failed. Enable it in Supabase: Authentication → Providers → Anonymous.", error);
      return false;
    }
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);
    return true;
  };

  // Deep-link: open a DM thread from `/?dm=<userId>`
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const dm = params.get("dm");
    if (!dm) return;
    if (!supabase) return;

    let cancelled = false;
    void (async () => {
      const ok = await ensureSession();
      if (!ok || cancelled) return;
      const { threadId, error } = await getOrCreateDmThread(dm);
      if (cancelled) return;
      if (error || !threadId) return;

      let displayName: string | null = null;
      let avatarUrl: string | null = null;
      try {
        const { data } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", dm).single();
        const row = data as { display_name?: string | null; avatar_url?: string | null } | null;
        displayName = row?.display_name ?? null;
        avatarUrl = row?.avatar_url ?? null;
      } catch {
        displayName = null;
        avatarUrl = null;
      }

      setMessengerFocus({
        kind: "dm",
        threadId,
        otherUserId: dm,
        displayName,
        avatarUrl,
      });
      setMessagesOpen(true);

      // Clean URL (remove dm param) so refresh doesn't reopen.
      navigate("/", { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [location.search, navigate]);

  // Publish our location so other players see us (only if already signed in — no auto sign-in on load)
  useEffect(() => {
    if (locationVisibility === "ghost") return;
    if (!userCoords?.lat || !userCoords?.lng || !supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && supabase) {
        setCurrentUserId(session.user.id);
        supabase.rpc("update_my_location", { p_lat: userCoords.lat, p_lng: userCoords.lng }).then(() => {}, () => {});
      }
    });
  }, [userCoords?.lat, userCoords?.lng, locationVisibility]);

  const handleJoin = async (game: GameRow) => {
    const ok = await ensureSession();
    if (!ok) return;
    const err = await joinGame(game.id);
    if (!err) {
      await reloadJoinedGameIds();
      refetchGames();
      setMessengerFocus({
        kind: "game",
        gameId: game.id,
        title: game.title || "Pickup game",
        sport: game.sport,
        startsAt: game.starts_at,
        createdAt: game.created_at,
        participantCount: game.participant_count,
        spotsRemaining: game.spots_remaining,
      });
      setMessagesOpen(true);
    }
  };

  const handleOpenChatForGame = (game: GameRow) => {
    setMessengerFocus({
      kind: "game",
      gameId: game.id,
      title: game.title || "Pickup game",
      sport: game.sport,
      startsAt: game.starts_at,
      createdAt: game.created_at,
      participantCount: game.participant_count,
      spotsRemaining: game.spots_remaining,
    });
    setMessagesOpen(true);
  };

  const handleLeave = async (game: GameRow) => {
    const ok = await ensureSession();
    if (!ok) return;

    const err = await leaveGame(game.id);
    if (!err) {
      await reloadJoinedGameIds();
      refetchGames();

      // If the user is currently viewing the thread for this game, close it.
      if (messagesOpen && messengerFocus?.kind === "game" && messengerFocus.gameId === game.id) {
        setMessagesOpen(false);
        setMessengerFocus(null);
      }
    }
  };

  const handleLeaveThreadById = async (gameId: string) => {
    const ok = await ensureSession();
    if (!ok) return;

    const err = await leaveGame(gameId);
    if (!err) {
      await reloadJoinedGameIds();
      refetchGames();

      // If the user is currently viewing the thread for this game, close it.
      if (messagesOpen && messengerFocus?.kind === "game" && messengerFocus.gameId === gameId) {
        setMessagesOpen(false);
        setMessengerFocus(null);
      }
    }
  };

  const handleDeleteHostedGame = async (game: GameRow): Promise<boolean> => {
    const ok = await ensureSession();
    if (!ok) return false;
    const err = await deleteHostedGame(game.id);
    if (err) {
      setToast({ id: `del-game-${game.id}`, message: err.message, type: "error" });
      return false;
    }
    await reloadJoinedGameIds();
    refetchGames();
    if (selectedGame?.id === game.id) setSelectedGame(null);
    if (messagesOpen && messengerFocus?.kind === "game" && messengerFocus.gameId === game.id) {
      setMessagesOpen(false);
      setMessengerFocus(null);
    }
    return true;
  };

  const handleOpenGameFromCard = (game: GameRow) => {
    // 1) Center camera on the game's location.
    mapCameraIdRef.current += 1;
    setMapCameraRequest({
      id: mapCameraIdRef.current,
      kind: "fly",
      lat: game.lat,
      lng: game.lng,
      zoom: 16,
    });

    // 2) Open the join modal (GameEventPopup) after the camera moves.
    openGamePopupNonceRef.current += 1;
    setGamePopupRequest({ nonce: openGamePopupNonceRef.current, gameId: game.id });
  };

  const handleSelectGameOnMapFromChat = async (gameId: string) => {
    // Prefer coordinates from our already-fetched `games` list (used for map markers),
    // so chat clicks still work even if the RPC isn't available yet.
    const inMemoryGame = games.find((g) => g.id === gameId);
    const coords =
      inMemoryGame && typeof inMemoryGame.lat === "number" && typeof inMemoryGame.lng === "number"
        ? { lat: inMemoryGame.lat, lng: inMemoryGame.lng }
        : await getGameLatLng(gameId);
    if (!coords) return;
    mapCameraIdRef.current += 1;
    setMapCameraRequest({
      id: mapCameraIdRef.current,
      kind: "fly",
      lat: coords.lat,
      lng: coords.lng,
      zoom: 16,
    });
  };

  useEffect(() => {
    const last = notifications[0];
    if (!last || last.is_read || toastShownIds.current.has(last.id)) return;
    toastShownIds.current.add(last.id);
    const msg =
      last.type === "badge_earned"
        ? `Badge earned: ${(last.payload as { badge_slug?: string }).badge_slug ?? "?"}`
        : last.type === "game_completed"
          ? "A game you joined was completed."
          : "New notification";
    setToast({ id: last.id, message: msg, type: last.type });
    markRead(last.id);
  }, [notifications, markRead]);

  const searchAnchorLat = gamesFetchLat;
  const searchAnchorLng = gamesFetchLng;

  const unifiedSearch = useUnifiedSearch({
    debouncedQuery: debouncedSearch,
    anchorLat: searchAnchorLat,
    anchorLng: searchAnchorLng,
    excludeUserId: currentUserId,
    games,
  });

  useEffect(() => {
    if (!sportFocus || !userCoords) return;
    if (nearbyLoading) return;
    const matching = gamesMatchingSport(games, sportFocus.sport);
    if (matching.length === 0 && gamesRadiusKm < EXTENDED_GAMES_RADIUS_KM) {
      setGamesRadiusKm(EXTENDED_GAMES_RADIUS_KM);
    }
  }, [sportFocus, games, nearbyLoading, gamesRadiusKm, userCoords]);

  useEffect(() => {
    if (!sportFocus || !userCoords || nearbyLoading) return;
    const matching = gamesMatchingSport(games, sportFocus.sport);
    if (matching.length === 0) {
      if (
        gamesRadiusKm >= EXTENDED_GAMES_RADIUS_KM &&
        emptySportToastSportRef.current !== sportFocus.sport
      ) {
        emptySportToastSportRef.current = sportFocus.sport;
        setToast({
          id: `sport-empty-${sportFocus.sport}`,
          message: `No ${sportFocus.sport} games found in range. Try creating one on the map.`,
          type: "info",
        });
      }
      return;
    }
    const minD = Math.min(...matching.map((g) => g.distance_km));
    const sig = `${sportFocus.sport}:${matching
      .map((g) => g.id)
      .sort()
      .join(",")}:${gamesRadiusKm}:${minD.toFixed(3)}`;
    if (sportCameraSigRef.current === sig) return;
    sportCameraSigRef.current = sig;

    mapCameraIdRef.current += 1;
    const id = mapCameraIdRef.current;

    if (minD > 5) {
      const c = closestGame(matching)!;
      setMapCameraRequest({
        id,
        kind: "fly",
        lat: c.lat,
        lng: c.lng,
        zoom: FAR_SPORT_ZOOM,
      });
    } else {
      const coordinates: [number, number][] = matching.map((g) => [g.lng, g.lat]);
      coordinates.push([userCoords.lng, userCoords.lat]);
      setMapCameraRequest({ id, kind: "fitBounds", coordinates });
    }
  }, [sportFocus, games, nearbyLoading, gamesRadiusKm, userCoords]);

  const displayGames = useMemo(() => {
    let list = filterGamesVisibleOnMap(games, Date.now());
    if (sportFocus) list = gamesMatchingSport(list, sportFocus.sport);
    if (appliedFilters.sports.length > 0) {
      const allow = new Set(appliedFilters.sports);
      list = list.filter((g) => allow.has(g.sport));
    }
    return list;
  }, [games, sportFocus, appliedFilters.sports, mapMinuteEpoch]);

  useEffect(() => {
    if (!selectedGame) return;
    if (!displayGames.some((g) => g.id === selectedGame.id)) {
      setSelectedGame(null);
    }
  }, [displayGames, selectedGame]);

  const clearMapSearch = () => {
    setSearchQuery("");
    setMapSearchLocation(null);
    setSportFocus(null);
    setGamesRadiusKm(appliedFilters.gamesRadiusKm);
    sportCameraSigRef.current = "";
    emptySportToastSportRef.current = null;
    if (userCoords) {
      mapCameraIdRef.current += 1;
      setMapCameraRequest({
        id: mapCameraIdRef.current,
        kind: "fly",
        lat: userCoords.lat,
        lng: userCoords.lng,
        zoom: 16,
      });
    } else {
      setMapCameraRequest(null);
    }
  };

  const handlePickGeocode = (f: ForwardGeocodeFeature) => {
    const [lng, lat] = f.center;
    setMapSearchLocation({ lat, lng });
    setSelectedVenue(null);
    setSportFocus(null);
    setGamesRadiusKm(appliedFilters.gamesRadiusKm);
    sportCameraSigRef.current = "";
    emptySportToastSportRef.current = null;
    mapCameraIdRef.current += 1;
    setMapCameraRequest({
      id: mapCameraIdRef.current,
      kind: "fly",
      lat,
      lng,
      zoom: LOCATION_SEARCH_ZOOM,
    });
    setSearchQuery(f.place_name);
  };

  const handlePickSport = (sport: string) => {
    setSportFocus({ sport });
    setMapSearchLocation(null);
    setGamesRadiusKm(appliedFilters.gamesRadiusKm);
    sportCameraSigRef.current = "";
    emptySportToastSportRef.current = null;
    setSearchQuery(sport);
  };

  const handleCenterOnUser = () => {
    setMapSearchLocation(null);
    setSportFocus(null);
    setGamesRadiusKm(appliedFilters.gamesRadiusKm);
    sportCameraSigRef.current = "";
    emptySportToastSportRef.current = null;
    setSearchQuery("");
    setMapCameraRequest(null);
    setCenterOnUserTrigger((n) => n + 1);
  };

  const avatarGlbUrl = avatarId ? avatarIdToGlbUrl(avatarId, "low") : null;

  const handlePickPerson = (p: ProfileSearchRow) => {
    navigate(`/athlete/${p.profile_id}`);
  };

  return (
    <div className="relative w-full h-screen bg-[#0A0F1C] overflow-hidden font-sans touch-none selection:bg-emerald-500/30">
      {/* Real map (Mapbox) — code-split; mapbox-gl prefetched on mount */}
      <Suspense
        fallback={
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0A0F1C] text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" aria-hidden />
            <p className="text-sm">Loading map…</p>
          </div>
        }
      >
        <MapboxMap
          userCoords={effectiveUserCoords}
          games={displayGames}
          mapMinuteEpoch={mapMinuteEpoch}
          mapCameraRequest={mapCameraRequest}
          nearbyProfiles={nearbyProfiles}
          currentUserId={currentUserId}
          userSportsmanship={athleteProfile?.trust?.sportsmanship ?? null}
          selectedGameId={selectedGame?.id ?? null}
          onSelectGame={setSelectedGame}
          selectedVenue={selectedVenue}
          onSelectVenue={setSelectedVenue}
          venuesCenter={mapSearchLocation ?? effectiveUserCoords}
          venueSearchRadiusKm={appliedFilters.venueRadiusKm}
          venueSportsFilter={appliedFilters.sports}
          onVenuesFetchLoadingChange={handleVenuesFetchLoading}
          gamePopupRequest={gamePopupRequest}
          onJoinGame={handleJoin}
          onOpenMessagesForGame={handleOpenChatForGame}
          onLeaveGame={handleLeave}
          onDeleteHostedGame={handleDeleteHostedGame}
          joinedGameIds={joinedGameIds}
          hostGameIds={hostGameIds}
          onMapDoubleClick={(lat, lng, viewportPoint) => {
            setCreateGameCoords({ lat, lng });
            setCreateGameAnchorPoint(viewportPoint ?? null);
            setCreateGameLocationLabel(null);
            setCreateGameOpen(true);
          }}
          onCreateGameAtVenue={(venue, viewportPoint) => {
            setCreateGameCoords({ lat: venue.center.lat, lng: venue.center.lng });
            setCreateGameAnchorPoint(viewportPoint ?? null);
            const prettyLabel = (s: string | undefined | null) => {
              const raw = s?.trim();
              if (!raw) return null;
              return raw.replace(/_/g, " ").replace(/\s+/g, " ");
            };

            const name = prettyLabel(venue.name);
            const sport = prettyLabel(venue.sport);
            const leisure = prettyLabel(venue.leisure);
            setCreateGameLocationLabel(
              name ??
                (sport && leisure ? `${sport} ${leisure}` : sport ?? leisure ?? "Sports venue")
            );
            setCreateGameOpen(true);
          }}
          centerOnUserTrigger={centerOnUserTrigger}
          enable3D={true}
          userAvatarUrl={avatarUrl ?? null}
          avatarGlbUrl={avatarGlbUrl}
        />
      </Suspense>

      {showMapLoadingBanner && (
        <div
          className="pointer-events-none absolute left-4 top-24 z-[55] max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-slate-950/92 px-3 py-2.5 shadow-lg backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-start gap-2.5">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-emerald-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100">Updating map</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-3.5 text-[11px] leading-snug text-slate-400">
                {mapLoadingLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {locationError && userCoords == null && (
        <div className="absolute top-20 left-4 right-4 z-50 rounded-lg bg-amber-900/80 text-amber-200 text-sm px-3 py-2">
          Location: {locationError}. Using a default location for now — allow location for accurate nearby games.
        </div>
      )}

      {gamesError && (
        <div className="absolute top-20 left-4 right-4 z-50 rounded-lg bg-slate-800/95 text-slate-200 text-sm px-3 py-2 border border-slate-600">
          <strong>Database setup needed:</strong> Run the SQL from <code className="bg-slate-700 px-1 rounded">supabase/schema.sql</code> in your Supabase project (SQL Editor → New query → paste → Run). Then refresh.
        </div>
      )}

      {toast && (
        <div
          className="absolute top-24 left-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg border border-slate-600 bg-slate-800/95 backdrop-blur-sm"
          role="status"
        >
          {toast.message}
        </div>
      )}

      <TopNavigation
        liveNowOpen={liveNowOpen}
        onLiveNowToggle={() => setLiveNowOpen((v) => !v)}
        onCenterOnUser={handleCenterOnUser}
        onOpenFilters={() => setFiltersOpen(true)}
        onOpenMessages={() => {
          setMessengerFocus(null);
          setMessagesOpen(true);
        }}
        joinedGameCount={joinedGameIds.size}
        locationVisibility={locationVisibility}
        onLocationVisibilityChange={(mode) => {
          setLocationVisibility(mode);
          writeLocationVisibility(mode);
        }}
        mapSearch={{
          query: searchQuery,
          onQueryChange: setSearchQuery,
          onClear: clearMapSearch,
          placesLoading: unifiedSearch.placesLoading,
          places: unifiedSearch.places,
          sportHits: unifiedSearch.sportHits.map((h) => ({
            sport: h.sport,
            nearbyCount: h.nearbyCount,
            matchKind: h.matchKind,
          })),
          peopleLoading: unifiedSearch.peopleLoading,
          people: unifiedSearch.people,
          sectionOrder: unifiedSearch.sectionOrder,
          playersNearMe: unifiedSearch.playersNearMe,
          onPickPlace: handlePickGeocode,
          onPickSport: handlePickSport,
          onPickPerson: handlePickPerson,
        }}
      />

      <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none flex flex-col justify-end">
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C] via-[#0A0F1C]/90 to-transparent pointer-events-none -z-10 h-full" />
        <div className="absolute bottom-6 left-4 z-50 pointer-events-none">
          <div className="relative w-20 h-20 pointer-events-auto">
            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="w-full h-full cursor-pointer rounded-full border-2 border-slate-700/50 bg-slate-800/80 backdrop-blur-md overflow-hidden flex items-center justify-center shadow-lg transition-[box-shadow,transform,border-color] duration-200 ease-out hover:border-cyan-400/55 hover:ring-2 hover:ring-cyan-400/35 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0F1C]"
              aria-label="Profile"
            >
              <img
                src={avatarUrl?.trim() || DEFAULT_AVATAR_IMAGE}
                alt=""
                className="w-full h-full object-cover"
              />
              <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-800" />
            </button>
            <div className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/80 px-2 py-1 backdrop-blur-md">
              <StarRating value={athleteProfile.trust?.sportsmanship ?? null} size={10} />
            </div>
            {favoriteSport ? (
              <span
                className="pointer-events-none absolute z-20 -bottom-1 -right-1 select-none text-3xl leading-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.5)]"
                title={favoriteSport}
                role="img"
                aria-label={`Favorite sport: ${favoriteSport}`}
              >
                {sportEmoji(favoriteSport)}
              </span>
            ) : null}
          </div>
        </div>
        <BottomCarousel
          games={displayGames}
          selectedGame={selectedGame}
          onSelectGame={setSelectedGame}
          onOpenGame={handleOpenGameFromCard}
          joinedGameIds={joinedGameIds}
          currentUserId={currentUserId}
          liveNowOpen={liveNowOpen}
          onOpenMessages={() => {
            setMessengerFocus(null);
            setMessagesOpen(true);
          }}
        />
      </div>

      <CreateGameModal
        open={createGameOpen}
        onOpenChange={(open) => {
          setCreateGameOpen(open);
          if (!open) {
            setCreateGameCoords(null);
            setCreateGameAnchorPoint(null);
            setCreateGameLocationLabel(null);
          }
        }}
        userCoords={createGameCoords ?? effectiveUserCoords}
        locationLabel={createGameLocationLabel}
        anchorPoint={createGameAnchorPoint}
        onSuccess={() => {
          void reloadJoinedGameIds();
          refetchGames();
        }}
        ensureSession={ensureSession}
      />

      <GameMessengerSheet
        open={messagesOpen}
        onOpenChange={(open) => {
          setMessagesOpen(open);
          if (!open) setMessengerFocus(null);
        }}
        focusThread={messengerFocus}
        onFocusThreadChange={setMessengerFocus}
        currentUserId={currentUserId}
        ensureSession={ensureSession}
        onSelectGameOnMap={handleSelectGameOnMapFromChat}
        joinedGameIds={joinedGameIds}
        onLeaveThread={handleLeaveThreadById}
      />

      <FiltersModal
        open={filtersOpen}
        onOpenChange={(open) => {
          setFiltersOpen(open);
          if (open) setFiltersDraft(appliedFilters);
        }}
        value={filtersDraft}
        onChange={setFiltersDraft}
        onApply={() => {
          filterApplyStartedAtRef.current = Date.now();
          setFilterApplySync(true);
          setAppliedFilters(filtersDraft);
          setGamesRadiusKm(filtersDraft.gamesRadiusKm);
        }}
        onClear={() => {
          filterApplyStartedAtRef.current = Date.now();
          setFilterApplySync(true);
          setAppliedFilters(DEFAULT_FILTERS);
          setGamesRadiusKm(DEFAULT_FILTERS.gamesRadiusKm);
        }}
      />
    </div>
  );
}
