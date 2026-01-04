/**
 * Weekly activity heatmap (JST) - SVG
 *
 * Y axis: hour (0-23 JST)
 * X axis: day (recent N days)
 * Cell color: active vs inactive intensity
 */

import type { DailyHourlyBucketsJst } from "./weekly-activity-jst.ts";

export type WeeklyHeatmapSvgOptions = {
  title?: string;
  subtitle?: string;
  cellWidth?: number;
  cellHeight?: number;
  columnGap?: number;
  rowGap?: number;
};

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a.toFixed(3)})`;
}

function colorForCell(activeSeconds: number, afkSeconds: number): string {
  const active = clamp01(activeSeconds / 3600);
  const afk = clamp01(afkSeconds / 3600);

  // Prefer active green intensity; otherwise afk gray intensity; otherwise transparent.
  if (active > 0) {
    // from dark bg to green
    const r = lerp(11, 34, active);
    const g = lerp(18, 197, active);
    const b = lerp(32, 94, active);
    return rgba(r, g, b, 0.95);
  }

  if (afk > 0) {
    const v = lerp(80, 210, afk);
    return rgba(v, v, v, 0.35);
  }

  return "rgba(255,255,255,0.06)";
}

export function createWeeklyActivityJstHeatmapSvg(
  days: DailyHourlyBucketsJst[],
  opts: WeeklyHeatmapSvgOptions = {},
): string {
  const title = opts.title ?? "Weekly Activity Heatmap (JST)";
  const subtitle = opts.subtitle ?? "Green=active(not-afk), Gray=inactive • Rows=hour(JST) • Cols=day";

  const cols = Math.max(1, days.length);
  const rows = 24;

  // Make the base SVG wide enough to avoid extreme scaling in PNG conversion (Slack preview cropping).
  // Use non-square cells (wide & short) so we can keep height reasonable while increasing width.
  const cellW = Math.max(40, Math.min(180, Math.floor(opts.cellWidth ?? (cols <= 7 ? 120 : 80))));
  const cellH = Math.max(10, Math.min(24, Math.floor(opts.cellHeight ?? 14)));
  const colGap = Math.max(0, Math.min(8, Math.floor(opts.columnGap ?? 2)));
  const rowGap = Math.max(0, Math.min(6, Math.floor(opts.rowGap ?? 1)));

  const padding = { left: 64, right: 18, top: 58, bottom: 78 };
  const gridW = cols * cellW + (cols - 1) * colGap;
  const gridH = rows * cellH + (rows - 1) * rowGap;

  const width = padding.left + gridW + padding.right;
  const height = padding.top + gridH + padding.bottom;

  const colorBg = "#0b1220";
  const colorText = "rgba(255,255,255,0.86)";
  const colorTextDim = "rgba(255,255,255,0.62)";
  const stroke = "rgba(255,255,255,0.08)";

  const header = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style>
      .t { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
      .title { font-size: 18px; font-weight: 700; fill: ${colorText}; }
      .sub { font-size: 12px; fill: ${colorTextDim}; }
      .axis { font-size: 11px; fill: ${colorTextDim}; }
    </style>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="${colorBg}" />
  <text class="t title" x="${padding.left}" y="28">${escapeXml(title)}</text>
  <text class="t sub" x="${padding.left}" y="46">${escapeXml(subtitle)}</text>
`;

  const xLabels = days
    .map((d, i) => {
      const x = padding.left + i * (cellW + colGap) + cellW / 2;
      const label = d.date.slice(5).replace("-", "/"); // MM/DD
      // Rotate labels a bit to avoid overlap even on narrow screens.
      return `<text class="t axis" x="${x}" y="${height - 18}" text-anchor="end" transform="rotate(-35 ${x} ${height - 18})">${escapeXml(label)}</text>`;
    })
    .join("\n");

  // Y axis: bottom=0:00, top=24:00 (JST)
  const rowPitch = cellH + rowGap;
  const yLabels = Array.from({ length: 25 }, (_, i) => i) // 0..24
    .filter(h => h % 3 === 0)
    .map(h => {
      const y = h === 24 ? padding.top + 4 : padding.top + (24 - h) * rowPitch - rowGap + 4;
      return `<text class="t axis" x="${padding.left - 10}" y="${y}" text-anchor="end">${h}:00</text>`;
    })
    .join("\n");

  const cells = days
    .map((d, xIdx) => {
      return d.hours
        .map((b, hIdx) => {
          const x = padding.left + xIdx * (cellW + colGap);
          // Flip vertically so hour 0 is at bottom.
          const y = padding.top + (23 - hIdx) * (cellH + rowGap);
          const fill = colorForCell(b.activeSeconds, b.afkSeconds);
          return `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="3" ry="3" fill="${fill}" stroke="${stroke}" />`;
        })
        .join("\n");
    })
    .join("\n");

  const legend = `
  <g>
    <rect x="${padding.left}" y="${height - 38}" width="10" height="10" rx="2" fill="rgba(34,197,94,0.95)" />
    <text class="t sub" x="${padding.left + 16}" y="${height - 29}">active</text>
    <rect x="${padding.left + 70}" y="${height - 38}" width="10" height="10" rx="2" fill="rgba(210,210,210,0.35)" />
    <text class="t sub" x="${padding.left + 86}" y="${height - 29}">inactive</text>
    <text class="t sub" x="${padding.left + 140}" y="${height - 29}">Timezone: JST</text>
  </g>
`;

  const footer = `
  <g>${cells}</g>
  <g>${xLabels}</g>
  <g>${yLabels}</g>
  ${legend}
</svg>
`.trim();

  return `${header}\n${footer}`;
}
