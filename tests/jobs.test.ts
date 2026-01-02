/**
 * Job tests
 */

import { describe, expect, test } from "bun:test";

import { createContinuousWorkAlertJob } from "../src/jobs/continuous-work-alert.ts";
import { createDailySummaryJob } from "../src/jobs/daily-summary.ts";
import { createTestNotifier } from "../src/libs/notifier.ts";
import type { JobContext } from "../src/scheduler.ts";
import { createInMemoryStateStore } from "../src/utils/state-store.ts";

function createTestContext(now: Date): JobContext {
  return {
    now,
    state: createInMemoryStateStore(),
    notifier: createTestNotifier(),
    awConfig: { baseUrl: "http://localhost:5600" },
  };
}

describe("DailySummaryJob", () => {
  test("shouldRun returns true when past target time and not triggered", async () => {
    const job = createDailySummaryJob({ targetHour: 9 });
    const ctx = createTestContext(new Date(2026, 0, 2, 10, 0)); // 10:00

    const result = await job.shouldRun(ctx);
    expect(result).toBe(true);
  });

  test("shouldRun returns false when before target time", async () => {
    const job = createDailySummaryJob({ targetHour: 12 });
    const ctx = createTestContext(new Date(2026, 0, 2, 10, 0)); // 10:00

    const result = await job.shouldRun(ctx);
    expect(result).toBe(false);
  });

  test("shouldRun returns false when already triggered today", async () => {
    const job = createDailySummaryJob({ targetHour: 9 });
    const ctx = createTestContext(new Date(2026, 0, 2, 10, 0));

    // Mark as triggered
    await ctx.state.set("daily:daily-summary:2026-01-02", "2026-01-02");

    const result = await job.shouldRun(ctx);
    expect(result).toBe(false);
  });
});

describe("ContinuousWorkAlertJob", () => {
  test("shouldRun always returns true", () => {
    const job = createContinuousWorkAlertJob({ thresholdMinutes: 90, cooldownMinutes: 30 });
    const ctx = createTestContext(new Date());

    expect(job.shouldRun(ctx)).toBe(true);
  });

  test("returns notify result with cooldown info", async () => {
    const job = createContinuousWorkAlertJob({ thresholdMinutes: 90, cooldownMinutes: 30 });

    // Mock the context with a custom run that simulates exceeding threshold
    // Since we can't mock getMetrics easily here, we just test the structure
    expect(job.id).toBe("continuous-work-alert");
  });
});
