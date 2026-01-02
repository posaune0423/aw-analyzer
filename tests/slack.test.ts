/**
 * Slack utilities tests
 */

import { describe, expect, test } from "bun:test";

import { createSlackBlocks, markdownToSlack } from "../src/libs/slack.ts";

describe("markdownToSlack", () => {
  test("converts bold syntax", () => {
    expect(markdownToSlack("**bold**")).toBe("*bold*");
  });

  test("preserves inline code", () => {
    expect(markdownToSlack("`code`")).toBe("`code`");
  });

  test("converts headings to bold", () => {
    expect(markdownToSlack("# Heading")).toBe("*Heading*");
    expect(markdownToSlack("## Heading")).toBe("*Heading*");
    expect(markdownToSlack("### Heading")).toBe("*Heading*");
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
