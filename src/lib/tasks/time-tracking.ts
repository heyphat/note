// Time-tracking operations per spec §5.19 / §2.6.1.
//
// Invariant from the spec: at most one *active* time entry per task at commit
// time (an entry with `startTime` and no `endTime`). The mutate helper writes
// the file atomically, so concurrent calls don't break the invariant on disk.
//
// API:
//   - startTimer(path)     — append a new active entry; refuses if one is open.
//   - stopTimer(path)      — close the open entry; idempotent if none open.
//   - removeEntry(path, idx) — delete a single entry by index.
//   - replaceEntries(path, entries) — explicit reset (e.g. import / undo).
//
// Reporting helpers (`activeEntry`, `totalMs`) are pure and live below.

import { mutateTask, type MutateConfig, type MutateResult } from './mutate-task';
import type { Task, TimeEntry } from './spec-types';
import type { TaskStore } from './task-store';

export interface TimeTrackingConfig extends MutateConfig {
  /** Function returning the current ISO datetime. Default: () => new Date().toISOString(). */
  now?: () => string;
}

export type TimerOpResult = MutateResult<{ entry?: TimeEntry; index?: number }>;

export async function startTimer(
  store: TaskStore,
  path: string,
  opts: { description?: string } = {},
  config: TimeTrackingConfig = {},
): Promise<TimerOpResult> {
  const now = config.now ?? (() => normalizeIsoSecond(new Date().toISOString()));
  return mutateTask(store, path, async (task) => {
    if (activeEntry(task)) {
      return { reject: {
        reason: 'mutator_rejected',
        message: 'task already has an active time entry',
        code: 'multiple_active_time_entries',
      } };
    }
    const entry: TimeEntry = { startTime: now() };
    if (opts.description) entry.description = opts.description;
    return {
      task: { ...task, time_entries: [...(task.time_entries ?? []), entry] },
      extra: { entry, index: (task.time_entries ?? []).length },
    };
  }, config);
}

export async function stopTimer(
  store: TaskStore,
  path: string,
  config: TimeTrackingConfig = {},
): Promise<TimerOpResult> {
  const now = config.now ?? (() => normalizeIsoSecond(new Date().toISOString()));
  return mutateTask(store, path, async (task) => {
    const list = task.time_entries ?? [];
    const idx = list.findIndex(e => !e.endTime);
    if (idx === -1) return null; // idempotent
    const closed: TimeEntry = { ...list[idx], endTime: now() };
    const next = list.slice();
    next[idx] = closed;
    return {
      task: { ...task, time_entries: next },
      extra: { entry: closed, index: idx },
    };
  }, config);
}

export async function removeEntry(
  store: TaskStore,
  path: string,
  index: number,
  config: TimeTrackingConfig = {},
): Promise<TimerOpResult> {
  return mutateTask(store, path, async (task) => {
    const list = task.time_entries ?? [];
    if (index < 0 || index >= list.length) return null;
    const removed = list[index];
    const next = list.slice();
    next.splice(index, 1);
    return {
      task: { ...task, time_entries: next.length > 0 ? next : undefined },
      extra: { entry: removed, index },
    };
  }, config);
}

export async function replaceEntries(
  store: TaskStore,
  path: string,
  entries: TimeEntry[],
  config: TimeTrackingConfig = {},
): Promise<TimerOpResult> {
  // Reject up-front if the caller's list itself violates the invariant.
  const activeCount = entries.filter(e => !e.endTime).length;
  if (activeCount > 1) {
    return {
      ok: false,
      reason: 'invalid_input',
      issues: [],
      message: 'replacement set has more than one active entry',
      code: 'multiple_active_time_entries',
    };
  }
  return mutateTask(store, path, async (task) => ({
    task: { ...task, time_entries: entries.length > 0 ? entries : undefined },
  }), config);
}

// --- Read-only helpers ----------------------------------------------------

/** The currently-running entry on a task, or undefined if none. */
export function activeEntry(task: Task): TimeEntry | undefined {
  return (task.time_entries ?? []).find(e => !e.endTime);
}

/**
 * Total tracked time in ms across all entries that have an `endTime`. The
 * active entry (if any) is *not* counted — render its running time live.
 */
export function totalMs(task: Task): number {
  let total = 0;
  for (const entry of task.time_entries ?? []) {
    if (!entry.endTime) continue;
    const start = Date.parse(entry.startTime);
    const end = Date.parse(entry.endTime);
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      total += end - start;
    }
  }
  return total;
}

function normalizeIsoSecond(iso: string): string {
  return iso.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, '');
}
