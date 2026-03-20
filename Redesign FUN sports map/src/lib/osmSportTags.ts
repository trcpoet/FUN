/**
 * Map app sport labels (SPORT_OPTIONS) to OSM `sport=*` tokens on pitches.
 * OSM values are often lowercase; multi-sports use semicolons e.g. `soccer;rugby`.
 */

const DISPLAY_TO_OSM: Record<string, string[]> = {
  Soccer: ["soccer", "association_football", "football"],
  Tennis: ["tennis"],
  Basketball: ["basketball"],
  Volleyball: ["volleyball"],
  Pickleball: ["pickleball"],
  Running: ["running", "athletics"],
  Gym: ["fitness", "weight_training", "multi"],
  "Martial Arts": ["martial_arts", "karate", "judo", "taekwondo", "boxing", "multi"],
  Yoga: ["yoga", "multi"],
  Dance: ["dance", "multi"],
  Pilates: ["pilates", "yoga", "multi"],
  Cardio: ["fitness", "multi"],
  "Strength Training": ["fitness", "weight_training", "multi"],
  Flexibility: ["yoga", "multi"],
  Endurance: ["running", "athletics", "multi"],
  Speed: ["athletics", "running", "multi"],
  Power: ["fitness", "weight_training", "multi"],
  Chess: ["chess"],
};

function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Tokens we accept from OSM `sport` (split on `;`). */
export function osmSportTokens(osmSport: string | undefined | null): string[] {
  if (!osmSport?.trim()) return [];
  return osmSport
    .split(/[;,]/)
    .map((x) => normalizeToken(x))
    .filter(Boolean);
}

/** All OSM tokens that match any selected display sport. */
export function expectedOsmTokensForDisplaySports(displaySports: string[]): Set<string> {
  const out = new Set<string>();
  for (const d of displaySports) {
    const mapped = DISPLAY_TO_OSM[d];
    if (mapped?.length) mapped.forEach((t) => out.add(normalizeToken(t)));
    else out.add(normalizeToken(d));
  }
  return out;
}

/**
 * When `displaySports` is empty → show all venues.
 * Otherwise keep a venue if any OSM token overlaps expected tags for selected sports.
 */
export function venueMatchesSelectedSports(
  osmSport: string | undefined | null,
  displaySports: string[],
): boolean {
  if (!displaySports.length) return true;
  const tokens = osmSportTokens(osmSport);
  if (tokens.length === 0) return false;
  const expected = expectedOsmTokensForDisplaySports(displaySports);
  return tokens.some((t) => expected.has(t));
}
