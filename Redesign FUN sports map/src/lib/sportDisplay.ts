import { SPORT_OPTIONS, type SportOption } from "./sports";

/** Emoji / glyph per canonical sport (extend when adding `SPORT_OPTIONS` entries). */
const SPORT_EMOJI: Record<string, string> = {
  Basketball: "🏀",
  Soccer: "⚽",
  Volleyball: "🏐",
  Tennis: "🎾",
  Pickleball: "🏓",
  Gym: "🏋️",
  "Martial Arts": "🥋",
  Wrestling: "🤼",
  Boxing: "🥊",
  Chess: "♟️",
  Yoga: "🧘",
  Pilates: "🧘‍♀️",
  Dance: "💃",
  Cardio: "❤️‍🔥",
  "Strength Training": "💪",
  Flexibility: "🤸",
  Endurance: "🏃‍♂️",
  Speed: "⚡",
  Power: "🔥",
};

export function sportEmojiFor(name: string): string {
  if (!name) return "🏆";
  if (SPORT_EMOJI[name]) return SPORT_EMOJI[name];
  const lower = name.toLowerCase();
  const hit = Object.keys(SPORT_EMOJI).find((k) => k.toLowerCase() === lower);
  if (hit) return SPORT_EMOJI[hit]!;

  // Keyword fallbacks for unknown sports (like "Pinik Ball" -> "🏐")
  if (lower.includes("ball")) return "🏐";
  if (lower.includes("run") || lower.includes("track") || lower.includes("jog")) return "🏃";
  if (lower.includes("swim") || lower.includes("water") || lower.includes("pool")) return "🏊";
  if (lower.includes("gym") || lower.includes("lift") || lower.includes("weight")) return "🏋️";
  if (lower.includes("fight") || lower.includes("box") || lower.includes("mma")) return "🥊";
  if (lower.includes("bike") || lower.includes("cycl")) return "🚴";
  if (lower.includes("golf")) return "⛳";
  if (lower.includes("skat")) return "🛹";
  if (lower.includes("snow") || lower.includes("ski") || lower.includes("ice")) return "🏂";
  if (lower.includes("frisbee") || lower.includes("disc")) return "🥏";
  if (lower.includes("yoga") || lower.includes("stretch")) return "🧘";

  // Generic fallback if no keyword matches
  return "🏆";
}

export type SportChoice = { id: SportOption; label: string; icon: string };

export function getSportsForPicker(): SportChoice[] {
  return SPORT_OPTIONS.map((id) => ({
    id,
    label: id,
    icon: sportEmojiFor(id),
  }));
}

export function filterSportsByQuery(sports: SportChoice[], query: string): SportChoice[] {
  const q = query.trim().toLowerCase();
  if (!q) return sports;
  return sports.filter(
    (s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
  );
}
