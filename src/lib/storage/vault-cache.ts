// Persisted per-vault snapshot: the walked note list + the MiniSearch index
// + the tag maps. Keeps cold boot in milliseconds on huge vaults by skipping
// the storage walk and index build on every page load. A background
// refresh still walks the vault and diffs against the snapshot for changes.
//
// One DB per vault is overkill; one DB with one row per vault keyed by
// the sanitized vaultId is simpler and keeps switching vaults O(1).

import type { NoteMeta } from './types';
import type { LinkRefWithContext } from '../links/link-refs';

const DB_NAME = 'notes-vault-cache';
const STORE = 'snapshots';
const DB_VERSION = 1;

/** Bump when the shape of VaultSnapshot changes incompatibly — older rows are ignored on load. */
// v3: intermediate versions of the app wrote snapshots from stale `notes`
// state before serialize() was taught to pull titles from notesMeta, and
// before the background walk was taught to merge instead of replace. A
// snapshot saved by any of those intermediate builds can still carry
// filename titles for bodyIndexed ids, which sync()'s merge then locks in.
// One more bump to force every client onto a clean walk.
// v4: adds the wikilink index (forward links per note) so the knowledge graph
// layer survives reloads without a cold reparse of every body.
// v5: caps the searchable body prefix for medium/large vaults. Old snapshots
// can hydrate a full-body MiniSearch index that immediately reintroduces the
// huge-worker-memory crash path, so force a cold rebuild once.
// v6: forces a rebuild of cached tag maps. Some v5 snapshots can report all
// note bodies indexed while still having an empty tag map, which makes the
// sidebar Tags panel look broken even when notes contain #tags.
export const SNAPSHOT_VERSION = 6;

export interface VaultSnapshot {
  version: number;
  savedAt: number;
  notes: NoteMeta[];
  folders: string[];
  /** MiniSearch.toJSON() output. Null when the index was never primed. */
  indexJson: unknown | null;
  /** Forward tag map: lowercased tag → note ids. */
  tagForward: Record<string, string[]>;
  /** Reverse map: note id → lowercased tags. Kept alongside forward so we can undo a note without scanning every tag bucket. */
  tagReverse: Record<string, string[]>;
  /** Ids whose body has been read and indexed. */
  bodyIndexed: string[];
  /**
   * Forward wikilink map: noteId → extracted [[...]] refs (with context
   * snippets). Omit to skip hydration. The reverse map is rebuilt at hydrate
   * time from this forward map.
   */
  links?: Record<string, LinkRefWithContext[]>;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadSnapshot(vaultKey: string): Promise<VaultSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await open();
    return await new Promise<VaultSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(vaultKey);
      req.onsuccess = () => {
        const val = req.result as VaultSnapshot | undefined;
        if (!val || val.version !== SNAPSHOT_VERSION) { resolve(null); return; }
        resolve(val);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[vault-cache] load failed', err);
    return null;
  }
}

export async function saveSnapshot(vaultKey: string, snap: VaultSnapshot): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(snap, vaultKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // Quota exceeded is the common failure on 1GB+ vaults. Log and move on —
    // the app keeps working, just without the warm-boot speedup next time.
    console.warn('[vault-cache] save failed', err);
  }
}

export async function clearSnapshot(vaultKey: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(vaultKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[vault-cache] clear failed', err);
  }
}
