/**
 * Launchd service management for aw-analyzer
 *
 * Provides functions to install and uninstall the launchd plist for automatic execution.
 */

import { $ } from "bun";
import { err, ok, type Result } from "neverthrow";

// ============================================================================
// Constants
// ============================================================================

const LABEL = "com.aw-analyzer";
const PLIST_PATH = `${process.env.HOME}/Library/LaunchAgents/${LABEL}.plist`;
const DAILY_LABEL = `${LABEL}.daily`;
const WEEKLY_LABEL = `${LABEL}.weekly`;
const DAILY_PLIST_PATH = `${process.env.HOME}/Library/LaunchAgents/${DAILY_LABEL}.plist`;
const WEEKLY_PLIST_PATH = `${process.env.HOME}/Library/LaunchAgents/${WEEKLY_LABEL}.plist`;
const LOG_PATH = "/tmp/aw-analyzer.log";
const ERROR_LOG_PATH = "/tmp/aw-analyzer.error.log";
const DAILY_LOG_PATH = "/tmp/aw-analyzer.daily.log";
const DAILY_ERROR_LOG_PATH = "/tmp/aw-analyzer.daily.error.log";
const WEEKLY_LOG_PATH = "/tmp/aw-analyzer.weekly.log";
const WEEKLY_ERROR_LOG_PATH = "/tmp/aw-analyzer.weekly.error.log";

// ============================================================================
// Types
// ============================================================================

export type InstallOptions = {
  intervalMinutes: number;
  dryRun: boolean;
  verbose: boolean;
};

export type UninstallOptions = {
  dryRun: boolean;
};

export type InstallScheduleOptions = {
  dryRun: boolean;
  verbose: boolean;
  /**
   * Daily schedule time.
   * Default: 15:00
   */
  daily?: { hour: number; minute: number };
  /**
   * Weekly schedule (launchd weekday: 1=Sun ... 7=Sat)
   * Default: Fri(6) 15:00
   */
  weekly?: { weekday: number; hour: number; minute: number };
};

export type UninstallScheduleOptions = {
  dryRun: boolean;
};

type LaunchdError = { type: "launchd_error"; message: string };

// ============================================================================
// Helpers
// ============================================================================

function detectBunPath(): string {
  const candidates = [`${process.env.HOME}/.bun/bin/bun`, "/usr/local/bin/bun", "/opt/homebrew/bin/bun"];

  for (const path of candidates) {
    try {
      if (Bun.file(path).size > 0) {
        return path;
      }
    } catch {
      // Continue to next candidate
    }
  }

  return process.execPath;
}

function getProjectRoot(): string {
  // Resolve from src/launchd.ts to project root
  // e.g. file:///.../aw-analyzer/src/launchd.ts -> /.../aw-analyzer
  return new URL("..", import.meta.url).pathname.replace(/\/$/, "");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getLaunchAgentsDir(): string {
  return `${process.env.HOME}/Library/LaunchAgents`;
}

async function ensureLaunchAgentsDir(): Promise<void> {
  const dir = getLaunchAgentsDir();
  await $`mkdir -p ${dir}`.quiet();
}

function buildEnvironmentVariables(): Record<string, string> {
  const envVars: Record<string, string> = {
    HOME: process.env.HOME ?? "",
    PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/.bun/bin:/usr/bin:/bin`,
  };

  if (process.env.OPENAI_API_KEY) {
    envVars.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }
  if (process.env.SLACK_WEBHOOK_URL) {
    envVars.SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
  }
  if (process.env.SLACK_BOT_TOKEN) {
    envVars.SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
  }
  if (process.env.SLACK_CHANNEL_ID) {
    envVars.SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;
  }
  if (process.env.ACTIVITYWATCH_URL) {
    envVars.ACTIVITYWATCH_URL = process.env.ACTIVITYWATCH_URL;
  }
  if (process.env.ACTIVITYWATCH_HOSTNAME) {
    envVars.ACTIVITYWATCH_HOSTNAME = process.env.ACTIVITYWATCH_HOSTNAME;
  }

  return envVars;
}

function isSensitiveEnvKey(key: string): boolean {
  return /(KEY|TOKEN|SECRET|WEBHOOK|PASSWORD)/i.test(key);
}

function redactEnvironmentVariables(envVars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(envVars)) {
    out[k] = isSensitiveEnvKey(k) ? "***REDACTED***" : v;
  }
  return out;
}

function envToPlistDict(envVars: Record<string, string>): string {
  return Object.entries(envVars)
    .map(
      ([key, value]) => `            <key>${key}</key>
            <string>${escapeXml(value)}</string>`,
    )
    .join("\n");
}

function generatePlist(opts: InstallOptions, options?: { redactSecrets?: boolean }): string {
  const bunPath = detectBunPath();
  const projectRoot = getProjectRoot();
  const mainScript = `${projectRoot}/src/main.ts`;
  const intervalSeconds = opts.intervalMinutes * 60;

  const envVars =
    options?.redactSecrets ? redactEnvironmentVariables(buildEnvironmentVariables()) : buildEnvironmentVariables();
  const envEntries = envToPlistDict(envVars);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${escapeXml(bunPath)}</string>
        <string>run</string>
        <string>${escapeXml(mainScript)}</string>
        <string>tick</string>
    </array>

    <key>StartInterval</key>
    <integer>${intervalSeconds}</integer>

    <key>EnvironmentVariables</key>
    <dict>
${envEntries}
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_PATH}</string>

    <key>StandardErrorPath</key>
    <string>${ERROR_LOG_PATH}</string>

    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
`;
}

function generateSchedulePlist(
  input: {
    label: string;
    command: "tick" | "weekly-report";
    plistPath: string;
    outLogPath: string;
    errLogPath: string;
    startCalendarInterval: { Hour: number; Minute: number; Weekday?: number };
  },
  options?: { redactSecrets?: boolean },
): string {
  const bunPath = detectBunPath();
  const projectRoot = getProjectRoot();
  const mainScript = `${projectRoot}/src/main.ts`;
  const envVars =
    options?.redactSecrets ? redactEnvironmentVariables(buildEnvironmentVariables()) : buildEnvironmentVariables();
  const envEntries = envToPlistDict(envVars);

  const calendarEntries = [
    `<key>Hour</key>\n        <integer>${input.startCalendarInterval.Hour}</integer>`,
    `<key>Minute</key>\n        <integer>${input.startCalendarInterval.Minute}</integer>`,
    ...(input.startCalendarInterval.Weekday ?
      [`<key>Weekday</key>\n        <integer>${input.startCalendarInterval.Weekday}</integer>`]
    : []),
  ].join("\n        ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${escapeXml(input.label)}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${escapeXml(bunPath)}</string>
        <string>run</string>
        <string>${escapeXml(mainScript)}</string>
        <string>${escapeXml(input.command)}</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        ${calendarEntries}
    </dict>

    <key>EnvironmentVariables</key>
    <dict>
${envEntries}
    </dict>

    <key>StandardOutPath</key>
    <string>${escapeXml(input.outLogPath)}</string>

    <key>StandardErrorPath</key>
    <string>${escapeXml(input.errLogPath)}</string>
</dict>
</plist>
`;
}

// ============================================================================
// Public API
// ============================================================================

export async function installLaunchd(opts: InstallOptions): Promise<Result<string, LaunchdError>> {
  const plist = generatePlist(opts);
  const displayPlist = generatePlist(opts, { redactSecrets: true });
  const lines: string[] = [];

  lines.push("🔧 Installing aw-analyzer launchd service...\n");
  lines.push(`📍 Bun path: ${detectBunPath()}`);
  lines.push(`📍 Project root: ${getProjectRoot()}`);
  lines.push(`📍 Plist path: ${PLIST_PATH}`);
  lines.push(`⏱️  Interval: ${opts.intervalMinutes} minutes`);
  lines.push(`📝 Log file: ${LOG_PATH}`);
  lines.push(`📝 Error log: ${ERROR_LOG_PATH}`);

  if (opts.verbose) {
    lines.push("\nGenerated plist:");
    lines.push(displayPlist);
  }

  if (opts.dryRun) {
    lines.push("\n🔍 Dry run mode - no changes made");
    lines.push("\nPlist content that would be written:\n");
    lines.push(displayPlist);
    return ok(lines.join("\n"));
  }

  try {
    await ensureLaunchAgentsDir();
  } catch (error) {
    return err({ type: "launchd_error", message: `Failed to create LaunchAgents dir: ${error}` });
  }

  // Unload existing service if present
  try {
    await $`launchctl unload ${PLIST_PATH} 2>/dev/null`.quiet();
  } catch {
    // Ignore errors if not loaded
  }

  // Write plist file
  try {
    await Bun.write(PLIST_PATH, plist);
    lines.push("\n✅ Plist file written");
  } catch (error) {
    return err({ type: "launchd_error", message: `Failed to write plist: ${error}` });
  }

  // Load service
  try {
    await $`launchctl load ${PLIST_PATH}`.quiet();
    lines.push("✅ Service loaded");
  } catch (error) {
    return err({ type: "launchd_error", message: `Failed to load service: ${error}` });
  }

  lines.push("\n🎉 Installation complete!");
  lines.push("\nUseful commands:");
  lines.push(`  View logs:        tail -f ${LOG_PATH}`);
  lines.push(`  View errors:      tail -f ${ERROR_LOG_PATH}`);
  lines.push(`  Manual trigger:   launchctl start ${LABEL}`);
  lines.push(`  Stop service:     launchctl stop ${LABEL}`);
  lines.push(`  Uninstall:        bun run uninstall-service`);

  return ok(lines.join("\n"));
}

export async function uninstallLaunchd(opts: UninstallOptions): Promise<Result<string, LaunchdError>> {
  const lines: string[] = [];

  lines.push("🔧 Uninstalling aw-analyzer launchd service...\n");

  if (opts.dryRun) {
    lines.push("🔍 Dry run mode - no changes made");
    lines.push(`Would unload and remove: ${PLIST_PATH}`);
    return ok(lines.join("\n"));
  }

  // Unload service
  try {
    await $`launchctl unload ${PLIST_PATH}`.quiet();
    lines.push("✅ Service unloaded");
  } catch {
    lines.push("ℹ️  Service was not loaded");
  }

  // Remove plist file
  const plistFile = Bun.file(PLIST_PATH);
  if (await plistFile.exists()) {
    try {
      await $`rm ${PLIST_PATH}`.quiet();
      lines.push("✅ Plist file removed");
    } catch (error) {
      return err({ type: "launchd_error", message: `Failed to remove plist: ${error}` });
    }
  } else {
    lines.push("ℹ️  Plist file not found");
  }

  lines.push("\n🎉 Uninstallation complete!");

  return ok(lines.join("\n"));
}

export async function installSchedules(opts: InstallScheduleOptions): Promise<Result<string, LaunchdError>> {
  const daily = opts.daily ?? { hour: 15, minute: 0 };
  const weekly = opts.weekly ?? { weekday: 6, hour: 15, minute: 0 }; // Fri

  const dailyPlist = generateSchedulePlist({
    label: DAILY_LABEL,
    command: "tick",
    plistPath: DAILY_PLIST_PATH,
    outLogPath: DAILY_LOG_PATH,
    errLogPath: DAILY_ERROR_LOG_PATH,
    startCalendarInterval: { Hour: daily.hour, Minute: daily.minute },
  });

  const weeklyPlist = generateSchedulePlist({
    label: WEEKLY_LABEL,
    command: "weekly-report",
    plistPath: WEEKLY_PLIST_PATH,
    outLogPath: WEEKLY_LOG_PATH,
    errLogPath: WEEKLY_ERROR_LOG_PATH,
    startCalendarInterval: { Hour: weekly.hour, Minute: weekly.minute, Weekday: weekly.weekday },
  });

  const displayDailyPlist = generateSchedulePlist(
    {
      label: DAILY_LABEL,
      command: "tick",
      plistPath: DAILY_PLIST_PATH,
      outLogPath: DAILY_LOG_PATH,
      errLogPath: DAILY_ERROR_LOG_PATH,
      startCalendarInterval: { Hour: daily.hour, Minute: daily.minute },
    },
    { redactSecrets: true },
  );

  const displayWeeklyPlist = generateSchedulePlist(
    {
      label: WEEKLY_LABEL,
      command: "weekly-report",
      plistPath: WEEKLY_PLIST_PATH,
      outLogPath: WEEKLY_LOG_PATH,
      errLogPath: WEEKLY_ERROR_LOG_PATH,
      startCalendarInterval: { Hour: weekly.hour, Minute: weekly.minute, Weekday: weekly.weekday },
    },
    { redactSecrets: true },
  );

  const lines: string[] = [];
  lines.push("🔧 Installing aw-analyzer schedules (daily/weekly)...\n");
  lines.push(`📍 Bun path: ${detectBunPath()}`);
  lines.push(`📍 Project root: ${getProjectRoot()}`);
  lines.push(`📍 Daily plist: ${DAILY_PLIST_PATH} (every day ${daily.hour}:${String(daily.minute).padStart(2, "0")})`);
  lines.push(
    `📍 Weekly plist: ${WEEKLY_PLIST_PATH} (weekday=${weekly.weekday} ${weekly.hour}:${String(weekly.minute).padStart(2, "0")})`,
  );

  if (opts.verbose) {
    lines.push("\nGenerated daily plist:");
    lines.push(displayDailyPlist);
    lines.push("\nGenerated weekly plist:");
    lines.push(displayWeeklyPlist);
  }

  if (opts.dryRun) {
    lines.push("\n🔍 Dry run mode - no changes made");
    lines.push("\nDaily plist content that would be written:\n");
    lines.push(displayDailyPlist);
    lines.push("\nWeekly plist content that would be written:\n");
    lines.push(displayWeeklyPlist);
    return ok(lines.join("\n"));
  }

  try {
    await ensureLaunchAgentsDir();
  } catch (error) {
    return err({ type: "launchd_error", message: `Failed to create LaunchAgents dir: ${error}` });
  }

  // Unload existing schedules if present
  try {
    await $`launchctl unload ${DAILY_PLIST_PATH} 2>/dev/null`.quiet();
  } catch {
    // ignore
  }
  try {
    await $`launchctl unload ${WEEKLY_PLIST_PATH} 2>/dev/null`.quiet();
  } catch {
    // ignore
  }

  try {
    await Bun.write(DAILY_PLIST_PATH, dailyPlist);
    await Bun.write(WEEKLY_PLIST_PATH, weeklyPlist);
    lines.push("\n✅ Plist files written");
  } catch (error) {
    return err({ type: "launchd_error", message: `Failed to write plist: ${error}` });
  }

  try {
    await $`launchctl load ${DAILY_PLIST_PATH}`.quiet();
    await $`launchctl load ${WEEKLY_PLIST_PATH}`.quiet();
    lines.push("✅ Schedules loaded");
  } catch (error) {
    return err({ type: "launchd_error", message: `Failed to load schedule: ${error}` });
  }

  lines.push("\n🎉 Schedule installation complete!");
  lines.push("\nUseful commands:");
  lines.push(`  Daily logs:   tail -f ${DAILY_LOG_PATH}`);
  lines.push(`  Weekly logs:  tail -f ${WEEKLY_LOG_PATH}`);
  lines.push(`  Remove:       bun run remove-schedule`);

  return ok(lines.join("\n"));
}

export async function uninstallSchedules(opts: UninstallScheduleOptions): Promise<Result<string, LaunchdError>> {
  const lines: string[] = [];
  lines.push("🔧 Uninstalling aw-analyzer schedules (daily/weekly)...\n");

  if (opts.dryRun) {
    lines.push("🔍 Dry run mode - no changes made");
    lines.push(`Would unload and remove: ${DAILY_PLIST_PATH}`);
    lines.push(`Would unload and remove: ${WEEKLY_PLIST_PATH}`);
    return ok(lines.join("\n"));
  }

  try {
    await $`launchctl unload ${DAILY_PLIST_PATH}`.quiet();
    lines.push("✅ Daily schedule unloaded");
  } catch {
    lines.push("ℹ️  Daily schedule was not loaded");
  }

  try {
    await $`launchctl unload ${WEEKLY_PLIST_PATH}`.quiet();
    lines.push("✅ Weekly schedule unloaded");
  } catch {
    lines.push("ℹ️  Weekly schedule was not loaded");
  }

  const dailyPlistFile = Bun.file(DAILY_PLIST_PATH);
  if (await dailyPlistFile.exists()) {
    try {
      await $`rm ${DAILY_PLIST_PATH}`.quiet();
      lines.push("✅ Daily plist removed");
    } catch (error) {
      return err({ type: "launchd_error", message: `Failed to remove daily plist: ${error}` });
    }
  }

  const weeklyPlistFile = Bun.file(WEEKLY_PLIST_PATH);
  if (await weeklyPlistFile.exists()) {
    try {
      await $`rm ${WEEKLY_PLIST_PATH}`.quiet();
      lines.push("✅ Weekly plist removed");
    } catch (error) {
      return err({ type: "launchd_error", message: `Failed to remove weekly plist: ${error}` });
    }
  }

  lines.push("\n🎉 Schedule uninstallation complete!");
  return ok(lines.join("\n"));
}

export {
  LABEL,
  PLIST_PATH,
  LOG_PATH,
  ERROR_LOG_PATH,
  DAILY_LABEL,
  WEEKLY_LABEL,
  DAILY_PLIST_PATH,
  WEEKLY_PLIST_PATH,
  DAILY_LOG_PATH,
  DAILY_ERROR_LOG_PATH,
  WEEKLY_LOG_PATH,
  WEEKLY_ERROR_LOG_PATH,
};
