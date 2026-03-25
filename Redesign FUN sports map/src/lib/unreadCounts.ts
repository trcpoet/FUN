type UnreadStore = Record<string, { count: number; updatedAt: number }>;

const STORAGE_KEY = "fun_unread_counts_v1";

function safeParse(raw: string | null): UnreadStore {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    return v as UnreadStore;
  } catch {
    return {};
  }
}

function readStore(): UnreadStore {
  if (typeof localStorage === "undefined") return {};
  return safeParse(localStorage.getItem(STORAGE_KEY));
}

function writeStore(next: UnreadStore) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function threadKey(kind: "game" | "dm", id: string): string {
  return `${kind}:${id}`;
}

export function getUnreadCount(key: string): number {
  const store = readStore();
  const entry = store[key];
  return entry && Number.isFinite(entry.count) ? Math.max(0, Math.floor(entry.count)) : 0;
}

export function incrementUnread(key: string, delta = 1): number {
  const store = readStore();
  const prev = store[key]?.count ?? 0;
  const next = Math.max(0, Math.floor(prev) + Math.max(0, Math.floor(delta)));
  const updatedAt = Date.now();
  const nextStore: UnreadStore = { ...store, [key]: { count: next, updatedAt } };
  writeStore(nextStore);
  return next;
}

export function clearUnread(key: string) {
  const store = readStore();
  if (!store[key]) return;
  const nextStore: UnreadStore = { ...store, [key]: { count: 0, updatedAt: Date.now() } };
  writeStore(nextStore);
}

export function badgeText(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? "9+" : String(count);
}

