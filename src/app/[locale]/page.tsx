'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import Lightbox from '@/components/Lightbox';
import NotFoundScreen from '@/components/NotFoundScreen';
import FolderPickerScreen from '@/components/FolderPickerScreen';
import DocsBanner from '@/components/DocsBanner';
import NotesSidebar from '@/components/NotesSidebar';
import EmptyState from '@/components/EmptyState';
import EditorHeaderToolbar from '@/components/EditorHeaderToolbar';
import EditorPane from '@/components/EditorPane';
import RecoveryDialog from '@/components/RecoveryDialog';
import RightDock from '@/components/RightDock';
import ChatButton from '@/components/ChatButton';
import ChatDrawer from '@/components/ChatDrawer';
import type { CreateNoteInput, ManageTasksInput, McpCallInput } from '@/lib/ai/tools';
import { buildSearchVaultExecutor } from '@/lib/ai/tools/search';
import { buildSearchTasksExecutor } from '@/lib/ai/tools/search-tasks';
import { buildReadNoteExecutor } from '@/lib/ai/tools/read-note';
import { buildGetDatetimeExecutor } from '@/lib/ai/tools/get-datetime';
import { buildLoadSkillExecutor } from '@/lib/ai/tools/load-skill';
import { buildReadSkillFileExecutor } from '@/lib/ai/tools/read-skill-file';
import type { ReadOnlyToolExecutor } from '@/lib/ai/stream';
import { getMcpManager } from '@/lib/ai/mcp';
import { localDayKey } from '@/components/CalendarStrip';
import { resolveLink } from '@/lib/links/link-resolver';
import { refactorLinks } from '@/lib/links/link-refactor';
import { mergeListedNotes, patchListedNote } from '@/lib/note-list';
import {
  getStore, isBundledDocsVaultId, isNoteConflictError, loadBundledDocsStore,
  type NoteRevision, type NoteStore,
} from '@/lib/storage';
import { clearHandle, loadHandle } from '@/lib/storage/handle-db';
import { NEW_NOTE_SLUG, slugFromPath, urlFromId } from '@/lib/routing';
import { DEFAULT_NEW_NOTE_FOLDER } from '@/lib/title';
import { useEditorSettings } from '@/components/EditorSettings';
import { readStoredPaletteId } from '@/lib/palettes';
import { showToast } from '@/components/Toast';
import { type TocHeading } from '@/components/TableOfContents';
import { useSearch } from '@/hooks/useSearch';
import { usePersistedUI, usePersistedBool } from '@/hooks/usePersistedUI';
import { useVaultScopedState } from '@/hooks/useVaultScopedState';
import { useMetaPatchBuffer } from '@/hooks/useMetaPatchBuffer';
import { useLocalNoteMutations } from '@/hooks/useLocalNoteMutations';
import { useTabSync } from '@/hooks/useTabSync';
import { useSavedSearches } from '@/hooks/useSavedSearches';
import { useAppKeyboardShortcuts } from '@/hooks/useAppKeyboardShortcuts';
import { useUrlRouting } from '@/hooks/useUrlRouting';
import { useNoteAutosave } from '@/hooks/useNoteAutosave';
import { useTemplates } from '@/hooks/useTemplates';
import { useSkills } from '@/hooks/useSkills';
import { useSkillFrontmatterAutosave } from '@/hooks/useSkillFrontmatterAutosave';
const SkillImportDialog = dynamic(() => import('@/components/SkillImportDialog'), { ssr: false });
import { useNoteCommands } from '@/hooks/useNoteCommands';
import { useFolderCommands } from '@/hooks/useFolderCommands';
import { useVaultLifecycle, type LoadCachedSnapshot } from '@/hooks/useVaultLifecycle';
import { useLinkResolution } from '@/hooks/useLinkResolution';
import { usePaletteActions } from '@/hooks/usePaletteActions';
import { useChatWiring } from '@/hooks/useChatWiring';
import { useResolvedTheme } from '@/hooks/useResolvedTheme';
import { useExclusiveFilters } from '@/hooks/useExclusiveFilters';
import { useTaskIndex } from '@/hooks/useTaskIndex';
import { statusDropPatch } from '@/components/TaskKanbanBoard';
import {
  completeTask as completeTaskOp,
  uncompleteTask as uncompleteTaskOp,
  createTask as createTaskOp,
  updateTask as updateTaskOp,
  deleteTask as deleteTaskOp,
  completeInstance as completeInstanceOp,
  uncompleteInstance as uncompleteInstanceOp,
  effectiveInstanceState,
  todayLocalDay,
  type CreateTaskInput,
  type Task,
  type TaskPatch,
} from '@/lib/tasks';
import { runQuery } from '@/lib/tasks/query';
import TaskFormModal from '@/components/TaskFormModal';

// Single-user local app — no auth, so all storage scopes under one key.
const LOCAL_USER_ID = 'local';

// Platform-conditional shortcut glyph used by the chat drawer and the
// command palette's "Open AI chat" hint. The remaining empty-state /
// shortcut copy lives in EmptyState.tsx.
const PLATFORM_IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
const CHAT_DRAWER_SHORTCUT = PLATFORM_IS_MAC ? '⌘\\' : 'Ctrl+\\';
// new-note uses Ctrl+N on mac (Cmd+N is browser-reserved) and Ctrl+Alt+N
// elsewhere. Same platform pattern for new-task on T. Wired into the
// command palette so the rows show the actual binding.
const NEW_NOTE_SHORTCUT = PLATFORM_IS_MAC ? '⌃N' : 'Ctrl+Alt+N';
const NEW_TASK_SHORTCUT = PLATFORM_IS_MAC ? '⌃T' : 'Ctrl+Alt+T';

// Palette is dynamic-imported so MiniSearch + the index module don't land
// in the initial bundle — they load on first Cmd+K / first search.
const CommandPalette = dynamic(() => import('@/components/CommandPalette'), { ssr: false });
const SettingsPopover = dynamic(() => import('@/components/SettingsPopover'), { ssr: false });
const FileExplorerPalette = dynamic(() => import('@/components/FileExplorerPalette'), { ssr: false });
// GraphView pulls in d3-force + d3-zoom on first open — keep it out of the
// main bundle so cold load stays fast.
const GraphView = dynamic(() => import('@/components/GraphView'), { ssr: false });
// TasksListView is overlay-style and may pull in more imports as views grow,
// so keep it out of the initial bundle until the user opens it.
const TasksListView = dynamic(() => import('@/components/TasksListView'), { ssr: false });

// Map a parsed Task into the partial CreateTaskInput the form modal expects
// when prefilling for edit. Pure — no side effects.
function taskToFormInitial(task: Task): Partial<CreateTaskInput> {
  return {
    title: task.title,
    status: task.status,
    priority: task.priority,
    due: task.due,
    scheduled: task.scheduled,
    tags: task.tags,
    contexts: task.contexts,
    projects: task.projects,
    recurrence: task.recurrence,
    body: task.body,
    id: task.id,
  };
}

export default function NotesPage() {
  const pathname = usePathname();
  const locale = useLocale();

  // First-launch experience: when no FileSystemDirectoryHandle is saved yet,
  // mount the BundledDocsStore so the user lands inside the documentation
  // rendered through the regular vault UI instead of a blank picker. The
  // initial render uses the FS store (required for the test mock and for
  // returning users); a one-shot async probe of IndexedDB swaps to docs mode
  // when no handle exists. Returning users keep the FS store throughout.
  const [store, setStore] = useState<NoteStore>(() => getStore(LOCAL_USER_ID));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadHandle(LOCAL_USER_ID);
        if (cancelled || stored) return;
        // No saved handle — code-split the docs bundle in and swap to the
        // in-memory documentation vault. Returning users never reach this
        // branch, so they skip the docs download entirely.
        const docsStore = await loadBundledDocsStore(locale);
        if (cancelled) return;
        setStore(docsStore);
      } catch {
        // IndexedDB unavailable (test env, private mode quirks, etc.) —
        // leave the FS store in place; FolderPickerScreen still works.
      }
    })();
    return () => { cancelled = true; };
    // Locale change after first launch shouldn't reshuffle stores; the
    // initial probe runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // swapToFsAndPick resets per-vault state and is defined further down,
  // after the setters/refs it depends on (vaultResetRef, disposeSearchRef,
  // activeRevisionRef, the active-note setters) are in scope.
  const tPage = useTranslations('page');
  const tToast = useTranslations('toast');
  const tCmd = useTranslations('commands');

  // "Forget current folder" from settings: clear the saved
  // FileSystemDirectoryHandle and reload. The mount-time probe then takes the
  // no-handle branch and lands the user in the bundled docs vault, which is
  // the simplest reliable way to re-derive every piece of per-vault state
  // (search index, templates, chats, palette, expanded folders, …) from
  // scratch. Files inside the user's folder are untouched.
  const resetVault = useCallback(async () => {
    try {
      await clearHandle(LOCAL_USER_ID);
    } catch (err) {
      // Surface the failure instead of reloading — a silent reload after a
      // failed clear would land the user back in the same vault and look
      // like the action did nothing.
      console.error('[notes] clearHandle failed:', err);
      showToast(tToast('failedResetVault'));
      return;
    }
    window.location.reload();
  }, [tToast]);

  // Note-level state. Per-vault state (notes, folders, vaultId, bfsLabel,
  // bfsError, needsDirPick, storeReady, loading) lives in useVaultLifecycle
  // and is destructured below.
  const [activeId, setActiveId] = useState<string | null>(null);
  // Stable frontmatter UUID of the active note. Survives renames/moves so
  // chat threads can stay anchored even when the path changes.
  const [activeUuid, setActiveUuid] = useState<string | null>(null);
  const [activeText, setActiveText] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [historyReloadToken, setHistoryReloadToken] = useState(0);
  // Graph view (force-directed visualization of the vault's link structure).
  const [graphOpen, setGraphOpen] = useState(false);
  // Bumped on restore so the Milkdown editor (keyed on activeId+editorVersion)
  // remounts with the freshly-restored defaultValue.
  const [editorVersion, setEditorVersion] = useState(0);
  // Editor typography / behavior settings. Lazy-init from localStorage +
  // cross-tab sync — see useEditorSettings.
  const [editorSettings, setEditorSettings] = useEditorSettings();
  // Currently-selected color palette id. Source of truth for the Appearance
  // section's "selected" ring and the command palette's "Current" hint. The
  // inline script in layout.tsx already applied the CSS vars pre-hydration,
  // so this state only needs to mirror localStorage for React consumers.
  const [paletteId, setPaletteId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'default';
    return readStoredPaletteId();
  });
  // Mirror the resolved light/dark variant so palette-switch actions in the
  // command palette can preview swatches that match what the user would see.
  const resolvedTheme = useResolvedTheme();
  // Drops handled by the chat drawer call stopPropagation on the React
  // synthetic event, so the page-level onDrop never fires and `dragging`
  // would otherwise stay stuck. Native events still reach window listeners,
  // so use those as a backstop to always clear the overlay when a drag ends.
  useEffect(() => {
    const reset = () => setDragging(false);
    window.addEventListener('drop', reset);
    window.addEventListener('dragend', reset);
    return () => {
      window.removeEventListener('drop', reset);
      window.removeEventListener('dragend', reset);
    };
  }, []);
  // Persisted UI layout preferences (sidebar / history / backlinks / narrow /
  // zen). All five live in one hook so the pattern isn't repeated five times.
  const {
    sidebarOpen, historyOpen, backlinksOpen, tasksOpen, narrowEditor, zenMode,
    setSidebarOpen, setHistoryOpen, setBacklinksOpen, setTasksOpen,
    toggleSidebar, toggleHistory, toggleBacklinks, toggleTasks, toggleNarrowEditor, toggleZen,
  } = usePersistedUI();

  // Single toggle for the right dock (history + backlinks + tasks). If any
  // panel is open, close all three; otherwise open all three at once. Drives
  // the Cmd/Ctrl+Shift+B shortcut and the matching palette entry.
  const toggleRightDock = useCallback(() => {
    const anyOpen = historyOpen || backlinksOpen || tasksOpen;
    const next = !anyOpen;
    setHistoryOpen(next);
    setBacklinksOpen(next);
    setTasksOpen(next);
  }, [historyOpen, backlinksOpen, tasksOpen, setHistoryOpen, setBacklinksOpen, setTasksOpen]);

  // Tasks-view overlay (vault-wide). Independent of the right-dock panel so
  // both can be open at once without contention.
  const [tasksViewOpen, setTasksViewOpen] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  // Pre-fill payload for the create modal. Set by the Ctrl+T shortcut when
  // a note is active so the new task lands on that note's project; cleared
  // when the modal closes. Other entry points (palette, list-view button)
  // keep the modal blank.
  const [taskCreateInitial, setTaskCreateInitial] = useState<Partial<CreateTaskInput> | undefined>(undefined);
  // Edit-modal target. The modal is rendered with mode='edit' when set —
  // null means closed. Shared modal mount with the create flow because they
  // can't both be open at the same time.
  const [taskEditTarget, setTaskEditTarget] = useState<{ path: string; task: Task } | null>(null);

  const [tocHeadings, setTocHeadings] = useState<TocHeading[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  // Sidebar section visibility — hoisted out of NotesSidebar so the new
  // SettingsPopover and NotesSidebar can share the same source of truth.
  // The setters here also clear the matching filter when the user hides a
  // section, so toggling Calendar off doesn't leave an orphaned date filter.
  const [showCalendar, setShowCalendarState] = usePersistedBool('notes:sidebar-calendar-visible', true);
  const [showTags, setShowTagsState] = usePersistedBool('notes:sidebar-tags-visible', true);
  const [showRecent, setShowRecent] = usePersistedBool('notes:sidebar-recent-visible', true);
  const [showTemplates, setShowTemplates] = usePersistedBool('notes:sidebar-templates-visible', true);
  const [showSkills, setShowSkills] = usePersistedBool('notes:sidebar-skills-visible', true);
  const [skillImportOpen, setSkillImportOpen] = useState(false);
  const setShowCalendar = useCallback((next: boolean) => {
    setShowCalendarState(next);
    if (!next) setActiveDateFilter(null);
  }, [setShowCalendarState]);
  const setShowTags = useCallback((next: boolean) => {
    setShowTagsState(next);
    if (!next) setActiveTagFilter(null);
  }, [setShowTagsState]);
  // Tag filter applied to the main NoteTree. `null` = no filter. Set by
  // clicking a chip in TagCloud or picking a tag in the palette's `@` mode.
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  // Date filter applied to the main NoteTree (YYYY-MM-DD, local). `null` = off.
  // Set by clicking a day in the sidebar CalendarStrip.
  const [activeDateFilter, setActiveDateFilter] = useState<string | null>(null);
  // `activeTemplate` lives here (not in useTemplates) because useNoteAutosave
  // reads it on the template-save branch and is called BEFORE useTemplates
  // (which depends on autosave's flushSave/flushTitleSave). The CRUD around
  // it lives in useTemplates.
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  // Same reason for `activeSkill`: useNoteAutosave needs it for the skill-save
  // branch and the CRUD lives in `useSkills` further down. Holds the
  // skill's stable id (single-file: uuid; folder: basename).
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [, setActiveSkillDescription] = useState('');
  // Full frontmatter map for the active skill — drives the properties panel
  // and survives unknown custom keys (`version`, `author`, …) on save.
  const [activeSkillFrontmatter, setActiveSkillFrontmatter] = useState<Record<string, string>>({});
  // Frontmatter UUID for the active skill — drives the `/skills/<uuid>` URL.
  // Generated lazily on first open by the store layer's `ensureSkillUuid`
  // (skills imported before the UUID flow existed get one stamped in on
  // their first click; subsequent opens reuse the existing value).
  const [activeSkillUuid, setActiveSkillUuid] = useState<string | null>(null);
  // --- Vault state + lifecycle (Step 9) ---
  // Owns per-vault state (notes, folders, vaultId, bfsLabel, bfsError,
  // needsDirPick, storeReady, loading), the vault-init effect, the
  // load-on-vault-change effect, the cache-first loadNotes paint, and
  // pickBrowserDir. Three forward-refs break the load-order cycles:
  //  - loadCachedSnapshotRef / disposeSearchRef are wired from useSearch
  //    (which itself reads notes/folders/vaultId from this hook).
  //  - vaultResetRef is wired from a useEffect AFTER all the per-vault
  //    setters (templates, expanded, target folder, tag/saved-search
  //    filters, auto-titles) are in scope. pickBrowserDir invokes the ref
  //    only at user-action time (after first render), so the ref is
  //    populated by then.
  const loadCachedSnapshotRef = useRef<LoadCachedSnapshot>(async () => null);
  const disposeSearchRef = useRef<() => void>(() => { /* wired by useSearch */ });
  const vaultResetRef = useRef<() => void>(() => { /* wired below after all hooks */ });
  // activeRevisionRef was previously owned by useNoteAutosave; lifted to
  // page.tsx as of Step 9 so useVaultLifecycle can clear it on cold-load
  // and vault-switch. Both hooks read the same instance.
  const activeRevisionRef = useRef<NoteRevision | null>(null);

  // Banner / sidebar "Open my folder" CTA. Mirrors the per-vault state reset
  // that useVaultLifecycle's pickBrowserDir already does on a fs→fs switch
  // — when leaving the bundled docs vault, the active doc note id no longer
  // exists in the new fs vault, and a cached snapshot in loadNotes() can
  // bypass the activeId-clear branch, so the editor would otherwise still
  // try to render a stale path.
  const swapToFsAndPick = useCallback(async () => {
    // Feature-detect before constructing the FS store. Safari/Firefox don't
    // ship the File System Access API; in those browsers showDirectoryPicker
    // is undefined and the call below would throw a TypeError that the catch
    // arm would log silently — leaving the banner click looking dead.
    if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
      showToast(tToast('unsupportedBrowser'));
      return;
    }
    const fsStore = getStore(LOCAL_USER_ID);
    try {
      // Open the native picker inside the user gesture so showDirectoryPicker
      // doesn't trip the "transient activation required" check. The handle
      // is saved as part of pickDirectory itself, so the new store is
      // already wired by the time we swap.
      const ok = await fsStore.pickDirectory({ forceNew: true });
      if (!ok) return;
      setActiveId(null);
      setActiveUuid(null);
      setActiveText('');
      activeRevisionRef.current = null;
      vaultResetRef.current();
      disposeSearchRef.current();
      setStore(fsStore);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[notes] swap to fs vault failed:', err);
      showToast(err instanceof Error ? err.message : tToast('pickerFailed'));
    }
  }, [tToast]);

  const {
    notes, setNotes, folders, setFolders,
    vaultId, bfsLabel, bfsError, needsDirPick, storeReady, loading,
    loadNotes, pickBrowserDir,
  } = useVaultLifecycle({
    store,
    loadCachedSnapshotRef, disposeSearchRef, vaultResetRef,
    setActiveId, setActiveUuid, setActiveText,
    activeRevisionRef,
    setSidebarOpen,
  });

  // Stable opaque vault identifier — used as the per-vault namespace for
  // localStorage keys and cross-tab sync. The human-readable folder name is
  // kept separately in `bfsLabel` for display only.
  //
  // Empty before initialize() resolves; the storage helpers sanitize that to
  // `default` so pre-init reads land deterministically.
  //
  // Display label and vault identity are intentionally decoupled because two
  // different folder handles can share the same basename.
  const {
    scopedKey,
    pinned, setPinned, persistPinned, togglePin,
    lockedNotes, setLockedNotes, persistLocked,
    savedLastId,
    restoredLastOpened, setRestoredLastOpened,
  } = useVaultScopedState(vaultId);

  // Meta refinements buffered from body indexing. The hook owns the buffer +
  // timer and flushes on vault switch / unmount.
  const { queuePatch: queueMetaPatch, flush: flushMetaPatches } =
    useMetaPatchBuffer(activeId, setNotes, vaultId);

  // Task index. Walks `.assets/tasks/*.md` after the vault is ready and keeps
  // a live in-memory snapshot subscribed to mutations.
  const {
    index: taskIndex,
    taskStore,
    tasks: taskList,
    refresh: refreshTaskIndex,
  } = useTaskIndex({ store, vaultId, ready: storeReady });
  // Monotonic counter bumped each time the snapshot identity changes — passed
  // to memoized panels/views as a re-render trigger.
  const [tasksVersion, setTasksVersion] = useState(0);
  useEffect(() => { setTasksVersion(v => v + 1); }, [taskList]);

  // Today-relevant open tasks for the empty-state landing card. "Open" here
  // honours per-instance recurrence state (matching the full TasksListView
  // logic); sorted by urgency so overdue + due-soon items rise to the top.
  const COMPLETED_TASK_STATUSES = useMemo(() => new Set(['done', 'completed']), []);
  const todaysTasks = useMemo(() => {
    if (!taskIndex) return null;
    const today = todayLocalDay();
    const candidates = taskIndex.all().filter(({ task }) => {
      const completed = task.recurrence
        ? effectiveInstanceState(task, today) === 'completed'
        : COMPLETED_TASK_STATUSES.has(task.status);
      return !completed;
    });
    return runQuery(candidates, {
      sort: [{ field: 'urgencyScore' }, { field: 'title' }],
    }, { completedStatusValues: COMPLETED_TASK_STATUSES });
    // tasksVersion is the render-trigger; index drives the actual query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIndex, tasksVersion, COMPLETED_TASK_STATUSES]);

  // Search & discovery. The index is lazy-loaded (dynamic-imported on first
  // prime()) and kept in sync with the notes array. `recent` persists
  // across sessions; `progress` updates as bodies are indexed in idle time.
  const {
    loadCachedSnapshot,
    prime: primeSearch,
    search: runSearch,
    progress: indexProgress,
    recent: recentIds,
    pushRecent,
    updateNote: indexUpdate,
    removeNote: indexRemove,
    renameNote: indexRename,
    tags: indexTags,
    getTagMembers,
    hiddenTags,
    hideTag,
    unhideTag,
    reset: resetSearch,
    dispose: disposeSearch,
    linkIndex,
    linksVersion,
  } = useSearch(store, notes, folders, vaultId, (id, patch) => {
    queueMetaPatch(id, patch);
  });
  useEffect(() => {
    if (indexProgress.total > 0 && indexProgress.indexed >= indexProgress.total) {
      flushMetaPatches();
    }
  }, [flushMetaPatches, indexProgress.indexed, indexProgress.total]);

  // Restrict the tree to notes carrying the active tag. When no filter is
  // set, pass the full notes array through unchanged so nothing else in the
  // render path has to care about tagging.
  const visibleNotes = useMemo(() => {
    if (activeDateFilter) {
      return notes.filter(n => localDayKey(n.updatedAt) === activeDateFilter);
    }
    if (!activeTagFilter) return notes;
    const members = getTagMembers(activeTagFilter);
    if (!members.size) return notes; // index not yet populated — show all
    return notes.filter(n => members.has(n.id));
  }, [notes, activeTagFilter, activeDateFilter, getTagMembers, indexTags]);

  // Prime the index once notes are available so the sidebar TagCloud has
  // data without waiting for the user to open the palette. `primeSearch` is
  // idempotent — later palette-open calls become no-ops.
  useEffect(() => {
    if (!notes.length) return;
    void primeSearch();
  }, [notes.length, primeSearch]);

  // Saved searches ("smart folders") — per-vault persistence + debounced
  // resolution against the current note set. The hook re-resolves whenever
  // the picked search, the saved list, or `notesVersion` changes.
  const {
    items: savedSearches,
    activeId: activeSavedSearchId,
    results: savedSearchResults,
    setActiveId: setActiveSavedSearchId,
    save: handleSaveSearch,
    rename: handleRenameSavedSearch,
    remove: handleDeleteSavedSearch,
  } = useSavedSearches(vaultId, runSearch, notes.length);

  // Selecting a saved search, tag filter, or date filter are mutually
  // exclusive — see useExclusiveFilters for the full ruleset (including
  // the drop-stale-tag cleanup when the tag disappears from the index).
  useExclusiveFilters({
    activeTagFilter, setActiveTagFilter,
    activeSavedSearchId, setActiveSavedSearchId,
    activeDateFilter, setActiveDateFilter,
    indexTags, hiddenTags, notesLength: notes.length,
  });

  // Page-owned ref that EditorPane reads (for click-debounce after Lightbox
  // closes). Lightbox's `onClose` writes the timestamp here.
  const lightboxClosedAt = useRef<number>(0);

  // Hint for the URL-mirror effect (owned by useUrlRouting). User-action
  // paths (selectNote, openTemplate, wikilink click, palette pick, graph
  // click) flip this to 'push' right before setting active state so the
  // browser back button walks through visited notes; everything else gets
  // 'replace' and doesn't spam the history stack. Declared here so earlier-
  // defined callbacks can write to it before the hook runs.
  const nextUrlOpRef = useRef<'push' | 'replace'>('replace');

  // Save/title-save state, refs and callbacks all live in useNoteAutosave.
  // Page.tsx still reads these refs in places like selectNote / openTemplate
  // / restoreFromHistory where it needs to seed lastSavedRef etc. before
  // remounting the editor. The refs are stable across renders, so
  // destructuring them is safe.
  //
  // `renameTemplateRef` is shared between useNoteAutosave and useTemplates.
  // Owned here so we can pass the same instance to both hooks — the
  // autosave hook reads it on the title-rename autosave path, useTemplates
  // writes its latest `handleRenameTemplate` into it.
  const renameTemplateRef = useRef<(templateId: string, newName: string) => Promise<void>>(
    async () => { /* wired up by useTemplates */ },
  );
  // Same shape as renameTemplateRef — wired up by useSkills below.
  const renameSkillRef = useRef<(skillId: string, newName: string) => Promise<void>>(
    async () => { /* wired up by useSkills */ },
  );

  // Local mutation patches keep `notes` / `folders` in sync with the store
  // without walking the entire vault. Each helper runs AFTER the store
  // mutation returns — store failures throw before the helper ever fires.
  // Also owns the auto-title set (note ids whose title tracks the first body
  // line until the user manually edits the title field).
  const {
    removeFolderLocal, addFolderLocal, renameFolderLocal, moveLocal, prependNoteLocal,
    hasAutoTitle, addAutoTitle, deleteAutoTitle, clearAutoTitles,
    pruneAutoTitleNotes, remapAutoTitleNotes,
  } = useLocalNoteMutations(setNotes, setFolders, indexRemove, indexRename);

  // --- Cross-tab sync ---
  // The hook owns the BroadcastChannel subscription + dirty/activeId refs +
  // the "updated in another tab" banner state. Callers broadcast through
  // `syncPost`, and toggle `markDirty` / `clearDirty` as the editor state
  // drifts from / catches up with disk.
  const {
    post: syncPost,
    markDirty, clearDirty,
    externalUpdateId,
    clearExternalUpdate,
    flagExternalUpdate,
  } = useTabSync(store, vaultId, activeId, activeTemplate, {
    onRefresh: async (msg) => {
      // Note + folder list refresh — runs for every message. Templates list
      // refresh runs only for template-* messages so we don't pay for it on
      // every note save.
      try {
        if (msg.type === 'note-saved' || msg.type === 'notes-changed') {
          const data = await store.list();
          setNotes(prev => mergeListedNotes(prev, data.notes));
          setFolders(data.folders);
          if (msg.type === 'note-saved') {
            const fresh = await store.get(msg.id);
            if (fresh) {
              setNotes(prev => patchListedNote(prev, {
                id: fresh.id,
                title: fresh.title,
                createdAt: fresh.createdAt,
                updatedAt: fresh.updatedAt,
                size: fresh.size,
                mtimeMs: fresh.mtimeMs,
              }));
            }
          }
        } else if (msg.type === 'template-saved' || msg.type === 'templates-changed') {
          // refreshTemplates is declared later in the function body via
          // useTemplates; the closure binding is in TDZ at handler-creation
          // but resolves fine when the message arrives async after render.
          await refreshTemplatesRef.current();
        }
      } catch { /* ignore */ }
      if (msg.type === 'note-saved') setHistoryReloadToken(v => v + 1);
    },
    onActiveSilentReload: (fresh) => {
      // If the broadcast also carried a previousId different from the new
      // id, another tab renamed our active note. Apply the same id-remap
      // cascade locally (URL bar, notes-array key, locked/pinned sets,
      // recent list, wikilinks) BEFORE seeding the editor — otherwise the
      // setActiveText below would land on the pre-rename id and the next
      // local autosave would target a path that no longer exists.
      if (fresh.previousId && fresh.previousId !== fresh.id) {
        applyNoteIdRemap(fresh.previousId, fresh.id);
      }
      lastSavedRef.current = fresh.text;
      lastSavedTitleRef.current = fresh.title;
      activeRevisionRef.current = { size: fresh.size, mtimeMs: fresh.mtimeMs };
      setActiveText(fresh.text);
      setEditingTitle(fresh.title);
      setEditorVersion(v => v + 1);
    },
    onActiveTemplateSilentReload: (fresh) => {
      lastSavedRef.current = fresh.content;
      lastSavedTitleRef.current = fresh.name;
      setActiveText(fresh.content);
      setEditingTitle(fresh.name);
      setEditorVersion(v => v + 1);
    },
  });

  // refreshTemplates lives inside useTemplates which is called LATER in this
  // function body. We expose it through a ref so the tab-sync onRefresh
  // closure (created above at useTabSync time) can call it at message time.
  const refreshTemplatesRef = useRef<() => Promise<void>>(async () => { /* wired by useEffect after useTemplates runs */ });

  // Mirror zen state to <body data-zen> so fixed/portaled elements can
  // opt into .zen-hide without threading a prop through every component.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (zenMode) document.body.setAttribute('data-zen', 'true');
    else document.body.removeAttribute('data-zen');
    return () => document.body.removeAttribute('data-zen');
  }, [zenMode]);

  const toggleGraph = useCallback(() => {
    setGraphOpen(prev => !prev);
  }, []);

  // Persist the currently-open note so the next launch reopens it. Scoped
  // per vault and gated on restoredLastOpened so the initial null doesn't
  // wipe the saved id before the restore attempt runs.
  useEffect(() => {
    if (!restoredLastOpened) return;
    if (activeTemplate) return;
    try {
      const k = scopedKey('notes:last-opened');
      if (activeId) window.localStorage.setItem(k, activeId);
      else window.localStorage.removeItem(k);
    } catch { /* ignore */ }
  }, [activeId, activeTemplate, restoredLastOpened, scopedKey]);

  // Sync browser tab title with the current note
  useEffect(() => {
    document.title = activeTemplate
      ? `${editingTitle} (template) — Notes`
      : activeSkill
        ? `${editingTitle} (skill) — Notes`
        : editingTitle && activeId
          ? `${editingTitle} — Notes`
          : 'Notes';
  }, [editingTitle, activeId, activeTemplate, activeSkill]);

  // Mirror of activeId read by `applyNoteIdRemap` so it can check whether
  // the rename targets the currently-active note without racing a mid-await
  // switch. (useNoteAutosave keeps its own internal copy for the same purpose.)
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Remap every piece of state that's keyed on a note's id when the on-disk
  // path changes (rename, lazy UUID-→-title migration, or move). Mirrors
  // handleMove's inline cascade for a single note. The editor's React key is
  // the stable activeUuid, so it stays mounted across the path change — we
  // must NOT clear its onReady refs, or the caret would jump back to column
  // 0 mid-typing on the autosave that flips a legacy `<uuid>.md` to a
  // title-based filename. activeText is still synced from the live editor
  // so the stats effect (deps: [activeText, activeId]) doesn't snap back to
  // seed-time values when activeId changes.
  const applyNoteIdRemap = useCallback((oldId: string, newId: string) => {
    if (oldId === newId) return;
    if (activeIdRef.current === oldId) {
      setActiveText(getMarkdownRef.current?.() ?? activeText);
      setActiveId(newId);
      if (typeof window !== 'undefined') {
        try { window.history.replaceState(null, '', urlFromId(newId, locale)); } catch { /* ignore */ }
      }
    }
    indexRename(oldId, newId);
    setLockedNotes(prev => {
      if (!prev.has(oldId)) return prev;
      const next = new Set(prev);
      next.delete(oldId); next.add(newId);
      persistLocked(next);
      return next;
    });
    setPinned(prev => {
      if (!prev.has(oldId)) return prev;
      const next = new Set(prev);
      next.delete(oldId); next.add(newId);
      persistPinned(next);
      return next;
    });
    remapAutoTitleNotes(oldId, newId, { folder: false });
    moveLocal(oldId, newId);
    if (linkIndex) {
      const oldKey = oldId.replace(/\.md$/, '');
      const newKey = newId.replace(/\.md$/, '');
      if (oldKey !== newKey) {
        void refactorLinks(store, linkIndex, oldKey, newKey).then(r => {
          if (r.notesUpdated > 0) syncPost({ type: 'notes-changed' });
        });
      }
    }
  }, [activeText, locale, indexRename, persistLocked, persistPinned, remapAutoTitleNotes, moveLocal, linkIndex, store, syncPost, setLockedNotes, setPinned]);

  // --- Save / title-save / autosave timers / save status / stats ---
  // Pulled out into useNoteAutosave (Step 5). The hook owns the debounced
  // body+title autosave, the save-status state, the word-count stats, the
  // flush-on-tab-hide listener, and the lazy-uuid → title-filename rename
  // cascade via applyNoteIdRemap above.
  const {
    saveStatus, setSaveStatus, lastSaveError, clearSaveError, noteStats,
    lastSavedRef, lastSavedTitleRef,
    editorReadyRef, getMarkdownRef, editorApiRef,
    autoSaveTimerRef, titleSaveTimerRef,
    showSaved,
    doSave, flushSave, flushTitleSave,
    handleChange, handleTitleChange,
    doRename: _doRename,
    handleReady,
  } = useNoteAutosave({
    store, activeId, activeTemplate, activeSkill, editingTitle, activeText, notes, linkIndex,
    hasAutoTitle, deleteAutoTitle,
    syncPost, clearDirty, markDirty,
    flagExternalUpdate, indexUpdate,
    setNotes, setEditingTitle, setHistoryReloadToken,
    applyNoteIdRemap,
    renameTemplateRef,
    renameSkillRef,
    activeRevisionRef,
    onTitleRenamed: useCallback(async (oldTitle: string, newTitle: string) => {
      const { rewriteWikilinkReferences } = await import('@/lib/tasks');
      await rewriteWikilinkReferences(taskStore, [
        { oldTarget: oldTitle, newTarget: newTitle },
      ], {
        onTaskRewritten: (path, task) => taskIndex.upsert(path, task),
      });
    }, [taskIndex, taskStore]),
  });
  // _doRename re-exported for parity with the prior surface; not consumed in
  // page.tsx today (handleTitleChange routes through the hook). Suppress
  // unused-var warnings without dropping it from the destructure — that way
  // future call paths can light up without re-touching this block.
  void _doRename;

  // --- Templates state + CRUD (Step 6) ---
  // Lives in useTemplates because most of its callbacks need useNoteAutosave's
  // refs (lastSavedRef, getMarkdownRef, etc) — which is why it's destructured
  // here instead of higher up.
  const {
    templates, setTemplates,
    refreshTemplates,
    openTemplate, createTemplate,
    handleDeleteTemplate, handleRenameTemplate, handlePickTemplate,
  } = useTemplates({
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
    tasksSnapshot: taskList,
  });
  // Reference handleRenameTemplate to mirror the prior surface (callers that
  // invoke it directly outside this hook). useTemplates wires the ref
  // internally; this `void` suppresses the unused-var lint without dropping
  // the destructure.
  void handleRenameTemplate;

  // Expose `refreshTemplates` to the tab-sync onRefresh handler (declared
  // earlier in the function body, before `refreshTemplates` was in scope).
  useEffect(() => { refreshTemplatesRef.current = refreshTemplates; }, [refreshTemplates]);

  // --- Skills state + CRUD ---
  // Surfaced to the AI via `load_skill` / `read_skill_file`; user-editable
  // through the main editor (mirrors templates — useNoteAutosave dispatches
  // saves on the activeSkill branch).
  const {
    skills, refreshSkills,
    openSkill, openSkillByUuid, handleDeleteSkill, handleRenameSkill,
    saveSkillFrontmatter, moveSkillTo,
  } = useSkills({
    store, storeReady,
    activeSkill, setActiveSkill, setActiveSkillDescription, setActiveSkillFrontmatter,
    setActiveSkillUuid,
    nextUrlOpRef,
    getMarkdownRef, lastSavedRef, lastSavedTitleRef, activeRevisionRef,
    editorReadyRef, titleSaveTimerRef,
    flushSave, flushTitleSave, showSaved, setSaveStatus,
    setNotes, setActiveId, setActiveUuid, setActiveTemplate,
    setActiveText, setEditingTitle, setEditorVersion, setTocHeadings,
    renameSkillRef,
  });

  // When the user switches to a regular note or a template, clear any
  // lingering active-skill state. The reverse direction (`openSkill` clears
  // activeId / activeTemplate) is handled imperatively in useSkills. This
  // effect avoids threading `setActiveSkill` through every hook that toggles
  // activeId/activeTemplate (selectNote, openTemplate, URL routing, …).
  useEffect(() => {
    if ((activeId || activeTemplate) && activeSkill) {
      setActiveSkill(null);
      setActiveSkillDescription('');
      setActiveSkillUuid(null);
    }
  }, [activeId, activeTemplate, activeSkill]);

  const {
    skillFrontmatterFields,
    handleMoveSkill,
  } = useSkillFrontmatterAutosave({
    activeSkill,
    activeSkillFrontmatter,
    editingTitle,
    handleTitleChange,
    setActiveSkillDescription,
    setActiveSkillFrontmatter,
    saveSkillFrontmatter,
    flushTitleSave,
    moveSkillTo,
  });

  // --- Folder + tree mutations (Step 8) ---
  // Lives above useNoteCommands because useNoteCommands consumes expandPath
  // and setTargetFolder. Owns the `expanded` and `targetFolder` page state;
  // setExpanded/setTargetFolder are exposed because pickBrowserDir resets
  // them on vault switch.
  const {
    expanded, setExpanded,
    targetFolder, setTargetFolder,
    expandPath, toggleFolder, handleFolderClick, revealFolderInSidebar,
    deleteItem, createFolder, createFolderAt, handleRenameFolder, handleMove,
  } = useFolderCommands({
    store, activeId, activeText, linkIndex,
    getMarkdownRef, lastSavedRef, lastSavedTitleRef, activeRevisionRef, editorReadyRef,
    flushSave, flushTitleSave,
    addFolderLocal, removeFolderLocal, renameFolderLocal, moveLocal,
    pruneAutoTitleNotes, remapAutoTitleNotes,
    setPinned, persistPinned, setLockedNotes, persistLocked,
    indexRemove, indexRename,
    syncPost,
    setActiveId, setActiveUuid, setActiveText, setNotes,
  });

  // --- Wikilink + backlink resolution (Step 10) ---
  // Lives above useNoteCommands because handleNavigateLink reads
  // linkResolverRef.current at click-time. Owns notesById / linkResolver /
  // linkResolverRef / isKnownLinkTarget / getWikilinkCandidates /
  // backlinksCount.
  const {
    notesById, linkResolverRef,
    isKnownLinkTarget, getWikilinkCandidates,
    backlinksCount,
  } = useLinkResolution({ notes, activeId, linkIndex, linksVersion });

  // --- Note selection, creation, lifecycle, import, lock (Step 7) ---
  // The hook owns selectNote / createNoteInFolder / createNote / closeActiveNote
  // / deleteNote (with two-click confirm) / handleDuplicate / handleExport /
  // handleLinkMention / handleNavigateLink / importFile / importFiles /
  // handleDrop / toggleLock + the derived `isLocked`. It reads the
  // useNoteAutosave refs+callbacks to flush in-flight saves before navigation
  // and to seed lastSavedRef/lastSavedTitleRef on note open.
  const {
    isLocked, toggleLock,
    selectNote, createNoteInFolder, createNote, closeActiveNote,
    deleteNote, confirmDelete,
    handleDuplicate, handleExport,
    handleLinkMention, handleNavigateLink,
    importFile: _importFile, importFiles: _importFiles, handleDrop,
  } = useNoteCommands({
    store, activeId, activeTemplate, activeText, targetFolder, locale,
    untitledLabel: 'Untitled',
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
  });
  // Re-exported for parity with the prior surface; not consumed in page.tsx
  // today (handleDrop is the JSX funnel; importFile/importFiles are internal
  // to the hook). Voids suppress unused-var lints without dropping the
  // destructure entries.
  void _importFile; void _importFiles;

  // Bridge between the URL layer and the task index. UUID-keyed
  // `/tasks/<uuid>` URLs survive renames; the lookups translate between the
  // index's path-keyed entries and the URL's UUID surface.
  const TASKS_DIR_PREFIX = '.assets/tasks/';
  const taskUuidByPath = useCallback((id: string): string | null => {
    if (!id.startsWith(TASKS_DIR_PREFIX)) return null;
    const basename = id.slice(TASKS_DIR_PREFIX.length);
    return taskIndex?.get(basename)?.id ?? null;
  }, [taskIndex]);
  const openTaskByUuid = useCallback(async (uuid: string, opts?: { replace?: boolean }) => {
    const hit = taskIndex?.byIdLookup(uuid);
    if (!hit) return false;
    await selectNote(`${TASKS_DIR_PREFIX}${hit.path}`, { replace: opts?.replace });
    return true;
  }, [taskIndex, selectNote]);

  // Two-way URL ↔ active-note binding. Hook owns boot restore, URL mirror,
  // popstate, `/new` deferred create, and the not-found banner state.
  const {
    notFoundSlug, dismissNotFound,
    queuePendingCreate,
  } = useUrlRouting({
    storeReady, loading, needsDirPick,
    restoredLastOpened, setRestoredLastOpened,
    notes, activeId, activeTemplate, activeSkillUuid, savedLastId,
    setActiveId, setActiveTemplate, setActiveSkill,
    selectNote, openTemplate, createNoteInFolder,
    nextUrlOpRef,
    taskUuidByPath, openTaskByUuid,
    openSkillByUuid,
  });

  // --- Chat wiring (Step 11) ---
  // Owns chat drawer state + mentioned-selection ref/state, the open/close
  // wrappers, getChatNoteContext (system-prompt context resolved at
  // send-time), clearAllChats, applyAiEdit (in-place editor swap), and
  // the open-as-note / navigate-to-chat-note handlers. Runs AFTER
  // useNoteCommands + useUrlRouting because it consumes selectNote +
  // loadNotes.
  const {
    chatOpen, setChatOpen,
    chatClearing, chatResetNonce,
    chatMentionedSelection,
    setChatMentionedSelection,
    clearChatMentionedSelection,
    toggleChat, closeChat, openChatWithSelection,
    getChatNoteContext,
    clearAllChats, applyAiEdit,
    openChatAsNote, navigateToChatNote,
  } = useChatWiring({
    store, activeId, editingTitle, activeText, folders,
    skills: skills.map(s => ({ name: s.name, description: s.description })),
    getMarkdownRef, editorApiRef, editorReadyRef, lastSavedRef,
    doSave, clearDirty, loadNotes, selectNote,
    setActiveText, setEditorVersion,
    tToast,
  });

  // App-global keyboard shortcuts (see useAppKeyboardShortcuts for the full
  // shortcut table). Passed the actions bundle they drive — `memoized`
  // callbacks only, so the effect doesn't resubscribe on unrelated renders.
  const keyboardActions = useMemo(() => ({
    toggleZen, toggleSidebar, toggleRightDock, toggleGraph,
    toggleNarrowEditor, toggleLock,
    toggleChat,
    togglePalette: () => {
      setPaletteOpen(v => {
        const next = !v;
        if (next) void primeSearch();
        return next;
      });
    },
    toggleSettings: () => setSettingsOpen(v => !v),
    toggleFileExplorer: () => setFileExplorerOpen(v => !v),
    toggleTasksView: () => setTasksViewOpen(v => !v),
    flushSaves: () => {
      void flushSave({ force: true });
      void flushTitleSave();
    },
    createNote: () => {
      void createNoteInFolder(DEFAULT_NEW_NOTE_FOLDER, { replaceUrl: true });
    },
    createTask: () => {
      // Pre-fill the new task with the active note as a project so the
      // Ctrl+T flow drops the task onto whatever the user is currently
      // working on. ProjectTasksPanel resolves these wikilinks by note
      // title, so that's the form we write here.
      const activeTitle = activeId
        ? (notes.find(n => n.id === activeId)?.title ?? '').trim()
        : '';
      setTaskCreateInitial(activeTitle ? { projects: [`[[${activeTitle}]]`] } : undefined);
      setTaskCreateOpen(true);
    },
    closeActiveNote: () => { void closeActiveNote(); },
    queuePendingCreate,
  }), [
    activeId, notes,
    toggleZen, toggleSidebar, toggleRightDock, toggleGraph,
    toggleNarrowEditor, toggleLock, primeSearch, flushSave, flushTitleSave,
    createNoteInFolder, closeActiveNote, queuePendingCreate,
  ]);
  useAppKeyboardShortcuts({
    activeId, activeTitle: editingTitle, storeReady, needsDirPick, zenMode, editorSettings, setEditorSettings,
    actions: keyboardActions,
  });

  // --- Wire forward-refs into useVaultLifecycle (Step 9) ---
  // useSearch / useTemplates / useFolderCommands / useVaultScopedState all
  // declare their setters AFTER useVaultLifecycle. We expose them through
  // refs the hook reads at call time (loadNotes / pickBrowserDir).
  useEffect(() => { loadCachedSnapshotRef.current = loadCachedSnapshot; }, [loadCachedSnapshot]);
  useEffect(() => { disposeSearchRef.current = disposeSearch; }, [disposeSearch]);
  useEffect(() => {
    vaultResetRef.current = () => {
      setActiveTemplate(null);
      setTemplates([]);
      setActiveTagFilter(null);
      setActiveSavedSearchId(null);
      setExpanded(new Set());
      setTargetFolder('');
      clearAutoTitles();
    };
  }, [
    setActiveTemplate, setTemplates, setActiveTagFilter, setActiveSavedSearchId,
    setExpanded, setTargetFolder, clearAutoTitles,
  ]);
  // --- Asset handlers for browser-fs mode (passed to MilkdownEditor) ---
  const bfsUpload = useCallback(async (file: File) => {
    if (!activeId) throw new Error('No active note');
    return store.uploadAsset(activeId, file);
  }, [store, activeId]);

  // Synchronous lookup against the cache populated by preloadAssets() +
  // uploadAsset(). Must be sync so Milkdown's proxyDomURL gets the mapping
  // in the same tick — otherwise images render before the blob URL arrives.
  const bfsProxy = useCallback((url: string) => {
    if (!activeId) return url;
    return store.getAssetUrl(activeId, url);
  }, [store, activeId]);

  // Recover a note whose live file was deleted (case-insensitive-FS data
  // loss, external Finder delete, etc.). Unlike `restoreFromHistory`, this
  // doesn't read the missing file — it creates one fresh from the editor's
  // in-memory body via `store.recoverNote`. Used by RecoveryDialog's
  // "Recover with these edits" path.
  const recoverActiveNote = useCallback(async (body: string) => {
    if (!activeId) return;
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const noteRecord = notes.find(n => n.id === activeId);
    const uuid = noteRecord?.uuid;
    if (!uuid) {
      console.error('[notes] cannot recover: missing uuid for', activeId);
      setSaveStatus('error');
      return;
    }
    const title = (editingTitle.trim() || noteRecord?.title || 'Untitled');
    const createdAt = noteRecord?.createdAt;
    let meta;
    try {
      meta = await store.recoverNote(activeId, body, { uuid, title, createdAt });
    } catch (err) {
      console.error('[notes] recover failed', err);
      setSaveStatus('error');
      return;
    }
    activeRevisionRef.current = { size: meta.size, mtimeMs: meta.mtimeMs };
    lastSavedRef.current = body;
    clearDirty();
    clearSaveError();
    setActiveText(body);
    setNotes(prev => prev.map(n => n.id === meta.id
      ? { ...n, title: meta.title, updatedAt: meta.updatedAt, size: meta.size, mtimeMs: meta.mtimeMs }
      : n));
    setEditorVersion(v => v + 1);
    setHistoryReloadToken(v => v + 1);
    syncPost({ type: 'note-saved', id: activeId });
    indexUpdate(activeId);
    setSaveStatus('saved');
    setRecoveryOpen(false);
  }, [
    activeId, notes, editingTitle, store, indexUpdate, clearDirty, clearSaveError,
    syncPost, autoSaveTimerRef, activeRevisionRef, lastSavedRef, setSaveStatus,
  ]);

  // Recover from a history snapshot whose raw content (frontmatter+body) is
  // already in hand. Strip the frontmatter, then route through
  // `recoverActiveNote` so the file gets recreated and React state syncs.
  const recoverFromSnapshot = useCallback(async (raw: string) => {
    const m = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    const body = m ? m[1] : raw;
    await recoverActiveNote(body);
  }, [recoverActiveNote]);

  // Restore a historical snapshot as the current body. Writes via
  // saveContent (which snapshots the pre-restore state, so restores are
  // themselves reversible), then remounts the editor with the new content.
  const restoreFromHistory = useCallback(async (body: string) => {
    if (!activeId) return;
    // Cancel anything pending so it can't race the restore.
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    editorReadyRef.current = false;
    let meta;
    try {
      meta = await store.saveContent(activeId, body, undefined, {
        expected: activeRevisionRef.current,
      });
    } catch (err) {
      console.error('[notes] restore failed', err);
      if (isNoteConflictError(err)) {
        flagExternalUpdate(activeId);
      }
      setSaveStatus('error');
      return;
    }
    activeRevisionRef.current = { size: meta.size, mtimeMs: meta.mtimeMs };
    lastSavedRef.current = body;
    clearDirty();
    setActiveText(body);
    setEditorVersion(v => v + 1);
    setHistoryReloadToken(v => v + 1);
    syncPost({ type: 'note-saved', id: activeId });
    indexUpdate(activeId);
    setSaveStatus('saved');
  }, [activeId, store, indexUpdate, clearDirty, syncPost, flagExternalUpdate]);

  // Discard local unsaved edits and re-read the active note from disk.
  // Used by the "updated in another tab" conflict banner.
  const reloadActiveFromDisk = useCallback(async () => {
    if (!activeId) return;
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    editorReadyRef.current = false;
    try {
      const fresh = await store.get(activeId);
      if (fresh) {
        lastSavedRef.current = fresh.text || '';
        lastSavedTitleRef.current = fresh.title || '';
        activeRevisionRef.current = { size: fresh.size, mtimeMs: fresh.mtimeMs };
        clearDirty();
        setActiveText(fresh.text || '');
        setEditingTitle(fresh.title || '');
        setEditorVersion(v => v + 1);
        setHistoryReloadToken(v => v + 1);
      }
    } catch (err) {
      console.error('[notes] reload failed', err);
    }
    clearExternalUpdate();
  }, [activeId, store, clearDirty, clearExternalUpdate]);

  // --- Command palette actions + visible tags + settings patcher (Step 10) ---
  const { visiblePaletteTags, patchSettings, paletteActions } = usePaletteActions({
    tCmd, tToast,
    activeId, isLocked,
    chatOpen, setChatOpen, chatDrawerShortcut: CHAT_DRAWER_SHORTCUT,
    newNoteShortcut: NEW_NOTE_SHORTCUT, newTaskShortcut: NEW_TASK_SHORTCUT,
    toggleZen, toggleSidebar, toggleHistory, toggleBacklinks, toggleTasks, toggleRightDock, toggleGraph,
    toggleNarrowEditor, toggleLock, narrowEditor,
    editorSettings, setEditorSettings,
    createNote, createTemplate, closeActiveNote, handleDuplicate, handleExport,
    resolvedTheme, paletteId, setPaletteId,
    indexTags, hiddenTags,
    openTasksView: useCallback(() => setTasksViewOpen(true), []),
    openCreateTask: useCallback(() => setTaskCreateOpen(true), []),
  });

  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeFileExplorer = useCallback(() => setFileExplorerOpen(false), []);

  // Apply an AI-proposed `create_note`: write the file, prepend it to the
  // sidebar, and surface a confirmation toast. The user navigates manually
  // (we don't auto-jump — the chat conversation is usually still relevant).
  const applyAiCreate = useCallback(async (input: CreateNoteInput) => {
    const folder = input.folder?.trim() || undefined;
    const meta = await store.create(input.title, input.content, folder);
    prependNoteLocal(meta);
    if (folder) addFolderLocal(folder);
    addAutoTitle(meta.id);
    syncPost({ type: 'notes-changed' });
    if (folder) expandPath(folder);
    showToast(tToast('noteCreated'));
  }, [store, prependNoteLocal, addFolderLocal, expandPath, addAutoTitle, syncPost, tToast]);

  const applyAiManageTasks = useCallback(async (input: ManageTasksInput) => {
    if (input.kind === 'create_task') {
      const { kind: _kind, ...taskInput } = input;
      void _kind;
      const result = await createTaskOp(taskStore, taskInput);
      if (!result.ok) throw new Error(result.message);
      await refreshTaskIndex(result.value.path);
      showToast(tToast('taskCreated'));
      return;
    }
    if (input.kind === 'complete_task') {
      const task = taskIndex.get(input.path);
      const result = task?.recurrence
        ? await completeInstanceOp(taskStore, input.path, { targetDay: input.completion_day ?? todayLocalDay() })
        : await completeTaskOp(taskStore, input.path, { completionDay: input.completion_day });
      if (!result.ok) throw new Error(result.message);
      await refreshTaskIndex(input.path);
      showToast(tToast('taskUpdated'));
      return;
    }
    if (input.kind === 'uncomplete_task') {
      const task = taskIndex.get(input.path);
      const result = task?.recurrence
        ? await uncompleteInstanceOp(taskStore, input.path, { targetDay: todayLocalDay() })
        : await uncompleteTaskOp(taskStore, input.path);
      if (!result.ok) throw new Error(result.message);
      await refreshTaskIndex(input.path);
      showToast(tToast('taskUpdated'));
      return;
    }
    if (input.kind === 'update_task') {
      const result = await updateTaskOp(taskStore, input.path, input.patch as TaskPatch);
      if (!result.ok) throw new Error(result.message);
      await refreshTaskIndex(result.value.path);
      showToast(tToast('taskUpdated'));
      return;
    }
    const result = await deleteTaskOp(taskStore, input.path);
    if (!result.ok) throw new Error(result.message);
    await refreshTaskIndex(input.path);
    showToast(tToast('taskDeleted'));
  }, [refreshTaskIndex, taskIndex, taskStore, tToast]);

  // Compose the AI's two read-only tool executors (`search_vault` for notes,
  // `search_tasks` for the task index) into one dispatcher. Memoized on
  // their stable inputs so the chat hook gets the same executor reference
  // across re-renders, preventing the `executeReadOnlyTool` ref from
  // churning. Each underlying builder throws on the wrong toolName, so the
  // dispatcher is just a switch.
  const runReadOnlyTool: ReadOnlyToolExecutor = useMemo(() => {
    const searchVault = buildSearchVaultExecutor({ runSearch });
    const searchTasks = buildSearchTasksExecutor({ taskIndex });
    const readNote = buildReadNoteExecutor({ store });
    const getDatetime = buildGetDatetimeExecutor();
    const loadSkill = buildLoadSkillExecutor({ store });
    const readSkillFile = buildReadSkillFileExecutor({ store });
    return (toolName, input) => {
      if (toolName === 'search_vault') return searchVault(toolName, input);
      if (toolName === 'search_tasks') return searchTasks(toolName, input);
      if (toolName === 'read_note') return readNote(toolName, input);
      if (toolName === 'get_datetime') return getDatetime(toolName, input);
      if (toolName === 'load_skill') return loadSkill(toolName, input);
      if (toolName === 'read_skill_file') return readSkillFile(toolName, input);
      // MCP read-only tools are namespaced `mcp__server__toolname` and routed
      // to the connected client by the manager. Anything else is unsupported.
      if (toolName.startsWith('mcp__')) return getMcpManager().executeTool(toolName, input);
      throw new Error(`Unsupported read-only tool: ${toolName}`);
    };
  }, [runSearch, taskIndex, store]);

  // Approval-required MCP tool calls. Routes the namespaced name + args
  // straight to the connected MCP client; the chat hook surfaces the result.
  const runMcpCall = useCallback(async (input: McpCallInput) => {
    return getMcpManager().executeTool(input.namespacedName, input.args);
  }, []);

  // Pre-main fallback screens — the real app only renders below when the
  // store is ready AND the URL slug resolves to a real note.
  if (notFoundSlug && !activeId) {
    return <NotFoundScreen slug={notFoundSlug} onDismiss={dismissNotFound} />;
  }
  if (!storeReady) {
    // Always render the full prompt — users must always have a way to pick
    // a folder. For returning users, initialize() auto-grants within a few
    // ms and flips storeReady to true before this even paints a frame; the
    // brief visibility is acceptable vs. the risk of getting stuck on a
    // loader if initialize() ever hangs (IDB issues, permission quirks).
    return (
      <FolderPickerScreen
        label={bfsLabel}
        error={bfsError}
        requestedNewNote={slugFromPath(pathname) === NEW_NOTE_SLUG}
        onPick={() => pickBrowserDir(false)}
      />
    );
  }

  return (
    <div className="flex h-screen relative"
      onDragOver={e => {
        // Only show the OS-import overlay for actual file drags; ignore
        // internal note/folder drags (which carry a custom mime type).
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        // Drags onto the chat drawer bubble up here too — let the drawer
        // own its own drop UX and keep the page-level import overlay hidden.
        const target = e.target as Element | null;
        if (target?.closest?.('[data-testid="chat-drawer"]')) {
          if (dragging) setDragging(false);
          return;
        }
        setDragging(true);
      }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {dragging && (
        <div className="absolute inset-0 z-50 bg-[var(--bg)]/80 flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-accent rounded-xl px-8 py-6 text-accent text-sm font-medium">
            Drop .md files to import
          </div>
        </div>
      )}

      <NotesSidebar
        open={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        loading={loading}
        targetFolder={targetFolder}
        setTargetFolder={setTargetFolder}
        onCreateNote={createNote}
        onCreateFolder={createFolder}
        onCreateTemplate={createTemplate}
        indexTags={indexTags}
        activeTagFilter={activeTagFilter}
        setActiveTagFilter={setActiveTagFilter}
        hiddenTags={hiddenTags}
        hideTag={hideTag}
        unhideTag={unhideTag}
        activeDateFilter={activeDateFilter}
        setActiveDateFilter={setActiveDateFilter}
        recentIds={recentIds}
        notesById={notesById}
        activeId={activeId}
        editingTitle={editingTitle}
        selectNote={selectNote}
        savedSearches={savedSearches}
        activeSavedSearchId={activeSavedSearchId}
        setActiveSavedSearchId={setActiveSavedSearchId}
        onRenameSavedSearch={handleRenameSavedSearch}
        onDeleteSavedSearch={handleDeleteSavedSearch}
        templates={templates}
        activeTemplate={activeTemplate}
        openTemplate={openTemplate}
        onRenameTemplate={handleRenameTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        notes={notes}
        visibleNotes={visibleNotes}
        folders={folders}
        savedSearchResults={savedSearchResults}
        expanded={expanded}
        toggleFolder={toggleFolder}
        onFolderClick={handleFolderClick}
        pinned={pinned}
        togglePin={togglePin}
        deleteItem={deleteItem}
        onMove={handleMove}
        onRenameFolder={handleRenameFolder}
        bfsLabel={bfsLabel}
        onPickFolder={() => {
          // In docs mode, pickBrowserDir routes through BundledDocsStore.pickDirectory
          // which always returns false. Route through swapToFsAndPick instead so the
          // sidebar's footer affordance behaves the same as the banner CTA.
          if (isBundledDocsVaultId(vaultId)) {
            void swapToFsAndPick();
          } else {
            void pickBrowserDir(true);
          }
        }}
        dense={editorSettings.denseSidebar}
        showCalendar={showCalendar}
        showTags={showTags}
        showRecent={showRecent}
        showTemplates={showTemplates}
        showSkills={showSkills}
        skills={skills}
        activeSkill={activeSkill}
        onSelectSkill={(id) => { void openSkill(id); }}
        onImportSkill={() => setSkillImportOpen(true)}
        onRenameSkill={handleRenameSkill}
        onDeleteSkill={handleDeleteSkill}
        onMoveSkill={handleMoveSkill}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {skillImportOpen && (
        <SkillImportDialog
          store={store}
          onClose={() => setSkillImportOpen(false)}
          onCreated={() => { void refreshSkills(); }}
        />
      )}


      {/* Editor panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {isBundledDocsVaultId(vaultId) && (
          <DocsBanner
            onPickFolder={() => { void swapToFsAndPick(); }}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
          />
        )}
        {(activeId || activeTemplate || activeSkill) ? (
          <>
            <EditorHeaderToolbar
              activeId={activeId}
              activeTemplate={activeTemplate}
              activeSkill={activeSkill}
              editingTitle={editingTitle}
              isLocked={isLocked}
              confirmDelete={confirmDelete}
              sidebarOpen={sidebarOpen}
              backlinksOpen={backlinksOpen}
              historyOpen={historyOpen}
              narrowEditor={narrowEditor}
              paletteId={paletteId}
              editorSettings={editorSettings}
              noteStats={noteStats}
              saveStatus={saveStatus}
              saveErrorKind={lastSaveError && lastSaveError.id === activeId ? lastSaveError.kind : undefined}
              onOpenRecovery={() => setRecoveryOpen(true)}
              backlinksCount={backlinksCount}
              onTitleChange={handleTitleChange}
              onToggleSidebar={toggleSidebar}
              onToggleLock={toggleLock}
              onToggleBacklinks={toggleBacklinks}
              onToggleGraph={toggleGraph}
              onToggleHistory={toggleHistory}
              onToggleNarrow={toggleNarrowEditor}
              onPaletteChange={setPaletteId}
              onEditorSettingsChange={setEditorSettings}
              onDuplicate={handleDuplicate}
              onExport={handleExport}
              onDelete={deleteNote}
              onJumpToNote={(id) => { void selectNote(id); }}
              suppressSidebarToggle={isBundledDocsVaultId(vaultId)}
              frontmatterFields={activeSkill ? skillFrontmatterFields : undefined}
            />
            {externalUpdateId && externalUpdateId === activeId && (
              <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--panel-2)] flex items-center justify-between text-xs gap-3">
                <span className="text-muted">
                  This note was updated in another tab. Your local edits are unsaved.
                </span>
                <div className="flex gap-2 shrink-0">
                  <button onClick={reloadActiveFromDisk}
                    className="px-2 py-1 rounded border border-[var(--border)] text-text hover:bg-[var(--panel)] transition-colors">
                    Reload (discard mine)
                  </button>
                  <button onClick={() => clearExternalUpdate()}
                    className="px-2 py-1 rounded text-muted hover:text-text transition-colors">
                    Keep mine
                  </button>
                </div>
              </div>
            )}
            <EditorPane
              activeId={activeId}
              activeTemplate={activeTemplate}
              activeSkill={activeSkill}
              activeUuid={activeUuid}
              editorVersion={editorVersion}
              activeText={activeText}
              editorSettings={editorSettings}
              narrowEditor={narrowEditor}
              tocHeadings={tocHeadings}
              isLocked={isLocked}
              hasAutoTitle={hasAutoTitle}
              onUpload={bfsUpload}
              proxyUrl={bfsProxy}
              onReady={handleReady}
              onChange={handleChange}
              onHeadingsChange={setTocHeadings}
              onAskAi={openChatWithSelection}
              onNavigateLink={handleNavigateLink}
              isKnownLinkTarget={isKnownLinkTarget}
              linkTargetsVersion={notes.length + linksVersion}
              getWikilinkCandidates={getWikilinkCandidates}
              resolveLinkId={(target) => resolveLink(linkResolverRef.current, target)?.id ?? null}
              getNoteHref={(target) => {
                const id = resolveLink(linkResolverRef.current, target)?.id;
                return id ? urlFromId(id, locale) : null;
              }}
              readNoteBody={async (id) => {
                // Preload the linked note's assets into the storage cache so
                // any image references inside (e.g. `.assets/images/foo.png`
                // in a canvas file-node preview or a transclusion) resolve
                // synchronously when the editor's `proxyDomURL` / canvas's
                // `proxyAssetUrl` is called. Without this, bfsProxy hits an
                // empty cache and falls through to the raw relative path,
                // and the browser 404s.
                const note = await store.get(id);
                const text = note?.text ?? '';
                if (text) await store.preloadAssets(id, text);
                return text;
              }}
              templates={templates}
              onPickTemplate={handlePickTemplate}
              onLightboxOpen={setLightboxSrc}
              lightboxClosedAtRef={lightboxClosedAt}
            />
          </>
        ) : (
          <EmptyState
            notes={notes}
            activeId={activeId}
            activeTemplate={activeTemplate}
            sidebarOpen={sidebarOpen}
            locale={locale}
            onCreateNote={() => { void createNote(); }}
            onSelectNote={(id) => { void selectNote(id); }}
            onToggleSidebar={toggleSidebar}
            hideHeader={isBundledDocsVaultId(vaultId)}
            todaysTasks={todaysTasks}
            onOpenTasksView={() => setTasksViewOpen(true)}
            onCreateTask={() => setTaskCreateOpen(true)}
            onOpenTask={(taskPath) => { void selectNote(`.assets/tasks/${taskPath}`); }}
            onToggleTaskComplete={async (taskPath, currentlyDone) => {
              const task = taskIndex?.get(taskPath);
              const isRecurring = !!task?.recurrence;
              if (isRecurring) {
                const today = todayLocalDay();
                if (currentlyDone) await uncompleteInstanceOp(taskStore, taskPath, { targetDay: today });
                else await completeInstanceOp(taskStore, taskPath, { targetDay: today });
              } else if (currentlyDone) {
                await uncompleteTaskOp(taskStore, taskPath);
              } else {
                await completeTaskOp(taskStore, taskPath, {});
              }
              await refreshTaskIndex(taskPath);
            }}
          />
        )}
      </div>

      <RightDock
        backlinksOpen={backlinksOpen}
        historyOpen={historyOpen}
        tasksOpen={tasksOpen}
        activeId={activeId}
        linkIndex={linkIndex}
        linksVersion={linksVersion}
        notesById={notesById}
        activeBody={activeText}
        onSelectNote={selectNote}
        onLinkMention={handleLinkMention}
        onCloseBacklinks={() => setBacklinksOpen(false)}
        store={store}
        historyReloadToken={historyReloadToken}
        onRestoreFromHistory={restoreFromHistory}
        onCloseHistory={toggleHistory}
        taskIndex={taskIndex}
        tasksVersion={tasksVersion}
        onOpenTask={(taskPath) => {
          const fullPath = `.assets/tasks/${taskPath}`;
          void selectNote(fullPath);
        }}
        onToggleTaskComplete={async (taskPath, currentlyDone) => {
          const task = taskIndex?.get(taskPath);
          const isRecurring = !!task?.recurrence;
          if (isRecurring) {
            // Target today — the row's "done" state is computed against
            // today's date, so completion has to flip the same date or the
            // click looks like a no-op when scheduled/due are in the future.
            const today = todayLocalDay();
            if (currentlyDone) await uncompleteInstanceOp(taskStore, taskPath, { targetDay: today });
            else await completeInstanceOp(taskStore, taskPath, { targetDay: today });
          } else if (currentlyDone) {
            await uncompleteTaskOp(taskStore, taskPath);
          } else {
            await completeTaskOp(taskStore, taskPath, {});
          }
          await refreshTaskIndex(taskPath);
        }}
        onCloseTasks={toggleTasks}
      />

      {recoveryOpen && activeId && (
        <RecoveryDialog
          store={store}
          noteId={activeId}
          noteUuid={notes.find(n => n.id === activeId)?.uuid ?? null}
          noteTitle={editingTitle || notes.find(n => n.id === activeId)?.title || ''}
          body={getMarkdownRef.current?.() ?? activeText}
          createdAt={notes.find(n => n.id === activeId)?.createdAt}
          onRecover={recoverActiveNote}
          onRestoreSnapshot={recoverFromSnapshot}
          onClose={() => setRecoveryOpen(false)}
        />
      )}

      {graphOpen && (
        <GraphView
          notes={notes}
          notesById={notesById}
          linkIndex={linkIndex}
          linksVersion={linksVersion}
          activeId={activeId}
          onSelect={(id) => { setGraphOpen(false); void selectNote(id); }}
          onClose={() => setGraphOpen(false)}
        />
      )}

      <TasksListView
        open={tasksViewOpen}
        index={taskIndex}
        version={tasksVersion}
        onOpenTask={(taskPath) => {
          setTasksViewOpen(false);
          void selectNote(`.assets/tasks/${taskPath}`);
        }}
        onToggleComplete={async (taskPath, currentlyDone) => {
          const task = taskIndex?.get(taskPath);
          const isRecurring = !!task?.recurrence;
          if (isRecurring) {
            // Target today — see the matching note on `onToggleTaskComplete`
            // above. The row's "done" check is against today's date.
            const today = todayLocalDay();
            if (currentlyDone) await uncompleteInstanceOp(taskStore, taskPath, { targetDay: today });
            else await completeInstanceOp(taskStore, taskPath, { targetDay: today });
          } else if (currentlyDone) {
            await uncompleteTaskOp(taskStore, taskPath);
          } else {
            await completeTaskOp(taskStore, taskPath, {});
          }
          await refreshTaskIndex(taskPath);
        }}
        onCreateTask={() => setTaskCreateOpen(true)}
        onEditTask={(taskPath) => {
          const task = taskIndex?.get(taskPath);
          if (!task) return;
          setTaskEditTarget({ path: taskPath, task });
        }}
        onDeleteTask={async (taskPath) => {
          const result = await deleteTaskOp(taskStore, taskPath);
          if (result.ok) {
            await refreshTaskIndex(taskPath);
            showToast(tToast('taskDeleted'));
          } else {
            showToast(tToast('taskDeleteFailed'));
          }
        }}
        onUpdateTaskDate={async (taskPath, field, value) => {
          const result = await updateTaskOp(taskStore, taskPath, { [field]: value });
          if (result.ok) {
            await refreshTaskIndex(result.value.path);
          } else {
            showToast(tToast('taskUpdateFailed'));
          }
        }}
        onUpdateTaskPriority={async (taskPath, priority) => {
          const result = await updateTaskOp(taskStore, taskPath, { priority });
          if (result.ok) {
            await refreshTaskIndex(result.value.path);
          } else {
            showToast(tToast('taskUpdateFailed'));
          }
        }}
        onUpdateTaskStatus={async (taskPath, status) => {
          // Kanban status drops should land in the destination column —
          // including custom completed values like 'completed' and
          // recurring tasks. Per-instance toggling (the checkbox tick) is
          // handled separately on `onToggleComplete`. See `statusDropPatch`
          // for the rationale.
          const task = taskIndex?.get(taskPath);
          if (!task) return;
          const patch = statusDropPatch(task, status, todayLocalDay());
          const result = await updateTaskOp(taskStore, taskPath, patch);
          if (result.ok) {
            await refreshTaskIndex(result.value.path);
          } else {
            showToast(tToast('taskUpdateFailed'));
          }
        }}
        onUpdateTaskList={async (taskPath, field, next) => {
          const result = await updateTaskOp(taskStore, taskPath, { [field]: next });
          if (result.ok) {
            await refreshTaskIndex(result.value.path);
          } else {
            showToast(tToast('taskUpdateFailed'));
          }
        }}
        onClose={() => setTasksViewOpen(false)}
      />

      <TaskFormModal
        open={taskCreateOpen || taskEditTarget !== null}
        mode={taskEditTarget ? 'edit' : 'create'}
        initial={taskEditTarget
          ? taskToFormInitial(taskEditTarget.task)
          : taskCreateInitial}
        notes={notes}
        tagSuggestions={taskIndex?.tagKeys()}
        contextSuggestions={taskIndex?.contextKeys()}
        onSubmit={async (input: CreateTaskInput) => {
          if (taskEditTarget) {
            const result = await updateTaskOp(taskStore, taskEditTarget.path, {
              title: input.title,
              status: input.status,
              priority: input.priority,
              due: input.due,
              scheduled: input.scheduled,
              tags: input.tags,
              contexts: input.contexts,
              projects: input.projects,
              recurrence: input.recurrence,
              body: input.body ?? '',
            });
            if (result.ok) {
              await refreshTaskIndex(result.value.path);
              showToast(tToast('taskUpdated'));
            } else {
              showToast(tToast('taskUpdateFailed'));
            }
          } else {
            const result = await createTaskOp(taskStore, input);
            if (result.ok) {
              await refreshTaskIndex(result.value.path);
              showToast(tToast('taskCreated'));
            } else {
              showToast(tToast('taskCreateFailed'));
            }
          }
        }}
        onClose={() => {
          setTaskCreateOpen(false);
          setTaskEditTarget(null);
          setTaskCreateInitial(undefined);
        }}
      />

      {/* Zen exit button — styled + hidden via body[data-zen] in globals.css */}
      <button
        type="button"
        className="zen-exit"
        onClick={toggleZen}
        aria-label={tPage('exitZenMode')}
        title={tPage('exitZenModeTitle')}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>

      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => { lightboxClosedAt.current = Date.now(); setLightboxSrc(null); }} />
      )}

      {paletteOpen && (
        <CommandPalette
          open={paletteOpen}
          onClose={closePalette}
          onSelectNote={selectNote}
          actions={paletteActions}
          search={runSearch}
          notesById={notesById}
          recent={recentIds}
          progress={indexProgress}
          tags={visiblePaletteTags}
          onSelectTag={setActiveTagFilter}
          initialInput={activeTagFilter ? `#${activeTagFilter}` : undefined}
          onSaveSearch={handleSaveSearch}
        />
      )}

      {settingsOpen && (
        <SettingsPopover
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          dense={editorSettings.denseSidebar}
          onDenseChange={next => patchSettings({ denseSidebar: next })}
          showCalendar={showCalendar}
          onShowCalendarChange={setShowCalendar}
          showTags={showTags}
          onShowTagsChange={setShowTags}
          showRecent={showRecent}
          onShowRecentChange={setShowRecent}
          showTemplates={showTemplates}
          onShowTemplatesChange={setShowTemplates}
          showSkills={showSkills}
          onShowSkillsChange={setShowSkills}
          indexProgress={indexProgress}
          onReindex={resetSearch}
          pomodoroFocusMinutes={editorSettings.pomodoroFocusMinutes}
          pomodoroBreakMinutes={editorSettings.pomodoroBreakMinutes}
          onPomodoroFocusChange={next => patchSettings({ pomodoroFocusMinutes: next })}
          onPomodoroBreakChange={next => patchSettings({ pomodoroBreakMinutes: next })}
          onClearChats={clearAllChats}
          onResetVault={resetVault}
        />
      )}

      {fileExplorerOpen && (
        <FileExplorerPalette
          open={fileExplorerOpen}
          onClose={closeFileExplorer}
          notes={notes}
          folders={folders}
          activeId={activeId}
          expanded={expanded}
          onToggleFolder={toggleFolder}
          pinned={pinned}
          onTogglePin={togglePin}
          onSelectNote={selectNote}
          onMove={handleMove}
          onDelete={deleteItem}
          onRenameFolder={handleRenameFolder}
          onCreateNote={createNoteInFolder}
          onCreateFolder={createFolderAt}
          onRevealFolder={revealFolderInSidebar}
        />
      )}

      <ChatButton
        open={chatOpen}
        onToggle={toggleChat}
        hidden={zenMode}
      />
      <ChatDrawer
        open={chatOpen}
        onClose={closeChat}
        store={store}
        storeReady={storeReady}
        clearingChats={chatClearing}
        chatResetNonce={chatResetNonce}
        activeNoteId={activeId}
        activeNoteUuid={activeUuid}
        noteTitle={editingTitle || null}
        notes={notes}
        getNoteContext={getChatNoteContext}
        onOpenSettings={() => {
          setSettingsOpen(true);
          window.dispatchEvent(new CustomEvent('ai:open-settings'));
        }}
        onOpenNote={openChatAsNote}
        onNavigateToNote={navigateToChatNote}
        onApplyEdit={applyAiEdit}
        onCreateNote={applyAiCreate}
        onManageTasks={applyAiManageTasks}
        onReadOnlyTool={runReadOnlyTool}
        onMcpCall={runMcpCall}
        mentionedSelection={chatMentionedSelection}
        onClearMentionedSelection={clearChatMentionedSelection}
        onAddMentionedSelection={setChatMentionedSelection}
      />
    </div>
  );
}
