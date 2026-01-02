/**
 * CLI tests
 */

import { describe, expect, test } from "bun:test";

import { parseArgs, runCli, USAGE, VERSION } from "../src/cli.ts";

describe("parseArgs", () => {
  describe("command parsing", () => {
    test("returns error when no command specified", () => {
      const result = parseArgs(["bun", "cli.ts"]);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_command");
        expect(result.error.message).toBe("No command specified");
      }
    });

    test("returns error for unknown command", () => {
      const result = parseArgs(["bun", "cli.ts", "unknown"]);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe("invalid_command");
        expect(result.error.message).toContain("Unknown command");
      }
    });

    test("parses tick command", () => {
      const result = parseArgs(["bun", "cli.ts", "tick"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.command).toBe("tick");
      }
    });

    test("parses help command", () => {
      const result = parseArgs(["bun", "cli.ts", "help"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.command).toBe("help");
      }
    });

    test("parses version command", () => {
      const result = parseArgs(["bun", "cli.ts", "version"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.command).toBe("version");
      }
    });

    test("parses reset command", () => {
      const result = parseArgs(["bun", "cli.ts", "reset"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.command).toBe("reset");
      }
    });

    test("parses install command", () => {
      const result = parseArgs(["bun", "cli.ts", "install"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.command).toBe("install");
      }
    });

    test("parses uninstall command", () => {
      const result = parseArgs(["bun", "cli.ts", "uninstall"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.command).toBe("uninstall");
      }
    });
  });

  describe("flag parsing", () => {
    test("parses --verbose flag", () => {
      const result = parseArgs(["bun", "cli.ts", "tick", "--verbose"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.verbose).toBe(true);
      }
    });

    test("parses --quiet flag", () => {
      const result = parseArgs(["bun", "cli.ts", "tick", "--quiet"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.quiet).toBe(true);
      }
    });

    test("parses --dry-run flag", () => {
      const result = parseArgs(["bun", "cli.ts", "install", "--dry-run"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.dryRun).toBe(true);
      }
    });

    test("defaults --dry-run to false when not specified", () => {
      const result = parseArgs(["bun", "cli.ts", "install"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.dryRun).toBe(false);
      }
    });
  });

  describe("option parsing", () => {
    test("parses --config option", () => {
      const result = parseArgs(["bun", "cli.ts", "tick", "--config", "/path/to/config.json"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.configPath).toBe("/path/to/config.json");
      }
    });

    test("parses --interval option with valid number", () => {
      const result = parseArgs(["bun", "cli.ts", "install", "--interval", "10"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.interval).toBe(10);
      }
    });

    test("ignores --interval option with invalid number", () => {
      const result = parseArgs(["bun", "cli.ts", "install", "--interval", "abc"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.interval).toBeUndefined();
      }
    });

    test("ignores --interval option with zero", () => {
      const result = parseArgs(["bun", "cli.ts", "install", "--interval", "0"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.interval).toBeUndefined();
      }
    });

    test("ignores --interval option with negative number", () => {
      const result = parseArgs(["bun", "cli.ts", "install", "--interval", "-5"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.interval).toBeUndefined();
      }
    });

    test("handles --interval without value", () => {
      const result = parseArgs(["bun", "cli.ts", "install", "--interval"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.interval).toBeUndefined();
      }
    });
  });

  describe("combined flags and options", () => {
    test("parses multiple flags together", () => {
      const result = parseArgs(["bun", "cli.ts", "install", "--verbose", "--dry-run", "--interval", "15"]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.command).toBe("install");
        expect(result.value.verbose).toBe(true);
        expect(result.value.dryRun).toBe(true);
        expect(result.value.interval).toBe(15);
      }
    });
  });
});

describe("runCli", () => {
  describe("help command", () => {
    test("returns usage message", async () => {
      const result = await runCli(["bun", "cli.ts", "help"]);
      expect(result.type).toBe("ok");
      if (result.type === "ok") {
        expect(result.message).toBe(USAGE);
      }
    });
  });

  describe("version command", () => {
    test("returns version message", async () => {
      const result = await runCli(["bun", "cli.ts", "version"]);
      expect(result.type).toBe("ok");
      if (result.type === "ok") {
        expect(result.message).toBe(`aw-analyzer v${VERSION}`);
      }
    });
  });

  describe("invalid command", () => {
    test("returns error for no command", async () => {
      const result = await runCli(["bun", "cli.ts"]);
      expect(result.type).toBe("error");
      if (result.type === "error") {
        expect(result.exitCode).toBe(1);
        expect(result.error.message).toBe("No command specified");
      }
    });

    test("returns error for unknown command", async () => {
      const result = await runCli(["bun", "cli.ts", "invalid"]);
      expect(result.type).toBe("error");
      if (result.type === "error") {
        expect(result.exitCode).toBe(1);
        expect(result.error.message).toContain("Unknown command");
      }
    });
  });
});
