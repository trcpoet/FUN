import React, { useRef, useEffect, useState } from "react";
import type { GameRow } from "../../lib/supabase";
import type { ProfileNearbyRow } from "../../lib/supabase";
import { gamesToGeoJSON } from "../types/mapGeoJSON";
import { fetchSportsVenuesFromOverpass } from "../lib/sportsVenues";
import { Avatar3DOverlay } from "./Avatar3DOverlay";

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
  nearbyProfiles?: ProfileNearbyRow[];
  currentUserId?: string | null;
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
    avatarGlbUrl = null,
    use2DAvatar = false,
    nearbyProfiles = [],
    onMapDoubleClick,
  } = props;
  const currentUserId = props.currentUserId ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const playerMarkersRef = useRef<import("mapbox-gl").Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

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
          zoom: 13,
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
      zoom: 14,
      pitch: enable3D ? 50 : 0,
    });
  }, [mapLoaded, userCoords, enable3D]);

  // —— Games as GeoJSON: glow (CircleLayer) + symbol (icon + roster text) ———
  const gamesGeoJSON = React.useMemo(
    () => gamesToGeoJSON(games, selectedGameId),
    [games, selectedGameId]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const sourceId = "fun-games";
    const glowLayerId = "fun-games-glow";
    const symbolLayerId = "fun-games-symbol";

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "id",
      });
      // Layer order: glow behind, symbol on top (sport emoji + roster text).
      map.addLayer({
        id: glowLayerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 28,
          "circle-blur": 0.6,
          "circle-color": [
            "match",
            ["get", "status"],
            "live",
            "rgba(239, 68, 68, 0.75)",
            "soon",
            "rgba(249, 115, 22, 0.75)",
            "rgba(34, 197, 94, 0.75)",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": [
            "case",
            ["==", ["get", "id"], selectedGameId ?? ""],
            "rgba(255,255,255,0.95)",
            "rgba(255,255,255,0.5)",
          ],
        },
      });
      map.addLayer({
        id: symbolLayerId,
        type: "symbol",
        source: sourceId,
        layout: {
          "text-field": ["concat", ["get", "sport_emoji"], " ", ["get", "players_label"]],
          "text-size": 14,
          "text-anchor": "center",
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.8)",
          "text-halo-width": 2,
        },
      });
    }

    const source = map.getSource(sourceId) as import("mapbox-gl").GeoJSONSource;
    if (source) source.setData(gamesGeoJSON);

    return () => {};
  }, [mapLoaded, gamesGeoJSON, selectedGameId]);

  // Click on game: return feature id and resolve to GameRow
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const handler = (e: { point: { x: number; y: number } }) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["fun-games-glow", "fun-games-symbol"],
      });
      const fid = features[0]?.properties?.id;
      if (fid) {
        const game = games.find((g) => g.id === fid) ?? null;
        onSelectGame(game);
      }
    };
    map.on("click", handler);
    return () => map.off("click", handler);
  }, [mapLoaded, games, onSelectGame]);

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

  // —— Sports venue emphasis: OSM Overpass (parks, pitches, sports centres) ———
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const sourceId = "fun-sports-venues";
    const layerId = "fun-sports-venues-dots";

    const fetchAndAdd = () => {
      const b = map.getBounds();
      if (!b) return;
      const bbox = {
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
      };
      fetchSportsVenuesFromOverpass(bbox).then((geojson) => {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: "geojson", data: geojson });
          const layerSpec = {
            id: layerId,
            type: "circle" as const,
            source: sourceId,
            paint: {
              "circle-radius": 6,
              "circle-color": "rgba(34, 197, 94, 0.4)",
              "circle-stroke-width": 1,
              "circle-stroke-color": "rgba(34, 197, 94, 0.8)",
            },
          };
          if (map.getLayer("fun-games-glow")) {
            map.addLayer(layerSpec, "fun-games-glow");
          } else {
            map.addLayer(layerSpec);
          }
        } else {
          (map.getSource(sourceId) as import("mapbox-gl").GeoJSONSource).setData(geojson);
        }
      });
    };

    if (!map.getSource(sourceId)) fetchAndAdd();
    map.on("moveend", fetchAndAdd);
    return () => map.off("moveend", fetchAndAdd);
  }, [mapLoaded]);

  // Double-click: create game at location
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !onMapDoubleClick) return;
    const handler = (e: { lngLat: { lat: number; lng: number } }) => {
      onMapDoubleClick(e.lngLat.lat, e.lngLat.lng);
    };
    map.on("dblclick", handler);
    return () => map.off("dblclick", handler);
  }, [mapLoaded, onMapDoubleClick]);

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
