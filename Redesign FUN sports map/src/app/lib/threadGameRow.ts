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
 * date, so this row is what makes a game three days out manageable at all — and the only
 * reason it can tell a game that finished early from one still running is that both
 * `ended_at` and `live_started_at` come through here.
 */
import type { GameInboxRow, GameRow, GameVisibility } from "../../lib/supabase";

/** `GameThreadFocus` minus its `kind` tag — declared structurally so this module stays leaf-level. */
export type ThreadGameSource = {
  gameId: string;
  title: string;
  sport: string;
  startsAt?: string | null;
  endsAt?: string | null;
  /** When the host pressed End. Whatever this says beats every scheduled window. */
  endedAt?: string | null;
  /** When the host pressed Start. The only end anchor an untimed game has. */
  liveStartedAt?: string | null;
  status?: GameRow["status"];
  durationMinutes?: number | null;
  createdAt?: string | null;
  participantCount?: number;
  spotsRemaining?: number;
  createdBy?: string | null;
  visibility?: GameVisibility | null;
  lat?: number | null;
  lng?: number | null;
  locationLabel?: string | null;
};

/** First non-nullish wins: the focus is fresher, the inbox row is the fallback. */
function pick<T>(a: T | null | undefined, b: T | null | undefined): T | null {
  return a ?? b ?? null;
}

/**
 * A `GameInboxRow` read as a `GameRow`.
 *
 * The inbox has its own lifecycle questions to answer — which threads belong under
 * "Past games" — and answering them with a private copy of the rules is how the
 * list and the thread header end up disagreeing about the same game. This makes the
 * shared `mapGameTimer` predicates apply to an inbox row directly.
 */
export function inboxGameRow(row: GameInboxRow): GameRow {
  const participantCount = row.participant_count ?? 0;
  const spotsRemaining = row.spots_remaining ?? 0;
  return {
    id: row.id,
    title: row.title,
    sport: row.sport,
    spots_needed: participantCount + spotsRemaining,
    participant_count: participantCount,
    spots_remaining: spotsRemaining,
    starts_at: row.starts_at,
    created_by: row.created_by ?? null,
    // Not returned by the inbox. `starts_at` keeps a scheduled game's TTL honest; the
    // empty-string last resort parses to NaN, which every `mapGameTimer` helper treats
    // as "no anchor" rather than as 1970.
    created_at: row.starts_at ?? "",
    status: row.status,
    ends_at: row.ends_at ?? null,
    ended_at: row.ended_at ?? null,
    live_started_at: row.live_started_at ?? null,
    duration_minutes: row.duration_minutes ?? null,
    visibility: row.visibility ?? null,
    location_label: row.location_label ?? null,
    description: null,
    requirements: null,
    distance_km: 0,
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
  };
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
    status: focus.status ?? inboxRow?.status,
    ends_at: pick(focus.endsAt, inboxRow?.ends_at),
    // Without these two the header falls back to `starts_at + duration`, which is how a
    // game the host ended 20 minutes in used to read "Live · 70:00 left" in its own chat.
    ended_at: pick(focus.endedAt, inboxRow?.ended_at),
    live_started_at: pick(focus.liveStartedAt, inboxRow?.live_started_at),
    duration_minutes: pick(focus.durationMinutes, inboxRow?.duration_minutes),
    visibility: pick(focus.visibility, inboxRow?.visibility),
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
