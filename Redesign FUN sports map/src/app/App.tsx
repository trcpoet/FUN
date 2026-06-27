import React, { Suspense, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import type { MapCameraRequest, VenueSelection } from "./components/mapboxMapTypes";
import { prefetchMapboxGl } from "./lib/mapboxCached";
import { FunOrbitLoader } from "./components/FunOrbitLoader";
import { useAuth } from "./contexts/AuthContext";
import { useIdleReady } from "../hooks/useIdleReady";

const MapboxMap = React.lazy(() =>
  import("./components/MapboxMap").then((m) => ({ default: m.MapboxMap }))
);
import { TopNavigation } from "./components/TopUI";
import { BottomCarousel } from "./components/BottomCarousel";
import { GameMessengerSheet } from "./components/GameMessengerSheet";
import type { MessengerThreadFocus, PlanRematchPayload } from "./components/GameMessengerSheet";
import { CreateGameModal, type CreateGamePrefill } from "./components/CreateGameModal";
import { toast } from "sonner";
import { FiltersModal, type FiltersState, DEFAULT_FILTERS } from "./components/FiltersModal";
import { useGeolocation, getLastKnownCoords } from "../hooks/useGeolocation";
import { useNearbyMapQueries } from "../hooks/useNearbyMapQueries";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useUnifiedSearch } from "../hooks/useUnifiedSearch";
import { SEARCH_DEBOUNCE_MS } from "../lib/searchConstants";
import type { ForwardGeocodeFeature } from "../lib/geocoding";
import { gamesMatchingSport, closestGame } from "../lib/sportSearch";
import type { DmInboxRow, GameInboxRow, ProfileSearchRow } from "../lib/supabase";
import { useMyProfile } from "../hooks/useMyProfile";
import { useUserStats } from "../hooks/useUserStats";
import { useNotifications } from "../hooks/useNotifications";
import { useTotalUnreadMessages } from "../hooks/useTotalUnreadMessages";
import { supabase } from "../lib/supabase";
import { joinGame, leaveGame, deleteHostedGame, getGameLatLng, avatarIdToGlbUrl, startGame, endGame, fetchNotesNearby, fetchNoteById, fetchVenueById } from "../lib/api";
import { fetchMyDmInbox, getOrCreateDmThread } from "../lib/dmChat";
import { fetchMyGameInbox, sendGameMessage } from "../lib/gameChat";
import { visibilityEnumToLabel } from "../lib/gamePreferenceOptions";
import { sportEmoji } from "../lib/sportVisuals";
import type { GameRow, MapNoteRow } from "../lib/supabase";
import { filterGamesVisibleOnMap, isGameInLiveWindow } from "../lib/mapGameTimer";
import { gameMatchesFilters, countMatchingGames, deriveDefaultFiltersFromProfile, gameVisibleToViewer } from "./lib/gameFilters";
import { readLocationVisibility, writeLocationVisibility, type LocationVisibilityMode } from "../lib/locationVisibility";
import { readFollowedIds, writeFollowedIds } from "../lib/localFollows";
import { updateMyPresence, migrateLocalFollowsToDb } from "../lib/api";
import { StarRating } from "./components/ui/StarRating";
import { NoteThreadDialog } from "./components/feed/NoteThreadDialog";
import { MapToast } from "./components/MapToast";
import {
  readStoredVenueSportIntent,
  venueIntentToSportFilter,
  writeStoredVenueSportIntent,
  type VenueSportIntent,
} from "./lib/venueSportIntent";

const DEFAULT_AVATAR_IMAGE =
  "https://images.unsplash.com/photo-1624280184393-53ce60e214ea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=100";

const LOCATION_SEARCH_ZOOM = 12.5;
const FAR_SPORT_ZOOM = 11.5;
const EXTENDED_GAMES_RADIUS_KM = 120;

const APPLIED_FILTERS_KEY = "fun_applied_f_v1";
const FILTERS_SEEDED_KEY = "fun_applied_filters_seeded_v1";

function readPersistedFilters(): FiltersState | null {
  try {
    const raw = localStorage.getItem(APPLIED_FILTERS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<FiltersState>;
    return { ...DEFAULT_FILTERS, ...p, sports: Array.isArray(p.sports) ? p.sports : [] };
  } catch {
    return null;
  }
}

function persistAppliedFilters(f: FiltersState) {
  try {
    localStorage.setItem(APPLIED_FILTERS_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}

export default function App() {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const secondaryReady = useIdleReady();
  const { coords: userCoords, error: locationError } = useGeolocation();
  // For this experiment: keep the app usable even if location is blocked.
  // (Browsers control permission prompts; we can't force "Allow", but we can fall back.)
  // Seed the fallback from the user's last known location (persisted across mounts)
  // so returning to the map (e.g. globe button) centers there immediately instead of
  // flashing Times Square while live geolocation resolves. Read once on mount.
  const lastKnownCoords = useMemo(() => getLastKnownCoords(), []);
  const effectiveUserCoords =
    userCoords ?? lastKnownCoords ?? { lat: 40.758, lng: -73.9855 }; // Times Square (first-ever visit only)

  /** Minute tick: drop expired untimed games from UI and refresh map countdown labels. */
  const [mapMinuteEpoch, setMapMinuteEpoch] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setMapMinuteEpoch((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const [mapSearchLocation, setMapSearchLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapSearchLocationName, setMapSearchLocationName] = useState<string | null>(null);
  const [sportFocus, setSportFocus] = useState<{ sport: string } | null>(null);
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

  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(() => readPersistedFilters() ?? DEFAULT_FILTERS);
  const [filtersDraft, setFiltersDraft] = useState<FiltersState>(() => readPersistedFilters() ?? DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // sportFocus may auto-extend the games radius to 120km when a searched sport has 0 nearby games.
  // One-shot override per sportFocus session; user Apply always wins (single source of truth = appliedFilters).
  const [sportExtendRadius, setSportExtendRadius] = useState<number | null>(null);
  const sportExtendSessionRef = useRef<string | null>(null);
  const effectiveGamesRadiusKm = sportExtendRadius ?? appliedFilters.gamesRadiusKm;

  const refetchNotes = useCallback(async () => {
    const { data } = await fetchNotesNearby({
      lat: gamesFetchLat,
      lng: gamesFetchLng,
      // Keep notes roughly aligned with venue/game context so pins populate when the map area changes.
      radiusKm: Math.max(10, appliedFilters.venueRadiusKm),
      limit: 120,
    });
    setMapNotes(data ?? []);
  }, [gamesFetchLat, gamesFetchLng, appliedFilters.venueRadiusKm]);

  const {
    games,
    profiles: nearbyProfiles,
    loading: nearbyLoading,
    refetch: refetchGames,
    gamesError,
  } = useNearbyMapQueries({
    gamesLat: gamesFetchLat,
    gamesLng: gamesFetchLng,
    gamesRadiusKm: effectiveGamesRadiusKm,
    profilesLat: userCoords?.lat ?? effectiveUserCoords.lat,
    profilesLng: userCoords?.lng ?? effectiveUserCoords.lng,
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

  const { avatarId, avatarUrl, athleteProfile } = useMyProfile();

  // Seed filter defaults from the user's profile prefs once (skill/age/matchType), filling only unset
  // fields. Guarded by localStorage so user Apply / persisted filters always win afterwards.
  const filtersSeededRef = useRef(false);
  useEffect(() => {
    if (filtersSeededRef.current) return;
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem(FILTERS_SEEDED_KEY)) return;
    if (localStorage.getItem(APPLIED_FILTERS_KEY)) {
      filtersSeededRef.current = true; // persisted override already exists; never seed over it
      return;
    }
    const seed = deriveDefaultFiltersFromProfile(athleteProfile);
    if (Object.keys(seed).length === 0) return; // wait until profile prefs load
    filtersSeededRef.current = true;
    localStorage.setItem(FILTERS_SEEDED_KEY, "1");
    setAppliedFilters((prev) => {
      const next = { ...prev };
      if (next.skillLevel === "Any" && seed.skillLevel) next.skillLevel = seed.skillLevel;
      if (next.ageRange === "Any" && seed.ageRange) next.ageRange = seed.ageRange;
      if (next.matchType === "Any" && seed.matchType) next.matchType = seed.matchType;
      persistAppliedFilters(next);
      return next;
    });
    setFiltersDraft((prev) => ({
      ...prev,
      skillLevel: prev.skillLevel === "Any" && seed.skillLevel ? seed.skillLevel : prev.skillLevel,
      ageRange: prev.ageRange === "Any" && seed.ageRange ? seed.ageRange : prev.ageRange,
      matchType: prev.matchType === "Any" && seed.matchType ? seed.matchType : prev.matchType,
    }));
  }, [athleteProfile]);
  const favoriteSport = athleteProfile.favoriteSport?.trim() ?? null;

  const [venueSportIntent, setVenueSportIntent] = useState<VenueSportIntent | null>(null);
  const [venueIntentReady, setVenueIntentReady] = useState(false);

  useEffect(() => {
    if (venueIntentReady) return;
    if (favoriteSport) {
      setVenueSportIntent(favoriteSport);
      setVenueIntentReady(true);
      return;
    }
    const stored = readStoredVenueSportIntent();
    // No favorite + nothing stored → default to all sports so venues load
    // immediately instead of gating behind a "What do you want to play?" prompt.
    setVenueSportIntent(stored !== undefined ? stored : null);
    setVenueIntentReady(true);
  }, [favoriteSport, venueIntentReady]);
  const { stats } = useUserStats({ enabled: secondaryReady });
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, markRead } = useNotifications({ limit: 10, enabled: secondaryReady });
  const messagesUnreadCount = useTotalUnreadMessages();
  const [locationVisibility, setLocationVisibility] = useState<LocationVisibilityMode>(() => readLocationVisibility());
  // DB-backed follows (seeded from any legacy localStorage set for instant first paint).
  const [followedIds, setFollowedIds] = useState<Set<string>>(() => readFollowedIds());
  const presenceHeartbeatAtRef = useRef(0);
  const [selectedGame, setSelectedGame] = useState<GameRow | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenueSelection | null>(null);
  const [gamePopupRequest, setGamePopupRequest] = useState<{ nonce: number; gameId: string } | null>(null);
  const openGamePopupNonceRef = useRef(0);
  const [createGameOpen, setCreateGameOpen] = useState(false);
  const [createGameCoords, setCreateGameCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [createGameAnchorPoint, setCreateGameAnchorPoint] = useState<{ x: number; y: number } | null>(null);
  const [createGameLocationLabel, setCreateGameLocationLabel] = useState<string | null>(null);
  const [createGamePrefill, setCreateGamePrefill] = useState<CreateGamePrefill | null>(null);
  const [joinedGameIds, setJoinedGameIds] = useState<Set<string>>(new Set());
  const [hostGameIds, setHostGameIds] = useState<Set<string>>(new Set());
  const [substituteGameIds, setSubstituteGameIds] = useState<Set<string>>(new Set());
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messengerFocus, setMessengerFocus] = useState<MessengerThreadFocus | null>(null);
  const [mapNotes, setMapNotes] = useState<MapNoteRow[]>([]);
  const [activeMapNote, setActiveMapNote] = useState<MapNoteRow | null>(null);
  /** Idle prefetch so opening Messages isn't blocked by cold RPCs. */
  const [gameInboxBootstrap, setGameInboxBootstrap] = useState<GameInboxRow[] | null>(null);
  const [dmInboxBootstrap, setDmInboxBootstrap] = useState<DmInboxRow[] | null>(null);
  const [satelliteOn, setSatelliteOn] = useState(false);
  const [liveNowOpen, setLiveNowOpen] = useState(false);
  const [centerOnUserTrigger, setCenterOnUserTrigger] = useState(0);

  // Notes: fetch nearby whenever the map's "games center" changes (deferred until idle).
  useEffect(() => {
    if (!secondaryReady) return;
    void refetchNotes();
  }, [refetchNotes, secondaryReady]);

  // Deep link from Feed → map game focus.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const gid = params.get("focusGameId");
    if (!gid) return;
    const game = games.find((g) => g.id === gid);
    if (!game) return;
    // Ensure venues + notes fetch around the deep-linked point (otherwise the map can look empty).
    setMapSearchLocation({ lat: game.lat, lng: game.lng });
    setMapSearchLocationName(game.location_label?.trim() || null);
    handleCenterOnCoords({ lat: game.lat, lng: game.lng });
    openGamePopupNonceRef.current += 1;
    setGamePopupRequest({ nonce: openGamePopupNonceRef.current, gameId: game.id });
    params.delete("focusGameId");
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" }, { replace: true });
  }, [games, location.pathname, location.search, navigate]);

  // Deep link from Feed / messenger → map note focus (centers + opens dialog).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nid = params.get("focusNoteId");
    if (!nid) return;
    const note = mapNotes.find((n) => n.id === nid);
    if (!note) {
      // Note may be outside the current radius cache (e.g. Feed-only far note).
      // Fetch it directly so the map can fly to the creation location.
      void fetchNoteById(nid).then((r) => {
        if (r.error || !r.data) return;
        setMapNotes((prev) => (prev.some((n) => n.id === r.data!.id) ? prev : [...prev, r.data!]));
        // Ensure venues + notes fetch around the deep-linked point.
        setMapSearchLocation({ lat: r.data.lat, lng: r.data.lng });
        setMapSearchLocationName(r.data.place_name?.trim() || "Pinned note");
        handleCenterOnCoords({ lat: r.data.lat, lng: r.data.lng });
        setActiveMapNote(r.data);
        params.delete("focusNoteId");
        navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" }, { replace: true });
      });
      return;
    }
    // Ensure venues + notes fetch around the deep-linked point.
    setMapSearchLocation({ lat: note.lat, lng: note.lng });
    setMapSearchLocationName(note.place_name?.trim() || "Pinned note");
    handleCenterOnCoords({ lat: note.lat, lng: note.lng });
    setActiveMapNote(note);
    params.delete("focusNoteId");
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" }, { replace: true });
  }, [mapNotes, location.pathname, location.search, navigate, refetchNotes]);

  // Deep link from Feed Hot Picks → map venue focus (centers + opens the venue popup).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const vid = params.get("focusVenueId");
    if (!vid) return;
    const strip = () => {
      params.delete("focusVenueId");
      navigate(
        { pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" },
        { replace: true },
      );
    };
    void fetchVenueById(vid).then((r) => {
      if (r.error || !r.data) {
        strip();
        return;
      }
      const venue = r.data;
      // Ensure venues + notes fetch around the deep-linked point.
      setMapSearchLocation({ lat: venue.center.lat, lng: venue.center.lng });
      setMapSearchLocationName(venue.name?.trim() || "Venue");
      handleCenterOnCoords({ lat: venue.center.lat, lng: venue.center.lng });
      setSelectedVenue(venue);
      strip();
    });
  }, [location.pathname, location.search, navigate]);

  // Presence heartbeat: sync location + chosen visibility mode (throttled 30s).
  // Mode changes fire an immediate update via onLocationVisibilityChange.
  useEffect(() => {
    if (!userCoords || !currentUserId) return;
    const now = Date.now();
    if (now - presenceHeartbeatAtRef.current < 30_000) return;
    presenceHeartbeatAtRef.current = now;
    void updateMyPresence({ lat: userCoords.lat, lng: userCoords.lng, mode: locationVisibility });
  }, [userCoords, currentUserId, locationVisibility]);

  // Load DB-backed follows and one-time migrate any legacy localStorage follows.
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    void (async () => {
      const merged = await migrateLocalFollowsToDb(readFollowedIds());
      if (cancelled) return;
      setFollowedIds(merged);
      writeFollowedIds(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  // Set + persist presence mode and push it to the server immediately (used by the
  // visibility toggle and the ghost banner; the GPS heartbeat above re-asserts it).
  const applyVisibilityMode = useCallback(
    (mode: LocationVisibilityMode) => {
      setLocationVisibility(mode);
      writeLocationVisibility(mode);
      if (userCoords && currentUserId) {
        presenceHeartbeatAtRef.current = Date.now();
        void updateMyPresence({ lat: userCoords.lat, lng: userCoords.lng, mode });
      }
    },
    [userCoords, currentUserId]
  );

  useEffect(() => {
    prefetchMapboxGl();
  }, []);

  const ensureSession = async (): Promise<boolean> => {
    if (currentUserId) return true;
    const { data: { session } } = await supabase!.auth.getSession();
    if (session?.user) return true;
    navigate("/login");
    return false;
  };

  const reloadJoinedGameIds = useCallback(async () => {
    if (!supabase || !currentUserId) return;
    const { data } = await supabase.from("game_participants").select("game_id, role").eq("user_id", currentUserId);
    if (data) {
      setJoinedGameIds(new Set(data.map((r) => r.game_id)));
      setHostGameIds(new Set(data.filter((r) => r.role === "host").map((r) => r.game_id)));
      setSubstituteGameIds(new Set(data.filter((r) => r.role === "substitute").map((r) => r.game_id)));
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!secondaryReady) return;
    void reloadJoinedGameIds();
  }, [reloadJoinedGameIds, secondaryReady]);

  const handlePickGeocode = (f: ForwardGeocodeFeature) => {
    setMapSearchLocation({ lat: f.center[1], lng: f.center[0] });
    setMapSearchLocationName(f.place_name?.split(',')[0]?.trim() ?? null);
    setSearchQuery("");
    setSportFocus(null);
    mapCameraIdRef.current += 1;
    setMapCameraRequest({
      id: mapCameraIdRef.current,
      kind: "fly",
      lat: f.center[1],
      lng: f.center[0],
      zoom: LOCATION_SEARCH_ZOOM,
    });
  };

  const handlePickSport = (sport: string) => {
    setSportFocus({ sport });
    setSearchQuery("");
    setMapSearchLocation(null);
    setMapSearchLocationName(null);
  };

  const handlePickPerson = (p: ProfileSearchRow) => {
    setSearchQuery("");
    setMapSearchLocation(null);
    setMapSearchLocationName(null);
    setSportFocus(null);
    navigate(`/athlete/${p.profile_id}`);
  };

  const clearMapSearch = () => {
    setSearchQuery("");
    setMapSearchLocation(null);
    setMapSearchLocationName(null);
    setSportFocus(null);
    setSportExtendRadius(null);
    sportExtendSessionRef.current = null;
  };

  const handleCenterOnUser = () => {
    if (userCoords) {
      setMapSearchLocation(null);
      setMapSearchLocationName(null);
      setCenterOnUserTrigger((n) => n + 1);
      // Recenter should also refresh nearby content (games + notes).
      refetchGames();
      void refetchNotes();
    }
  };

  const handleJoinGame = async (gameId: string) => {
    const ok = await ensureSession();
    if (!ok) return;
    const result = await joinGame(gameId);
    if (result.error) {
      toast.error("Couldn't join game", { description: result.error.message });
      return;
    }
    await reloadJoinedGameIds();
    refetchGames();
  };

  const handleLeaveGame = async (gameId: string): Promise<Error | null> => {
    const ok = await ensureSession();
    if (!ok) return new Error("Sign in to leave this game.");

    const err = await leaveGame(gameId);
    if (err) return err;

    await reloadJoinedGameIds();
    refetchGames();

    // If the user is currently viewing the thread for this game, close it.
    if (messagesOpen && messengerFocus?.kind === "game" && messengerFocus.gameId === gameId) {
      setMessagesOpen(false);
      setMessengerFocus(null);
    }
    return null;
  };

  const handleDeleteHostedGame = async (game: GameRow): Promise<boolean> => {
    const ok = await ensureSession();
    if (!ok) return false;
    const err = await deleteHostedGame(game.id);
    if (err) {
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

  const handleStartHostedGame = async (game: GameRow) => {
    const ok = await ensureSession();
    if (!ok) return;
    const err = await startGame(game.id);
    if (err) {
      return;
    }
    refetchGames();
  };

  const handleEndHostedGame = async (game: GameRow) => {
    const ok = await ensureSession();
    if (!ok) return;
    const err = await endGame(game.id);
    if (err) {
      return;
    }
    await reloadJoinedGameIds();
    refetchGames();
    if (selectedGame?.id === game.id) setSelectedGame(null);
    if (messagesOpen && messengerFocus?.kind === "game" && messengerFocus.gameId === game.id) {
      setMessagesOpen(false);
      setMessengerFocus(null);
    }
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

    // 2) Trigger the popup to open once the camera arrives (or immediately).
    openGamePopupNonceRef.current += 1;
    setGamePopupRequest({ nonce: openGamePopupNonceRef.current, gameId: game.id });
  };

  const handleOpenUserProfile = (userId: string) => {
    navigate(`/athlete/${userId}`);
  };

  const handleCenterOnCoords = (coords: { lat: number; lng: number }) => {
    mapCameraIdRef.current += 1;
    setMapCameraRequest({
      id: mapCameraIdRef.current,
      kind: "fly",
      lat: coords.lat,
      lng: coords.lng,
      zoom: 16,
    });
  };

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
    // New sport-focus session (incl. clearing): drop any prior auto-extend & re-arm the one-shot.
    setSportExtendRadius(null);
    sportExtendSessionRef.current = null;
  }, [sportFocus?.sport]);

  useEffect(() => {
    if (!sportFocus || !userCoords || nearbyLoading) return;
    if (sportExtendSessionRef.current === sportFocus.sport) return; // already resolved this session
    const matching = gamesMatchingSport(games, sportFocus.sport);
    if (matching.length === 0 && effectiveGamesRadiusKm < EXTENDED_GAMES_RADIUS_KM) {
      sportExtendSessionRef.current = sportFocus.sport;
      setSportExtendRadius(EXTENDED_GAMES_RADIUS_KM);
    }
  }, [sportFocus, games, nearbyLoading, effectiveGamesRadiusKm, userCoords]);

  useEffect(() => {
    if (!sportFocus || !userCoords || nearbyLoading) return;
    const matching = gamesMatchingSport(games, sportFocus.sport);
    if (matching.length === 0) {
      if (
        effectiveGamesRadiusKm >= EXTENDED_GAMES_RADIUS_KM &&
        emptySportToastSportRef.current !== sportFocus.sport
      ) {
        emptySportToastSportRef.current = sportFocus.sport;
        toast(`No ${sportFocus.sport} games within ${EXTENDED_GAMES_RADIUS_KM} km yet`, {
          description: "Be the first to host one.",
        });
      }
      return;
    }
    const minD = Math.min(...matching.map((g) => g.distance_km));
    const sig = `${sportFocus.sport}:${matching
      .map((g) => g.id)
      .sort()
      .join(",")}:${effectiveGamesRadiusKm}:${minD.toFixed(3)}`;
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
  }, [sportFocus, games, nearbyLoading, effectiveGamesRadiusKm, userCoords]);

  const displayGames = useMemo(() => {
    let list = filterGamesVisibleOnMap(games, Date.now());
    // Precedence = intersection: TopUI search (sportFocus) AND applied filters must both pass.
    if (sportFocus) list = gamesMatchingSport(list, sportFocus.sport);
    list = list.filter((g) => gameMatchesFilters(g, appliedFilters)); // sports + skill + age + matchType
    list = list.filter((g) => gameVisibleToViewer(g, currentUserId, followedIds)); // System C: friends/invite-only pins
    return list;
  }, [games, sportFocus, appliedFilters, mapMinuteEpoch, currentUserId, followedIds]);

  // Live preview for the FiltersModal footer — uses the draft, not appliedFilters.
  const filtersPreviewCount = useMemo(
    () => countMatchingGames(filterGamesVisibleOnMap(games, Date.now()), filtersDraft),
    [games, filtersDraft, mapMinuteEpoch]
  );

  // Genuinely-empty banner: nothing fetched nearby at all (distinct from filters hiding games).
  const [noGamesBannerDismissed, setNoGamesBannerDismissed] = useState(false);
  const showNoGamesBanner = !nearbyLoading && games.length === 0 && !noGamesBannerDismissed;

  const liveStripGames = useMemo(() => {
    const now = Date.now();
    return displayGames.filter((g) => isGameInLiveWindow(g, now));
  }, [displayGames, mapMinuteEpoch]);

  const mapGames = useMemo(
    () => (liveNowOpen ? liveStripGames : displayGames),
    [liveNowOpen, liveStripGames, displayGames]
  );

  const venueSportsFilter = useMemo(() => {
    if (!venueIntentReady) return [];
    return venueIntentToSportFilter(venueSportIntent);
  }, [venueIntentReady, venueSportIntent]);

  const handleVenueSportIntentChange = useCallback((next: VenueSportIntent) => {
    setVenueSportIntent(next);
    writeStoredVenueSportIntent(next);
    setVenueIntentReady(true);
  }, []);

  const avatarGlbUrl = avatarIdToGlbUrl(avatarId);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#0A0F1C] font-sans selection:bg-emerald-500/30">
      {activeMapNote ? (
          <NoteThreadDialog
            open={true}
            onOpenChange={(o) => {
              if (!o) setActiveMapNote(null);
            }}
            note={{
              id: activeMapNote.id,
              body: activeMapNote.body,
              created_at: activeMapNote.created_at,
              visibility: activeMapNote.visibility,
              place_name: activeMapNote.place_name,
            }}
          />
        ) : null}
      <Suspense fallback={<FunOrbitLoader tagline="Loading map…" className="absolute inset-0" />}>
        <MapboxMap
          userCoords={effectiveUserCoords}
          games={mapGames}
          notes={mapNotes}
          onOpenNoteThread={(note) => setActiveMapNote(note)}
          nearbyProfiles={nearbyProfiles ?? []}
          selectedGameId={selectedGame?.id ?? null}
          selectedVenue={selectedVenue}
          onSelectGame={setSelectedGame}
          onSelectVenue={setSelectedVenue}
          mapCameraRequest={mapCameraRequest}
          gamePopupRequest={gamePopupRequest}
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
            const locationParts = [
              name ??
                (sport && leisure ? `${sport} ${leisure}` : sport ?? leisure ?? "Sports venue"),
              prettyLabel(venue.website),
              venue.opening_hours?.trim() || null,
            ].filter(Boolean);
            setCreateGameLocationLabel(locationParts.join(" · "));
            setCreateGameOpen(true);
          }}
          centerOnUserTrigger={centerOnUserTrigger}
          enable3D={true}
          userAvatarUrl={avatarUrl ?? null}
          avatarGlbUrl={avatarGlbUrl}
          use2DAvatar={true}
          currentUserId={currentUserId}
          joinedGameIds={joinedGameIds}
          hostGameIds={hostGameIds}
          substituteGameIds={substituteGameIds}
          onJoinGame={(game) => handleJoinGame(game.id)}
          onLeaveGame={(game) => handleLeaveGame(game.id)}
          onDeleteHostedGame={handleDeleteHostedGame}
          onStartHostedGame={handleStartHostedGame}
          onEndHostedGame={handleEndHostedGame}
          onOpenMessagesForGame={(game) => {
            setMessengerFocus({
              kind: "game",
              gameId: game.id,
              title: game.title,
              sport: game.sport,
              startsAt: game.starts_at,
              createdAt: game.created_at,
              participantCount: game.participant_count,
              spotsRemaining: game.spots_remaining,
            });
            setMessagesOpen(true);
          }}
          venuesCenter={mapSearchLocation}
          onVenuesFetchLoadingChange={handleVenuesFetchLoading}
          venueSportsFilter={venueSportsFilter}
          venueFetchEnabled={venueIntentReady}
          venueSearchRadiusKm={appliedFilters.venueRadiusKm}
          mapMinuteEpoch={mapMinuteEpoch}
          pauseVenueFetch={messagesOpen}
          mapStyleUrl={satelliteOn ? "mapbox://styles/mapbox/satellite-streets-v12" : null}
        />
      </Suspense>

      {showMapLoadingBanner && (
        <div
          className="pointer-events-none absolute left-4 top-24 z-[55] flex size-11 items-center justify-center rounded-full border border-white/12 bg-slate-950/90 shadow-[0_8px_32px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.06] backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Map updating"
        >
          <Loader2 className="size-5 shrink-0 animate-spin text-emerald-400" aria-hidden />
        </div>
      )}

      {/* Top-left status column — compact, dismissible map notices (distinct from
          the bell/Alerts dropdown and transient sonner toasts). */}
      <div className="pointer-events-none absolute left-4 top-24 z-[45] flex w-[min(18rem,72vw)] flex-col gap-2">
        {locationError && userCoords == null && (
          <MapToast variant="warning">
            Location: {locationError}. Using a default location for now — allow location for accurate nearby games.
          </MapToast>
        )}

        {gamesError && (
          <MapToast variant="warning">
            <strong className="font-semibold text-slate-100">Database setup needed:</strong> Run the SQL from{" "}
            <code className="rounded bg-slate-700/80 px-1">supabase/schema.sql</code> in your Supabase project, then refresh.
          </MapToast>
        )}

        {showNoGamesBanner && (
          <MapToast
            onDismiss={() => setNoGamesBannerDismissed(true)}
            actions={
              <button
                type="button"
                className="min-h-[32px] cursor-pointer rounded-full bg-primary px-3 text-[11px] font-semibold text-slate-950 transition-colors hover:bg-primary/90"
                onClick={() => {
                  if (userCoords) {
                    setCreateGameCoords({ lat: userCoords.lat, lng: userCoords.lng });
                    setCreateGameAnchorPoint(null);
                    setCreateGameLocationLabel(null);
                  }
                  setCreateGameOpen(true);
                }}
              >
                Create game
              </button>
            }
          >
            <p className="font-semibold text-slate-100">No games nearby yet</p>
            <p className="text-slate-400">Be the first to host one here.</p>
          </MapToast>
        )}

      </div>

      {satelliteOn && (
        <div
          className="pointer-events-none absolute left-1/2 top-[72px] z-40 -translate-x-1/2 rounded-full border border-white/12 bg-[#0A0F1C]/85 px-3 py-1 text-[11px] font-medium text-slate-200 shadow-[var(--shadow-control)] backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          Satellite view
        </div>
      )}

      <TopNavigation
        liveNowOpen={liveNowOpen}
        onLiveNowToggle={() => setLiveNowOpen((v) => !v)}
        onCenterOnUser={handleCenterOnUser}
        onOpenFilters={() => setFiltersOpen(true)}
        onClearFilters={() => {
          setFiltersDraft(DEFAULT_FILTERS);
          setAppliedFilters(DEFAULT_FILTERS);
          setSportExtendRadius(null);
          sportExtendSessionRef.current = sportFocus?.sport ?? null;
          persistAppliedFilters(DEFAULT_FILTERS);
          setFilterApplySync(true);
          filterApplyStartedAtRef.current = Date.now();
        }}
        onOpenMessages={() => {
          setMessengerFocus(null);
          setMessagesOpen(true);
        }}
        satelliteOn={satelliteOn}
        onToggleSatellite={() => setSatelliteOn((v) => !v)}
        notifications={notifications}
        notificationsUnreadCount={notifications.filter((n) => !n.is_read).length}
        messagesUnreadCount={messagesUnreadCount}
        onMarkNotificationRead={(id) => void markRead(id)}
        onOpenNotifications={() => navigate("/feed?tab=notifications")}
        locationVisibility={locationVisibility}
        onLocationVisibilityChange={applyVisibilityMode}
        onOpenProfile={() => navigate("/profile")}
        userAvatarUrl={avatarUrl ?? null}
        favoriteSport={favoriteSport}
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
        liveGamesCount={games.filter(g => g.status === 'live').length}
        mapSearchLocationName={mapSearchLocationName}
        onClearMapSearch={clearMapSearch}
        venueSportIntent={venueSportIntent}
        venueSportIntentReady={venueIntentReady}
        onVenueSportIntentChange={handleVenueSportIntentChange}
      />

      <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none flex flex-col justify-end">
        <BottomCarousel
          games={liveNowOpen ? liveStripGames : displayGames}
          selectedGame={selectedGame}
          onSelectGame={(g) => {
            setSelectedGame(g);
            if (g) handleOpenGameFromCard(g);
          }}
          onOpenGame={handleOpenGameFromCard}
          joinedGameIds={joinedGameIds}
          currentUserId={currentUserId}
          liveNowOpen={liveNowOpen}
          mapMinuteEpoch={mapMinuteEpoch}
          onOpenMessages={() => {
            setMessengerFocus(null);
            setMessagesOpen(true);
          }}
        />
      </div>

      <GameMessengerSheet
        open={messagesOpen}
        onOpenChange={setMessagesOpen}
        focusThread={messengerFocus}
        onFocusThreadChange={setMessengerFocus}
        currentUserId={currentUserId}
        ensureSession={ensureSession}
        joinedGameIds={joinedGameIds}
        onLeaveThread={handleLeaveGame}
        inboxBootstrap={gameInboxBootstrap}
        dmInboxBootstrap={dmInboxBootstrap}
        onPlanRematch={(payload: PlanRematchPayload) => {
          if (payload.lat == null || payload.lng == null) {
            console.warn("[FUN] rematch: missing source coordinates");
            return;
          }
          setCreateGameCoords({ lat: payload.lat, lng: payload.lng });
          setCreateGameAnchorPoint(null);
          setCreateGameLocationLabel(payload.locationLabel ?? null);
          setCreateGamePrefill({
            sport: payload.sport,
            title: `Rematch — ${payload.fromTitle}`,
            spotsNeeded: payload.spotsNeeded,
            durationMinutes: payload.durationMinutes ?? undefined,
            visibility: visibilityEnumToLabel(payload.visibility ?? "public"),
            rematchOfGameId: payload.fromGameId,
            rematchOfTitle: payload.fromTitle,
          });
          setMessagesOpen(false);
          setCreateGameOpen(true);
        }}
        onSelectGameOnMap={async (gameId) => {
          let lat: number, lng: number;
          let label: string | null = null;
          const game = games.find((g) => g.id === gameId);
          if (game) {
            lat = game.lat;
            lng = game.lng;
            label = game.location_label?.trim() || null;
          } else {
            const coords = await getGameLatLng(gameId);
            if (!coords) return;
            lat = coords.lat;
            lng = coords.lng;
          }
          setMapSearchLocation({ lat, lng });
          setMapSearchLocationName(label);
          refetchGames();
          handleCenterOnCoords({ lat, lng });
        }}

      />

      <FiltersModal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        value={filtersDraft}
        onChange={setFiltersDraft}
        previewGameCount={filtersPreviewCount}
        onApply={() => {
          setAppliedFilters(filtersDraft);
          setSportExtendRadius(null);
          if (sportFocus) sportExtendSessionRef.current = sportFocus.sport; // user overrode; don't re-extend
          persistAppliedFilters(filtersDraft);
          setFilterApplySync(true);
          filterApplyStartedAtRef.current = Date.now();
          setFiltersOpen(false);
        }}
        onClear={() => {
          setFiltersDraft(DEFAULT_FILTERS);
          setAppliedFilters(DEFAULT_FILTERS);
          setSportExtendRadius(null);
          sportExtendSessionRef.current = sportFocus?.sport ?? null;
          persistAppliedFilters(DEFAULT_FILTERS);
          setFilterApplySync(true);
          filterApplyStartedAtRef.current = Date.now();
        }}
      />

      <CreateGameModal
        open={createGameOpen}
        onOpenChange={(next) => {
          setCreateGameOpen(next);
          if (!next) setCreateGamePrefill(null);
        }}
        userCoords={createGameCoords ?? effectiveUserCoords}
        locationLabel={createGameLocationLabel}
        anchorPoint={createGameAnchorPoint}
        prefill={createGamePrefill}
        onSuccess={async (gameId) => {
          setCreateGameOpen(false);
          // Auto-post a "Rematch from <title>" system message in the new game's chat.
          const rematchSourceTitle = createGamePrefill?.rematchOfTitle;
          if (gameId && rematchSourceTitle) {
            try {
              await sendGameMessage(
                gameId,
                `Rematch from “${rematchSourceTitle}”. Same crew? Tap join to lock your spot.`
              );
            } catch (err) {
              console.warn("[FUN] rematch system message failed", err);
            }
          }
          setCreateGamePrefill(null);
          refetchGames();
          void refetchNotes();
          void reloadJoinedGameIds();
        }}
      />
    </div>
  );
}
