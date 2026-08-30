import type { NoteRevision } from '../types';

// Augment FileSystemHandle with the permission methods that aren't in the
// default TS DOM lib but are part of the File System Access API.
declare global {
  interface FileSystemHandle {
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
  }
}

/** Navigate to a subdirectory by parts. If create=true, creates missing dirs. */
export async function resolveDir(
  root: FileSystemDirectoryHandle,
  parts: string[],
  create = false,
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

export async function writeFile(handle: FileSystemFileHandle, content: string | ArrayBuffer): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function copyDirRecursive(
  src: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, entry] of (src as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile();
      const buf = await file.arrayBuffer();
      const h = await dest.getFileHandle(name, { create: true });
      await writeFile(h, buf);
    } else {
      const childDest = await dest.getDirectoryHandle(name, { create: true });
      await copyDirRecursive(entry as FileSystemDirectoryHandle, childDest);
    }
  }
}

export function sameRevision(file: File, expected?: NoteRevision | null): boolean {
  if (!expected) return true;
  if (expected.mtimeMs != null && file.lastModified !== expected.mtimeMs) return false;
  if (expected.size != null && file.size !== expected.size) return false;
  return true;
}

// Atomic-ish rename of a file in `parent` from `oldName` → `newName`, while
// also writing `content`. Replaces the unsafe `getFileHandle(new,{create}) +
// write(new) + removeEntry(old)` pattern that deletes the file as a side
// effect on case-insensitive filesystems (macOS APFS, Windows NTFS) when
// both names case-fold to the same on-disk inode.
//
// Branches:
//   1. exact match — write to old handle.
//   2. case-only divergence (`lower(old)===lower(new)` but different cased
//      strings) — write to old handle FIRST so data is unconditionally
//      preserved, then attempt `oldHandle.move(newName)` to update the
//      canonical case. If `move` is unavailable / throws, the on-disk
//      casing stays as-is. Strictly cosmetic; never destructive.
//   3. truly different names — try atomic `move(newName)` first; on
//      failure, fall back to copy-via-create + remove-old. Safe because
//      the names differ even on case-insensitive FS. A defense-in-depth
//      assertion before the destructive `removeEntry` rejects any caller
//      that smuggles a case-collision through this branch.
export async function safeRenameFile(
  parent: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
  content: string | ArrayBuffer,
  oldHandle: FileSystemFileHandle,
): Promise<FileSystemFileHandle> {
  if (oldName === newName) {
    await writeFile(oldHandle, content);
    return oldHandle;
  }
  const oldLower = oldName.toLowerCase();
  const newLower = newName.toLowerCase();
  const moveable = oldHandle as FileSystemFileHandle & { move?: (n: string) => Promise<void> };
  if (oldLower === newLower) {
    await writeFile(oldHandle, content);
    if (typeof moveable.move === 'function') {
      try { await moveable.move(newName); }
      catch (err) { console.warn('[notes] case-only file rename via move() failed; on-disk casing unchanged', err); }
    }
    return oldHandle;
  }
  if (typeof moveable.move === 'function') {
    try {
      await moveable.move(newName);
      await writeFile(oldHandle, content);
      return oldHandle;
    } catch (err) {
      console.warn('[notes] file move() failed, falling back to copy+remove', err);
    }
  }
  if (oldLower === newLower) {
    throw new Error(`Refusing copy+remove on case-collision: ${oldName} → ${newName}`);
  }
  const newHandle = await parent.getFileHandle(newName, { create: true });
  await writeFile(newHandle, content);
  try { await parent.removeEntry(oldName); }
  catch (err) { console.warn('[notes] failed to remove old file after rename', err); }
  return newHandle;
}

// Same data-loss-safe rename strategy as `safeRenameFile`, applied to a
// directory. Used for `.assets/` sidecar dirs and folder renames.
export async function safeRenameDir(
  parent: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
): Promise<FileSystemDirectoryHandle> {
  if (oldName === newName) {
    return parent.getDirectoryHandle(oldName);
  }
  const srcDir = await parent.getDirectoryHandle(oldName);
  const oldLower = oldName.toLowerCase();
  const newLower = newName.toLowerCase();
  const moveable = srcDir as FileSystemDirectoryHandle & { move?: (n: string) => Promise<void> };
  if (oldLower === newLower) {
    if (typeof moveable.move === 'function') {
      try { await moveable.move(newName); }
      catch (err) { console.warn('[notes] case-only dir rename via move() failed; on-disk casing unchanged', err); }
    }
    return srcDir;
  }
  if (typeof moveable.move === 'function') {
    try { await moveable.move(newName); return srcDir; }
    catch (err) { console.warn('[notes] dir move() failed, falling back to copy+remove', err); }
  }
  if (oldLower === newLower) {
    throw new Error(`Refusing copy+remove on case-collision: ${oldName} → ${newName}`);
  }
  const destDir = await parent.getDirectoryHandle(newName, { create: true });
  await copyDirRecursive(srcDir, destDir);
  await parent.removeEntry(oldName, { recursive: true });
  return destDir;
}
