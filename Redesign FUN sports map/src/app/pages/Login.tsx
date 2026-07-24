import React, { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Lock, Mail } from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { signIn } from "../../lib/api";
import { mapAuthError } from "../../lib/rpcErrors";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError(mapAuthError(signInError.message));
        return;
      }
      navigate("/", { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell mode="sign-in">
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="arena-input"
              placeholder="Your password"
            />
          </span>
        </label>

        <div className="-mt-1 text-right">
          <Link
            to="/forgot-password"
            className="rounded text-xs font-medium text-cyan-300/90 underline-offset-4 transition hover:text-cyan-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            Forgot password?
          </Link>
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" role="alert">
            {error}
          </p>
        ) : null}

        <div className="arena-cta-frame mt-2">
          <button type="submit" disabled={submitting} className="arena-cta px-4 text-sm">
            {submitting ? "Logging in…" : "Back in the game"}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
