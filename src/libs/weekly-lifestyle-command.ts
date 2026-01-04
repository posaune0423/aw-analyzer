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
import {
  shareSlackFilePublicly,
  uploadSlackFile,
  type SlackFileUploadConfig,
  type SlackFileUploadError,
} from "./slack-file-upload.ts";
import { analyzeSleepWake, formatAvgTime } from "./sleep-wake-analyzer.ts";
import { svgToPng } from "./svg-to-png.ts";
import { generateWeeklyAnalysis, getWeeklyFallbackAnalysis, type WeeklyAnalyzerConfig } from "./weekly-analyzer.ts";
import { createWeeklyActivityJstHeatmapSvg } from "./weekly-activity-jst-heatmap-svg.ts";
import { binAfkEventsToJstHourly, buildJstDateKeys } from "./weekly-activity-jst.ts";
import { sendSlackMessage, type SlackBlock, type SlackConfig, type SlackError } from "./slack.ts";
import { createWeeklyReportBlocks } from "./weekly-report-blocks.ts";
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
  sendSlack?: (
    config: SlackConfig,
    message: { text: string; blocks?: SlackBlock[] },
  ) => Promise<Result<void, SlackError>>;
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
  shareFilePublicly?: (
    config: SlackFileUploadConfig,
    input: { fileId: string },
  ) => Promise<Result<{ permalinkPublic?: string }, SlackFileUploadError>>;
  generateWeeklyAi?: typeof generateWeeklyAnalysis;
  createHeatmapSvg?: (
    days: ReturnType<typeof binAfkEventsToJstHourly>,
    opts?: { title?: string; subtitle?: string },
  ) => string;
};

export async function runWeeklyLifestyleCommand(
  deps: WeeklyLifestyleCommandDeps,
): Promise<Result<void, WeeklyLifestyleCommandError>> {
  if (!deps.slackConfig.webhookUrl) {
    return err({ type: "config_error", message: "Slack webhook URL is not configured" });
  }

  if (!deps.uploadConfig.botToken) {
    return err({
      type: "config_error",
      message: "Slack bot token is required (set SLACK_BOT_TOKEN)",
    });
  }

  const fetcher = deps.fetchAfkMetrics ?? (async (config, input) => getAfkMetrics(config, input));
  const eventsFetcher = deps.fetchAfkEvents ?? (async (config, input) => getAfkEvents(config, input));
  const projectsFetcher = deps.fetchEditorProjects ?? (async (config, input) => getEditorProjectMetrics(config, input));
  const slackSender = deps.sendSlack ?? (async (config, message) => sendSlackMessage(config, message));
  const uploader = deps.uploadFile ?? (async (config, input) => uploadSlackFile(config, input));
  const sharer = deps.shareFilePublicly ?? (async (config, input) => shareSlackFilePublicly(config, input));
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

  // Generate heatmap SVG -> PNG
  const svg = heatmapSvg(hourly, {
    title: `Lifestyle Timeband (JST) — ${summary.startDate} → ${summary.endDate}`,
    subtitle: "Green=active, Gray=inactive • Rows=hour(JST) • Cols=day",
  });

  const png = svgToPng(svg, { width: 1400, background: "#0b1220" });

  // Upload heatmap to Slack (without channel_id to avoid auto-posting)
  // File will be referenced in the report message instead
  const uploadConfigWithoutChannel = {
    ...deps.uploadConfig,
    channelId: undefined, // Don't auto-post to channel
  };
  const uploadResult = await uploader(uploadConfigWithoutChannel, {
    filename: `weekly-activity-${summary.startDate}-${summary.endDate}.png`,
    title: `Weekly Activity Graph (${summary.startDate} → ${summary.endDate}).png`,
    mimeType: "image/png",
    content: png,
  });

  if (uploadResult.isErr()) {
    return err({ type: "slack_upload_error", message: "Failed to upload graph to Slack", cause: uploadResult.error });
  }

  const fileId = uploadResult.value.fileId ?? "";
  const filePermalink = uploadResult.value.permalink;
  const uploadPermalinkPublic = uploadResult.value.permalinkPublic;

  // Make the file public for image block display
  // First check if permalink_public was returned from upload
  let imageUrl: string | undefined = uploadPermalinkPublic;

  // If not available from upload, try to get it via files.sharedPublicURL
  if (!imageUrl && fileId) {
    const shareResult = await sharer(deps.uploadConfig, { fileId });
    if (shareResult.isOk() && shareResult.value.permalinkPublic) {
      imageUrl = shareResult.value.permalinkPublic;
    } else {
      // Log warning but continue - Slack will show file preview automatically
      logger.warn("Could not obtain public URL for image block, file preview will be shown instead");
    }
  }

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

  const blocks = createWeeklyReportBlocks({
    rangeText,
    totalWorkSeconds: summary.totalNotAfkSeconds,
    avgWorkSecondsPerDay: summary.avgNotAfkSecondsPerDay,
    projectRanking,
    avgWakeTime,
    avgSleepTime,
    imageUrl,
    imageFileId: fileId || undefined,
    imageAltText: "Weekly activity heatmap (JST)",
    imageTitle: "Weekly Heatmap (JST)",
    imageFilePermalink: filePermalink,
    analysis: weeklyAnalysis,
  });

  const slackResult = await slackSender(deps.slackConfig, {
    text: `Weekly Report (${rangeText})`,
    blocks,
  });

  if (slackResult.isErr()) {
    return err({ type: "slack_error", message: "Failed to send weekly report to Slack", cause: slackResult.error });
  }

  return ok(undefined);
}
