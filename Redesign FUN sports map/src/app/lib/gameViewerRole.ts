/**
 * What one viewer is allowed to do with one game.
 *
 * Four surfaces list games — the map popup, the venue modal, the colocated-games chooser and
 * the live strip — and each had grown its own copy of these gates. They drifted: only the map
 * popup ever offered Start/End, and the chooser offered Delete but not Start/End. This module
 * is the single answer, so a new surface gets the full set for free.
 *
 * Liveness is *not* re-derived here. It comes from `mapGameTimer`, which is the one source of
 * truth for whether a game is live or over.
 */
import type { GameRow } from "../../lib/supabase";
import { isGameEnded, isGameLive } from "../../lib/mapGameTimer";

export type GameViewerRole = {
  isHost: boolean;
  /** Host or guest — anyone holding a `game_participants` row. */
  isJoined: boolean;
  /** Joined the waitlist because the game was full. */
  isSubstitute: boolean;
  isLive: boolean;
  isEnded: boolean;

  canJoin: boolean;
  canLeave: boolean;
  /** Chat is join-gated. Hosts pass because they hold a participant row. */
  canChat: boolean;
  canStart: boolean;
  canEnd: boolean;
  canDelete: boolean;
  /**
   * Clear a finished game's chat out of your inbox without destroying it.
   *
   * This is the host's only exit — `leave_game` rejects hosts outright, so before this the
   * one way to stop an ended game following you around was to delete it and take everyone's
   * chat history with it. Deliberately open to players too: once a game is over, "leave" and
   * "stop showing me this" are different wishes.
   */
  canArchive: boolean;
};

export type GameViewerRoleOptions = {
  currentUserId: string | null;
  joinedGameIds: Set<string>;
  /**
   * Authoritative host set from `game_participants` when the caller has one. Surfaces that
   * don't (the venue modal only receives `currentUserId`) fall back to `created_by`, which is
   * the same test the live strip already uses.
   */
  hostGameIds?: Set<string>;
  substituteGameIds?: Set<string>;
  nowMs: number;
};

export function gameViewerRole(game: GameRow, opts: GameViewerRoleOptions): GameViewerRole {
  const { currentUserId, joinedGameIds, hostGameIds, substituteGameIds, nowMs } = opts;

  const isHost = hostGameIds
    ? hostGameIds.has(game.id)
    : Boolean(currentUserId) && game.created_by === currentUserId;

  // A host always holds a participant row, so derive rather than trust load order: without
  // this, a host whose `joinedGameIds` hasn't landed yet loses Chat and Delete for a beat.
  const isJoined = isHost || joinedGameIds.has(game.id);
  const isSubstitute = Boolean(substituteGameIds?.has(game.id));

  const ended = isGameEnded(game, nowMs);
  const live = isGameLive(game, nowMs);

  return {
    isHost,
    isJoined,
    isSubstitute,
    isLive: live,
    isEnded: ended,

    canJoin: !isJoined && !ended,
    canLeave: isJoined && !isHost,
    canChat: isJoined,
    canStart: isHost && !live && !ended,
    canEnd: isHost && live,
    canDelete: isHost,
    canArchive: isJoined && ended,
  };
}
