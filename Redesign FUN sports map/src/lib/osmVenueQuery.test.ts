import { describe, it, expect } from "vitest";
import { buildVenueOverpassQuery } from "../../server/lib/osmVenueQuery";
import { SPORTS_CATALOG } from "./sportsCatalog";

const BBOX = "32.68,-97.20,32.78,-97.05";

/** The `leisure=` alternation the query actually asks Overpass for. */
function importedLeisureTokens(): string[] {
  const group = buildVenueOverpassQuery(BBOX).match(/leisure"~"\^\(([^)]*)\)\$"/)?.[1] ?? "";
  return group.split("|").filter(Boolean);
}

/**
 * Tokens a sport claims that the importer refuses on purpose, each with the reason.
 *
 * An entry here is a decision someone made, not a gap someone missed — which is the whole
 * difference this map records. Deleting an entry is how you reopen the decision.
 */
const NOT_COLLECTED_ON_PURPOSE = new Map<string, string>([
  [
    "stadium",
    "A pro stadium is a landmark, not somewhere you can start a pickup game, and stadiums " +
      "carry no `access` tag — so AT&T Stadium would import as an ordinary open venue with a " +
      "Create game button. Collect it once venueAccessTier can render one visible-but-not-bookable.",
  ],
]);

describe("buildVenueOverpassQuery", () => {
  it("imports ALL parks (with or without a pitch) via the flat leisure union", () => {
    const leisureGroup = buildVenueOverpassQuery(BBOX).match(/leisure"~"\^\(([^)]*)\)\$"/)?.[1] ?? "";
    expect(leisureGroup.split("|")).toContain("park");
  });

  it("still queries pitches and recreation grounds", () => {
    const q = buildVenueOverpassQuery(BBOX);
    expect(q).toContain("pitch");
    expect(q).toContain("recreation_ground");
  });

  /**
   * The catalog is a promise to the user: every `osmLeisure` token it lists is a venue type
   * some sport in the picker claims to find. If the importer never asks Overpass for that
   * token, the promise cannot be kept — the rows simply never enter the database, and the
   * filter looks broken for reasons nothing in the UI can explain.
   *
   * `Adventure Park` shipped exactly that way: it advertised `leisure=adventure_park` while
   * the importer collected only `water_park`, so the database held 65 water parks and zero
   * adventure parks.
   *
   * Deliberately one-directional. The importer is allowed to collect tokens no sport claims —
   * `park` is fetched for its own sake, and `recreation_ground` and `sports_centre` arrive as
   * generic venues — so asserting the reverse would fail on correct data.
   */
  it("collects every leisure token the sports catalog advertises", () => {
    const imported = new Set(importedLeisureTokens());
    const missing = new Set<string>();

    for (const sport of SPORTS_CATALOG) {
      for (const token of sport.osmLeisure ?? []) {
        if (imported.has(token) || NOT_COLLECTED_ON_PURPOSE.has(token)) continue;
        missing.add(`${token} (claimed by ${sport.id})`);
      }
    }

    expect([...missing]).toEqual([]);
  });

  it("keeps the deliberate exclusions deliberate", () => {
    // If someone adds one of these to the importer, this fails and they have to come back here
    // and delete the reason — which is the moment to check the reason no longer applies.
    const imported = new Set(importedLeisureTokens());
    for (const token of NOT_COLLECTED_ON_PURPOSE.keys()) {
      expect(imported.has(token)).toBe(false);
    }
  });

  it("embeds the bbox and stays a bounded query (node + way, out center)", () => {
    const q = buildVenueOverpassQuery(BBOX);
    expect(q).toContain(BBOX);
    expect(q).toContain("node[");
    expect(q).toContain("way[");
    expect(q).toContain("out center");
  });
});
