import { parseFrontmatter, serializeFrontmatter, generateNoteId } from '@/lib/frontmatter';
import { parseChatBody, serializeChatBody } from '../chat-body';
import type { ChatMeta, ChatFull, ChatTurn, ChatEdit } from '../types';
import { PermissionsController } from './permissions';
import { writeFile } from './fs-helpers';
import { GLOBAL_ASSETS_DIR, CHATS_DIR, CHAT_FILES_DIR } from './paths';
import { mimeFromFilename, sanitizeAssetFilename } from './mime';
import { encodeChatEdits, decodeChatEdits } from './chat-edits';

/**
 * Chat threads live under `.assets/chats/<id>.md` with YAML frontmatter
 * carrying the thread meta and turn markers (`## user`, `## assistant`,
 * `## system`) in the body. Per-chat attachments live under
 * `.assets/chat-files/<chatId>/`. The vault walker already skips
 * `.`-prefixed entries so chats never leak into the note tree.
 */
export class ChatStore {
  constructor(private perms: PermissionsController) {}

  async list(filter?: { noteId?: string; noteUuid?: string }): Promise<ChatMeta[]> {
    const noteId = filter?.noteId;
    const noteUuid = filter?.noteUuid;
    const filtering = !!(noteId || noteUuid);
    try {
      const dir = await this.getChatsDir();
      const out: ChatMeta[] = [];
      for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (entry.kind !== 'file' || !name.endsWith('.md')) continue;
        const fh = entry as FileSystemFileHandle;
        const file = await fh.getFile();
        const raw = await file.text();
        const { meta, content } = parseFrontmatter(raw);
        const filenameId = name.replace(/\.md$/, '');
        const iso = new Date(file.lastModified).toISOString();
        const chat = this.chatMetaFromFrontmatter(filenameId, meta, iso);
        if (filtering) {
          const uuidMatch = !!(noteUuid && chat.noteUuid === noteUuid);
          const pathMatch = !!(noteId && chat.noteId === noteId);
          if (!uuidMatch && !pathMatch) continue;
          // Lazy upgrade: a path match without a uuid means this chat predates
          // uuid anchoring. Backfill the uuid into frontmatter so the next
          // rename doesn't break the link.
          if (!uuidMatch && pathMatch && noteUuid && !chat.noteUuid) {
            chat.noteUuid = noteUuid;
            try {
              meta.noteUuid = noteUuid;
              await writeFile(fh, serializeFrontmatter(meta, content));
            } catch { /* best-effort */ }
          }
        }
        out.push(chat);
      }
      out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return out;
    } catch {
      return [];
    }
  }

  async get(chatId: string): Promise<ChatFull | null> {
    try {
      const dir = await this.getChatsDir();
      const fh = await dir.getFileHandle(`${chatId}.md`);
      const file = await fh.getFile();
      const raw = await file.text();
      const { meta, content } = parseFrontmatter(raw);
      const iso = new Date(file.lastModified).toISOString();
      const chatMeta = this.chatMetaFromFrontmatter(chatId, meta, iso);
      return {
        ...chatMeta,
        messages: parseChatBody(content),
        edits: decodeChatEdits(meta.edits),
      };
    } catch {
      return null;
    }
  }

  async create(opts: { noteId?: string; noteUuid?: string; title?: string; provider?: string; model?: string }): Promise<ChatMeta> {
    const dir = await this.getChatsDir(true);
    const id = generateNoteId();
    const now = new Date().toISOString();
    const meta: ChatMeta = {
      id,
      title: opts.title || 'New chat',
      createdAt: now,
      updatedAt: now,
      noteUuid: opts.noteUuid,
      noteId: opts.noteId,
      provider: opts.provider,
      model: opts.model,
    };
    const fh = await dir.getFileHandle(`${id}.md`, { create: true });
    await writeFile(fh, this.serializeChatFile(meta, [], []));
    return meta;
  }

  async saveMessages(
    chatId: string,
    messages: ChatTurn[],
    opts?: { title?: string; provider?: string; model?: string; edits?: ChatEdit[] },
  ): Promise<ChatMeta> {
    const dir = await this.getChatsDir(true);
    const fh = await dir.getFileHandle(`${chatId}.md`, { create: true });
    // Read existing frontmatter to preserve createdAt / noteId across saves.
    let existing: ChatMeta | null = null;
    let existingEdits: ChatEdit[] = [];
    try {
      const file = await fh.getFile();
      const raw = await file.text();
      const { meta } = parseFrontmatter(raw);
      const iso = new Date(file.lastModified).toISOString();
      existing = this.chatMetaFromFrontmatter(chatId, meta, iso);
      existingEdits = decodeChatEdits(meta.edits);
    } catch { /* brand-new file */ }
    const now = new Date().toISOString();
    const nextMeta: ChatMeta = {
      id: chatId,
      title: opts?.title ?? existing?.title ?? 'New chat',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      noteUuid: existing?.noteUuid,
      noteId: existing?.noteId,
      provider: opts?.provider ?? existing?.provider,
      model: opts?.model ?? existing?.model,
    };
    await writeFile(
      fh,
      this.serializeChatFile(nextMeta, messages, opts?.edits ?? existingEdits),
    );
    return nextMeta;
  }

  async delete(chatId: string): Promise<void> {
    try {
      const dir = await this.getChatsDir();
      await dir.removeEntry(`${chatId}.md`);
    } catch { /* already gone */ }
    // Also drop any attachments uploaded for this thread.
    try {
      const root = this.perms.requireHandle();
      const assets = await root.getDirectoryHandle(GLOBAL_ASSETS_DIR);
      const chatFiles = await assets.getDirectoryHandle(CHAT_FILES_DIR);
      await chatFiles.removeEntry(chatId, { recursive: true });
    } catch { /* no attachments */ }
  }

  async clearAll(): Promise<void> {
    try {
      const root = this.perms.requireHandle();
      const assets = await root.getDirectoryHandle(GLOBAL_ASSETS_DIR);
      await assets.removeEntry(CHATS_DIR, { recursive: true });
    } catch { /* no chats dir */ }
    try {
      const root = this.perms.requireHandle();
      const assets = await root.getDirectoryHandle(GLOBAL_ASSETS_DIR);
      await assets.removeEntry(CHAT_FILES_DIR, { recursive: true });
    } catch { /* no chat-files dir */ }
  }

  async uploadAsset(chatId: string, file: File): Promise<{ url: string; mimeType: string; size: number }> {
    const dir = await this.getChatFilesDir(chatId, true);
    // Keep the original filename visible (helps the user recognize the file
    // in chat history) but prefix with a uuid so two drops of the same name
    // don't collide.
    const safeName = sanitizeAssetFilename(file.name);
    const storedName = `${crypto.randomUUID().slice(0, 8)}-${safeName}`;
    const handle = await dir.getFileHandle(storedName, { create: true });
    const buf = await file.arrayBuffer();
    await writeFile(handle, buf);
    const url = `.assets/${CHAT_FILES_DIR}/${chatId}/${storedName}`;
    const mimeType = file.type || mimeFromFilename(safeName) || 'application/octet-stream';
    return { url, mimeType, size: buf.byteLength };
  }

  async getAssetBytes(chatId: string, relativeUrl: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    const prefix = `.assets/${CHAT_FILES_DIR}/${chatId}/`;
    let path = relativeUrl;
    if (path.startsWith('./')) path = path.slice(2);
    if (!path.startsWith(prefix)) return null;
    const filename = path.slice(prefix.length);
    if (!filename || filename.includes('/')) return null;
    try {
      const dir = await this.getChatFilesDir(chatId, false);
      const fileHandle = await dir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      const buf = await file.arrayBuffer();
      const mimeType = mimeFromFilename(filename) || file.type || 'application/octet-stream';
      return { bytes: new Uint8Array(buf), mimeType };
    } catch {
      return null;
    }
  }

  /**
   * Rewrite every chat whose path-based `noteId` equals `oldPath` to point
   * at `newPath`. Best-effort — errors are swallowed; this is a transitional
   * safety net for chats that predate `noteUuid` anchoring.
   */
  async rewriteNotePath(oldPath: string, newPath: string): Promise<void> {
    if (!oldPath || oldPath === newPath) return;
    try {
      const dir = await this.getChatsDir();
      for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (entry.kind !== 'file' || !name.endsWith('.md')) continue;
        const fh = entry as FileSystemFileHandle;
        try {
          const file = await fh.getFile();
          const raw = await file.text();
          const { meta, content } = parseFrontmatter(raw);
          if (meta.noteId !== oldPath) continue;
          meta.noteId = newPath;
          await writeFile(fh, serializeFrontmatter(meta, content));
        } catch { /* skip unreadable */ }
      }
    } catch { /* no chats dir yet */ }
  }

  /** Variant for folder renames/moves: rewrite all chats whose `noteId` is
   *  prefixed by `oldPrefix` (which already ends with a `/`). */
  async rewriteNotePathPrefix(oldPrefix: string, newPrefix: string): Promise<void> {
    if (!oldPrefix || oldPrefix === newPrefix) return;
    try {
      const dir = await this.getChatsDir();
      for await (const [name, entry] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (entry.kind !== 'file' || !name.endsWith('.md')) continue;
        const fh = entry as FileSystemFileHandle;
        try {
          const file = await fh.getFile();
          const raw = await file.text();
          const { meta, content } = parseFrontmatter(raw);
          if (!meta.noteId || !meta.noteId.startsWith(oldPrefix)) continue;
          meta.noteId = `${newPrefix}${meta.noteId.slice(oldPrefix.length)}`;
          await writeFile(fh, serializeFrontmatter(meta, content));
        } catch { /* skip unreadable */ }
      }
    } catch { /* no chats dir yet */ }
  }

  private async getChatsDir(create = false): Promise<FileSystemDirectoryHandle> {
    const root = this.perms.requireHandle();
    const assets = await root.getDirectoryHandle(GLOBAL_ASSETS_DIR, { create });
    return assets.getDirectoryHandle(CHATS_DIR, { create });
  }

  private async getChatFilesDir(chatId: string, create = false): Promise<FileSystemDirectoryHandle> {
    const root = this.perms.requireHandle();
    const assets = await root.getDirectoryHandle(GLOBAL_ASSETS_DIR, { create });
    const chatFiles = await assets.getDirectoryHandle(CHAT_FILES_DIR, { create });
    return chatFiles.getDirectoryHandle(chatId, { create });
  }

  private chatMetaFromFrontmatter(
    filenameId: string,
    meta: Record<string, string>,
    fileMtimeIso: string,
  ): ChatMeta {
    return {
      id: meta.id || filenameId,
      title: meta.title || 'Untitled chat',
      createdAt: meta.createdAt || fileMtimeIso,
      updatedAt: meta.updatedAt || fileMtimeIso,
      noteUuid: meta.noteUuid || undefined,
      noteId: meta.noteId || undefined,
      provider: meta.provider || undefined,
      model: meta.model || undefined,
    };
  }

  private serializeChatFile(meta: ChatMeta, messages: ChatTurn[], edits: ChatEdit[] = []): string {
    const frontmatter: Record<string, string> = {
      id: meta.id,
      title: meta.title,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
    if (meta.noteUuid) frontmatter.noteUuid = meta.noteUuid;
    if (meta.noteId) frontmatter.noteId = meta.noteId;
    if (meta.provider) frontmatter.provider = meta.provider;
    if (meta.model) frontmatter.model = meta.model;
    const encodedEdits = encodeChatEdits(edits);
    if (encodedEdits) frontmatter.edits = encodedEdits;
    return serializeFrontmatter(frontmatter, serializeChatBody(messages));
  }
}
