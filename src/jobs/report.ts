/**
 * Report Generation Job
 *
 * Generates rich Block Kit reports with AI insights and sends them to Slack.
 */

import {
  generateAnalysis,
  getFallbackAnalysis,
  type AnalyzerConfig,
  type ReportInput,
  type AnalysisResult,
} from "../libs/analyzer.ts";
import { getMetrics, type DailyMetrics } from "../libs/activity-watch.ts";
import { createReportBlocks, sendSlackMessage, type SlackConfig, type ReportData } from "../libs/slack.ts";
import { env } from "../env.ts";
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

export type ReportJobConfig = {
  targetHour: number;
  targetMinute?: number;
  analyzerConfig?: AnalyzerConfig;
  slackConfig: SlackConfig;
};

export function createReportJob(config: ReportJobConfig): Job {
  const { targetHour, targetMinute = 0, analyzerConfig, slackConfig } = config;

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

      // Generate AI analysis or use fallback
      let analysis: AnalysisResult;
      if (analyzerConfig?.apiKey) {
        const aiResult = await generateAnalysis(analyzerConfig, reportInput);
        if (aiResult.isOk()) {
          analysis = aiResult.value;
        } else {
          logger.warn("AI analysis failed, using fallback", aiResult.error.message);
          analysis = getFallbackAnalysis(reportInput);
        }
      } else {
        analysis = getFallbackAnalysis(reportInput);
      }

      // Build Block Kit report
      const reportData: ReportData = {
        date: formatDateKey(yesterday),
        workTime: formatDuration(metrics.workSeconds),
        maxContinuous: formatDuration(metrics.maxContinuousSeconds),
        nightWork: formatDuration(metrics.nightWorkSeconds),
        topApps: metrics.topApps.slice(0, 5).map(a => ({
          app: a.app,
          time: formatDuration(a.seconds),
        })),
        summary: analysis.summary,
        insights: analysis.insights,
        tip: analysis.tip,
        awBaseUrl: ctx.awConfig.baseUrl,
        hostname: env.ACTIVITYWATCH_HOSTNAME,
      };

      // Send to Slack
      const blocks = createReportBlocks(reportData);
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
