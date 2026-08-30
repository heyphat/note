// Converts large `price-chart` fenced blocks into compact prompt summaries
// and optional PNG chart snapshots. The summaries keep exact recent OHLC
// values in text, while the images give vision-capable models the broader
// chart structure without shipping the full CSV block.

import {
  getPriceChartTimeframes,
  parsePriceChart,
  type Candle,
  type PriceChartData,
  type PriceChartTimeframe,
} from '../price-chart-parser';
import type { ImageAttachment } from './images';

const PRICE_CHART_LANGUAGES = new Set(['price-chart', 'pricechart', 'ohlc', 'candles']);
const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

const MAX_CHART_SNAPSHOTS = 4;
const MAX_RENDER_CANDLES = 1000;
const MAX_RECENT_CANDLES_IN_PROMPT = 20;
const SNAPSHOT_WIDTH = 960;
const SNAPSHOT_HEIGHT = 540;
const PRICE_PANE_RATIO = 0.85;
const TIME_SCALE_RESERVED_HEIGHT = 32;
const RIGHT_PRICE_SCALE_MIN_WIDTH = 64;

export interface PriceChartAiContext {
  text: string | null | undefined;
  images: ImageAttachment[];
}

interface ParsedPriceChartBlock {
  chartNumber: number;
  data: PriceChartData;
}

interface SnapshotTimeframe extends PriceChartTimeframe {
  omittedOlderCandles: number;
}

/**
 * Prepare note text for the model by replacing parseable `price-chart`
 * fences with concise summaries and attaching rendered PNG chart snapshots.
 * Rendering failures are non-fatal; the text summary still replaces the raw
 * source to keep the prompt bounded.
 */
export async function preparePriceChartAiContext(
  text: string | null | undefined,
): Promise<PriceChartAiContext> {
  if (!text || !containsPriceChartFence(text)) {
    return { text, images: [] };
  }

  const parsed = extractPriceChartBlocks(text);
  if (parsed.length === 0) {
    return { text, images: [] };
  }

  const captured = new Set<number>();
  const images: ImageAttachment[] = [];
  for (const block of parsed.slice(0, MAX_CHART_SNAPSHOTS)) {
    const bytes = await renderPriceChartPng(block.data);
    if (!bytes) continue;
    captured.add(block.chartNumber);
    images.push({
      bytes,
      mimeType: 'image/png',
      label: `price-chart-${block.chartNumber}.png`,
    });
  }

  return {
    text: summarizePriceChartsInMarkdown(text, captured),
    images,
  };
}

export function summarizePriceChartsInMarkdown(
  text: string,
  capturedChartNumbers = new Set<number>(),
): string {
  let chartNumber = 0;
  return text.replace(FENCE_RE, (full, langRaw: string, body: string) => {
    if (!isPriceChartLanguage(langRaw)) return full;
    const data = parsePriceChart(body);
    if (!data) return full;
    chartNumber += 1;
    return buildPriceChartSummary(data, chartNumber, capturedChartNumbers.has(chartNumber));
  });
}

function containsPriceChartFence(text: string): boolean {
  const re = new RegExp(FENCE_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (isPriceChartLanguage(match[1])) return true;
  }
  return false;
}

function extractPriceChartBlocks(text: string): ParsedPriceChartBlock[] {
  const out: ParsedPriceChartBlock[] = [];
  const re = new RegExp(FENCE_RE.source, 'g');
  let match: RegExpExecArray | null;
  let chartNumber = 0;
  while ((match = re.exec(text)) !== null) {
    if (!isPriceChartLanguage(match[1])) continue;
    const data = parsePriceChart(match[2]);
    if (!data) continue;
    chartNumber += 1;
    out.push({ chartNumber, data });
  }
  return out;
}

function isPriceChartLanguage(langRaw: string): boolean {
  return PRICE_CHART_LANGUAGES.has(String(langRaw).trim().toLowerCase());
}

function buildPriceChartSummary(data: PriceChartData, chartNumber: number, imageAttached: boolean): string {
  const candles = data.candles;
  const precision = inferPricePrecision(candles);
  const first = candles[0];
  const last = candles[candles.length - 1];
  const high = candles.reduce((best, candle) => candle.high > best.high ? candle : best, first);
  const low = candles.reduce((best, candle) => candle.low < best.low ? candle : best, first);
  const sourceTimeframe = getPriceChartTimeframes(data)[0]?.label ?? 'Source';
  const renderedTimeframe = selectSnapshotTimeframe(data);
  const net = last.close - first.open;
  const pct = first.open === 0 ? null : (net / first.open) * 100;
  const recent = candles.slice(-MAX_RECENT_CANDLES_IN_PROMPT);
  const hasVolume = data.hasVolume && candles.some(candle => candle.volume != null);

  const lines = [
    '```price-chart',
    `Chart ${chartNumber}: ${candles.length} source candles (${sourceTimeframe}).`,
    imageAttached
      ? `Rendered PNG attached as price-chart-${chartNumber}.png using ${formatSnapshotTimeframe(renderedTimeframe)}.`
      : 'Rendered PNG was unavailable; use this compact textual summary.',
    'The original price-chart CSV was omitted from this prompt for size. This summary is not an exact substring of the note.',
    `Range: ${formatTimestamp(first.time)} UTC to ${formatTimestamp(last.time)} UTC.`,
    `First: ${formatOhlc(first, precision)}.`,
    `Last: ${formatOhlc(last, precision)}.`,
    `High: ${formatPrice(high.high, precision)} at ${formatTimestamp(high.time)} UTC.`,
    `Low: ${formatPrice(low.low, precision)} at ${formatTimestamp(low.time)} UTC.`,
    `Net: ${formatSignedPrice(net, precision)}${pct == null ? '' : ` (${formatSignedPercent(pct)})`}.`,
  ];

  if (hasVolume) {
    const totalVolume = candles.reduce((sum, candle) => sum + (candle.volume ?? 0), 0);
    lines.push(`Total volume: ${formatLooseNumber(totalVolume)}.`);
  }

  lines.push(
    `Recent source candles (last ${recent.length}):`,
    `datetime,open,high,low,close${hasVolume ? ',volume' : ''}`,
    ...recent.map(candle => formatCandleCsv(candle, precision, hasVolume)),
    '```',
  );
  return lines.join('\n');
}

function selectSnapshotTimeframe(data: PriceChartData): SnapshotTimeframe {
  const timeframes = getPriceChartTimeframes(data).filter(timeframe => timeframe.candles.length > 0);
  const selected = timeframes.find(timeframe => timeframe.candles.length <= MAX_RENDER_CANDLES)
    ?? timeframes[timeframes.length - 1]
    ?? { label: 'Source', seconds: null, candles: data.candles };
  if (selected.candles.length <= MAX_RENDER_CANDLES) {
    return { ...selected, omittedOlderCandles: 0 };
  }
  return {
    ...selected,
    candles: selected.candles.slice(-MAX_RENDER_CANDLES),
    omittedOlderCandles: selected.candles.length - MAX_RENDER_CANDLES,
  };
}

function formatSnapshotTimeframe(timeframe: SnapshotTimeframe): string {
  if (timeframe.omittedOlderCandles <= 0) {
    return `${timeframe.candles.length} ${timeframe.label} candles`;
  }
  return [
    `the latest ${timeframe.candles.length} ${timeframe.label} candles`,
    `${timeframe.omittedOlderCandles} older candles omitted from the image`,
  ].join('; ');
}

async function renderPriceChartPng(data: PriceChartData): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || !document.body) return null;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = `${SNAPSHOT_WIDTH}px`;
  container.style.height = `${SNAPSHOT_HEIGHT}px`;
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-1';
  document.body.appendChild(container);

  let cleanupChart: (() => void) | null = null;
  try {
    const {
      createChart,
      ColorType,
      CrosshairMode,
      CandlestickSeries,
      HistogramSeries,
    } = await import('lightweight-charts');
    const dark = isDark();
    const timeframe = selectSnapshotTimeframe(data);

    const chart = createChart(container, {
      width: SNAPSHOT_WIDTH,
      height: SNAPSHOT_HEIGHT,
      layout: {
        background: { type: ColorType.Solid, color: dark ? '#111827' : '#ffffff' },
        textColor: dark ? '#d1d5db' : '#374151',
        panes: {
          enableResize: false,
          separatorColor: dark ? '#374151' : '#d1d4dc',
          separatorHoverColor: dark ? 'rgba(156, 163, 175, .16)' : 'rgba(107, 114, 128, .12)',
        },
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: {
        borderColor: dark ? '#374151' : '#d1d4dc',
        minimumWidth: RIGHT_PRICE_SCALE_MIN_WIDTH,
        scaleMargins: { top: 0.02, bottom: 0.02 },
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: dark ? '#374151' : '#d1d4dc',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: CrosshairMode.Hidden },
    });
    cleanupChart = () => chart.remove();

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    }, 0);
    candleSeries.setData(timeframe.candles as Parameters<typeof candleSeries.setData>[0]);

    if (data.hasVolume && timeframe.candles.some(candle => candle.volume != null)) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
      }, 1);
      volumeSeries.setData(timeframe.candles
        .filter(candle => candle.volume != null)
        .map(candle => ({
          time: candle.time,
          value: candle.volume!,
          color: candle.close >= candle.open ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)',
        })) as Parameters<typeof volumeSeries.setData>[0]);
      chart.priceScale('right', 1).applyOptions({
        borderColor: dark ? '#374151' : '#d1d4dc',
        scaleMargins: { top: 0.05, bottom: 0 },
      });

      const panes = chart.panes();
      const pricePane = panes[0];
      const volumePane = panes[1];
      if (pricePane && volumePane) {
        const paneHeight = Math.max(SNAPSHOT_HEIGHT - TIME_SCALE_RESERVED_HEIGHT, 1);
        const pricePaneHeight = Math.round(paneHeight * PRICE_PANE_RATIO);
        pricePane.setHeight(pricePaneHeight);
        volumePane.setHeight(paneHeight - pricePaneHeight);
      }
    }

    const lastIndex = timeframe.candles.length - 1;
    chart.timeScale().setVisibleLogicalRange({ from: -1, to: lastIndex + 1 });
    await waitForPaint();

    const canvas = chart.takeScreenshot(true, false);
    return await canvasToPngBytes(canvas);
  } catch {
    return null;
  } finally {
    cleanupChart?.();
    container.remove();
  }
}

function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

function waitForPaint(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  if (typeof canvas.toBlob !== 'function') return Promise.resolve(null);
  return new Promise(resolve => {
    canvas.toBlob(async blob => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}

function inferPricePrecision(candles: Candle[]): number {
  let precision = 2;
  for (const candle of candles) {
    for (const value of [candle.open, candle.high, candle.low, candle.close]) {
      const fraction = value.toString().split('.')[1];
      if (fraction) precision = Math.max(precision, Math.min(fraction.length, 6));
    }
  }
  return precision;
}

function formatTimestamp(seconds: number): string {
  const date = new Date(seconds * 1000);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatOhlc(candle: Candle, precision: number): string {
  return [
    `O ${formatPrice(candle.open, precision)}`,
    `H ${formatPrice(candle.high, precision)}`,
    `L ${formatPrice(candle.low, precision)}`,
    `C ${formatPrice(candle.close, precision)}`,
  ].join(' ');
}

function formatCandleCsv(candle: Candle, precision: number, includeVolume: boolean): string {
  const cells = [
    formatTimestamp(candle.time),
    formatPrice(candle.open, precision),
    formatPrice(candle.high, precision),
    formatPrice(candle.low, precision),
    formatPrice(candle.close, precision),
  ];
  if (includeVolume) cells.push(candle.volume == null ? '' : formatLooseNumber(candle.volume));
  return cells.join(',');
}

function formatPrice(value: number, precision: number): string {
  return value.toFixed(precision);
}

function formatSignedPrice(value: number, precision: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatPrice(value, precision)}`;
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatLooseNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(6).replace(/\.?0+$/g, '');
}
