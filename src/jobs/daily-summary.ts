/**
 * Daily Summary Job
 *
 * Sends a summary notification once per day after a specified time.
 * Uses daily idempotency key to prevent duplicate notifications.
 */

import { getMetrics, type DailyMetrics } from "../libs/activity-watch.ts";
import type { Job, JobContext, JobResult } from "../scheduler.ts";
import {
  dailyKey,
  endOfDay,
  formatDateKey,
  formatDuration,
  shouldTriggerDaily,
  startOfDay,
} from "../utils/date-utils.ts";
import { logger } from "../utils/logger.ts";

export type DailySummaryConfig = {
  targetHour: number;
  targetMinute?: number;
};

function formatSummary(metrics: DailyMetrics, date: Date): { title: string; body: string } {
  const dateStr = formatDateKey(date);
  const workTime = formatDuration(metrics.workSeconds);
  const topApps = metrics.topApps
    .slice(0, 3)
    .map(a => `${a.app}: ${formatDuration(a.seconds)}`)
    .join(", ");

  return {
    title: `📊 Daily Summary - ${dateStr}`,
    body: `Work time: ${workTime}\nTop apps: ${topApps || "No data"}`,
  };
}

export function createDailySummaryJob(config: DailySummaryConfig): Job {
  const { targetHour, targetMinute = 0 } = config;

  return {
    id: "daily-summary",

    async shouldRun(ctx: JobContext): Promise<boolean> {
      const key = dailyKey("daily-summary", ctx.now);
      const lastResult = await ctx.state.get<string>(key);
      const lastTriggeredDate = lastResult.isOk() ? lastResult.value : undefined;

      return shouldTriggerDaily({
        now: ctx.now,
        targetHour,
        targetMinute,
        lastTriggeredDate,
      });
    },

    async run(ctx: JobContext): Promise<JobResult> {
      logger.debug("Running daily summary job");

      // Get yesterday's metrics (or today if after work hours)
      const yesterday = new Date(ctx.now);
      yesterday.setDate(yesterday.getDate() - 1);

      const metricsResult = await getMetrics(ctx.awConfig, {
        start: startOfDay(yesterday),
        end: endOfDay(yesterday),
      });

      if (metricsResult.isErr()) {
        logger.warn("Failed to get metrics, using empty data", metricsResult.error.message);
        // Continue with empty metrics instead of failing
      }

      const metrics =
        metricsResult.isOk() ?
          metricsResult.value
        : { workSeconds: 0, afkSeconds: 0, nightWorkSeconds: 0, maxContinuousSeconds: 0, topApps: [] };

      const { title, body } = formatSummary(metrics, yesterday);

      // Mark as triggered today
      const key = dailyKey("daily-summary", ctx.now);
      await ctx.state.set(key, formatDateKey(ctx.now));

      return { type: "notify", title, body };
    },
  };
}
