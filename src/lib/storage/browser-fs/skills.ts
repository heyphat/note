import { parseFrontmatter, serializeFrontmatter, generateNoteId } from '@/lib/frontmatter';
import type { SkillMeta, SkillFull, SkillCreateSpec } from '../types';
import { PermissionsController } from './permissions';
import { writeFile, copyDirRecursive } from './fs-helpers';
import { GLOBAL_ASSETS_DIR, SKILLS_DIR } from './paths';
import { sanitizeNoteTitle, resolveUniqueDirname } from './sanitize-title';

// Two on-disk shapes:
//   1. Single-file: `.assets/skills/<id>.md` — SKILL.md frontmatter inline.
//   2. Folder bundle: `.assets/skills/<basename>/SKILL.md` plus arbitrary
//      sibling files. `id` for folder skills is the folder basename, so
//      relative paths inside aux files (`![](./foo.png)`) survive lookup.
//
// The vault walker already skips `.assets/`, so skill files never leak
// into the note tree.

/** Per-skill aux-file enumeration caps (defense against absurdly nested or
 *  asset-heavy folders). */
const SKILL_MAX_FILES = 64;
const SKILL_MAX_DEPTH = 4;
/** Total skills + max nesting depth for category discovery. Two separate
 *  caps so a vault organized as `category/sub/skill/SKILL.md` works while
 *  a runaway directory tree still terminates. */
const SKILL_TREE_MAX_DEPTH = 6;
const SKILL_TREE_MAX_COUNT = 500;
/** Cap on bytes read from disk per aux file. Comfortably exceeds the
 *  downstream char cap (read-skill-file-tool's MAX_BODY_CHARS) even after
 *  UTF-8 decoding, so the tool's truncation check still fires correctly. */
const SKILL_AUX_READ_MAX_BYTES = 64 * 1024;

/** Full skill record returned by the recursive enumerator. Carries the
 *  SKILL.md handle + the parent directory handle so destructive operations
 *  (delete, rename) can target the right node regardless of how deeply
 *  nested the skill lives. */
type SkillRecord = {
  meta: SkillMeta;
  content: string;
  frontmatter: Record<string, string>;
  fileHandle: FileSystemFileHandle;
  folderHandle?: FileSystemDirectoryHandle;
  /** Directory containing the skill's `.md` file (single-file) or skill
   *  folder (folder skill). Used by `deleteSkill` to remove the entry. */
  parentDir: FileSystemDirectoryHandle;
  /** Basename of the skill entry inside `parentDir` — the file's name for
   *  single-file skills, the folder's name for folder skills. */
  parentEntry: string;
};

export class SkillStore {
  constructor(private perms: PermissionsController) {}

  async list(): Promise<SkillMeta[]> {
    const records = await this.listSkillRecords();
    // Sort by id (path-shaped) so categories cluster together when consumers
    // group by path prefix — the SkillList tree builder relies on this.
    return records.map(r => r.meta).sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<SkillFull | null> {
    const found = await this.findSkillRecord(id, 'id');
    if (!found) return null;
    const files = found.folderHandle
      ? await this.listSkillFolderFiles(found.folderHandle)
      : [];
    return { ...found.meta, content: found.content, files, frontmatter: found.frontmatter };
  }

  async getByName(name: string): Promise<SkillFull | null> {
    const found = await this.findSkillRecord(name, 'name');
    if (!found) return null;
    const files = found.folderHandle
      ? await this.listSkillFolderFiles(found.folderHandle)
      : [];
    return { ...found.meta, content: found.content, files, frontmatter: found.frontmatter };
  }

  async getByUuid(uuid: string): Promise<SkillFull | null> {
    const found = await this.findSkillRecord(uuid, 'uuid');
    if (!found) return null;
    const files = found.folderHandle
      ? await this.listSkillFolderFiles(found.folderHandle)
      : [];
    return { ...found.meta, content: found.content, files, frontmatter: found.frontmatter };
  }

  async ensureUuid(id: string): Promise<string> {
    const found = await this.findSkillRecord(id, 'id');
    if (!found) throw new Error(`Skill not found: ${id}`);
    const existing = (found.frontmatter.id || '').trim();
    if (existing) return existing;
    // Lazily generate a UUID and stamp it into the SKILL.md frontmatter so
    // the URL can reference the skill across renames / moves. The body is
    // preserved byte-for-byte; only the `id:` key is added to the
    // frontmatter map (serializeSkillRecord keeps name/description first
    // and any extra keys after).
    const uuid = generateNoteId();
    const nextFrontmatter = { ...found.frontmatter, id: uuid };
    await writeFile(found.fileHandle, this.serializeSkillRecord(nextFrontmatter, found.content));
    return uuid;
  }

  async readFile(id: string, relPath: string): Promise<{ text: string; size: number } | null> {
    // Reject path-traversal up front — the FS API will happily resolve `..`
    // out of the skill folder, exposing other skills or the vault root.
    const segments = relPath.split('/');
    for (const seg of segments) {
      if (!seg || seg === '.' || seg === '..') return null;
      if (seg.startsWith('.')) return null;
    }
    if (relPath === 'SKILL.md') return null;
    const found = await this.findSkillRecord(id, 'id');
    if (!found || !found.folderHandle) return null;
    try {
      let cursor: FileSystemDirectoryHandle = found.folderHandle;
      for (let i = 0; i < segments.length - 1; i++) {
        cursor = await cursor.getDirectoryHandle(segments[i]);
        // Refuse to walk through a nested skill folder — listSkillFolderFiles
        // hides these from the manifest, so they must also be unreachable by
        // guess. Without this, `child/SKILL.md` or `child/references/foo.md`
        // would silently resolve through the parent skill.
        try {
          await cursor.getFileHandle('SKILL.md');
          return null;
        } catch { /* not a nested skill, keep descending */ }
      }
      const fh = await cursor.getFileHandle(segments[segments.length - 1]);
      const file = await fh.getFile();
      // Slice before decoding so a multi-MB or binary aux file doesn't
      // materialize fully in memory just to be truncated by the caller.
      const blob = file.size > SKILL_AUX_READ_MAX_BYTES
        ? file.slice(0, SKILL_AUX_READ_MAX_BYTES)
        : file;
      const text = await blob.text();
      return { text, size: file.size };
    } catch {
      return null;
    }
  }

  async create(spec: SkillCreateSpec): Promise<SkillMeta> {
    const skillsRoot = await this.getSkillsDir(true);
    const name = spec.name.trim();
    if (!name) throw new Error('Skill name is required.');
    const description = (spec.description || '').trim();
    // Reject if a skill with this name already exists — the model identifies
    // skills by name, so duplicates would silently shadow each other. We
    // check across the entire tree (recursive list), so a top-level
    // skill named "X" still blocks a `coding/X` import.
    const existing = await this.list();
    if (existing.some(s => s.name === name)) {
      throw new Error(`A skill named "${name}" already exists.`);
    }
    // Carry custom frontmatter keys from the import source (`version`,
    // `author`, `license`, …) through to the on-disk SKILL.md. The
    // serializer normalizes `name`/`description` to the top regardless of
    // order, so spreading `spec.frontmatter` first and overlaying the
    // explicit fields guarantees the explicit values win without losing
    // any custom keys the caller pre-populated.
    const initialFrontmatter: Record<string, string> = { ...spec.frontmatter, name, description };
    // Resolve the target parent directory. `targetDir = "coding/python"`
    // navigates / creates `.assets/skills/coding/python/`. Empty / omitted
    // places the new skill at the top level.
    const { dir: parentDir, prefix: idPrefix } = await this.resolveSkillTargetDir(skillsRoot, spec.targetDir);
    const hasAux = (spec.files?.length ?? 0) > 0;
    // A skill becomes a folder bundle when it has aux files OR when the
    // caller explicitly asks for a folder (e.g. because nested child
    // skills will be created underneath it and need a directory to live
    // in). Single-file skills are only used when neither condition holds.
    if (hasAux || spec.forceFolder) {
      // Folder skill.
      const base = sanitizeNoteTitle(name);
      const folderName = await resolveUniqueDirname(parentDir, base);
      const folder = await parentDir.getDirectoryHandle(folderName, { create: true });
      const skillFh = await folder.getFileHandle('SKILL.md', { create: true });
      await writeFile(skillFh, this.serializeSkillRecord(initialFrontmatter, spec.content));
      for (const f of spec.files ?? []) {
        await this.writeSkillAuxFile(folder, f.path, f.bytes);
      }
      const id = idPrefix ? `${idPrefix}/${folderName}` : folderName;
      return { id, name, description, isFolder: true, path: `${id}/SKILL.md` };
    }
    // Single-file skill.
    const filename = `${generateNoteId()}.md`;
    const fh = await parentDir.getFileHandle(filename, { create: true });
    await writeFile(fh, this.serializeSkillRecord(initialFrontmatter, spec.content));
    const id = idPrefix ? `${idPrefix}/${filename.replace(/\.md$/, '')}` : filename.replace(/\.md$/, '');
    const path = idPrefix ? `${idPrefix}/${filename}` : filename;
    return { id, name, description, isFolder: false, path };
  }

  async save(id: string, content: string): Promise<void> {
    const found = await this.findSkillRecord(id, 'id');
    if (!found) throw new Error(`Skill not found: ${id}`);
    // Preserve every frontmatter key the file already had — save only
    // touches the body, so custom keys (`version`, `author`, etc.) round-trip
    // unchanged.
    await writeFile(found.fileHandle, this.serializeSkillRecord(found.frontmatter, content));
  }

  async delete(id: string): Promise<void> {
    try {
      const found = await this.findSkillRecord(id, 'id');
      if (!found) return;
      // `parentDir` + `parentEntry` survive nesting — for `coding/python` the
      // parentDir is the `coding/` handle and parentEntry is `python`. The
      // recursive flag covers folder-skill deletion (aux files come along).
      await found.parentDir.removeEntry(found.parentEntry, { recursive: found.meta.isFolder });
    } catch { /* already gone */ }
  }

  async updateDescription(id: string, description: string): Promise<SkillMeta> {
    const found = await this.findSkillRecord(id, 'id');
    if (!found) throw new Error(`Skill not found: ${id}`);
    const trimmed = description.trim();
    const nextFrontmatter = { ...found.frontmatter, description: trimmed };
    await writeFile(found.fileHandle, this.serializeSkillRecord(nextFrontmatter, found.content));
    return { ...found.meta, description: trimmed };
  }

  async rename(id: string, newName: string): Promise<SkillMeta> {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Skill name cannot be empty.');
    const found = await this.findSkillRecord(id, 'id');
    if (!found) throw new Error(`Skill not found: ${id}`);
    const existing = await this.list();
    if (existing.some(s => s.name === trimmed && s.id !== found.meta.id)) {
      throw new Error(`A skill named "${trimmed}" already exists.`);
    }
    // Folder skills keep the on-disk folder name stable (aux file relative
    // paths in the skill body would break if we moved the folder). Single-file
    // skills keep their filename. In both cases the rename is entirely a
    // frontmatter patch.
    const nextFrontmatter = { ...found.frontmatter, name: trimmed };
    await writeFile(found.fileHandle, this.serializeSkillRecord(nextFrontmatter, found.content));
    return { ...found.meta, name: trimmed };
  }

  async move(id: string, destDir: string): Promise<SkillMeta> {
    const skillsRoot = await this.getSkillsDir(true);
    const found = await this.findSkillRecord(id, 'id');
    if (!found) throw new Error(`Skill not found: ${id}`);
    const destPath = (destDir || '').replace(/^\/+|\/+$/g, '');
    // Reject self / descendant targets — moving `coding/python` into
    // `coding/python/inner` would form a path cycle.
    if (destPath === found.meta.id) {
      throw new Error('Cannot move a skill into itself.');
    }
    if (found.meta.isFolder && (destPath === found.meta.id || destPath.startsWith(`${found.meta.id}/`))) {
      throw new Error('Cannot move a folder skill into one of its own descendants.');
    }
    // Same parent? No-op success. Compare by path rather than handle identity:
    // `found.parentDir` is captured during the skills walk; `destParent` is
    // freshly resolved below. Those are different `FileSystemDirectoryHandle`
    // objects even when they refer to the same on-disk directory, so a `===`
    // check would silently never fire — and the move would fall through to
    // the sibling-collision check, which throws because the skill itself is
    // a sibling at the destination.
    const srcIdParts = found.meta.id.split('/');
    srcIdParts.pop();
    const srcParentPath = srcIdParts.join('/');
    if (srcParentPath === destPath) {
      return { ...found.meta };
    }
    // Resolve / create the destination parent directory.
    const { dir: destParent, prefix: destPrefix } = await this.resolveSkillTargetDir(skillsRoot, destPath);
    // Reject if a sibling with the same basename already exists at the dest.
    for await (const [existing] of (destParent as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (existing.toLowerCase() === found.parentEntry.toLowerCase()) {
        throw new Error(`An entry named "${found.parentEntry}" already exists at the destination.`);
      }
    }
    // Try the File System Access API's `move(destParent)` first — it's atomic
    // and preserves the same handle. Fall back to copy+remove if the API
    // isn't available (older browsers).
    const moveable = found.meta.isFolder
      ? (found.folderHandle as FileSystemDirectoryHandle & { move?: (parent: FileSystemDirectoryHandle, newName?: string) => Promise<void> })
      : (found.fileHandle as FileSystemFileHandle & { move?: (parent: FileSystemDirectoryHandle, newName?: string) => Promise<void> });
    if (typeof moveable.move === 'function') {
      try {
        await moveable.move(destParent);
      } catch (err) {
        console.warn('[skills] handle.move() failed, falling back to copy+remove', err);
        await this.copyAndRemove(found, destParent);
      }
    } else {
      await this.copyAndRemove(found, destParent);
    }
    const newId = destPrefix ? `${destPrefix}/${found.parentEntry.replace(/\.md$/, '')}` : found.parentEntry.replace(/\.md$/, '');
    const newPath = found.meta.isFolder
      ? `${destPrefix ? `${destPrefix}/` : ''}${found.parentEntry}/SKILL.md`
      : `${destPrefix ? `${destPrefix}/` : ''}${found.parentEntry}`;
    return {
      id: newId,
      name: found.meta.name,
      description: found.meta.description,
      isFolder: found.meta.isFolder,
      path: newPath,
    };
  }

  async updateFrontmatter(id: string, frontmatter: Record<string, string>): Promise<SkillMeta> {
    const found = await this.findSkillRecord(id, 'id');
    if (!found) throw new Error(`Skill not found: ${id}`);
    // Trust the caller for everything EXCEPT `name` and `id`. `rename` is
    // the canonical entrypoint for `name` because it enforces uniqueness; the
    // on-disk `id` (the URL UUID, stamped lazily by ensureUuid) must win
    // over a stale caller-supplied map that was captured before the UUID was
    // written, otherwise an edit drops the UUID and breaks /skills/<uuid>.
    const next: Record<string, string> = { ...frontmatter, name: found.meta.name };
    if (found.frontmatter.id) next.id = found.frontmatter.id;
    await writeFile(found.fileHandle, this.serializeSkillRecord(next, found.content));
    return {
      ...found.meta,
      description: (next.description || '').trim(),
    };
  }

  private async getSkillsDir(create = false): Promise<FileSystemDirectoryHandle> {
    const root = this.perms.requireHandle();
    const assets = await root.getDirectoryHandle(GLOBAL_ASSETS_DIR, { create });
    return assets.getDirectoryHandle(SKILLS_DIR, { create });
  }

  /** Serialize a skill record. Accepts the full frontmatter map so custom
   *  keys (e.g. `version`, `author`, imported from Anthropic skill bundles)
   *  survive every save round-trip. The two required fields (`name`,
   *  `description`) are normalized first, then any other keys append in
   *  insertion order. */
  private serializeSkillRecord(frontmatter: Record<string, string>, content: string): string {
    const name = (frontmatter.name || '').trim();
    const description = (frontmatter.description || '').trim();
    const out: Record<string, string> = { name, description };
    for (const [k, v] of Object.entries(frontmatter)) {
      if (k === 'name' || k === 'description') continue;
      out[k] = v;
    }
    return serializeFrontmatter(out, content);
  }

  private async *enumerateSkillRecords(): AsyncGenerator<SkillRecord> {
    let dir: FileSystemDirectoryHandle;
    try { dir = await this.getSkillsDir(); }
    catch { return; }
    let count = 0;
    yield* this.walkSkillsRecursive(dir, '', 0, () => count++, false);
  }

  /** Recursive helper for `enumerateSkillRecords`.
   *
   *  Two scanning modes, gated by `inSkillFolder`:
   *
   *  - **Outside a skill folder** (`inSkillFolder=false`) — the normal vault
   *    walk. `.md` files with a `name:` frontmatter become single-file
   *    skills. Subdirectories containing `SKILL.md` become folder skills;
   *    subdirectories without one are category folders we recurse through.
   *
   *  - **Inside a skill folder** (`inSkillFolder=true`) — only nested skill
   *    folders are yielded. Loose `.md` files and aux subdirectories are
   *    NOT enumerated, even if they have a `name:` field, because they're
   *    references / examples of the parent skill, not standalone skills. */
  private async *walkSkillsRecursive(
    dir: FileSystemDirectoryHandle,
    relPath: string,
    depth: number,
    bump: () => number,
    inSkillFolder: boolean,
  ): AsyncGenerator<SkillRecord> {
    if (depth > SKILL_TREE_MAX_DEPTH) return;
    for await (const [entryName, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (entryName.startsWith('.')) continue;
      if (bump() >= SKILL_TREE_MAX_COUNT) return;
      const childPath = relPath ? `${relPath}/${entryName}` : entryName;

      if (entry.kind === 'file') {
        // Inside a skill folder, every loose file is aux content (referenced
        // by the parent SKILL.md). Don't promote any of them to a skill —
        // a stray `references/schema.md` with `name: schema` frontmatter
        // would otherwise pollute the prompt-visible skill list.
        if (inSkillFolder) continue;
        if (!entryName.endsWith('.md') || entryName === 'SKILL.md') continue;
        const fileHandle = entry as FileSystemFileHandle;
        try {
          const raw = await (await fileHandle.getFile()).text();
          const { meta, content } = parseFrontmatter(raw);
          const name = (meta.name || '').trim();
          const description = (meta.description || '').trim();
          if (!name) continue;
          const uuid = (meta.id || '').trim() || undefined;
          yield {
            meta: {
              id: childPath.replace(/\.md$/, ''),
              name,
              description,
              isFolder: false,
              path: childPath,
              uuid,
            },
            content,
            frontmatter: meta,
            fileHandle,
            parentDir: dir,
            parentEntry: entryName,
          };
        } catch { /* unreadable, skip */ }
        continue;
      }

      if (entry.kind === 'directory') {
        const folderHandle = entry as FileSystemDirectoryHandle;
        let skillFile: FileSystemFileHandle | null = null;
        try { skillFile = await folderHandle.getFileHandle('SKILL.md'); }
        catch { /* no SKILL.md → category folder or aux dir */ }

        if (skillFile) {
          try {
            const raw = await (await skillFile.getFile()).text();
            const { meta, content } = parseFrontmatter(raw);
            const name = (meta.name || '').trim() || entryName;
            const description = (meta.description || '').trim();
            const uuid = (meta.id || '').trim() || undefined;
            yield {
              meta: {
                id: childPath,
                name,
                description,
                isFolder: true,
                path: `${childPath}/SKILL.md`,
                uuid,
              },
              content,
              frontmatter: meta,
              fileHandle: skillFile,
              folderHandle,
              parentDir: dir,
              parentEntry: entryName,
            };
          } catch { /* unreadable, skip */ }
          // Descend INSIDE the skill folder with `inSkillFolder=true` so any
          // further `SKILL.md` underneath is picked up as a nested skill,
          // while loose .md files and aux subdirectories are ignored.
          yield* this.walkSkillsRecursive(folderHandle, childPath, depth + 1, bump, true);
          continue;
        }

        // No SKILL.md here. Inside a parent skill folder, that means this
        // is an aux subdirectory (references/, scripts/, …) — DO NOT
        // descend; everything under it is aux content. Outside a skill
        // folder, this is a category folder — recurse normally to find
        // nested skills.
        if (inSkillFolder) continue;
        yield* this.walkSkillsRecursive(folderHandle, childPath, depth + 1, bump, false);
      }
    }
  }

  /** Convenience: collect every record into an array for callers that need
   *  the full set (list, get, findSkillRecord). */
  private async listSkillRecords(): Promise<SkillRecord[]> {
    const out: SkillRecord[] = [];
    for await (const r of this.enumerateSkillRecords()) out.push(r);
    return out;
  }

  /** Walk a folder skill and return the relative paths + sizes of every file
   *  beside `SKILL.md`. Capped by SKILL_MAX_FILES / SKILL_MAX_DEPTH.
   *
   *  Subdirectories that contain their OWN `SKILL.md` are skipped — they're
   *  nested skills with their own identity, not aux content of the parent. */
  private async listSkillFolderFiles(folder: FileSystemDirectoryHandle): Promise<{ path: string; size: number }[]> {
    const out: { path: string; size: number }[] = [];
    const visit = async (
      dir: FileSystemDirectoryHandle,
      prefix: string,
      depth: number,
    ): Promise<void> => {
      if (depth > SKILL_MAX_DEPTH) return;
      for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (out.length >= SKILL_MAX_FILES) return;
        if (name.startsWith('.')) continue;
        const relPath = prefix ? `${prefix}/${name}` : name;
        if (entry.kind === 'file') {
          if (relPath === 'SKILL.md') continue;
          try {
            const f = await (entry as FileSystemFileHandle).getFile();
            out.push({ path: relPath, size: f.size });
          } catch { /* unreadable, skip */ }
        } else if (entry.kind === 'directory') {
          const subDir = entry as FileSystemDirectoryHandle;
          let hasSkill = false;
          try {
            await subDir.getFileHandle('SKILL.md');
            hasSkill = true;
          } catch { /* no nested skill, descend as aux */ }
          if (hasSkill) continue;
          await visit(subDir, relPath, depth + 1);
        }
      }
    };
    await visit(folder, '', 0);
    return out;
  }

  /** Find a single skill record by a specific identity field. UI callers
   *  (sidebar, move, rename) pass `'id'` because they own the path-shaped
   *  id; model-facing tools (`load_skill`, `read_skill_file`) pass `'name'`
   *  because the system prompt advertises skills by their frontmatter name;
   *  URL routing passes `'uuid'` because the address bar carries
   *  `/skills/<uuid>` and that survives rename / move on disk.
   *  Mixing the two could resolve the wrong skill — e.g. a folder skill at
   *  `bar/` (id="bar") colliding with another skill whose frontmatter name
   *  is "bar". */
  private async findSkillRecord(value: string, by: 'id' | 'name' | 'uuid'): Promise<SkillRecord | null> {
    for await (const r of this.enumerateSkillRecords()) {
      if (by === 'id' && r.meta.id === value) return r;
      if (by === 'name' && r.meta.name === value) return r;
      if (by === 'uuid' && r.meta.uuid && r.meta.uuid === value) return r;
    }
    return null;
  }

  /** Walk a `targetDir` like `coding/python` under `.assets/skills/`, creating
   *  intermediate directories as needed. Rejects dot-prefixed and traversal
   *  segments so a malicious `..` can't escape `.assets/skills/`. Returns the
   *  resolved directory handle and the cleaned prefix (joined back with `/`)
   *  for id composition. */
  private async resolveSkillTargetDir(
    skillsRoot: FileSystemDirectoryHandle,
    targetDir: string | undefined,
  ): Promise<{ dir: FileSystemDirectoryHandle; prefix: string }> {
    if (!targetDir || !targetDir.trim()) return { dir: skillsRoot, prefix: '' };
    const segments = targetDir.split('/').map(s => s.trim()).filter(Boolean);
    for (const s of segments) {
      if (s === '.' || s === '..' || s.startsWith('.')) {
        throw new Error(`Refusing to create skill outside .assets/skills/: ${targetDir}`);
      }
    }
    let cursor = skillsRoot;
    for (const seg of segments) {
      cursor = await cursor.getDirectoryHandle(seg, { create: true });
    }
    return { dir: cursor, prefix: segments.join('/') };
  }

  /** Write a single aux file inside a folder skill, creating any intermediate
   *  directories. Rejects traversal segments and absolute paths. */
  private async writeSkillAuxFile(
    folder: FileSystemDirectoryHandle,
    relPath: string,
    bytes: Uint8Array,
  ): Promise<void> {
    const segments = relPath.split('/').map(s => s.trim()).filter(Boolean);
    if (segments.length === 0) return;
    for (const s of segments) {
      if (s === '.' || s === '..' || s.startsWith('.')) {
        throw new Error(`Refusing to write aux file outside skill folder: ${relPath}`);
      }
    }
    if (segments[segments.length - 1] === 'SKILL.md') return; // SKILL.md handled separately
    let cursor: FileSystemDirectoryHandle = folder;
    for (let i = 0; i < segments.length - 1; i++) {
      cursor = await cursor.getDirectoryHandle(segments[i], { create: true });
    }
    const fh = await cursor.getFileHandle(segments[segments.length - 1], { create: true });
    // Cast through ArrayBufferLike → ArrayBuffer to satisfy writeFile's
    // signature (the underlying writable accepts both interchangeably).
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    await writeFile(fh, buf);
  }

  /** Fallback move for browsers without `FileSystemHandle.move(parent)`.
   *  Copies the file or folder into the destination parent, then removes
   *  the original. */
  private async copyAndRemove(found: SkillRecord, destParent: FileSystemDirectoryHandle): Promise<void> {
    if (found.meta.isFolder && found.folderHandle) {
      const newDir = await destParent.getDirectoryHandle(found.parentEntry, { create: true });
      await copyDirRecursive(found.folderHandle, newDir);
      await found.parentDir.removeEntry(found.parentEntry, { recursive: true });
    } else {
      const srcFile = await found.fileHandle.getFile();
      const newFh = await destParent.getFileHandle(found.parentEntry, { create: true });
      await writeFile(newFh, await srcFile.arrayBuffer());
      await found.parentDir.removeEntry(found.parentEntry);
    }
  }
}
