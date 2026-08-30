import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, cleanup, waitFor } from '@testing-library/react';
import {
  useVaultLifecycle,
  type UseVaultLifecycleParams,
  type LoadCachedSnapshot,
} from './useVaultLifecycle';
import { FakeNoteStore } from '@/utils/test/fake-store';
import type { NoteRevision } from '@/lib/storage';

afterEach(() => cleanup());

function makeRefs() {
  return {
    loadCachedSnapshotRef: { current: (async () => null) as LoadCachedSnapshot },
    disposeSearchRef: { current: vi.fn() as () => void },
    vaultResetRef: { current: vi.fn() as () => void },
    activeRevisionRef: { current: null as NoteRevision | null },
  };
}

function makeParams(
  overrides: Partial<UseVaultLifecycleParams> = {},
  refs = makeRefs(),
): UseVaultLifecycleParams {
  const store = overrides.store ?? new FakeNoteStore();
  return {
    store,
    loadCachedSnapshotRef: refs.loadCachedSnapshotRef,
    disposeSearchRef: refs.disposeSearchRef,
    vaultResetRef: refs.vaultResetRef,
    setActiveId: vi.fn(),
    setActiveUuid: vi.fn(),
    setActiveText: vi.fn(),
    activeRevisionRef: refs.activeRevisionRef,
    setSidebarOpen: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useVaultLifecycle — initialize', () => {
  it('sets storeReady=true and clears bfsError on a ready store', async () => {
    const store = new FakeNoteStore();
    store._test_setReady(true, { label: 'My Vault', vaultId: 'v1' });
    const params = makeParams({ store });
    const { result } = renderHook(() => useVaultLifecycle(params));
    await waitFor(() => expect(result.current.storeReady).toBe(true));
    expect(result.current.bfsLabel).toBe('My Vault');
    expect(result.current.vaultId).toBe('v1');
    expect(result.current.bfsError).toBe('');
    expect(result.current.needsDirPick).toBe(false);
  });

  it('sets needsDirPick=true and loading=false when status.ready=false with needsPicker', async () => {
    const store = new FakeNoteStore();
    store._test_setReady(false, { needsPicker: true });
    const params = makeParams({ store });
    const { result } = renderHook(() => useVaultLifecycle(params));
    await waitFor(() => expect(result.current.needsDirPick).toBe(true));
    expect(result.current.storeReady).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('keeps loading true while a replacement ready store is waiting to list notes', async () => {
    const first = new FakeNoteStore();
    first._test_setReady(false, { needsPicker: true });
    const refs = makeRefs();
    const initialParams = makeParams({ store: first }, refs);
    const { result, rerender } = renderHook(
      ({ params }: { params: UseVaultLifecycleParams }) => useVaultLifecycle(params),
      { initialProps: { params: initialParams } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.storeReady).toBe(false);

    const cache = deferred<Awaited<ReturnType<LoadCachedSnapshot>>>();
    refs.loadCachedSnapshotRef.current = () => cache.promise;
    const second = new FakeNoteStore();
    second._test_setReady(true, { vaultId: 'docs' });
    second._test_seedNote({ id: 'index.md', title: 'Index', text: '# Index' });
    rerender({ params: makeParams({ store: second }, refs) });

    await waitFor(() => expect(result.current.storeReady).toBe(true));
    expect(result.current.loading).toBe(true);

    await act(async () => {
      cache.resolve(null);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.notes.map(n => n.id)).toContain('index.md'));
  });

  it('catches initialize() throws and unsticks loading', async () => {
    const store = new FakeNoteStore();
    store._test_failNext('initialize', new Error('idb hiccup'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const params = makeParams({ store });
    const { result } = renderHook(() => useVaultLifecycle(params));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.storeReady).toBe(false);
    errSpy.mockRestore();
  });
});

describe('useVaultLifecycle — loadNotes (cache-first)', () => {
  it('paints from cached snapshot first, then refreshes folders from disk', async () => {
    const store = new FakeNoteStore();
    const seeded = store._test_seedNote({ id: 'a.md', title: 'A (cached)', text: 'body' });
    store._test_seedFolder('disk-folder');
    store._test_setReady(true, { vaultId: 'v1' });
    const refs = makeRefs();
    refs.loadCachedSnapshotRef.current = async () => ({
      notes: [seeded],
      folders: [],
    });
    const params = makeParams({ store }, refs);
    const { result } = renderHook(() => useVaultLifecycle(params));
    // Cached paint lands first (notes populated, folders not yet from disk).
    await waitFor(() => expect(result.current.notes.length).toBeGreaterThan(0));
    expect(result.current.loading).toBe(false);
    // Background list eventually pulls disk folders into state.
    await waitFor(() => expect(result.current.folders).toContain('disk-folder'));
  });

  it('cache miss: loads from store.list and clears active state on cold path', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    store._test_setReady(true, { vaultId: 'v1' });
    const setActiveId = vi.fn();
    const setActiveText = vi.fn();
    const refs = makeRefs();
    refs.activeRevisionRef.current = { size: 99, mtimeMs: 1 };
    const params = makeParams({ store, setActiveId, setActiveText }, refs);
    const { result } = renderHook(() => useVaultLifecycle(params));
    await waitFor(() => expect(result.current.notes.length).toBe(1));
    expect(setActiveId).toHaveBeenCalledWith(null);
    expect(setActiveText).toHaveBeenCalledWith('');
    expect(refs.activeRevisionRef.current).toBeNull();
  });

  it('list error sets needsDirPick + bfsError and clears notes/folders', async () => {
    const store = new FakeNoteStore();
    store._test_setReady(true, { vaultId: 'v1' });
    store._test_failNext('list', new Error('handle invalid'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const params = makeParams({ store });
    const { result } = renderHook(() => useVaultLifecycle(params));
    await waitFor(() => expect(result.current.needsDirPick).toBe(true));
    expect(result.current.bfsError).toContain('Could not read');
    expect(result.current.notes).toEqual([]);
    expect(result.current.folders).toEqual([]);
    errSpy.mockRestore();
  });
});

describe('useVaultLifecycle — pickBrowserDir', () => {
  it('clears state, calls vaultReset + disposeSearch, then re-initializes', async () => {
    const store = new FakeNoteStore();
    store._test_setReady(true, { vaultId: 'old', label: 'Old' });
    const refs = makeRefs();
    const setActiveId = vi.fn();
    const setActiveText = vi.fn();
    const setSidebarOpen = vi.fn();
    const pickSpy = vi.spyOn(store, 'pickDirectory').mockResolvedValue(true);
    const params = makeParams({ store, setActiveId, setActiveText, setSidebarOpen }, refs);
    const { result } = renderHook(() => useVaultLifecycle(params));
    await waitFor(() => expect(result.current.storeReady).toBe(true));
    await act(async () => { await result.current.pickBrowserDir(true); });
    expect(pickSpy).toHaveBeenCalledWith({ forceNew: true });
    expect(refs.vaultResetRef.current).toHaveBeenCalled();
    expect(refs.disposeSearchRef.current).toHaveBeenCalled();
    expect(setActiveId).toHaveBeenCalledWith(null);
    expect(setActiveText).toHaveBeenCalledWith('');
    expect(refs.activeRevisionRef.current).toBeNull();
    expect(setSidebarOpen).toHaveBeenCalledWith(true);
    expect(result.current.storeReady).toBe(true);
  });

  it('no-op when pickDirectory returns false (user cancelled in our store impl)', async () => {
    const store = new FakeNoteStore();
    store._test_setReady(true);
    vi.spyOn(store, 'pickDirectory').mockResolvedValue(false);
    const refs = makeRefs();
    const params = makeParams({ store }, refs);
    const { result } = renderHook(() => useVaultLifecycle(params));
    await waitFor(() => expect(result.current.storeReady).toBe(true));
    await act(async () => { await result.current.pickBrowserDir(); });
    expect(refs.vaultResetRef.current).not.toHaveBeenCalled();
    expect(refs.disposeSearchRef.current).not.toHaveBeenCalled();
  });

  it('swallows AbortError silently (user cancelled native picker)', async () => {
    const store = new FakeNoteStore();
    store._test_setReady(true);
    const abort = new DOMException('user aborted', 'AbortError');
    vi.spyOn(store, 'pickDirectory').mockRejectedValue(abort);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const params = makeParams({ store });
    const { result } = renderHook(() => useVaultLifecycle(params));
    await waitFor(() => expect(result.current.storeReady).toBe(true));
    await act(async () => { await result.current.pickBrowserDir(); });
    expect(result.current.bfsError).toBe('');
    errSpy.mockRestore();
  });

  it('non-abort errors set bfsError', async () => {
    const store = new FakeNoteStore();
    store._test_setReady(true);
    vi.spyOn(store, 'pickDirectory').mockRejectedValue(new Error('disk unplugged'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const params = makeParams({ store });
    const { result } = renderHook(() => useVaultLifecycle(params));
    await waitFor(() => expect(result.current.storeReady).toBe(true));
    await act(async () => { await result.current.pickBrowserDir(); });
    expect(result.current.bfsError).toContain('disk unplugged');
    errSpy.mockRestore();
  });
});
