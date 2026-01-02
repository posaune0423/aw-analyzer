/**
 * Scheduler tests
 */

import { describe, expect, test } from "bun:test";

import { createTestNotifier } from "../src/libs/notifier.ts";
import { runTick, type Job, type JobContext, type JobResult } from "../src/scheduler.ts";
import { createInMemoryStateStore } from "../src/utils/state-store.ts";

function createTestContext(now: Date = new Date("2026-01-02T10:00:00Z")): JobContext & {
  notifier: ReturnType<typeof createTestNotifier>;
  state: ReturnType<typeof createInMemoryStateStore>;
} {
  const state = createInMemoryStateStore();
  const notifier = createTestNotifier();

  return {
    now,
    state,
    notifier,
    awConfig: { baseUrl: "http://localhost:5600" },
  };
}

function createJob(id: string, shouldRun: boolean, result: JobResult): Job {
  return { id, shouldRun: () => shouldRun, run: async () => result };
}

describe("runTick", () => {
  test("executes jobs in order", async () => {
    const ctx = createTestContext();
    const order: string[] = [];

    const jobs: Job[] = [
      {
        id: "a",
        shouldRun: () => true,
        run: async () => {
          order.push("a");
          return { type: "no_notify", reason: "test" };
        },
      },
      {
        id: "b",
        shouldRun: () => true,
        run: async () => {
          order.push("b");
          return { type: "no_notify", reason: "test" };
        },
      },
    ];

    await runTick(ctx, jobs);
    expect(order).toEqual(["a", "b"]);
  });

  test("skips jobs where shouldRun returns false", async () => {
    const ctx = createTestContext();

    const jobs = [
      createJob("run", true, { type: "notify", title: "T", body: "B" }),
      createJob("skip", false, { type: "notify", title: "T", body: "B" }),
    ];

    const result = await runTick(ctx, jobs);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.executedJobs).toContain("run");
      expect(result.value.skippedJobs).toContain("skip");
    }
  });

  test("sends notification when job returns notify result", async () => {
    const ctx = createTestContext();

    const jobs = [createJob("notify", true, { type: "notify", title: "Title", body: "Body" })];
    await runTick(ctx, jobs);

    const notifications = ctx.notifier.getNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.title).toBe("Title");
  });

  test("respects cooldown and blocks repeated notifications", async () => {
    const now = new Date("2026-01-02T10:00:00Z");
    const ctx = createTestContext(now);

    // Set recent cooldown
    await ctx.state.setTime("cooldown:job", now.getTime() - 5 * 60 * 1000);

    const jobs = [
      createJob("job", true, {
        type: "notify",
        title: "T",
        body: "B",
        cooldownKey: "cooldown:job",
        cooldownMs: 60 * 60 * 1000,
      }),
    ];

    await runTick(ctx, jobs);

    expect(ctx.notifier.getNotifications()).toHaveLength(0);
  });

  test("allows notification when cooldown expired", async () => {
    const now = new Date("2026-01-02T10:00:00Z");
    const ctx = createTestContext(now);

    // Set old cooldown (2 hours ago)
    await ctx.state.setTime("cooldown:job", now.getTime() - 2 * 60 * 60 * 1000);

    const jobs = [
      createJob("job", true, {
        type: "notify",
        title: "T",
        body: "B",
        cooldownKey: "cooldown:job",
        cooldownMs: 60 * 60 * 1000,
      }),
    ];

    await runTick(ctx, jobs);

    expect(ctx.notifier.getNotifications()).toHaveLength(1);
  });

  test("updates cooldown after notification", async () => {
    const now = new Date("2026-01-02T10:00:00Z");
    const ctx = createTestContext(now);

    const jobs = [
      createJob("job", true, {
        type: "notify",
        title: "T",
        body: "B",
        cooldownKey: "cooldown:job",
        cooldownMs: 60 * 60 * 1000,
      }),
    ];

    await runTick(ctx, jobs);

    const saved = ctx.state.getState().get("cooldown:job");
    expect(saved).toBe(now.getTime());
  });
});
