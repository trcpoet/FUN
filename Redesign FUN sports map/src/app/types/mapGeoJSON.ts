/**
 * Typed GeoJSON and game feature properties for the FUN map.
 * Games layer: glow (CircleLayer) + sport icon + roster text (SymbolLayers).
 * User marker: single Point for 3D avatar (ModelLayer/custom layer).
 */

import type { Feature, FeatureCollection, Point } from "geojson";
import type { GameRow } from "../../lib/supabase";
import { isGameEnded, isGameLive, isVenueGame } from "../../lib/mapGameTimer";
import { colocatedGroupId, splitColocated } from "../lib/colocateGames";
import { getGameMapboxIconId, getSportIconEmoji, resolveSportMapboxSuffix } from "../map/gameSportIcons";

/** Game status for glow color: live => red, soon => orange, scheduled => green */
export type GameStatus = "live" | "soon" | "scheduled";

export type GameFeatureProperties = {
  id: string;
  sport: string;
  /** Registered Mapbox `icon-image` id (rasterized emoji badge). */
  sport_map_icon: string;
  status: GameStatus;
  players_filled: number;
  players_total: number;
  players_label: string; // e.g. "3/10"
  /** Roster text under GL icon (venue games only; random-location games use HTML pins). */
  map_label: string;
  sport_emoji: string; // UI / parity with map glyph
  visibility?: "public" | "private";
  title?: string;
  /**
   * Why this game is hidden on the symbol layer:
   *  · `colocated` — same-spot games, shown as one HTML cluster pin instead.
   *  · `at_venue`  — absorbed by a venue's composite pin (its icon would otherwise cover the
   *    venue and eat its click).
   * Either way the feature stays in the source so low-zoom game clusters still count it.
   */
  marker_kind?: "colocated" | "at_venue";
};

export type GameFeature = Feature<Point, GameFeatureProperties>;
export type GamesGeoJSON = FeatureCollection<Point, GameFeatureProperties>;

export type UserMarkerFeatureProperties = {
  type: "user";
  avatar_glb_url?: string | null;
};

export type UserMarkerFeature = Feature<Point, UserMarkerFeatureProperties>;

const SOON_MS = 60 * 60 * 1000;

/**
 * Ring colour for a game pin: live now, starting within the hour, or later.
 *
 * Delegates the "is it live" question to the canonical predicate rather than re-deriving it
 * from `starts_at` alone. The old version answered "live" for any game whose start had passed,
 * which meant a finished game still wore a red ring, and it missed host-started games whose
 * scheduled start was still in the future — so both callers had to special-case
 * `status === "live"` themselves before calling it.
 */
export function getGameStatus(game: GameRow, nowMs: number = Date.now()): GameStatus {
  if (isGameLive(game, nowMs)) return "live";
  if (isGameEnded(game, nowMs)) return "scheduled";
  if (!game.starts_at?.trim()) return "scheduled";
  const start = new Date(game.starts_at).getTime();
  if (Number.isNaN(start)) return "scheduled";
  return start - nowMs <= SOON_MS ? "soon" : "scheduled";
}

/** Map GameRow to GeoJSON feature (venue / non-colocated games only). Uses `participant_count` from `get_games_nearby` when present. */
export function gameToFeature(
  game: GameRow,
  _selectedGameId: string | null,
  nowMs: number = Date.now()
): GameFeature {
  const players_filled = game.participant_count ?? 0;
  const players_total = game.spots_needed;
  const status = getGameStatus(game, nowMs);
  const players_label = `${players_filled}/${players_total}`;
  const map_label = players_label;
  return {
    type: "Feature",
    id: game.id,
    geometry: {
      type: "Point",
      coordinates: [game.lng, game.lat],
    },
    properties: {
      id: game.id,
      sport: game.sport,
      sport_map_icon: getGameMapboxIconId(game.sport),
      status,
      players_filled,
      players_total,
      players_label,
      map_label,
      sport_emoji: getSportIconEmoji(game.sport),
      title: game.title,
    },
  };
}

function colocatedGroupToFeature(games: GameRow[], nowMs: number = Date.now()): GameFeature {
  const g0 = games[0]!;
  const id = colocatedGroupId(games);
  const totalSpots = games.reduce((s, g) => s + (g.spots_needed ?? 0), 0);
  const filled = games.reduce((s, g) => s + (g.participant_count ?? 0), 0);
  const players_label = String(games.length);
  const map_label = players_label;
  return {
    type: "Feature",
    id,
    geometry: {
      type: "Point",
      coordinates: [g0.lng, g0.lat],
    },
    properties: {
      id,
      marker_kind: "colocated",
      sport: "multi",
      sport_map_icon: getGameMapboxIconId(g0.sport),
      // A stack reads as live if anything in it is; otherwise take the most urgent member.
      status: games.some((g) => isGameLive(g, nowMs)) ? "live" : getGameStatus(g0, nowMs),
      players_filled: filled,
      players_total: totalSpots,
      players_label,
      map_label,
      sport_emoji: getSportIconEmoji(g0.sport),
      title: `${games.length} games`,
    },
  };
}

/**
 * GeoJSON for Mapbox GL: venue-only singles + colocated cluster points.
 * Random-location singles (no `location_label`) are rendered as HTML markers with a countdown pill.
 *
 * `absorbedGameIds` marks games that sit on top of a venue. They keep their feature — so the
 * low-zoom cluster bubbles still count them — but get `marker_kind: "at_venue"`, which the
 * icon and roster layers filter out. Their glyph lives on the venue's composite pin instead.
 */
export function gamesToGeoJSON(
  games: GameRow[],
  selectedGameId: string | null,
  absorbedGameIds?: ReadonlySet<string>
): GamesGeoJSON {
  const { singles, groups } = splitColocated(games);
  const venueSingles = singles.filter(isVenueGame);
  const absorbed = (id: string) => absorbedGameIds?.has(id) ?? false;
  // One clock for the whole collection, so two pins built in the same pass can't disagree
  // about whether the same instant counts as live.
  const nowMs = Date.now();

  const features: GameFeature[] = [
    ...venueSingles.map((g) => {
      const f = gameToFeature(g, selectedGameId, nowMs);
      if (absorbed(g.id)) f.properties.marker_kind = "at_venue";
      return f;
    }),
    ...groups.map((grp) => {
      const f = colocatedGroupToFeature(grp, nowMs);
      // Colocated games share one coordinate, so they are absorbed all-or-nothing.
      if (grp.every((g) => absorbed(g.id))) f.properties.marker_kind = "at_venue";
      return f;
    }),
  ];
  return {
    type: "FeatureCollection",
    features,
  };
}

/** @deprecated Use `resolveSportMapboxSuffix` from `../map/gameSportIcons` */
export const SPORT_ICON_IDS = [
  "basketball",
  "soccer",
  "football",
  "volleyball",
  "tennis",
  "pickleball",
  "running",
  "gym",
  "other",
] as const;

export type SportIconId = (typeof SPORT_ICON_IDS)[number];

/** Normalize backend sport string to icon id (CreateGame / filters). */
export function sportToIconId(sport: string): SportIconId {
  const s = resolveSportMapboxSuffix(sport);
  if (SPORT_ICON_IDS.includes(s as SportIconId)) return s as SportIconId;
  return "other";
}
