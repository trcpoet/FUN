import type { GameRow } from "../../lib/supabase";

/** ~10 cm precision — games created at the same map tap share this key. */
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Split games into singles vs groups that share identical coordinates (same venue / double-tap).
 */
export function splitColocatedGames(games: GameRow[]): { singles: GameRow[]; groups: GameRow[][] } {
  const byKey = new Map<string, GameRow[]>();
  for (const g of games) {
    const k = coordKey(g.lat, g.lng);
    const list = byKey.get(k) ?? [];
    list.push(g);
    byKey.set(k, list);
  }
  const singles: GameRow[] = [];
  const groups: GameRow[][] = [];
  for (const list of byKey.values()) {
    if (list.length <= 1) singles.push(list[0]!);
    else groups.push(list);
  }
  return { singles, groups };
}

export function colocatedGroupId(games: GameRow[]): string {
  const sortedIds = [...games].map((g) => g.id).sort();
  return `coloc-${sortedIds.join("-")}`;
}
