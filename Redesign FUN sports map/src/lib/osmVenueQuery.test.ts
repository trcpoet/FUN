import { describe, it, expect } from "vitest";
import { buildVenueOverpassQuery } from "../../server/lib/osmVenueQuery";

const BBOX = "32.68,-97.20,32.78,-97.05";

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

  it("embeds the bbox and stays a bounded query (node + way, out center)", () => {
    const q = buildVenueOverpassQuery(BBOX);
    expect(q).toContain(BBOX);
    expect(q).toContain("node[");
    expect(q).toContain("way[");
    expect(q).toContain("out center");
  });
});
