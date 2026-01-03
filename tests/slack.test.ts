/**
 * Slack utilities tests
 */

import { describe, expect, test } from "bun:test";

import {
  createSlackBlocks,
  createReportBlocks,
  markdownToSlack,
  headerBlock,
  sectionBlock,
  dividerBlock,
  contextBlock,
  fieldsBlock,
  type ReportData,
} from "../src/libs/slack.ts";

describe("markdownToSlack", () => {
  test("converts bold syntax", () => {
    expect(markdownToSlack("**bold**")).toBe("*bold*");
  });

  test("preserves inline code", () => {
    expect(markdownToSlack("`code`")).toBe("`code`");
  });

  test("converts headings to bold", () => {
    expect(markdownToSlack("# Heading")).toContain("*Heading*");
    expect(markdownToSlack("## Heading")).toContain("*Heading*");
    expect(markdownToSlack("### Heading")).toBe("*Heading*");
  });

  test("converts list items to bullet points", () => {
    expect(markdownToSlack("- item")).toBe("• item");
    expect(markdownToSlack("* item")).toBe("• item");
  });

  test("converts horizontal rules", () => {
    expect(markdownToSlack("---")).toBe("───────────");
  });

  test("removes code block markers", () => {
    const input = "```markdown\nSome content\n```";
    expect(markdownToSlack(input)).toBe("Some content");
  });

  test("converts key-value table to bullet list", () => {
    const input = `| Metric | Value |
|--------|-------|
| Total Work Time | 2h 30m |
| Max Session | 1h 15m |`;

    const result = markdownToSlack(input);
    expect(result).toContain("• *Total Work Time*: 2h 30m");
    expect(result).toContain("• *Max Session*: 1h 15m");
    expect(result).not.toContain("|");
  });

  test("converts application table to bullet list", () => {
    const input = `| Application | Time |
|-------------|------|
| VS Code | 1h 30m |
| Chrome | 45m |`;

    const result = markdownToSlack(input);
    expect(result).toContain("• *VS Code*: 1h 30m");
    expect(result).toContain("• *Chrome*: 45m");
  });

  test("handles real AI report format", () => {
    const input = `## Summary
The activity report shows moderate productivity.

## Key Metrics
- Total Work Time: 0 seconds
- Max Continuous Session: 0 seconds

## Notable Changes
No data available.`;

    const result = markdownToSlack(input);
    expect(result).toContain("*Summary*");
    expect(result).toContain("*Key Metrics*");
    expect(result).toContain("• Total Work Time: 0 seconds");
    expect(result).not.toContain("##");
  });

  test("handles wrapped code block report", () => {
    const input = `\`\`\`markdown
Summary
The activity report for the period shows no recorded work time.
Key Metrics
- Total Work Time: 0 seconds
\`\`\``;

    const result = markdownToSlack(input);
    expect(result).not.toContain("```");
    expect(result).toContain("Summary");
    expect(result).toContain("• Total Work Time: 0 seconds");
  });
});

describe("createSlackBlocks", () => {
  test("creates section blocks from paragraphs", () => {
    const markdown = "First paragraph\n\nSecond paragraph";
    const blocks = createSlackBlocks(markdown);

    expect(blocks).toHaveLength(2);
    expect((blocks[0] as { type: string }).type).toBe("section");
  });

  test("filters empty sections", () => {
    const markdown = "Content\n\n\n\nMore content";
    const blocks = createSlackBlocks(markdown);

    expect(blocks).toHaveLength(2);
  });
});

describe("Block Kit builders", () => {
  test("headerBlock creates header with emoji", () => {
    const block = headerBlock("📊 Test Header");
    expect(block.type).toBe("header");
    expect(block.text.type).toBe("plain_text");
    expect(block.text.text).toBe("📊 Test Header");
    expect(block.text.emoji).toBe(true);
  });

  test("sectionBlock creates mrkdwn section", () => {
    const block = sectionBlock("*Bold* text");
    expect(block.type).toBe("section");
    expect(block.text?.type).toBe("mrkdwn");
    expect(block.text?.text).toBe("*Bold* text");
  });

  test("fieldsBlock creates multi-column layout", () => {
    const block = fieldsBlock(["Field 1", "Field 2", "Field 3"]);
    expect(block.type).toBe("section");
    expect(block.fields).toHaveLength(3);
    expect(block.fields?.[0]?.type).toBe("mrkdwn");
  });

  test("dividerBlock creates divider", () => {
    const block = dividerBlock();
    expect(block.type).toBe("divider");
  });

  test("contextBlock creates footer", () => {
    const block = contextBlock(["💡 Tip: Take breaks!"]);
    expect(block.type).toBe("context");
    expect(block.elements).toHaveLength(1);
    expect(block.elements[0]?.text).toBe("💡 Tip: Take breaks!");
  });
});

describe("createReportBlocks", () => {
  test("creates complete report with all sections", () => {
    const data: ReportData = {
      date: "2026-01-02",
      workTime: "3h 52m",
      maxContinuous: "1h 24m",
      nightWork: "0s",
      topApps: [
        { app: "Cursor", time: "1h 24m" },
        { app: "Arc", time: "1h 15m" },
      ],
      summary: "Great productivity today!",
      tip: "Keep up the momentum!",
    };

    const blocks = createReportBlocks(data);

    // Should have: header, summary section, divider, fields, divider, apps, divider, context
    expect(blocks.length).toBeGreaterThanOrEqual(6);

    // First block should be header
    expect(blocks[0]?.type).toBe("header");

    // Should contain fields block
    const fieldsBlk = blocks.find(b => b.type === "section" && "fields" in b);
    expect(fieldsBlk).toBeDefined();

    // Should contain dividers
    const dividers = blocks.filter(b => b.type === "divider");
    expect(dividers.length).toBeGreaterThanOrEqual(2);

    // Should contain context (tip)
    const ctx = blocks.find(b => b.type === "context");
    expect(ctx).toBeDefined();
  });

  test("shows medals for top 3 apps", () => {
    const data: ReportData = {
      date: "2026-01-02",
      workTime: "5h",
      maxContinuous: "2h",
      nightWork: "0s",
      topApps: [
        { app: "App1", time: "2h" },
        { app: "App2", time: "1h 30m" },
        { app: "App3", time: "1h" },
        { app: "App4", time: "30m" },
      ],
    };

    const blocks = createReportBlocks(data);
    const appsBlock = blocks.find(b => b.type === "section" && b.text?.text?.includes("Top Applications"));

    expect(appsBlock).toBeDefined();
    if (appsBlock && appsBlock.type === "section" && appsBlock.text) {
      expect(appsBlock.text.text).toContain("🥇");
      expect(appsBlock.text.text).toContain("🥈");
      expect(appsBlock.text.text).toContain("🥉");
    }
  });

  test("handles empty apps gracefully", () => {
    const data: ReportData = {
      date: "2026-01-02",
      workTime: "0s",
      maxContinuous: "0s",
      nightWork: "0s",
      topApps: [],
    };

    const blocks = createReportBlocks(data);
    const appsBlock = blocks.find(b => b.type === "section" && b.text?.text?.includes("Top Applications"));

    expect(appsBlock).toBeDefined();
    if (appsBlock && appsBlock.type === "section" && appsBlock.text) {
      expect(appsBlock.text.text).toContain("No data available");
    }
  });

  test("includes dashboard links when awBaseUrl is provided", () => {
    const data: ReportData = {
      date: "2026-01-02",
      workTime: "3h 52m",
      maxContinuous: "1h 24m",
      nightWork: "0s",
      topApps: [{ app: "Cursor", time: "1h 24m" }],
      awBaseUrl: "http://127.0.0.1:5600",
      hostname: "Asumas-MacBook-Pro.local",
    };

    const blocks = createReportBlocks(data);
    const linkBlock = blocks.find(b => b.type === "section" && b.text?.text?.includes("ActivityWatch Dashboard"));

    expect(linkBlock).toBeDefined();
    if (linkBlock && linkBlock.type === "section" && linkBlock.text) {
      expect(linkBlock.text.text).toContain("http://127.0.0.1:5600/#/activity/Asumas-MacBook-Pro.local/view");
      expect(linkBlock.text.text).toContain("http://127.0.0.1:5600/#/timeline");
    }
  });

  test("does not include dashboard links when awBaseUrl is missing", () => {
    const data: ReportData = {
      date: "2026-01-02",
      workTime: "3h 52m",
      maxContinuous: "1h 24m",
      nightWork: "0s",
      topApps: [{ app: "Cursor", time: "1h 24m" }],
    };

    const blocks = createReportBlocks(data);
    const linkBlock = blocks.find(b => b.type === "section" && b.text?.text?.includes("ActivityWatch Dashboard"));

    expect(linkBlock).toBeUndefined();
  });
});
