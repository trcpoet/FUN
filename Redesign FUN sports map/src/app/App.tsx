import React, { useState, useEffect, useRef } from "react";
import { MapboxMap } from "./components/MapboxMap";
import { TopNavigation } from "./components/TopUI";
import { BottomCarousel } from "./components/BottomCarousel";
import { CreateGameModal } from "./components/CreateGameModal";
import { useGeolocation } from "../hooks/useGeolocation";
import { useGamesNearby } from "../hooks/useGamesNearby";
import { useProfilesNearby } from "../hooks/useProfilesNearby";
import { useMyProfile } from "../hooks/useMyProfile";
import { useUserStats } from "../hooks/useUserStats";
import { useNotifications } from "../hooks/useNotifications";
import { supabase } from "../lib/supabase";
import { joinGame, avatarIdToGlbUrl } from "../lib/api";
import type { GameRow } from "../lib/supabase";

export default function App() {
  const { coords: userCoords, error: locationError } = useGeolocation();
  const { games, refetch, error: gamesError } = useGamesNearby(
    userCoords?.lat ?? null,
    userCoords?.lng ?? null
  );
  const { profiles: nearbyProfiles } = useProfilesNearby(
    userCoords?.lat ?? null,
    userCoords?.lng ?? null
  );
  const { avatarId } = useMyProfile();
  const { stats } = useUserStats();
  const { notifications, markRead } = useNotifications({ limit: 10 });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; message: string; type: string } | null>(null);
  const toastShownIds = useRef<Set<string>>(new Set());
  const [selectedGame, setSelectedGame] = useState<GameRow | null>(null);
  const [createGameOpen, setCreateGameOpen] = useState(false);
  const [createGameCoords, setCreateGameCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [createGameAnchorPoint, setCreateGameAnchorPoint] = useState<{ x: number; y: number } | null>(null);
  const [joinedGameIds, setJoinedGameIds] = useState<Set<string>>(new Set());
  const [chatOpenForGameId, setChatOpenForGameId] = useState<string | null>(null);
  const [liveNowOpen, setLiveNowOpen] = useState(false);
  const [centerOnUserTrigger, setCenterOnUserTrigger] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id ?? null);
    });
  }, []);

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
      setChatOpenForGameId(game.id);
    }
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

  const avatarGlbUrl = avatarId ? avatarIdToGlbUrl(avatarId, "low") : null;

  return (
    <div className="relative w-full h-screen bg-[#0A0F1C] overflow-hidden font-sans touch-none selection:bg-emerald-500/30">
      {/* Real map (Mapbox) or placeholder */}
      <MapboxMap
        userCoords={userCoords}
        games={games}
        nearbyProfiles={nearbyProfiles}
        currentUserId={currentUserId}
        selectedGameId={selectedGame?.id ?? null}
        onSelectGame={setSelectedGame}
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
        onCenterOnUser={() => setCenterOnUserTrigger((n) => n + 1)}
      />

      <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none flex flex-col justify-end">
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C] via-[#0A0F1C]/90 to-transparent pointer-events-none -z-10 h-full" />
        <button
          type="button"
          className="absolute bottom-6 left-4 z-50 w-12 h-12 rounded-full border-2 border-slate-700/50 bg-slate-800/80 backdrop-blur-md overflow-hidden flex items-center justify-center shadow-lg pointer-events-auto"
          aria-label="Profile"
        >
          <img
            src="https://images.unsplash.com/photo-1624280184393-53ce60e214ea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx5b3VuZyUyMG1hbGUlMjBjYXN1YWwlMjBzcG9ydHN3ZWFyJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzczMzc1ODE5fDA&ixlib=rb-4.1.0&q=80&w=100"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-800" />
        </button>
        <BottomCarousel
          games={games}
          selectedGame={selectedGame}
          onSelectGame={setSelectedGame}
          onJoin={handleJoin}
          joinedGameIds={joinedGameIds}
          chatOpenForGameId={chatOpenForGameId}
          onCloseChat={() => setChatOpenForGameId(null)}
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
        onSuccess={refetch}
        ensureSession={ensureSession}
      />
    </div>
  );
}
