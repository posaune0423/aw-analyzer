/**
 * Date utilities tests
 */

import { describe, expect, test } from "bun:test";

import {
  cooldownKey,
  dailyKey,
  formatDateKey,
  formatDuration,
  isAfterTime,
  isNightTime,
  shouldTriggerDaily,
  startOfDay,
  endOfDay,
} from "../src/utils/date-utils.ts";

describe("formatDateKey", () => {
  test("formats date as YYYY-MM-DD", () => {
    const date = new Date(2026, 0, 5);
    expect(formatDateKey(date)).toBe("2026-01-05");
  });
});

describe("startOfDay / endOfDay", () => {
  test("startOfDay returns midnight", () => {
    const date = new Date(2026, 0, 2, 15, 30);
    const result = startOfDay(date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  test("endOfDay returns 23:59:59", () => {
    const date = new Date(2026, 0, 2, 10, 0);
    const result = endOfDay(date);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
  });
});

describe("isAfterTime", () => {
  test("returns true when after target", () => {
    const now = new Date(2026, 0, 2, 10, 30);
    expect(isAfterTime(now, 9, 0)).toBe(true);
  });

  test("returns false when before target", () => {
    const now = new Date(2026, 0, 2, 10, 30);
    expect(isAfterTime(now, 11, 0)).toBe(false);
  });
});

describe("shouldTriggerDaily", () => {
  test("returns true when past target and not triggered today", () => {
    const now = new Date(2026, 0, 2, 10, 0);
    expect(shouldTriggerDaily({ now, targetHour: 9, lastTriggeredDate: undefined })).toBe(true);
  });

  test("returns false when already triggered today", () => {
    const now = new Date(2026, 0, 2, 10, 0);
    expect(shouldTriggerDaily({ now, targetHour: 9, lastTriggeredDate: "2026-01-02" })).toBe(false);
  });
});

describe("key generation", () => {
  test("dailyKey generates consistent key", () => {
    const date = new Date(2026, 0, 2);
    expect(dailyKey("job", date)).toBe("daily:job:2026-01-02");
  });

  test("cooldownKey generates key", () => {
    expect(cooldownKey("job")).toBe("cooldown:job");
  });
});

describe("isNightTime", () => {
  test("detects night spanning midnight", () => {
    expect(isNightTime(new Date(2026, 0, 2, 23, 0), 22, 6)).toBe(true);
    expect(isNightTime(new Date(2026, 0, 2, 10, 0), 22, 6)).toBe(false);
  });
});

describe("formatDuration", () => {
  test("formats various durations", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(180)).toBe("3m");
    expect(formatDuration(7200)).toBe("2h");
    expect(formatDuration(5400)).toBe("1h 30m");
  });
});
