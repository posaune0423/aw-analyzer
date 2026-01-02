#!/usr/bin/env bun
/**
 * Main entry point
 *
 * Configures and runs the CLI with registered jobs.
 */

import { runCli } from "./cli.ts";
import { env } from "./env.ts";
import { createContinuousWorkAlertJob } from "./jobs/continuous-work-alert.ts";
import { createDailySummaryJob } from "./jobs/daily-summary.ts";
import { createReportJob } from "./jobs/report.ts";
import type { Job } from "./scheduler.ts";

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
    useAi: true,
    analyzerConfig: { apiKey: env.OPENAI_API_KEY },
    slackConfig: { webhookUrl: env.SLACK_WEBHOOK_URL },
  }),
];

// Run CLI
async function main() {
  const result = await runCli(process.argv, jobs);

  if (result.type === "ok" && result.message) {
    console.log(result.message);
  }

  if (result.type === "error") {
    process.exit(result.exitCode);
  }
}

main();
