import { describe, expect, test } from "bun:test";

import { binAfkEventsToJstHourly } from "../src/libs/weekly-activity-jst.ts";

describe("weekly-activity-jst", () => {
  test("splits not-afk event across hour boundary in JST", () => {
    // 2026-01-01T00:30:00+09:00 is 2025-12-31T15:30:00Z
    const events = [
      {
        timestamp: "2025-12-31T15:30:00.000Z",
        duration: 3600, // 1h (spans 00:30 -> 01:30 JST)
        data: { status: "not-afk" as const },
      },
    ];

    const buckets = binAfkEventsToJstHourly(events, ["2026-01-01"]);
    expect(buckets.length).toBe(1);
    const day = buckets[0]!;
    // hour 0: 30m
    expect(Math.round(day.hours[0]!.activeSeconds)).toBe(1800);
    // hour 1: 30m
    expect(Math.round(day.hours[1]!.activeSeconds)).toBe(1800);
  });
});
