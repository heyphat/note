import type { TaskFileMeta, TaskFileFull } from '../types';
import { PermissionsController } from './permissions';
import { writeFile } from './fs-helpers';
import { GLOBAL_ASSETS_DIR, TASKS_DIR, TASK_ARCHIVE_DIR } from './paths';
import { resolveUniqueFilename } from './sanitize-title';

/**
 * Plain raw-bytes I/O for task files under `.assets/tasks/`. The schema
 * (TaskNotes spec) lives entirely in `lib/tasks/`; this layer just owns the
 * directory and the filename collision rules.
 *
 * Task archive (recurring task completions) lives at
 * `.assets/tasks/.archive/<taskUuid>/<date>.md` — UUID-keyed sibling of
 * `.history/` so renames don't orphan archives.
 */
export class TaskStore {
  constructor(private perms: PermissionsController) {}

  async listFiles(): Promise<TaskFileMeta[]> {
    try {
      const dir = await this.getTasksDir();
      const out: TaskFileMeta[] = [];
      for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (entry.kind !== 'file' || !name.endsWith('.md')) continue;
        const fh = entry as FileSystemFileHandle;
        try {
          const file = await fh.getFile();
          out.push({ path: name, size: file.size, mtimeMs: file.lastModified });
        } catch { /* skip unreadable */ }
      }
      return out;
    } catch {
      return [];
    }
  }

  async readFile(path: string): Promise<TaskFileFull | null> {
    try {
      const dir = await this.getTasksDir();
      const fh = await dir.getFileHandle(path);
      const file = await fh.getFile();
      const raw = await file.text();
      return { path, raw, size: file.size, mtimeMs: file.lastModified };
    } catch {
      return null;
    }
  }

  async createFile(desiredBasename: string, raw: string): Promise<TaskFileMeta> {
    const dir = await this.getTasksDir(true);
    const baseName = (desiredBasename || 'task').replace(/\.md$/i, '');
    const filename = await resolveUniqueFilename(dir, baseName, 'md');
    const fh = await dir.getFileHandle(filename, { create: true });
    await writeFile(fh, raw);
    const file = await fh.getFile();
    return { path: filename, size: file.size, mtimeMs: file.lastModified };
  }

  async writeFileAt(path: string, raw: string): Promise<TaskFileMeta> {
    const dir = await this.getTasksDir(true);
    const fh = await dir.getFileHandle(path);
    await writeFile(fh, raw);
    const file = await fh.getFile();
    return { path, size: file.size, mtimeMs: file.lastModified };
  }

  async deleteFile(path: string): Promise<void> {
    try {
      const dir = await this.getTasksDir();
      await dir.removeEntry(path);
    } catch { /* already gone */ }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const dir = await this.getTasksDir();
      await dir.getFileHandle(path);
      return true;
    } catch {
      return false;
    }
  }

  async writeArchive(taskUuid: string, instanceDate: string, raw: string): Promise<void> {
    if (!taskUuid || !instanceDate) throw new Error('taskUuid and instanceDate required');
    const dir = await this.getArchiveDir(taskUuid, true);
    const fh = await dir.getFileHandle(`${instanceDate}.md`, { create: true });
    await writeFile(fh, raw);
  }

  async readArchive(taskUuid: string, instanceDate: string): Promise<string | null> {
    try {
      const dir = await this.getArchiveDir(taskUuid);
      const fh = await dir.getFileHandle(`${instanceDate}.md`);
      const file = await fh.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }

  async listArchive(taskUuid: string): Promise<string[]> {
    try {
      const dir = await this.getArchiveDir(taskUuid);
      const out: string[] = [];
      for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (entry.kind !== 'file' || !name.endsWith('.md')) continue;
        out.push(name.replace(/\.md$/i, ''));
      }
      return out.sort();
    } catch {
      return [];
    }
  }

  private async getTasksDir(create = false): Promise<FileSystemDirectoryHandle> {
    const root = this.perms.requireHandle();
    const assets = await root.getDirectoryHandle(GLOBAL_ASSETS_DIR, { create });
    return assets.getDirectoryHandle(TASKS_DIR, { create });
  }

  private async getArchiveDir(taskUuid: string, create = false): Promise<FileSystemDirectoryHandle> {
    const tasksDir = await this.getTasksDir(create);
    const archiveRoot = await tasksDir.getDirectoryHandle(TASK_ARCHIVE_DIR, { create });
    return archiveRoot.getDirectoryHandle(taskUuid, { create });
  }
}
