'use client';

// UI layout preferences that follow the user across vaults. Each preference
// is a boolean persisted under its own localStorage key, loaded on mount,
// and written on every toggle. Five bespoke copies of this pattern lived
// in page.tsx before this extraction — keeping them all here makes it easy
// to add a new one and also keeps the "which values are allowed?"
// (0/1 strings) story in one place.

import { useCallback, useEffect, useState } from 'react';

type PersistedBoolKey =
  | 'notes:sidebar-open'
  | 'notes:history-open'
  | 'notes:backlinks-open'
  | 'notes:tasks-open'
  | 'notes:narrow-editor'
  | 'notes:zen-mode'
  | 'notes:sidebar-calendar-visible'
  | 'notes:sidebar-tags-visible'
  | 'notes:sidebar-recent-visible'
  | 'notes:sidebar-templates-visible'
  | 'notes:sidebar-skills-visible';

/**
 * Boolean piece of UI state, persisted to localStorage. `defaultValue` is
 * used during SSR and before the mount effect runs — once mounted, the
 * stored value overrides it (unless no value has ever been written).
 *
 * Encoding: `'1'` = true, `'0'` = false. Any other stored value is treated
 * as "not set" and the default wins.
 *
 * Returns `[value, setValue, toggle]`. Both `setValue` and `toggle` write
 * through to localStorage — use `setValue` when the target state is known
 * (e.g. "close the sidebar on mobile after selecting a note"), `toggle`
 * when the caller literally wants to flip the current value.
 */
export function usePersistedBool(
  key: PersistedBoolKey,
  defaultValue: boolean,
): [boolean, (v: boolean) => void, () => void] {
  const [value, setState] = useState(defaultValue);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === '1') setState(true);
      else if (raw === '0') setState(false);
    } catch { /* ignore */ }
  }, [key]);

  const setValue = useCallback((next: boolean) => {
    setState(next);
    try { window.localStorage.setItem(key, next ? '1' : '0'); } catch { /* ignore */ }
  }, [key]);

  const toggle = useCallback(() => {
    setState(prev => {
      const next = !prev;
      try { window.localStorage.setItem(key, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, [key]);

  return [value, setValue, toggle];
}

export type PersistedUI = {
  sidebarOpen: boolean;
  historyOpen: boolean;
  backlinksOpen: boolean;
  tasksOpen: boolean;
  narrowEditor: boolean;
  zenMode: boolean;
  setSidebarOpen: (v: boolean) => void;
  setHistoryOpen: (v: boolean) => void;
  setBacklinksOpen: (v: boolean) => void;
  setTasksOpen: (v: boolean) => void;
  setNarrowEditor: (v: boolean) => void;
  setZenMode: (v: boolean) => void;
  toggleSidebar: () => void;
  toggleHistory: () => void;
  toggleBacklinks: () => void;
  toggleTasks: () => void;
  toggleNarrowEditor: () => void;
  toggleZen: () => void;
};

/**
 * Bundle of every persisted UI toggle page.tsx cares about. Returning them
 * together keeps the consumer a single destructuring line instead of five
 * parallel `useState`/`useEffect`/`useCallback` trios.
 */
export function usePersistedUI(): PersistedUI {
  const [sidebarOpen, setSidebarOpen, toggleSidebar] = usePersistedBool('notes:sidebar-open', false);
  const [historyOpen, setHistoryOpen, toggleHistory] = usePersistedBool('notes:history-open', false);
  const [backlinksOpen, setBacklinksOpen, toggleBacklinks] = usePersistedBool('notes:backlinks-open', false);
  const [tasksOpen, setTasksOpen, toggleTasks] = usePersistedBool('notes:tasks-open', false);
  const [narrowEditor, setNarrowEditor, toggleNarrowEditor] = usePersistedBool('notes:narrow-editor', true);
  const [zenMode, setZenMode, toggleZen] = usePersistedBool('notes:zen-mode', false);

  return {
    sidebarOpen, historyOpen, backlinksOpen, tasksOpen, narrowEditor, zenMode,
    setSidebarOpen, setHistoryOpen, setBacklinksOpen, setTasksOpen, setNarrowEditor, setZenMode,
    toggleSidebar, toggleHistory, toggleBacklinks, toggleTasks, toggleNarrowEditor, toggleZen,
  };
}
