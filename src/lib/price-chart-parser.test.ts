import { describe, it, expect } from 'vitest';
import { aggregateCandles, getPriceChartTimeframes, parsePriceChart } from './price-chart-parser';

describe('parsePriceChart', () => {
  it('parses CSV with header row', () => {
    const csv = `datetime,open,high,low,close,volume
2024-01-15 09:00,1.0850,1.0865,1.0845,1.0860,1200
2024-01-15 09:05,1.0860,1.0870,1.0855,1.0868,980`;
    const result = parsePriceChart(csv);
    expect(result).not.toBeNull();
    expect(result!.candles).toHaveLength(2);
    expect(result!.hasVolume).toBe(true);
    expect(result!.candles[0].open).toBe(1.085);
    expect(result!.candles[0].volume).toBe(1200);
  });

  it('parses headerless CSV (default column order)', () => {
    const csv = `2024-01-15T09:00:00,1.0850,1.0865,1.0845,1.0860
2024-01-15T09:05:00,1.0860,1.0870,1.0855,1.0868`;
    const result = parsePriceChart(csv);
    expect(result).not.toBeNull();
    expect(result!.candles).toHaveLength(2);
    expect(result!.hasVolume).toBe(false);
  });

  it('auto-detects column order from header', () => {
    const csv = `close,open,time,high,low
1.0860,1.0850,2024-01-15 09:00,1.0865,1.0845`;
    const result = parsePriceChart(csv);
    expect(result).not.toBeNull();
    expect(result!.candles[0].open).toBe(1.085);
    expect(result!.candles[0].close).toBe(1.086);
  });

  it('handles tab-separated values', () => {
    const csv = "date\topen\thigh\tlow\tclose\n2024-01-15\t100\t105\t99\t103";
    const result = parsePriceChart(csv);
    expect(result).not.toBeNull();
    expect(result!.candles[0].high).toBe(105);
  });

  it('accepts header aliases (o, h, l, c, v, t)', () => {
    const csv = `t,o,h,l,c,v
2024-01-15 09:00,1.085,1.087,1.084,1.086,500`;
    const result = parsePriceChart(csv);
    expect(result).not.toBeNull();
    expect(result!.candles[0].open).toBe(1.085);
    expect(result!.hasVolume).toBe(true);
  });

  it('sorts candles by time ascending', () => {
    const csv = `datetime,open,high,low,close
2024-01-15 09:10,1.09,1.10,1.08,1.09
2024-01-15 09:00,1.08,1.09,1.07,1.08
2024-01-15 09:05,1.08,1.09,1.07,1.09`;
    const result = parsePriceChart(csv);
    expect(result!.candles[0].time).toBeLessThan(result!.candles[1].time);
    expect(result!.candles[1].time).toBeLessThan(result!.candles[2].time);
  });

  it('skips invalid rows gracefully', () => {
    const csv = `datetime,open,high,low,close
2024-01-15 09:00,1.085,1.087,1.084,1.086
bad,row,data,here,nope
2024-01-15 09:05,1.086,1.088,1.085,1.087`;
    const result = parsePriceChart(csv);
    expect(result!.candles).toHaveLength(2);
  });

  it('returns null for empty input', () => {
    expect(parsePriceChart('')).toBeNull();
    expect(parsePriceChart('  \n  ')).toBeNull();
  });

  it('returns null for single line (header only)', () => {
    expect(parsePriceChart('datetime,open,high,low,close')).toBeNull();
  });

  it('returns null when required columns are missing from header', () => {
    const csv = `datetime,open,close
2024-01-15,1.085,1.086`;
    expect(parsePriceChart(csv)).toBeNull();
  });

  it('accepts a REST JSON envelope { results: [{t,o,h,l,c,v}, ...] }', () => {
    const json = JSON.stringify({
      results: [
        { c: 75.0875, h: 75.15, l: 73.7975, n: 1, o: 74.06, t: 1577941200000, v: 135647456, vw: 74.6099 },
        { c: 74.3575, h: 75.145, l: 74.125, n: 1, o: 74.2875, t: 1578027600000, v: 146535512, vw: 74.7026 },
      ],
    });
    const result = parsePriceChart(json);
    expect(result).not.toBeNull();
    expect(result!.candles).toHaveLength(2);
    expect(result!.hasVolume).toBe(true);
    // t in the payload is ms; parser stores seconds.
    expect(result!.candles[0].time).toBe(1577941200);
    expect(result!.candles[0].open).toBe(74.06);
    expect(result!.candles[0].high).toBe(75.15);
    expect(result!.candles[0].low).toBe(73.7975);
    expect(result!.candles[0].close).toBe(75.0875);
    expect(result!.candles[0].volume).toBe(135647456);
  });

  it('accepts a bare JSON array of candle objects', () => {
    const json = JSON.stringify([
      { t: 1577941200, o: 74.06, h: 75.15, l: 73.7975, c: 75.0875, v: 135647456 },
      { t: 1578027600, o: 74.2875, h: 75.145, l: 74.125, c: 74.3575, v: 146535512 },
    ]);
    const result = parsePriceChart(json);
    expect(result).not.toBeNull();
    expect(result!.candles).toHaveLength(2);
    expect(result!.candles[0].time).toBe(1577941200);
  });

  it('accepts JSON with long-form field names (time/open/high/low/close/volume)', () => {
    const json = JSON.stringify([
      { time: '2024-01-15', open: 1.085, high: 1.087, low: 1.084, close: 1.086, volume: 1200 },
    ]);
    const result = parsePriceChart(json);
    expect(result).not.toBeNull();
    expect(result!.candles[0].open).toBe(1.085);
    expect(result!.candles[0].volume).toBe(1200);
  });

  it('skips JSON rows missing required fields and returns null when nothing remains', () => {
    const json = JSON.stringify({ results: [{ t: 1577941200000, o: 74 }] });
    expect(parsePriceChart(json)).toBeNull();
  });

  it('handles unix timestamps in seconds', () => {
    const csv = `time,open,high,low,close
1705312800,1.085,1.087,1.084,1.086`;
    const result = parsePriceChart(csv);
    expect(result).not.toBeNull();
    expect(result!.candles[0].time).toBe(1705312800);
  });

  it('handles unix timestamps in milliseconds', () => {
    const csv = `time,open,high,low,close
1705312800000,1.085,1.087,1.084,1.086`;
    const result = parsePriceChart(csv);
    expect(result!.candles[0].time).toBe(1705312800);
  });

  it('parses cTrader broker format with both timestamp_utc and timestamp_ms', () => {
    const csv = `timestamp_utc,timestamp_ms,open,high,low,close,volume
2026-04-29 14:20:00,1777472400000,4534.43,4537.1,4532.42,4536.61,1580
2026-04-29 14:25:00,1777472700000,4536.58,4537.59,4532.03,4533.21,1520`;
    const result = parsePriceChart(csv);
    expect(result).not.toBeNull();
    expect(result!.candles).toHaveLength(2);
    expect(result!.hasVolume).toBe(true);
    // Prefer the unambiguous ms column over the string datetime column.
    expect(result!.candles[0].time).toBe(1777472400);
    expect(result!.candles[0].open).toBe(4534.43);
    expect(result!.candles[0].volume).toBe(1580);
  });

  it('treats unmarked datetime strings as UTC', () => {
    const csv = `timestamp_utc,open,high,low,close
2026-04-29 14:20:00,4534.43,4537.1,4532.42,4536.61`;
    const result = parsePriceChart(csv);
    expect(result).not.toBeNull();
    expect(result!.candles[0].time).toBe(Math.floor(Date.UTC(2026, 3, 29, 14, 20, 0) / 1000));
  });

  it('aggregates candles into higher timeframes', () => {
    const csv = `datetime,open,high,low,close,volume
2026-04-29 14:00:00,100,105,99,102,10
2026-04-29 14:05:00,102,108,101,107,20
2026-04-29 14:10:00,107,109,103,104,30
2026-04-29 14:15:00,104,106,98,99,40`;
    const result = parsePriceChart(csv);
    const candles = aggregateCandles(result!.candles, 15 * 60);
    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({ open: 100, high: 109, low: 99, close: 104, volume: 60 });
    expect(candles[1]).toMatchObject({ open: 104, high: 106, low: 98, close: 99, volume: 40 });
  });

  it('returns switchable timeframes at or above the source resolution', () => {
    const csv = `datetime,open,high,low,close
2026-04-29 14:00:00,100,105,99,102
2026-04-29 14:05:00,102,108,101,107
2026-04-29 14:10:00,107,109,103,104`;
    const result = parsePriceChart(csv);
    const timeframes = getPriceChartTimeframes(result!);
    expect(timeframes.map(tf => tf.label)).toEqual(['M5', 'M10', 'M15', 'M30', 'H1', 'H4', 'D1']);
    expect(timeframes[0].candles).toBe(result!.candles);
    expect(timeframes[1].candles).toHaveLength(2);
    expect(timeframes[1].candles[0].close).toBe(107);
    expect(timeframes[2].candles).toHaveLength(1);
    expect(timeframes[2].candles[0].close).toBe(104);
  });
});
