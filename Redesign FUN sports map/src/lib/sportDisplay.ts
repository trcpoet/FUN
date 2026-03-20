import { SPORT_OPTIONS, type SportOption } from "./sports";

/** Emoji / glyph per canonical sport (extend when adding `SPORT_OPTIONS` entries). */
const SPORT_EMOJI: Record<string, string> = {
  Basketball: "🏀",
  Soccer: "⚽",
  Volleyball: "🏐",
  Tennis: "🎾",
  Pickleball: "🏓",
  Running: "🏃",
  Gym: "🏋️",
  "Martial Arts": "🥋",
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
  if (SPORT_EMOJI[name]) return SPORT_EMOJI[name];
  const lower = name.toLowerCase();
  const hit = Object.keys(SPORT_EMOJI).find((k) => k.toLowerCase() === lower);
  return hit ? SPORT_EMOJI[hit]! : "🎯";
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
