/** Subtle emoji markers for sport rows — keep sparse; not a toy UI. */
export function sportEmoji(sport: string): string {
  if (!sport) return "🏆";
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
    wrestling: "🤼",
    boxing: "🥊",
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
  
  if (map[k]) return map[k];

  // Keyword fallbacks for unknown sports (like "Pinik Ball" -> "🏐")
  if (k.includes("ball")) return "🏐";
  if (k.includes("run") || k.includes("track") || k.includes("jog")) return "🏃";
  if (k.includes("swim") || k.includes("water") || k.includes("pool")) return "🏊";
  if (k.includes("gym") || k.includes("lift") || k.includes("weight")) return "🏋️";
  if (k.includes("fight") || k.includes("box") || k.includes("mma")) return "🥊";
  if (k.includes("bike") || k.includes("cycl")) return "🚴";
  if (k.includes("golf")) return "⛳";
  if (k.includes("skat")) return "🛹";
  if (k.includes("snow") || k.includes("ski") || k.includes("ice")) return "🏂";
  if (k.includes("frisbee") || k.includes("disc")) return "🥏";
  if (k.includes("yoga") || k.includes("stretch")) return "🧘";

  // Generic fallback
  return "🏆";
}
