/** Subtle emoji markers for sport rows — keep sparse; not a toy UI. */
export function sportEmoji(sport: string): string {
  const k = sport.trim().toLowerCase();
  const map: Record<string, string> = {
    basketball: "🏀",
    soccer: "⚽",
    volleyball: "🏐",
    tennis: "🎾",
    pickleball: "🏓",
    running: "🏃",
    gym: "🏋️",
    "martial arts": "🥋",
    chess: "♟️",
    yoga: "🧘",
    pilates: "🧘",
    dance: "💃",
    cardio: "❤️",
    "strength training": "🏋️",
    flexibility: "🤸",
    endurance: "⏱️",
    speed: "⚡",
    power: "💥",
  };
  return map[k] ?? "◎";
}
