import type { Feature, FeatureCollection, Point } from "geojson";

export type SportsVenueProperties = {
  id: string;
  name?: string;
  sport?: string;
  leisure?: string;
  osm_type: string;
  osm_id: number;
  /** Mapbox `icon-image` id (registered sport emoji). */
  sport_map_icon?: string;
  /** Numeric sport key for Mapbox cluster aggregation. */
  sport_key?: number;
  /** OSM tags when importer captures them (optional). */
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

export type VenueDotProperties = {
  id: string;
  name?: string;
  sport_map_icon: string;
  sport_key: number;
};

export type SportsVenueFeature = Feature<Point, SportsVenueProperties>;
export type SportsVenueGeoJSON = FeatureCollection<Point, SportsVenueProperties>;

export type VenueClusterPoint = {
  lng: number;
  lat: number;
  properties: SportsVenueProperties;
};
