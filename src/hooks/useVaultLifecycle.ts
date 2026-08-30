'use client';

// Vault state + lifecycle: owns the notes/folders arrays, the vault-id /
// storeReady / needsDirPick / loading / bfsLabel / bfsError flags, the
// vault-init effect, the load-on-vault-change effect, the cache-first
// `loadNotes` paint, and `pickBrowserDir` (the "switch folder" cascade).
// Pulled out of page.tsx as Step 9.
//
// The hook runs near the top of the page render (right after the basic
// useState block) because almost every other hook needs the live `notes`,
// `folders`, or `vaultId` it returns. That creates two forward-reference
// cycles, both resolved with refs (same `renameTemplateRef` /
// `refreshTemplatesRef` pattern that already lives in page.tsx):
//
//   1. `useSearch` consumes notes/folders/vaultId — so it runs AFTER this
//      hook — but this hook calls `loadCachedSnapshot` and `disposeSearch`
//      from useSearch on the cold-load + vault-switch paths. Resolved via
//      `loadCachedSnapshotRef` / `disposeSearchRef`.
//
//   2. `pickBrowserDir` synchronously clears every per-vault piece of state
//      before the new initialize() — including state owned by useTemplates
//      / useFolderCommands / useVaultScopedState / useLocalNoteMutations,
//      which all run AFTER this hook. Resolved via `vaultResetRef`: the
//      page populates the ref with a single reset function that calls into
//      every later hook's setters; pickBrowserDir invokes the ref at
//      call-time (always after first render, so the ref is wired by then).

import { useCallback, useEffect, useState } from 'react';
import {
  type NoteMeta, type NoteRevision, type NoteStore,
} from '@/lib/storage';
import { mergeListedNotes } from '@/lib/note-list';

export type LoadCachedSnapshot = () => Promise<{ notes: NoteMeta[]; folders: string[] } | null>;

export type UseVaultLifecycleParams = {
  store: NoteStore;
  /** Forward ref to useSearch's loadCachedSnapshot. Wired by page.tsx via
   *  useEffect after useSearch declares it. Initial value is a no-op that
   *  returns null, matching the cache-miss path. */
  loadCachedSnapshotRef: React.MutableRefObject<LoadCachedSnapshot>;
  /** Forward ref to useSearch's dispose. Called by pickBrowserDir before
   *  the new initialize() so the search index isn't warmed under the old
   *  vault key. */
  disposeSearchRef: React.MutableRefObject<() => void>;
  /** Forward ref to a "reset everything that sits per-vault" function
   *  composed by the page from useTemplates / useFolderCommands /
   *  useVaultScopedState / useLocalNoteMutations setters. Invoked
   *  synchronously inside pickBrowserDir. */
  vaultResetRef: React.MutableRefObject<() => void>;

  /** Active-state setters cleared on the cold-load path + on vault switch.
   *  These are page-owned `useState` setters (stable refs), so it's fine
   *  to pass them directly. */
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveUuid: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveText: React.Dispatch<React.SetStateAction<string>>;

  /** Editor's revision tracker — cleared by the cold-load path and the
   *  vault-switch cascade. Owned by useNoteAutosave; the ref instance is
   *  stable so it's safe to pass before useNoteAutosave runs (which it
   *  doesn't in the new ordering — autosave runs after lifecycle). */
  activeRevisionRef: React.MutableRefObject<NoteRevision | null>;

  /** From usePersistedUI — pickBrowserDir opens the sidebar after a
   *  successful vault switch so the user sees the new tree right away. */
  setSidebarOpen: (v: boolean) => void;
};

export type UseVaultLifecycleResult = {
  // --- State ---
  notes: NoteMeta[];
  setNotes: React.Dispatch<React.SetStateAction<NoteMeta[]>>;
  folders: string[];
  setFolders: React.Dispatch<React.SetStateAction<string[]>>;
  vaultId: string;
  bfsLabel: string;
  bfsError: string;
  needsDirPick: boolean;
  storeReady: boolean;
  loading: boolean;
  // --- Callbacks ---
  loadNotes: () => Promise<void>;
  pickBrowserDir: (forceNew?: boolean) => Promise<void>;
};

export function useVaultLifecycle(params: UseVaultLifecycleParams): UseVaultLifecycleResult {
  const {
    store,
    loadCachedSnapshotRef, disposeSearchRef, vaultResetRef,
    setActiveId, setActiveUuid, setActiveText,
    activeRevisionRef,
    setSidebarOpen,
  } = params;

  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [vaultId, setVaultId] = useState('');
  const [bfsLabel, setBfsLabel] = useState('');
  const [bfsError, setBfsError] = useState('');
  const [needsDirPick, setNeedsDirPick] = useState(false);
  const [storeReady, setStoreReady] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initial load — shows the "Loading..." placeholder.
  const loadNotes = useCallback(async () => {
    // Cache-first: if we have a snapshot for this vault, paint the UI in
    // milliseconds and refresh in the background. The background walk
    // flows back through setNotes → index.sync(), which diffs size+mtime
    // and re-queues only files that changed on disk.
    try {
      const cached = await loadCachedSnapshotRef.current();
      if (cached) {
        setNotes(cached.notes);
        setFolders(cached.folders);
        setLoading(false);
        void (async () => {
          try {
            const data = await store.list();
            // Merge, don't replace. The walk only knows file-fingerprint
            // data (size, mtimeMs) — titles and dates may already be
            // refined in state by body indexing. Replacing wholesale would
            // wipe those refinements; the merge keeps them and lets the
            // index's size/mtime diff still detect real file changes.
            setNotes(prev => mergeListedNotes(prev, data.notes));
            setFolders(data.folders);
          } catch (err) {
            console.warn('[notes] background refresh failed', err);
          }
        })();
        return;
      }
    } catch (err) {
      console.warn('[notes] cache load failed', err);
    }
    setLoading(true);
    try {
      const data = await store.list();
      setNotes(data.notes);
      setFolders(data.folders);
      setActiveId(null);
      setActiveUuid(null);
      setActiveText('');
      activeRevisionRef.current = null;
    } catch (err) {
      // Most common cause in browser-fs mode: the saved FileSystemHandle
      // points at a folder that moved/was deleted. Surface an error and
      // let the user re-pick.
      console.error('Failed to list notes:', err);
      setNotes([]);
      setFolders([]);
      setNeedsDirPick(true);
      setBfsError('Could not read the saved folder — pick it again.');
      activeRevisionRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [
    store, loadCachedSnapshotRef,
    activeRevisionRef, setActiveId, setActiveText, setActiveUuid,
  ]);

  // Initialize storage + fetch notes on mount. `storeReady` gets reset at
  // the top so a store-instance swap (HMR rebuilds the module-scoped
  // BrowserFsStore singleton) drops us back to the pick/loading screen
  // instead of rendering the main UI over a null dirHandle.
  useEffect(() => {
    let cancelled = false;
    setStoreReady(false);
    setLoading(true);
    (async () => {
      try {
        const status = await store.initialize();
        if (cancelled) return;
        setBfsLabel(status.label || '');
        setVaultId(status.vaultId || '');
        if (!status.ready) {
          setNeedsDirPick(!!status.needsPicker);
          if (status.label && !status.needsPicker) setBfsError(status.label);
          setLoading(false);
          return;
        }
        setNeedsDirPick(false);
        setBfsError('');
        setStoreReady(true);
      } catch (err) {
        // Anything thrown by store.initialize() (IndexedDB hiccup, etc.) would
        // otherwise leave `loading` stuck at true.
        console.error('Failed to initialize notes store:', err);
        if (!cancelled) {
          setVaultId('');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [store]);

  // Load notes whenever the vault changes — initial set or folder re-pick.
  // Gated on storeReady so we never race the init effect. The useSearch
  // hook keeps vaultKeyRef in sync with vaultId via its own effect (which
  // fires before this one because it's declared earlier during the
  // render), so loadCachedSnapshot reads the right key.
  useEffect(() => {
    if (!storeReady) return;
    void loadNotes();
  }, [storeReady, vaultId, loadNotes]);

  // --- Directory picker ---
  // forceNew=true ensures the native picker always opens, even when a handle
  // is already granted (used by the bottom "switch folder" button). The
  // try/catch logs every failure mode — showDirectoryPicker is picky about
  // transient user activation, so any async work inside pickDirectory that
  // runs before it can cause a silent AbortError that otherwise vanishes.
  //
  // Switching folders: clear every bit of per-vault state synchronously so
  // the UI doesn't render the previous vault's notes against a dirHandle
  // that now points elsewhere. The load-on-vault-change effect picks up
  // once bfsLabel (→ vaultId) updates and triggers loadNotes with the
  // correct vaultKey.
  const pickBrowserDir = useCallback(async (forceNew = false) => {
    try {
      const picked = await store.pickDirectory({ forceNew });
      if (!picked) return;
      setNotes([]);
      setFolders([]);
      setActiveId(null);
      setActiveUuid(null);
      setActiveText('');
      // Clear all the cross-cutting per-vault state owned by later hooks
      // (templates, expanded set, target folder, tag/saved-search filters,
      // auto-title set). Wired by the page via useEffect — see vaultResetRef.
      vaultResetRef.current();
      activeRevisionRef.current = null;
      setBfsLabel('');
      setVaultId('');
      setLoading(true);
      setNeedsDirPick(false);
      setBfsError('');
      // Tear down the old index without re-priming. Rebuild happens after the
      // new vault id is known, which avoids warming the new handle under the
      // previous vault's cache key.
      disposeSearchRef.current();
      const status = await store.initialize();
      setBfsLabel(status.label || '');
      setVaultId(status.vaultId || '');
      setStoreReady(true);
      setSidebarOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[notes] pickDirectory failed:', err);
      // AbortError = user cancelled the native picker — not worth a banner.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setBfsError(`Could not open folder picker: ${msg}`);
    }
  }, [
    store, disposeSearchRef, vaultResetRef,
    setSidebarOpen,
    activeRevisionRef, setActiveId, setActiveText, setActiveUuid,
  ]);

  return {
    notes, setNotes, folders, setFolders,
    vaultId, bfsLabel, bfsError, needsDirPick, storeReady, loading,
    loadNotes, pickBrowserDir,
  };
}
