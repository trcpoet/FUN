/**
 * Co-location grouping for anything pinned to the map.
 *
 * Games and notes both stack when they share a coordinate — a venue tapped twice, or a
 * note dropped where one already sits. The grouping only reads `id`/`lat`/`lng`, so it is
 * generic over the row type rather than duplicated per feature.
 */

/** Anything with an identity and a position on the map. */
export type MapPoint = { id: string; lat: number; lng: number };

/** ~10 cm precision — items created at the same map tap share this key. */
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Split items into singles vs groups that share identical coordinates (same venue / double-tap).
 */
export function splitColocated<T extends MapPoint>(items: T[]): { singles: T[]; groups: T[][] } {
  const byKey = new Map<string, T[]>();
  for (const item of items) {
    const k = coordKey(item.lat, item.lng);
    const list = byKey.get(k) ?? [];
    list.push(item);
    byKey.set(k, list);
  }
  const singles: T[] = [];
  const groups: T[][] = [];
  for (const list of byKey.values()) {
    if (list.length <= 1) singles.push(list[0]!);
    else groups.push(list);
  }
  return { singles, groups };
}

export function colocatedGroupId(items: { id: string }[]): string {
  const sortedIds = [...items].map((item) => item.id).sort();
  return `coloc-${sortedIds.join("-")}`;
}
