import { BrowserFsStore } from './browser-fs';
import type { NoteStore } from './types';
import type { BundledDocsManifest } from './bundled-docs';

interface CacheEntry {
  store: NoteStore;
  userId: string;
}

let instance: CacheEntry | null = null;

// Sync factory — returns the FS store. The bundled-docs store lives behind a
// dynamic import (see loadBundledDocsStore below) so returning users with a
// real vault never download the multi-hundred-KB docs manifest.
export function getStore(userId: string): NoteStore {
  // Rebuild whenever the user changes — one user's FileSystemDirectoryHandle
  // must never be reused against another user.
  if (!instance || instance.userId !== userId) {
    instance = { store: new BrowserFsStore(userId), userId };
  }
  return instance.store;
}

/**
 * Async loader for the in-memory documentation vault. The docs payload is
 * served as a static JSON file from `/public/docs-bundle/<locale>.json`, so
 * the data never lands in the server bundle or in the main client chunk —
 * it's downloaded once, only when a first-launch user lands without a saved
 * FileSystemDirectoryHandle. Returning users skip the fetch entirely.
 */
export async function loadBundledDocsStore(locale: string): Promise<NoteStore> {
  const [{ BundledDocsStore }, { normalizeDocsLocale }] = await Promise.all([
    import('./bundled-docs'),
    import('./bundled-docs-id'),
  ]);
  const docsLocale = normalizeDocsLocale(locale);
  let manifest: BundledDocsManifest = { notes: {}, skills: [] };
  try {
    const res = await fetch(`/docs-bundle/${docsLocale}.json`);
    if (res.ok) manifest = await res.json();
    else console.warn(`[docs] bundle fetch returned ${res.status} for ${docsLocale}`);
  } catch (err) {
    // Network/offline failure: surface a docs vault with no files rather
    // than crashing the whole page. The user can still pick their own
    // folder via the banner.
    console.warn('[docs] bundle fetch failed; mounting empty docs vault', err);
  }
  return new BundledDocsStore(docsLocale, manifest);
}

export { BrowserFsStore } from './browser-fs';
export { isBundledDocsVaultId } from './bundled-docs-id';
export type {
  NoteStore, NoteMeta, NoteFull, VaultStatus, NoteRevision, SaveOptions,
  ChatMeta, ChatFull, ChatTurn, ChatRole, ChatEdit, ChatEditStatus,
  SkillMeta, SkillFull, SkillFileRef, SkillCreateSpec,
} from './types';
export { NoteConflictError, isNoteConflictError } from './types';
export { parseChatBody, serializeChatBody } from './chat-body';
