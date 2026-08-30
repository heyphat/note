'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteMeta, NoteStore } from '@/lib/storage';
import type { IndexProgress, SearchHit, SearchIndex, SearchQuery, TagCount } from '@/lib/search/types';
import type { BrowserFsSearchIndex } from '@/lib/search/browser-fs-index';
import type { LinkIndex } from '@/lib/links/link-index';
import type { VaultSnapshot } from '@/lib/storage/vault-cache';
import { loadSnapshot, saveSnapshot } from '@/lib/storage/vault-cache';
import { getRecent, pushRecent as pushRecentStorage, removeRecent, renameRecent } from '@/lib/recent';
import { getHiddenTags, addHiddenTag, removeHiddenTag } from '@/lib/hidden-tags';

function sanitizeVault(id: string): string {
  return id.replace(/[:\s]+/g, '_') || 'default';
}

function vaultCacheKey(vaultId: string): string {
  return sanitizeVault(vaultId);
}

/** Debounce for persisting the index snapshot. Longer than a single edit so
 *  bursts coalesce; short enough that a reload 10s after a save sees the change. */
const SNAPSHOT_DEBOUNCE_MS = 8000;

async function getParser(handle: FileSystemDirectoryHandle) {
  const mod = await import('@/lib/search/index-parser-client');
  return mod.tryCreateParserClient(handle);
}

interface UseSearchValue {
  /**
   * Try to load a cached vault snapshot from IndexedDB. When found, returns
   * the hydrated `{notes, folders}` so the caller can paint the UI without
   * waiting for a filesystem walk, and primes the index from the same
   * snapshot. Returns null when no cache exists for this vault.
   */
  loadCachedSnapshot: () => Promise<{ notes: NoteMeta[]; folders: string[] } | null>;
  /**
   * Lazily build the index (dynamic-imports MiniSearch + the index module so
   * they stay out of the initial bundle). Safe to call many times. The
   * palette should call this on open so title-indexing starts immediately.
   */
  prime: () => Promise<void>;
  search: (q: SearchQuery) => Promise<SearchHit[]>;
  progress: IndexProgress;
  ready: boolean;
  recent: string[];
  pushRecent: (id: string) => void;
  /** Re-read body from store and re-index. No-op if not yet primed — the next sync() will catch up from the updated notes list. */
  updateNote: (id: string) => void;
  /** Drop all traces of a note from the index and recent list. */
  removeNote: (id: string) => void;
  /** Rewire a note's id (after move or folder rename). */
  renameNote: (oldId: string, newId: string) => void;
  /** All known tags with counts. Empty array pre-prime; repopulates on each tag index change. */
  tags: TagCount[];
  /** Note ids carrying the given tag (lowercased). Empty set pre-prime or for unknown tags. */
  getTagMembers: (tag: string) => Set<string>;
  /** User-hidden tags (lowercased). These still exist in the index — the TagCloud just omits their chips. */
  hiddenTags: Set<string>;
  /** Hide a tag from the cloud. */
  hideTag: (tag: string) => void;
  /** Unhide a previously-hidden tag. */
  unhideTag: (tag: string) => void;
  /**
   * Live reference to the wikilink index. Null pre-prime. Components that
   * read links (BacklinksPanel, GraphView) should subscribe via linkIndex.onChange
   * to re-render when the body-indexing pass adds new edges.
   */
  linkIndex: LinkIndex | null;
  /**
   * Monotonic counter bumped on every link-index mutation. Component-side
   * shortcut for subscribers that want React state changes rather than
   * imperative callbacks — include it in a useMemo/useEffect dep list.
   */
  linksVersion: number;
  /**
   * Tear down the current index and rebuild from scratch. Call after the
   * underlying data source changes (e.g. the user picks a new folder) —
   * `sync()`'s incremental diff is usually enough, but `reset()` gives a
   * clean slate when you don't want stale idle-queue work from the old
   * folder competing with the new one.
   */
  reset: () => Promise<void>;
  /** Tear down the current index without immediately rebuilding it. */
  dispose: () => void;
}

export function useSearch(
  store: NoteStore,
  notes: NoteMeta[],
  folders: string[],
  vaultId: string,
  // Called when body indexing refines a note's meta (title/date). Since
  // list() returns filename-derived titles to stay cheap on huge vaults,
  // this is how the real titles reach the UI. Must be stable (ref under
  // the hood) or it'll detach/reattach on every render.
  onMetaPatch?: (id: string, patch: Partial<NoteMeta>) => void,
): UseSearchValue {
  const indexRef = useRef<SearchIndex | null>(null);
  const primePromiseRef = useRef<Promise<SearchIndex> | null>(null);
  const [progress, setProgress] = useState<IndexProgress>({ indexed: 0, total: 0 });
  const [ready, setReady] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => getRecent(vaultId));
  const [tags, setTags] = useState<TagCount[]>([]);
  const [hiddenTags, setHiddenTags] = useState<Set<string>>(() => new Set(getHiddenTags(vaultId)));
  // linkIndex is exposed so components can call getBacklinks() imperatively,
  // while linksVersion is a render-trigger counter that bumps on any mutation.
  const [linkIndex, setLinkIndex] = useState<LinkIndex | null>(null);
  const [linksVersion, setLinksVersion] = useState(0);

  const onMetaPatchRef = useRef(onMetaPatch);
  useEffect(() => { onMetaPatchRef.current = onMetaPatch; }, [onMetaPatch]);

  const vaultKey = vaultCacheKey(vaultId);
  const vaultKeyRef = useRef(vaultKey);
  useEffect(() => { vaultKeyRef.current = vaultKey; }, [vaultKey]);

  // Debounced writer — see scheduleSnapshotSave below. Exposed as refs so
  // cleanup / vault switch can cancel without stale closures.
  const snapshotTimerRef = useRef<number | null>(null);
  const snapshotBusyRef = useRef(false);

  // When the vault changes, re-read persisted state from the new scope.
  // useState's initializer only fires once — this keeps recent/hidden in
  // sync when the user picks a different folder at runtime.
  useEffect(() => {
    setRecent(getRecent(vaultId));
    setHiddenTags(new Set(getHiddenTags(vaultId)));
  }, [vaultId]);

  // Keep a live ref to the latest notes so the lazy prime() can seed with
  // whatever's current — independent of when it happens to run.
  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  const foldersRef = useRef(folders);
  useEffect(() => { foldersRef.current = folders; }, [folders]);

  const doSaveSnapshot = useCallback(async () => {
    if (snapshotBusyRef.current) return;
    const idx = indexRef.current as BrowserFsSearchIndex | null;
    if (!idx || typeof idx.serialize !== 'function') return;
    snapshotBusyRef.current = true;
    try {
      // serialize is async now because toJSON lives in a worker — it RPCs
      // the index payload back out for IDB write. Main-thread heap never
      // holds the full indexJson at the same time as the worker's copy.
      const snap = await idx.serialize(notesRef.current, foldersRef.current);
      await saveSnapshot(vaultKeyRef.current, snap);
    } finally {
      snapshotBusyRef.current = false;
    }
  }, []);

  const scheduleSnapshotSave = useCallback(() => {
    if (snapshotTimerRef.current != null) return;
    snapshotTimerRef.current = window.setTimeout(() => {
      snapshotTimerRef.current = null;
      void doSaveSnapshot();
    }, SNAPSHOT_DEBOUNCE_MS);
  }, [doSaveSnapshot]);

  // Force-save on tab hide / close, even mid-index. Without this, a user
  // who backgrounds or closes a tab halfway through a 70k-note cold pass
  // would lose all indexing progress: the periodic save we used to do
  // every 8 s has been removed because each one caused a 600–900 MB
  // transient spike that crashed huge-vault tabs. Flushing at the natural
  // "user going away" moments is the compromise — captures a checkpoint
  // without the periodic spikes.
  useEffect(() => {
    const handler = () => {
      if (snapshotTimerRef.current != null) {
        window.clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
      // Kick a save regardless of whether one was pending — during a cold
      // pass we intentionally avoid scheduling, so the pending-timer branch
      // would skip the save entirely. doSaveSnapshot's busy guard prevents
      // concurrent saves, so this is safe to call blindly.
      void doSaveSnapshot();
    };
    window.addEventListener('visibilitychange', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('visibilitychange', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, [doSaveSnapshot]);

  // Tear down when the store identity changes (rare: user switch, mode swap).
  // Flush any pending snapshot first so work done in the old vault isn't lost.
  useEffect(() => {
    return () => {
      if (snapshotTimerRef.current != null) {
        window.clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
        void doSaveSnapshot();
      }
      indexRef.current?.dispose();
      indexRef.current = null;
      primePromiseRef.current = null;
      setReady(false);
      setProgress({ indexed: 0, total: 0 });
      setTags([]);
      setLinkIndex(null);
    };
  }, [store, doSaveSnapshot]);

  const primeInternal = useCallback(async (snapshot: VaultSnapshot | null): Promise<SearchIndex> => {
    if (indexRef.current) return indexRef.current;
    if (primePromiseRef.current) return primePromiseRef.current;
    primePromiseRef.current = (async () => {
      const indexMod = await import('@/lib/search/browser-fs-index');
      // The parser worker is only useful when we have a FileSystemDirectoryHandle
      // to clone into it (browser-fs mode). Its import is a separate await so a
      // build/load failure (Next dev-mode worker URL resolution, missing API)
      // can't block indexing — we silently fall back to the in-process path.
      const handleHost = store as unknown as { getDirectoryHandle?: () => FileSystemDirectoryHandle | null };
      const handle = handleHost.getDirectoryHandle?.() ?? null;
      let parser: Awaited<ReturnType<typeof getParser>> | null = null;
      if (handle) {
        try {
          parser = await getParser(handle);
        } catch (err) {
          console.warn('[search] parser worker unavailable, using main-thread parser', err);
        }
      }
      const idx = new indexMod.BrowserFsSearchIndex(store, snapshot, parser);
      idx.onProgress(p => {
        setProgress(p);
        // Only schedule a snapshot save once indexing has caught up. Saving
        // every 8 s during a cold pass dragged ~600–900 MB of transient
        // memory through main thread each time (worker toJSON → postMessage
        // clone → IDB put clone) and was the actual crash path on huge
        // vaults. When the index is complete the save is a one-time event;
        // mid-index crash recovery is handled by the visibilitychange /
        // beforeunload handlers below which force-save a checkpoint.
        if (p.total === 0 || p.indexed >= p.total) {
          scheduleSnapshotSave();
        }
      });
      idx.onTagsChange(setTags);
      idx.onMetaChange((id, patch) => { onMetaPatchRef.current?.(id, patch); });
      const li = idx.getLinkIndex();
      setLinkIndex(li);
      li.onChange(() => setLinksVersion(v => v + 1));
      idx.sync(notesRef.current);
      indexRef.current = idx;
      setReady(true);
      return idx;
    })();
    try { return await primePromiseRef.current; }
    catch (err) {
      console.error('[search] prime failed', err);
      primePromiseRef.current = null;
      throw err;
    }
  }, [store, scheduleSnapshotSave]);

  const prime = useCallback(async (): Promise<void> => {
    if (indexRef.current) return;
    await primeInternal(null).catch(() => undefined);
  }, [primeInternal]);

  const loadCachedSnapshot = useCallback(async () => {
    const snap = await loadSnapshot(vaultKeyRef.current);
    if (!snap) return null;
    // Seed the live notes ref so primeInternal's idx.sync() reconciles
    // against the cached state rather than an empty list.
    notesRef.current = snap.notes;
    foldersRef.current = snap.folders;
    try {
      await primeInternal(snap);
    } catch {
      return null;
    }
    return { notes: snap.notes, folders: snap.folders };
  }, [primeInternal]);

  // Whenever the caller's notes array changes, reconcile the index — but
  // only if it's already primed. Pre-prime, notesRef keeps the latest set.
  useEffect(() => {
    indexRef.current?.sync(notes);
  }, [notes]);

  const search = useCallback(async (q: SearchQuery) => {
    if (!indexRef.current) await prime();
    return indexRef.current?.search(q) ?? [];
  }, [prime]);

  const pushRecent = useCallback((id: string) => {
    const next = pushRecentStorage(vaultId, id);
    setRecent(next);
  }, [vaultId]);

  const updateNote = useCallback((id: string) => {
    void indexRef.current?.update(id);
  }, []);

  const removeNote = useCallback((id: string) => {
    indexRef.current?.remove(id);
    const next = removeRecent(vaultId, id);
    setRecent(next);
  }, [vaultId]);

  const renameNote = useCallback((oldId: string, newId: string) => {
    void indexRef.current?.rename(oldId, newId);
    const next = renameRecent(vaultId, oldId, newId);
    setRecent(next);
  }, [vaultId]);

  const getTagMembers = useCallback((tag: string): Set<string> => {
    return indexRef.current?.getNoteIdsForTag(tag) ?? new Set();
  }, []);

  const hideTag = useCallback((tag: string) => {
    const next = addHiddenTag(vaultId, tag);
    setHiddenTags(new Set(next));
  }, [vaultId]);

  const unhideTag = useCallback((tag: string) => {
    const next = removeHiddenTag(vaultId, tag);
    setHiddenTags(new Set(next));
  }, [vaultId]);

  const reset = useCallback(async (): Promise<void> => {
    if (snapshotTimerRef.current != null) {
      window.clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    indexRef.current?.dispose();
    indexRef.current = null;
    primePromiseRef.current = null;
    setReady(false);
    setProgress({ indexed: 0, total: 0 });
    setTags([]);
    setLinkIndex(null);
    await prime();
  }, [prime]);

  const dispose = useCallback(() => {
    if (snapshotTimerRef.current != null) {
      window.clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    indexRef.current?.dispose();
    indexRef.current = null;
    primePromiseRef.current = null;
    setReady(false);
    setProgress({ indexed: 0, total: 0 });
    setTags([]);
    setLinkIndex(null);
  }, []);

  return {
    loadCachedSnapshot, prime, search, progress, ready, recent, pushRecent,
    updateNote, removeNote, renameNote, tags, getTagMembers,
    hiddenTags, hideTag, unhideTag, reset, dispose,
    linkIndex, linksVersion,
  };
}
