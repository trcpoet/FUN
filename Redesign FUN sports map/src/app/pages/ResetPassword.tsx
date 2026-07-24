import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Lock, ShieldCheck } from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { supabase } from "../../lib/supabase";
import { updatePassword, validatePassword } from "../../lib/api";
import { mapAuthError } from "../../lib/rpcErrors";

type Phase = "checking" | "ready" | "invalid" | "done";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The recovery link carries a `#...type=recovery` hash. With detectSessionInUrl
  // enabled, supabase-js consumes it and fires PASSWORD_RECOVERY / establishes a
  // session. Accept either signal; if neither arrives, the link is bad/expired.
  useEffect(() => {
    if (!supabase) {
      setPhase("invalid");
      return;
    }
    let settled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        settled = true;
        setPhase("ready");
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true;
        setPhase("ready");
      }
    });

    // Give detectSessionInUrl a moment to process the hash before giving up.
    const timer = window.setTimeout(() => {
      if (!settled) setPhase("invalid");
    }, 2500);

    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    const validation = validatePassword(password);
    if (!validation.ok) {
      setError(validation.message ?? "Invalid password.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await updatePassword(password);
      if (updateError) {
        setError(mapAuthError(updateError.message));
        return;
      }
      setPhase("done");
      window.setTimeout(() => navigate("/", { replace: true }), 1200);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell mode="reset" panelHeading="Set a new password">
      {phase === "checking" ? (
        <p className="py-6 text-center text-sm text-slate-400" role="status">
          Verifying your reset link…
        </p>
      ) : phase === "invalid" ? (
        <div className="flex w-full flex-col gap-4 text-center">
          <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-3 text-sm text-rose-200" role="alert">
            This reset link is invalid or has expired.
          </p>
          <Link
            to="/forgot-password"
            className="mx-auto rounded text-sm font-semibold text-cyan-300 underline-offset-4 hover:text-cyan-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            Request a new link
          </Link>
        </div>
      ) : phase === "done" ? (
        <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-3 text-center text-sm text-emerald-100" role="status">
          Password updated. Taking you to the map…
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="arena-label text-[10px] text-cyan-300/90">New password</span>
            <span className="relative block">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-cyan-400/80" aria-hidden />
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="arena-input"
                placeholder="Letters and numbers, 8+ chars"
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="arena-label text-[10px] text-cyan-300/90">Confirm password</span>
            <span className="relative block">
              <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-cyan-400/80" aria-hidden />
              <input
                type="password"
                name="confirm"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="arena-input"
                placeholder="Repeat password"
              />
            </span>
          </label>

          {error ? (
            <p
              className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </p>
          ) : null}

          <div className="arena-cta-frame mt-2">
            <button type="submit" disabled={submitting} className="arena-cta px-4 text-sm">
              {submitting ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
