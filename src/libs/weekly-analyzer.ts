/**
 * Weekly AI Analyzer
 *
 * Generates "tough love" style weekly insights for Slack report.
 */

import { err, ok, type Result } from "neverthrow";
import OpenAI from "openai";

import {
  WEEKLY_SYSTEM_PROMPT,
  buildWeeklyAnalysisPrompt,
  type WeeklyAnalysisResult,
  type WeeklyPromptInput,
} from "./weekly-prompts.ts";
import { formatDuration } from "../utils/date-utils.ts";
import { logger } from "../utils/logger.ts";

export type WeeklyAnalyzerError =
  | { type: "config_error"; message: string }
  | { type: "api_error"; message: string }
  | { type: "parse_error"; message: string };

export type WeeklyAnalyzerConfig = {
  apiKey: string;
  model?: string;
};

export type { WeeklyAnalysisResult, WeeklyPromptInput };

export async function generateWeeklyAnalysis(
  config: WeeklyAnalyzerConfig,
  input: WeeklyPromptInput,
): Promise<Result<WeeklyAnalysisResult, WeeklyAnalyzerError>> {
  if (!config.apiKey) return err({ type: "config_error", message: "OpenAI API key not configured" });

  try {
    const client = new OpenAI({ apiKey: config.apiKey });
    const prompt = buildWeeklyAnalysisPrompt(input);

    const response = await client.chat.completions.create({
      model: config.model ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: WEEKLY_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return err({ type: "parse_error", message: "Empty response from AI" });

    const parsed = JSON.parse(content) as WeeklyAnalysisResult;
    if (!parsed.title || !parsed.summary || !Array.isArray(parsed.insights) || !parsed.nextAction) {
      return err({ type: "parse_error", message: "Invalid response structure" });
    }

    logger.debug("Weekly AI analysis generated");
    return ok(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error("Failed to parse weekly AI response as JSON");
      return err({ type: "parse_error", message: "Invalid JSON response" });
    }
    const message = error instanceof Error ? error.message : "AI API error";
    logger.error("Weekly AI analysis generation failed", message);
    return err({ type: "api_error", message });
  }
}

export function getWeeklyFallbackAnalysis(input: WeeklyPromptInput): WeeklyAnalysisResult {
  const { summary, projectRanking, avgWakeTime, avgSleepTime } = input;
  const titleRange = summary.startDate && summary.endDate ? `${summary.startDate} → ${summary.endDate}` : "直近";

  const totalWorkFormatted = formatDuration(Math.round(summary.totalNotAfkSeconds));
  const avgWorkFormatted = formatDuration(Math.round(summary.avgNotAfkSecondsPerDay));

  const insights: string[] = [];

  // Work time insights
  const avgHours = summary.avgNotAfkSecondsPerDay / 3600;
  if (avgHours < 4) {
    insights.push(`1日平均${avgWorkFormatted}は少なすぎます。もっと集中時間を確保しなさい。`);
  } else if (avgHours > 10) {
    insights.push(`1日平均${avgWorkFormatted}は過労です。休息を取らないと効率が落ちます。`);
  } else {
    insights.push(`1日平均${avgWorkFormatted}は適切な範囲です。この調子を維持しなさい。`);
  }

  // Project focus insights
  if (projectRanking && projectRanking.length > 0) {
    const topProject = projectRanking[0];
    if (topProject) {
      const topRatio = topProject.seconds / summary.totalNotAfkSeconds;
      if (topRatio > 0.7) {
        insights.push(`${topProject.project}に集中できています。引き続きフォーカスを維持しなさい。`);
      } else if (projectRanking.length > 3) {
        insights.push(`複数プロジェクトに分散しすぎです。優先順位を明確にしなさい。`);
      }
    }
  }

  // Sleep/wake insights
  if (avgWakeTime && avgSleepTime) {
    insights.push(`平均起床${avgWakeTime}、就寝${avgSleepTime}。生活リズムを固定することが生産性の鍵です。`);
  }

  if (insights.length < 3) {
    insights.push("データ不足のため詳細な分析ができません。ActivityWatchを確実に動かしなさい。");
  }

  return {
    title: "今週のふりかえり",
    summary: `期間: ${titleRange}、週間稼働: ${totalWorkFormatted}。まずはこの数字を正直に見つめましょう。`,
    insights: insights.slice(0, 3),
    nextAction: "来週は1日の開始時間を固定し、最初の1時間で最重要タスクに取り組みなさい。",
  };
}
