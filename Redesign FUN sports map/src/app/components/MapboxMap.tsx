/// <reference types="vite/client" />
import React, { useRef, useEffect, useState, useCallback } from "react";
import type { GameRow } from "../../lib/supabase";
import type { ProfileNearbyRow } from "../../lib/supabase";
import { gamesToGeoJSON } from "../types/mapGeoJSON";
import { fetchSportsVenuesFromOverpass, bboxFromCenterRadius } from "../lib/sportsVenues";
import type { SportsVenueGeoJSON } from "../lib/sportsVenues";
import { venueMatchesSelectedSports } from "../../lib/osmSportTags";
import { limitGamesForMapViewport } from "../map/mapBounds";
import {
  getViewportMetrics,
  shouldShowGameClusters,
  shouldShowGameIndividuals,
  shouldShowPlayerMarkers,
  shouldShowVenueDots,
  shouldShowVenueFootprints,
} from "../map/mapVisibility";
import * as MapCfg from "../map/mapConfig";
import { registerGameSportImages } from "../map/registerGameSportImages";
import { getGameMapboxIconId } from "../map/gameSportIcons";
import { Avatar3DOverlay } from "./Avatar3DOverlay";
import { GameEventPopup } from "./GameEventPopup";
import { VenueInfoPopup } from "./VenueInfoPopup";
import { useIsMobile } from "./ui/use-mobile";

/** Layer / source ids: games use GL clustering (geo-anchored, no DOM drift). */
const L_GAME_SOURCE = "fun-games";
const L_GAME_CLUSTERS = "fun-games-clusters";
const L_GAME_CLUSTER_LABEL = "fun-games-cluster-label";
/** Rasterized sport emoji only (`sport_map_icon` → addImage); no separate circle layer. */
const L_GAME_ICON = "fun-games-sport-icon";
const L_GAME_COUNT = "fun-games-roster";
const L_VENUE_DOTS = "venue-dots-core";
const SRC_VENUE_DOTS = "venue-dots";

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim() || undefined;
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1624280184393-53ce60e214ea?w=100&h=100&fit=crop";
/** Default Ready Player Me GLB for 3D avatar when no profile avatar_glb_url is set. */
const DEFAULT_AVATAR_GLB =
  "https://models.readyplayer.me/64b7d2a3d1b31a0096b5e8c4.glb?quality=low";

function circlePolygon(
  centerLng: number,
  centerLat: number,
  radiusMeters: number,
  steps = 32
): import("geojson").Polygon {
  const coordinates: [number, number][] = [];
  const earthRadius = 6378137;

  for (let i = 0; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const dx = (radiusMeters * Math.cos(angle)) / earthRadius;
    const dy = (radiusMeters * Math.sin(angle)) / earthRadius;

    const lng = centerLng + (dx * 180) / Math.PI;
    const lat =
      centerLat + (dy * 180) / Math.PI / Math.cos((centerLat * Math.PI) / 180);

    coordinates.push([lng, lat]);
  }

  return {
    type: "Polygon",
    coordinates: [coordinates],
  };
}

function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadius = 6378137; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export type MapCameraRequest =
  | { id: number; kind: "fly"; lat: number; lng: number; zoom?: number }
  | { id: number; kind: "fitBounds"; coordinates: [number, number][] };

type MapboxMapProps = {
  userCoords: { lat: number; lng: number } | null;
  games: GameRow[];
  selectedGameId: string | null;
  onSelectGame: (game: GameRow | null) => void;
  selectedVenue: VenueSelection | null;
  onSelectVenue: (venue: VenueSelection | null) => void;
  /** Where to fetch/render sports venues (defaults to `userCoords` if omitted). */
  venuesCenter?: { lat: number; lng: number } | null;
  /** Overpass bbox radius (km) around `venuesCenter`. */
  venueSearchRadiusKm?: number;
  /** When non-empty, keep only OSM pitches whose `sport=*` matches selected labels. */
  venueSportsFilter?: string[];
  /** When set, open the game join modal for this game id. */
  gamePopupRequest?: { nonce: number; gameId: string } | null;
  /** Fly / fitBounds when `id` changes (search, sport focus, etc.). */
  mapCameraRequest?: MapCameraRequest | null;
  enable3D?: boolean;
  /** 2D fallback: image URL for user marker when 3D is off. */
  userAvatarUrl?: string | null;
  /** 3D avatar: Ready Player Me (or any) GLB URL (e.g. https://models.readyplayer.me/<id>.glb?quality=low). */
  avatarGlbUrl?: string | null;
  /** true = 2D marker only; false = 3D avatar overlay when enable3D (default, no Mapbox GL conflict). */
  use2DAvatar?: boolean;
  /** Called when user clicks Join in the event popup. */
  onJoinGame?: (game: GameRow) => void;
  /** Called when user clicks Unjoin in the event popup. */
  onLeaveGame?: (game: GameRow) => void;
  /** Host: delete game for everyone. Return true if the game row was removed. */
  onDeleteHostedGame?: (game: GameRow) => Promise<boolean>;
  /** Called when user clicks Messages in the event popup. */
  onOpenMessagesForGame?: (game: GameRow) => void;
  /** Set of game ids the current user has joined (to show "Joined" in popup). */
  joinedGameIds?: Set<string>;
  /** Set of game ids where the current user is the host (to show "You're hosting"). */
  hostGameIds?: Set<string>;
  nearbyProfiles?: ProfileNearbyRow[];
  currentUserId?: string | null;
  /** (lat, lng, viewportPoint) when user double-taps the map */
  onMapDoubleClick?: (lat: number, lng: number, viewportPoint?: { x: number; y: number }) => void;
  /** Open Create Game from selected venue popup. */
  onCreateGameAtVenue?: (venue: VenueSelection, viewportPoint?: { x: number; y: number }) => void;
  /** When this value changes, map flies to user location. */
  centerOnUserTrigger?: number;
  /** True while OpenStreetMap (Overpass) venue fetch is in progress. */
  onVenuesFetchLoadingChange?: (loading: boolean) => void;
};

export type VenueSelection = {
  id: string;
  name?: string;
  sport?: string;
  leisure?: string;
  center: { lat: number; lng: number };
};

export function MapboxMap(props: MapboxMapProps) {
  const {
    userCoords,
    games,
    selectedGameId,
    onSelectGame,
    selectedVenue,
    onSelectVenue,
    venuesCenter = null,
    venueSearchRadiusKm = 15,
    venueSportsFilter = [],
    gamePopupRequest = null,
    mapCameraRequest = null,
    enable3D = false,
    userAvatarUrl = null,
    avatarGlbUrl = null,
    use2DAvatar = false,
    onJoinGame,
    onLeaveGame,
    onDeleteHostedGame,
    onOpenMessagesForGame,
    joinedGameIds,
    nearbyProfiles = [],
    onMapDoubleClick,
    onCreateGameAtVenue,
    centerOnUserTrigger,
    onVenuesFetchLoadingChange,
  } = props;
  const currentUserId = props.currentUserId ?? null;
  const joinedSet = joinedGameIds ?? new Set<string>();
  const hostSet = props.hostGameIds ?? new Set<string>();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const playerMarkersRef = useRef<import("mapbox-gl").Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [eventPopup, setEventPopup] = useState<{ game: GameRow; point: { x: number; y: number } } | null>(null);
  const [venuePopupPoint, setVenuePopupPoint] = useState<{ x: number; y: number } | null>(null);
  const [bumpGameId, setBumpGameId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const venueInteractionTsRef = useRef(0);
  const gameInteractionTsRef = useRef(0);
  const lastHandledGamePopupNonceRef = useRef<number | null>(null);
  const initialUserFlyDoneRef = useRef(false);
  const gameLayersInitedRef = useRef(false);
  const bumpGameTimeoutRef = useRef<number | null>(null);
  const gamesRef = useRef(games);
  const onSelectGameRef = useRef(onSelectGame);
  const onJoinGameRef = useRef(onJoinGame);
  const selectedGameIdRef = useRef(selectedGameId);
  const [mapUxHint, setMapUxHint] = useState<string | null>(null);
  const venuesFetchCenter = venuesCenter ?? userCoords;
  const onVenuesFetchLoadingChangeRef = useRef(onVenuesFetchLoadingChange);
  onVenuesFetchLoadingChangeRef.current = onVenuesFetchLoadingChange;

  gamesRef.current = games;
  onSelectGameRef.current = onSelectGame;
  onJoinGameRef.current = onJoinGame;
  selectedGameIdRef.current = selectedGameId;

  // Small tap animation for the game sport icon when opening the join modal.
  const bumpGameIcon = (gameId: string) => {
    setBumpGameId(gameId);
    if (bumpGameTimeoutRef.current != null) window.clearTimeout(bumpGameTimeoutRef.current);
    bumpGameTimeoutRef.current = window.setTimeout(() => setBumpGameId(null), 240);
  };

  useEffect(() => {
    return () => {
      if (bumpGameTimeoutRef.current != null) window.clearTimeout(bumpGameTimeoutRef.current);
    };
  }, []);

  // —— Map init: sports-first dark basemap, terrain, fog ———
  useEffect(() => {
    setMapError(null);
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    if (mapRef.current) return;

    let cancelled = false;

    import("mapbox-gl").then((mapboxgl) => {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;

      mapboxgl.default.accessToken = MAPBOX_TOKEN;

      try {
        container.innerHTML = "";
      } catch (_) {
        return;
      }

      let map: import("mapbox-gl").Map | null = null;
      try {
        map = new mapboxgl.default.Map({
          container,
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

      if (cancelled) {
        try {
          map.remove();
        } catch (_) {}
        return;
      }

      mapRef.current = map;

      map.on("load", () => {
        if (cancelled || mapRef.current !== map) return;
        setMapLoaded(true);
        setMapError(null);
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
        try {
          map!.doubleClickZoom?.disable();
        } catch (_) {}
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
          if (mapRef.current === map) mapRef.current = null;
        }
      });
    });

    return () => {
      cancelled = true;
      gameLayersInitedRef.current = false;
      initialUserFlyDoneRef.current = false;
      setMapLoaded(false);
      const m = mapRef.current;
      if (m) {
        try {
          m.remove();
        } catch (_) {}
        mapRef.current = null;
      }
    };
  }, [MAPBOX_TOKEN, enable3D, userCoords]);

  // One-time fly to user when coords first become available (avoid fighting search / sport camera)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !userCoords) return;
    if (initialUserFlyDoneRef.current) return;
    initialUserFlyDoneRef.current = true;
    map.flyTo({
      center: [userCoords.lng, userCoords.lat],
      zoom: 16,
      pitch: enable3D ? 50 : 0,
    });
  }, [mapLoaded, userCoords, enable3D]);

  // Search / sport-driven camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !mapCameraRequest) return;
    const req = mapCameraRequest;

    import("mapbox-gl").then((mapboxgl) => {
      const m = mapRef.current;
      if (!m) return;

      if (req.kind === "fly") {
        m.flyTo({
          center: [req.lng, req.lat],
          zoom: req.zoom ?? 13,
          pitch: enable3D ? 50 : 0,
          duration: 1400,
        });
        return;
      }

      const coords = req.coordinates.filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
      if (coords.length === 0) return;
      if (coords.length === 1) {
        m.flyTo({
          center: coords[0],
          zoom: 14,
          pitch: enable3D ? 50 : 0,
          duration: 1200,
        });
        return;
      }
      const bounds = new mapboxgl.default.LngLatBounds(coords[0], coords[0]);
      for (let i = 1; i < coords.length; i++) bounds.extend(coords[i]);
      m.fitBounds(bounds, {
        padding: { top: 120, bottom: 240, left: 48, right: 48 },
        maxZoom: 14,
        duration: 1200,
      });
    });
  }, [mapLoaded, mapCameraRequest, enable3D]);

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

  // —— Venue selection: fly camera + emphasize selected venue area ——
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedVenue) return;

    map.flyTo({
      center: [selectedVenue.center.lng, selectedVenue.center.lat],
      zoom: 17,
      pitch: enable3D ? 50 : 0,
      duration: 450,
    });
  }, [mapLoaded, selectedVenue, enable3D]);

  // —— Open game modal from carousel (center + delayed popup) ——
  useEffect(() => {
    if (!mapLoaded || !gamePopupRequest) return;
    if (lastHandledGamePopupNonceRef.current === gamePopupRequest.nonce) return;
    lastHandledGamePopupNonceRef.current = gamePopupRequest.nonce;

    const map = mapRef.current;
    if (!map) return;

    const game = gamesRef.current.find((g) => g.id === gamePopupRequest.gameId);
    if (!game) return;

    // Close venue popup (if open) and ensure game selection is synced.
    onSelectVenue(null);
    setVenuePopupPoint(null);
    onSelectGameRef.current(game);

    const rect = map.getContainer().getBoundingClientRect();
    const mapPoint = { x: rect.width / 2, y: rect.height / 2 };

    gameInteractionTsRef.current = Date.now();
    setEventPopup(null);

    const t = window.setTimeout(() => {
      bumpGameIcon(game.id);
      setEventPopup({ game, point: mapPoint });
    }, 650);

    return () => window.clearTimeout(t);
  }, [mapLoaded, gamePopupRequest, onSelectVenue]);

  /** Venue footprint paint: calm default; selected venue slightly warmer (still quieter than games). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const fillLayerId = "venue-areas-fill";
    const outlineLayerId = "venue-areas-outline";

    if (map.getLayer(fillLayerId)) {
      const sel = selectedVenue?.id ?? "";
      map.setPaintProperty(fillLayerId, "fill-color", [
        "case",
        ["==", ["get", "id"], sel],
        MapCfg.VENUE_FILL_COLOR_SELECTED,
        MapCfg.VENUE_FILL_COLOR_DEFAULT,
      ]);
      map.setPaintProperty(fillLayerId, "fill-opacity", [
        "case",
        ["==", ["get", "id"], sel],
        0.22,
        0.12,
      ]);
    }

    if (map.getLayer(outlineLayerId)) {
      const sel = selectedVenue?.id ?? "";
      map.setPaintProperty(outlineLayerId, "line-color", [
        "case",
        ["==", ["get", "id"], sel],
        MapCfg.VENUE_OUTLINE_COLOR_SELECTED,
        MapCfg.VENUE_OUTLINE_COLOR_DEFAULT,
      ]);
      map.setPaintProperty(outlineLayerId, "line-width", [
        "case",
        ["==", ["get", "id"], sel],
        MapCfg.VENUE_OUTLINE_WIDTH_SELECTED,
        MapCfg.VENUE_OUTLINE_WIDTH_DEFAULT,
      ]);
    }

    // Subtle venue center dot emphasis (no extra pulse layers / yellow beacons)
    if (map.getLayer(L_VENUE_DOTS)) {
      const sel = selectedVenue?.id ?? "";
      map.setPaintProperty(L_VENUE_DOTS, "circle-radius", [
        "case",
        ["==", ["get", "id"], sel],
        MapCfg.VENUE_DOT_RADIUS_SELECTED_PX,
        MapCfg.VENUE_DOT_RADIUS_PX,
      ]);
      map.setPaintProperty(L_VENUE_DOTS, "circle-color", [
        "case",
        ["==", ["get", "id"], sel],
        MapCfg.VENUE_DOT_COLOR_SELECTED,
        MapCfg.VENUE_DOT_COLOR,
      ]);
      map.setPaintProperty(L_VENUE_DOTS, "circle-opacity", [
        "case",
        ["==", ["get", "id"], sel],
        0.95,
        0.55,
      ]);
    }
  }, [mapLoaded, selectedVenue]);

  /** Geo-anchored games: clustered GL source + symbol/circle layers (no DOM markers). */
  const applyMapLayerVisibility = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getLayer(L_GAME_CLUSTERS)) return;
    const { zoom, boundsWidthKm } = getViewportMetrics(map);
    const showClusters = shouldShowGameClusters(zoom, boundsWidthKm);
    const showIndividuals = shouldShowGameIndividuals(zoom, boundsWidthKm);
    const showVenueFp = shouldShowVenueFootprints(zoom);
    const showVenueDot = shouldShowVenueDots(zoom);
    const showPlayers = shouldShowPlayerMarkers(zoom);

    map.setLayoutProperty(L_GAME_CLUSTERS, "visibility", showClusters ? "visible" : "none");
    map.setLayoutProperty(L_GAME_CLUSTER_LABEL, "visibility", showClusters ? "visible" : "none");
    map.setLayoutProperty(L_GAME_ICON, "visibility", showIndividuals ? "visible" : "none");
    map.setLayoutProperty(L_GAME_COUNT, "visibility", showIndividuals ? "visible" : "none");

    if (map.getLayer("venue-areas-fill")) {
      map.setLayoutProperty("venue-areas-fill", "visibility", showVenueFp ? "visible" : "none");
    }
    if (map.getLayer("venue-areas-outline")) {
      map.setLayoutProperty("venue-areas-outline", "visibility", showVenueFp ? "visible" : "none");
    }
    if (map.getLayer(L_VENUE_DOTS)) {
      map.setLayoutProperty(L_VENUE_DOTS, "visibility", showVenueDot ? "visible" : "none");
    }

    playerMarkersRef.current.forEach((m) => {
      const el = m.getElement();
      if (el) el.style.visibility = showPlayers ? "visible" : "hidden";
    });

    const g = gamesRef.current;
    setMapUxHint(
      g.length > 0 && !showClusters && !showIndividuals && zoom < MapCfg.GAME_INDIVIDUAL_MIN_ZOOM
        ? "Zoom in to explore games nearby"
        : null
    );
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || gameLayersInitedRef.current) return;
    gameLayersInitedRef.current = true;

    registerGameSportImages(map);

    map.addSource(L_GAME_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: MapCfg.GAME_CLUSTER_MAX_ZOOM,
      clusterRadius: MapCfg.GAME_CLUSTER_RADIUS_PX,
    });

    map.addLayer({
      id: L_GAME_CLUSTERS,
      type: "circle",
      source: L_GAME_SOURCE,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "rgba(30, 41, 59, 0.92)",
        "circle-radius": ["step", ["get", "point_count"], 18, 8, 22, 16, 26, 32, 30],
        "circle-opacity": 0.88,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "rgba(251, 191, 36, 0.55)",
      },
    });

    map.addLayer({
      id: L_GAME_CLUSTER_LABEL,
      type: "symbol",
      source: L_GAME_SOURCE,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#e2e8f0",
      },
    });

    map.addLayer({
      id: L_GAME_ICON,
      type: "symbol",
      source: L_GAME_SOURCE,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["coalesce", ["get", "sport_map_icon"], getGameMapboxIconId("other")],
        "icon-size": 0.82,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {},
    });

    map.addLayer({
      id: L_GAME_COUNT,
      type: "symbol",
      source: L_GAME_SOURCE,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["get", "players_label"],
        "text-size": 9,
        "text-offset": [0, 1.35],
        "text-anchor": "top",
        "text-allow-overlap": true,
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
      },
      paint: {
        "text-color": "#cbd5e1",
        "text-halo-color": "rgba(15,23,42,0.85)",
        "text-halo-width": 1,
      },
    });

    const openPopupForGame = (game: GameRow, mapPoint: { x: number; y: number }) => {
      gameInteractionTsRef.current = Date.now();
      onSelectGameRef.current(game);
      bumpGameIcon(game.id);
      setEventPopup({ game, point: mapPoint });
    };

    const openGameFromFeature = (e: {
      features?: import("mapbox-gl").MapboxGeoJSONFeature[];
      point: { x: number; y: number };
    }) => {
      const f = e.features?.[0];
      const gid = f?.properties?.id;
      if (!gid) return;
      const game = gamesRef.current.find((g) => g.id === gid);
      if (game) openPopupForGame(game, e.point);
    };

    map.on("click", L_GAME_CLUSTERS, (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const src = map.getSource(L_GAME_SOURCE) as import("mapbox-gl").GeoJSONSource;
      const raw = f.properties?.cluster_id;
      const clusterId = typeof raw === "number" ? raw : Number(raw);
      if (raw == null || Number.isNaN(clusterId)) return;
      src.getClusterExpansionZoom(clusterId, (err, z) => {
        if (err || z == null) return;
        const coords = (f.geometry as import("geojson").Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom: Math.min(z + 0.5, 16), duration: 450 });
      });
    });

    map.on("click", L_GAME_ICON, openGameFromFeature);

    [L_GAME_CLUSTERS, L_GAME_ICON].forEach((id) => {
      map.on("mouseenter", id, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", id, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    let visRaf = 0;
    const scheduleVis = () => {
      if (visRaf) cancelAnimationFrame(visRaf);
      visRaf = requestAnimationFrame(() => {
        visRaf = 0;
        applyMapLayerVisibility();
      });
    };

    map.on("move", scheduleVis);
    map.on("zoom", scheduleVis);
    map.on("moveend", applyMapLayerVisibility);
    map.on("zoomend", applyMapLayerVisibility);

    applyMapLayerVisibility();

    return () => {
      map.off("move", scheduleVis);
      map.off("zoom", scheduleVis);
      map.off("moveend", applyMapLayerVisibility);
      map.off("zoomend", applyMapLayerVisibility);
    };
  }, [mapLoaded, applyMapLayerVisibility]);

  /** Push game GeoJSON into clustered source (capped by viewport for performance). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(L_GAME_SOURCE) as import("mapbox-gl").GeoJSONSource | undefined;
    if (!src) return;

    const capped = limitGamesForMapViewport(games, map, MapCfg.MAX_VISIBLE_INDIVIDUAL_GAMES);
    src.setData(gamesToGeoJSON(capped, selectedGameId));
    applyMapLayerVisibility();
  }, [mapLoaded, games, selectedGameId, applyMapLayerVisibility]);

  /** Selected game: slightly larger icon + warm halo (no circle underlay). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(L_GAME_ICON)) return;
    const sid = selectedGameId ?? "";
    const bid = bumpGameId ?? "";
    map.setLayoutProperty(L_GAME_ICON, "icon-size", [
      "case",
      ["==", ["get", "id"], bid],
      1.08,
      ["==", ["get", "id"], sid],
      0.98,
      0.82,
    ]);
    map.setPaintProperty(L_GAME_ICON, "icon-halo-color", [
      "case",
      ["==", ["get", "id"], bid],
      "rgba(251, 191, 36, 0.72)",
      ["==", ["get", "id"], sid],
      "rgba(251, 191, 36, 0.55)",
      "rgba(0, 0, 0, 0)",
    ]);
    map.setPaintProperty(L_GAME_ICON, "icon-halo-width", [
      "case",
      ["==", ["get", "id"], bid],
      3,
      ["==", ["get", "id"], sid],
      2,
      0,
    ]);
    map.setPaintProperty(L_GAME_ICON, "icon-halo-blur", [
      "case",
      ["==", ["get", "id"], bid],
      1,
      ["==", ["get", "id"], sid],
      0.8,
      0,
    ]);
  }, [mapLoaded, selectedGameId, bumpGameId]);

  // Map click:
  // - On desktop: close popup only.
  // - On mobile: use single tap to center map and open Create Game modal.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const handler = (e: { lngLat: { lat: number; lng: number }; point: { x: number; y: number } }) => {
      // Avoid clearing venue selection immediately after venue marker/polygon clicks.
      if (Date.now() - venueInteractionTsRef.current < 250) return;
      // Also avoid clearing game popup immediately after clicking a game point/icon.
      if (Date.now() - gameInteractionTsRef.current < 250) return;

      if (isMobile && onMapDoubleClick) {
        setEventPopup(null);
        onSelectVenue(null);
        setVenuePopupPoint(null);

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
      onSelectVenue(null);
      setVenuePopupPoint(null);
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [mapLoaded, isMobile, onMapDoubleClick, onSelectVenue]);

  // Map double-click (desktop): use the geographic point under the cursor, not viewport center
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !onMapDoubleClick || isMobile) return;

    const handler = (e: { lngLat: { lat: number; lng: number }; point: { x: number; y: number } }) => {
      const container = map.getContainer();
      const rect = container.getBoundingClientRect();

      const tapLat = e.lngLat.lat;
      const tapLng = e.lngLat.lng;

      setEventPopup(null);
      onSelectVenue(null);
      setVenuePopupPoint(null);

      map.easeTo({
        center: [tapLng, tapLat],
        duration: 300,
      });

      // Screen position of the double-click (for modal placement)
      const viewportPoint = {
        x: rect.left + e.point.x,
        y: rect.top + e.point.y,
      };

      onMapDoubleClick(tapLat, tapLng, viewportPoint);
    };

    map.on("dblclick", handler);
    return () => {
      map.off("dblclick", handler);
    };
  }, [mapLoaded, onMapDoubleClick, isMobile, onSelectVenue]);

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
      applyMapLayerVisibility();
    });

    return () => {
      playerMarkersRef.current.forEach((m) => m.remove());
      playerMarkersRef.current = [];
    };
  }, [mapLoaded, nearbyProfiles, currentUserId, applyMapLayerVisibility]);

  // —— Sports venues: subtle GL polygons + small center dots (no DOM flag markers) ———
  const venueSportSig = venueSportsFilter.slice().sort().join("|");
  const venueFetchKey = venuesFetchCenter
    ? `${venuesFetchCenter.lat.toFixed(4)},${venuesFetchCenter.lng.toFixed(4)},${venueSearchRadiusKm},${venueSportSig}`
    : null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !venuesFetchCenter || !venueFetchKey) {
      onVenuesFetchLoadingChangeRef.current?.(false);
      return;
    }

    const addVenueMarkers = (geojson: SportsVenueGeoJSON, onDone?: () => void) => {
      const mapInstance = mapRef.current;
      if (!mapInstance) {
        onDone?.();
        return;
      }

      import("mapbox-gl")
        .then(() => {
        try {
        type Cluster = {
          lng: number;
          lat: number;
          properties: SportsVenueGeoJSON["features"][number]["properties"];
        };

        const clusters: Cluster[] = [];
        const maxDistanceMeters = 80;
        const toRadians = (deg: number) => (deg * Math.PI) / 180;
        const distanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
          const R = 6378137;
          const dLat = toRadians(lat2 - lat1);
          const dLng = toRadians(lng2 - lng1);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };

        const pointFeatures = geojson.features.filter((f) => {
          if (!f.geometry || f.geometry.type !== "Point") return false;
          return venueMatchesSelectedSports(f.properties.sport, venueSportsFilter);
        });

        pointFeatures.forEach((f) => {
          const [lng, lat] = f.geometry.coordinates;

          let targetCluster: Cluster | null = null;
          for (const cluster of clusters) {
            if (distanceMeters(lat, lng, cluster.lat, cluster.lng) <= maxDistanceMeters) {
              targetCluster = cluster;
              break;
            }
          }

          if (targetCluster) {
            targetCluster.lng = (targetCluster.lng + lng) / 2;
            targetCluster.lat = (targetCluster.lat + lat) / 2;
          } else {
            clusters.push({ lng, lat, properties: f.properties });
          }
        });

        const areaFeatures: import("geojson").Feature<
          import("geojson").Polygon,
          SportsVenueGeoJSON["features"][number]["properties"]
        >[] = [];

        clusters.forEach((cluster) => {
          const polygon = circlePolygon(cluster.lng, cluster.lat, MapCfg.VENUE_AREA_RADIUS_METERS);
          areaFeatures.push({
            type: "Feature",
            geometry: polygon,
            properties: cluster.properties,
          });
        });

        const areaCollection: import("geojson").FeatureCollection = {
          type: "FeatureCollection",
          features: areaFeatures,
        };

        const dotFeatures: import("geojson").Feature<
          import("geojson").Point,
          { id: string; name?: string }
        >[] = clusters.map((c) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [c.lng, c.lat] },
          properties: { id: c.properties.id, name: c.properties.name },
        }));

        const dotCollection: import("geojson").FeatureCollection = {
          type: "FeatureCollection",
          features: dotFeatures,
        };

        const sourceId = "venue-areas";
        const fillLayerId = "venue-areas-fill";
        const outlineLayerId = "venue-areas-outline";
        const beforeGames = mapInstance.getLayer(L_GAME_CLUSTERS) ? L_GAME_CLUSTERS : undefined;

        const selectVenueFromCluster = (cluster: Cluster, mapPoint: { x: number; y: number }) => {
          venueInteractionTsRef.current = Date.now();
          setEventPopup(null);
          setVenuePopupPoint(mapPoint);
          onSelectVenue({
            id: cluster.properties.id,
            name: cluster.properties.name,
            sport: cluster.properties.sport,
            leisure: cluster.properties.leisure,
            center: { lng: cluster.lng, lat: cluster.lat },
          });
        };

        if (mapInstance.getSource(sourceId)) {
          (mapInstance.getSource(sourceId) as import("mapbox-gl").GeoJSONSource).setData(areaCollection);
          const dotSrc = mapInstance.getSource(SRC_VENUE_DOTS) as import("mapbox-gl").GeoJSONSource | undefined;
          if (dotSrc) dotSrc.setData(dotCollection);
        } else {
          mapInstance.addSource(sourceId, {
            type: "geojson",
            data: areaCollection,
            promoteId: "id",
          });

          mapInstance.addSource(SRC_VENUE_DOTS, {
            type: "geojson",
            data: dotCollection,
            promoteId: "id",
          });

          mapInstance.addLayer(
            {
              id: fillLayerId,
              type: "fill",
              source: sourceId,
              paint: {
                "fill-color": MapCfg.VENUE_FILL_COLOR_DEFAULT,
                "fill-opacity": 0.12,
              },
            },
            beforeGames
          );

          mapInstance.addLayer(
            {
              id: outlineLayerId,
              type: "line",
              source: sourceId,
              paint: {
                "line-color": MapCfg.VENUE_OUTLINE_COLOR_DEFAULT,
                "line-width": MapCfg.VENUE_OUTLINE_WIDTH_DEFAULT,
              },
            },
            beforeGames
          );

          mapInstance.addLayer(
            {
              id: L_VENUE_DOTS,
              type: "circle",
              source: SRC_VENUE_DOTS,
              paint: {
                "circle-radius": MapCfg.VENUE_DOT_RADIUS_PX,
                "circle-color": MapCfg.VENUE_DOT_COLOR,
                  "circle-opacity": 0.78,
                "circle-stroke-width": MapCfg.VENUE_DOT_STROKE_WIDTH,
                "circle-stroke-color": MapCfg.VENUE_DOT_STROKE,
              },
            },
            beforeGames
          );

          const onFillClick = (e: { features?: import("mapbox-gl").MapboxGeoJSONFeature[]; point: { x: number; y: number } }) => {
            // If the click is on top of a game icon/cluster, ignore venue interactions.
            const hitGames = mapInstance.queryRenderedFeatures(
              e.point as unknown as import("mapbox-gl").PointLike,
              {
                layers: [L_GAME_ICON, L_GAME_CLUSTERS],
              }
            );
            if (hitGames.length) return;

            const feature = e.features?.[0] as
              | import("geojson").Feature<
                  import("geojson").Polygon,
                  SportsVenueGeoJSON["features"][number]["properties"]
                >
              | undefined;
            if (!feature) return;
            const ring = feature.geometry.coordinates[0];
            if (!ring?.length) return;
            const center = ring.reduce(
              (acc, coord) => {
                acc[0] += coord[0];
                acc[1] += coord[1];
                return acc;
              },
              [0, 0] as [number, number]
            );
            center[0] /= ring.length;
            center[1] /= ring.length;
            const cl = clusters.find((c) => c.properties.id === feature.properties.id);
            if (cl) selectVenueFromCluster(cl, e.point);
            else {
              venueInteractionTsRef.current = Date.now();
              setEventPopup(null);
              setVenuePopupPoint({ x: e.point.x, y: e.point.y });
              onSelectVenue({
                id: feature.properties.id,
                name: feature.properties.name,
                sport: feature.properties.sport,
                leisure: feature.properties.leisure,
                center: { lng: center[0], lat: center[1] },
              });
            }
          };

          mapInstance.on("click", fillLayerId, onFillClick);

          mapInstance.on("click", L_VENUE_DOTS, (e) => {
            // If the click is on top of a game icon/cluster, ignore venue interactions.
            const hitGames = mapInstance.queryRenderedFeatures(
              e.point as unknown as import("mapbox-gl").PointLike,
              {
                layers: [L_GAME_ICON, L_GAME_CLUSTERS],
              }
            );
            if (hitGames.length) return;

            const id = e.features?.[0]?.properties?.id as string | undefined;
            if (!id) return;
            const cl = clusters.find((c) => c.properties.id === id);
            if (cl) selectVenueFromCluster(cl, e.point);
          });

          [fillLayerId, L_VENUE_DOTS].forEach((lid) => {
            mapInstance.on("mouseenter", lid, () => {
              mapInstance.getCanvas().style.cursor = "pointer";
            });
            mapInstance.on("mouseleave", lid, () => {
              mapInstance.getCanvas().style.cursor = "";
            });
          });
        }

        applyMapLayerVisibility();
        } finally {
          onDone?.();
        }
      })
        .catch(() => {
          onDone?.();
        });
    };

    let cancelled = false;
    onVenuesFetchLoadingChangeRef.current?.(true);
    const bbox = bboxFromCenterRadius(venuesFetchCenter.lat, venuesFetchCenter.lng, venueSearchRadiusKm);
    fetchSportsVenuesFromOverpass(bbox).then((geojson) => {
      if (cancelled) return;
      addVenueMarkers(geojson, () => {
        if (cancelled) return;
        // Let React paint loading=true before clearing (cached / fast responses).
        const done = () => onVenuesFetchLoadingChangeRef.current?.(false);
        if (typeof requestAnimationFrame !== "undefined") {
          requestAnimationFrame(() => requestAnimationFrame(done));
        } else {
          window.setTimeout(done, 0);
        }
      });
    });

    return () => {
      cancelled = true;
      onVenuesFetchLoadingChangeRef.current?.(false);
      const m = mapRef.current;
      if (!m) return;
      try {
        if (m.getLayer(L_VENUE_DOTS)) m.removeLayer(L_VENUE_DOTS);
        if (m.getLayer("venue-areas-outline")) m.removeLayer("venue-areas-outline");
        if (m.getLayer("venue-areas-fill")) m.removeLayer("venue-areas-fill");
        if (m.getSource(SRC_VENUE_DOTS)) m.removeSource(SRC_VENUE_DOTS);
        if (m.getSource("venue-areas")) m.removeSource("venue-areas");
      } catch (_) {}
    };
  }, [mapLoaded, venueFetchKey, onSelectVenue, applyMapLayerVisibility]);

  const openGamesNearbyCount = selectedVenue
    ? games.filter((g) => {
        const isOpen = g.status === "open" || !g.status;
        if (!isOpen) return false;
        const dMeters = haversineDistanceMeters(
          selectedVenue.center.lat,
          selectedVenue.center.lng,
          g.lat,
          g.lng
        );
        return dMeters <= 120;
      }).length
    : 0;

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
      {mapUxHint && (
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-36 z-30 max-w-sm px-4 py-2 rounded-full bg-slate-900/75 border border-slate-600/60 text-slate-300 text-xs text-center backdrop-blur-md shadow-lg"
          role="status"
        >
          {mapUxHint}
        </div>
      )}
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
              onLeave={onLeaveGame}
              onOpenMessages={onOpenMessagesForGame}
              joined={joinedSet.has(eventPopup.game.id)}
              isHost={Boolean(currentUserId) && hostSet.has(eventPopup.game.id)}
              onDeleteHostedGame={onDeleteHostedGame}
            />
          </div>
        </div>
      )}

      {selectedVenue && venuePopupPoint && mapLoaded && containerRef.current && (
        <div
          className="absolute inset-0 pointer-events-auto"
          onClick={() => {
            onSelectVenue(null);
            setVenuePopupPoint(null);
          }}
        >
          <div
            className="absolute"
            style={{ left: venuePopupPoint.x, top: venuePopupPoint.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <VenueInfoPopup
              venue={selectedVenue}
              openGamesNearbyCount={openGamesNearbyCount}
              onCreateGame={(venue) => {
                onCreateGameAtVenue?.(venue, venuePopupPoint ?? undefined);
              }}
              onClose={() => {
                onSelectVenue(null);
                setVenuePopupPoint(null);
              }}
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
