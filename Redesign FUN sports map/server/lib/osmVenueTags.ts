/** Shared OSM tag extraction for venue import routes. */

export type OsmVenueTags = {
  name?: string;
  sport?: string;
  leisure?: string;
  surface?: string;
  lit?: string;
  access?: string;
  opening_hours?: string;
  website?: string;
  operator?: string;
  wikidata?: string;
};

export type OsmVenueRow = {
  id: string;
  lat: number;
  lng: number;
  name: string | null;
  sport: string | null;
  leisure: string | null;
  osm_type: string;
  osm_id: number;
  imported_at: string;
  surface: string | null;
  lit: string | null;
  access: string | null;
  opening_hours: string | null;
  website: string | null;
  operator: string | null;
  wikidata: string | null;
};

export type OsmVenueGeoProperties = {
  id: string;
  name?: string;
  sport?: string;
  leisure?: string;
  surface?: string;
  lit?: string;
  access?: string;
  opening_hours?: string;
  website?: string;
  operator?: string;
  wikidata?: string;
  osm_type: string;
  osm_id: number;
};

function tagOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function extractOsmVenueTags(tags: OsmVenueTags | undefined): Omit<OsmVenueRow, "id" | "lat" | "lng" | "osm_type" | "osm_id" | "imported_at"> {
  return {
    name: tagOrNull(tags?.name),
    sport: tagOrNull(tags?.sport),
    leisure: tagOrNull(tags?.leisure),
    surface: tagOrNull(tags?.surface),
    lit: tagOrNull(tags?.lit),
    access: tagOrNull(tags?.access),
    opening_hours: tagOrNull(tags?.opening_hours),
    website: tagOrNull(tags?.website),
    operator: tagOrNull(tags?.operator),
    wikidata: tagOrNull(tags?.wikidata),
  };
}

export function osmVenueRowToGeoProperties(
  id: string,
  osmType: string,
  osmId: number,
  tags: ReturnType<typeof extractOsmVenueTags>
): OsmVenueGeoProperties {
  return {
    id,
    osm_type: osmType,
    osm_id: osmId,
    ...(tags.name ? { name: tags.name } : {}),
    ...(tags.sport ? { sport: tags.sport } : {}),
    ...(tags.leisure ? { leisure: tags.leisure } : {}),
    ...(tags.surface ? { surface: tags.surface } : {}),
    ...(tags.lit ? { lit: tags.lit } : {}),
    ...(tags.access ? { access: tags.access } : {}),
    ...(tags.opening_hours ? { opening_hours: tags.opening_hours } : {}),
    ...(tags.website ? { website: tags.website } : {}),
    ...(tags.operator ? { operator: tags.operator } : {}),
    ...(tags.wikidata ? { wikidata: tags.wikidata } : {}),
  };
}

export function buildOsmVenueRow(
  osmType: string,
  osmId: number,
  lat: number,
  lng: number,
  tags: OsmVenueTags | undefined,
  importedAt: string
): OsmVenueRow {
  const id = `${osmType}/${osmId}`;
  const extracted = extractOsmVenueTags(tags);
  return {
    id,
    lat,
    lng,
    osm_type: osmType,
    osm_id: osmId,
    imported_at: importedAt,
    ...extracted,
  };
}
