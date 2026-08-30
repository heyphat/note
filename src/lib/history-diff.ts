import { structuredPatch, type StructuredPatchHunk } from 'diff';
import { parseFrontmatter } from '@/lib/frontmatter';

export type HistoryDiffLineKind = 'context' | 'add' | 'remove' | 'meta';

export interface HistoryDiffLine {
  key: string;
  kind: HistoryDiffLineKind;
  marker: ' ' | '+' | '-' | '\\';
  oldNumber: number | null;
  newNumber: number | null;
  text: string;
}

export interface HistoryDiffHunk {
  key: string;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: HistoryDiffLine[];
}

export interface HistoryDiffResult {
  oldLabel: string;
  newLabel: string;
  hunks: HistoryDiffHunk[];
  hasChanges: boolean;
}

interface CreateHistoryDiffOptions {
  oldLabel?: string;
  newLabel?: string;
  context?: number;
}

export function getVisibleHistoryBody(raw: string): string {
  const { meta, content } = parseFrontmatter(raw);
  return meta.id ? content : raw;
}

function normalizeHistoryBody(raw: string): string {
  return getVisibleHistoryBody(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function formatHunkHeader(hunk: StructuredPatchHunk): string {
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
}

function mapHunkLines(hunk: StructuredPatchHunk, hunkIndex: number): HistoryDiffLine[] {
  let oldNumber = hunk.oldStart;
  let newNumber = hunk.newStart;

  return hunk.lines.map((rawLine, lineIndex) => {
    const marker = rawLine.startsWith('\\')
      ? '\\'
      : ((rawLine[0] ?? ' ') as HistoryDiffLine['marker']);

    if (marker === '\\') {
      return {
        key: `hunk-${hunkIndex}-line-${lineIndex}`,
        kind: 'meta',
        marker,
        oldNumber: null,
        newNumber: null,
        text: rawLine,
      };
    }

    const text = rawLine.slice(1);

    if (marker === '+') {
      return {
        key: `hunk-${hunkIndex}-line-${lineIndex}`,
        kind: 'add',
        marker,
        oldNumber: null,
        newNumber: newNumber++,
        text,
      };
    }

    if (marker === '-') {
      return {
        key: `hunk-${hunkIndex}-line-${lineIndex}`,
        kind: 'remove',
        marker,
        oldNumber: oldNumber++,
        newNumber: null,
        text,
      };
    }

    return {
      key: `hunk-${hunkIndex}-line-${lineIndex}`,
      kind: 'context',
      marker: ' ',
      oldNumber: oldNumber++,
      newNumber: newNumber++,
      text,
    };
  });
}

export function createHistoryDiff(
  oldRaw: string,
  newRaw: string,
  options: CreateHistoryDiffOptions = {},
): HistoryDiffResult {
  const oldLabel = options.oldLabel ?? 'Previous snapshot';
  const newLabel = options.newLabel ?? 'Selected snapshot';
  const oldBody = normalizeHistoryBody(oldRaw);
  const newBody = normalizeHistoryBody(newRaw);
  const patch = structuredPatch(oldLabel, newLabel, oldBody, newBody, '', '', {
    context: options.context ?? 3,
    stripTrailingCr: true,
  });

  const hunks = patch.hunks.map((hunk, hunkIndex) => ({
    key: `hunk-${hunkIndex}`,
    header: formatHunkHeader(hunk),
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines: mapHunkLines(hunk, hunkIndex),
  }));

  return {
    oldLabel,
    newLabel,
    hunks,
    hasChanges: hunks.some(hunk =>
      hunk.lines.some(line => line.kind === 'add' || line.kind === 'remove'),
    ),
  };
}
