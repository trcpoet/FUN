/// <reference types="vite/client" />
import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { useNavigate } from "react-router";

type ReactRoot = ReturnType<typeof createRoot>;
import type { GameRow } from "../../lib/supabase";
import type { ProfileNearbyRow } from "../../lib/supabase";
import { isVenueGame } from "../../lib/mapGameTimer";
import { gamesToGeoJSON } from "../types/mapGeoJSON";
import { fetchSportsVenuesWithProgress } from "../lib/sportsVenues";
import type { SportsVenueGeoJSON } from "../lib/sportsVenues";
import type { VenueClusterPoint } from "../lib/sportsVenueTypes";
import { clusterVenuePoints } from "../lib/venueClusterEngine";
import { runVenueClusterAsync } from "../lib/venueClusterRunner";
import { openGamesNearPoint } from "../lib/gamesAtVenue";
import { splitColocatedGames } from "../lib/colocateGames";
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
import { loadMapboxGl } from "../lib/mapboxCached";
import { registerGameSportImages } from "../map/registerGameSportImages";
import { getGameMapboxIconId } from "../map/gameSportIcons";
import { Avatar3DOverlay } from "./Avatar3DOverlay";
import { GameEventPopup } from "./GameEventPopup";
import { VenueInfoPopup } from "./VenueInfoPopup";
import { ColocatedGamesPin } from "./ColocatedGamesPin";
import { RandomLocationGamePin } from "./RandomLocationGamePin";
import { ColocatedGamesModal } from "./ColocatedGamesModal";
import { useIsMobile } from "./ui/use-mobile";

/** Layer / source ids: games use GL clustering (geo-anchored, no DOM drift). */
const L_GAME_SOURCE = "fun-games";
const L_GAME_CLUSTERS = "fun-games-clusters";
const L_GAME_CLUSTER_LABEL = "fun-games-cluster-label";
/** Rasterized sport emoji only (`sport_map_icon` → addImage); no separate circle layer. */
const L_GAME_ICON = "fun-games-sport-icon";
const L_GAME_COUNT = "fun-games-roster";
const L_VENUE_DOTS = "venue-dots-core";
/** Dark bluish-purple halos (outer + inner gradient) — animated via rAF */
const L_VENUE_DOTS_PULSE = "venue-dots-pulse";
const L_VENUE_DOTS_PULSE_INNER = "venue-dots-pulse-inner";
const SRC_VENUE_DOTS = "venue-dots";

function lerpPulseRgb(
  a: { readonly r: number; readonly g: number; readonly b: number },
  b: { readonly r: number; readonly g: number; readonly b: number },
  t: number
): { r: number; g: number; b: number } {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim() || undefined;
/** Studio style URL; override with `VITE_MAPBOX_STYLE_URL` in .env if you publish a new style. */
const MAP_STYLE_URL =
  (import.meta.env.VITE_MAPBOX_STYLE_URL as string | undefined)?.trim() ||
  "mapbox://styles/trcpoet/cmn1l2br1003e01s52y4q9uzt";
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1624280184393-53ce60e214ea?w=100&h=100&fit=crop";

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
  /** Host: start game (status=live). */
  onStartHostedGame?: (game: GameRow) => Promise<void> | void;
  /** Host: end game (live->completed; before live->delete). */
  onEndHostedGame?: (game: GameRow) => Promise<void> | void;
  /** Called when user clicks Messages in the event popup. */
  onOpenMessagesForGame?: (game: GameRow) => void;
  /** Set of game ids the current user has joined (to show "Joined" in popup). */
  joinedGameIds?: Set<string>;
  /** Set of game ids where the current user is the host (to show "You're hosting"). */
  hostGameIds?: Set<string>;
  /** Set of game ids where the current user is on the waitlist as a substitute. */
  substituteGameIds?: Set<string>;
  nearbyProfiles?: ProfileNearbyRow[];
  /** Your rating out of 5 (shown under your 2D map avatar). */
  userSportsmanship?: number | null;
  currentUserId?: string | null;
  /** (lat, lng, viewportPoint) when user double-taps the map */
  onMapDoubleClick?: (lat: number, lng: number, viewportPoint?: { x: number; y: number }) => void;
  /** Open Create Game from selected venue popup. */
  onCreateGameAtVenue?: (venue: VenueSelection, viewportPoint?: { x: number; y: number }) => void;
  /** When this value changes, map flies to user location. */
  centerOnUserTrigger?: number;
  /** True while OpenStreetMap (Overpass) venue fetch is in progress. */
  onVenuesFetchLoadingChange?: (loading: boolean) => void;
  /** Incremented every minute so game pin labels refresh (countdown / expiry). */
  mapMinuteEpoch?: number;
  /** When true, skip starting venue Overpass/DB fetches (e.g. messenger open) so chat APIs get bandwidth. */
  pauseVenueFetch?: boolean;
  /** Optional basemap style override (e.g. satellite). */
  mapStyleUrl?: string | null;
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
    onStartHostedGame,
    onEndHostedGame,
    onOpenMessagesForGame,
    joinedGameIds,
    nearbyProfiles = [],
    userSportsmanship = null,
    onMapDoubleClick,
    onCreateGameAtVenue,
    centerOnUserTrigger,
    onVenuesFetchLoadingChange,
    mapMinuteEpoch = 0,
    pauseVenueFetch = false,
    mapStyleUrl = null,
  } = props;
  const navigate = useNavigate();
  const currentUserId = props.currentUserId ?? null;
  const joinedSet = joinedGameIds ?? new Set<string>();
  const hostSet = props.hostGameIds ?? new Set<string>();
  const substituteSet = props.substituteGameIds ?? new Set<string>();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const playerMarkersRef = useRef<import("mapbox-gl").Marker[]>([]);
  const playerMarkerEntriesRef = useRef<{ marker: import("mapbox-gl").Marker; scaleEl: HTMLDivElement }[]>([]);
  /** HTML markers for multiple games at the same coordinates (cluster pin). */
  const colocatedMarkerEntriesRef = useRef<{ marker: import("mapbox-gl").Marker; root: ReactRoot; scaleEl: HTMLDivElement }[]>([]);
  const randomGameMarkerEntriesRef = useRef<{ marker: import("mapbox-gl").Marker; root: ReactRoot; scaleEl: HTMLDivElement }[]>([]);
  const userMarker2dRef = useRef<import("mapbox-gl").Marker | null>(null);
  const userMarker2dScaleElRef = useRef<HTMLDivElement | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [eventPopup, setEventPopup] = useState<{ game: GameRow; point: { x: number; y: number } } | null>(null);
  const [venuePopupPoint, setVenuePopupPoint] = useState<{ x: number; y: number } | null>(null);
  const [bumpGameId, setBumpGameId] = useState<string | null>(null);
  const [colocatedModalGames, setColocatedModalGames] = useState<GameRow[] | null>(null);
  const isMobile = useIsMobile();
  const venueInteractionTsRef = useRef(0);
  const gameInteractionTsRef = useRef(0);
  const lastHandledGamePopupNonceRef = useRef<number | null>(null);
  const initialUserFlyDoneRef = useRef(false);
  const gameLayersInitedRef = useRef(false);
  const gamesRef = useRef(games);
  const onSelectGameRef = useRef(onSelectGame);
  const onJoinGameRef = useRef(onJoinGame);
  const selectedGameIdRef = useRef(selectedGameId);
  const [mapUxHint, setMapUxHint] = useState<string | null>(null);
  /** Bumps when venue GL layers are first created so hover/selection paint expressions apply. */
  const [venueLayerEpoch, setVenueLayerEpoch] = useState(0);
  const activeStyleUrl = (mapStyleUrl ?? "").trim() || MAP_STYLE_URL;
  const lastAppliedStyleUrlRef = useRef(activeStyleUrl);
  const venuesFetchCenter = venuesCenter ?? userCoords;
  /** Debounced anchor so rapid search / map moves don’t spam Overpass + Supabase. */
  const [debouncedVenueFetchCenter, setDebouncedVenueFetchCenter] = useState(venuesFetchCenter);
  useEffect(() => {
    if (!venuesFetchCenter) {
      setDebouncedVenueFetchCenter(null);
      return;
    }
    const tid = window.setTimeout(() => setDebouncedVenueFetchCenter(venuesFetchCenter), 420);
    return () => clearTimeout(tid);
  }, [venuesFetchCenter?.lat, venuesFetchCenter?.lng]);
  const venueClustersRef = useRef<VenueClusterPoint[]>([]);
  /** Caches the last fully-fetched (unfiltered) venue GeoJSON for instant re-renders on sport-filter changes. */
  const lastRawVenueGeoJsonRef = useRef<SportsVenueGeoJSON | null>(null);
  const lastVenueDataKeyRef = useRef<string | null>(null);
  const onVenuesFetchLoadingChangeRef = useRef(onVenuesFetchLoadingChange);
  onVenuesFetchLoadingChangeRef.current = onVenuesFetchLoadingChange;

  gamesRef.current = games;
  onSelectGameRef.current = onSelectGame;
  onJoinGameRef.current = onJoinGame;
  selectedGameIdRef.current = selectedGameId;
  const selectedVenuePulseRef = useRef(selectedVenue);
  selectedVenuePulseRef.current = selectedVenue;
  const bumpGameIdRef = useRef(bumpGameId);
  bumpGameIdRef.current = bumpGameId;
  /** GL game icon hover: smooth zoom-out (icon-size has no layout transition in Mapbox). */
  const gameIconHoverIdRef = useRef<string | null>(null);
  const gameIconHoverTRef = useRef(0);
  const gameIconHoverTargetRef = useRef(0);
  /** Smooth click pulse (replaces instant 1.08 bump). */
  const bumpAnimationRef = useRef<{ gameId: string; startMs: number } | null>(null);
  /** performance.now() for dt-based exponential smoothing (frame-rate independent). */
  const gameIconHoverLastTsRef = useRef<number | null>(null);
  /** Venue dot hover: rAF-driven smooth zoom-out (feature-state changes don't trigger GL transitions). */
  const venueHoverIdRef = useRef<string | null>(null);
  const venueHoverTRef = useRef(0);
  const venueHoverTargetRef = useRef(0);
  /** Phase-integrated pulse + smoothed hz (idle ↔ slow when venue selected) */
  const venuePulsePhaseRef = useRef(0);
  const venuePulseHzRef = useRef(MapCfg.VENUE_DOT_PULSE_HZ_IDLE);
  const venuePulseLastTRef = useRef<number | null>(null);

  // Smooth tap pulse on the game sport icon when opening the join modal (see GAME_ICON_BUMP_DURATION_MS).
  const bumpGameIcon = (gameId: string) => {
    bumpAnimationRef.current = { gameId, startMs: performance.now() };
    setBumpGameId(gameId);
    bumpGameIdRef.current = gameId;
  };

  const selectedVenueIdRef = useRef<string | null>(null);
  selectedVenueIdRef.current = selectedVenue?.id ?? null;

  /** 0–1 easing with flat derivatives at endpoints (smooth hover zoom in/out). */
  const smootherstep = (t: number) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * x * (x * (x * 6 - 15) + 10);
  };

  /** Individual game sport icons: bump pulse / selection / hover + icon-rotate (must stay in one update so Mapbox doesn’t drop rotation). */
  const applyGameIconLayout = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getLayer(L_GAME_ICON)) return;
    const sid = selectedGameIdRef.current ?? "";
    const hid = gameIconHoverIdRef.current;
    const z = map.getZoom?.() ?? 13;
    const zoomScale = (() => {
      // Screen-space "3D" feel: bigger when zoomed in, smaller when zoomed out.
      // Tuned so it doesn't explode at street-level zoom.
      const z0 = 10.5;
      const z1 = 16.5;
      const t = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
      return 0.78 + (1.28 - 0.78) * t;
    })();
    const base = MapCfg.GAME_ICON_LAYOUT_BASE * zoomScale;
    const bumpLow = base * MapCfg.GAME_ICON_GL_CLICK_DIP_MULT;

    let bumpAnimId: string | null = null;
    let bumpPulse = 0;
    const anim = bumpAnimationRef.current;
    if (anim) {
      const elapsed = performance.now() - anim.startMs;
      const dur = MapCfg.GAME_ICON_BUMP_DURATION_MS;
      if (elapsed >= dur) {
        bumpAnimationRef.current = null;
        setBumpGameId(null);
        bumpPulse = 0;
      } else {
        bumpPulse = MapCfg.glIconClickBumpPulse(elapsed, dur);
        bumpAnimId = anim.gameId;
      }
    }

    /** Zoom out (smaller icon-size) at peak pulse, then return — matches HTML `htmlPinPressScale`. */
    const bumpSize = base - (base - bumpLow) * bumpPulse;
    const hoverTarget = base * MapCfg.GAME_ICON_HOVER_MULT;
    const ht = smootherstep(gameIconHoverTRef.current);
    const hoverSize = hid ? base + (hoverTarget - base) * ht : base;

    const glowW = bumpPulse * 3;
    const glowBlur = bumpPulse * 1;

    const sizeCase: unknown[] = ["case"];
    if (bumpAnimId) {
      sizeCase.push(["==", ["get", "id"], bumpAnimId], bumpSize);
    }
    sizeCase.push(
      ["==", ["get", "id"], sid],
      MapCfg.GAME_ICON_LAYOUT_SELECTED,
      ["==", ["get", "id"], hid ?? ""],
      hoverSize,
      base
    );
    map.setLayoutProperty(L_GAME_ICON, "icon-size", sizeCase as import("mapbox-gl").PropertyValueSpecification<number>);

    const haloColorCase: unknown[] = ["case"];
    if (bumpAnimId && bumpPulse > 0.02) {
      haloColorCase.push(["==", ["get", "id"], bumpAnimId], "rgba(251, 191, 36, 0.72)");
    }
    haloColorCase.push(["==", ["get", "id"], sid], "rgba(251, 191, 36, 0.55)", "rgba(0, 0, 0, 0)");
    map.setPaintProperty(L_GAME_ICON, "icon-halo-color", haloColorCase as import("mapbox-gl").PropertyValueSpecification<string>);

    const haloWCase: unknown[] = ["case"];
    if (bumpAnimId && bumpPulse > 0.02) {
      haloWCase.push(["==", ["get", "id"], bumpAnimId], glowW);
    }
    haloWCase.push(["==", ["get", "id"], sid], 2, 0);
    map.setPaintProperty(L_GAME_ICON, "icon-halo-width", haloWCase as import("mapbox-gl").PropertyValueSpecification<number>);

    const haloBlurCase: unknown[] = ["case"];
    if (bumpAnimId && bumpPulse > 0.02) {
      haloBlurCase.push(["==", ["get", "id"], bumpAnimId], glowBlur);
    }
    haloBlurCase.push(["==", ["get", "id"], sid], 0.8, 0);
    map.setPaintProperty(L_GAME_ICON, "icon-halo-blur", haloBlurCase as import("mapbox-gl").PropertyValueSpecification<number>);

    // De-emphasize non-selected games when a game or venue is selected.
    const hasSelection = Boolean(sid) || Boolean(selectedVenueIdRef.current);
    try {
      map.setPaintProperty(L_GAME_ICON, "icon-opacity", [
        "case",
        ["==", ["get", "id"], sid],
        1,
        hasSelection ? 0.55 : 0.92,
      ]);
    } catch (_) {}
    try {
      map.setPaintProperty(L_GAME_COUNT, "text-opacity", [
        "case",
        ["==", ["get", "id"], sid],
        1,
        hasSelection ? 0.6 : 0.92,
      ]);
    } catch (_) {}

    const tNow = performance.now();
    const rotAmp = MapCfg.GAME_ICON_ROTATE_AMPLITUDE_DEG;
    const rotPeriod = MapCfg.GAME_ICON_ROTATE_PERIOD_MS;
    const iconRotate = Math.sin((tNow / rotPeriod) * Math.PI * 2) * rotAmp;
    try {
      map.setLayoutProperty(L_GAME_ICON, "icon-rotate", iconRotate);
    } catch (_) {}
  }, [setBumpGameId]);

  // —— Map init: sports-first dark basemap, terrain, fog ———
  useEffect(() => {
    setMapError(null);
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    if (mapRef.current) return;

    let cancelled = false;

    loadMapboxGl().then((mapboxgl) => {
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
          style: activeStyleUrl,
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
      lastAppliedStyleUrlRef.current = activeStyleUrl;

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
  }, [MAPBOX_TOKEN, activeStyleUrl, enable3D, userCoords]);

  // —— Basemap style toggle (satellite, etc.) ———
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !MAPBOX_TOKEN) return;
    const prev = lastAppliedStyleUrlRef.current;
    const next = activeStyleUrl;
    if (!next || next === prev) return;

    lastAppliedStyleUrlRef.current = next;
    gameLayersInitedRef.current = false;
    venueClustersRef.current = [];
    setMapLoaded(false);

    let cancelled = false;
    const onStyleLoad = () => {
      if (cancelled) return;
      // After setStyle, custom sources/layers are removed; our effects will re-add them.
      setMapLoaded(true);
    };

    try {
      map.once("style.load", onStyleLoad);
      map.setStyle(next);
    } catch (_) {
      setMapLoaded(true);
    }

    return () => {
      cancelled = true;
      try {
        map.off("style.load", onStyleLoad);
      } catch (_) {}
    };
  }, [MAPBOX_TOKEN, activeStyleUrl]);

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

    loadMapboxGl().then((mapboxgl) => {
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

  /** Map pixel → viewport for `position: fixed` venue card (layout after ref is attached). */
  const [venueAnchorClient, setVenueAnchorClient] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (!venuePopupPoint || !containerRef.current) {
      setVenueAnchorClient(null);
      return;
    }
    const r = containerRef.current.getBoundingClientRect();
    setVenueAnchorClient({ x: r.left + venuePopupPoint.x, y: r.top + venuePopupPoint.y });
  }, [venuePopupPoint]);

  // —— Venue selection: center map on venue (offset so popup fits above), then project anchor ——
  useEffect(() => {
    const map = mapRef.current;
    if (!mapLoaded || !map) return;

    if (!selectedVenue) {
      setVenuePopupPoint(null);
      return;
    }

    const { lng, lat } = selectedVenue.center;
    setVenuePopupPoint(null);

    const onMoveEnd = () => {
      setVenuePopupPoint(map.project([lng, lat]));
    };

    map.easeTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 16),
      pitch: enable3D ? 50 : 0,
      bearing: map.getBearing(),
      offset: [0, 120],
      duration: 480,
    });
    map.once("moveend", onMoveEnd);

    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [mapLoaded, selectedVenue?.id, selectedVenue?.center.lng, selectedVenue?.center.lat, enable3D]);

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
    setColocatedModalGames(null);

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
        ["boolean", ["feature-state", "hover"], false],
        MapCfg.VENUE_FILL_OPACITY_HOVER,
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

    // Venue center dot + footprint emphasis (pulse halo is a separate layer)
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
        ["boolean", ["feature-state", "hover"], false],
        0.5,
        0.55,
      ]);
    }
  }, [mapLoaded, selectedVenue, venueLayerEpoch]);

  /** Dark bluish-purple halos: constant pulse; hz eases down when a venue is selected. */
  useEffect(() => {
    if (!mapLoaded) return;
    let cancelled = false;
    let rafId = 0;
    venuePulseLastTRef.current = null;

    const tick = () => {
      if (cancelled) return;
      const map = mapRef.current;
      const now = performance.now() / 1000;
      if (venuePulseLastTRef.current == null) venuePulseLastTRef.current = now;
      const dt = Math.min(0.05, Math.max(0, now - venuePulseLastTRef.current));
      venuePulseLastTRef.current = now;

      const targetHz = selectedVenuePulseRef.current
        ? MapCfg.VENUE_DOT_PULSE_HZ_SELECTED
        : MapCfg.VENUE_DOT_PULSE_HZ_IDLE;
      const sk = MapCfg.VENUE_DOT_PULSE_HZ_SMOOTHING;
      venuePulseHzRef.current += (targetHz - venuePulseHzRef.current) * Math.min(1, dt * sk);

      venuePulsePhaseRef.current += dt * venuePulseHzRef.current * Math.PI * 2;
      const ph = venuePulsePhaseRef.current;

      /** Primary grow/shrink: full sine sweep 0→1 (halos expand and contract each cycle) */
      const sizeOuter = (Math.sin(ph) + 1) * 0.5;
      const sizeInner =
        (Math.sin(ph + MapCfg.VENUE_PULSE_INNER_PHASE_LAG_RAD) + 1) * 0.5;

      const gradOuter = (Math.sin(ph) + 1) * 0.5;
      const gradInner = (Math.sin(ph + Math.PI / 2) + 1) * 0.5;
      const rgbOuter = lerpPulseRgb(
        MapCfg.VENUE_PULSE_OUTER_RGB_A,
        MapCfg.VENUE_PULSE_OUTER_RGB_B,
        gradOuter
      );
      const rgbInner = lerpPulseRgb(
        MapCfg.VENUE_PULSE_INNER_RGB_A,
        MapCfg.VENUE_PULSE_INNER_RGB_B,
        gradInner
      );

      const rOuter =
        MapCfg.VENUE_DOT_PULSE_RADIUS_MIN_PX +
        sizeOuter * (MapCfg.VENUE_DOT_PULSE_RADIUS_MAX_PX - MapCfg.VENUE_DOT_PULSE_RADIUS_MIN_PX);
      const opOuter =
        MapCfg.VENUE_DOT_PULSE_OPACITY_MIN +
        sizeOuter * (MapCfg.VENUE_DOT_PULSE_OPACITY_MAX - MapCfg.VENUE_DOT_PULSE_OPACITY_MIN);
      const blOuter =
        MapCfg.VENUE_DOT_PULSE_BLUR_MIN +
        sizeOuter * (MapCfg.VENUE_DOT_PULSE_BLUR_MAX - MapCfg.VENUE_DOT_PULSE_BLUR_MIN);

      const rInner =
        MapCfg.VENUE_DOT_PULSE_INNER_RADIUS_MIN_PX +
        sizeInner * (MapCfg.VENUE_DOT_PULSE_INNER_RADIUS_MAX_PX - MapCfg.VENUE_DOT_PULSE_INNER_RADIUS_MIN_PX);
      const opInner =
        MapCfg.VENUE_DOT_PULSE_OPACITY_MIN +
        sizeInner * (MapCfg.VENUE_DOT_PULSE_INNER_OPACITY_MAX - MapCfg.VENUE_DOT_PULSE_OPACITY_MIN);
      const blInner =
        MapCfg.VENUE_DOT_PULSE_INNER_BLUR_MIN +
        sizeInner * (MapCfg.VENUE_DOT_PULSE_INNER_BLUR_MAX - MapCfg.VENUE_DOT_PULSE_INNER_BLUR_MIN);

      const colOuter = `rgb(${rgbOuter.r},${rgbOuter.g},${rgbOuter.b})`;
      const colInner = `rgb(${rgbInner.r},${rgbInner.g},${rgbInner.b})`;

      const strokeW =
        MapCfg.VENUE_DOT_PULSE_STROKE_WIDTH_MIN_PX +
        sizeOuter *
          (MapCfg.VENUE_DOT_PULSE_STROKE_WIDTH_MAX_PX - MapCfg.VENUE_DOT_PULSE_STROKE_WIDTH_MIN_PX);
      const rgbStroke = lerpPulseRgb(
        MapCfg.VENUE_PULSE_STROKE_RGB_DARK,
        MapCfg.VENUE_PULSE_STROKE_RGB_LIGHT,
        sizeOuter
      );
      const colStroke = `rgb(${rgbStroke.r},${rgbStroke.g},${rgbStroke.b})`;

      if (map?.getLayer(L_VENUE_DOTS_PULSE)) {
        const vis = map.getLayoutProperty(L_VENUE_DOTS_PULSE, "visibility");
        if (vis !== "none") {
          try {
            map.setPaintProperty(L_VENUE_DOTS_PULSE, "circle-radius", rOuter);
            map.setPaintProperty(L_VENUE_DOTS_PULSE, "circle-opacity", opOuter);
            map.setPaintProperty(L_VENUE_DOTS_PULSE, "circle-blur", blOuter);
            map.setPaintProperty(L_VENUE_DOTS_PULSE, "circle-color", colOuter);
            map.setPaintProperty(L_VENUE_DOTS_PULSE, "circle-stroke-width", strokeW);
            map.setPaintProperty(L_VENUE_DOTS_PULSE, "circle-stroke-color", colStroke);
          } catch (_) {}
        }
      }
      if (map?.getLayer(L_VENUE_DOTS_PULSE_INNER)) {
        const vis = map.getLayoutProperty(L_VENUE_DOTS_PULSE_INNER, "visibility");
        if (vis !== "none") {
          try {
            map.setPaintProperty(L_VENUE_DOTS_PULSE_INNER, "circle-radius", rInner);
            map.setPaintProperty(L_VENUE_DOTS_PULSE_INNER, "circle-opacity", opInner);
            map.setPaintProperty(L_VENUE_DOTS_PULSE_INNER, "circle-blur", blInner);
            map.setPaintProperty(L_VENUE_DOTS_PULSE_INNER, "circle-color", colInner);
          } catch (_) {}
        }
      }

      // Venue dot hover: smooth zoom-out via exponential decay (feature-state snaps; rAF animates).
      {
        const target = venueHoverTargetRef.current;
        const current = venueHoverTRef.current;
        const newT = current + (target - current) * Math.min(1, dt * 10);
        venueHoverTRef.current = Math.abs(target - newT) < 0.002 ? target : newT;
        if (venueHoverTargetRef.current === 0 && venueHoverTRef.current === 0) {
          venueHoverIdRef.current = null;
        }
        const hid = venueHoverIdRef.current ?? "";
        if (hid && map?.getLayer(L_VENUE_DOTS)) {
          const x = venueHoverTRef.current;
          const ease = x * x * (3 - 2 * x); // smoothstep
          const normalR = MapCfg.VENUE_DOT_RADIUS_PX;
          const hoverR = normalR * MapCfg.VENUE_DOT_HOVER_SCALE;
          const selR = MapCfg.VENUE_DOT_RADIUS_SELECTED_PX;
          const interpR = normalR + (hoverR - normalR) * ease;
          const sel = selectedVenuePulseRef.current?.id ?? "";
          try {
            map.setPaintProperty(L_VENUE_DOTS, "circle-radius", [
              "case",
              ["==", ["get", "id"], sel], selR,
              ["==", ["get", "id"], hid], interpR,
              normalR,
            ]);
          } catch (_) {}
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [mapLoaded]);

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
    if (map.getLayer(L_VENUE_DOTS_PULSE)) {
      map.setLayoutProperty(L_VENUE_DOTS_PULSE, "visibility", showVenueDot ? "visible" : "none");
    }
    if (map.getLayer(L_VENUE_DOTS_PULSE_INNER)) {
      map.setLayoutProperty(L_VENUE_DOTS_PULSE_INNER, "visibility", showVenueDot ? "visible" : "none");
    }
    if (map.getLayer(L_VENUE_DOTS)) {
      map.setLayoutProperty(L_VENUE_DOTS, "visibility", showVenueDot ? "visible" : "none");
    }

    playerMarkersRef.current.forEach((m) => {
      const el = m.getElement();
      if (el) el.style.visibility = showPlayers ? "visible" : "hidden";
    });

    colocatedMarkerEntriesRef.current.forEach(({ marker }) => {
      const el = marker.getElement();
      if (el) el.style.visibility = showIndividuals ? "visible" : "hidden";
    });

    randomGameMarkerEntriesRef.current.forEach(({ marker }) => {
      const el = marker.getElement();
      if (el) el.style.visibility = showIndividuals ? "visible" : "hidden";
    });

    const g = gamesRef.current;
    setMapUxHint(
      g.length > 0 && !showClusters && !showIndividuals && zoom < MapCfg.GAME_INDIVIDUAL_MIN_ZOOM
        ? "Zoom in to explore games nearby"
        : null
    );
  }, []);

  /** Zoom-based scaling for DOM markers (HTML pins + avatar + nearby players). */
  const applyDomMarkerScale = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom?.() ?? 13;
    const z0 = 10.5;
    const z1 = 16.5;
    const t = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
    const s = 0.78 + (1.28 - 0.78) * t;

    for (const ent of colocatedMarkerEntriesRef.current) {
      ent.scaleEl.style.transform = `scale(${s})`;
      ent.scaleEl.style.transformOrigin = "center";
    }
    for (const ent of randomGameMarkerEntriesRef.current) {
      ent.scaleEl.style.transform = `scale(${s})`;
      ent.scaleEl.style.transformOrigin = "center";
    }
    for (const ent of playerMarkerEntriesRef.current) {
      ent.scaleEl.style.transform = `scale(${s})`;
      ent.scaleEl.style.transformOrigin = "center";
    }
    const userScaleEl = userMarker2dScaleElRef.current;
    if (userScaleEl) {
      userScaleEl.style.transform = `scale(${s})`;
      userScaleEl.style.transformOrigin = "center";
    }
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
        "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 50, 30],
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
      filter: [
        "all",
        ["!", ["has", "point_count"]],
        ["!=", ["coalesce", ["get", "marker_kind"], ""], "colocated"],
      ],
      layout: {
        "icon-image": ["coalesce", ["get", "sport_map_icon"], getGameMapboxIconId("other")],
        "icon-size": MapCfg.GAME_ICON_LAYOUT_BASE,
        "icon-rotate": 0,
        "icon-rotation-alignment": "viewport",
        "icon-pitch-alignment": "viewport",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {},
    });

    map.addLayer({
      id: L_GAME_COUNT,
      type: "symbol",
      source: L_GAME_SOURCE,
      filter: [
        "all",
        ["!", ["has", "point_count"]],
        ["!=", ["coalesce", ["get", "marker_kind"], ""], "colocated"],
      ],
      layout: {
        "text-field": ["concat", ["to-string", ["get", "players_filled"]], "/", ["to-string", ["get", "players_total"]]],
        "text-size": 11,
        "text-line-height": 1.05,
        "text-offset": [0, 1.55],
        "text-anchor": "top",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
      },
      paint: {
        "text-color": "#e2e8f0",
        "text-halo-color": "rgba(2,6,23,0.92)",
        "text-halo-width": 1.35,
        "text-halo-blur": 0.35,
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

    map.on("mouseenter", L_GAME_CLUSTERS, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", L_GAME_CLUSTERS, () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("mouseenter", L_GAME_ICON, (e) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      const gid = f?.properties?.id as string | undefined;
      if (!gid) return;
      if (gameIconHoverIdRef.current !== gid) {
        gameIconHoverIdRef.current = gid;
        gameIconHoverTRef.current = 0;
      }
      gameIconHoverTargetRef.current = 1;
    });
    map.on("mouseleave", L_GAME_ICON, () => {
      map.getCanvas().style.cursor = "";
      gameIconHoverTargetRef.current = 0;
    });

    let visRaf = 0;
    const scheduleVis = () => {
      if (visRaf) cancelAnimationFrame(visRaf);
      visRaf = requestAnimationFrame(() => {
        visRaf = 0;
        applyMapLayerVisibility();
        applyDomMarkerScale();
      });
    };

    map.on("move", scheduleVis);
    map.on("zoom", scheduleVis);
    map.on("moveend", applyMapLayerVisibility);
    map.on("zoomend", applyMapLayerVisibility);

    applyMapLayerVisibility();
    applyDomMarkerScale();

    return () => {
      map.off("move", scheduleVis);
      map.off("zoom", scheduleVis);
      map.off("moveend", applyMapLayerVisibility);
      map.off("zoomend", applyMapLayerVisibility);
      gameIconHoverIdRef.current = null;
      gameIconHoverTRef.current = 0;
      gameIconHoverTargetRef.current = 0;
      gameIconHoverLastTsRef.current = null;
    };
  }, [mapLoaded, applyMapLayerVisibility, applyDomMarkerScale, applyGameIconLayout]);

  /** Push game GeoJSON into clustered source (capped by viewport for performance). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(L_GAME_SOURCE) as import("mapbox-gl").GeoJSONSource | undefined;
    if (!src) return;

    const capped = limitGamesForMapViewport(games, map, MapCfg.MAX_VISIBLE_INDIVIDUAL_GAMES);
    src.setData(gamesToGeoJSON(capped, selectedGameId));
    applyMapLayerVisibility();
  }, [mapLoaded, games, selectedGameId, mapMinuteEpoch, applyMapLayerVisibility]);

  /** Same-coordinate games: single HTML cluster pin (avoids overlapping GL sport icons). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const capped = limitGamesForMapViewport(games, map, MapCfg.MAX_VISIBLE_INDIVIDUAL_GAMES);
    const { groups } = splitColocatedGames(capped);

    let cancelled = false;
    if (groups.length > 0) {
      loadMapboxGl().then((mapboxgl) => {
        if (cancelled || mapRef.current !== map) return;
        const Marker = mapboxgl.default.Marker;
        const next: { marker: import("mapbox-gl").Marker; root: ReactRoot; scaleEl: HTMLDivElement }[] = [];

        for (const group of groups) {
          const outer = document.createElement("div");
          outer.style.pointerEvents = "auto";
          const scaleEl = document.createElement("div");
          scaleEl.style.willChange = "transform";
          outer.appendChild(scaleEl);
          const root = createRoot(scaleEl);
          const g0 = group[0]!;
          root.render(
            <ColocatedGamesPin
              games={group}
              selectedGameId={selectedGameId}
              bumpGameId={bumpGameId}
              onPress={() => {
                gameInteractionTsRef.current = Date.now();
                setColocatedModalGames(group);
              }}
            />
          );
          const marker = new Marker({ element: outer, anchor: "center" })
            .setLngLat([g0.lng, g0.lat])
            .addTo(map);
          next.push({ marker, root, scaleEl });
        }
        colocatedMarkerEntriesRef.current = next;
        applyMapLayerVisibility();
        applyDomMarkerScale();
      });
    } else {
      applyMapLayerVisibility();
      applyDomMarkerScale();
    }

    return () => {
      cancelled = true;
      const snapshot = [...colocatedMarkerEntriesRef.current];
      colocatedMarkerEntriesRef.current = [];
      for (const { marker } of snapshot) {
        try {
          marker.remove();
        } catch (_) {}
      }
      const roots = snapshot.map((s) => s.root);
      window.setTimeout(() => {
        for (const root of roots) {
          try {
            root.unmount();
          } catch (_) {}
        }
      }, 0);
    };
  }, [mapLoaded, games, selectedGameId, bumpGameId, mapMinuteEpoch, applyMapLayerVisibility]);

  /** Map-tap games (no venue label): HTML pin with dd/hh/mm/ss pill — not drawn on GL symbol layer. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const capped = limitGamesForMapViewport(games, map, MapCfg.MAX_VISIBLE_INDIVIDUAL_GAMES);
    const { singles } = splitColocatedGames(capped);
    const randomSingles = singles.filter((g) => !isVenueGame(g));

    let cancelled = false;
    if (randomSingles.length > 0) {
      loadMapboxGl().then((mapboxgl) => {
        if (cancelled || mapRef.current !== map) return;
        const Marker = mapboxgl.default.Marker;
        const next: { marker: import("mapbox-gl").Marker; root: ReactRoot; scaleEl: HTMLDivElement }[] = [];

        for (const game of randomSingles) {
          const outer = document.createElement("div");
          outer.style.pointerEvents = "auto";
          const scaleEl = document.createElement("div");
          scaleEl.style.willChange = "transform";
          outer.appendChild(scaleEl);
          const root = createRoot(scaleEl);
          root.render(
            <RandomLocationGamePin
              game={game}
              selectedGameId={selectedGameId}
              bumpGameId={bumpGameId}
              onPress={() => {
                gameInteractionTsRef.current = Date.now();
                onSelectGameRef.current(game);
                bumpGameIcon(game.id);
                const p = map.project([game.lng, game.lat]);
                setEventPopup({ game, point: { x: p.x, y: p.y } });
              }}
            />
          );
          const marker = new Marker({ element: outer, anchor: "center" })
            .setLngLat([game.lng, game.lat])
            .addTo(map);
          next.push({ marker, root, scaleEl });
        }
        randomGameMarkerEntriesRef.current = next;
        applyMapLayerVisibility();
        applyDomMarkerScale();
      });
    } else {
      applyMapLayerVisibility();
      applyDomMarkerScale();
    }

    return () => {
      cancelled = true;
      const snapshot = [...randomGameMarkerEntriesRef.current];
      randomGameMarkerEntriesRef.current = [];
      for (const { marker } of snapshot) {
        try {
          marker.remove();
        } catch (_) {}
      }
      const roots = snapshot.map((s) => s.root);
      window.setTimeout(() => {
        for (const root of roots) {
          try {
            root.unmount();
          } catch (_) {}
        }
      }, 0);
    };
  }, [mapLoaded, games, selectedGameId, bumpGameId, mapMinuteEpoch, applyMapLayerVisibility]);

  /** Selected / bump / hover: game sport icon layout + halo. */
  useEffect(() => {
    if (!mapLoaded) return;
    applyGameIconLayout();
  }, [mapLoaded, selectedGameId, bumpGameId, applyGameIconLayout]);

  /**
   * Single rAF loop: hover smoothing + applyGameIconLayout (icon-size, halo, icon-rotate).
   * Keeps rotation in sync with layout updates so Mapbox doesn’t drop icon-rotate.
   */
  useEffect(() => {
    if (!mapLoaded) return;
    let cancelled = false;
    let raf = 0;
    const tick = (now: number) => {
      if (cancelled) return;
      const m = mapRef.current;
      if (!m?.getLayer(L_GAME_ICON)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      try {
        if (m.getLayoutProperty(L_GAME_ICON, "visibility") === "none") {
          raf = requestAnimationFrame(tick);
          return;
        }
      } catch (_) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const last = gameIconHoverLastTsRef.current;
      const dt = last == null ? 16 : Math.min(48, Math.max(0, now - last));
      gameIconHoverLastTsRef.current = now;

      const target = gameIconHoverTargetRef.current;
      const ht = gameIconHoverTRef.current;
      const tau = MapCfg.GAME_ICON_HOVER_TAU_MS;
      const alpha = 1 - Math.exp(-dt / tau);
      gameIconHoverTRef.current = ht + (target - ht) * alpha;
      if (Math.abs(target - gameIconHoverTRef.current) < 0.0012) {
        gameIconHoverTRef.current = target;
        if (target === 0) gameIconHoverIdRef.current = null;
      }

      applyGameIconLayout();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      gameIconHoverLastTsRef.current = null;
    };
  }, [mapLoaded, applyGameIconLayout]);

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
        setColocatedModalGames(null);
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
      setColocatedModalGames(null);
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
      if (Date.now() - venueInteractionTsRef.current < 400) return;

      const container = map.getContainer();
      const rect = container.getBoundingClientRect();

      const tapLat = e.lngLat.lat;
      const tapLng = e.lngLat.lng;

      setEventPopup(null);
      setColocatedModalGames(null);
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

  /** 3D overlay only when we have a real GLB URL (Ready Player Me). Never treat 2D profile image URLs as GLB. */
  const use3DOverlay = enable3D && !!userCoords && !!avatarGlbUrl && !use2DAvatar;

  // —— 2D user marker when not using 3D overlay ———
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !userCoords) return;
    if (use3DOverlay) {
      userMarker2dRef.current?.remove();
      userMarker2dRef.current = null;
      const wrap = document.querySelector(".user-marker-wrap");
      if (wrap) wrap.closest(".mapboxgl-marker")?.remove();
      return;
    }

    const avatarUrl = userAvatarUrl || DEFAULT_AVATAR;
    const outer = document.createElement("div");
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

    const rating = typeof userSportsmanship === "number" ? Math.max(0, Math.min(5, userSportsmanship)) : null;
    if (rating != null) {
      const ratingWrap = document.createElement("div");
      ratingWrap.style.display = "flex";
      ratingWrap.style.gap = "1px";
      ratingWrap.style.marginTop = "4px";
      ratingWrap.style.justifyContent = "center";
      ratingWrap.style.filter = "drop-shadow(0 2px 6px rgba(0,0,0,0.5))";
      const full = Math.round(rating);
      for (let i = 0; i < 5; i++) {
        const s = document.createElement("span");
        s.textContent = i < full ? "★" : "☆";
        s.style.fontSize = "10px";
        s.style.lineHeight = "1";
        s.style.color = i < full ? "rgba(252, 211, 77, 0.95)" : "rgba(148, 163, 184, 0.8)";
        ratingWrap.appendChild(s);
      }
      ratingWrap.title = `${rating.toFixed(1).replace(/\\.0$/, "")} / 5`;
      wrap.appendChild(ratingWrap);
    }
    outer.appendChild(wrap);
    userMarker2dScaleElRef.current = wrap;

    let cancelled = false;
    loadMapboxGl().then((mapboxgl) => {
      if (cancelled) return;
      const m = mapRef.current;
      if (!m || use3DOverlay) return;
      userMarker2dRef.current?.remove();
      userMarker2dRef.current = new mapboxgl.default.Marker({ element: outer })
        .setLngLat([userCoords.lng, userCoords.lat])
        .addTo(m);
      applyDomMarkerScale();
    });
    return () => {
      cancelled = true;
      userMarker2dRef.current?.remove();
      userMarker2dRef.current = null;
      userMarker2dScaleElRef.current = null;
    };
  }, [mapLoaded, userCoords, userAvatarUrl, use3DOverlay, userSportsmanship, applyDomMarkerScale]);

  // —— Other players (DOM markers) ———
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    playerMarkersRef.current.forEach((m) => m.remove());
    playerMarkersRef.current = [];
    playerMarkerEntriesRef.current = [];

    // Exclude self — the dedicated self-avatar marker already shows the current user
    const others = [...nearbyProfiles].filter(
      (p) => Number.isFinite(p.lng) && Number.isFinite(p.lat) && p.profile_id !== currentUserId
    );

    loadMapboxGl().then((mapboxgl) => {
      others.forEach((profile) => {
        const outer = document.createElement("div");
        const scaleWrap = document.createElement("div");
        scaleWrap.style.display = "flex";
        scaleWrap.style.flexDirection = "column";
        scaleWrap.style.alignItems = "center";
        scaleWrap.style.gap = "3px";
        scaleWrap.style.cursor = "pointer";
        scaleWrap.style.willChange = "transform";

        const el = document.createElement("div");
        el.className = "player-marker";
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
        scaleWrap.title = profile.display_name || "Player";

        const status = typeof profile.status_body === "string" ? profile.status_body.trim() : "";
        if (status) {
          const pill = document.createElement("div");
          pill.textContent = status.length > 28 ? `${status.slice(0, 27)}…` : status;
          pill.style.maxWidth = "140px";
          pill.style.whiteSpace = "nowrap";
          pill.style.overflow = "hidden";
          pill.style.textOverflow = "ellipsis";
          pill.style.padding = "3px 8px";
          pill.style.borderRadius = "999px";
          pill.style.border = "1px solid rgba(255,255,255,0.12)";
          pill.style.background = "rgba(2,6,23,0.72)";
          pill.style.backdropFilter = "blur(10px)";
          pill.style.color = "rgba(226,232,240,0.95)";
          pill.style.fontSize = "11px";
          pill.style.fontWeight = "600";
          pill.style.filter = "drop-shadow(0 10px 18px rgba(0,0,0,0.4))";
          scaleWrap.appendChild(pill);
        }

        const rating = typeof profile.sportsmanship === "number" ? Math.max(0, Math.min(5, profile.sportsmanship)) : null;
        if (rating != null) {
          const ratingWrap = document.createElement("div");
          ratingWrap.style.display = "flex";
          ratingWrap.style.gap = "1px";
          ratingWrap.style.justifyContent = "center";
          ratingWrap.style.filter = "drop-shadow(0 2px 6px rgba(0,0,0,0.5))";
          const full = Math.round(rating);
          for (let i = 0; i < 5; i++) {
            const s = document.createElement("span");
            s.textContent = i < full ? "★" : "☆";
            s.style.fontSize = "9px";
            s.style.lineHeight = "1";
            s.style.color = i < full ? "rgba(252, 211, 77, 0.95)" : "rgba(148, 163, 184, 0.75)";
            ratingWrap.appendChild(s);
          }
          scaleWrap.appendChild(ratingWrap);
        }

        scaleWrap.appendChild(el);
        scaleWrap.addEventListener("click", (e) => {
          e.stopPropagation();
          navigate(`/athlete/${profile.profile_id}`);
        });
        outer.appendChild(scaleWrap);

        const marker = new mapboxgl.default.Marker({ element: outer })
          .setLngLat([profile.lng, profile.lat])
          .addTo(map);
        playerMarkersRef.current.push(marker);
        playerMarkerEntriesRef.current.push({ marker, scaleEl: scaleWrap });
      });
      applyMapLayerVisibility();
      applyDomMarkerScale();
    });

    return () => {
      playerMarkersRef.current.forEach((m) => m.remove());
      playerMarkersRef.current = [];
      playerMarkerEntriesRef.current = [];
    };
  }, [mapLoaded, nearbyProfiles, currentUserId, applyMapLayerVisibility, applyDomMarkerScale]);

  // —— Sports venues: subtle GL polygons + small center dots (no DOM flag markers) ———
  const venueSportSig = venueSportsFilter.slice().sort().join("|");
  // Data key: only location + radius — drives the network fetch.
  const venueFetchDataKey = debouncedVenueFetchCenter
    ? `${debouncedVenueFetchCenter.lat.toFixed(4)},${debouncedVenueFetchCenter.lng.toFixed(4)},${venueSearchRadiusKm}`
    : null;
  // Render key: includes sport sig — drives the effect to re-run on filter changes.
  const venueFetchKey = venueFetchDataKey ? `${venueFetchDataKey},${venueSportSig}` : null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !debouncedVenueFetchCenter || !venueFetchKey) {
      onVenuesFetchLoadingChangeRef.current?.(false);
      return;
    }
    if (pauseVenueFetch) {
      onVenuesFetchLoadingChangeRef.current?.(false);
      return;
    }

    const addVenueMarkers = (geojson: SportsVenueGeoJSON, onDone?: () => void) => {
      const mapInstance = mapRef.current;
      if (!mapInstance) {
        onDone?.();
        return;
      }

      const run = async () => {
        try {
        let clusterOut;
        try {
          clusterOut = await runVenueClusterAsync(geojson, venueSportsFilter);
        } catch {
          clusterOut = clusterVenuePoints(geojson, {
            venueSportsFilter,
            maxDistanceMeters: 80,
            venueAreaRadiusMeters: MapCfg.VENUE_AREA_RADIUS_METERS,
          });
        }

        venueClustersRef.current = clusterOut.clusters;
        const { areaCollection, dotCollection } = clusterOut;

        const sourceId = "venue-areas";
        const fillLayerId = "venue-areas-fill";
        const outlineLayerId = "venue-areas-outline";
        const beforeGames = mapInstance.getLayer(L_GAME_CLUSTERS) ? L_GAME_CLUSTERS : undefined;

        const selectVenueFromCluster = (cluster: VenueClusterPoint, _mapPoint: { x: number; y: number }) => {
          venueInteractionTsRef.current = Date.now();
          setEventPopup(null);
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
              id: L_VENUE_DOTS_PULSE,
              type: "circle",
              source: SRC_VENUE_DOTS,
              paint: {
                "circle-radius": MapCfg.VENUE_DOT_PULSE_RADIUS_MIN_PX,
                "circle-color": `rgb(${MapCfg.VENUE_PULSE_OUTER_RGB_A.r},${MapCfg.VENUE_PULSE_OUTER_RGB_A.g},${MapCfg.VENUE_PULSE_OUTER_RGB_A.b})`,
                "circle-opacity": MapCfg.VENUE_DOT_PULSE_OPACITY_MIN,
                "circle-blur": MapCfg.VENUE_DOT_PULSE_BLUR_MIN,
                "circle-stroke-width": MapCfg.VENUE_DOT_PULSE_STROKE_WIDTH_MIN_PX,
                "circle-stroke-color": `rgb(${MapCfg.VENUE_PULSE_STROKE_RGB_DARK.r},${MapCfg.VENUE_PULSE_STROKE_RGB_DARK.g},${MapCfg.VENUE_PULSE_STROKE_RGB_DARK.b})`,
                "circle-pitch-alignment": "map",
              },
            },
            beforeGames
          );

          mapInstance.addLayer(
            {
              id: L_VENUE_DOTS_PULSE_INNER,
              type: "circle",
              source: SRC_VENUE_DOTS,
              paint: {
                "circle-radius": MapCfg.VENUE_DOT_PULSE_INNER_RADIUS_MIN_PX,
                "circle-color": `rgb(${MapCfg.VENUE_PULSE_INNER_RGB_A.r},${MapCfg.VENUE_PULSE_INNER_RGB_A.g},${MapCfg.VENUE_PULSE_INNER_RGB_A.b})`,
                "circle-opacity": MapCfg.VENUE_DOT_PULSE_OPACITY_MIN,
                "circle-blur": MapCfg.VENUE_DOT_PULSE_INNER_BLUR_MIN,
                "circle-pitch-alignment": "map",
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
                "circle-opacity": 0.55,
                "circle-stroke-width": MapCfg.VENUE_DOT_STROKE_WIDTH,
                "circle-stroke-color": MapCfg.VENUE_DOT_STROKE,
              },
            },
            beforeGames
          );

          try {
            mapInstance.setPaintProperty(fillLayerId, "fill-opacity-transition", {
              duration: MapCfg.MAP_MARKER_HOVER_TRANSITION_MS,
              delay: 0,
            });
            // circle-radius is animated via rAF (feature-state changes bypass GL transitions)
            mapInstance.setPaintProperty(L_VENUE_DOTS, "circle-opacity-transition", {
              duration: MapCfg.MAP_MARKER_HOVER_TRANSITION_MS,
              delay: 0,
            });
          } catch (_) {}

          let venueHoverPointerId: string | null = null;
          let venueHoverLeaveTimer: ReturnType<typeof setTimeout> | null = null;

          const onVenueMarkerHoverEnter = (e: { features?: import("mapbox-gl").MapboxGeoJSONFeature[] }) => {
            const id = e.features?.[0]?.properties?.id as string | undefined;
            if (!id) return;
            if (venueHoverLeaveTimer != null) {
              clearTimeout(venueHoverLeaveTimer);
              venueHoverLeaveTimer = null;
            }
            if (venueHoverPointerId && venueHoverPointerId !== id) {
              try {
                mapInstance.setFeatureState({ source: sourceId, id: venueHoverPointerId }, { hover: false });
              } catch (_) {}
            }
            venueHoverPointerId = id;
            venueHoverIdRef.current = id;
            venueHoverTargetRef.current = 1;
            try {
              mapInstance.setFeatureState({ source: sourceId, id }, { hover: true });
            } catch (_) {}
          };

          const onVenueMarkerHoverLeave = () => {
            venueHoverLeaveTimer = setTimeout(() => {
              venueHoverLeaveTimer = null;
              if (!venueHoverPointerId) return;
              const hid = venueHoverPointerId;
              venueHoverPointerId = null;
              venueHoverTargetRef.current = 0;
              try {
                mapInstance.setFeatureState({ source: sourceId, id: hid }, { hover: false });
              } catch (_) {}
            }, MapCfg.VENUE_HOVER_LEAVE_DEBOUNCE_MS);
          };

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
            const cl = venueClustersRef.current.find((c) => c.properties.id === feature.properties.id);
            if (cl) selectVenueFromCluster(cl, e.point);
            else {
              venueInteractionTsRef.current = Date.now();
              setEventPopup(null);
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

          const onVenueDotClick = (e: {
            features?: import("mapbox-gl").MapboxGeoJSONFeature[];
            point: { x: number; y: number };
          }) => {
            const hitGames = mapInstance.queryRenderedFeatures(
              e.point as unknown as import("mapbox-gl").PointLike,
              {
                layers: [L_GAME_ICON, L_GAME_CLUSTERS],
              }
            );
            if (hitGames.length) return;

            const id = e.features?.[0]?.properties?.id as string | undefined;
            if (!id) return;
            const cl = venueClustersRef.current.find((c) => c.properties.id === id);
            if (cl) selectVenueFromCluster(cl, e.point);
          };

          mapInstance.on("click", L_VENUE_DOTS, onVenueDotClick);
          mapInstance.on("click", L_VENUE_DOTS_PULSE, onVenueDotClick);
          mapInstance.on("click", L_VENUE_DOTS_PULSE_INNER, onVenueDotClick);

          [fillLayerId, L_VENUE_DOTS_PULSE, L_VENUE_DOTS_PULSE_INNER, L_VENUE_DOTS].forEach((lid) => {
            mapInstance.on("mouseenter", lid, (e) => {
              mapInstance.getCanvas().style.cursor = "pointer";
              onVenueMarkerHoverEnter(e);
            });
            mapInstance.on("mouseleave", lid, () => {
              mapInstance.getCanvas().style.cursor = "";
              onVenueMarkerHoverLeave();
            });
          });

          setVenueLayerEpoch((n) => n + 1);
        }

        applyMapLayerVisibility();
        } catch (_) {
          /* ignore */
        } finally {
          onDone?.();
        }
      };

      void run();
    };

    let cancelled = false;
    let venueKickoffStarted = false;
    let idleFallbackId: number | undefined;
    const venueFetchAbort = new AbortController();

    const kickoffVenueFetch = () => {
      if (venueKickoffStarted || cancelled) return;
      venueKickoffStarted = true;
      if (idleFallbackId !== undefined) {
        clearTimeout(idleFallbackId);
        idleFallbackId = undefined;
      }
      map.off("idle", kickoffVenueFetch);

      onVenuesFetchLoadingChangeRef.current?.(true);
      const finishLoading = () => {
        const done = () => onVenuesFetchLoadingChangeRef.current?.(false);
        if (typeof requestAnimationFrame !== "undefined") {
          requestAnimationFrame(() => requestAnimationFrame(done));
        } else {
          window.setTimeout(done, 0);
        }
      };

      // Fast path: only the sport filter changed — re-cluster cached raw data, no network request.
      if (venueFetchDataKey && lastVenueDataKeyRef.current === venueFetchDataKey && lastRawVenueGeoJsonRef.current) {
        addVenueMarkers(lastRawVenueGeoJsonRef.current, () => {
          if (cancelled) return;
          finishLoading();
        });
        return;
      }

      // Slow path: location or radius changed — fetch all sports so the cache works for any filter.
      fetchSportsVenuesWithProgress(
        debouncedVenueFetchCenter.lat,
        debouncedVenueFetchCenter.lng,
        venueSearchRadiusKm,
        {
          signal: venueFetchAbort.signal,
          sportFilter: [], // fetch all sports; clustering applies the active filter client-side
          onNearRing: (geojson) =>
            new Promise<void>((resolve) => {
              if (cancelled) {
                resolve();
                return;
              }
              addVenueMarkers(geojson, () => {
                if (cancelled) {
                  resolve();
                  return;
                }
                finishLoading();
                resolve();
              });
            }),
        }
      )
        .then((geojson) => {
          if (cancelled) return;
          // Cache the full unfiltered result so sport-filter changes are instant.
          lastRawVenueGeoJsonRef.current = geojson;
          lastVenueDataKeyRef.current = venueFetchDataKey;
          addVenueMarkers(geojson, () => {
            if (cancelled) return;
            finishLoading();
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const name = err instanceof Error ? err.name : "";
          if (name === "AbortError") return;
          onVenuesFetchLoadingChangeRef.current?.(false);
        });
    };

    // For sport-filter-only changes, kick off immediately (cached data — no need to wait for idle).
    // For location/radius changes, defer until tiles are idle (or 2.5s) so the base map renders first.
    const hasCachedData = venueFetchDataKey && lastVenueDataKeyRef.current === venueFetchDataKey && lastRawVenueGeoJsonRef.current;
    if (hasCachedData) {
      kickoffVenueFetch();
    } else {
      map.on("idle", kickoffVenueFetch);
      idleFallbackId = window.setTimeout(kickoffVenueFetch, 2500);
    }

    return () => {
      cancelled = true;
      venueFetchAbort.abort();
      if (idleFallbackId !== undefined) clearTimeout(idleFallbackId);
      map.off("idle", kickoffVenueFetch);
      onVenuesFetchLoadingChangeRef.current?.(false);
      const m = mapRef.current;
      if (!m) return;
      try {
        if (m.getLayer(L_VENUE_DOTS)) m.removeLayer(L_VENUE_DOTS);
        if (m.getLayer(L_VENUE_DOTS_PULSE_INNER)) m.removeLayer(L_VENUE_DOTS_PULSE_INNER);
        if (m.getLayer(L_VENUE_DOTS_PULSE)) m.removeLayer(L_VENUE_DOTS_PULSE);
        if (m.getLayer("venue-areas-outline")) m.removeLayer("venue-areas-outline");
        if (m.getLayer("venue-areas-fill")) m.removeLayer("venue-areas-fill");
        if (m.getSource(SRC_VENUE_DOTS)) m.removeSource(SRC_VENUE_DOTS);
        if (m.getSource("venue-areas")) m.removeSource("venue-areas");
      } catch (_) {}
    };
  }, [
    mapLoaded,
    venueFetchKey,
    venueFetchDataKey,
    debouncedVenueFetchCenter,
    venueSearchRadiusKm,
    venueSportsFilter,
    onSelectVenue,
    applyMapLayerVisibility,
    pauseVenueFetch,
  ]);

  const gamesAtSelectedVenue = useMemo(() => {
    if (!selectedVenue) return [];
    return openGamesNearPoint(games, selectedVenue.center.lat, selectedVenue.center.lng, 120);
  }, [games, selectedVenue]);

  const openGamesNearbyCount = gamesAtSelectedVenue.length;

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
              viewerCoords={userCoords}
              onClose={() => setEventPopup(null)}
              onJoin={onJoinGame}
              onLeave={onLeaveGame}
              onOpenMessages={onOpenMessagesForGame}
              joined={
                joinedSet.has(eventPopup.game.id) ||
                (Boolean(currentUserId) && eventPopup.game.created_by === currentUserId)
              }
              isHost={
                Boolean(currentUserId) &&
                (hostSet.has(eventPopup.game.id) ||
                  eventPopup.game.created_by === currentUserId)
              }
              isSubstitute={substituteSet.has(eventPopup.game.id)}
              onDeleteHostedGame={onDeleteHostedGame}
              onStartHostedGame={onStartHostedGame}
              onEndHostedGame={onEndHostedGame}
            />
          </div>
        </div>
      )}

      {selectedVenue && venuePopupPoint && venueAnchorClient && mapLoaded && (
        <div
          className="fixed inset-0 z-[999] pointer-events-auto"
          onClick={() => {
            onSelectVenue(null);
            setVenuePopupPoint(null);
          }}
        >
          <VenueInfoPopup
            key={`${selectedVenue.center.lat}-${selectedVenue.center.lng}`}
            venue={selectedVenue}
            anchorClient={venueAnchorClient}
            openGamesNearbyCount={openGamesNearbyCount}
            gamesNearby={gamesAtSelectedVenue}
            joinedGameIds={joinedSet}
            viewerCoords={userCoords}
            onJoinGame={onJoinGame}
            onOpenChat={onOpenMessagesForGame}
            onCreateGame={(venue) => {
              onCreateGameAtVenue?.(venue, venuePopupPoint ?? undefined);
            }}
            onClose={() => {
              onSelectVenue(null);
              setVenuePopupPoint(null);
            }}
          />
        </div>
      )}

      {colocatedModalGames && colocatedModalGames.length > 0 && (
        <ColocatedGamesModal
          games={colocatedModalGames}
          viewerCoords={userCoords}
          joinedGameIds={joinedSet}
          hostGameIds={hostSet}
          onClose={() => setColocatedModalGames(null)}
          onJoinGame={(g) => {
            onJoinGame?.(g);
            setColocatedModalGames(null);
          }}
          onLeaveGame={(g) => {
            onLeaveGame?.(g);
            setColocatedModalGames(null);
          }}
          onDeleteGame={(g) => {
            onDeleteHostedGame?.(g);
            setColocatedModalGames(null);
          }}
          onOpenChat={(g) => {
            onOpenMessagesForGame?.(g);
            setColocatedModalGames(null);
          }}
        />
      )}

      {mapLoaded && use3DOverlay && userCoords && mapRef.current && avatarGlbUrl && (
        <Avatar3DOverlay
          map={mapRef.current}
          userCoords={userCoords}
          glbUrl={avatarGlbUrl}
        />
      )}
    </div>
  );
}
