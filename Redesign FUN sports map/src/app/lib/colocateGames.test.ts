import { describe, it, expect } from "vitest";
import type { GameRow, MapNoteRow } from "../../lib/supabase";
import { splitColocated, colocatedGroupId } from "./colocateGames";

function game(id: string, lat: number, lng: number): GameRow {
  return { id, lat, lng } as GameRow;
}

function note(id: string, lat: number, lng: number): MapNoteRow {
  return { id, lat, lng } as MapNoteRow;
}

describe("splitColocated", () => {
  it("returns a lone game as a single", () => {
    const { singles, groups } = splitColocated([game("a", 40.1, -74.2)]);
    expect(singles.map((g) => g.id)).toEqual(["a"]);
    expect(groups).toEqual([]);
  });

  it("groups games at identical coordinates", () => {
    const { singles, groups } = splitColocated([
      game("a", 40.123456, -74.2),
      game("b", 40.123456, -74.2),
    ]);
    expect(singles).toEqual([]);
    expect(groups.length).toBe(1);
    expect(groups[0].map((g) => g.id).sort()).toEqual(["a", "b"]);
  });

  it("groups coords equal at 6-decimal precision (differ only in the 7th)", () => {
    // coordKey uses toFixed(6) ≈ 10cm, so a 7th-decimal jitter collapses together.
    const { singles, groups } = splitColocated([
      game("a", 40.1234561, -74.2),
      game("b", 40.1234564, -74.2),
    ]);
    expect(singles).toEqual([]);
    expect(groups.length).toBe(1);
  });

  it("keeps coords that differ at the 6th decimal as separate singles", () => {
    const { singles, groups } = splitColocated([
      game("a", 40.123456, -74.2),
      game("b", 40.123457, -74.2),
    ]);
    expect(singles.map((g) => g.id).sort()).toEqual(["a", "b"]);
    expect(groups).toEqual([]);
  });

  it("partitions a mix of singles and groups", () => {
    const { singles, groups } = splitColocated([
      game("a", 1, 1),
      game("b", 1, 1),
      game("c", 2, 2),
      game("d", 3, 3),
      game("e", 3, 3),
    ]);
    expect(singles.map((g) => g.id).sort()).toEqual(["c"]);
    expect(groups.map((grp) => grp.map((g) => g.id).sort()).sort()).toEqual([
      ["a", "b"],
      ["d", "e"],
    ]);
  });

  it("handles an empty input", () => {
    expect(splitColocated([])).toEqual({ singles: [], groups: [] });
  });

  it("groups notes as well as games (generic over row type)", () => {
    // Notes stack on a venue the same way games do; the helper must not be game-specific.
    const { singles, groups } = splitColocated([
      note("n1", 32.712213, -97.115704),
      note("n2", 32.712213, -97.115704),
      note("n3", 32.8, -97.0),
    ]);
    expect(singles.map((n) => n.id)).toEqual(["n3"]);
    expect(groups.length).toBe(1);
    expect(groups[0].map((n) => n.id).sort()).toEqual(["n1", "n2"]);
  });
});

describe("colocatedGroupId", () => {
  it("is stable regardless of input order (sorted ids)", () => {
    const a = colocatedGroupId([game("z", 0, 0), game("a", 0, 0), game("m", 0, 0)]);
    const b = colocatedGroupId([game("a", 0, 0), game("m", 0, 0), game("z", 0, 0)]);
    expect(a).toBe(b);
    expect(a).toBe("coloc-a-m-z");
  });

  it("prefixes with coloc-", () => {
    expect(colocatedGroupId([game("x", 0, 0)])).toBe("coloc-x");
  });
});
