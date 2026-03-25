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
export const VENUE_DOT_RADIUS_PX = 6.5;
export const VENUE_MARKER_BASE_RADIUS_PX = VENUE_DOT_RADIUS_PX;

/** Default footprint fill strength (also set on layer; tune 0.08–0.18). */
export const VENUE_MARKER_FILL_OPACITY_DEFAULT = 0.12;

/** Hover: slightly shrink dot / icon (slow zoom-out feel). */
export const VENUE_DOT_HOVER_SCALE = 0.88;
/** Footprint opacity when hovering (between default 0.12 and selected 0.22). */
export const VENUE_FILL_OPACITY_HOVER = 0.16;
/** Mapbox paint transition duration for venue dot + footprint hover (ms). */
export const MAP_MARKER_HOVER_TRANSITION_MS = 750;
/** Mapbox `icon-size` for individual game sport symbols (was ~0.82; larger = bigger emoji on map). */
export const GAME_ICON_LAYOUT_BASE = 0.96;
/** Selected game icon scale (vs `GAME_ICON_LAYOUT_BASE`). */
export const GAME_ICON_LAYOUT_SELECTED = 1.15;
/** Legacy peak scale (unused for click — tap uses dip below base; kept for tuning reference). */
export const GAME_ICON_LAYOUT_BUMP_PEAK = 1.26;
/** During GL tap: `icon-size` multiplies base by this at the deepest “press” (zoom out, then return). */
export const GAME_ICON_GL_CLICK_DIP_MULT = 0.86;
/** Game sport icon: multiply base layout size when hovered (under 1 = zoom out). */
export const GAME_ICON_HOVER_MULT = 0.92;
/**
 * Exponential smoothing time constant (ms) for hover zoom in/out (rAF + dt).
 * Higher = slower, smoother settle (especially when leaving after a click).
 */
export const GAME_ICON_HOVER_TAU_MS = 1050;

/** Individual game sport icons (GL): subtle rotation wobble amplitude (degrees). */
export const GAME_ICON_ROTATE_AMPLITUDE_DEG = 5;
/** Full oscillation period (ms) for the sport icon rotation wobble. */
export const GAME_ICON_ROTATE_PERIOD_MS = 5200;
/** GL click: slow zoom-out → return (ms). One half-sine on `icon-size` dip. */
export const GAME_ICON_BUMP_DURATION_MS = 1400;
/**
 * HTML pins: same gesture, longer so the DOM scale read matches GL (rAF + `htmlPinPressScale`).
 */
export const GAME_ICON_HTML_BUMP_DURATION_MS = 4200;
/** Max scale loss at bottom of press (1 = full shrink). */
export const GAME_ICON_HTML_PRESS_DEPTH = 0.12;

/** Smoothstep — eases both ends of normalized time (0–1). */
export function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * 0→1→0 envelope for GL `icon-size` click dip: slow in/out (smoothstep time) × sine hump.
 */
export function glIconClickBumpPulse(elapsedMs: number, totalMs: number): number {
  const u = Math.min(1, Math.max(0, elapsedMs / totalMs));
  return Math.sin(smoothstep01(u) * Math.PI);
}

/**
 * Smooth press/release: sin²(π·τ) has **zero derivative** at τ=0 and τ=1 (unlike plain sin).
 * τ is double-smoothstepped from linear time so zoom-out / return feels deliberate, not snappy.
 */
export function htmlPinPressScale(
  elapsedMs: number,
  totalMs: number,
  pressDepth = GAME_ICON_HTML_PRESS_DEPTH
): number {
  const u = Math.min(1, Math.max(0, elapsedMs / totalMs));
  const tau = smoothstep01(smoothstep01(u));
  return 1 - pressDepth * Math.sin(Math.PI * tau) ** 2;
}
/** Mouseleave debounce when moving between venue polygon and dot (avoids hover flicker). */
export const VENUE_HOVER_LEAVE_DEBOUNCE_MS = 60;

export const VENUE_DOT_RADIUS_HOVER_PX = 5;
export const VENUE_DOT_RADIUS_SELECTED_PX = 9.25;
export const VENUE_DOT_COLOR = "rgb(34, 211, 238)"; // cyan-400 — reads as “interactive” vs basemap
export const VENUE_DOT_STROKE = "rgba(2, 6, 23, 0.75)"; // near-black halo for contrast
export const VENUE_DOT_STROKE_WIDTH = 1.1;
export const VENUE_DOT_COLOR_SELECTED = "rgb(125, 211, 252)"; // sky-300 — selected reads “lit”
export const VENUE_DOT_GLOW_WIDTH_SELECTED = 12;
export const VENUE_DOT_GLOW_OPACITY_SELECTED = 0.32;

/**
 * Pulsating halos — dark bluish-purple “gradient” (two layers + RGB lerp in rAF).
 * Idle: steady pulse; after venue click/selection: hz eases down to a slow calm (see MapboxMap).
 */
export const VENUE_PULSE_OUTER_RGB_A = { r: 8, g: 145, b: 178 } as const; // cyan-ish dark
export const VENUE_PULSE_OUTER_RGB_B = { r: 56, g: 189, b: 248 } as const; // sky-400
export const VENUE_PULSE_INNER_RGB_A = { r: 34, g: 211, b: 238 } as const; // cyan-400
export const VENUE_PULSE_INNER_RGB_B = { r: 125, g: 211, b: 252 } as const; // sky-300

/** Halo grow/shrink range (px) — large swing so expansion reads clearly on the map */
export const VENUE_DOT_PULSE_RADIUS_MIN_PX = 9;
export const VENUE_DOT_PULSE_RADIUS_MAX_PX = 34;
export const VENUE_DOT_PULSE_INNER_RADIUS_MIN_PX = 6;
export const VENUE_DOT_PULSE_INNER_RADIUS_MAX_PX = 22;
/** Inner ring phase offset (rad) — slight lag vs outer for a softer “breathe” */
export const VENUE_PULSE_INNER_PHASE_LAG_RAD = 0.65;
export const VENUE_DOT_PULSE_OPACITY_MIN = 0.08;
export const VENUE_DOT_PULSE_OPACITY_MAX = 0.22;
export const VENUE_DOT_PULSE_INNER_OPACITY_MAX = 0.28;
export const VENUE_DOT_PULSE_BLUR_MIN = 0.95;
export const VENUE_DOT_PULSE_BLUR_MAX = 1.25;
export const VENUE_DOT_PULSE_INNER_BLUR_MIN = 0.45;
export const VENUE_DOT_PULSE_INNER_BLUR_MAX = 0.8;

/** Outer pulse only: animated ring — dark + thin when contracted, light + thick when expanded */
export const VENUE_DOT_PULSE_STROKE_WIDTH_MIN_PX = 0.6;
export const VENUE_DOT_PULSE_STROKE_WIDTH_MAX_PX = 1.9;
export const VENUE_PULSE_STROKE_RGB_DARK = { r: 2, g: 6, b: 23 } as const; // slate-950
export const VENUE_PULSE_STROKE_RGB_LIGHT = { r: 224, g: 242, b: 254 } as const; // sky-100-ish

/** Constant inviting pulse (cycles/s) */
export const VENUE_DOT_PULSE_HZ_IDLE = 0.4;
/** Slows into this when a venue is selected (pairs with footprint / dot emphasis) */
export const VENUE_DOT_PULSE_HZ_SELECTED = 0.09;
/** How fast idle ↔ selected pulse speed blends (higher = snappier) */
export const VENUE_DOT_PULSE_HZ_SMOOTHING = 6;

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
