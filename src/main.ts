#!/usr/bin/env bun
/**
 * Main entry point
 *
 * Configures and runs the CLI with registered jobs.
 */

import { runCli } from "./cli.ts";
import type { Job } from "./scheduler.ts";

// Run CLI
async function main() {
  try {
    const { env } = await import("./env.ts");
    const { createContinuousWorkAlertJob } = await import("./jobs/continuous-work-alert.ts");
    const { createDailySummaryJob } = await import("./jobs/daily-summary.ts");
    const { createReportJob } = await import("./jobs/report.ts");

    // Configure jobs
    const jobs: Job[] = [
      createDailySummaryJob({
        targetHour: 21, // 9 PM
        targetMinute: 0,
      }),

      createContinuousWorkAlertJob({
        thresholdMinutes: 90, // Alert after 1.5 hours
        cooldownMinutes: 30, // Don't alert again for 30 minutes
      }),

      createReportJob({
        targetHour: 22, // 10 PM
        analyzerConfig: env.OPENAI_API_KEY ? { apiKey: env.OPENAI_API_KEY } : undefined,
        slackConfig: { webhookUrl: env.SLACK_WEBHOOK_URL },
      }),
    ];

    const result = await runCli(process.argv, jobs, {
      awBaseUrl: env.ACTIVITYWATCH_URL,
      slackWebhookUrl: env.SLACK_WEBHOOK_URL,
      slackBotToken: env.SLACK_BOT_TOKEN,
      slackChannelId: env.SLACK_CHANNEL_ID,
      openaiApiKey: env.OPENAI_API_KEY,
    });

    if (result.type === "ok" && result.message) {
      console.log(result.message);
    }

    if (result.type === "error") {
      console.error(result.error.message);
      process.exit(result.exitCode);
    }
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(message || "Fatal error");
    process.exit(1);
  }
}

main();
