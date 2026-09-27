import React, { Component, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router";
import { AuthProvider, useAuth } from "./app/contexts/AuthContext";
import { UnreadProvider } from "./app/contexts/UnreadContext";
import { RequireAuth } from "./app/components/RequireAuth";
import { RequireOnboarding } from "./app/components/RequireOnboarding";
import { RequireMember } from "./app/components/RequireMember";
import { PublicOnly } from "./app/components/PublicOnly";
import "./styles/index.css";
import { FunOrbitLoader } from "./app/components/FunOrbitLoader";
import { Toaster } from "./app/components/ui/sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

const App = lazy(() => import("./app/App.tsx"));
const ForgotPassword = lazy(() => import("./app/pages/ForgotPassword.tsx"));
const ResetPassword = lazy(() => import("./app/pages/ResetPassword.tsx"));
const Onboarding = lazy(() => import("./app/pages/Onboarding.tsx"));
const Profile = lazy(() => import("./app/pages/Profile.tsx"));
const GuestProfile = lazy(() => import("./app/pages/GuestProfile.tsx"));
const PublicProfile = lazy(() => import("./app/pages/PublicProfile.tsx"));
const Feed = lazy(() => import("./app/pages/Feed.tsx"));
const RecommendedGames = lazy(() => import("./app/pages/RecommendedGames.tsx"));
const PopularVenues = lazy(() => import("./app/pages/PopularVenues.tsx"));
const RedeemInvite = lazy(() => import("./app/pages/RedeemInvite.tsx"));

function RouteFallback() {
  return <FunOrbitLoader />;
}

/**
 * Profile is the app's only account surface.
 *
 * Signed out it IS the sign-in screen; signed in it is your profile. There is no
 * `/login` page behind the map any more, because a first-time visitor should meet
 * the map, not a form — and when they do want an account, "Profile" is the one
 * place to look, exactly as it is for a member.
 */
function ProfileRoute() {
  const { user, loading } = useAuth();
  if (loading) return <RouteFallback />;
  if (!user) return <GuestProfile />;
  return (
    <RequireOnboarding>
      <Profile />
    </RequireOnboarding>
  );
}

/**
 * `/login` and `/signup` live on as aliases: password-reset mails, old bookmarks
 * and `?redirect=` links from invites all still point at them.
 */
function AuthAlias({ mode }: { mode: "signin" | "signup" }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  search.set("auth", mode);
  return <Navigate to={{ pathname: "/profile", search: `?${search.toString()}` }} state={location.state} replace />;
}

type RouteErrorBoundaryProps = { children: React.ReactNode };
type RouteErrorBoundaryState = { error: Error | null };

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-background px-6">
          <div className="max-w-md text-center">
            <p className="text-lg font-semibold text-slate-100">Something went wrong</p>
            <p className="mt-2 text-sm text-slate-400">
              {this.state.error.message || "Failed to load this page."}
            </p>
            <button
              type="button"
              className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    {/*
      Above the router, so unread state survives navigation and its three
      realtime channels are opened once per session rather than once per mount
      of whatever surface happens to be showing a badge.
    */}
    <UnreadProvider>
    <BrowserRouter>
      <RouteErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/login" element={<AuthAlias mode="signin" />} />
            <Route path="/signup" element={<AuthAlias mode="signup" />} />
            <Route
              path="/forgot-password"
              element={
                <PublicOnly>
                  <ForgotPassword />
                </PublicOnly>
              }
            />
            {/* Unguarded: the recovery link establishes a session, and PublicOnly
                would bounce it to "/" before the user can set a new password. */}
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <Onboarding />
                </RequireAuth>
              }
            />
            <Route path="/profile" element={<ProfileRoute />} />
            <Route
              path="/feed"
              element={
                <RequireMember
                  title="The feed is for players"
                  body="Recaps, notes and what the players near you are up to. The map stays open to everyone."
                >
                  <Feed />
                </RequireMember>
              }
            />
            <Route
              path="/feed/games"
              element={
                <RequireMember
                  title="Recommended games are for players"
                  body="We match games to your sports, level and week once you have a profile. Browse the map meanwhile."
                >
                  <RecommendedGames />
                </RequireMember>
              }
            />
            <Route
              path="/feed/venues"
              element={
                <RequireMember
                  title="Popular venues are for players"
                  body="This ranks courts by what players are actually doing there. Every venue is still on the map."
                >
                  <PopularVenues />
                </RequireMember>
              }
            />
            <Route
              path="/athlete/:userId"
              element={
                <RequireMember
                  title="Players are visible to players"
                  body="Profiles, stats and histories are for people with an account — which means they can see yours too."
                >
                  <PublicProfile />
                </RequireMember>
              }
            />
            <Route path="/g/:token" element={<RedeemInvite />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </BrowserRouter>
    <Toaster theme="dark" richColors position="top-center" />
    <Analytics />
    <SpeedInsights />
    </UnreadProvider>
  </AuthProvider>
);
