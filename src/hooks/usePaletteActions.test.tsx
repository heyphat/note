import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { usePaletteActions, type UsePaletteActionsParams } from './usePaletteActions';
import { DEFAULT_SETTINGS, type Settings } from '@/components/EditorSettings';

afterEach(() => cleanup());

const tCmd = (k: string, vars?: Record<string, string | number | Date>) =>
  vars?.name ? `${k}:${vars.name}` : k;
const tToast = (k: string, vars?: Record<string, string | number | Date>) =>
  vars?.name ? `${k}:${vars.name}` : k;

function makeParams(overrides: Partial<UsePaletteActionsParams> = {}): UsePaletteActionsParams {
  return {
    tCmd, tToast,
    activeId: null,
    isLocked: false,
    chatOpen: false,
    setChatOpen: vi.fn(),
    chatDrawerShortcut: '⌘\\',
    newNoteShortcut: '⌃N',
    newTaskShortcut: '⌃T',
    toggleZen: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleHistory: vi.fn(),
    toggleBacklinks: vi.fn(),
    toggleTasks: vi.fn(),
    toggleRightDock: vi.fn(),
    toggleGraph: vi.fn(),
    toggleNarrowEditor: vi.fn(),
    toggleLock: vi.fn(),
    narrowEditor: false,
    openTasksView: vi.fn(),
    openCreateTask: vi.fn(),
    editorSettings: DEFAULT_SETTINGS,
    setEditorSettings: vi.fn(),
    createNote: vi.fn(async () => undefined),
    createTemplate: vi.fn(async () => undefined),
    closeActiveNote: vi.fn(async () => undefined),
    handleDuplicate: vi.fn(async () => undefined),
    handleExport: vi.fn(async () => undefined),
    resolvedTheme: 'dark',
    paletteId: 'default',
    setPaletteId: vi.fn(),
    indexTags: [],
    hiddenTags: new Set<string>(),
    ...overrides,
  };
}

describe('usePaletteActions — visiblePaletteTags', () => {
  it('filters out hidden tags', () => {
    const indexTags = [{ tag: 'work', count: 3 }, { tag: 'todo', count: 5 }];
    const hiddenTags = new Set(['todo']);
    const { result } = renderHook(() => usePaletteActions(makeParams({ indexTags, hiddenTags })));
    expect(result.current.visiblePaletteTags.map(t => t.tag)).toEqual(['work']);
  });

  it('returns all tags when nothing is hidden', () => {
    const indexTags = [{ tag: 'a', count: 1 }, { tag: 'b', count: 2 }];
    const { result } = renderHook(() => usePaletteActions(makeParams({ indexTags })));
    expect(result.current.visiblePaletteTags).toHaveLength(2);
  });
});

describe('usePaletteActions — patchSettings', () => {
  it('merges patch into prev settings via setEditorSettings updater', () => {
    let captured: Settings | null = null;
    const setEditorSettings = vi.fn((updater: Settings | ((prev: Settings) => Settings)) => {
      if (typeof updater === 'function') captured = (updater as (p: Settings) => Settings)(DEFAULT_SETTINGS);
    });
    const { result } = renderHook(() => usePaletteActions(makeParams({ setEditorSettings })));
    act(() => { result.current.patchSettings({ focusMode: true, denseSidebar: true }); });
    expect(captured).not.toBeNull();
    expect(captured!.focusMode).toBe(true);
    expect(captured!.denseSidebar).toBe(true);
  });
});

describe('usePaletteActions — paletteActions base list', () => {
  it('always includes new-note + new-template + UI toggle rows', () => {
    const { result } = renderHook(() => usePaletteActions(makeParams()));
    const ids = result.current.paletteActions.map(a => a.id);
    expect(ids).toContain('new-note');
    expect(ids).toContain('new-template');
    expect(ids).toContain('toggle-zen');
    expect(ids).toContain('toggle-sidebar');
    expect(ids).toContain('toggle-right-dock');
    expect(ids).toContain('toggle-history');
    expect(ids).toContain('toggle-backlinks');
    expect(ids).toContain('toggle-graph');
    expect(ids).toContain('toggle-focus');
    expect(ids).toContain('toggle-typewriter');
    expect(ids).toContain('toggle-narrow');
    expect(ids).toContain('toggle-dense-sidebar');
  });

  it('chat row label flips on chatOpen', () => {
    const opened = renderHook(() => usePaletteActions(makeParams({ chatOpen: true })));
    const closed = renderHook(() => usePaletteActions(makeParams({ chatOpen: false })));
    expect(opened.result.current.paletteActions.find(a => a.id === 'toggle-chat')?.label)
      .toBe('closeAiChat');
    expect(closed.result.current.paletteActions.find(a => a.id === 'toggle-chat')?.label)
      .toBe('openAiChat');
  });

  it('focus / typewriter / dense-sidebar labels flip on the matching setting', () => {
    const enabled: Settings = { ...DEFAULT_SETTINGS, focusMode: true, typewriterMode: true, denseSidebar: true };
    const { result } = renderHook(() => usePaletteActions(makeParams({ editorSettings: enabled })));
    expect(result.current.paletteActions.find(a => a.id === 'toggle-focus')?.label)
      .toBe('disableFocusMode');
    expect(result.current.paletteActions.find(a => a.id === 'toggle-typewriter')?.label)
      .toBe('disableTypewriterMode');
    expect(result.current.paletteActions.find(a => a.id === 'toggle-dense-sidebar')?.label)
      .toBe('disableDenseList');
  });

  it('narrow row label flips on narrowEditor', () => {
    const on = renderHook(() => usePaletteActions(makeParams({ narrowEditor: true })));
    const off = renderHook(() => usePaletteActions(makeParams({ narrowEditor: false })));
    expect(on.result.current.paletteActions.find(a => a.id === 'toggle-narrow')?.label)
      .toBe('disableNarrowEditor');
    expect(off.result.current.paletteActions.find(a => a.id === 'toggle-narrow')?.label)
      .toBe('enableNarrowEditor');
  });
});

describe('usePaletteActions — note-only rows', () => {
  it('omits duplicate / export-pdf / toggle-lock / close-note when no active note', () => {
    const { result } = renderHook(() => usePaletteActions(makeParams({ activeId: null })));
    const ids = result.current.paletteActions.map(a => a.id);
    expect(ids).not.toContain('duplicate');
    expect(ids).not.toContain('export-pdf');
    expect(ids).not.toContain('toggle-lock');
    expect(ids).not.toContain('close-note');
  });

  it('includes them when activeId is set', () => {
    const { result } = renderHook(() => usePaletteActions(makeParams({ activeId: 'a.md' })));
    const ids = result.current.paletteActions.map(a => a.id);
    expect(ids).toContain('duplicate');
    expect(ids).toContain('export-pdf');
    expect(ids).toContain('toggle-lock');
    expect(ids).toContain('close-note');
  });

  it('toggle-lock label flips on isLocked', () => {
    const locked = renderHook(() => usePaletteActions(makeParams({ activeId: 'a.md', isLocked: true })));
    const unlocked = renderHook(() => usePaletteActions(makeParams({ activeId: 'a.md', isLocked: false })));
    expect(locked.result.current.paletteActions.find(a => a.id === 'toggle-lock')?.label)
      .toBe('unlockEditor');
    expect(unlocked.result.current.paletteActions.find(a => a.id === 'toggle-lock')?.label)
      .toBe('lockEditor');
  });

  it('duplicate row invokes handleDuplicate(activeId)', () => {
    const handleDuplicate = vi.fn(async () => undefined);
    const { result } = renderHook(() => usePaletteActions(makeParams({
      activeId: 'a.md', handleDuplicate,
    })));
    const dup = result.current.paletteActions.find(a => a.id === 'duplicate');
    dup?.run();
    expect(handleDuplicate).toHaveBeenCalledWith('a.md');
  });
});

describe('usePaletteActions — palette swatch entries', () => {
  it('appends a palette-{id} row for each PALETTE with 4 swatches', () => {
    const { result } = renderHook(() => usePaletteActions(makeParams()));
    const swatches = result.current.paletteActions.filter(a => a.id.startsWith('palette-'));
    expect(swatches.length).toBeGreaterThan(0);
    for (const s of swatches) {
      expect(s.swatches).toHaveLength(4);
    }
  });

  it('marks the current palette with currentHint', () => {
    const { result } = renderHook(() => usePaletteActions(makeParams({ paletteId: 'default' })));
    const current = result.current.paletteActions.find(a => a.id === 'palette-default');
    expect(current?.hint).toBe('currentHint');
    const others = result.current.paletteActions.filter(
      a => a.id.startsWith('palette-') && a.id !== 'palette-default',
    );
    for (const o of others) expect(o.hint).toBeUndefined();
  });
});
