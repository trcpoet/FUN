/**
 * Build the venue photo gallery from every source.
 *
 * Sources arrive on two separate paths: /api/venue-enrich returns the Google /
 * OSM / Wikimedia / Wikidata set already resolved to loadable URLs, while
 * member uploads come from the venue_photos table. This module is the one place
 * that decides ordering, de-duplication, and credits, so the carousel component
 * stays purely presentational.
 */
import type { VenuePhoto } from "../../lib/api";
import type { VenuePhotoRow } from "../../lib/venueSocial";

export type GallerySource = VenuePhoto["source"] | "member";

export type GalleryPhoto = {
  /** Stable React key — also the de-duplication identity. */
  key: string;
  url: string;
  source: GallerySource;
  credit: string | null;
  creditUrl: string | null;
  caption?: string | null;
  /** Present only for member uploads, which can be deleted or reported. */
  photoId?: string;
  isMine?: boolean;
};

const SOURCE_LABEL: Record<GallerySource, string> = {
  member: "FUN member",
  google: "Google",
  osm: "OpenStreetMap",
  wikimedia: "Wikimedia Commons",
  wikidata: "Wikimedia Commons",
};

/**
 * Merge into one ordered gallery.
 *
 * Member uploads lead deliberately. They are the only photos that show what a
 * court actually looks like to play on — Google's are typically a storefront or
 * an aerial — and leading with them makes contributing visibly worthwhile.
 */
export function mergeVenuePhotos(params: {
  enrichmentPhotos?: VenuePhoto[] | null;
  userPhotos?: VenuePhotoRow[] | null;
  currentUserId?: string | null;
}): GalleryPhoto[] {
  const out: GalleryPhoto[] = [];
  const seen = new Set<string>();

  const push = (photo: GalleryPhoto) => {
    if (!photo.url || seen.has(photo.url)) return;
    seen.add(photo.url);
    out.push(photo);
  };

  for (const p of params.userPhotos ?? []) {
    push({
      key: `member:${p.id}`,
      url: p.url,
      source: "member",
      credit: p.authorName?.trim() || "FUN member",
      creditUrl: null,
      caption: p.caption,
      photoId: p.id,
      isMine: Boolean(params.currentUserId && p.user_id === params.currentUserId),
    });
  }

  for (const [i, p] of (params.enrichmentPhotos ?? []).entries()) {
    if (!p.url) continue;
    push({
      key: `${p.source}:${i}:${p.url}`,
      url: p.url,
      source: p.source,
      credit: p.attribution,
      creditUrl: p.attribution_url,
    });
  }

  return out;
}

/**
 * Credit line for one slide.
 *
 * Always names the source, because Google and Wikimedia both require
 * attribution when their imagery is displayed.
 */
export function formatPhotoCredit(photo: GalleryPhoto): string {
  const label = SOURCE_LABEL[photo.source];
  if (photo.credit && photo.credit !== label) return `${photo.credit} · ${label}`;
  return label;
}

/**
 * Which slides should render a real <img>.
 *
 * Only the active slide and its immediate neighbours. Every Google slide is a
 * billed Photo API call on a cold CDN, so rendering all six up front would cost
 * six fetches for a user who never swipes.
 */
export function shouldLoadSlide(index: number, activeIndex: number): boolean {
  return Math.abs(index - activeIndex) <= 1;
}
