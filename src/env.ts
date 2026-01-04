/**
 * Environment variable validation using t3-env
 *
 * All environment variables should be accessed through this module
 * to ensure type safety and runtime validation.
 */

import { createEnv } from "@t3-oss/env-core";
import { hostname as getHostname } from "os";
import { z } from "zod/v4";

export const env = createEnv({
  server: {
    // OpenAI API key for AI-powered report generation
    OPENAI_API_KEY: z.string(),

    // Slack webhook URL for sending notifications
    SLACK_WEBHOOK_URL: z.url(),

    // Slack Bot token (optional) for file uploads (e.g. SVG graph)
    SLACK_BOT_TOKEN: z.string().optional(),

    // Slack channel id (optional) used for file uploads
    SLACK_CHANNEL_ID: z.string().optional(),

    // ActivityWatch server URL (default: http://localhost:5600)
    ACTIVITYWATCH_URL: z.url().optional().default("http://localhost:5600"),

    // Hostname for ActivityWatch (default: system hostname)
    ACTIVITYWATCH_HOSTNAME: z.string().optional().default(getHostname()),

    // Log level
    LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional().default("INFO"),
  },

  /**
   * Bun loads .env automatically, so we use Bun.env directly
   */
  runtimeEnv: {
    OPENAI_API_KEY: Bun.env.OPENAI_API_KEY,
    SLACK_WEBHOOK_URL: Bun.env.SLACK_WEBHOOK_URL,
    SLACK_BOT_TOKEN: Bun.env.SLACK_BOT_TOKEN,
    SLACK_CHANNEL_ID: Bun.env.SLACK_CHANNEL_ID,
    ACTIVITYWATCH_URL: Bun.env.ACTIVITYWATCH_URL,
    ACTIVITYWATCH_HOSTNAME: Bun.env.ACTIVITYWATCH_HOSTNAME,
    LOG_LEVEL: Bun.env.LOG_LEVEL,
  },

  /**
   * Skip validation during build time
   */
  skipValidation: !!Bun.env.SKIP_ENV_VALIDATION,

  /**
   * Empty strings are treated as undefined for optional fields
   */
  emptyStringAsUndefined: true,
});
