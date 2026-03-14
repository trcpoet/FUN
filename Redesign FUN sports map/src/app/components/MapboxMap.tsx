import React, { useRef, useEffect, useState } from "react";
import type { GameRow } from "../../lib/supabase";
import type { ProfileNearbyRow } from "../../lib/supabase";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1624280184393-53ce60e214ea?w=100&h=100&fit=crop";

type MapboxMapProps = {
  userCoords: { lat: number; lng: number } | null;
  games: GameRow[];
  selectedGameId: string | null;
  onSelectGame: (game: GameRow | null) => void;
  /** Optional: 3D terrain + tilted camera */
  enable3D?: boolean;
  /** Optional: URL for your character/avatar image (e.g. anime style); replaces the blue dot */
  userAvatarUrl?: string | null;
  /** Optional: nearby players to show as markers (when you add backend + opt-in) */
  nearbyProfiles?: ProfileNearbyRow[];
  /** Optional: exclude this user from nearbyProfiles so you don't show your own marker twice */
  currentUserId?: string | null;
  /** Optional: double-click on map to open create-game at that location */
  onMapDoubleClick?: (lat: number, lng: number) => void;
};

export function MapboxMap(props: MapboxMapProps) {
  const {
    userCoords,
    games,
    selectedGameId,
    onSelectGame,
    enable3D = false,
    userAvatarUrl = null,
    nearbyProfiles = [],
    onMapDoubleClick,
  } = props;
  const currentUserId = props.currentUserId ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const markersRef = useRef<import("mapbox-gl").Marker[]>([]);
  const userMarkerRef = useRef<import("mapbox-gl").Marker | null>(null);
  const playerMarkersRef = useRef<import("mapbox-gl").Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;

    import("mapbox-gl").then((mapboxgl) => {
      mapboxgl.default.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.default.Map({
        container: containerRef.current!,
        style: "mapbox://styles/mapbox/dark-v11",
        center: userCoords ? [userCoords.lng, userCoords.lat] : [-98, 40],
        zoom: 13,
        pitch: enable3D ? 50 : 0,
      });

      map.on("load", () => {
        setMapLoaded(true);
        if (enable3D) {
          try {
            if (!map.getSource("fun-terrain")) {
              map.addSource("fun-terrain", {
                type: "raster-dem",
                url: "mapbox://mapbox.mapbox-terrain-dem-v1",
                tileSize: 512,
                maxzoom: 14,
              });
            }
            map.setTerrain({ source: "fun-terrain", exaggeration: 1.2 });
          } catch (_) {
            /* style may already have terrain or source */
          }
        }
      });
      mapRef.current = map;

      return () => {
        map.remove();
        mapRef.current = null;
      };
    });
  }, [MAPBOX_TOKEN, enable3D]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !userCoords) return;
    map.flyTo({
      center: [userCoords.lng, userCoords.lat],
      zoom: 14,
      pitch: enable3D ? 50 : 0,
    });
  }, [mapLoaded, userCoords, enable3D]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !userCoords) return;

    const avatarUrl = userAvatarUrl || DEFAULT_AVATAR;

    const wrap = document.createElement("div");
    wrap.className = "user-marker-wrap";

    const ring1 = document.createElement("div");
    ring1.className = "user-marker-ring";
    const ring2 = document.createElement("div");
    ring2.className = "user-marker-ring";
    wrap.appendChild(ring1);
    wrap.appendChild(ring2);

    const avatar = document.createElement("div");
    avatar.className = "user-marker-avatar";
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = "You";
    avatar.appendChild(img);
    wrap.appendChild(avatar);

    userMarkerRef.current?.remove();
    import("mapbox-gl").then((mapboxgl) => {
      const marker = new mapboxgl.default.Marker({ element: wrap })
        .setLngLat([userCoords.lng, userCoords.lat])
        .addTo(map);
      userMarkerRef.current = marker;
    });

    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    };
  }, [mapLoaded, userCoords, userAvatarUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    import("mapbox-gl").then((mapboxgl) => {
      games.forEach((game) => {
        const coords: [number, number] = [game.lng, game.lat];

        const el = document.createElement("div");
        el.className = "game-marker";
        el.style.cursor = "pointer";
        el.style.width = "36px";
        el.style.height = "36px";
        el.style.borderRadius = "50%";
        const isSelected = game.id === selectedGameId;
        el.style.background = isSelected
          ? "rgba(249, 115, 22, 0.95)"
          : "rgba(16, 185, 129, 0.9)";
        el.style.border = isSelected ? "3px solid white" : "2px solid rgba(255,255,255,0.8)";
        el.style.boxShadow = "0 0 14px rgba(0,0,0,0.4)";
        el.title = game.title;

        const marker = new mapboxgl.default.Marker({ element: el })
          .setLngLat(coords)
          .addTo(map);

        el.addEventListener("click", () => onSelectGame(game));
        markersRef.current.push(marker);
      });
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [mapLoaded, games, selectedGameId, onSelectGame]);

  // Other players (avatars). Backend can exclude current user, or pass currentUserId to filter.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    playerMarkersRef.current.forEach((m) => m.remove());
    playerMarkersRef.current = [];

    const others = currentUserId
      ? nearbyProfiles.filter((p) => p.profile_id !== currentUserId)
      : nearbyProfiles;

    import("mapbox-gl").then((mapboxgl) => {
      others.forEach((profile) => {
        const el = document.createElement("div");
        el.className = "player-marker";
        el.style.cursor = "pointer";
        el.style.width = "40px";
        el.style.height = "40px";
        el.style.borderRadius = "50%";
        el.style.border = "2px solid rgba(16, 185, 129, 0.9)";
        el.style.boxShadow = "0 0 12px rgba(16, 185, 129, 0.4)";
        el.style.overflow = "hidden";
        el.style.background = "var(--tw-slate-700, #334155)";
        const img = document.createElement("img");
        img.src = profile.avatar_url || DEFAULT_AVATAR;
        img.alt = profile.display_name || "Player";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        el.appendChild(img);
        el.title = profile.display_name || "Player";

        const marker = new mapboxgl.default.Marker({ element: el })
          .setLngLat([profile.lng, profile.lat])
          .addTo(map);
        playerMarkersRef.current.push(marker);
      });
    });

    return () => {
      playerMarkersRef.current.forEach((m) => m.remove());
      playerMarkersRef.current = [];
    };
  }, [mapLoaded, nearbyProfiles, currentUserId]);

  // Double-click: create game at location
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !onMapDoubleClick) return;
    const handler = (e: { lngLat: { lat: number; lng: number } }) => {
      const { lat, lng } = e.lngLat;
      onMapDoubleClick(lat, lng);
    };
    map.on("dblclick", handler);
    return () => map.off("dblclick", handler);
  }, [mapLoaded, onMapDoubleClick]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="absolute inset-0 bg-[#0A0F1C] flex items-center justify-center text-slate-400 text-sm">
        Add VITE_MAPBOX_ACCESS_TOKEN to .env to show the map.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ minHeight: "100%" }}
    />
  );
}
