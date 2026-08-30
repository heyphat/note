/**
 * Milkdown plugin for inline candlestick charts backed by fenced code.
 *
 * ```price-chart
 * datetime,open,high,low,close,volume
 * 2024-01-15 09:00,1.0850,1.0865,1.0845,1.0860,1200
 * ...
 * ```
 *
 * Renders a lightweight-charts candlestick chart below the code block.
 */

import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import {
  getPriceChartTimeframes,
  parsePriceChart,
  type Candle,
  type PriceChartData,
  type PriceChartTimeframe,
} from './price-chart-parser';

const LANGUAGES = new Set(['price-chart', 'pricechart', 'ohlc', 'candles']);
const pluginKey = new PluginKey('NOTES_PRICE_CHART');
const CHART_HEIGHT = 420;
const PRICE_PANE_RATIO = 0.85;
const TIME_SCALE_RESERVED_HEIGHT = 32;
const RIGHT_PRICE_SCALE_MIN_WIDTH = 64;
// Cap the code-block size we'll wrap with a widget. Above this we leave the
// fence rendering as plain code — a huge node + widget + adjacent list items
// has tripped a `matchesNode` crash in Milkdown's list-item nodeView. The
// limit is generous enough for years of daily OHLC but small enough to dodge
// the pathological case. ~50 KB ≈ 1k+ comma-separated daily candles.
const MAX_CODE_LENGTH = 50_000;
// Cap candles we hand to lightweight-charts. Above this the chart starts
// stuttering and the resize/zoom controls feel laggy. We slice to the most
// recent N so the chart still answers "what does the latest data look like".
const MAX_CANDLES = 5000;

interface Block {
  from: number;
  to: number;
  insertAt: number;
  code: string;
  blockKey: string;
}

interface OhlcPoint {
  open: number;
  high: number;
  low: number;
  close: number;
}

function collectBlocks(doc: ProseNode): Block[] {
  const out: Block[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true;
    const lang = String(node.attrs.language ?? '').trim().toLowerCase();
    if (!LANGUAGES.has(lang)) return false;
    const code = node.textContent;
    // Skip oversized blocks entirely. We neither collapse the source nor
    // mount a widget — the raw fence stays visible as plain code. This is
    // the safe fallback for the matchesNode crash that fires when a huge
    // widget decoration sits next to list items.
    if (code.length > MAX_CODE_LENGTH) return false;
    const from = pos;
    const to = pos + node.nodeSize;
    out.push({ from, to, insertAt: to, code, blockKey: `price-chart:${pos}` });
    return false;
  });
  return out;
}

function isDark(): boolean {
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

function inferPricePrecision(data: PriceChartData): number {
  let precision = 2;
  for (const candle of data.candles) {
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

function formatVolume(volume: number | undefined): string {
  if (volume == null) return '';
  return ` V ${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    notation: 'compact',
  }).format(volume)}`;
}

function formatOhlc(point: OhlcPoint, precision: number): string {
  const fmt = (value: number) => value.toFixed(precision);
  return `O ${fmt(point.open)} H ${fmt(point.high)} L ${fmt(point.low)} C ${fmt(point.close)}`;
}

function formatHoverCandle(candle: Candle, precision: number): string {
  return `${formatTimestamp(candle.time)} ${formatOhlc(candle, precision)}${formatVolume(candle.volume)}`;
}

function formatCandleCount(timeframe: PriceChartTimeframe): string {
  const suffix = timeframe.candles.length === 1 ? 'candle' : 'candles';
  return `${timeframe.candles.length} ${suffix}`;
}

interface RenderOptions {
  height?: number;
  countEl?: HTMLElement;
  timeframeEl?: HTMLElement;
  onCleanup?: (cleanup: () => void) => void;
}

function renderChart(container: HTMLElement, data: PriceChartData, ohlcEl: HTMLElement, options?: RenderOptions): void {
  const totalHeight = options?.height ?? CHART_HEIGHT;
  // Lazy-load lightweight-charts to keep initial bundle small.
  import('lightweight-charts').then(({ createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries }) => {
    // Container may have been removed from DOM by the time the import resolves.
    if (!container.isConnected) return;
    try {
    const dark = isDark();
    const pricePrecision = inferPricePrecision(data);
    const timeframes = getPriceChartTimeframes(data).filter(timeframe => timeframe.candles.length > 0);
    let activeTimeframe = timeframes[0] ?? { label: 'Source', seconds: null, candles: data.candles };
    let candlesByTime = new Map(activeTimeframe.candles.map(candle => [candle.time, candle]));
    // Explicit dimensions instead of autoSize: in a ProseMirror widget the
    // container's measured size can lag the first chart paint, leaving the
    // time-scale row taller than the canvas reserved for it and clipping the
    // date labels. Width is tracked manually below via ResizeObserver.
    const initialWidth = Math.max(container.clientWidth || container.offsetWidth, 320);
    const chart = createChart(container, {
      width: initialWidth,
      height: totalHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
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
        // The right axis is a separate canvas inside an internal table cell.
        // Give it enough floor width so host/editor CSS cannot clip decimals.
        minimumWidth: RIGHT_PRICE_SCALE_MIN_WIDTH,
        scaleMargins: { top: 0.02, bottom: 0.02 },
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: dark ? '#374151' : '#d1d4dc',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    }, 0);
    series.setData(activeTimeframe.candles as Parameters<typeof series.setData>[0]);

    const onCrosshairMove: Parameters<typeof chart.subscribeCrosshairMove>[0] = param => {
      const sourceCandle = typeof param.time === 'number' ? candlesByTime.get(param.time) : undefined;
      ohlcEl.textContent = param.point && sourceCandle
        ? formatHoverCandle(sourceCandle, pricePrecision)
        : '';
    };
    chart.subscribeCrosshairMove(onCrosshairMove);

    const volumeDataFor = (timeframe: PriceChartTimeframe) => timeframe.candles
      .filter(c => c.volume != null)
      .map(c => ({
        time: c.time,
        value: c.volume!,
        color: c.close >= c.open ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)',
      }));

    let volSeries: ReturnType<typeof chart.addSeries> | undefined;
    if (data.hasVolume && data.candles.some(c => c.volume != null)) {
      volSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
      }, 1);
      volSeries.setData(volumeDataFor(activeTimeframe) as Parameters<typeof volSeries.setData>[0]);
      chart.priceScale('right', 1).applyOptions({
        borderColor: dark ? '#374151' : '#d1d4dc',
        scaleMargins: { top: 0.05, bottom: 0 },
      });

      const panes = chart.panes();
      const pricePane = panes[0];
      const volumePane = panes[1];
      if (pricePane && volumePane) {
        const paneHeight = Math.max(totalHeight - TIME_SCALE_RESERVED_HEIGHT, 1);
        const pricePaneHeight = Math.round(paneHeight * PRICE_PANE_RATIO);
        pricePane.setHeight(pricePaneHeight);
        volumePane.setHeight(paneHeight - pricePaneHeight);
      }
    }

    const setVisibleRange = (timeframe: PriceChartTimeframe) => {
      const lastIndex = timeframe.candles.length - 1;
      chart.timeScale().setVisibleLogicalRange({ from: -1, to: lastIndex + 1 });
    };

    let timeframeButtons: HTMLButtonElement[] = [];
    const setActiveTimeframe = (index: number) => {
      const next = timeframes[index];
      if (!next) return;
      activeTimeframe = next;
      candlesByTime = new Map(activeTimeframe.candles.map(candle => [candle.time, candle]));
      series.setData(activeTimeframe.candles as Parameters<typeof series.setData>[0]);
      if (volSeries) {
        volSeries.setData(volumeDataFor(activeTimeframe) as Parameters<typeof volSeries.setData>[0]);
      }
      setVisibleRange(activeTimeframe);
      ohlcEl.textContent = '';
      if (options?.countEl) options.countEl.textContent = formatCandleCount(activeTimeframe);
      timeframeButtons.forEach((button, buttonIndex) => {
        const active = buttonIndex === index;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    };

    if (options?.timeframeEl && timeframes.length > 1) {
      options.timeframeEl.hidden = false;
      options.timeframeEl.replaceChildren();
      timeframeButtons = timeframes.map((timeframe, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'price-chart-timeframe';
        button.textContent = timeframe.label;
        button.title = `${timeframe.label} timeframe`;
        button.setAttribute('aria-label', `${timeframe.label} timeframe`);
        button.addEventListener('mousedown', e => e.preventDefault());
        button.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          setActiveTimeframe(index);
        });
        options.timeframeEl!.appendChild(button);
        return button;
      });
    } else if (options?.timeframeEl) {
      options.timeframeEl.hidden = true;
      options.timeframeEl.replaceChildren();
    }
    setActiveTimeframe(0);

    // Width follows container size; height is fixed.
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) chart.applyOptions({ width: w });
      }
    });
    ro.observe(container);

    // Theme change listener
    const onTheme = () => {
      const d = isDark();
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: d ? '#d1d5db' : '#374151',
          panes: {
            enableResize: false,
            separatorColor: d ? '#374151' : '#d1d4dc',
            separatorHoverColor: d ? 'rgba(156, 163, 175, .16)' : 'rgba(107, 114, 128, .12)',
          },
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        rightPriceScale: { borderColor: d ? '#374151' : '#d1d4dc' },
        timeScale: { borderColor: d ? '#374151' : '#d1d4dc' },
      });
      if (data.hasVolume && data.candles.some(c => c.volume != null)) {
        chart.priceScale('right', 1).applyOptions({ borderColor: d ? '#374151' : '#d1d4dc' });
      }
    };
    window.addEventListener('themechange', onTheme);

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cleanup.disconnect();
      ro.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      window.removeEventListener('themechange', onTheme);
      chart.remove();
    };

    // Cleanup when widget is removed from DOM
    const cleanup = new MutationObserver(() => {
      if (!container.isConnected) dispose();
    });
    cleanup.observe(container.parentElement ?? document.body, { childList: true, subtree: true });

    options?.onCleanup?.(dispose);
    } catch (err) {
      // Swallow lightweight-charts runtime errors (bad data ranges, duplicate
      // timestamps, etc.) so a single malformed block can't take down the
      // editor. Surface a non-interactive notice in place of the chart.
      console.warn('[price-chart] chart render failed:', err);
      container.replaceChildren();
      const msg = document.createElement('div');
      msg.className = 'price-chart-error';
      msg.textContent = 'Chart could not be rendered. Check the data for duplicate timestamps or invalid values.';
      container.appendChild(msg);
    }
  });
}

const EXPAND_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

function openChartLightbox(data: PriceChartData): void {
  const overlay = document.createElement('div');
  overlay.className = 'price-chart-lightbox';
  overlay.tabIndex = -1;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'price-chart-lightbox-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';

  const inner = document.createElement('div');
  inner.className = 'price-chart-lightbox-inner';

  const header = document.createElement('div');
  header.className = 'price-chart-header price-chart-lightbox-header';
  const count = document.createElement('span');
  count.textContent = `${data.candles.length} candles`;
  const timeframes = document.createElement('div');
  timeframes.className = 'price-chart-timeframes';
  const ohlc = document.createElement('span');
  ohlc.className = 'price-chart-ohlc';
  header.append(count, timeframes, ohlc);

  const chartContainer = document.createElement('div');
  chartContainer.className = 'price-chart-lightbox-container';

  inner.append(header, chartContainer);
  overlay.append(closeBtn, inner);
  document.body.appendChild(overlay);
  // Steal focus so Escape isn't swallowed by the editor.
  overlay.focus();

  let dispose: (() => void) | undefined;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    dispose?.();
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);

  // Lay out before chart init so initial width is read correctly.
  const height = Math.min(Math.max(window.innerHeight - 160, 480), 900);
  chartContainer.style.height = `${height}px`;

  renderChart(chartContainer, data, ohlc, {
    height,
    countEl: count,
    timeframeEl: timeframes,
    onCleanup: c => {
      if (closed) c();
      else dispose = c;
    },
  });
}

function createWidget(code: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'price-chart-preview';
  root.contentEditable = 'false';

  if (!code.trim()) {
    const msg = document.createElement('div');
    msg.className = 'price-chart-empty';
    msg.textContent = 'Paste CSV candle data (datetime, open, high, low, close) into this block.';
    root.appendChild(msg);
    return root;
  }

  let parsed: PriceChartData | null;
  try {
    parsed = parsePriceChart(code);
  } catch (err) {
    // parsePriceChart shouldn't throw today, but guard anyway — the parser
    // is the boundary between user-supplied text and the chart runtime, and
    // a future parser change shouldn't be able to crash the editor.
    console.warn('[price-chart] parse failed:', err);
    parsed = null;
  }
  if (!parsed) {
    const msg = document.createElement('div');
    msg.className = 'price-chart-error';
    msg.textContent = 'Could not parse OHLC data. Expected columns: datetime, open, high, low, close[, volume].';
    root.appendChild(msg);
    return root;
  }

  // Slice to the last MAX_CANDLES so a huge block still renders something
  // useful (the most recent window) rather than freezing the chart engine.
  // The header's candle count is rewritten by setActiveTimeframe on first
  // render, so the slice is silent rather than surfacing a "showing last N"
  // banner that would get overwritten anyway.
  const data: PriceChartData = parsed.candles.length > MAX_CANDLES
    ? { candles: parsed.candles.slice(-MAX_CANDLES), hasVolume: parsed.hasVolume }
    : parsed;

  // Header showing candle count
  const header = document.createElement('div');
  header.className = 'price-chart-header';
  const count = document.createElement('span');
  count.textContent = `${data.candles.length} candles`;
  const timeframes = document.createElement('div');
  timeframes.className = 'price-chart-timeframes';
  const ohlc = document.createElement('span');
  ohlc.className = 'price-chart-ohlc';
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'price-chart-expand';
  expand.setAttribute('aria-label', 'Expand chart');
  expand.title = 'Expand';
  expand.innerHTML = EXPAND_ICON_SVG;
  expand.addEventListener('mousedown', e => e.preventDefault());
  expand.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    openChartLightbox(data);
  });
  header.append(count, timeframes, ohlc, expand);
  root.appendChild(header);

  const chartContainer = document.createElement('div');
  chartContainer.className = 'price-chart-container';
  root.appendChild(chartContainer);

  renderChart(chartContainer, data, ohlc, { countEl: count, timeframeEl: timeframes });
  return root;
}

export function createPriceChartPlugin(): Plugin {
  function buildDecorations(state: EditorState): DecorationSet {
    const blocks = collectBlocks(state.doc);
    const decos = blocks.flatMap(block => [
      Decoration.node(block.from, block.to, { class: 'price-chart-source-collapsed' }),
      Decoration.widget(
        block.insertAt,
        () => createWidget(block.code),
        { side: 1, key: `${block.blockKey}:${block.code}` },
      ),
    ]);
    return DecorationSet.create(state.doc, decos);
  }

  return new Plugin({
    key: pluginKey,
    state: {
      init(_cfg, state) {
        return { deco: buildDecorations(state) };
      },
      apply(tr, value, _oldState, newState) {
        if (tr.docChanged) return { deco: buildDecorations(newState) };
        return { deco: value.deco.map(tr.mapping, tr.doc) };
      },
    },
    props: {
      decorations(state) {
        return pluginKey.getState(state)?.deco ?? null;
      },
    },
  });
}

export function createPriceChartEditorPlugin() {
  return $prose(() => createPriceChartPlugin());
}
