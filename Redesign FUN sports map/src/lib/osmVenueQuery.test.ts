import { describe, it, expect } from "vitest";
import { buildVenueOverpassQuery } from "../../server/lib/osmVenueQuery";

const BBOX = "32.68,-97.20,32.78,-97.05";

describe("buildVenueOverpassQuery", () => {
  it("does NOT put a bare 'park' in the flat leisure union (avoids importing every green space)", () => {
    const leisureGroup = buildVenueOverpassQuery(BBOX).match(/leisure"~"\^\(([^)]*)\)\$"/)?.[1] ?? "";
    expect(leisureGroup.split("|")).not.toContain("park");
  });

  it("keeps only parks that CONTAIN a pitch via the containment sub-query", () => {
    const q = buildVenueOverpassQuery(BBOX);
    // pitches → their nodes → enclosing areas → leisure=park → pivot back to the ways
    expect(q).toContain('way["leisure"="pitch"]');
    expect(q).toContain("node(w.pitches)");
    expect(q).toContain("is_in");
    expect(q).toContain('area.enclosing["leisure"="park"]');
    expect(q).toContain("pivot.parkAreas");
    // and the base venues + sporty parks are unioned for output
    expect(q).toContain("(.base; .sportyParks;)");
  });

  it("still queries pitches and recreation grounds in the flat union", () => {
    const q = buildVenueOverpassQuery(BBOX);
    expect(q).toContain("pitch");
    expect(q).toContain("recreation_ground");
  });

  it("embeds the bbox and stays a bounded query (node + way, out center)", () => {
    const q = buildVenueOverpassQuery(BBOX);
    // bbox appears in both the base union and the pitch sub-query
    expect(q.match(new RegExp(BBOX.replace(/[.\-]/g, "\\$&"), "g"))?.length).toBeGreaterThanOrEqual(2);
    expect(q).toContain("node[");
    expect(q).toContain("way[");
    expect(q).toContain("out center");
  });
});
