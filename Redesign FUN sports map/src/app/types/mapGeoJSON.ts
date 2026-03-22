/**
 * Typed GeoJSON and game feature properties for the FUN map.
 * Games layer: glow (CircleLayer) + sport icon + roster text (SymbolLayers).
 * User marker: single Point for 3D avatar (ModelLayer/custom layer).
 */

import type { Feature, FeatureCollection, Point } from "geojson";
import type { GameRow } from "../../lib/supabase";
import { colocatedGroupId, splitColocatedGames } from "../lib/colocateGames";
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
  sport_emoji: string; // UI / parity with map glyph
  visibility?: "public" | "private";
  title?: string;
  /** Same-spot games: hidden on symbol layer; shown as HTML cluster pin instead. */
  marker_kind?: "colocated";
};

export type GameFeature = Feature<Point, GameFeatureProperties>;
export type GamesGeoJSON = FeatureCollection<Point, GameFeatureProperties>;

export type UserMarkerFeatureProperties = {
  type: "user";
  avatar_glb_url?: string | null;
};

export type UserMarkerFeature = Feature<Point, UserMarkerFeatureProperties>;

/** Derive status from starts_at: in past => live, within 1h => soon, else scheduled */
export function getGameStatus(startsAt: string | null): GameStatus {
  if (!startsAt) return "scheduled";
  const start = new Date(startsAt).getTime();
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  if (start <= now) return "live";
  if (start - now <= oneHour) return "soon";
  return "scheduled";
}

/** Map GameRow to GeoJSON feature. Uses `participant_count` from `get_games_nearby` when present. */
export function gameToFeature(game: GameRow, _selectedGameId: string | null): GameFeature {
  const players_filled = game.participant_count ?? 0;
  const players_total = game.spots_needed;
  const status = getGameStatus(game.starts_at);
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
      players_label: `${players_filled}/${players_total}`,
      sport_emoji: getSportIconEmoji(game.sport),
      title: game.title,
    },
  };
}

function colocatedGroupToFeature(games: GameRow[]): GameFeature {
  const g0 = games[0]!;
  const id = colocatedGroupId(games);
  const totalSpots = games.reduce((s, g) => s + (g.spots_needed ?? 0), 0);
  const filled = games.reduce((s, g) => s + (g.participant_count ?? 0), 0);
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
      status: getGameStatus(g0.starts_at),
      players_filled: filled,
      players_total: totalSpots,
      players_label: String(games.length),
      sport_emoji: getSportIconEmoji(g0.sport),
      title: `${games.length} games`,
    },
  };
}

export function gamesToGeoJSON(games: GameRow[], selectedGameId: string | null): GamesGeoJSON {
  const { singles, groups } = splitColocatedGames(games);
  const features: GameFeature[] = [
    ...singles.map((g) => gameToFeature(g, selectedGameId)),
    ...groups.map((grp) => colocatedGroupToFeature(grp)),
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
