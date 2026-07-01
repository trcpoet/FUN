import { SPORTS_CATALOG, resolveCatalogSport } from "./sportsCatalog";

/** Emoji / glyph for a sport label — registry first, then keyword fallbacks. */
export function sportEmojiFor(name: string): string {
  if (!name) return "🏆";
  const hit = resolveCatalogSport(name);
  if (hit) return hit.emoji;

  const lower = name.toLowerCase();
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

export type SportChoice = { id: string; label: string; icon: string };

export function getSportsForPicker(): SportChoice[] {
  return SPORTS_CATALOG.map((s) => ({
    id: s.id,
    label: s.id,
    icon: s.emoji,
  }));
}

export function filterSportsByQuery(sports: SportChoice[], query: string): SportChoice[] {
  const q = query.trim().toLowerCase();
  if (!q) return sports;
  return sports.filter(
    (s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
  );
}
