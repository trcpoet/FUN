import React, { useState, useEffect } from "react";
import { MapboxMap } from "./components/MapboxMap";
import { TopNavigation } from "./components/TopUI";
import { BottomCarousel } from "./components/BottomCarousel";
import { CreateGameSheet } from "./components/CreateGameSheet";
import { useGeolocation } from "../hooks/useGeolocation";
import { useGamesNearby } from "../hooks/useGamesNearby";
import { useProfilesNearby } from "../hooks/useProfilesNearby";
import { supabase } from "../lib/supabase";
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameRow | null>(null);
  const [createGameOpen, setCreateGameOpen] = useState(false);
  const [createGameCoords, setCreateGameCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [joinedGameIds, setJoinedGameIds] = useState<Set<string>>(new Set());
  const [chatOpenForGameId, setChatOpenForGameId] = useState<string | null>(null);
  const [liveNowOpen, setLiveNowOpen] = useState(false);

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
    if (!supabase) return;
    const ok = await ensureSession();
    if (!ok) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("game_participants").insert({
      game_id: game.id,
      user_id: user.id,
    });
    if (!error) {
      setJoinedGameIds((prev) => new Set(prev).add(game.id));
      setChatOpenForGameId(game.id);
    }
  };

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
        onMapDoubleClick={(lat, lng) => {
          setCreateGameCoords({ lat, lng });
          setCreateGameOpen(true);
        }}
        enable3D={true}
        userAvatarUrl={null}
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

      <TopNavigation
        liveNowOpen={liveNowOpen}
        onLiveNowToggle={() => setLiveNowOpen((v) => !v)}
      />

      <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none flex flex-col justify-end">
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C] via-[#0A0F1C]/90 to-transparent pointer-events-none -z-10 h-full" />
        <BottomCarousel
          games={games}
          selectedGame={selectedGame}
          onSelectGame={setSelectedGame}
          onJoin={handleJoin}
          joinedGameIds={joinedGameIds}
          chatOpenForGameId={chatOpenForGameId}
          onCloseChat={() => setChatOpenForGameId(null)}
          liveNowOpen={liveNowOpen}
          onCreateGame={() => setCreateGameOpen(true)}
        />
      </div>

      <CreateGameSheet
        open={createGameOpen}
        onOpenChange={(open) => {
          setCreateGameOpen(open);
          if (!open) setCreateGameCoords(null);
        }}
        userCoords={createGameCoords ?? userCoords}
        onSuccess={refetch}
        ensureSession={ensureSession}
      />
    </div>
  );
}
