import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useNoteCommands, type UseNoteCommandsParams } from './useNoteCommands';
import { FakeNoteStore } from '@/utils/test/fake-store';
import { buildLinkResolver } from '@/lib/links/link-resolver';
import type { NoteMeta, NoteRevision } from '@/lib/storage';

afterEach(() => cleanup());

function makeRefs() {
  return {
    getMarkdownRef: { current: null as (() => string) | null },
    lastSavedRef: { current: '' },
    lastSavedTitleRef: { current: '' },
    activeRevisionRef: { current: null as NoteRevision | null },
    editorReadyRef: { current: false },
    autoSaveTimerRef: { current: null as number | null },
    titleSaveTimerRef: { current: null as number | null },
    nextUrlOpRef: { current: 'replace' as 'push' | 'replace' },
    linkResolverRef: { current: new Map() as Map<string, NoteMeta> },
  };
}

function makeParams(
  overrides: Partial<UseNoteCommandsParams> = {},
  refs = makeRefs(),
): UseNoteCommandsParams {
  const store = overrides.store ?? new FakeNoteStore();
  return {
    store,
    activeId: null,
    activeTemplate: null,
    activeText: '',
    targetFolder: '',
    locale: 'en',
    untitledLabel: 'Untitled',
    getMarkdownRef: refs.getMarkdownRef,
    lastSavedRef: refs.lastSavedRef,
    lastSavedTitleRef: refs.lastSavedTitleRef,
    activeRevisionRef: refs.activeRevisionRef,
    editorReadyRef: refs.editorReadyRef,
    autoSaveTimerRef: refs.autoSaveTimerRef,
    titleSaveTimerRef: refs.titleSaveTimerRef,
    flushSave: vi.fn(async () => undefined),
    flushTitleSave: vi.fn(async () => undefined),
    doSave: vi.fn(async () => undefined),
    setSaveStatus: vi.fn(),
    prependNoteLocal: vi.fn(),
    addAutoTitle: vi.fn(),
    pruneAutoTitleNotes: vi.fn(),
    addFolderLocal: vi.fn(),
    lockedNotes: new Set<string>(),
    setLockedNotes: vi.fn(),
    persistLocked: vi.fn(),
    indexRemove: vi.fn(),
    syncPost: vi.fn(),
    clearDirty: vi.fn(),
    linkResolverRef: refs.linkResolverRef,
    setActiveId: vi.fn(),
    setActiveUuid: vi.fn(),
    setActiveText: vi.fn(),
    setActiveTemplate: vi.fn(),
    setEditingTitle: vi.fn(),
    setEditorVersion: vi.fn(),
    setTocHeadings: vi.fn(),
    setSidebarOpen: vi.fn(),
    setTargetFolder: vi.fn(),
    setNotes: vi.fn(),
    setDragging: vi.fn(),
    expandPath: vi.fn(),
    pushRecent: vi.fn(),
    nextUrlOpRef: refs.nextUrlOpRef,
    ...overrides,
  };
}

describe('useNoteCommands — selectNote', () => {
  it('flushes pending saves, calls pushRecent, and seeds editor refs', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Hello', '# Hello\n\nbody', '');
    const flushSave = vi.fn(async () => undefined);
    const flushTitleSave = vi.fn(async () => undefined);
    const pushRecent = vi.fn();
    const setTargetFolder = vi.fn();
    const expandPath = vi.fn();
    const refs = makeRefs();
    const { result } = renderHook(() => useNoteCommands(makeParams({
      store, flushSave, flushTitleSave, pushRecent, setTargetFolder, expandPath,
    }, refs)));

    await act(async () => { await result.current.selectNote(meta.id); });

    expect(flushSave).toHaveBeenCalledTimes(1);
    expect(flushTitleSave).toHaveBeenCalledTimes(1);
    expect(pushRecent).toHaveBeenCalledWith(meta.id);
    expect(refs.lastSavedRef.current).toBe('# Hello\n\nbody');
    expect(refs.lastSavedTitleRef.current).toBe('Hello');
    expect(refs.activeRevisionRef.current).toEqual({ size: meta.size, mtimeMs: meta.mtimeMs });
    expect(refs.editorReadyRef.current).toBe(false);
    expect(refs.getMarkdownRef.current).toBeNull();
    expect(refs.nextUrlOpRef.current).toBe('push');
  });

  it('replace=true sets nextUrlOpRef to "replace"', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Hi', 'body', '');
    const refs = makeRefs();
    const { result } = renderHook(() => useNoteCommands(makeParams({ store }, refs)));
    await act(async () => { await result.current.selectNote(meta.id, { replace: true }); });
    expect(refs.nextUrlOpRef.current).toBe('replace');
  });

  it('points targetFolder at the note\'s parent and expandPath walks it', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Note', 'body', 'work/trades');
    const setTargetFolder = vi.fn();
    const expandPath = vi.fn();
    const { result } = renderHook(() => useNoteCommands(makeParams({
      store, setTargetFolder, expandPath,
    })));
    await act(async () => { await result.current.selectNote(meta.id); });
    expect(setTargetFolder).toHaveBeenCalledWith('work/trades');
    expect(expandPath).toHaveBeenCalledWith('work/trades');
  });

  it('closes the sidebar on viewports narrower than 768px', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Hi', 'body', '');
    const setSidebarOpen = vi.fn();
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    try {
      const { result } = renderHook(() => useNoteCommands(makeParams({ store, setSidebarOpen })));
      await act(async () => { await result.current.selectNote(meta.id); });
      expect(setSidebarOpen).toHaveBeenCalledWith(false);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: original });
    }
  });

  it('addAutoTitle fires when stored title equals first heading', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Plans', '# Plans\n\nbody', '');
    const addAutoTitle = vi.fn();
    const { result } = renderHook(() => useNoteCommands(makeParams({ store, addAutoTitle })));
    await act(async () => { await result.current.selectNote(meta.id); });
    expect(addAutoTitle).toHaveBeenCalledWith(meta.id);
  });

  it('addAutoTitle does NOT fire when stored title diverges from first heading', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('CustomTitle', '# Different\n\nbody', '');
    const addAutoTitle = vi.fn();
    const { result } = renderHook(() => useNoteCommands(makeParams({ store, addAutoTitle })));
    await act(async () => { await result.current.selectNote(meta.id); });
    expect(addAutoTitle).not.toHaveBeenCalled();
  });
});

describe('useNoteCommands — createNoteInFolder', () => {
  it('seeds {seedMessage} into the body as a `## ` heading', async () => {
    const store = new FakeNoteStore();
    const createSpy = vi.spyOn(store, 'create');
    const { result } = renderHook(() => useNoteCommands(makeParams({ store })));
    await act(async () => { await result.current.createNoteInFolder(undefined, { seedMessage: 'kickoff' }); });
    expect(createSpy).toHaveBeenCalledWith('kickoff', '## kickoff\n', undefined);
  });

  it('replaceUrl=true uses history.replaceState and selectNote replaces too', async () => {
    const store = new FakeNoteStore();
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const refs = makeRefs();
    const { result } = renderHook(() => useNoteCommands(makeParams({ store }, refs)));
    await act(async () => { await result.current.createNoteInFolder('inbox', { replaceUrl: true }); });
    expect(replaceSpy).toHaveBeenCalled();
    expect(refs.nextUrlOpRef.current).toBe('replace');
    replaceSpy.mockRestore();
  });

  it('broadcasts notes-changed and adds parent to local folders', async () => {
    const store = new FakeNoteStore();
    const syncPost = vi.fn();
    const addFolderLocal = vi.fn();
    const expandPath = vi.fn();
    const { result } = renderHook(() => useNoteCommands(makeParams({
      store, syncPost, addFolderLocal, expandPath,
    })));
    await act(async () => { await result.current.createNoteInFolder('ideas'); });
    expect(addFolderLocal).toHaveBeenCalledWith('ideas');
    expect(expandPath).toHaveBeenCalledWith('ideas');
    expect(syncPost).toHaveBeenCalledWith({ type: 'notes-changed' });
  });
});

describe('useNoteCommands — closeActiveNote', () => {
  it('flushes saves and clears activeId/activeTemplate/activeText', async () => {
    const flushSave = vi.fn(async () => undefined);
    const flushTitleSave = vi.fn(async () => undefined);
    const setActiveId = vi.fn();
    const setActiveTemplate = vi.fn();
    const setActiveText = vi.fn();
    const setEditingTitle = vi.fn();
    const refs = makeRefs();
    refs.lastSavedRef.current = 'old';
    refs.lastSavedTitleRef.current = 'old';
    refs.activeRevisionRef.current = { size: 10, mtimeMs: 1 };
    refs.editorReadyRef.current = true;
    refs.getMarkdownRef.current = () => 'markdown';
    const { result } = renderHook(() => useNoteCommands(makeParams({
      activeId: 'note.md',
      flushSave, flushTitleSave,
      setActiveId, setActiveTemplate, setActiveText, setEditingTitle,
    }, refs)));
    await act(async () => { await result.current.closeActiveNote(); });
    expect(flushSave).toHaveBeenCalled();
    expect(flushTitleSave).toHaveBeenCalled();
    expect(setActiveId).toHaveBeenCalledWith(null);
    expect(setActiveTemplate).toHaveBeenCalledWith(null);
    expect(setActiveText).toHaveBeenCalledWith('');
    expect(setEditingTitle).toHaveBeenCalledWith('');
    expect(refs.lastSavedRef.current).toBe('');
    expect(refs.lastSavedTitleRef.current).toBe('');
    expect(refs.activeRevisionRef.current).toBeNull();
    expect(refs.editorReadyRef.current).toBe(false);
    expect(refs.getMarkdownRef.current).toBeNull();
  });

  it('no-ops when neither activeId nor activeTemplate is set', async () => {
    const flushSave = vi.fn(async () => undefined);
    const setActiveId = vi.fn();
    const { result } = renderHook(() => useNoteCommands(makeParams({ flushSave, setActiveId })));
    await act(async () => { await result.current.closeActiveNote(); });
    expect(flushSave).not.toHaveBeenCalled();
    expect(setActiveId).not.toHaveBeenCalled();
  });
});

describe('useNoteCommands — deleteNote (two-click confirm)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it('first click sets confirmDelete=true; does not delete', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Doomed', 'body', '');
    const deleteSpy = vi.spyOn(store, 'delete');
    const { result } = renderHook(() => useNoteCommands(makeParams({
      store, activeId: meta.id,
    })));
    await act(async () => { await result.current.deleteNote(); });
    expect(result.current.confirmDelete).toBe(true);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('second click within 3s deletes from store + notes + locked + index', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Doomed', 'body', '');
    const deleteSpy = vi.spyOn(store, 'delete');
    const setNotes = vi.fn();
    const setLockedNotes = vi.fn();
    const indexRemove = vi.fn();
    const persistLocked = vi.fn();
    const lockedNotes = new Set([meta.id]);
    const { result, rerender } = renderHook((props: UseNoteCommandsParams) => useNoteCommands(props), {
      initialProps: makeParams({
        store, activeId: meta.id, lockedNotes,
        setNotes, setLockedNotes, indexRemove, persistLocked,
      }),
    });
    await act(async () => { await result.current.deleteNote(); });
    rerender(makeParams({
      store, activeId: meta.id, lockedNotes,
      setNotes, setLockedNotes, indexRemove, persistLocked,
    }));
    await act(async () => { await result.current.deleteNote(); });
    expect(deleteSpy).toHaveBeenCalledWith(meta.id);
    expect(setNotes).toHaveBeenCalled();
    expect(indexRemove).toHaveBeenCalledWith(meta.id);
    expect(setLockedNotes).toHaveBeenCalled();
  });

  it('confirmDelete reverts to false after 3s with no second click', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Doomed', 'body', '');
    const { result } = renderHook(() => useNoteCommands(makeParams({
      store, activeId: meta.id,
    })));
    await act(async () => { await result.current.deleteNote(); });
    expect(result.current.confirmDelete).toBe(true);
    await act(async () => { vi.advanceTimersByTime(3001); });
    expect(result.current.confirmDelete).toBe(false);
  });

  it('cancels pending autosave + title-save timers before deleting', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Doomed', 'body', '');
    const refs = makeRefs();
    refs.autoSaveTimerRef.current = 42;
    refs.titleSaveTimerRef.current = 99;
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { result, rerender } = renderHook((props: UseNoteCommandsParams) => useNoteCommands(props), {
      initialProps: makeParams({ store, activeId: meta.id }, refs),
    });
    await act(async () => { await result.current.deleteNote(); });
    rerender(makeParams({ store, activeId: meta.id }, refs));
    await act(async () => { await result.current.deleteNote(); });
    expect(clearTimeoutSpy).toHaveBeenCalledWith(42);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(99);
    expect(refs.autoSaveTimerRef.current).toBeNull();
    expect(refs.titleSaveTimerRef.current).toBeNull();
    clearTimeoutSpy.mockRestore();
  });
});

describe('useNoteCommands — handleDuplicate', () => {
  it('creates a "{title} (copy)" sibling and selects it', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Original', 'orig body', 'work');
    const createSpy = vi.spyOn(store, 'create');
    const pushRecent = vi.fn();
    const { result } = renderHook(() => useNoteCommands(makeParams({ store, pushRecent })));
    await act(async () => { await result.current.handleDuplicate(meta.id); });
    expect(createSpy).toHaveBeenCalledWith('Original (copy)', 'orig body', 'work');
    expect(pushRecent).toHaveBeenCalled();
  });
});

describe('useNoteCommands — handleNavigateLink', () => {
  it('resolves to a known note via linkResolverRef and selects it', async () => {
    const store = new FakeNoteStore();
    const target = await store.create('Target', '# Target', '');
    const refs = makeRefs();
    refs.linkResolverRef.current = buildLinkResolver([target]);
    const pushRecent = vi.fn();
    const { result } = renderHook(() => useNoteCommands(makeParams({ store, pushRecent }, refs)));
    act(() => { result.current.handleNavigateLink('Target'); });
    await act(async () => { await Promise.resolve(); });
    expect(pushRecent).toHaveBeenCalledWith(target.id);
  });

  it('prompts and creates a new note when target is unknown and user accepts', async () => {
    const store = new FakeNoteStore();
    const refs = makeRefs();
    refs.linkResolverRef.current = new Map();
    const createSpy = vi.spyOn(store, 'create');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useNoteCommands(makeParams({
      store, activeId: 'work/note.md',
    }, refs)));
    act(() => { result.current.handleNavigateLink('NewTopic'); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(createSpy).toHaveBeenCalledWith('NewTopic', '# NewTopic\n\n', 'work');
  });

  it('does nothing when user cancels the create prompt', async () => {
    const store = new FakeNoteStore();
    const refs = makeRefs();
    refs.linkResolverRef.current = new Map();
    const createSpy = vi.spyOn(store, 'create');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(() => useNoteCommands(makeParams({ store }, refs)));
    act(() => { result.current.handleNavigateLink('Nothing'); });
    await act(async () => { await Promise.resolve(); });
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('useNoteCommands — handleLinkMention', () => {
  it('wraps first matching unwrapped mention as [[wikilink]] and force-saves', async () => {
    const store = new FakeNoteStore();
    const note = await store.create('Doc', 'see Other in body', '');
    const doSave = vi.fn(async () => undefined);
    const setActiveText = vi.fn();
    const refs = makeRefs();
    refs.getMarkdownRef.current = () => 'see Other in body';
    const { result } = renderHook(() => useNoteCommands(makeParams({
      store, activeId: note.id, activeText: 'see Other in body',
      doSave, setActiveText,
    }, refs)));
    await act(async () => { await result.current.handleLinkMention('Other'); });
    expect(doSave).toHaveBeenCalledWith(note.id, 'see [[Other]] in body', { force: true });
    expect(setActiveText).toHaveBeenCalledWith('see [[Other]] in body');
  });

  it('skips occurrences already inside an existing wikilink', async () => {
    const store = new FakeNoteStore();
    const note = await store.create('Doc', 'see [[Other]] only', '');
    const doSave = vi.fn(async () => undefined);
    const refs = makeRefs();
    refs.getMarkdownRef.current = () => 'see [[Other]] only';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderHook(() => useNoteCommands(makeParams({
      store, activeId: note.id, activeText: 'see [[Other]] only', doSave,
    }, refs)));
    await act(async () => { await result.current.handleLinkMention('Other'); });
    expect(doSave).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('useNoteCommands — handleDrop', () => {
  it('preventDefault, clears dragging, and forwards .md files to importFiles', async () => {
    const store = new FakeNoteStore();
    const setDragging = vi.fn();
    const createSpy = vi.spyOn(store, 'create');
    const { result } = renderHook(() => useNoteCommands(makeParams({ store, setDragging })));
    const file = {
      name: 'note.md',
      type: 'text/markdown',
      text: async () => '# Imported\nbody',
    } as unknown as File;
    const e = {
      preventDefault: vi.fn(),
      dataTransfer: { files: [file] as unknown as FileList },
    } as unknown as React.DragEvent;
    await act(async () => {
      result.current.handleDrop(e);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(e.preventDefault).toHaveBeenCalled();
    expect(setDragging).toHaveBeenCalledWith(false);
    expect(createSpy).toHaveBeenCalled();
  });
});

describe('useNoteCommands — toggleLock + isLocked', () => {
  it('isLocked is true when activeId is in lockedNotes', () => {
    const lockedNotes = new Set(['n1.md']);
    const { result } = renderHook(() => useNoteCommands(makeParams({
      activeId: 'n1.md', lockedNotes,
    })));
    expect(result.current.isLocked).toBe(true);
  });

  it('toggleLock cancels pending autosave and flips the locked set', () => {
    const refs = makeRefs();
    refs.autoSaveTimerRef.current = 7;
    const lockedNotes = new Set<string>();
    const setLockedNotes = vi.fn();
    const persistLocked = vi.fn();
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { result } = renderHook(() => useNoteCommands(makeParams({
      activeId: 'n1.md', lockedNotes, setLockedNotes, persistLocked,
    }, refs)));
    act(() => { result.current.toggleLock(); });
    expect(clearTimeoutSpy).toHaveBeenCalledWith(7);
    expect(refs.autoSaveTimerRef.current).toBeNull();
    expect(setLockedNotes).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('toggleLock no-ops when activeId is null', () => {
    const setLockedNotes = vi.fn();
    const { result } = renderHook(() => useNoteCommands(makeParams({
      activeId: null, setLockedNotes,
    })));
    act(() => { result.current.toggleLock(); });
    expect(setLockedNotes).not.toHaveBeenCalled();
  });
});
