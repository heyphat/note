// Bridge: TaskStore (raw bytes) → TaskIndex (parsed in-memory).
//
// Reads every task file from a TaskStore, parses it, populates the index.
// Listener-friendly: callers subscribe to the index to get coalesced updates
// rather than polling.
//
// Deliberately small. Incremental sync (delta against on-disk changes,
// throttled re-reads, IndexedDB snapshot rehydration) layers on top in a
// later phase — Phase 1's correctness target is "open the vault, see your
// tasks".

import { DEFAULT_MAPPING, type FieldMapping } from './field-mapping';
import { parseTask } from './parse-task';
import type { IndexedTask, TaskIndex } from './task-index';
import type { TaskStore } from './task-store';

export interface LoadAllOptions {
  mapping?: FieldMapping;
}

export interface LoadAllResult {
  /** Number of files we parsed successfully. */
  loaded: number;
  /** Files we couldn't parse (e.g. malformed YAML). Pairs of path + reason. */
  failed: Array<{ path: string; reason: string }>;
  /** Parsed task snapshot. Callers may choose when it is safe to commit. */
  tasks: IndexedTask[];
}

/**
 * Walk the entire task collection and parse each file without mutating an
 * index. UI loaders use this to avoid committing stale snapshots over newer
 * incremental refreshes.
 */
export async function collectAllTasks(
  store: TaskStore,
  opts: LoadAllOptions = {},
): Promise<LoadAllResult> {
  const mapping = opts.mapping ?? DEFAULT_MAPPING;
  const files = await store.list();
  const loaded: IndexedTask[] = [];
  const failed: LoadAllResult['failed'] = [];

  for (const meta of files) {
    try {
      const file = await store.read(meta.path);
      if (!file) continue;
      const { task } = parseTask(file.raw, { mapping });
      loaded.push({ path: meta.path, task });
    } catch (err) {
      failed.push({
        path: meta.path,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { loaded: loaded.length, failed, tasks: loaded };
}

/**
 * Walk the entire task collection, parse each file, and replace the index.
 * Callers should subscribe to the index for further notifications.
 */
export async function loadAllTasks(
  store: TaskStore,
  index: TaskIndex,
  opts: LoadAllOptions = {},
): Promise<LoadAllResult> {
  const result = await collectAllTasks(store, opts);
  index.replaceAll(result.tasks);
  return result;
}

/**
 * Refresh a single task by path. Used after `operations.*` mutations so the
 * UI reflects the change without a full reload.
 */
export async function refreshTask(
  store: TaskStore,
  index: TaskIndex,
  path: string,
  opts: LoadAllOptions = {},
): Promise<void> {
  const mapping = opts.mapping ?? DEFAULT_MAPPING;
  const file = await store.read(path);
  if (!file) {
    index.remove(path);
    return;
  }
  try {
    const { task } = parseTask(file.raw, { mapping });
    index.upsert(path, task);
  } catch {
    // Malformed file — drop from the index until it's repaired.
    index.remove(path);
  }
}
