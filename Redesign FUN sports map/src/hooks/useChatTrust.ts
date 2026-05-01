import { useMemo } from "react";
import { readFollowedIds } from "../lib/localFollows";

export type ChatTrust = "self" | "host" | "friend" | "mutual" | "stranger";

export type ChatTrustMember = {
  userId: string;
  /** Optional: when true, this row is the host of the game (overrides "stranger"). */
  isHost?: boolean;
};

export type ChatTrustResolveArgs = {
  /** Current viewer (auth.uid()) — used to mark "self". */
  currentUserId: string | null;
  /** Game host id — used to mark "host" so they're never strangers. */
  hostUserId: string | null | undefined;
  /** Members participating in the chat (you + roster). */
  members: ReadonlyArray<ChatTrustMember>;
};

/**
 * Resolves each chat participant to a trust tier so stranger-vs-known UX
 * can be applied (badges, collapsed-by-default messages, DM gating).
 *
 * Today the social graph lives in localStorage (`localFollows.ts`). The DB
 * `user_follows` table is provisioned but the client UI hasn't been migrated
 * over yet — once it is, swap `readFollowedIds()` for a server query.
 *
 * Notes:
 *   - "mutual" requires both directions of follow; with the local-only graph
 *     we can only see direction (you → them). When the DB graph is wired up,
 *     pass `mutualFollowIds` to mark true mutuals and downgrade one-way
 *     follows to "friend".
 */
export function useChatTrust(args: ChatTrustResolveArgs): Map<string, ChatTrust> {
  const { currentUserId, hostUserId, members } = args;

  return useMemo(() => {
    const followed = readFollowedIds();
    const out = new Map<string, ChatTrust>();
    for (const m of members) {
      if (currentUserId != null && m.userId === currentUserId) {
        out.set(m.userId, "self");
        continue;
      }
      if (m.isHost || (hostUserId != null && m.userId === hostUserId)) {
        out.set(m.userId, "host");
        continue;
      }
      if (followed.has(m.userId)) {
        out.set(m.userId, "friend");
        continue;
      }
      out.set(m.userId, "stranger");
    }
    return out;
  }, [currentUserId, hostUserId, members]);
}

/** Compact, low-contrast badge label per trust tier. Returns null when no badge needed. */
export function trustBadgeLabel(trust: ChatTrust | undefined): string | null {
  switch (trust) {
    case "stranger":
      return "Stranger";
    case "host":
      return "Host";
    case "friend":
      return "Friend";
    case "mutual":
      return "Mutual";
    default:
      return null;
  }
}
