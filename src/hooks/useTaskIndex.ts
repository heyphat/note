'use client';

// React glue between the (async, file-based) TaskStore and the (in-memory)
// TaskIndex. Loads the index when the vault becomes ready and keeps a
// React-friendly snapshot in state so views re-render on changes.
//
// Mutations performed via `lib/tasks/operations` and friends should call
// `refresh(path)` on the returned handle so the index reflects the new
// state without a full reload.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BrowserFsTaskStore,
  collectAllTasks,
  refreshTask,
  TaskIndex,
  type IndexedTask,
} from '@/lib/tasks';
import type { NoteStore } from '@/lib/storage';

export interface UseTaskIndexParams {
  store: NoteStore;
  /** Bumped when the vault becomes ready / changes. Drives a fresh load. */
  vaultId: string;
  ready: boolean;
}

export interface UseTaskIndexResult {
  index: TaskIndex;
  taskStore: BrowserFsTaskStore;
  /** Snapshot of every task currently in the index. Memo-friendly. */
  tasks: IndexedTask[];
  /** True while the initial load is in flight. */
  loading: boolean;
  /** Refresh one path after a mutation. */
  refresh: (path: string) => Promise<void>;
  /** Force a full re-walk of `.assets/tasks/`. */
  reload: () => Promise<void>;
}

export function useTaskIndex({ store, vaultId, ready }: UseTaskIndexParams): UseTaskIndexResult {
  const indexRef = useRef<TaskIndex | null>(null);
  if (indexRef.current === null) indexRef.current = new TaskIndex();
  const index = indexRef.current;

  const taskStore = useMemo(() => new BrowserFsTaskStore(store), [store]);
  const [tasks, setTasks] = useState<IndexedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const loadSeqRef = useRef(0);
  const mutationSeqRef = useRef(0);

  // Subscribe once. The index coalesces notifications via queueMicrotask, so
  // batched upserts produce a single React render even at vault-cold-boot scale.
  useEffect(() => {
    return index.subscribe((snapshot) => setTasks(snapshot));
  }, [index]);

  const reload = useCallback(async () => {
    if (!ready) return;
    const loadSeq = ++loadSeqRef.current;
    setLoading(true);
    try {
      // A full walk can overlap with creates/updates. If an incremental
      // refresh lands while the walk is in flight, retry from disk instead of
      // committing an older snapshot over newer in-memory state.
      while (loadSeq === loadSeqRef.current) {
        const mutationSeq = mutationSeqRef.current;
        const result = await collectAllTasks(taskStore);
        if (loadSeq !== loadSeqRef.current) return;
        if (mutationSeq === mutationSeqRef.current) {
          index.replaceAll(result.tasks);
          return;
        }
      }
    } finally {
      if (loadSeq === loadSeqRef.current) setLoading(false);
    }
  }, [ready, taskStore, index]);

  // Load whenever the vault becomes ready or the vault id changes (open a
  // different folder → start over).
  useEffect(() => {
    if (!ready) {
      loadSeqRef.current += 1;
      index.replaceAll([]);
      setTasks([]);
      setLoading(false);
      return;
    }
    void reload();
    // intentionally not depending on `reload` itself — vaultId+ready is the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, vaultId]);

  const refresh = useCallback(async (path: string) => {
    mutationSeqRef.current += 1;
    await refreshTask(taskStore, index, path);
  }, [taskStore, index]);

  return { index, taskStore, tasks, loading, refresh, reload };
}
