/**
 * Recovering from a deploy that happened while the app was open.
 *
 * Every lazy screen — the feed, a profile, the messenger, Create game — is its own
 * file, named by a hash of its contents. A deploy publishes new names and Vercel
 * stops serving the old ones (a three-deploy-old Feed chunk is a 404). A tab opened
 * before the deploy still holds the old names, so the first time it reaches for a
 * screen it has not loaded yet, the import fails and the screen crashes: "Something
 * went wrong", on a phone that did nothing wrong. FUN deploys several times a day.
 *
 * The fix is the page the person was already on its way to: reload, which fetches
 * the new index.html and the new names. The URL has already changed by the time
 * the import fails, so the reload lands where they tapped.
 */

/** Messages each engine uses for a dynamic import or a CSS preload that failed to load. */
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk [\w-]+ failed|ChunkLoadError/i;

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) return error.name === "ChunkLoadError" || CHUNK_ERROR.test(error.message);
  return typeof error === "string" && CHUNK_ERROR.test(error);
}

/** The file that failed, when the engine names it (Chrome and Firefox do; Safari does not). */
export function chunkUrlFrom(error: unknown): string | null {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return text.match(/https?:\/\/[^\s"')]+\.(?:js|css)\b/)?.[0] ?? null;
}

type ResourceEntry = { name: string; responseStatus?: number };

/**
 * Every hashed file this page saw fail, by Resource Timing's `responseStatus`.
 *
 * Not just the one the error names. An import fails if any file under it does,
 * and the message names only the top: after a deploy, a lazy screen's shared
 * chunks were renamed and removed along with it, and Chrome cached their 404s
 * too. Measured: healing only the named file left a rollback stuck on "FUN was
 * just updated" while Chrome's cache held 200 for that file and 404 for its
 * dependencies.
 *
 * Engines without `responseStatus` contribute nothing, which is fine where it
 * was checked: WebKit neither reports a failed module load here nor serves a
 * cached 404 for it after a rollback.
 */
export function failedAssetUrls(entries: ResourceEntry[]): string[] {
  return entries
    .filter((e) => {
      let path: string;
      try {
        path = new URL(e.name).pathname;
      } catch {
        return false;
      }
      if (!/^\/assets\/.+\.(?:js|css)$/.test(path)) return false;
      return typeof e.responseStatus === "number" && e.responseStatus >= 400;
    })
    .map((e) => e.name);
}

const RELOADED_AT_KEY = "fun:stale-chunk-reload-at";

/**
 * A second failure inside this window means the reload did not help — a broken
 * deploy, or no network — so stop and let the error screen say so, rather than
 * reloading forever.
 */
export const RELOAD_GUARD_MS = 30_000;

type Deps = {
  now: () => number;
  online: () => boolean;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  reload: () => void;
  refetch: (url: string) => Promise<unknown>;
  /** Files this page saw fail, besides the one the error names. */
  failedAssets: () => string[];
};

const browserDeps = (): Deps => ({
  now: () => Date.now(),
  online: () => navigator.onLine !== false,
  storage: (() => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  })(),
  reload: () => window.location.reload(),
  // Overwrites this URL's entry in the HTTP cache. Hashed files are cached for a
  // year, and if a browser ever stored a 404 for one (a tab that hit the old name
  // after a deploy, then a rollback to that deploy), it would otherwise keep
  // replaying it. A failed request here is fine: the reload still happens.
  refetch: (url) => fetch(url, { cache: "reload" }),
  failedAssets: () => {
    try {
      return failedAssetUrls(performance.getEntriesByType("resource") as unknown as ResourceEntry[]);
    } catch {
      return [];
    }
  },
});

/**
 * Reload once to pick up the new deploy. Returns false — do nothing — when that
 * would not help, so the caller shows its error instead:
 * - offline: the import failed for want of a network, and a reload would trade
 *   the app for the browser's offline page;
 * - a reload was already tried moments ago;
 * - no sessionStorage, so nothing could stop a reload loop.
 */
export function recoverFromStaleChunk(error: unknown, deps: Deps = browserDeps()): boolean {
  if (!deps.online()) return false;
  const { storage } = deps;
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(RELOADED_AT_KEY) ?? 0);
    if (Number.isFinite(last) && deps.now() - last < RELOAD_GUARD_MS) return false;
    storage.setItem(RELOADED_AT_KEY, String(deps.now()));
  } catch {
    return false;
  }
  const named = chunkUrlFrom(error);
  const urls = [...new Set([...(named ? [named] : []), ...deps.failedAssets()])];
  const heal = Promise.all(urls.map((u) => deps.refetch(u).catch(() => undefined)));
  void heal.finally(() => deps.reload());
  return true;
}

/**
 * Warm a lazy screen's file without letting a failure escape.
 *
 * After a deploy, a prefetch from a tab opened before it fails (the file is gone).
 * That is harmless — the real tap fails the same way and recovers — but an
 * uncaught rejection would reach Sentry as an error every time FUN deploys.
 */
export function prefetchChunk(load: () => Promise<unknown>): void {
  load().catch(() => undefined);
}
