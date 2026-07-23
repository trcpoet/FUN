import React, { useState } from "react";
import { useNavigate } from "react-router";
import { AuthShell } from "../components/AuthShell";
import { signUp, validatePassword } from "../../lib/api";

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
        setError(signUpError.message);
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
          <span className="text-sm font-medium text-slate-300">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded-[0.9rem] border border-white/12 bg-slate-950/70 px-3.5 text-slate-50 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/25"
            placeholder="you@email.com"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-300">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 rounded-[0.9rem] border border-white/12 bg-slate-950/70 px-3.5 text-slate-50 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/25"
            placeholder="Letters and numbers, 8+ chars"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-300">Confirm password</span>
          <input
            type="password"
            name="confirm"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="min-h-11 rounded-[0.9rem] border border-white/12 bg-slate-950/70 px-3.5 text-slate-50 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/25"
            placeholder="Repeat password"
          />
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

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 min-h-11 rounded-[0.9rem] bg-cyan-400 px-4 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.35)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
