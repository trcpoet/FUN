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
