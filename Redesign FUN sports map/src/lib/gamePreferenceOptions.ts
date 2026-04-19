/** Options for optional "who should join" fields on create-game (not map filters). */

export const LEVEL_OPTIONS = ["Any", "Beginner", "Intermediate", "Advanced", "Competitive"] as const;
export const AGE_RANGE_OPTIONS = ["Any", "13–17", "18–24", "25–34", "35–44", "45+"] as const;
export const MATCH_TYPE_OPTIONS = ["Co-ed", "Men's", "Women's"] as const;
export const VISIBILITY_OPTIONS = ["Public (Map)", "Friends Only", "Invite Only"] as const;

export type GameRequirementsPayload = {
  skillLevel: string;
  ageRange: string;
  matchType: string;
  visibility: string;
  school: string;
};

export function emptyGameRequirements(): GameRequirementsPayload {
  return {
    skillLevel: "Any",
    ageRange: "Any",
    matchType: "Co-ed",
    visibility: "Public (Map)",
    school: "",
  };
}
