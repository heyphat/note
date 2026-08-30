'use client';

// Note-level commands: select, create, close, delete, duplicate, export,
// import, drop, link-mention, navigate-link, plus the lock toggle and the
// confirm-delete two-click state. Pulled out of page.tsx as Step 7.
//
// This hook sits "above" useNoteAutosave + useTemplates: it consumes their
// refs/callbacks (flushSave, doSave, lastSavedRef, getMarkdownRef, etc.)
// and exposes the user-facing actions that those refs back. selectNote
// in particular is the single funnel for switching the active note —
// useUrlRouting calls it on popstate / boot restore, the sidebar calls it
// on row click, the palette calls it from search results, and the wikilink
// click handler calls it after resolving.
//
// `linkResolverRef` is threaded in via the same forward-ref pattern as
// `renameTemplateRef` because the resolver is rebuilt later in page.tsx
// from the live `notes` array. Click-time invocations of handleNavigateLink
// read the latest map through the ref — initial render is fine because the
// resolver populates synchronously on mount.

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveLink } from '@/lib/links/link-resolver';
import { parseWikiLinks } from '@/lib/links/link-parser';
import { exportNoteToPdf } from '@/lib/export-pdf';
import { urlFromId } from '@/lib/routing';
import {
  DEFAULT_NEW_NOTE_TITLE, DEFAULT_NEW_NOTE_BODY, deriveTitleFromMarkdown,
} from '@/lib/title';
import { type NoteMeta, type NoteRevision, type NoteStore } from '@/lib/storage';
import type { TocHeading } from '@/components/TableOfContents';
import type { SaveStatus } from './useNoteAutosave';

// Mirror of useTabSync's SyncPostMessage variants we send. Kept inline so
// this hook doesn't depend on the tab-sync module internals.
type SyncPostMessage =
  | { type: 'note-saved'; id: string; previousId?: string }
  | { type: 'notes-changed' }
  | { type: 'template-saved'; id: string }
  | { type: 'templates-changed' };

export const DELETE_CONFIRM_MS = 3000;

export type UseNoteCommandsParams = {
  // --- Store + activity ---
  store: NoteStore;
  activeId: string | null;
  activeTemplate: string | null;
  activeText: string;
  targetFolder: string;
  locale: string;
  /** Fallback title when a stored note has no title field (legacy notes
   *  written before the title frontmatter landed). The note/ app passes the
   *  literal 'Untitled'; the web/ app passes its localized `tCommon('untitled')`. */
  untitledLabel: string;

  // --- Refs from useNoteAutosave (read + reset on note switch) ---
  getMarkdownRef: React.MutableRefObject<(() => string) | null>;
  lastSavedRef: React.MutableRefObject<string>;
  lastSavedTitleRef: React.MutableRefObject<string>;
  activeRevisionRef: React.MutableRefObject<NoteRevision | null>;
  editorReadyRef: React.MutableRefObject<boolean>;
  autoSaveTimerRef: React.MutableRefObject<number | null>;
  titleSaveTimerRef: React.MutableRefObject<number | null>;

  // --- Callbacks from useNoteAutosave ---
  flushSave: (opts?: { force?: boolean }) => Promise<void>;
  flushTitleSave: () => Promise<void>;
  doSave: (id: string, body: string, opts?: { force?: boolean }) => Promise<void>;
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>;

  // --- Local-mutation helpers (note list + auto-title set) ---
  prependNoteLocal: (meta: NoteMeta) => void;
  addAutoTitle: (id: string) => void;
  pruneAutoTitleNotes: (path: string) => void;
  addFolderLocal: (folder: string) => void;

  // --- Lock state (page-owned because the sidebar reads it for the row badge) ---
  lockedNotes: Set<string>;
  setLockedNotes: React.Dispatch<React.SetStateAction<Set<string>>>;
  persistLocked: (next: Set<string>) => void;

  // --- Search index sync ---
  indexRemove: (id: string) => void;

  // --- Tab sync + dirty tracking ---
  syncPost: (msg: SyncPostMessage) => void;
  clearDirty: () => void;

  // --- Wikilink resolver (forward-ref — populated later in page.tsx) ---
  linkResolverRef: React.MutableRefObject<Map<string, NoteMeta>>;

  // --- Page state setters ---
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveUuid: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveText: React.Dispatch<React.SetStateAction<string>>;
  setActiveTemplate: React.Dispatch<React.SetStateAction<string | null>>;
  setEditingTitle: React.Dispatch<React.SetStateAction<string>>;
  setEditorVersion: React.Dispatch<React.SetStateAction<number>>;
  setTocHeadings: React.Dispatch<React.SetStateAction<TocHeading[]>>;
  /** Comes from usePersistedUI which exposes the simpler signature. */
  setSidebarOpen: (v: boolean) => void;
  setTargetFolder: React.Dispatch<React.SetStateAction<string>>;
  setNotes: React.Dispatch<React.SetStateAction<NoteMeta[]>>;
  setDragging: React.Dispatch<React.SetStateAction<boolean>>;
  expandPath: (path: string) => void;
  pushRecent: (id: string) => void;

  // --- URL routing hint (page-owned ref the URL-mirror effect reads) ---
  nextUrlOpRef: React.MutableRefObject<'push' | 'replace'>;
};

export type UseNoteCommandsResult = {
  // --- Lock ---
  isLocked: boolean;
  toggleLock: () => void;
  // --- Selection / lifecycle ---
  selectNote: (id: string, opts?: { replace?: boolean }) => Promise<void>;
  createNoteInFolder: (
    parentFolder?: string,
    opts?: { replaceUrl?: boolean; seedMessage?: string },
  ) => Promise<NoteMeta>;
  createNote: () => Promise<void>;
  closeActiveNote: () => Promise<void>;
  // --- Delete (two-click confirm) ---
  deleteNote: () => Promise<void>;
  confirmDelete: boolean;
  // --- Misc actions ---
  handleDuplicate: (id: string) => Promise<void>;
  handleExport: (id: string) => Promise<void>;
  handleLinkMention: (title: string) => Promise<void>;
  handleNavigateLink: (target: string) => void;
  // --- Import / drop ---
  importFile: (file: File) => Promise<void>;
  importFiles: (files: FileList | File[]) => Promise<void>;
  handleDrop: (e: React.DragEvent) => void;
};

export function useNoteCommands(params: UseNoteCommandsParams): UseNoteCommandsResult {
  const {
    store, activeId, activeTemplate, activeText, targetFolder, locale, untitledLabel,
    getMarkdownRef, lastSavedRef, lastSavedTitleRef, activeRevisionRef,
    editorReadyRef, autoSaveTimerRef, titleSaveTimerRef,
    flushSave, flushTitleSave, doSave, setSaveStatus,
    prependNoteLocal, addAutoTitle, pruneAutoTitleNotes, addFolderLocal,
    lockedNotes, setLockedNotes, persistLocked,
    indexRemove, syncPost, clearDirty,
    linkResolverRef,
    setActiveId, setActiveUuid, setActiveText, setActiveTemplate,
    setEditingTitle, setEditorVersion, setTocHeadings,
    setSidebarOpen, setTargetFolder, setNotes, setDragging,
    expandPath, pushRecent, nextUrlOpRef,
  } = params;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteTimerRef = useRef<number | null>(null);

  // Cleanup the delete-confirm timer on unmount.
  useEffect(() => () => {
    if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
  }, []);

  const isLocked = !!(activeId && lockedNotes.has(activeId));

  const toggleLock = useCallback(() => {
    if (!activeId) return;
    // Cancel any pending autosave before freezing — otherwise a keystroke
    // that happened moments before the lock could still land after.
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setLockedNotes(prev => {
      const next = new Set(prev);
      if (next.has(activeId)) next.delete(activeId);
      else next.add(activeId);
      persistLocked(next);
      return next;
    });
  }, [activeId, autoSaveTimerRef, persistLocked, setLockedNotes]);

  // `replace: true` suppresses the history push — used by the boot restore
  // (URL already matches the target state) and the popstate handler (browser
  // already moved the pointer; re-pushing would corrupt the stack). User
  // clicks leave `replace` undefined so the default push behavior runs and
  // the browser back button walks through the notes you've visited.
  const selectNote = useCallback(async (id: string, opts?: { replace?: boolean }) => {
    nextUrlOpRef.current = opts?.replace ? 'replace' : 'push';
    await flushSave();
    await flushTitleSave();
    const data = await store.get(id);
    if (!data) return;
    pushRecent(id);
    // Pre-resolve any ./{base}.assets/* references into blob URLs before the
    // editor mounts. Milkdown's proxyDomURL is synchronous, so this must be
    // awaited — otherwise the first render gets the raw relative URL and
    // images fail to load.
    await store.preloadAssets(id, data.text || '');
    // Re-arm body→title tracking on reload. The autoTitle set is session-scoped,
    // so without this a user who reloads mid-edit loses the live title sync.
    // We treat the note as auto-titled when the stored title is still the
    // default, or when it exactly matches the first body heading — i.e. the
    // user hasn't manually renamed it yet.
    const derivedFromBody = deriveTitleFromMarkdown(data.text || '');
    const storedTitle = (data.title || '').trim();
    if (!storedTitle
      || storedTitle === DEFAULT_NEW_NOTE_TITLE
      || (!!derivedFromBody && derivedFromBody === storedTitle)) {
      addAutoTitle(id);
    }
    setActiveId(id);
    setActiveUuid(data.uuid || null);
    setActiveTemplate(null);
    setActiveText(data.text || '');
    setEditingTitle(data.title || untitledLabel);
    lastSavedRef.current = data.text || '';
    lastSavedTitleRef.current = data.title || untitledLabel;
    activeRevisionRef.current = { size: data.size, mtimeMs: data.mtimeMs };
    setSaveStatus('idle');
    setConfirmDelete(false);
    getMarkdownRef.current = null;
    editorReadyRef.current = false;
    setTocHeadings([]);
    // Opening a note also shifts the create-target to that note's folder,
    // so the next "+ New" lands next to it.
    const idx = id.lastIndexOf('/');
    const parent = idx === -1 ? '' : id.slice(0, idx);
    setTargetFolder(parent);
    if (parent) expandPath(parent);
    // On narrow screens the sidebar overlays the editor — get it out of the
    // way once the user has picked what they want to read.
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [
    store, flushSave, flushTitleSave, expandPath, pushRecent, addAutoTitle,
    untitledLabel,
    activeRevisionRef, editorReadyRef, getMarkdownRef, lastSavedRef,
    lastSavedTitleRef, nextUrlOpRef,
    setActiveId, setActiveTemplate, setActiveText, setActiveUuid,
    setEditingTitle, setSaveStatus, setSidebarOpen, setTargetFolder,
    setTocHeadings,
  ]);

  const createNoteInFolder = useCallback(async (
    parentFolder?: string,
    opts?: { replaceUrl?: boolean; seedMessage?: string },
  ) => {
    await flushSave();
    await flushTitleSave();
    const seed = opts?.seedMessage?.trim();
    const initialTitle = seed || DEFAULT_NEW_NOTE_TITLE;
    const initialBody = seed ? `## ${seed}\n` : DEFAULT_NEW_NOTE_BODY;
    const meta = await store.create(initialTitle, initialBody, parentFolder);
    addAutoTitle(meta.id);
    if (opts?.replaceUrl) {
      const nextUrl = urlFromId(meta.id, locale);
      if (window.location.pathname !== nextUrl) {
        window.history.replaceState(null, '', nextUrl);
      }
    }
    prependNoteLocal(meta);
    if (parentFolder) addFolderLocal(parentFolder);
    syncPost({ type: 'notes-changed' });
    if (parentFolder) expandPath(parentFolder);
    // When the caller already replaced the URL (the `/new` flow), the
    // follow-up selectNote should replace too — the URL is already at the
    // target, pushing would stack a duplicate entry.
    await selectNote(meta.id, { replace: !!opts?.replaceUrl });
    return meta;
  }, [
    store, flushSave, flushTitleSave, selectNote, addFolderLocal, expandPath,
    prependNoteLocal, addAutoTitle, syncPost, locale,
  ]);

  const createNote = useCallback(async () => {
    await createNoteInFolder(targetFolder || undefined);
  }, [createNoteInFolder, targetFolder]);

  // Deselect the current note/template and return to the empty-state page.
  // Flushes pending saves first so nothing is lost; URL falls back to
  // NOTES_BASE_PATH automatically via the useUrlRouting mirror effect.
  const closeActiveNote = useCallback(async () => {
    if (!activeId && !activeTemplate) return;
    nextUrlOpRef.current = 'push';
    await flushSave();
    await flushTitleSave();
    setActiveId(null);
    setActiveUuid(null);
    setActiveTemplate(null);
    setActiveText('');
    setEditingTitle('');
    lastSavedRef.current = '';
    lastSavedTitleRef.current = '';
    activeRevisionRef.current = null;
    setSaveStatus('idle');
    editorReadyRef.current = false;
    getMarkdownRef.current = null;
    setTocHeadings([]);
  }, [
    activeId, activeTemplate, flushSave, flushTitleSave,
    activeRevisionRef, editorReadyRef, getMarkdownRef, lastSavedRef,
    lastSavedTitleRef, nextUrlOpRef,
    setActiveId, setActiveTemplate, setActiveText, setActiveUuid,
    setEditingTitle, setSaveStatus, setTocHeadings,
  ]);

  // Promote an unlinked mention to a proper [[wikilink]] in the active note.
  // Re-scans the live editor body for the first occurrence of `title` that
  // isn't already inside a wikilink, then splices in `[[title]]` and saves.
  // Doing the lookup at click-time (rather than trusting a cached offset from
  // when the panel last rendered) means the edit stays correct even if the
  // body has drifted since — including the Milkdown round-trip that used to
  // escape `[[` as `\[\[` and invalidated the panel's offsets.
  const handleLinkMention = useCallback(async (title: string) => {
    if (!activeId) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    let current: string;
    try { current = getMarkdownRef.current ? getMarkdownRef.current() : activeText; }
    catch { current = activeText; }

    // Exclude occurrences that already sit inside any `[[wikilink]]` span —
    // we'd otherwise wrap a wikilink inside another wikilink.
    const wikiRanges = parseWikiLinks(current).map(r => [r.start, r.end] as const);
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|\\W)(${escaped})(?:\\W|$)`, 'gi');
    let found: { start: number; end: number } | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(current)) !== null) {
      const rawStart = m.index + m[0].indexOf(m[1]);
      const start = rawStart;
      const end = rawStart + m[1].length;
      re.lastIndex = end;
      const inside = wikiRanges.some(([a, b]) => start >= a && end <= b);
      if (inside) continue;
      found = { start, end };
      break;
    }
    if (!found) {
      console.warn('[links] no linkable mention of', trimmed, 'in current body');
      return;
    }
    const next = current.slice(0, found.start) + `[[${trimmed}]]` + current.slice(found.end);
    await doSave(activeId, next, { force: true });
    lastSavedRef.current = next;
    clearDirty();
    setActiveText(next);
    setEditorVersion(v => v + 1);
  }, [
    activeId, activeText, doSave, clearDirty,
    getMarkdownRef, lastSavedRef, setActiveText, setEditorVersion,
  ]);

  // Click handler for a [[wikilink]] in the editor. Resolves the target to a
  // real note id and switches to it. When nothing resolves, prompts the user
  // to create a new note with that title (placed alongside the active one).
  const handleNavigateLink = useCallback((target: string) => {
    const resolved = resolveLink(linkResolverRef.current, target);
    if (resolved) {
      void selectNote(resolved.id);
      return;
    }
    const trimmed = target.trim();
    if (!trimmed) return;
    // Stash the title for a fresh create. Place alongside the currently-open
    // note's folder so the new note appears near its caller in the tree.
    const create = window.confirm(`No note titled “${trimmed}” — create one?`);
    if (!create) return;
    const idx = activeId ? activeId.lastIndexOf('/') : -1;
    const parent = idx === -1 ? undefined : activeId!.slice(0, idx);
    (async () => {
      await flushSave();
      await flushTitleSave();
      const seed = `# ${trimmed}\n\n`;
      const meta = await store.create(trimmed, seed, parent);
      prependNoteLocal(meta);
      syncPost({ type: 'notes-changed' });
      if (parent) expandPath(parent);
      await selectNote(meta.id);
    })().catch(err => {
      console.error('[links] create-on-follow failed', err);
      window.alert(`Could not create: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, [
    activeId, store, selectNote, flushSave, flushTitleSave,
    prependNoteLocal, expandPath, syncPost, linkResolverRef,
  ]);

  const handleDuplicate = useCallback(async (id: string) => {
    await flushSave();
    await flushTitleSave();
    const data = await store.get(id);
    if (!data) return;
    const parentIdx = id.lastIndexOf('/');
    const parent = parentIdx === -1 ? '' : id.slice(0, parentIdx);
    const meta = await store.create(`${data.title} (copy)`, data.text || undefined, parent || undefined);
    prependNoteLocal(meta);
    syncPost({ type: 'notes-changed' });
    if (parent) expandPath(parent);
    void selectNote(meta.id);
  }, [store, flushSave, flushTitleSave, selectNote, expandPath, prependNoteLocal, syncPost]);

  const handleExport = useCallback(async (id: string) => {
    // Flush if exporting the active note so the latest content is used.
    if (id === activeId) {
      await flushSave();
      await flushTitleSave();
    }
    const data = await store.get(id);
    if (!data) return;
    // Pre-load assets so the resolver can translate relative URLs to blob URLs.
    await store.preloadAssets(id, data.text || '');
    exportNoteToPdf(data.title, data.text || '', data.updatedAt, url => store.getAssetUrl(id, url));
  }, [store, activeId, flushSave, flushTitleSave]);

  const deleteNote = useCallback(async () => {
    if (!activeId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = window.setTimeout(() => {
        setConfirmDelete(false);
        deleteTimerRef.current = null;
      }, DELETE_CONFIRM_MS);
      return;
    }
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (titleSaveTimerRef.current) {
      window.clearTimeout(titleSaveTimerRef.current);
      titleSaveTimerRef.current = null;
    }
    await store.delete(activeId);
    indexRemove(activeId);
    setNotes(prev => prev.filter(n => n.id !== activeId));
    syncPost({ type: 'notes-changed' });
    pruneAutoTitleNotes(activeId);
    setLockedNotes(prev => {
      if (!prev.has(activeId)) return prev;
      const next = new Set(prev);
      next.delete(activeId);
      persistLocked(next);
      return next;
    });
    setActiveId(null);
    setActiveUuid(null);
    setActiveText('');
    activeRevisionRef.current = null;
    setConfirmDelete(false);
    getMarkdownRef.current = null;
    editorReadyRef.current = false;
  }, [
    store, activeId, confirmDelete, indexRemove, pruneAutoTitleNotes,
    persistLocked, setLockedNotes, syncPost,
    activeRevisionRef, autoSaveTimerRef, editorReadyRef, getMarkdownRef,
    titleSaveTimerRef,
    setActiveId, setActiveText, setActiveUuid, setNotes,
  ]);

  const importFile = useCallback(async (file: File) => {
    const text = await file.text();
    const nameTitle = file.name.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
    const firstLine = text.split('\n')[0] || '';
    const headingTitle = firstLine.startsWith('# ') ? firstLine.slice(2).trim() : '';
    const title = headingTitle || nameTitle || 'Imported note';

    let content = text;
    if (headingTitle && firstLine.startsWith('# ')) {
      content = text.slice(firstLine.length).replace(/^\n/, '');
    }

    await flushSave();
    await flushTitleSave();
    const meta = await store.create(title, content);
    prependNoteLocal(meta);
    syncPost({ type: 'notes-changed' });
    void selectNote(meta.id);
  }, [store, flushSave, flushTitleSave, selectNote, prependNoteLocal, syncPost]);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.name.endsWith('.md') || file.type === 'text/markdown' || file.type === 'text/plain') {
        await importFile(file);
      }
    }
  }, [importFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files);
  }, [importFiles, setDragging]);

  return {
    isLocked, toggleLock,
    selectNote, createNoteInFolder, createNote, closeActiveNote,
    deleteNote, confirmDelete,
    handleDuplicate, handleExport, handleLinkMention, handleNavigateLink,
    importFile, importFiles, handleDrop,
  };
}
