/**
 * Weekly activity graph (SVG)
 *
 * Pure SVG generator to visualize daily active (not-afk) and inactive time.
 * Designed to be uploaded to Slack as a file.
 */

import type { DailyAfkRecord } from "./weekly-lifestyle.ts";

export type WeeklyGraphSvgOptions = {
  width?: number;
  height?: number;
  title?: string;
  subtitle?: string;
};

function clampInt(v: number, min: number, max: number): number {
  const n = Math.floor(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  return `${hours.toFixed(1)}h`;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function maxTotalSeconds(records: DailyAfkRecord[]): number {
  let max = 0;
  for (const r of records) {
    const total = Math.max(0, r.afkSeconds) + Math.max(0, r.notAfkSeconds);
    if (total > max) max = total;
  }
  return max;
}

function niceMaxHours(hours: number): number {
  if (hours <= 0) return 1;
  const candidates = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24];
  for (const c of candidates) {
    if (hours <= c) return c;
  }
  return Math.ceil(hours);
}

export function createWeeklyActivityGraphSvg(records: DailyAfkRecord[], opts: WeeklyGraphSvgOptions = {}): string {
  const width = clampInt(opts.width ?? 960, 480, 1600);
  const height = clampInt(opts.height ?? 420, 280, 900);

  const title = opts.title ?? "Weekly Activity (Active vs Inactive)";
  const subtitle = opts.subtitle ?? "Daily stacked bars: not-afk (green) + inactive (gray)";

  const padding = { left: 56, right: 24, top: 56, bottom: 54 };
  const chartW = Math.max(10, width - padding.left - padding.right);
  const chartH = Math.max(10, height - padding.top - padding.bottom);

  const maxSec = maxTotalSeconds(records);
  const maxHours = niceMaxHours(maxSec / 3600);
  const maxSecNice = maxHours * 3600;

  const barCount = Math.max(1, records.length);
  const gap = Math.max(4, Math.floor(chartW / (barCount * 16)));
  const barW = Math.max(10, Math.floor((chartW - gap * (barCount - 1)) / barCount));

  const y = (sec: number) => padding.top + chartH - (Math.max(0, sec) / maxSecNice) * chartH;
  const h = (sec: number) => (Math.max(0, sec) / maxSecNice) * chartH;

  // Colors (Slack-friendly)
  const colorBg = "#0b1220";
  const colorGrid = "rgba(255,255,255,0.10)";
  const colorText = "rgba(255,255,255,0.86)";
  const colorTextDim = "rgba(255,255,255,0.62)";
  const colorActive = "#22c55e";
  const colorAfk = "rgba(255,255,255,0.22)";
  const colorBorder = "rgba(255,255,255,0.14)";

  const ticks = [0, maxHours / 4, maxHours / 2, (maxHours * 3) / 4, maxHours].map(round1);

  const header = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .t { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
      .title { font-size: 18px; font-weight: 700; fill: ${colorText}; }
      .sub { font-size: 12px; fill: ${colorTextDim}; }
      .axis { font-size: 11px; fill: ${colorTextDim}; }
      .label { font-size: 11px; fill: ${colorText}; }
    </style>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="${colorBg}" />
  <text class="t title" x="${padding.left}" y="28">${escapeXml(title)}</text>
  <text class="t sub" x="${padding.left}" y="46">${escapeXml(subtitle)}</text>
`;

  const gridLines = ticks
    .map(t => {
      const sec = t * 3600;
      const yy = y(sec);
      return `
  <line x1="${padding.left}" y1="${yy}" x2="${padding.left + chartW}" y2="${yy}" stroke="${colorGrid}" stroke-width="1" />
  <text class="t axis" x="${padding.left - 10}" y="${yy + 4}" text-anchor="end">${t}h</text>`;
    })
    .join("\n");

  const bars = records
    .map((r, i) => {
      const x = padding.left + i * (barW + gap);

      const afk = Math.max(0, r.afkSeconds);
      const active = Math.max(0, r.notAfkSeconds);

      const activeH = h(active);
      const afkH = h(afk);

      const activeY = padding.top + chartH - activeH;
      const afkY = activeY - afkH;

      const dateLabel = r.date.slice(5).replace("-", "/"); // MM/DD
      const totalLabel = formatHours(active + afk);

      return `
  <g>
    <rect x="${x}" y="${padding.top}" width="${barW}" height="${chartH}" rx="10" fill="transparent" stroke="${colorBorder}" />
    <rect x="${x}" y="${activeY}" width="${barW}" height="${activeH}" rx="10" fill="${colorActive}" />
    <rect x="${x}" y="${afkY}" width="${barW}" height="${afkH}" rx="10" fill="${colorAfk}" />
    <text class="t axis" x="${x + barW / 2}" y="${height - 22}" text-anchor="middle">${escapeXml(dateLabel)}</text>
    <text class="t label" x="${x + barW / 2}" y="${padding.top + chartH + 18}" text-anchor="middle">${escapeXml(totalLabel)}</text>
  </g>`;
    })
    .join("\n");

  const legend = `
  <g>
    <rect x="${padding.left}" y="${height - 36}" width="10" height="10" rx="2" fill="${colorActive}" />
    <text class="t sub" x="${padding.left + 16}" y="${height - 27}">not-afk (active)</text>
    <rect x="${padding.left + 132}" y="${height - 36}" width="10" height="10" rx="2" fill="${colorAfk}" />
    <text class="t sub" x="${padding.left + 148}" y="${height - 27}">inactive</text>
  </g>
`;

  const footer = `
${legend}
  <g>
    ${gridLines}
  </g>
  <g>
    ${bars}
  </g>
</svg>
`.trim();

  return `${header}\n${footer}`;
}
