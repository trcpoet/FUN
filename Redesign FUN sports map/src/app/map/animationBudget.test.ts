import { describe, it, expect, vi } from "vitest";
import {
  quantize,
  steppedRgb,
  makeTicker,
  StyleWriteCache,
  EPS,
  PULSE_TICK_MS,
  type StyleWritable,
} from "./animationBudget";

/**
 * These pin the two contracts the map's 28s-TBT fix rests on, both of which
 * regress silently — a broken ticker just makes the pulse run at the wrong
 * speed, and a broken write-cache just makes the map slow again. Neither
 * throws, and nothing else in the suite touches the rAF loops.
 */

function fakeMap() {
  const paint = vi.fn();
  const layout = vi.fn();
  const map: StyleWritable = {
    setPaintProperty: (...a: unknown[]) => paint(...a),
    setLayoutProperty: (...a: unknown[]) => layout(...a),
  };
  return { map, paint, layout };
}

describe("quantize", () => {
  it("snaps to the nearest multiple of the step", () => {
    expect(quantize(1.2, 0.5)).toBe(1);
    expect(quantize(1.3, 0.5)).toBe(1.5);
    expect(quantize(-1.3, 0.5)).toBe(-1.5);
  });

  it("collapses adjacent sine samples onto one value — the whole point", () => {
    // A +-5 deg wobble over 5200ms, sampled at 60fps. Quantizing to 0.5 deg
    // must leave far fewer DISTINCT values than samples, because each distinct
    // value is one full SRC_GAMES tile reload inside mapbox.
    const samples: number[] = [];
    for (let t = 0; t < 5200; t += 1000 / 60) {
      samples.push(quantize(Math.sin((t / 5200) * Math.PI * 2) * 5, EPS.rotateDeg));
    }
    let changes = 0;
    for (let i = 1; i < samples.length; i++) if (samples[i] !== samples[i - 1]) changes++;
    expect(samples.length).toBeGreaterThan(300); // ~312 raw frames per cycle
    expect(changes).toBeLessThan(45); // ~40 transitions; >85% of writes skipped
  });

  it("passes through a non-positive step or a non-finite value untouched", () => {
    expect(quantize(1.234, 0)).toBe(1.234);
    expect(quantize(1.234, -1)).toBe(1.234);
    expect(quantize(Number.NaN, 0.5)).toBeNaN();
  });
});

describe("steppedRgb", () => {
  it("returns integer channels clamped to 0-255", () => {
    expect(steppedRgb({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0)).toBe("rgb(0,0,0)");
    // t=1 lands on 255, which the default step of 2 rounds up to 256 — the
    // clamp is what keeps that a legal colour.
    expect(steppedRgb({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 1)).toBe(
      "rgb(255,255,255)"
    );
  });

  it("never emits a channel outside 0-255 even when the step overshoots", () => {
    const out = steppedRgb({ r: 250, g: 250, b: 250 }, { r: 255, g: 255, b: 255 }, 1, 4);
    const nums = out.match(/\d+/g)!.map(Number);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(255);
    }
  });

  it("collapses small gradient movements onto the same string", () => {
    const a = { r: 8, g: 145, b: 178 };
    const b = { r: 56, g: 189, b: 248 };
    expect(steppedRgb(a, b, 0.5)).toBe(steppedRgb(a, b, 0.505));
  });
});

describe("makeTicker", () => {
  it("returns ACCUMULATED elapsed time, not the per-frame delta", () => {
    // The regression this guards: integrating the per-frame delta while only
    // ticking every Nth frame runs the animation at 1/N speed.
    const tick = makeTicker(50);
    expect(tick(0)).toBe(50); // first call primes and lets motion start at once
    expect(tick(16)).toBe(0);
    expect(tick(32)).toBe(0);
    expect(tick(64)).toBe(64); // 16+16+32 accumulated since the prime
  });

  it("skips frames until the budget is due", () => {
    const tick = makeTicker(100);
    tick(0);
    let fired = 0;
    for (let t = 16; t <= 480; t += 16) if (tick(t) > 0) fired++;
    // 480ms of 16ms frames at a 100ms budget: ~4-5 ticks, not 30.
    expect(fired).toBeGreaterThanOrEqual(4);
    expect(fired).toBeLessThanOrEqual(5);
  });

  it("clamps a huge delta so returning from a background tab does not jump a cycle", () => {
    const tick = makeTicker(PULSE_TICK_MS);
    tick(0);
    expect(tick(60_000)).toBeLessThanOrEqual(PULSE_TICK_MS * 4);
  });

  it("preserves total elapsed time across skipped frames", () => {
    const tick = makeTicker(50);
    tick(0);
    let total = 0;
    for (let t = 10; t <= 1000; t += 10) total += tick(t);
    // Every ms between the prime and the last due tick is accounted for.
    expect(total).toBeGreaterThan(900);
    expect(total).toBeLessThanOrEqual(1000);
  });
});

describe("StyleWriteCache", () => {
  it("writes once and then skips an unchanged scalar", () => {
    const { map, paint } = fakeMap();
    const c = new StyleWriteCache();
    expect(c.writeScalar(map, "L", "circle-radius", 9)).toBe(true);
    expect(c.writeScalar(map, "L", "circle-radius", 9)).toBe(false);
    expect(c.writeScalar(map, "L", "circle-radius", 9.25)).toBe(true);
    expect(paint).toHaveBeenCalledTimes(2);
  });

  it("passes validate:false so mapbox skips its style-spec validator", () => {
    const { map, paint } = fakeMap();
    new StyleWriteCache().writeScalar(map, "L", "circle-blur", 1);
    expect(paint).toHaveBeenCalledWith("L", "circle-blur", 1, { validate: false });
  });

  it("routes layout writes to setLayoutProperty, not setPaintProperty", () => {
    const { map, paint, layout } = fakeMap();
    new StyleWriteCache().writeScalar(map, "L", "icon-rotate", 2, "layout");
    expect(layout).toHaveBeenCalledTimes(1);
    expect(paint).not.toHaveBeenCalled();
  });

  it("does NOT invoke build() when the signature is unchanged", () => {
    // This is the actual contract of the hoisting optimisation: the expensive
    // part is allocating the ["case", ...] array, so an unchanged signature
    // must not even call the builder.
    const { map } = fakeMap();
    const c = new StyleWriteCache();
    const build = vi.fn(() => ["case", 1, 2, 3]);
    c.writeExpression(map, "L", "icon-size", "sig-a", build);
    c.writeExpression(map, "L", "icon-size", "sig-a", build);
    c.writeExpression(map, "L", "icon-size", "sig-a", build);
    expect(build).toHaveBeenCalledTimes(1);
    c.writeExpression(map, "L", "icon-size", "sig-b", build);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("keys independently per layer and per property", () => {
    const { map, paint } = fakeMap();
    const c = new StyleWriteCache();
    c.writeScalar(map, "A", "p", 1);
    c.writeScalar(map, "B", "p", 1);
    c.writeScalar(map, "A", "q", 1);
    expect(paint).toHaveBeenCalledTimes(3);
  });

  it("re-writes after reset(), so a rebuilt layer is repainted", () => {
    // Guards the staleness hazard: the cache records what WE wrote, so when
    // the layers are rebuilt underneath it the memo must be dropped or the
    // animation freezes at its resting value.
    const { map, paint } = fakeMap();
    const c = new StyleWriteCache();
    c.writeScalar(map, "L", "circle-radius", 9);
    c.writeScalar(map, "L", "circle-radius", 9);
    expect(paint).toHaveBeenCalledTimes(1);
    c.reset();
    c.writeScalar(map, "L", "circle-radius", 9);
    expect(paint).toHaveBeenCalledTimes(2);
  });

  it("does not memoise a write that threw, so the next attempt retries", () => {
    // Layers vanish mid-flight during a style swap. Believing a failed write
    // landed would leave that property stuck for the life of the cache.
    const paint = vi.fn(() => {
      throw new Error("no such layer");
    });
    const map: StyleWritable = { setPaintProperty: paint, setLayoutProperty: vi.fn() };
    const c = new StyleWriteCache();
    expect(c.writeScalar(map, "L", "circle-radius", 9)).toBe(false);
    expect(c.writeScalar(map, "L", "circle-radius", 9)).toBe(false);
    expect(paint).toHaveBeenCalledTimes(2);
  });
});
