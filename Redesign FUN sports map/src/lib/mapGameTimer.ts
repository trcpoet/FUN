import type { GameRow } from "./supabase";

/** Untimed games (no `starts_at`) stay on the map for this long after creation, then are hidden. */
export const MAP_UNTIMED_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** Games created from a sports venue flow set `location_label`; map-tap games do not. */
export function isVenueGame(game: GameRow): boolean {
  return Boolean(game.location_label?.trim());
}

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/** Countdown string for map pill: `dd/hh/mm/ss` (always two digits each). */
export function formatCountdownDHMS(totalMs: number): string {
  const s = Math.max(0, Math.floor(totalMs / 1000));
  const dd = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${pad2(dd)}/${pad2(hh)}/${pad2(mm)}/${pad2(ss)}`;
}

/** Tiers for pill styling: last hour = critical, same day window = high, else calm. */
export type CountdownUrgency = "critical" | "high" | "calm";

export function getCountdownUrgency(totalMs: number): CountdownUrgency {
  if (totalMs < 60 * 60 * 1000) return "critical";
  if (totalMs < 24 * 60 * 60 * 1000) return "high";
  return "calm";
}

/**
 * Urgent-feeling countdown: clock under 1h (MM:SS), mission-timer under 24h (HH:MM:SS),
 * compact days for longer windows (Xd Xh Xm).
 */
export function formatUrgentCountdown(totalMs: number): string {
  const s = Math.max(0, Math.floor(totalMs / 1000));
  const dd = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;

  if (dd >= 1) {
    return `${dd}d ${hh}h ${mm}m`;
  }
  if (hh >= 1) {
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }
  return `${pad2(mm)}:${pad2(ss)}`;
}

/** Remaining ms until scheduled start, or until map TTL for untimed random games. Null = no countdown (live / expired). */
export function getCountdownRemainingMs(game: GameRow, nowMs: number): number | null {
  if (game.starts_at) {
    const t = new Date(game.starts_at).getTime();
    if (t <= nowMs) return null;
    return t - nowMs;
  }
  const created = new Date(game.created_at).getTime();
  const exp = created + MAP_UNTIMED_TTL_MS;
  const left = exp - nowMs;
  return left > 0 ? left : null;
}

export function isGameLive(game: GameRow, nowMs: number): boolean {
  if (!game.starts_at) return false;
  return new Date(game.starts_at).getTime() <= nowMs;
}

/** For colocated HTML pins: only non-venue games contribute; pick the tightest upcoming deadline. */
export function minCountdownAmongRandomGames(games: GameRow[], nowMs: number): { mode: "live" } | { mode: "countdown"; ms: number } | null {
  const relevant = games.filter((g) => !isVenueGame(g));
  if (relevant.length === 0) return null;

  let best: number | null = null;
  let anyLive = false;
  for (const g of relevant) {
    if (g.starts_at && new Date(g.starts_at).getTime() <= nowMs) {
      anyLive = true;
      continue;
    }
    const rem = getCountdownRemainingMs(g, nowMs);
    if (rem != null) {
      best = best == null ? rem : Math.min(best, rem);
    }
  }
  if (best != null) return { mode: "countdown", ms: best };
  if (anyLive) return { mode: "live" };
  return null;
}

/** Venue modal copy: scheduled time + countdown, Live, or map TTL for untimed games. */
export function formatVenueGameTimerSummary(game: GameRow, nowMs: number): string {
  if (game.starts_at) {
    const d = new Date(game.starts_at);
    const t = d.getTime();
    const dateStr = d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    if (t <= nowMs) return `${dateStr} · Live`;
    return `${dateStr} · starts in ${formatUrgentCountdown(t - nowMs)}`;
  }
  const rem = getCountdownRemainingMs(game, nowMs);
  if (rem == null) return "No longer on map";
  return `No set time · ${formatUrgentCountdown(rem)} left on map`;
}

/** Hide games without a scheduled time after the TTL from `created_at`. Timed games stay until start (shown as Live). */
export function filterGamesVisibleOnMap(games: GameRow[], nowMs: number): GameRow[] {
  return games.filter((g) => {
    if (g.starts_at) return true;
    const created = new Date(g.created_at).getTime();
    return nowMs - created < MAP_UNTIMED_TTL_MS;
  });
}

