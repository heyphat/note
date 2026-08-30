import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoteStore, TaskFileFull, TaskFileMeta } from '@/lib/storage/types';
import { useTaskIndex } from './useTaskIndex';

function taskRaw(id: string, title: string): string {
  return `---
id: ${id}
title: ${title}
status: open
dateCreated: 2026-05-04T10:00:00Z
dateModified: 2026-05-04T10:00:00Z
---
`;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

class ControlledTaskNoteStore {
  listCalls = 0;
  private files = new Map<string, { raw: string; size: number; mtimeMs: number }>();
  private readDelays = new Map<string, Promise<void>[]>();

  put(path: string, raw: string): void {
    this.files.set(path, {
      raw,
      size: new TextEncoder().encode(raw).byteLength,
      mtimeMs: Date.now(),
    });
  }

  delayNextRead(path: string): () => void {
    const d = deferred();
    const queue = this.readDelays.get(path) ?? [];
    queue.push(d.promise);
    this.readDelays.set(path, queue);
    return d.resolve;
  }

  async listTaskFiles(): Promise<TaskFileMeta[]> {
    this.listCalls += 1;
    return Array.from(this.files.entries()).map(([path, file]) => ({
      path,
      size: file.size,
      mtimeMs: file.mtimeMs,
    }));
  }

  async readTaskFile(path: string): Promise<TaskFileFull | null> {
    const queue = this.readDelays.get(path);
    const wait = queue?.shift();
    if (wait) await wait;
    const file = this.files.get(path);
    return file ? { path, ...file } : null;
  }

  async createTaskFile(desiredBasename: string, raw: string): Promise<TaskFileMeta> {
    const path = `${desiredBasename.replace(/\.md$/i, '')}.md`;
    this.put(path, raw);
    const file = this.files.get(path)!;
    return { path, size: file.size, mtimeMs: file.mtimeMs };
  }

  async writeTaskFile(path: string, raw: string): Promise<TaskFileMeta> {
    this.put(path, raw);
    const file = this.files.get(path)!;
    return { path, size: file.size, mtimeMs: file.mtimeMs };
  }

  async deleteTaskFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  async taskFileExists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async writeTaskArchive(): Promise<void> {}
  async readTaskArchive(): Promise<string | null> { return null; }
  async listTaskArchive(): Promise<string[]> { return []; }
}

afterEach(cleanup);

describe('useTaskIndex', () => {
  it('retries a stale full reload instead of hiding a task refreshed during the load', async () => {
    const store = new ControlledTaskNoteStore();
    store.put('a.md', taskRaw('a', 'A'));
    const releaseA = store.delayNextRead('a.md');

    const { result } = renderHook(() => useTaskIndex({
      store: store as unknown as NoteStore,
      vaultId: 'vault-a',
      ready: true,
    }));

    await waitFor(() => expect(store.listCalls).toBe(1));

    store.put('b.md', taskRaw('b', 'B'));
    await act(async () => {
      await result.current.refresh('b.md');
    });

    await waitFor(() => {
      expect(result.current.tasks.map(t => t.path)).toContain('b.md');
    });

    await act(async () => {
      releaseA();
    });

    await waitFor(() => {
      expect(new Set(result.current.tasks.map(t => t.path))).toEqual(new Set(['a.md', 'b.md']));
    });
    expect(store.listCalls).toBeGreaterThanOrEqual(2);
  });
});
