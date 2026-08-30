// In-memory index of every task in the vault. Mirrors the listener-batched
// pattern from `lib/links/link-index.ts`: callers feed in upserts/removes,
// reverse maps stay in sync, listener notifications are coalesced through
// `queueMicrotask` so a 5k-task cold boot doesn't fire 5k React setStates.
//
// Pure data structure: doesn't read disk, doesn't know about the storage
// layer. The search-index integration upstream calls `upsert(path, task)`
// after parsing each `.assets/tasks/*.md`, and `remove(path)` when a file
// disappears. This module owns no I/O.

import type { Task } from './spec-types';

/** Lightweight projection of a Task indexed by path. */
export interface IndexedTask {
  path: string;
  task: Task;
}

export type TaskIndexListener = (snapshot: IndexedTask[]) => void;

/**
 * Reverse maps maintained in lockstep with the forward `byPath` map. Every
 * mutation updates them; views read straight from these.
 *
 * Note: maps are intentionally keyed by *string*, not (path, value) tuples.
 * Each value's set holds the paths of tasks that match. This is the same
 * shape as LinkIndex's reverse map.
 */
interface Reverse {
  byStatus: Map<string, Set<string>>;
  byPriority: Map<string, Set<string>>;
  byTag: Map<string, Set<string>>;
  byContext: Map<string, Set<string>>;
  byProject: Map<string, Set<string>>;
  byDueDay: Map<string, Set<string>>;        // YYYY-MM-DD bucket
  byScheduledDay: Map<string, Set<string>>;  // YYYY-MM-DD bucket
  byBlockedByUid: Map<string, Set<string>>;  // dep target → tasks blocked by it
  /** Maps stable semantic `id` to its single canonical path, when present. */
  byId: Map<string, string>;
}

function newReverse(): Reverse {
  return {
    byStatus: new Map(),
    byPriority: new Map(),
    byTag: new Map(),
    byContext: new Map(),
    byProject: new Map(),
    byDueDay: new Map(),
    byScheduledDay: new Map(),
    byBlockedByUid: new Map(),
    byId: new Map(),
  };
}

export class TaskIndex {
  private byPath = new Map<string, Task>();
  private reverse = newReverse();
  private listeners = new Set<TaskIndexListener>();
  private flushScheduled = false;

  /** Insert or replace the task at `path`. */
  upsert(path: string, task: Task): void {
    const prev = this.byPath.get(path);
    if (prev) this.removeFromReverse(path, prev);
    this.byPath.set(path, task);
    this.addToReverse(path, task);
    this.scheduleFlush();
  }

  /** Remove the task at `path`. No-op if absent. */
  remove(path: string): void {
    const prev = this.byPath.get(path);
    if (!prev) return;
    this.byPath.delete(path);
    this.removeFromReverse(path, prev);
    this.scheduleFlush();
  }

  /** Replace the entire index in one go (used on snapshot hydration). */
  replaceAll(tasks: IndexedTask[]): void {
    this.byPath.clear();
    this.reverse = newReverse();
    for (const { path, task } of tasks) {
      this.byPath.set(path, task);
      this.addToReverse(path, task);
    }
    this.scheduleFlush();
  }

  // --- Reads ---

  size(): number {
    return this.byPath.size;
  }

  get(path: string): Task | undefined {
    return this.byPath.get(path);
  }

  byIdLookup(id: string): { path: string; task: Task } | undefined {
    const path = this.reverse.byId.get(id);
    if (!path) return undefined;
    const task = this.byPath.get(path);
    return task ? { path, task } : undefined;
  }

  all(): IndexedTask[] {
    return Array.from(this.byPath.entries()).map(([path, task]) => ({ path, task }));
  }

  byStatus(status: string): string[] {
    return Array.from(this.reverse.byStatus.get(status) ?? []);
  }

  byPriority(priority: string): string[] {
    return Array.from(this.reverse.byPriority.get(priority) ?? []);
  }

  byTag(tag: string): string[] {
    return Array.from(this.reverse.byTag.get(tag) ?? []);
  }

  byContext(context: string): string[] {
    return Array.from(this.reverse.byContext.get(context) ?? []);
  }

  byProject(project: string): string[] {
    return Array.from(this.reverse.byProject.get(project) ?? []);
  }

  tagKeys(): string[] {
    return Array.from(this.reverse.byTag.keys());
  }

  contextKeys(): string[] {
    return Array.from(this.reverse.byContext.keys());
  }

  projectKeys(): string[] {
    return Array.from(this.reverse.byProject.keys());
  }

  byDueDay(dayKey: string): string[] {
    return Array.from(this.reverse.byDueDay.get(dayKey) ?? []);
  }

  byScheduledDay(dayKey: string): string[] {
    return Array.from(this.reverse.byScheduledDay.get(dayKey) ?? []);
  }

  /** Paths of tasks blocked by the given UID. */
  blockedBy(uid: string): string[] {
    return Array.from(this.reverse.byBlockedByUid.get(uid) ?? []);
  }

  // --- Listeners ---

  /**
   * Subscribe to coalesced change notifications. Multiple upserts/removes in
   * the same microtask collapse into a single callback with the current
   * snapshot. Returns an unsubscribe function.
   */
  subscribe(listener: TaskIndexListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // --- Internals ---

  private addToReverse(path: string, task: Task): void {
    if (task.status) addTo(this.reverse.byStatus, task.status, path);
    if (task.priority) addTo(this.reverse.byPriority, task.priority, path);
    for (const t of task.tags ?? []) addTo(this.reverse.byTag, t, path);
    for (const c of task.contexts ?? []) addTo(this.reverse.byContext, c, path);
    for (const p of task.projects ?? []) addTo(this.reverse.byProject, p, path);
    if (task.due) addTo(this.reverse.byDueDay, dayKey(task.due), path);
    if (task.scheduled) addTo(this.reverse.byScheduledDay, dayKey(task.scheduled), path);
    for (const dep of task.blocked_by ?? []) addTo(this.reverse.byBlockedByUid, dep.uid, path);
    if (task.id) this.reverse.byId.set(task.id, path);
  }

  private removeFromReverse(path: string, task: Task): void {
    if (task.status) removeFrom(this.reverse.byStatus, task.status, path);
    if (task.priority) removeFrom(this.reverse.byPriority, task.priority, path);
    for (const t of task.tags ?? []) removeFrom(this.reverse.byTag, t, path);
    for (const c of task.contexts ?? []) removeFrom(this.reverse.byContext, c, path);
    for (const p of task.projects ?? []) removeFrom(this.reverse.byProject, p, path);
    if (task.due) removeFrom(this.reverse.byDueDay, dayKey(task.due), path);
    if (task.scheduled) removeFrom(this.reverse.byScheduledDay, dayKey(task.scheduled), path);
    for (const dep of task.blocked_by ?? []) removeFrom(this.reverse.byBlockedByUid, dep.uid, path);
    if (task.id && this.reverse.byId.get(task.id) === path) this.reverse.byId.delete(task.id);
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.listeners.size === 0) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      const snapshot = this.all();
      for (const listener of Array.from(this.listeners)) {
        try { listener(snapshot); } catch { /* listener errors are not our problem */ }
      }
    });
  }
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

function removeFrom(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key);
  if (!set) return;
  set.delete(value);
  if (set.size === 0) map.delete(key);
}

/**
 * Extract the calendar-day key (YYYY-MM-DD) from a date or datetime field.
 * Date-only values pass through; datetime values use their literal date token
 * before `T` per spec §5.2.1.
 */
function dayKey(value: string): string {
  const tIdx = value.indexOf('T');
  return tIdx === -1 ? value.slice(0, 10) : value.slice(0, tIdx);
}
