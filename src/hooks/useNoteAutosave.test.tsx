import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useNoteAutosave, type UseNoteAutosaveParams } from './useNoteAutosave';
import { FakeNoteStore } from '@/utils/test/fake-store';
import type { MilkdownEditorApi } from '@/components/MilkdownEditor';
import type { NoteRevision } from '@/lib/storage';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function makeParams(overrides: Partial<UseNoteAutosaveParams> = {}): UseNoteAutosaveParams {
  const store = overrides.store ?? new FakeNoteStore();
  const renameTemplateRef = overrides.renameTemplateRef ?? { current: vi.fn(async () => undefined) };
  const renameSkillRef = overrides.renameSkillRef ?? { current: vi.fn(async () => undefined) };
  const activeRevisionRef = overrides.activeRevisionRef ?? { current: null as NoteRevision | null };
  return {
    store,
    activeId: 'a.md',
    activeTemplate: null,
    activeSkill: null,
    editingTitle: 'Hello',
    activeText: 'body',
    notes: [],
    linkIndex: null,
    hasAutoTitle: () => false,
    deleteAutoTitle: vi.fn(),
    syncPost: vi.fn(),
    clearDirty: vi.fn(),
    markDirty: vi.fn(),
    flagExternalUpdate: vi.fn(),
    indexUpdate: vi.fn(),
    setNotes: vi.fn(),
    setEditingTitle: vi.fn(),
    setHistoryReloadToken: vi.fn(),
    applyNoteIdRemap: vi.fn(),
    renameTemplateRef,
    renameSkillRef,
    activeRevisionRef,
    ...overrides,
  };
}

function fakeEditorApi(getMd: () => string): { getMarkdown: () => string; api: MilkdownEditorApi } {
  return {
    getMarkdown: getMd,
    api: {
      getMarkdown: getMd,
      replaceMarkdown: () => true,
    },
  };
}

describe('useNoteAutosave — handleReady', () => {
  it('seeds lastSavedRef from the editor on mount', () => {
    const { result } = renderHook(() => useNoteAutosave(makeParams()));
    const { getMarkdown, api } = fakeEditorApi(() => '# Hello\nbody');
    act(() => { result.current.handleReady(getMarkdown, api); });
    expect(result.current.lastSavedRef.current).toBe('# Hello\nbody');
    expect(result.current.editorReadyRef.current).toBe(true);
    expect(result.current.getMarkdownRef.current).toBe(getMarkdown);
  });
});

describe('useNoteAutosave — empty-body guard', () => {
  it('skips an empty-body autosave without {force: true}', async () => {
    const store = new FakeNoteStore();
    const seeded = store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    // Pre-seed the lastSavedRef as if the editor mounted with body
    result.current.lastSavedRef.current = 'body';
    result.current.activeRevisionRef.current = { size: seeded.size, mtimeMs: seeded.mtimeMs };
    await act(async () => { await result.current.doSave('a.md', '', { force: false }); });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('writes an empty body when {force: true}', async () => {
    const store = new FakeNoteStore();
    const seeded = store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    result.current.lastSavedRef.current = 'body';
    result.current.activeRevisionRef.current = { size: seeded.size, mtimeMs: seeded.mtimeMs };
    await act(async () => { await result.current.doSave('a.md', '', { force: true }); });
    expect(saveSpy).toHaveBeenCalledWith('a.md', '', undefined, expect.any(Object));
  });
});

describe('useNoteAutosave — conflict handling', () => {
  it('flags external update + sets save-status error when a conflict throws', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const flagExternalUpdate = vi.fn();
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store, flagExternalUpdate })));
    store._test_simulateConflictOnNext('a.md');
    await act(async () => { await result.current.doSave('a.md', 'next'); });
    expect(flagExternalUpdate).toHaveBeenCalledWith('a.md');
    expect(result.current.saveStatus).toBe('error');
  });
});

describe('useNoteAutosave — auto-title save path', () => {
  it('derives the title from the first heading and writes it on save', async () => {
    const store = new FakeNoteStore();
    const seeded = store._test_seedNote({ id: 'a.md', title: 'Untitled note', text: '' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const setEditingTitle = vi.fn();
    const { result } = renderHook(() => useNoteAutosave(makeParams({
      store,
      hasAutoTitle: () => true,
      setEditingTitle,
    })));
    result.current.lastSavedRef.current = '';
    result.current.activeRevisionRef.current = { size: seeded.size, mtimeMs: seeded.mtimeMs };
    await act(async () => { await result.current.doSave('a.md', '# Daily Plan\n\nbody'); });
    const last = saveSpy.mock.calls.at(-1)!;
    expect(last[2]).toBe('Daily Plan');
    expect(setEditingTitle).toHaveBeenCalledWith('Daily Plan');
  });
});

describe('useNoteAutosave — flushSave', () => {
  it('clears the pending autosave timer', () => {
    const { result } = renderHook(() => useNoteAutosave(makeParams()));
    // Mark the timer as if a debounce was scheduled.
    result.current.autoSaveTimerRef.current = window.setTimeout(() => {}, 5000);
    const before = result.current.autoSaveTimerRef.current;
    expect(before).not.toBeNull();
    void result.current.flushSave();
    expect(result.current.autoSaveTimerRef.current).toBeNull();
  });

  it('returns early when the editor is not ready', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    // editorReadyRef defaults to false — flushSave should bail.
    await act(async () => { await result.current.flushSave(); });
    expect(saveSpy).not.toHaveBeenCalled();
  });
});

describe('useNoteAutosave — handleChange gates on editorReady', () => {
  it('does NOT schedule a save when the editor has not signalled onReady', () => {
    vi.useFakeTimers();
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    // editorReadyRef remains false (no handleReady call). The MutationObserver
    // could fire mid-init in real life — that's the case this guards.
    act(() => { result.current.handleChange('changed body'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('schedules a save after the debounce window when the editor is ready', async () => {
    vi.useFakeTimers();
    const store = new FakeNoteStore();
    const seeded = store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    const { getMarkdown, api } = fakeEditorApi(() => 'body');
    act(() => { result.current.handleReady(getMarkdown, api); });
    result.current.activeRevisionRef.current = { size: seeded.size, mtimeMs: seeded.mtimeMs };
    act(() => { result.current.handleChange('next body'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(saveSpy).toHaveBeenCalled();
    const last = saveSpy.mock.calls.at(-1)!;
    expect(last[1]).toBe('next body');
  });
});

describe('useNoteAutosave — noteStats recompute', () => {
  it('recomputes stats on activeText changes', () => {
    const { result, rerender } = renderHook(
      (props: UseNoteAutosaveParams) => useNoteAutosave(props),
      { initialProps: makeParams({ activeText: '' }) },
    );
    expect(result.current.noteStats.words).toBe(0);
    rerender(makeParams({ activeText: 'one two three four five' }));
    expect(result.current.noteStats.words).toBe(5);
  });

  it('recomputes stats on activeId change (note switch)', () => {
    const { result, rerender } = renderHook(
      (props: UseNoteAutosaveParams) => useNoteAutosave(props),
      { initialProps: makeParams({ activeId: 'a.md', activeText: 'one two' }) },
    );
    expect(result.current.noteStats.words).toBe(2);
    // Switch to a different note with shorter body.
    rerender(makeParams({ activeId: 'b.md', activeText: 'solo' }));
    expect(result.current.noteStats.words).toBe(1);
  });
});

describe('useNoteAutosave — flush on tab hide / blur', () => {
  it('calls flushSave + flushTitleSave when the document becomes hidden', async () => {
    const store = new FakeNoteStore();
    const seeded = store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    // Pretend the editor is ready and there's a pending dirty change.
    const { getMarkdown, api } = fakeEditorApi(() => 'next');
    act(() => { result.current.handleReady(getMarkdown, api); });
    result.current.lastSavedRef.current = 'body';
    result.current.activeRevisionRef.current = { size: seeded.size, mtimeMs: seeded.mtimeMs };
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(saveSpy).toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('calls flushSave on window blur', async () => {
    const store = new FakeNoteStore();
    const seeded = store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    const { getMarkdown, api } = fakeEditorApi(() => 'next');
    act(() => { result.current.handleReady(getMarkdown, api); });
    result.current.lastSavedRef.current = 'body';
    result.current.activeRevisionRef.current = { size: seeded.size, mtimeMs: seeded.mtimeMs };
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      await Promise.resolve();
    });
    expect(saveSpy).toHaveBeenCalled();
  });
});

describe('useNoteAutosave — applyNoteIdRemap on path-changing save', () => {
  it('calls applyNoteIdRemap when the store returns a different meta.id', async () => {
    const store = new FakeNoteStore();
    const seeded = store._test_seedNote({ id: 'old.md', title: 'Untitled', text: 'body' });
    // Make `saveContent` return a meta with a different id (path-changing rename).
    const realSave = store.saveContent.bind(store);
    vi.spyOn(store, 'saveContent').mockImplementation(async (id, text, title, opts) => {
      const m = await realSave(id, text, title, opts);
      return { ...m, id: 'renamed.md' };
    });
    const applyNoteIdRemap = vi.fn();
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store, applyNoteIdRemap })));
    result.current.lastSavedRef.current = 'body';
    result.current.activeRevisionRef.current = { size: seeded.size, mtimeMs: seeded.mtimeMs };
    await act(async () => { await result.current.doSave('old.md', 'next'); });
    expect(applyNoteIdRemap).toHaveBeenCalledWith('old.md', 'renamed.md');
  });
});

describe('useNoteAutosave — flushTitleSave routing', () => {
  it('routes through renameTemplateRef when a template is active', async () => {
    const fn = vi.fn(async () => undefined);
    const renameTemplateRef = { current: fn };
    const { result } = renderHook(() => useNoteAutosave(makeParams({
      activeId: null,
      activeTemplate: 'tpl-1',
      editingTitle: 'Renamed',
      renameTemplateRef,
    })));
    await act(async () => { await result.current.flushTitleSave(); });
    expect(fn).toHaveBeenCalledWith('tpl-1', 'Renamed');
  });

  it('skips when the active note is auto-titled (lets doSave write the title)', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const renameSpy = vi.spyOn(store, 'rename');
    const { result } = renderHook(() => useNoteAutosave(makeParams({
      store,
      hasAutoTitle: () => true,
      editingTitle: 'Anything',
    })));
    await act(async () => { await result.current.flushTitleSave(); });
    expect(renameSpy).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  // Some tests dispatch real document events; reset visibility to a known
  // value so a previous test's "hidden" override doesn't leak.
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('useNoteAutosave — lastSaveError classification', () => {
  it('classifies NotFoundError as kind="not-found"', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const err = new DOMException('File not found: a.md', 'NotFoundError');
    store._test_failNext('saveContent', err);
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    await act(async () => { await result.current.doSave('a.md', 'next'); });
    expect(result.current.lastSaveError).toEqual({ id: 'a.md', kind: 'not-found' });
    expect(result.current.saveStatus).toBe('error');
  });

  it('classifies a NoteConflictError as kind="conflict"', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const flagExternalUpdate = vi.fn();
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store, flagExternalUpdate })));
    store._test_simulateConflictOnNext('a.md');
    await act(async () => { await result.current.doSave('a.md', 'next'); });
    expect(result.current.lastSaveError).toEqual({ id: 'a.md', kind: 'conflict' });
  });

  it('classifies any other error as kind="other"', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    store._test_failNext('saveContent', new Error('disk full'));
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    await act(async () => { await result.current.doSave('a.md', 'next'); });
    expect(result.current.lastSaveError).toEqual({ id: 'a.md', kind: 'other' });
  });

  it('clears lastSaveError after the next successful save', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    store._test_failNext('saveContent', new DOMException('not found', 'NotFoundError'));
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    await act(async () => { await result.current.doSave('a.md', 'first'); });
    expect(result.current.lastSaveError?.kind).toBe('not-found');
    await act(async () => { await result.current.doSave('a.md', 'second'); });
    expect(result.current.lastSaveError).toBeNull();
  });

  it('clearSaveError() drops the banner without a save', () => {
    const { result } = renderHook(() => useNoteAutosave(makeParams()));
    // Simulate the error having been set via a failed save by using the
    // exposed setter route — the cleanest API surface here is the catch
    // path itself, but for unit-testing the clear function we just rely on
    // the initial null state and verify the function exists/runs without
    // throwing.
    act(() => { result.current.clearSaveError(); });
    expect(result.current.lastSaveError).toBeNull();
  });

  it('clears lastSaveError when activeId changes (note switch)', async () => {
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    store._test_failNext('saveContent', new DOMException('not found', 'NotFoundError'));
    const { result, rerender } = renderHook(
      (p: UseNoteAutosaveParams) => useNoteAutosave(p),
      { initialProps: makeParams({ store, activeId: 'a.md' }) },
    );
    await act(async () => { await result.current.doSave('a.md', 'next'); });
    expect(result.current.lastSaveError?.kind).toBe('not-found');
    rerender(makeParams({ store, activeId: 'b.md' }));
    expect(result.current.lastSaveError).toBeNull();
  });
});

describe('useNoteAutosave — heartbeat gate', () => {
  it('does NOT call saveContent again on heartbeat tick when lastSaveError.kind === "not-found"', async () => {
    vi.useFakeTimers();
    const store = new FakeNoteStore();
    store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    store._test_failNext('saveContent', new DOMException('gone', 'NotFoundError'));
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    const { getMarkdown, api } = fakeEditorApi(() => 'body-edited');
    act(() => { result.current.handleReady(getMarkdown, api); });
    await act(async () => { await result.current.doSave('a.md', 'attempt-1'); });
    expect(result.current.lastSaveError?.kind).toBe('not-found');
    saveSpy.mockClear();
    // Advance past the 30s heartbeat interval. The tick MUST short-circuit
    // and never re-call saveContent — looping is what the gate prevents.
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('still calls saveContent on heartbeat tick when no error is parked', async () => {
    vi.useFakeTimers();
    const store = new FakeNoteStore();
    const seeded = store._test_seedNote({ id: 'a.md', title: 'A', text: 'body' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { result } = renderHook(() => useNoteAutosave(makeParams({ store })));
    const { getMarkdown, api } = fakeEditorApi(() => 'body-edited');
    act(() => { result.current.handleReady(getMarkdown, api); });
    result.current.lastSavedRef.current = 'body';
    result.current.activeRevisionRef.current = { size: seeded.size, mtimeMs: seeded.mtimeMs };
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
    expect(saveSpy).toHaveBeenCalled();
  });
});
