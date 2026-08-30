import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import type { Settings } from '@/components/EditorSettings';
import messages from '../../locale/en.json';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>
);

const {
  saveSettingsMock,
  readStoredPrefMock,
  applyThemeMock,
  cycleThemePrefMock,
  showToastMock,
  togglePomodoroMock,
} = vi.hoisted(() => ({
  saveSettingsMock: vi.fn(),
  readStoredPrefMock: vi.fn(() => 'dark'),
  applyThemeMock: vi.fn(),
  cycleThemePrefMock: vi.fn(() => 'light'),
  showToastMock: vi.fn(),
  togglePomodoroMock: vi.fn(),
}));

vi.mock('@/components/EditorSettings', () => ({
  saveSettings: saveSettingsMock,
}));

vi.mock('@/components/ThemeToggle', () => ({
  readStoredPref: readStoredPrefMock,
  applyTheme: applyThemeMock,
  cycleThemePref: cycleThemePrefMock,
  prefLabel: (value: string) => value,
}));

vi.mock('@/components/Toast', () => ({
  showToast: showToastMock,
}));

vi.mock('@/hooks/usePomodoro', () => ({
  togglePomodoro: togglePomodoroMock,
}));

import { useAppKeyboardShortcuts, type AppShortcutActions } from './useAppKeyboardShortcuts';

const editorSettings: Settings = {
  fontFamily: 'system',
  fontSize: 16,
  lineHeight: 1.7,
  paragraphSpacing: 4,
  spellCheck: true,
  showToc: true,
  focusMode: false,
  typewriterMode: false,
  showWordCount: true,
  denseSidebar: false,
  pomodoroFocusMinutes: 25,
  pomodoroBreakMinutes: 5,
};

function createActions(): AppShortcutActions {
  return {
    toggleZen: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleRightDock: vi.fn(),
    toggleGraph: vi.fn(),
    toggleNarrowEditor: vi.fn(),
    toggleLock: vi.fn(),
    toggleChat: vi.fn(),
    togglePalette: vi.fn(),
    toggleSettings: vi.fn(),
    toggleFileExplorer: vi.fn(),
    toggleTasksView: vi.fn(),
    flushSaves: vi.fn(),
    createNote: vi.fn(),
    createTask: vi.fn(),
    closeActiveNote: vi.fn(),
    queuePendingCreate: vi.fn(),
  };
}

function press(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });
}

describe('useAppKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles chat on mod+backslash', () => {
    const actions = createActions();

    renderHook(() => useAppKeyboardShortcuts({
      activeId: 'note.md',
      activeTitle: 'Note',
      storeReady: true,
      needsDirPick: false,
      zenMode: false,
      editorSettings,
      setEditorSettings: vi.fn(),
      actions,
    }), { wrapper });

    press({ key: '\\', code: 'Backslash', metaKey: true });

    expect(actions.toggleChat).toHaveBeenCalledTimes(1);
    expect(actions.toggleLock).not.toHaveBeenCalled();
  });

  it('keeps mod+shift+l mapped to editor lock', () => {
    const actions = createActions();

    renderHook(() => useAppKeyboardShortcuts({
      activeId: 'note.md',
      activeTitle: 'Note',
      storeReady: true,
      needsDirPick: false,
      zenMode: false,
      editorSettings,
      setEditorSettings: vi.fn(),
      actions,
    }), { wrapper });

    press({ key: 'L', code: 'KeyL', metaKey: true, shiftKey: true });

    expect(actions.toggleLock).toHaveBeenCalledTimes(1);
    expect(actions.toggleChat).not.toHaveBeenCalled();
  });

  it('fires createTask on Ctrl+Alt+T (non-mac binding)', () => {
    const actions = createActions();

    renderHook(() => useAppKeyboardShortcuts({
      activeId: null,
      activeTitle: null,
      storeReady: true,
      needsDirPick: false,
      zenMode: false,
      editorSettings,
      setEditorSettings: vi.fn(),
      actions,
    }), { wrapper });

    // jsdom's default userAgent doesn't contain "Mac", so the hook takes the
    // non-mac branch — Ctrl+Alt+T is the active combo. (Cmd+T / Ctrl+T are
    // both reserved by the browser for "new tab".)
    press({ key: 't', code: 'KeyT', ctrlKey: true, altKey: true });

    expect(actions.createTask).toHaveBeenCalledTimes(1);
    expect(actions.createNote).not.toHaveBeenCalled();
  });

  it('does not fire createTask on Ctrl+T alone (browser-reserved on non-mac)', () => {
    const actions = createActions();

    renderHook(() => useAppKeyboardShortcuts({
      activeId: null,
      activeTitle: null,
      storeReady: true,
      needsDirPick: false,
      zenMode: false,
      editorSettings,
      setEditorSettings: vi.fn(),
      actions,
    }), { wrapper });

    press({ key: 't', code: 'KeyT', ctrlKey: true });

    expect(actions.createTask).not.toHaveBeenCalled();
  });
});
