/**
 * SINGLE SOURCE OF TRUTH for sports / activities in FUN.
 *
 * Every other sports map (canonical label list, alias map, emoji maps, OSM venue
 * tag mapping, Mapbox game-pin icon rows, venue cluster keys, duration presets)
 * is derived from `SPORTS_CATALOG`. To add a new activity, add ONE row here and it
 * flows to filters, create-game pickers, map pins, and venue discovery.
 *
 * Field guide:
 * - `id`          canonical display label (also the value stored in `games.sport`)
 * - `emoji`       glyph used for pins, chips, venue rows
 * - `mapboxSuffix` stable id for the rasterized game pin + venue icon (keep existing ones stable)
 * - `category`    coarse grouping (drives duration presets + venue accordion buckets)
 * - `osmSport`    OpenStreetMap `sport=*` tokens (venue filtering + Overpass regex)
 * - `osmLeisure`  OpenStreetMap `leisure=*` tokens (venue query + matching + leisure→icon)
 * - `osmAmenity`  OpenStreetMap `amenity=*` tokens (rare; e.g. community_centre)
 * - `aliases`     human/typo/regional variants for search + icon resolution (NOT used for filtering)
 * - `popular`     surfaced in curated quick-pick subsets (create-game sheet, venue menu)
 *
 * NOTE: OSM tokens are curated best-effort. Verify against https://taginfo.openstreetmap.org
 * before relying on any single token for venue coverage.
 */

export type SportCategory =
  | "court"
  | "field"
  | "fitness"
  | "combat"
  | "water"
  | "wheels"
  | "ice"
  | "target"
  | "climb"
  | "adventure"
  | "mind";

export type SportDef = {
  id: string;
  emoji: string;
  mapboxSuffix: string;
  category: SportCategory;
  osmSport?: string[];
  osmLeisure?: string[];
  osmAmenity?: string[];
  aliases?: string[];
  popular?: boolean;
};

export const SPORTS_CATALOG: SportDef[] = [
  // —— Court ——
  { id: "Basketball", emoji: "🏀", mapboxSuffix: "basketball", category: "court", osmSport: ["basketball"], osmLeisure: ["pitch"], aliases: ["bball", "hoops"], popular: true },
  { id: "Tennis", emoji: "🎾", mapboxSuffix: "tennis", category: "court", osmSport: ["tennis"], osmLeisure: ["pitch"], aliases: ["court tennis"], popular: true },
  { id: "Volleyball", emoji: "🏐", mapboxSuffix: "volleyball", category: "court", osmSport: ["volleyball"], osmLeisure: ["pitch"], aliases: ["vb"], popular: true },
  { id: "Beach Volleyball", emoji: "🏐", mapboxSuffix: "beachvolleyball", category: "court", osmSport: ["beachvolleyball", "beach_volleyball"], osmLeisure: ["pitch"], aliases: ["beach volleyball", "beachvolleyball"] },
  { id: "Pickleball", emoji: "🏓", mapboxSuffix: "pickleball", category: "court", osmSport: ["pickleball"], osmLeisure: ["pitch"], aliases: ["pickle ball", "pickle"], popular: true },
  { id: "Badminton", emoji: "🏸", mapboxSuffix: "badminton", category: "court", osmSport: ["badminton"], osmLeisure: ["pitch", "sports_centre"], aliases: ["shuttlecock"], popular: true },
  { id: "Table Tennis", emoji: "🏓", mapboxSuffix: "table_tennis", category: "court", osmSport: ["table_tennis"], osmLeisure: ["pitch", "sports_centre"], aliases: ["ping pong", "table tennis", "tabletennis"] },
  { id: "Squash", emoji: "🎾", mapboxSuffix: "squash", category: "court", osmSport: ["squash"], osmLeisure: ["pitch", "sports_centre"] },
  { id: "Handball", emoji: "🤾", mapboxSuffix: "handball", category: "court", osmSport: ["handball"], osmLeisure: ["pitch"] },

  // —— Field ——
  { id: "Soccer", emoji: "⚽", mapboxSuffix: "soccer", category: "field", osmSport: ["soccer", "association_football", "football"], osmLeisure: ["pitch"], aliases: ["futbol", "footy", "association football"], popular: true },
  { id: "Football", emoji: "🏈", mapboxSuffix: "football", category: "field", osmSport: ["american_football", "gridiron"], osmLeisure: ["pitch", "stadium"], aliases: ["football", "american football", "gridiron"], popular: true },
  { id: "Futsal", emoji: "⚽", mapboxSuffix: "futsal", category: "field", osmSport: ["futsal"], osmLeisure: ["pitch", "sports_centre"], aliases: ["indoor soccer"] },
  { id: "Baseball", emoji: "⚾", mapboxSuffix: "baseball", category: "field", osmSport: ["baseball"], osmLeisure: ["pitch"] },
  { id: "Softball", emoji: "🥎", mapboxSuffix: "softball", category: "field", osmSport: ["softball"], osmLeisure: ["pitch"] },
  { id: "Cricket", emoji: "🏏", mapboxSuffix: "cricket", category: "field", osmSport: ["cricket"], osmLeisure: ["pitch"] },
  { id: "Rugby", emoji: "🏉", mapboxSuffix: "rugby", category: "field", osmSport: ["rugby", "rugby_union", "rugby_league"], osmLeisure: ["pitch"] },
  { id: "Lacrosse", emoji: "🥍", mapboxSuffix: "lacrosse", category: "field", osmSport: ["lacrosse"], osmLeisure: ["pitch"] },
  { id: "Field Hockey", emoji: "🏑", mapboxSuffix: "field_hockey", category: "field", osmSport: ["field_hockey", "hockey"], osmLeisure: ["pitch"], aliases: ["field hockey"] },
  { id: "Golf", emoji: "⛳", mapboxSuffix: "golf", category: "field", osmSport: ["golf", "miniature_golf"], osmLeisure: ["golf_course", "miniature_golf"], aliases: ["mini golf", "minigolf"] },
  { id: "Disc Golf", emoji: "🥏", mapboxSuffix: "disc_golf", category: "field", osmSport: ["disc_golf", "ultimate", "flying_disc"], osmLeisure: ["pitch", "disc_golf_course"], aliases: ["ultimate", "frisbee", "disc golf"] },

  // —— Fitness / studio ——
  { id: "Running", emoji: "🏃", mapboxSuffix: "running", category: "fitness", osmSport: ["running", "athletics"], osmLeisure: ["track", "fitness_centre"], aliases: ["track", "jog", "jogging"], popular: true },
  { id: "Gym", emoji: "🏋️", mapboxSuffix: "gym", category: "fitness", osmSport: ["fitness", "weight_training", "multi"], osmLeisure: ["fitness_centre", "sports_centre"], aliases: ["fitness", "workout", "weights"], popular: true },
  { id: "Yoga", emoji: "🧘", mapboxSuffix: "yoga", category: "fitness", osmSport: ["yoga"], osmLeisure: ["fitness_centre"], popular: true },
  { id: "Pilates", emoji: "🧘‍♀️", mapboxSuffix: "pilates", category: "fitness", osmSport: ["pilates", "yoga"], osmLeisure: ["fitness_centre"] },
  { id: "Dance", emoji: "💃", mapboxSuffix: "dance", category: "fitness", osmSport: ["dance"], osmLeisure: ["dance", "fitness_centre"] },
  { id: "Cardio", emoji: "❤️‍🔥", mapboxSuffix: "cardio", category: "fitness", osmSport: ["fitness"], osmLeisure: ["fitness_centre"] },
  { id: "Strength Training", emoji: "💪", mapboxSuffix: "strength", category: "fitness", osmSport: ["fitness", "weight_training"], osmLeisure: ["fitness_centre"], aliases: ["lifting", "lift", "weights"] },
  { id: "Flexibility", emoji: "🤸", mapboxSuffix: "flexibility", category: "fitness", osmSport: ["yoga"], osmLeisure: ["fitness_centre"] },
  { id: "Endurance", emoji: "🏃‍♂️", mapboxSuffix: "endurance", category: "fitness", osmSport: ["running", "athletics"], osmLeisure: ["track"] },
  { id: "Speed", emoji: "⚡", mapboxSuffix: "speed", category: "fitness", osmSport: ["athletics", "running"], osmLeisure: ["track"] },
  { id: "Power", emoji: "🔥", mapboxSuffix: "power", category: "fitness", osmSport: ["fitness", "weight_training"], osmLeisure: ["fitness_centre"] },

  // —— Combat ——
  { id: "Martial Arts", emoji: "🥋", mapboxSuffix: "martial_arts", category: "combat", osmSport: ["martial_arts", "karate", "judo", "taekwondo", "mma", "multi"], osmLeisure: ["sports_centre", "fitness_centre"], aliases: ["mma", "bjj", "jiu jitsu", "karate", "judo", "taekwondo"] },
  { id: "Boxing", emoji: "🥊", mapboxSuffix: "boxing", category: "combat", osmSport: ["boxing"], osmLeisure: ["fitness_centre", "sports_centre"], aliases: ["box"] },
  { id: "Wrestling", emoji: "🤼", mapboxSuffix: "wrestling", category: "combat", osmSport: ["wrestling"], osmLeisure: ["sports_centre"] },

  // —— Wheels ——
  { id: "Skateboarding", emoji: "🛹", mapboxSuffix: "skateboarding", category: "wheels", osmSport: ["skateboard", "skateboarding"], osmLeisure: ["skatepark"], aliases: ["skateboard", "skate park", "skatepark", "skating"] },
  { id: "Cycling", emoji: "🚴", mapboxSuffix: "cycling", category: "wheels", osmSport: ["cycling", "bmx"], osmLeisure: ["track"], aliases: ["bike", "biking", "bmx"] },

  // —— Ice ——
  { id: "Ice Hockey", emoji: "🏒", mapboxSuffix: "ice_hockey", category: "ice", osmSport: ["ice_hockey"], osmLeisure: ["ice_rink"], aliases: ["hockey", "ice hockey"] },
  { id: "Ice Skating", emoji: "⛸️", mapboxSuffix: "ice_skating", category: "ice", osmSport: ["skating", "ice_skating", "figure_skating"], osmLeisure: ["ice_rink"], aliases: ["ice skating", "figure skating", "roller skating"] },

  // —— Water ——
  { id: "Swimming", emoji: "🏊", mapboxSuffix: "swimming", category: "water", osmSport: ["swimming"], osmLeisure: ["swimming_pool", "water_park"], aliases: ["swim", "pool"] },
  { id: "Surfing", emoji: "🏄", mapboxSuffix: "surfing", category: "water", osmSport: ["surfing"], osmLeisure: [], aliases: ["surf"] },
  { id: "Kayaking", emoji: "🛶", mapboxSuffix: "kayaking", category: "water", osmSport: ["canoe", "kayak", "rowing"], osmLeisure: ["marina", "slipway"], aliases: ["kayak", "canoe", "paddle", "paddleboard"] },

  // —— Climb / trail ——
  { id: "Rock Climbing", emoji: "🧗", mapboxSuffix: "climbing", category: "climb", osmSport: ["climbing", "bouldering"], osmLeisure: ["climbing", "sports_centre"], aliases: ["climbing", "bouldering", "rock climbing"] },
  { id: "Hiking", emoji: "🥾", mapboxSuffix: "hiking", category: "climb", osmSport: ["hiking"], osmLeisure: [], aliases: ["hike", "trail", "trekking"] },

  // —— Target / precision ——
  { id: "Archery", emoji: "🏹", mapboxSuffix: "archery", category: "target", osmSport: ["archery"], osmLeisure: ["pitch", "sports_centre"] },
  { id: "Shooting", emoji: "🎯", mapboxSuffix: "shooting", category: "target", osmSport: ["shooting", "shooting_range"], osmLeisure: ["sports_centre"], aliases: ["gun range", "shooting range", "rifle range"] },
  { id: "Bowling", emoji: "🎳", mapboxSuffix: "bowling", category: "target", osmSport: ["9pin", "10pin", "bowling"], osmLeisure: ["bowling_alley"], aliases: ["bowling alley", "ten pin"] },
  { id: "Billiards", emoji: "🎱", mapboxSuffix: "billiards", category: "target", osmSport: ["billiards", "pool", "snooker"], osmLeisure: ["sports_centre"], aliases: ["pool", "snooker", "billiard"] },
  { id: "Darts", emoji: "🎯", mapboxSuffix: "darts", category: "target", osmSport: ["darts"], osmLeisure: ["sports_centre"] },

  // —— Adventure ——
  { id: "Paintball", emoji: "🔫", mapboxSuffix: "paintball", category: "adventure", osmSport: ["paintball"], osmLeisure: ["sports_centre"] },
  { id: "Trampoline Park", emoji: "🤸", mapboxSuffix: "trampoline", category: "adventure", osmSport: ["trampoline"], osmLeisure: ["trampoline_park", "sports_centre"], aliases: ["trampoline"] },
  { id: "Adventure Park", emoji: "🧗‍♂️", mapboxSuffix: "adventure_park", category: "adventure", osmLeisure: ["adventure_park", "water_park"], aliases: ["adventure park", "ropes course", "high ropes"] },
  { id: "Obstacle Course", emoji: "🏃‍♂️", mapboxSuffix: "obstacle", category: "adventure", osmSport: ["obstacle_course"], osmLeisure: ["fitness_station", "sports_centre"], aliases: ["obstacle course", "ninja", "spartan"] },
  { id: "Horse Riding", emoji: "🏇", mapboxSuffix: "equestrian", category: "adventure", osmSport: ["equestrian", "horse_racing"], osmLeisure: ["horse_riding"], aliases: ["horse riding", "equestrian", "riding"] },
  { id: "Recreation Center", emoji: "🏟️", mapboxSuffix: "recreation", category: "adventure", osmSport: ["multi"], osmLeisure: ["sports_centre", "recreation_ground"], osmAmenity: ["community_centre"], aliases: ["rec center", "recreation center", "community center"] },

  // —— Mind ——
  { id: "Chess", emoji: "♟️", mapboxSuffix: "chess", category: "mind", osmSport: ["chess"], osmLeisure: [] },
];

/** Fallback pin id used for unknown / pickup games. */
export const OTHER_SPORT = { mapboxSuffix: "other", emoji: "🎯", aliases: ["other", "pickup"] } as const;

/** Canonical display labels, catalog order. */
export const SPORT_LABELS: string[] = SPORTS_CATALOG.map((s) => s.id);

/** Labels surfaced in curated quick-pick subsets (create-game sheet, venue menu). */
export const POPULAR_SPORT_LABELS: string[] = SPORTS_CATALOG.filter((s) => s.popular).map((s) => s.id);

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[’']/g, "").replace(/[-_/]+/g, " ").replace(/\s+/g, " ");
}

/** id (normalized) → SportDef. */
const BY_ID = new Map<string, SportDef>();
for (const s of SPORTS_CATALOG) BY_ID.set(norm(s.id), s);

/** All lookup tokens (id + aliases + osmSport) → SportDef. First writer wins (catalog order). */
const BY_TOKEN = new Map<string, SportDef>();
for (const s of SPORTS_CATALOG) {
  const tokens = [s.id, s.mapboxSuffix, ...(s.aliases ?? []), ...(s.osmSport ?? [])];
  for (const t of tokens) {
    const k = norm(t);
    if (!BY_TOKEN.has(k)) BY_TOKEN.set(k, s);
  }
}

/** Resolve any label/alias/OSM token to a catalog entry (or null). */
export function resolveCatalogSport(query: string | null | undefined): SportDef | null {
  if (!query) return null;
  const k = norm(query);
  return BY_ID.get(k) ?? BY_TOKEN.get(k) ?? null;
}

export function getSportDef(id: string): SportDef | null {
  return BY_ID.get(norm(id)) ?? null;
}
