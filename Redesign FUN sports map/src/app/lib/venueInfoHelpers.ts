/**
 * Formatting helpers for venue info UI (OSM tags → readable labels, hours, links).
 * Shared by VenueInfoPopup so the display logic lives in one place.
 */

/** snake_case / lowercase OSM value → spaced label (e.g. "artificial_turf" → "artificial turf"). */
export function prettyLabel(s: string | undefined | null): string | null {
  const raw = s?.trim();
  if (!raw) return null;
  return raw.replace(/_/g, " ").replace(/\s+/g, " ");
}

/** Surface tag → Sentence-case label (e.g. "artificial_turf" → "Artificial turf"). */
export function formatSurface(value: string | undefined | null): string | null {
  const v = prettyLabel(value);
  if (!v) return null;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** lit tag → "Lit" / "Unlit" (falls back to sentence-case for other values). */
export function formatLit(value: string | undefined | null): string | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (v === "yes") return "Lit";
  if (v === "no") return "Unlit";
  return formatSurface(v);
}

/** access tag → "Public" / "Private" / "Members only". */
export function formatAccess(value: string | undefined | null): string | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (v === "yes" || v === "public" || v === "permissive") return "Public";
  if (v === "private") return "Private";
  if (v === "customers" || v === "members" || v === "membership") return "Members only";
  return formatSurface(v);
}

/** Decimal lat/lng → "40.73°N, 73.99°W". */
export function formatCoords(lat: number, lng: number): string {
  const latStr = Math.abs(lat).toFixed(2) + (lat >= 0 ? "°N" : "°S");
  const lngStr = Math.abs(lng).toFixed(2) + (lng >= 0 ? "°E" : "°W");
  return `${latStr}, ${lngStr}`;
}

/** Normalize a website value to an absolute https URL, or null if empty. */
export function normalizeWebsite(value: string | undefined | null): string | null {
  const v = value?.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/**
 * OpenStreetMap page for a venue.
 *
 * Built from the venue id itself ("way/12345"), which is already carried
 * everywhere — no extra plumbing. Gives people a way to fix bad venue data at
 * the source, which is the only way most of these fields ever improve.
 */
export function osmHref(venueId: string | undefined | null): string | null {
  const v = venueId?.trim();
  if (!v || !/^(node|way|relation)\/\d+$/.test(v)) return null;
  return `https://www.openstreetmap.org/${v}`;
}

/** Phone tag → tel: URI, or null when there are no dialable digits. */
export function telHref(phone: string | undefined | null): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  return cleaned.replace(/\D/g, "").length >= 7 ? `tel:${cleaned}` : null;
}

/**
 * OSM `fee` → "Free" / "Paid".
 *
 * Note the inversion: fee=no is the *good* news, so callers should style this
 * by meaning rather than by the raw value.
 */
export function formatFee(value: string | undefined | null): string | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (v === "no" || v === "free") return "Free";
  if (v === "yes") return "Paid";
  return formatSurface(v);
}

/** OSM `wheelchair` → accessibility phrase. */
export function formatWheelchair(value: string | undefined | null): string | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (v === "yes" || v === "designated") return "Wheelchair accessible";
  if (v === "limited") return "Partly accessible";
  if (v === "no") return "Not wheelchair accessible";
  return null;
}

/** OSM `covered`/`indoor` → "Covered" / "Outdoor". */
export function formatCovered(value: string | undefined | null): string | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (v === "yes" || v === "roof") return "Covered";
  if (v === "no") return "Outdoor";
  return null;
}

/** OSM `capacity` → "Seats 500". Non-numeric values are passed through. */
export function formatCapacity(value: string | undefined | null): string | null {
  const v = value?.trim();
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `Seats ${n.toLocaleString()}`;
}

/**
 * Countable court features — `hoops` on basketball, `lanes` on a pool or track.
 * Both are plain integers in OSM.
 */
export function formatCount(
  value: string | undefined | null,
  singular: string,
  plural = `${singular}s`
): string | null {
  const v = value?.trim();
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Amenity tags that are only worth showing when present.
 *
 * An absent tag means "nobody mapped it", NOT "this venue has none", so a
 * negative value is dropped rather than rendered — claiming "no toilets" from
 * missing data would be worse than saying nothing.
 */
export function formatAmenity(value: string | undefined | null, label: string): string | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (v === "no" || v === "none") return null;
  return label;
}

/** Nested addr:* fragments → a single line. */
export function formatAddress(
  addr: { housenumber?: string; street?: string; city?: string; state?: string; postcode?: string } | undefined | null
): string | null {
  if (!addr) return null;
  const street = [addr.housenumber, addr.street].filter(Boolean).join(" ").trim();
  const region = [addr.city, addr.state].filter(Boolean).join(", ").trim();
  const line = [street, region, addr.postcode].filter(Boolean).join(", ").trim();
  return line || null;
}

/** Google aggregate → "4.2 (128)". Returns null when nobody has rated it. */
export function formatGoogleRating(
  rating: number | null | undefined,
  count: number | null | undefined
): string | null {
  if (typeof rating !== "number" || Number.isNaN(rating)) return null;
  const n = typeof count === "number" && count > 0 ? ` (${count.toLocaleString()})` : "";
  return `${rating.toFixed(1)}${n}`;
}

/** Google Maps directions URL (or a place search when the viewer location is unknown). */
export function directionsHref(
  dest: { lat: number; lng: number },
  origin?: { lat: number; lng: number } | null
): string {
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${dest.lat},${dest.lng}`;
}

/**
 * Next value for the lazy-enrichment fetch key.
 *
 * The key is set by the *event* that opens the details view, never derived from
 * render state, because an effect that both sets and depends on a flag tears
 * itself down on the resulting re-render and cancels its own in-flight request.
 * That is exactly what left the hero image pulsing forever.
 *
 * Reopening the same venue returns the identical key so the effect does not
 * re-run; a venue change clears it so the next open refetches.
 */
export function nextEnrichKey(
  currentKey: string | null,
  venueId: string | null,
  event: "open-details" | "venue-changed"
): string | null {
  if (event === "venue-changed") return null;
  if (!venueId) return currentKey;
  return currentKey === venueId ? currentKey : venueId;
}

const DAY_NAMES: Record<string, string> = {
  mo: "Mon",
  tu: "Tue",
  we: "Wed",
  th: "Thu",
  fr: "Fri",
  sa: "Sat",
  su: "Sun",
};

/**
 * Best-effort humanize of an OSM `opening_hours` value into display lines.
 * Raw form is like "Mo-Fr 08:00-22:00; Sa-Su 09:00-18:00". We split on ";" and
 * expand the two-letter day codes; times are left intact. Returns [] when empty
 * (caller shows "Hours not listed"). No external parser to keep the bundle lean.
 */
export function formatOpeningHours(raw: string | undefined | null): string[] {
  const v = raw?.trim();
  if (!v) return [];
  if (/^24\s*\/\s*7$/.test(v)) return ["Open 24/7"];
  return v
    .split(";")
    .map((seg) =>
      seg
        .trim()
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (m) => DAY_NAMES[m.toLowerCase()] ?? m)
    )
    .filter(Boolean);
}
