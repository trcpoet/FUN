import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, CalendarCheck, MessagesSquare, Trophy } from "lucide-react";
import { SignInForm, SignUpForm } from "../components/auth/AuthForms";
import { safeReturnTo } from "../../lib/guestAccess";

type Mode = "signin" | "signup";

/**
 * Profile, signed out. The app's only account surface.
 *
 * This is the same button a member taps to reach their profile. There are no
 * sign-in controls on the map, and no page that exists only to ask for an
 * account: browsing is open, and this is what you find when you go looking.
 *
 * Two people arrive here, and the screen has to serve both in one scroll:
 *
 *  - Someone who tapped something they could not do as a guest. They already
 *    know what FUN is; `from` takes them back to it the moment they are in.
 *  - Someone who came looking for the app itself. This screen used to open with
 *    "Your profile", which tells that person nothing at all — so it now leads
 *    with the name and the one sentence that earns the download, and says what
 *    an account adds before it asks for one.
 *
 * Nothing animates in. On a phone still loading a map, an entrance transition
 * means staring at an empty panel for as long as the main thread is behind, and
 * this is the one screen where the first pixel should already be typeable.
 */

/** What an account adds on top of the map anyone can already browse. */
const MEMBER_PROOFS = [
  {
    icon: CalendarCheck,
    title: "Hold your spot",
    body: "Join a game and the roster knows you are coming.",
  },
  {
    icon: MessagesSquare,
    title: "Talk to the squad",
    body: "One thread per game. No group chat, no “where exactly?”",
  },
  {
    icon: Trophy,
    title: "Build a reputation",
    body: "Turn up, get rated, get picked next time.",
  },
] as const;

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
  const signingUp = mode === "signup";

  return (
    <main className="auth-shell relative min-h-screen min-h-dvh overflow-hidden bg-[#060b1a] text-slate-100">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="arena-streets absolute inset-0" />
        <div className="arena-grid absolute inset-0" />
        <div className="arena-nodes absolute inset-0 opacity-70" />
        <div className="arena-noise absolute inset-0 opacity-[0.12]" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#060b1a] to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen min-h-dvh w-full max-w-md flex-col px-4 py-5">
        <header className="flex items-start justify-between gap-4">
          {/* The wordmark is the hero, not a corner logo: a first-time visitor
              should be able to name the thing they are signing up for. */}
          <span className="fun-brand-wordmark text-[2.1rem] leading-none">FUN</span>
          <Link
            to={returnTo ?? "/"}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm text-slate-300 backdrop-blur-md transition hover:bg-surface-3 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to map
          </Link>
        </header>

        <h1 className="arena-display mt-5 text-[1.85rem] leading-[1.08]">
          {signingUp ? (
            <>
              <span className="text-white">Find a game </span>
              <span className="arena-display--gradient">tonight</span>
            </>
          ) : (
            <>
              <span className="text-white">Back in the </span>
              <span className="arena-display--gradient">arena</span>
            </>
          )}
        </h1>
        <p className="mt-2 max-w-[34ch] text-[0.95rem] leading-relaxed text-slate-300">
          {signingUp
            ? "See every pickup game near you, who is in, and how long until it starts."
            : "Your games, crews and courts are right where you left them."}
        </p>

        {/* Segmented control. Tonal, not outlined: the active half is a lighter
            surface, which is the same way every other panel here says "on top". */}
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-surface-1 p-1">
          {(["signup", "signin"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={
                "min-h-10 rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 " +
                (mode === m
                  ? "bg-surface-3 text-primary shadow-[var(--glow-sm)]"
                  : "text-slate-400 hover:text-slate-200")
              }
            >
              {m === "signup" ? "Create account" : "Sign in"}
            </button>
          ))}
        </div>

        <div className="arena-panel mt-4 p-5">
          {signingUp ? (
            <SignUpForm
              onSignedUp={({ hasSession }) => {
                if (!hasSession) return; // "confirm your email" stays on screen
                navigate("/onboarding", {
                  replace: true,
                  state: returnTo ? { from: returnTo } : undefined,
                });
              }}
            />
          ) : (
            <SignInForm onSignedIn={goBackToWhereTheyWere} />
          )}
        </div>

        {signingUp ? (
          <>
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              What an account adds
            </p>
            <ul className="mt-2.5 space-y-2.5">
              {MEMBER_PROOFS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3 rounded-2xl bg-surface-1 p-3">
                  <span className="arena-tile mt-0.5">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-100">{title}</span>
                    <span className="mt-0.5 block text-[0.8rem] leading-relaxed text-slate-400">
                      {body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <p className="mt-6 pb-2 text-center text-sm">
          <Link
            to={returnTo ?? "/"}
            className="rounded text-slate-400 underline-offset-4 transition hover:text-slate-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            Keep browsing the map as a guest
          </Link>
        </p>

        <nav aria-label="Legal documents" className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 pb-4 text-xs text-slate-500">
          <Link to="/terms" className="hover:text-slate-300">Terms</Link>
          <Link to="/privacy" className="hover:text-slate-300">Privacy</Link>
          <Link to="/guidelines" className="hover:text-slate-300">Community Guidelines</Link>
          <Link to="/child-safety" className="hover:text-slate-300">Child Safety</Link>
        </nav>
      </div>
    </main>
  );
}
