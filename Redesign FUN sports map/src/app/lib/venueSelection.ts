import type { VenueGoogleDetailsLike, VenueSelection } from "../components/mapboxMapTypes";
import type { SportsVenueProperties } from "./sportsVenueTypes";
import type { OsmSportsVenueRow, VenueTagBag } from "../../lib/supabase";

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
    | "photo_attributions"
    | "enrichment_source"
  > & {
    /**
     * Deliberately not part of SportsVenueProperties: `tags` is jsonb and the
     * map path selects up to 8000 rows, so it only ever arrives on the
     * single-row DB read (venueSelectionFromDbRow).
     */
    tags?: VenueTagBag;
    /** Same reason as `tags`: jsonb, single-row read only. */
    google_details?: VenueGoogleDetailsLike;
  },
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
    photo_attributions: props.photo_attributions,
    enrichment_source: props.enrichment_source,
    tags: props.tags,
    google_details: props.google_details,
  };
}

/**
 * The cached Google payload, narrowed from the row's untyped jsonb.
 *
 * `google_details` is `Record<string, unknown>` on OsmSportsVenueRow because
 * supabase.ts is a leaf and cannot import the API layer's types. Nothing
 * validates what the enrichment route wrote, so read each field defensively
 * rather than casting the whole object.
 */
function narrowGoogleDetails(raw: unknown): VenueGoogleDetailsLike | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
  const out: VenueGoogleDetailsLike = {
    rating: num(o.rating),
    userRatingCount: num(o.userRatingCount),
    openNow: bool(o.openNow),
    openingHours: Array.isArray(o.openingHours)
      ? o.openingHours.filter((v): v is string => typeof v === "string")
      : null,
    formattedAddress: str(o.formattedAddress),
    phone: str(o.phone),
    editorialSummary: str(o.editorialSummary),
    googleMapsUri: str(o.googleMapsUri),
  };
  // An object of all-nulls is the same as not having one.
  return Object.values(out).some((v) => v != null && !(Array.isArray(v) && v.length === 0))
    ? out
    : undefined;
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
      photo_attributions: Array.isArray(row.photo_attributions)
        ? row.photo_attributions.filter((v): v is string => typeof v === "string")
        : undefined,
      enrichment_source: optionalField(row.enrichment_source),
      tags: row.tags ?? undefined,
      google_details: narrowGoogleDetails(row.google_details),
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
    photo_attributions: Array.isArray(row.photo_attributions)
      ? row.photo_attributions.filter((v): v is string => typeof v === "string")
      : undefined,
    enrichment_source: optionalField(row.enrichment_source),
  };
}
