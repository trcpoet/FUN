/**
 * Same read, two doors.
 *
 * A signed-out visitor is not allowed to execute the member read RPCs at all
 * (`20260922140000_guest_browse_lock_anon_tables.sql` revokes them), and the
 * `get_guest_*` wrappers they may call return the same shape with every
 * identifying column nulled. So every read the map makes for both audiences
 * picks its function by session, once, here — rather than each call site
 * growing its own `if (user)`.
 *
 * Reads the local session (no network): `getAuthUserIdCached` is fed by the
 * auth listener, and the server re-checks the JWT on every request regardless,
 * so guessing wrong is a wasted round-trip, never a leak.
 */
import { getAuthUserIdCached } from "./authDedup";

export async function pickReadRpc(memberFn: string, guestFn: string): Promise<string> {
  const uid = await getAuthUserIdCached();
  return uid ? memberFn : guestFn;
}

/** True when this session has no user — the same question, without the RPC names. */
export async function isGuestSession(): Promise<boolean> {
  return (await getAuthUserIdCached()) == null;
}
