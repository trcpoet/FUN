import { describe, it, expect } from "vitest";
import {
  buildVenueOverpassQuery,
  venueTokenSetVersion,
  VENUE_IMPORT_VERSION,
} from "../../server/lib/osmVenueQuery";
import { SPORTS_CATALOG } from "./sportsCatalog";

/** A handful of real tokens, for the range check below. */
const LEISURE_SAMPLE = ["pitch", "sports_centre", "swimming_pool", "park"];

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

  it("changes the import version when the token set changes, not when it is reordered", () => {
    // The version is what makes a token change invalidate existing venue_coverage rows. If it
    // did not move, adding a token would repeat 2026-08-12: every tile chronologically fresh,
    // none of them holding the new venue types, and no way for the data to say so.
    const base = ["pitch", "park", "marina"];
    expect(venueTokenSetVersion([...base].reverse())).toBe(venueTokenSetVersion(base));
    expect(venueTokenSetVersion([...base, "adventure_park"])).not.toBe(venueTokenSetVersion(base));
    expect(venueTokenSetVersion(base.slice(1))).not.toBe(venueTokenSetVersion(base));
  });

  it("produces a version Postgres `integer` can hold, and never 0", () => {
    // 0 is reserved: the column defaults to it to mean "imported before versioning existed".
    for (const tokens of [[], ["a"], [...LEISURE_SAMPLE]]) {
      const v = venueTokenSetVersion(tokens);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(2147483647);
    }
    expect(VENUE_IMPORT_VERSION).toBeGreaterThan(0);
  });

  it("embeds the bbox and stays a bounded query (node + way, out center)", () => {
    const q = buildVenueOverpassQuery(BBOX);
    expect(q).toContain(BBOX);
    expect(q).toContain("node[");
    expect(q).toContain("way[");
    expect(q).toContain("out center");
  });
});
