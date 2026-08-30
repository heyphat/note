import { parseFrontmatter } from '@/lib/frontmatter';
import { PermissionsController } from './permissions';
import { writeFile, resolveDir } from './fs-helpers';
import { HISTORY_MAX, historyPathForUuid, legacyHistoryPathFor, splitPath } from './paths';

/**
 * Per-note version history under `.history/<uuid>/<ts>.md`. UUID-keyed so
 * renames, moves, and folder rename never orphan the snapshots. Includes
 * a one-shot migrator (`migrateLegacy`) that moves pre-UUID path-keyed
 * snapshots into the UUID layout the first time a note is opened.
 */
export class HistoryStore {
  constructor(private perms: PermissionsController) {}

  /** Write a timestamped snapshot of `raw` to `.history/<uuid>/`.
   *  Prunes oldest beyond HISTORY_MAX. */
  async snapshot(uuid: string, raw: string): Promise<void> {
    if (!uuid) return; // nothing to anchor against — skip
    const root = this.perms.requireHandle();
    const histDir = await resolveDir(root, historyPathForUuid(uuid), true);
    const ts = new Date().toISOString().replace(/:/g, '-');
    const snap = await histDir.getFileHandle(`${ts}.md`, { create: true });
    await writeFile(snap, raw);
    // Prune — timestamp filenames sort lexicographically by recency.
    const names: string[] = [];
    for await (const [name, entry] of (histDir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (entry.kind === 'file' && name.endsWith('.md')) names.push(name);
    }
    names.sort();
    while (names.length > HISTORY_MAX) {
      const oldest = names.shift()!;
      try { await histDir.removeEntry(oldest); } catch { /* already gone */ }
    }
  }

  async listById(id: string): Promise<string[]> {
    const uuid = await this.resolveNoteUuid(id);
    if (!uuid) return [];
    return this.listByUuid(uuid);
  }

  async getVersion(id: string, ts: string): Promise<string | null> {
    const uuid = await this.resolveNoteUuid(id);
    if (!uuid) return null;
    return this.getVersionByUuid(uuid, ts);
  }

  async listByUuid(uuid: string): Promise<string[]> {
    if (!uuid) return [];
    try {
      const root = this.perms.requireHandle();
      const dir = await resolveDir(root, historyPathForUuid(uuid));
      const names: string[] = [];
      for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (entry.kind === 'file' && name.endsWith('.md')) {
          names.push(name.replace(/\.md$/, ''));
        }
      }
      return names.sort().reverse(); // newest first
    } catch {
      return [];
    }
  }

  async getVersionByUuid(uuid: string, ts: string): Promise<string | null> {
    if (!uuid) return null;
    try {
      const root = this.perms.requireHandle();
      const dir = await resolveDir(root, historyPathForUuid(uuid));
      const fh = await dir.getFileHandle(`${ts}.md`);
      const file = await fh.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }

  /** Move `.history/<old-path>/` → `.history/<uuid>/`, leaving the
   *  destination untouched if it already exists. Best-effort. */
  async migrateLegacy(id: string, uuid: string): Promise<void> {
    if (!uuid) return;
    const root = this.perms.requireHandle();
    let legacyDir: FileSystemDirectoryHandle;
    try {
      legacyDir = await resolveDir(root, legacyHistoryPathFor(id));
    } catch { return; /* nothing to migrate */ }
    let destDir: FileSystemDirectoryHandle;
    try {
      destDir = await resolveDir(root, historyPathForUuid(uuid));
    } catch {
      destDir = await resolveDir(root, historyPathForUuid(uuid), true);
    }
    // Copy each snapshot over; skip files that already exist at the dest
    // (e.g. a previous partial migration).
    for await (const [name, entry] of (legacyDir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (entry.kind !== 'file' || !name.endsWith('.md')) continue;
      try {
        await destDir.getFileHandle(name);
        continue; // already there
      } catch { /* ok — copy */ }
      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        const buf = await file.arrayBuffer();
        const out = await destDir.getFileHandle(name, { create: true });
        await writeFile(out, buf);
      } catch { /* skip unreadable */ }
    }
    // Walk back up the legacy parent chain and clean up any now-empty dirs.
    try {
      const parts = legacyHistoryPathFor(id);
      const last = parts.pop()!;
      const parent = await resolveDir(root, parts);
      await parent.removeEntry(last, { recursive: true });
      // Best-effort: prune empty ancestor directories under `.history/`.
      while (parts.length > 1) {
        const tail = parts.pop()!;
        const grand = await resolveDir(root, parts);
        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of (await grand.getDirectoryHandle(tail) as unknown as { keys(): AsyncIterable<string> }).keys()) {
            return; // not empty — stop pruning
          }
          await grand.removeEntry(tail);
        } catch { return; }
      }
    } catch { /* keep going */ }
  }

  /** Resolve a public note id (path) to its frontmatter UUID by reading the
   *  file. Returns null when the file is missing or has no frontmatter id
   *  yet. Read-only — does not upgrade. */
  private async resolveNoteUuid(id: string): Promise<string | null> {
    try {
      const root = this.perms.requireHandle();
      const { dirParts, filename } = splitPath(id);
      const parent = await resolveDir(root, dirParts);
      const fh = await parent.getFileHandle(filename);
      const raw = await (await fh.getFile()).text();
      const { meta } = parseFrontmatter(raw);
      return meta.id || null;
    } catch {
      return null;
    }
  }
}
