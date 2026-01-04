/**
 * Weekly report Slack blocks
 *
 * Displays:
 * - Weekly total / avg work time
 * - Editor project ranking
 * - Avg wake / sleep time
 * - AI "tough love" advice
 * - Heatmap image
 */

import { formatDuration } from "../utils/date-utils.ts";
import {
  contextBlock,
  dividerBlock,
  headerBlock,
  imageBlock,
  sectionBlock,
  fieldsBlock,
  type SlackBlock,
} from "./slack.ts";
import type { WeeklyAnalysisResult } from "./weekly-analyzer.ts";

export type ProjectRanking = Array<{ project: string; seconds: number }>;

export type WeeklyReportBlocksInput = {
  rangeText: string; // e.g. "2026-01-01 → 2026-01-07"
  totalWorkSeconds: number;
  avgWorkSecondsPerDay: number;
  projectRanking: ProjectRanking;
  avgWakeTime?: string; // e.g. "8:30"
  avgSleepTime?: string; // e.g. "23:45"
  imageUrl?: string;
  imageFileId?: string; // Slack file ID for slack_file object
  imageAltText?: string;
  imageTitle?: string;
  imageFilePermalink?: string;
  analysis: WeeklyAnalysisResult;
};

export function createWeeklyReportBlocks(input: WeeklyReportBlocksInput): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push(headerBlock(`📊 Weekly Report — ${input.rangeText}`));

  // Stats section (2-column)
  blocks.push(dividerBlock());
  blocks.push(
    fieldsBlock([
      `*⏱️ 週間稼働時間*\n${formatDuration(Math.round(input.totalWorkSeconds))}`,
      `*📈 平均稼働時間/日*\n${formatDuration(Math.round(input.avgWorkSecondsPerDay))}`,
      `*☀️ 平均起床時間*\n${input.avgWakeTime ?? "-"}`,
      `*🌙 平均就寝時間*\n${input.avgSleepTime ?? "-"}`,
    ]),
  );

  // Project ranking
  if (input.projectRanking.length > 0) {
    blocks.push(dividerBlock());
    const projectLines = input.projectRanking.slice(0, 5).map((p, i) => {
      const medal =
        i === 0 ? "🥇"
        : i === 1 ? "🥈"
        : i === 2 ? "🥉"
        : `${i + 1}.`;
      return `${medal} *${p.project}*: ${formatDuration(Math.round(p.seconds))}`;
    });
    blocks.push(sectionBlock(`*💻 プロジェクト別ランキング*\n${projectLines.join("\n")}`));
  }

  // Heatmap image - always try to display as image block
  // Prefer slack_file with fileId if available, then slack_file with URL, then image_url
  if (input.imageFileId) {
    // Use slack_file with id (most reliable for Slack files)
    blocks.push(dividerBlock());
    blocks.push(
      imageBlock({
        slackFileId: input.imageFileId,
        altText: input.imageAltText ?? "Weekly activity heatmap",
        title: input.imageTitle,
      }),
    );
  } else if (input.imageUrl) {
    // imageUrl will be automatically detected as slack_file if it's a Slack URL
    blocks.push(dividerBlock());
    blocks.push(
      imageBlock({
        imageUrl: input.imageUrl,
        altText: input.imageAltText ?? "Weekly activity heatmap",
        title: input.imageTitle,
      }),
    );
  } else if (input.imageFilePermalink) {
    // Fallback: if public URL is not available, show file link
    // Note: Slack will show image preview automatically for uploaded files
    blocks.push(dividerBlock());
    blocks.push(sectionBlock(`🖼️ Heatmap: <${input.imageFilePermalink}|画像を開く>`));
  }

  // AI Analysis section
  blocks.push(dividerBlock());
  blocks.push(sectionBlock(`*🔥 ${input.analysis.title}*\n${input.analysis.summary}`));

  if (input.analysis.insights.length > 0) {
    const insightsText = input.analysis.insights.map(t => `• ${t}`).join("\n");
    blocks.push(sectionBlock(`*🧠 AIの分析*\n${insightsText}`));
  }

  // Footer
  blocks.push(dividerBlock());
  blocks.push(contextBlock([`✅ 来週のアクション: ${input.analysis.nextAction}`, "Timezone: JST"]));

  return blocks;
}
