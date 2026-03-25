export const FOLLOW_STORAGE_KEY = "fun_discover_followed_ids";

export function readFollowedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(FOLLOW_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string" && x.trim()));
  } catch {
    return new Set();
  }
}

export function writeFollowedIds(ids: Set<string>) {
  try {
    localStorage.setItem(FOLLOW_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* private mode */
  }
}

export function isFollowing(userId: string): boolean {
  return readFollowedIds().has(userId);
}

export function toggleFollowing(userId: string): { next: boolean; followedIds: Set<string> } {
  const prev = readFollowedIds();
  const nextSet = new Set(prev);
  if (nextSet.has(userId)) nextSet.delete(userId);
  else nextSet.add(userId);
  writeFollowedIds(nextSet);
  return { next: nextSet.has(userId), followedIds: nextSet };
}

