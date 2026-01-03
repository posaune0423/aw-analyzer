/**
 * Analyzer tests
 */

import { describe, expect, test } from "bun:test";

import { getFallbackAnalysis, type ReportInput } from "../src/libs/analyzer.ts";

const testInput: ReportInput = {
  period: {
    start: new Date("2026-01-01T00:00:00Z"),
    end: new Date("2026-01-01T23:59:59Z"),
  },
  metrics: {
    workSeconds: 28800, // 8 hours
    afkSeconds: 3600,
    nightWorkSeconds: 0,
    maxContinuousSeconds: 5400, // 1.5 hours
    topApps: [
      { app: "VS Code", seconds: 14400 },
      { app: "Chrome", seconds: 7200 },
      { app: "Slack", seconds: 3600 },
    ],
  },
  generatedAt: new Date("2026-01-02T09:00:00Z"),
};

describe("getFallbackAnalysis", () => {
  test("returns analysis with summary, insights, and tip", () => {
    const analysis = getFallbackAnalysis(testInput);

    expect(analysis.summary).toBeDefined();
    expect(analysis.summary.length).toBeGreaterThan(0);
    expect(analysis.insights).toBeInstanceOf(Array);
    expect(analysis.insights.length).toBeGreaterThan(0);
    expect(analysis.tip).toBeDefined();
    expect(analysis.tip.length).toBeGreaterThan(0);
  });

  test("summary mentions work time", () => {
    const analysis = getFallbackAnalysis(testInput);

    expect(analysis.summary).toContain("8h");
  });

  test("generates insights about focus sessions", () => {
    const analysis = getFallbackAnalysis(testInput);

    // Should have insight about 1h 30m focus session
    const hasSessionInsight = analysis.insights.some(i => i.includes("1h 30m") || i.includes("focus"));
    expect(hasSessionInsight).toBe(true);
  });

  test("generates insights about top apps", () => {
    const analysis = getFallbackAnalysis(testInput);

    const hasAppInsight = analysis.insights.some(i => i.includes("VS Code"));
    expect(hasAppInsight).toBe(true);
  });

  test("handles empty metrics gracefully", () => {
    const emptyInput: ReportInput = {
      period: { start: new Date(), end: new Date() },
      metrics: {
        workSeconds: 0,
        afkSeconds: 0,
        nightWorkSeconds: 0,
        maxContinuousSeconds: 0,
        topApps: [],
      },
      generatedAt: new Date(),
    };

    const analysis = getFallbackAnalysis(emptyInput);

    expect(analysis.summary).toBeDefined();
    expect(analysis.tip).toBeDefined();
  });

  test("provides appropriate tip for long work hours", () => {
    const longDayInput: ReportInput = {
      ...testInput,
      metrics: {
        ...testInput.metrics,
        workSeconds: 36000, // 10 hours
      },
    };

    const analysis = getFallbackAnalysis(longDayInput);

    // Should suggest rest
    expect(analysis.tip.toLowerCase()).toMatch(/rest|recover|recharge/);
  });
});
