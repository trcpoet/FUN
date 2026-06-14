import type { VenueSelection } from "../components/mapboxMapTypes";
import type { SportsVenueProperties } from "./sportsVenueTypes";
import type { OsmSportsVenueRow } from "../../lib/supabase";

function optionalField(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function venueSelectionFromProperties(
  props: Pick<
    SportsVenueProperties,
    | "id"
    | "name"
    | "sport"
    | "leisure"
    | "osm_type"
    | "osm_id"
    | "surface"
    | "lit"
    | "access"
    | "opening_hours"
    | "website"
    | "operator"
    | "wikidata"
    | "hero_image_url"
    | "wikidata_label"
    | "wikidata_description"
  >,
  center: { lat: number; lng: number }
): VenueSelection {
  return {
    id: props.id,
    center,
    name: props.name,
    sport: props.sport,
    leisure: props.leisure,
    osm_type: props.osm_type,
    osm_id: props.osm_id,
    surface: props.surface,
    lit: props.lit,
    access: props.access,
    opening_hours: props.opening_hours,
    website: props.website,
    operator: props.operator,
    wikidata: props.wikidata,
    hero_image_url: props.hero_image_url,
    wikidata_label: props.wikidata_label,
    wikidata_description: props.wikidata_description,
  };
}

export function venueSelectionFromDbRow(row: OsmSportsVenueRow): VenueSelection {
  return venueSelectionFromProperties(
    {
      id: row.id,
      name: optionalField(row.name),
      sport: optionalField(row.sport),
      leisure: optionalField(row.leisure),
      osm_type: row.osm_type,
      osm_id: Number(row.osm_id),
      surface: optionalField(row.surface),
      lit: optionalField(row.lit),
      access: optionalField(row.access),
      opening_hours: optionalField(row.opening_hours),
      website: optionalField(row.website),
      operator: optionalField(row.operator),
      wikidata: optionalField(row.wikidata),
      hero_image_url: optionalField(row.hero_image_url),
      wikidata_label: optionalField(row.wikidata_label),
      wikidata_description: optionalField(row.wikidata_description),
    },
    { lat: row.lat, lng: row.lng }
  );
}

export function dbRowToVenueProperties(row: OsmSportsVenueRow): SportsVenueProperties {
  return {
    id: row.id,
    osm_type: row.osm_type,
    osm_id: Number(row.osm_id),
    name: optionalField(row.name),
    sport: optionalField(row.sport),
    leisure: optionalField(row.leisure),
    surface: optionalField(row.surface),
    lit: optionalField(row.lit),
    access: optionalField(row.access),
    opening_hours: optionalField(row.opening_hours),
    website: optionalField(row.website),
    operator: optionalField(row.operator),
    wikidata: optionalField(row.wikidata),
    hero_image_url: optionalField(row.hero_image_url),
    wikidata_label: optionalField(row.wikidata_label),
    wikidata_description: optionalField(row.wikidata_description),
  };
}
