/**
 * Weekly activity in JST (hourly)
 *
 * Pure functions to convert AFK events into per-day, per-hour buckets in JST.
 * We treat "not-afk" as active time and "afk" as away/sleep time.
 */

import type { AfkEvent, AfkStatus } from "./activity-watch.ts";

export type HourBucket = {
  activeSeconds: number;
  afkSeconds: number;
};

export type DailyHourlyBucketsJst = {
  date: string; // YYYY-MM-DD (JST)
  hours: HourBucket[]; // length 24
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function dateKeyFromJstMs(jstMs: number): string {
  const d = new Date(jstMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfJstDayMsFromDateKey(dateKey: string): number {
  // dateKey is YYYY-MM-DD in JST; interpret it as UTC on that day, then subtract JST offset.
  // We use Date.UTC to avoid local timezone dependence.
  const parts = dateKey.split("-");
  const y = Number.parseInt(parts[0] ?? "", 10);
  const m = Number.parseInt(parts[1] ?? "", 10);
  const d = Number.parseInt(parts[2] ?? "", 10);
  const year = Number.isFinite(y) ? y : 1970;
  const month = Number.isFinite(m) ? m : 1;
  const day = Number.isFinite(d) ? d : 1;
  const jstMidnightUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0); // UTC getters will represent JST after shift
  return jstMidnightUtcMs - JST_OFFSET_MS;
}

function newDayBuckets(date: string): DailyHourlyBucketsJst {
  return {
    date,
    hours: Array.from({ length: 24 }, () => ({ activeSeconds: 0, afkSeconds: 0 })),
  };
}

function addSeconds(bucket: HourBucket, status: AfkStatus, seconds: number): void {
  const s = clampNonNegative(seconds);
  if (status === "not-afk") bucket.activeSeconds += s;
  if (status === "afk") bucket.afkSeconds += s;
}

function splitIntoHourlyJst(
  bucketsByDate: Map<string, DailyHourlyBucketsJst>,
  status: AfkStatus,
  startUtcMs: number,
  endUtcMs: number,
): void {
  const startMs = Math.min(startUtcMs, endUtcMs);
  const endMs = Math.max(startUtcMs, endUtcMs);
  if (endMs <= startMs) return;

  // Convert to JST timeline by shifting ms, then use UTC getters for hour/day.
  let curJstMs = startMs + JST_OFFSET_MS;
  const endJstMs = endMs + JST_OFFSET_MS;

  while (curJstMs < endJstMs) {
    const cur = new Date(curJstMs);
    const dateKey = dateKeyFromJstMs(curJstMs);
    const hour = cur.getUTCHours();

    const nextHourJstMs = Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate(), hour + 1, 0, 0, 0);

    const segEndJstMs = Math.min(endJstMs, nextHourJstMs);
    const seconds = (segEndJstMs - curJstMs) / 1000;

    const daily = bucketsByDate.get(dateKey) ?? newDayBuckets(dateKey);
    bucketsByDate.set(dateKey, daily);
    const bucket = daily.hours[hour];
    if (bucket) addSeconds(bucket, status, seconds);

    curJstMs = segEndJstMs;
  }
}

export function buildJstDateKeys(now: Date, days: number): string[] {
  const n = Math.max(1, Math.min(31, Math.floor(days)));
  const dates: string[] = [];

  // We want "yesterday back N days" in JST.
  const nowUtcMs = now.getTime();
  const nowJstMs = nowUtcMs + JST_OFFSET_MS;
  const nowJstDateKey = dateKeyFromJstMs(nowJstMs);
  const yesterdayStartUtcMs = startOfJstDayMsFromDateKey(nowJstDateKey) - 24 * 3600 * 1000;

  for (let i = n - 1; i >= 0; i--) {
    const dayStartUtcMs = yesterdayStartUtcMs - i * 24 * 3600 * 1000;
    const dayKey = dateKeyFromJstMs(dayStartUtcMs + JST_OFFSET_MS);
    dates.push(dayKey);
  }

  return dates;
}

export function binAfkEventsToJstHourly(events: AfkEvent[], targetDateKeys: string[]): DailyHourlyBucketsJst[] {
  const bucketsByDate = new Map<string, DailyHourlyBucketsJst>();
  for (const d of targetDateKeys) bucketsByDate.set(d, newDayBuckets(d));

  for (const e of events) {
    const status = e.data?.status;
    if (status !== "afk" && status !== "not-afk") continue;
    const startMs = Date.parse(e.timestamp);
    if (Number.isNaN(startMs)) continue;
    const endMs = startMs + clampNonNegative(e.duration) * 1000;
    splitIntoHourlyJst(bucketsByDate, status, startMs, endMs);
  }

  return targetDateKeys.map(d => bucketsByDate.get(d) ?? newDayBuckets(d));
}
