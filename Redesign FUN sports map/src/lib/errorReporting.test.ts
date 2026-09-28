import { describe, it, expect, vi, beforeEach } from "vitest";

const init = vi.fn();
const captureException = vi.fn();

const DSN = "https://key@o0.ingest.sentry.io/0";

/** A fresh copy of the module each time: its queue and capture hook are module state. */
async function load() {
  vi.resetModules();
  return import("./errorReporting");
}

/** Starts reporting and lets the deferred SDK import settle, whatever readyState happens to be. */
async function start(mod: typeof import("./errorReporting")) {
  const done = mod.startErrorReporting(DSN);
  window.dispatchEvent(new Event("load"));
  await done;
}

beforeEach(() => {
  init.mockReset();
  captureException.mockReset();
  vi.doMock("./sentryClient", () => ({ init, captureException }));
});

describe("errorReporting", () => {
  it("holds errors raised before the SDK arrives and sends them once it does", async () => {
    const mod = await load();
    const early = new Error("before Sentry loaded");
    mod.reportError(early, { componentStack: "at Feed" });
    expect(captureException).not.toHaveBeenCalled();

    await start(mod);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(early, { extra: { componentStack: "at Feed" } });

    const late = new Error("after");
    mod.reportError(late);
    expect(captureException).toHaveBeenLastCalledWith(late, undefined);
  });

  it("sends the error, never who: every identity-bearing collector is off", async () => {
    const mod = await load();
    await start(mod);

    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0][0];
    expect(options.dsn).toBe(DSN);
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    });
  });

  it("caps the queue so a crash loop before load cannot grow it without bound", async () => {
    const mod = await load();
    for (let i = 0; i < 50; i++) mod.reportError(new Error(`e${i}`));

    await start(mod);

    expect(captureException).toHaveBeenCalledTimes(20);
  });

  it("carries on quietly when the SDK cannot load", async () => {
    vi.doMock("./sentryClient", () => {
      throw new Error("blocked by an extension");
    });
    const mod = await load();
    mod.reportError(new Error("lost"));

    await expect(start(mod)).resolves.toBeUndefined();
    expect(captureException).not.toHaveBeenCalled();
  });
});
