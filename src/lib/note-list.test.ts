import { describe, expect, it } from 'vitest';
import { mergeListedNotes, patchListedNote } from './note-list';
import type { NoteMeta } from '@/lib/storage';

function seedNotes(): NoteMeta[] {
  return [
    {
      id: 'a.md',
      title: 'Real title',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      size: 10,
      mtimeMs: 100,
    },
    {
      id: 'b.md',
      title: 'Second title',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      size: 20,
      mtimeMs: 200,
    },
  ];
}

describe('note-list helpers', () => {
  it('preserves refined titles when a filesystem walk refreshes the list', () => {
    const merged = mergeListedNotes(seedNotes(), [
      {
        id: 'a.md',
        title: 'a',
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
        size: 30,
        mtimeMs: 300,
      },
      {
        id: 'b.md',
        title: 'b',
        createdAt: '2026-04-24T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
        size: 40,
        mtimeMs: 400,
      },
    ]);
    expect(merged.map(note => note.title)).toEqual(['Real title', 'Second title']);
    expect(merged.map(note => note.mtimeMs)).toEqual([300, 400]);
  });

  it('hydrates a changed note with freshly-read title metadata', () => {
    const patched = patchListedNote(seedNotes(), {
      id: 'a.md',
      title: 'Renamed elsewhere',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-04-24T11:44:15.000Z',
      size: 55,
      mtimeMs: 555,
    });
    expect(patched.find(note => note.id === 'a.md')).toMatchObject({
      title: 'Renamed elsewhere',
      updatedAt: '2026-04-24T11:44:15.000Z',
      size: 55,
      mtimeMs: 555,
    });
  });
});
