/**
 * Keep an array's identity while its contents are unchanged.
 *
 * WHY
 * ---
 * The map's game list is re-derived every minute (`mapMinuteEpoch` drops expired
 * pickups) and on every filter read. `Array.prototype.filter` always allocates,
 * so the list arrived at MapboxMap as a *new array of the same objects* sixty
 * times an hour — and that identity is a dependency of the DOM-marker effects,
 * the venue `setData` effect and the player-marker effect. Each of those then
 * tore down and rebuilt collections of React roots to redraw exactly what was
 * already on screen.
 *
 * Comparing element identity (not ids) is deliberate: a refetch hands back new
 * row objects for changed games, and those must propagate. Only a filter pass
 * that selected the very same objects is treated as "nothing happened".
 */
import { useRef } from "react";

export function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Returns the previous array when the new one holds the same items in the same order. */
export function useStableItems<T>(list: T[]): T[] {
  const ref = useRef(list);
  if (!sameItems(ref.current, list)) ref.current = list;
  return ref.current;
}

/** Same idea for the id sets the map passes around (`absorbedGameIds`). */
export function sameStringSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

export function useStableStringSet(set: Set<string>): Set<string> {
  const ref = useRef(set);
  if (!sameStringSet(ref.current, set)) ref.current = set;
  return ref.current;
}

/**
 * Same again for a "venue id → games" grouping. The map is re-derived on the
 * minute tick (it re-checks which games have ended), and every consumer of it —
 * the absorbed-id set, the composite venue pins, the GL source — keys off its
 * identity.
 */
export function sameMapOfArrays<T>(
  a: ReadonlyMap<string, readonly T[]>,
  b: ReadonlyMap<string, readonly T[]>
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, listA] of a) {
    const listB = b.get(key);
    if (!listB || !sameItems(listA, listB)) return false;
  }
  return true;
}

export function useStableMapOfArrays<T>(map: Map<string, T[]>): Map<string, T[]> {
  const ref = useRef(map);
  if (!sameMapOfArrays(ref.current, map)) ref.current = map;
  return ref.current;
}
