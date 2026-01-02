/**
 * Slack webhook wrapper
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

export type SlackBlock = {
  type: "section";
  text: { type: "mrkdwn"; text: string };
};

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

/**
 * Convert markdown to Slack mrkdwn format (basic conversion)
 */
export function markdownToSlack(markdown: string): string {
  return markdown
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // Bold
    .replace(/`([^`]+)`/g, "`$1`") // Code
    .replace(/^### (.+)$/gm, "*$1*") // H3
    .replace(/^## (.+)$/gm, "*$1*") // H2
    .replace(/^# (.+)$/gm, "*$1*"); // H1
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
