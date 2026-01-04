/**
 * AI Prompts for Weekly Report
 *
 * This prompt generates "tough love" style analysis in Japanese.
 * The AI should be constructive but direct about areas for improvement.
 */

import type { DailyHourlyBucketsJst } from "./weekly-activity-jst.ts";
import type { WeeklyLifestyleSummary } from "./weekly-lifestyle.ts";
import { formatDuration } from "../utils/date-utils.ts";

export type ProjectRankingItem = { project: string; seconds: number };

export type WeeklyPromptInput = {
  summary: WeeklyLifestyleSummary;
  hourly: DailyHourlyBucketsJst[];
  projectRanking?: ProjectRankingItem[];
  avgWakeTime?: string;
  avgSleepTime?: string;
};

export type WeeklyAnalysisResult = {
  title: string;
  summary: string;
  insights: string[];
  nextAction: string;
};

export const WEEKLY_SYSTEM_PROMPT =
  `あなたは厳しいが愛情のある生産性コーチです。\n` +
  `ユーザーの週次データを分析し、辛口ながらも建設的なアドバイスを提供してください。\n` +
  `褒めるべき点は簡潔に認め、改善すべき点は遠慮なく指摘してください。\n` +
  `日本語で回答してください。\n` +
  `指定されたJSON形式のみで返答し、余計な文は付けないでください。`;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function hourLabel(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  return `${hh}時台`;
}

function topHoursJst(hourly: DailyHourlyBucketsJst[], topN: number): Array<{ hour: number; score: number }> {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const totals = hours.map(h => {
    let active = 0;
    let afk = 0;
    for (const d of hourly) {
      active += d.hours[h]?.activeSeconds ?? 0;
      afk += d.hours[h]?.afkSeconds ?? 0;
    }
    const denom = active + afk;
    const score = denom <= 0 ? 0 : active / denom;
    return { hour: h, score: clamp01(score) };
  });

  return totals
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(5, topN)));
}

export function buildWeeklyAnalysisPrompt(input: WeeklyPromptInput): string {
  const { summary, hourly, projectRanking, avgWakeTime, avgSleepTime } = input;
  const titleRange = summary.startDate && summary.endDate ? `${summary.startDate} → ${summary.endDate}` : "直近7日";

  const activeRatioPct = Math.round(summary.activeRatio * 100);
  const topHours = topHoursJst(hourly, 3);
  const topHoursText =
    topHours.length > 0 ?
      topHours.map(x => `- ${hourLabel(x.hour)}（集中傾向: ${Math.round(x.score * 100)}%）`).join("\n")
    : "- データ不足";

  const mostActiveDay = summary.mostActiveDay?.date ?? "";
  const leastActiveDay = summary.leastActiveDay?.date ?? "";

  // Total work time
  const totalWorkFormatted = formatDuration(Math.round(summary.totalNotAfkSeconds));
  const avgWorkFormatted = formatDuration(Math.round(summary.avgNotAfkSecondsPerDay));

  // Project ranking text
  let projectText = "- データなし";
  if (projectRanking && projectRanking.length > 0) {
    projectText = projectRanking
      .slice(0, 5)
      .map((p, i) => `${i + 1}. ${p.project}: ${formatDuration(Math.round(p.seconds))}`)
      .join("\n");
  }

  return (
    `以下の週次データを分析し、辛口でありながら建設的なアドバイスをください。\n\n` +
    `## 基本データ\n` +
    `- 対象期間: ${titleRange}\n` +
    `- 週間総稼働時間: ${totalWorkFormatted}\n` +
    `- 1日平均稼働時間: ${avgWorkFormatted}\n` +
    `- アクティブ比率: ${activeRatioPct}%\n` +
    (avgWakeTime ? `- 平均起床時間: ${avgWakeTime}\n` : "") +
    (avgSleepTime ? `- 平均就寝時間: ${avgSleepTime}\n` : "") +
    (mostActiveDay ? `- 最もアクティブな日: ${mostActiveDay}\n` : "") +
    (leastActiveDay ? `- 最も低調な日: ${leastActiveDay}\n` : "") +
    `\n` +
    `## プロジェクト別ランキング\n` +
    `${projectText}\n\n` +
    `## 時間帯別傾向 (JST)\n` +
    `${topHoursText}\n\n` +
    `## 出力形式\n` +
    `次のJSON形式で返答してください:\n\n` +
    `{\n` +
    `  "title": "週の総評（短く辛口に）",\n` +
    `  "summary": "2-3文の要約。良い点は簡潔に、問題点は具体的に指摘。",\n` +
    `  "insights": [\n` +
    `    "指摘1（稼働時間や生活リズムに関する辛口コメント）",\n` +
    `    "指摘2（プロジェクト配分や集中度への指摘）",\n` +
    `    "指摘3（改善のための具体的な提案）"\n` +
    `  ],\n` +
    `  "nextAction": "来週絶対やるべき1つの具体的アクション"\n` +
    `}\n\n` +
    `## コーチングスタイル\n` +
    `- 遠慮なく問題点を指摘する\n` +
    `- 「〜すべき」「〜しなさい」など明確な口調\n` +
    `- ただし人格否定はしない\n` +
    `- 改善可能な行動に焦点を当てる\n` +
    `- データに基づいて根拠を示す\n`
  );
}
