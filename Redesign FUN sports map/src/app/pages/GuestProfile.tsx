import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, CalendarCheck, MessagesSquare, Trophy } from "lucide-react";
import { SignInForm, SignUpForm } from "../components/auth/AuthForms";
import { safeReturnTo } from "../../lib/guestAccess";

type Mode = "signin" | "signup";

/**
 * Profile, signed out.
 *
 * The app has exactly one place where accounts happen, and this is it — the same
 * button a member taps to reach their profile. There are no sign-in controls on
 * the map, and no page that exists only to ask for an account: browsing is open,
 * and this screen is what you find when you go looking for yours.
 *
 * Deliberately plain and quick: no entrance animation, no hero imagery, the
 * email field one tap away. Whoever lands here arrived on purpose, usually from
 * something they were trying to do, and `from` takes them back to it.
 */
export default function GuestProfile() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: unknown } };

  const initialMode: Mode = params.get("auth") === "signin" ? "signin" : "signup";
  const [mode, setMode] = useState<Mode>(initialMode);

  // Keep the URL honest as the toggle moves, so a reload or a share lands in the
  // same half of the screen.
  useEffect(() => {
    if (params.get("auth") === mode) return;
    const next = new URLSearchParams(params);
    next.set("auth", mode);
    setParams(next, { replace: true });
  }, [mode, params, setParams]);

  /** Where the sign-in gate (or a guard) said we came from. */
  const fromState = location.state?.from;
  const returnTo =
    safeReturnTo(typeof fromState === "string" ? fromState : null) ??
    safeReturnTo(
      fromState && typeof fromState === "object" && "pathname" in (fromState as Record<string, unknown>)
        ? `${(fromState as { pathname?: string }).pathname ?? ""}${(fromState as { search?: string }).search ?? ""}`
        : null
    ) ??
    safeReturnTo(params.get("redirect"));

  const goBackToWhereTheyWere = () => navigate(returnTo ?? "/", { replace: true });

  return (
    <main className="auth-shell relative min-h-screen min-h-dvh overflow-hidden bg-[#060b1a] text-slate-100">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="arena-streets absolute inset-0" />
        <div className="arena-grid absolute inset-0" />
        <div className="arena-noise absolute inset-0 opacity-[0.12]" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#060b1a] to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen min-h-dvh w-full max-w-md flex-col px-4 py-6">
        <header className="mb-6 flex items-center justify-between gap-4">
          <span className="fun-brand-wordmark text-[1.2rem]">FUN</span>
          <Link
            to={returnTo ?? "/"}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cyan-400/25 bg-white/[0.04] px-4 text-sm text-slate-300 backdrop-blur-md transition hover:border-cyan-400/60 hover:text-cyan-200"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to map
          </Link>
        </header>

        <h1 className="arena-display text-[1.75rem] leading-tight">
          {mode === "signup" ? (
            <>
              <span className="text-white">Your </span>
              <span className="arena-display--gradient">profile</span>
            </>
          ) : (
            <>
              <span className="text-white">Back in the </span>
              <span className="arena-display--gradient">FUN arena</span>
            </>
          )}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {mode === "signup"
            ? "Keep browsing the map without one — an account is for playing."
            : "Your games, crews and courts are right where you left them."}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {(["signup", "signin"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={
                "min-h-10 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 " +
                (mode === m ? "bg-cyan-400/15 text-cyan-100" : "text-slate-400 hover:text-slate-200")
              }
            >
              {m === "signup" ? "Create account" : "Sign in"}
            </button>
          ))}
        </div>

        <div className="arena-panel mt-4 p-5">
          {mode === "signin" ? (
            <SignInForm onSignedIn={goBackToWhereTheyWere} />
          ) : (
            <SignUpForm
              onSignedUp={({ hasSession }) => {
                if (!hasSession) return; // "confirm your email" stays on screen
                navigate("/onboarding", {
                  replace: true,
                  state: returnTo ? { from: returnTo } : undefined,
                });
              }}
            />
          )}
        </div>

        {mode === "signup" ? (
          <ul className="mt-5 space-y-2.5">
            {[
              { icon: CalendarCheck, text: "Join games near you and hold your spot" },
              { icon: MessagesSquare, text: "Message the crew before you turn up" },
              { icon: Trophy, text: "Keep your stats, badges and the players you've met" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="arena-tile mt-0.5 shrink-0">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-5 text-center text-sm">
          <Link to={returnTo ?? "/"} className="text-slate-500 transition hover:text-slate-300">
            Keep browsing as a guest →
          </Link>
        </p>
      </div>
    </main>
  );
}
