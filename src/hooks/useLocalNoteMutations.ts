'use client';

// Local state patchers that keep the in-memory `notes`/`folders` arrays in
// sync with store mutations without re-walking the entire vault. Each helper
// is meant to run *after* the corresponding store call succeeds — failures
// propagate as thrown errors and leave state untouched.
//
// This hook also owns the "auto-title" ref: the set of note ids whose title
// should track the first body line until the user manually edits the title.
// Freshly-created notes land in the set, and renames/deletions have to
// keep the set consistent with the note ids in the store.

import { useCallback, useRef } from 'react';
import type { NoteMeta } from '@/lib/storage';

export type LocalNoteMutations = {
  removeFolderLocal: (path: string) => void;
  addFolderLocal: (path: string) => void;
  renameFolderLocal: (oldPath: string, newPath: string) => void;
  moveLocal: (srcId: string, newId: string) => void;
  prependNoteLocal: (meta: NoteMeta) => void;
  // Auto-title set
  hasAutoTitle: (id: string) => boolean;
  addAutoTitle: (id: string) => void;
  deleteAutoTitle: (id: string) => void;
  clearAutoTitles: () => void;
  pruneAutoTitleNotes: (path: string) => void;
  remapAutoTitleNotes: (oldPath: string, newPath: string, opts?: { folder?: boolean }) => void;
};

export function useLocalNoteMutations(
  setNotes: React.Dispatch<React.SetStateAction<NoteMeta[]>>,
  setFolders: React.Dispatch<React.SetStateAction<string[]>>,
  indexRemove: (id: string) => void,
  indexRename: (oldId: string, newId: string) => void,
): LocalNoteMutations {
  const autoTitleRef = useRef<Set<string>>(new Set());

  // Deleting a folder removes everything beneath it in one shot. Filter by
  // the exact path and its `${path}/` prefix so siblings that happen to share
  // a name segment aren't affected.
  const removeFolderLocal = useCallback((path: string) => {
    const prefix = `${path}/`;
    setNotes(prev => {
      const next: NoteMeta[] = [];
      for (const n of prev) {
        if (n.id === path || n.id.startsWith(prefix)) {
          indexRemove(n.id);
        } else {
          next.push(n);
        }
      }
      return next.length === prev.length ? prev : next;
    });
    setFolders(prev => prev.filter(f => f !== path && !f.startsWith(prefix)));
  }, [indexRemove, setNotes, setFolders]);

  // Add `path` plus every ancestor so creating "a/b/c" when a/b is new
  // registers all three folder rows.
  const addFolderLocal = useCallback((path: string) => {
    setFolders(prev => {
      const set = new Set(prev);
      const parts = path.split('/').filter(Boolean);
      let p = '';
      for (const part of parts) {
        p = p ? `${p}/${part}` : part;
        set.add(p);
      }
      return Array.from(set).sort();
    });
  }, [setFolders]);

  // Folder rename remaps every descendant note id (so the index can move its
  // body docs with indexRename) and every descendant folder path.
  const renameFolderLocal = useCallback((oldPath: string, newPath: string) => {
    const prefix = `${oldPath}/`;
    setFolders(prev => prev.map(f => {
      if (f === oldPath) return newPath;
      if (f.startsWith(prefix)) return `${newPath}${f.slice(oldPath.length)}`;
      return f;
    }).sort());
    setNotes(prev => prev.map(n => {
      if (n.id === oldPath || n.id.startsWith(prefix)) {
        const remapped = n.id === oldPath ? newPath : `${newPath}${n.id.slice(oldPath.length)}`;
        indexRename(n.id, remapped);
        return { ...n, id: remapped };
      }
      return n;
    }));
  }, [indexRename, setFolders, setNotes]);

  // Move remaps the source id (and, for folders, its entire subtree). The
  // caller supplies both the pre-move srcId and the post-move newId.
  const moveLocal = useCallback((srcId: string, newId: string) => {
    const isNote = srcId.endsWith('.md');
    if (isNote) {
      setNotes(prev => prev.map(n => n.id === srcId ? { ...n, id: newId } : n));
      return;
    }
    const prefix = `${srcId}/`;
    setFolders(prev => {
      const set = new Set<string>();
      for (const f of prev) {
        if (f === srcId) set.add(newId);
        else if (f.startsWith(prefix)) set.add(`${newId}${f.slice(srcId.length)}`);
        else set.add(f);
      }
      // Ensure the destination parent is registered.
      const newParts = newId.split('/').filter(Boolean);
      let p = '';
      for (const part of newParts) {
        p = p ? `${p}/${part}` : part;
        set.add(p);
      }
      return Array.from(set).sort();
    });
    setNotes(prev => prev.map(n => {
      if (n.id.startsWith(prefix)) {
        const remapped = `${newId}${n.id.slice(srcId.length)}`;
        indexRename(n.id, remapped);
        return { ...n, id: remapped };
      }
      return n;
    }));
  }, [indexRename, setFolders, setNotes]);

  const prependNoteLocal = useCallback((meta: NoteMeta) => {
    setNotes(prev => [meta, ...prev.filter(n => n.id !== meta.id)]);
  }, [setNotes]);

  // --- Auto-title set operations ---
  const hasAutoTitle = useCallback((id: string) => autoTitleRef.current.has(id), []);
  const addAutoTitle = useCallback((id: string) => { autoTitleRef.current.add(id); }, []);
  const deleteAutoTitle = useCallback((id: string) => { autoTitleRef.current.delete(id); }, []);
  const clearAutoTitles = useCallback(() => { autoTitleRef.current = new Set(); }, []);

  const pruneAutoTitleNotes = useCallback((path: string) => {
    const next = new Set<string>();
    for (const id of Array.from(autoTitleRef.current)) {
      if (id === path || id.startsWith(`${path}/`)) continue;
      next.add(id);
    }
    autoTitleRef.current = next;
  }, []);

  const remapAutoTitleNotes = useCallback((oldPath: string, newPath: string, opts?: { folder?: boolean }) => {
    const next = new Set<string>();
    for (const id of Array.from(autoTitleRef.current)) {
      if (opts?.folder) {
        if (id.startsWith(`${oldPath}/`)) next.add(`${newPath}${id.slice(oldPath.length)}`);
        else next.add(id);
        continue;
      }
      next.add(id === oldPath ? newPath : id);
    }
    autoTitleRef.current = next;
  }, []);

  return {
    removeFolderLocal, addFolderLocal, renameFolderLocal, moveLocal, prependNoteLocal,
    hasAutoTitle, addAutoTitle, deleteAutoTitle, clearAutoTitles,
    pruneAutoTitleNotes, remapAutoTitleNotes,
  };
}
