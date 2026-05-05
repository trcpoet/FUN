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

