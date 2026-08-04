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
  // Long-tail tags. Overpass already returns these on the same request — they
  // were simply being dropped. They land in the `tags` jsonb rather than
  // getting a column each, because none of them is ever filtered or sorted on.
  hoops?: string;
  lanes?: string;
  capacity?: string;
  fee?: string;
  covered?: string;
  wheelchair?: string;
  phone?: string;
  "contact:phone"?: string;
  description?: string;
  image?: string;
  wikimedia_commons?: string;
  wikipedia?: string;
  "addr:housenumber"?: string;
  "addr:street"?: string;
  "addr:city"?: string;
  "addr:state"?: string;
  "addr:postcode"?: string;
  // Amenities mapped on the venue element itself. Same free ride as the tags above:
  // Overpass returns them with the venues we already fetch. Amenities mapped as *separate*
  // nearby nodes (a car park polygon, a standalone toilet block) are not covered — those
  // would need their own query union.
  toilets?: string;
  drinking_water?: string;
  shower?: string;
  changing_room?: string;
  internet_access?: string;
  parking?: string;
  bench?: string;
};

/** Address fragments, folded out of the flat `addr:*` OSM keys. */
export type OsmVenueAddress = {
  housenumber?: string;
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
};

/** Display-only extras persisted to osm_sports_venues.tags (jsonb). */
export type OsmVenueTagBag = {
  hoops?: string;
  lanes?: string;
  capacity?: string;
  fee?: string;
  covered?: string;
  wheelchair?: string;
  phone?: string;
  description?: string;
  /** Direct image URL from the OSM `image` tag. */
  image?: string;
  /** e.g. "File:Foo.jpg" or "Category:Bar" — resolved to a Commons URL at enrich time. */
  wikimedia_commons?: string;
  /** e.g. "en:Central Park". */
  wikipedia?: string;
  addr?: OsmVenueAddress;
  toilets?: string;
  drinking_water?: string;
  shower?: string;
  changing_room?: string;
  internet_access?: string;
  parking?: string;
  bench?: string;
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
  tags: OsmVenueTagBag | null;
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

function put<T extends object, K extends keyof T>(bag: T, key: K, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) bag[key] = trimmed as T[K];
}

/**
 * Keys copied straight across from OSM tags into the bag.
 *
 * `phone` and `addr` are excluded on purpose: phone falls back to
 * `contact:phone`, and the flat `addr:*` keys fold into a nested object.
 */
const TAG_BAG_KEYS = [
  "hoops",
  "lanes",
  "capacity",
  "fee",
  "covered",
  "wheelchair",
  "description",
  "image",
  "wikimedia_commons",
  "wikipedia",
  "toilets",
  "drinking_water",
  "shower",
  "changing_room",
  "internet_access",
  "parking",
  "bench",
] as const satisfies readonly (keyof OsmVenueTagBag & keyof OsmVenueTags)[];

/**
 * Fold the long-tail OSM tags into the shape stored in osm_sports_venues.tags.
 *
 * Returns null (never undefined) when nothing survives: importers upsert in
 * chunks, and PostgREST normalises each chunk's columns to the union of keys
 * present across its rows. Omitting the key on some rows and not others makes
 * the chunk's shape depend on its contents, so always emit the key.
 */
export function buildOsmTagBag(tags: OsmVenueTags | undefined): OsmVenueTagBag | null {
  if (!tags) return null;
  const bag: OsmVenueTagBag = {};

  for (const key of TAG_BAG_KEYS) {
    put(bag, key, tags[key]);
  }
  // Handled apart from the loop: `phone` has a fallback key, `addr:*` folds into
  // a nested object.
  put(bag, "phone", tags.phone ?? tags["contact:phone"]);

  const addr: OsmVenueAddress = {};
  put(addr, "housenumber", tags["addr:housenumber"]);
  put(addr, "street", tags["addr:street"]);
  put(addr, "city", tags["addr:city"]);
  put(addr, "state", tags["addr:state"]);
  put(addr, "postcode", tags["addr:postcode"]);
  if (Object.keys(addr).length > 0) bag.addr = addr;

  return Object.keys(bag).length > 0 ? bag : null;
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
    tags: buildOsmTagBag(tags),
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
