// Thin wrapper that runs venue clustering in a Web Worker when possible,
// and quietly falls back to running it on the main thread when not.
import { clusterVenuePoints, DEFAULT_VENUE_CLUSTER_OPTS } from "./venueClusterEngine";
import type { ClusterVenueResult } from "./venueClusterEngine";
import type { SportsVenueGeoJSON } from "./sportsVenueTypes";

let worker: Worker | null = null; // one shared worker, created lazily and reused
let nextId = 0; // increments per job so replies can be matched to requests

// Returns the shared worker, creating it on first use. Null if workers aren't supported.
function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null; // e.g. server-side render — no Worker
  try {
    worker ??= new Worker(new URL("./venueCluster.worker.ts", import.meta.url), { type: "module" });
    return worker;
  } catch {
    return null; // creation failed — caller will fall back to main-thread clustering
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
  // No worker available: just cluster on the main thread and resolve immediately.
  if (!w) {
    return Promise.resolve(
      clusterVenuePoints(geojson, {
        venueSportsFilter,
        maxDistanceMeters: DEFAULT_VENUE_CLUSTER_OPTS.maxDistanceMeters,
        venueAreaRadiusMeters: DEFAULT_VENUE_CLUSTER_OPTS.venueAreaRadiusMeters,
      })
    );
  }

  // Worker path: send the job and resolve once the matching reply comes back.
  return new Promise((resolve, reject) => {
    const id = ++nextId; // unique ticket for this job
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
      // Ignore replies for other jobs; only handle the one matching our id.
      if (d.type !== "cluster" || d.id !== id) return;
      w.removeEventListener("message", onMessage); // one-shot: stop listening once handled
      if (d.ok) {
        resolve({
          areaCollection: d.areaCollection,
          dotCollection: d.dotCollection,
          clusters: d.clusters,
        });
      } else {
        reject(new Error(d.error)); // worker reported a failure
      }
    };
    w.addEventListener("message", onMessage); // listen before sending so we don't miss the reply
    // Hand the job to the worker.
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
