import { describe, expect, it } from 'vitest';
import { summarizePriceChartsInMarkdown } from './price-chart-snapshots';

function chartBlock(rowCount = 120): string {
  const rows = Array.from({ length: rowCount }, (_, i) => {
    const timestamp = 1767225600 + i * 60;
    const open = 100 + i;
    return `${timestamp},${open},${open + 1},${open - 1},${open + 0.5},${10 + i}`;
  });
  return [
    '```price-chart',
    'datetime,open,high,low,close,volume',
    ...rows,
    '```',
  ].join('\n');
}

describe('summarizePriceChartsInMarkdown', () => {
  it('replaces parseable price-chart source with a compact summary', () => {
    const source = `Before\n\n${chartBlock()}\n\nAfter`;
    const out = summarizePriceChartsInMarkdown(source, new Set([1]));

    expect(out).toContain('Before');
    expect(out).toContain('After');
    // The summary block keeps the original `price-chart` fence name so any
    // edit_note find string the model writes still matches the disk fence.
    // Distinguish summary-vs-raw by what's inside the fence, not its name.
    expect(out).toContain('```price-chart\nChart 1: 120 source candles');
    expect(out).toContain('Rendered PNG attached as price-chart-1.png');
    expect(out).toContain('Recent source candles (last 20):');
    // An early data row from the raw block must be dropped — the summary
    // only keeps the last 20 candles, so any row earlier than index 100
    // proves the full CSV wasn't pasted through.
    expect(out).not.toContain('1767225900,105,106,104,105.5,15');
    expect(out.length).toBeLessThan(source.length);
  });

  it('marks the summary when no rendered image is available', () => {
    const out = summarizePriceChartsInMarkdown(chartBlock(3));
    expect(out).toContain('Rendered PNG was unavailable');
    expect(out).toContain('The original price-chart CSV was omitted');
  });

  it('describes rendered images with the aggregated timeframe that fits the cap', () => {
    const out = summarizePriceChartsInMarkdown(chartBlock(1005), new Set([1]));
    expect(out).toContain('using 201 M5 candles');
  });

  it('leaves invalid price-chart blocks untouched', () => {
    const source = '```price-chart\nnot,enough,data\n```';
    expect(summarizePriceChartsInMarkdown(source)).toBe(source);
  });

  it('ignores non chart code fences', () => {
    const source = '```csv\na,b\n1,2\n```';
    expect(summarizePriceChartsInMarkdown(source)).toBe(source);
  });
});
