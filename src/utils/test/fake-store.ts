// In-memory NoteStore implementation for tests. Mirrors the observable
// behavior of BrowserFsStore (paths, conflict detection, history snapshots,
// templates, chats, assets) without touching the File System Access API.
//
// Tests drive it via the regular NoteStore interface; the extra `_test`
// helpers below let tests seed state, simulate conflicts/external edits, and
// stub method failures without reaching into private fields.

import type {
  NoteStore, NoteMeta, NoteFull, TreeListing, NoteRevision, SaveOptions,
  ChatMeta, ChatFull, ChatTurn, ChatEdit,
  TemplateMeta, TemplateFull, VaultStatus,
  TaskFileMeta, TaskFileFull,
  SkillMeta, SkillFull, SkillCreateSpec,
} from '@/lib/storage/types';
import { NoteConflictError } from '@/lib/storage/types';

type StoredNote = NoteFull & { size: number; mtimeMs: number };
type HistorySnapshot = { ts: string; raw: string };

export type FakeStoreOptions = {
  vaultId?: string;
  label?: string;
  ready?: boolean;
  needsPicker?: boolean;
  /** When set, calls to initialize() resolve with this status verbatim. */
  initialStatus?: VaultStatus;
};

export class FakeNoteStore implements NoteStore {
  private notes = new Map<string, StoredNote>();
  private folders = new Set<string>();
  private templates = new Map<string, TemplateFull>();
  private chats = new Map<string, ChatFull>();
  private history = new Map<string, HistorySnapshot[]>();
  private assets = new Map<string, string>(); // key: `${noteId}|${relativeUrl}`, value: blob URL

  private vaultIdValue: string;
  private labelValue: string;
  private readyValue: boolean;
  private needsPickerValue: boolean;
  private idCounter = 0;
  private clock = 1_700_000_000_000;
  private nextErrors = new Map<keyof NoteStore, Error>();
  private conflictTargets = new Set<string>();

  constructor(opts: FakeStoreOptions = {}) {
    // Default to a unique vault id so the per-vault IndexedDB snapshot cache
    // (vault-cache.ts) doesn't bleed state between tests.
    this.vaultIdValue = opts.vaultId ?? `test-vault-${++FakeNoteStore.instanceCounter}`;
    this.labelValue = opts.label ?? 'Test Vault';
    this.readyValue = opts.ready ?? true;
    this.needsPickerValue = opts.needsPicker ?? false;
  }

  private static instanceCounter = 0;

  // ---------- Test helpers (prefixed with _test to keep them off the interface)

  _test_seedNote(input: Partial<StoredNote> & { id: string; title?: string; text?: string }): StoredNote {
    const now = this.nextIso();
    const text = input.text ?? '';
    const note: StoredNote = {
      id: input.id,
      title: input.title ?? 'Untitled',
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
      text,
      size: input.size ?? text.length,
      mtimeMs: input.mtimeMs ?? this.clock,
    };
    this.notes.set(note.id, note);
    this.ensureAncestorFolders(note.id);
    return note;
  }

  _test_seedFolder(path: string): void {
    const parts = path.split('/').filter(Boolean);
    let p = '';
    for (const part of parts) {
      p = p ? `${p}/${part}` : part;
      this.folders.add(p);
    }
  }

  _test_simulateConflictOnNext(id: string): void {
    this.conflictTargets.add(id);
  }

  _test_simulateExternalEdit(id: string, body: string, title?: string): void {
    const note = this.notes.get(id);
    if (!note) throw new Error(`No such note: ${id}`);
    note.text = body;
    if (title) note.title = title;
    note.size = body.length;
    note.mtimeMs = ++this.clock;
    note.updatedAt = this.nextIso();
  }

  _test_failNext(method: keyof NoteStore, error: Error): void {
    this.nextErrors.set(method, error);
  }

  _test_setReady(ready: boolean, opts?: { needsPicker?: boolean; label?: string; vaultId?: string }): void {
    this.readyValue = ready;
    if (opts?.needsPicker !== undefined) this.needsPickerValue = opts.needsPicker;
    if (opts?.label !== undefined) this.labelValue = opts.label;
    if (opts?.vaultId !== undefined) this.vaultIdValue = opts.vaultId;
  }

  _test_snapshot() {
    return {
      notes: Array.from(this.notes.values()).map(n => ({ ...n })),
      folders: Array.from(this.folders),
      templates: Array.from(this.templates.values()).map(t => ({ ...t })),
      chats: Array.from(this.chats.values()).map(c => ({
        ...c,
        messages: [...c.messages],
        edits: [...c.edits],
      })),
    };
  }

  // ---------- Helpers

  private nextIso(): string {
    this.clock += 1;
    return new Date(this.clock).toISOString();
  }

  private nextId(): string {
    this.idCounter += 1;
    return `id-${String(this.idCounter).padStart(4, '0')}`;
  }

  private ensureAncestorFolders(notePath: string): void {
    const parts = notePath.split('/').filter(Boolean);
    parts.pop(); // drop filename
    let p = '';
    for (const part of parts) {
      p = p ? `${p}/${part}` : part;
      this.folders.add(p);
    }
  }

  private maybeThrow(method: keyof NoteStore): void {
    const err = this.nextErrors.get(method);
    if (err) {
      this.nextErrors.delete(method);
      throw err;
    }
  }

  private checkRevision(id: string, expected?: NoteRevision | null): void {
    if (this.conflictTargets.has(id)) {
      this.conflictTargets.delete(id);
      throw new NoteConflictError(id);
    }
    if (!expected) return;
    const note = this.notes.get(id);
    if (!note) return;
    if (expected.size != null && expected.size !== note.size) {
      throw new NoteConflictError(id);
    }
    if (expected.mtimeMs != null && expected.mtimeMs !== note.mtimeMs) {
      throw new NoteConflictError(id);
    }
  }

  private snapshotHistory(id: string, prevText: string, prevTitle: string): void {
    if (!this.history.has(id)) this.history.set(id, []);
    const ts = this.nextIso().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z');
    const raw = `---\ntitle: ${prevTitle}\n---\n${prevText}`;
    this.history.get(id)!.unshift({ ts, raw });
    const list = this.history.get(id)!;
    if (list.length > 50) list.length = 50;
  }

  // ---------- NoteStore implementation

  async isReady(): Promise<boolean> {
    return this.readyValue;
  }

  async initialize(): Promise<VaultStatus> {
    this.maybeThrow('initialize');
    if (this.readyValue) {
      return { ready: true, label: this.labelValue, vaultId: this.vaultIdValue };
    }
    return {
      ready: false,
      needsPicker: this.needsPickerValue,
      label: this.labelValue,
      vaultId: this.vaultIdValue,
    };
  }

  async pickDirectory(): Promise<boolean> {
    this.maybeThrow('pickDirectory');
    this.readyValue = true;
    this.needsPickerValue = false;
    return true;
  }

  async list(): Promise<TreeListing> {
    this.maybeThrow('list');
    const notes = Array.from(this.notes.values())
      .map(n => ({
        id: n.id,
        title: n.title,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        size: n.size,
        mtimeMs: n.mtimeMs,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { notes, folders: Array.from(this.folders).sort() };
  }

  async get(id: string): Promise<NoteFull | null> {
    this.maybeThrow('get');
    const note = this.notes.get(id);
    if (!note) return null;
    return {
      id: note.id,
      title: note.title,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      size: note.size,
      mtimeMs: note.mtimeMs,
      text: note.text,
    };
  }

  async create(title: string, text?: string, parentFolder?: string): Promise<NoteMeta> {
    this.maybeThrow('create');
    const folder = (parentFolder || '').trim();
    if (folder) {
      const parts = folder.split('/').filter(Boolean);
      let p = '';
      for (const part of parts) {
        p = p ? `${p}/${part}` : part;
        this.folders.add(p);
      }
    }
    const filename = `${this.nextId()}.md`;
    const id = folder ? `${folder}/${filename}` : filename;
    const now = this.nextIso();
    const body = text ?? '\n';
    const stored: StoredNote = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      text: body,
      size: body.length,
      mtimeMs: ++this.clock,
    };
    this.notes.set(id, stored);
    return { id, title, createdAt: now, updatedAt: now, size: stored.size, mtimeMs: stored.mtimeMs };
  }

  async createFolder(path: string): Promise<void> {
    this.maybeThrow('createFolder');
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) throw new Error('Folder name is required');
    let p = '';
    for (const part of parts) {
      if (part === '.' || part === '..' || /[\\:*?"<>|]/.test(part)) {
        throw new Error(`Invalid folder name: ${part}`);
      }
      p = p ? `${p}/${part}` : part;
      this.folders.add(p);
    }
  }

  async deleteFolder(path: string): Promise<void> {
    this.maybeThrow('deleteFolder');
    if (!path) throw new Error('Cannot delete the root folder');
    const prefix = `${path}/`;
    for (const id of Array.from(this.notes.keys())) {
      if (id === path || id.startsWith(prefix)) this.notes.delete(id);
    }
    for (const f of Array.from(this.folders)) {
      if (f === path || f.startsWith(prefix)) this.folders.delete(f);
    }
  }

  async saveContent(id: string, text: string, title?: string, opts?: SaveOptions): Promise<NoteMeta> {
    this.maybeThrow('saveContent');
    this.checkRevision(id, opts?.expected);
    const existing = this.notes.get(id);
    if (!existing) throw new Error(`No such note: ${id}`);
    this.snapshotHistory(id, existing.text, existing.title);
    const now = this.nextIso();
    existing.text = text;
    if (title) existing.title = title;
    existing.updatedAt = now;
    existing.size = text.length;
    existing.mtimeMs = ++this.clock;
    return {
      id,
      title: existing.title,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
      size: existing.size,
      mtimeMs: existing.mtimeMs,
    };
  }

  async rename(id: string, title: string, opts?: SaveOptions): Promise<NoteMeta> {
    this.maybeThrow('rename');
    this.checkRevision(id, opts?.expected);
    const existing = this.notes.get(id);
    if (!existing) throw new Error(`No such note: ${id}`);
    const now = this.nextIso();
    existing.title = title;
    existing.updatedAt = now;
    existing.mtimeMs = ++this.clock;
    return {
      id,
      title,
      createdAt: existing.createdAt,
      updatedAt: now,
      size: existing.size,
      mtimeMs: existing.mtimeMs,
    };
  }

  async delete(id: string): Promise<void> {
    this.maybeThrow('delete');
    this.notes.delete(id);
    this.history.delete(id);
  }

  async move(srcId: string, destFolder: string): Promise<string> {
    this.maybeThrow('move');
    const isFolder = !srcId.endsWith('.md');
    const dest = (destFolder || '').trim();
    if (dest) {
      const parts = dest.split('/').filter(Boolean);
      let p = '';
      for (const part of parts) {
        p = p ? `${p}/${part}` : part;
        this.folders.add(p);
      }
    }

    if (!isFolder) {
      const filename = srcId.includes('/') ? srcId.slice(srcId.lastIndexOf('/') + 1) : srcId;
      const newId = dest ? `${dest}/${filename}` : filename;
      if (newId === srcId) return srcId;
      const note = this.notes.get(srcId);
      if (!note) throw new Error(`No such note: ${srcId}`);
      this.notes.delete(srcId);
      note.id = newId;
      note.mtimeMs = ++this.clock;
      this.notes.set(newId, note);
      const hist = this.history.get(srcId);
      if (hist) {
        this.history.delete(srcId);
        this.history.set(newId, hist);
      }
      return newId;
    }

    const folderName = srcId.includes('/') ? srcId.slice(srcId.lastIndexOf('/') + 1) : srcId;
    const newFolderId = dest ? `${dest}/${folderName}` : folderName;
    if (newFolderId === srcId) return srcId;
    const oldPrefix = `${srcId}/`;
    const newPrefix = `${newFolderId}/`;
    // Move every descendant note
    for (const id of Array.from(this.notes.keys())) {
      if (id === srcId) continue;
      if (id.startsWith(oldPrefix)) {
        const note = this.notes.get(id)!;
        const remapped = `${newFolderId}${id.slice(srcId.length)}`;
        this.notes.delete(id);
        note.id = remapped;
        note.mtimeMs = ++this.clock;
        this.notes.set(remapped, note);
        const hist = this.history.get(id);
        if (hist) {
          this.history.delete(id);
          this.history.set(remapped, hist);
        }
      }
    }
    // Move folders
    for (const f of Array.from(this.folders)) {
      if (f === srcId) {
        this.folders.delete(f);
        this.folders.add(newFolderId);
      } else if (f.startsWith(oldPrefix)) {
        this.folders.delete(f);
        this.folders.add(`${newPrefix}${f.slice(oldPrefix.length)}`);
      }
    }
    return newFolderId;
  }

  async renameFolder(oldPath: string, newName: string): Promise<string> {
    this.maybeThrow('renameFolder');
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Folder name is required');
    if (/[\\/:*?"<>|]/.test(trimmed)) throw new Error(`Invalid folder name: ${trimmed}`);
    const parts = oldPath.split('/').filter(Boolean);
    parts.pop();
    const newPath = parts.length ? `${parts.join('/')}/${trimmed}` : trimmed;
    if (newPath === oldPath) return oldPath;
    if (this.folders.has(newPath)) throw new Error(`Folder already exists: ${newPath}`);
    return this.move(oldPath, parts.join('/'))
      .then(async () => {
        // `move()` would have produced `${parents}/${oldFolderName}` as the new id. We
        // actually wanted a renamed folder, so do a second pass to rename it.
        const intermediate = parts.length ? `${parts.join('/')}/${oldPath.slice(oldPath.lastIndexOf('/') + 1)}` : oldPath.slice(oldPath.lastIndexOf('/') + 1);
        if (intermediate === newPath) return newPath;
        // Rewire descendants under intermediate → newPath
        const intermediatePrefix = `${intermediate}/`;
        for (const id of Array.from(this.notes.keys())) {
          if (id.startsWith(intermediatePrefix)) {
            const note = this.notes.get(id)!;
            const remapped = `${newPath}${id.slice(intermediate.length)}`;
            this.notes.delete(id);
            note.id = remapped;
            this.notes.set(remapped, note);
            const hist = this.history.get(id);
            if (hist) {
              this.history.delete(id);
              this.history.set(remapped, hist);
            }
          }
        }
        for (const f of Array.from(this.folders)) {
          if (f === intermediate) {
            this.folders.delete(f);
            this.folders.add(newPath);
          } else if (f.startsWith(intermediatePrefix)) {
            this.folders.delete(f);
            this.folders.add(`${newPath}${f.slice(intermediate.length)}`);
          }
        }
        return newPath;
      });
  }

  async uploadAsset(id: string, file: File): Promise<string> {
    this.maybeThrow('uploadAsset');
    const filename = `asset-${this.nextId()}-${file.name}`;
    const url = `./${filename}`;
    const blobUrl = `blob:fake:${filename}`;
    this.assets.set(`${id}|${url}`, blobUrl);
    return url;
  }

  async preloadAssets(): Promise<void> {
    // No-op in tests — callers must seed assets via `uploadAsset` if needed.
  }

  getAssetUrl(noteId: string, relativeUrl: string): string {
    return this.assets.get(`${noteId}|${relativeUrl}`) ?? relativeUrl;
  }

  async getAssetBytes(): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    return null;
  }

  async findNoteByUuid(uuid: string): Promise<NoteMeta | null> {
    for (const note of Array.from(this.notes.values())) {
      if ((note as { uuid?: string }).uuid === uuid) {
        return {
          id: note.id,
          title: note.title,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          size: note.size,
          mtimeMs: note.mtimeMs,
        };
      }
    }
    return null;
  }

  async uploadChatAsset(): Promise<{ url: string; mimeType: string; size: number }> {
    return { url: `./chat-asset-${this.nextId()}`, mimeType: 'application/octet-stream', size: 0 };
  }

  async getChatAssetBytes(): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    return null;
  }

  async listHistory(id: string): Promise<string[]> {
    this.maybeThrow('listHistory');
    const list = this.history.get(id) ?? [];
    return list.map(h => h.ts);
  }

  async getHistoryVersion(id: string, ts: string): Promise<string | null> {
    this.maybeThrow('getHistoryVersion');
    const list = this.history.get(id) ?? [];
    const found = list.find(h => h.ts === ts);
    return found ? found.raw : null;
  }

  async listHistoryByUuid(uuid: string): Promise<string[]> {
    this.maybeThrow('listHistoryByUuid');
    for (const note of Array.from(this.notes.values())) {
      if ((note as { uuid?: string }).uuid === uuid) {
        return this.listHistory(note.id);
      }
    }
    return [];
  }

  async getHistoryVersionByUuid(uuid: string, ts: string): Promise<string | null> {
    this.maybeThrow('getHistoryVersionByUuid');
    for (const note of Array.from(this.notes.values())) {
      if ((note as { uuid?: string }).uuid === uuid) {
        return this.getHistoryVersion(note.id, ts);
      }
    }
    return null;
  }

  async recoverNote(
    id: string,
    body: string,
    opts: { uuid: string; title: string; createdAt?: string },
  ): Promise<NoteMeta> {
    this.maybeThrow('recoverNote');
    const now = this.nextIso();
    const createdAt = opts.createdAt || now;
    const stored: StoredNote & { uuid: string } = {
      id,
      title: opts.title,
      uuid: opts.uuid,
      createdAt,
      updatedAt: now,
      text: body,
      size: body.length,
      mtimeMs: ++this.clock,
    };
    this.notes.set(id, stored);
    return {
      id,
      title: opts.title,
      uuid: opts.uuid,
      createdAt,
      updatedAt: now,
      size: stored.size,
      mtimeMs: stored.mtimeMs,
    };
  }

  // ---------- Templates

  async listTemplates(): Promise<TemplateMeta[]> {
    this.maybeThrow('listTemplates');
    return Array.from(this.templates.values()).map(t => ({ id: t.id, name: t.name }));
  }

  async getTemplate(id: string): Promise<TemplateFull | null> {
    this.maybeThrow('getTemplate');
    const t = this.templates.get(id);
    return t ? { ...t } : null;
  }

  async createTemplate(name: string, content: string): Promise<TemplateMeta> {
    this.maybeThrow('createTemplate');
    const id = name; // BrowserFsStore uses the filename-as-id; a name collision is the user's problem
    if (this.templates.has(id)) throw new Error(`Template already exists: ${name}`);
    this.templates.set(id, { id, name, content });
    return { id, name };
  }

  async saveTemplate(id: string, content: string): Promise<void> {
    this.maybeThrow('saveTemplate');
    const t = this.templates.get(id);
    if (!t) throw new Error(`No such template: ${id}`);
    t.content = content;
  }

  async deleteTemplate(id: string): Promise<void> {
    this.maybeThrow('deleteTemplate');
    this.templates.delete(id);
  }

  async renameTemplate(id: string, newName: string): Promise<TemplateMeta> {
    this.maybeThrow('renameTemplate');
    const t = this.templates.get(id);
    if (!t) throw new Error(`No such template: ${id}`);
    if (newName !== id && this.templates.has(newName)) {
      throw new Error(`Template already exists: ${newName}`);
    }
    this.templates.delete(id);
    const renamed: TemplateFull = { id: newName, name: newName, content: t.content };
    this.templates.set(newName, renamed);
    return { id: renamed.id, name: renamed.name };
  }

  // ---------- Skills
  private skills = new Map<string, SkillFull>();

  /** Project a `SkillFull` (in-memory full record) down to the lean
   *  `SkillMeta` surface that the store API returns. Avoids the destructured
   *  `_files`/`_content`/`_frontmatter` strip pattern (which `no-unused-vars`
   *  rejects). */
  private skillMetaFrom(s: SkillFull): SkillMeta {
    return { id: s.id, name: s.name, description: s.description, isFolder: s.isFolder, path: s.path };
  }

  async listSkills(): Promise<SkillMeta[]> {
    this.maybeThrow('listSkills');
    return Array.from(this.skills.values()).map(s => this.skillMetaFrom(s));
  }

  async getSkill(id: string): Promise<SkillFull | null> {
    this.maybeThrow('getSkill');
    const s = this.skills.get(id);
    return s ? { ...s, files: [...s.files] } : null;
  }

  async getSkillByName(name: string): Promise<SkillFull | null> {
    this.maybeThrow('getSkillByName');
    for (const s of Array.from(this.skills.values())) {
      if (s.name === name) return { ...s, files: [...s.files] };
    }
    return null;
  }

  async getSkillByUuid(uuid: string): Promise<SkillFull | null> {
    this.maybeThrow('getSkillByUuid');
    for (const s of Array.from(this.skills.values())) {
      if (s.uuid && s.uuid === uuid) return { ...s, files: [...s.files] };
    }
    return null;
  }

  async ensureSkillUuid(id: string): Promise<string> {
    this.maybeThrow('ensureSkillUuid');
    const s = this.skills.get(id);
    if (!s) throw new Error(`No such skill: ${id}`);
    if (s.uuid) return s.uuid;
    const uuid = `uuid-${Math.random().toString(36).slice(2, 10)}`;
    s.uuid = uuid;
    s.frontmatter = { ...s.frontmatter, id: uuid };
    return uuid;
  }

  async readSkillFile(id: string, relPath: string): Promise<{ text: string; size: number } | null> {
    this.maybeThrow('readSkillFile');
    void id; void relPath;
    return null;
  }

  async createSkill(spec: SkillCreateSpec): Promise<SkillMeta> {
    this.maybeThrow('createSkill');
    const name = spec.name.trim();
    if (!name) throw new Error('Skill name is required.');
    if (Array.from(this.skills.values()).some(s => s.name === name)) {
      throw new Error(`A skill named "${name}" already exists.`);
    }
    const id = name;
    // Mirror BrowserFsStore: folder layout is implied by aux files OR by
    // an explicit `forceFolder` (parent skill that has nested children).
    const isFolder = (spec.files?.length ?? 0) > 0 || spec.forceFolder === true;
    const meta: SkillFull = {
      id,
      name,
      description: spec.description,
      content: spec.content,
      isFolder,
      path: isFolder ? `${id}/SKILL.md` : `${id}.md`,
      files: (spec.files || []).map(f => ({ path: f.path, size: f.bytes.length })),
      // Match the BrowserFsStore behaviour: any caller-supplied frontmatter
      // is preserved, with `name` / `description` from the explicit fields
      // overlaid on top so a stale duplicate key can't shadow them.
      frontmatter: { ...spec.frontmatter, name, description: spec.description },
    };
    this.skills.set(id, meta);
    return this.skillMetaFrom(meta);
  }

  async saveSkill(id: string, content: string): Promise<void> {
    this.maybeThrow('saveSkill');
    const s = this.skills.get(id);
    if (!s) throw new Error(`No such skill: ${id}`);
    s.content = content;
  }

  async deleteSkill(id: string): Promise<void> {
    this.maybeThrow('deleteSkill');
    this.skills.delete(id);
  }

  async renameSkill(id: string, newName: string): Promise<SkillMeta> {
    this.maybeThrow('renameSkill');
    const s = this.skills.get(id);
    if (!s) throw new Error(`No such skill: ${id}`);
    s.name = newName;
    return this.skillMetaFrom(s);
  }

  async updateSkillDescription(id: string, description: string): Promise<SkillMeta> {
    this.maybeThrow('updateSkillDescription');
    const s = this.skills.get(id);
    if (!s) throw new Error(`No such skill: ${id}`);
    s.description = description;
    s.frontmatter = { ...s.frontmatter, description };
    return this.skillMetaFrom(s);
  }

  async updateSkillFrontmatter(id: string, frontmatter: Record<string, string>): Promise<SkillMeta> {
    this.maybeThrow('updateSkillFrontmatter');
    const s = this.skills.get(id);
    if (!s) throw new Error(`No such skill: ${id}`);
    s.frontmatter = { ...frontmatter, name: s.name };
    s.description = (frontmatter.description || '').trim();
    return this.skillMetaFrom(s);
  }

  async moveSkill(id: string, destDir: string): Promise<SkillMeta> {
    this.maybeThrow('moveSkill');
    const s = this.skills.get(id);
    if (!s) throw new Error(`No such skill: ${id}`);
    const dest = destDir.replace(/^\/+|\/+$/g, '');
    if (s.isFolder && (dest === s.id || dest.startsWith(`${s.id}/`))) {
      throw new Error('Cannot move a folder skill into one of its own descendants.');
    }
    const basename = s.id.split('/').pop()!;
    const newId = dest ? `${dest}/${basename}` : basename;
    if (newId !== s.id && this.skills.has(newId)) {
      throw new Error(`An entry named "${basename}" already exists at the destination.`);
    }
    this.skills.delete(id);
    const moved: SkillFull = { ...s, id: newId, path: s.isFolder ? `${newId}/SKILL.md` : `${newId}.md` };
    this.skills.set(newId, moved);
    return this.skillMetaFrom(moved);
  }

  // ---------- Chats

  private chatMeta(c: ChatFull): ChatMeta {
    return {
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      noteId: c.noteId,
      noteUuid: c.noteUuid,
      provider: c.provider,
      model: c.model,
    };
  }

  async listChats(filter?: { noteId?: string; noteUuid?: string }): Promise<ChatMeta[]> {
    this.maybeThrow('listChats');
    const list = Array.from(this.chats.values());
    return list
      .filter(c => {
        if (!filter) return true;
        if (filter.noteUuid && c.noteUuid === filter.noteUuid) return true;
        if (filter.noteId && c.noteId === filter.noteId) return true;
        return !filter.noteId && !filter.noteUuid;
      })
      .map(c => this.chatMeta(c))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getChat(chatId: string): Promise<ChatFull | null> {
    this.maybeThrow('getChat');
    const c = this.chats.get(chatId);
    return c ? { ...c, messages: [...c.messages], edits: [...c.edits] } : null;
  }

  async createChat(opts: { noteId?: string; noteUuid?: string; title?: string; provider?: string; model?: string }): Promise<ChatMeta> {
    this.maybeThrow('createChat');
    const id = `chat-${this.nextId()}`;
    const now = this.nextIso();
    const chat: ChatFull = {
      id,
      title: opts.title ?? 'Untitled chat',
      createdAt: now,
      updatedAt: now,
      noteId: opts.noteId,
      noteUuid: opts.noteUuid,
      provider: opts.provider,
      model: opts.model,
      messages: [],
      edits: [],
    };
    this.chats.set(id, chat);
    return this.chatMeta(chat);
  }

  async saveChatMessages(
    chatId: string,
    messages: ChatTurn[],
    opts?: { title?: string; provider?: string; model?: string; edits?: ChatEdit[] },
  ): Promise<ChatMeta> {
    this.maybeThrow('saveChatMessages');
    const chat = this.chats.get(chatId);
    if (!chat) throw new Error(`No such chat: ${chatId}`);
    chat.messages = [...messages];
    if (opts?.edits) chat.edits = [...opts.edits];
    if (opts?.title) chat.title = opts.title;
    if (opts?.provider) chat.provider = opts.provider;
    if (opts?.model) chat.model = opts.model;
    chat.updatedAt = this.nextIso();
    return this.chatMeta(chat);
  }

  async deleteChat(chatId: string): Promise<void> {
    this.maybeThrow('deleteChat');
    this.chats.delete(chatId);
  }

  async clearAllChats(): Promise<void> {
    this.maybeThrow('clearAllChats');
    this.chats.clear();
  }

  async promoteChatToNote(chatId: string, folder?: string): Promise<NoteMeta> {
    this.maybeThrow('promoteChatToNote');
    const chat = this.chats.get(chatId);
    if (!chat) throw new Error(`No such chat: ${chatId}`);
    const body = chat.messages
      .map(m => `## ${m.role}\n\n${m.content}`)
      .join('\n\n');
    return this.create(chat.title, body, folder);
  }

  // --- Tasks (.assets/tasks/) ---
  // Mirrors BrowserFsStore's behaviour for unit tests that touch task storage.

  private taskFiles = new Map<string, { raw: string; size: number; mtimeMs: number }>();

  async listTaskFiles(): Promise<TaskFileMeta[]> {
    this.maybeThrow('listTaskFiles');
    return Array.from(this.taskFiles.entries()).map(([path, entry]) => ({
      path, size: entry.size, mtimeMs: entry.mtimeMs,
    }));
  }

  async readTaskFile(path: string): Promise<TaskFileFull | null> {
    this.maybeThrow('readTaskFile');
    const entry = this.taskFiles.get(path);
    if (!entry) return null;
    return { path, raw: entry.raw, size: entry.size, mtimeMs: entry.mtimeMs };
  }

  async createTaskFile(desiredBasename: string, raw: string): Promise<TaskFileMeta> {
    this.maybeThrow('createTaskFile');
    const base = (desiredBasename || 'task').replace(/\.md$/i, '');
    let candidate = `${base}.md`;
    let i = 1;
    while (this.taskFiles.has(candidate)) {
      candidate = `${base} ${i}.md`;
      i += 1;
    }
    const entry = { raw, size: new TextEncoder().encode(raw).byteLength, mtimeMs: Date.now() };
    this.taskFiles.set(candidate, entry);
    return { path: candidate, size: entry.size, mtimeMs: entry.mtimeMs };
  }

  async writeTaskFile(path: string, raw: string): Promise<TaskFileMeta> {
    this.maybeThrow('writeTaskFile');
    if (!this.taskFiles.has(path)) throw new Error(`task not found: ${path}`);
    const entry = { raw, size: new TextEncoder().encode(raw).byteLength, mtimeMs: Date.now() };
    this.taskFiles.set(path, entry);
    return { path, size: entry.size, mtimeMs: entry.mtimeMs };
  }

  async deleteTaskFile(path: string): Promise<void> {
    this.maybeThrow('deleteTaskFile');
    this.taskFiles.delete(path);
  }

  async taskFileExists(path: string): Promise<boolean> {
    this.maybeThrow('taskFileExists');
    return this.taskFiles.has(path);
  }

  private taskArchive = new Map<string, Map<string, string>>();

  async writeTaskArchive(taskUuid: string, instanceDate: string, raw: string): Promise<void> {
    this.maybeThrow('writeTaskArchive');
    let bucket = this.taskArchive.get(taskUuid);
    if (!bucket) {
      bucket = new Map();
      this.taskArchive.set(taskUuid, bucket);
    }
    bucket.set(instanceDate, raw);
  }

  async readTaskArchive(taskUuid: string, instanceDate: string): Promise<string | null> {
    this.maybeThrow('readTaskArchive');
    return this.taskArchive.get(taskUuid)?.get(instanceDate) ?? null;
  }

  async listTaskArchive(taskUuid: string): Promise<string[]> {
    this.maybeThrow('listTaskArchive');
    const bucket = this.taskArchive.get(taskUuid);
    if (!bucket) return [];
    return Array.from(bucket.keys()).sort();
  }
}
