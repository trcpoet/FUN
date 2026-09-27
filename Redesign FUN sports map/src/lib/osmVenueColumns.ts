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

/**
 * What a pin needs: where it is, what to call it, what to draw, and whether it
 * may be drawn at all (`access` — see venueAccess.ts).
 *
 * Nothing else belongs here. Measured on production: the previous list cost
 * 416 KB for 1000 venues, 303 KB of which was enrichment text the map never
 * renders — it was downloaded, parsed, written into a GeoJSON feature property
 * per pin, and then re-read from the database anyway the moment a card opened.
 */
const OSM_VENUE_MAP_COLUMNS = [
  "id",
  "lat",
  "lng",
  "name",
  "sport",
  "leisure",
  "osm_type",
  "osm_id",
  "access",
] as const;

/** Everything the venue card shows, read one row at a time. */
const OSM_VENUE_DETAIL_COLUMNS = [
  ...OSM_VENUE_MAP_COLUMNS,
  "surface",
  "lit",
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
export const OSM_VENUE_MAP_SELECT = OSM_VENUE_MAP_COLUMNS.join(", ");

/** Single-venue reads for the details modal. */
export const OSM_VENUE_DETAIL_SELECT = [
  ...OSM_VENUE_DETAIL_COLUMNS,
  "tags",
  "photos",
  "google_details",
  "enrichment_version",
].join(", ");
