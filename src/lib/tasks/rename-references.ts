// Reference-aware rename helper.
//
// When a regular note is renamed, every task whose `projects[]` or
// `blocked_by[].uid` references it via `[[wikilink]]` form must be rewritten
// so the link still resolves. This module provides a pure function that does
// exactly that against a `TaskStore`. Wiring it into the BrowserFsStore
// rename path is a separate concern (called from `rename` / `renameFolder` /
// `move`).
//
// Matching is intentionally syntactic: we look for `[[oldName]]` and
// `[[oldName#section]]` and `[[oldName|display]]`. Bare-string uids that
// happen to match are not rewritten — they're not links, and inferring intent
// is risky. Implementations that store stable ids (`task-2026-…`) for
// `blocked_by.uid` are unaffected by file renames anyway.

import { DEFAULT_MAPPING, type FieldMapping } from './field-mapping';
import { parseTask } from './parse-task';
import { serializeTask } from './serialize-task';
import type { Task } from './spec-types';
import type { TaskStore } from './task-store';

export interface RenameReference {
  /** Old wikilink target (the bit between `[[` and `]]`, before any `#` or `|`). */
  oldTarget: string;
  /** New wikilink target. */
  newTarget: string;
}

export interface RenameReferencesResult {
  /** Number of files inspected. */
  scanned: number;
  /** Files we actually rewrote. */
  rewritten: string[];
  /** Files we skipped due to parse errors. */
  failed: Array<{ path: string; reason: string }>;
}

export interface RewriteReferencesOptions {
  mapping?: FieldMapping;
  /**
   * Hook called after each file is inspected. Useful for indices that want
   * to refresh themselves without a full reload. Defaults to a no-op.
   */
  onTaskRewritten?: (path: string, task: Task) => void;
}

/**
 * Apply one or more rename mappings across every task file in the store.
 * Returns a report describing what changed.
 */
export async function rewriteWikilinkReferences(
  store: TaskStore,
  renames: RenameReference[],
  opts: RewriteReferencesOptions = {},
): Promise<RenameReferencesResult> {
  if (renames.length === 0) {
    return { scanned: 0, rewritten: [], failed: [] };
  }
  const mapping = opts.mapping ?? DEFAULT_MAPPING;
  const files = await store.list();
  const result: RenameReferencesResult = { scanned: 0, rewritten: [], failed: [] };

  for (const meta of files) {
    result.scanned += 1;
    let raw: string;
    try {
      const file = await store.read(meta.path);
      if (!file) continue;
      raw = file.raw;
    } catch (err) {
      result.failed.push({ path: meta.path, reason: err instanceof Error ? err.message : String(err) });
      continue;
    }

    let task: Task;
    try {
      task = parseTask(raw, { mapping }).task;
    } catch (err) {
      result.failed.push({ path: meta.path, reason: err instanceof Error ? err.message : String(err) });
      continue;
    }

    const rewrittenTask = applyRenamesToTask(task, renames);
    if (!rewrittenTask) continue; // no references touched

    const nextRaw = serializeTask(rewrittenTask, { mapping });
    if (nextRaw === raw) continue;
    await store.write(meta.path, nextRaw);
    result.rewritten.push(meta.path);
    opts.onTaskRewritten?.(meta.path, rewrittenTask);
  }

  return result;
}

/**
 * Apply renames to a single task in memory. Returns `null` when no field
 * needed rewriting (so callers can avoid unnecessary writes). Pure.
 */
export function applyRenamesToTask(task: Task, renames: RenameReference[]): Task | null {
  let changed = false;

  const projects = task.projects ? task.projects.map(p => {
    const next = rewriteWikilink(p, renames);
    if (next !== p) changed = true;
    return next;
  }) : task.projects;

  const blockedBy = task.blocked_by ? task.blocked_by.map(entry => {
    const nextUid = rewriteWikilink(entry.uid, renames);
    if (nextUid === entry.uid) return entry;
    changed = true;
    return { ...entry, uid: nextUid };
  }) : task.blocked_by;

  if (!changed) return null;
  return { ...task, projects, blocked_by: blockedBy };
}

/**
 * Rewrite a single string value that may be a wikilink to one of the
 * `renames`. If the input isn't a recognisable `[[…]]`, return it unchanged.
 */
export function rewriteWikilink(value: string, renames: RenameReference[]): string {
  if (typeof value !== 'string' || !value.startsWith('[[') || !value.endsWith(']]')) {
    return value;
  }
  const inner = value.slice(2, -2);
  const hashIdx = inner.indexOf('#');
  const pipeIdx = inner.indexOf('|');
  let cut = inner.length;
  if (hashIdx >= 0) cut = Math.min(cut, hashIdx);
  if (pipeIdx >= 0) cut = Math.min(cut, pipeIdx);
  const target = inner.slice(0, cut);
  const remainder = inner.slice(cut); // includes the `#` or `|` if present
  for (const rename of renames) {
    if (target === rename.oldTarget) {
      return `[[${rename.newTarget}${remainder}]]`;
    }
  }
  return value;
}
