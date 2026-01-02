/**
 * Notification wrapper - supports macOS native notifications and test mock
 */

import { err, ok, type Result } from "neverthrow";

import { logger } from "../utils/logger.ts";

export type NotifyError = { type: "notify_error"; message: string };
export type NotifyInput = { title: string; body: string; soundName?: string };

export async function sendMacOsNotification(input: NotifyInput): Promise<Result<void, NotifyError>> {
  try {
    const { title, body, soundName } = input;
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedBody = body.replace(/"/g, '\\"');

    const soundOption = soundName ? `sound name "${soundName}"` : "";
    const script = `display notification "${escapedBody}" with title "${escapedTitle}" ${soundOption}`;

    const proc = Bun.spawn(["osascript", "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return err({ type: "notify_error", message: stderr || "osascript failed" });
    }

    logger.debug("Notification sent", { title });
    return ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown notification error";
    logger.error("Notification failed", { error: message });
    return err({ type: "notify_error", message });
  }
}

// Notifier type for dependency injection
export type Notifier = (input: NotifyInput) => Promise<Result<void, NotifyError>>;

// In-memory notifier for testing
export function createTestNotifier(): Notifier & { getNotifications: () => NotifyInput[] } {
  const notifications: NotifyInput[] = [];

  const notify: Notifier = async input => {
    notifications.push(input);
    return ok(undefined);
  };

  return Object.assign(notify, { getNotifications: () => notifications });
}
