/**
 * ActivityWatch API wrapper
 *
 * Abstracts the AW query language and bucket handling,
 * returning normalized metrics for job evaluation.
 */

import { err, ok, type Result } from "neverthrow";

import { logger } from "../utils/logger.ts";

// ============================================================================
// Types
// ============================================================================

export type DailyMetrics = {
  workSeconds: number;
  afkSeconds: number;
  nightWorkSeconds: number;
  maxContinuousSeconds: number;
  topApps: Array<{ app: string; seconds: number }>;
};

export type AwError =
  | { type: "connection_error"; message: string }
  | { type: "query_error"; message: string }
  | { type: "parse_error"; message: string };

export type AwConfig = {
  baseUrl: string;
  windowBucket?: string;
  afkBucket?: string;
};

export type MetricsInput = {
  start: Date;
  end: Date;
  nightStartHour?: number;
  nightEndHour?: number;
};

// ============================================================================
// API Helpers
// ============================================================================

async function fetchBuckets(baseUrl: string): Promise<Result<string[], AwError>> {
  try {
    const res = await fetch(`${baseUrl}/api/0/buckets/`);
    if (!res.ok) {
      return err({ type: "connection_error", message: `HTTP ${res.status}` });
    }
    const data = (await res.json()) as Record<string, unknown>;
    return ok(Object.keys(data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    return err({ type: "connection_error", message });
  }
}

function findBucket(buckets: string[], prefix: string): string | undefined {
  return buckets.find(b => b.startsWith(prefix));
}

async function runQuery(baseUrl: string, query: string, timeperiod: string): Promise<Result<unknown[], AwError>> {
  try {
    const res = await fetch(`${baseUrl}/api/0/query/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: [query], timeperiods: [timeperiod] }),
    });

    if (!res.ok) {
      const text = await res.text();
      return err({ type: "query_error", message: `HTTP ${res.status}: ${text}` });
    }

    const data = (await res.json()) as unknown[];
    return ok(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query error";
    return err({ type: "query_error", message });
  }
}

// ============================================================================
// Metrics Calculation
// ============================================================================

function formatTimeperiod(start: Date, end: Date): string {
  // ActivityWatch uses exclusive end date, so add 1 day to end for full day coverage
  const nextDay = new Date(end);
  nextDay.setDate(nextDay.getDate() + 1);
  return `${start.toISOString().split("T")[0]}/${nextDay.toISOString().split("T")[0]}`;
}

function buildMetricsQuery(windowBucket: string, afkBucket: string): string {
  return `
    events = query_bucket("${windowBucket}");
    afk_events = query_bucket("${afkBucket}");
    events = filter_period_intersect(events, filter_keyvals(afk_events, "status", ["not-afk"]));
    events = merge_events_by_keys(events, ["app"]);
    RETURN = sort_by_duration(events);
  `;
}

function parseMetricsResponse(data: unknown[]): DailyMetrics {
  const events = (data[0] as Array<{ data?: { app?: string }; duration?: number }>) ?? [];

  let workSeconds = 0;
  const appDurations: Record<string, number> = {};

  for (const event of events) {
    const duration = event.duration ?? 0;
    const app = event.data?.app ?? "Unknown";
    workSeconds += duration;
    appDurations[app] = (appDurations[app] ?? 0) + duration;
  }

  const topApps = Object.entries(appDurations)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([app, seconds]) => ({ app, seconds }));

  // Find max continuous work session (simplified: use longest single event)
  const maxContinuousSeconds = Math.max(...events.map(e => e.duration ?? 0), 0);

  return {
    workSeconds,
    afkSeconds: 0, // Would need separate query
    nightWorkSeconds: 0, // Would need time filtering
    maxContinuousSeconds,
    topApps,
  };
}

// ============================================================================
// Public API
// ============================================================================

export async function getMetrics(config: AwConfig, input: MetricsInput): Promise<Result<DailyMetrics, AwError>> {
  const { baseUrl } = config;

  // Find buckets if not provided
  let windowBucket = config.windowBucket;
  let afkBucket = config.afkBucket;

  if (!windowBucket || !afkBucket) {
    const bucketsResult = await fetchBuckets(baseUrl);
    if (bucketsResult.isErr()) return err(bucketsResult.error);

    const buckets = bucketsResult.value;
    windowBucket = windowBucket ?? findBucket(buckets, "aw-watcher-window_");
    afkBucket = afkBucket ?? findBucket(buckets, "aw-watcher-afk_");

    if (!windowBucket || !afkBucket) {
      return err({ type: "connection_error", message: "Required buckets not found" });
    }
  }

  const timeperiod = formatTimeperiod(input.start, input.end);
  const query = buildMetricsQuery(windowBucket, afkBucket);

  logger.debug("Running AW query", { timeperiod });
  const queryResult = await runQuery(baseUrl, query, timeperiod);
  if (queryResult.isErr()) return err(queryResult.error);

  try {
    const metrics = parseMetricsResponse(queryResult.value);
    return ok(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse error";
    return err({ type: "parse_error", message });
  }
}

// Fixture provider for testing
export function createFixtureMetrics(metrics: Partial<DailyMetrics> = {}): DailyMetrics {
  return {
    workSeconds: 0,
    afkSeconds: 0,
    nightWorkSeconds: 0,
    maxContinuousSeconds: 0,
    topApps: [],
    ...metrics,
  };
}
