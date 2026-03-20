/** Options for optional "who should join" fields on create-game (not map filters). */

export const LEVEL_OPTIONS = ["Any", "Beginner", "Intermediate", "Advanced", "Competitive"] as const;
export const AGE_RANGE_OPTIONS = ["Any", "13–17", "18–24", "25–34", "35–44", "45+"] as const;
export const AVAILABILITY_OPTIONS = ["Now", "Today", "This week"] as const;
export const TIME_OF_DAY_OPTIONS = ["Morning", "Afternoon", "Evening", "Late night"] as const;
export const GAME_TYPE_OPTIONS = ["Casual", "Training", "Competitive", "Tournament", "1‑on‑1"] as const;

export type GameRequirementsPayload = {
  skillLevel: string;
  ageRange: string;
  availability: string[];
  timeOfDay: string[];
  gameTypes: string[];
  school: string;
};

export function emptyGameRequirements(): GameRequirementsPayload {
  return {
    skillLevel: "Any",
    ageRange: "Any",
    availability: [],
    timeOfDay: [],
    gameTypes: [],
    school: "",
  };
}
