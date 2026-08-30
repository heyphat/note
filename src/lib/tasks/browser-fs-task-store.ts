// Adapter: NoteStore (storage) → TaskStore (tasks).
//
// `lib/tasks/` is intentionally unaware of the FS Access API, IndexedDB, or
// browser specifics. This file is the only place where the two layers meet.
// Anything else that wants to mutate task files goes through the TaskStore
// interface — including the conformance adapter (which uses InMemoryTaskStore).

import type { NoteStore } from '../storage/types';
import type { TaskFile, TaskFileWithBody, TaskStore } from './task-store';

/**
 * Minimal subset of NoteStore required by tasks. Carving this out (instead of
 * taking the whole NoteStore) keeps the dependency surface small and lets
 * tests provide a fake.
 */
export interface NoteStoreTaskFs {
  listTaskFiles: NoteStore['listTaskFiles'];
  readTaskFile: NoteStore['readTaskFile'];
  createTaskFile: NoteStore['createTaskFile'];
  writeTaskFile: NoteStore['writeTaskFile'];
  deleteTaskFile: NoteStore['deleteTaskFile'];
  taskFileExists: NoteStore['taskFileExists'];
  writeTaskArchive: NoteStore['writeTaskArchive'];
  readTaskArchive: NoteStore['readTaskArchive'];
  listTaskArchive: NoteStore['listTaskArchive'];
}

export class BrowserFsTaskStore implements TaskStore {
  constructor(private readonly fs: NoteStoreTaskFs) {}

  async list(): Promise<TaskFile[]> {
    const files = await this.fs.listTaskFiles();
    return files.map(f => ({ path: f.path, size: f.size, mtimeMs: f.mtimeMs }));
  }

  async read(path: string): Promise<TaskFileWithBody | null> {
    const file = await this.fs.readTaskFile(path);
    if (!file) return null;
    return { path: file.path, raw: file.raw, size: file.size, mtimeMs: file.mtimeMs };
  }

  async create(desiredBasename: string, raw: string): Promise<TaskFile> {
    const file = await this.fs.createTaskFile(desiredBasename, raw);
    return { path: file.path, size: file.size, mtimeMs: file.mtimeMs };
  }

  async write(path: string, raw: string): Promise<TaskFile> {
    const file = await this.fs.writeTaskFile(path, raw);
    return { path: file.path, size: file.size, mtimeMs: file.mtimeMs };
  }

  async delete(path: string): Promise<void> {
    await this.fs.deleteTaskFile(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.fs.taskFileExists(path);
  }

  async writeArchive(taskUuid: string, instanceDate: string, raw: string): Promise<void> {
    await this.fs.writeTaskArchive(taskUuid, instanceDate, raw);
  }

  async readArchive(taskUuid: string, instanceDate: string): Promise<string | null> {
    return this.fs.readTaskArchive(taskUuid, instanceDate);
  }

  async listArchive(taskUuid: string): Promise<string[]> {
    return this.fs.listTaskArchive(taskUuid);
  }
}
