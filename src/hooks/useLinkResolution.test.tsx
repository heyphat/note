import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useLinkResolution } from './useLinkResolution';
import { LinkIndex } from '@/lib/links/link-index';
import type { NoteMeta } from '@/lib/storage';

afterEach(() => cleanup());

function makeNote(id: string, title: string): NoteMeta {
  return {
    id, title,
    size: title.length, mtimeMs: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

describe('useLinkResolution — notesById', () => {
  it('builds a Map keyed by note id', () => {
    const notes = [makeNote('a.md', 'Alpha'), makeNote('b.md', 'Bravo')];
    const { result } = renderHook(() => useLinkResolution({
      notes, activeId: null, linkIndex: null, linksVersion: 0,
    }));
    expect(result.current.notesById.get('a.md')?.title).toBe('Alpha');
    expect(result.current.notesById.get('b.md')?.title).toBe('Bravo');
    expect(result.current.notesById.size).toBe(2);
  });

  it('rebuilds only on notes change (identity check)', () => {
    const initialNotes = [makeNote('a.md', 'A')];
    const { result, rerender } = renderHook(
      ({ notes, activeId }: { notes: NoteMeta[]; activeId: string | null }) =>
        useLinkResolution({ notes, activeId, linkIndex: null, linksVersion: 0 }),
      { initialProps: { notes: initialNotes, activeId: null as string | null } },
    );
    const firstMap = result.current.notesById;
    rerender({ notes: initialNotes, activeId: 'a.md' });
    expect(result.current.notesById).toBe(firstMap);
    rerender({ notes: [makeNote('a.md', 'A'), makeNote('b.md', 'B')], activeId: 'a.md' });
    expect(result.current.notesById).not.toBe(firstMap);
  });
});

describe('useLinkResolution — linkResolverRef', () => {
  it('points at the latest linkResolver after notes change', () => {
    const notes1 = [makeNote('a.md', 'Alpha')];
    const notes2 = [makeNote('a.md', 'Alpha'), makeNote('b.md', 'Bravo')];
    const { result, rerender } = renderHook(
      ({ notes }: { notes: NoteMeta[] }) =>
        useLinkResolution({ notes, activeId: null, linkIndex: null, linksVersion: 0 }),
      { initialProps: { notes: notes1 } },
    );
    expect(result.current.isKnownLinkTarget('Alpha')).toBe(true);
    expect(result.current.isKnownLinkTarget('Bravo')).toBe(false);
    rerender({ notes: notes2 });
    expect(result.current.isKnownLinkTarget('Bravo')).toBe(true);
  });
});

describe('useLinkResolution — getWikilinkCandidates', () => {
  const notes = [
    makeNote('a.md', 'Alpha'),
    makeNote('beta.md', 'Beta thoughts'),
    makeNote('charlie.md', 'Charlie'),
    makeNote('untitled.md', ''),
  ];

  it('ranks exact > prefix > contains > id-contains', () => {
    const { result } = renderHook(() => useLinkResolution({
      notes, activeId: null, linkIndex: null, linksVersion: 0,
    }));
    const exact = result.current.getWikilinkCandidates('alpha');
    expect(exact[0].title).toBe('Alpha');
    const prefix = result.current.getWikilinkCandidates('beta');
    expect(prefix[0].title).toBe('Beta thoughts');
    const idMatch = result.current.getWikilinkCandidates('charlie');
    expect(idMatch.find(c => c.id === 'charlie.md')).toBeDefined();
  });

  it('skips notes with no title', () => {
    const { result } = renderHook(() => useLinkResolution({
      notes, activeId: null, linkIndex: null, linksVersion: 0,
    }));
    const all = result.current.getWikilinkCandidates('');
    expect(all.find(c => c.id === 'untitled.md')).toBeUndefined();
  });

  it('caps results at 20', () => {
    const many = Array.from({ length: 50 }, (_, i) => makeNote(`n${i}.md`, `Note ${i}`));
    const { result } = renderHook(() => useLinkResolution({
      notes: many, activeId: null, linkIndex: null, linksVersion: 0,
    }));
    expect(result.current.getWikilinkCandidates('').length).toBe(20);
  });

  it('returns empty array when query has no matches and notes have titles', () => {
    const { result } = renderHook(() => useLinkResolution({
      notes, activeId: null, linkIndex: null, linksVersion: 0,
    }));
    expect(result.current.getWikilinkCandidates('zzzzz')).toEqual([]);
  });
});

describe('useLinkResolution — backlinksCount', () => {
  it('returns 0 when linkIndex is null', () => {
    const { result } = renderHook(() => useLinkResolution({
      notes: [makeNote('a.md', 'A')], activeId: 'a.md', linkIndex: null, linksVersion: 0,
    }));
    expect(result.current.backlinksCount).toBe(0);
  });

  it('returns 0 when activeId is null', () => {
    const linkIndex = new LinkIndex();
    const { result } = renderHook(() => useLinkResolution({
      notes: [makeNote('a.md', 'A')], activeId: null, linkIndex, linksVersion: 0,
    }));
    expect(result.current.backlinksCount).toBe(0);
  });

  it('collapses dupes between title-based and id-based backlinks by sourceId', () => {
    const linkIndex = new LinkIndex();
    // The same source 'b.md' references the active note BOTH by title and
    // by id — backlinks count should still be 1.
    linkIndex.update('b.md', 'see [[A]] or [[a.md]] for context');
    const { result } = renderHook(() => useLinkResolution({
      notes: [makeNote('a.md', 'A'), makeNote('b.md', 'B')],
      activeId: 'a.md', linkIndex, linksVersion: 1,
    }));
    expect(result.current.backlinksCount).toBe(1);
  });

  it('counts distinct sources', () => {
    const linkIndex = new LinkIndex();
    linkIndex.update('b.md', 'see [[A]]');
    linkIndex.update('c.md', 'also [[A]]');
    const { result } = renderHook(() => useLinkResolution({
      notes: [makeNote('a.md', 'A'), makeNote('b.md', 'B'), makeNote('c.md', 'C')],
      activeId: 'a.md', linkIndex, linksVersion: 1,
    }));
    expect(result.current.backlinksCount).toBe(2);
  });
});
