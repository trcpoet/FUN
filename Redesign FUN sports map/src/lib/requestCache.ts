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

export function cacheClear(prefix: string) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

/**
 * Dedupe in-flight requests + cache results for ttlMs.
 * If a request is already running, callers share the same promise.
 */
export function cachedAsync<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;

  if (hit) {
    if (hit.promise) return hit.promise;
    if (hit.value !== undefined && now - hit.ts <= hit.ttlMs) return Promise.resolve(hit.value);
  }

  const entry: Entry<T> = { ts: now, ttlMs };
  const p = fn()
    .then((v) => {
      entry.value = v;
      entry.promise = undefined;
      entry.ts = Date.now();
      store.set(key, entry);
      return v;
    })
    .catch((e) => {
      store.delete(key);
      throw e;
    });

  entry.promise = p;
  store.set(key, entry);
  return p;
}

