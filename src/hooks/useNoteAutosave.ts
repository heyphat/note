'use client';

// Owns every read/write of the active note's body and title, plus the
// debounced autosave timers and "Saving / Saved / Save failed" status
// indicator. Pulled out of page.tsx as Step 5 of the refactor — the
// page now passes in the broader app machinery (store, sync hooks,
// auto-title set, conflict flagger) and gets back a tight bundle of
// callbacks the editor pane and header toolbar can call directly.
//
// Responsibilities at a glance:
//   - Content autosave: debounced (`AUTOSAVE_DEBOUNCE_MS`), with an
//     "empty body without force" guard so a misfiring autosave can never
//     wipe a note. Manual Cmd+S forces.
//   - Title autosave: same 800ms debounce; auto-titled notes derive title
//     from the body inside `doSave`, so direct rename is suppressed for
//     them.
//   - Path-changing rename: when `store.saveContent`/`store.rename` returns
//     a different `meta.id` (lazy uuid→title-filename migration, or any
//     title-driven rename), the hook calls the host's `applyNoteIdRemap`
//     so the URL bar, sidebar tree, locked/pinned sets, recent list, and
//     wikilinks all rewire to the new id atomically.
//   - Save status: 'idle' → 'saving' → 'saved' (auto-decays after
//     `SAVED_TOAST_MS`) or → 'error' on conflict / disk failure.
//   - Word/char/reading-minute stats kept fresh on body change AND on
//     note switch (the second is what catches "open a saved note that
//     was never typed in this session").
//   - Flush-on-tab-hide: if the user switches tabs or windows mid-debounce,
//     persist immediately so they don't lose work.

import { useCallback, useEffect, useRef, useState } from 'react';
import { countStats } from '@/lib/editor-enhancements';
import { refactorLinks } from '@/lib/links/link-refactor';
import {
  isNoteConflictError,
  type NoteMeta, type NoteRevision, type NoteStore,
} from '@/lib/storage';
import { DEFAULT_NEW_NOTE_TITLE, DEFAULT_NEW_TEMPLATE_TITLE, deriveTitleFromMarkdown } from '@/lib/title';
import type { LinkIndex } from '@/lib/links/link-index';
import type { MilkdownEditorApi } from '@/components/MilkdownEditor';

// Mirror of useTabSync's SyncPostMessage: the host's `post()` stamps the
// vaultId before broadcasting, so callers omit it. Kept inline here so the
// hook doesn't depend on the tab-sync module's internal type.
type SyncPostMessage =
  | { type: 'note-saved'; id: string; previousId?: string }
  | { type: 'notes-changed' }
  | { type: 'template-saved'; id: string }
  | { type: 'templates-changed' };

export const AUTOSAVE_DEBOUNCE_MS = 800;
export const SAVED_TOAST_MS = 1500;
// Watchdog interval. Force-flushes any drift between the editor and disk
// regardless of whether handleChange / flushSave fired in the meantime.
// Belt-and-braces against a class of bugs where the debounced path silently
// no-ops (Crepe init lost the onReady race, MutationObserver detached, etc.)
// — without this, a session can accumulate minutes of edits with zero saves
// and no surface signal.
export const AUTOSAVE_HEARTBEAT_MS = 30_000;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type NoteStats = { words: number; chars: number; readingMinutes: number };

// `kind` lets the toolbar branch on what kind of error we're in:
//   - 'not-found': the on-disk file is gone. The Recover button shows; the
//     heartbeat must NOT loop save attempts (every retry would re-throw).
//   - 'conflict': another tab/process changed the file mid-save. The
//     existing conflict banner handles this; we just classify so the
//     heartbeat skips noisy retries.
//   - 'other': any other failure. Heartbeat keeps retrying — these tend to
//     be transient (permission revoked then re-granted, etc).
export type SaveErrorKind = 'not-found' | 'conflict' | 'other';
export type LastSaveError = { id: string; kind: SaveErrorKind } | null;

const EMPTY_STATS: NoteStats = { words: 0, chars: 0, readingMinutes: 0 };

// Detect the File System Access API's "file is gone" signal. Different
// browsers wrap this slightly differently (DOMException vs. plain Error
// with a `.name` field), so we check both.
function isNotFoundError(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'NotFoundError') return true;
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'NotFoundError';
}

export type UseNoteAutosaveParams = {
  store: NoteStore;
  /** Path-based id of the active note. Null when editing a template. */
  activeId: string | null;
  /** Template id when editing a template; otherwise null. */
  activeTemplate: string | null;
  /** Skill id when editing a skill; otherwise null. */
  activeSkill: string | null;
  /** Live title in the title input — autosave reads this on flush. */
  editingTitle: string;
  /** Last-known body. Drives the stats effect (deps include this so
   *  switching to a saved note that was never typed in this session still
   *  recomputes word/char counts). */
  activeText: string;
  /** Notes array — `doRename` reads this for the pre-rename title fallback. */
  notes: NoteMeta[];
  /** Live wikilink index. Used by `doRename` to refactor `[[old title]]`
   *  references after a manual rename. */
  linkIndex: LinkIndex | null;
  // --- Auto-title set ---
  hasAutoTitle: (id: string) => boolean;
  deleteAutoTitle: (id: string) => void;
  // --- Cross-tab sync ---
  syncPost: (msg: SyncPostMessage) => void;
  // --- Dirty-tracking (for tab sync's "you have unsaved edits" banner) ---
  clearDirty: () => void;
  markDirty: () => void;
  // --- Conflict handling ---
  flagExternalUpdate: (id: string) => void;
  // --- Search index keep-in-sync ---
  indexUpdate: (id: string) => void;
  // --- Setters page owns (we don't lift them up) ---
  setNotes: React.Dispatch<React.SetStateAction<NoteMeta[]>>;
  setEditingTitle: React.Dispatch<React.SetStateAction<string>>;
  setHistoryReloadToken: React.Dispatch<React.SetStateAction<number>>;
  /** Path-changing rename callback. Invoked when the store returns a
   *  different `meta.id` than what we sent. The host implements the cascade
   *  (URL, locked, pinned, link refactor, etc). */
  applyNoteIdRemap: (oldId: string, newId: string) => void;
  /** Template rename routing. Templates are still owned by page.tsx until
   *  Step 6's `useTemplates` hook lands; we take a ref to the host's
   *  `handleRenameTemplate` because that callback itself reads refs from
   *  this hook (last-saved title, get-markdown, etc.) — passing it directly
   *  would be a forward-reference cycle. */
  renameTemplateRef: React.MutableRefObject<(templateId: string, newName: string) => Promise<void>>;
  /** Skill rename routing — same shape and reason as `renameTemplateRef`. */
  renameSkillRef: React.MutableRefObject<(skillId: string, newName: string) => Promise<void>>;
  /** Editor revision tracker. Lifted to page.tsx as of Step 9 because
   *  useVaultLifecycle (which runs BEFORE this hook) also clears it on
   *  cold-load + vault-switch — both hooks must read+write the same
   *  instance. We still re-export it from the result so existing consumers
   *  (selectNote, openTemplate, restoreFromHistory) keep working. */
  activeRevisionRef: React.MutableRefObject<NoteRevision | null>;
  /** Optional: invoked after a successful manual rename so callers can
   *  refactor references that live outside `linkIndex` — e.g. tasks that
   *  store project wikilinks in their YAML frontmatter. Fire-and-forget;
   *  errors are swallowed so a task-rewrite hiccup never blocks note save. */
  onTitleRenamed?: (oldTitle: string, newTitle: string) => Promise<void>;
};

export type UseNoteAutosaveResult = {
  // --- State (page reads, header toolbar reads) ---
  saveStatus: SaveStatus;
  /** Exposed because handlePickTemplate / handleRenameTemplate flip it
   *  directly. Once Step 6 owns templates this can become internal. */
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>;
  /** Last save error, if any. Drives the toolbar's "Recover" affordance
   *  and gates the autosave heartbeat from looping on missing-file errors. */
  lastSaveError: LastSaveError;
  /** Clear after a successful recovery so the toolbar drops back to idle. */
  clearSaveError: () => void;
  noteStats: NoteStats;
  // --- Refs page reads + writes (selectNote / openTemplate / restoreFromHistory) ---
  lastSavedRef: React.MutableRefObject<string>;
  lastSavedTitleRef: React.MutableRefObject<string>;
  activeRevisionRef: React.MutableRefObject<NoteRevision | null>;
  editorReadyRef: React.MutableRefObject<boolean>;
  getMarkdownRef: React.MutableRefObject<(() => string) | null>;
  editorApiRef: React.MutableRefObject<MilkdownEditorApi | null>;
  /** Exposed so toggleLock / deleteNote / restoreFromHistory can cancel any
   *  pending autosave before doing their thing. */
  autoSaveTimerRef: React.MutableRefObject<number | null>;
  titleSaveTimerRef: React.MutableRefObject<number | null>;
  // --- Callbacks ---
  showSaved: () => void;
  doSave: (id: string, text: string, opts?: { force?: boolean }) => Promise<void>;
  flushSave: (opts?: { force?: boolean }) => Promise<void>;
  flushTitleSave: () => Promise<void>;
  handleChange: (markdown: string) => void;
  handleTitleChange: (newTitle: string) => void;
  doRename: (id: string, title: string) => Promise<void>;
  handleReady: (getMarkdown: () => string, api: MilkdownEditorApi) => void;
};

export function useNoteAutosave(params: UseNoteAutosaveParams): UseNoteAutosaveResult {
  const {
    store, activeId, activeTemplate, activeSkill, editingTitle, activeText, notes, linkIndex,
    hasAutoTitle, deleteAutoTitle,
    syncPost, clearDirty, markDirty,
    flagExternalUpdate, indexUpdate,
    setNotes, setEditingTitle, setHistoryReloadToken,
    applyNoteIdRemap, renameTemplateRef, renameSkillRef,
    activeRevisionRef,
    onTitleRenamed,
  } = params;

  // --- State ---
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [noteStats, setNoteStats] = useState<NoteStats>(EMPTY_STATS);
  const [lastSaveError, setLastSaveError] = useState<LastSaveError>(null);
  // Mirror state in a ref so the heartbeat (running on a stale closure)
  // can read the latest error kind without triggering a re-create.
  const lastSaveErrorRef = useRef<LastSaveError>(null);
  useEffect(() => { lastSaveErrorRef.current = lastSaveError; }, [lastSaveError]);
  const clearSaveError = useCallback(() => setLastSaveError(null), []);

  // --- Refs ---
  const lastSavedRef = useRef('');
  const lastSavedTitleRef = useRef('');
  const editorReadyRef = useRef(false);
  const getMarkdownRef = useRef<(() => string) | null>(null);
  const editorApiRef = useRef<MilkdownEditorApi | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const titleSaveTimerRef = useRef<number | null>(null);
  const savedToastTimerRef = useRef<number | null>(null);
  const editingTitleRef = useRef(editingTitle);
  // Mirror activeId so async callbacks can compare "is this still the active
  // note?" without racing a mid-await switch.
  const activeIdRef = useRef(activeId);

  useEffect(() => { editingTitleRef.current = editingTitle; }, [editingTitle]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Cleanup timers on unmount.
  useEffect(() => () => {
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    if (titleSaveTimerRef.current) window.clearTimeout(titleSaveTimerRef.current);
    if (savedToastTimerRef.current) window.clearTimeout(savedToastTimerRef.current);
  }, []);

  // Recompute stats when a note is loaded (before the first edit fires) or
  // when activeId changes (so "open a note you never typed in this session"
  // still surfaces accurate counts).
  useEffect(() => {
    setNoteStats(countStats(activeText));
  }, [activeText, activeId]);

  // --- Save-status toast ---
  const showSaved = useCallback(() => {
    setSaveStatus('saved');
    if (savedToastTimerRef.current) window.clearTimeout(savedToastTimerRef.current);
    savedToastTimerRef.current = window.setTimeout(() => {
      setSaveStatus('idle');
      savedToastTimerRef.current = null;
    }, SAVED_TOAST_MS);
  }, []);

  // --- Content autosave ---
  // `force` is set by the manual Cmd+S path. Without it we refuse to save
  // an empty body: autosave firing mid-init / mid-remount is the known way
  // this goes wrong and the resulting on-disk file (frontmatter, no body)
  // looks like data-wipe. Users clear a note via Delete or an explicit
  // Cmd+S — never via a silent background save.
  const doSave = useCallback(async (id: string, text: string, opts?: { force?: boolean }) => {
    if (text === lastSavedRef.current) return;
    if (text === '' && !opts?.force) {
      console.warn('[notes] skipped empty autosave for', id);
      return;
    }
    setSaveStatus('saving');
    const syncedTitle = hasAutoTitle(id)
      ? (deriveTitleFromMarkdown(text) || DEFAULT_NEW_NOTE_TITLE)
      : undefined;
    let meta;
    try {
      meta = await store.saveContent(id, text, syncedTitle, {
        expected: activeRevisionRef.current,
      });
    } catch (err) {
      console.error('[notes] save failed', err);
      if (isNoteConflictError(err)) {
        flagExternalUpdate(id);
        setLastSaveError({ id, kind: 'conflict' });
      } else if (isNotFoundError(err)) {
        // The on-disk file is gone — typically because of the title-driven
        // rename data-loss bug or external deletion. Surface a recovery
        // affordance instead of looping the heartbeat against the missing
        // handle.
        setLastSaveError({ id, kind: 'not-found' });
      } else {
        setLastSaveError({ id, kind: 'other' });
      }
      setSaveStatus('error');
      return;
    }
    // Save succeeded — clear any prior error so the toolbar drops back to idle.
    if (lastSaveErrorRef.current) setLastSaveError(null);
    lastSavedRef.current = text;
    if (syncedTitle) lastSavedTitleRef.current = syncedTitle;
    // Lazy migration may have flipped a legacy <uuid>.md to a title-based
    // filename. The store returned the new id; rewire all id-keyed state.
    if (meta.id !== id) {
      applyNoteIdRemap(id, meta.id);
    }
    // activeIdRef lags one render behind setActiveId, so we compare against
    // the input `id` (the active id at the moment we kicked off this save).
    if (id === activeIdRef.current) {
      activeRevisionRef.current = { size: meta.size, mtimeMs: meta.mtimeMs };
    }
    clearDirty();
    setNotes(prev => prev.map(n => n.id === meta.id
      ? {
        ...n,
        title: syncedTitle || meta.title || n.title,
        updatedAt: meta.updatedAt,
        size: meta.size,
        mtimeMs: meta.mtimeMs,
      }
      : n));
    // Mirror the auto-title into editingTitle so the header input and
    // document.title track the derived title — handleChange also does this
    // synchronously, but the save path is the authoritative sync point.
    if (syncedTitle && id === activeIdRef.current && syncedTitle !== editingTitleRef.current) {
      setEditingTitle(syncedTitle);
    }
    setHistoryReloadToken(v => v + 1);
    // Path-changing save (lazy uuid→title-filename, or auto-title rename
    // emitted a different filename): include previousId so other tabs that
    // still have the pre-rename id active can apply the same id-remap.
    syncPost(meta.id !== id
      ? { type: 'note-saved', id: meta.id, previousId: id }
      : { type: 'note-saved', id: meta.id });
    indexUpdate(meta.id);
    showSaved();
  }, [
    store, showSaved, indexUpdate, clearDirty, hasAutoTitle, syncPost,
    flagExternalUpdate, applyNoteIdRemap,
    setNotes, setEditingTitle, setHistoryReloadToken,
  ]);

  const flushSave = useCallback(async (opts?: { force?: boolean }) => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    // Capability check: a non-null getMarkdownRef.current is the only honest
    // signal of "editor is loaded enough to read its body". The boolean
    // editorReadyRef is a proxy that desyncs when crepe.create() resolves
    // with destroyed=true (no onReady fires) — gating on it caused silent
    // no-op autosaves across long editing sessions. Gate on the getter
    // directly; the empty-body guard inside doSave still protects against
    // a getter that returns ''.
    if (activeTemplate) {
      const getter = getMarkdownRef.current;
      if (getter) {
        const md = getter();
        if (md !== lastSavedRef.current) {
          try {
            await store.saveTemplate(activeTemplate, md);
            lastSavedRef.current = md;
            syncPost({ type: 'template-saved', id: activeTemplate });
          } catch {}
        }
      }
      return;
    }
    if (activeSkill) {
      const getter = getMarkdownRef.current;
      if (getter) {
        const md = getter();
        if (md !== lastSavedRef.current) {
          try {
            await store.saveSkill(activeSkill, md);
            lastSavedRef.current = md;
          } catch {}
        }
      }
      return;
    }
    if (!activeId) return;
    const getter = getMarkdownRef.current;
    if (!getter) return;
    await doSave(activeId, getter(), opts);
  }, [activeId, activeTemplate, activeSkill, doSave, store, syncPost]);

  const handleChange = useCallback((markdown: string) => {
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    // Capability check, same reasoning as flushSave: gate on the getter, not
    // the boolean. If we can read the body, we can save it.
    if (!getMarkdownRef.current) return;

    // Skill editing mode — body autosave only. Skill `name` lives in
    // frontmatter and is renamed through the title input (handleTitleChange),
    // not auto-derived from headings; the description has its own input row.
    if (activeSkill) {
      if (markdown !== lastSavedRef.current) markDirty();
      setNoteStats(countStats(markdown));
      const skillId = activeSkill;
      autoSaveTimerRef.current = window.setTimeout(async () => {
        autoSaveTimerRef.current = null;
        if (markdown === lastSavedRef.current) return;
        setSaveStatus('saving');
        try {
          await store.saveSkill(skillId, markdown);
          lastSavedRef.current = markdown;
          clearDirty();
          showSaved();
        } catch { setSaveStatus('error'); }
      }, AUTOSAVE_DEBOUNCE_MS);
      return;
    }

    // Template editing mode
    if (activeTemplate) {
      if (markdown !== lastSavedRef.current) markDirty();
      setNoteStats(countStats(markdown));
      // Auto-title from body for templates (mirrors note flow). The id is
      // added to the auto-title set at createTemplate time and dropped when
      // the user manually edits the title input. While it's in the set, we
      // derive the title from the body's first heading.
      if (hasAutoTitle(activeTemplate)) {
        const nextTitle = deriveTitleFromMarkdown(markdown) || DEFAULT_NEW_TEMPLATE_TITLE;
        if (nextTitle !== editingTitleRef.current) {
          setEditingTitle(nextTitle);
        }
      }
      const tplId = activeTemplate;
      autoSaveTimerRef.current = window.setTimeout(async () => {
        autoSaveTimerRef.current = null;
        if (markdown === lastSavedRef.current) return;
        setSaveStatus('saving');
        try {
          await store.saveTemplate(tplId, markdown);
          lastSavedRef.current = markdown;
          syncPost({ type: 'template-saved', id: tplId });
          // Persist the body-derived title into the template's filename +
          // displayed name so the sidebar list and browser tab title pick
          // it up. Skipped when the auto-title set was cleared (manual
          // rename took over) or when the derived title hasn't changed.
          if (hasAutoTitle(tplId)) {
            const derived = deriveTitleFromMarkdown(markdown) || DEFAULT_NEW_TEMPLATE_TITLE;
            if (derived !== lastSavedTitleRef.current) {
              try {
                await renameTemplateRef.current(tplId, derived);
              } catch (err) {
                console.warn('[templates] auto-rename failed', err);
              }
            }
          }
          clearDirty();
          showSaved();
        } catch { setSaveStatus('error'); }
      }, AUTOSAVE_DEBOUNCE_MS);
      return;
    }

    const id = activeId;
    if (!id) return;
    // Crepe's MutationObserver can fire during async internal init
    // (CodeMirror lazy-mount, image proxying). Ignore until we've seen the
    // onReady signal for this note.
    if (markdown !== lastSavedRef.current) markDirty();
    if (hasAutoTitle(id)) {
      const nextTitle = deriveTitleFromMarkdown(markdown) || DEFAULT_NEW_NOTE_TITLE;
      if (nextTitle !== editingTitleRef.current) {
        setEditingTitle(nextTitle);
      }
    }
    setNoteStats(countStats(markdown));
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      doSave(id, markdown);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [
    activeId, activeTemplate, activeSkill, doSave, showSaved, store, clearDirty,
    hasAutoTitle, markDirty, setEditingTitle, renameTemplateRef, syncPost,
  ]);

  // --- Title autosave ---
  const doRename = useCallback(async (id: string, title: string) => {
    if (title === lastSavedTitleRef.current) return;
    // Capture the pre-rename title BEFORE we mutate the store — needed so
    // refactorLinks can find `[[old title]]` references across the vault.
    const oldTitle = lastSavedTitleRef.current || notes.find(n => n.id === id)?.title || '';
    setSaveStatus('saving');
    let meta;
    try {
      meta = await store.rename(id, title, {
        expected: activeRevisionRef.current,
      });
    } catch (err) {
      console.error('[notes] rename failed', err);
      if (isNoteConflictError(err)) {
        flagExternalUpdate(id);
        setLastSaveError({ id, kind: 'conflict' });
      } else if (isNotFoundError(err)) {
        setLastSaveError({ id, kind: 'not-found' });
      } else {
        setLastSaveError({ id, kind: 'other' });
      }
      setSaveStatus('error');
      return;
    }
    if (lastSaveErrorRef.current) setLastSaveError(null);
    lastSavedTitleRef.current = meta.title;
    // The store may have physically renamed the file (title-based filename).
    // Rewire every id-keyed bit of state before touching the notes array.
    if (meta.id !== id) {
      applyNoteIdRemap(id, meta.id);
    }
    if (id === activeIdRef.current) {
      activeRevisionRef.current = { size: meta.size, mtimeMs: meta.mtimeMs };
    }
    setNotes(prev => prev.map(n =>
      n.id === meta.id
        ? {
          ...n,
          title: meta.title,
          updatedAt: meta.updatedAt,
          size: meta.size,
          mtimeMs: meta.mtimeMs,
        }
        : n
    ));
    // Rewrite every [[old title]] across the vault. Runs after the store
    // commit so a failure partway doesn't orphan link state. Fire-and-forget:
    // links are cheap to update even on largish vaults, and blocking the
    // title-save UI on the rewrite makes typing feel laggy.
    if (linkIndex && oldTitle && oldTitle !== meta.title) {
      void refactorLinks(store, linkIndex, oldTitle, meta.title).then(r => {
        if (r.notesUpdated > 0) {
          syncPost({ type: 'notes-changed' });
        }
      });
    }
    // Refactor frontmatter wikilinks living outside the note tree (tasks).
    // Same fire-and-forget contract as `refactorLinks`.
    if (onTitleRenamed && oldTitle && oldTitle !== meta.title) {
      void onTitleRenamed(oldTitle, meta.title).catch(err => {
        console.warn('[notes] task reference rewrite failed', err);
      });
    }
    syncPost(meta.id !== id
      ? { type: 'note-saved', id: meta.id, previousId: id }
      : { type: 'note-saved', id: meta.id });
    showSaved();
  }, [
    store, showSaved, notes, linkIndex, syncPost, flagExternalUpdate,
    applyNoteIdRemap, setNotes, activeRevisionRef, onTitleRenamed,
  ]);

  const flushTitleSave = useCallback(async () => {
    if (titleSaveTimerRef.current) {
      window.clearTimeout(titleSaveTimerRef.current);
      titleSaveTimerRef.current = null;
    }
    if (activeTemplate) {
      const trimmed = editingTitle.trim();
      if (trimmed) await renameTemplateRef.current(activeTemplate, trimmed);
      return;
    }
    if (activeSkill) {
      const trimmed = editingTitle.trim();
      if (trimmed) await renameSkillRef.current(activeSkill, trimmed);
      return;
    }
    if (!activeId) return;
    // Auto-title notes have their title written via saveContent inside doSave,
    // derived from the body. Calling doRename here with the possibly-stale
    // editingTitle would clobber that — skip until the user manually edits
    // the title (which removes the id from the auto-title set).
    //
    // Task files are handled at the store boundary: `rename()` is a no-op
    // for them (detected by frontmatter shape, not by path), so we don't
    // need a per-flow guard here.
    if (hasAutoTitle(activeId)) return;
    const trimmed = editingTitle.trim();
    if (trimmed) await doRename(activeId, trimmed);
  }, [activeId, activeTemplate, activeSkill, editingTitle, doRename, hasAutoTitle, renameTemplateRef, renameSkillRef]);

  const handleTitleChange = useCallback((newTitle: string) => {
    if (activeId) deleteAutoTitle(activeId);
    setEditingTitle(newTitle);
    if (titleSaveTimerRef.current) window.clearTimeout(titleSaveTimerRef.current);
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    if (activeTemplate) {
      const currentTemplate = activeTemplate;
      titleSaveTimerRef.current = window.setTimeout(() => {
        titleSaveTimerRef.current = null;
        void renameTemplateRef.current(currentTemplate, trimmed);
      }, AUTOSAVE_DEBOUNCE_MS);
      return;
    }
    if (activeSkill) {
      const currentSkill = activeSkill;
      titleSaveTimerRef.current = window.setTimeout(() => {
        titleSaveTimerRef.current = null;
        void renameSkillRef.current(currentSkill, trimmed);
      }, AUTOSAVE_DEBOUNCE_MS);
      return;
    }
    const id = activeId;
    if (!id) return;
    titleSaveTimerRef.current = window.setTimeout(() => {
      titleSaveTimerRef.current = null;
      doRename(id, trimmed);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [activeId, activeTemplate, activeSkill, doRename, deleteAutoTitle, setEditingTitle, renameTemplateRef, renameSkillRef]);

  const handleReady = useCallback((getMarkdown: () => string, api: MilkdownEditorApi) => {
    getMarkdownRef.current = getMarkdown;
    editorApiRef.current = api;
    // Seed lastSavedRef with what the editor actually parsed on mount.
    // Without this, a no-op round-trip through Crepe's markdown parser
    // (which can re-serialize content slightly differently than what we
    // read off disk) gets treated as an edit and triggers an autosave —
    // harmless normally, but it masks real edits and noises the log.
    try { lastSavedRef.current = getMarkdown(); } catch { /* ignore */ }
    clearDirty();
    editorReadyRef.current = true;
  }, [clearDirty]);

  // Flush pending autosave when the tab is hidden, loses focus, or is being
  // unloaded. Without these, switching tabs within the 800ms debounce window
  // (or closing the tab outright) leaves the edit unsaved and unsynced.
  // beforeunload runs synchronously and can't await the save — but kicking
  // off the writes still helps in practice because most stores commit fast
  // enough to land before the page tears down.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        void flushSave();
        void flushTitleSave();
      }
    };
    const onBlur = () => { void flushSave(); void flushTitleSave(); };
    const onBeforeUnload = () => { void flushSave(); void flushTitleSave(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', onBlur);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [flushSave, flushTitleSave]);

  // Heartbeat watchdog. Every AUTOSAVE_HEARTBEAT_MS, force a flushSave so
  // any drift between the editor and disk gets reconciled even if the
  // debounced path silently no-opped (a class of bugs the empty-body guard
  // alone can't detect). If the editor's getter is null while a note is
  // active — meaning Crepe never wired up onReady — surface 'error' so the
  // user sees the toolbar flag rather than typing into a non-saving editor.
  useEffect(() => {
    if (!activeId && !activeTemplate && !activeSkill) return;
    const tick = () => {
      // Don't loop save attempts when we're in a known-blocked state.
      // The recovery dialog is the way out — looping just spams the
      // console with NotFoundError every 30s.
      const err = lastSaveErrorRef.current;
      if (err && (err.kind === 'not-found' || err.kind === 'conflict')) return;
      if (!getMarkdownRef.current) {
        console.warn('[notes] autosave watchdog: editor getter is null while a note is active — saves are not happening');
        setSaveStatus(prev => prev === 'saving' ? prev : 'error');
        return;
      }
      void flushSave();
    };
    const id = window.setInterval(tick, AUTOSAVE_HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [activeId, activeTemplate, activeSkill, flushSave]);

  // Note switch clears any error from the previous note. The user opening
  // a different file should never see the prior file's stale "Save failed"
  // banner.
  useEffect(() => {
    setLastSaveError(null);
  }, [activeId, activeTemplate, activeSkill]);

  return {
    saveStatus,
    setSaveStatus,
    lastSaveError,
    clearSaveError,
    noteStats,
    lastSavedRef,
    lastSavedTitleRef,
    activeRevisionRef,
    editorReadyRef,
    getMarkdownRef,
    editorApiRef,
    autoSaveTimerRef,
    titleSaveTimerRef,
    showSaved,
    doSave,
    flushSave,
    flushTitleSave,
    handleChange,
    handleTitleChange,
    doRename,
    handleReady,
  };
}
