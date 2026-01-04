import { describe, expect, mock, test } from "bun:test";
import { ok } from "neverthrow";

import type { AwConfig } from "../src/libs/activity-watch.ts";
import {
  buildWeeklyLifestyleSummary,
  createWeeklyLifestyleBlocks,
  type DailyAfkRecord,
} from "../src/libs/weekly-lifestyle.ts";
import { runWeeklyLifestyleCommand } from "../src/libs/weekly-lifestyle-command.ts";

describe("weekly lifestyle", () => {
  test("buildWeeklyLifestyleSummary computes totals and extrema", () => {
    const records: DailyAfkRecord[] = [
      { date: "2026-01-01", afkSeconds: 10, notAfkSeconds: 20 },
      { date: "2026-01-02", afkSeconds: 30, notAfkSeconds: 5 },
      { date: "2026-01-03", afkSeconds: 0, notAfkSeconds: 100 },
    ];

    const summary = buildWeeklyLifestyleSummary(records, 3);
    expect(summary.days).toBe(3);
    expect(summary.startDate).toBe("2026-01-01");
    expect(summary.endDate).toBe("2026-01-03");
    expect(summary.totalAfkSeconds).toBe(40);
    expect(summary.totalNotAfkSeconds).toBe(125);
    expect(summary.mostActiveDay?.date).toBe("2026-01-03");
    expect(summary.leastActiveDay?.date).toBe("2026-01-02");
  });

  test("buildWeeklyLifestyleSummary excludes days without data from average calculation", () => {
    const records: DailyAfkRecord[] = [
      { date: "2026-01-01", afkSeconds: 0, notAfkSeconds: 100 }, // < 1 hour, should be excluded
      { date: "2026-01-02", afkSeconds: 3600, notAfkSeconds: 7200 }, // 3 hours total, should be included
      { date: "2026-01-03", afkSeconds: 0, notAfkSeconds: 500 }, // < 1 hour, should be excluded
      { date: "2026-01-04", afkSeconds: 1800, notAfkSeconds: 5400 }, // 2 hours total, should be included
    ];

    const summary = buildWeeklyLifestyleSummary(records, 4);
    expect(summary.days).toBe(4); // Total days in period (for display)
    // Total includes only days with data (2026-01-02 and 2026-01-04)
    expect(summary.totalNotAfkSeconds).toBe(7200 + 5400); // 12600
    // Average should be calculated only from days with data (2026-01-02 and 2026-01-04)
    // (7200 + 5400) / 2 = 6300
    expect(summary.avgNotAfkSecondsPerDay).toBeCloseTo(6300, 0);
  });

  test("createWeeklyLifestyleBlocks returns blocks with a header", () => {
    const records: DailyAfkRecord[] = [
      { date: "2026-01-01", afkSeconds: 3600, notAfkSeconds: 3600 },
      { date: "2026-01-02", afkSeconds: 3600, notAfkSeconds: 7200 },
    ];
    const summary = buildWeeklyLifestyleSummary(records, 2);
    const blocks = createWeeklyLifestyleBlocks(summary, records);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]?.type).toBe("header");
  });

  test("runWeeklyLifestyleCommand fetches each day and sends to Slack", async () => {
    const fetchAfkMetrics = mock(async () => ok({ afkSeconds: 100, notAfkSeconds: 200 }));
    const fetchAfkEvents = mock(async () => ok([]));
    const fetchEditorProjects = mock(async () => ok({ projects: [] }));
    const uploadFile = mock(async () => ok({ permalink: "https://example.com/file", fileId: "F123" }));

    const awConfig: AwConfig = { baseUrl: "http://localhost:5600" };

    const result = await runWeeklyLifestyleCommand({
      now: new Date(2026, 0, 8, 12, 0, 0),
      days: 7,
      awConfig,
      slackConfig: { webhookUrl: "" },
      uploadConfig: { botToken: "xoxb-test", channelId: "C123" },
      fetchAfkMetrics,
      fetchAfkEvents,
      fetchEditorProjects,
      uploadFile,
      createHeatmapSvg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>`,
    });

    expect(result.isOk()).toBe(true);
    expect(fetchAfkMetrics.mock.calls.length).toBe(7);
    expect(uploadFile.mock.calls.length).toBe(1);
    // Ensure upload includes initialComment so the file message contains the report text
    const uploadCalls = uploadFile.mock.calls as unknown as Array<[unknown, { initialComment?: string }]>;
    const input = uploadCalls[0]?.[1];
    expect(input?.initialComment).toBeTruthy();
  });

  test("runWeeklyLifestyleCommand uploads graph and fetches projects", async () => {
    const fetchAfkMetrics = mock(async () => ok({ afkSeconds: 100, notAfkSeconds: 200 }));
    const fetchAfkEvents = mock(async () => ok([]));
    const fetchEditorProjects = mock(async () =>
      ok({
        projects: [
          { project: "my-project", seconds: 3600 },
          { project: "other-project", seconds: 1800 },
        ],
      }),
    );
    const uploadFile = mock(async () => ok({ permalink: "https://example.com/file", fileId: "F123" }));

    const awConfig: AwConfig = { baseUrl: "http://localhost:5600" };

    const result = await runWeeklyLifestyleCommand({
      now: new Date(2026, 0, 8, 12, 0, 0),
      days: 7,
      awConfig,
      slackConfig: { webhookUrl: "" },
      uploadConfig: { botToken: "xoxb-test", channelId: "C123" },
      fetchAfkMetrics,
      fetchAfkEvents,
      fetchEditorProjects,
      uploadFile,
      createHeatmapSvg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>`,
    });

    expect(result.isOk()).toBe(true);
    expect(uploadFile.mock.calls.length).toBe(1);
    expect(fetchEditorProjects.mock.calls.length).toBe(1);

    const uploadCalls = uploadFile.mock.calls as unknown as Array<[unknown, { initialComment?: string }]>;
    const input = uploadCalls[0]?.[1];
    expect(input?.initialComment).toBeTruthy();
  });
});
