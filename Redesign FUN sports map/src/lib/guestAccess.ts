/**
 * What a signed-out visitor may do, and where they land afterwards.
 *
 * The rule the whole app follows: a guest sees WHAT is happening, WHERE, WHEN
 * and HOW MANY are in — never WHO. Reading is open; anything that would write,
 * reveal a person, or open a member surface asks them to sign up at the moment
 * they reach for it, and returns them to exactly what they tapped.
 *
 * The server enforces the reading half (guests read through `get_guest_*`, which
 * project no identity at all — see
 * `supabase/migrations/20260922130000_guest_browse_read_paths.sql`). This module
 * is the client's half: which affordance gates, and what "back where I was"
 * means once the account exists.
 */

/** Everything a guest can reach for that needs an account first. */
export type GateAction =
  | "join"
  | "create"
  | "chat"
  | "note"
  | "comment"
  | "like"
  | "review"
  | "photo"
  | "players"
  | "feed"
  | "profile"
  | "follow";

export function isGuest(userId: string | null | undefined): boolean {
  return !userId;
}

/**
 * Where to send someone after they sign in.
 *
 * Only an in-app path is allowed. `//evil.example` is a protocol-relative URL
 * that browsers treat as another origin, and `?redirect=` is attacker-supplied
 * (RedeemInvite puts it in the URL), so anything that is not a single-slash
 * relative path is dropped rather than sanitised — a half-trusted redirect is
 * worth less than the map.
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null; // some browsers normalise \\ to //
  // A control character can hide a second line from a naive check; there is no
  // legitimate path with one.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

/** The map deep links App already understands (see the focus* effects in App.tsx). */
export function returnToForGame(gameId: string): string {
  return `/?focusGameId=${encodeURIComponent(gameId)}`;
}

export function returnToForVenue(venueId: string): string {
  return `/?focusVenueId=${encodeURIComponent(venueId)}`;
}

export function returnToForNote(noteId: string): string {
  return `/?focusNoteId=${encodeURIComponent(noteId)}`;
}

/** The single auth surface: the Profile tab, in the mode the caller needs. */
export function profileAuthPath(mode: "signin" | "signup" = "signin"): string {
  return `/profile?auth=${mode}`;
}

/**
 * How many players are in, without saying who.
 *
 * A guest gets the same headcount a member sees on the front of the card; what
 * they do not get is the roster behind it.
 */
export function squadCountLabel(filled: number, needed: number): string {
  return `${filled} of ${needed} in`;
}
