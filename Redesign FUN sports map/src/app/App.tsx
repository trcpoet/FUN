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
import type { MessengerThreadFocus, PlanRematchPayload } from "./components/GameMessengerSheet";
import { CreateGameModal, type CreateGamePrefill } from "./components/CreateGameModal";
import { FiltersModal, type FiltersState, DEFAULT_FILTERS } from "./components/FiltersModal";
import { useGeolocation } from "../hooks/useGeolocation";
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
import { joinGame, leaveGame, deleteHostedGame, getGameLatLng, avatarIdToGlbUrl, startGame, endGame, fetchNotesNearby, fetchNoteById } from "../lib/api";
import { fetchMyDmInbox, getOrCreateDmThread } from "../lib/dmChat";
import { fetchMyGameInbox, sendGameMessage } from "../lib/gameChat";
import { visibilityEnumToLabel } from "../lib/gamePreferenceOptions";
import { sportEmoji } from "../lib/sportVisuals";
import type { GameRow, MapNoteRow } from "../lib/supabase";
import { filterGamesVisibleOnMap, isGameInLiveWindow } from "../lib/mapGameTimer";
import { readLocationVisibility, writeLocationVisibility, type LocationVisibilityMode } from "../lib/locationVisibility";
import { StarRating } from "./components/ui/StarRating";
import { NoteThreadDialog } from "./components/feed/NoteThreadDialog";

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
  const [mapSearchLocationName, setMapSearchLocationName] = useState<string | null>(null);
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

  const { avatarId, avatarUrl, athleteProfile } = useMyProfile();
  const favoriteSport = athleteProfile.favoriteSport?.trim() ?? null;
  const { stats } = useUserStats();
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, markRead } = useNotifications({ limit: 10 });
  const messagesUnreadCount = useTotalUnreadMessages();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [locationVisibility, setLocationVisibility] = useState<LocationVisibilityMode>(() => readLocationVisibility());
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

  // Notes: fetch nearby whenever the map's "games center" changes.
  useEffect(() => {
    void refetchNotes();
  }, [refetchNotes]);

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

  // Sync user location to DB so avatar shows up on map
  useEffect(() => {
    if (!supabase || !userCoords) return;
    void supabase.rpc("update_my_location", {
      p_lat: userCoords.lat,
      p_lng: userCoords.lng,
    });
  }, [userCoords]);

  useEffect(() => {
    prefetchMapboxGl();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        setCurrentUserId(session?.user.id ?? null);
      } else if (event === "SIGNED_OUT") {
        setCurrentUserId(null);
      }
    });
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const ensureSession = async (): Promise<boolean> => {
    if (currentUserId) return true;
    const { data: { session } } = await supabase!.auth.getSession();
    if (session?.user) {
      setCurrentUserId(session.user.id);
      return true;
    }
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
    void reloadJoinedGameIds();
  }, [reloadJoinedGameIds]);

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
    setGamesRadiusKm(DEFAULT_FILTERS.gamesRadiusKm);
  };

  const handleCenterOnUser = () => {
    if (userCoords) {
      setMapSearchLocation(null);
      setMapSearchLocationName(null);
      setCenterOnUserTrigger((n) => n + 1);
    }
  };

  const handleJoinGame = async (gameId: string) => {
    const ok = await ensureSession();
    if (!ok) return;
    const result = await joinGame(gameId);
    if (result.error) {
      alert(`Could not join game: ${result.error.message}`);
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

  const liveStripGames = useMemo(() => {
    const now = Date.now();
    return displayGames.filter((g) => isGameInLiveWindow(g, now));
  }, [displayGames, mapMinuteEpoch]);

  const mapGames = useMemo(
    () => (liveNowOpen ? liveStripGames : displayGames),
    [liveNowOpen, liveStripGames, displayGames]
  );

  const avatarGlbUrl = avatarIdToGlbUrl(avatarId);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#0A0F1C] font-sans selection:bg-emerald-500/30">
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-[#0A0F1C]">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
              <p className="text-sm font-medium text-slate-400">Booting map engine…</p>
            </div>
          </div>
        }
      >
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
            setMapSearchLocation({ lat, lng });
            setMapSearchLocationName(null);
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
          venueSportsFilter={appliedFilters.sports}
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

      <TopNavigation
        liveNowOpen={liveNowOpen}
        onLiveNowToggle={() => setLiveNowOpen((v) => !v)}
        onCenterOnUser={handleCenterOnUser}
        onOpenFilters={() => setFiltersOpen(true)}
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
        onLocationVisibilityChange={(mode) => {
          setLocationVisibility(mode);
          writeLocationVisibility(mode);
        }}
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
        onApply={() => {
          setAppliedFilters(filtersDraft);
          setFilterApplySync(true);
          filterApplyStartedAtRef.current = Date.now();
          setFiltersOpen(false);
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
