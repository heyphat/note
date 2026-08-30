import type { CSSProperties } from 'react';

// Translates a JSON Canvas `color` value into the inline style needed by
// the node's `.canvas-node` div.
//
// - Preset values "1"–"6" → no inline style needed (the CSS file already
//   maps the `[data-canvas-color="N"]` selector to `--canvas-node-color`).
// - Hex values (#rgb, #rrggbb, #rrggbbaa) → set `--canvas-node-color`
//   inline so the same border/background rules pick it up.
// - Anything else (malformed) → no style, falls back to the default theme.
//
// Keeping presets out of the inline path means light/dark theme overrides
// for the six presets keep working without any JS support.
export function nodeColorStyle(color?: string): CSSProperties | undefined {
  if (!color) return undefined;
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) {
    return { ['--canvas-node-color' as string]: color } as CSSProperties;
  }
  return undefined;
}
