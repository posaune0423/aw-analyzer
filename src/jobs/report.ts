/**
 * Report Generation Job
 *
 * Generates markdown reports using AI or fallback,
 * and optionally sends them to Slack.
 */

import { generateAiReport, generateFallbackReport, type AnalyzerConfig, type ReportInput } from "../libs/analyzer.ts";
import { getMetrics, type DailyMetrics } from "../libs/activity-watch.ts";
import { createSlackBlocks, sendSlackMessage, type SlackConfig } from "../libs/slack.ts";
import type { Job, JobContext, JobResult } from "../scheduler.ts";
import { dailyKey, endOfDay, formatDateKey, shouldTriggerDaily, startOfDay } from "../utils/date-utils.ts";
import { logger } from "../utils/logger.ts";

export type ReportJobConfig = {
  targetHour: number;
  targetMinute?: number;
  analyzerConfig: AnalyzerConfig;
  slackConfig: SlackConfig;
  useAi?: boolean;
};

export function createReportJob(config: ReportJobConfig): Job {
  const { targetHour, targetMinute = 0, analyzerConfig, slackConfig, useAi = false } = config;

  return {
    id: "daily-report",

    async shouldRun(ctx: JobContext): Promise<boolean> {
      const key = dailyKey("daily-report", ctx.now);
      const lastResult = await ctx.state.get<string>(key);
      const lastTriggeredDate = lastResult.isOk() ? lastResult.value : undefined;

      return shouldTriggerDaily({ now: ctx.now, targetHour, targetMinute, lastTriggeredDate });
    },

    async run(ctx: JobContext): Promise<JobResult> {
      logger.info("Generating daily report");

      // Get yesterday's metrics
      const yesterday = new Date(ctx.now);
      yesterday.setDate(yesterday.getDate() - 1);

      const metricsResult = await getMetrics(ctx.awConfig, {
        start: startOfDay(yesterday),
        end: endOfDay(yesterday),
      });

      const metrics: DailyMetrics =
        metricsResult.isOk() ?
          metricsResult.value
        : { workSeconds: 0, afkSeconds: 0, nightWorkSeconds: 0, maxContinuousSeconds: 0, topApps: [] };

      const reportInput: ReportInput = {
        period: { start: startOfDay(yesterday), end: endOfDay(yesterday) },
        metrics,
        generatedAt: ctx.now,
      };

      // Generate report (AI or fallback)
      let markdown: string;

      if (useAi) {
        const aiResult = await generateAiReport(analyzerConfig, reportInput);
        if (aiResult.isOk()) {
          markdown = aiResult.value;
        } else {
          logger.warn("AI report failed, using fallback", aiResult.error.message);
          markdown = generateFallbackReport(reportInput);
        }
      } else {
        markdown = generateFallbackReport(reportInput);
      }

      // Send to Slack
      const blocks = createSlackBlocks(markdown);
      const slackResult = await sendSlackMessage(slackConfig, { text: "Daily Activity Report", blocks });

      if (slackResult.isErr()) {
        logger.error("Slack send failed", slackResult.error.message);
        // Continue with local notification even if Slack fails
      }

      // Mark as triggered
      const key = dailyKey("daily-report", ctx.now);
      await ctx.state.set(key, formatDateKey(ctx.now));

      return {
        type: "notify",
        title: "📊 Daily Report Generated",
        body: `Report for ${formatDateKey(yesterday)} has been generated.`,
      };
    },
  };
}
