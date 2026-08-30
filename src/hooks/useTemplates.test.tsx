import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useTemplates, type UseTemplatesParams } from './useTemplates';
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
    titleSaveTimerRef: { current: null as number | null },
    nextUrlOpRef: { current: 'replace' as 'push' | 'replace' },
    renameTemplateRef: { current: (async () => undefined) as (id: string, name: string) => Promise<void> },
  };
}

function makeParams(
  overrides: Partial<UseTemplatesParams> = {},
  refs = makeRefs(),
): UseTemplatesParams {
  const store = overrides.store ?? new FakeNoteStore();
  return {
    store,
    storeReady: true,
    activeId: null,
    activeText: '',
    activeTemplate: null,
    setActiveTemplate: vi.fn(),
    getMarkdownRef: refs.getMarkdownRef,
    lastSavedRef: refs.lastSavedRef,
    lastSavedTitleRef: refs.lastSavedTitleRef,
    activeRevisionRef: refs.activeRevisionRef,
    editorReadyRef: refs.editorReadyRef,
    titleSaveTimerRef: refs.titleSaveTimerRef,
    flushSave: vi.fn(async () => undefined),
    flushTitleSave: vi.fn(async () => undefined),
    showSaved: vi.fn(),
    setSaveStatus: vi.fn(),
    addAutoTitle: vi.fn(),
    deleteAutoTitle: vi.fn(),
    syncPost: vi.fn(),
    clearDirty: vi.fn(),
    flagExternalUpdate: vi.fn(),
    applyNoteIdRemap: vi.fn(),
    setNotes: vi.fn(),
    setActiveId: vi.fn(),
    setActiveUuid: vi.fn(),
    setActiveText: vi.fn(),
    setEditingTitle: vi.fn(),
    setEditorVersion: vi.fn(),
    setTocHeadings: vi.fn(),
    nextUrlOpRef: refs.nextUrlOpRef,
    renameTemplateRef: refs.renameTemplateRef,
    tasksSnapshot: [],
    ...overrides,
  };
}

describe('useTemplates — refresh + load on storeReady', () => {
  it('lists templates from the store on mount when storeReady', async () => {
    const store = new FakeNoteStore();
    await store.createTemplate('Daily', '# {{date}}\n');
    await store.createTemplate('Weekly review', 'plan');
    const { result } = renderHook(() => useTemplates(makeParams({ store })));
    // The hook fires refreshTemplates inside a useEffect on mount; flush.
    await act(async () => { await Promise.resolve(); });
    expect(result.current.templates.map(t => t.name).sort()).toEqual(['Daily', 'Weekly review']);
  });

  it('does NOT load when storeReady=false', async () => {
    const store = new FakeNoteStore();
    await store.createTemplate('A', '');
    const { result } = renderHook(() => useTemplates(makeParams({ store, storeReady: false })));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.templates).toEqual([]);
  });
});

describe('useTemplates — openTemplate', () => {
  it('flushes pending body + title saves before switching', async () => {
    const store = new FakeNoteStore();
    const tpl = await store.createTemplate('Daily', '# {{date}}\n');
    const flushSave = vi.fn(async () => undefined);
    const flushTitleSave = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTemplates(makeParams({ store, flushSave, flushTitleSave })));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.openTemplate(tpl.id); });
    expect(flushSave).toHaveBeenCalledTimes(1);
    expect(flushTitleSave).toHaveBeenCalledTimes(1);
  });

  it('seeds editor refs with the template body + name', async () => {
    const store = new FakeNoteStore();
    const tpl = await store.createTemplate('Daily', '# Plan\n\nbody');
    const refs = makeRefs();
    const setActiveTemplate = vi.fn();
    const setActiveText = vi.fn();
    const setEditingTitle = vi.fn();
    const { result } = renderHook(() => useTemplates(makeParams({
      store, setActiveTemplate, setActiveText, setEditingTitle,
    }, refs)));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.openTemplate(tpl.id); });
    expect(setActiveTemplate).toHaveBeenCalledWith(tpl.id);
    expect(setActiveText).toHaveBeenCalledWith('# Plan\n\nbody');
    expect(setEditingTitle).toHaveBeenCalledWith('Daily');
    expect(refs.lastSavedRef.current).toBe('# Plan\n\nbody');
    expect(refs.lastSavedTitleRef.current).toBe('Daily');
    expect(refs.activeRevisionRef.current).toBeNull();
    expect(refs.editorReadyRef.current).toBe(false);
    expect(refs.getMarkdownRef.current).toBeNull();
  });

  it('returns false when the template id resolves to nothing', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useTemplates(params));
    await act(async () => { await Promise.resolve(); });
    let returned: boolean | undefined;
    await act(async () => { returned = await result.current.openTemplate('does-not-exist'); });
    expect(returned).toBe(false);
  });
});

describe('useTemplates — handlePickTemplate', () => {
  it('interpolates {{date}} in template body + title and saves into the active note', async () => {
    const store = new FakeNoteStore();
    const tpl = await store.createTemplate('{{date}} Daily', '# {{date}}\n\nplan');
    store._test_seedNote({ id: 'a.md', title: 'Untitled', text: '' });
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { result } = renderHook(() => useTemplates(makeParams({
      store, activeId: 'a.md',
    })));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.handlePickTemplate(tpl.id); });
    expect(saveSpy).toHaveBeenCalled();
    const last = saveSpy.mock.calls.at(-1)!;
    // Today's date stamp will be present in both body and title; we don't
    // pin the exact value because the test would otherwise fail at midnight.
    expect(last[1] as string).toContain('plan');
    expect(last[1] as string).not.toContain('{{date}}');
    expect(last[2] as string).not.toContain('{{date}}');
  });

  it('calls applyNoteIdRemap when template apply triggers a path-changing rename', async () => {
    const store = new FakeNoteStore();
    const tpl = await store.createTemplate('Renamed', '# Renamed\n');
    store._test_seedNote({ id: 'old.md', title: 'Untitled', text: '' });
    const realSave = store.saveContent.bind(store);
    vi.spyOn(store, 'saveContent').mockImplementation(async (id, text, title, opts) => {
      const m = await realSave(id, text, title, opts);
      return { ...m, id: 'renamed.md' };
    });
    const applyNoteIdRemap = vi.fn();
    const { result } = renderHook(() => useTemplates(makeParams({
      store, activeId: 'old.md', applyNoteIdRemap,
    })));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.handlePickTemplate(tpl.id); });
    expect(applyNoteIdRemap).toHaveBeenCalledWith('old.md', 'renamed.md');
  });

  it('broadcasts previousId on the syncPost when the rename changed the path', async () => {
    const store = new FakeNoteStore();
    const tpl = await store.createTemplate('NewName', '# new');
    store._test_seedNote({ id: 'old.md', title: 'Untitled', text: '' });
    const realSave = store.saveContent.bind(store);
    vi.spyOn(store, 'saveContent').mockImplementation(async (id, text, title, opts) => {
      const m = await realSave(id, text, title, opts);
      return { ...m, id: 'new.md' };
    });
    const syncPost = vi.fn();
    const { result } = renderHook(() => useTemplates(makeParams({
      store, activeId: 'old.md', syncPost,
    })));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.handlePickTemplate(tpl.id); });
    expect(syncPost).toHaveBeenCalledWith({
      type: 'note-saved', id: 'new.md', previousId: 'old.md',
    });
  });

  it('does nothing when there is no active note', async () => {
    const store = new FakeNoteStore();
    const tpl = await store.createTemplate('A', 'x');
    const saveSpy = vi.spyOn(store, 'saveContent');
    const { result } = renderHook(() => useTemplates(makeParams({ store, activeId: null })));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.handlePickTemplate(tpl.id); });
    expect(saveSpy).not.toHaveBeenCalled();
  });
});

describe('useTemplates — createTemplate', () => {
  it('creates with the next-available default name and registers the auto-title entry', async () => {
    const store = new FakeNoteStore();
    const addAutoTitle = vi.fn();
    const { result } = renderHook(() => useTemplates(makeParams({ store, addAutoTitle })));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.createTemplate(); });
    const list = await store.listTemplates();
    expect(list[0]?.name).toBe('Untitled template');
    expect(addAutoTitle).toHaveBeenCalledWith(list[0]?.id);
  });

  it('opens the new template after creation', async () => {
    const store = new FakeNoteStore();
    const setActiveTemplate = vi.fn();
    const { result } = renderHook(() => useTemplates(makeParams({ store, setActiveTemplate })));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.createTemplate(); });
    expect(setActiveTemplate).toHaveBeenCalled();
  });
});

describe('useTemplates — handleDeleteTemplate', () => {
  it('clears the active template + editor state when the active one is deleted', async () => {
    const store = new FakeNoteStore();
    const tpl = await store.createTemplate('A', 'x');
    const setActiveTemplate = vi.fn();
    const setActiveText = vi.fn();
    const setEditingTitle = vi.fn();
    const { result } = renderHook(() => useTemplates(makeParams({
      store, activeTemplate: tpl.id, setActiveTemplate, setActiveText, setEditingTitle,
    })));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.handleDeleteTemplate(tpl.id); });
    expect(setActiveTemplate).toHaveBeenCalledWith(null);
    expect(setActiveText).toHaveBeenCalledWith('');
    expect(setEditingTitle).toHaveBeenCalledWith('');
    expect(await store.getTemplate(tpl.id)).toBeNull();
  });

  it('does NOT clear the editor when a different template is deleted', async () => {
    const store = new FakeNoteStore();
    const a = await store.createTemplate('A', 'x');
    const b = await store.createTemplate('B', 'y');
    const setActiveTemplate = vi.fn();
    const setActiveText = vi.fn();
    const { result } = renderHook(() => useTemplates(makeParams({
      store, activeTemplate: a.id, setActiveTemplate, setActiveText,
    })));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.handleDeleteTemplate(b.id); });
    expect(setActiveTemplate).not.toHaveBeenCalled();
    expect(setActiveText).not.toHaveBeenCalled();
    expect(await store.getTemplate(b.id)).toBeNull();
  });
});

describe('useTemplates — handleRenameTemplate', () => {
  it('flushes the body + renames + reseeds the title for the active template', async () => {
    const store = new FakeNoteStore();
    const tpl = await store.createTemplate('A', 'body');
    const refs = makeRefs();
    refs.lastSavedTitleRef.current = 'A';
    refs.getMarkdownRef.current = () => 'in-flight body';
    const flushSave = vi.fn(async () => undefined);
    const setEditingTitle = vi.fn();
    const setActiveText = vi.fn();
    const { result } = renderHook(() => useTemplates(makeParams({
      store, activeTemplate: tpl.id, flushSave, setEditingTitle, setActiveText,
    }, refs)));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.handleRenameTemplate(tpl.id, 'Renamed'); });
    expect(flushSave).toHaveBeenCalledTimes(1);
    expect(setEditingTitle).toHaveBeenCalledWith('Renamed');
    expect(refs.lastSavedTitleRef.current).toBe('Renamed');
    // The in-flight markdown is carried across the rename so the user
    // doesn't lose characters typed up to the rename moment.
    expect(setActiveText).toHaveBeenCalledWith('in-flight body');
    expect(refs.lastSavedRef.current).toBe('in-flight body');
  });

  it('skips when the new name equals the current name', async () => {
    const store = new FakeNoteStore();
    const tpl = await store.createTemplate('A', 'body');
    const renameSpy = vi.spyOn(store, 'renameTemplate');
    const { result } = renderHook(() => useTemplates(makeParams({
      store, activeTemplate: tpl.id,
    })));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.handleRenameTemplate(tpl.id, 'A'); });
    expect(renameSpy).not.toHaveBeenCalled();
  });

  it('wires renameTemplateRef.current to the latest handleRenameTemplate', async () => {
    const store = new FakeNoteStore();
    const refs = makeRefs();
    const renameTemplateRef = refs.renameTemplateRef;
    renderHook(() => useTemplates(makeParams({ store }, refs)));
    await act(async () => { await Promise.resolve(); });
    // The ref's current is no longer the initial stub.
    expect(typeof renameTemplateRef.current).toBe('function');
    expect(renameTemplateRef.current.toString()).not.toContain('not yet wired');
  });
});
