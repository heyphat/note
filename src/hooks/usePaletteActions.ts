'use client';

// Command-palette action list + visible-tag list + the editor-settings
// patch helper. Pulled out of page.tsx as Step 10.
//
// `paletteActions` is the long memoized array that drives the `>` prefix
// in the palette. It bundles every UI toggle (zen, sidebar, history,
// backlinks, graph, focus, typewriter, narrow, dense sidebar), the chat
// open/close, the new-note + new-template entries, the active-note-only
// rows (duplicate, export, lock, close), and the palette swatch entries.
// Memo deps cover every label-affecting flag + every callback the rows
// run.
//
// `visiblePaletteTags` is the tag-cloud with hidden tags filtered out —
// passed to the palette's `@` mode so the user can only pick a tag they
// haven't muted.
//
// `patchSettings` writes to the editor-settings localStorage namespace
// AND mirrors the patch into React state. Lives here because `paletteActions`
// closes over it for the focus / typewriter / dense-sidebar rows.

import { useCallback, useMemo } from 'react';
import { applyTheme, cycleThemePref, readStoredPref } from '@/components/ThemeToggle';
import { saveSettings, type Settings } from '@/components/EditorSettings';
import { PALETTES, applyPalette, type ResolvedTheme } from '@/lib/palettes';
import { showToast } from '@/components/Toast';
import type { PaletteAction } from '@/components/CommandPalette';
import type { TagCount } from '@/lib/search/types';

export type UsePaletteActionsParams = {
  // i18n — matches next-intl's Translator signature so callers can pass
  // useTranslations(...) results directly without a cast.
  tCmd: (key: string, vars?: Record<string, string | number | Date>) => string;
  tToast: (key: string, vars?: Record<string, string | number | Date>) => string;
  // Active state
  activeId: string | null;
  isLocked: boolean;
  // Chat (the toggle row needs the live state for its label)
  chatOpen: boolean;
  setChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Platform-conditional chat-drawer shortcut glyph. */
  chatDrawerShortcut: string;
  /** Platform-conditional new-note shortcut glyph (Ctrl+N on mac, Ctrl+Alt+N elsewhere). */
  newNoteShortcut: string;
  /** Platform-conditional new-task shortcut glyph (Ctrl+T on mac, Ctrl+Alt+T elsewhere). */
  newTaskShortcut: string;
  // UI toggles
  toggleZen: () => void;
  toggleSidebar: () => void;
  toggleHistory: () => void;
  toggleBacklinks: () => void;
  toggleTasks: () => void;
  /** Combined open/close for the entire right dock. Bound to ⇧⌘B. */
  toggleRightDock: () => void;
  toggleGraph: () => void;
  toggleNarrowEditor: () => void;
  toggleLock: () => void;
  narrowEditor: boolean;
  // Tasks view + create modal openers (independent of right-dock).
  openTasksView: () => void;
  openCreateTask: () => void;
  // Settings
  editorSettings: Settings;
  setEditorSettings: React.Dispatch<React.SetStateAction<Settings>>;
  // Lifecycle / commands
  createNote: () => Promise<void>;
  createTemplate: () => Promise<void>;
  closeActiveNote: () => Promise<void>;
  handleDuplicate: (id: string) => Promise<void>;
  handleExport: (id: string) => Promise<void>;
  // Theme/palette
  resolvedTheme: ResolvedTheme;
  paletteId: string;
  setPaletteId: (id: string) => void;
  // Tag cloud
  indexTags: TagCount[];
  hiddenTags: Set<string>;
};

export type UsePaletteActionsResult = {
  visiblePaletteTags: TagCount[];
  patchSettings: (patch: Partial<Settings>) => void;
  paletteActions: PaletteAction[];
};

export function usePaletteActions(params: UsePaletteActionsParams): UsePaletteActionsResult {
  const {
    tCmd, tToast,
    activeId, isLocked,
    chatOpen, setChatOpen, chatDrawerShortcut,
    newNoteShortcut, newTaskShortcut,
    toggleZen, toggleSidebar, toggleHistory, toggleBacklinks, toggleTasks, toggleRightDock, toggleGraph,
    toggleNarrowEditor, toggleLock, narrowEditor,
    editorSettings, setEditorSettings,
    createNote, createTemplate, closeActiveNote, handleDuplicate, handleExport,
    resolvedTheme, paletteId, setPaletteId,
    indexTags, hiddenTags,
    openTasksView, openCreateTask,
  } = params;

  const visiblePaletteTags = useMemo(
    () => indexTags.filter(t => !hiddenTags.has(t.tag)),
    [indexTags, hiddenTags],
  );

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setEditorSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, [setEditorSettings]);

  // Action list shown under the `>` prefix in the palette. Kept memoized so
  // typing in the palette doesn't re-run the array build each keystroke;
  // deps cover every callback + setting the rows react to.
  const paletteActions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [
      { id: 'new-note', label: tCmd('newNote'), shortcut: newNoteShortcut, run: createNote },
      { id: 'create-task', label: tCmd('createTask'), shortcut: newTaskShortcut, run: openCreateTask },
      { id: 'new-template', label: tCmd('newTemplate'), run: createTemplate },
      { id: 'toggle-theme', label: tCmd('toggleTheme'), shortcut: '⇧⌘D', run: () => applyTheme(cycleThemePref(readStoredPref())) },
      { id: 'toggle-zen', label: tCmd('toggleZenMode'), shortcut: '⌘.', run: toggleZen },
      { id: 'toggle-sidebar', label: tCmd('toggleSidebar'), shortcut: '⌘B', run: toggleSidebar },
      { id: 'toggle-chat', label: chatOpen ? tCmd('closeAiChat') : tCmd('openAiChat'), shortcut: chatDrawerShortcut, run: () => setChatOpen(v => !v) },
      { id: 'toggle-right-dock', label: tCmd('toggleRightDock'), shortcut: '⇧⌘B', run: toggleRightDock },
      { id: 'toggle-history', label: tCmd('toggleHistoryPanel'), run: toggleHistory },
      { id: 'toggle-backlinks', label: tCmd('toggleBacklinksPanel'), run: toggleBacklinks },
      { id: 'toggle-tasks-panel', label: tCmd('toggleTasksPanel'), run: toggleTasks },
      { id: 'open-tasks-view', label: tCmd('openTasksView'), shortcut: '⇧⌘K', run: openTasksView },
      { id: 'toggle-graph', label: tCmd('openGraphView'), shortcut: '⇧⌘G', run: toggleGraph },
      {
        id: 'toggle-focus',
        label: editorSettings.focusMode ? tCmd('disableFocusMode') : tCmd('enableFocusMode'),
        shortcut: '⇧⌘F',
        run: () => patchSettings({ focusMode: !editorSettings.focusMode }),
      },
      {
        id: 'toggle-typewriter',
        label: editorSettings.typewriterMode ? tCmd('disableTypewriterMode') : tCmd('enableTypewriterMode'),
        shortcut: '⇧⌘T',
        run: () => patchSettings({ typewriterMode: !editorSettings.typewriterMode }),
      },
      {
        id: 'toggle-narrow',
        label: narrowEditor ? tCmd('disableNarrowEditor') : tCmd('enableNarrowEditor'),
        shortcut: '⇧⌘M',
        run: toggleNarrowEditor,
      },
      {
        id: 'toggle-dense-sidebar',
        label: editorSettings.denseSidebar ? tCmd('disableDenseList') : tCmd('enableDenseList'),
        run: () => patchSettings({ denseSidebar: !editorSettings.denseSidebar }),
      },
    ];
    if (activeId) {
      list.push(
        { id: 'duplicate', label: tCmd('duplicateCurrentNote'), run: () => handleDuplicate(activeId) },
        { id: 'export-pdf', label: tCmd('exportPdf'), run: () => handleExport(activeId) },
        { id: 'toggle-lock', label: isLocked ? tCmd('unlockEditor') : tCmd('lockEditor'), shortcut: '⇧⌘L', run: toggleLock },
        { id: 'close-note', label: tCmd('closeCurrentNote'), shortcut: '⇧⌘X', run: () => { void closeActiveNote(); } },
      );
    }
    for (const p of PALETTES) {
      const tokens = p[resolvedTheme];
      list.push({
        id: `palette-${p.id}`,
        label: tCmd('setPalette', { name: p.name }),
        hint: p.id === paletteId ? tCmd('currentHint') : undefined,
        swatches: [tokens.bg, tokens.panel, tokens.accent, tokens.text],
        run: () => {
          const resolved = (document.documentElement.getAttribute('data-theme') ?? 'dark') as ResolvedTheme;
          applyPalette(p.id, resolved);
          setPaletteId(p.id);
          showToast(tToast('paletteSet', { name: p.name }));
        },
      });
    }
    return list;
  }, [
    activeId, chatOpen, chatDrawerShortcut, newNoteShortcut, newTaskShortcut, closeActiveNote, createNote, createTemplate,
    editorSettings.denseSidebar, editorSettings.focusMode, editorSettings.typewriterMode,
    handleDuplicate, handleExport, isLocked, narrowEditor, paletteId, patchSettings, resolvedTheme,
    setChatOpen, setPaletteId,
    tCmd, tToast,
    toggleBacklinks, toggleGraph, toggleHistory, toggleLock, toggleNarrowEditor, toggleRightDock, toggleSidebar, toggleTasks, toggleZen,
    openTasksView, openCreateTask,
  ]);

  return { visiblePaletteTags, patchSettings, paletteActions };
}
