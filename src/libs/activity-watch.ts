/**
 * ActivityWatch API wrapper
 *
 * Abstracts the AW query language and bucket handling,
 * returning normalized metrics for job evaluation.
 */

import { err, ok, type Result } from "neverthrow";

import { logger } from "../utils/logger.ts";
import { formatDateKey } from "../utils/date-utils.ts";

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

export type AfkMetrics = {
  afkSeconds: number;
  notAfkSeconds: number;
};

export type EditorProjectMetrics = {
  projects: Array<{ project: string; seconds: number }>;
};

export type AfkStatus = "afk" | "not-afk";

export type AfkEvent = {
  timestamp: string;
  duration: number;
  data?: { status?: AfkStatus | string };
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
  return `${formatDateKey(start)}/${formatDateKey(nextDay)}`;
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

function buildAfkMetricsQuery(afkBucket: string): string {
  return `
    events = query_bucket("${afkBucket}");
    events = filter_keyvals(events, "status", ["afk", "not-afk"]);
    events = merge_events_by_keys(events, ["status"]);
    RETURN = sort_by_duration(events);
  `;
}

function buildAfkEventsQuery(afkBucket: string): string {
  return `
    events = query_bucket("${afkBucket}");
    events = filter_keyvals(events, "status", ["afk", "not-afk"]);
    RETURN = sort_by_timestamp(events);
  `;
}

function buildEditorProjectQuery(editorBucket: string, afkBucket: string): string {
  return `
    events = query_bucket("${editorBucket}");
    afk_events = query_bucket("${afkBucket}");
    events = filter_period_intersect(events, filter_keyvals(afk_events, "status", ["not-afk"]));
    events = merge_events_by_keys(events, ["project"]);
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

function parseAfkMetricsResponse(data: unknown[]): AfkMetrics {
  const events = (data[0] as Array<{ data?: { status?: string }; duration?: number }>) ?? [];

  let afkSeconds = 0;
  let notAfkSeconds = 0;

  for (const event of events) {
    const duration = event.duration ?? 0;
    const status = event.data?.status;
    if (status === "afk") afkSeconds += duration;
    if (status === "not-afk") notAfkSeconds += duration;
  }

  return { afkSeconds, notAfkSeconds };
}

function parseAfkEventsResponse(data: unknown[]): AfkEvent[] {
  const events = (data[0] as AfkEvent[]) ?? [];
  return events
    .filter(e => typeof e.timestamp === "string")
    .map(e => ({
      timestamp: e.timestamp,
      duration: typeof e.duration === "number" ? e.duration : 0,
      data: e.data,
    }));
}

/**
 * Extract project name from full path.
 * Returns the last segment after the final '/' (e.g., "/Users/name/Private/project-name" -> "project-name").
 */
function extractProjectName(fullPath: string): string {
  // Remove trailing slash if present
  const trimmed = fullPath.replace(/\/$/, "");
  // Extract last segment after final '/'
  const lastSlashIndex = trimmed.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return trimmed; // No slash found, return as-is
  }
  return trimmed.slice(lastSlashIndex + 1);
}

function parseEditorProjectResponse(data: unknown[]): EditorProjectMetrics {
  const events = (data[0] as Array<{ data?: { project?: string }; duration?: number }>) ?? [];

  const projectDurations: Record<string, number> = {};

  for (const event of events) {
    const duration = event.duration ?? 0;
    const projectPath = event.data?.project ?? "Unknown";
    if (projectPath && projectPath !== "Unknown" && projectPath.trim() !== "") {
      const projectName = extractProjectName(projectPath);
      projectDurations[projectName] = (projectDurations[projectName] ?? 0) + duration;
    }
  }

  const projects = Object.entries(projectDurations)
    .sort(([, a], [, b]) => b - a)
    .map(([project, seconds]) => ({ project, seconds }));

  return { projects };
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

export async function getAfkMetrics(config: AwConfig, input: MetricsInput): Promise<Result<AfkMetrics, AwError>> {
  const { baseUrl } = config;

  let afkBucket = config.afkBucket;

  if (!afkBucket) {
    const bucketsResult = await fetchBuckets(baseUrl);
    if (bucketsResult.isErr()) return err(bucketsResult.error);

    const buckets = bucketsResult.value;
    afkBucket = afkBucket ?? findBucket(buckets, "aw-watcher-afk_");

    if (!afkBucket) {
      return err({ type: "connection_error", message: "Required buckets not found" });
    }
  }

  const timeperiod = formatTimeperiod(input.start, input.end);
  const query = buildAfkMetricsQuery(afkBucket);

  logger.debug("Running AW AFK query", { timeperiod });
  const queryResult = await runQuery(baseUrl, query, timeperiod);
  if (queryResult.isErr()) return err(queryResult.error);

  try {
    return ok(parseAfkMetricsResponse(queryResult.value));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse error";
    return err({ type: "parse_error", message });
  }
}

export async function getAfkEvents(config: AwConfig, input: MetricsInput): Promise<Result<AfkEvent[], AwError>> {
  const { baseUrl } = config;

  let afkBucket = config.afkBucket;

  if (!afkBucket) {
    const bucketsResult = await fetchBuckets(baseUrl);
    if (bucketsResult.isErr()) return err(bucketsResult.error);

    const buckets = bucketsResult.value;
    afkBucket = afkBucket ?? findBucket(buckets, "aw-watcher-afk_");

    if (!afkBucket) {
      return err({ type: "connection_error", message: "Required buckets not found" });
    }
  }

  const timeperiod = formatTimeperiod(input.start, input.end);
  const query = buildAfkEventsQuery(afkBucket);

  logger.debug("Running AW AFK events query", { timeperiod });
  const queryResult = await runQuery(baseUrl, query, timeperiod);
  if (queryResult.isErr()) return err(queryResult.error);

  try {
    return ok(parseAfkEventsResponse(queryResult.value));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse error";
    return err({ type: "parse_error", message });
  }
}

export async function getEditorProjectMetrics(
  config: AwConfig,
  input: MetricsInput,
): Promise<Result<EditorProjectMetrics, AwError>> {
  const { baseUrl } = config;

  const bucketsResult = await fetchBuckets(baseUrl);
  if (bucketsResult.isErr()) return err(bucketsResult.error);

  const buckets = bucketsResult.value;
  const afkBucket = config.afkBucket ?? findBucket(buckets, "aw-watcher-afk_");
  const editorBucket = findBucket(buckets, "aw-watcher-vscode_") ?? findBucket(buckets, "aw-watcher-vim_");

  if (!afkBucket) {
    return err({ type: "connection_error", message: "AFK bucket not found" });
  }

  if (!editorBucket) {
    // No editor bucket found; return empty instead of error for graceful degradation
    logger.debug("No editor bucket found (vscode/vim)");
    return ok({ projects: [] });
  }

  const timeperiod = formatTimeperiod(input.start, input.end);
  const query = buildEditorProjectQuery(editorBucket, afkBucket);

  logger.debug("Running AW editor project query", { timeperiod, editorBucket });
  const queryResult = await runQuery(baseUrl, query, timeperiod);
  if (queryResult.isErr()) return err(queryResult.error);

  try {
    return ok(parseEditorProjectResponse(queryResult.value));
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

export function createFixtureAfkMetrics(metrics: Partial<AfkMetrics> = {}): AfkMetrics {
  return {
    afkSeconds: 0,
    notAfkSeconds: 0,
    ...metrics,
  };
}
