import React, { useState } from "react";
import { Mail } from "lucide-react";
import { AuthShell } from "../components/AuthShell";
import { resetPassword } from "../../lib/api";
import { mapAuthError } from "../../lib/rpcErrors";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: resetError } = await resetPassword(email);
      if (resetError) {
        setError(mapAuthError(resetError.message));
        return;
      }
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell mode="reset" panelHeading="Reset password">
      {sent ? (
        <div className="flex w-full flex-col gap-4 text-center" role="status">
          <p className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-3 text-sm text-cyan-100">
            If an account exists for <span className="font-semibold">{email.trim()}</span>, a reset
            link is on its way. Check your inbox (and spam).
          </p>
          <p className="text-xs leading-relaxed text-slate-500">
            The link opens a page where you can set a new password.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
          <p className="text-sm leading-relaxed text-slate-400">
            Enter your email and we'll send a link to reset your password.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="arena-label text-[10px] text-cyan-300/90">Email</span>
            <span className="relative block">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-cyan-400/80"
                aria-hidden
              />
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
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
