import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Supabase GoTrue uses a cross-tab lock to guard token refresh/session reads.
 * In React dev (Strict Mode) and with many hooks calling auth methods at once,
 * concurrent `getUser()` / `getSession()` calls can contend and throw
 * "Lock broken by another request with the 'steal' option".
 *
 * Deduping in-flight calls eliminates the contention without changing auth behavior.
 */

let inFlightUser: Promise<User | null> | null = null;
export async function getAuthUserDeduped(): Promise<User | null> {
  if (!supabase) return null;
  if (inFlightUser) return inFlightUser;
  inFlightUser = supabase.auth
    .getUser()
    .then(({ data }) => data.user ?? null)
    .catch(() => null)
    .finally(() => {
      inFlightUser = null;
    });
  return inFlightUser;
}

let inFlightSession: Promise<Session | null> | null = null;
export async function getAuthSessionDeduped(): Promise<Session | null> {
  if (!supabase) return null;
  if (inFlightSession) return inFlightSession;
  inFlightSession = supabase.auth
    .getSession()
    .then(({ data }) => data.session ?? null)
    .catch(() => null)
    .finally(() => {
      inFlightSession = null;
    });
  return inFlightSession;
}

// A single module-level auth listener keeps the current user id fresh, so callers
// that only need the id can avoid a per-call `auth.getUser()` network round-trip.
let cachedUserId: string | null = null;
let cachedUserIdReady = false;
if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedUserId = session?.user?.id ?? null;
    cachedUserIdReady = true;
  });
}

/**
 * Current user id from the local session (no network), kept fresh by the listener
 * above. Falls back to a deduped getSession() until the first auth event lands.
 * Prefer this over `auth.getUser()` wherever only the id is needed for client
 * logic — RLS still enforces auth server-side.
 */
export async function getAuthUserIdCached(): Promise<string | null> {
  if (cachedUserIdReady) return cachedUserId;
  const session = await getAuthSessionDeduped();
  cachedUserId = session?.user?.id ?? null;
  cachedUserIdReady = true;
  return cachedUserId;
}

