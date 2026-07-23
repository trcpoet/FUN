import React from "react";
import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, MapPin, Users, Zap } from "lucide-react";

type AuthMode = "sign-in" | "sign-up";

type AuthShellProps = {
  mode: AuthMode;
  children: React.ReactNode;
};

const highlights = [
  { icon: MapPin, label: "Live courts near you" },
  { icon: Users, label: "Pickup crews tonight" },
  { icon: Zap, label: "Join in one tap" },
] as const;

export function AuthShell({ mode, children }: AuthShellProps) {
  const reduceMotion = useReducedMotion();
  const isSignIn = mode === "sign-in";

  return (
    <div className="auth-shell relative min-h-screen min-h-dvh overflow-hidden bg-[#05080f] text-slate-100">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="auth-shell__grid absolute inset-0 opacity-[0.35]" />
        <div className="auth-shell__glow auth-shell__glow--cyan absolute -left-24 top-[-10%] h-[55vh] w-[55vh] rounded-full" />
        <div className="auth-shell__glow auth-shell__glow--emerald absolute -right-16 bottom-[-5%] h-[50vh] w-[50vh] rounded-full" />
        <div className="auth-shell__glow auth-shell__glow--amber absolute left-[35%] top-[55%] h-[28vh] w-[28vh] rounded-full opacity-60" />
        <div className="auth-shell__noise absolute inset-0 opacity-[0.12]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#05080f] to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen min-h-dvh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 flex items-center justify-between gap-4"
        >
          <Link to="/" className="group inline-flex items-center gap-3">
            <span className="fun-brand-wordmark fun-brand-wordmark--desktop text-[1.35rem]">
              FUN
            </span>
            <span className="hidden text-xs font-medium tracking-[0.18em] text-slate-500 uppercase sm:inline">
              Sports Map
            </span>
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 text-sm text-slate-300 backdrop-blur-md transition hover:border-cyan-400/35 hover:text-cyan-200"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to map
          </Link>
        </motion.header>

        <div className="grid flex-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="relative hidden lg:block"
          >
            <p className="mb-4 text-xs font-semibold tracking-[0.28em] text-cyan-300/80 uppercase">
              {isSignIn ? "Welcome back" : "Start playing"}
            </p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              {isSignIn ? (
                <>
                  Jump back into the{" "}
                  <span className="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                    night map
                  </span>
                  .
                </>
              ) : (
                <>
                  Find your next game on the{" "}
                  <span className="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                    live court grid
                  </span>
                  .
                </>
              )}
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-slate-400">
              {isSignIn
                ? "Pick up where you left off — nearby games, crews, and courts are waiting."
                : "Create an account to host, join, and chat with athletes around you."}
            </p>

            <ul className="mt-10 space-y-3">
              {highlights.map(({ icon: Icon, label }, i) => (
                <motion.li
                  key={label}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: reduceMotion ? 0 : 0.18 + i * 0.08,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 backdrop-blur-sm"
                >
                  <span className="flex size-9 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-sm font-medium text-slate-200">{label}</span>
                </motion.li>
              ))}
            </ul>

            <div className="auth-shell__orbit pointer-events-none absolute -right-6 top-8 hidden xl:block" aria-hidden>
              <div className="auth-shell__orbit-ring" />
              <div className="auth-shell__orbit-core">FUN</div>
            </div>
          </motion.section>

          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto w-full max-w-[420px]"
          >
            <div className="mb-6 text-center lg:hidden">
              <p className="mb-2 text-xs font-semibold tracking-[0.24em] text-cyan-300/80 uppercase">
                {isSignIn ? "Welcome back" : "Join FUN"}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {isSignIn ? "Sign in" : "Create account"}
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                {isSignIn
                  ? "Enter your details to get back on the map."
                  : "Set up your athlete profile in under a minute."}
              </p>
            </div>

            <div className="relative overflow-hidden rounded-[1.35rem] border border-white/12 bg-[rgba(2,6,23,0.72)] p-5 shadow-[var(--shadow-panel)] backdrop-blur-2xl sm:p-7">
              <div
                className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent"
                aria-hidden
              />
              <div className="mb-5 hidden border-b border-white/8 pb-5 lg:block">
                <h2 className="text-xl font-semibold tracking-tight text-white">
                  {isSignIn ? "Sign in" : "Create account"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {isSignIn
                    ? "Enter your email and password to continue."
                    : "You’ll land on the map right after signup."}
                </p>
              </div>

              <div className="auth-shell__form w-full">{children}</div>
            </div>

            <p className="mt-5 text-center text-sm text-slate-500">
              {isSignIn ? (
                <>
                  New here?{" "}
                  <Link to="/signup" className="font-medium text-cyan-300 hover:text-cyan-200">
                    Create an account
                  </Link>
                </>
              ) : (
                <>
                  Already playing?{" "}
                  <Link to="/login" className="font-medium text-cyan-300 hover:text-cyan-200">
                    Sign in
                  </Link>
                </>
              )}
            </p>
            <p className="mt-2 text-center text-sm">
              <Link to="/" className="text-slate-500 transition hover:text-slate-300">
                Continue as guest
              </Link>
            </p>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
