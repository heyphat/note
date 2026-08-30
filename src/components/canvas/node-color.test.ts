import { describe, it, expect } from 'vitest';
import { nodeColorStyle } from './node-color';

describe('nodeColorStyle', () => {
  it('returns undefined when no color is set', () => {
    expect(nodeColorStyle(undefined)).toBeUndefined();
    expect(nodeColorStyle('')).toBeUndefined();
  });

  it('returns undefined for preset values (CSS handles those via data-attr)', () => {
    // The six preset values "1"–"6" are styled in globals.css by selecting
    // `.canvas-node[data-canvas-color="N"]` directly. The helper deliberately
    // does NOT emit inline style for them so the theme-aware preset colors
    // keep working without JS support.
    for (const c of ['1', '2', '3', '4', '5', '6']) {
      expect(nodeColorStyle(c)).toBeUndefined();
    }
  });

  it('returns an inline --canvas-node-color for 6-digit hex', () => {
    const style = nodeColorStyle('#ff0066') as Record<string, string>;
    expect(style['--canvas-node-color']).toBe('#ff0066');
  });

  it('accepts shorthand 3-digit hex', () => {
    const style = nodeColorStyle('#abc') as Record<string, string>;
    expect(style['--canvas-node-color']).toBe('#abc');
  });

  it('accepts 8-digit hex (with alpha)', () => {
    const style = nodeColorStyle('#11223344') as Record<string, string>;
    expect(style['--canvas-node-color']).toBe('#11223344');
  });

  it('accepts mixed case hex', () => {
    const style = nodeColorStyle('#Ff00Bb') as Record<string, string>;
    expect(style['--canvas-node-color']).toBe('#Ff00Bb');
  });

  it('returns undefined for malformed values rather than emitting bad CSS', () => {
    // Anything that doesn't match the preset pattern or a clean hex should
    // fall through to the default theme color, not poison the inline style
    // with a string the browser can't resolve.
    expect(nodeColorStyle('red')).toBeUndefined();
    expect(nodeColorStyle('rgb(255,0,0)')).toBeUndefined();
    expect(nodeColorStyle('#xyz')).toBeUndefined();
    expect(nodeColorStyle('#12')).toBeUndefined(); // too short
    expect(nodeColorStyle('#123456789')).toBeUndefined(); // too long
    expect(nodeColorStyle('7')).toBeUndefined(); // out-of-range preset
  });
});
