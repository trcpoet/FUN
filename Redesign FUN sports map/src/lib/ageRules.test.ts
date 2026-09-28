import { describe, it, expect } from "vitest";
import {
  ageInYears,
  checkSignupAge,
  minAgeFor,
  parseIsoDate,
  accountSetupErrorMessage,
  type SignupRules,
} from "./ageRules";

const RULES: SignupRules = {
  defaultMinAge: 13,
  minAgeByCountry: { AU: 16, DE: 16, FR: 15 },
  teenSignupsOpen: true,
};
const TODAY = new Date(2026, 8, 28); // 28 Sep 2026, local

describe("ageInYears", () => {
  it("counts a birthday that has not happened yet this year as not yet", () => {
    expect(ageInYears("2008-09-29", TODAY)).toBe(17);
    expect(ageInYears("2008-09-28", TODAY)).toBe(18);
  });

  it("handles 29 February like Postgres age(): a year ticks over on 1 March", () => {
    expect(ageInYears("2008-02-29", new Date(2026, 1, 28))).toBe(17);
    expect(ageInYears("2008-02-29", new Date(2026, 2, 1))).toBe(18);
  });

  it("rejects impossible dates", () => {
    expect(parseIsoDate("2010-02-30")).toBeNull();
    expect(parseIsoDate("28/09/2010")).toBeNull();
    expect(ageInYears("", TODAY)).toBeNull();
  });
});

describe("checkSignupAge", () => {
  it("puts 18 and over in the adult tier, 13 to 17 in the teen tier", () => {
    expect(checkSignupAge("2000-01-01", "US", RULES, TODAY)).toMatchObject({ ok: true, tier: "adult" });
    expect(checkSignupAge("2011-01-01", "US", RULES, TODAY)).toMatchObject({ ok: true, tier: "teen", age: 15 });
  });

  it("refuses under 13 by default and under the national minimum where one is higher", () => {
    expect(checkSignupAge("2014-01-01", "US", RULES, TODAY)).toMatchObject({ ok: false, reason: "under_min", minAge: 13 });
    expect(checkSignupAge("2011-01-01", "au", RULES, TODAY)).toMatchObject({ ok: false, reason: "under_min", minAge: 16 });
    expect(checkSignupAge("2011-01-01", "FR", RULES, TODAY)).toMatchObject({ ok: true, tier: "teen" });
  });

  it("refuses teens while teen sign-ups are closed, but not adults", () => {
    const closed = { ...RULES, teenSignupsOpen: false };
    expect(checkSignupAge("2011-01-01", "US", closed, TODAY)).toMatchObject({ ok: false, reason: "teen_closed" });
    expect(checkSignupAge("2000-01-01", "US", closed, TODAY)).toMatchObject({ ok: true });
  });

  it("refuses a future or implausible birthdate", () => {
    expect(checkSignupAge("2027-01-01", "US", RULES, TODAY)).toMatchObject({ ok: false, reason: "future" });
    expect(checkSignupAge("1880-01-01", "US", RULES, TODAY)).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("minAgeFor", () => {
  it("falls back to the default for a country with no special rule", () => {
    expect(minAgeFor("BR", RULES)).toBe(13);
    expect(minAgeFor(" de ", RULES)).toBe(16);
  });
});

describe("accountSetupErrorMessage", () => {
  it("turns server codes and the bare auth error into sentences", () => {
    expect(accountSetupErrorMessage("FUN_UNDER_MIN_AGE")).toMatch(/minimum age/);
    expect(accountSetupErrorMessage("Database error saving new user")).toMatch(/date of birth/);
    expect(accountSetupErrorMessage("something else")).toBe("something else");
  });
});
