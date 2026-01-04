/**
 * Date utilities for schedule and cooldown calculations
 *
 * Pure functions for date manipulation, idempotency key generation,
 * and schedule evaluation.
 */

/**
 * Format date as YYYY-MM-DD string for daily idempotency keys
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get the start of day (midnight) for a given date
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of day (23:59:59.999) for a given date
 */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Check if the current time is after the specified hour:minute
 */
export function isAfterTime(now: Date, hour: number, minute: number = 0): boolean {
  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();

  if (nowHour > hour) return true;
  if (nowHour === hour && nowMinute >= minute) return true;
  return false;
}

/**
 * Check if this is the first tick after a specified time on the current day.
 * Uses state to track if we've already triggered today.
 */
export function shouldTriggerDaily(params: {
  now: Date;
  targetHour: number;
  targetMinute?: number;
  lastTriggeredDate: string | undefined;
}): boolean {
  const { now, targetHour, targetMinute = 0, lastTriggeredDate } = params;
  const todayKey = formatDateKey(now);

  // Already triggered today
  if (lastTriggeredDate === todayKey) return false;

  // Check if we're past the target time
  return isAfterTime(now, targetHour, targetMinute);
}

/**
 * Generate a daily idempotency key for a job
 */
export function dailyKey(jobId: string, date: Date): string {
  return `daily:${jobId}:${formatDateKey(date)}`;
}

/**
 * Generate a cooldown key for a job
 */
export function cooldownKey(jobId: string): string {
  return `cooldown:${jobId}`;
}

/**
 * Check if a time is within a night range (e.g., 22:00 - 06:00)
 */
export function isNightTime(date: Date, nightStartHour: number, nightEndHour: number): boolean {
  const hour = date.getHours();

  // Night spans across midnight (e.g., 22:00 - 06:00)
  if (nightStartHour > nightEndHour) {
    return hour >= nightStartHour || hour < nightEndHour;
  }

  // Night is within same day (e.g., 02:00 - 05:00)
  return hour >= nightStartHour && hour < nightEndHour;
}

/**
 * Format seconds as human-readable duration (e.g., "2h 30m")
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Clamp number of days between 1 and 31
 */
export function clampDays(days: number): number {
  if (days < 1) return 1;
  if (days > 31) return 31;
  return Math.floor(days);
}

/**
 * Build a list of Date objects for the last N days (including today)
 */
export function buildDateList(now: Date, days: number): Date[] {
  const n = clampDays(days);
  const dates: Date[] = [];

  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d);
  }

  // Return in chronological order (oldest to newest)
  return dates.reverse();
}
