/**
 * Parses CSV OHLC data from a fenced `price-chart` code block.
 *
 * Accepted formats:
 *   - With header row (column names auto-detected, order-independent)
 *   - Without header (assumes: datetime, open, high, low, close[, volume])
 *
 * Returns null when the input cannot be parsed into at least one valid candle.
 */

export interface Candle {
  /** Unix timestamp in seconds (UTC) — matches lightweight-charts UTCTimestamp */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PriceChartData {
  candles: Candle[];
  hasVolume: boolean;
}

export interface PriceChartTimeframe {
  label: string;
  seconds: number | null;
  candles: Candle[];
}

const STANDARD_TIMEFRAMES = [
  { label: 'M1', seconds: 60 },
  { label: 'M5', seconds: 5 * 60 },
  { label: 'M10', seconds: 10 * 60 },
  { label: 'M15', seconds: 15 * 60 },
  { label: 'M30', seconds: 30 * 60 },
  { label: 'H1', seconds: 60 * 60 },
  { label: 'H4', seconds: 4 * 60 * 60 },
  { label: 'D1', seconds: 24 * 60 * 60 },
] as const;

const HEADER_ALIASES: Record<string, string> = {
  datetime: 'time', date: 'time', time: 'time',
  timestamp: 'time', timestamp_utc: 'time', timestamp_ms: 'time', t: 'time',
  open: 'open', o: 'open',
  high: 'high', h: 'high',
  low: 'low', l: 'low',
  close: 'close', c: 'close',
  volume: 'volume', vol: 'volume', v: 'volume',
};

// When a header has multiple time-like columns (e.g. cTrader's
// `timestamp_utc,timestamp_ms`), prefer the unambiguous numeric ms column.
const TIME_ALIAS_PRIORITY = ['timestamp_ms', 'timestamp', 'unix'];

const REQUIRED = ['time', 'open', 'high', 'low', 'close'] as const;

function detectSeparator(line: string): string {
  if (line.includes('\t')) return '\t';
  return ',';
}

function splitRow(line: string, sep: string): string[] {
  return line.split(sep).map(c => c.trim());
}

function parseTime(raw: string): number | null {
  const s = raw.replace(/^["']|["']$/g, '');
  // Unix timestamp (seconds or ms)
  if (/^\d{9,13}$/.test(s)) {
    const n = Number(s);
    return n > 1e11 ? Math.floor(n / 1000) : n;
  }
  // Convert "YYYY-MM-DD HH:MM[:SS]" to ISO form, then interpret unmarked
  // datetimes as UTC — trading data is virtually always in UTC, and JS would
  // otherwise parse "2024-01-15T09:00:00" as local time. Date-only strings
  // like "2024-01-15" are already UTC midnight per ECMAScript.
  let iso = s.replace(' ', 'T');
  if (iso.includes('T') && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)) {
    iso += 'Z';
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

function parseNum(raw: string): number | null {
  const n = Number(raw.replace(/^["']|["']$/g, ''));
  return isFinite(n) ? n : null;
}

function isHeaderRow(cells: string[]): boolean {
  return cells.some(c => HEADER_ALIASES[c.toLowerCase().trim()] !== undefined);
}

function resolveColumns(headerCells: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  const normalized = headerCells.map(c => c.toLowerCase().trim());
  for (const preferred of TIME_ALIAS_PRIORITY) {
    const idx = normalized.indexOf(preferred);
    if (idx !== -1) {
      map.time = idx;
      break;
    }
  }
  for (let i = 0; i < normalized.length; i++) {
    const alias = HEADER_ALIASES[normalized[i]];
    if (alias && !(alias in map)) map[alias] = i;
  }
  for (const r of REQUIRED) {
    if (!(r in map)) return null;
  }
  return map;
}

const DEFAULT_COLUMNS: Record<string, number> = {
  time: 0, open: 1, high: 2, low: 3, close: 4, volume: 5,
};

/** Pull candles out of a JSON payload — supports both the common REST
 *  shape `{ "results": [{t,o,h,l,c,v}, ...] }` and a bare array of
 *  candle objects. Field aliases match the CSV header aliases, so a JSON
 *  paste using `time/open/high/low/close/volume` parses the same as
 *  `t/o/h/l/c/v`. Extra fields (`n`, `vw`, etc.) are ignored. Returns null
 *  if the source isn't JSON or doesn't yield at least one valid candle. */
function tryParseJson(source: string): PriceChartData | null {
  const trimmed = source.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  let rows: unknown[];
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    // Accept the common envelope keys: `results`, plus `candles`/`data`
    // for any other source the user might paste.
    const candidates = [obj.results, obj.candles, obj.data];
    const found = candidates.find(c => Array.isArray(c));
    if (!Array.isArray(found)) return null;
    rows = found;
  } else {
    return null;
  }

  const candles: Candle[] = [];
  let hasVolume = false;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const timeRaw = pickField(r, ['t', 'time', 'timestamp', 'timestamp_ms', 'datetime', 'date']);
    const openRaw = pickField(r, ['o', 'open']);
    const highRaw = pickField(r, ['h', 'high']);
    const lowRaw = pickField(r, ['l', 'low']);
    const closeRaw = pickField(r, ['c', 'close']);
    const volumeRaw = pickField(r, ['v', 'volume', 'vol']);

    const time = parseTimeAny(timeRaw);
    const open = parseNumAny(openRaw);
    const high = parseNumAny(highRaw);
    const low = parseNumAny(lowRaw);
    const close = parseNumAny(closeRaw);
    if (time == null || open == null || high == null || low == null || close == null) continue;

    const candle: Candle = { time, open, high, low, close };
    const volume = parseNumAny(volumeRaw);
    if (volume != null) {
      candle.volume = volume;
      hasVolume = true;
    }
    candles.push(candle);
  }

  if (!candles.length) return null;
  candles.sort((a, b) => a.time - b.time);
  return { candles, hasVolume };
}

function pickField(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function parseTimeAny(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Match the CSV path's heuristic: > 1e11 is treated as ms, else seconds.
    return value > 1e11 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === 'string') return parseTime(value);
  return null;
}

function parseNumAny(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return parseNum(value);
  return null;
}

export function parsePriceChart(source: string): PriceChartData | null {
  // Try JSON first so a market-data REST response (or a generic
  // `[{t,o,h,l,c,v}, ...]` array) parses without the AI having to convert
  // it to CSV. Falls through to CSV/TSV parsing if the source isn't JSON.
  const json = tryParseJson(source);
  if (json) return json;

  const lines = source.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const sep = detectSeparator(lines[0]);
  const firstCells = splitRow(lines[0], sep);
  const hasHeader = isHeaderRow(firstCells);

  let cols: Record<string, number>;
  let dataLines: string[];

  if (hasHeader) {
    const resolved = resolveColumns(firstCells);
    if (!resolved) return null;
    cols = resolved;
    dataLines = lines.slice(1);
  } else {
    const colCount = firstCells.length;
    cols = colCount >= 6
      ? DEFAULT_COLUMNS
      : { time: 0, open: 1, high: 2, low: 3, close: 4 };
    dataLines = lines;
  }

  const hasVolume = 'volume' in cols;
  const candles: Candle[] = [];

  for (const line of dataLines) {
    const cells = splitRow(line, sep);
    const time = parseTime(cells[cols.time]);
    const open = parseNum(cells[cols.open]);
    const high = parseNum(cells[cols.high]);
    const low = parseNum(cells[cols.low]);
    const close = parseNum(cells[cols.close]);
    if (time == null || open == null || high == null || low == null || close == null) continue;

    const candle: Candle = { time, open, high, low, close };
    if (hasVolume) {
      const v = parseNum(cells[cols.volume]);
      if (v != null) candle.volume = v;
    }
    candles.push(candle);
  }

  if (!candles.length) return null;
  // Sort by time ascending
  candles.sort((a, b) => a.time - b.time);
  return { candles, hasVolume };
}

function inferSourceTimeframeSeconds(candles: Candle[]): number | null {
  const counts = new Map<number, number>();
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].time - candles[i - 1].time;
    if (diff <= 0) continue;
    counts.set(diff, (counts.get(diff) ?? 0) + 1);
  }

  let best: number | null = null;
  let bestCount = 0;
  counts.forEach((count, seconds) => {
    if (count > bestCount || (count === bestCount && best != null && seconds < best)) {
      best = seconds;
      bestCount = count;
    }
  });
  return best;
}

function labelForSeconds(seconds: number): string {
  return STANDARD_TIMEFRAMES.find(tf => tf.seconds === seconds)?.label ?? 'Source';
}

export function aggregateCandles(candles: Candle[], timeframeSeconds: number): Candle[] {
  if (timeframeSeconds <= 0) return candles;

  const buckets = new Map<number, Candle>();
  for (const candle of candles) {
    const bucketTime = Math.floor(candle.time / timeframeSeconds) * timeframeSeconds;
    const bucket = buckets.get(bucketTime);
    if (!bucket) {
      buckets.set(bucketTime, { ...candle, time: bucketTime });
      continue;
    }

    bucket.high = Math.max(bucket.high, candle.high);
    bucket.low = Math.min(bucket.low, candle.low);
    bucket.close = candle.close;
    if (candle.volume != null || bucket.volume != null) {
      bucket.volume = (bucket.volume ?? 0) + (candle.volume ?? 0);
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

export function getPriceChartTimeframes(data: PriceChartData): PriceChartTimeframe[] {
  const sourceSeconds = inferSourceTimeframeSeconds(data.candles);
  if (!sourceSeconds) {
    return [{ label: 'Source', seconds: null, candles: data.candles }];
  }

  const standardOptions = STANDARD_TIMEFRAMES
    .filter(tf => tf.seconds >= sourceSeconds)
    .map(tf => ({
      label: tf.label,
      seconds: tf.seconds,
      candles: tf.seconds === sourceSeconds ? data.candles : aggregateCandles(data.candles, tf.seconds),
    }));

  if (!standardOptions.length || standardOptions[0].seconds !== sourceSeconds) {
    return [
      { label: labelForSeconds(sourceSeconds), seconds: sourceSeconds, candles: data.candles },
      ...standardOptions,
    ];
  }

  return standardOptions;
}
