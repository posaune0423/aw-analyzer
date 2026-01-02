/**
 * Launchd module tests
 */

import { describe, expect, test } from "bun:test";

import {
  installLaunchd,
  uninstallLaunchd,
  LABEL,
  PLIST_PATH,
  LOG_PATH,
  ERROR_LOG_PATH,
  type InstallOptions,
  type UninstallOptions,
} from "../src/launchd.ts";

describe("launchd constants", () => {
  test("LABEL is correct", () => {
    expect(LABEL).toBe("com.aw-analyzer");
  });

  test("PLIST_PATH contains label", () => {
    expect(PLIST_PATH).toContain("com.aw-analyzer.plist");
    expect(PLIST_PATH).toContain("LaunchAgents");
  });

  test("LOG_PATH is in /tmp", () => {
    expect(LOG_PATH).toBe("/tmp/aw-analyzer.log");
  });

  test("ERROR_LOG_PATH is in /tmp", () => {
    expect(ERROR_LOG_PATH).toBe("/tmp/aw-analyzer.error.log");
  });
});

describe("installLaunchd", () => {
  describe("dry-run mode", () => {
    test("returns success without making changes", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 5,
        dryRun: true,
        verbose: false,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("Dry run mode");
        expect(result.value).toContain("no changes made");
      }
    });

    test("includes plist content in output", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 5,
        dryRun: true,
        verbose: false,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("<?xml version");
        expect(result.value).toContain("com.aw-analyzer");
        expect(result.value).toContain("StartInterval");
      }
    });

    test("shows correct interval in plist", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 10,
        dryRun: true,
        verbose: false,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // 10 minutes = 600 seconds
        expect(result.value).toContain("<integer>600</integer>");
      }
    });

    test("shows default 5 minute interval correctly", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 5,
        dryRun: true,
        verbose: false,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // 5 minutes = 300 seconds
        expect(result.value).toContain("<integer>300</integer>");
      }
    });

    test("includes info messages", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 5,
        dryRun: true,
        verbose: false,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("Installing aw-analyzer launchd service");
        expect(result.value).toContain("Bun path:");
        expect(result.value).toContain("Project root:");
        expect(result.value).toContain("Plist path:");
        expect(result.value).toContain("Interval: 5 minutes");
        expect(result.value).toContain("Log file:");
        expect(result.value).toContain("Error log:");
      }
    });

    test("verbose mode includes plist in early output", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 5,
        dryRun: true,
        verbose: true,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("Generated plist:");
      }
    });
  });

  describe("plist content validation", () => {
    test("includes required plist structure", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 5,
        dryRun: true,
        verbose: false,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const plist = result.value;
        // Check XML declaration
        expect(plist).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        // Check plist structure
        expect(plist).toContain("<plist version");
        expect(plist).toContain("<dict>");
        // Check required keys
        expect(plist).toContain("<key>Label</key>");
        expect(plist).toContain("<key>ProgramArguments</key>");
        expect(plist).toContain("<key>StartInterval</key>");
        expect(plist).toContain("<key>EnvironmentVariables</key>");
        expect(plist).toContain("<key>StandardOutPath</key>");
        expect(plist).toContain("<key>StandardErrorPath</key>");
        expect(plist).toContain("<key>RunAtLoad</key>");
        expect(plist).toContain("<true/>");
      }
    });

    test("includes correct program arguments", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 5,
        dryRun: true,
        verbose: false,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const plist = result.value;
        expect(plist).toContain("<string>run</string>");
        expect(plist).toContain("<string>tick</string>");
        expect(plist).toContain("main.ts");
      }
    });

    test("includes HOME environment variable", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 5,
        dryRun: true,
        verbose: false,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("<key>HOME</key>");
      }
    });

    test("includes PATH environment variable", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 5,
        dryRun: true,
        verbose: false,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("<key>PATH</key>");
        expect(result.value).toContain("/usr/local/bin");
        expect(result.value).toContain("/opt/homebrew/bin");
      }
    });
  });

  describe("interval boundary values", () => {
    test("handles 1 minute interval", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 1,
        dryRun: true,
        verbose: false,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("<integer>60</integer>");
        expect(result.value).toContain("Interval: 1 minutes");
      }
    });

    test("handles large interval (60 minutes)", async () => {
      const opts: InstallOptions = {
        intervalMinutes: 60,
        dryRun: true,
        verbose: false,
      };

      const result = await installLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("<integer>3600</integer>");
        expect(result.value).toContain("Interval: 60 minutes");
      }
    });
  });
});

describe("uninstallLaunchd", () => {
  describe("dry-run mode", () => {
    test("returns success without making changes", async () => {
      const opts: UninstallOptions = {
        dryRun: true,
      };

      const result = await uninstallLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("Dry run mode");
        expect(result.value).toContain("no changes made");
      }
    });

    test("shows what would be removed", async () => {
      const opts: UninstallOptions = {
        dryRun: true,
      };

      const result = await uninstallLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("Would unload and remove:");
        expect(result.value).toContain("com.aw-analyzer.plist");
      }
    });

    test("includes uninstall header", async () => {
      const opts: UninstallOptions = {
        dryRun: true,
      };

      const result = await uninstallLaunchd(opts);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("Uninstalling aw-analyzer launchd service");
      }
    });
  });
});
