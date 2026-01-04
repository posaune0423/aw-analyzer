/**
 * Weekly lifestyle summary generator
 *
 * This module contains pure functions to summarize AFK / not-afk time records
 * into a weekly lifestyle report, and to convert it into Slack Block Kit blocks.
 */

import { contextBlock, dividerBlock, fieldsBlock, headerBlock, sectionBlock, type SlackBlock } from "./slack.ts";

export type DailyAfkRecord = {
  date: string; // YYYY-MM-DD (local)
  afkSeconds: number;
  notAfkSeconds: number;
};

export type WeeklyLifestyleSummary = {
  startDate: string;
  endDate: string;
  days: number;
  totalAfkSeconds: number;
  totalNotAfkSeconds: number;
  avgAfkSecondsPerDay: number;
  avgNotAfkSecondsPerDay: number;
  activeRatio: number; // not-afk / (afk + not-afk)
  mostActiveDay?: { date: string; notAfkSeconds: number };
  leastActiveDay?: { date: string; notAfkSeconds: number };
  insights: string[];
};

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function clampDays(days: number): number {
  if (!Number.isFinite(days)) return 7;
  const n = Math.floor(days);
  if (n < 1) return 1;
  if (n > 31) return 31;
  return n;
}

function pickMostActive(records: DailyAfkRecord[]): { date: string; notAfkSeconds: number } | undefined {
  let best: { date: string; notAfkSeconds: number } | undefined;
  for (const r of records) {
    if (!best || r.notAfkSeconds > best.notAfkSeconds) {
      best = { date: r.date, notAfkSeconds: r.notAfkSeconds };
    }
  }
  return best;
}

function pickLeastActive(records: DailyAfkRecord[]): { date: string; notAfkSeconds: number } | undefined {
  let worst: { date: string; notAfkSeconds: number } | undefined;
  for (const r of records) {
    if (!worst || r.notAfkSeconds < worst.notAfkSeconds) {
      worst = { date: r.date, notAfkSeconds: r.notAfkSeconds };
    }
  }
  return worst;
}

function buildInsights(summary: Omit<WeeklyLifestyleSummary, "insights">): string[] {
  const insights: string[] = [];

  const avgActive = summary.avgNotAfkSecondsPerDay;
  const avgAfk = summary.avgAfkSecondsPerDay;
  const ratioPct = Math.round(summary.activeRatio * 100);

  insights.push(`Active ratio: ${ratioPct}% (not-afk / (afk + not-afk))`);

  if (avgActive < 2 * 3600) {
    insights.push("Your average active time looks low; consider scheduling a focused block daily.");
  } else if (avgActive > 8 * 3600) {
    insights.push("You had a very active week; make sure to protect recovery time.");
  }

  if (avgAfk > 12 * 3600) {
    insights.push("AFK time is high on average; this often indicates long breaks or sleep time being captured.");
  }

  if (summary.mostActiveDay && summary.leastActiveDay) {
    const gap = summary.mostActiveDay.notAfkSeconds - summary.leastActiveDay.notAfkSeconds;
    if (gap > 4 * 3600) {
      insights.push("Your week had large day-to-day variance; a consistent routine may improve stability.");
    }
  }

  return insights;
}

/**
 * Check if a day has meaningful data (more than 1 hour of total activity)
 */
function hasData(record: DailyAfkRecord): boolean {
  const totalSeconds = record.afkSeconds + record.notAfkSeconds;
  // Consider a day as having data if total activity > 1 hour
  return totalSeconds > 3600;
}

export function buildWeeklyLifestyleSummary(records: DailyAfkRecord[], daysInput?: number): WeeklyLifestyleSummary {
  const days = clampDays(daysInput ?? records.length);
  const trimmed = records.slice(-days);

  // Filter out days without meaningful data
  const daysWithData = trimmed.filter(hasData);

  // If no days have data, use all days but this should be rare
  const validDays = daysWithData.length > 0 ? daysWithData : trimmed;

  const totalAfkSeconds = sum(validDays.map(r => r.afkSeconds));
  const totalNotAfkSeconds = sum(validDays.map(r => r.notAfkSeconds));
  const total = totalAfkSeconds + totalNotAfkSeconds;

  const startDate = trimmed[0]?.date ?? "";
  const endDate = trimmed[trimmed.length - 1]?.date ?? "";

  // Calculate averages only for days with data
  const avgAfkSecondsPerDay = validDays.length > 0 ? totalAfkSeconds / validDays.length : 0;
  const avgNotAfkSecondsPerDay = validDays.length > 0 ? totalNotAfkSeconds / validDays.length : 0;

  const base = {
    startDate,
    endDate,
    days: trimmed.length, // Total days in period (for display)
    totalAfkSeconds,
    totalNotAfkSeconds,
    avgAfkSecondsPerDay,
    avgNotAfkSecondsPerDay,
    activeRatio: ratio(totalNotAfkSeconds, total),
    mostActiveDay: pickMostActive(validDays),
    leastActiveDay: pickLeastActive(validDays),
  };

  return {
    ...base,
    insights: buildInsights(base),
  };
}

export function createWeeklyLifestyleBlocks(summary: WeeklyLifestyleSummary, records: DailyAfkRecord[]): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  const titleRange = summary.startDate && summary.endDate ? `${summary.startDate} → ${summary.endDate}` : "Last 7 days";

  blocks.push(headerBlock(`📈 Weekly Lifestyle Report — ${titleRange}`));
  blocks.push(dividerBlock());

  const ratioPct = Math.round(summary.activeRatio * 100);
  blocks.push(
    fieldsBlock([
      `*🟢 Active ratio*\n${ratioPct}%`,
      `*📅 Days*\n${summary.days}`,
      summary.mostActiveDay?.date ? `*✅ Most active day*\n${summary.mostActiveDay.date}` : `*✅ Most active day*\n-`,
      summary.leastActiveDay?.date ?
        `*🫥 Least active day*\n${summary.leastActiveDay.date}`
      : `*🫥 Least active day*\n-`,
    ]),
  );

  blocks.push(dividerBlock());
  const dailyLines = records
    .slice(-summary.days)
    .map(r => `• *${r.date}*`)
    .join("\n");
  blocks.push(sectionBlock(`*🗓️ Daily breakdown*\n${dailyLines || "_No data_"} `));

  if (summary.insights.length > 0) {
    blocks.push(dividerBlock());
    const insightText = summary.insights.map(i => `• ${i}`).join("\n");
    blocks.push(sectionBlock(`*🧭 Habit insights*\n${insightText}`));
  }

  blocks.push(dividerBlock());
  blocks.push(contextBlock([`Generated from ActivityWatch AFK bucket. Active ratio: ${ratioPct}%`]));

  return blocks;
}
