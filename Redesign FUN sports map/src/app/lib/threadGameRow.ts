/**
 * One `GameRow` for a chat thread, assembled from what the messenger actually holds.
 *
 * The messenger never loads games — it loads an inbox — so everything that reasons about a
 * game (is it live, may I start it, may I archive it) needs a row built from two partial
 * sources: the focus the caller handed over, and the inbox row for that game. The component
 * used to hand-roll a partial stub inline for its countdown lines; that stub could not be
 * shared with the action bar, and a second copy would be a second chance to disagree.
 *
 * The thread is the only place in the app that lists *every* game you are in regardless of
 * date, so this row is what makes a game three days out manageable at all.
 */
import type { GameInboxRow, GameRow, GameVisibility } from "../../lib/supabase";

/** `GameThreadFocus` minus its `kind` tag — declared structurally so this module stays leaf-level. */
export type ThreadGameSource = {
  gameId: string;
  title: string;
  sport: string;
  startsAt?: string | null;
  endsAt?: string | null;
  durationMinutes?: number | null;
  createdAt?: string | null;
  participantCount?: number;
  spotsRemaining?: number;
  createdBy?: string | null;
  visibility?: GameVisibility | null;
  inviteToken?: string | null;
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string | null;
};

/** First non-nullish wins: the focus is fresher, the inbox row is the fallback. */
function pick<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  return a ?? b ?? null;
}

export function threadGameRow(
  focus: ThreadGameSource,
  inboxRow?: GameInboxRow | null,
): GameRow {
  const participantCount = focus.participantCount ?? inboxRow?.participant_count ?? 0;
  const spotsRemaining = focus.spotsRemaining ?? inboxRow?.spots_remaining ?? 0;

  // `get_my_game_inbox` returns the two halves but not the total, so rebuild it. Both halves
  // come from the same row, so the sum is exact rather than an estimate.
  const spotsNeeded = participantCount + spotsRemaining;

  const startsAt = pick(focus.startsAt, inboxRow?.starts_at);

  return {
    id: focus.gameId,
    title: focus.title,
    sport: focus.sport,
    spots_needed: spotsNeeded,
    participant_count: participantCount,
    spots_remaining: spotsRemaining,
    starts_at: startsAt,
    created_by: pick(focus.createdBy, inboxRow?.created_by),
    // The TTL anchor for untimed games. Falling back to `starts_at` keeps a scheduled game's
    // countdown honest; the empty-string last resort parses to NaN, which every
    // `mapGameTimer` helper already treats as "no anchor" rather than as 1970.
    created_at: focus.createdAt ?? startsAt ?? "",
    status: inboxRow?.status,
    ends_at: pick(focus.endsAt, inboxRow?.ends_at),
    duration_minutes: pick(focus.durationMinutes, inboxRow?.duration_minutes),
    visibility: pick(focus.visibility, inboxRow?.visibility),
    invite_token: pick(focus.inviteToken, inboxRow?.invite_token),
    location_label: pick(focus.locationLabel, inboxRow?.location_label),
    // Not carried by the inbox. Nothing the thread renders reads them, and inventing a
    // distance here would put a wrong number on screen the moment one did.
    description: null,
    requirements: null,
    distance_km: 0,
    lat: focus.lat ?? inboxRow?.lat ?? 0,
    lng: focus.lng ?? inboxRow?.lng ?? 0,
  };
}
