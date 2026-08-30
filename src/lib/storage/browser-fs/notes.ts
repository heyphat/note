import { parseFrontmatter, serializeFrontmatter, splitFrontmatter, isTaskFrontmatter, generateNoteId } from '@/lib/frontmatter';
import { NoteConflictError } from '../types';
import type { NoteMeta, NoteFull, TreeListing, SaveOptions } from '../types';
import { PermissionsController } from './permissions';
import { resolveDir, writeFile, copyDirRecursive, safeRenameFile, safeRenameDir, sameRevision } from './fs-helpers';
import { splitPath, basename as pathBasename } from './paths';
import { sanitizeNoteTitle, resolveUniqueFilename } from './sanitize-title';

/**
 * Hooks the façade injects so cross-cutting concerns (history snapshotting,
 * blob URL cache invalidation, chat anchor rewriting) fire at the right
 * moments without `NoteFilesStore` having to know about the other stores.
 */
export type NoteFilesHooks = {
  /** Called best-effort once a note's frontmatter UUID is known (on `get()`
   *  or when `get()` backfills one). Façade routes this to
   *  `HistoryStore.migrateLegacy` to relocate pre-UUID path-keyed snapshots. */
  onNoteOpened?: (id: string, uuid: string) => Promise<void>;
  /** Called best-effort with the file's pre-overwrite bytes during
   *  `saveContent` and `rename`. Façade routes this to
   *  `HistoryStore.snapshot` so a fresh version is captured before write. */
  beforeOverwrite?: (uuid: string, raw: string) => Promise<void>;
};

export class NoteFilesStore {
  constructor(private perms: PermissionsController, private hooks: NoteFilesHooks = {}) {}

  async list(): Promise<TreeListing> {
    const dir = this.perms.requireHandle();
    const notes: NoteMeta[] = [];
    const folders: string[] = [];
    await this.walk(dir, '', notes, folders);
    notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    folders.sort();
    return { notes, folders };
  }

  // Walks the vault recording only cheap metadata — filename, size, mtime.
  // Reading each file's bytes just to parse frontmatter turns a 70k-file
  // vault into a tens-of-seconds boot stall. Titles default to a slug of the
  // filename; the search index refines them later by emitting onMetaChange as
  // it reads bodies during idle indexing, which page.tsx patches into `notes`.
  private async walk(
    dir: FileSystemDirectoryHandle,
    prefix: string,
    notes: NoteMeta[],
    folders: string[],
  ) {
    for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (name.startsWith('.') || name.endsWith('.assets')) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'file') {
        if (!name.endsWith('.md')) continue;
        const file = await (entry as FileSystemFileHandle).getFile();
        const filenameTitle = name.replace(/\.md$/, '').replace(/[-_]/g, ' ');
        const iso = new Date(file.lastModified).toISOString();
        notes.push({
          id: path,
          title: filenameTitle,
          createdAt: iso,
          updatedAt: iso,
          size: file.size,
          mtimeMs: file.lastModified,
        });
      } else if (entry.kind === 'directory') {
        folders.push(path);
        await this.walk(entry as FileSystemDirectoryHandle, path, notes, folders);
      }
    }
  }

  async get(id: string): Promise<NoteFull | null> {
    try {
      const root = this.perms.requireHandle();
      const { dirParts, filename } = splitPath(id);
      const parent = await resolveDir(root, dirParts);
      const fileHandle = await parent.getFileHandle(filename);
      let file = await fileHandle.getFile();
      let raw = await file.text();
      let { meta, content } = parseFrontmatter(raw);
      const filenameTitle = filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
      const firstLine = raw.split('\n').find(l => l.trim().length > 0) || '';
      const headingTitle = firstLine.startsWith('# ') ? firstLine.slice(2).trim() : '';

      // Ensure every note carries a stable frontmatter UUID. Foreign markdown
      // (no frontmatter) is wrapped on first open; native notes missing the
      // `id` field get one backfilled. After this call the note is guaranteed
      // to have `meta.id`, so callers downstream can rely on it.
      if (!meta.id) {
        const uuid = generateNoteId();
        const now = new Date().toISOString();
        const isNative = raw.trimStart().startsWith('---');
        if (isNative) {
          meta.id = uuid;
          if (!meta.title) meta.title = headingTitle || filenameTitle || 'Untitled';
          if (!meta.createdAt) meta.createdAt = now;
          if (!meta.updatedAt) meta.updatedAt = now;
          raw = serializeFrontmatter(meta, content);
        } else {
          // Convert foreign markdown to native, preserving the raw body.
          meta = {
            id: uuid,
            title: headingTitle || filenameTitle || 'Untitled',
            createdAt: now,
            updatedAt: now,
          };
          content = raw;
          raw = serializeFrontmatter(meta, content);
        }
        try {
          await writeFile(fileHandle, raw);
          file = await fileHandle.getFile();
        } catch (err) {
          // Best-effort upgrade: don't block the read on a write failure
          // (read-only mounts, permission revoked, etc.). The note still
          // appears with its in-memory uuid for this session.
          console.warn('[notes] failed to backfill note uuid', err);
        }
        // Migrate any pre-existing path-keyed history to the new uuid key.
        await this.hooks.onNoteOpened?.(id, uuid).catch(() => undefined);
      } else {
        // Even when the note already had a uuid, its history may still be
        // path-keyed from before this restructure. One-shot migration.
        await this.hooks.onNoteOpened?.(id, meta.id).catch(() => undefined);
      }

      return {
        id,
        title: meta.title || headingTitle || filenameTitle || 'Untitled',
        text: content,
        createdAt: meta.createdAt || '',
        updatedAt: meta.updatedAt || new Date(file.lastModified).toISOString(),
        uuid: meta.id,
        size: file.size,
        mtimeMs: file.lastModified,
      };
    } catch {
      return null;
    }
  }

  async findNoteByUuid(uuid: string): Promise<NoteMeta | null> {
    if (!uuid) return null;
    const root = this.perms.requireHandle();
    return this.searchUuid(root, '', uuid);
  }

  private async searchUuid(
    dir: FileSystemDirectoryHandle,
    prefix: string,
    uuid: string,
  ): Promise<NoteMeta | null> {
    for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (name.startsWith('.') || name.endsWith('.assets')) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'file') {
        if (!name.endsWith('.md')) continue;
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          const raw = await file.text();
          const { meta } = parseFrontmatter(raw);
          if (meta.id === uuid) {
            const iso = new Date(file.lastModified).toISOString();
            return {
              id: path,
              title: meta.title || name.replace(/\.md$/, ''),
              createdAt: meta.createdAt || iso,
              updatedAt: meta.updatedAt || iso,
              uuid,
              size: file.size,
              mtimeMs: file.lastModified,
            };
          }
        } catch { /* unreadable file — skip */ }
      } else if (entry.kind === 'directory') {
        const hit = await this.searchUuid(entry as FileSystemDirectoryHandle, path, uuid);
        if (hit) return hit;
      }
    }
    return null;
  }

  async create(title: string, text?: string, parentFolder?: string): Promise<NoteMeta> {
    const root = this.perms.requireHandle();
    const parts = (parentFolder || '').split('/').map(p => p.trim()).filter(Boolean);
    const dir = await resolveDir(root, parts, true);
    const uuid = generateNoteId();
    const base = sanitizeNoteTitle(title);
    const filename = await resolveUniqueFilename(dir, base, 'md');
    const path = parts.length ? `${parts.join('/')}/${filename}` : filename;
    const now = new Date().toISOString();
    const meta = { id: uuid, title, createdAt: now, updatedAt: now };
    const raw = serializeFrontmatter(meta, text || '\n');
    const handle = await dir.getFileHandle(filename, { create: true });
    await writeFile(handle, raw);
    return { id: path, title, createdAt: now, updatedAt: now, uuid };
  }

  async deleteFolder(path: string): Promise<void> {
    const root = this.perms.requireHandle();
    const parts = path.split('/').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) throw new Error('Cannot delete the root folder');
    const name = parts.pop()!;
    const parent = await resolveDir(root, parts);
    await parent.removeEntry(name, { recursive: true });
  }

  async createFolder(path: string): Promise<void> {
    const root = this.perms.requireHandle();
    const parts = path.split('/').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) throw new Error('Folder name is required');
    for (const part of parts) {
      if (part === '.' || part === '..' || /[\\:*?"<>|]/.test(part)) {
        throw new Error(`Invalid folder name: ${part}`);
      }
    }
    await resolveDir(root, parts, true);
  }

  async saveContent(id: string, text: string, title?: string, opts?: SaveOptions): Promise<NoteMeta> {
    const root = this.perms.requireHandle();
    const { dirParts, filename } = splitPath(id);
    const parent = await resolveDir(root, dirParts);
    const fileHandle = await parent.getFileHandle(filename);
    const file = await fileHandle.getFile();
    if (!sameRevision(file, opts?.expected)) {
      throw new NoteConflictError(id);
    }
    const raw = await file.text();
    const { meta } = parseFrontmatter(raw);
    // Snapshot current on-disk content before overwriting. Best-effort —
    // a history write failure must never block the actual save. The
    // snapshot is keyed by the note's stable UUID so renames/moves never
    // orphan history.
    if (meta.id) {
      try { await this.hooks.beforeOverwrite?.(meta.id, raw); } catch (err) {
        console.warn('[notes] history snapshot failed', err);
      }
    }
    // Tasks own both their frontmatter schema (TaskNotes spec — block-style
    // arrays + nested objects that the note's flat parser would silently
    // drop) and their filename (set by `defaultTaskBasename` at create time
    // and tracked by the task index). Detect by frontmatter shape — see
    // `isTaskFrontmatter` — so the rule travels with the file regardless of
    // where in the vault tasks happen to live. Splice the new body into the
    // existing raw and skip the title-driven rename: the editor is just a
    // body editor for these files.
    if (isTaskFrontmatter(meta)) {
      const { frontmatter } = splitFrontmatter(raw);
      const nextRaw = frontmatter ? `${frontmatter}${text}` : text;
      await writeFile(fileHandle, nextRaw);
      const newFile = await fileHandle.getFile();
      return this.readFileMeta(
        id,
        meta.title || filename.replace(/\.md$/i, ''),
        meta.createdAt || '',
        meta.updatedAt || new Date(newFile.lastModified).toISOString(),
        fileHandle,
        meta.id,
      );
    }
    if (meta.id) {
      // Native — update updatedAt in frontmatter
      if (title) meta.title = title;
      meta.updatedAt = new Date().toISOString();
      const nextRaw = serializeFrontmatter(meta, text);

      // Keep the on-disk filename in sync with the (sanitized) title. This
      // also subsumes lazy migration of legacy <uuid>.md files: as soon as
      // they have a real title, the basename diverges from the title and a
      // rename fires. Cheap string compare gates the dir scan so steady-state
      // saves (title unchanged) don't pay for it.
      const effectiveTitle = (meta.title || '').trim();
      let targetHandle = fileHandle;
      let nextId = id;
      let renameFilename = filename;
      if (effectiveTitle) {
        const desiredBase = sanitizeNoteTitle(effectiveTitle);
        const currentBase = filename.replace(/\.md$/i, '');
        if (desiredBase !== currentBase) {
          const newName = await resolveUniqueFilename(parent, desiredBase, 'md', filename);
          if (newName !== filename) {
            renameFilename = newName;
            nextId = dirParts.length ? `${dirParts.join('/')}/${newName}` : newName;
          }
        }
      }
      // safeRenameFile handles the title-driven rename atomically and is
      // immune to the case-insensitive-FS data-loss trap that the previous
      // `getFileHandle(new,{create}) + write + removeEntry(old)` sequence
      // suffered from. When `renameFilename === filename` (no rename), it
      // just writes to the existing handle.
      targetHandle = await safeRenameFile(parent, filename, renameFilename, nextRaw, fileHandle);
      if (nextId !== id) {
        const oldBase = filename.replace(/\.md$/i, '');
        const newBase = nextId.split('/').pop()!.replace(/\.md$/i, '');
        await this.migrateNoteSideFiles(dirParts, oldBase, newBase);
      }
      return this.readFileMeta(
        nextId,
        meta.title || 'Untitled',
        meta.createdAt || '',
        meta.updatedAt,
        targetHandle,
        meta.id,
      );
    } else {
      // Foreign — write raw so we don't damage someone else's format
      await writeFile(fileHandle, text);
      const firstLine = text.split('\n').find(l => l.trim().length > 0) || '';
      const headingTitle = firstLine.startsWith('# ') ? firstLine.slice(2).trim() : '';
      return this.readFileMeta(
        id,
        title || headingTitle || pathBasename(id).replace(/[-_]/g, ' '),
        '',
        new Date().toISOString(),
        fileHandle,
      );
    }
  }

  // Re-create a note whose live file is missing on disk. Unlike
  // saveContent, every step is `{ create: true }` — parents and the file
  // itself are created if absent — and frontmatter is built from the
  // caller-supplied `opts` rather than the unreadable on-disk frontmatter.
  // Idempotent: if the file already exists, this just overwrites it with
  // the recovered content.
  async recoverNote(
    id: string,
    body: string,
    opts: { uuid: string; title: string; createdAt?: string },
  ): Promise<NoteMeta> {
    const root = this.perms.requireHandle();
    const { dirParts, filename } = splitPath(id);
    const parent = await resolveDir(root, dirParts, true);
    const fh = await parent.getFileHandle(filename, { create: true });
    const now = new Date().toISOString();
    const createdAt = opts.createdAt || now;
    const meta = { id: opts.uuid, title: opts.title, createdAt, updatedAt: now };
    const raw = serializeFrontmatter(meta, body);
    await writeFile(fh, raw);
    return this.readFileMeta(id, opts.title, createdAt, now, fh, opts.uuid);
  }

  async rename(id: string, title: string, opts?: SaveOptions): Promise<NoteMeta> {
    const root = this.perms.requireHandle();
    const { dirParts, filename: srcName } = splitPath(id);
    const parent = await resolveDir(root, dirParts);
    const fileHandle = await parent.getFileHandle(srcName);
    const file = await fileHandle.getFile();
    if (!sameRevision(file, opts?.expected)) {
      throw new NoteConflictError(id);
    }
    const raw = await file.text();
    const { meta, content } = parseFrontmatter(raw);
    const now = new Date().toISOString();

    // Tasks own their title (set on create / via updateTask) and their
    // filename (defaultTaskBasename) — the note editor's title input is
    // display-only for these. Detect by frontmatter shape (`isTaskFrontmatter`)
    // so the policy is independent of where tasks live on disk. Return the
    // existing meta untouched so callers get a no-op result rather than
    // corrupting the index by renaming.
    if (isTaskFrontmatter(meta)) {
      return this.readFileMeta(
        id,
        meta.title || title,
        meta.createdAt || '',
        meta.updatedAt || new Date(file.lastModified).toISOString(),
        fileHandle,
        meta.id,
      );
    }

    // Compute the next file content for either native (frontmatter) or
    // foreign (`# Heading`) flavors.
    let nextRaw: string;
    if (meta.id) {
      meta.title = title;
      meta.updatedAt = now;
      nextRaw = serializeFrontmatter(meta, content);
    } else {
      const lines = raw.split('\n');
      const headingIdx = lines.findIndex(l => l.trim().length > 0);
      if (headingIdx >= 0 && lines[headingIdx].startsWith('# ')) {
        lines[headingIdx] = `# ${title}`;
      } else {
        lines.unshift(`# ${title}`, '');
      }
      nextRaw = lines.join('\n');
    }

    const newName = await resolveUniqueFilename(parent, sanitizeNoteTitle(title), 'md', srcName);
    const newId = dirParts.length ? `${dirParts.join('/')}/${newName}` : newName;

    // Snapshot pre-rename content keyed by frontmatter UUID so a future
    // regression here is recoverable from history. Best-effort.
    if (meta.id) {
      try { await this.hooks.beforeOverwrite?.(meta.id, raw); } catch (err) {
        console.warn('[notes] history snapshot failed before rename', err);
      }
    }

    const newHandle = await safeRenameFile(parent, srcName, newName, nextRaw, fileHandle);

    if (newName === srcName) {
      return this.readFileMeta(id, title, meta.createdAt || '', now, newHandle, meta.id);
    }

    const oldBase = srcName.replace(/\.md$/i, '');
    const newBase = newName.replace(/\.md$/i, '');
    await this.migrateNoteSideFiles(dirParts, oldBase, newBase);

    return this.readFileMeta(newId, title, meta.createdAt || '', now, newHandle, meta.id);
  }

  // Move `<dirParts>/<oldBase>.assets/` alongside a renamed note. Best-effort;
  // never throws. History is keyed by the note's frontmatter UUID, so it is
  // invariant across rename/move/folder rename and no longer needs migration.
  // Only the legacy per-note `<base>.assets/` sidecar still tracks the
  // filename.
  private async migrateNoteSideFiles(dirParts: string[], oldBase: string, newBase: string) {
    if (oldBase === newBase) return;
    try {
      const root = this.perms.requireHandle();
      const parent = await resolveDir(root, dirParts);
      // safeRenameDir avoids the case-insensitive collision trap that
      // would otherwise delete the sidecar dir we're trying to preserve.
      await safeRenameDir(parent, `${oldBase}.assets`, `${newBase}.assets`);
    } catch { /* no legacy sidecar */ }
  }

  async renameFolder(oldPath: string, newName: string): Promise<string> {
    const root = this.perms.requireHandle();
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Folder name is required');
    if (trimmed === '.' || trimmed === '..' || /[\\/:*?"<>|]/.test(trimmed)) {
      throw new Error(`Invalid folder name: ${trimmed}`);
    }
    const parts = oldPath.split('/').filter(Boolean);
    if (parts.length === 0) throw new Error('Cannot rename the root folder');
    const oldName = parts[parts.length - 1];
    if (oldName === trimmed) return oldPath; // no-op

    const parentParts = parts.slice(0, -1);
    const parentDir = await resolveDir(root, parentParts);

    // Conflict check: new name already exists. Skip when this is a case-only
    // rename — on case-insensitive filesystems `getDirectoryHandle(trimmed)`
    // resolves to the SOURCE dir itself and would falsely flag a collision.
    if (oldName.toLowerCase() !== trimmed.toLowerCase()) {
      try {
        await parentDir.getDirectoryHandle(trimmed);
        throw new Error(`"${trimmed}" already exists in ${parentParts.join('/') || 'root'}`);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('"')) throw err;
        // NotFoundError — good, no collision
      }
    }

    // safeRenameDir handles case-only renames safely; on case-insensitive FS
    // it write-protects the source from getting deleted by removeEntry.
    await safeRenameDir(parentDir, oldName, trimmed);

    const newPath = parentParts.length ? `${parentParts.join('/')}/${trimmed}` : trimmed;
    return newPath;
  }

  async move(srcId: string, destFolder: string): Promise<string> {
    const root = this.perms.requireHandle();
    const normalizedDest = destFolder.split('/').map(p => p.trim()).filter(Boolean).join('/');
    const src = srcId.replace(/\/+$/, '');
    if (!src) throw new Error('Invalid source');

    const isNote = src.endsWith('.md');
    const { dirParts: srcDirParts, filename: srcName } = splitPath(src);
    const srcParentPath = srcDirParts.join('/');

    if (srcParentPath === normalizedDest) return src; // already there, no-op

    if (!isNote) {
      // Prevent moving a folder into itself or a descendant
      if (normalizedDest === src || normalizedDest.startsWith(`${src}/`)) {
        throw new Error('Cannot move a folder into itself');
      }
    }

    const destParts = normalizedDest.split('/').filter(Boolean);
    const destDir = await resolveDir(root, destParts, true);

    // Notes resolve collisions with a numeric suffix; folders still throw on
    // collision because folder merges aren't a clear user intent.
    let finalName = srcName;
    if (isNote) {
      const srcBase = srcName.replace(/\.md$/i, '');
      finalName = await resolveUniqueFilename(destDir, srcBase, 'md');
    } else {
      try {
        await destDir.getDirectoryHandle(srcName);
        throw new Error(`"${srcName}" already exists in ${normalizedDest || 'root'}`);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('"')) throw err;
        // NotFoundError — good, no collision
      }
    }

    const newPath = normalizedDest ? `${normalizedDest}/${finalName}` : finalName;

    if (isNote) {
      await this.moveFile(srcDirParts, srcName, destDir, finalName);
      // Move legacy per-note .assets/ sidecar if present (for old notes).
      // The sidecar's name follows the destination file's basename.
      const srcAssetsName = `${pathBasename(src)}.assets`;
      const destAssetsName = `${finalName.replace(/\.md$/i, '')}.assets`;
      try {
        const srcParent = await resolveDir(root, srcDirParts);
        const sidecar = await srcParent.getDirectoryHandle(srcAssetsName);
        const newSidecar = await destDir.getDirectoryHandle(destAssetsName, { create: true });
        await copyDirRecursive(sidecar, newSidecar);
        await srcParent.removeEntry(srcAssetsName, { recursive: true });
      } catch { /* no sidecar */ }
    } else {
      // Folder move: recreate dest, copy contents recursively, delete source
      const srcDir = await resolveDir(root, src.split('/').filter(Boolean));
      const newDir = await destDir.getDirectoryHandle(srcName, { create: true });
      await copyDirRecursive(srcDir, newDir);
      const srcParent = await resolveDir(root, srcDirParts);
      await srcParent.removeEntry(srcName, { recursive: true });
    }

    return newPath;
  }

  async delete(id: string): Promise<void> {
    const root = this.perms.requireHandle();
    const { dirParts, filename } = splitPath(id);
    try {
      const parent = await resolveDir(root, dirParts);
      await parent.removeEntry(filename);
    } catch { /* already gone */ }
    // Delete sibling .assets folder
    const assetsName = `${pathBasename(id)}.assets`;
    try {
      const parent = await resolveDir(root, dirParts);
      await parent.removeEntry(assetsName, { recursive: true });
    } catch { /* no assets */ }
  }

  private async moveFile(
    srcDirParts: string[],
    srcName: string,
    destDir: FileSystemDirectoryHandle,
    destName: string,
  ) {
    const root = this.perms.requireHandle();
    const srcParent = await resolveDir(root, srcDirParts);
    const srcHandle = await srcParent.getFileHandle(srcName);
    const srcFile = await srcHandle.getFile();
    const buf = await srcFile.arrayBuffer();
    const destHandle = await destDir.getFileHandle(destName, { create: true });
    await writeFile(destHandle, buf);
    await srcParent.removeEntry(srcName);
  }

  private async readFileMeta(
    id: string,
    title: string,
    createdAt: string,
    updatedAt: string,
    fileHandle: FileSystemFileHandle,
    uuid?: string,
  ): Promise<NoteMeta> {
    const file = await fileHandle.getFile();
    return {
      id,
      title,
      createdAt,
      updatedAt,
      uuid: uuid || undefined,
      size: file.size,
      mtimeMs: file.lastModified,
    };
  }
}
