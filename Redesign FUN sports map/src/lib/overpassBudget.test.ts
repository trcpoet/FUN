import { describe, it, expect } from "vitest";
import {
  attemptBudgetMs,
  MIN_ATTEMPT_MS,
  REQUEST_BUDGET_MS,
  UPSTREAM_TIMEOUT_MS,
} from "../../server/lib/overpassBudget";

/** The route's mirror list length. Four is the number the budget has to stretch across. */
const MIRRORS = 4;

/** Walk the whole mirror list, spending each attempt in full, as a hung mirror would. */
function simulateAllHanging(budget = REQUEST_BUDGET_MS): number[] {
  const attempts: number[] = [];
  let remaining = budget;
  for (let i = 0; i < MIRRORS; i++) {
    const ms = attemptBudgetMs(remaining, MIRRORS - i);
    if (ms === 0) break;
    attempts.push(ms);
    remaining -= ms;
  }
  return attempts;
}

describe("attemptBudgetMs", () => {
  it("gives the first mirror its full generous window", () => {
    // Splitting the budget evenly would cap this at 5.5s and abort a healthy-but-slow mirror.
    expect(attemptBudgetMs(REQUEST_BUDGET_MS, MIRRORS)).toBe(UPSTREAM_TIMEOUT_MS);
  });

  it("reaches every mirror when they all hang — the actual bug", () => {
    // Before: a flat 8s cap meant 8+8 = 16s of a 22s budget, leaving 6s. Mirror 3 got a
    // truncated try and mirror 4 never ran, so half the mirror list was dead weight in exactly
    // the case it exists for.
    const attempts = simulateAllHanging();
    expect(attempts).toHaveLength(MIRRORS);
    for (const ms of attempts) expect(ms).toBeGreaterThanOrEqual(MIN_ATTEMPT_MS);
  });

  it("never overspends the budget", () => {
    const total = simulateAllHanging().reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(REQUEST_BUDGET_MS);
  });

  it("never exceeds the per-attempt ceiling", () => {
    for (const ms of simulateAllHanging()) expect(ms).toBeLessThanOrEqual(UPSTREAM_TIMEOUT_MS);
  });

  it("lets the last mirror use everything left", () => {
    expect(attemptBudgetMs(6_000, 1)).toBe(6_000);
    expect(attemptBudgetMs(30_000, 1)).toBe(UPSTREAM_TIMEOUT_MS);
  });

  it("returns 0 rather than starting an attempt it would have to abort", () => {
    expect(attemptBudgetMs(MIN_ATTEMPT_MS - 1, 1)).toBe(0);
    expect(attemptBudgetMs(0, MIRRORS)).toBe(0);
    expect(attemptBudgetMs(-5, MIRRORS)).toBe(0);
    expect(attemptBudgetMs(REQUEST_BUDGET_MS, 0)).toBe(0);
  });

  it("still reserves a real attempt for the tail when the budget is already half spent", () => {
    // Two mirrors already burned 16s of a 22s budget under the old flat timeout.
    const attempts: number[] = [];
    let remaining = REQUEST_BUDGET_MS - 16_000;
    for (let i = 2; i < MIRRORS; i++) {
      const ms = attemptBudgetMs(remaining, MIRRORS - i);
      if (ms === 0) break;
      attempts.push(ms);
      remaining -= ms;
    }
    // 6s left across two mirrors is not enough for two viable attempts, so it spends it on one
    // real try rather than two doomed ones.
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    for (const ms of attempts) expect(ms).toBeGreaterThanOrEqual(MIN_ATTEMPT_MS);
  });
});
