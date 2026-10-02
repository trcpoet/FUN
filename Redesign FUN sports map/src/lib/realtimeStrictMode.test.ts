import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * StrictMode mounts every effect, unmounts it, then mounts it again. For the
 * realtime layer that means subscribe → unsubscribe → subscribe on every chat
 * thread you open, in development.
 *
 * Two properties have to hold or that sequence breaks the chat:
 *
 *  1. Each build mints a **unique channel topic**. Supabase Realtime rejects a
 *     second subscribe to a topic it already holds, so a fixed topic would make
 *     the remount throw — and the thread would silently stop receiving messages.
 *  2. Disposing **removes the channel**, so the first mount's subscription does
 *     not linger and deliver every message twice.
 *
 * These are asserted here rather than left to a code read, because both are the
 * kind of property a later refactor removes without noticing — and neither
 * failure throws anything Sentry would see.
 */

const channels: { topic: string; subscribed: boolean }[] = [];
const removed: string[] = [];

const makeChannel = (topic: string) => {
  const rec = { topic, subscribed: false };
  channels.push(rec);
  const ch: Record<string, unknown> = {
    topic,
    on: () => ch,
    subscribe: (cb?: (s: string) => void) => {
      rec.subscribed = true;
      cb?.("SUBSCRIBED");
      return ch;
    },
  };
  return ch;
};

vi.mock("./supabase", () => ({
  supabase: {
    channel: (topic: string) => makeChannel(topic),
    removeChannel: (ch: { topic: string }) => {
      removed.push(ch.topic);
      return Promise.resolve("ok");
    },
  },
}));

beforeEach(() => {
  channels.length = 0;
  removed.length = 0;
});

describe("realtime subscriptions survive a StrictMode remount", () => {
  it("gives every game-thread subscription its own topic", async () => {
    const { subscribeGameMessages } = await import("./gameChat");
    // The StrictMode sequence, on the same game.
    const first = subscribeGameMessages("game-1", () => {});
    first();
    const second = subscribeGameMessages("game-1", () => {});

    expect(channels).toHaveLength(2);
    expect(channels[0].topic).not.toBe(channels[1].topic);
    expect(channels[0].topic.startsWith("game-messages:game-1-")).toBe(true);
    expect(channels[1].topic.startsWith("game-messages:game-1-")).toBe(true);
    second();
  });

  it("removes the first channel when the first mount is torn down", async () => {
    const { subscribeGameMessages } = await import("./gameChat");
    const stop = subscribeGameMessages("game-1", () => {});
    const topic = channels[0].topic;
    stop();
    expect(removed).toContain(topic);
  });

  it("leaves nothing subscribed once every mount is disposed", async () => {
    const { subscribeGameMessages } = await import("./gameChat");
    const a = subscribeGameMessages("game-1", () => {});
    a();
    const b = subscribeGameMessages("game-1", () => {});
    b();
    expect(removed).toHaveLength(channels.length);
    for (const c of channels) expect(removed).toContain(c.topic);
  });

  it("holds for DM threads too", async () => {
    const { subscribeDmMessages } = await import("./dmChat");
    const one = subscribeDmMessages({ threadId: "t-1", onInsert: () => {} });
    one.unsubscribe();
    const two = subscribeDmMessages({ threadId: "t-1", onInsert: () => {} });
    expect(channels[0].topic).not.toBe(channels[1].topic);
    two.unsubscribe();
    expect(removed).toHaveLength(2);
  });

  it("holds for the read-receipt channel", async () => {
    const { subscribeThreadReads } = await import("./chatReads");
    const one = subscribeThreadReads("thread-1", () => {});
    one();
    const two = subscribeThreadReads("thread-1", () => {});
    expect(channels[0].topic).not.toBe(channels[1].topic);
    two();
    expect(removed).toHaveLength(2);
  });

  it("detaches its window listeners on dispose, so remounts do not stack them", async () => {
    const added: string[] = [];
    const removedL: string[] = [];
    const addSpy = vi.spyOn(window, "addEventListener").mockImplementation(((t: string) => {
      added.push(t);
    }) as never);
    const remSpy = vi.spyOn(window, "removeEventListener").mockImplementation(((t: string) => {
      removedL.push(t);
    }) as never);
    try {
      const { subscribeGameMessages } = await import("./gameChat");
      const stop = subscribeGameMessages("game-1", () => {});
      expect(added).toContain("online");
      stop();
      expect(removedL).toContain("online");
    } finally {
      addSpy.mockRestore();
      remSpy.mockRestore();
    }
  });
});
