/**
 * The ONLY module allowed to import mapbox-gl at runtime; everything else goes
 * through loadMapboxGl() in mapboxCached.ts (type-only `import("mapbox-gl").X`
 * positions are fine — they erase at compile time).
 *
 * Why this exact pattern:
 * - mapbox-gl declares "type": "module" but its `main` is a UMD bundle with no
 *   ESM exports, so it only has a default export after bundler interop. That
 *   interop exists in dev ONLY because vite.config.ts lists mapbox-gl in
 *   optimizeDeps.include (prod gets it from Rollup's CJS plugin). If mapbox-gl
 *   is ever excluded from prebundling again, this static import links against
 *   the raw UMD and the map dies with "accessToken on undefined" /
 *   "Map export missing".
 * - The static import lives in this tiny module, and the app reaches it via
 *   dynamic import, so mapbox-gl stays out of the entry chunk but there is a
 *   single statically-analyzable interop point in both dev and build.
 */
import "mapbox-gl/dist/mapbox-gl.css";
import mapboxgl from "mapbox-gl";

export type MapboxGl = typeof mapboxgl;
export { mapboxgl };
export default mapboxgl;
