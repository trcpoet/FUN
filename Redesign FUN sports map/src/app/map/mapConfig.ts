/**
 * Tunable map UX constants — venue whisper, games speak when local enough.
 * Adjust thresholds here rather than hunting through MapboxMap.tsx.
 */

/** Venue footprint (polygon) fill — default calm state */
// IMPORTANT: polygon opacity is also controlled by `fill-opacity` in Mapbox style,
// so these colors should NOT include extra alpha (otherwise it becomes nearly invisible).
export const VENUE_FILL_COLOR_DEFAULT = "#94a3b8"; // slate-400 (grey)
export const VENUE_FILL_COLOR_HOVER = "rgba(100, 116, 139, 0.16)";
/** Selected venue: warm but not alarm-yellow */
export const VENUE_FILL_COLOR_SELECTED = "#e2e8f0"; // slate-200 (grey)

export const VENUE_OUTLINE_COLOR_DEFAULT = "rgba(148, 163, 184, 0.30)"; // subtle grey
export const VENUE_OUTLINE_COLOR_SELECTED = "rgba(226, 232, 240, 0.55)"; // subtle selected grey
export const VENUE_OUTLINE_WIDTH_DEFAULT = 1;
export const VENUE_OUTLINE_WIDTH_SELECTED = 1.75;

/**
 * Small center dot on venue cluster (map-native, no flag icon).
 * @alias VENUE_MARKER_SIZE — use radius as the primary “size” knob for venue glyphs.
 */
// Increased for visibility at neighborhood scale.
export const VENUE_DOT_RADIUS_PX = 5;
export const VENUE_MARKER_BASE_RADIUS_PX = VENUE_DOT_RADIUS_PX;

/** Default footprint fill strength (also set on layer; tune 0.08–0.18). */
export const VENUE_MARKER_FILL_OPACITY_DEFAULT = 0.12;

export const VENUE_DOT_RADIUS_HOVER_PX = 5;
export const VENUE_DOT_RADIUS_SELECTED_PX = 7.5;
export const VENUE_DOT_COLOR = "rgb(148, 163, 184)"; // slate-400
export const VENUE_DOT_STROKE = "rgba(15, 23, 42, 0.35)";
export const VENUE_DOT_STROKE_WIDTH = 0.75;
export const VENUE_DOT_COLOR_SELECTED = "rgb(226, 232, 240)"; // slate-200
export const VENUE_DOT_GLOW_WIDTH_SELECTED = 12;
export const VENUE_DOT_GLOW_OPACITY_SELECTED = 0.25;

/** Polygon footprint radius around clustered venue (meters) — smaller = subtler */
export const VENUE_AREA_RADIUS_METERS = 42;

// —— Zoom / bounds: when is “near me” meaningful? ——————————————

/** Below this zoom: hide all game layers (clusters + individuals). World / continent view. */
export const GAME_LAYER_MIN_ZOOM = 8.5;

/**
 * Below this zoom: hide individual unclustered game symbols; clusters still allowed
 * if within [GAME_LAYER_MIN_ZOOM, GAME_INDIVIDUAL_MIN_ZOOM).
 */
export const GAME_INDIVIDUAL_MIN_ZOOM = 11.75;

/** First zoom where individual game pins / emoji are allowed (with bounds check). */
export const GAME_VISIBILITY_MIN_ZOOM = GAME_INDIVIDUAL_MIN_ZOOM;

/** First zoom where any game layer (including clusters) may appear. */
export const CLUSTER_MIN_ZOOM = GAME_LAYER_MIN_ZOOM;

/**
 * Mapbox `clusterMaxZoom`: above this zoom, the source emits individual points.
 * Keep this **below** `GAME_INDIVIDUAL_MIN_ZOOM` so singles stay hidden until the local gate.
 */
export const GAME_CLUSTER_MAX_ZOOM = 11;

/** Alias — same as `GAME_CLUSTER_MAX_ZOOM` (Mapbox cluster dissolution). */
export const CLUSTER_MAX_ZOOM = GAME_CLUSTER_MAX_ZOOM;

/** Zoom ceiling for “clusters only” product mode (individuals use `GAME_INDIVIDUAL_MIN_ZOOM`). */
export const CLUSTER_ONLY_MAX_ZOOM = GAME_INDIVIDUAL_MIN_ZOOM;

/** Pixel radius for game clustering (merge nearby pins when zoomed out). */
export const GAME_CLUSTER_RADIUS_PX = 58;

/** Show venue area polygons only when zoom is at or above this (neighborhood+). */
export const VENUE_FOOTPRINT_MIN_ZOOM = 9.5;

/** Show venue center dots when zoom >= this (slightly earlier than full footprint). */
export const VENUE_DOT_MIN_ZOOM = 8.5;

/** Product alias — first zoom where any venue affordance appears (dots). */
export const VENUE_VISIBILITY_MIN_ZOOM = VENUE_DOT_MIN_ZOOM;

/** Hide everything venue-related below this (optional hard floor). */
export const VENUE_LAYER_MIN_ZOOM = 8;

/** If visible bounds width exceeds this (km), treat as non-local; tighten game display. */
export const LOCAL_BOUNDS_THRESHOLD_KM = 35;

/** When zoom is local but many games, cap points sent to the map (nearest to center). */
export const MAX_VISIBLE_INDIVIDUAL_GAMES = 72;

/** Other players: only when zoomed in enough to be socially relevant. */
export const PLAYER_MARKERS_MIN_ZOOM = 12.5;

/** Throttle ms for visibility recalculation on move/zoom */
export const MAP_VISIBILITY_THROTTLE_MS = 80;
