import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { SetStateAction } from 'react';
import { useMetaPatchBuffer } from './useMetaPatchBuffer';
import type { NoteMeta } from '@/lib/storage';

function seedNotes(): NoteMeta[] {
  return [
    { id: 'a.md', title: 'A', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'b.md', title: 'B', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: 'c.md', title: 'C', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ];
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function makeSetter() {
  let state = seedNotes();
  const setter = vi.fn((update: SetStateAction<NoteMeta[]>) => {
    state = typeof update === 'function'
      ? (update as (prev: NoteMeta[]) => NoteMeta[])(state)
      : update;
  });
  return { setter, get state() { return state; } };
}

describe('useMetaPatchBuffer', () => {
  it('queues patches silently for non-active notes', () => {
    const { setter } = makeSetter();
    const { result } = renderHook(() => useMetaPatchBuffer('a.md', setter, 'vault-x'));
    // Mount fires an on-vault-change flush, but the buffer is empty so the
    // no-op path runs — setter stays untouched.
    expect(setter).not.toHaveBeenCalled();

    act(() => { result.current.queuePatch('b.md', { title: 'Bee' }); });
    // Non-active ids land on the debounced path, no synchronous flush.
    expect(setter).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1500); });
    expect(setter).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately when the patch targets the active note', () => {
    const notes = makeSetter();
    const { result } = renderHook(() => useMetaPatchBuffer('a.md', notes.setter, 'vault-x'));

    act(() => { result.current.queuePatch('a.md', { title: 'Apex' }); });
    // Active-id patches skip the debounce so the editor header updates
    // without waiting up to 1.5 s.
    const updated = notes.state.find(n => n.id === 'a.md');
    expect(updated?.title).toBe('Apex');
  });

  it('coalesces rapid patches into one flush', () => {
    const notes = makeSetter();
    const { result } = renderHook(() => useMetaPatchBuffer('a.md', notes.setter, 'vault-x'));
    notes.setter.mockClear();

    act(() => {
      result.current.queuePatch('b.md', { title: 'B1' });
      result.current.queuePatch('b.md', { title: 'B2' });
      result.current.queuePatch('c.md', { title: 'C1' });
    });
    expect(notes.setter).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1500); });
    // One flush for all three queued writes.
    expect(notes.setter).toHaveBeenCalledTimes(1);
    expect(notes.state.find(n => n.id === 'b.md')?.title).toBe('B2');
    expect(notes.state.find(n => n.id === 'c.md')?.title).toBe('C1');
  });

  it('flushes when the vault changes', () => {
    const notes = makeSetter();
    const { result, rerender } = renderHook(
      ({ vaultId }) => useMetaPatchBuffer('a.md', notes.setter, vaultId),
      { initialProps: { vaultId: 'vault-1' } },
    );
    act(() => { result.current.queuePatch('b.md', { title: 'Bee' }); });
    notes.setter.mockClear();

    rerender({ vaultId: 'vault-2' });
    // Vault switch must drain the buffer so stale patches from the previous
    // vault don't leak into the new one's notes array.
    expect(notes.setter).toHaveBeenCalled();
    expect(notes.state.find(n => n.id === 'b.md')?.title).toBe('Bee');
  });

  it('manual flush drains the buffer', () => {
    const notes = makeSetter();
    const { result } = renderHook(() => useMetaPatchBuffer('a.md', notes.setter, 'vault-x'));
    notes.setter.mockClear();

    act(() => { result.current.queuePatch('b.md', { title: 'Bee' }); });
    expect(notes.setter).not.toHaveBeenCalled();

    act(() => { result.current.flush(); });
    expect(notes.setter).toHaveBeenCalledTimes(1);
    expect(notes.state.find(n => n.id === 'b.md')?.title).toBe('Bee');
  });

  it('drops patches for ids that no longer exist', () => {
    const notes = makeSetter();
    const { result } = renderHook(() => useMetaPatchBuffer('a.md', notes.setter, 'vault-x'));
    notes.setter.mockClear();

    act(() => { result.current.queuePatch('deleted.md', { title: 'Gone' }); });
    act(() => { result.current.flush(); });
    // setter is still called (with the functional updater), but the
    // returned array is unchanged — meaning no spurious re-render.
    expect(notes.setter).toHaveBeenCalled();
    expect(notes.state.find(n => n.id === 'deleted.md')).toBeUndefined();
  });
});
