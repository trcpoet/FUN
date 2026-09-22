/**
 * Per-frame write budgeting for the map's continuous animations.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two rAF loops in MapboxMap drive the venue halo pulse and the game-icon
 * wobble. Both wrote Mapbox style properties on every frame, forever, which
 * produced a 28,330 ms Total Blocking Time in Lighthouse (main-thread work
 * 35.0s, of which only 3.6s was script evaluation — the rest was the work
 * those writes provoked inside mapbox-gl).
 *
 * Verified against mapbox-gl 3.22.0, because the fix depends on what the
 * library actually does with a write:
 *
 *  · `setPaintProperty` / `setLayoutProperty` early-return when the new value
 *    `deepEqual`s the current one (mapbox-gl-dev.js:83447, :83496). A fresh
 *    but identical `["case", …]` array is correctly seen as unchanged. So
 *    repeated identical writes are already cheap *inside* mapbox — what they
 *    still cost us is the allocation, the GC, and a deep clone of the stored
 *    value that `getPaintProperty` performs just to run that comparison.
 *
 *  · A write that is NOT equal, on a *layout* property of a *symbol* layer,
 *    reaches `_updateLayer` (:83690) which calls
 *    `_changes.updateSourceCache(fqid, "reload")` + `sourceCache.pause()` —
 *    a full reload of every tile of that source: re-tile, re-run symbol
 *    layout on the worker, rebuild buckets, re-upload GL buffers, re-run
 *    placement. `icon-rotate` was doing this 60×/second.
 *
 * So the goal is not "less work per write", it is FEWER WRITES THAT DIFFER,
 * plus fewer allocations for the ones that don't. Two levers, in order of
 * value:
 *
 *   1. Quantization — round a value to a perceptually-invisible step, so
 *      adjacent frames produce the *same* number and mapbox's own dedupe
 *      absorbs them. This is what makes the wobble affordable.
 *   2. Throttling — integrate the animation on a fixed budget rather than
 *      every frame. This is the primary lever for the pulse, whose sine
 *      sweeps too far for quantization alone to skip most frames.
 *
 * A third, subtler payoff: TBT counts only the milliseconds *beyond 50* in
 * each long task. Breaking one contiguous 1,000 ms block of never-yielding
 * frames into short tasks with real gaps between them removes almost all of
 * its TBT contribution, even when total work falls by much less.
 *
 * Kept free of mapbox and DOM imports in its core so it stays unit-testable;
 * see animationBudget.test.ts.
 */

/** Tick budgets in ms. See the epsilon table in EPS for why these are safe. */
export const PULSE_TICK_MS = 50; // 20 Hz — the pulse's primary lever
export const WOBBLE_TICK_MS = 100; // 10 Hz worst-case cap; quantization binds first
export const TRANSIENT_TICK_MS = 42; // ~24 Hz — hover/bump eases only

/**
 * Quantization steps, chosen to be at or below the perceptual floor.
 *
 * `rotateDeg` is the load-bearing one: game icons render at ~28–36 px, so
 * half-diagonal is ~20 px and a 0.5° step moves the outermost pixel by
 * 20 × sin(0.5°) ≈ 0.17 px. Sub-pixel, on a ±5° wobble. It takes the
 * surviving write rate from 60/s to ~7.7/s — and every skipped write is a
 * skipped reload of every SRC_GAMES tile.
 *
 * `opacity` at 0.004 is ~1/255, the 8-bit compositing floor: a smaller step
 * cannot produce a different pixel.
 */
export const EPS = {
  radiusPx: 0.25,
  opacity: 0.004,
  blur: 0.01,
  strokeWidthPx: 0.05,
  rotateDeg: 0.5,
  iconSize: 0.005,
  /** Integer RGB channels; at the alphas we composite at, 2/255 is invisible. */
  colorChannel: 2,
} as const;

export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

/** Round to the nearest multiple of `step`. `step <= 0` returns `v` unchanged. */
export function quantize(v: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(v)) return v;
  return Math.round(v / step) * step;
}

/**
 * Lerp two colours and snap each channel to a multiple of `step`, so small
 * gradient movements collapse onto the same string and mapbox dedupes them.
 */
export function steppedRgb(a: Rgb, b: Rgb, t: number, step: number = EPS.colorChannel): string {
  const ch = (x: number, y: number) => {
    const raw = x + (y - x) * t;
    const snapped = step > 0 ? Math.round(raw / step) * step : Math.round(raw);
    return Math.max(0, Math.min(255, Math.round(snapped)));
  };
  return `rgb(${ch(a.r, b.r)},${ch(a.g, b.g)},${ch(a.b, b.b)})`;
}

/**
 * Fixed-budget accumulator for an rAF loop.
 *
 * Returns the elapsed ms to integrate when the budget is due, or 0 to skip
 * this frame. Callers MUST advance their animation by the returned value and
 * not by their own per-frame delta — integrating a per-frame delta while only
 * ticking every Nth frame runs the animation at 1/N speed.
 *
 * The first call returns the budget itself rather than 0, so an animation
 * starts moving immediately instead of stalling for one budget period.
 */
export function makeTicker(budgetMs: number): (nowMs: number) => number {
  let last: number | null = null;
  let acc = 0;
  return (nowMs: number): number => {
    if (last == null) {
      last = nowMs;
      return budgetMs;
    }
    const dt = nowMs - last;
    last = nowMs;
    // Clamp pathological deltas (tab was backgrounded, breakpoint hit) so the
    // animation resumes smoothly instead of jumping a whole cycle.
    acc += Math.max(0, Math.min(dt, budgetMs * 4));
    if (acc < budgetMs) return 0;
    const elapsed = acc;
    acc = 0;
    return elapsed;
  };
}

/** Mapbox surface this cache needs. Narrowed so tests can pass a fake. */
export type StyleWritable = {
  setPaintProperty(layerId: string, name: string, value: unknown, options?: unknown): unknown;
  setLayoutProperty(layerId: string, name: string, value: unknown, options?: unknown): unknown;
};

/** Skips mapbox's own validator on every hot-path write. */
const NO_VALIDATE = { validate: false } as const;

/**
 * Remembers the last value we wrote per (layer, property) so we can skip the
 * call entirely — avoiding both the argument allocation and the deep clone
 * `getPaintProperty` performs inside mapbox's dedupe check.
 *
 * IMPORTANT — staleness: this records what *we* wrote, not what the layer
 * currently holds. A basemap style swap or a layer rebuild resets the layer to
 * its declared values while this cache still claims otherwise, which would
 * freeze an animation at its resting value. Owners must therefore scope a
 * cache to the lifetime of the layers it writes to (construct it inside the
 * effect, and include the style/layer epoch in that effect's deps) rather
 * than holding one in a long-lived ref.
 */
export class StyleWriteCache {
  private readonly scalars = new Map<string, number | string>();
  private readonly signatures = new Map<string, string>();

  /** Write a scalar/string property if it differs from the last one written. */
  writeScalar(
    map: StyleWritable,
    layerId: string,
    prop: string,
    value: number | string,
    kind: "paint" | "layout" = "paint"
  ): boolean {
    const key = `${layerId}|${prop}`;
    if (this.scalars.get(key) === value) return false;
    this.scalars.set(key, value);
    try {
      if (kind === "layout") map.setLayoutProperty(layerId, prop, value, NO_VALIDATE);
      else map.setPaintProperty(layerId, prop, value, NO_VALIDATE);
    } catch {
      // Layer can vanish mid-flight during a style swap; drop the memo so the
      // next attempt re-writes rather than believing this one landed.
      this.scalars.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Write an expression only when `signature` changes. `build` is NOT called
   * when the signature is unchanged — that is the entire point, since these
   * expressions are rebuilt array literals and the allocation is the cost.
   */
  writeExpression(
    map: StyleWritable,
    layerId: string,
    prop: string,
    signature: string,
    build: () => unknown,
    kind: "paint" | "layout" = "paint"
  ): boolean {
    const key = `${layerId}|${prop}`;
    if (this.signatures.get(key) === signature) return false;
    this.signatures.set(key, signature);
    try {
      const value = build();
      if (kind === "layout") map.setLayoutProperty(layerId, prop, value, NO_VALIDATE);
      else map.setPaintProperty(layerId, prop, value, NO_VALIDATE);
    } catch {
      this.signatures.delete(key);
      return false;
    }
    return true;
  }

  /** Forget everything — call when the layers this wrote to were rebuilt. */
  reset(): void {
    this.scalars.clear();
    this.signatures.clear();
  }
}
