/**
 * Scheduler - orchestrates job evaluation, execution, and notification
 */

import { err, ok, type Result } from "neverthrow";

import type { AwConfig } from "./libs/activity-watch.ts";
import type { Notifier } from "./libs/notifier.ts";
import { logger } from "./utils/logger.ts";
import type { StateStore } from "./utils/state-store.ts";

// ============================================================================
// Types
// ============================================================================

export type JobId = string;

export type JobResult =
  | { type: "no_notify"; reason: string }
  | { type: "notify"; title: string; body: string; cooldownKey?: string; cooldownMs?: number };

export type JobContext = {
  now: Date;
  state: StateStore;
  notifier: Notifier;
  awConfig: AwConfig;
};

export type Job = {
  id: JobId;
  shouldRun: (ctx: JobContext) => Promise<boolean> | boolean;
  run: (ctx: JobContext) => Promise<JobResult>;
};

export type SchedulerError =
  | { type: "provider_error"; message: string; jobId?: JobId }
  | { type: "notifier_error"; message: string; jobId?: JobId }
  | { type: "state_error"; message: string };

export type TickResult = Result<{ executedJobs: JobId[]; notifiedJobs: JobId[]; skippedJobs: JobId[] }, SchedulerError>;

// ============================================================================
// Cooldown Logic
// ============================================================================

async function isCooldownActive(
  state: StateStore,
  cooldownKey: string,
  cooldownMs: number,
  now: Date,
): Promise<boolean> {
  const result = await state.getTime(cooldownKey);
  if (result.isErr()) return false; // fail-open

  const lastTime = result.value;
  if (lastTime === undefined) return false;

  return now.getTime() - lastTime < cooldownMs;
}

// ============================================================================
// Scheduler
// ============================================================================

export async function runTick(ctx: JobContext, jobs: Job[]): Promise<TickResult> {
  const { now, state, notifier } = ctx;
  const executedJobs: JobId[] = [];
  const notifiedJobs: JobId[] = [];
  const skippedJobs: JobId[] = [];

  for (const job of jobs) {
    logger.debug(`Evaluating job: ${job.id}`);

    // Check shouldRun
    let shouldRun: boolean;
    try {
      shouldRun = await job.shouldRun(ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Job shouldRun failed: ${job.id}`, message);
      skippedJobs.push(job.id);
      continue;
    }

    if (!shouldRun) {
      logger.debug(`Job skipped: ${job.id}`);
      skippedJobs.push(job.id);
      continue;
    }

    // Execute job
    logger.info(`Executing job: ${job.id}`);
    let result: JobResult;
    try {
      result = await job.run(ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Job execution failed: ${job.id}`, message);
      return err({ type: "provider_error", message, jobId: job.id });
    }

    executedJobs.push(job.id);

    if (result.type === "no_notify") {
      logger.debug(`Job completed without notification: ${job.id}`, result.reason);
      continue;
    }

    // Check cooldown
    if (result.cooldownKey && result.cooldownMs) {
      const active = await isCooldownActive(state, result.cooldownKey, result.cooldownMs, now);
      if (active) {
        logger.debug(`Notification blocked by cooldown: ${job.id}`);
        continue;
      }
    }

    // Send notification
    logger.info(`Sending notification: ${job.id}`);
    const notifyResult = await notifier({ title: result.title, body: result.body });

    if (notifyResult.isErr()) {
      logger.error(`Notification failed: ${job.id}`, notifyResult.error.message);
      return err({ type: "notifier_error", message: notifyResult.error.message, jobId: job.id });
    }

    notifiedJobs.push(job.id);

    // Update cooldown
    if (result.cooldownKey) {
      await state.setTime(result.cooldownKey, now.getTime());
    }
  }

  return ok({ executedJobs, notifiedJobs, skippedJobs });
}
