import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { redeemInviteToken } from "../../lib/gameInvites";
import { joinGame } from "../../lib/api";
import { useAuth } from "../contexts/AuthContext";

/**
 * Landing page for invite-only game share links: /g/<uuid>.
 *
 * Flow:
 *   1. If not signed in, bounce to /login with `?redirect=/g/<token>`.
 *   2. Call `redeem_invite_token` to insert an approved invite row so the
 *      visibility trigger lets us join.
 *   3. Auto-join the game (the trigger now allows it).
 *   4. Redirect to / and ask the App to focus on the game / open its chat.
 */
export default function RedeemInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const [phase, setPhase] = useState<"redeeming" | "joining" | "error">("redeeming");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPhase("error");
      setErrorMessage("Missing invite token in URL.");
      return;
    }
    if (auth.loading) return;
    if (!auth.user) {
      const next = `/g/${encodeURIComponent(token)}`;
      navigate(`/login?redirect=${encodeURIComponent(next)}`, { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      const { gameId, error } = await redeemInviteToken(token);
      if (cancelled) return;
      if (error || !gameId) {
        setPhase("error");
        setErrorMessage(error?.message ?? "That invite link is invalid or expired.");
        return;
      }
      setPhase("joining");
      const joinResult = await joinGame(gameId);
      if (cancelled) return;
      if (joinResult.error) {
        setPhase("error");
        setErrorMessage(joinResult.error.message);
        return;
      }
      navigate(`/?game=${encodeURIComponent(gameId)}&chat=1`, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [auth.loading, auth.user, navigate, token]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0F1C] px-6 text-slate-100">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/70 p-6 text-center shadow-xl shadow-violet-950/20 backdrop-blur-xl">
        {phase === "error" ? (
          <>
            <AlertTriangle className="mx-auto mb-3 size-8 text-amber-400" aria-hidden />
            <h1 className="text-base font-semibold">Invite link couldn't be opened</h1>
            <p className="mt-2 text-xs text-slate-400">{errorMessage}</p>
            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className="mt-4 inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-slate-800 px-4 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              Back to map
            </button>
          </>
        ) : phase === "joining" ? (
          <>
            <ShieldCheck className="mx-auto mb-3 size-8 text-emerald-400" aria-hidden />
            <h1 className="text-base font-semibold">Joining game…</h1>
            <p className="mt-2 text-xs text-slate-400">
              Adding you to the roster and opening the chat.
            </p>
            <Loader2 className="mx-auto mt-4 size-5 animate-spin text-emerald-400" aria-hidden />
          </>
        ) : (
          <>
            <ShieldCheck className="mx-auto mb-3 size-8 text-violet-400" aria-hidden />
            <h1 className="text-base font-semibold">Verifying invite…</h1>
            <p className="mt-2 text-xs text-slate-400">
              One sec while we confirm this invite link.
            </p>
            <Loader2 className="mx-auto mt-4 size-5 animate-spin text-violet-400" aria-hidden />
          </>
        )}
      </div>
    </div>
  );
}
