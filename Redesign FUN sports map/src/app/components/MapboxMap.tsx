/// <reference types="vite/client" />
import React, { useRef, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Flag } from "lucide-react";
import type { GameRow } from "../../lib/supabase";
import type { ProfileNearbyRow } from "../../lib/supabase";
import { gamesToGeoJSON } from "../types/mapGeoJSON";
import { fetchSportsVenuesFromOverpass, bboxFromCenterRadius } from "../lib/sportsVenues";
import type { SportsVenueGeoJSON } from "../lib/sportsVenues";
import { Avatar3DOverlay } from "./Avatar3DOverlay";
import { GameEventPopup } from "./GameEventPopup";
import { useIsMobile } from "./ui/use-mobile";

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim() || undefined;
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1624280184393-53ce60e214ea?w=100&h=100&fit=crop";
/** Default Ready Player Me GLB for 3D avatar when no profile avatar_glb_url is set. */
const DEFAULT_AVATAR_GLB =
  "https://models.readyplayer.me/64b7d2a3d1b31a0096b5e8c4.glb?quality=low";

type MapboxMapProps = {
  userCoords: { lat: number; lng: number } | null;
  games: GameRow[];
  selectedGameId: string | null;
  onSelectGame: (game: GameRow | null) => void;
  enable3D?: boolean;
  /** 2D fallback: image URL for user marker when 3D is off. */
  userAvatarUrl?: string | null;
  /** 3D avatar: Ready Player Me (or any) GLB URL (e.g. https://models.readyplayer.me/<id>.glb?quality=low). */
  avatarGlbUrl?: string | null;
  /** true = 2D marker only; false = 3D avatar overlay when enable3D (default, no Mapbox GL conflict). */
  use2DAvatar?: boolean;
  /** Called when user clicks Join in the event popup. */
  onJoinGame?: (game: GameRow) => void;
  /** Set of game ids the current user has joined (to show "Joined" in popup). */
  joinedGameIds?: Set<string>;
  nearbyProfiles?: ProfileNearbyRow[];
  currentUserId?: string | null;
  /** (lat, lng, viewportPoint) when user double-taps the map */
  onMapDoubleClick?: (lat: number, lng: number, viewportPoint?: { x: number; y: number }) => void;
  /** When this value changes, map flies to user location. */
  centerOnUserTrigger?: number;
};

export function MapboxMap(props: MapboxMapProps) {
  const {
    userCoords,
    games,
    selectedGameId,
    onSelectGame,
    enable3D = false,
    userAvatarUrl = null,
    avatarGlbUrl = null,
    use2DAvatar = false,
    onJoinGame,
    joinedGameIds,
    nearbyProfiles = [],
    onMapDoubleClick,
    centerOnUserTrigger,
  } = props;
  const currentUserId = props.currentUserId ?? null;
  const joinedSet = joinedGameIds ?? new Set<string>();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const playerMarkersRef = useRef<import("mapbox-gl").Marker[]>([]);
  const gameMarkersRef = useRef<import("mapbox-gl").Marker[]>([]);
  const venueMarkersRef = useRef<import("mapbox-gl").Marker[]>([]);
  const venueRootsRef = useRef<ReturnType<typeof createRoot>[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [eventPopup, setEventPopup] = useState<{ game: GameRow; point: { x: number; y: number } } | null>(null);
  const isMobile = useIsMobile();

  // —— Map init: sports-first dark basemap, terrain, fog ———
  useEffect(() => {
    setMapError(null);
    if (!MAPBOX_TOKEN || !containerRef.current) return;

    import("mapbox-gl").then((mapboxgl) => {
      mapboxgl.default.accessToken = MAPBOX_TOKEN;
      let map: import("mapbox-gl").Map | null = null;
      try {
        map = new mapboxgl.default.Map({
          container: containerRef.current!,
          style: "mapbox://styles/mapbox/dark-v11",
          center: userCoords ? [userCoords.lng, userCoords.lat] : [-98, 40],
          zoom: 15,
          pitch: enable3D ? 50 : 0,
          antialias: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMapError(msg);
        return;
      }

      map.on("load", () => {
        setMapLoaded(true);
        setMapError(null);
        // 3D terrain for depth (sports world feel)
        if (enable3D) {
          try {
            if (!map!.getSource("fun-terrain")) {
              map!.addSource("fun-terrain", {
                type: "raster-dem",
                url: "mapbox://mapbox.mapbox-terrain-dem-v1",
                tileSize: 512,
                maxzoom: 14,
              });
            }
            map!.setTerrain({ source: "fun-terrain", exaggeration: 1.2 });
          } catch (_) {}
        }
        // Disable default double-click zoom so we can use double-tap/double-click to open "Create game"
        try {
          map!.doubleClickZoom?.disable();
        } catch (_) {}
        // Fog for depth perception (Mapbox GL JS v3)
        try {
          map!.setFog({
            color: "rgb(10, 15, 28)",
            "high-color": "rgb(20, 30, 48)",
            "horizon-blend": 0.08,
            "space-color": "rgb(5, 8, 15)",
            "star-intensity": 0.15,
          });
        } catch (_) {}
      });
      map.on("error", (e) => {
        if (e.error?.message) {
          setMapError(e.error.message);
          try {
            map.remove();
          } catch (_) {}
          mapRef.current = null;
        }
      });
      mapRef.current = map;
      return () => {
        map?.remove();
        mapRef.current = null;
      };
    });
  }, [MAPBOX_TOKEN, enable3D]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !userCoords) return;
    map.flyTo({
      center: [userCoords.lng, userCoords.lat],
      zoom: 16,
      pitch: enable3D ? 50 : 0,
    });
  }, [mapLoaded, userCoords, enable3D]);

  // Center on user when "Center on me" is pressed (works without auth; uses browser geolocation)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || centerOnUserTrigger === undefined || centerOnUserTrigger < 1) return;

    const flyToCoords = (lat: number, lng: number) => {
      map.flyTo({
        center: [lng, lat],
        zoom: 17,
        pitch: enable3D ? 50 : 0,
      });
    };

    if (userCoords) {
      flyToCoords(userCoords.lat, userCoords.lng);
      return;
    }

    if (!navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => flyToCoords(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }, [mapLoaded, centerOnUserTrigger, userCoords, enable3D]);

  // —— Games as DOM markers: sport emoji only, roster count top-right ———
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    gameMarkersRef.current.forEach((m) => m.remove());
    gameMarkersRef.current = [];

    const features = gamesToGeoJSON(games, selectedGameId).features;
    if (features.length === 0) return;

    import("mapbox-gl").then((mapboxgl) => {
      features.forEach((f) => {
        const id = f.properties?.id;
        const game = games.find((g) => g.id === id);
        if (!game || !f.geometry || f.geometry.type !== "Point") return;
        const [lng, lat] = f.geometry.coordinates;

        const wrap = document.createElement("div");
        wrap.className = "game-marker-wrap";
        wrap.dataset.gameId = id;
        wrap.style.cssText =
          "position:relative;cursor:pointer;display:flex;align-items:center;justify-content:center;width:36px;height:36px;";
        const emojiWrap = document.createElement("div");
        emojiWrap.style.cssText =
          "width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;text-shadow:0 0 4px rgba(0,0,0,0.8),0 1px 2px rgba(0,0,0,0.9);background:rgba(15,23,42,0.9);border-radius:8px;border:2px solid rgba(251,191,36,0.5);";
        emojiWrap.textContent = f.properties?.sport_emoji ?? "🎯";
        wrap.appendChild(emojiWrap);
        const roster = document.createElement("div");
        roster.style.cssText =
          "position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;font-size:10px;font-weight:600;color:#e2e8f0;background:rgba(251,191,36,0.9);border-radius:9px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,0.5);";
        roster.textContent = f.properties?.players_label ?? "";
        wrap.appendChild(roster);

        wrap.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectGame(game);
          const rect = wrap.getBoundingClientRect();
          const container = map.getContainer().getBoundingClientRect();
          setEventPopup({
            game,
            point: { x: rect.left - container.left + rect.width / 2, y: rect.top - container.top },
          });
        });

        const marker = new mapboxgl.default.Marker({ element: wrap, offset: [0, 0] })
          .setLngLat([lng, lat])
          .addTo(map);
        gameMarkersRef.current.push(marker);
      });
    });

    return () => {
      gameMarkersRef.current.forEach((m) => m.remove());
      gameMarkersRef.current = [];
    };
  }, [mapLoaded, games, selectedGameId, onSelectGame]);

  // Map click:
  // - On desktop: close popup only.
  // - On mobile: use single tap to center map and open Create Game modal.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const handler = (e: { lngLat: { lat: number; lng: number }; point: { x: number; y: number } }) => {
      if (isMobile && onMapDoubleClick) {
        const container = map.getContainer();
        const rect = container.getBoundingClientRect();

        // Use the tap's geographic location for the game,
        // but recenter the map so the modal appears in a stable spot.
        const tapLat = e.lngLat.lat;
        const tapLng = e.lngLat.lng;

        map.easeTo({
          center: [tapLng, tapLat],
          duration: 300,
        });

        // Anchor modal to viewport center so it never goes off-screen,
        // regardless of where the tap happened.
        const centerPoint = { x: rect.width / 2, y: rect.height / 2 };
        const viewportPoint = {
          x: rect.left + centerPoint.x,
          y: rect.top + centerPoint.y,
        };

        onMapDoubleClick(tapLat, tapLng, viewportPoint);
        return;
      }

      // Desktop: normal click just closes any open popup
      setEventPopup(null);
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [mapLoaded, isMobile, onMapDoubleClick]);

  // Map double-click / double-tap (desktop only): center map and open Create Game modal via callback
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !onMapDoubleClick || isMobile) return;

    const handler = (e: { lngLat: { lat: number; lng: number }; point: { x: number; y: number } }) => {
      const container = map.getContainer();
      const rect = container.getBoundingClientRect();

      // Use the visual center of the map viewport as the game location,
      // so even if the tap is at the bottom, we recentre the map first.
      const centerPoint = { x: rect.width / 2, y: rect.height / 2 };
      const centerLngLat = map.unproject(centerPoint);

      // Center the map on this point (keeping current zoom/pitch)
      map.easeTo({
        center: [centerLngLat.lng, centerLngLat.lat],
        duration: 300,
      });

      // Anchor the modal to the viewport center so it never goes off-screen
      const viewportPoint = {
        x: rect.left + centerPoint.x,
        y: rect.top + centerPoint.y,
      };

      onMapDoubleClick(centerLngLat.lat, centerLngLat.lng, viewportPoint);
    };

    map.on("dblclick", handler);
    return () => {
      map.off("dblclick", handler);
    };
  }, [mapLoaded, onMapDoubleClick, isMobile]);

  const glbUrl = avatarGlbUrl ?? userAvatarUrl ?? DEFAULT_AVATAR_GLB;
  const use3DOverlay = enable3D && !!userCoords && !!glbUrl && !use2DAvatar;

  // —— 2D user marker when not using 3D overlay ———
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !userCoords) return;
    if (use3DOverlay) {
      const wrap = document.querySelector(".user-marker-wrap");
      if (wrap) wrap.closest(".mapboxgl-marker")?.remove();
      return;
    }

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

    import("mapbox-gl").then((mapboxgl) => {
      const marker = new mapboxgl.default.Marker({ element: wrap })
        .setLngLat([userCoords.lng, userCoords.lat])
        .addTo(map);
      return () => marker.remove();
    });
  }, [mapLoaded, userCoords, userAvatarUrl, use3DOverlay]);

  // —— Other players (DOM markers) ———
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

  // —— Sports venues: 5km radius, Lucide Flag icon (small, no white bg) ———
  const venueFetchKey = userCoords ? `${userCoords.lat.toFixed(4)},${userCoords.lng.toFixed(4)}` : null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !userCoords || !venueFetchKey) return;

    const addVenueMarkers = (geojson: SportsVenueGeoJSON) => {
      venueMarkersRef.current.forEach((m) => m.remove());
      venueMarkersRef.current = [];
      venueRootsRef.current.forEach((r) => r.unmount());
      venueRootsRef.current = [];

      import("mapbox-gl").then((mapboxgl) => {
        geojson.features.forEach((f) => {
          if (!f.geometry || f.geometry.type !== "Point") return;
          const [lng, lat] = f.geometry.coordinates;

          const wrap = document.createElement("div");
          wrap.style.cssText =
            "display:flex;align-items:center;justify-content:center;width:20px;height:20px;color:#fbbf24;";
          const root = createRoot(wrap);
          root.render(
            React.createElement(Flag, {
              size: 18,
              strokeWidth: 2.5,
              style: { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" },
            })
          );
          venueRootsRef.current.push(root);

          const marker = new mapboxgl.default.Marker({ element: wrap })
            .setLngLat([lng, lat])
            .addTo(map);
          venueMarkersRef.current.push(marker);
        });
      });
    };

    const bbox = bboxFromCenterRadius(userCoords.lat, userCoords.lng, 5);
    fetchSportsVenuesFromOverpass(bbox).then(addVenueMarkers);

    return () => {
      venueMarkersRef.current.forEach((m) => m.remove());
      venueMarkersRef.current = [];
      venueRootsRef.current.forEach((r) => r.unmount());
      venueRootsRef.current = [];
    };
  }, [mapLoaded, venueFetchKey]);

  if (!MAPBOX_TOKEN || mapError) {
    return (
      <div className="absolute inset-0 bg-[#0A0F1C] flex flex-col items-center justify-center gap-2 px-4 text-slate-400 text-sm text-center">
        {!MAPBOX_TOKEN ? (
          <>Add VITE_MAPBOX_ACCESS_TOKEN to .env (or Vercel env vars) to show the map.</>
        ) : (
          <>
            <span className="text-amber-400 font-medium">Map failed to load</span>
            <span>{mapError}</span>
            <span className="text-slate-500 text-xs">Check your Mapbox token at dashboard.mapbox.com</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 w-full h-full">
      <div
        ref={containerRef}
        className={`absolute inset-0 w-full h-full ${!mapLoaded ? "pointer-events-none" : ""}`}
        style={{ minHeight: "100%" }}
      />
      {eventPopup && containerRef.current && (
        <div
          className="absolute inset-0 pointer-events-auto"
          onClick={() => setEventPopup(null)}
        >
          <div
            className="absolute"
            style={{ left: eventPopup.point.x, top: eventPopup.point.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <GameEventPopup
              game={eventPopup.game}
              onClose={() => setEventPopup(null)}
              onJoin={onJoinGame}
              joined={joinedSet.has(eventPopup.game.id)}
            />
          </div>
        </div>
      )}
      {mapLoaded && use3DOverlay && userCoords && mapRef.current && (
        <Avatar3DOverlay
          map={mapRef.current}
          userCoords={userCoords}
          glbUrl={glbUrl}
        />
      )}
    </div>
  );
}
