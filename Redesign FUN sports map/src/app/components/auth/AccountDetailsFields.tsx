import React, { useEffect, useMemo, useState } from "react";
import { Cake, Globe } from "lucide-react";
import { GENDER_OPTIONS, type Gender } from "../../../lib/gamePreferenceOptions";
import { countryFromLocale, countryName, countryOptions, isCountryCode } from "../../../lib/countries";
import { getIpCountry, getSignupRules } from "../../../lib/api";
import {
  FALLBACK_SIGNUP_RULES,
  ageCheckMessage,
  checkSignupAge,
  type AgeCheck,
  type SignupRules,
} from "../../../lib/ageRules";

/**
 * Date of birth, gender, country and the legal checkbox: what FUN needs to know before
 * an account exists. Shared by sign-up and by /account-setup (for accounts made before
 * sign-up asked). The server re-checks everything; this only explains a refusal first.
 */

export type AccountDetailsDraft = {
  birthdate: string;
  gender: Gender | null;
  country: string;
  agreed: boolean;
};

export const EMPTY_ACCOUNT_DETAILS: AccountDetailsDraft = {
  birthdate: "",
  gender: null,
  country: "",
  agreed: false,
};

export type AccountDetailsSections = { birthdate: boolean; gender: boolean; consent: boolean };

/** Loads the age rules once, and prefills the country from IP, then browser locale. */
export function useSignupRules(
  draft: AccountDetailsDraft,
  setDraft: React.Dispatch<React.SetStateAction<AccountDetailsDraft>>,
  prefillCountry: boolean,
): SignupRules {
  const [rules, setRules] = useState<SignupRules>(FALLBACK_SIGNUP_RULES);

  useEffect(() => {
    let cancelled = false;
    void getSignupRules().then((r) => {
      if (!cancelled) setRules(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefillCountry || draft.country) return;
    let cancelled = false;
    const fromLocale = typeof navigator !== "undefined" ? countryFromLocale(navigator.languages ?? []) : null;
    void getIpCountry().then((fromIp) => {
      const guess = fromIp ?? fromLocale;
      if (!cancelled && guess && isCountryCode(guess)) {
        setDraft((d) => (d.country ? d : { ...d, country: guess }));
      }
    });
    return () => {
      cancelled = true;
    };
    // Prefill once; after that the field is the person's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCountry]);

  return rules;
}

/** Null when the draft is complete and allowed; otherwise the sentence to show. */
export function accountDetailsProblem(
  draft: AccountDetailsDraft,
  sections: AccountDetailsSections,
  rules: SignupRules,
): string | null {
  if (sections.birthdate) {
    if (!draft.birthdate) return "Enter your date of birth.";
    if (!isCountryCode(draft.country)) return "Choose the country you live in.";
    const check: AgeCheck = checkSignupAge(draft.birthdate, draft.country, rules);
    if (!check.ok) return ageCheckMessage(check, countryName(draft.country));
  }
  if (sections.gender && !draft.gender) return "Choose a gender.";
  if (sections.consent && !draft.agreed) {
    return "Please agree to the Terms, Privacy Policy and Community Guidelines.";
  }
  return null;
}

export function AccountDetailsFields({
  draft,
  onChange,
  sections,
}: {
  draft: AccountDetailsDraft;
  onChange: (next: AccountDetailsDraft) => void;
  sections: AccountDetailsSections;
}) {
  const countries = useMemo(() => countryOptions(), []);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {sections.birthdate ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="arena-label text-[10px] text-primary">Date of birth</span>
            <span className="relative block">
              <Cake className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-primary/80" aria-hidden />
              <input
                type="date"
                name="bday"
                autoComplete="bday"
                required
                min="1900-01-01"
                max={today}
                value={draft.birthdate}
                onChange={(e) => onChange({ ...draft, birthdate: e.target.value })}
                className="arena-input [color-scheme:dark]"
              />
            </span>
            <span className="text-[11px] leading-snug text-slate-400">
              Never shown to anyone. It places you with players your age: under-18s and adults use FUN
              separately.
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="arena-label text-[10px] text-primary">Country you live in</span>
            <span className="relative block">
              <Globe className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-primary/80" aria-hidden />
              <select
                name="country"
                autoComplete="country"
                required
                value={draft.country}
                onChange={(e) => onChange({ ...draft, country: e.target.value })}
                className="arena-input appearance-none"
              >
                <option value="" disabled>
                  Choose a country
                </option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </>
      ) : null}

      {sections.gender ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="arena-label mb-1.5 text-[10px] text-primary">Gender</legend>
          <div className="grid grid-cols-3 gap-2">
            {GENDER_OPTIONS.map((o) => {
              const selected = draft.gender === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onChange({ ...draft, gender: o.value })}
                  aria-pressed={selected}
                  className={
                    "min-h-11 rounded-xl border px-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 " +
                    (selected
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500")
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <span className="text-[11px] leading-snug text-slate-400">
            Games open to one gender are shown only to matching players.
          </span>
        </fieldset>
      ) : null}

      {sections.consent ? (
        <label className="flex items-start gap-3 rounded-xl bg-surface-2/60 px-3 py-3 text-[13px] leading-snug text-slate-300">
          <input
            type="checkbox"
            required
            checked={draft.agreed}
            onChange={(e) => onChange({ ...draft, agreed: e.target.checked })}
            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
          />
          <span>
            I agree to the{" "}
            <a href="/terms" target="_blank" rel="noopener" className="font-semibold text-primary underline-offset-2 hover:underline">
              Terms
            </a>
            ,{" "}
            <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-primary underline-offset-2 hover:underline">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/guidelines" target="_blank" rel="noopener" className="font-semibold text-primary underline-offset-2 hover:underline">
              Community Guidelines
            </a>
            .
          </span>
        </label>
      ) : null}
    </>
  );
}
