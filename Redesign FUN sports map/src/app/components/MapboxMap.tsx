/// <reference types="vite/client" />
import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from "react";
import type { MapCameraRequest, VenueSelection } from "./mapboxMapTypes";

export type { MapCameraRequest, VenueSelection } from "./mapboxMapTypes";
import { createRoot } from "react-dom/client";
import { useNavigate } from "react-router";

type ReactRoot = ReturnType<typeof createRoot>;
import type { GameRow } from "../../lib/supabase";
import type { ProfileNearbyRow } from "../../lib/supabase";
import type { MapNoteRow } from "../../lib/supabase";
import { isVenueGame } from "../../lib/mapGameTimer";
import { gamesToGeoJSON } from "../types/mapGeoJSON";
import { fetchSportsVenuesWithProgress } from "../lib/sportsVenues";
import type { SportsVenueGeoJSON } from "../lib/sportsVenues";
import type { VenueClusterPoint } from "../lib/sportsVenueTypes";
import { venueSelectionFromProperties } from "../lib/venueSelection";
import { enrichVenueGeoJSON } from "../lib/venueClusterEngine";
import { venueClusterIconImageExpression } from "../lib/venueSportIcon";
import { openGamesNearPoint } from "../lib/gamesAtVenue";
import { splitColocatedGames } from "../lib/colocateGames";
import { limitGamesForMapViewport } from "../map/mapBounds";
import {
  getViewportMetrics,
  shouldShowGameClusters,
  shouldShowGameIndividuals,
  shouldShowPlayerMarkers,
  shouldShowVenueDots,
} from "../map/mapVisibility";
import * as MapCfg from "../map/mapConfig";
import { loadMapboxGl } from "../lib/mapboxCached";
import { registerGameSportImages } from "../map/registerGameSportImages";
import { getGameMapboxIconId } from "../map/gameSportIcons";
const Avatar3DOverlay = React.lazy(() =>
  import("./Avatar3DOverlay").then((m) => ({ default: m.Avatar3DOverlay }))
);
import { GameEventPopup } from "./GameEventPopup";
import { VenueInfoPopup } from "./VenueInfoPopup";
import { ColocatedGamesPin } from "./ColocatedGamesPin";
import { RandomLocationGamePin } from "./RandomLocationGamePin";
import { ColocatedGamesModal } from "./ColocatedGamesModal";
import { GameMapCountdownPill } from "./GameMapCountdownPill";
import { useIsMobile } from "./ui/use-mobile";

/** Layer / source ids: games use GL clustering (geo-anchored, no DOM drift). */
const L_GAME_SOURCE = "fun-games";
const L_GAME_CLUSTERS = "fun-games-clusters";
const L_GAME_CLUSTER_LABEL = "fun-games-cluster-label";
/** Rasterized sport emoji only (`sport_map_icon` → addImage); no separate circle layer. */
const L_GAME_ICON = "fun-games-sport-icon";
const L_GAME_COUNT = "fun-games-roster";
// Notes use DOM `mapboxgl.Marker` instances (pulsating Letter/Note icon),
// managed via `noteMarkerEntriesRef` below — no GL source/layer.
const SRC_VENUE_POINTS = "venue-points";
const L_VENUE_GL_CLUSTERS = "venue-gl-clusters";
const L_VENUE_GL_CLUSTER_ICON = "venue-gl-cluster-icon";
const L_VENUE_SPORT_ICON = "venue-sport-icon";
const L_VENUE_DOTS = "venue-dots-core";
/** Dark bluish-purple halos (outer + inner gradient) — animated via rAF */
const L_VENUE_DOTS_PULSE = "venue-dots-pulse";
const L_VENUE_DOTS_PULSE_INNER = "venue-dots-pulse-inner";

/** Remove venue GL layers/sources — map teardown or basemap style swap only (not venue-fetch effect re-runs). */
function removeVenueGlLayers(map: import("mapbox-gl").Map): void {
  try {
    if (map.getLayer(L_VENUE_SPORT_ICON)) map.removeLayer(L_VENUE_SPORT_ICON);
    if (map.getLayer(L_VENUE_GL_CLUSTER_ICON)) map.removeLayer(L_VENUE_GL_CLUSTER_ICON);
    if (map.getLayer(L_VENUE_GL_CLUSTERS)) map.removeLayer(L_VENUE_GL_CLUSTERS);
    if (map.getLayer(L_VENUE_DOTS)) map.removeLayer(L_VENUE_DOTS);
    if (map.getLayer(L_VENUE_DOTS_PULSE_INNER)) map.removeLayer(L_VENUE_DOTS_PULSE_INNER);
    if (map.getLayer(L_VENUE_DOTS_PULSE)) map.removeLayer(L_VENUE_DOTS_PULSE);
    if (map.getSource(SRC_VENUE_POINTS)) map.removeSource(SRC_VENUE_POINTS);
  } catch (_) {
    /* style swap / already removed */
  }
}

/** True when venue source + core layers exist (setStyle can leave a stale source without layers). */
function venueGlLayersReady(map: import("mapbox-gl").Map): boolean {
  return Boolean(
    map.getSource(SRC_VENUE_POINTS) &&
      map.getLayer(L_VENUE_DOTS) &&
      map.getLayer(L_VENUE_SPORT_ICON)
  );
}

// Blends between two RGB colors. t=0 returns color a, t=1 returns color b, 0.5 is halfway.
// Used to animate the venue pulse halo smoothly between two tints.
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

/** Effective tier when 3D mode is off. */
function effectiveCinematicTier(enable3D: boolean, tier: MapCfg.CinematicTier): MapCfg.CinematicTier {
  return enable3D ? tier : "off";
}

/** Terrain when cinematic tier is on. Atmosphere/fog comes from Studio only. */
function applyCinematicBasemap(
  map: import("mapbox-gl").Map,
  tier: MapCfg.CinematicTier
): void {
  if (tier === "off") {
    try {
      map.setTerrain(null);
    } catch (_) {}
    return;
  }

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
  } catch (_) {}
}

// Straight-line distance in meters between two lng/lat points, accounting for Earth's curve.
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

type MapboxMapProps = {
  userCoords: { lat: number; lng: number } | null;
  games: GameRow[];
  /** Location-anchored notes (public/friends/private). */
  notes?: MapNoteRow[];
  onOpenNoteThread?: (note: MapNoteRow) => void;
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
  /** When false, skip venue fetch (e.g. sport-intent prompt not answered). */
  venueFetchEnabled?: boolean;
  /** Optional basemap style override (e.g. satellite). */
  mapStyleUrl?: string | null;
};

export function MapboxMap(props: MapboxMapProps) {
  const {
    userCoords,
    games,
    notes = [],
    onOpenNoteThread,
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
    venueFetchEnabled = true,
    mapStyleUrl = null,
  } = props;
  const navigate = useNavigate();

  const currentUserId = props.currentUserId ?? null;
  const joinedSet = joinedGameIds ?? new Set<string>();
  const hostSet = props.hostGameIds ?? new Set<string>();
  const substituteSet = props.substituteGameIds ?? new Set<string>();

  // —— Refs holding the live map and all the DOM markers we manage by hand ——
  const containerRef = useRef<HTMLDivElement>(null); // the <div> the Mapbox canvas mounts into
  const mapRef = useRef<import("mapbox-gl").Map | null>(null); // the Mapbox map instance
  const playerMarkersRef = useRef<import("mapbox-gl").Marker[]>([]); // nearby-player avatar markers
  const playerMarkerEntriesRef = useRef<{ marker: import("mapbox-gl").Marker; scaleEl: HTMLDivElement }[]>([]);
  /** HTML markers for multiple games at the same coordinates (cluster pin). */
  const colocatedMarkerEntriesRef = useRef<{ marker: import("mapbox-gl").Marker; root: ReactRoot; scaleEl: HTMLDivElement }[]>([]);
  const randomGameMarkerEntriesRef = useRef<{ marker: import("mapbox-gl").Marker; root: ReactRoot; scaleEl: HTMLDivElement }[]>([]);
  /** Venue singles use GL icons; this holds DOM-only countdown pills above them. */
  const venueCountdownEntriesRef = useRef(
    new Map<string, { marker: import("mapbox-gl").Marker; root: ReactRoot; scaleEl: HTMLDivElement }>()
  );
  /** Pulsating note markers, keyed by note id (no React root — plain DOM). */
  const noteMarkerEntriesRef = useRef<Map<string, { marker: import("mapbox-gl").Marker; root: HTMLButtonElement; dispose: () => void }>>(new Map());
  const userMarker2dRef = useRef<import("mapbox-gl").Marker | null>(null); // your own avatar (2D mode)
  const userMarker2dScaleElRef = useRef<HTMLDivElement | null>(null); // inner div we scale with zoom

  // —— React state that drives popups, modals, and re-renders ——
  const [mapLoaded, setMapLoaded] = useState(false); // true once Mapbox finishes loading
  const [mapError, setMapError] = useState<string | null>(null); // shown if the map fails to load
  const [eventPopup, setEventPopup] = useState<{ game: GameRow; point: { x: number; y: number } } | null>(null); // open game card
  /** Map pixel position (legacy — used only if create-game needs viewport anchor). */
  const [venuePopupPoint, setVenuePopupPoint] = useState<{ x: number; y: number } | null>(null);
  const [bumpGameId, setBumpGameId] = useState<string | null>(null); // game id currently playing the tap-pulse
  const [colocatedModalGames, setColocatedModalGames] = useState<GameRow[] | null>(null); // games stacked at one spot
  const isMobile = useIsMobile();
  const cinematicTier = useMemo(() => MapCfg.getCinematicTier(isMobile), [isMobile]);
  const cinematicTierRef = useRef(cinematicTier);
  cinematicTierRef.current = cinematicTier;
  const enable3DRef = useRef(enable3D);
  enable3DRef.current = enable3D;
  const [mapIdle, setMapIdle] = useState(false);
  const introPitchDoneRef = useRef(false);
  // Timestamps of the last venue/game tap — used to suppress the map's generic click handler right after.
  const venueInteractionTsRef = useRef(0);
  const gameInteractionTsRef = useRef(0);
  const lastHandledGamePopupNonceRef = useRef<number | null>(null); // dedupe external "open this game" requests
  const initialUserFlyDoneRef = useRef(false); // so we only auto-fly to the user once
  const gameLayersInitedRef = useRef(false); // so the game GL layers are only created once
  // Mirror the latest props/state into refs so stable event handlers can read current values without re-binding.
  const gamesRef = useRef(games);
  const notesRef = useRef(notes);
  const onSelectGameRef = useRef(onSelectGame);
  const onJoinGameRef = useRef(onJoinGame);
  const selectedGameIdRef = useRef(selectedGameId);
  const [mapUxHint, setMapUxHint] = useState<string | null>(null);
  /** Bumps when venue GL layers are first created so hover/selection paint expressions apply. */
  const [venueLayerEpoch, setVenueLayerEpoch] = useState(0);
  /** Bumps after each basemap style swap so GL layer effects re-bind even if mapLoaded batches. */
  const [basemapStyleEpoch, setBasemapStyleEpoch] = useState(0);
  const activeStyleUrl = (mapStyleUrl ?? "").trim() || MAP_STYLE_URL;
  const activeStyleUrlRef = useRef(activeStyleUrl);
  activeStyleUrlRef.current = activeStyleUrl;
  const userCoordsRef = useRef(userCoords);
  userCoordsRef.current = userCoords;
  const lastAppliedStyleUrlRef = useRef(activeStyleUrl);
  const venuesFetchCenter = venuesCenter ?? userCoords; // where to look for venues (explicit center, else the user)
  /** Debounced anchor so rapid search / map moves don’t spam Overpass + Supabase. */
  const [debouncedVenueFetchCenter, setDebouncedVenueFetchCenter] = useState(venuesFetchCenter);
  // Wait 420ms after the center stops changing before committing it, so quick pans don't trigger many fetches.
  useEffect(() => {
    if (!venuesFetchCenter) {
      setDebouncedVenueFetchCenter(null);
      return;
    }
    const tid = window.setTimeout(() => setDebouncedVenueFetchCenter(venuesFetchCenter), 420);
    return () => clearTimeout(tid); // cancel the pending update if the center changes again first
  }, [venuesFetchCenter?.lat, venuesFetchCenter?.lng]);
  // Recenter button: skip debounce so venues refresh at the user's location immediately.
  useEffect(() => {
    if ((centerOnUserTrigger ?? 0) < 1 || !venuesFetchCenter) return;
    setDebouncedVenueFetchCenter(venuesFetchCenter);
  }, [centerOnUserTrigger, venuesFetchCenter?.lat, venuesFetchCenter?.lng]);
  const venueClustersRef = useRef<VenueClusterPoint[]>([]);
  const onVenuesFetchLoadingChangeRef = useRef(onVenuesFetchLoadingChange);
  onVenuesFetchLoadingChangeRef.current = onVenuesFetchLoadingChange;

  gamesRef.current = games;
  notesRef.current = notes;
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
  // Records the start time so the rAF loop can animate the icon shrinking-then-returning.
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
  // Recomputes the size, glow halo, opacity, and gentle wobble for every game icon each frame.
  const applyGameIconLayout = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getLayer(L_GAME_ICON)) return; // layer not built yet
    const sid = selectedGameIdRef.current ?? ""; // currently selected game id
    const hid = gameIconHoverIdRef.current; // game id under the mouse, if any
    const z = map.getZoom?.() ?? 13;
    // Grow icons as you zoom in and shrink as you zoom out, for a pseudo-3D depth feel.
    const zoomScale = (() => {
      // Screen-space "3D" feel: bigger when zoomed in, smaller when zoomed out.
      // Tuned so it doesn't explode at street-level zoom.
      const z0 = 10.5;
      const z1 = 16.5;
      const t = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
      return 0.78 + (1.28 - 0.78) * t;
    })();
    const base = MapCfg.GAME_ICON_LAYOUT_BASE * zoomScale; // normal icon size at this zoom
    const bumpLow = base * MapCfg.GAME_ICON_GL_CLICK_DIP_MULT; // smallest size at the dip of a tap pulse

    // Figure out how far through the tap-pulse animation we are (0 = none, up to 1 at peak).
    let bumpAnimId: string | null = null;
    let bumpPulse = 0;
    const anim = bumpAnimationRef.current;
    if (anim) {
      const elapsed = performance.now() - anim.startMs;
      const dur = MapCfg.GAME_ICON_BUMP_DURATION_MS;
      if (elapsed >= dur) {
        // Pulse finished — clear it.
        bumpAnimationRef.current = null;
        setBumpGameId(null);
        bumpPulse = 0;
      } else {
        bumpPulse = MapCfg.glIconClickBumpPulse(elapsed, dur); // current pulse strength
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

    // Build a Mapbox "case" expression: pick each icon's size based on whether it's
    // pulsing, selected, hovered, or normal — applied to the whole layer in one go.
    const sizeCase: unknown[] = ["case"];
    if (bumpAnimId) {
      sizeCase.push(["==", ["get", "id"], bumpAnimId], bumpSize); // the tapped icon uses the pulse size
    }
    sizeCase.push(
      ["==", ["get", "id"], sid],
      MapCfg.GAME_ICON_LAYOUT_SELECTED, // selected icon
      ["==", ["get", "id"], hid ?? ""],
      hoverSize, // hovered icon
      base // everything else
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

    // Gentle continuous wobble: rotate all icons back and forth a few degrees over time.
    const tNow = performance.now();
    const rotAmp = MapCfg.GAME_ICON_ROTATE_AMPLITUDE_DEG; // max tilt in degrees
    const rotPeriod = MapCfg.GAME_ICON_ROTATE_PERIOD_MS; // time for one full wobble
    const iconRotate = Math.sin((tNow / rotPeriod) * Math.PI * 2) * rotAmp;
    try {
      map.setLayoutProperty(L_GAME_ICON, "icon-rotate", iconRotate);
    } catch (_) {}
  }, [setBumpGameId]);

  // —— Map init: sports-first dark basemap, terrain, fog ———
  // Runs once to create the Mapbox map, then tears it down on unmount/dependency change.
  useEffect(() => {
    setMapError(null);
    if (!MAPBOX_TOKEN || !containerRef.current) return; // need a token and a container div
    if (mapRef.current) return; // already created — don't make a second map

    let cancelled = false; // guards against the async load finishing after unmount

    loadMapboxGl().then((mapboxgl) => {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;

      mapboxgl.accessToken = MAPBOX_TOKEN;

      try {
        container.innerHTML = "";
      } catch (_) {
        return;
      }

      let map: import("mapbox-gl").Map | null = null;
      const styleAtInit = activeStyleUrlRef.current;
      const coordsAtInit = userCoordsRef.current;
      try {
        map = new mapboxgl.Map({
          container,
          style: styleAtInit,
          center: coordsAtInit ? [coordsAtInit.lng, coordsAtInit.lat] : [-98, 40],
          zoom: 15,
          pitch: 0,
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
      lastAppliedStyleUrlRef.current = styleAtInit;
      if (import.meta.env.DEV) {
        // Dev-only handle for console debugging and headless UI checks (never in prod builds).
        (window as unknown as { __FUN_MAP__?: unknown }).__FUN_MAP__ = map;
      }

      const loadTimeoutId = window.setTimeout(() => {
        if (cancelled || mapRef.current !== map) return;
        if (!map!.loaded()) {
          setMapError("Map timed out while loading. Check your network or Mapbox token.");
        }
      }, 20000);

      // Once the basemap finishes loading: terrain/fog by tier, disable dbl-click zoom.
      map.on("load", () => {
        window.clearTimeout(loadTimeoutId);
        if (cancelled || mapRef.current !== map) return;
        setMapLoaded(true);
        setMapError(null);
        const tier = effectiveCinematicTier(enable3DRef.current, cinematicTierRef.current);
        applyCinematicBasemap(map!, tier);
        try {
          map!.doubleClickZoom?.disable();
        } catch (_) {}

        map!.once("idle", () => {
          if (cancelled || mapRef.current !== map) return;
          setMapIdle(true);
          const idleTier = effectiveCinematicTier(enable3DRef.current, cinematicTierRef.current);
          if (!introPitchDoneRef.current && idleTier !== "off") {
            introPitchDoneRef.current = true;
            map!.easeTo({
              pitch: MapCfg.getCinematicIntroPitch(idleTier),
              duration: MapCfg.CINEMATIC_INTRO_PITCH_DURATION_MS,
              easing: MapCfg.easeOutQuad,
            });
          }
        });
      });

      map.on("error", (e) => {
        const msg = e.error?.message ?? "";
        // Tile/sprite/source failures are routine — never tear down the whole map for them.
        if ((e as { sourceId?: string }).sourceId) return;
        if (/access token|unauthorized|401|403/i.test(msg)) {
          setMapError(msg || "Mapbox authentication failed");
        }
      });
    }).catch((err: unknown) => {
      if (cancelled) return;
      const msg = err instanceof Error ? err.message : String(err);
      setMapError(msg || "Failed to load mapbox-gl");
    });

    // Cleanup on unmount: remove markers and destroy the map so nothing leaks.
    return () => {
      cancelled = true;
      gameLayersInitedRef.current = false;
      initialUserFlyDoneRef.current = false;
      introPitchDoneRef.current = false;
      setMapIdle(false);
      setMapLoaded(false);
      // Clear pulsating note markers before tearing down the map.
      for (const entry of noteMarkerEntriesRef.current.values()) {
        try { entry.dispose(); } catch (_) { /* noop */ }
        try { entry.marker.remove(); } catch (_) { /* noop */ }
      }
      noteMarkerEntriesRef.current.clear();
      const m = mapRef.current;
      if (m) {
        removeVenueGlLayers(m);
        try {
          m.remove();
        } catch (_) {}
        mapRef.current = null;
      }
    };
  }, [MAPBOX_TOKEN]);

  // —— Basemap style toggle (satellite, etc.) ———
  // Swaps the map style when the user changes basemaps. setStyle wipes our custom
  // sources/layers, so we reset the init flags and let the other effects rebuild them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !MAPBOX_TOKEN) return;
    const prev = lastAppliedStyleUrlRef.current;
    const next = activeStyleUrl;
    if (!next || next === prev) return; // nothing to change

    lastAppliedStyleUrlRef.current = next;
    gameLayersInitedRef.current = false; // game layers will need rebuilding
    venueClustersRef.current = [];
    removeVenueGlLayers(map);
    setMapLoaded(false); // flips back true on style.load below

    let cancelled = false;
    const finishStyleSwap = () => {
      if (cancelled) return;
      removeVenueGlLayers(map);
      venueClustersRef.current = [];
      gameLayersInitedRef.current = false;
      const tier = effectiveCinematicTier(enable3DRef.current, cinematicTierRef.current);
      applyCinematicBasemap(map, tier);
      setBasemapStyleEpoch((n) => n + 1);
      setMapLoaded(true);
      setMapIdle(false);
      map.once("idle", () => {
        if (cancelled || mapRef.current !== map) return;
        setMapIdle(true);
      });
    };

    const onStyleLoad = () => {
      window.clearTimeout(styleRecoveryId);
      finishStyleSwap();
    };

    const styleRecoveryId = window.setTimeout(() => {
      if (cancelled) return;
      if (!map.isStyleLoaded()) return;
      finishStyleSwap();
    }, 6000);

    try {
      map.once("style.load", onStyleLoad);
      map.setStyle(next);
    } catch (_) {
      window.clearTimeout(styleRecoveryId);
      finishStyleSwap();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(styleRecoveryId);
      try {
        map.off("style.load", onStyleLoad);
      } catch (_) {}
    };
  }, [MAPBOX_TOKEN, activeStyleUrl]);

  // Re-apply terrain/fog when device tier or 3D mode changes (no pitch animation).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    applyCinematicBasemap(map, effectiveCinematicTier(enable3D, cinematicTier));
  }, [mapLoaded, enable3D, cinematicTier]);

  // One-time fly to user when coords first become available (avoid fighting search / sport camera)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !userCoords) return;
    if (initialUserFlyDoneRef.current) return; // only the first time
    initialUserFlyDoneRef.current = true;
    map.flyTo({
      center: [userCoords.lng, userCoords.lat],
      zoom: 16,
    });
  }, [mapLoaded, userCoords]);

  // Search / sport-driven camera: fly to a point, or fit all given points in view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !mapCameraRequest) return;
    const req = mapCameraRequest;

    loadMapboxGl().then((mapboxgl) => {
      const m = mapRef.current;
      if (!m) return;

      // "fly" = move to a single coordinate.
      if (req.kind === "fly") {
        m.flyTo({
          center: [req.lng, req.lat],
          zoom: req.zoom ?? 13,
          duration: 1400,
        });
        return;
      }

      // "fitBounds" = zoom/pan so every coordinate is visible at once.
      const coords = req.coordinates.filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
      if (coords.length === 0) return;
      if (coords.length === 1) {
        // Only one point — just fly to it.
        m.flyTo({
          center: coords[0],
          zoom: 14,
          duration: 1200,
        });
        return;
      }
      // Grow a bounding box to include every coordinate, then frame it.
      const bounds = new mapboxgl.LngLatBounds(coords[0], coords[0]);
      for (let i = 1; i < coords.length; i++) bounds.extend(coords[i]);
      m.fitBounds(bounds, {
        padding: { top: 120, bottom: 240, left: 48, right: 48 },
        maxZoom: 14,
        duration: 1200,
      });
    });
  }, [mapLoaded, mapCameraRequest]);

  // Center on user when "Center on me" is pressed (works without auth; uses browser geolocation)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || centerOnUserTrigger === undefined || centerOnUserTrigger < 1) return;

    const flyToCoords = (lat: number, lng: number) => {
      map.flyTo({
        center: [lng, lat],
        zoom: 17,
      });
    };

    // Prefer the coords we already have; otherwise ask the browser for a fresh fix.
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
  }, [mapLoaded, centerOnUserTrigger, userCoords]);

  // —— Venue selection: center map on venue when sheet opens ——
  useEffect(() => {
    const map = mapRef.current;
    if (!mapLoaded || !map) return;

    if (!selectedVenue) {
      setVenuePopupPoint(null);
      return;
    }

    const { lng, lat } = selectedVenue.center;

    const onMoveEnd = () => {
      setVenuePopupPoint(map.project([lng, lat]));
    };

    const tier = effectiveCinematicTier(enable3D, cinematicTier);

    map.easeTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 17),
      pitch: MapCfg.getCinematicVenuePitch(tier),
      bearing: MapCfg.getCinematicVenueBearing(tier),
      offset: isMobile ? [0, 80] : [0, 0],
      duration: MapCfg.CINEMATIC_VENUE_EASE_DURATION_MS,
    });

    map.once("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [mapLoaded, selectedVenue?.id, selectedVenue?.center.lng, selectedVenue?.center.lat, enable3D, cinematicTier, isMobile]);

  // —— Open game modal from carousel (center + delayed popup) ——
  useEffect(() => {
    if (!mapLoaded || !gamePopupRequest) return;
    if (lastHandledGamePopupNonceRef.current === gamePopupRequest.nonce) return;
    lastHandledGamePopupNonceRef.current = gamePopupRequest.nonce;

    const map = mapRef.current;
    if (!map) return;

    const game = gamesRef.current.find((g) => g.id === gamePopupRequest.gameId);
    if (!game) return; // requested game isn't on the map

    // Close venue popup (if open) and ensure game selection is synced.
    onSelectVenue(null);
    setVenuePopupPoint(null);
    onSelectGameRef.current(game);

    const rect = map.getContainer().getBoundingClientRect();
    const mapPoint = { x: rect.width / 2, y: rect.height / 2 };

    gameInteractionTsRef.current = Date.now();
    setEventPopup(null);
    setColocatedModalGames(null);

    // Wait for the camera to recenter, then pulse the icon and open the game card.
    const t = window.setTimeout(() => {
      bumpGameIcon(game.id);
      setEventPopup({ game, point: mapPoint });
    }, 650);

    return () => window.clearTimeout(t);
  }, [mapLoaded, gamePopupRequest, onSelectVenue]);

  /** Venue dot + sport icon paint when selection changes. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const sel = selectedVenue?.id ?? "";

    if (map.getLayer(L_VENUE_DOTS)) {
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

    if (map.getLayer(L_VENUE_SPORT_ICON)) {
      map.setLayoutProperty(L_VENUE_SPORT_ICON, "icon-size", [
        "case",
        ["==", ["get", "id"], sel],
        MapCfg.VENUE_ICON_LAYOUT_BASE * 1.12,
        MapCfg.VENUE_ICON_LAYOUT_BASE,
      ]);
    }
  }, [mapLoaded, selectedVenue, venueLayerEpoch]);

  /** Dark bluish-purple halos: constant pulse; hz eases down when a venue is selected. */
  // A requestAnimationFrame loop that breathes the venue halo in/out every frame and
  // smoothly animates the hover zoom. Runs continuously while the map is loaded.
  useEffect(() => {
    if (!mapLoaded) return;
    let cancelled = false;
    let rafId = 0;
    venuePulseLastTRef.current = null;

    const tick = () => {
      if (cancelled) return;
      const map = mapRef.current;
      const now = performance.now() / 1000; // seconds
      if (venuePulseLastTRef.current == null) venuePulseLastTRef.current = now;
      const dt = Math.min(0.05, Math.max(0, now - venuePulseLastTRef.current)); // time since last frame (capped)
      venuePulseLastTRef.current = now;

      // Ease the pulse speed toward its target (slower when a venue is selected, idle otherwise).
      const targetHz = selectedVenuePulseRef.current
        ? MapCfg.VENUE_DOT_PULSE_HZ_SELECTED
        : MapCfg.VENUE_DOT_PULSE_HZ_IDLE;
      const sk = MapCfg.VENUE_DOT_PULSE_HZ_SMOOTHING;
      venuePulseHzRef.current += (targetHz - venuePulseHzRef.current) * Math.min(1, dt * sk);

      // Advance the pulse phase; the sine of this phase drives the grow/shrink below.
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

      // Map the 0→1 sine value onto actual radius/opacity/blur ranges for the outer halo.
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

      // Push the freshly-computed outer-halo values to the GL layer (only if it's visible).
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
        // Ease the hover amount (venueHoverT) toward its target (1 = hovered, 0 = not).
        const target = venueHoverTargetRef.current;
        const current = venueHoverTRef.current;
        const newT = current + (target - current) * Math.min(1, dt * 10);
        venueHoverTRef.current = Math.abs(target - newT) < 0.002 ? target : newT; // snap when close enough
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

      rafId = requestAnimationFrame(tick); // queue the next frame
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId); // stop the loop on cleanup
    };
  }, [mapLoaded]);

  /** Geo-anchored games: clustered GL source + symbol/circle layers (no DOM markers). */
  // Decides which layers/markers are visible at the current zoom (clusters vs individual
  // game icons vs venue dots/footprints vs player avatars), and shows a "zoom in" hint.
  const applyMapLayerVisibility = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getLayer(L_GAME_CLUSTERS)) return;
    const { zoom, boundsWidthKm } = getViewportMetrics(map); // current zoom + how wide the view is
    // Each helper answers a yes/no "should this be shown at this zoom?" question.
    const showClusters = shouldShowGameClusters(zoom, boundsWidthKm);
    const showIndividuals = shouldShowGameIndividuals(zoom, boundsWidthKm);
    const showVenueDot = shouldShowVenueDots(zoom);
    const showPlayers = shouldShowPlayerMarkers(zoom);

    map.setLayoutProperty(L_GAME_CLUSTERS, "visibility", showClusters ? "visible" : "none");
    map.setLayoutProperty(L_GAME_CLUSTER_LABEL, "visibility", showClusters ? "visible" : "none");
    map.setLayoutProperty(L_GAME_ICON, "visibility", showIndividuals ? "visible" : "none");
    map.setLayoutProperty(L_GAME_COUNT, "visibility", showIndividuals ? "visible" : "none");

    if (map.getLayer(L_VENUE_GL_CLUSTERS)) {
      map.setLayoutProperty(L_VENUE_GL_CLUSTERS, "visibility", showVenueDot ? "visible" : "none");
    }
    if (map.getLayer(L_VENUE_GL_CLUSTER_ICON)) {
      map.setLayoutProperty(L_VENUE_GL_CLUSTER_ICON, "visibility", showVenueDot ? "visible" : "none");
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
    if (map.getLayer(L_VENUE_SPORT_ICON)) {
      map.setLayoutProperty(L_VENUE_SPORT_ICON, "visibility", showVenueDot ? "visible" : "none");
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

    venueCountdownEntriesRef.current.forEach(({ marker }) => {
      const el = marker.getElement();
      if (el) el.style.visibility = showIndividuals ? "visible" : "hidden";
    });

    // If there are games but they're hidden because the view is too zoomed out, nudge the user.
    const g = gamesRef.current;
    setMapUxHint(
      g.length > 0 && !showClusters && !showIndividuals && zoom < MapCfg.GAME_INDIVIDUAL_MIN_ZOOM
        ? "Zoom in to explore games nearby"
        : null
    );
  }, []);

  /** Zoom-based scaling for DOM markers (HTML pins + avatar + nearby players). */
  // GL icons scale via Mapbox, but our HTML markers don't — so we manually scale them
  // up as you zoom in and down as you zoom out to match the rest of the map.
  const applyDomMarkerScale = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom?.() ?? 13;
    const z0 = 10.5; // zoom where markers are smallest
    const z1 = 16.5; // zoom where markers are largest
    const t = Math.min(1, Math.max(0, (z - z0) / (z1 - z0))); // 0→1 progress across that range
    const s = 0.78 + (1.28 - 0.78) * t; // resulting scale factor (0.78 → 1.28)

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
    for (const ent of venueCountdownEntriesRef.current.values()) {
      ent.scaleEl.style.transform = `scale(${s})`;
      ent.scaleEl.style.transformOrigin = "center";
    }
    const userScaleEl = userMarker2dScaleElRef.current;
    if (userScaleEl) {
      userScaleEl.style.transform = `scale(${s})`;
      userScaleEl.style.transformOrigin = "center";
    }
  }, []);

  // —— One-time setup of the game GL layers (source, cluster circles, sport icons, count labels)
  // plus all the click/hover handlers and the move/zoom listeners that update visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || gameLayersInitedRef.current) return;
    gameLayersInitedRef.current = true; // guard so this only runs once per style load

    registerGameSportImages(map); // load the sport emoji images Mapbox will draw

    // The game data source, with Mapbox's built-in clustering turned on.
    map.addSource(L_GAME_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }, // filled in by a later effect
      cluster: true,
      clusterMaxZoom: MapCfg.GAME_CLUSTER_MAX_ZOOM,
      clusterRadius: MapCfg.GAME_CLUSTER_RADIUS_PX,
    });

    // Circle drawn behind grouped games (only features that have point_count = a cluster).
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

    // Number drawn on top of each cluster circle (how many games are grouped).
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

    // The sport emoji icon for each individual (un-clustered, non-stacked) game.
    map.addLayer({
      id: L_GAME_ICON,
      type: "symbol",
      source: L_GAME_SOURCE,
      filter: [
        "all",
        ["!", ["has", "point_count"]], // not a cluster
        ["!=", ["coalesce", ["get", "marker_kind"], ""], "colocated"], // not a stacked-pin game
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

    // The "filled / total" player count text shown under each game icon.
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

    // Notes are drawn as DOM markers in a separate effect (pulsating icon).

    // Select a game, pulse its icon, and open its card at the given screen point.
    const openPopupForGame = (game: GameRow, mapPoint: { x: number; y: number }) => {
      gameInteractionTsRef.current = Date.now();
      onSelectGameRef.current(game);
      bumpGameIcon(game.id);
      setEventPopup({ game, point: mapPoint });
    };

    // Translate a clicked GL feature back to its full game row, then open the popup.
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

    // Click a cluster: zoom in just enough to break it apart into its members.
    map.on("click", L_GAME_CLUSTERS, (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const src = map.getSource(L_GAME_SOURCE) as import("mapbox-gl").GeoJSONSource;
      const raw = f.properties?.cluster_id;
      const clusterId = typeof raw === "number" ? raw : Number(raw);
      if (raw == null || Number.isNaN(clusterId)) return;
      // Mapbox tells us the zoom at which this cluster expands; ease there.
      src.getClusterExpansionZoom(clusterId, (err, z) => {
        if (err || z == null) return;
        const coords = (f.geometry as import("geojson").Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom: Math.min(z + 0.5, 16), duration: 450 });
      });
    });

    // Click an individual game icon: open its card.
    map.on("click", L_GAME_ICON, openGameFromFeature);

    // Cursor feedback over clusters.
    map.on("mouseenter", L_GAME_CLUSTERS, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", L_GAME_CLUSTERS, () => {
      map.getCanvas().style.cursor = "";
    });

    // Hover an individual game icon: cursor + start the grow-on-hover animation.
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

    // Throttle visibility/scale updates to one per animation frame while the map moves.
    let visRaf = 0;
    const scheduleVis = () => {
      if (visRaf) cancelAnimationFrame(visRaf);
      visRaf = requestAnimationFrame(() => {
        visRaf = 0;
        applyMapLayerVisibility();
        applyDomMarkerScale();
      });
    };

    // Recompute what's visible and how big DOM markers are as the camera moves/zooms.
    map.on("move", scheduleVis);
    map.on("zoom", scheduleVis);
    map.on("moveend", applyMapLayerVisibility);
    map.on("zoomend", applyMapLayerVisibility);

    applyMapLayerVisibility(); // run once now for the initial view
    applyDomMarkerScale();

    // Detach all the listeners we added when this effect tears down.
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
  }, [mapLoaded, basemapStyleEpoch, applyMapLayerVisibility, applyDomMarkerScale, applyGameIconLayout]);

  /** Push game GeoJSON into clustered source (capped by viewport for performance). */
  // Whenever the games list (or selection/minute tick) changes, feed fresh data to the GL source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(L_GAME_SOURCE) as import("mapbox-gl").GeoJSONSource | undefined;
    if (!src) return;

    // Limit to the games near the viewport so we never push thousands of features at once.
    const capped = limitGamesForMapViewport(games, map, MapCfg.MAX_VISIBLE_INDIVIDUAL_GAMES);
    src.setData(gamesToGeoJSON(capped, selectedGameId));
    applyMapLayerVisibility();
  }, [mapLoaded, basemapStyleEpoch, games, selectedGameId, mapMinuteEpoch, applyMapLayerVisibility]);

  /**
   * Render notes as pulsating DOM markers (Letter/Note icon).
   * One `mapboxgl.Marker` per note, diffed by id across renders.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    let cancelled = false;
    void loadMapboxGl().then((mapboxgl) => {
      if (cancelled || mapRef.current !== map) return;
      const Marker = mapboxgl.Marker;

      const existing = noteMarkerEntriesRef.current; // markers already on the map, keyed by note id
      const nextById = new Map<string, MapNoteRow>(notes.map((n) => [n.id, n])); // notes we want now

      // Drop markers whose notes are no longer present.
      for (const [id, entry] of existing) {
        if (!nextById.has(id)) {
          try { entry.marker.remove(); } catch (_) { /* noop */ }
          existing.delete(id);
        }
      }

      // Add or update markers for current notes.
      for (const note of notes) {
        const prev = existing.get(note.id);
        if (prev) {
          // Reposition (lat/lng can change if note is updated server-side).
          try { prev.marker.setLngLat([note.lng, note.lat]); } catch (_) { /* noop */ }
          continue;
        }

        const root = document.createElement("button");
        root.type = "button";
        root.className = "fun-note-marker";
        root.setAttribute("aria-label", "Open map note");
        root.innerHTML =
          '<span class="pulse-ring" aria-hidden="true"></span>' +
          '<span class="pulse-ring delay" aria-hidden="true"></span>' +
          '<span class="icon-chip" aria-hidden="true">' +
          // Lucide "StickyNote" path (24x24).
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5-5V5a2 2 0 0 0-2-2z"/>' +
          '<path d="M16 3v4a2 2 0 0 0 2 2h4"/>' +
          '</svg>' +
          '</span>';

        const handlePress = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
          const live = notesRef.current.find((n) => n.id === note.id) ?? note;
          onOpenNoteThread?.(live);
        };
        root.addEventListener("click", handlePress);

        const marker = new Marker({ element: root, anchor: "center" })
          .setLngLat([note.lng, note.lat])
          .addTo(map);

        existing.set(note.id, { marker, root, dispose: () => root.removeEventListener("click", handlePress) });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mapLoaded, basemapStyleEpoch, notes, onOpenNoteThread]);

  /** Same-coordinate games: single HTML cluster pin (avoids overlapping GL sport icons). */
  // When several games sit at the exact same spot, draw one combined HTML pin that opens
  // a chooser modal, instead of stacking unreadable GL icons on top of each other.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const capped = limitGamesForMapViewport(games, map, MapCfg.MAX_VISIBLE_INDIVIDUAL_GAMES);
    const { groups } = splitColocatedGames(capped); // groups = sets of games sharing one location

    let cancelled = false;
    if (groups.length > 0) {
      loadMapboxGl().then((mapboxgl) => {
        if (cancelled || mapRef.current !== map) return;
        const Marker = mapboxgl.Marker;
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

    // Remove this batch of pins and unmount their React roots (deferred so React can settle).
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
  // Games created by tapping an empty spot (no venue) get a custom HTML pin with a live countdown.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const capped = limitGamesForMapViewport(games, map, MapCfg.MAX_VISIBLE_INDIVIDUAL_GAMES);
    const { singles } = splitColocatedGames(capped); // games that are alone at their spot
    const randomSingles = singles.filter((g) => !isVenueGame(g)); // ...and not tied to a venue

    let cancelled = false;
    if (randomSingles.length > 0) {
      loadMapboxGl().then((mapboxgl) => {
        if (cancelled || mapRef.current !== map) return;
        const Marker = mapboxgl.Marker;
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

  /**
   * Venue games (location_label set) are drawn as GL symbols. To keep parity with
   * map-tap pins, render a tiny DOM-only countdown/LIVE badge above each venue
   * single. (Non-interactive; clicks go to the GL layer.)
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const capped = limitGamesForMapViewport(games, map, MapCfg.MAX_VISIBLE_INDIVIDUAL_GAMES);
    const { singles } = splitColocatedGames(capped);
    const venueSingles = singles.filter((g) => isVenueGame(g)); // games attached to a venue
    const nextById = new Map<string, GameRow>(venueSingles.map((g) => [g.id, g])); // desired set, by id

    let cancelled = false;
    void loadMapboxGl().then((mapboxgl) => {
      if (cancelled || mapRef.current !== map) return;
      const Marker = mapboxgl.Marker;
      const existing = venueCountdownEntriesRef.current;

      // Drop entries not in next set.
      const toUnmount: ReactRoot[] = [];
      for (const [id, entry] of existing) {
        if (!nextById.has(id)) {
          try {
            entry.marker.remove();
          } catch (_) {}
          toUnmount.push(entry.root);
          existing.delete(id);
        }
      }
      if (toUnmount.length) {
        window.setTimeout(() => {
          for (const root of toUnmount) {
            try {
              root.unmount();
            } catch (_) {}
          }
        }, 0);
      }

      // Add/update entries.
      for (const game of venueSingles) {
        const prev = existing.get(game.id);
        if (prev) {
          // Keep marker in sync with any server-side coordinate fixes.
          prev.marker.setLngLat([game.lng, game.lat]);
          prev.root.render(
            <div className="relative h-[52px] w-[52px] pointer-events-none">
              <GameMapCountdownPill game={game} />
            </div>
          );
          continue;
        }

        const outer = document.createElement("div");
        outer.style.pointerEvents = "none";
        const scaleEl = document.createElement("div");
        scaleEl.style.willChange = "transform";
        outer.appendChild(scaleEl);
        const root = createRoot(scaleEl);
        root.render(
          <div className="relative h-[52px] w-[52px] pointer-events-none">
            <GameMapCountdownPill game={game} />
          </div>
        );
        const marker = new Marker({ element: outer, anchor: "center" })
          .setLngLat([game.lng, game.lat])
          .addTo(map);
        existing.set(game.id, { marker, root, scaleEl });
      }

      applyMapLayerVisibility();
      applyDomMarkerScale();
    });

    return () => {
      cancelled = true;
      // On unmount, remove any remaining markers.
      const existing = venueCountdownEntriesRef.current;
      const entries = [...existing.values()];
      existing.clear();
      for (const entry of entries) {
        try {
          entry.marker.remove();
        } catch (_) {}
      }
      window.setTimeout(() => {
        for (const entry of entries) {
          try {
            entry.root.unmount();
          } catch (_) {}
        }
      }, 0);
    };
  }, [mapLoaded, games, mapMinuteEpoch, applyMapLayerVisibility, applyDomMarkerScale]);

  /** Selected / bump / hover: game sport icon layout + halo. */
  // Re-run the icon layout immediately when selection or the tap-pulse changes (the rAF loop
  // below keeps it running every frame, but this makes state changes feel instant).
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
      const dt = last == null ? 16 : Math.min(48, Math.max(0, now - last)); // ms since last frame
      gameIconHoverLastTsRef.current = now;

      // Ease the hover amount toward its target using a time-based (frame-rate independent) curve.
      const target = gameIconHoverTargetRef.current;
      const ht = gameIconHoverTRef.current;
      const tau = MapCfg.GAME_ICON_HOVER_TAU_MS; // larger = slower ease
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

      // Mobile: a single tap recenters and opens Create Game at that spot.
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
          zoom: Math.max(map.getZoom(), MapCfg.GAME_INDIVIDUAL_MIN_ZOOM),
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

      // Desktop: a normal click on empty map just closes any open popup/selection.
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
  // Double-clicking empty map opens Create Game at exactly where you clicked.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !onMapDoubleClick || isMobile) return;

    const handler = (e: { lngLat: { lat: number; lng: number }; point: { x: number; y: number } }) => {
      if (Date.now() - venueInteractionTsRef.current < 400) return; // ignore if a venue was just clicked

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
        zoom: Math.max(map.getZoom(), MapCfg.GAME_INDIVIDUAL_MIN_ZOOM),
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

  /** 3D overlay: full tier only, deferred until first idle (lighter boot). */
  const use3DOverlay =
    cinematicTier === "full" && enable3D && !!userCoords && !!avatarGlbUrl && !use2DAvatar && mapIdle;

  // —— 2D user marker when not using 3D overlay ———
  // Builds the "you are here" avatar (rings + photo + star rating) as an HTML marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !userCoords) return;
    // If the 3D avatar is active, remove the 2D one and bail.
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

    // Optional 5-star sportsmanship rating row under the avatar.
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
      userMarker2dRef.current = new mapboxgl.Marker({ element: outer })
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
  // Draws an avatar (with optional status pill + rating) for each nearby player; tapping
  // one opens their athlete profile. Rebuilt whenever the nearby-players list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear the previous batch of player markers before drawing the new one.
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

        const marker = new mapboxgl.Marker({ element: outer })
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
  // Data key: location + radius (+ a recenter epoch) — drives the network fetch.
  // `centerOnUserTrigger` is bumped by the recenter button even when coords don't change,
  // so venues can be refreshed on demand.
  const venueFetchDataKey = debouncedVenueFetchCenter
    ? `${debouncedVenueFetchCenter.lat.toFixed(4)},${debouncedVenueFetchCenter.lng.toFixed(4)},${venueSearchRadiusKm},${centerOnUserTrigger ?? 0}`
    : null;
  // Render key: includes sport sig — drives the effect to re-run on filter changes.
  const venueFetchKey = venueFetchDataKey ? `${venueFetchDataKey},${venueSportSig}` : null;

  // —— Sports venue fetch + render pipeline ——
  // Fetches OSM sports venues around the (debounced) center, clusters them off-thread,
  // and draws the footprint polygons + pulsing center dots, wiring up hover/click handlers.
  useEffect(() => {
    const map = mapRef.current;
    // Bail (and clear the loading flag) if we have nothing to fetch for.
    if (!map || !mapLoaded || !debouncedVenueFetchCenter || !venueFetchKey) {
      onVenuesFetchLoadingChangeRef.current?.(false);
      return;
    }
    if (!venueFetchEnabled) {
      onVenuesFetchLoadingChangeRef.current?.(false);
      return;
    }
    // Skip while paused (e.g. messenger open) so chat gets the bandwidth.
    if (pauseVenueFetch) {
      onVenuesFetchLoadingChangeRef.current?.(false);
      return;
    }

    // Takes raw venue GeoJSON, clusters it, and adds/updates the GL sources + layers.
    const addVenueMarkers = (geojson: SportsVenueGeoJSON, onDone?: () => void) => {
      const mapInstance = mapRef.current;
      if (!mapInstance) {
        onDone?.();
        return;
      }

      try {
        const enriched = enrichVenueGeoJSON(geojson, venueSportsFilter);
        venueClustersRef.current = enriched.features.map((f) => ({
          lng: f.geometry.coordinates[0]!,
          lat: f.geometry.coordinates[1]!,
          properties: f.properties,
        }));

        const beforeGames = mapInstance.getLayer(L_GAME_CLUSTERS) ? L_GAME_CLUSTERS : undefined;
        const pointFilter: import("mapbox-gl").Expression = ["!", ["has", "point_count"]];

        const selectVenueFromCluster = (cluster: VenueClusterPoint) => {
          venueInteractionTsRef.current = Date.now();
          setEventPopup(null);
          onSelectVenue(
            venueSelectionFromProperties(cluster.properties, { lng: cluster.lng, lat: cluster.lat })
          );
        };

        if (venueGlLayersReady(mapInstance)) {
          (mapInstance.getSource(SRC_VENUE_POINTS) as import("mapbox-gl").GeoJSONSource).setData(enriched);
        } else {
          removeVenueGlLayers(mapInstance);
          registerGameSportImages(mapInstance);

          mapInstance.addSource(SRC_VENUE_POINTS, {
            type: "geojson",
            data: enriched,
            promoteId: "id",
            cluster: true,
            clusterMaxZoom: MapCfg.VENUE_CLUSTER_MAX_ZOOM,
            clusterRadius: MapCfg.VENUE_CLUSTER_RADIUS_PX,
            clusterProperties: {
              max_sport_key: ["max", ["get", "sport_key"]],
            },
          });

          mapInstance.addLayer(
            {
              id: L_VENUE_GL_CLUSTERS,
              type: "circle",
              source: SRC_VENUE_POINTS,
              filter: ["has", "point_count"],
              paint: {
                "circle-color": "rgba(30, 41, 59, 0.78)",
                "circle-radius": ["step", ["get", "point_count"], 20, 5, 26, 15, 32],
                "circle-opacity": 0.55,
                "circle-stroke-width": 1.25,
                "circle-stroke-color": "rgba(34, 211, 238, 0.45)",
              },
            },
            beforeGames
          );

          mapInstance.addLayer(
            {
              id: L_VENUE_GL_CLUSTER_ICON,
              type: "symbol",
              source: SRC_VENUE_POINTS,
              filter: ["has", "point_count"],
              layout: {
                "icon-image": venueClusterIconImageExpression() as import("mapbox-gl").Expression,
                "icon-size": MapCfg.VENUE_ICON_LAYOUT_BASE * 0.92,
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
              },
            },
            beforeGames
          );

          mapInstance.addLayer(
            {
              id: L_VENUE_DOTS_PULSE,
              type: "circle",
              source: SRC_VENUE_POINTS,
              filter: pointFilter,
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
              source: SRC_VENUE_POINTS,
              filter: pointFilter,
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
              source: SRC_VENUE_POINTS,
              filter: pointFilter,
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

          mapInstance.addLayer(
            {
              id: L_VENUE_SPORT_ICON,
              type: "symbol",
              source: SRC_VENUE_POINTS,
              filter: pointFilter,
              layout: {
                "icon-image": ["coalesce", ["get", "sport_map_icon"], getGameMapboxIconId("other")],
                "icon-size": MapCfg.VENUE_ICON_LAYOUT_BASE,
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
                "icon-pitch-alignment": "viewport",
                "icon-rotation-alignment": "viewport",
              },
            },
            beforeGames
          );

          try {
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
                mapInstance.setFeatureState({ source: SRC_VENUE_POINTS, id: venueHoverPointerId }, { hover: false });
              } catch (_) {}
            }
            venueHoverPointerId = id;
            venueHoverIdRef.current = id;
            venueHoverTargetRef.current = 1;
            try {
              mapInstance.setFeatureState({ source: SRC_VENUE_POINTS, id }, { hover: true });
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
                mapInstance.setFeatureState({ source: SRC_VENUE_POINTS, id: hid }, { hover: false });
              } catch (_) {}
            }, MapCfg.VENUE_HOVER_LEAVE_DEBOUNCE_MS);
          };

          const onVenuePointClick = (e: {
            features?: import("mapbox-gl").MapboxGeoJSONFeature[];
            point: { x: number; y: number };
          }) => {
            const hitGames = mapInstance.queryRenderedFeatures(
              e.point as unknown as import("mapbox-gl").PointLike,
              { layers: [L_GAME_ICON, L_GAME_CLUSTERS] }
            );
            if (hitGames.length) return;

            const id = e.features?.[0]?.properties?.id as string | undefined;
            if (!id) return;
            const cl = venueClustersRef.current.find((c) => c.properties.id === id);
            if (cl) selectVenueFromCluster(cl);
          };

          mapInstance.on("click", L_VENUE_GL_CLUSTERS, (e) => {
            const hitGames = mapInstance.queryRenderedFeatures(
              e.point as unknown as import("mapbox-gl").PointLike,
              { layers: [L_GAME_ICON, L_GAME_CLUSTERS] }
            );
            if (hitGames.length) return;

            const f = e.features?.[0];
            const raw = f?.properties?.cluster_id;
            const clusterId = typeof raw === "number" ? raw : Number(raw);
            if (raw == null || Number.isNaN(clusterId)) return;
            const src = mapInstance.getSource(SRC_VENUE_POINTS) as import("mapbox-gl").GeoJSONSource;
            src.getClusterExpansionZoom(clusterId, (err, z) => {
              if (err || z == null || !f?.geometry || f.geometry.type !== "Point") return;
              mapInstance.easeTo({
                center: f.geometry.coordinates as [number, number],
                zoom: z,
                duration: 450,
              });
            });
          });

          mapInstance.on("click", L_VENUE_SPORT_ICON, onVenuePointClick);
          mapInstance.on("click", L_VENUE_DOTS, onVenuePointClick);
          mapInstance.on("click", L_VENUE_DOTS_PULSE, onVenuePointClick);
          mapInstance.on("click", L_VENUE_DOTS_PULSE_INNER, onVenuePointClick);

          [L_VENUE_SPORT_ICON, L_VENUE_DOTS_PULSE, L_VENUE_DOTS_PULSE_INNER, L_VENUE_DOTS].forEach((lid) => {
            mapInstance.on("mouseenter", lid, (ev) => {
              mapInstance.getCanvas().style.cursor = "pointer";
              onVenueMarkerHoverEnter(ev);
            });
            mapInstance.on("mouseleave", lid, () => {
              mapInstance.getCanvas().style.cursor = "";
              onVenueMarkerHoverLeave();
            });
          });

          setVenueLayerEpoch((n) => n + 1);
        }

        applyMapLayerVisibility();
      } catch (err) {
        console.warn("[FUN] venue layer add failed", err);
      } finally {
        onDone?.();
      }
    };

    let cancelled = false;
    let venueKickoffStarted = false; // ensures the fetch only starts once
    let idleFallbackId: number | undefined; // timer that starts the fetch even if "idle" never fires
    const venueFetchAbort = new AbortController(); // lets us cancel the network request on cleanup

    // Starts the venue fetch/render. Called once the map goes idle (or after a 2.5s fallback).
    const kickoffVenueFetch = () => {
      if (cancelled || venueKickoffStarted) return;
      if (map.getZoom() < MapCfg.VENUE_FETCH_MIN_ZOOM) return;

      venueKickoffStarted = true;
      if (idleFallbackId !== undefined) {
        clearTimeout(idleFallbackId);
        idleFallbackId = undefined;
      }
      map.off("idle", kickoffVenueFetch);
      map.off("zoomend", onVenueZoomForFetch);

      onVenuesFetchLoadingChangeRef.current?.(true); // show the loading indicator
      // Hides the loading indicator after the next couple of frames (so the paint lands first).
      const finishLoading = () => {
        const done = () => onVenuesFetchLoadingChangeRef.current?.(false);
        if (typeof requestAnimationFrame !== "undefined") {
          requestAnimationFrame(() => requestAnimationFrame(done));
        } else {
          window.setTimeout(done, 0);
        }
      };

      fetchSportsVenuesWithProgress(
        debouncedVenueFetchCenter.lat,
        debouncedVenueFetchCenter.lng,
        venueSearchRadiusKm,
        {
          signal: venueFetchAbort.signal,
          sportFilter: venueSportsFilter,
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
          addVenueMarkers(geojson, () => {
            if (cancelled) return;
            finishLoading();
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const name = err instanceof Error ? err.name : "";
          if (name === "AbortError") return; // expected when we cancel — not a real error
          onVenuesFetchLoadingChangeRef.current?.(false);
        });
    };

    const onVenueZoomForFetch = () => {
      if (!venueKickoffStarted && map.getZoom() >= MapCfg.VENUE_FETCH_MIN_ZOOM) {
        kickoffVenueFetch();
      }
    };

    map.on("idle", kickoffVenueFetch);
    map.on("zoomend", onVenueZoomForFetch);
    idleFallbackId = window.setTimeout(kickoffVenueFetch, 2500);
    if (map.isStyleLoaded()) {
      kickoffVenueFetch();
    }

    // Cleanup: cancel any in-flight fetch and detach the idle/fallback triggers.
    return () => {
      cancelled = true;
      venueFetchAbort.abort();
      if (idleFallbackId !== undefined) clearTimeout(idleFallbackId);
      map.off("idle", kickoffVenueFetch);
      map.off("zoomend", onVenueZoomForFetch);
      onVenuesFetchLoadingChangeRef.current?.(false);
    };
  }, [
    mapLoaded,
    basemapStyleEpoch,
    venueFetchKey,
    venueFetchDataKey,
    debouncedVenueFetchCenter,
    venueSearchRadiusKm,
    venueSportsFilter,
    onSelectVenue,
    pauseVenueFetch,
    venueFetchEnabled,
    centerOnUserTrigger,
  ]);

  // Games happening at (within 120m of) the selected venue — shown inside the venue card.
  const gamesAtSelectedVenue = useMemo(() => {
    if (!selectedVenue) return [];
    return openGamesNearPoint(games, selectedVenue.center.lat, selectedVenue.center.lng, 120);
  }, [games, selectedVenue]);

  const openGamesNearbyCount = gamesAtSelectedVenue.length;

  // —— Render ——
  // Error/empty state: no token or the map failed to load.
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
      {/* The Mapbox canvas mounts into this div. */}
      <div
        ref={containerRef}
        className={`absolute inset-0 w-full h-full ${!mapLoaded ? "pointer-events-none" : ""}`}
        style={{ minHeight: "100%" }}
      />
      {/* "Zoom in to explore games" hint when games are hidden at low zoom. */}
      {mapUxHint && (
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-36 z-30 max-w-sm px-4 py-2 rounded-full bg-slate-900/75 border border-slate-600/60 text-slate-300 text-xs text-center backdrop-blur-md shadow-lg"
          role="status"
        >
          {mapUxHint}
        </div>
      )}
      {/* Game join/info card, anchored to the tapped game's screen position. */}
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

      {/* Centered venue modal: action-first, with in-app OSM/Wikidata details (ℹ️). */}
      {selectedVenue && mapLoaded && (
        <VenueInfoPopup
          venue={selectedVenue}
          open
          openGamesNearbyCount={openGamesNearbyCount}
          gamesNearby={gamesAtSelectedVenue}
          joinedGameIds={joinedSet}
          viewerCoords={userCoords}
          onJoinGame={onJoinGame}
          onOpenChat={onOpenMessagesForGame}
          onClose={() => {
            onSelectVenue(null);
            setVenuePopupPoint(null);
          }}
          onCreateGame={(venue) => {
            onCreateGameAtVenue?.(venue, venuePopupPoint ?? undefined);
            onSelectVenue(null);
            setVenuePopupPoint(null);
          }}
        />
      )}

      {/* Chooser modal listing all games stacked at one location. */}
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

      {/* 3D Ready Player Me avatar overlay (only when 3D mode + a real GLB URL are present). */}
      {mapLoaded && use3DOverlay && userCoords && mapRef.current && avatarGlbUrl && (
        <React.Suspense fallback={null}>
          <Avatar3DOverlay
            map={mapRef.current}
            userCoords={userCoords}
            glbUrl={avatarGlbUrl}
          />
        </React.Suspense>
      )}
    </div>
  );
}
