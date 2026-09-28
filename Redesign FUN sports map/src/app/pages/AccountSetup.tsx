import React, { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { completeAccountSetup, signOut } from "../../lib/api";
import { accountSetupErrorMessage, checkSignupAge } from "../../lib/ageRules";
import { isCountryCode } from "../../lib/countries";
import { acceptedDocumentsPayload } from "../../lib/legal";
import { safeReturnTo } from "../../lib/guestAccess";
import { FunOrbitLoader } from "../components/FunOrbitLoader";
import {
  AccountDetailsFields,
  EMPTY_ACCOUNT_DETAILS,
  accountDetailsProblem,
  useSignupRules,
  type AccountDetailsDraft,
  type AccountDetailsSections,
} from "../components/auth/AccountDetailsFields";

/**
 * The questions sign-up now asks, for accounts made before it asked them, and the
 * accept screen when a legal document changes. Only what is missing is shown.
 */
export default function AccountSetup() {
  const { user, loading, accountStatus, accountSetupComplete, refetchProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const returnTo = safeReturnTo(location.state?.from) ?? "/";

  const [draft, setDraft] = useState<AccountDetailsDraft>(EMPTY_ACCOUNT_DETAILS);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sections: AccountDetailsSections = {
    birthdate: accountStatus ? !accountStatus.hasBirthdate : false,
    gender: accountStatus ? !accountStatus.hasGender : false,
    consent: accountStatus ? accountStatus.missingDocuments.length > 0 : false,
  };
  const rules = useSignupRules(draft, setDraft, sections.birthdate);

  useEffect(() => {
    setError(null);
    setBlocked(false);
  }, [draft]);

  if (loading || (user && accountSetupComplete === null)) return <FunOrbitLoader tagline="Loading FUN…" />;
  if (!user) return <Navigate to="/profile?auth=signin" replace />;
  if (accountSetupComplete) return <Navigate to={returnTo} replace />;

  const onlyConsent = !sections.birthdate && !sections.gender && sections.consent;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = accountDetailsProblem(draft, sections, rules);
    if (problem) {
      setError(problem);
      // Under the minimum age, or a teen before teen accounts open: no answer on this
      // screen will get them in, so offer the way out instead of the button.
      const age =
        sections.birthdate && draft.birthdate && isCountryCode(draft.country)
          ? checkSignupAge(draft.birthdate, draft.country, rules)
          : null;
      setBlocked(!!age && !age.ok && (age.reason === "under_min" || age.reason === "teen_closed"));
      return;
    }
    setSubmitting(true);
    const { error: rpcError } = await completeAccountSetup({
      birthdate: sections.birthdate ? draft.birthdate : null,
      gender: sections.gender ? draft.gender : null,
      country: sections.birthdate ? draft.country : null,
      accepted: sections.consent ? acceptedDocumentsPayload() : {},
    });
    setSubmitting(false);
    if (rpcError) {
      setError(accountSetupErrorMessage(rpcError.message));
      setBlocked(/FUN_UNDER_MIN_AGE|FUN_TEEN_SIGNUPS_CLOSED/.test(rpcError.message));
      return;
    }
    await refetchProfile();
    navigate(returnTo, { replace: true });
  }

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <main className="auth-shell flex min-h-screen min-h-dvh flex-col items-center justify-center bg-[#060b1a] px-4 py-10 text-slate-100">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-white">
          {onlyConsent ? "We've updated our terms" : "A few details first"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {onlyConsent
            ? "Please read and accept the current versions to keep using your account."
            : "FUN keeps players under 18 and adults in separate communities, so we need your date of birth and country before you play. They're never shown to anyone."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <AccountDetailsFields draft={draft} onChange={setDraft} sections={sections} />

          {error ? (
            <p className="rounded-xl bg-rose-500/12 px-3 py-2 text-sm text-rose-200" role="alert">
              {error}
            </p>
          ) : null}

          {blocked ? (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="min-h-11 rounded-full bg-surface-2 px-4 text-sm font-semibold text-slate-200 hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              Sign out and keep browsing the map
            </button>
          ) : (
            <div className="arena-cta-frame mt-2">
              <button type="submit" disabled={submitting} className="arena-cta px-4 text-sm">
                {submitting ? "Saving…" : "Continue"}
              </button>
            </div>
          )}
        </form>

        {!blocked ? (
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-6 w-full text-center text-xs text-slate-500 hover:text-slate-300"
          >
            Sign out instead
          </button>
        ) : null}
      </div>
    </main>
  );
}
