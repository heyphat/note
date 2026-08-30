import type { ProposedEditInput } from '../ai/tools';

export interface NoteMeta {
  id: string;        // relative path from the root, e.g. "projects/foo.md"
  title: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Stable identity from the YAML frontmatter `id` field. Survives renames,
   * moves, and folder rename. Undefined for foreign markdown without
   * frontmatter. Anchor cross-references (chats, etc.) to this, not `id`.
   */
  uuid?: string;
  /** File size in bytes, if known. Used by the vault cache to diff files. */
  size?: number;
  /** File mtime (ms since epoch), if known. Used by the vault cache to diff files. */
  mtimeMs?: number;
}

export interface NoteFull extends NoteMeta {
  text: string;
}

// --- Chat thread types ---
// Stored as `.assets/chats/{id}.md` with YAML frontmatter + turn markers
// (## user / ## assistant / ## system) in the body, so threads are both
// grep-able and openable as normal markdown notes if promoted.

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export type ChatEditStatus = 'pending' | 'applied' | 'rejected' | 'error';

export type ChatEdit = ProposedEditInput & {
  toolCallId: string;
  status: ChatEditStatus;
  error?: string;
};

export interface ChatMeta {
  id: string;                // uuid
  title: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Stable frontmatter UUID of the note this thread is anchored to. Preferred
   * over `noteId` because it survives renames, moves, and folder renames.
   */
  noteUuid?: string;
  /**
   * Legacy/fallback path of the note this thread is anchored to. Kept in sync
   * by rename/move hooks for chats whose anchor note has no frontmatter UUID
   * (foreign markdown). New chats persist `noteUuid` in addition.
   */
  noteId?: string;
  /** Provider id the last turn was sent through (e.g. 'anthropic'). */
  provider?: string;
  /** Model id of the last turn (e.g. 'claude-sonnet-4-6'). */
  model?: string;
}

export interface ChatFull extends ChatMeta {
  messages: ChatTurn[];
  edits: ChatEdit[];
}

// --- Task file types ---
// Tasks live as plain `.md` files under `.assets/tasks/`, with TaskNotes-spec
// frontmatter. Treating them through their own typed surface (rather than
// via the generic `get`/`saveContent`) keeps the regular note tree clean
// and gives task code a stable contract.

export interface TaskFileMeta {
  /** Path relative to `.assets/tasks/`, e.g. `2026-05-04-q2-proposal.md`. */
  path: string;
  size?: number;
  mtimeMs?: number;
}

export interface TaskFileFull extends TaskFileMeta {
  /** Raw markdown including frontmatter. */
  raw: string;
}

export interface TemplateMeta {
  id: string;
  name: string;
}

export interface TemplateFull extends TemplateMeta {
  content: string;
}

// --- Skill types ---
// A skill is a markdown file with `type: skill`, `name`, `description`
// frontmatter, optionally bundled with auxiliary files. Single-file skills
// live at `.assets/skills/<id>.md`; folder skills live at
// `.assets/skills/<basename>/SKILL.md` plus sibling resource files. The model
// sees skill name + description in the system prompt and pulls the body on
// demand via the `load_skill` tool.

export interface SkillFileRef {
  /** Path relative to the skill folder, e.g. `references/api.md`. */
  path: string;
  size: number;
}

export interface SkillMeta {
  /** Stable identifier — frontmatter UUID for single-file skills, the folder
   *  basename for folder skills. */
  id: string;
  /** Display name (skill identifier from frontmatter). Unique per vault. */
  name: string;
  /** Short description the model sees in the system prompt. */
  description: string;
  /** True when the skill is a folder bundle (`SKILL.md` + aux files). */
  isFolder: boolean;
  /** Resolved filesystem path of SKILL.md, relative to `.assets/skills/`.
   *  Single-file skill: `<id>.md`. Folder skill: `<basename>/SKILL.md`. */
  path: string;
  /** Stable UUID from the SKILL.md frontmatter `id:` field. Drives the
   *  `/skills/<uuid>` URL so the browser address bar survives a rename or a
   *  move between folders. Undefined for skills imported before the UUID
   *  flow existed — `ensureSkillUuid` lazily generates and persists one on
   *  first open. */
  uuid?: string;
}

export interface SkillFull extends SkillMeta {
  /** Body of SKILL.md (without frontmatter). */
  content: string;
  /** For folder skills, sibling files beside SKILL.md. Empty for single-file. */
  files: SkillFileRef[];
  /** Full frontmatter map (every key seen on disk, including custom fields).
   *  `name` and `description` are duplicated here for convenience — the UI's
   *  properties panel iterates this map directly so user-added fields like
   *  `version` / `author` / `license` survive a save round-trip. */
  frontmatter: Record<string, string>;
}

export interface SkillCreateSpec {
  name: string;
  description: string;
  content: string;
  /** Optional auxiliary files for a folder skill. When non-empty, the skill is
   *  created as a folder bundle and the files are written verbatim. */
  files?: { path: string; bytes: Uint8Array }[];
  /** Optional parent directory under `.assets/skills/` to place this skill in.
   *  Empty / omitted = vault root. Used by bulk GitHub imports to mirror the
   *  source repo's directory structure (e.g. `coding/python` → places the new
   *  skill under `.assets/skills/coding/python/`). Intermediate directories are
   *  created as needed; dot-prefixed segments are rejected. */
  targetDir?: string;
  /** Optional full frontmatter map carried over from an import source.
   *  `createSkill` merges custom keys (`version`, `author`, `license`, …)
   *  into the serialized SKILL.md so they're not silently dropped at the
   *  storage boundary. `name` and `description` from the explicit fields
   *  always win — duplicate keys in this map are overwritten. */
  frontmatter?: Record<string, string>;
  /** Force a folder-bundle layout on disk (`<name>/SKILL.md`) even when no
   *  aux files are provided. Required when nested skills will be created
   *  underneath this skill — the parent has to be a directory so children
   *  can live inside it. Ignored when `files.length > 0` (a folder is
   *  already implied). */
  forceFolder?: boolean;
}

export interface TreeListing {
  notes: NoteMeta[];
  /** All directory paths (including empty ones). Used to render the tree. */
  folders: string[];
}

export interface VaultStatus {
  ready: boolean;
  needsPicker?: boolean;
  label?: string;
  /** Stable opaque id for the picked vault handle. */
  vaultId?: string;
}

export interface NoteRevision {
  size?: number | null;
  mtimeMs?: number | null;
}

export interface SaveOptions {
  /** Optimistic concurrency guard: reject the write if the on-disk file changed. */
  expected?: NoteRevision | null;
}

export class NoteConflictError extends Error {
  readonly code = 'note_conflict';
  readonly noteId: string;

  constructor(noteId: string, message = 'Note changed on disk before save.') {
    super(message);
    this.name = 'NoteConflictError';
    this.noteId = noteId;
  }
}

export function isNoteConflictError(error: unknown): error is NoteConflictError {
  return error instanceof NoteConflictError
    || (!!error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: unknown }).code === 'note_conflict');
}

/**
 * Storage abstraction for notes. Currently implemented by BrowserFsStore,
 * which backs everything with the File System Access API against a
 * user-picked local directory.
 */
export interface NoteStore {
  /** Whether the store is ready to serve requests (handle granted, etc). */
  isReady(): Promise<boolean>;

  /** Check permission on the saved handle and return its status. */
  initialize(): Promise<VaultStatus>;

  /**
   * Show the native directory picker and store the chosen handle.
   * - forceNew=true: always shows the native picker dialog (used by the
   *   "switch folder" button).
   * - forceNew=false (default): tries to silently re-grant permission on a
   *   previously-saved handle first, falling back to the native dialog.
   */
  pickDirectory(opts?: { forceNew?: boolean }): Promise<boolean>;

  list(): Promise<TreeListing>;
  get(id: string): Promise<NoteFull | null>;
  /**
   * Look up a note by its frontmatter UUID. Walks the vault parsing
   * frontmatter until it finds a match; returns null if no note carries
   * that UUID (e.g. note was deleted, or never had frontmatter). Used to
   * resolve chat anchors back to a current path after renames/moves.
   */
  findNoteByUuid(uuid: string): Promise<NoteMeta | null>;
  /** Create a new note. If parentFolder is given, create it inside that folder. */
  create(title: string, text?: string, parentFolder?: string): Promise<NoteMeta>;
  /** Create an empty folder at the given relative path (e.g. "projects" or "ideas/trading"). */
  createFolder(path: string): Promise<void>;
  /** Recursively delete a folder at the given relative path. */
  deleteFolder(path: string): Promise<void>;
  /**
   * Move a note (id ends in .md) or folder (id has no extension) into destFolder.
   * destFolder is a relative path from the root ("" means root). Returns the new id.
   */
  move(srcId: string, destFolder: string): Promise<string>;
  /** Rename a folder in-place. Returns the new path. */
  renameFolder(oldPath: string, newName: string): Promise<string>;
  saveContent(id: string, text: string, title?: string, opts?: SaveOptions): Promise<NoteMeta>;
  rename(id: string, title: string, opts?: SaveOptions): Promise<NoteMeta>;
  delete(id: string): Promise<void>;

  /**
   * Recreate a note whose on-disk file is missing (deleted externally,
   * lost to the title-driven-rename data-loss bug, etc) using state still
   * held in memory by the editor. Unlike `saveContent`, this never reads
   * the existing file — it creates parents + the file unconditionally and
   * writes fresh frontmatter from `opts`.
   */
  recoverNote(
    id: string,
    body: string,
    opts: { uuid: string; title: string; createdAt?: string },
  ): Promise<NoteMeta>;

  /**
   * Upload an asset (image) to the vault's asset folder.
   * Returns the relative URL that goes in the markdown.
   * Implementations pre-cache the blob URL so a subsequent getAssetUrl()
   * call can resolve it synchronously.
   */
  uploadAsset(id: string, file: File): Promise<string>;

  /**
   * Scan the note's markdown for asset references and pre-resolve each to a
   * blob URL. Call this before mounting the editor so that the synchronous
   * getAssetUrl() lookup always has a cached entry.
   */
  preloadAssets(noteId: string, markdown: string): Promise<void>;

  /**
   * Synchronously translate a relative asset URL (like "./foo.assets/bar.png")
   * to a blob: URL the browser can render. Falls back to the input URL if
   * no mapping is known.
   */
  getAssetUrl(noteId: string, relativeUrl: string): string;

  /**
   * Read an asset referenced by the markdown (global `.assets/…` or legacy
   * per-note `./<base>.assets/…`) and return its bytes + mime type.
   * Used to attach image context to AI chat turns. Returns null if the
   * asset isn't found or isn't a recognized image format.
   */
  getAssetBytes(noteId: string, relativeUrl: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;

  /**
   * Upload a chat attachment (image, PDF, text) to `.assets/chat-files/{chatId}/`.
   * Unlike `uploadAsset` (which is image-only), this accepts any file the
   * chat composer classifies as supported. Returns the relative URL that
   * gets embedded in the user message body so subsequent loads can re-resolve
   * the bytes.
   */
  uploadChatAsset(chatId: string, file: File): Promise<{ url: string; mimeType: string; size: number }>;

  /**
   * Read a chat attachment (file under `.assets/chat-files/{chatId}/…`) by
   * its relative URL. Returns null if missing.
   */
  getChatAssetBytes(chatId: string, relativeUrl: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;

  /** List history timestamps for a note (newest first). [] if none. */
  listHistory(id: string): Promise<string[]>;
  /** Read a historical version's raw file content, or null if missing. */
  getHistoryVersion(id: string, ts: string): Promise<string | null>;

  /**
   * UUID-keyed variants of the history readers. Needed by the recovery
   * flow: when the live file is missing, `listHistory(id)` / `getHistoryVersion(id, ts)`
   * return empty because they resolve UUID by reading the live file. The
   * editor still knows the UUID from in-memory state, so we read history
   * directly by UUID.
   */
  listHistoryByUuid(uuid: string): Promise<string[]>;
  getHistoryVersionByUuid(uuid: string, ts: string): Promise<string | null>;

  // --- Templates ---
  listTemplates(): Promise<TemplateMeta[]>;
  getTemplate(id: string): Promise<TemplateFull | null>;
  createTemplate(name: string, content: string): Promise<TemplateMeta>;
  saveTemplate(id: string, content: string): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  renameTemplate(id: string, newName: string): Promise<TemplateMeta>;

  // --- Skills (.assets/skills/) ---
  // Skills are markdown files with `type: skill` + `name` + `description`
  // frontmatter. Single-file at `<id>.md` OR folder bundles at
  // `<basename>/SKILL.md` plus resource files. The vault walker excludes
  // `.assets/`, so the skill files stay out of the regular note tree.
  listSkills(): Promise<SkillMeta[]>;
  /** Lookup by the path-shaped id (e.g. `coding/python`). Used by UI flows
   *  that already hold an id from `listSkills`. Does NOT fall back to a
   *  name match — that would let a stale folder id collide with another
   *  skill's frontmatter name. */
  getSkill(id: string): Promise<SkillFull | null>;
  /** Lookup by the skill's frontmatter `name`. Used by model-facing tools
   *  (`load_skill`, `read_skill_file`) which receive a name from the system
   *  prompt and must not accidentally resolve to a same-named id. */
  getSkillByName(name: string): Promise<SkillFull | null>;
  /** Read an auxiliary file inside a folder skill. Returns text + bytes for the
   *  file at `relPath` (relative to the skill folder). Returns null for missing
   *  files, for single-file skills, or for paths that escape the skill folder. */
  readSkillFile(id: string, relPath: string): Promise<{ text: string; size: number } | null>;
  createSkill(spec: SkillCreateSpec): Promise<SkillMeta>;
  saveSkill(id: string, content: string): Promise<void>;
  deleteSkill(id: string): Promise<void>;
  renameSkill(id: string, newName: string): Promise<SkillMeta>;
  /** Patch the SKILL.md frontmatter `description` field. The body is left
   *  intact byte-for-byte. */
  updateSkillDescription(id: string, description: string): Promise<SkillMeta>;
  /** Replace the entire SKILL.md frontmatter map. Used by the generic
   *  properties panel — preserves the body, lets the UI control which keys
   *  exist. `name` collisions are NOT enforced here (the panel binds the
   *  `name` field to renameSkill explicitly so the collision check stays in
   *  one place). */
  updateSkillFrontmatter(id: string, frontmatter: Record<string, string>): Promise<SkillMeta>;
  /** Look up a skill by its frontmatter UUID (from the `id:` field). Used
   *  by URL routing — the address bar carries `/skills/<uuid>` so the link
   *  survives rename / move. */
  getSkillByUuid(uuid: string): Promise<SkillFull | null>;
  /** Return the skill's UUID, generating + persisting one in the SKILL.md
   *  frontmatter if it doesn't have one yet. Called the first time a skill
   *  is opened so the URL can reference it stably. */
  ensureSkillUuid(id: string): Promise<string>;
  /** Move a skill (single-file or folder) into a different parent directory
   *  under `.assets/skills/`. `destDir` is the new parent path relative to
   *  `.assets/skills/` — empty means top level. Rejects moves into the
   *  skill itself or any of its descendants. Returns the moved skill's new
   *  meta (with the updated path-shaped id). */
  moveSkill(id: string, destDir: string): Promise<SkillMeta>;

  // --- Chats ---
  /**
   * List chat threads, optionally filtered to those anchored to a note.
   * Pass both the path-based `noteId` and the stable `noteUuid` when
   * available — a thread matches if either field aligns. Threads found via
   * a path-only match are opportunistically upgraded with the `noteUuid` so
   * future renames don't break the link.
   */
  listChats(filter?: { noteId?: string; noteUuid?: string }): Promise<ChatMeta[]>;
  /** Read a full thread (meta + all turns), or null if missing. */
  getChat(chatId: string): Promise<ChatFull | null>;
  /** Create a new empty thread. If `noteId`/`noteUuid` is given, the thread is anchored to that note. */
  createChat(opts: { noteId?: string; noteUuid?: string; title?: string; provider?: string; model?: string }): Promise<ChatMeta>;
  /** Overwrite the thread body with `messages` + update the provider/model/updatedAt in frontmatter. */
  saveChatMessages(
    chatId: string,
    messages: ChatTurn[],
    opts?: { title?: string; provider?: string; model?: string; edits?: ChatEdit[] },
  ): Promise<ChatMeta>;
  /** Delete a thread file from `.assets/chats/`. Silently no-ops on missing. */
  deleteChat(chatId: string): Promise<void>;
  /** Remove every thread from `.assets/chats/`. */
  clearAllChats(): Promise<void>;
  /** Copy a chat file out to `folder/<title>.md` so it appears as a regular note. */
  promoteChatToNote(chatId: string, folder?: string): Promise<NoteMeta>;

  // --- Tasks (.assets/tasks/) ---
  // Each task is one markdown file under `.assets/tasks/` with TaskNotes-spec
  // frontmatter. Storage knows nothing about the schema — these methods are
  // raw bytes in/out. Parsing/validation happens in `lib/tasks/`.
  /** List every task file in `.assets/tasks/`. */
  listTaskFiles(): Promise<TaskFileMeta[]>;
  /** Read one task file by path (relative to `.assets/tasks/`). */
  readTaskFile(path: string): Promise<TaskFileFull | null>;
  /**
   * Create a new task file. The store resolves a free filename starting
   * from `desiredBasename` (without extension). Returns the actual path used.
   */
  createTaskFile(desiredBasename: string, raw: string): Promise<TaskFileMeta>;
  /** Atomically overwrite an existing task file. Throws if missing. */
  writeTaskFile(path: string, raw: string): Promise<TaskFileMeta>;
  /** Delete a task file. Idempotent. */
  deleteTaskFile(path: string): Promise<void>;
  /** True if a task file exists at the given path. */
  taskFileExists(path: string): Promise<boolean>;

  /**
   * Per-instance archive of completed recurring tasks. Files live under
   * `.assets/tasks/.archive/<taskUuid>/<instanceDate>.md`. UUID-keyed so the
   * archive survives task renames or moves — same approach as note `.history/`.
   */
  writeTaskArchive(taskUuid: string, instanceDate: string, raw: string): Promise<void>;
  readTaskArchive(taskUuid: string, instanceDate: string): Promise<string | null>;
  listTaskArchive(taskUuid: string): Promise<string[]>;
}
