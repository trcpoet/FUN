/**
 * Single shared dynamic import for mapbox-gl — avoids duplicate chunk fetches / parse work
 * when MapboxMap and effects each called `import("mapbox-gl")` separately.
 */
import type { MapboxGl } from "./mapboxGlLoader";

let mapboxModulePromise: Promise<MapboxGl> | null = null;

export type { MapboxGl };

export function loadMapboxGl(): Promise<MapboxGl> {
  if (!mapboxModulePromise) {
    mapboxModulePromise = import("./mapboxGlLoader").then((mod) => {
      const api = mod.mapboxgl ?? mod.default;
      if (!api?.Map) {
        throw new Error("mapbox-gl failed to load (Map export missing)");
      }
      return api;
    });
  }
  return mapboxModulePromise;
}

/** Fire-and-forget prefetch (e.g. on app mount) so the chunk loads alongside the route bundle. */
export function prefetchMapboxGl(): void {
  loadMapboxGl().catch(() => {});
}
