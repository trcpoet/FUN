/** Shared map types — keep out of MapboxMap.tsx so App can import without pulling the map chunk graph. */
import type { VenueTagBag } from "../../lib/supabase";

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
  photo_attributions?: string[];
  enrichment_source?: string;
  /**
   * Cached Google Places details, already on the row `fetchVenueById` reads.
   *
   * Lets the card show a rating and open/closed on first paint instead of
   * waiting on a second, billed request. Only absent for a venue that has never
   * been enriched, which is when `/api/venue-enrich` is still worth calling.
   */
  google_details?: VenueGoogleDetailsLike;
  /** Long-tail OSM tags (amenities, capacity, contact). Absent key = unknown, not "no". */
  tags?: VenueTagBag;
};

/** The subset of the cached Google payload the card renders. */
export type VenueGoogleDetailsLike = {
  rating?: number | null;
  userRatingCount?: number | null;
  openNow?: boolean | null;
  openingHours?: string[] | null;
  formattedAddress?: string | null;
  phone?: string | null;
  editorialSummary?: string | null;
  googleMapsUri?: string | null;
};
