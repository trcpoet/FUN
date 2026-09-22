import React from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft, Lock } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { FunOrbitLoader } from "./FunOrbitLoader";
import { profileAuthPath } from "../../lib/guestAccess";

/**
 * A members-only page, met without being thrown out of the app.
 *
 * Deliberately not a redirect: bouncing a guest to a login screen loses both the
 * place they were going and any sense of what they would get. This says what
 * lives here, offers the one way in, and leaves the map a tap away — the same
 * shape as the sheet that gates actions on the map itself.
 */
export function RequireMember({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FunOrbitLoader tagline="Loading FUN…" />;
  if (user) return <>{children}</>;

  return (
    <main className="flex min-h-screen min-h-dvh flex-col items-center justify-center bg-[#0A0F1C] px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300">
        <Lock className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-xl font-semibold text-slate-100">{title}</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">{body}</p>
      <Link
        to={profileAuthPath("signup")}
        state={{ from: location }}
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
      >
        Create account
      </Link>
      <Link
        to={profileAuthPath("signin")}
        state={{ from: location }}
        className="mt-3 text-sm font-medium text-slate-300 underline-offset-4 transition hover:text-white hover:underline"
      >
        I already have one
      </Link>
      <Link
        to="/"
        className="mt-8 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-300"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to the map
      </Link>
    </main>
  );
}
