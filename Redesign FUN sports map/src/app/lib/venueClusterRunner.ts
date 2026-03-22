import { clusterVenuePoints, DEFAULT_VENUE_CLUSTER_OPTS } from "./venueClusterEngine";
import type { ClusterVenueResult } from "./venueClusterEngine";
import type { SportsVenueGeoJSON } from "./sportsVenueTypes";

let worker: Worker | null = null;
let nextId = 0;

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    worker ??= new Worker(new URL("./venueCluster.worker.ts", import.meta.url), { type: "module" });
    return worker;
  } catch {
    return null;
  }
}

/**
 * Cluster venues off the main thread when Web Workers are available.
 */
export function runVenueClusterAsync(
  geojson: SportsVenueGeoJSON,
  venueSportsFilter: string[]
): Promise<ClusterVenueResult> {
  const w = getWorker();
  if (!w) {
    return Promise.resolve(
      clusterVenuePoints(geojson, {
        venueSportsFilter,
        maxDistanceMeters: DEFAULT_VENUE_CLUSTER_OPTS.maxDistanceMeters,
        venueAreaRadiusMeters: DEFAULT_VENUE_CLUSTER_OPTS.venueAreaRadiusMeters,
      })
    );
  }

  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data as
        | {
            type: "cluster";
            id: number;
            ok: true;
            areaCollection: ClusterVenueResult["areaCollection"];
            dotCollection: ClusterVenueResult["dotCollection"];
            clusters: ClusterVenueResult["clusters"];
          }
        | { type: "cluster"; id: number; ok: false; error: string };
      if (d.type !== "cluster" || d.id !== id) return;
      w.removeEventListener("message", onMessage);
      if (d.ok) {
        resolve({
          areaCollection: d.areaCollection,
          dotCollection: d.dotCollection,
          clusters: d.clusters,
        });
      } else {
        reject(new Error(d.error));
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({
      type: "cluster",
      id,
      geojson,
      venueSportsFilter,
    } satisfies {
      type: "cluster";
      id: number;
      geojson: SportsVenueGeoJSON;
      venueSportsFilter: string[];
    });
  });
}
