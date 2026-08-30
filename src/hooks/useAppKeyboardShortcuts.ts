'use client';

// App-global keyboard shortcut handler. Wires every window-level hotkey the
// UI exposes; per-component bindings (editor keymaps, palette navigation) are
// kept inside their own components.
//
// Shortcut table:
//   Cmd/Ctrl+, ............ open the application settings popover
//   Cmd/Ctrl+K ............ toggle command palette
//   Cmd/Ctrl+\ ............ toggle AI chat drawer
//   Cmd/Ctrl+S ............ flush pending content + title saves
//   Cmd/Ctrl+B ............ toggle sidebar
//   Cmd/Ctrl+. ............ toggle zen mode
//   Escape (zen on) ....... exit zen mode
//   Cmd/Ctrl+Shift+F ...... toggle focus mode
//   Cmd/Ctrl+Shift+E ...... toggle file explorer
//   Cmd/Ctrl+Shift+T ...... toggle typewriter mode
//   Cmd/Ctrl+Shift+M ...... toggle narrow editor
//   Cmd/Ctrl+Shift+O ...... toggle TOC
//   Cmd/Ctrl+Shift+Y ...... toggle word count
//   Cmd/Ctrl+Shift+S ...... toggle spell check
//   Cmd/Ctrl+Shift+L ...... toggle editor lock
//   Cmd/Ctrl+Shift+D ...... cycle theme
//   Cmd/Ctrl+Shift+B ...... toggle right dock (history + backlinks + tasks together)
//   Cmd/Ctrl+Shift+G ...... open graph view
//   Cmd/Ctrl+Shift+K ...... toggle vault tasks view
//   Cmd/Ctrl+Shift+P ...... toggle pomodoro focus session
//   Cmd/Ctrl+Shift+X ...... close active note (return to empty state)
//   Ctrl+N (macOS) / Ctrl+Alt+N (Win/Linux) ... create new note
//   Ctrl+T (macOS) / Ctrl+Alt+T (Win/Linux) ... create new task
//
// preventDefault is called on every hit so the browser's default binding
// doesn't fire (Cmd+S would open "save page"; Cmd+B would bold selection).

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { Settings } from '@/components/EditorSettings';
import { saveSettings } from '@/components/EditorSettings';
import { readStoredPref, applyTheme, cycleThemePref, prefLabel, type PrefLabels } from '@/components/ThemeToggle';
import { showToast } from '@/components/Toast';
import { togglePomodoro } from '@/hooks/usePomodoro';

export type AppShortcutActions = {
  toggleZen: () => void;
  toggleSidebar: () => void;
  /** Open all three right-dock panels (history + backlinks + tasks) when any
   *  is closed; close them all when any is open. Bound to Cmd/Ctrl+Shift+B. */
  toggleRightDock: () => void;
  toggleGraph: () => void;
  toggleNarrowEditor: () => void;
  toggleLock: () => void;
  toggleChat: () => void;
  togglePalette: () => void;
  /** Toggle the application-wide settings popover (⌘,). */
  toggleSettings: () => void;
  toggleFileExplorer: () => void;
  toggleTasksView: () => void;
  flushSaves: () => void;
  /** Called on Ctrl+N (macOS) / Ctrl+Alt+N (others). */
  createNote: () => void;
  /** Called on Ctrl+T (macOS) / Ctrl+Alt+T (others). Opens the create-task
   *  modal — same combo family as createNote, just keyed to T. */
  createTask: () => void;
  /** Deselect the current note and return to the empty-state page. */
  closeActiveNote: () => void;
  /** Called instead of `createNote` when the vault isn't ready yet. */
  queuePendingCreate: () => void;
};

export type AppShortcutDeps = {
  activeId: string | null;
  /** Current editing title — passed through to the pomodoro session so the
   *  origin-note breadcrumb in the chip popover is meaningful. */
  activeTitle?: string | null;
  storeReady: boolean;
  needsDirPick: boolean;
  zenMode: boolean;
  editorSettings: Settings;
  setEditorSettings: React.Dispatch<React.SetStateAction<Settings>>;
  actions: AppShortcutActions;
};

export function useAppKeyboardShortcuts(deps: AppShortcutDeps): void {
  const {
    activeId, activeTitle, storeReady, needsDirPick, zenMode, editorSettings, setEditorSettings, actions,
  } = deps;
  const tToast = useTranslations('toast');
  const tSettings = useTranslations('settings');
  const themeLabels: PrefLabels = {
    prefix: tToast('themePrefix'),
    light: tSettings('themeLight'),
    dark: tSettings('themeDark'),
    auto: tToast('themeAutoSuffix'),
  };
  const focusStarted = tToast('focusStarted');
  const focusStopped = tToast('focusStopped');

  // Main shortcut bundle (Cmd/Ctrl + ... ). Kept in one effect so the
  // precedence between Shift-prefixed and bare variants stays honest —
  // Cmd+Shift+S has to short-circuit before the bare Cmd+S save path runs.
  //
  // Listener is registered in CAPTURE phase so we beat the editor's own
  // keymap (Crepe binds Mod-Shift-B to WrapInBlockquote, which conflicts
  // with our Mod-Shift-B → toggleBacklinks). When we own a key we call
  // `consume(e)` to both `preventDefault` AND `stopPropagation`, which
  // prevents ProseMirror's bubble-phase handler from ever seeing the
  // event. Non-shortcut keys fall through (we return early without
  // touching the event) so typing into the editor is unaffected.
  useEffect(() => {
    const consume = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        consume(e);
        actions.toggleZen();
        return;
      }
      if (e.key === 'Escape' && zenMode) {
        actions.toggleZen();
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (!e.altKey && (e.code === 'Backslash' || e.code === 'IntlBackslash')) {
        consume(e);
        actions.toggleChat();
        return;
      }
      const key = e.key.toLowerCase();
      if (!e.shiftKey && !e.altKey && key === 'k') {
        consume(e);
        actions.togglePalette();
        return;
      }
      // ⌘, opens the application settings popover. macOS uses "," for the
      // preferences menu shortcut; we honor the same combo regardless of
      // platform so the affordance is discoverable.
      if (!e.shiftKey && !e.altKey && e.key === ',') {
        consume(e);
        actions.toggleSettings();
        return;
      }
      if (e.shiftKey) {
        const patch = (p: Partial<Settings>) => {
          setEditorSettings(prev => {
            const next = { ...prev, ...p };
            saveSettings(next);
            return next;
          });
        };
        switch (key) {
          case 'f': consume(e); patch({ focusMode: !editorSettings.focusMode }); return;
          case 'e': consume(e); actions.toggleFileExplorer(); return;
          case 't': consume(e); patch({ typewriterMode: !editorSettings.typewriterMode }); return;
          case 'm': consume(e); actions.toggleNarrowEditor(); return;
          case 'o': consume(e); patch({ showToc: !editorSettings.showToc }); return;
          case 'y': consume(e); patch({ showWordCount: !editorSettings.showWordCount }); return;
          case 's': consume(e); patch({ spellCheck: !editorSettings.spellCheck }); return;
          case 'l': consume(e); actions.toggleLock(); return;
          case 'd': {
            consume(e);
            const next = cycleThemePref(readStoredPref());
            applyTheme(next);
            showToast(prefLabel(next, themeLabels));
            return;
          }
          case 'b': consume(e); actions.toggleRightDock(); return;
          case 'g': consume(e); actions.toggleGraph(); return;
          case 'k': consume(e); actions.toggleTasksView(); return;
          case 'p': consume(e); togglePomodoro(activeId, activeTitle ?? null, { started: focusStarted, stopped: focusStopped }); return;
          case 'x': consume(e); if (activeId) actions.closeActiveNote(); return;
        }
        return;
      }
      if (key === 's') {
        consume(e);
        if (activeId) actions.flushSaves();
      } else if (key === 'b') {
        consume(e);
        actions.toggleSidebar();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [activeId, activeTitle, editorSettings, setEditorSettings, actions, zenMode, themeLabels.prefix, themeLabels.light, themeLabels.dark, themeLabels.auto, focusStarted, focusStopped]);

  // New-note shortcut (separate effect so its platform branch is easy to
  // follow). macOS reserves Cmd+N for the browser's "new window" — it
  // never reaches the page — so we fall back to Ctrl+N there. Win/Linux
  // reserve Ctrl+N too, so the combo lands on Ctrl+Alt+N. e.code keeps
  // the binding locked to the N key across keyboard layouts.
  useEffect(() => {
    const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'KeyN') return;
      if (e.shiftKey || e.metaKey) return;
      const ok = isMac ? (e.ctrlKey && !e.altKey) : (e.ctrlKey && e.altKey);
      if (!ok) return;
      e.preventDefault();
      e.stopPropagation();
      if (!storeReady || needsDirPick) {
        actions.queuePendingCreate();
        return;
      }
      actions.createNote();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [storeReady, needsDirPick, actions]);

  // New-task shortcut. Same platform pattern as new-note — Cmd+T is the
  // browser's "new tab" everywhere, so we land on Ctrl+T (mac) / Ctrl+Alt+T
  // (win/linux). Modal-only action: no vault readiness gate is needed
  // because the create-task modal owns its own draft state until submit.
  useEffect(() => {
    const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'KeyT') return;
      if (e.shiftKey || e.metaKey) return;
      const ok = isMac ? (e.ctrlKey && !e.altKey) : (e.ctrlKey && e.altKey);
      if (!ok) return;
      e.preventDefault();
      e.stopPropagation();
      actions.createTask();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [actions]);
}
