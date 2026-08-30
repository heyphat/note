import type { SearchQuery, SortMode } from './types';

const FIELD_RE = /^(tag|updated|created|sort):(.+)$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

// Turn a user-typed date value ("7d", "30d", "today", "2026-01-15") into an
// ISO timestamp relative to now. Returns null if it can't be parsed.
function resolveDate(val: string, now: number): string | null {
  const lower = val.toLowerCase();
  if (lower === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const relMatch = lower.match(/^(\d+)d$/);
  if (relMatch) {
    return new Date(now - Number(relMatch[1]) * DAY_MS).toISOString();
  }
  const parsed = Date.parse(val);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return null;
}

type DateField = 'updated' | 'created';

function applyDateFilter(q: SearchQuery, raw: string, field: DateField, now: number): void {
  // Supports >Nd / <Nd / =date / bare date (treated as >=).
  let op: '>' | '<' | '=' = '=';
  let val = raw;
  if (raw.startsWith('>')) { op = '>'; val = raw.slice(1); }
  else if (raw.startsWith('<')) { op = '<'; val = raw.slice(1); }
  else if (raw.startsWith('=')) { op = '='; val = raw.slice(1); }
  const iso = resolveDate(val, now);
  if (!iso) return;
  if (field === 'updated') {
    if (op === '>') q.updatedAfter = iso;
    else if (op === '<') q.updatedBefore = iso;
    else q.updatedAfter = iso;
  } else {
    if (op === '>') q.createdAfter = iso;
    else if (op === '<') q.createdBefore = iso;
    else q.createdAfter = iso;
  }
}

function isSortMode(v: string): v is SortMode {
  return v === 'relevance' || v === 'updated' || v === 'created' || v === 'title';
}

/**
 * Parse a palette input like `trading tag:swing updated:>7d sort:updated`
 * into a structured SearchQuery. Unknown fields are kept as free text so the
 * user still sees something reasonable when they mistype.
 */
export function parseQuery(input: string, now: number = Date.now()): SearchQuery {
  const q: SearchQuery = {};
  const tags: string[] = [];
  const text: string[] = [];
  const tokens = (input || '').match(/\S+/g) || [];
  for (const tok of tokens) {
    const m = tok.match(FIELD_RE);
    if (!m) { text.push(tok); continue; }
    const field = m[1].toLowerCase();
    const val = m[2];
    if (field === 'tag') {
      tags.push(val.replace(/^#/, '').toLowerCase());
    } else if (field === 'sort') {
      if (isSortMode(val.toLowerCase())) q.sort = val.toLowerCase() as SortMode;
    } else {
      applyDateFilter(q, val, field as DateField, now);
    }
  }
  if (tags.length) q.tags = tags;
  const joined = text.join(' ').trim();
  if (joined) q.text = joined;
  return q;
}
