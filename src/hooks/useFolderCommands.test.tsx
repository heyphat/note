import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useFolderCommands, type UseFolderCommandsParams } from './useFolderCommands';
import { FakeNoteStore } from '@/utils/test/fake-store';
import type { NoteRevision } from '@/lib/storage';

afterEach(() => cleanup());

function makeRefs() {
  return {
    getMarkdownRef: { current: null as (() => string) | null },
    lastSavedRef: { current: '' },
    lastSavedTitleRef: { current: '' },
    activeRevisionRef: { current: null as NoteRevision | null },
    editorReadyRef: { current: false },
  };
}

function makeParams(
  overrides: Partial<UseFolderCommandsParams> = {},
  refs = makeRefs(),
): UseFolderCommandsParams {
  const store = overrides.store ?? new FakeNoteStore();
  return {
    store,
    activeId: null,
    activeText: '',
    linkIndex: null,
    getMarkdownRef: refs.getMarkdownRef,
    lastSavedRef: refs.lastSavedRef,
    lastSavedTitleRef: refs.lastSavedTitleRef,
    activeRevisionRef: refs.activeRevisionRef,
    editorReadyRef: refs.editorReadyRef,
    flushSave: vi.fn(async () => undefined),
    flushTitleSave: vi.fn(async () => undefined),
    addFolderLocal: vi.fn(),
    removeFolderLocal: vi.fn(),
    renameFolderLocal: vi.fn(),
    moveLocal: vi.fn(),
    pruneAutoTitleNotes: vi.fn(),
    remapAutoTitleNotes: vi.fn(),
    setPinned: vi.fn(),
    persistPinned: vi.fn(),
    setLockedNotes: vi.fn(),
    persistLocked: vi.fn(),
    indexRemove: vi.fn(),
    indexRename: vi.fn(),
    syncPost: vi.fn(),
    setActiveId: vi.fn(),
    setActiveUuid: vi.fn(),
    setActiveText: vi.fn(),
    setNotes: vi.fn(),
    ...overrides,
  };
}

describe('useFolderCommands — expandPath + toggleFolder', () => {
  it('expandPath walks all ancestors of a nested path', () => {
    const { result } = renderHook(() => useFolderCommands(makeParams()));
    act(() => { result.current.expandPath('a/b/c'); });
    expect(result.current.expanded.has('a')).toBe(true);
    expect(result.current.expanded.has('a/b')).toBe(true);
    expect(result.current.expanded.has('a/b/c')).toBe(true);
  });

  it('expandPath is idempotent', () => {
    const { result } = renderHook(() => useFolderCommands(makeParams()));
    act(() => { result.current.expandPath('a/b'); });
    act(() => { result.current.expandPath('a/b'); });
    expect(result.current.expanded.size).toBe(2);
  });

  it('expandPath no-ops on empty path', () => {
    const { result } = renderHook(() => useFolderCommands(makeParams()));
    act(() => { result.current.expandPath(''); });
    expect(result.current.expanded.size).toBe(0);
  });

  it('toggleFolder adds then removes a path', () => {
    const { result } = renderHook(() => useFolderCommands(makeParams()));
    act(() => { result.current.toggleFolder('foo'); });
    expect(result.current.expanded.has('foo')).toBe(true);
    act(() => { result.current.toggleFolder('foo'); });
    expect(result.current.expanded.has('foo')).toBe(false);
  });
});

describe('useFolderCommands — handleFolderClick + revealFolderInSidebar', () => {
  it('handleFolderClick sets target and toggles', () => {
    const { result } = renderHook(() => useFolderCommands(makeParams()));
    act(() => { result.current.handleFolderClick('work'); });
    expect(result.current.targetFolder).toBe('work');
    expect(result.current.expanded.has('work')).toBe(true);
  });

  it('handleFolderClick on root sets target but skips toggle', () => {
    const { result } = renderHook(() => useFolderCommands(makeParams()));
    act(() => { result.current.handleFolderClick('work'); });
    expect(result.current.expanded.has('work')).toBe(true);
    act(() => { result.current.handleFolderClick(''); });
    expect(result.current.targetFolder).toBe('');
    // root toggle is suppressed; previous expansion is unchanged
    expect(result.current.expanded.has('work')).toBe(true);
  });

  it('revealFolderInSidebar sets target and walks ancestors', () => {
    const { result } = renderHook(() => useFolderCommands(makeParams()));
    act(() => { result.current.revealFolderInSidebar('a/b/c'); });
    expect(result.current.targetFolder).toBe('a/b/c');
    expect(result.current.expanded.has('a')).toBe(true);
    expect(result.current.expanded.has('a/b')).toBe(true);
    expect(result.current.expanded.has('a/b/c')).toBe(true);
  });
});

describe('useFolderCommands — deleteItem', () => {
  it('deletes a note from store and removes it from the notes array', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Doomed', 'body', '');
    const deleteSpy = vi.spyOn(store, 'delete');
    const setNotes = vi.fn();
    const indexRemove = vi.fn();
    const { result } = renderHook(() => useFolderCommands(makeParams({
      store, setNotes, indexRemove,
    })));
    await act(async () => { await result.current.deleteItem(meta.id); });
    expect(deleteSpy).toHaveBeenCalledWith(meta.id);
    expect(setNotes).toHaveBeenCalled();
    expect(indexRemove).toHaveBeenCalledWith(meta.id);
  });

  it('deletes a folder via store.deleteFolder + removeFolderLocal', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('legacy');
    const folderSpy = vi.spyOn(store, 'deleteFolder');
    const removeFolderLocal = vi.fn();
    const indexRemove = vi.fn();
    const { result } = renderHook(() => useFolderCommands(makeParams({
      store, removeFolderLocal, indexRemove,
    })));
    await act(async () => { await result.current.deleteItem('legacy'); });
    expect(folderSpy).toHaveBeenCalledWith('legacy');
    expect(removeFolderLocal).toHaveBeenCalledWith('legacy');
    expect(indexRemove).not.toHaveBeenCalled();
  });

  it('clears active state when active note sits under deleted path', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('work');
    const meta = await store.create('Doomed', 'body', 'work');
    const setActiveId = vi.fn();
    const setActiveUuid = vi.fn();
    const setActiveText = vi.fn();
    const refs = makeRefs();
    refs.activeRevisionRef.current = { size: 5, mtimeMs: 1 };
    refs.editorReadyRef.current = true;
    refs.getMarkdownRef.current = () => 'live';
    const { result } = renderHook(() => useFolderCommands(makeParams({
      store, activeId: meta.id, setActiveId, setActiveUuid, setActiveText,
    }, refs)));
    await act(async () => { await result.current.deleteItem('work'); });
    expect(setActiveId).toHaveBeenCalledWith(null);
    expect(setActiveUuid).toHaveBeenCalledWith(null);
    expect(setActiveText).toHaveBeenCalledWith('');
    expect(refs.activeRevisionRef.current).toBeNull();
    expect(refs.editorReadyRef.current).toBe(false);
    expect(refs.getMarkdownRef.current).toBeNull();
  });

  it('clears targetFolder when it sits under the deleted path', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('work');
    const { result } = renderHook(() => useFolderCommands(makeParams({ store })));
    act(() => { result.current.handleFolderClick('work'); });
    expect(result.current.targetFolder).toBe('work');
    await act(async () => { await result.current.deleteItem('work'); });
    expect(result.current.targetFolder).toBe('');
  });

  it('alerts and bails when store throws', async () => {
    const store = new FakeNoteStore();
    vi.spyOn(store, 'delete').mockRejectedValue(new Error('disk full'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const setNotes = vi.fn();
    const { result } = renderHook(() => useFolderCommands(makeParams({ store, setNotes })));
    await act(async () => { await result.current.deleteItem('foo.md'); });
    expect(alertSpy).toHaveBeenCalled();
    expect(setNotes).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('useFolderCommands — createFolder + createFolderAt', () => {
  it('createFolder creates the prompt path and updates targetFolder + expanded', async () => {
    const store = new FakeNoteStore();
    const createSpy = vi.spyOn(store, 'createFolder');
    vi.spyOn(window, 'prompt').mockReturnValue('ideas');
    const { result } = renderHook(() => useFolderCommands(makeParams({ store })));
    await act(async () => { await result.current.createFolder(); });
    expect(createSpy).toHaveBeenCalledWith('ideas');
    expect(result.current.targetFolder).toBe('ideas');
    expect(result.current.expanded.has('ideas')).toBe(true);
  });

  it('createFolder nests under existing targetFolder', async () => {
    const store = new FakeNoteStore();
    const createSpy = vi.spyOn(store, 'createFolder');
    vi.spyOn(window, 'prompt').mockReturnValue('subfolder');
    const { result } = renderHook(() => useFolderCommands(makeParams({ store })));
    act(() => { result.current.handleFolderClick('parent'); });
    await act(async () => { await result.current.createFolder(); });
    expect(createSpy).toHaveBeenCalledWith('parent/subfolder');
    expect(result.current.targetFolder).toBe('parent/subfolder');
  });

  it('createFolder cancels when prompt returns null', async () => {
    const store = new FakeNoteStore();
    const createSpy = vi.spyOn(store, 'createFolder');
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const { result } = renderHook(() => useFolderCommands(makeParams({ store })));
    await act(async () => { await result.current.createFolder(); });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('createFolderAt creates with given parent + name', async () => {
    const store = new FakeNoteStore();
    const createSpy = vi.spyOn(store, 'createFolder');
    const { result } = renderHook(() => useFolderCommands(makeParams({ store })));
    await act(async () => { await result.current.createFolderAt('work', 'plans'); });
    expect(createSpy).toHaveBeenCalledWith('work/plans');
    expect(result.current.expanded.has('work/plans')).toBe(true);
  });

  it('createFolderAt skips on empty name', async () => {
    const store = new FakeNoteStore();
    const createSpy = vi.spyOn(store, 'createFolder');
    const { result } = renderHook(() => useFolderCommands(makeParams({ store })));
    await act(async () => { await result.current.createFolderAt('work', '   '); });
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('useFolderCommands — handleRenameFolder', () => {
  it('flushes saves when active note lives under the renamed folder', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('old');
    const meta = await store.create('A', 'body', 'old');
    const flushSave = vi.fn(async () => undefined);
    const flushTitleSave = vi.fn(async () => undefined);
    const { result } = renderHook(() => useFolderCommands(makeParams({
      store, activeId: meta.id, flushSave, flushTitleSave,
    })));
    await act(async () => { await result.current.handleRenameFolder('old', 'new'); });
    expect(flushSave).toHaveBeenCalled();
    expect(flushTitleSave).toHaveBeenCalled();
  });

  it('does NOT flush when active note is elsewhere', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('old');
    await store.createFolder('other');
    const elsewhere = await store.create('B', 'body', 'other');
    const flushSave = vi.fn(async () => undefined);
    const { result } = renderHook(() => useFolderCommands(makeParams({
      store, activeId: elsewhere.id, flushSave,
    })));
    await act(async () => { await result.current.handleRenameFolder('old', 'newer'); });
    expect(flushSave).not.toHaveBeenCalled();
  });

  it('remaps active id, preserves live editor body across remount', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('old');
    const meta = await store.create('Note', 'on disk', 'old');
    const setActiveId = vi.fn();
    const setActiveText = vi.fn();
    const refs = makeRefs();
    refs.getMarkdownRef.current = () => 'in-memory edit';
    const { result } = renderHook(() => useFolderCommands(makeParams({
      store, activeId: meta.id, activeText: 'fallback',
      setActiveId, setActiveText,
    }, refs)));
    await act(async () => { await result.current.handleRenameFolder('old', 'new'); });
    // Editor body comes from the live ref, not the stale activeText.
    expect(setActiveText).toHaveBeenCalledWith('in-memory edit');
    // Active id remaps from old/Note.md → new/Note.md.
    const newId = setActiveId.mock.calls[0][0] as string;
    expect(newId.startsWith('new/')).toBe(true);
    // Refs reset for the editor remount.
    expect(refs.lastSavedRef.current).toBe('');
    expect(refs.lastSavedTitleRef.current).toBe('');
    expect(refs.activeRevisionRef.current).toBeNull();
    expect(refs.getMarkdownRef.current).toBeNull();
    expect(refs.editorReadyRef.current).toBe(false);
  });

  it('falls back to activeText when getMarkdownRef is null', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('old');
    const meta = await store.create('A', 'body', 'old');
    const setActiveText = vi.fn();
    const refs = makeRefs();
    // refs.getMarkdownRef.current = null  (default)
    const { result } = renderHook(() => useFolderCommands(makeParams({
      store, activeId: meta.id, activeText: 'fallback', setActiveText,
    }, refs)));
    await act(async () => { await result.current.handleRenameFolder('old', 'newer'); });
    expect(setActiveText).toHaveBeenCalledWith('fallback');
  });

  it('updates targetFolder when it equals the renamed path', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('old');
    const { result } = renderHook(() => useFolderCommands(makeParams({ store })));
    act(() => { result.current.handleFolderClick('old'); });
    await act(async () => { await result.current.handleRenameFolder('old', 'newer'); });
    expect(result.current.targetFolder).toBe('newer');
  });
});

describe('useFolderCommands — handleMove', () => {
  it('flushes saves when moving the active note', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('dest');
    const meta = await store.create('Note', 'body', '');
    const flushSave = vi.fn(async () => undefined);
    const flushTitleSave = vi.fn(async () => undefined);
    const { result } = renderHook(() => useFolderCommands(makeParams({
      store, activeId: meta.id, flushSave, flushTitleSave,
    })));
    await act(async () => { await result.current.handleMove(meta.id, 'dest'); });
    expect(flushSave).toHaveBeenCalled();
    expect(flushTitleSave).toHaveBeenCalled();
  });

  it('expands destination folder + sets it as targetFolder', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('dest');
    const meta = await store.create('Note', 'body', '');
    const { result } = renderHook(() => useFolderCommands(makeParams({
      store, activeId: meta.id,
    })));
    await act(async () => { await result.current.handleMove(meta.id, 'dest'); });
    expect(result.current.expanded.has('dest')).toBe(true);
    expect(result.current.targetFolder).toBe('dest');
  });

  it('remaps active id to new path with descendant slice for folder moves', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('src');
    await store.createFolder('dest');
    const meta = await store.create('Note', 'body', 'src');
    const setActiveId = vi.fn();
    const refs = makeRefs();
    refs.getMarkdownRef.current = () => 'edited';
    const { result } = renderHook(() => useFolderCommands(makeParams({
      store, activeId: meta.id, setActiveId,
    }, refs)));
    await act(async () => { await result.current.handleMove('src', 'dest'); });
    const remapped = setActiveId.mock.calls[0][0] as string;
    expect(remapped.startsWith('dest/src/')).toBe(true);
  });

  it('moveLocal called with srcId and newId; indexRename only for note moves', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('dest');
    const meta = await store.create('Note', 'body', '');
    const moveLocal = vi.fn();
    const indexRename = vi.fn();
    const { result } = renderHook(() => useFolderCommands(makeParams({
      store, moveLocal, indexRename,
    })));
    await act(async () => { await result.current.handleMove(meta.id, 'dest'); });
    expect(moveLocal).toHaveBeenCalled();
    expect(indexRename).toHaveBeenCalledWith(meta.id, expect.any(String));
  });
});
