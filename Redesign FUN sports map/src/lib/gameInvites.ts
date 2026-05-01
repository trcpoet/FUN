/**
 * Visibility-aware game-chat invites.
 *
 * Backed by the `game_chat_invites` table + RPCs introduced in
 * `supabase/migrations/20260501080000_game_duration_and_visibility.sql`.
 *
 * Flow:
 *   - Public games: anyone can join, no invite needed.
 *   - Friends Only: mutual follows can join directly. Anyone else needs an
 *     `approved` row created via `request_chat_invite` (joined player) +
 *     `respond_chat_invite('approve')` (host).
 *   - Invite Only: pin hidden from map; recipients open `redeem_invite_token`
 *     with the host's shared UUID and are pre-approved.
 */

import { supabase } from "./supabase";

export type InviteAction = "approve" | "deny" | "revoke";
export type InviteStatus = "pending" | "approved" | "denied" | "revoked";

const MIGRATION_HINT =
  "Run supabase/migrations/20260501080000_game_duration_and_visibility.sql, then NOTIFY pgrst, 'reload schema'.";

function rpcMissing(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  const m = (error.message ?? "").toLowerCase();
  return (
    m.includes("schema cache") ||
    (m.includes("could not find") && m.includes("function")) ||
    m.includes("request_chat_invite") ||
    m.includes("respond_chat_invite") ||
    m.includes("redeem_invite_token")
  );
}

/**
 * Submit an invite request from inside a friends-only chat.
 * Hosts get instant approval (the RPC self-approves when caller = host).
 */
export async function requestChatInvite(
  gameId: string,
  inviteeUserId: string
): Promise<{ inviteId: string | null; error: Error | null }> {
  if (!supabase) return { inviteId: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("request_chat_invite", {
    p_game_id: gameId,
    p_invitee_user_id: inviteeUserId,
  });
  if (error) {
    if (rpcMissing(error)) {
      return {
        inviteId: null,
        error: new Error(`Chat invites are not deployed yet. ${MIGRATION_HINT}`),
      };
    }
    return { inviteId: null, error: new Error(error.message) };
  }
  return { inviteId: (data as string | null) ?? null, error: null };
}

/** Host-only approve / deny / revoke. */
export async function respondToInvite(
  inviteId: string,
  action: InviteAction
): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const { error } = await supabase.rpc("respond_chat_invite", {
    p_invite_id: inviteId,
    p_action: action,
  });
  if (!error) return null;
  if (rpcMissing(error)) {
    return new Error(`Chat invites are not deployed yet. ${MIGRATION_HINT}`);
  }
  return new Error(error.message);
}

/**
 * Used by Invite-Only join links (`/g/<token>`). Inserts an approved invite
 * row for the current user so the visibility trigger lets them join.
 */
export async function redeemInviteToken(token: string): Promise<{
  gameId: string | null;
  error: Error | null;
}> {
  if (!supabase) return { gameId: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("redeem_invite_token", { p_token: token });
  if (error) {
    if (rpcMissing(error)) {
      return {
        gameId: null,
        error: new Error(`Invite links are not deployed yet. ${MIGRATION_HINT}`),
      };
    }
    return { gameId: null, error: new Error(error.message) };
  }
  return { gameId: (data as string | null) ?? null, error: null };
}

export type PendingInviteRow = {
  invite_id: string;
  game_id: string;
  game_title: string;
  invitee_user_id: string;
  invitee_display_name: string | null;
  invitee_avatar_url: string | null;
  invited_by_user_id: string;
  invited_by_display_name: string | null;
  status: InviteStatus;
  created_at: string;
};

/** All pending invites across games the current user hosts. */
export async function getMyPendingInvites(): Promise<{
  data: PendingInviteRow[];
  error: Error | null;
}> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_my_pending_invites");
  if (error) {
    if (rpcMissing(error)) return { data: [], error: null };
    return { data: [], error: new Error(error.message) };
  }
  return { data: (data as PendingInviteRow[]) ?? [], error: null };
}

/** Build the canonical invite-only URL the host shares. */
export function inviteTokenUrl(token: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://app.example.com";
  return `${origin}/g/${token}`;
}

/** Server-side eligibility check (mirrors the migration's RLS trigger). */
export async function checkJoinEligibility(gameId: string): Promise<{
  eligible: boolean;
  error: Error | null;
}> {
  if (!supabase) return { eligible: false, error: new Error("Supabase not configured") };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { eligible: false, error: new Error("Not signed in") };
  const { data, error } = await supabase.rpc("is_eligible_to_join_game", {
    p_game_id: gameId,
    p_user_id: user.id,
  });
  if (error) {
    if (rpcMissing(error)) return { eligible: true, error: null }; // Pre-migration: allow
    return { eligible: false, error: new Error(error.message) };
  }
  return { eligible: Boolean(data), error: null };
}
