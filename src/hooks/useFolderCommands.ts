'use client';

// Folder + tree-mutation commands: expand/collapse, target tracking,
// folder create, rename, delete, and the cross-cutting move handler that
// remaps active id, locked/pinned sets, expanded set, link index, and
// path-style wikilinks. Pulled out of page.tsx as Step 8.
//
// This hook owns the `expanded` and `targetFolder` page state; both setters
// are exposed because the vault-switch flow in page.tsx (`pickBrowserDir`)
// resets them synchronously. It runs BEFORE useNoteCommands in the function
// body because useNoteCommands consumes `expandPath` and `setTargetFolder`.
//
// `deleteItem`, `handleRenameFolder`, and `handleMove` all carry the live
// editor body across the remount so an in-flight edit doesn't snap back to
// the pre-edit snapshot — useNoteAutosave's `getMarkdownRef` is the source
// of truth here.

import { useCallback, useState } from 'react';
import { refactorLinks } from '@/lib/links/link-refactor';
import {
  type NoteMeta, type NoteRevision, type NoteStore,
} from '@/lib/storage';
import type { LinkIndex } from '@/lib/links/link-index';

type SyncPostMessage =
  | { type: 'note-saved'; id: string; previousId?: string }
  | { type: 'notes-changed' }
  | { type: 'template-saved'; id: string }
  | { type: 'templates-changed' };

export type UseFolderCommandsParams = {
  // --- Store + activity ---
  store: NoteStore;
  activeId: string | null;
  /** Live last-known body — read as the fallback when getMarkdownRef hasn't
   *  been wired by the editor yet. */
  activeText: string;
  /** For wikilink path refactor on move. Null when the index hasn't been
   *  built yet (early boot); refactor is then skipped. */
  linkIndex: LinkIndex | null;

  // --- Refs from useNoteAutosave (read + reset on remap) ---
  getMarkdownRef: React.MutableRefObject<(() => string) | null>;
  lastSavedRef: React.MutableRefObject<string>;
  lastSavedTitleRef: React.MutableRefObject<string>;
  activeRevisionRef: React.MutableRefObject<NoteRevision | null>;
  editorReadyRef: React.MutableRefObject<boolean>;

  // --- Callbacks from useNoteAutosave ---
  flushSave: (opts?: { force?: boolean }) => Promise<void>;
  flushTitleSave: () => Promise<void>;

  // --- Local-mutation helpers (note list / folder list / auto-title set) ---
  addFolderLocal: (folder: string) => void;
  removeFolderLocal: (folder: string) => void;
  renameFolderLocal: (oldPath: string, newPath: string) => void;
  moveLocal: (oldId: string, newId: string) => void;
  pruneAutoTitleNotes: (path: string) => void;
  remapAutoTitleNotes: (oldId: string, newId: string, opts: { folder: boolean }) => void;

  // --- Pin / lock state (page-owned because the sidebar reads them) ---
  setPinned: React.Dispatch<React.SetStateAction<Set<string>>>;
  persistPinned: (next: Set<string>) => void;
  setLockedNotes: React.Dispatch<React.SetStateAction<Set<string>>>;
  persistLocked: (next: Set<string>) => void;

  // --- Search index sync ---
  indexRemove: (id: string) => void;
  indexRename: (oldId: string, newId: string) => void;

  // --- Tab sync ---
  syncPost: (msg: SyncPostMessage) => void;

  // --- Page state setters ---
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveUuid: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveText: React.Dispatch<React.SetStateAction<string>>;
  setNotes: React.Dispatch<React.SetStateAction<NoteMeta[]>>;
};

export type UseFolderCommandsResult = {
  // --- State ---
  expanded: Set<string>;
  /** Exposed because pickBrowserDir resets it on vault switch. */
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  targetFolder: string;
  /** Exposed for pickBrowserDir reset + useNoteCommands consumption. */
  setTargetFolder: React.Dispatch<React.SetStateAction<string>>;
  // --- Tree expansion ---
  expandPath: (path: string) => void;
  toggleFolder: (path: string) => void;
  handleFolderClick: (path: string) => void;
  revealFolderInSidebar: (path: string) => void;
  // --- CRUD ---
  deleteItem: (path: string) => Promise<void>;
  createFolder: () => Promise<void>;
  createFolderAt: (parentFolder: string, name: string) => Promise<void>;
  handleRenameFolder: (oldPath: string, newName: string) => Promise<void>;
  handleMove: (srcId: string, destFolder: string) => Promise<void>;
};

export function useFolderCommands(params: UseFolderCommandsParams): UseFolderCommandsResult {
  const {
    store, activeId, activeText, linkIndex,
    getMarkdownRef, lastSavedRef, lastSavedTitleRef, activeRevisionRef, editorReadyRef,
    flushSave, flushTitleSave,
    addFolderLocal, removeFolderLocal, renameFolderLocal, moveLocal,
    pruneAutoTitleNotes, remapAutoTitleNotes,
    setPinned, persistPinned, setLockedNotes, persistLocked,
    indexRemove, indexRename,
    syncPost,
    setActiveId, setActiveUuid, setActiveText, setNotes,
  } = params;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [targetFolder, setTargetFolder] = useState('');

  // Expand a folder + all its ancestors. Used after moves/creates so the
  // newly-placed item is visible without the user having to click around.
  const expandPath = useCallback((path: string) => {
    if (!path) return;
    setExpanded(prev => {
      const parts = path.split('/').filter(Boolean);
      const next = new Set(prev);
      let p = '';
      for (const part of parts) {
        p = p ? `${p}/${part}` : part;
        next.add(p);
      }
      return next;
    });
  }, []);

  const toggleFolder = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Clicking a folder row: make it the target AND toggle expansion.
  const handleFolderClick = useCallback((path: string) => {
    setTargetFolder(path);
    if (path === '') return; // root doesn't toggle
    toggleFolder(path);
  }, [toggleFolder]);

  const revealFolderInSidebar = useCallback((path: string) => {
    setTargetFolder(path);
    expandPath(path);
  }, [expandPath]);

  // Delete a note or folder by path. Called from the hover action buttons
  // in the tree. Caller (NoteTree) is responsible for confirmation UX.
  const deleteItem = useCallback(async (path: string) => {
    const isNote = path.endsWith('.md');
    try {
      if (isNote) {
        await store.delete(path);
      } else {
        await store.deleteFolder(path);
      }
    } catch (err) {
      window.alert(`Could not delete: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    pruneAutoTitleNotes(path);
    if (isNote) indexRemove(path);
    syncPost({ type: 'notes-changed' });
    // Clear active selection if it was under the deleted path
    if (activeId && (activeId === path || activeId.startsWith(`${path}/`))) {
      setActiveId(null);
      setActiveUuid(null);
      setActiveText('');
      activeRevisionRef.current = null;
      getMarkdownRef.current = null;
      editorReadyRef.current = false;
    }
    // Drop pin + expanded entries for anything under the deleted path
    setPinned(prev => {
      const next = new Set(prev);
      for (const p of Array.from(prev)) {
        if (p === path || p.startsWith(`${path}/`)) next.delete(p);
      }
      persistPinned(next);
      return next;
    });
    setLockedNotes(prev => {
      const next = new Set(prev);
      for (const p of Array.from(prev)) {
        if (p === path || p.startsWith(`${path}/`)) next.delete(p);
      }
      persistLocked(next);
      return next;
    });
    setExpanded(prev => {
      const next = new Set(prev);
      for (const p of Array.from(prev)) {
        if (p === path || p.startsWith(`${path}/`)) next.delete(p);
      }
      return next;
    });
    if (targetFolder === path || targetFolder.startsWith(`${path}/`)) {
      setTargetFolder('');
    }
    if (isNote) {
      setNotes(prev => prev.filter(n => n.id !== path));
    } else {
      removeFolderLocal(path);
    }
  }, [
    store, activeId, targetFolder,
    indexRemove, removeFolderLocal, pruneAutoTitleNotes,
    persistLocked, persistPinned, setLockedNotes, setPinned,
    syncPost,
    activeRevisionRef, editorReadyRef, getMarkdownRef,
    setActiveId, setActiveText, setActiveUuid, setNotes,
  ]);

  const createFolder = useCallback(async () => {
    const label = targetFolder
      ? `New folder name inside "${targetFolder}" (use '/' to nest deeper):`
      : "New folder name (use '/' to nest, e.g. 'ideas/trading'):";
    const input = window.prompt(label);
    if (!input) return;
    const fullPath = targetFolder ? `${targetFolder}/${input}` : input;
    try {
      await store.createFolder(fullPath);
      addFolderLocal(fullPath);
      syncPost({ type: 'notes-changed' });
      expandPath(fullPath);
      setTargetFolder(fullPath);
    } catch (err) {
      window.alert(`Could not create folder: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [store, addFolderLocal, targetFolder, expandPath, syncPost]);

  // Non-interactive folder creation for callers that already have a name —
  // used by the file explorer palette, which collects the name via an inline
  // input instead of window.prompt.
  const createFolderAt = useCallback(async (parentFolder: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const fullPath = parentFolder ? `${parentFolder}/${trimmed}` : trimmed;
    try {
      await store.createFolder(fullPath);
      addFolderLocal(fullPath);
      syncPost({ type: 'notes-changed' });
      expandPath(fullPath);
    } catch (err) {
      window.alert(`Could not create folder: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [store, addFolderLocal, expandPath, syncPost]);

  const handleRenameFolder = useCallback(async (oldPath: string, newName: string) => {
    // Flush pending saves if the active note lives under the folder being renamed
    const activeUnder = activeId && (activeId === oldPath || activeId.startsWith(`${oldPath}/`));
    if (activeUnder) {
      await flushSave();
      await flushTitleSave();
    }
    let newPath: string;
    try {
      newPath = await store.renameFolder(oldPath, newName);
    } catch (err) {
      window.alert(`Could not rename folder: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    // Remap activeId if it was under the renamed folder
    if (activeUnder && activeId) {
      const remapped = activeId === oldPath
        ? newPath
        : `${newPath}${activeId.slice(oldPath.length)}`;
      // Editor is keyed on activeId and takes `defaultValue={activeText}` on
      // mount. `activeText` only refreshes on note load — typing never
      // touches it — so a remount here would revert to the pre-edit snapshot.
      // Pull the live markdown across the remount (flushSave already wrote it
      // to the new path on disk).
      setActiveText(getMarkdownRef.current?.() ?? activeText);
      setActiveId(remapped);
      lastSavedRef.current = '';
      lastSavedTitleRef.current = '';
      activeRevisionRef.current = null;
      getMarkdownRef.current = null;
      editorReadyRef.current = false;
    }
    // Update pinned entries
    setPinned(prev => {
      const next = new Set<string>();
      for (const p of Array.from(prev)) {
        if (p === oldPath) next.add(newPath);
        else if (p.startsWith(`${oldPath}/`)) next.add(`${newPath}${p.slice(oldPath.length)}`);
        else next.add(p);
      }
      persistPinned(next);
      return next;
    });
    // Update locked note ids
    setLockedNotes(prev => {
      const next = new Set<string>();
      for (const p of Array.from(prev)) {
        if (p === oldPath) next.add(newPath);
        else if (p.startsWith(`${oldPath}/`)) next.add(`${newPath}${p.slice(oldPath.length)}`);
        else next.add(p);
      }
      persistLocked(next);
      return next;
    });
    // Update expanded entries
    setExpanded(prev => {
      const next = new Set<string>();
      for (const p of Array.from(prev)) {
        if (p === oldPath) next.add(newPath);
        else if (p.startsWith(`${oldPath}/`)) next.add(`${newPath}${p.slice(oldPath.length)}`);
        else next.add(p);
      }
      return next;
    });
    // Update targetFolder if it was under the renamed path
    if (targetFolder === oldPath) setTargetFolder(newPath);
    else if (targetFolder.startsWith(`${oldPath}/`)) setTargetFolder(`${newPath}${targetFolder.slice(oldPath.length)}`);
    remapAutoTitleNotes(oldPath, newPath, { folder: true });
    renameFolderLocal(oldPath, newPath);
    syncPost({ type: 'notes-changed' });
  }, [
    store, activeId, activeText, targetFolder,
    flushSave, flushTitleSave, renameFolderLocal, remapAutoTitleNotes,
    persistLocked, persistPinned, setLockedNotes, setPinned, syncPost,
    activeRevisionRef, editorReadyRef, getMarkdownRef, lastSavedRef, lastSavedTitleRef,
    setActiveId, setActiveText,
  ]);

  const handleMove = useCallback(async (srcId: string, destFolder: string) => {
    const srcIsFolder = !srcId.endsWith('.md');
    // If the active note is being moved (directly or via its ancestor folder),
    // flush pending saves first so writes land on the old path, then rewrite
    // activeId to the new path after the move completes.
    const activeUnderSrc = activeId && (
      srcIsFolder ? (activeId === srcId || activeId.startsWith(`${srcId}/`)) : activeId === srcId
    );
    if (activeUnderSrc) {
      await flushSave();
      await flushTitleSave();
    }
    let newId: string;
    try {
      newId = await store.move(srcId, destFolder);
    } catch (err) {
      window.alert(`Could not move: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    // Rewire recent + index for the moved note itself. Folder moves remap
    // every descendant; the notes-array sync below covers the index side,
    // but the recent list would orphan the old ids — acceptable tradeoff.
    if (!srcIsFolder) indexRename(srcId, newId);
    if (activeUnderSrc && activeId) {
      const remapped = srcIsFolder
        ? `${newId}${activeId.slice(srcId.length)}`
        : newId;
      // Preserve the live editor body across the remount — see handleRenameFolder.
      setActiveText(getMarkdownRef.current?.() ?? activeText);
      setActiveId(remapped);
      lastSavedRef.current = '';
      lastSavedTitleRef.current = '';
      activeRevisionRef.current = null;
      getMarkdownRef.current = null;
      editorReadyRef.current = false;
    }
    // Remap locked ids that sat at or under the moved source.
    setLockedNotes(prev => {
      let changed = false;
      const next = new Set<string>();
      for (const p of Array.from(prev)) {
        if (srcIsFolder) {
          if (p === srcId) { next.add(newId); changed = true; }
          else if (p.startsWith(`${srcId}/`)) { next.add(`${newId}${p.slice(srcId.length)}`); changed = true; }
          else next.add(p);
        } else {
          if (p === srcId) { next.add(newId); changed = true; }
          else next.add(p);
        }
      }
      if (!changed) return prev;
      persistLocked(next);
      return next;
    });
    remapAutoTitleNotes(srcId, newId, { folder: srcIsFolder });
    moveLocal(srcId, newId);
    // Refactor path-style wikilinks that referenced the old id. Title-based
    // links (`[[My Note]]`) don't need rewriting — the title itself didn't
    // change during a move — but anyone who wrote `[[projects/foo]]` needs
    // the path bumped to the new location.
    if (linkIndex && !srcIsFolder) {
      const oldKey = srcId.replace(/\.md$/, '');
      const newKey = newId.replace(/\.md$/, '');
      if (oldKey !== newKey) {
        void refactorLinks(store, linkIndex, oldKey, newKey).then(r => {
          if (r.notesUpdated > 0) syncPost({ type: 'notes-changed' });
        });
      }
    }
    syncPost({ type: 'notes-changed' });
    // Expand the destination so the moved item is visible right away.
    const destPath = srcIsFolder ? newId : destFolder;
    if (destPath) expandPath(destPath);
    // Moving into a folder also sets that folder as the create target.
    setTargetFolder(destFolder);
  }, [
    store, activeId, activeText, flushSave, flushTitleSave,
    moveLocal, expandPath, indexRename, remapAutoTitleNotes,
    linkIndex, persistLocked, setLockedNotes, syncPost,
    activeRevisionRef, editorReadyRef, getMarkdownRef, lastSavedRef, lastSavedTitleRef,
    setActiveId, setActiveText,
  ]);

  return {
    expanded, setExpanded,
    targetFolder, setTargetFolder,
    expandPath, toggleFolder, handleFolderClick, revealFolderInSidebar,
    deleteItem, createFolder, createFolderAt, handleRenameFolder, handleMove,
  };
}
