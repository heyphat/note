import { serializeChatBody } from '../chat-body';
import type {
  NoteStore, NoteMeta, NoteFull, TreeListing, SaveOptions, VaultStatus,
  ChatMeta, ChatFull, ChatTurn, ChatEdit,
  TaskFileMeta, TaskFileFull,
  TemplateMeta, TemplateFull,
  SkillMeta, SkillFull, SkillCreateSpec,
} from '../types';
import { PermissionsController } from './permissions';
import { NoteFilesStore } from './notes';
import { HistoryStore } from './history';
import { AssetStore } from './assets';
import { TemplateStore } from './templates';
import { SkillStore } from './skills';
import { ChatStore } from './chats';
import { TaskStore } from './tasks';

// Re-exported so existing `import { sanitizeNoteTitle } from './browser-fs'`
// call sites keep resolving.
export { sanitizeNoteTitle } from './sanitize-title';

/**
 * Browser-based storage using the File System Access API.
 * All reads/writes happen client-side against a user-selected local directory.
 *
 * Notes are identified by their relative path from the picked root
 * (e.g. "projects/trading-ideas.md"). The store walks the directory tree
 * recursively so the user can see existing notes in any subfolder, including
 * files not created by this app (e.g. an Obsidian vault) — those are read
 * without touching their format.
 *
 * This class is a thin façade over a handful of focused sub-stores. Each
 * subsystem (notes, history, assets, templates, skills, chats, tasks) lives
 * in its own file under `./`; this class wires them together and is where
 * cross-cutting concerns (history snapshots on save, blob URL invalidation
 * after destructive ops, chat anchor rewriting after path changes) are made
 * explicit.
 */
export class BrowserFsStore implements NoteStore {
  private perms: PermissionsController;
  private files: NoteFilesStore;
  private history: HistoryStore;
  private assets: AssetStore;
  private templates: TemplateStore;
  private skills: SkillStore;
  private chats: ChatStore;
  private tasks: TaskStore;

  constructor(userId: string) {
    this.perms = new PermissionsController(userId);
    this.history = new HistoryStore(this.perms);
    this.assets = new AssetStore(this.perms);
    this.templates = new TemplateStore(this.perms);
    this.skills = new SkillStore(this.perms);
    this.chats = new ChatStore(this.perms);
    this.tasks = new TaskStore(this.perms);
    // NoteFilesStore depends on history (legacy snapshot migration on open)
    // and on the history snapshotter (called best-effort before every
    // overwrite). The wiring lives here so NoteFilesStore stays unaware of
    // the other sub-stores.
    this.files = new NoteFilesStore(this.perms, {
      onNoteOpened: (id, uuid) => this.history.migrateLegacy(id, uuid),
      beforeOverwrite: (uuid, raw) => this.history.snapshot(uuid, raw),
    });
    // After a fresh vault pick, drop every cached blob URL — they point at
    // files in the previous vault which we no longer have permission to.
    this.perms.onPickComplete = () => this.assets.clearAll();
  }

  // ── Permissions / lifecycle ──
  isReady(): Promise<boolean> { return this.perms.isReady(); }
  initialize(): Promise<VaultStatus> { return this.perms.initialize(); }
  pickDirectory(opts?: { forceNew?: boolean }): Promise<boolean> { return this.perms.pickDirectory(opts); }
  /** Exposed so the search layer can hand a cloned handle to a Web Worker
   *  for off-main-thread file reads during indexing. */
  getDirectoryHandle(): FileSystemDirectoryHandle | null { return this.perms.getDirectoryHandle(); }
  getVaultId(): string { return this.perms.getVaultId(); }

  // ── Notes: pure delegation ──
  list(): Promise<TreeListing> { return this.files.list(); }
  get(id: string): Promise<NoteFull | null> { return this.files.get(id); }
  findNoteByUuid(uuid: string): Promise<NoteMeta | null> { return this.files.findNoteByUuid(uuid); }
  create(title: string, text?: string, parentFolder?: string): Promise<NoteMeta> {
    return this.files.create(title, text, parentFolder);
  }
  createFolder(path: string): Promise<void> { return this.files.createFolder(path); }
  recoverNote(id: string, body: string, opts: { uuid: string; title: string; createdAt?: string }): Promise<NoteMeta> {
    return this.files.recoverNote(id, body, opts);
  }

  // ── Notes: orchestrated (cross-cutting concerns made explicit) ──
  async saveContent(id: string, text: string, title?: string, opts?: SaveOptions): Promise<NoteMeta> {
    const meta = await this.files.saveContent(id, text, title, opts);
    if (meta.id !== id) {
      // Title-driven rename produced a new path. Invalidate any blob URLs
      // cached against the legacy id and let path-anchored chats follow.
      this.assets.invalidateLegacyForNote(id);
      await this.chats.rewriteNotePath(id, meta.id).catch(() => undefined);
    }
    return meta;
  }

  async rename(id: string, title: string, opts?: SaveOptions): Promise<NoteMeta> {
    const meta = await this.files.rename(id, title, opts);
    if (meta.id !== id) {
      this.assets.invalidateLegacyForNote(id);
      await this.chats.rewriteNotePath(id, meta.id).catch(() => undefined);
    }
    return meta;
  }

  async delete(id: string): Promise<void> {
    await this.files.delete(id);
    this.assets.invalidateLegacyForNote(id);
  }

  async deleteFolder(path: string): Promise<void> {
    await this.files.deleteFolder(path);
    this.assets.invalidatePrefix(path);
  }

  async renameFolder(oldPath: string, newName: string): Promise<string> {
    const newPath = await this.files.renameFolder(oldPath, newName);
    if (newPath !== oldPath) {
      this.assets.invalidatePrefix(oldPath);
      await this.chats.rewriteNotePathPrefix(`${oldPath}/`, `${newPath}/`).catch(() => undefined);
    }
    return newPath;
  }

  async move(srcId: string, destFolder: string): Promise<string> {
    const newPath = await this.files.move(srcId, destFolder);
    if (newPath !== srcId) {
      if (srcId.endsWith('.md')) {
        this.assets.invalidateLegacyForNote(srcId);
        await this.chats.rewriteNotePath(srcId, newPath).catch(() => undefined);
      } else {
        this.assets.invalidatePrefix(srcId);
        await this.chats.rewriteNotePathPrefix(`${srcId}/`, `${newPath}/`).catch(() => undefined);
      }
    }
    return newPath;
  }

  // ── History ──
  listHistory(id: string): Promise<string[]> { return this.history.listById(id); }
  getHistoryVersion(id: string, ts: string): Promise<string | null> { return this.history.getVersion(id, ts); }
  listHistoryByUuid(uuid: string): Promise<string[]> { return this.history.listByUuid(uuid); }
  getHistoryVersionByUuid(uuid: string, ts: string): Promise<string | null> {
    return this.history.getVersionByUuid(uuid, ts);
  }

  // ── Assets (note assets — global `.assets/` + legacy per-note sidecar) ──
  uploadAsset(_id: string, file: File): Promise<string> { return this.assets.upload(file); }
  preloadAssets(noteId: string, markdown: string): Promise<void> { return this.assets.preload(noteId, markdown); }
  getAssetUrl(noteId: string, relativeUrl: string): string { return this.assets.getAssetUrl(noteId, relativeUrl); }
  getAssetBytes(noteId: string, relativeUrl: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    return this.assets.getAssetBytes(noteId, relativeUrl);
  }

  // ── Templates ──
  listTemplates(): Promise<TemplateMeta[]> { return this.templates.list(); }
  getTemplate(id: string): Promise<TemplateFull | null> { return this.templates.get(id); }
  createTemplate(name: string, content: string): Promise<TemplateMeta> { return this.templates.create(name, content); }
  saveTemplate(id: string, content: string): Promise<void> { return this.templates.save(id, content); }
  deleteTemplate(id: string): Promise<void> { return this.templates.delete(id); }
  renameTemplate(id: string, newName: string): Promise<TemplateMeta> { return this.templates.rename(id, newName); }

  // ── Skills ──
  listSkills(): Promise<SkillMeta[]> { return this.skills.list(); }
  getSkill(id: string): Promise<SkillFull | null> { return this.skills.get(id); }
  getSkillByName(name: string): Promise<SkillFull | null> { return this.skills.getByName(name); }
  getSkillByUuid(uuid: string): Promise<SkillFull | null> { return this.skills.getByUuid(uuid); }
  ensureSkillUuid(id: string): Promise<string> { return this.skills.ensureUuid(id); }
  readSkillFile(id: string, relPath: string): Promise<{ text: string; size: number } | null> {
    return this.skills.readFile(id, relPath);
  }
  createSkill(spec: SkillCreateSpec): Promise<SkillMeta> { return this.skills.create(spec); }
  saveSkill(id: string, content: string): Promise<void> { return this.skills.save(id, content); }
  deleteSkill(id: string): Promise<void> { return this.skills.delete(id); }
  renameSkill(id: string, newName: string): Promise<SkillMeta> { return this.skills.rename(id, newName); }
  updateSkillDescription(id: string, description: string): Promise<SkillMeta> {
    return this.skills.updateDescription(id, description);
  }
  updateSkillFrontmatter(id: string, frontmatter: Record<string, string>): Promise<SkillMeta> {
    return this.skills.updateFrontmatter(id, frontmatter);
  }
  moveSkill(id: string, destDir: string): Promise<SkillMeta> { return this.skills.move(id, destDir); }

  // ── Chats (mostly delegation, plus an orchestrated `promoteChatToNote`) ──
  listChats(filter?: { noteId?: string; noteUuid?: string }): Promise<ChatMeta[]> { return this.chats.list(filter); }
  getChat(chatId: string): Promise<ChatFull | null> { return this.chats.get(chatId); }
  createChat(opts: { noteId?: string; noteUuid?: string; title?: string; provider?: string; model?: string }): Promise<ChatMeta> {
    return this.chats.create(opts);
  }
  saveChatMessages(
    chatId: string,
    messages: ChatTurn[],
    opts?: { title?: string; provider?: string; model?: string; edits?: ChatEdit[] },
  ): Promise<ChatMeta> { return this.chats.saveMessages(chatId, messages, opts); }
  deleteChat(chatId: string): Promise<void> { return this.chats.delete(chatId); }
  clearAllChats(): Promise<void> { return this.chats.clearAll(); }
  uploadChatAsset(chatId: string, file: File): Promise<{ url: string; mimeType: string; size: number }> {
    return this.chats.uploadAsset(chatId, file);
  }
  getChatAssetBytes(chatId: string, relativeUrl: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    return this.chats.getAssetBytes(chatId, relativeUrl);
  }

  /** Promote a chat thread into a regular note. Creates a fresh note from
   *  the chat's title + serialized body; the original thread is left intact
   *  (interface semantics are "copy", not "move"). Cross-store, so it lives
   *  on the façade. */
  async promoteChatToNote(chatId: string, folder?: string): Promise<NoteMeta> {
    const chat = await this.chats.get(chatId);
    if (!chat) throw new Error(`Chat not found: ${chatId}`);
    // The chat title may contain characters that aren't filename-safe, so
    // pass it through create() which generates a safe filename and stores
    // the chosen title in frontmatter.
    const body = serializeChatBody(chat.messages);
    return this.files.create(chat.title, body, folder);
  }

  // ── Tasks ──
  listTaskFiles(): Promise<TaskFileMeta[]> { return this.tasks.listFiles(); }
  readTaskFile(path: string): Promise<TaskFileFull | null> { return this.tasks.readFile(path); }
  createTaskFile(desiredBasename: string, raw: string): Promise<TaskFileMeta> {
    return this.tasks.createFile(desiredBasename, raw);
  }
  writeTaskFile(path: string, raw: string): Promise<TaskFileMeta> { return this.tasks.writeFileAt(path, raw); }
  deleteTaskFile(path: string): Promise<void> { return this.tasks.deleteFile(path); }
  taskFileExists(path: string): Promise<boolean> { return this.tasks.fileExists(path); }
  writeTaskArchive(taskUuid: string, instanceDate: string, raw: string): Promise<void> {
    return this.tasks.writeArchive(taskUuid, instanceDate, raw);
  }
  readTaskArchive(taskUuid: string, instanceDate: string): Promise<string | null> {
    return this.tasks.readArchive(taskUuid, instanceDate);
  }
  listTaskArchive(taskUuid: string): Promise<string[]> { return this.tasks.listArchive(taskUuid); }
}
