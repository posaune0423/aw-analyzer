/**
 * Analyzer tests
 */

import { describe, expect, test } from "bun:test";

import { generateFallbackReport, type ReportInput } from "../src/libs/analyzer.ts";

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

describe("generateFallbackReport", () => {
  test("generates markdown report with correct structure", () => {
    const report = generateFallbackReport(testInput);

    expect(report).toContain("# Activity Report");
    expect(report).toContain("## Summary");
    expect(report).toContain("## Key Metrics");
    expect(report).toContain("## Top Applications");
  });

  test("includes period dates", () => {
    const report = generateFallbackReport(testInput);

    expect(report).toContain("2026-01-01");
  });

  test("includes formatted metrics", () => {
    const report = generateFallbackReport(testInput);

    expect(report).toContain("8h"); // workSeconds
    expect(report).toContain("1h 30m"); // maxContinuousSeconds
  });

  test("includes top applications", () => {
    const report = generateFallbackReport(testInput);

    expect(report).toContain("VS Code");
    expect(report).toContain("Chrome");
    expect(report).toContain("Slack");
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

    const report = generateFallbackReport(emptyInput);

    expect(report).toContain("# Activity Report");
    expect(report).toContain("0s");
    expect(report).toContain("No data");
  });
});
