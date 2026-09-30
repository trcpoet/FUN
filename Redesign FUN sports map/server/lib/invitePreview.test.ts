import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyPreview,
  escapeAttr,
  INVITE_TOKEN_RE,
  isOver,
  previewMeta,
  setMeta,
  spotsLabel,
  whenLabel,
  type InvitePreview,
} from "./invitePreview";

const NOW = new Date("2026-10-01T18:00:00Z");

function game(o: Partial<InvitePreview> = {}): InvitePreview {
  return {
    title: "Tuesday hoops",
    sport: "basketball",
    starts_at: "2026-10-04T23:00:00Z",
    ends_at: "2026-10-05T01:00:00Z",
    status: "open",
    visibility: "invite_only",
    spots_needed: 10,
    participant_count: 7,
    spots_remaining: 3,
    location_label: "Elzie Odom, Arlington",
    ...o,
  };
}

describe("INVITE_TOKEN_RE", () => {
  it("accepts a v4 uuid and rejects anything else", () => {
    expect(INVITE_TOKEN_RE.test("e253a8ef-b6f2-4321-b7f7-b72b5003dd12")).toBe(true);
    for (const bad of ["", "abc", "../../etc/passwd", "e253a8ef", "<script>", "1 OR 1=1"]) {
      expect(INVITE_TOKEN_RE.test(bad)).toBe(false);
    }
  });
});

describe("escapeAttr", () => {
  it("neutralises a title that would break out of the attribute", () => {
    const out = escapeAttr(`" onload="alert(1)`);
    expect(out).not.toContain('"');
    expect(out).toBe("&quot; onload=&quot;alert(1)");
  });

  it("escapes the full set", () => {
    expect(escapeAttr(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes the ampersand first, so nothing is double-escaped", () => {
    expect(escapeAttr("&lt;")).toBe("&amp;lt;");
  });
});

describe("whenLabel", () => {
  it("says Today and Tomorrow before falling back to a date", () => {
    expect(whenLabel("2026-10-01T23:00:00Z", NOW)).toBe("Today");
    expect(whenLabel("2026-10-02T23:00:00Z", NOW)).toBe("Tomorrow");
    expect(whenLabel("2026-10-04T23:00:00Z", NOW)).toBe("Sun, Oct 4");
  });

  it("returns nothing for a missing or unparseable time", () => {
    expect(whenLabel(null, NOW)).toBeNull();
    expect(whenLabel("not a date", NOW)).toBeNull();
  });

  it("never prints a clock time — it has no timezone to print it in", () => {
    const label = whenLabel("2026-10-04T23:00:00Z", NOW) ?? "";
    expect(label).not.toMatch(/\d{1,2}:\d{2}/);
    expect(label).not.toMatch(/AM|PM/i);
  });
});

describe("spotsLabel", () => {
  it("counts down, singularises, and says Full at zero", () => {
    expect(spotsLabel(game({ spots_remaining: 3 }))).toBe("3 spots left");
    expect(spotsLabel(game({ spots_remaining: 1 }))).toBe("1 spot left");
    expect(spotsLabel(game({ spots_remaining: 0 }))).toBe("Full");
  });

  it("stays quiet when the game has no roster size", () => {
    expect(spotsLabel(game({ spots_needed: 0, spots_remaining: 0 }))).toBeNull();
    expect(spotsLabel(game({ spots_remaining: null }))).toBeNull();
  });
});

describe("isOver", () => {
  it("is true for completed, cancelled, or an end time in the past", () => {
    expect(isOver(game({ status: "completed" }), NOW)).toBe(true);
    expect(isOver(game({ status: "cancelled" }), NOW)).toBe(true);
    expect(isOver(game({ ends_at: "2026-09-30T00:00:00Z" }), NOW)).toBe(true);
  });

  it("is false for a game still ahead", () => {
    expect(isOver(game(), NOW)).toBe(false);
  });

  it("does not call an untimed game over", () => {
    expect(isOver(game({ ends_at: null, status: "open" }), NOW)).toBe(false);
  });
});

describe("previewMeta", () => {
  it("says what, where, when and how many", () => {
    const { title, description } = previewMeta(game(), NOW);
    expect(title).toBe("Tuesday hoops · FUN");
    expect(description).toBe("Basketball · Sun, Oct 4 · Elzie Odom, Arlington · 3 spots left");
  });

  it("never names anyone — the shape carries no identity field at all", () => {
    const { title, description } = previewMeta(game(), NOW);
    const text = `${title} ${description}`.toLowerCase();
    for (const f of ["host", "created_by", "organiser", "organizer"]) {
      expect(text).not.toContain(f);
    }
  });

  it("falls back to the sport when the game has no title", () => {
    expect(previewMeta(game({ title: null }), NOW).title).toBe("Basketball · FUN");
  });

  it("drops parts it does not have rather than printing blanks", () => {
    const { description } = previewMeta(
      game({ location_label: null, starts_at: null, spots_needed: 0, spots_remaining: 0 }),
      NOW,
    );
    expect(description).toBe("Basketball");
    expect(description).not.toContain("·");
  });

  it("has something to say even about an empty game", () => {
    const { description } = previewMeta(
      game({ sport: null, title: null, location_label: null, starts_at: null, spots_needed: 0, spots_remaining: 0 }),
      NOW,
    );
    expect(description).toBe("Pickup game");
  });

  it("does not advertise a game that is over", () => {
    const { title, description } = previewMeta(game({ status: "completed" }), NOW);
    expect(title).toContain("has ended");
    expect(description).not.toContain("spots left");
  });
});

describe("setMeta", () => {
  it("leaves the html alone when the tag is absent", () => {
    const html = "<head></head>";
    expect(setMeta(html, "property", "og:title", "x")).toBe(html);
  });

  it("does not confuse og:title with og:title:alt", () => {
    const html = `<meta property="og:title:alt" content="alt" /><meta property="og:title" content="real" />`;
    const out = setMeta(html, "property", "og:title", "NEW");
    expect(out).toContain(`property="og:title" content="NEW"`);
    expect(out).toContain(`content="alt"`);
  });
});

describe("applyPreview against the real index.html", () => {
  // The shipped file, not a fixture — if someone rewrites the head and the
  // regexes stop matching, this fails instead of the card silently going generic.
  const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

  it("rewrites the title and every share tag", () => {
    const out = applyPreview(html, game(), "https://fun.example/g/abc", NOW);
    expect(out).toContain("<title>Tuesday hoops · FUN</title>");
    expect(out).toMatch(/property="og:title" content="Tuesday hoops · FUN"/);
    expect(out).toMatch(/property="og:url" content="https:\/\/fun\.example\/g\/abc"/);
    expect(out).toMatch(/name="twitter:title" content="Tuesday hoops · FUN"/);
    expect(out).toContain("Elzie Odom, Arlington · 3 spots left");
  });

  it("replaces the generic copy rather than leaving it behind", () => {
    const out = applyPreview(html, game(), "https://fun.example/g/abc", NOW);
    expect(html).toContain("FUN — find a game tonight");
    expect(out).not.toContain("FUN — find a game tonight");
  });

  it("keeps the rest of the document intact", () => {
    const out = applyPreview(html, game(), "https://fun.example/g/abc", NOW);
    expect(out).toContain('<div id="root">');
    // The pre-hydration loader inside #root must survive untouched.
    expect(out).toContain("fun-orbit-loader");
    expect(out).toContain('<script type="module" src="/src/main.tsx">');
    expect(out).toContain('property="og:image"');
    expect(out).toContain('name="viewport"');
  });

  it("cannot be broken out of by a hostile game title", () => {
    const evil = game({ title: `" onload="alert(1)`, location_label: `<img src=x onerror=alert(2)>` });
    const out = applyPreview(html, evil, "https://fun.example/g/abc", NOW);
    expect(out).not.toContain('onload="alert(1)');
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&quot; onload=&quot;alert(1)");
  });
});
