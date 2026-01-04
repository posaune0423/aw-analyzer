/**
 * Weekly lifestyle report command runner
 *
 * Orchestrates:
 * - Fetch AFK / not-afk metrics for the last N days from ActivityWatch
 * - Fetch editor project metrics
 * - Calculate wake/sleep times
 * - Generate AI analysis (tough love style)
 * - Send it to Slack as Block Kit with heatmap image
 *
 * External dependencies are injected for testability.
 */

import { err, ok, type Result } from "neverthrow";

import { logger } from "../utils/logger.ts";
import {
  getAfkEvents,
  getAfkMetrics,
  getEditorProjectMetrics,
  type AfkEvent,
  type AfkMetrics,
  type AwConfig,
  type AwError,
  type EditorProjectMetrics,
} from "./activity-watch.ts";
import { uploadSlackFile, type SlackFileUploadConfig, type SlackFileUploadError } from "./slack-file-upload.ts";
import { analyzeSleepWake, formatAvgTime } from "./sleep-wake-analyzer.ts";
import { svgToPng } from "./svg-to-png.ts";
import { generateWeeklyAnalysis, getWeeklyFallbackAnalysis, type WeeklyAnalyzerConfig } from "./weekly-analyzer.ts";
import { createWeeklyActivityJstHeatmapSvg } from "./weekly-activity-jst-heatmap-svg.ts";
import { binAfkEventsToJstHourly, buildJstDateKeys } from "./weekly-activity-jst.ts";
import type { SlackConfig, SlackError } from "./slack.ts";
import { createWeeklyReportMrkdwn } from "./weekly-report-blocks.ts";
import { buildWeeklyLifestyleSummary, type DailyAfkRecord } from "./weekly-lifestyle.ts";
import { endOfDay, formatDateKey, startOfDay, buildDateList } from "../utils/date-utils.ts";

export type WeeklyLifestyleCommandError =
  | { type: "config_error"; message: string }
  | { type: "aw_error"; message: string; cause: AwError }
  | { type: "slack_error"; message: string; cause: SlackError }
  | { type: "slack_upload_error"; message: string; cause: SlackFileUploadError };

export type WeeklyLifestyleCommandDeps = {
  now: Date;
  days: number;
  awConfig: AwConfig;
  slackConfig: SlackConfig;
  uploadConfig: SlackFileUploadConfig;
  analyzerConfig?: WeeklyAnalyzerConfig;
  fetchAfkMetrics?: (config: AwConfig, input: { start: Date; end: Date }) => Promise<Result<AfkMetrics, AwError>>;
  fetchAfkEvents?: (config: AwConfig, input: { start: Date; end: Date }) => Promise<Result<AfkEvent[], AwError>>;
  fetchEditorProjects?: (
    config: AwConfig,
    input: { start: Date; end: Date },
  ) => Promise<Result<EditorProjectMetrics, AwError>>;
  uploadFile?: (
    config: SlackFileUploadConfig,
    input: {
      filename: string;
      title?: string;
      initialComment?: string;
      mimeType: string;
      content: string | Uint8Array;
    },
  ) => Promise<Result<{ permalink?: string; fileId?: string; permalinkPublic?: string }, SlackFileUploadError>>;
  generateWeeklyAi?: typeof generateWeeklyAnalysis;
  createHeatmapSvg?: (
    days: ReturnType<typeof binAfkEventsToJstHourly>,
    opts?: { title?: string; subtitle?: string },
  ) => string;
};

export async function runWeeklyLifestyleCommand(
  deps: WeeklyLifestyleCommandDeps,
): Promise<Result<void, WeeklyLifestyleCommandError>> {
  if (!deps.uploadConfig.botToken) {
    return err({
      type: "config_error",
      message: "Slack bot token is required (set SLACK_BOT_TOKEN)",
    });
  }

  if (!deps.uploadConfig.channelId) {
    return err({
      type: "config_error",
      message: "Slack channel id is required (set SLACK_CHANNEL_ID)",
    });
  }

  const fetcher = deps.fetchAfkMetrics ?? (async (config, input) => getAfkMetrics(config, input));
  const eventsFetcher = deps.fetchAfkEvents ?? (async (config, input) => getAfkEvents(config, input));
  const projectsFetcher = deps.fetchEditorProjects ?? (async (config, input) => getEditorProjectMetrics(config, input));
  const uploader = deps.uploadFile ?? (async (config, input) => uploadSlackFile(config, input));
  const weeklyAi = deps.generateWeeklyAi ?? (async (config, input) => generateWeeklyAnalysis(config, input));
  const heatmapSvg = deps.createHeatmapSvg ?? ((days, opts) => createWeeklyActivityJstHeatmapSvg(days, opts));

  const dates = buildDateList(deps.now, deps.days);
  const records: DailyAfkRecord[] = [];

  for (const date of dates) {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const afkResult = await fetcher(deps.awConfig, { start: dayStart, end: dayEnd });
    if (afkResult.isErr()) {
      return err({
        type: "aw_error",
        message: `Failed to fetch AFK metrics for ${formatDateKey(date)}`,
        cause: afkResult.error,
      });
    }

    records.push({
      date: formatDateKey(date),
      afkSeconds: afkResult.value.afkSeconds,
      notAfkSeconds: afkResult.value.notAfkSeconds,
    });
  }

  const summary = buildWeeklyLifestyleSummary(records, deps.days);

  // Fetch full period data
  const targetDateKeys = buildJstDateKeys(deps.now, deps.days);
  const periodStart = startOfDay(dates[0] ?? deps.now);
  const periodEnd = endOfDay(dates[dates.length - 1] ?? deps.now);

  // Fetch AFK events (for heatmap + sleep/wake analysis)
  const eventsResult = await eventsFetcher(deps.awConfig, { start: periodStart, end: periodEnd });
  if (eventsResult.isErr()) {
    return err({ type: "aw_error", message: "Failed to fetch AFK events", cause: eventsResult.error });
  }

  const hourly = binAfkEventsToJstHourly(eventsResult.value, targetDateKeys);

  // Calculate sleep/wake times
  const sleepWake = analyzeSleepWake(eventsResult.value, targetDateKeys);
  const avgWakeTime = formatAvgTime(sleepWake.avgWakeTimeMinutes);
  const avgSleepTime = formatAvgTime(sleepWake.avgSleepTimeMinutes);

  // Fetch editor project metrics
  const projectsResult = await projectsFetcher(deps.awConfig, { start: periodStart, end: periodEnd });
  const projectRanking = projectsResult.isOk() ? projectsResult.value.projects : [];

  // AI analysis (with project and sleep/wake data)
  const aiInput = {
    summary,
    hourly,
    projectRanking,
    avgWakeTime: avgWakeTime !== "-" ? avgWakeTime : undefined,
    avgSleepTime: avgSleepTime !== "-" ? avgSleepTime : undefined,
  };
  let weeklyAnalysis = getWeeklyFallbackAnalysis(aiInput);
  if (deps.analyzerConfig?.apiKey) {
    const aiResult = await weeklyAi(deps.analyzerConfig, aiInput);
    if (aiResult.isOk()) weeklyAnalysis = aiResult.value;
  }

  const rangeText = summary.startDate && summary.endDate ? `${summary.startDate} → ${summary.endDate}` : "直近";

  // Generate heatmap SVG -> PNG
  const svg = heatmapSvg(hourly, {
    title: `Lifestyle Timeband (JST) — ${summary.startDate} → ${summary.endDate}`,
    subtitle: "Green=active, Gray=inactive • Rows=hour(JST) • Cols=day",
  });

  const png = svgToPng(svg, { width: 1400, background: "#0b1220" });

  // Post a single message that contains both the image preview and the full report text.
  // This is the most reliable way to keep the image visible "inside the report message".
  const initialComment = createWeeklyReportMrkdwn({
    rangeText,
    totalWorkSeconds: summary.totalNotAfkSeconds,
    avgWorkSecondsPerDay: summary.avgNotAfkSecondsPerDay,
    projectRanking,
    avgWakeTime,
    avgSleepTime,
    analysis: weeklyAnalysis,
  });

  const uploadResult = await uploader(deps.uploadConfig, {
    filename: `weekly-activity-${summary.startDate}-${summary.endDate}.png`,
    title: `Weekly Activity Graph (${summary.startDate} → ${summary.endDate}).png`,
    initialComment,
    mimeType: "image/png",
    content: png,
  });

  if (uploadResult.isErr()) {
    return err({ type: "slack_upload_error", message: "Failed to upload graph to Slack", cause: uploadResult.error });
  }

  const fileId = uploadResult.value.fileId ?? "";
  const filePermalink = uploadResult.value.permalink;
  const uploadPermalinkPublic = uploadResult.value.permalinkPublic;

  // Log file info for debugging
  logger.debug("File upload result", {
    fileId: fileId || "(empty)",
    hasPermalink: !!filePermalink,
    hasPermalinkPublic: !!uploadPermalinkPublic,
  });

  return ok(undefined);
}
