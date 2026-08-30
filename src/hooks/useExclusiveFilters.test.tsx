import { describe, it, expect, afterEach } from 'vitest';
import { useState } from 'react';
import { renderHook, cleanup, act } from '@testing-library/react';
import { useExclusiveFilters } from './useExclusiveFilters';
import type { TagCount } from '@/lib/search/types';

afterEach(() => cleanup());

/** Harness that owns the three filter pieces of state and forwards them
 *  through the hook. Tests drive state changes via the returned setters
 *  and read live state via the returned getters. */
function useFilterHarness(opts: { indexTags?: TagCount[]; hiddenTags?: Set<string>; notesLength?: number } = {}) {
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [activeSavedSearchId, setActiveSavedSearchIdState] = useState<string | null>(null);
  const setActiveSavedSearchId = (id: string | null) => setActiveSavedSearchIdState(id);
  const [activeDateFilter, setActiveDateFilter] = useState<string | null>(null);
  useExclusiveFilters({
    activeTagFilter, setActiveTagFilter,
    activeSavedSearchId, setActiveSavedSearchId,
    activeDateFilter, setActiveDateFilter,
    indexTags: opts.indexTags ?? [],
    hiddenTags: opts.hiddenTags ?? new Set(),
    notesLength: opts.notesLength ?? 0,
  });
  return {
    activeTagFilter, setActiveTagFilter,
    activeSavedSearchId, setActiveSavedSearchId: setActiveSavedSearchIdState,
    activeDateFilter, setActiveDateFilter,
  };
}

describe('useExclusiveFilters — pairwise exclusivity', () => {
  // The drop-stale-tag effect would otherwise clear `foo` since indexTags
  // is empty by default. Seed it so the exclusivity rules are testable in
  // isolation.
  const opts = { indexTags: [{ tag: 'foo', count: 1 }] as TagCount[], notesLength: 1 };

  it('activating saved-search clears tag', () => {
    const { result } = renderHook(() => useFilterHarness(opts));
    act(() => { result.current.setActiveTagFilter('foo'); });
    expect(result.current.activeTagFilter).toBe('foo');
    act(() => { result.current.setActiveSavedSearchId('s1'); });
    expect(result.current.activeTagFilter).toBeNull();
    expect(result.current.activeSavedSearchId).toBe('s1');
  });

  it('activating tag clears saved-search', () => {
    const { result } = renderHook(() => useFilterHarness(opts));
    act(() => { result.current.setActiveSavedSearchId('s1'); });
    act(() => { result.current.setActiveTagFilter('foo'); });
    expect(result.current.activeSavedSearchId).toBeNull();
    expect(result.current.activeTagFilter).toBe('foo');
  });

  it('activating date clears tag and saved-search', () => {
    const { result } = renderHook(() => useFilterHarness(opts));
    act(() => { result.current.setActiveTagFilter('foo'); });
    act(() => { result.current.setActiveSavedSearchId('s1'); });
    act(() => { result.current.setActiveDateFilter('2024-01-01'); });
    expect(result.current.activeTagFilter).toBeNull();
    expect(result.current.activeSavedSearchId).toBeNull();
    expect(result.current.activeDateFilter).toBe('2024-01-01');
  });

  it('activating tag while date is active clears date', () => {
    const { result } = renderHook(() => useFilterHarness(opts));
    act(() => { result.current.setActiveDateFilter('2024-01-01'); });
    act(() => { result.current.setActiveTagFilter('foo'); });
    expect(result.current.activeDateFilter).toBeNull();
    expect(result.current.activeTagFilter).toBe('foo');
  });
});

describe('useExclusiveFilters — drop-stale-tag cleanup', () => {
  it('clears tag filter when user hides the tag', () => {
    const { result, rerender } = renderHook(
      ({ hiddenTags }: { hiddenTags: Set<string> }) =>
        useFilterHarness({
          indexTags: [{ tag: 'foo', count: 1 }],
          hiddenTags,
          notesLength: 1,
        }),
      { initialProps: { hiddenTags: new Set<string>() } },
    );
    act(() => { result.current.setActiveTagFilter('foo'); });
    expect(result.current.activeTagFilter).toBe('foo');
    rerender({ hiddenTags: new Set(['foo']) });
    expect(result.current.activeTagFilter).toBeNull();
  });

  it('clears tag filter when the tag disappears from the index', () => {
    const { result, rerender } = renderHook(
      ({ indexTags }: { indexTags: TagCount[] }) =>
        useFilterHarness({ indexTags, notesLength: 1 }),
      { initialProps: { indexTags: [{ tag: 'foo', count: 1 }] as TagCount[] } },
    );
    act(() => { result.current.setActiveTagFilter('foo'); });
    expect(result.current.activeTagFilter).toBe('foo');
    rerender({ indexTags: [{ tag: 'bar', count: 1 }] });
    expect(result.current.activeTagFilter).toBeNull();
  });

  it('does NOT clear when index is unprimed (empty indexTags but notes exist)', () => {
    const { result } = renderHook(() => useFilterHarness({
      indexTags: [],
      notesLength: 5,
    }));
    act(() => { result.current.setActiveTagFilter('foo'); });
    expect(result.current.activeTagFilter).toBe('foo');
  });

  it('does NOT clear when tag still exists in index', () => {
    const { result } = renderHook(() => useFilterHarness({
      indexTags: [{ tag: 'foo', count: 1 }],
      notesLength: 1,
    }));
    act(() => { result.current.setActiveTagFilter('foo'); });
    expect(result.current.activeTagFilter).toBe('foo');
  });
});
