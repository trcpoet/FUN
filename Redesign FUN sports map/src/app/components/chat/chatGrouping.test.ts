import { describe, it, expect } from "vitest";
import { buildChatList, type ChatListItem } from "./chatGrouping";
import type { ChatMessage } from "./messageTypes";

const T0 = new Date("2026-09-28T12:00:00Z").getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;

let seq = 0;
function msg(authorId: string | null, offsetMs: number, body = "hi"): ChatMessage {
  seq += 1;
  const at = T0 + offsetMs;
  return {
    id: `m${seq}`,
    threadKind: "game",
    authorId,
    body,
    createdAt: new Date(at).toISOString(),
    createdAtMs: at,
  };
}

/** A stable day bucket that does not depend on the test runner's timezone. */
const dayKeyOf = (ms: number) => String(Math.floor(ms / (24 * HOUR)));

const kinds = (items: ChatListItem[]) => items.map((i) => i.kind);
const runs = (items: ChatListItem[]) =>
  items
    .filter((i): i is Extract<ChatListItem, { kind: "message" }> => i.kind === "message")
    .map((i) => `${i.runStart ? "[" : "·"}${i.message.id}${i.runEnd ? "]" : "·"}`);

describe("buildChatList", () => {
  it("returns nothing for no messages", () => {
    expect(buildChatList([], { currentUserId: "me", dayKeyOf })).toEqual([]);
  });

  it("opens with a day separator", () => {
    const items = buildChatList([msg("a", 0)], { currentUserId: "me", dayKeyOf });
    expect(kinds(items)).toEqual(["day", "message"]);
  });

  it("groups same-author messages inside the window into one run", () => {
    const [a, b, c] = [msg("a", 0), msg("a", MIN), msg("a", 2 * MIN)];
    const items = buildChatList([a, b, c], { currentUserId: "me", dayKeyOf });
    // One run: the first bubble opens it, the last closes it, the middle neither.
    expect(runs(items)).toEqual([`[${a.id}·`, `·${b.id}·`, `·${c.id}]`]);
  });

  it("breaks the run when the author changes", () => {
    const [a, b] = [msg("a", 0), msg("b", MIN)];
    const items = buildChatList([a, b], { currentUserId: "me", dayKeyOf });
    expect(runs(items)).toEqual([`[${a.id}]`, `[${b.id}]`]);
  });

  it("breaks the run one millisecond past the window, not at the window", () => {
    const [a, b] = [msg("a", 0), msg("a", 5 * MIN)];
    expect(runs(buildChatList([a, b], { currentUserId: "me", dayKeyOf }))).toEqual([
      `[${a.id}·`,
      `·${b.id}]`,
    ]);

    const [c, d] = [msg("a", 0), msg("a", 5 * MIN + 1)];
    expect(runs(buildChatList([c, d], { currentUserId: "me", dayKeyOf }))).toEqual([
      `[${c.id}]`,
      `[${d.id}]`,
    ]);
  });

  it("marks your own messages as mine and nobody else's", () => {
    const items = buildChatList([msg("me", 0), msg("a", 10 * MIN)], {
      currentUserId: "me",
      dayKeyOf,
    });
    const mine = items
      .filter((i): i is Extract<ChatListItem, { kind: "message" }> => i.kind === "message")
      .map((i) => i.mine);
    expect(mine).toEqual([true, false]);
  });

  it("treats nobody as mine when signed out", () => {
    const items = buildChatList([msg(null, 0)], { currentUserId: null, dayKeyOf });
    const first = items.find((i) => i.kind === "message");
    expect(first && first.kind === "message" && first.mine).toBe(false);
  });

  it("marks a silence longer than an hour with one gap", () => {
    const items = buildChatList([msg("a", 0), msg("a", HOUR + MIN)], {
      currentUserId: "me",
      dayKeyOf,
    });
    expect(kinds(items)).toEqual(["day", "message", "gap", "message"]);
  });

  it("does not mark a silence of exactly an hour", () => {
    const items = buildChatList([msg("a", 0), msg("a", HOUR)], {
      currentUserId: "me",
      dayKeyOf,
    });
    expect(kinds(items)).toEqual(["day", "message", "message"]);
  });

  it("prints a day separator instead of a gap when the day also changed", () => {
    const items = buildChatList([msg("a", 0), msg("a", 30 * HOUR)], {
      currentUserId: "me",
      dayKeyOf,
    });
    // One separator for one silence — never both.
    expect(kinds(items)).toEqual(["day", "message", "day", "message"]);
  });

  it("gives four consecutive stranger messages one veil, not four", () => {
    const stranger = ["s", "s", "s", "s"].map((a, i) => msg(a, i * MIN));
    const items = buildChatList(stranger, {
      currentUserId: "me",
      isVeiled: (m) => m.authorId === "s",
      dayKeyOf,
    });
    expect(kinds(items)).toEqual(["day", "veiledRun"]);
    const veil = items.find((i) => i.kind === "veiledRun");
    expect(veil && veil.kind === "veiledRun" && veil.messages).toHaveLength(4);
  });

  it("starts a second veil when a different stranger interjects", () => {
    const items = buildChatList([msg("s1", 0), msg("s2", MIN), msg("s1", 2 * MIN)], {
      currentUserId: "me",
      isVeiled: () => true,
      dayKeyOf,
    });
    expect(kinds(items)).toEqual(["day", "veiledRun", "veiledRun", "veiledRun"]);
  });

  it("pulls a revealed message out of the veil and back into the list", () => {
    const a = msg("s", 0);
    const b = msg("s", MIN);
    const c = msg("s", 2 * MIN);
    const items = buildChatList([a, b, c], {
      currentUserId: "me",
      isVeiled: () => true,
      revealedIds: new Set([b.id]),
      dayKeyOf,
    });
    expect(kinds(items)).toEqual(["day", "veiledRun", "message", "veiledRun"]);
  });

  it("never veils your own messages, whatever the predicate says", () => {
    const items = buildChatList([msg("me", 0)], {
      currentUserId: "me",
      isVeiled: () => true,
      dayKeyOf,
    });
    expect(kinds(items)).toEqual(["day", "message"]);
  });

  it("re-opens a run after a veil rather than continuing the old one", () => {
    const plain = msg("s", 0, "seen");
    const hidden = msg("s", MIN, "veil me");
    const after = msg("s", 2 * MIN, "seen");
    const items = buildChatList([plain, hidden, after], {
      currentUserId: "me",
      isVeiled: (m) => m.body === "veil me",
      dayKeyOf,
    });
    expect(kinds(items)).toEqual(["day", "message", "veiledRun", "message"]);
    expect(runs(items)).toEqual([`[${plain.id}]`, `[${after.id}]`]);
  });

  it("falls back to the previous instant for an unparseable timestamp", () => {
    const good = msg("a", 0);
    const bad: ChatMessage = { ...msg("a", MIN), createdAtMs: Number.NaN };
    const items = buildChatList([good, bad], { currentUserId: "me", dayKeyOf });
    // No second day separator, no 1970 gap.
    expect(kinds(items)).toEqual(["day", "message", "message"]);
  });
});
