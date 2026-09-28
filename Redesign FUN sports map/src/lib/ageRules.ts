/**
 * The age rules, as the sign-up and setup forms explain them.
 *
 * The server decides (`_fun_apply_account_setup` in the 20260928180000 migration): a
 * sign-up it refuses never becomes an account. This file only exists so the form can
 * say *why* before sending anything, because a refused auth insert reaches the client
 * as a bare "Database error saving new user". Keep the two in step.
 */

export type AgeTier = "teen" | "adult";

export type SignupRules = {
  defaultMinAge: number;
  minAgeByCountry: Record<string, number>;
  teenSignupsOpen: boolean;
};

/** Used until the real rules load, and if they can't: the strictest reading. */
export const FALLBACK_SIGNUP_RULES: SignupRules = {
  defaultMinAge: 13,
  minAgeByCountry: {},
  teenSignupsOpen: false,
};

export const ADULT_AGE = 18;

/** A `YYYY-MM-DD` string as a calendar date, or null. No time zones involved. */
export function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/** Whole years between a birthdate and `today`, the way Postgres `age()` counts them. */
export function ageInYears(birthdate: string, today: Date = new Date()): number | null {
  const b = parseIsoDate(birthdate);
  if (!b) return null;
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const td = today.getDate();
  let age = ty - b.y;
  if (tm < b.m || (tm === b.m && td < b.d)) age -= 1;
  return age;
}

export function minAgeFor(country: string, rules: SignupRules): number {
  return rules.minAgeByCountry[country.trim().toUpperCase()] ?? rules.defaultMinAge;
}

export function ageTier(age: number): AgeTier {
  return age >= ADULT_AGE ? "adult" : "teen";
}

export type AgeCheck =
  | { ok: true; age: number; tier: AgeTier }
  | { ok: false; reason: "invalid" | "future" | "under_min" | "teen_closed"; minAge: number };

export function checkSignupAge(
  birthdate: string,
  country: string,
  rules: SignupRules,
  today: Date = new Date(),
): AgeCheck {
  const minAge = minAgeFor(country, rules);
  const age = ageInYears(birthdate, today);
  if (age === null || age > 120) return { ok: false, reason: "invalid", minAge };
  if (age < 0) return { ok: false, reason: "future", minAge };
  if (age < minAge) return { ok: false, reason: "under_min", minAge };
  if (age < ADULT_AGE && !rules.teenSignupsOpen) return { ok: false, reason: "teen_closed", minAge };
  return { ok: true, age, tier: ageTier(age) };
}

export function ageCheckMessage(check: Extract<AgeCheck, { ok: false }>, countryName: string): string {
  switch (check.reason) {
    case "invalid":
      return "Enter your real date of birth.";
    case "future":
      return "That date of birth is in the future.";
    case "under_min":
      return `You need to be at least ${check.minAge} to use FUN where you live (${countryName}).`;
    case "teen_closed":
      return "Accounts for players under 18 open soon. Until then, you can keep browsing the map.";
  }
}

/** The FUN_* codes the server raises, as sentences. */
export function accountSetupErrorMessage(message: string): string {
  if (message.includes("FUN_UNDER_MIN_AGE")) return "You're under the minimum age to use FUN where you live.";
  if (message.includes("FUN_TEEN_SIGNUPS_CLOSED")) {
    return "Accounts for players under 18 open soon. Until then, you can keep browsing the map.";
  }
  if (message.includes("FUN_INVALID_BIRTHDATE")) return "Enter your real date of birth.";
  if (message.includes("FUN_INVALID_COUNTRY")) return "Choose the country you live in.";
  if (message.includes("FUN_INVALID_GENDER")) return "Choose a gender.";
  if (message.includes("FUN_STALE_LEGAL_VERSION")) {
    return "Our terms were just updated. Reload the page to read the new version.";
  }
  if (message.includes("FUN_SETUP_INCOMPLETE")) return "Add your date of birth and country to continue.";
  // A refused sign-up surfaces from Supabase Auth only as this.
  if (message.toLowerCase().includes("database error saving new user")) {
    return "We couldn't create your account with those details. Check your date of birth and country.";
  }
  return message;
}
