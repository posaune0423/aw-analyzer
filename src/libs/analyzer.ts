/**
 * AI Analyzer wrapper for report generation
 */

import { err, ok, type Result } from "neverthrow";
import OpenAI from "openai";

import type { DailyMetrics } from "./activity-watch.ts";
import {
  SYSTEM_PROMPTS,
  buildAnalysisPrompt,
  generateFallbackAnalysis,
  type AnalysisResult,
  type PromptInput,
} from "./prompts.ts";
import { logger } from "../utils/logger.ts";

// ============================================================================
// Types
// ============================================================================

export type AnalyzerError =
  | { type: "config_error"; message: string }
  | { type: "api_error"; message: string }
  | { type: "parse_error"; message: string };

export type ReportInput = {
  period: { start: Date; end: Date };
  metrics: DailyMetrics;
  generatedAt: Date;
};

export type AnalyzerConfig = {
  apiKey: string;
  model?: string;
};

export type { AnalysisResult };

// ============================================================================
// AI Analysis Generation
// ============================================================================

export async function generateAnalysis(
  config: AnalyzerConfig,
  input: ReportInput,
): Promise<Result<AnalysisResult, AnalyzerError>> {
  if (!config.apiKey) {
    return err({ type: "config_error", message: "OpenAI API key not configured" });
  }

  const dateStr = input.period.start.toISOString().split("T")[0] ?? "";
  const promptInput: PromptInput = {
    date: dateStr,
    metrics: input.metrics,
  };

  try {
    const client = new OpenAI({ apiKey: config.apiKey });
    const prompt = buildAnalysisPrompt(promptInput);

    const response = await client.chat.completions.create({
      model: config.model ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.analyst },
        { role: "user", content: prompt },
      ],
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return err({ type: "parse_error", message: "Empty response from AI" });
    }

    // Parse JSON response
    const parsed = JSON.parse(content) as AnalysisResult;

    // Validate structure
    if (!parsed.summary || !Array.isArray(parsed.insights) || !parsed.tip) {
      return err({ type: "parse_error", message: "Invalid response structure" });
    }

    logger.debug("AI analysis generated");
    return ok(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error("Failed to parse AI response as JSON");
      return err({ type: "parse_error", message: "Invalid JSON response" });
    }
    const message = error instanceof Error ? error.message : "AI API error";
    logger.error("AI analysis generation failed", message);
    return err({ type: "api_error", message });
  }
}

// ============================================================================
// Fallback Analysis (when AI is unavailable)
// ============================================================================

export function getFallbackAnalysis(input: ReportInput): AnalysisResult {
  const dateStr = input.period.start.toISOString().split("T")[0] ?? "";
  return generateFallbackAnalysis({ date: dateStr, metrics: input.metrics });
}
