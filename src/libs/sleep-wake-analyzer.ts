/**
 * Sleep / Wake time analyzer
 *
 * Calculates average wake-up and sleep times from AFK events.
 * - Sleep time: start of a long AFK period (typically sleep)
 * - Wake time: end of a long AFK period (when returning from AFK to not-afk)
 *
 * A "long AFK period" is defined as an AFK event lasting at least MIN_SLEEP_DURATION_SECONDS.
 */

import type { AfkEvent } from "./activity-watch.ts";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
// Minimum duration (in seconds) for an AFK period to be considered sleep
const MIN_SLEEP_DURATION_SECONDS = 3 * 60 * 60; // 3 hours

export type DailySleepWake = {
  date: string; // YYYY-MM-DD (JST)
  wakeTimeMinutes?: number; // minutes from midnight (e.g., 8:30 = 510)
  sleepTimeMinutes?: number; // minutes from midnight (e.g., 23:45 = 1425)
};

export type WeeklySleepWakeSummary = {
  avgWakeTimeMinutes?: number;
  avgSleepTimeMinutes?: number;
  records: DailySleepWake[];
};

function dateKeyFromJstMs(jstMs: number): string {
  const d = new Date(jstMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minutesOfDayFromJstMs(jstMs: number): number {
  const d = new Date(jstMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function formatAvgTime(minutes: number | undefined): string {
  if (minutes === undefined || !Number.isFinite(minutes)) return "-";
  return formatMinutesToTime(Math.round(minutes));
}

export function analyzeSleepWake(events: AfkEvent[], targetDateKeys: string[]): WeeklySleepWakeSummary {
  // Sort events by timestamp to process chronologically
  const sortedEvents = [...events].sort((a, b) => {
    const aMs = Date.parse(a.timestamp);
    const bMs = Date.parse(b.timestamp);
    if (Number.isNaN(aMs) || Number.isNaN(bMs)) return 0;
    return aMs - bMs;
  });

  const wakeTimes = new Map<string, number>(); // dateKey -> minutes
  const sleepTimes = new Map<string, number>(); // dateKey -> minutes

  // Process events chronologically to find long AFK periods
  for (let i = 0; i < sortedEvents.length; i++) {
    const event = sortedEvents[i];
    if (!event) continue;

    const status = event.data?.status;
    if (status !== "afk") continue;

    const duration = event.duration ?? 0;
    // Only consider long AFK periods as sleep
    if (duration < MIN_SLEEP_DURATION_SECONDS) continue;

    const startMs = Date.parse(event.timestamp);
    if (Number.isNaN(startMs)) continue;

    const startJstMs = startMs + JST_OFFSET_MS;
    const endJstMs = startJstMs + duration * 1000;

    const sleepDateKey = dateKeyFromJstMs(startJstMs);
    const wakeDateKey = dateKeyFromJstMs(endJstMs);

    // Sleep time: start of the long AFK period
    if (targetDateKeys.includes(sleepDateKey)) {
      const sleepMin = minutesOfDayFromJstMs(startJstMs);
      const existing = sleepTimes.get(sleepDateKey);
      // Use the earliest sleep time if multiple long AFK periods exist
      if (existing === undefined || sleepMin < existing) {
        sleepTimes.set(sleepDateKey, sleepMin);
      }
    }

    // Wake time: end of the long AFK period (when returning to not-afk)
    if (targetDateKeys.includes(wakeDateKey)) {
      const wakeMin = minutesOfDayFromJstMs(endJstMs);
      const existing = wakeTimes.get(wakeDateKey);
      // Use the earliest wake time if multiple long AFK periods end on the same day
      if (existing === undefined || wakeMin < existing) {
        wakeTimes.set(wakeDateKey, wakeMin);
      }
    }
  }

  const records: DailySleepWake[] = targetDateKeys.map(date => ({
    date,
    wakeTimeMinutes: wakeTimes.get(date),
    sleepTimeMinutes: sleepTimes.get(date),
  }));

  // Calculate averages (exclude days without data)
  const wakeTimeValues = records.map(r => r.wakeTimeMinutes).filter((v): v is number => v !== undefined);
  const sleepTimeValues = records.map(r => r.sleepTimeMinutes).filter((v): v is number => v !== undefined);

  const avgWakeTimeMinutes =
    wakeTimeValues.length > 0 ? wakeTimeValues.reduce((a, b) => a + b, 0) / wakeTimeValues.length : undefined;
  const avgSleepTimeMinutes =
    sleepTimeValues.length > 0 ? sleepTimeValues.reduce((a, b) => a + b, 0) / sleepTimeValues.length : undefined;

  return { avgWakeTimeMinutes, avgSleepTimeMinutes, records };
}
