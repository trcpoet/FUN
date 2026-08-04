import { describe, it, expect } from "vitest";
import { mergeVenuePhotos, formatPhotoCredit, shouldLoadSlide } from "./venuePhotos";
import type { GalleryPhoto } from "./venuePhotos";
import type { VenuePhoto } from "../../lib/api";
import type { VenuePhotoRow } from "../../lib/venueSocial";

function memberPhoto(over: Partial<VenuePhotoRow> = {}): VenuePhotoRow {
  return {
    id: "p1",
    created_at: "2026-08-01T00:00:00Z",
    venue_id: "way/1",
    user_id: "u1",
    storage_path: "venues/u1/way_1/1.jpg",
    caption: null,
    status: "visible",
    url: "https://cdn/1.jpg",
    authorName: "Tahsin",
    authorAvatarUrl: null,
    ...over,
  };
}

describe("mergeVenuePhotos", () => {
  it("leads with member uploads, then the enrichment sources", () => {
    const enrichment: VenuePhoto[] = [
      { source: "google", url: "/api/venue-photo?venueId=way%2F1&i=0", attribution: "A", attribution_url: null },
      { source: "wikidata", url: "https://commons/x.jpg", attribution: null, attribution_url: null },
    ];
    const out = mergeVenuePhotos({ enrichmentPhotos: enrichment, userPhotos: [memberPhoto()] });
    expect(out.map((p) => p.source)).toEqual(["member", "google", "wikidata"]);
  });

  it("marks the viewer's own uploads so they can delete them", () => {
    const out = mergeVenuePhotos({
      userPhotos: [memberPhoto({ id: "a", user_id: "me" }), memberPhoto({ id: "b", user_id: "other", url: "https://cdn/2.jpg" })],
      currentUserId: "me",
    });
    expect(out[0]?.isMine).toBe(true);
    expect(out[1]?.isMine).toBe(false);
  });

  it("de-duplicates by URL so the same image cannot appear twice", () => {
    const enrichment: VenuePhoto[] = [
      { source: "wikimedia", url: "https://commons/x.jpg", attribution: null, attribution_url: null },
      { source: "wikidata", url: "https://commons/x.jpg", attribution: null, attribution_url: null },
    ];
    expect(mergeVenuePhotos({ enrichmentPhotos: enrichment })).toHaveLength(1);
  });

  it("skips entries with no resolved URL", () => {
    const enrichment: VenuePhoto[] = [
      { source: "google", attribution: null, attribution_url: null },
    ];
    expect(mergeVenuePhotos({ enrichmentPhotos: enrichment })).toEqual([]);
  });

  it("returns an empty gallery when there is nothing at all", () => {
    expect(mergeVenuePhotos({})).toEqual([]);
  });

  it("gives every slide a distinct key", () => {
    const enrichment: VenuePhoto[] = [
      { source: "google", url: "/a", attribution: null, attribution_url: null },
      { source: "google", url: "/b", attribution: null, attribution_url: null },
    ];
    const keys = mergeVenuePhotos({ enrichmentPhotos: enrichment, userPhotos: [memberPhoto()] }).map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("formatPhotoCredit", () => {
  const base: GalleryPhoto = { key: "k", url: "u", source: "google", credit: null, creditUrl: null };

  // Google and Wikimedia both require the source to be named on display.
  it("always names the source", () => {
    expect(formatPhotoCredit(base)).toBe("Google");
    expect(formatPhotoCredit({ ...base, source: "wikimedia" })).toBe("Wikimedia Commons");
  });

  it("prefixes the photographer when there is one", () => {
    expect(formatPhotoCredit({ ...base, credit: "Jane D" })).toBe("Jane D · Google");
  });

  it("does not repeat the label when the credit already is the label", () => {
    expect(formatPhotoCredit({ ...base, source: "member", credit: "FUN member" })).toBe("FUN member");
  });
});

describe("shouldLoadSlide", () => {
  // Each Google slide is a billed Photo API call on a cold CDN, so only the
  // active slide and its neighbours may render a real <img>.
  it("loads only the active slide and its neighbours", () => {
    expect(shouldLoadSlide(0, 0)).toBe(true);
    expect(shouldLoadSlide(1, 0)).toBe(true);
    expect(shouldLoadSlide(2, 0)).toBe(false);
    expect(shouldLoadSlide(5, 0)).toBe(false);
  });

  it("follows the active slide as it moves", () => {
    expect(shouldLoadSlide(5, 4)).toBe(true);
    expect(shouldLoadSlide(0, 4)).toBe(false);
  });
});
