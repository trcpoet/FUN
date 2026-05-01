import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, ShieldCheck, X as XIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { cn } from "../ui/utils";
import {
  getMyPendingInvites,
  inviteTokenUrl,
  respondToInvite,
  type PendingInviteRow,
} from "../../../lib/gameInvites";
import type { GameVisibility } from "../../../lib/supabase";

type InviteAdminPanelProps = {
  gameId: string;
  visibility: GameVisibility | null | undefined;
  inviteToken: string | null | undefined;
  /** True when the current user is the game host (only host gets the controls). */
  isHost: boolean;
  /** Bumped on changes (approve/deny/revoke) so callers can refetch member roster. */
  onChange?: () => void;
};

/**
 * Host-only visibility controls inside a game chat:
 *   - For Friends-Only games: list of pending invite requests with one-tap approve / deny.
 *   - For Invite-Only games: copy-link CTA that shares the canonical /g/<token> URL.
 *   - For Public games: nothing rendered (returns null).
 */
export function InviteAdminPanel({
  gameId,
  visibility,
  inviteToken,
  isHost,
  onChange,
}: InviteAdminPanelProps) {
  const [pending, setPending] = useState<PendingInviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!isHost || visibility !== "friends_only") return;
    setLoading(true);
    const { data, error } = await getMyPendingInvites();
    setLoading(false);
    if (error) {
      setRespondError(error.message);
      return;
    }
    setPending(data.filter((r) => r.game_id === gameId));
  }, [isHost, visibility, gameId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRespond = async (inviteId: string, action: "approve" | "deny") => {
    setRespondingId(inviteId);
    setRespondError(null);
    const err = await respondToInvite(inviteId, action);
    setRespondingId(null);
    if (err) {
      setRespondError(err.message);
      return;
    }
    setPending((prev) => prev.filter((r) => r.invite_id !== inviteId));
    onChange?.();
  };

  const handleCopy = async () => {
    if (!inviteToken) return;
    const url = inviteTokenUrl(inviteToken);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this invite URL:", url);
    }
  };

  if (!isHost) return null;
  if (!visibility || visibility === "public") return null;

  return (
    <div className="mx-3 mt-2 space-y-2 rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 text-xs text-slate-200">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-violet-300" aria-hidden />
        <span className="font-semibold uppercase tracking-wide text-[11px] text-violet-200">
          {visibility === "invite_only" ? "Invite-only access" : "Friends-only access"}
        </span>
      </div>

      {visibility === "invite_only" && inviteToken ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-slate-300">
            Only people who open your invite link can see and join this game.
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors",
              copied
                ? "border-emerald-400 bg-emerald-500/15 text-emerald-100"
                : "border-violet-400/40 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25",
            )}
            aria-label="Copy invite link"
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
            {copied ? "Copied" : "Copy invite link"}
          </button>
        </div>
      ) : null}

      {visibility === "friends_only" ? (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-300">
            Mutuals join directly. Anyone else needs your approval below.
          </p>
          {loading ? (
            <div className="flex justify-center py-2 text-slate-500">
              <Loader2 className="size-4 animate-spin" aria-hidden />
            </div>
          ) : pending.length === 0 ? (
            <p className="text-[11px] text-slate-500">No pending invite requests.</p>
          ) : (
            <ul className="space-y-1.5">
              {pending.map((row) => {
                const label = row.invitee_display_name?.trim() || "Player";
                return (
                  <li
                    key={row.invite_id}
                    className="flex items-center gap-2 rounded-lg border border-white/8 bg-slate-900/40 p-2"
                  >
                    <Avatar className="size-7 shrink-0 border border-white/10">
                      {row.invitee_avatar_url?.trim() ? (
                        <AvatarImage src={row.invitee_avatar_url} alt="" className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-slate-800 text-[10px] text-slate-200">
                        {label.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-100">{label}</p>
                      <p className="truncate text-[10px] text-slate-500">
                        Invited by{" "}
                        {row.invited_by_display_name?.trim() || "a player"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleRespond(row.invite_id, "approve")}
                        disabled={respondingId === row.invite_id}
                        className="inline-flex size-7 items-center justify-center rounded-md border border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                        aria-label="Approve invite"
                        title="Approve"
                      >
                        {respondingId === row.invite_id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRespond(row.invite_id, "deny")}
                        disabled={respondingId === row.invite_id}
                        className="inline-flex size-7 items-center justify-center rounded-md border border-rose-400/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
                        aria-label="Deny invite"
                        title="Deny"
                      >
                        <XIcon className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {respondError ? (
        <p className="text-[11px] text-amber-300" role="alert">
          {respondError}
        </p>
      ) : null}
    </div>
  );
}
