/**
 * Column lists for osm_sports_venues reads.
 *
 * These used to be one string duplicated verbatim in src/lib/api.ts and
 * src/app/lib/sportsVenues.ts, which meant every new column had to be added in
 * two places and silently went missing from one of them when it wasn't.
 *
 * They are deliberately NOT the same list:
 *
 *  - MAP selects up to 8000 rows for the venue layer, so it stays lean. Never
 *    add a jsonb column here — `tags`, `photos` and `google_details` would
 *    multiply the payload across every pin in the viewport.
 *  - DETAIL reads exactly one row for the venue modal, so it can afford the
 *    heavy columns.
 */

const OSM_VENUE_BASE_COLUMNS = [
  "id",
  "lat",
  "lng",
  "name",
  "sport",
  "leisure",
  "osm_type",
  "osm_id",
  "surface",
  "lit",
  "access",
  "opening_hours",
  "website",
  "operator",
  "wikidata",
  "hero_image_url",
  "wikidata_label",
  "wikidata_description",
  "photo_attributions",
  "enrichment_source",
] as const;

/** Map/pin reads (bbox, up to 8000 rows). Keep this list free of jsonb. */
export const OSM_VENUE_MAP_SELECT = OSM_VENUE_BASE_COLUMNS.join(", ");

/** Single-venue reads for the details modal. */
export const OSM_VENUE_DETAIL_SELECT = [
  ...OSM_VENUE_BASE_COLUMNS,
  "tags",
  "photos",
  "google_details",
  "enrichment_version",
].join(", ");
