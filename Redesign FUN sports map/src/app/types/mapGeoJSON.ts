/**
 * Typed GeoJSON and game feature properties for the FUN map.
 * Games layer: glow (CircleLayer) + sport icon + roster text (SymbolLayers).
 * User marker: single Point for 3D avatar (ModelLayer/custom layer).
 */

import type { Feature, FeatureCollection, Point } from "geojson";
import type { GameRow } from "../../lib/supabase";

/** Game status for glow color: live => red, soon => orange, scheduled => green */
export type GameStatus = "live" | "soon" | "scheduled";

export type GameFeatureProperties = {
  id: string;
  sport: string;
  status: GameStatus;
  players_filled: number;
  players_total: number;
  players_label: string; // e.g. "3/10"
  sport_emoji: string; // e.g. "🏀" for map symbol
  visibility?: "public" | "private";
  title?: string;
};

const SPORT_EMOJI: Record<string, string> = {
  basketball: "🏀",
  soccer: "⚽",
  football: "🏈",
  volleyball: "🏐",
  tennis: "🎾",
  running: "🏃",
  pickup: "🎯",
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

/** Map GameRow to GeoJSON feature. players_filled can come from backend later; we use 0 for now. */
export function gameToFeature(
  game: GameRow,
  playersFilled: number = 0,
  selectedGameId: string | null
): GameFeature {
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
      status,
      players_filled: playersFilled,
      players_total,
      players_label: `${playersFilled}/${players_total}`,
      sport_emoji: SPORT_EMOJI[game.sport.toLowerCase()] ?? SPORT_EMOJI.pickup,
      title: game.title,
    },
  };
}

export function gamesToGeoJSON(
  games: GameRow[],
  selectedGameId: string | null,
  getPlayersFilled?: (gameId: string) => number
): GamesGeoJSON {
  const features = games.map((g) =>
    gameToFeature(g, getPlayersFilled?.(g.id) ?? 0, selectedGameId)
  );
  return {
    type: "FeatureCollection",
    features,
  };
}

/** Sport key to Mapbox icon-image name (we register these images on the map). */
export const SPORT_ICON_IDS = [
  "basketball",
  "soccer",
  "football",
  "volleyball",
  "tennis",
  "running",
  "pickup",
] as const;

export type SportIconId = (typeof SPORT_ICON_IDS)[number];

/** Normalize backend sport string to icon id (lowercase, match SPORTS in CreateGameSheet). */
export function sportToIconId(sport: string): SportIconId {
  const lower = sport.toLowerCase();
  if (SPORT_ICON_IDS.includes(lower as SportIconId)) return lower as SportIconId;
  return "pickup";
}
