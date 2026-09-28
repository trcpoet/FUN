import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { getMyAccountStatus, getMyProfile, isAccountSetupComplete, type AccountStatus } from "../../lib/api";
import type { User } from "@supabase/supabase-js";
import { getAuthSessionDeduped } from "../../lib/authDedup";

type AuthContextValue = {
  user: User | null;
  onboardingCompleted: boolean | null;
  /** Birthdate, gender, country and current legal documents. Null while unknown. */
  accountStatus: AccountStatus | null;
  accountSetupComplete: boolean | null;
  loading: boolean;
  refetchProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [accountSetupComplete, setAccountSetupComplete] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const refetchProfile = useCallback(async () => {
    if (!user) {
      setOnboardingCompleted(null);
      setAccountStatus(null);
      setAccountSetupComplete(null);
      return;
    }
    const [res, statusRes] = await Promise.all([getMyProfile(), getMyAccountStatus()]);
    // A failed status read lets the person through, like a failed profile read does:
    // the client gate is a courtesy, and the server enforces the rules either way.
    setAccountStatus(statusRes.status);
    setAccountSetupComplete(statusRes.status ? isAccountSetupComplete(statusRes.status) : true);
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
    void getAuthSessionDeduped()
      .then((session) => {
        setUser(session?.user ?? null);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
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
      setAccountStatus(null);
      setAccountSetupComplete(null);
      return;
    }
    refetchProfile();
  }, [user, refetchProfile]);

  const value: AuthContextValue = {
    user,
    onboardingCompleted,
    accountStatus,
    accountSetupComplete,
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
