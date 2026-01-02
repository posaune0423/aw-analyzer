/**
 * CLI entry point for aw-analyzer
 */

import { err, ok, type Result } from "neverthrow";

import { sendMacOsNotification } from "./libs/notifier.ts";
import { runTick, type Job, type JobContext } from "./scheduler.ts";
import { configureLogger, logger } from "./utils/logger.ts";
import { createStateStore } from "./utils/state-store.ts";

// ============================================================================
// Types
// ============================================================================

export type CliCommand = "tick" | "help" | "version" | "reset" | "install" | "uninstall";

export type CliArgs = {
  command: CliCommand;
  verbose?: boolean;
  quiet?: boolean;
  configPath?: string;
  dryRun?: boolean;
  interval?: number;
};

export type CliError =
  | { type: "invalid_command"; message: string; usage: string }
  | { type: "fatal_error"; message: string };

export type CliResult = { type: "ok"; message?: string } | { type: "error"; error: CliError; exitCode: number };

// ============================================================================
// Constants
// ============================================================================

const USAGE = `Usage: aw-analyzer <command> [options]

Commands:
  tick        Run scheduled jobs and send notifications
  help        Show this help message
  version     Show version information
  reset       Clear state store and reset to initial state
  install     Install launchd service for automatic execution
  uninstall   Remove launchd service

Options:
  --verbose     Enable verbose logging
  --quiet       Suppress non-error output
  --config      Path to configuration file
  --interval    Interval in minutes for launchd (default: 5, for install only)
  --dry-run     Show what would be done without making changes (for install/uninstall)`;

const VERSION = "0.1.0";
const DEFAULT_STATE_PATH = `${process.env.HOME ?? "~"}/.aw-analyzer/state.json`;
const DEFAULT_AW_URL = "http://localhost:5600";

// ============================================================================
// Argument Parsing
// ============================================================================

export function parseArgs(args: string[]): Result<CliArgs, CliError> {
  const userArgs = args.slice(2);

  if (userArgs.length === 0) {
    return err({ type: "invalid_command", message: "No command specified", usage: USAGE });
  }

  const command = userArgs[0];
  const validCommands: CliCommand[] = ["tick", "help", "version", "reset", "install", "uninstall"];

  if (!validCommands.includes(command as CliCommand)) {
    return err({ type: "invalid_command", message: `Unknown command: ${command}`, usage: USAGE });
  }

  let interval: number | undefined;
  const intervalIdx = userArgs.indexOf("--interval");
  const intervalValue = intervalIdx !== -1 ? userArgs[intervalIdx + 1] : undefined;
  if (intervalValue) {
    const parsed = Number.parseInt(intervalValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      interval = parsed;
    }
  }

  return ok({
    command: command as CliCommand,
    verbose: userArgs.includes("--verbose"),
    quiet: userArgs.includes("--quiet"),
    configPath: userArgs.includes("--config") ? userArgs[userArgs.indexOf("--config") + 1] : undefined,
    dryRun: userArgs.includes("--dry-run"),
    interval,
  });
}

// ============================================================================
// Command Handlers
// ============================================================================

async function handleTick(jobs: Job[]): Promise<CliResult> {
  logger.info("tick started");

  const state = createStateStore(DEFAULT_STATE_PATH);
  const now = new Date();

  const ctx: JobContext = {
    now,
    state,
    notifier: sendMacOsNotification,
    awConfig: { baseUrl: DEFAULT_AW_URL },
  };

  const result = await runTick(ctx, jobs);

  if (result.isErr()) {
    logger.error("tick failed", result.error.message);
    return { type: "error", error: { type: "fatal_error", message: result.error.message }, exitCode: 1 };
  }

  const { executedJobs, notifiedJobs, skippedJobs } = result.value;
  logger.info("tick completed", {
    executed: executedJobs.length,
    notified: notifiedJobs.length,
    skipped: skippedJobs.length,
  });

  return { type: "ok" };
}

async function handleReset(): Promise<CliResult> {
  logger.info("reset started");

  const state = createStateStore(DEFAULT_STATE_PATH);
  const result = await state.clear();

  if (result.isErr()) {
    logger.error("reset failed", result.error.message);
    return { type: "error", error: { type: "fatal_error", message: result.error.message }, exitCode: 1 };
  }

  logger.info("state store reset completed");
  return { type: "ok", message: "State store has been reset" };
}

async function handleInstall(args: CliArgs): Promise<CliResult> {
  const { installLaunchd } = await import("./launchd.ts");
  const result = await installLaunchd({
    intervalMinutes: args.interval ?? 5,
    dryRun: args.dryRun ?? false,
    verbose: args.verbose ?? false,
  });

  if (result.isErr()) {
    logger.error("install failed", result.error.message);
    return { type: "error", error: { type: "fatal_error", message: result.error.message }, exitCode: 1 };
  }

  return { type: "ok", message: result.value };
}

async function handleUninstall(args: CliArgs): Promise<CliResult> {
  const { uninstallLaunchd } = await import("./launchd.ts");
  const result = await uninstallLaunchd({
    dryRun: args.dryRun ?? false,
  });

  if (result.isErr()) {
    logger.error("uninstall failed", result.error.message);
    return { type: "error", error: { type: "fatal_error", message: result.error.message }, exitCode: 1 };
  }

  return { type: "ok", message: result.value };
}

// ============================================================================
// Main Entry Point
// ============================================================================

export async function runCli(args: string[], jobs: Job[] = []): Promise<CliResult> {
  const parseResult = parseArgs(args);

  if (parseResult.isErr()) {
    const error = parseResult.error;
    logger.error(error.message);
    if (error.type === "invalid_command") logger.info(error.usage);
    return { type: "error", error, exitCode: 1 };
  }

  const cliArgs = parseResult.value;

  // Configure logger based on flags
  if (cliArgs.verbose) configureLogger({ logLevel: "DEBUG" });
  if (cliArgs.quiet) configureLogger({ logLevel: "ERROR" });

  switch (cliArgs.command) {
    case "help":
      return { type: "ok", message: USAGE };
    case "version":
      return { type: "ok", message: `aw-analyzer v${VERSION}` };
    case "tick":
      return handleTick(jobs);
    case "reset":
      return handleReset();
    case "install":
      return handleInstall(cliArgs);
    case "uninstall":
      return handleUninstall(cliArgs);
  }
}

export { USAGE, VERSION };
