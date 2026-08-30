import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useChatWiring, type UseChatWiringParams } from './useChatWiring';
import { FakeNoteStore } from '@/utils/test/fake-store';
import type { MilkdownEditorApi } from '@/components/MilkdownEditor';

afterEach(() => cleanup());

const tToast = (k: string) => k;

function makeRefs() {
  return {
    getMarkdownRef: { current: null as (() => string) | null },
    editorApiRef: { current: null as MilkdownEditorApi | null },
    editorReadyRef: { current: false },
    lastSavedRef: { current: '' },
  };
}

function makeParams(
  overrides: Partial<UseChatWiringParams> = {},
  refs = makeRefs(),
): UseChatWiringParams {
  const store = overrides.store ?? new FakeNoteStore();
  return {
    store,
    activeId: null,
    editingTitle: '',
    activeText: '',
    folders: [],
    getMarkdownRef: refs.getMarkdownRef,
    editorApiRef: refs.editorApiRef,
    editorReadyRef: refs.editorReadyRef,
    lastSavedRef: refs.lastSavedRef,
    doSave: vi.fn(async () => undefined),
    clearDirty: vi.fn(),
    loadNotes: vi.fn(async () => undefined),
    selectNote: vi.fn(async () => undefined),
    setActiveText: vi.fn(),
    setEditorVersion: vi.fn(),
    tToast,
    ...overrides,
  };
}

describe('useChatWiring — open/close + selection', () => {
  it('toggleChat flips chatOpen and clears mentioned selection', () => {
    const params = makeParams();
    const { result } = renderHook(() => useChatWiring(params));
    expect(result.current.chatOpen).toBe(false);
    act(() => { result.current.openChatWithSelection('quoted'); });
    expect(result.current.chatOpen).toBe(true);
    expect(result.current.chatMentionedSelection).toBe('quoted');
    act(() => { result.current.toggleChat(); });
    expect(result.current.chatOpen).toBe(false);
    expect(result.current.chatMentionedSelection).toBeNull();
  });

  it('closeChat sets chatOpen=false and clears selection', () => {
    const params = makeParams();
    const { result } = renderHook(() => useChatWiring(params));
    act(() => { result.current.openChatWithSelection('quoted'); });
    expect(result.current.chatOpen).toBe(true);
    act(() => { result.current.closeChat(); });
    expect(result.current.chatOpen).toBe(false);
    expect(result.current.chatMentionedSelection).toBeNull();
  });

  it('openChatWithSelection trims whitespace; empty string falls back to null', () => {
    const params = makeParams();
    const { result } = renderHook(() => useChatWiring(params));
    act(() => { result.current.openChatWithSelection('  hello  '); });
    expect(result.current.chatMentionedSelection).toBe('hello');
    act(() => { result.current.setChatMentionedSelection('   '); });
    expect(result.current.chatMentionedSelection).toBeNull();
  });

  it('clearChatMentionedSelection sets it to null', () => {
    const params = makeParams();
    const { result } = renderHook(() => useChatWiring(params));
    act(() => { result.current.openChatWithSelection('hello'); });
    act(() => { result.current.clearChatMentionedSelection(); });
    expect(result.current.chatMentionedSelection).toBeNull();
  });
});

describe('useChatWiring — clear-on-close + clear-on-active-change effects', () => {
  it('clears mentioned selection when chatOpen flips to false externally', () => {
    const params = makeParams();
    const { result } = renderHook(() => useChatWiring(params));
    act(() => { result.current.openChatWithSelection('hi'); });
    expect(result.current.chatMentionedSelection).toBe('hi');
    act(() => { result.current.setChatOpen(false); });
    expect(result.current.chatMentionedSelection).toBeNull();
  });

  it('clears mentioned selection when activeId changes', () => {
    const { result, rerender } = renderHook(
      ({ activeId }: { activeId: string | null }) =>
        useChatWiring(makeParams({ activeId })),
      { initialProps: { activeId: 'a.md' as string | null } },
    );
    act(() => { result.current.setChatMentionedSelection('hi'); });
    expect(result.current.chatMentionedSelection).toBe('hi');
    rerender({ activeId: 'b.md' });
    expect(result.current.chatMentionedSelection).toBeNull();
  });
});

describe('useChatWiring — getChatNoteContext', () => {
  it('reads live editor body via getMarkdownRef when set', () => {
    const refs = makeRefs();
    refs.getMarkdownRef.current = () => 'live editor body';
    const params = makeParams({
      activeId: 'a.md', editingTitle: 'Note A', activeText: 'stale',
      folders: ['work'],
    }, refs);
    const { result } = renderHook(() => useChatWiring(params));
    const ctx = result.current.getChatNoteContext();
    expect(ctx.noteId).toBe('a.md');
    expect(ctx.title).toBe('Note A');
    expect(ctx.text).toBe('live editor body');
    expect(ctx.folders).toEqual(['work']);
  });

  it('falls back to activeText when getMarkdownRef is null', () => {
    const params = makeParams({
      activeId: 'a.md', editingTitle: 'A', activeText: 'fallback body',
    });
    const { result } = renderHook(() => useChatWiring(params));
    expect(result.current.getChatNoteContext().text).toBe('fallback body');
  });

  it('falls back to activeText when getMarkdownRef throws', () => {
    const refs = makeRefs();
    refs.getMarkdownRef.current = () => { throw new Error('editor torn down'); };
    const params = makeParams({
      activeId: 'a.md', activeText: 'fallback',
    }, refs);
    const { result } = renderHook(() => useChatWiring(params));
    expect(result.current.getChatNoteContext().text).toBe('fallback');
  });

  it('selection comes from the live ref, not stale state', () => {
    const params = makeParams({ activeId: 'a.md' });
    const { result } = renderHook(() => useChatWiring(params));
    act(() => { result.current.setChatMentionedSelection('quoted'); });
    expect(result.current.getChatNoteContext().selection).toBe('quoted');
  });
});

describe('useChatWiring — clearAllChats', () => {
  it('toggles chatClearing and bumps chatResetNonce', async () => {
    const store = new FakeNoteStore();
    const clearSpy = vi.spyOn(store, 'clearAllChats').mockResolvedValue(undefined);
    const params = makeParams({ store });
    const { result } = renderHook(() => useChatWiring(params));
    expect(result.current.chatResetNonce).toBe(0);
    await act(async () => { await result.current.clearAllChats(); });
    expect(clearSpy).toHaveBeenCalled();
    expect(result.current.chatClearing).toBe(false);
    expect(result.current.chatResetNonce).toBe(1);
  });

  it('chatClearing reverts to false even when store throws', async () => {
    const store = new FakeNoteStore();
    vi.spyOn(store, 'clearAllChats').mockRejectedValue(new Error('disk'));
    const params = makeParams({ store });
    const { result } = renderHook(() => useChatWiring(params));
    await act(async () => {
      try { await result.current.clearAllChats(); } catch { /* expected */ }
    });
    expect(result.current.chatClearing).toBe(false);
  });
});

describe('useChatWiring — applyAiEdit', () => {
  it('throws when no active note', async () => {
    const params = makeParams({ activeId: null });
    const { result } = renderHook(() => useChatWiring(params));
    await expect(result.current.applyAiEdit('foo')).rejects.toThrow(/No active note/);
  });

  it('replaceMarkdown=true: skips editor remount, lastSavedRef gets live body', async () => {
    const refs = makeRefs();
    refs.editorApiRef.current = {
      getMarkdown: () => 'after-replace',
      replaceMarkdown: vi.fn(() => true),
    };
    refs.getMarkdownRef.current = () => 'after-replace';
    const doSave = vi.fn(async () => undefined);
    const setEditorVersion = vi.fn();
    const setActiveText = vi.fn();
    const params = makeParams({
      activeId: 'a.md', doSave, setEditorVersion, setActiveText,
    }, refs);
    const { result } = renderHook(() => useChatWiring(params));
    await act(async () => { await result.current.applyAiEdit('new body'); });
    expect(doSave).toHaveBeenCalledWith('a.md', 'new body', { force: true });
    expect(refs.editorApiRef.current?.replaceMarkdown).toHaveBeenCalledWith('new body', { revealChange: true });
    expect(refs.lastSavedRef.current).toBe('after-replace');
    expect(setActiveText).toHaveBeenCalledWith('new body');
    expect(setEditorVersion).not.toHaveBeenCalled();
  });

  it('replaceMarkdown=false: bumps editorVersion and clears editor refs', async () => {
    const refs = makeRefs();
    refs.editorReadyRef.current = true;
    refs.getMarkdownRef.current = () => 'old';
    refs.editorApiRef.current = {
      getMarkdown: () => 'old',
      replaceMarkdown: vi.fn(() => false),
    };
    const setEditorVersion = vi.fn();
    const params = makeParams({ activeId: 'a.md', setEditorVersion }, refs);
    const { result } = renderHook(() => useChatWiring(params));
    await act(async () => { await result.current.applyAiEdit('new body'); });
    expect(refs.lastSavedRef.current).toBe('new body');
    expect(refs.editorReadyRef.current).toBe(false);
    expect(refs.getMarkdownRef.current).toBeNull();
    expect(refs.editorApiRef.current).toBeNull();
    expect(setEditorVersion).toHaveBeenCalled();
  });
});

describe('useChatWiring — openChatAsNote + navigateToChatNote', () => {
  it('openChatAsNote refreshes notes, selects, and closes the drawer', async () => {
    const loadNotes = vi.fn(async () => undefined);
    const selectNote = vi.fn(async () => undefined);
    const params = makeParams({ loadNotes, selectNote });
    const { result } = renderHook(() => useChatWiring(params));
    act(() => { result.current.setChatOpen(true); });
    await act(async () => { await result.current.openChatAsNote('x.md'); });
    expect(loadNotes).toHaveBeenCalled();
    expect(selectNote).toHaveBeenCalledWith('x.md');
    expect(result.current.chatOpen).toBe(false);
  });

  it('navigateToChatNote skips when noteId === activeId', async () => {
    const selectNote = vi.fn(async () => undefined);
    const params = makeParams({ activeId: 'a.md', selectNote });
    const { result } = renderHook(() => useChatWiring(params));
    await act(async () => { await result.current.navigateToChatNote('a.md'); });
    expect(selectNote).not.toHaveBeenCalled();
  });

  it('navigateToChatNote calls selectNote when target differs', async () => {
    const selectNote = vi.fn(async () => undefined);
    const params = makeParams({ activeId: 'a.md', selectNote });
    const { result } = renderHook(() => useChatWiring(params));
    await act(async () => { await result.current.navigateToChatNote('b.md'); });
    expect(selectNote).toHaveBeenCalledWith('b.md');
  });
});
