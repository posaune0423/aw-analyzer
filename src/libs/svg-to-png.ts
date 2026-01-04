/**
 * SVG to PNG converter
 *
 * Slack often treats SVG uploads as a generic binary file and does not render it inline.
 * Converting SVG to PNG ensures the graph is displayed as an image preview in Slack.
 */

import { Resvg } from "@resvg/resvg-js";

export type SvgToPngOptions = {
  width?: number;
  background?: string;
};

export function svgToPng(svg: string, opts: SvgToPngOptions = {}): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: opts.width ? { mode: "width", value: opts.width } : undefined,
    background: opts.background,
  });

  return resvg.render().asPng();
}
