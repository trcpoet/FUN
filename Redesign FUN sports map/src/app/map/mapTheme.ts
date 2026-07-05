/**
 * FUN basemap theme — "night court".
 *
 * The Studio style (mapbox://styles/trcpoet/…) is a Mapbox Dark fork whose Studio
 * edits drifted loud: bright #1e77eb water, purple #22006b roads / #c46bff buildings,
 * white bridge casings, saturated #006b3d greens. This module re-anchors every basemap
 * surface to the app's chrome (slate-950/900 UI, cyan `--primary`, amber cluster rings)
 * at runtime, so the palette is versioned here instead of hiding in Studio.
 *
 * Design rules (tune colors here, not in MapboxMap.tsx):
 *  - One hue family: everything sits on blue-slate (~hue 218), value-laddered —
 *    land darkest → water a luminous harbor blue → roads/buildings a whisper lighter.
 *  - Saturation is reserved for DATA (cyan venue dots, amber clusters, emoji pins).
 *    The single sanctioned exception: `pitch` landuse — real courts/fields — glows
 *    faint teal, a quiet nod to the cyan primary. This app is about places to play.
 *  - Fog/atmosphere stays Studio-owned (see STUDIO_ATMOSPHERE_HINT in mapConfig.ts).
 *    Scene LIGHTING however is code-owned here: the Studio style ships warm dusk
 *    v3 `lights` (directional #ffd4a8 @0.5 + ambient #1a2332 @0.3) that multiply
 *    every layer's paint by ~(r .32, g .21, b .13) in linear space — pixel-sampled;
 *    no palette survives that orange filter. BASEMAP_LIGHTS replaces them with a
 *    neutral-cool pair tuned so flat fills render ≈ their true hex while building
 *    extrusions keep directional face modeling. (Do not use legacy setLight().)
 *
 * Applied from applyCinematicBasemap() after every style.load, so it survives the
 * satellite toggle round-trip. Every write is guarded — on satellite (no `land`
 * background layer) it exits without touching anything.
 */

type MapboxGlMap = import("mapbox-gl").Map;

// —— Value ladder (dark → light) ————————————————————————————————
export const BASEMAP_LAND = "#0b1220"; // blue-black night, between slate-950/900
export const BASEMAP_CASING = "#060b16"; // bridge casings + boundary halos: darker than land
export const BASEMAP_WATER = "#1a3050"; // night harbor — clearly bluer + lighter than land, calm vs cyan dots
export const BASEMAP_WATERWAY = "#24496e"; // rivers/canals: one step up from water fill
export const BASEMAP_BUILDING = "#1f2c42"; // extrusions: readable at pitch, still a whisper
export const BASEMAP_TUNNEL = "#1a2436"; // tunnels recede below surface roads
export const BASEMAP_ROAD = "#26334c"; // all surface roads + bridge decks
export const BASEMAP_PATH = "#2b3a54"; // footpaths / steps / pedestrian streets
export const BASEMAP_TRAIL = "#31514f"; // trails + cycleways: faint teal — sport surfaces
export const BASEMAP_RAIL = "#1c2638";
export const BASEMAP_AEROWAY = "#1e293b"; // runways/taxiways: slate-800

// —— Greens (desaturated, park-ness reads but stays quiet) ——————————
export const BASEMAP_PARK = "#123122"; // park / grass / agriculture
export const BASEMAP_WOOD = "#0e2519"; // wood / scrub: darker canopy
export const BASEMAP_PITCH = "#135049"; // sports fields — the one thematic teal glow
export const BASEMAP_SAND = "#2e2b1f"; // beaches / sand courts: dark khaki
export const BASEMAP_NATIONAL_PARK = "#164a2f";

// —— Labels (cool grays; halos tinted to the land so text sits "in" the canvas) ——
export const BASEMAP_LABEL_HALO = "#0a101d";
export const BASEMAP_ROAD_LABEL = "#94a3b8"; // slate-400
export const BASEMAP_POI_LABEL = "#6f7f96"; // quiet — cyan venue dots own the "place" signal
export const BASEMAP_NATURE_LABEL = "#6f8296";
export const BASEMAP_WATER_LABEL = "#4f6f95";

/**
 * Neutral-cool scene lights (v3). Horizontal fills receive ambient (0.75) plus
 * directional × cos(polar 42°) ≈ 0.26 → ≈ 1.0 total, so paint colors render true;
 * vertical extrusion faces catch less directional and shade naturally darker.
 */
export const BASEMAP_LIGHTS: import("mapbox-gl").LightsSpecification[] = [
  { id: "ambient", type: "ambient", properties: { color: "#ffffff", intensity: 0.75 } },
  {
    id: "directional",
    type: "directional",
    properties: { color: "#d8e6ff", intensity: 0.35, direction: [210, 42], "cast-shadows": false },
  },
];

/** Paint overrides applied over the Studio style. Missing layers are skipped. */
const BASEMAP_PAINT_OVERRIDES: ReadonlyArray<readonly [layer: string, prop: string, value: unknown]> = [
  // Land & structures
  ["land", "background-color", BASEMAP_LAND],
  ["land-structure-polygon", "fill-color", "#111d31"], // piers: built ground over water
  ["land-structure-line", "line-color", "#0d1626"],
  ["aeroway-polygon", "fill-color", BASEMAP_AEROWAY],
  ["aeroway-line", "line-color", BASEMAP_AEROWAY],

  // Water
  ["water", "fill-color", BASEMAP_WATER],
  ["waterway", "line-color", BASEMAP_WATERWAY],

  // Landuse — per-class ladder replaces the flat saturated green
  [
    "landuse",
    "fill-color",
    [
      "match",
      ["get", "class"],
      "pitch",
      BASEMAP_PITCH,
      ["park", "grass", "agriculture"],
      BASEMAP_PARK,
      ["wood", "scrub"],
      BASEMAP_WOOD,
      "sand",
      BASEMAP_SAND,
      "airport",
      "#141d2f",
      "glacier",
      "#1b2a3d",
      "residential",
      "#0d1524",
      "#101c2c", // fallback: neutral slate
    ],
  ],
  ["national-park", "fill-color", BASEMAP_NATIONAL_PARK],

  // Roads — value ladder, no more purple/white
  ["road-simple", "line-color", BASEMAP_ROAD],
  ["bridge-simple", "line-color", BASEMAP_ROAD],
  ["bridge-case-simple", "line-color", BASEMAP_CASING],
  ["tunnel-simple", "line-color", BASEMAP_TUNNEL],
  ["road-rail", "line-color", BASEMAP_RAIL],
  ["bridge-rail", "line-color", BASEMAP_RAIL],

  // Paths — trails/cycleways get the sporty teal, plain footways stay slate
  ["road-path-trail", "line-color", BASEMAP_TRAIL],
  ["road-path-cycleway-piste", "line-color", BASEMAP_TRAIL],
  ["bridge-path-trail", "line-color", BASEMAP_TRAIL],
  ["bridge-path-cycleway-piste", "line-color", BASEMAP_TRAIL],
  ["tunnel-path-trail", "line-color", "#28403f"],
  ["tunnel-path-cycleway-piste", "line-color", "#28403f"],
  ["road-path", "line-color", BASEMAP_PATH],
  ["road-steps", "line-color", BASEMAP_PATH],
  ["road-pedestrian", "line-color", BASEMAP_PATH],
  ["bridge-path", "line-color", BASEMAP_PATH],
  ["bridge-steps", "line-color", BASEMAP_PATH],
  ["bridge-pedestrian", "line-color", BASEMAP_PATH],
  ["tunnel-path", "line-color", "#232f45"],
  ["tunnel-steps", "line-color", "#232f45"],
  ["tunnel-pedestrian", "line-color", "#232f45"],

  // Admin boundaries — desaturated slate instead of neutral gray
  ["admin-0-boundary", "line-color", "#3d4a63"],
  ["admin-0-boundary-disputed", "line-color", "#3d4a63"],
  ["admin-1-boundary", "line-color", "#33405a"],
  ["admin-0-boundary-bg", "line-color", BASEMAP_CASING],
  ["admin-1-boundary-bg", "line-color", BASEMAP_CASING],

  // Buildings (fill-extrusion) — was #c46bff purple
  ["building", "fill-extrusion-color", BASEMAP_BUILDING],

  // Labels — kill the lavender road text; cool the neutral grays
  ["road-label-simple", "text-color", BASEMAP_ROAD_LABEL],
  ["road-label-simple", "text-halo-color", BASEMAP_LAND],
  ["poi-label", "text-color", BASEMAP_POI_LABEL],
  ["poi-label", "text-halo-color", BASEMAP_LABEL_HALO],
  ["natural-point-label", "text-color", BASEMAP_NATURE_LABEL],
  ["natural-point-label", "text-halo-color", BASEMAP_LABEL_HALO],
  ["natural-line-label", "text-color", BASEMAP_NATURE_LABEL],
  ["natural-line-label", "text-halo-color", BASEMAP_LABEL_HALO],
  ["waterway-label", "text-color", BASEMAP_WATER_LABEL],
  ["waterway-label", "text-halo-color", BASEMAP_LABEL_HALO],
  ["water-point-label", "text-color", BASEMAP_WATER_LABEL],
  ["water-point-label", "text-halo-color", BASEMAP_LABEL_HALO],
  ["water-line-label", "text-color", BASEMAP_WATER_LABEL],
  ["water-line-label", "text-halo-color", BASEMAP_LABEL_HALO],
  ["airport-label", "text-color", "#7c8ba1"],
  ["airport-label", "text-halo-color", BASEMAP_LABEL_HALO],
  ["settlement-subdivision-label", "text-color", "#7c8ba1"],
  ["settlement-subdivision-label", "text-halo-color", BASEMAP_LABEL_HALO],
  [
    "settlement-minor-label",
    "text-color",
    ["step", ["get", "symbolrank"], "#a6b3c7", 11, "#8393aa", 16, "#697c95"],
  ],
  ["settlement-minor-label", "text-halo-color", BASEMAP_LABEL_HALO],
  [
    "settlement-major-label",
    "text-color",
    ["step", ["get", "symbolrank"], "#a6b3c7", 11, "#8393aa", 16, "#697c95"],
  ],
  ["settlement-major-label", "text-halo-color", BASEMAP_LABEL_HALO],
];

/**
 * Re-anchor the basemap to the FUN palette. Idempotent and cheap (paint-only);
 * call after every `style.load`. No-ops on satellite (guarded by the `land` layer).
 */
export function applyFunBasemapTheme(map: MapboxGlMap): void {
  try {
    if (!map.getLayer("land") || !map.getLayer("water")) return; // satellite or foreign style
  } catch (_) {
    return; // style mid-swap
  }

  for (const [layer, prop, value] of BASEMAP_PAINT_OVERRIDES) {
    try {
      if (!map.getLayer(layer)) continue;
      map.setPaintProperty(
        layer,
        prop as never,
        value as never
      );
    } catch (_) {
      /* one bad layer must not take down the rest of the theme */
    }
  }

  // Replace the style's warm dusk lights — they orange-multiply the whole basemap.
  try {
    map.setLights(BASEMAP_LIGHTS);
  } catch (_) {}
}
