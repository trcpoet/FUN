/**
 * What a notification says, and where tapping it goes.
 *
 * The feed's Alerts tab and the profile header's bell each had their own copy:
 * the profile's knew two types and called the rest "New notification", and its
 * rows marked themselves read without going anywhere. One copy now, so the same
 * alert reads and behaves the same wherever it is shown.
 */

type NotificationLike = { type: string; payload?: unknown };

function payloadOf(n: NotificationLike): Record<string, unknown> {
  return n.payload && typeof n.payload === "object" ? (n.payload as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function notificationLabel(n: NotificationLike): string {
  const p = payloadOf(n);
  if (n.type === "badge_earned") return `Badge earned: ${str(p.badge_slug) ?? "?"}`;
  if (n.type === "game_completed") return "A game you joined was completed.";
  if (n.type === "new_follower") return "Someone new is following you.";
  if (n.type === "game_nearby") return `New game nearby: ${str(p.sport)?.trim() || "Pickup"}`;
  if (n.type === "map_note_nearby") return "New map note near you.";
  if (n.type === "game_invite") return "You were invited to a game.";
  if (n.type === "note_new_activity") return "New replies on a note you follow.";
  if (n.type === "note_comment_liked") return "Someone liked your comment.";
  return "New notification";
}

/** Whoever caused it, under whichever key the trigger that wrote it used. */
function actorUserId(p: Record<string, unknown>): string | null {
  return (
    str(p.user_id) ??
    str(p.profile_id) ??
    str(p.actor_id) ??
    str(p.from_user_id) ??
    str(p.follower_id) ??
    str(p.invited_by) ??
    str(p.created_by)
  );
}

/**
 * The screen a notification opens, or `null` when it has nowhere to go — in
 * which case it should not look tappable.
 */
export function notificationHref(n: NotificationLike): string | null {
  const p = payloadOf(n);
  if (n.type === "game_nearby" || n.type === "game_invite") {
    const gameId = str(p.game_id);
    return gameId ? `/?focusGameId=${encodeURIComponent(gameId)}` : null;
  }
  if (n.type === "map_note_nearby" || n.type === "note_new_activity" || n.type === "note_comment_liked") {
    const noteId = str(p.note_id);
    return noteId ? `/?focusNoteId=${encodeURIComponent(noteId)}` : null;
  }
  if (n.type === "new_follower") {
    const followerId = str(p.follower_id);
    return followerId ? `/athlete/${encodeURIComponent(followerId)}` : null;
  }
  // Badges are listed on your own profile.
  if (n.type === "badge_earned") return "/profile";
  const actor = actorUserId(p);
  return actor ? `/athlete/${encodeURIComponent(actor)}` : null;
}
