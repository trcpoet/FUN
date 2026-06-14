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
  osm_type?: string;
  osm_id?: number;
  surface?: string;
  lit?: string;
  access?: string;
  opening_hours?: string;
  website?: string;
  operator?: string;
  wikidata?: string;
  hero_image_url?: string;
  wikidata_label?: string;
  wikidata_description?: string;
};
