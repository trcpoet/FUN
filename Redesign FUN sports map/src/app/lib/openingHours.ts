/**
 * A deliberately small reader for OSM `opening_hours`.
 *
 * The real grammar is enormous — month ranges, week numbers, public holidays, sunrise/sunset
 * offsets, comments, fallback rules. This handles the handful of shapes that cover almost
 * every sports venue and **returns `null` for everything else** rather than guessing. A wrong
 * "Open now" badge is worse than no badge, so callers render nothing when the answer is null.
 *
 * Times are read in the viewer's local zone, which is what the venue's own hours mean for
 * anyone close enough to walk there.
 */

/** Days in OSM order: index 0 = Monday. */
const OSM_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const MINUTES_PER_DAY = 1440;

/** `[startMinute, endMinute)` from midnight. `end < start` means the window runs past midnight. */
type Interval = [number, number];

/** One entry per day in OSM order. `undefined` = the spec never mentioned that day. */
type WeekTable = (Interval[] | undefined)[];

const DAY_TOKEN = OSM_DAYS.join("|");
const DAY_SPEC = `(?:${DAY_TOKEN})(?:-(?:${DAY_TOKEN}))?(?:,(?:${DAY_TOKEN})(?:-(?:${DAY_TOKEN}))?)*`;
const RULE_RE = new RegExp(`^(?:(${DAY_SPEC})\\s+)?(.+)$`);
const TIME_RANGE_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

function jsDayToOsmIndex(jsDay: number): number {
  // Date.getDay() is Sunday-first; OSM is Monday-first.
  return (jsDay + 6) % 7;
}

/** Minutes from midnight, or null if the clock time is out of range. */
function toMinutes(hours: number, minutes: number): number | null {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (minutes > 59) return null;
  if (hours > 24) return null;
  // 24:00 is a legal end-of-day bound; 24:30 is not.
  if (hours === 24 && minutes !== 0) return null;
  return hours * 60 + minutes;
}

/** Expand `Mo-Fr` / `Mo,We,Fr` into OSM day indices. Wrapping ranges (`Sa-Mo`) are allowed. */
function parseDaySpec(spec: string): number[] | null {
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const [from, to] = part.split("-");
    const start = OSM_DAYS.indexOf(from as (typeof OSM_DAYS)[number]);
    if (start < 0) return null;
    if (to === undefined) {
      out.push(start);
      continue;
    }
    const end = OSM_DAYS.indexOf(to as (typeof OSM_DAYS)[number]);
    if (end < 0) return null;
    for (let i = 0; ; i += 1) {
      const day = (start + i) % 7;
      out.push(day);
      if (day === end) break;
      if (i > 7) return null;
    }
  }
  return out;
}

/** `08:00-12:00,13:00-17:00` or `off`. Null means "not a shape we support". */
function parseTimeSpec(spec: string): Interval[] | null {
  const lowered = spec.trim().toLowerCase();
  if (lowered === "off" || lowered === "closed") return [];

  const intervals: Interval[] = [];
  for (const part of spec.split(",")) {
    const m = TIME_RANGE_RE.exec(part.trim());
    if (!m) return null;
    const start = toMinutes(Number(m[1]), Number(m[2]));
    const end = toMinutes(Number(m[3]), Number(m[4]));
    if (start == null || end == null) return null;
    // Equal bounds are ambiguous in OSM (zero-length or all-day, depending who you ask).
    if (start === end) return null;
    intervals.push([start, end]);
  }
  return intervals.length > 0 ? intervals : null;
}

/** Parse the whole spec into per-day intervals, or null if any part is unsupported. */
function parseWeek(spec: string | null | undefined): WeekTable | null {
  const trimmed = spec?.trim();
  if (!trimmed) return null;

  if (trimmed === "24/7") {
    return OSM_DAYS.map(() => [[0, MINUTES_PER_DAY] as Interval]);
  }

  const rules = trimmed
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean);
  if (rules.length === 0) return null;

  const week: WeekTable = new Array(7);
  for (const rule of rules) {
    const m = RULE_RE.exec(rule);
    if (!m) return null;
    // No day prefix means the rule applies to the whole week.
    const days = m[1] ? parseDaySpec(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return null;
    const intervals = parseTimeSpec(m[2]);
    if (!intervals) return null;
    // A later rule replaces an earlier one for the days it names — that is how `Mo-Su 08:00-20:00; We off` reads.
    for (const day of days) week[day] = intervals;
  }

  return week.some((d) => d !== undefined) ? week : null;
}

/** Resolve past-midnight windows so each day carries the intervals actually in effect on it. */
function effectiveWeek(week: WeekTable): Interval[][] {
  const out: Interval[][] = OSM_DAYS.map(() => []);
  for (let day = 0; day < 7; day += 1) {
    for (const [start, end] of week[day] ?? []) {
      if (end > start) {
        out[day].push([start, end]);
      } else {
        out[day].push([start, MINUTES_PER_DAY]);
        out[(day + 1) % 7].push([0, end]);
      }
    }
  }
  return out;
}

/**
 * Is the venue open at `at`? `null` means the spec could not be parsed confidently — show no
 * badge rather than a guess.
 */
export function isOpenNow(spec: string | null | undefined, at: Date): boolean | null {
  const week = parseWeek(spec);
  if (!week) return null;

  const day = jsDayToOsmIndex(at.getDay());
  const minutes = at.getHours() * 60 + at.getMinutes();
  return effectiveWeek(week)[day].some(([start, end]) => minutes >= start && minutes < end);
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const suffix = hours < 12 ? "am" : "pm";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return mins === 0 ? `${hour12}${suffix}` : `${hour12}:${String(mins).padStart(2, "0")}${suffix}`;
}

function formatIntervals(intervals: Interval[]): string {
  return intervals.map(([s, e]) => `${formatTime(s)}–${formatTime(e)}`).join(", ");
}

/**
 * Human-readable hours, e.g. `Mon–Fri 8am–8pm, Sat 9am–5pm`. Null when unparseable, so the
 * caller can fall back to showing the raw OSM string rather than losing the information.
 */
export function formatOpeningHours(spec: string | null | undefined): string | null {
  const week = parseWeek(spec);
  if (!week) return null;

  const allDay = week.every(
    (d) => d?.length === 1 && d[0][0] === 0 && d[0][1] === MINUTES_PER_DAY,
  );
  if (allDay) return "Open 24h";

  const groups: { from: number; to: number; intervals: Interval[] }[] = [];
  for (let day = 0; day < 7; day += 1) {
    const intervals = week[day];
    // Closed or unmentioned days are omitted, and break any run in progress.
    if (!intervals || intervals.length === 0) continue;

    const key = formatIntervals(intervals);
    const last = groups[groups.length - 1];
    if (last && last.to === day - 1 && formatIntervals(last.intervals) === key) {
      last.to = day;
    } else {
      groups.push({ from: day, to: day, intervals });
    }
  }
  if (groups.length === 0) return null;

  return groups
    .map(({ from, to, intervals }) => {
      const days = from === to ? DAY_LABELS[from] : `${DAY_LABELS[from]}–${DAY_LABELS[to]}`;
      return `${days} ${formatIntervals(intervals)}`;
    })
    .join(", ");
}
