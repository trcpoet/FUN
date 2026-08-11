/**
 * Retry a Supabase read that failed for a reason that says nothing about the answer.
 *
 * On 2026-08-11 the project's API layer returned 500s and then a wall of 503s for a window,
 * across every endpoint including plain table reads. The database was untouched — 150 days of
 * uptime, no locks, no stuck queries — but the app fired each read exactly once and rendered
 * the failure as data: `get_games_nearby` erroring meant `setGames([])`, which is pixel-for-pixel
 * "there are no games near you". A transient 5xx should cost a second, not a blank map.
 *
 * Scope is deliberately small: reads only, and only the kinds `isTransientRpcError` admits.
 * Retrying a write risks doing it twice, and retrying a permission or missing-function error
 * just hammers a server that has already given its final answer.
 */
import { isTransientRpcError, type RpcErrorLike } from "./rpcErrors";

export type SupabaseLikeResult<T> = { data: T; error: RpcErrorLike };

export type RetryOptions = {
  /** Attempts after the first. Two extra tries covers a restart without stampeding. */
  retries?: number;
  /** First backoff step; each retry doubles it. */
  baseDelayMs?: number;
  /** Injectable for tests — real callers use the default. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests, so jitter doesn't make assertions flaky. */
  random?: () => number;
  /** Lets a caller abandon retries when the request is no longer wanted. */
  shouldContinue?: () => boolean;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Full jitter. A fixed backoff would line every client that saw the same outage up on the same
 * millisecond, which is how a recovering server gets knocked over a second time.
 */
function backoffMs(attempt: number, base: number, random: () => number): number {
  return Math.round(random() * base * 2 ** attempt);
}

export async function retryTransient<T>(
  // `PromiseLike`, not `Promise`: supabase-js hands back a PostgrestFilterBuilder, which is a
  // thenable and only becomes a real promise when awaited.
  run: () => PromiseLike<SupabaseLikeResult<T>>,
  opts: RetryOptions = {},
): Promise<SupabaseLikeResult<T>> {
  const {
    retries = 2,
    baseDelayMs = 400,
    sleep = defaultSleep,
    random = Math.random,
    shouldContinue,
  } = opts;

  let result = await run();

  for (let attempt = 0; attempt < retries; attempt++) {
    if (!result.error || !isTransientRpcError(result.error)) return result;
    if (shouldContinue && !shouldContinue()) return result;
    await sleep(backoffMs(attempt, baseDelayMs, random));
    if (shouldContinue && !shouldContinue()) return result;
    result = await run();
  }

  return result;
}
