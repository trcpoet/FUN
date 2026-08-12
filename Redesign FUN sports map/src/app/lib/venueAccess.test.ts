import { describe, it, expect } from "vitest";
import {
  venueAccessTier,
  VENUE_ACCESS_POSTGREST_FILTERS,
  type VenueAccessInput,
  type VenueAccessTier,
} from "./venueAccess";

const tierOf = (v: VenueAccessInput): VenueAccessTier => venueAccessTier(v).tier;

describe("venueAccessTier — rule 1: explicit closed access", () => {
  it.each(["private", "no"])("hides access=%s regardless of type", (access) => {
    expect(tierOf({ access, leisure: "pitch", name: "Memorial Field" })).toBe("hidden");
  });

  it("hides a closed venue even when it is named and would otherwise be open", () => {
    const v = venueAccessTier({ access: "private", leisure: "park", name: "Riverside Park" });
    expect(v.canRender).toBe(false);
    expect(v.canCreateGame).toBe(false);
    expect(v.advisory).toBe("Private venue");
  });
});

describe("venueAccessTier — rule 2: unnamed pools are presumed residential", () => {
  it("hides an unnamed pool with no access tag", () => {
    // The dominant case: 22,619 rows in production.
    expect(tierOf({ leisure: "swimming_pool", name: null })).toBe("hidden");
  });

  it("hides an unnamed pool with an unrecognised access value", () => {
    expect(tierOf({ access: "designated", leisure: "swimming_pool", name: null })).toBe("hidden");
  });

  it("KEEPS a named pool with no access tag", () => {
    // 264 production rows are named pools — municipal pools essentially always carry a name,
    // and hiding them would be the most visible false positive this module can produce.
    expect(tierOf({ leisure: "swimming_pool", name: "Cleburne Municipal Pool" })).toBe("open");
  });

  it("KEEPS an unnamed pool that claims public access", () => {
    expect(tierOf({ access: "yes", leisure: "swimming_pool", name: null })).toBe("open");
  });

  it("routes an unnamed members-only pool to restricted, not hidden", () => {
    // A club pool. It claims conditional access, so the residential inference must not fire.
    expect(tierOf({ access: "customers", leisure: "swimming_pool", name: null })).toBe("restricted");
  });

  it("does NOT apply the unnamed inference to pitches", () => {
    // 30,437 of 31,611 pitches are unnamed. Inferring residential here would delete the map.
    expect(tierOf({ leisure: "pitch", name: null })).toBe("open");
  });

  it.each(["park", "sports_centre", "track", "recreation_ground"])(
    "does NOT apply the unnamed inference to leisure=%s",
    (leisure) => {
      expect(tierOf({ leisure, name: null })).toBe("open");
    }
  );
});

describe("venueAccessTier — rule 3: conditional access", () => {
  it.each(["customers", "members", "membership", "permit"])(
    "marks access=%s restricted",
    (access) => {
      const v = venueAccessTier({ access, leisure: "fitness_centre", name: "City Gym" });
      expect(v.tier).toBe("restricted");
      expect(v.canRender).toBe(true);
      // Informs without blocking — the host sorts out entry.
      expect(v.canCreateGame).toBe(true);
      expect(v.advisory).toBe("Permission may be required");
    }
  );
});

describe("venueAccessTier — rule 4: default open", () => {
  it.each(["yes", "public", "permissive"])("treats access=%s as open", (access) => {
    expect(tierOf({ access, leisure: "pitch", name: null })).toBe("open");
  });

  it("defaults an unrecognised access value on a non-pool to open", () => {
    // Hiding real pitches over tag noise is the worse failure.
    expect(tierOf({ access: "seasonal", leisure: "pitch", name: null })).toBe("open");
  });

  it("handles a venue with no tags at all", () => {
    const v = venueAccessTier({});
    expect(v.tier).toBe("open");
    expect(v.canRender).toBe(true);
    expect(v.advisory).toBeNull();
  });
});

describe("venueAccessTier — null and blank handling", () => {
  // The bug this module exists to contain: `access` is null on 38,867 of 85,388 production rows.
  // Treating null as false-y in a boolean chain made a live count return 2,272 kept instead of
  // 41,139.
  it("treats null, undefined and blank access identically", () => {
    const expected = tierOf({ access: "", leisure: "pitch", name: null });
    expect(tierOf({ access: null, leisure: "pitch", name: null })).toBe(expected);
    expect(tierOf({ access: undefined, leisure: "pitch", name: null })).toBe(expected);
    expect(tierOf({ leisure: "pitch", name: null })).toBe(expected);
  });

  it("treats a whitespace-only name as unnamed", () => {
    expect(tierOf({ leisure: "swimming_pool", name: "   " })).toBe("hidden");
  });

  it("tolerates case and surrounding whitespace in tag values", () => {
    expect(tierOf({ access: "  PRIVATE ", leisure: "pitch", name: "X" })).toBe("hidden");
    expect(tierOf({ access: "Customers", leisure: "pitch", name: "X" })).toBe("restricted");
    expect(tierOf({ leisure: " Swimming_Pool ", name: null })).toBe("hidden");
  });

  it("never returns an advisory for open venues, and always returns one otherwise", () => {
    expect(venueAccessTier({ leisure: "pitch" }).advisory).toBeNull();
    expect(venueAccessTier({ access: "private" }).advisory).not.toBeNull();
    expect(venueAccessTier({ access: "permit" }).advisory).not.toBeNull();
  });
});

describe("venueAccessTier — verdict fields stay consistent", () => {
  it("never offers game creation on a venue it will not render", () => {
    for (const v of allFixtures()) {
      const verdict = venueAccessTier(v);
      if (!verdict.canRender) expect(verdict.canCreateGame).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Parity: the PostgREST pre-filter must never hide more than the classifier.
//
// `fetchSportsVenuesFromDb` applies VENUE_ACCESS_POSTGREST_FILTERS server-side so the 8000-row
// cap is not spent on rows we are about to discard. That is an optimization; `venueAccessTier`
// is the rule. If the filter ever excluded a row the classifier would keep, venues would vanish
// with no visible cause — the exact failure mode that once made a dead pipeline report
// "no venues here".
// ---------------------------------------------------------------------------

/** Postgres three-valued result. `null` means UNKNOWN. */
type Tri = boolean | null;

/** Evaluate one PostgREST leaf predicate against a row, with Postgres NULL semantics. */
function evalLeaf(leaf: string, row: Record<string, string | null>): Tri {
  let m = /^(\w+)\.is\.null$/.exec(leaf);
  if (m) return row[m[1]!] === null;

  m = /^(\w+)\.not\.is\.null$/.exec(leaf);
  if (m) return row[m[1]!] !== null;

  m = /^(\w+)\.(not\.)?in\.\(([^)]*)\)$/.exec(leaf);
  if (m) {
    const value = row[m[1]!] ?? null;
    // `col IN (...)` and `col NOT IN (...)` are both UNKNOWN when col is NULL. This is the
    // whole reason each filter group carries an explicit `.is.null` disjunct.
    if (value === null) return null;
    const members = m[3]!.split(",").filter(Boolean);
    const hit = members.includes(value);
    return m[2] ? !hit : hit;
  }

  throw new Error(`unsupported PostgREST leaf in test evaluator: ${leaf}`);
}

/** A row passes when every `.or()` group has at least one TRUE disjunct (UNKNOWN is not TRUE). */
function passesPostgrestFilters(row: Record<string, string | null>): boolean {
  return VENUE_ACCESS_POSTGREST_FILTERS.every((group) =>
    group.split(",").reduce<string[]>((leaves, part) => {
      // Rejoin the `in.(a,b,c)` lists that the naive split above tore apart.
      const open = leaves.length > 0 ? leaves[leaves.length - 1]! : "";
      if (open.includes("(") && !open.includes(")")) leaves[leaves.length - 1] = `${open},${part}`;
      else leaves.push(part);
      return leaves;
    }, []).some((leaf) => evalLeaf(leaf, row) === true)
  );
}

const ACCESS_VALUES = [
  null,
  "yes",
  "public",
  "permissive",
  "private",
  "no",
  "customers",
  "members",
  "membership",
  "permit",
  "designated",
  "seasonal",
];
const LEISURE_VALUES = [null, "swimming_pool", "pitch", "park", "sports_centre", "fitness_centre"];
const NAME_VALUES = [null, "Memorial Field"];

function allFixtures(): VenueAccessInput[] {
  const out: VenueAccessInput[] = [];
  for (const access of ACCESS_VALUES) {
    for (const leisure of LEISURE_VALUES) {
      for (const name of NAME_VALUES) out.push({ access, leisure, name });
    }
  }
  return out;
}

describe("VENUE_ACCESS_POSTGREST_FILTERS", () => {
  it("never excludes a row the classifier would render", () => {
    const violations = allFixtures().filter(
      (v) =>
        venueAccessTier(v).canRender &&
        !passesPostgrestFilters({
          access: v.access ?? null,
          leisure: v.leisure ?? null,
          name: v.name ?? null,
        })
    );
    expect(violations).toEqual([]);
  });

  it("does the bulk of the work — excludes every row the classifier hides", () => {
    // Not a correctness requirement (the per-row guard is the backstop), but if this ever
    // regresses the 8000-row cap silently starts truncating real venues again.
    const leaks = allFixtures().filter(
      (v) =>
        !venueAccessTier(v).canRender &&
        passesPostgrestFilters({
          access: v.access ?? null,
          leisure: v.leisure ?? null,
          name: v.name ?? null,
        })
    );
    expect(leaks).toEqual([]);
  });

  it("keeps null-column rows, which is the trap these filters exist to avoid", () => {
    expect(passesPostgrestFilters({ access: null, leisure: "pitch", name: null })).toBe(true);
    expect(passesPostgrestFilters({ access: null, leisure: null, name: null })).toBe(true);
    expect(passesPostgrestFilters({ access: "yes", leisure: null, name: null })).toBe(true);
  });

  it("excludes closed and residential rows", () => {
    expect(passesPostgrestFilters({ access: "private", leisure: "pitch", name: "X" })).toBe(false);
    expect(passesPostgrestFilters({ access: null, leisure: "swimming_pool", name: null })).toBe(false);
  });
});
