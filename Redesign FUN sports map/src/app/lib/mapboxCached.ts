/**
 * Single shared dynamic import for mapbox-gl — avoids duplicate chunk fetches / parse work
 * when MapboxMap and effects each called `import("mapbox-gl")` separately.
 */
let mapboxModulePromise: Promise<typeof import("mapbox-gl")> | null = null;

export function loadMapboxGl(): Promise<typeof import("mapbox-gl")> {
  if (!mapboxModulePromise) {
    mapboxModulePromise = import("mapbox-gl");
  }
  return mapboxModulePromise;
}

/** Fire-and-forget prefetch (e.g. on app mount) so the chunk loads alongside the route bundle. */
export function prefetchMapboxGl(): void {
  loadMapboxGl().catch(() => {});
}
