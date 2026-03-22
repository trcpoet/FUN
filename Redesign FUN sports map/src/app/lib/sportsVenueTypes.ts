import type { Feature, FeatureCollection, Point } from "geojson";

export type SportsVenueProperties = {
  id: string;
  name?: string;
  sport?: string;
  leisure?: string;
  osm_type: string;
  osm_id: number;
};

export type SportsVenueFeature = Feature<Point, SportsVenueProperties>;
export type SportsVenueGeoJSON = FeatureCollection<Point, SportsVenueProperties>;

export type VenueClusterPoint = {
  lng: number;
  lat: number;
  properties: SportsVenueProperties;
};
