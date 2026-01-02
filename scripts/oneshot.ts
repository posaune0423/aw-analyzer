#!/usr/bin/env bun
/**
 * Utility commands for ActivityWatch data analysis
 *
 * Usage:
 *   bun run <command> [-- options]
 *
 * Commands:
 *   bun run metrics   - Fetch and display raw metrics
 *   bun run summary   - Get daily summary
 *   bun run report    - Generate AI report and send to Slack
 *   bun run alert     - Check continuous work alert
 *
 * Options (pass after --):
 *   --date YYYY-MM-DD  Target date (default: yesterday for report/summary, today for alert/metrics)
 *   --verbose          Show detailed output
 *   --aw-url URL       ActivityWatch base URL (default: http://localhost:5600)
 */

import { type Result } from "neverthrow";

import { env } from "../src/env.ts";
import { getMetrics, type DailyMetrics, type AwConfig } from "../src/libs/activity-watch.ts";
import { generateAiReport, generateFallbackReport, type ReportInput } from "../src/libs/analyzer.ts";
import { createSlackBlocks, sendSlackMessage, type SlackConfig } from "../src/libs/slack.ts";
import { startOfDay, endOfDay, formatDuration, formatDateKey } from "../src/utils/date-utils.ts";
import { configureLogger, logger } from "../src/utils/logger.ts";

// ============================================================================
// Types
// ============================================================================

type Command = "report" | "summary" | "alert" | "metrics" | "help";

type Options = {
  command: Command;
  date?: Date;
  verbose: boolean;
  awUrl: string;
};

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args: string[]): Options {
  const command = (args[0] as Command) ?? "help";
  const validCommands: Command[] = ["report", "summary", "alert", "metrics", "help"];

  if (!validCommands.includes(command)) {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }

  let date: Date | undefined;
  const dateIdx = args.indexOf("--date");
  if (dateIdx !== -1 && args[dateIdx + 1]) {
    const parsed = new Date(args[dateIdx + 1]);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    }
  }

  return {
    command,
    date,
    verbose: args.includes("--verbose"),
    awUrl: args.includes("--aw-url") ? args[args.indexOf("--aw-url") + 1] : env.ACTIVITYWATCH_URL,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function printMetrics(metrics: DailyMetrics, date: Date): void {
  console.log("\n📊 Metrics for", formatDateKey(date));
  console.log("─".repeat(40));
  console.log(`  Work Time:       ${formatDuration(metrics.workSeconds)}`);
  console.log(`  AFK Time:        ${formatDuration(metrics.afkSeconds)}`);
  console.log(`  Night Work:      ${formatDuration(metrics.nightWorkSeconds)}`);
  console.log(`  Max Continuous:  ${formatDuration(metrics.maxContinuousSeconds)}`);
  console.log("\n📱 Top Applications:");
  if (metrics.topApps.length === 0) {
    console.log("  (no data)");
  } else {
    for (const app of metrics.topApps) {
      console.log(`  • ${app.app}: ${formatDuration(app.seconds)}`);
    }
  }
  console.log();
}

async function fetchMetricsForDate(awConfig: AwConfig, date: Date): Promise<Result<DailyMetrics, { message: string }>> {
  const start = startOfDay(date);
  const end = endOfDay(date);
  return getMetrics(awConfig, { start, end });
}

// ============================================================================
// Commands
// ============================================================================

async function runMetrics(opts: Options): Promise<void> {
  const date = opts.date ?? new Date();
  const awConfig: AwConfig = { baseUrl: opts.awUrl };

  logger.info("Fetching metrics from ActivityWatch...");

  const result = await fetchMetricsForDate(awConfig, date);

  if (result.isErr()) {
    console.error("❌ Failed to fetch metrics:", result.error.message);
    process.exit(1);
  }

  printMetrics(result.value, date);
}

async function runSummary(opts: Options): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = opts.date ?? yesterday;
  const awConfig: AwConfig = { baseUrl: opts.awUrl };

  logger.info("Generating daily summary...");

  const result = await fetchMetricsForDate(awConfig, date);

  if (result.isErr()) {
    console.error("❌ Failed to fetch metrics:", result.error.message);
    process.exit(1);
  }

  const metrics = result.value;
  const dateStr = formatDateKey(date);
  const workTime = formatDuration(metrics.workSeconds);
  const topApps = metrics.topApps
    .slice(0, 3)
    .map(a => `${a.app}: ${formatDuration(a.seconds)}`)
    .join(", ");

  console.log("\n📊 Daily Summary - " + dateStr);
  console.log("─".repeat(40));
  console.log(`Work time: ${workTime}`);
  console.log(`Top apps: ${topApps || "No data"}`);
  console.log();
}

async function runReport(opts: Options): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = opts.date ?? yesterday;
  const awConfig: AwConfig = { baseUrl: opts.awUrl };

  logger.info("Generating daily report...");

  const metricsResult = await fetchMetricsForDate(awConfig, date);

  const metrics: DailyMetrics =
    metricsResult.isOk() ?
      metricsResult.value
    : { workSeconds: 0, afkSeconds: 0, nightWorkSeconds: 0, maxContinuousSeconds: 0, topApps: [] };

  if (metricsResult.isErr()) {
    logger.warn("Failed to fetch metrics, using empty data:", metricsResult.error.message);
  }

  const reportInput: ReportInput = {
    period: { start: startOfDay(date), end: endOfDay(date) },
    metrics,
    generatedAt: new Date(),
  };

  // Generate AI report
  logger.info("Generating AI report...");
  const aiResult = await generateAiReport({ apiKey: env.OPENAI_API_KEY }, reportInput);

  let markdown: string;
  if (aiResult.isOk()) {
    markdown = aiResult.value;
  } else {
    logger.warn("AI report failed, using fallback:", aiResult.error.message);
    markdown = generateFallbackReport(reportInput);
  }

  console.log("\n" + markdown);

  // Send to Slack
  logger.info("Sending to Slack...");
  const slackConfig: SlackConfig = { webhookUrl: env.SLACK_WEBHOOK_URL };
  const blocks = createSlackBlocks(markdown);
  const slackResult = await sendSlackMessage(slackConfig, { text: "Daily Activity Report", blocks });

  if (slackResult.isErr()) {
    console.error("❌ Failed to send to Slack:", slackResult.error.message);
    process.exit(1);
  }

  console.log("✅ Sent to Slack successfully");
}

async function runAlert(opts: Options): Promise<void> {
  const date = opts.date ?? new Date();
  const awConfig: AwConfig = { baseUrl: opts.awUrl };
  const thresholdMinutes = 90; // 1.5 hours

  logger.info("Checking continuous work time...");

  const result = await fetchMetricsForDate(awConfig, date);

  if (result.isErr()) {
    console.error("❌ Failed to fetch metrics:", result.error.message);
    process.exit(1);
  }

  const { maxContinuousSeconds } = result.value;
  const thresholdSeconds = thresholdMinutes * 60;

  console.log("\n⏱️  Continuous Work Check");
  console.log("─".repeat(40));
  console.log(`  Current max continuous: ${formatDuration(maxContinuousSeconds)}`);
  console.log(`  Threshold: ${formatDuration(thresholdSeconds)}`);

  if (maxContinuousSeconds >= thresholdSeconds) {
    console.log("\n⚠️  Alert: Take a Break!");
    console.log(`  You've been working continuously for ${formatDuration(maxContinuousSeconds)}.`);
  } else {
    console.log("\n✅ No alert needed.");
  }
  console.log();
}

function showHelp(): void {
  console.log(`
aw-analyzer utility commands

Usage:
  bun run <command> [-- options]

Commands:
  metrics     Fetch and display raw metrics
  summary     Get daily summary
  report      Generate AI report and send to Slack
  alert       Check continuous work alert

Options (pass after --):
  --date YYYY-MM-DD  Target date (default: yesterday for report/summary, today for alert/metrics)
  --verbose          Show detailed output
  --aw-url URL       ActivityWatch base URL (default: http://localhost:5600)

Examples:
  bun run metrics
  bun run summary
  bun run report
  bun run report -- --date 2025-01-01
  bun run alert
`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.verbose) {
    configureLogger({ logLevel: "DEBUG" });
  }

  switch (opts.command) {
    case "help":
      showHelp();
      break;
    case "metrics":
      await runMetrics(opts);
      break;
    case "summary":
      await runSummary(opts);
      break;
    case "report":
      await runReport(opts);
      break;
    case "alert":
      await runAlert(opts);
      break;
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
