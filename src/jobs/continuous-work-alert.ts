/**
 * Continuous Work Alert Job
 *
 * Alerts when continuous work time exceeds a threshold.
 * Uses cooldown to prevent repeated notifications.
 */

import { getMetrics } from "../libs/activity-watch.ts";
import type { Job, JobContext, JobResult } from "../scheduler.ts";
import { cooldownKey, formatDuration, startOfDay } from "../utils/date-utils.ts";
import { logger } from "../utils/logger.ts";

export type ContinuousWorkAlertConfig = {
  thresholdMinutes: number;
  cooldownMinutes: number;
};

export function createContinuousWorkAlertJob(config: ContinuousWorkAlertConfig): Job {
  const { thresholdMinutes, cooldownMinutes } = config;
  const thresholdSeconds = thresholdMinutes * 60;
  const cooldownMs = cooldownMinutes * 60 * 1000;

  return {
    id: "continuous-work-alert",

    shouldRun(): boolean {
      // Always evaluate on every tick
      return true;
    },

    async run(ctx: JobContext): Promise<JobResult> {
      logger.debug("Checking continuous work time");

      const metricsResult = await getMetrics(ctx.awConfig, {
        start: startOfDay(ctx.now),
        end: ctx.now,
      });

      if (metricsResult.isErr()) {
        logger.debug("Failed to get metrics", metricsResult.error.message);
        return { type: "no_notify", reason: "Failed to get metrics" };
      }

      const { maxContinuousSeconds } = metricsResult.value;

      if (maxContinuousSeconds < thresholdSeconds) {
        return { type: "no_notify", reason: "Below threshold" };
      }

      const duration = formatDuration(maxContinuousSeconds);

      return {
        type: "notify",
        title: "⚠️ Take a Break!",
        body: `You've been working continuously for ${duration}. Consider taking a short break.`,
        cooldownKey: cooldownKey("continuous-work-alert"),
        cooldownMs,
      };
    },
  };
}
