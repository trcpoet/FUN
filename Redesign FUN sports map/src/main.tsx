import React, { Component, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider } from "./app/contexts/AuthContext";
import { RequireAuth } from "./app/components/RequireAuth";
import { RequireOnboarding } from "./app/components/RequireOnboarding";
import { PublicOnly } from "./app/components/PublicOnly";
import "./styles/index.css";
import { FunOrbitLoader } from "./app/components/FunOrbitLoader";
import { Toaster } from "./app/components/ui/sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

const App = lazy(() => import("./app/App.tsx"));
const Login = lazy(() => import("./app/pages/Login.tsx"));
const SignUp = lazy(() => import("./app/pages/SignUp.tsx"));
const Onboarding = lazy(() => import("./app/pages/Onboarding.tsx"));
const Profile = lazy(() => import("./app/pages/Profile.tsx"));
const PublicProfile = lazy(() => import("./app/pages/PublicProfile.tsx"));
const Feed = lazy(() => import("./app/pages/Feed.tsx"));
const RecommendedGames = lazy(() => import("./app/pages/RecommendedGames.tsx"));
const PopularVenues = lazy(() => import("./app/pages/PopularVenues.tsx"));
const RedeemInvite = lazy(() => import("./app/pages/RedeemInvite.tsx"));

function RouteFallback() {
  return <FunOrbitLoader />;
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
        <div className="flex h-screen w-full items-center justify-center bg-[#0A0F1C] px-6">
          <div className="max-w-md text-center">
            <p className="text-lg font-semibold text-slate-100">Something went wrong</p>
            <p className="mt-2 text-sm text-slate-400">
              {this.state.error.message || "Failed to load this page."}
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
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
    <BrowserRouter>
      <RouteErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<App />} />
            <Route
              path="/login"
              element={
                <PublicOnly>
                  <Login />
                </PublicOnly>
              }
            />
            <Route
              path="/signup"
              element={
                <PublicOnly>
                  <SignUp />
                </PublicOnly>
              }
            />
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <Onboarding />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <RequireOnboarding>
                    <Profile />
                  </RequireOnboarding>
                </RequireAuth>
              }
            />
            <Route path="/feed" element={<Feed />} />
            <Route path="/feed/games" element={<RecommendedGames />} />
            <Route path="/feed/venues" element={<PopularVenues />} />
            <Route path="/athlete/:userId" element={<PublicProfile />} />
            <Route path="/g/:token" element={<RedeemInvite />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
    </BrowserRouter>
    <Toaster theme="dark" richColors position="top-center" />
    <Analytics />
    <SpeedInsights />
  </AuthProvider>
);
