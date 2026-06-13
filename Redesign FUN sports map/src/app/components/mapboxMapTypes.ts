/** Shared map types — keep out of MapboxMap.tsx so App can import without pulling the map chunk graph. */

export type MapCameraRequest =
  | { id: number; kind: "fly"; lat: number; lng: number; zoom?: number }
  | { id: number; kind: "fitBounds"; coordinates: [number, number][] };

export type VenueSelection = {
  id: string;
  name?: string;
  sport?: string;
  leisure?: string;
  center: { lat: number; lng: number };
};
