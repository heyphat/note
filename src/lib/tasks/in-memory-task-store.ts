// In-memory TaskStore implementation. Used by:
//   - operations.ts unit tests
//   - the conformance adapter (no FS needed)
//   - any caller that wants a deterministic, isolated task collection
//
// Behaviour mirrors what BrowserFsTaskStore guarantees on disk: collision
// suffixing on `create`, atomic-replace on `write`, idempotent `delete`.

import type { TaskFile, TaskFileWithBody, TaskStore } from './task-store';

interface InMemoryEntry {
  raw: string;
  size: number;
  mtimeMs: number;
}

export class InMemoryTaskStore implements TaskStore {
  private files = new Map<string, InMemoryEntry>();
  private archive = new Map<string, Map<string, string>>(); // uuid → date → raw

  async list(): Promise<TaskFile[]> {
    return Array.from(this.files.entries()).map(([path, entry]) => ({
      path,
      size: entry.size,
      mtimeMs: entry.mtimeMs,
    }));
  }

  async read(path: string): Promise<TaskFileWithBody | null> {
    const entry = this.files.get(path);
    if (!entry) return null;
    return { path, raw: entry.raw, size: entry.size, mtimeMs: entry.mtimeMs };
  }

  async create(desiredBasename: string, raw: string): Promise<TaskFile> {
    const path = this.uniquePath(desiredBasename);
    const entry = newEntry(raw);
    this.files.set(path, entry);
    return { path, size: entry.size, mtimeMs: entry.mtimeMs };
  }

  async write(path: string, raw: string): Promise<TaskFile> {
    if (!this.files.has(path)) {
      throw new Error(`task file not found: ${path}`);
    }
    const entry = newEntry(raw);
    this.files.set(path, entry);
    return { path, size: entry.size, mtimeMs: entry.mtimeMs };
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async writeArchive(taskUuid: string, instanceDate: string, raw: string): Promise<void> {
    let bucket = this.archive.get(taskUuid);
    if (!bucket) {
      bucket = new Map();
      this.archive.set(taskUuid, bucket);
    }
    bucket.set(instanceDate, raw);
  }

  async readArchive(taskUuid: string, instanceDate: string): Promise<string | null> {
    return this.archive.get(taskUuid)?.get(instanceDate) ?? null;
  }

  async listArchive(taskUuid: string): Promise<string[]> {
    const bucket = this.archive.get(taskUuid);
    if (!bucket) return [];
    return Array.from(bucket.keys()).sort();
  }

  /** Test-only: stuff a file in without going through `create`. */
  put(path: string, raw: string): void {
    this.files.set(path, newEntry(raw));
  }

  /** Test-only: read every file's raw content (deterministic order). */
  snapshot(): Array<{ path: string; raw: string }> {
    return Array.from(this.files.entries())
      .map(([path, entry]) => ({ path, raw: entry.raw }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  private uniquePath(desiredBasename: string): string {
    const base = desiredBasename.replace(/\.md$/i, '') || 'task';
    let candidate = `${base}.md`;
    let i = 1;
    while (this.files.has(candidate)) {
      candidate = `${base}-${i}.md`;
      i += 1;
    }
    return candidate;
  }
}

function newEntry(raw: string): InMemoryEntry {
  return {
    raw,
    size: new TextEncoder().encode(raw).byteLength,
    mtimeMs: Date.now(),
  };
}
