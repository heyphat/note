// YAML-aware frontmatter helpers used by the task parser/serializer.
//
// The repo's main `lib/frontmatter.ts` is intentionally a flat key/value
// parser — fast, predictable, and what every regular note needs. TaskNotes
// frontmatter has nested structures (`timeEntries: [{startTime, endTime}]`,
// `blockedBy: [{uid, reltype, gap}]`, `reminders: …`) that the flat parser
// can't model.
//
// This module wraps the `yaml` package so the rest of `lib/tasks/*` can
// treat frontmatter as a plain `Record<string, unknown>` without caring
// about block-scalar quoting, bracket vs block lists, etc.

import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

const DELIMITER = '---';

export interface YamlFrontmatterResult {
  /** The parsed YAML mapping. Empty object if no frontmatter or the block was empty. */
  data: Record<string, unknown>;
  /** Markdown body — everything after the closing delimiter. */
  body: string;
  /** True if a frontmatter block was found and parsed (vs raw markdown). */
  hadFrontmatter: boolean;
}

export class YamlFrontmatterError extends Error {
  readonly code = 'frontmatter_yaml_error';
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'YamlFrontmatterError';
  }
}

/**
 * Split a markdown string into its frontmatter object + body. Throws
 * `YamlFrontmatterError` if a `---` block is present but the YAML inside is
 * malformed (we want strict failure for tasks; ambiguity is bad for data).
 */
export function parseYamlFrontmatter(raw: string): YamlFrontmatterResult {
  const trimmed = raw.startsWith('﻿') ? raw.slice(1) : raw;
  if (!startsWithDelimiter(trimmed)) {
    return { data: {}, body: raw, hadFrontmatter: false };
  }

  const afterOpen = trimmed.slice(DELIMITER.length);
  // Skip the newline after the opening delimiter.
  const firstNewline = afterOpen.indexOf('\n');
  if (firstNewline === -1) {
    return { data: {}, body: raw, hadFrontmatter: false };
  }
  const yamlStart = firstNewline + 1;

  const closeIdx = findClosingDelimiter(afterOpen, yamlStart);
  if (closeIdx === -1) {
    return { data: {}, body: raw, hadFrontmatter: false };
  }

  const yamlBlock = afterOpen.slice(yamlStart, closeIdx);
  // Body starts after the closing delimiter line.
  const closeLineEnd = afterOpen.indexOf('\n', closeIdx + DELIMITER.length);
  const body = closeLineEnd === -1
    ? ''
    : afterOpen.slice(closeLineEnd + 1);

  let parsed: unknown;
  try {
    parsed = yamlParse(yamlBlock, { strict: true });
  } catch (err) {
    throw new YamlFrontmatterError(
      err instanceof Error ? err.message : 'YAML parse error',
      err,
    );
  }

  const data = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
    ? parsed as Record<string, unknown>
    : {};

  return { data, body, hadFrontmatter: true };
}

/**
 * Reconstruct a markdown string from a frontmatter object + body. Keys are
 * written in iteration order; callers that want a stable key order should
 * pre-sort the object themselves.
 */
export function serializeYamlFrontmatter(
  data: Record<string, unknown>,
  body: string,
): string {
  const yaml = yamlStringify(data, {
    // Use block style for top-level maps so nested arrays read naturally.
    // Empty objects serialize to `{}` which we want to avoid — handled below.
    indent: 2,
    lineWidth: 0,           // never auto-wrap; preserves long URLs/wikilinks
    nullStr: '',            // null fields write as empty values, not `null`
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  }).trimEnd();

  if (yaml === '' || yaml === '{}') {
    return body;
  }
  return `${DELIMITER}\n${yaml}\n${DELIMITER}\n${body}`;
}

function startsWithDelimiter(s: string): boolean {
  if (!s.startsWith(DELIMITER)) return false;
  const after = s[DELIMITER.length];
  return after === '\n' || after === '\r' || after === undefined;
}

function findClosingDelimiter(haystack: string, fromIndex: number): number {
  // Scan line by line for a line consisting only of `---` (or `...`, the
  // alternate YAML stream terminator).
  let i = fromIndex;
  while (i < haystack.length) {
    const lineEnd = haystack.indexOf('\n', i);
    const line = (lineEnd === -1 ? haystack.slice(i) : haystack.slice(i, lineEnd)).trimEnd();
    if (line === DELIMITER || line === '...') return i;
    if (lineEnd === -1) return -1;
    i = lineEnd + 1;
  }
  return -1;
}
