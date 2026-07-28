import { describe, it, expect } from "vitest";
import { buildVenueOverpassQuery } from "../../server/lib/osmVenueQuery";

const BBOX = "32.68,-97.20,32.78,-97.05";

describe("buildVenueOverpassQuery", () => {
  it("includes parks so named parks (e.g. Doug Russell Park, leisure=park) are represented", () => {
    const q = buildVenueOverpassQuery(BBOX);
    // The leisure alternation must contain 'park'.
    expect(q).toMatch(/leisure"~"\^\([^)]*\bpark\b[^)]*\)\$"/);
  });

  it("still queries pitches and recreation grounds", () => {
    const q = buildVenueOverpassQuery(BBOX);
    expect(q).toContain("pitch");
    expect(q).toContain("recreation_ground");
  });

  it("embeds the bbox and stays a bounded query (node + way, out center)", () => {
    const q = buildVenueOverpassQuery(BBOX);
    expect(q).toContain(BBOX);
    expect(q).toContain("node[");
    expect(q).toContain("way[");
    expect(q).toContain("out center");
  });

  it("does not match 'park' as a substring of another token (word-bounded)", () => {
    // Guard: ensure we added a real 'park' token, not e.g. only 'skatepark'/'water_park'.
    const leisureGroup = buildVenueOverpassQuery(BBOX).match(/leisure"~"\^\(([^)]*)\)\$"/)?.[1] ?? "";
    expect(leisureGroup.split("|")).toContain("park");
  });
});
