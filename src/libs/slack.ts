/**
 * Slack webhook wrapper with Block Kit support
 */

import { IncomingWebhook, type IncomingWebhookSendArguments } from "@slack/webhook";
import { err, ok, type Result } from "neverthrow";

import { logger } from "../utils/logger.ts";

export type SlackError = { type: "slack_error"; message: string };

export type SlackConfig = {
  webhookUrl: string;
  username?: string;
  iconEmoji?: string;
};

// Block Kit types
export type HeaderBlock = {
  type: "header";
  text: { type: "plain_text"; text: string; emoji: boolean };
};

export type SectionBlock = {
  type: "section";
  text?: { type: "mrkdwn"; text: string };
  fields?: Array<{ type: "mrkdwn"; text: string }>;
};

export type DividerBlock = {
  type: "divider";
};

export type ContextBlock = {
  type: "context";
  elements: Array<{ type: "mrkdwn"; text: string }>;
};

export type SlackBlock = HeaderBlock | SectionBlock | DividerBlock | ContextBlock;

export async function sendSlackMessage(
  config: SlackConfig,
  message: { text: string; blocks?: SlackBlock[] },
): Promise<Result<void, SlackError>> {
  try {
    const webhook = new IncomingWebhook(config.webhookUrl, {
      username: config.username,
      icon_emoji: config.iconEmoji,
    });

    await webhook.send(message as IncomingWebhookSendArguments);
    logger.debug("Slack message sent");
    return ok(undefined);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Slack error";
    logger.error("Slack send failed", msg);
    return err({ type: "slack_error", message: msg });
  }
}

// ============================================================================
// Block Kit Builders
// ============================================================================

export function headerBlock(text: string): HeaderBlock {
  return {
    type: "header",
    text: { type: "plain_text", text, emoji: true },
  };
}

export function sectionBlock(text: string): SectionBlock {
  return {
    type: "section",
    text: { type: "mrkdwn", text },
  };
}

export function fieldsBlock(fields: string[]): SectionBlock {
  return {
    type: "section",
    fields: fields.map(text => ({ type: "mrkdwn" as const, text })),
  };
}

export function dividerBlock(): DividerBlock {
  return { type: "divider" };
}

export function contextBlock(texts: string[]): ContextBlock {
  return {
    type: "context",
    elements: texts.map(text => ({ type: "mrkdwn" as const, text })),
  };
}

/**
 * Convert markdown table to Slack-friendly format
 */
function convertMarkdownTable(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  for (const line of lines) {
    // Check if line is a table row (starts with |)
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      // Skip separator rows (|---|---|)
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) {
        continue;
      }

      inTable = true;
      // Parse table cells
      const cells = line
        .split("|")
        .slice(1, -1) // Remove empty first and last elements
        .map(cell => cell.trim());
      tableRows.push(cells);
    } else {
      // Flush table if we were in one
      if (inTable && tableRows.length > 0) {
        result.push(formatTableAsSlack(tableRows));
        tableRows = [];
        inTable = false;
      }
      result.push(line);
    }
  }

  // Handle table at end of content
  if (tableRows.length > 0) {
    result.push(formatTableAsSlack(tableRows));
  }

  return result.join("\n");
}

/**
 * Format table rows as Slack-friendly text
 */
function formatTableAsSlack(rows: string[][]): string {
  if (rows.length === 0) return "";

  // Check if first row is header (usually Metric | Value pattern)
  const hasHeader = rows.length > 1;
  const output: string[] = [];
  const header = rows[0];

  if (hasHeader && header) {
    // Skip header row for simple key-value tables
    const isKeyValueTable = header.length === 2;

    if (isKeyValueTable) {
      // Format as key: value pairs
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row && row.length >= 2) {
          const key = row[0];
          const value = row[1];
          if (key && value && value !== "-") {
            output.push(`• *${key}*: ${value}`);
          }
        }
      }
    } else {
      // Format as list items
      for (const row of rows) {
        if (row) {
          output.push(`• ${row.join(" | ")}`);
        }
      }
    }
  } else {
    for (const row of rows) {
      if (row) {
        output.push(`• ${row.join(" | ")}`);
      }
    }
  }

  return output.join("\n");
}

/**
 * Convert markdown to Slack mrkdwn format
 */
export function markdownToSlack(markdown: string): string {
  let result = markdown;

  // Remove code block markers (```markdown, ```, etc.)
  result = result.replace(/```\w*\n?/g, "");

  // Convert tables first (before other transformations)
  result = convertMarkdownTable(result);

  // Convert headers
  result = result.replace(/^### (.+)$/gm, "*$1*");
  result = result.replace(/^## (.+)$/gm, "\n*$1*");
  result = result.replace(/^# (.+)$/gm, "\n*$1*");

  // Convert bold (**text** -> *text*)
  result = result.replace(/\*\*(.+?)\*\*/g, "*$1*");

  // Convert italic (_text_ stays the same, but __text__ -> _text_)
  result = result.replace(/__(.+?)__/g, "_$1_");

  // Convert list items (- item -> • item)
  result = result.replace(/^- (.+)$/gm, "• $1");
  result = result.replace(/^\* (.+)$/gm, "• $1");

  // Convert horizontal rules
  result = result.replace(/^---+$/gm, "───────────");

  // Clean up excessive newlines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

/**
 * Create Slack blocks from markdown
 */
export function createSlackBlocks(markdown: string): SlackBlock[] {
  const sections = markdown.split("\n\n").filter(s => s.trim());

  return sections.map(section => ({
    type: "section" as const,
    text: { type: "mrkdwn" as const, text: markdownToSlack(section) },
  }));
}

// ============================================================================
// Rich Report Blocks
// ============================================================================

export type ReportData = {
  date: string;
  workTime: string;
  maxContinuous: string;
  nightWork: string;
  topApps: Array<{ app: string; time: string }>;
  summary?: string;
  insights?: string[];
  tip?: string;
  awBaseUrl?: string;
  hostname?: string;
};

/**
 * Create rich Slack blocks for daily report
 */
export function createReportBlocks(data: ReportData): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push(headerBlock(`📊 Daily Activity Report — ${data.date}`));

  // Summary section
  if (data.summary) {
    blocks.push(sectionBlock(`✨ ${data.summary}`));
  }

  blocks.push(dividerBlock());

  // Key Metrics (2-column layout)
  blocks.push(
    fieldsBlock([
      `*⏱️ Total Work Time*\n${data.workTime}`,
      `*🔥 Max Continuous*\n${data.maxContinuous}`,
      `*🌙 Night Work*\n${data.nightWork}`,
      `*📅 Date*\n${data.date}`,
    ]),
  );

  blocks.push(dividerBlock());

  // Top Applications
  if (data.topApps.length > 0) {
    const appsText = data.topApps
      .map((app, i) => {
        const medal =
          i === 0 ? "🥇"
          : i === 1 ? "🥈"
          : i === 2 ? "🥉"
          : "•";
        return `${medal} *${app.app}*: ${app.time}`;
      })
      .join("\n");
    blocks.push(sectionBlock(`*💻 Top Applications*\n${appsText}`));
  } else {
    blocks.push(sectionBlock("*💻 Top Applications*\n_No data available_"));
  }

  // AI Insights section
  if (data.insights && data.insights.length > 0) {
    blocks.push(dividerBlock());
    blocks.push(sectionBlock("*🧠 AI Insights*"));
    const insightsText = data.insights.map(insight => `• ${insight}`).join("\n");
    blocks.push(sectionBlock(insightsText));
  }

  // Tip footer
  if (data.tip) {
    blocks.push(dividerBlock());
    blocks.push(contextBlock([`💡 *Tip*: ${data.tip}`]));
  }

  // Dashboard links
  if (data.awBaseUrl) {
    const baseUrl = data.awBaseUrl.replace(/\/$/, ""); // Remove trailing slash
    const hostname = data.hostname ?? "localhost";

    blocks.push(dividerBlock());
    blocks.push(
      sectionBlock(
        `*🔗 ActivityWatch Dashboard*\n` +
          `<${baseUrl}/#/activity/${hostname}/view|📊 Activity View> • ` +
          `<${baseUrl}/#/timeline|📅 Timeline>`,
      ),
    );
  }

  return blocks;
}
