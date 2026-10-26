type Entry<T> = {
  ts: number;
  ttlMs: number;
  value?: T;
  promise?: Promise<T>;
};

const store = new Map<string, Entry<unknown>>();

// —— Persistence ——
//
// Memory alone empties on every page load, so reopening the app painted skeletons
// for a feed it had shown a minute before. Keys under a prefix registered with
// `persistUnder` are also written to localStorage and read back on a cold start —
// always as stale, so they paint at once and are revalidated behind.
//
// Three rules keep that safe:
//  - an entry from another build is discarded, so a stored shape never meets code
//    written for a newer one (FUN deploys several times a day; the cost is one
//    skeleton after a deploy);
//  - an entry older than PERSIST_MAX_AGE_MS is discarded, so nobody opens the app
//    on yesterday's games;
//  - the owners' keys carry the user id, and sign-out clears them.

const STORAGE_PREFIX = "fun.rq.v1:";
const PERSIST_MAX_AGE_MS = 12 * 60 * 60_000;
/** A list bigger than this is not worth a synchronous parse on the next start. */
const PERSIST_MAX_CHARS = 256 * 1024;

const persistedPrefixes: string[] = [];

/** Keep entries under `prefix` across page loads. Their values must survive JSON. */
export function persistUnder(prefix: string) {
  if (!persistedPrefixes.includes(prefix)) persistedPrefixes.push(prefix);
}

const isPersisted = (key: string) => persistedPrefixes.some((p) => key.startsWith(p));

let build: string | null = null;
/** The entry script's hashed name: different on every deploy that changes code. */
function buildId(): string {
  if (build == null) {
    try {
      build =
        document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute("src") ??
        "dev";
    } catch {
      build = "dev";
    }
  }
  return build;
}

type Stored = { b: string; t: number; v: unknown };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hydrate<T>(key: string): Entry<T> | undefined {
  if (!isPersisted(key)) return undefined;
  const ls = storage();
  if (!ls) return undefined;
  try {
    const raw = ls.getItem(STORAGE_PREFIX + key);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as Stored;
    if (stored.b !== buildId() || !(Date.now() - stored.t < PERSIST_MAX_AGE_MS)) {
      ls.removeItem(STORAGE_PREFIX + key);
      return undefined;
    }
    // ttlMs 0: always stale, so the first read revalidates it.
    const entry: Entry<T> = { ts: stored.t, ttlMs: 0, value: stored.v as T };
    store.set(key, entry as Entry<unknown>);
    return entry;
  } catch {
    try {
      ls.removeItem(STORAGE_PREFIX + key);
    } catch {
      /* nothing to do */
    }
    return undefined;
  }
}

const pendingWrites = new Set<string>();

/** Written when the browser is idle: a feed is ~100 KB of JSON, and this is never urgent. */
function schedulePersist(key: string) {
  if (!isPersisted(key) || pendingWrites.has(key)) return;
  pendingWrites.add(key);
  const write = () => {
    pendingWrites.delete(key);
    const entry = store.get(key);
    const ls = storage();
    if (!entry || entry.value === undefined || !ls) return;
    try {
      const json = JSON.stringify({ b: buildId(), t: entry.ts, v: entry.value } satisfies Stored);
      if (json.length <= PERSIST_MAX_CHARS) ls.setItem(STORAGE_PREFIX + key, json);
    } catch {
      // Quota or private mode: memory still works, the next start just is not instant.
    }
  };
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(write, { timeout: 2000 });
  } else {
    setTimeout(write, 0);
  }
}

function lookup<T>(key: string): Entry<T> | undefined {
  return (store.get(key) as Entry<T> | undefined) ?? hydrate<T>(key);
}

/** Drop stored entries that can no longer be used: another build's, or too old. */
export function pruneStoredCache() {
  const ls = storage();
  if (!ls) return;
  try {
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (!k?.startsWith(STORAGE_PREFIX)) continue;
      try {
        const stored = JSON.parse(ls.getItem(k) ?? "") as Stored;
        if (stored.b !== buildId() || !(Date.now() - stored.t < PERSIST_MAX_AGE_MS)) ls.removeItem(k);
      } catch {
        ls.removeItem(k);
      }
    }
  } catch {
    /* storage unavailable */
  }
}

// —— Reads and writes ——

export function cacheGet<T>(key: string): T | undefined {
  const hit = lookup<T>(key);
  if (!hit) return undefined;
  if (Date.now() - hit.ts > hit.ttlMs) return undefined;
  return hit.value;
}

/**
 * The last value stored under `key`, however old.
 *
 * For painting a screen on mount while a fresh copy loads behind it: a feed that
 * was right a minute ago is a better first frame than a skeleton.
 */
export function cachePeek<T>(key: string): T | undefined {
  return lookup<T>(key)?.value;
}

/** Still inside its TTL, so `cachedAsync` would answer without a request. */
export function cacheIsFresh(key: string): boolean {
  const hit = lookup(key);
  return hit?.value !== undefined && Date.now() - hit.ts <= hit.ttlMs;
}

/** Replace a value in place (an optimistic edit), keeping its age. */
export function cacheSet<T>(key: string, update: (prev: T | undefined) => T) {
  const hit = lookup<T>(key);
  if (!hit) return;
  hit.value = update(hit.value);
  schedulePersist(key);
}

/**
 * Expire every key starting with `prefix` without forgetting them: the next read
 * revalidates, and `cachePeek` still answers meanwhile. Pass a whole key to expire
 * just that one.
 */
export function cacheInvalidate(prefix: string) {
  for (const [k, hit] of store) {
    if (k.startsWith(prefix)) hit.ts = 0;
  }
}

/** Forget every key starting with `prefix`, in memory and in storage. */
export function cacheClear(prefix: string) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
  const ls = storage();
  if (!ls) return;
  try {
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k?.startsWith(STORAGE_PREFIX + prefix)) ls.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
}

/**
 * Dedupe in-flight requests + cache results for ttlMs.
 * If a request is already running, callers share the same promise.
 *
 * A refresh keeps the previous value readable through `cachePeek` while it runs,
 * and a failed one puts it back, so a transient error never blanks a screen that
 * had something to show.
 */
export function cachedAsync<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = lookup<T>(key);

  if (hit) {
    if (hit.promise) return hit.promise;
    if (hit.value !== undefined && now - hit.ts <= hit.ttlMs) return Promise.resolve(hit.value);
  }

  const entry: Entry<T> = { ts: hit?.ts ?? now, ttlMs, value: hit?.value };
  const p = fn()
    .then((v) => {
      entry.value = v;
      entry.promise = undefined;
      entry.ts = Date.now();
      store.set(key, entry);
      schedulePersist(key);
      return v;
    })
    .catch((e) => {
      entry.promise = undefined;
      if (entry.value === undefined) store.delete(key);
      throw e;
    });

  entry.promise = p;
  store.set(key, entry);
  return p;
}
