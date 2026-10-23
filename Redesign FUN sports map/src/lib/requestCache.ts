type Entry<T> = {
  ts: number;
  ttlMs: number;
  value?: T;
  promise?: Promise<T>;
};

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key) as Entry<T> | undefined;
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
  return (store.get(key) as Entry<T> | undefined)?.value;
}

/** Still inside its TTL, so `cachedAsync` would answer without a request. */
export function cacheIsFresh(key: string): boolean {
  const hit = store.get(key);
  return hit?.value !== undefined && Date.now() - hit.ts <= hit.ttlMs;
}

/** Replace a value in place (an optimistic edit), keeping its age. */
export function cacheSet<T>(key: string, update: (prev: T | undefined) => T) {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit) hit.value = update(hit.value);
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

export function cacheClear(prefix: string) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
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
  const hit = store.get(key) as Entry<T> | undefined;

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
