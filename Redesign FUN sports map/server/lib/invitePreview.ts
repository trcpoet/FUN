/**
 * The pure half of the `/g/<token>` share preview: what a link may say about a
 * game, and how to write it into the served HTML.
 *
 * Kept out of `api/invite-preview.ts` so it can be tested — the handler itself
 * is just fetch, call, apply.
 */

export type InvitePreview = {
  title: string | null;
  sport: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string | null;
  visibility: string | null;
  spots_needed: number | null;
  participant_count: number | null;
  spots_remaining: number | null;
  location_label: string | null;
};

export const INVITE_TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Escape for an HTML attribute.
 *
 * Load-bearing: `title` and `location_label` are written by users and go
 * straight into `content="..."`. Without this, a game called `" onload="…`
 * would be stored XSS served to everyone who opens the link.
 */
export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The day, not the hour.
 *
 * `starts_at` is UTC and a crawler carries no timezone, so a clock time here
 * would tell a Texas game's invitees it starts at 1:00 AM. Day granularity is
 * the most precise thing that stays true for everyone, and the app shows the
 * exact local time the moment it loads. Storing a timezone per game would let
 * this say "7:00 PM" — the right fix if it ever matters enough.
 */
export function whenLabel(startsAt: string | null, now: Date = new Date()): string | null {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return null;
  const day = (x: Date) =>
    `${x.getUTCFullYear()}-${x.getUTCMonth()}-${x.getUTCDate()}`;
  if (day(d) === day(now)) return "Today";
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (day(d) === day(tomorrow)) return "Tomorrow";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function spotsLabel(p: InvitePreview): string | null {
  const left = p.spots_remaining;
  if (left == null || (p.spots_needed ?? 0) <= 0) return null;
  if (left <= 0) return "Full";
  return `${left} ${left === 1 ? "spot" : "spots"} left`;
}

export function isOver(p: InvitePreview, now: Date = new Date()): boolean {
  if (p.status === "completed" || p.status === "cancelled") return true;
  return p.ends_at ? Date.parse(p.ends_at) < now.getTime() : false;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The title and description a crawler sees.
 *
 * What, where, when and how many — never who. Same rule the map follows for a
 * signed-out visitor, applied to the share card; the RPC behind this cannot
 * return a name even if this wanted one.
 */
export function previewMeta(
  p: InvitePreview,
  now: Date = new Date(),
): { title: string; description: string } {
  const sport = p.sport?.trim() ? titleCase(p.sport.trim()) : "Pickup game";
  const name = p.title?.trim() || sport;

  if (isOver(p, now)) {
    return {
      title: `${name} — this game has ended`,
      description: "It is over, but there are more games on the map near you.",
    };
  }

  const parts = [sport, whenLabel(p.starts_at, now), p.location_label?.trim(), spotsLabel(p)]
    .filter((x): x is string => Boolean(x && x.length));

  return {
    title: `${name} · FUN`,
    description: parts.join(" · ") || "Join this pickup game on FUN.",
  };
}

/**
 * Replace one meta tag's `content`, matched on its property/name.
 *
 * Matching by attribute rather than by the current text, because index.html
 * authors several of these across multiple lines and the copy changes. Returns
 * the html untouched when the tag is absent, so a future edit to index.html
 * degrades to the generic card rather than throwing.
 */
export function setMeta(
  html: string,
  kind: "property" | "name",
  key: string,
  value: string,
): string {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(<meta\\s+${kind}=["']${k}["'][\\s\\S]{0,200}?content=\\s*["'])[\\s\\S]*?(["'])`,
    "i",
  );
  return re.test(html) ? html.replace(re, `$1${value}$2`) : html;
}

/** Apply a preview to the app's shell HTML. */
export function applyPreview(
  html: string,
  p: InvitePreview,
  canonicalUrl: string,
  now: Date = new Date(),
): string {
  const { title, description } = previewMeta(p, now);
  const t = escapeAttr(title);
  const d = escapeAttr(description);
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`);
  out = setMeta(out, "name", "description", d);
  out = setMeta(out, "property", "og:title", t);
  out = setMeta(out, "property", "og:description", d);
  out = setMeta(out, "property", "og:url", escapeAttr(canonicalUrl));
  out = setMeta(out, "name", "twitter:title", t);
  out = setMeta(out, "name", "twitter:description", d);
  return out;
}
