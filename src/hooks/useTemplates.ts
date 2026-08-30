'use client';

// Template CRUD + the "use template" flow that interpolates a template's
// body into the active note. Pulled out of page.tsx as Step 6.
//
// Templates and notes share a lot of state (the same editor, the same
// title input, the same save-status indicator), so this hook reads
// several refs and callbacks owned by useNoteAutosave (Step 5) and a few
// page-level setters. The split is intentional: useNoteAutosave is the
// authority on "what's the latest body / title in the editor" and on
// the autosave timers; useTemplates is the authority on the templates
// list, the active template selection, and the disk-side template store
// operations.
//
// Exposes `renameTemplateRef`: a ref that always points at the latest
// `handleRenameTemplate`. This breaks the cycle between the two hooks —
// useNoteAutosave's title-autosave needs to call `renameTemplate` for
// templates, but `handleRenameTemplate` itself reads autosave's refs
// (lastSavedTitleRef, getMarkdownRef, etc.) and so can only be defined
// after useNoteAutosave runs.

import { useCallback, useEffect, useState } from 'react';
import { interpolateTemplateVariables } from '@/lib/template-variables';
import {
  DEFAULT_NEW_NOTE_TITLE, DEFAULT_NEW_TEMPLATE_TITLE, getNextTemplateName,
} from '@/lib/title';
import {
  isNoteConflictError,
  type NoteMeta, type NoteRevision, type NoteStore,
} from '@/lib/storage';
import type { SaveStatus } from './useNoteAutosave';
import type { TocHeading } from '@/components/TableOfContents';
import type { IndexedTask } from '@/lib/tasks';
import { formatTasksToday } from '@/lib/tasks';

type SyncPostMessage =
  | { type: 'note-saved'; id: string; previousId?: string }
  | { type: 'notes-changed' }
  | { type: 'template-saved'; id: string }
  | { type: 'templates-changed' };

export type TemplateMeta = { id: string; name: string };

export type UseTemplatesParams = {
  // --- Store + bootstrap ---
  store: NoteStore;
  storeReady: boolean;
  // --- Active note state (read-only — for handlePickTemplate's save target) ---
  activeId: string | null;
  activeText: string;
  // --- Active template state (page-owned because useNoteAutosave also reads it) ---
  activeTemplate: string | null;
  setActiveTemplate: React.Dispatch<React.SetStateAction<string | null>>;
  // --- Refs from useNoteAutosave (read + write) ---
  getMarkdownRef: React.MutableRefObject<(() => string) | null>;
  lastSavedRef: React.MutableRefObject<string>;
  lastSavedTitleRef: React.MutableRefObject<string>;
  activeRevisionRef: React.MutableRefObject<NoteRevision | null>;
  editorReadyRef: React.MutableRefObject<boolean>;
  titleSaveTimerRef: React.MutableRefObject<number | null>;
  // --- Callbacks from useNoteAutosave ---
  flushSave: (opts?: { force?: boolean }) => Promise<void>;
  flushTitleSave: () => Promise<void>;
  showSaved: () => void;
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>;
  // --- Auto-title set ---
  addAutoTitle: (id: string) => void;
  deleteAutoTitle: (id: string) => void;
  // --- Tab sync + dirty tracking ---
  syncPost: (msg: SyncPostMessage) => void;
  clearDirty: () => void;
  flagExternalUpdate: (id: string) => void;
  // --- Path-changing rename callback (host owns the cascade) ---
  applyNoteIdRemap: (oldId: string, newId: string) => void;
  // --- Page state setters ---
  setNotes: React.Dispatch<React.SetStateAction<NoteMeta[]>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveUuid: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveText: React.Dispatch<React.SetStateAction<string>>;
  setEditingTitle: React.Dispatch<React.SetStateAction<string>>;
  setEditorVersion: React.Dispatch<React.SetStateAction<number>>;
  setTocHeadings: React.Dispatch<React.SetStateAction<TocHeading[]>>;
  // --- URL routing hint (page-owned ref the URL-mirror effect reads) ---
  nextUrlOpRef: React.MutableRefObject<'push' | 'replace'>;
  /** Page-owned ref shared with useNoteAutosave. We write our latest
   *  `handleRenameTemplate` into it via useEffect; the autosave hook reads
   *  it on the title-rename autosave path. Created in page.tsx because the
   *  cycle (useNoteAutosave needs renameTemplateRef; useTemplates needs
   *  flushSave from useNoteAutosave) only resolves if the same ref instance
   *  is threaded through both hooks. */
  renameTemplateRef: React.MutableRefObject<(templateId: string, newName: string) => Promise<void>>;
  /** Live task snapshot — used to expand the `{{tasks.today}}` template
   *  variable. Empty array when no tasks exist or the index hasn't loaded yet. */
  tasksSnapshot: IndexedTask[];
};

export type UseTemplatesResult = {
  templates: TemplateMeta[];
  /** Exposed because `pickBrowserDir` resets it on vault switch. */
  setTemplates: React.Dispatch<React.SetStateAction<TemplateMeta[]>>;
  refreshTemplates: () => Promise<void>;
  openTemplate: (templateId: string, opts?: { replace?: boolean }) => Promise<boolean>;
  createTemplate: () => Promise<void>;
  handleDeleteTemplate: (templateId: string) => Promise<void>;
  handleRenameTemplate: (templateId: string, newName: string) => Promise<void>;
  handlePickTemplate: (templateId: string) => Promise<void>;
};

export function useTemplates(params: UseTemplatesParams): UseTemplatesResult {
  const {
    store, storeReady, activeId, activeText,
    activeTemplate, setActiveTemplate,
    getMarkdownRef, lastSavedRef, lastSavedTitleRef, activeRevisionRef,
    editorReadyRef, titleSaveTimerRef,
    flushSave, flushTitleSave, showSaved, setSaveStatus,
    addAutoTitle, deleteAutoTitle,
    syncPost, clearDirty, flagExternalUpdate,
    applyNoteIdRemap,
    setNotes, setActiveId, setActiveUuid, setActiveText, setEditingTitle,
    setEditorVersion, setTocHeadings,
    nextUrlOpRef, renameTemplateRef,
    tasksSnapshot,
  } = params;

  const isoToday = useCallback((): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [templates, setTemplates] = useState<TemplateMeta[]>([]);

  const refreshTemplates = useCallback(async () => {
    try { setTemplates(await store.listTemplates()); } catch { /* no templates dir yet */ }
  }, [store]);

  // Load templates once the store is ready.
  useEffect(() => {
    if (storeReady) void refreshTemplates();
  }, [storeReady, refreshTemplates]);

  const handleRenameTemplate = useCallback(async (templateId: string, newName: string) => {
    const isActiveTemplate = activeTemplate === templateId;
    const currentName = templates.find(template => template.id === templateId)?.name
      || (isActiveTemplate ? lastSavedTitleRef.current : '');
    const trimmed = newName.trim();
    if (!trimmed || trimmed === currentName) return;
    if (titleSaveTimerRef.current) {
      window.clearTimeout(titleSaveTimerRef.current);
      titleSaveTimerRef.current = null;
    }
    // Capture the editor's live markdown BEFORE we flush — flushSave will
    // write it to disk under the old name, then we rename. Without this, a
    // user typing right up to the moment of rename would lose the in-flight
    // characters when the active template is reseeded post-rename.
    const currentMarkdown = isActiveTemplate
      ? (getMarkdownRef.current ? getMarkdownRef.current() : activeText)
      : null;
    if (isActiveTemplate) {
      await flushSave();
    }
    setSaveStatus('saving');
    try {
      const renamed = await store.renameTemplate(templateId, trimmed);
      if (isActiveTemplate) {
        setEditingTitle(renamed.name);
        lastSavedTitleRef.current = renamed.name;
      }
    } catch (err) {
      console.error('[templates] rename failed', err);
      setSaveStatus('error');
      return;
    }
    if (isActiveTemplate) {
      if (currentMarkdown != null) {
        setActiveText(currentMarkdown);
        lastSavedRef.current = currentMarkdown;
      }
      setActiveTemplate(templateId);
    }
    await refreshTemplates();
    // Broadcast both: the body content was rewritten under the new name (so
    // tabs viewing this template silently reload), AND the templates list
    // shape changed for non-viewers (entry rename → sidebar refresh).
    syncPost({ type: 'template-saved', id: templateId });
    syncPost({ type: 'templates-changed' });
    showSaved();
  }, [
    activeTemplate, activeText, store, flushSave, refreshTemplates, showSaved,
    templates, lastSavedRef, lastSavedTitleRef, getMarkdownRef, setSaveStatus,
    setEditingTitle, setActiveText, setActiveTemplate, titleSaveTimerRef,
    syncPost,
  ]);

  // Wire the rename callback into the ref so the autosave hook (which
  // holds the same ref instance) always calls the latest closure.
  useEffect(() => {
    renameTemplateRef.current = handleRenameTemplate;
  }, [handleRenameTemplate, renameTemplateRef]);

  const openTemplate = useCallback(async (templateId: string, opts?: { replace?: boolean }) => {
    nextUrlOpRef.current = opts?.replace ? 'replace' : 'push';
    await flushSave();
    await flushTitleSave();
    const template = await store.getTemplate(templateId);
    if (template == null) return false;
    setActiveId(null);
    setActiveUuid(null);
    setActiveTemplate(template.id);
    setActiveText(template.content);
    setEditingTitle(template.name);
    lastSavedRef.current = template.content;
    lastSavedTitleRef.current = template.name;
    activeRevisionRef.current = null;
    setSaveStatus('idle');
    editorReadyRef.current = false;
    getMarkdownRef.current = null;
    setTocHeadings([]);
    return true;
  }, [
    store, flushSave, flushTitleSave, nextUrlOpRef,
    setActiveId, setActiveUuid, setActiveText, setActiveTemplate,
    setEditingTitle, setTocHeadings,
    setSaveStatus, lastSavedRef, lastSavedTitleRef, activeRevisionRef,
    editorReadyRef, getMarkdownRef,
  ]);

  const createTemplate = useCallback(async () => {
    const existing = await store.listTemplates();
    const name = getNextTemplateName(existing.map(template => template.name));
    const created = await store.createTemplate(name, '');
    // Register the template id in the auto-title set so typing a `# heading`
    // as the first body line auto-renames the template (mirrors note flow).
    // The hook's handleTitleChange clears this entry on the first manual
    // edit of the title input.
    addAutoTitle(created.id);
    await refreshTemplates();
    syncPost({ type: 'templates-changed' });
    await openTemplate(created.id);
  }, [store, refreshTemplates, openTemplate, addAutoTitle, syncPost]);

  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    await store.deleteTemplate(templateId);
    if (activeTemplate === templateId) {
      setActiveTemplate(null);
      setActiveText('');
      setEditingTitle('');
    }
    await refreshTemplates();
    syncPost({ type: 'templates-changed' });
  }, [
    store, activeTemplate, refreshTemplates, setActiveTemplate, setActiveText,
    setEditingTitle, syncPost,
  ]);

  const handlePickTemplate = useCallback(async (templateId: string) => {
    const template = await store.getTemplate(templateId);
    if (template == null || !activeId) return;
    const today = isoToday();
    const extras = { 'tasks.today': formatTasksToday(tasksSnapshot, { today }) };
    const interpolated = interpolateTemplateVariables(template.content, extras);
    const renderedTitle = interpolateTemplateVariables(template.name, extras).trim() || DEFAULT_NEW_NOTE_TITLE;
    deleteAutoTitle(activeId);
    setActiveText(interpolated);
    setEditingTitle(renderedTitle);
    setEditorVersion(v => v + 1);
    lastSavedRef.current = interpolated;
    lastSavedTitleRef.current = renderedTitle;
    setSaveStatus('saving');
    let meta;
    try {
      meta = await store.saveContent(activeId, interpolated, renderedTitle, {
        expected: activeRevisionRef.current,
      });
    } catch (err) {
      console.error('[notes] apply template failed', err);
      if (isNoteConflictError(err)) {
        flagExternalUpdate(activeId);
      }
      setSaveStatus('error');
      return;
    }
    // Template apply may also rename the file (the rendered title becomes
    // the new filename). Without this, the URL bar / sidebar tree / locked
    // sets stay pinned to the pre-template id until the next reload.
    if (meta.id !== activeId) {
      applyNoteIdRemap(activeId, meta.id);
    }
    activeRevisionRef.current = { size: meta.size, mtimeMs: meta.mtimeMs };
    clearDirty();
    setNotes(prev => prev.map(n => n.id === meta.id
      ? {
        ...n,
        title: renderedTitle,
        updatedAt: meta.updatedAt,
        size: meta.size,
        mtimeMs: meta.mtimeMs,
      }
      : n));
    showSaved();
    syncPost(meta.id !== activeId
      ? { type: 'note-saved', id: meta.id, previousId: activeId }
      : { type: 'note-saved', id: meta.id });
  }, [
    store, activeId, showSaved, deleteAutoTitle, clearDirty, syncPost,
    flagExternalUpdate, applyNoteIdRemap, lastSavedRef, lastSavedTitleRef,
    activeRevisionRef, setSaveStatus, setNotes, setActiveText, setEditingTitle,
    setEditorVersion, tasksSnapshot, isoToday,
  ]);

  // Reference DEFAULT_NEW_TEMPLATE_TITLE so future template-default-name
  // surfaces (settings panel, restore-after-delete) can pick it up here
  // instead of re-importing from @/lib/title.
  void DEFAULT_NEW_TEMPLATE_TITLE;

  return {
    templates,
    setTemplates,
    refreshTemplates,
    openTemplate,
    createTemplate,
    handleDeleteTemplate,
    handleRenameTemplate,
    handlePickTemplate,
  };
}
