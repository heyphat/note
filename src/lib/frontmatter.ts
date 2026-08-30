export interface FrontmatterResult {
  meta: Record<string, string>;
  /**
   * Parsed list values for keys whose YAML value is a comma-separated list
   * (`tags: a, b, c`) or a bracket-enclosed list (`tags: [a, b]`). Only keys
   * whose value looks like a list appear here. `meta[key]` still holds the
   * raw string for every key — this field is purely additive so existing
   * callers keep working.
   */
  metaList: Record<string, string[]>;
  content: string;
}

const DELIMITER = '---';

/**
 * Try to parse `val` as a YAML list. Returns `null` when the value doesn't
 * look like a list (so callers can leave it as a plain string).
 *
 * Forms handled:
 *   [a, b, c]      → ['a','b','c']
 *   ['a','b']      → ['a','b'] (strip wrapping quotes)
 *   a, b, c        → ['a','b','c']
 *
 * A single value with no commas and no brackets returns `null`.
 */
function parseListValue(val: string): string[] | null {
  const trimmed = val.trim();
  if (isQuotedScalar(trimmed)) return null;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1);
    const parts = inner
      .split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    return parts;
  }
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : null;
  }
  return null;
}

function isQuotedScalar(value: string): boolean {
  return (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"));
}

function parseScalarValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'string' ? parsed : value;
    } catch {
      return value;
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function serializeScalarValue(value: string): string {
  const s = String(value);
  if (
    s === ''
    || s !== s.trim()
    || /[\r\n]/.test(s)
    || /^['"]|['"]$/.test(s)
    || /(^|\s)#/.test(s)
    || /:\s/.test(s)
    || s === '---'
    || s === '...'
    // eslint-disable-next-line no-control-regex
    || /[\x00-\x1F\x7F]/.test(s)
  ) {
    return JSON.stringify(s);
  }
  return s;
}

/**
 * Parse YAML frontmatter from a markdown string.
 * Handles flat key: value pairs only (no nested objects/arrays).
 */
export function parseFrontmatter(raw: string): FrontmatterResult {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith(DELIMITER)) {
    return { meta: {}, metaList: {}, content: raw };
  }

  const end = trimmed.indexOf(`\n${DELIMITER}`, DELIMITER.length);
  if (end === -1) {
    return { meta: {}, metaList: {}, content: raw };
  }

  const yamlBlock = trimmed.slice(DELIMITER.length + 1, end);
  const meta: Record<string, string> = {};
  const metaList: Record<string, string[]> = {};
  for (const line of yamlBlock.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!key) continue;
    meta[key] = parseScalarValue(val);
    const list = parseListValue(val);
    if (list) metaList[key] = list;
  }

  // Content starts after the closing --- and its newline
  const content = trimmed.slice(end + 1 + DELIMITER.length + 1);
  return { meta, metaList, content };
}

/**
 * Serialize metadata + content into a frontmatter markdown string.
 */
export function serializeFrontmatter(meta: Record<string, string>, content: string): string {
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${serializeScalarValue(v)}`);
  return `${DELIMITER}\n${lines.join('\n')}\n${DELIMITER}\n${content}`;
}

/**
 * Split raw markdown into the frontmatter prefix (delimiters + YAML + closing
 * `---\n`) and the body that follows. The frontmatter prefix is preserved
 * byte-for-byte, which is what task-file saves need: this parser is flat
 * (drops arrays / nested objects), so re-serializing through `parseFrontmatter`
 * + `serializeFrontmatter` would corrupt task frontmatter. Splicing keeps
 * the structured fields intact.
 *
 * For files without frontmatter, returns `{ frontmatter: '', body: raw }`.
 */
export function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith(DELIMITER)) return { frontmatter: '', body: raw };
  const end = trimmed.indexOf(`\n${DELIMITER}`, DELIMITER.length);
  if (end === -1) return { frontmatter: '', body: raw };
  const lead = raw.length - trimmed.length;
  const closeEnd = lead + end + 1 + DELIMITER.length; // after closing `---`
  const afterClose = raw.slice(closeEnd);
  const newlineIdx = afterClose.indexOf('\n');
  const split = newlineIdx === -1 ? raw.length : closeEnd + newlineIdx + 1;
  return {
    frontmatter: raw.slice(0, split),
    body: raw.slice(split),
  };
}

/**
 * Detect whether a parsed frontmatter belongs to a TaskNotes-spec task,
 * independent of where the file lives on disk. We discriminate on the
 * spec-required date field — `dateCreated` (canonical) / `date_created` /
 * `created` (aliases per spec §2.5) — combined with `status`. Regular notes
 * use `createdAt`/`updatedAt` and don't carry `status`, so the conjunction
 * is a robust signal even if the task storage location changes later.
 */
export function isTaskFrontmatter(meta: Record<string, string>): boolean {
  if (!meta.status) return false;
  return Boolean(meta.dateCreated || meta.date_created || meta.created);
}

/**
 * Generate a new unique note ID (UUID v4). Uses the Web Crypto API so the
 * same function works in the browser and in Node (≥17.6) — avoids pulling
 * Node's `crypto` module into the client bundle, where webpack's polyfill
 * lacks `randomUUID`.
 */
export function generateNoteId(): string {
  return globalThis.crypto.randomUUID();
}
