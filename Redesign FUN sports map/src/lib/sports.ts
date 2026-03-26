/** Canonical sports list (filters, search, create-game). */
export const SPORT_OPTIONS = [
  "Basketball",
  "Soccer",
  "Volleyball",
  "Tennis",
  "Pickleball",
  "Running",
  "Gym",
  "Martial Arts",
  "Wrestling",
  "Boxing",
  "Chess",
  "Yoga",
  "Pilates",
  "Dance",
  "Cardio",
  "Strength Training",
  "Flexibility",
  "Endurance",
  "Speed",
  "Power",
] as const;

export type SportOption = (typeof SPORT_OPTIONS)[number];

/**
 * Informal / regional / typo-prone tokens → canonical `SPORT_OPTIONS` label.
 * Keys must be lowercase (see `normalizeSportQuery`).
 */
export const SPORT_ALIAS_TO_CANONICAL: Readonly<Record<string, SportOption>> = {
  // Soccer family
  football: "Soccer",
  futbol: "Soccer",
  futsal: "Soccer",
  footy: "Soccer",
  "association football": "Soccer",
  // Basketball
  bball: "Basketball",
  hoops: "Basketball",
  // Pickleball
  "pickle ball": "Pickleball",
  pickle: "Pickleball",
  // Tennis
  "court tennis": "Tennis",
  // Volleyball
  vb: "Volleyball",
  "beach volleyball": "Volleyball",
  // Running
  jog: "Running",
  jogging: "Running",
  // Gym / training
  weights: "Gym",
  lifting: "Strength Training",
  lift: "Strength Training",
  // Misc
  mma: "Martial Arts",
  bjj: "Martial Arts",
  boxing: "Martial Arts",
};

/** Normalize user text for alias + fuzzy sport matching. */
export function normalizeSportQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ");
}
