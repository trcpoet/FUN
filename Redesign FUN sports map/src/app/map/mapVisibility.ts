import type { Map } from "mapbox-gl";
import { approxVisibleBoundsWidthKm } from "./mapBounds";
import {
  GAME_INDIVIDUAL_MIN_ZOOM,
  GAME_LAYER_MIN_ZOOM,
  LOCAL_BOUNDS_THRESHOLD_KM,
  PLAYER_MARKERS_MIN_ZOOM,
  VENUE_DOT_MIN_ZOOM,
  VENUE_FOOTPRINT_MIN_ZOOM,
  VENUE_LAYER_MIN_ZOOM,
} from "./mapConfig";

/**
 * Coarse map mode for product copy / future rules.
 * GLOBAL ≈ country+, REGIONAL ≈ metro multi-county, CITY ≈ city core,
 * NEIGHBORHOOD ≈ few km, LOCAL ≈ walkable block scale.
 */
export type MapDiscoveryMode = "GLOBAL" | "REGIONAL" | "CITY" | "NEIGHBORHOOD" | "LOCAL";

export function getMapDiscoveryMode(zoom: number, boundsWidthKm: number): MapDiscoveryMode {
  if (zoom < 9 || boundsWidthKm > 800) return "GLOBAL";
  if (zoom < 10.5 || boundsWidthKm > 200) return "REGIONAL";
  if (zoom < 11.5 || boundsWidthKm > 80) return "CITY";
  if (zoom < 13 || boundsWidthKm > LOCAL_BOUNDS_THRESHOLD_KM) return "NEIGHBORHOOD";
  return "LOCAL";
}

/** Game cluster bubbles (aggregated counts) — on when zoom not too low. */
export function shouldShowGameClusters(zoom: number, boundsWidthKm: number): boolean {
  if (zoom < GAME_LAYER_MIN_ZOOM) return false;
  // Extremely wide view: clusters are still noise
  if (boundsWidthKm > LOCAL_BOUNDS_THRESHOLD_KM * 2.5 && zoom < GAME_INDIVIDUAL_MIN_ZOOM) return false;
  return zoom < GAME_INDIVIDUAL_MIN_ZOOM;
}

/** Individual game pins + emoji — only when view is “local enough”. */
export function shouldShowGameIndividuals(zoom: number, boundsWidthKm: number): boolean {
  if (zoom < GAME_INDIVIDUAL_MIN_ZOOM) return false;
  if (boundsWidthKm > LOCAL_BOUNDS_THRESHOLD_KM * 1.35) return false;
  return true;
}

/** Soft green/gray venue footprints — neighborhood scale and in. */
export function shouldShowVenueFootprints(zoom: number): boolean {
  return zoom >= VENUE_FOOTPRINT_MIN_ZOOM && zoom >= VENUE_LAYER_MIN_ZOOM;
}

/** Small venue center dots — slightly earlier than full footprints. */
export function shouldShowVenueDots(zoom: number): boolean {
  return zoom >= VENUE_DOT_MIN_ZOOM && zoom >= VENUE_LAYER_MIN_ZOOM;
}

export function shouldShowPlayerMarkers(zoom: number): boolean {
  return zoom >= PLAYER_MARKERS_MIN_ZOOM;
}

/** Convenience: read live values from map instance. */
export function getViewportMetrics(map: Map): { zoom: number; boundsWidthKm: number; mode: MapDiscoveryMode } {
  const zoom = map.getZoom();
  const boundsWidthKm = approxVisibleBoundsWidthKm(map);
  return {
    zoom,
    boundsWidthKm,
    mode: getMapDiscoveryMode(zoom, boundsWidthKm),
  };
}
