/**
 * AI Prompts for Report Generation
 *
 * All prompts are centralized here for easy management and customization.
 */

import type { DailyMetrics } from "./activity-watch.ts";
import { formatDuration } from "../utils/date-utils.ts";

// ============================================================================
// Types
// ============================================================================

export type PromptInput = {
  date: string;
  metrics: DailyMetrics;
};

export type AnalysisResult = {
  summary: string;
  insights: string[];
  tip: string;
};

// ============================================================================
// System Prompts
// ============================================================================

export const SYSTEM_PROMPTS = {
  analyst: `You are a friendly productivity coach analyzing daily activity data.
Your tone is encouraging and constructive.
You provide actionable insights based on work patterns.
Always respond in the exact JSON format requested.`,
} as const;

// ============================================================================
// Analysis Prompt
// ============================================================================

export function buildAnalysisPrompt(input: PromptInput): string {
  const { date, metrics } = input;
  const topAppsStr =
    metrics.topApps
      .slice(0, 5)
      .map(a => `- ${a.app}: ${formatDuration(a.seconds)}`)
      .join("\n") || "- No data";

  const workHours = metrics.workSeconds / 3600;
  const continuousHours = metrics.maxContinuousSeconds / 3600;
  const nightWorkHours = metrics.nightWorkSeconds / 3600;

  return `Analyze the following daily activity data and provide insights.

## Activity Data for ${date}

- Total Work Time: ${formatDuration(metrics.workSeconds)} (${workHours.toFixed(1)} hours)
- Max Continuous Session: ${formatDuration(metrics.maxContinuousSeconds)} (${continuousHours.toFixed(1)} hours)
- Night Work Time: ${formatDuration(metrics.nightWorkSeconds)} (${nightWorkHours.toFixed(1)} hours)
- AFK Time: ${formatDuration(metrics.afkSeconds)}

### Top Applications Used:
${topAppsStr}

## Instructions

Respond with a JSON object containing exactly these fields:

{
  "summary": "A 2-3 sentence summary of the day's productivity. Be encouraging and constructive.",
  "insights": [
    "First insight about work patterns (e.g., focus sessions, app usage)",
    "Second insight with actionable observation",
    "Third insight or positive reinforcement"
  ],
  "tip": "One actionable productivity tip based on the data"
}

## Guidelines

1. **Summary**: Highlight achievements, note the total work time, and mention any notable patterns.
2. **Insights**: Provide 2-3 specific observations:
   - Comment on focus session length (good if > 45min, suggest breaks if > 2h)
   - Note dominant applications and what they suggest about the work type
   - If night work > 0, gently suggest better work-life balance
   - If AFK time is high relative to work time, note potential interruptions
3. **Tip**: Provide ONE actionable tip relevant to the data:
   - If continuous session > 1.5h: suggest Pomodoro technique
   - If work time < 4h: encourage maintaining momentum
   - If work time > 8h: suggest rest and recovery
   - If night work present: suggest setting work boundaries

Respond ONLY with valid JSON, no markdown code blocks or extra text.`;
}

// ============================================================================
// Fallback Analysis (when AI is unavailable)
// ============================================================================

export function generateFallbackAnalysis(input: PromptInput): AnalysisResult {
  const { metrics } = input;
  const workHours = metrics.workSeconds / 3600;
  const continuousHours = metrics.maxContinuousSeconds / 3600;

  // Generate summary based on work hours
  let summary: string;
  if (workHours >= 8) {
    summary = `Impressive dedication today with ${formatDuration(metrics.workSeconds)} of work! Your longest focus session was ${formatDuration(metrics.maxContinuousSeconds)}.`;
  } else if (workHours >= 6) {
    summary = `Solid work day with ${formatDuration(metrics.workSeconds)} logged. Great job maintaining focus!`;
  } else if (workHours >= 4) {
    summary = `Productive session today with ${formatDuration(metrics.workSeconds)} of focused work.`;
  } else if (workHours >= 2) {
    summary = `You put in ${formatDuration(metrics.workSeconds)} today. Every bit of progress counts!`;
  } else {
    summary = `Light activity day with ${formatDuration(metrics.workSeconds)} recorded. Rest days are important too!`;
  }

  // Generate insights
  const insights: string[] = [];

  // Focus session insight
  if (continuousHours >= 2) {
    insights.push(
      `🔥 Your ${formatDuration(metrics.maxContinuousSeconds)} focus session shows excellent concentration. Consider short breaks to maintain this intensity.`,
    );
  } else if (continuousHours >= 1) {
    insights.push(
      `✨ Nice focus session of ${formatDuration(metrics.maxContinuousSeconds)}! This is a healthy session length.`,
    );
  } else if (continuousHours > 0) {
    insights.push(
      `📊 Your longest session was ${formatDuration(metrics.maxContinuousSeconds)}. Try extending focus periods gradually.`,
    );
  }

  // App usage insight
  if (metrics.topApps.length > 0) {
    const topApp = metrics.topApps[0];
    if (topApp) {
      insights.push(
        `💻 ${topApp.app} was your primary tool today (${formatDuration(topApp.seconds)}). Staying focused on key tools boosts productivity!`,
      );
    }
  }

  // Night work insight
  if (metrics.nightWorkSeconds > 0) {
    insights.push(
      `🌙 You logged ${formatDuration(metrics.nightWorkSeconds)} of evening work. Consider setting work boundaries for better rest.`,
    );
  } else if (insights.length < 3) {
    insights.push(`🌟 Great job keeping your work within regular hours!`);
  }

  // Generate tip
  let tip: string;
  if (continuousHours > 1.5) {
    tip = "Try the Pomodoro technique: 25min work, 5min break. It helps maintain focus without burnout.";
  } else if (workHours > 8) {
    tip = "You've put in a long day! Prioritize rest tonight to recharge for tomorrow.";
  } else if (workHours < 2) {
    tip = "Small steps lead to big achievements. Set one clear goal for your next session.";
  } else {
    tip = "Keep up the momentum! Consistency is the key to long-term productivity.";
  }

  return { summary, insights, tip };
}
