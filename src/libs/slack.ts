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

export type ImageBlock = {
  type: "image";
  image_url?: string;
  slack_file?: { url?: string; id?: string };
  alt_text: string;
  title?: { type: "plain_text"; text: string; emoji?: boolean };
};

export type DividerBlock = {
  type: "divider";
};

export type ContextBlock = {
  type: "context";
  elements: Array<{ type: "mrkdwn"; text: string }>;
};

export type SlackBlock = HeaderBlock | SectionBlock | ImageBlock | DividerBlock | ContextBlock;

/**
 * Validate blocks before sending to Slack
 */
function validateBlocks(blocks: SlackBlock[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Maximum 50 blocks per message
  if (blocks.length > 50) {
    errors.push(`Too many blocks: ${blocks.length} (max 50)`);
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;

    // Validate section blocks with fields
    if (block.type === "section" && block.fields) {
      if (block.fields.length === 0 || block.fields.length > 10) {
        errors.push(`Block ${i}: Invalid field count ${block.fields.length} (must be 1-10)`);
      }
      for (let j = 0; j < block.fields.length; j++) {
        const field = block.fields[j];
        if (field && field.text && field.text.length > 2000) {
          errors.push(`Block ${i}, Field ${j}: Text exceeds 2000 characters (${field.text.length} chars)`);
        }
      }
      // Fields should be even number for 2-column layout (best practice)
      if (block.fields.length > 0 && block.fields.length % 2 !== 0) {
        errors.push(`Block ${i}: Field count ${block.fields.length} is odd (should be even for 2-column layout)`);
      }
    }

    // Validate section blocks with text
    if (block.type === "section" && block.text) {
      if (block.text.text && block.text.text.length > 3000) {
        errors.push(`Block ${i}: Section text exceeds 3000 characters (${block.text.text.length} chars)`);
      }
    }

    // Validate header blocks
    if (block.type === "header" && block.text) {
      if (block.text.text && block.text.text.length > 150) {
        errors.push(`Block ${i}: Header text exceeds 150 characters (${block.text.text.length} chars)`);
      }
    }

    // Validate image blocks
    if (block.type === "image") {
      // Image block must have either image_url or slack_file
      if (!block.image_url && !block.slack_file) {
        errors.push(`Block ${i}: Image block must have either image_url or slack_file`);
      }
      if (block.image_url && block.image_url.length > 3000) {
        errors.push(`Block ${i}: Image image_url exceeds 3000 characters (${block.image_url.length} chars)`);
      }
      if (block.alt_text && block.alt_text.length > 2000) {
        errors.push(`Block ${i}: Image alt_text exceeds 2000 characters (${block.alt_text.length} chars)`);
      }
      if (block.title && block.title.text && block.title.text.length > 2000) {
        errors.push(`Block ${i}: Image title exceeds 2000 characters (${block.title.text.length} chars)`);
      }
      // Validate image_url is a valid URL format (if provided)
      if (block.image_url && !block.image_url.match(/^https?:\/\//)) {
        errors.push(`Block ${i}: Image image_url must be a valid HTTP/HTTPS URL`);
      }
      // Validate slack_file has either url or id
      if (block.slack_file && !block.slack_file.url && !block.slack_file.id) {
        errors.push(`Block ${i}: Image slack_file must have either url or id`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function sendSlackMessage(
  config: SlackConfig,
  message: { text: string; blocks?: SlackBlock[] },
): Promise<Result<void, SlackError>> {
  try {
    // Validate blocks before sending
    if (message.blocks) {
      const validation = validateBlocks(message.blocks);
      if (!validation.valid) {
        const errorMsg = `Block validation failed: ${validation.errors.join("; ")}`;
        logger.error("Slack block validation failed", errorMsg);
        return err({ type: "slack_error", message: errorMsg });
      }
    }

    const webhook = new IncomingWebhook(config.webhookUrl, {
      username: config.username,
      icon_emoji: config.iconEmoji,
    });

    await webhook.send(message as IncomingWebhookSendArguments);
    logger.debug("Slack message sent");
    return ok(undefined);
  } catch (error) {
    // Extract detailed error information from @slack/webhook error
    let errorMessage = "Slack error";
    let errorDetails: string | undefined;

    if (error instanceof Error) {
      errorMessage = error.message;
      // @slack/webhook errors may have code, data, and original properties
      const slackError = error as Error & {
        code?: string;
        data?: unknown;
        statusCode?: number;
        original?: { message?: string; response?: { data?: unknown } };
      };

      const parts: string[] = [];

      if (slackError.code) {
        parts.push(`Code: ${slackError.code}`);
      }
      if (slackError.statusCode) {
        parts.push(`Status: ${slackError.statusCode}`);
      }

      // Try to extract error details from data property
      if (slackError.data) {
        try {
          const dataStr =
            typeof slackError.data === "string" ? slackError.data : JSON.stringify(slackError.data, null, 2);
          parts.push(`Data: ${dataStr}`);
        } catch {
          parts.push(`Data: [unable to stringify]`);
        }
      }

      // Try to extract error details from original.response.data (common in HTTP errors)
      if (slackError.original?.response?.data) {
        try {
          const responseDataStr =
            typeof slackError.original.response.data === "string" ?
              slackError.original.response.data
            : JSON.stringify(slackError.original.response.data, null, 2);
          parts.push(`Response: ${responseDataStr}`);
        } catch {
          parts.push(`Response: [unable to stringify]`);
        }
      }

      if (parts.length > 0) {
        errorDetails = parts.join(", ");
      }
    }

    const fullMessage = errorDetails ? `${errorMessage} (${errorDetails})` : errorMessage;
    logger.error("Slack send failed", fullMessage);

    // Log the message payload for debugging (without sensitive data)
    // Also log block structure to help identify validation issues
    if (message.blocks) {
      const blockSummary = message.blocks.map((b, i) => {
        const summary: {
          index: number;
          type: string;
          fields?: number;
          textLength?: number;
          imageUrl?: string;
          altText?: string;
        } = {
          index: i,
          type: b.type,
        };
        if (b.type === "section" && b.fields) {
          summary.fields = b.fields.length;
          summary.textLength = b.fields.reduce((sum, f) => sum + (f.text?.length ?? 0), 0);
        }
        if (b.type === "section" && b.text) {
          summary.textLength = b.text.text?.length ?? 0;
        }
        if (b.type === "image") {
          summary.imageUrl = b.image_url?.substring(0, 100) + (b.image_url && b.image_url.length > 100 ? "..." : "");
          summary.altText = b.alt_text?.substring(0, 50) + (b.alt_text && b.alt_text.length > 50 ? "..." : "");
        }
        return summary;
      });
      logger.debug("Failed message payload", {
        text: message.text,
        blocksCount: message.blocks.length,
        blockSummary,
      });
      // Log full block structure for image blocks to debug
      const imageBlocks = message.blocks.filter(b => b.type === "image");
      if (imageBlocks.length > 0) {
        logger.debug("Image blocks detail", JSON.stringify(imageBlocks, null, 2));
      }
    } else {
      logger.debug("Failed message payload", { text: message.text, blocksCount: 0 });
    }

    return err({ type: "slack_error", message: fullMessage });
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
  // Validate fields according to Slack Block Kit constraints
  // Fields must be between 1 and 10 items
  if (fields.length === 0 || fields.length > 10) {
    logger.warn(`fieldsBlock: Invalid field count ${fields.length}, must be between 1 and 10`);
  }
  // Each field text must be max 2000 characters
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field && field.length > 2000) {
      logger.warn(`fieldsBlock: Field ${i} exceeds 2000 character limit (${field.length} chars)`);
    }
  }

  return {
    type: "section",
    fields: fields.map(text => ({ type: "mrkdwn" as const, text })),
  };
}

export function dividerBlock(): DividerBlock {
  return { type: "divider" };
}

export function imageBlock(input: {
  imageUrl?: string;
  slackFileUrl?: string;
  slackFileId?: string;
  altText: string;
  title?: string;
}): SlackBlock {
  // Validate input according to Slack Block Kit constraints
  if (input.imageUrl && input.imageUrl.length > 3000) {
    logger.warn(`imageBlock: image_url exceeds 3000 character limit (${input.imageUrl.length} chars)`);
    return sectionBlock(`⚠️ Image omitted: URL too long (${input.imageUrl.length} chars)`);
  }
  if (input.altText.length > 2000) {
    logger.warn(`imageBlock: alt_text exceeds 2000 character limit (${input.altText.length} chars)`);
    // Truncate alt text instead of failing
    input.altText = input.altText.substring(0, 1997) + "...";
  }
  if (input.title && input.title.length > 2000) {
    logger.warn(`imageBlock: title exceeds 2000 character limit (${input.title.length} chars)`);
    // Truncate title
    input.title = input.title.substring(0, 1997) + "...";
  }

  // Determine if we should use image_url or slack_file
  // If imageUrl is a slack-files.com URL, use slack_file instead
  const isSlackFileUrl = input.imageUrl?.includes("slack-files.com") || input.imageUrl?.includes("files.slack.com");

  const block: ImageBlock = {
    type: "image",
    alt_text: input.altText,
    // title is optional and emoji field is also optional per Slack docs
    title: input.title ? { type: "plain_text", text: input.title, emoji: true } : undefined,
  };

  let validSource = false;

  if (isSlackFileUrl && input.imageUrl) {
    // Use slack_file with url for Slack file URLs
    block.slack_file = { url: input.imageUrl };
    validSource = true;
  } else if (input.slackFileUrl) {
    // Use slack_file with url
    block.slack_file = { url: input.slackFileUrl };
    validSource = true;
  } else if (input.slackFileId) {
    // Use slack_file with id
    block.slack_file = { id: input.slackFileId };
    validSource = true;
  } else if (input.imageUrl) {
    // Use image_url for public URLs
    // Ensure URL is valid http/https
    if (input.imageUrl.match(/^https?:\/\//)) {
      block.image_url = input.imageUrl;
      validSource = true;
    } else {
      logger.warn(`imageBlock: Invalid URL protocol in imageUrl: ${input.imageUrl}`);
    }
  }

  if (!validSource) {
    logger.warn("imageBlock: No valid image source provided");
    return sectionBlock("⚠️ Image omitted: No valid source provided");
  }

  return block;
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
