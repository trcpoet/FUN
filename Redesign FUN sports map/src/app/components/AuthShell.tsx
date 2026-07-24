import React from "react";
import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Newspaper, Radar, Swords } from "lucide-react";

type AuthMode = "sign-in" | "sign-up" | "reset";

type AuthShellProps = {
  mode: AuthMode;
  children: React.ReactNode;
  /** Overrides the form-panel heading (e.g. the two reset screens). */
  panelHeading?: string;
};

const featureCards = [
  {
    icon: Swords,
    accent: "cyan" as const,
    title: "Athlete matchmaking",
    body: "Find your perfect rival or teammate. Level up together.",
  },
  {
    icon: Radar,
    accent: "violet" as const,
    title: "Local venues & games",
    body: "Discover courts, fields, and arenas nearby. Never miss a game.",
  },
  {
    icon: Newspaper,
    accent: "cyan" as const,
    title: "Gear & feed",
    body: "Connect over sports equipment, and stay on top of sports news and friend updates. Be game-ready.",
  },
] as const;

export function AuthShell({ mode, children, panelHeading }: AuthShellProps) {
  const reduceMotion = useReducedMotion();
  const isSignIn = mode === "sign-in";
  const isSignUp = mode === "sign-up";

  return (
    <div className="auth-shell relative min-h-screen min-h-dvh overflow-hidden bg-[#060b1a] text-slate-100">
      {/* Atmosphere: night map + glowing nodes */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="arena-streets absolute inset-0" />
        <div className="arena-grid absolute inset-0" />
        <div className="arena-nodes absolute inset-0" />
        <div className="arena-noise absolute inset-0 opacity-[0.12]" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#060b1a] to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen min-h-dvh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
        {/* Header */}
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 flex items-center justify-between gap-4"
        >
          <Link to="/" className="group inline-flex items-center gap-3">
            <span className="fun-brand-wordmark fun-brand-wordmark--desktop text-[1.35rem]">FUN</span>
            <span className="arena-label hidden text-[10px] text-slate-500 sm:inline">
              Sports Network
            </span>
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-cyan-400/25 bg-white/[0.04] px-4 text-sm text-slate-300 backdrop-blur-md transition hover:border-cyan-400/60 hover:text-cyan-200"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to map
          </Link>
        </motion.header>

        <div className="grid flex-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          {/* Left column (desktop): headline + feature cards */}
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="hidden lg:block"
          >
            <h1 className="arena-display max-w-xl text-4xl xl:text-5xl">
              {isSignUp ? (
                <>
                  <span className="text-white">Join the </span>
                  <span className="arena-display--gradient">FUN arena</span>
                </>
              ) : (
                <>
                  <span className="text-white">Back in the </span>
                  <span className="arena-display--gradient">FUN arena</span>
                </>
              )}
            </h1>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-slate-300">
              {isSignUp
                ? "Your ultimate sports network. Connect, compete, and conquer."
                : "Your games, crews, and courts are right where you left them."}
            </p>

            <ul className="mt-9 max-w-lg space-y-4">
              {featureCards.map(({ icon: Icon, accent, title, body }, i) => (
                <motion.li
                  key={title}
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.45,
                    delay: reduceMotion ? 0 : 0.16 + i * 0.09,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={`arena-card flex items-start gap-4 p-4 ${accent === "violet" ? "arena-card--violet" : ""}`}
                >
                  <span className="arena-tile">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className={`arena-label text-[13px] ${accent === "violet" ? "text-fuchsia-300" : "text-cyan-300"}`}>
                      {title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-300">{body}</p>
                  </div>
                </motion.li>
              ))}
            </ul>

            {isSignUp ? (
              <p className="mt-8 max-w-md text-sm leading-relaxed text-slate-500">
                FUN's philosophy: the fastest way to make friends is to play. Your city is the arena.
              </p>
            ) : null}
          </motion.section>

          {/* Right column: form console (also the mobile flow) */}
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto w-full max-w-[440px]"
          >
            {/* Mobile hero */}
            <div className="mb-7 text-center lg:hidden">
              <h1 className="arena-display text-[1.9rem] leading-tight">
                {isSignUp ? (
                  <>
                    <span className="text-white">Join the </span>
                    <span className="arena-display--gradient">FUN arena</span>
                  </>
                ) : (
                  <>
                    <span className="text-white">Back in the </span>
                    <span className="arena-display--gradient">FUN arena</span>
                  </>
                )}
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
                {isSignUp
                  ? "Your ultimate sports network. Connect, compete, and conquer."
                  : "Your games, crews, and courts are right where you left them."}
              </p>
            </div>

            {/* Mobile feature cards (sign-up only, per the mock) */}
            {isSignUp ? (
              <ul className="mb-7 space-y-3.5 lg:hidden">
                {featureCards.map(({ icon: Icon, accent, title, body }, i) => (
                  <motion.li
                    key={title}
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: reduceMotion ? 0 : 0.14 + i * 0.08,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className={`arena-card flex items-start gap-3.5 p-4 ${accent === "violet" ? "arena-card--violet" : ""}`}
                  >
                    <span className="arena-tile">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className={`arena-label text-xs ${accent === "violet" ? "text-fuchsia-300" : "text-cyan-300"}`}>
                        {title}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-slate-300">{body}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>
            ) : null}

            {/* Form panel */}
            <div className="arena-panel p-5 sm:p-7">
              <h2 className="arena-label mb-6 text-center text-base text-cyan-300 [text-shadow:0_0_14px_rgba(34,211,238,0.45)]">
                {panelHeading ?? (isSignUp ? "Create your profile" : "Welcome back")}
              </h2>
              <div className="auth-shell__form w-full">{children}</div>
            </div>

            <p className="mt-5 text-center text-sm text-slate-500">
              {isSignUp ? (
                <>
                  Already have an account?{" "}
                  <Link to="/login" className="font-semibold text-cyan-300 underline-offset-4 hover:text-cyan-200 hover:underline">
                    Log in
                  </Link>
                </>
              ) : isSignIn ? (
                <>
                  New player?{" "}
                  <Link to="/signup" className="font-semibold text-cyan-300 underline-offset-4 hover:text-cyan-200 hover:underline">
                    Create account
                  </Link>
                </>
              ) : (
                <>
                  Remembered your password?{" "}
                  <Link to="/login" className="font-semibold text-cyan-300 underline-offset-4 hover:text-cyan-200 hover:underline">
                    Log in
                  </Link>
                </>
              )}
            </p>
            <p className="mt-2 text-center text-sm">
              <Link to="/" className="text-slate-500 transition hover:text-slate-300">
                Continue as guest →
              </Link>
            </p>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
