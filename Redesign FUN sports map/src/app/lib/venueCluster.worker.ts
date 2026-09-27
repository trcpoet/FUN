// UNREFERENCED. Nothing in the app imports this: MapboxMap hands its venue GeoJSON
// straight to a Mapbox GeoJSON source with `cluster: true` and lets GL do the
// clustering natively, which is why `clusterVenuePoints` no longer runs anywhere.
//
// It is kept, tested, as the fallback for a clustering strategy GL cannot express
// (the footprint polygons). Do not repurpose it to run `enrichVenueGeoJSON` off-thread:
// that was measured at 0.8 ms for a thousand venues unfiltered, and the filtered
// path's 24-48 ms was a quadratic park scan, now indexed down to ~1 ms in
// venueClusterEngine.ts. Two structured clones and a frame of latency cost more than
// the work they would move.
// Web Worker that runs venue clustering on a background thread so the map stays smooth.
// It receives raw venue data, does the heavy clustering, and posts the result back.
import { clusterVenuePoints, DEFAULT_VENUE_CLUSTER_OPTS } from "./venueClusterEngine";
import type { SportsVenueGeoJSON } from "./sportsVenueTypes";

// Shape of the message the main thread sends in to request a clustering job.
type InMsg = {
  type: "cluster";
  id: number; // ticket number so the caller can match this job to its reply
  geojson: SportsVenueGeoJSON; // the raw venue points to cluster
  venueSportsFilter: string[]; // which sports to keep
};

// Fires whenever the main thread posts a job to this worker.
self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type !== "cluster") return; // ignore anything that isn't a cluster request
  const { id, geojson, venueSportsFilter } = msg;
  try {
    // Do the actual clustering (the same pure function used on the main thread).
    const out = clusterVenuePoints(geojson, {
      venueSportsFilter,
      maxDistanceMeters: DEFAULT_VENUE_CLUSTER_OPTS.maxDistanceMeters,
      venueAreaRadiusMeters: DEFAULT_VENUE_CLUSTER_OPTS.venueAreaRadiusMeters,
    });
    // Send the finished result back, tagged with the same id and ok:true.
    self.postMessage({
      type: "cluster",
      id,
      ok: true as const,
      areaCollection: out.areaCollection,
      dotCollection: out.dotCollection,
      clusters: out.clusters,
    });
  } catch (err) {
    // If anything threw, report failure back instead of crashing the worker.
    self.postMessage({
      type: "cluster",
      id,
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
