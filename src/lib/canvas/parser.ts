import type {
  CanvasDoc,
  CanvasEdge,
  CanvasNode,
  CanvasSide,
  CanvasEndType,
} from './types';
import { EMPTY_CANVAS } from './types';

export type ParseResult =
  | { ok: true; doc: CanvasDoc }
  | { ok: false; error: string };

const SIDES: readonly CanvasSide[] = ['top', 'right', 'bottom', 'left'];
const ENDS: readonly CanvasEndType[] = ['none', 'arrow'];

// Fields we know how to interpret. Anything else seen on a parsed object is
// captured into `__extra` and replayed verbatim on serialize so we don't
// silently destroy Obsidian-specific or future-spec data on edit.
const KNOWN_NODE_KEYS = new Set([
  // shared
  'id', 'type', 'x', 'y', 'width', 'height', 'color',
  // text
  'text',
  // file
  'file', 'subpath',
  // link
  'url',
  // group
  'label', 'background', 'backgroundStyle',
]);

const KNOWN_EDGE_KEYS = new Set([
  'id',
  'fromNode', 'fromSide', 'fromEnd',
  'toNode', 'toSide', 'toEnd',
  'color', 'label',
]);

const KNOWN_DOC_KEYS = new Set(['nodes', 'edges']);

function collectExtras(raw: Record<string, unknown>, known: Set<string>): Record<string, unknown> | undefined {
  let extras: Record<string, unknown> | undefined;
  for (const key of Object.keys(raw)) {
    if (known.has(key)) continue;
    if (!extras) extras = {};
    extras[key] = raw[key];
  }
  return extras;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function optStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function side(v: unknown): CanvasSide | undefined {
  return typeof v === 'string' && (SIDES as readonly string[]).includes(v)
    ? (v as CanvasSide)
    : undefined;
}

function end(v: unknown): CanvasEndType | undefined {
  return typeof v === 'string' && (ENDS as readonly string[]).includes(v)
    ? (v as CanvasEndType)
    : undefined;
}

function normalizeNode(raw: unknown): CanvasNode | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const __extra = collectExtras(raw, KNOWN_NODE_KEYS);
  const base = {
    id,
    x: num(raw.x),
    y: num(raw.y),
    width: num(raw.width, 250),
    height: num(raw.height, 60),
    color: optStr(raw.color),
    ...(__extra ? { __extra } : {}),
  };
  switch (raw.type) {
    case 'text':
      return { ...base, type: 'text', text: str(raw.text) };
    case 'file':
      return {
        ...base,
        type: 'file',
        file: str(raw.file),
        subpath: optStr(raw.subpath),
      };
    case 'link':
      return { ...base, type: 'link', url: str(raw.url) };
    case 'group':
      return {
        ...base,
        type: 'group',
        label: optStr(raw.label),
        background: optStr(raw.background),
        backgroundStyle:
          raw.backgroundStyle === 'cover'
          || raw.backgroundStyle === 'ratio'
          || raw.backgroundStyle === 'repeat'
            ? raw.backgroundStyle
            : undefined,
      };
    default:
      return null;
  }
}

function normalizeEdge(raw: unknown): CanvasEdge | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const fromNode = str(raw.fromNode);
  const toNode = str(raw.toNode);
  if (!id || !fromNode || !toNode) return null;
  const __extra = collectExtras(raw, KNOWN_EDGE_KEYS);
  return {
    id,
    fromNode,
    toNode,
    fromSide: side(raw.fromSide),
    toSide: side(raw.toSide),
    fromEnd: end(raw.fromEnd),
    toEnd: end(raw.toEnd),
    color: optStr(raw.color),
    label: optStr(raw.label),
    ...(__extra ? { __extra } : {}),
  };
}

export function parseCanvas(source: string): ParseResult {
  const trimmed = source.trim();
  if (!trimmed) return { ok: true, doc: { ...EMPTY_CANVAS } };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!isRecord(raw)) return { ok: false, error: 'Canvas root must be an object.' };

  const nodes: CanvasNode[] = [];
  if (Array.isArray(raw.nodes)) {
    for (const n of raw.nodes) {
      const node = normalizeNode(n);
      if (node) nodes.push(node);
    }
  }
  const edges: CanvasEdge[] = [];
  if (Array.isArray(raw.edges)) {
    for (const e of raw.edges) {
      const edge = normalizeEdge(e);
      if (edge && nodes.some(n => n.id === edge.fromNode) && nodes.some(n => n.id === edge.toNode)) {
        edges.push(edge);
      }
    }
  }
  const __extra = collectExtras(raw, KNOWN_DOC_KEYS);
  return { ok: true, doc: { nodes, edges, ...(__extra ? { __extra } : {}) } };
}

// Merge unknown fields back into the serialized object. Known fields always
// win — `__extra` only fills in keys the writer didn't already produce.
function mergeExtras(out: Record<string, unknown>, extras: Record<string, unknown> | undefined): void {
  if (!extras) return;
  for (const [key, value] of Object.entries(extras)) {
    if (!(key in out)) out[key] = value;
  }
}

// Stable pretty-print so round-trips through the editor produce minimal diffs.
// Key order matches the JSON Canvas spec field order; undefined fields are
// dropped entirely so optional props don't show up as `"color": null`.
function serializeNode(n: CanvasNode): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: n.id,
    type: n.type,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
  };
  if (n.color !== undefined) out.color = n.color;
  if (n.type === 'text') out.text = n.text;
  if (n.type === 'file') {
    out.file = n.file;
    if (n.subpath !== undefined) out.subpath = n.subpath;
  }
  if (n.type === 'link') out.url = n.url;
  if (n.type === 'group') {
    if (n.label !== undefined) out.label = n.label;
    if (n.background !== undefined) out.background = n.background;
    if (n.backgroundStyle !== undefined) out.backgroundStyle = n.backgroundStyle;
  }
  mergeExtras(out, n.__extra);
  return out;
}

function serializeEdge(e: CanvasEdge): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: e.id,
    fromNode: e.fromNode,
  };
  if (e.fromSide) out.fromSide = e.fromSide;
  if (e.fromEnd) out.fromEnd = e.fromEnd;
  out.toNode = e.toNode;
  if (e.toSide) out.toSide = e.toSide;
  if (e.toEnd) out.toEnd = e.toEnd;
  if (e.color !== undefined) out.color = e.color;
  if (e.label !== undefined) out.label = e.label;
  mergeExtras(out, e.__extra);
  return out;
}

export function serializeCanvas(doc: CanvasDoc): string {
  const out: Record<string, unknown> = {
    nodes: doc.nodes.map(serializeNode),
    edges: doc.edges.map(serializeEdge),
  };
  mergeExtras(out, doc.__extra);
  return JSON.stringify(out, null, 2);
}

export function genId(prefix: string): string {
  // Short collision-resistant id — base36 timestamp + 4 random chars.
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${t}${r}`;
}
