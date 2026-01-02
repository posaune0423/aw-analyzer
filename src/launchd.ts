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
const LOG_PATH = "/tmp/aw-analyzer.log";
const ERROR_LOG_PATH = "/tmp/aw-analyzer.error.log";

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

function generatePlist(opts: InstallOptions): string {
  const bunPath = detectBunPath();
  const projectRoot = getProjectRoot();
  const mainScript = `${projectRoot}/src/main.ts`;
  const intervalSeconds = opts.intervalMinutes * 60;

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

  const envEntries = Object.entries(envVars)
    .map(
      ([key, value]) => `            <key>${key}</key>
            <string>${escapeXml(value)}</string>`,
    )
    .join("\n");

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

// ============================================================================
// Public API
// ============================================================================

export async function installLaunchd(opts: InstallOptions): Promise<Result<string, LaunchdError>> {
  const plist = generatePlist(opts);
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
    lines.push(plist);
  }

  if (opts.dryRun) {
    lines.push("\n🔍 Dry run mode - no changes made");
    lines.push("\nPlist content that would be written:\n");
    lines.push(plist);
    return ok(lines.join("\n"));
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

export { LABEL, PLIST_PATH, LOG_PATH, ERROR_LOG_PATH };
