import React from "react";
import { Navigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { profileAuthPath } from "../../lib/guestAccess";
import { FunOrbitLoader } from "./FunOrbitLoader";

export function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const { user, onboardingCompleted, loading } = useAuth();

  // The same loader as every other gate, rather than a line of grey text.
  if (loading || onboardingCompleted === null) return <FunOrbitLoader />;
  if (!user) {
    return <Navigate to={profileAuthPath("signin")} replace />;
  }
  if (!onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
