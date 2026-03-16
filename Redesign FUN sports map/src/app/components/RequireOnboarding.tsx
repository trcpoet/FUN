import React from "react";
import { Navigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";

export function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const { user, onboardingCompleted, loading } = useAuth();

  if (loading || onboardingCompleted === null) {
    return (
      <div className="min-h-screen bg-[#0A0F1C] flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
