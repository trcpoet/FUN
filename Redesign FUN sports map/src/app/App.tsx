import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router";
import { MapboxMap, type MapCameraRequest } from "./components/MapboxMap";
import type { VenueSelection } from "./components/MapboxMap";
import { TopNavigation } from "./components/TopUI";
import { BottomCarousel } from "./components/BottomCarousel";
import { GameMessengerSheet } from "./components/GameMessengerSheet";
import type { MessengerThreadFocus } from "./components/GameMessengerSheet";
import { CreateGameModal } from "./components/CreateGameModal";
import { FiltersModal, type FiltersState } from "./components/FiltersModal";
import { useGeolocation } from "../hooks/useGeolocation";
import { useGamesNearby, DEFAULT_GAMES_RADIUS_KM } from "../hooks/useGamesNearby";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { forwardGeocodeSearch, type ForwardGeocodeFeature } from "../lib/geocoding";
import { findSportMatch, gamesMatchingSport, closestGame } from "../lib/sportSearch";
import { useProfilesNearby } from "../hooks/useProfilesNearby";
import { useMyProfile } from "../hooks/useMyProfile";
import { useUserStats } from "../hooks/useUserStats";
import { useNotifications } from "../hooks/useNotifications";
import { supabase } from "../lib/supabase";
import { joinGame, avatarIdToGlbUrl } from "../lib/api";
import type { GameRow } from "../lib/supabase";

const DEFAULT_AVATAR_IMAGE =
  "https://images.unsplash.com/photo-1624280184393-53ce60e214ea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=100";

const LOCATION_SEARCH_ZOOM = 12.5;
const FAR_SPORT_ZOOM = 11.5;
const EXTENDED_GAMES_RADIUS_KM = 120;

export default function App() {
  const { coords: userCoords, error: locationError } = useGeolocation();

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const [geocodeResults, setGeocodeResults] = useState<ForwardGeocodeFeature[]>([]);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [mapSearchLocation, setMapSearchLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [sportFocus, setSportFocus] = useState<{ sport: string } | null>(null);
  const [gamesRadiusKm, setGamesRadiusKm] = useState(DEFAULT_GAMES_RADIUS_KM);
  const [mapCameraRequest, setMapCameraRequest] = useState<MapCameraRequest | null>(null);
  const mapCameraIdRef = useRef(0);
  const sportCameraSigRef = useRef("");
  const emptySportToastSportRef = useRef<string | null>(null);

  const gamesFetchLat =
    sportFocus && userCoords
      ? userCoords.lat
      : mapSearchLocation?.lat ?? userCoords?.lat ?? null;
  const gamesFetchLng =
    sportFocus && userCoords
      ? userCoords.lng
      : mapSearchLocation?.lng ?? userCoords?.lng ?? null;

  const { games, loading: gamesLoading, refetch: refetchGames, error: gamesError } = useGamesNearby(
    gamesFetchLat,
    gamesFetchLng,
    gamesRadiusKm
  );
  const { profiles: nearbyProfiles } = useProfilesNearby(
    userCoords?.lat ?? null,
    userCoords?.lng ?? null
  );
  const { avatarId, avatarUrl } = useMyProfile();
  const { stats } = useUserStats();
  const navigate = useNavigate();
  const { notifications, markRead } = useNotifications({ limit: 10 });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; message: string; type: string } | null>(null);
  const toastShownIds = useRef<Set<string>>(new Set());
  const [selectedGame, setSelectedGame] = useState<GameRow | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenueSelection | null>(null);
  const [gamePopupRequest, setGamePopupRequest] = useState<{ nonce: number; gameId: string } | null>(null);
  const openGamePopupNonceRef = useRef(0);
  const [createGameOpen, setCreateGameOpen] = useState(false);
  const [createGameCoords, setCreateGameCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [createGameAnchorPoint, setCreateGameAnchorPoint] = useState<{ x: number; y: number } | null>(null);
  const [joinedGameIds, setJoinedGameIds] = useState<Set<string>>(new Set());
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messengerFocus, setMessengerFocus] = useState<MessengerThreadFocus | null>(null);
  const [liveNowOpen, setLiveNowOpen] = useState(false);
  const [centerOnUserTrigger, setCenterOnUserTrigger] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FiltersState>({
    sports: [],
    level: "Any",
    distance: "5 km",
    ageRange: "Any",
    availability: [],
    timeOfDay: [],
    gameTypes: [],
    school: "",
    onlyLookingNow: false,
  });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id ?? null);
    });
  }, []);

  /** Restore joined games after refresh (for badges + inbox). */
  useEffect(() => {
    if (!supabase || !currentUserId) {
      if (!currentUserId) setJoinedGameIds(new Set());
      return;
    }
    let cancelled = false;
    supabase
      .from("game_participants")
      .select("game_id")
      .eq("user_id", currentUserId)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setJoinedGameIds(new Set(data.map((r) => r.game_id as string)));
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

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

  // Publish our location so other players see us (only if already signed in — no auto sign-in on load)
  useEffect(() => {
    if (!userCoords?.lat || !userCoords?.lng || !supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && supabase) {
        setCurrentUserId(session.user.id);
        supabase.rpc("update_my_location", { p_lat: userCoords.lat, p_lng: userCoords.lng }).then(() => {}, () => {});
      }
    });
  }, [userCoords?.lat, userCoords?.lng]);

  const handleJoin = async (game: GameRow) => {
    const ok = await ensureSession();
    if (!ok) return;
    const err = await joinGame(game.id);
    if (!err) {
      setJoinedGameIds((prev) => new Set(prev).add(game.id));
      refetchGames();
      setMessengerFocus({
        gameId: game.id,
        title: game.title || "Pickup game",
        sport: game.sport,
      });
      setMessagesOpen(true);
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

    // 2) Open the join modal (GameEventPopup) after the camera moves.
    openGamePopupNonceRef.current += 1;
    setGamePopupRequest({ nonce: openGamePopupNonceRef.current, gameId: game.id });
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

  const sportSuggestion = useMemo(() => {
    const s = findSportMatch(debouncedSearch);
    if (!s) return null;
    return { sport: s, label: `${s} — games near you` };
  }, [debouncedSearch]);

  useEffect(() => {
    const q = debouncedSearch.trim();
    if (q.length < 2) {
      setGeocodeResults([]);
      setGeocodeLoading(false);
      return;
    }
    let cancelled = false;
    setGeocodeLoading(true);
    forwardGeocodeSearch(q, {
      proximity: userCoords ? [userCoords.lng, userCoords.lat] : undefined,
      limit: 6,
    }).then((rows) => {
      if (!cancelled) {
        setGeocodeResults(rows);
        setGeocodeLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, userCoords?.lat, userCoords?.lng]);

  useEffect(() => {
    if (!sportFocus || !userCoords) return;
    if (gamesLoading) return;
    const matching = gamesMatchingSport(games, sportFocus.sport);
    if (matching.length === 0 && gamesRadiusKm < EXTENDED_GAMES_RADIUS_KM) {
      setGamesRadiusKm(EXTENDED_GAMES_RADIUS_KM);
    }
  }, [sportFocus, games, gamesLoading, gamesRadiusKm, userCoords]);

  useEffect(() => {
    if (!sportFocus || !userCoords || gamesLoading) return;
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
  }, [sportFocus, games, gamesLoading, gamesRadiusKm, userCoords]);

  const displayGames = useMemo(() => {
    if (!sportFocus) return games;
    return gamesMatchingSport(games, sportFocus.sport);
  }, [games, sportFocus]);

  useEffect(() => {
    if (!selectedGame) return;
    if (!displayGames.some((g) => g.id === selectedGame.id)) {
      setSelectedGame(null);
    }
  }, [displayGames, selectedGame]);

  const clearMapSearch = () => {
    setSearchQuery("");
    setGeocodeResults([]);
    setMapSearchLocation(null);
    setSportFocus(null);
    setGamesRadiusKm(DEFAULT_GAMES_RADIUS_KM);
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
    setGamesRadiusKm(DEFAULT_GAMES_RADIUS_KM);
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
    setGeocodeResults([]);
  };

  const handlePickSport = (sport: string) => {
    setSportFocus({ sport });
    setMapSearchLocation(null);
    setGamesRadiusKm(DEFAULT_GAMES_RADIUS_KM);
    sportCameraSigRef.current = "";
    emptySportToastSportRef.current = null;
    setSearchQuery(sport);
    setGeocodeResults([]);
  };

  const handleCenterOnUser = () => {
    setMapSearchLocation(null);
    setSportFocus(null);
    setGamesRadiusKm(DEFAULT_GAMES_RADIUS_KM);
    sportCameraSigRef.current = "";
    emptySportToastSportRef.current = null;
    setSearchQuery("");
    setGeocodeResults([]);
    setMapCameraRequest(null);
    setCenterOnUserTrigger((n) => n + 1);
  };

  const avatarGlbUrl = avatarId ? avatarIdToGlbUrl(avatarId, "low") : null;

  return (
    <div className="relative w-full h-screen bg-[#0A0F1C] overflow-hidden font-sans touch-none selection:bg-emerald-500/30">
      {/* Real map (Mapbox) or placeholder */}
      <MapboxMap
        userCoords={userCoords}
        games={displayGames}
        mapCameraRequest={mapCameraRequest}
        nearbyProfiles={nearbyProfiles}
        currentUserId={currentUserId}
        selectedGameId={selectedGame?.id ?? null}
        onSelectGame={setSelectedGame}
        selectedVenue={selectedVenue}
        onSelectVenue={setSelectedVenue}
        venuesCenter={mapSearchLocation ?? userCoords}
        gamePopupRequest={gamePopupRequest}
        onJoinGame={handleJoin}
        joinedGameIds={joinedGameIds}
        onMapDoubleClick={(lat, lng, viewportPoint) => {
          setCreateGameCoords({ lat, lng });
          setCreateGameAnchorPoint(viewportPoint ?? null);
          setCreateGameOpen(true);
        }}
        centerOnUserTrigger={centerOnUserTrigger}
        enable3D={true}
        userAvatarUrl={null}
        avatarGlbUrl={avatarGlbUrl}
      />

      {locationError && (
        <div className="absolute top-20 left-4 right-4 z-50 rounded-lg bg-amber-900/80 text-amber-200 text-sm px-3 py-2">
          Location: {locationError}. Allow location to see nearby games.
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
        mapSearch={{
          query: searchQuery,
          onQueryChange: setSearchQuery,
          geocodeLoading,
          geocodeResults,
          onPickGeocode: handlePickGeocode,
          sportSuggestion,
          onPickSport: handlePickSport,
          onClear: clearMapSearch,
        }}
      />

      <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none flex flex-col justify-end">
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C] via-[#0A0F1C]/90 to-transparent pointer-events-none -z-10 h-full" />
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="absolute bottom-6 left-4 z-50 w-12 h-12 rounded-full border-2 border-slate-700/50 bg-slate-800/80 backdrop-blur-md overflow-hidden flex items-center justify-center shadow-lg pointer-events-auto"
          aria-label="Profile"
        >
          <img
            src={avatarUrl?.trim() || DEFAULT_AVATAR_IMAGE}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-800" />
        </button>
        <BottomCarousel
          games={displayGames}
          selectedGame={selectedGame}
          onSelectGame={setSelectedGame}
          onOpenGame={handleOpenGameFromCard}
          joinedGameIds={joinedGameIds}
          liveNowOpen={liveNowOpen}
        />
      </div>

      <CreateGameModal
        open={createGameOpen}
        onOpenChange={(open) => {
          setCreateGameOpen(open);
          if (!open) {
            setCreateGameCoords(null);
            setCreateGameAnchorPoint(null);
          }
        }}
        userCoords={createGameCoords ?? userCoords}
        anchorPoint={createGameAnchorPoint}
        onSuccess={refetchGames}
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
      />

      <FiltersModal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        value={filters}
        onChange={setFilters}
        onApply={() => {
          // TODO: apply filters to queries (games / profiles).
        }}
      />
    </div>
  );
}
