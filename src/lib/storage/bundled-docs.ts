/* eslint-disable @typescript-eslint/no-unused-vars */
// In-memory NoteStore that serves the bundled user manual at docs/<locale>/.
// Used as the default vault on first launch so a brand-new user lands inside
// the documentation rendered through the regular vault UI (file tree, editor,
// search) instead of a blank folder picker.
//
// Edits are kept in memory only — they live for the session and reset on
// reload. There is no persistence layer here on purpose: the goal is for the
// docs to *feel* like a real vault while the user is exploring, without
// silently overwriting the bundled source on disk or polluting the user's
// real filesystem.

import {
  parseFrontmatter,
  serializeFrontmatter,
  generateNoteId,
} from '@/lib/frontmatter';
import { NoteConflictError } from './types';
import type {
  NoteStore, NoteMeta, NoteFull, TreeListing, SaveOptions, VaultStatus,
  ChatMeta, ChatFull, ChatTurn, ChatEdit,
  TaskFileMeta, TaskFileFull, TemplateMeta, TemplateFull,
  SkillMeta, SkillFull, SkillCreateSpec,
} from './types';
import { BUILTIN_DOCS_VAULT_PREFIX, type DocsLocale } from './bundled-docs-id';

export { isBundledDocsVaultId } from './bundled-docs-id';

/** Shape of `/public/docs-bundle/<locale>.json`. `notes` is the flat path →
 *  raw-markdown map; `skills` is pre-parsed out of `.assets/skills/` at build
 *  time so the in-memory store can serve listSkills / getSkill / readSkillFile
 *  without a second HTTP round-trip; `templates` is the same idea for
 *  `.assets/templates/`. See scripts/build-docs-bundle.mjs. */
export type BundledDocsManifest = {
  notes: Record<string, string>;
  skills?: BundledSkill[];
  templates?: BundledTemplate[];
};

/** One pre-parsed template entry in the manifest. Body is preserved verbatim
 *  (template-variable interpolation happens at usage time, not build time). */
export interface BundledTemplate {
  id: string;
  name: string;
  content: string;
}

/** One skill entry in the manifest. Matches SkillFull shape minus the
 *  `frontmatter` keys that need to be string-typed for SkillMeta, but
 *  includes the full frontmatter map and inlined aux file contents so the
 *  store can satisfy every read path. */
export interface BundledSkill {
  id: string;
  name: string;
  description: string;
  uuid?: string;
  isFolder: boolean;
  path: string;
  content: string;
  frontmatter: Record<string, string>;
  /** Folder-skill aux files keyed by path relative to the skill folder.
   *  Undefined / empty for single-file skills. */
  files?: Record<string, { size: number; raw: string }>;
}

interface FileEntry {
  raw: string;
  size: number;
  mtimeMs: number;
}

function deriveFolders(paths: ReadonlyArray<string>): Set<string> {
  const folders = new Set<string>();
  paths.forEach((p) => {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) {
      folders.add(parts.slice(0, i).join('/'));
    }
  });
  return folders;
}

// Frontmatter-derived fields only. The store stamps `size`/`mtimeMs` from the
// actual entry — building those here from `raw.length` would diverge from the
// entry's stored mtimeMs and cause every save to throw NoteConflictError.
function metaFromRaw(id: string, raw: string): Omit<NoteMeta, 'size' | 'mtimeMs'> {
  const { meta } = parseFrontmatter(raw);
  const filenameTitle = id.split('/').pop()!.replace(/\.md$/, '').replace(/[-_]/g, ' ');
  const now = new Date().toISOString();
  return {
    id,
    title: meta.title || filenameTitle || 'Untitled',
    createdAt: meta.createdAt || now,
    updatedAt: meta.updatedAt || now,
    uuid: meta.id,
  };
}

function noteMeta(id: string, entry: FileEntry): NoteMeta {
  return { ...metaFromRaw(id, entry.raw), size: entry.size, mtimeMs: entry.mtimeMs };
}

export class BundledDocsStore implements NoteStore {
  private readonly locale: DocsLocale;
  private readonly files = new Map<string, FileEntry>();
  private readonly folders = new Set<string>();
  private readonly templates = new Map<string, TemplateFull>();
  private readonly chats = new Map<string, ChatFull>();
  private readonly taskFiles = new Map<string, { raw: string; size: number; mtimeMs: number }>();
  private readonly taskArchive = new Map<string, Map<string, string>>();
  private readonly assetUrls = new Map<string, string>();
  private readonly chatAssetUrls = new Map<string, { url: string; mimeType: string; size: number }>();
  private readonly history = new Map<string, Map<string, string>>(); // id -> ts -> raw
  private readonly historyByUuid = new Map<string, Map<string, string>>();
  private readonly skills = new Map<string, BundledSkill>(); // keyed by id

  // The manifest is fetched at runtime by `loadBundledDocsStore` from
  // /public/docs-bundle/<locale>.json so the docs payload never reaches
  // the server bundle and isn't parsed when the user already has a vault.
  constructor(locale: DocsLocale, manifest: BundledDocsManifest) {
    this.locale = locale;
    Object.entries(manifest.notes).forEach(([path, raw]) => {
      this.files.set(path, { raw, size: raw.length, mtimeMs: Date.now() });
    });
    deriveFolders(Array.from(this.files.keys())).forEach(f => this.folders.add(f));
    (manifest.skills ?? []).forEach(skill => {
      this.skills.set(skill.id, skill);
    });
    (manifest.templates ?? []).forEach(tpl => {
      // Reuse the existing templates Map — seeded templates round-trip
      // through the same in-memory CRUD as user-created ones, so the
      // session-only edit semantics work identically.
      this.templates.set(tpl.id, { id: tpl.id, name: tpl.name, content: tpl.content });
    });
  }

  // --- Lifecycle -----------------------------------------------------------

  async isReady(): Promise<boolean> {
    return true;
  }

  async initialize(): Promise<VaultStatus> {
    return {
      ready: true,
      vaultId: `${BUILTIN_DOCS_VAULT_PREFIX}${this.locale}`,
      label: 'Documentation',
    };
  }

  async pickDirectory(): Promise<boolean> {
    return false;
  }

  // --- Reads ---------------------------------------------------------------

  async list(): Promise<TreeListing> {
    const notes: NoteMeta[] = [];
    this.files.forEach((entry, id) => {
      notes.push(noteMeta(id, entry));
    });
    notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const folders = Array.from(this.folders).sort();
    return { notes, folders };
  }

  async get(id: string): Promise<NoteFull | null> {
    let entry = this.files.get(id);
    if (!entry) return null;
    let parsed = parseFrontmatter(entry.raw);
    if (!parsed.meta.id) {
      // Backfill a UUID so chats / cross-refs can anchor stably even in docs.
      const uuid = generateNoteId();
      const now = new Date().toISOString();
      const meta = {
        id: uuid,
        title: parsed.meta.title || id.split('/').pop()!.replace(/\.md$/, ''),
        createdAt: parsed.meta.createdAt || now,
        updatedAt: parsed.meta.updatedAt || now,
        ...parsed.meta,
      };
      const raw = serializeFrontmatter(meta, parsed.content);
      entry = { raw, size: raw.length, mtimeMs: entry.mtimeMs };
      this.files.set(id, entry);
      parsed = parseFrontmatter(raw);
    }
    // The editor expects the body without the YAML frontmatter — same shape
    // BrowserFsStore.get() returns. Returning the raw text would render the
    // YAML block as a setext heading.
    return { ...noteMeta(id, entry), text: parsed.content };
  }

  async findNoteByUuid(uuid: string): Promise<NoteMeta | null> {
    let match: NoteMeta | null = null;
    this.files.forEach((entry, id) => {
      if (match) return;
      const { meta } = parseFrontmatter(entry.raw);
      if (meta.id === uuid) match = noteMeta(id, entry);
    });
    return match;
  }

  // --- Writes (in-memory) --------------------------------------------------

  async create(title: string, text?: string, parentFolder?: string): Promise<NoteMeta> {
    const folder = (parentFolder || '').replace(/^\/+|\/+$/g, '');
    const safeTitle = (title || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled';
    const baseId = folder ? `${folder}/${safeTitle}.md` : `${safeTitle}.md`;
    let id = baseId;
    let n = 1;
    while (this.files.has(id)) {
      id = folder ? `${folder}/${safeTitle} ${++n}.md` : `${safeTitle} ${++n}.md`;
    }
    const now = new Date().toISOString();
    const meta = { id: generateNoteId(), title: safeTitle, createdAt: now, updatedAt: now };
    const raw = serializeFrontmatter(meta, text || '');
    const entry: FileEntry = { raw, size: raw.length, mtimeMs: Date.now() };
    this.files.set(id, entry);
    if (folder) {
      deriveFolders([id]).forEach(f => this.folders.add(f));
    }
    return noteMeta(id, entry);
  }

  async createFolder(p: string): Promise<void> {
    const clean = p.replace(/^\/+|\/+$/g, '');
    if (!clean) return;
    this.folders.add(clean);
    deriveFolders([`${clean}/.placeholder`]).forEach(f => this.folders.add(f));
  }

  async deleteFolder(p: string): Promise<void> {
    const clean = p.replace(/^\/+|\/+$/g, '');
    if (!clean) return;
    const prefix = `${clean}/`;
    Array.from(this.files.keys()).forEach((id) => {
      if (id === clean || id.startsWith(prefix)) this.files.delete(id);
    });
    Array.from(this.folders).forEach((f) => {
      if (f === clean || f.startsWith(prefix)) this.folders.delete(f);
    });
  }

  async move(srcId: string, destFolder: string): Promise<string> {
    const dest = (destFolder || '').replace(/^\/+|\/+$/g, '');
    if (this.files.has(srcId)) {
      const filename = srcId.split('/').pop()!;
      const newId = dest ? `${dest}/${filename}` : filename;
      if (newId === srcId) return srcId;
      const entry = this.files.get(srcId)!;
      this.files.delete(srcId);
      this.files.set(newId, entry);
      deriveFolders([newId]).forEach(f => this.folders.add(f));
      return newId;
    }
    // Folder move
    const folderName = srcId.split('/').pop()!;
    const newPrefix = dest ? `${dest}/${folderName}` : folderName;
    const oldPrefix = `${srcId}/`;
    Array.from(this.files.entries()).forEach(([id, entry]) => {
      if (id === srcId || id.startsWith(oldPrefix)) {
        const tail = id === srcId ? '' : id.slice(oldPrefix.length);
        const next = tail ? `${newPrefix}/${tail}` : newPrefix;
        this.files.delete(id);
        this.files.set(next, entry);
      }
    });
    Array.from(this.folders).forEach((f) => {
      if (f === srcId) this.folders.delete(f);
      else if (f.startsWith(oldPrefix)) {
        this.folders.delete(f);
        this.folders.add(`${newPrefix}/${f.slice(oldPrefix.length)}`);
      }
    });
    this.folders.add(newPrefix);
    return newPrefix;
  }

  async renameFolder(oldPath: string, newName: string): Promise<string> {
    const oldClean = oldPath.replace(/^\/+|\/+$/g, '');
    const parent = oldClean.includes('/') ? oldClean.slice(0, oldClean.lastIndexOf('/')) : '';
    const safeName = newName.replace(/[\\/:*?"<>|]+/g, ' ').trim();
    const newPath = parent ? `${parent}/${safeName}` : safeName;
    if (newPath === oldClean) return oldClean;
    const oldPrefix = `${oldClean}/`;
    Array.from(this.files.entries()).forEach(([id, entry]) => {
      if (id.startsWith(oldPrefix)) {
        this.files.delete(id);
        this.files.set(`${newPath}/${id.slice(oldPrefix.length)}`, entry);
      }
    });
    Array.from(this.folders).forEach((f) => {
      if (f === oldClean) this.folders.delete(f);
      else if (f.startsWith(oldPrefix)) {
        this.folders.delete(f);
        this.folders.add(`${newPath}/${f.slice(oldPrefix.length)}`);
      }
    });
    this.folders.add(newPath);
    return newPath;
  }

  async saveContent(id: string, text: string, title?: string, opts?: SaveOptions): Promise<NoteMeta> {
    const existing = this.files.get(id);
    if (opts?.expected && existing) {
      if (opts.expected.size != null && opts.expected.size !== existing.size) {
        throw new NoteConflictError(id);
      }
      if (opts.expected.mtimeMs != null && opts.expected.mtimeMs !== existing.mtimeMs) {
        throw new NoteConflictError(id);
      }
    }
    // `text` is the editor body without frontmatter (matches the BrowserFsStore
    // contract). Re-fuse it with the existing frontmatter so saving a doc
    // doesn't accidentally strip its YAML.
    const prevMeta = existing ? parseFrontmatter(existing.raw).meta : {};
    const meta = { ...prevMeta };
    if (title) meta.title = title;
    meta.updatedAt = new Date().toISOString();
    const raw = Object.keys(meta).length > 0 ? serializeFrontmatter(meta, text) : text;
    const entry: FileEntry = { raw, size: raw.length, mtimeMs: Date.now() };
    this.files.set(id, entry);
    return noteMeta(id, entry);
  }

  async rename(id: string, title: string, _opts?: SaveOptions): Promise<NoteMeta> {
    const entry = this.files.get(id);
    if (!entry) throw new Error(`Cannot rename missing note ${id}`);
    const safeTitle = (title || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled';
    const dirParts = id.split('/');
    dirParts.pop();
    const dir = dirParts.join('/');
    const newId = dir ? `${dir}/${safeTitle}.md` : `${safeTitle}.md`;
    if (newId !== id && this.files.has(newId)) {
      throw new Error(`A note named "${safeTitle}" already exists in that folder.`);
    }
    const parsed = parseFrontmatter(entry.raw);
    const meta = { ...parsed.meta, title: safeTitle, updatedAt: new Date().toISOString() };
    const raw = serializeFrontmatter(meta, parsed.content);
    if (newId !== id) this.files.delete(id);
    const next: FileEntry = { raw, size: raw.length, mtimeMs: Date.now() };
    this.files.set(newId, next);
    return noteMeta(newId, next);
  }

  async delete(id: string): Promise<void> {
    this.files.delete(id);
  }

  async recoverNote(
    id: string,
    body: string,
    opts: { uuid: string; title: string; createdAt?: string },
  ): Promise<NoteMeta> {
    const now = new Date().toISOString();
    const meta = {
      id: opts.uuid,
      title: opts.title,
      createdAt: opts.createdAt || now,
      updatedAt: now,
    };
    const raw = serializeFrontmatter(meta, body);
    const entry: FileEntry = { raw, size: raw.length, mtimeMs: Date.now() };
    this.files.set(id, entry);
    deriveFolders([id]).forEach(f => this.folders.add(f));
    return noteMeta(id, entry);
  }

  // --- Assets --------------------------------------------------------------

  async uploadAsset(noteId: string, file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const rel = `.assets/${generateNoteId()}.${ext}`;
    this.assetUrls.set(`${noteId}::${rel}`, url);
    this.assetUrls.set(rel, url); // also resolvable by absolute relative path
    return rel;
  }

  async preloadAssets(_noteId: string, _markdown: string): Promise<void> {
    // No-op: bundled assets live at /docs-bundle/<locale>/.assets/... and
    // resolve synchronously through getAssetUrl(). The browser caches the
    // HTTP responses; there's no blob URL to materialize ahead of time.
  }

  getAssetUrl(noteId: string, relativeUrl: string): string {
    // Runtime-attached uploads (uploadAsset) take precedence so editor
    // pastes preview instantly without round-tripping through the network.
    const cached = this.assetUrls.get(`${noteId}::${relativeUrl}`)
      ?? this.assetUrls.get(relativeUrl);
    if (cached) return cached;
    if (/^(https?:|data:|blob:)/i.test(relativeUrl)) return relativeUrl;
    return `/docs-bundle/${this.locale}/${relativeUrl.replace(/^\.\//, '')}`;
  }

  async getAssetBytes(_noteId: string, relativeUrl: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    // Used by the AI image flow and by export-to-real-vault. External URLs
    // aren't ours to materialize; let the caller handle them.
    if (/^(https?:|data:|blob:)/i.test(relativeUrl)) return null;
    const url = `/docs-bundle/${this.locale}/${relativeUrl.replace(/^\.\//, '')}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const mimeType = res.headers.get('content-type') || 'application/octet-stream';
      return { bytes: new Uint8Array(buf), mimeType };
    } catch {
      return null;
    }
  }

  async uploadChatAsset(chatId: string, file: File): Promise<{ url: string; mimeType: string; size: number }> {
    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const rel = `.assets/chat-files/${chatId}/${generateNoteId()}.${ext}`;
    const record = { url: rel, mimeType: file.type || 'application/octet-stream', size: file.size };
    this.chatAssetUrls.set(rel, { url, mimeType: record.mimeType, size: record.size });
    return record;
  }

  async getChatAssetBytes(_chatId: string, _relativeUrl: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    return null;
  }

  // --- History (in-memory; no real history for bundled docs) ---------------

  async listHistory(id: string): Promise<string[]> {
    const map = this.history.get(id);
    return map ? Array.from(map.keys()).sort().reverse() : [];
  }

  async getHistoryVersion(id: string, ts: string): Promise<string | null> {
    return this.history.get(id)?.get(ts) ?? null;
  }

  async listHistoryByUuid(uuid: string): Promise<string[]> {
    const map = this.historyByUuid.get(uuid);
    return map ? Array.from(map.keys()).sort().reverse() : [];
  }

  async getHistoryVersionByUuid(uuid: string, ts: string): Promise<string | null> {
    return this.historyByUuid.get(uuid)?.get(ts) ?? null;
  }

  // --- Templates -----------------------------------------------------------

  async listTemplates(): Promise<TemplateMeta[]> {
    return Array.from(this.templates.values()).map(({ id, name }) => ({ id, name }));
  }

  async getTemplate(id: string): Promise<TemplateFull | null> {
    return this.templates.get(id) ?? null;
  }

  async createTemplate(name: string, content: string): Promise<TemplateMeta> {
    const id = generateNoteId();
    const tpl: TemplateFull = { id, name, content };
    this.templates.set(id, tpl);
    return { id, name };
  }

  async saveTemplate(id: string, content: string): Promise<void> {
    const tpl = this.templates.get(id);
    if (!tpl) throw new Error(`Template ${id} not found`);
    this.templates.set(id, { ...tpl, content });
  }

  async deleteTemplate(id: string): Promise<void> {
    this.templates.delete(id);
  }

  async renameTemplate(id: string, newName: string): Promise<TemplateMeta> {
    const tpl = this.templates.get(id);
    if (!tpl) throw new Error(`Template ${id} not found`);
    this.templates.set(id, { ...tpl, name: newName });
    return { id, name: newName };
  }

  // --- Skills --------------------------------------------------------------
  // Bundled docs ship a couple of sample skills under `.assets/skills/` so a
  // first-launch user can inspect both on-disk shapes (single-file + folder
  // bundle) and try `load_skill` against them in the chat drawer. Reads are
  // served from the in-memory map populated by the constructor. Writes throw
  // so the UI fails loudly if the user attempts to *manage* skills here —
  // mutations have nowhere to persist in the bundled vault; the user needs to
  // pick a real folder first.

  async listSkills(): Promise<SkillMeta[]> {
    return Array.from(this.skills.values())
      .map(bundledSkillToMeta)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getSkill(id: string): Promise<SkillFull | null> {
    const skill = this.skills.get(id);
    return skill ? bundledSkillToFull(skill) : null;
  }

  async getSkillByName(name: string): Promise<SkillFull | null> {
    for (const skill of Array.from(this.skills.values())) {
      if (skill.name === name) return bundledSkillToFull(skill);
    }
    return null;
  }

  async getSkillByUuid(uuid: string): Promise<SkillFull | null> {
    if (!uuid) return null;
    for (const skill of Array.from(this.skills.values())) {
      if (skill.uuid && skill.uuid === uuid) return bundledSkillToFull(skill);
    }
    return null;
  }

  async ensureSkillUuid(id: string): Promise<string> {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill not found: ${id}`);
    // Bundled skills are authored with a frontmatter `id` at build time.
    // If one slipped through without one, there's nowhere to persist the
    // generated UUID anyway, so fail loudly rather than handing back a
    // value that won't survive a reload.
    if (!skill.uuid) throw new Error(`Bundled skill ${id} is missing a frontmatter id — fix at source.`);
    return skill.uuid;
  }

  async readSkillFile(id: string, relPath: string): Promise<{ text: string; size: number } | null> {
    // Same path-traversal guards as SkillStore.readFile — bundled or not,
    // a path with `..` or a dot-prefixed segment is never resolvable.
    const segments = relPath.split('/');
    for (const seg of segments) {
      if (!seg || seg === '.' || seg === '..') return null;
      if (seg.startsWith('.')) return null;
    }
    if (relPath === 'SKILL.md') return null;
    const skill = this.skills.get(id);
    if (!skill || !skill.isFolder || !skill.files) return null;
    const entry = skill.files[relPath];
    return entry ? { text: entry.raw, size: entry.size } : null;
  }

  async createSkill(_spec: SkillCreateSpec): Promise<SkillMeta> {
    throw new Error('Skills require a real vault — pick a folder first.');
  }

  async saveSkill(_id: string, _content: string): Promise<void> {
    throw new Error('Skills require a real vault — pick a folder first.');
  }

  async deleteSkill(_id: string): Promise<void> {
    // no-op
  }

  async renameSkill(_id: string, _newName: string): Promise<SkillMeta> {
    throw new Error('Skills require a real vault — pick a folder first.');
  }

  async updateSkillDescription(_id: string, _description: string): Promise<SkillMeta> {
    throw new Error('Skills require a real vault — pick a folder first.');
  }

  async updateSkillFrontmatter(_id: string, _frontmatter: Record<string, string>): Promise<SkillMeta> {
    throw new Error('Skills require a real vault — pick a folder first.');
  }

  async moveSkill(_id: string, _destDir: string): Promise<SkillMeta> {
    throw new Error('Skills require a real vault — pick a folder first.');
  }

  // --- Chats ---------------------------------------------------------------

  async listChats(filter?: { noteId?: string; noteUuid?: string }): Promise<ChatMeta[]> {
    const all = Array.from(this.chats.values());
    if (!filter) return all.map(stripChatBody);
    return all
      .filter(c => (filter.noteUuid && c.noteUuid === filter.noteUuid)
        || (filter.noteId && c.noteId === filter.noteId))
      .map(stripChatBody);
  }

  async getChat(chatId: string): Promise<ChatFull | null> {
    return this.chats.get(chatId) ?? null;
  }

  async createChat(opts: { noteId?: string; noteUuid?: string; title?: string; provider?: string; model?: string }): Promise<ChatMeta> {
    const id = generateNoteId();
    const now = new Date().toISOString();
    const chat: ChatFull = {
      id,
      title: opts.title || 'New chat',
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
    return stripChatBody(chat);
  }

  async saveChatMessages(
    chatId: string,
    messages: ChatTurn[],
    opts?: { title?: string; provider?: string; model?: string; edits?: ChatEdit[] },
  ): Promise<ChatMeta> {
    const existing = this.chats.get(chatId);
    if (!existing) throw new Error(`Chat ${chatId} not found`);
    const next: ChatFull = {
      ...existing,
      title: opts?.title ?? existing.title,
      provider: opts?.provider ?? existing.provider,
      model: opts?.model ?? existing.model,
      updatedAt: new Date().toISOString(),
      messages,
      edits: opts?.edits ?? existing.edits,
    };
    this.chats.set(chatId, next);
    return stripChatBody(next);
  }

  async deleteChat(chatId: string): Promise<void> {
    this.chats.delete(chatId);
  }

  async clearAllChats(): Promise<void> {
    this.chats.clear();
  }

  async promoteChatToNote(chatId: string, folder?: string): Promise<NoteMeta> {
    const chat = this.chats.get(chatId);
    if (!chat) throw new Error(`Chat ${chatId} not found`);
    const body = chat.messages.map(m => `## ${m.role}\n\n${m.content}`).join('\n\n');
    return this.create(chat.title || 'Promoted chat', body, folder);
  }

  // --- Tasks ---------------------------------------------------------------

  async listTaskFiles(): Promise<TaskFileMeta[]> {
    return Array.from(this.taskFiles.entries()).map(([path, e]) => ({
      path, size: e.size, mtimeMs: e.mtimeMs,
    }));
  }

  async readTaskFile(path: string): Promise<TaskFileFull | null> {
    const e = this.taskFiles.get(path);
    if (!e) return null;
    return { path, raw: e.raw, size: e.size, mtimeMs: e.mtimeMs };
  }

  async createTaskFile(desiredBasename: string, raw: string): Promise<TaskFileMeta> {
    const safe = desiredBasename.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'task';
    let path = `${safe}.md`;
    let n = 1;
    while (this.taskFiles.has(path)) path = `${safe} ${++n}.md`;
    const mtimeMs = Date.now();
    this.taskFiles.set(path, { raw, size: raw.length, mtimeMs });
    return { path, size: raw.length, mtimeMs };
  }

  async writeTaskFile(path: string, raw: string): Promise<TaskFileMeta> {
    if (!this.taskFiles.has(path)) throw new Error(`Task file ${path} not found`);
    const mtimeMs = Date.now();
    this.taskFiles.set(path, { raw, size: raw.length, mtimeMs });
    return { path, size: raw.length, mtimeMs };
  }

  async deleteTaskFile(path: string): Promise<void> {
    this.taskFiles.delete(path);
  }

  async taskFileExists(path: string): Promise<boolean> {
    return this.taskFiles.has(path);
  }

  async writeTaskArchive(taskUuid: string, instanceDate: string, raw: string): Promise<void> {
    let map = this.taskArchive.get(taskUuid);
    if (!map) {
      map = new Map();
      this.taskArchive.set(taskUuid, map);
    }
    map.set(instanceDate, raw);
  }

  async readTaskArchive(taskUuid: string, instanceDate: string): Promise<string | null> {
    return this.taskArchive.get(taskUuid)?.get(instanceDate) ?? null;
  }

  async listTaskArchive(taskUuid: string): Promise<string[]> {
    const map = this.taskArchive.get(taskUuid);
    return map ? Array.from(map.keys()).sort() : [];
  }
}

function stripChatBody(c: ChatFull): ChatMeta {
  const { id, title, createdAt, updatedAt, noteId, noteUuid, provider, model } = c;
  return { id, title, createdAt, updatedAt, noteId, noteUuid, provider, model };
}

function bundledSkillToMeta(skill: BundledSkill): SkillMeta {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    isFolder: skill.isFolder,
    path: skill.path,
    uuid: skill.uuid,
  };
}

function bundledSkillToFull(skill: BundledSkill): SkillFull {
  const files = skill.files
    ? Object.entries(skill.files).map(([path, entry]) => ({ path, size: entry.size }))
    : [];
  return {
    ...bundledSkillToMeta(skill),
    content: skill.content,
    files,
    frontmatter: skill.frontmatter,
  };
}
