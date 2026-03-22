import { clusterVenuePoints, DEFAULT_VENUE_CLUSTER_OPTS } from "./venueClusterEngine";
import type { SportsVenueGeoJSON } from "./sportsVenueTypes";

type InMsg = {
  type: "cluster";
  id: number;
  geojson: SportsVenueGeoJSON;
  venueSportsFilter: string[];
};

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type !== "cluster") return;
  const { id, geojson, venueSportsFilter } = msg;
  try {
    const out = clusterVenuePoints(geojson, {
      venueSportsFilter,
      maxDistanceMeters: DEFAULT_VENUE_CLUSTER_OPTS.maxDistanceMeters,
      venueAreaRadiusMeters: DEFAULT_VENUE_CLUSTER_OPTS.venueAreaRadiusMeters,
    });
    self.postMessage({
      type: "cluster",
      id,
      ok: true as const,
      areaCollection: out.areaCollection,
      dotCollection: out.dotCollection,
      clusters: out.clusters,
    });
  } catch (err) {
    self.postMessage({
      type: "cluster",
      id,
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
