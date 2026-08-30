import { PermissionsController } from './permissions';
import { writeFile, resolveDir } from './fs-helpers';
import { GLOBAL_ASSETS_DIR, IMAGES_SUBDIR, basename as pathBasename, splitPath } from './paths';
import { MIME_BY_EXT, EXT_BY_MIME } from './mime';

/**
 * Owns the per-vault asset directory under `.assets/` plus the in-memory
 * `Map<string, string>` cache that maps relative URLs to `blob:` URLs.
 *
 * The cache exists because Milkdown's `proxyDomURL` resolver is synchronous —
 * we have to have a string ready by the time an `<img>` tag is inserted,
 * which means pre-fetching bytes and creating an object URL before the
 * editor mounts. `preload` populates the cache; `getAssetUrl` is the sync
 * lookup; the various `invalidate*` methods revoke object URLs and drop
 * keys when their underlying files move or disappear.
 */
export class AssetStore {
  private cache = new Map<string, string>();

  constructor(private perms: PermissionsController) {}

  async upload(file: File): Promise<string> {
    const ext = EXT_BY_MIME[file.type];
    if (!ext) throw new Error(`unsupported type: ${file.type}`);
    const root = this.perms.requireHandle();
    const assetDir = await root.getDirectoryHandle(GLOBAL_ASSETS_DIR, { create: true });
    // Bucket image uploads under .assets/images/ so the .assets/ root stays
    // organized (templates/, chats/, chat-files/, images/).
    const imagesDir = await assetDir.getDirectoryHandle(IMAGES_SUBDIR, { create: true });
    const name = `${crypto.randomUUID()}.${ext}`;
    const buf = await file.arrayBuffer();
    const handle = await imagesDir.getFileHandle(name, { create: true });
    await writeFile(handle, buf);
    const relativeUrl = `.assets/${IMAGES_SUBDIR}/${name}`;
    // Pre-cache the blob URL so the editor can render it synchronously —
    // Milkdown's proxyDomURL doesn't await Promises, so we need the mapping
    // available the instant the <img> tag is inserted.
    const blob = new Blob([buf], { type: file.type });
    this.cache.set(relativeUrl, URL.createObjectURL(blob));
    return relativeUrl;
  }

  async preload(noteId: string, markdown: string): Promise<void> {
    // --- Global assets (.assets/{file}) ---
    // Negative lookbehind excludes legacy per-note URLs (./uuid.assets/...)
    const globalPattern = /(?<!\w)\.assets\/[^\s)\]"'>]+/g;
    const globalUrls = Array.from(new Set(markdown.match(globalPattern) || []));
    // Global asset cache entries are note-independent — don't evict them
    // when switching notes since other notes may still reference them.
    for (const url of globalUrls) {
      if (this.cache.has(url)) continue;
      const blobUrl = await this.readGlobalAssetBlob(url);
      if (blobUrl) this.cache.set(url, blobUrl);
    }

    // --- Legacy per-note assets (./uuid.assets/{file}) ---
    const base = pathBasename(noteId);
    const legacyPrefix = `./${base}.assets/`;
    const escaped = legacyPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const legacyPattern = new RegExp(`${escaped}[^\\s)\\]"'>]+`, 'g');
    const legacyUrls = Array.from(new Set(markdown.match(legacyPattern) || []));
    const keepLegacy = new Set(legacyUrls.map(u => `${noteId}|${u}`));
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(`${noteId}|`) && !keepLegacy.has(key)) {
        URL.revokeObjectURL(this.cache.get(key)!);
        this.cache.delete(key);
      }
    }
    for (const url of legacyUrls) {
      const cacheKey = `${noteId}|${url}`;
      if (this.cache.has(cacheKey)) continue;
      const blobUrl = await this.readLegacyAssetBlob(noteId, url);
      if (blobUrl) this.cache.set(cacheKey, blobUrl);
    }
  }

  getAssetUrl(noteId: string, relativeUrl: string): string {
    return this.cache.get(relativeUrl)                // global .assets/
      || this.cache.get(`${noteId}|${relativeUrl}`)   // legacy per-note
      || relativeUrl;
  }

  async getAssetBytes(noteId: string, relativeUrl: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    // Skip absolute URLs (http/https/data) — the AI SDK can fetch those
    // itself if needed, and we don't own those files.
    if (/^(https?:|data:|blob:)/i.test(relativeUrl)) return null;

    // Two layouts in the wild: current global `.assets/{file}` and legacy
    // per-note `./<base>.assets/{file}`. Try each in order.
    const tryGlobal = async () => {
      const prefix = '.assets/';
      let path = relativeUrl;
      if (path.startsWith('./')) path = path.slice(2);
      if (!path.startsWith(prefix)) return null;
      const segments = path.slice(prefix.length).split('/').filter(Boolean);
      if (!segments.length) return null;
      const root = this.perms.requireHandle();
      let dir = await root.getDirectoryHandle(GLOBAL_ASSETS_DIR);
      for (let i = 0; i < segments.length - 1; i++) {
        dir = await dir.getDirectoryHandle(segments[i]);
      }
      const filename = segments[segments.length - 1];
      const fileHandle = await dir.getFileHandle(filename);
      return this.fileToBytes(await fileHandle.getFile(), filename);
    };
    const tryLegacy = async () => {
      const base = pathBasename(noteId);
      const prefix = `./${base}.assets/`;
      if (!relativeUrl.startsWith(prefix)) return null;
      const filename = relativeUrl.slice(prefix.length);
      const { dirParts } = splitPath(noteId);
      const root = this.perms.requireHandle();
      const parent = await resolveDir(root, dirParts);
      const assetDir = await parent.getDirectoryHandle(`${base}.assets`);
      const fileHandle = await assetDir.getFileHandle(filename);
      return this.fileToBytes(await fileHandle.getFile(), filename);
    };
    try { const g = await tryGlobal(); if (g) return g; } catch { /* fall through */ }
    try { const l = await tryLegacy(); if (l) return l; } catch { /* fall through */ }
    return null;
  }

  /** Invalidate cached blob URLs whose key starts with `${prefix}/` or `${prefix}|`.
   *  Used by folder-level destructive ops (deleteFolder, renameFolder, move-folder). */
  invalidatePrefix(prefix: string): void {
    const subPrefix = `${prefix}/`;
    const legacyPrefix = `${prefix}|`;
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(subPrefix) || key.startsWith(legacyPrefix)) {
        URL.revokeObjectURL(this.cache.get(key)!);
        this.cache.delete(key);
      }
    }
  }

  /** Invalidate cached blob URLs keyed by `${noteId}|...` (legacy per-note cache).
   *  Used after a note is deleted, moved, or renamed. */
  invalidateLegacyForNote(noteId: string): void {
    const prefix = `${noteId}|`;
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        URL.revokeObjectURL(this.cache.get(key)!);
        this.cache.delete(key);
      }
    }
  }

  /** Drop every cached blob URL. Used after a vault re-pick so URLs from
   *  the previous vault don't leak in. */
  clearAll(): void {
    for (const url of Array.from(this.cache.values())) URL.revokeObjectURL(url);
    this.cache.clear();
  }

  private async fileToBytes(file: File, filename: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeType = MIME_BY_EXT[ext];
    if (!mimeType) return null;
    const buf = await file.arrayBuffer();
    return { bytes: new Uint8Array(buf), mimeType };
  }

  private async readGlobalAssetBlob(relativeUrl: string): Promise<string | null> {
    const prefix = '.assets/';
    if (!relativeUrl.startsWith(prefix)) return null;
    const segments = relativeUrl.slice(prefix.length).split('/').filter(Boolean);
    if (!segments.length) return null;
    try {
      const root = this.perms.requireHandle();
      let dir = await root.getDirectoryHandle(GLOBAL_ASSETS_DIR);
      for (let i = 0; i < segments.length - 1; i++) {
        dir = await dir.getDirectoryHandle(segments[i]);
      }
      const filename = segments[segments.length - 1];
      const fileHandle = await dir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const type = MIME_BY_EXT[ext] || 'application/octet-stream';
      const blob = new Blob([await file.arrayBuffer()], { type });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  private async readLegacyAssetBlob(noteId: string, relativeUrl: string): Promise<string | null> {
    const base = pathBasename(noteId);
    const prefix = `./${base}.assets/`;
    if (!relativeUrl.startsWith(prefix)) return null;
    const filename = relativeUrl.slice(prefix.length);
    try {
      const { dirParts } = splitPath(noteId);
      const root = this.perms.requireHandle();
      const parent = await resolveDir(root, dirParts);
      const assetDir = await parent.getDirectoryHandle(`${base}.assets`);
      const fileHandle = await assetDir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const type = MIME_BY_EXT[ext] || 'application/octet-stream';
      const blob = new Blob([await file.arrayBuffer()], { type });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }
}
