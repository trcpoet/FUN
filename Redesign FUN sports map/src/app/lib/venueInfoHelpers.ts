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
