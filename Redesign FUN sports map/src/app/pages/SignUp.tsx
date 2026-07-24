import React, { useState } from "react";
import { useNavigate } from "react-router";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { signUp, validatePassword } from "../../lib/api";
import { mapAuthError } from "../../lib/rpcErrors";

export default function SignUpPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

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
      const { error: signUpError } = await signUp(email, password);
      if (signUpError) {
        setError(mapAuthError(signUpError.message));
        return;
      }
      // If email confirmation is off, session exists → onboarding.
      // If confirmation is required, no session yet → ask them to verify then sign in.
      const { getAuthSessionDeduped } = await import("../../lib/authDedup");
      const session = await getAuthSessionDeduped().catch(() => null);
      if (session?.user) {
        navigate("/onboarding", { replace: true });
        return;
      }
      setInfo("Account created. Confirm your email, then sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell mode="sign-up">
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="arena-label text-[10px] text-cyan-300/90">Email</span>
          <span className="relative block">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-cyan-400/80" aria-hidden />
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="arena-input"
              placeholder="you@email.com"
            />
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="arena-label text-[10px] text-cyan-300/90">Password</span>
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
          <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100" role="status">
            {info}
          </p>
        ) : null}

        <div className="arena-cta-frame mt-2">
          <button type="submit" disabled={submitting} className="arena-cta px-4 text-sm">
            {submitting ? "Claiming your tag…" : "Claim your tag"}
          </button>
        </div>

        <p className="text-center text-[11px] leading-relaxed text-slate-500">
          You're joining a local sports network — matchmaking, games, venues, gear, and the feed.
        </p>
      </form>
    </AuthShell>
  );
}
