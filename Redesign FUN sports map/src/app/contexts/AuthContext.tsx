import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { getMyProfile } from "../../lib/api";
import type { User } from "@supabase/supabase-js";

type AuthContextValue = {
  user: User | null;
  onboardingCompleted: boolean | null;
  loading: boolean;
  refetchProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const refetchProfile = useCallback(async () => {
    if (!user) {
      setOnboardingCompleted(null);
      return;
    }
    const res = await getMyProfile();
    if (res.error) {
      setOnboardingCompleted(true);
      return;
    }
    setOnboardingCompleted(res.onboardingCompleted);
  }, [user]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setOnboardingCompleted(null);
      return;
    }
    refetchProfile();
  }, [user, refetchProfile]);

  const value: AuthContextValue = {
    user,
    onboardingCompleted,
    loading,
    refetchProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
