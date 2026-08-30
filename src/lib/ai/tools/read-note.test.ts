import { describe, it, expect, vi } from 'vitest';
import { buildReadNoteExecutor } from './read-note';
import type { NoteFull, NoteStore } from '@/lib/storage';

function makeNote(overrides: Partial<NoteFull> = {}): NoteFull {
  return {
    id: 'a.md',
    title: 'A',
    text: '# A\n\nbody',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function fakeStore(get: (id: string) => Promise<NoteFull | null>): NoteStore {
  return { get } as unknown as NoteStore;
}

describe('buildReadNoteExecutor', () => {
  it('returns full bodies for the requested paths', async () => {
    const get = vi.fn<(id: string) => Promise<NoteFull | null>>(async (id) => {
      if (id === 'one.md') return makeNote({ id: 'one.md', title: 'One', text: 'one body' });
      if (id === 'two.md') return makeNote({ id: 'two.md', title: 'Two', text: 'two body' });
      return null;
    });
    const exec = buildReadNoteExecutor({ store: fakeStore(get) });
    const parsed = JSON.parse(await exec('read_note', { paths: ['one.md', 'two.md'] }));
    expect(parsed.hits).toHaveLength(2);
    expect(parsed.hits[0]).toMatchObject({ path: 'one.md', title: 'One', body: 'one body', truncated: false });
    expect(parsed.hits[1]).toMatchObject({ path: 'two.md', title: 'Two', body: 'two body', truncated: false });
    expect(parsed.errors).toEqual([]);
  });

  it('reports an error entry for paths that do not resolve', async () => {
    const get = vi.fn(async (id: string) => (id === 'real.md' ? makeNote({ id: 'real.md' }) : null));
    const exec = buildReadNoteExecutor({ store: fakeStore(get) });
    const parsed = JSON.parse(await exec('read_note', { paths: ['real.md', 'missing.md'] }));
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.errors).toEqual([{ path: 'missing.md', message: 'Note not found at this path.' }]);
  });

  it('truncates bodies past the per-note cap and flags truncated', async () => {
    const huge = 'x'.repeat(10_000);
    const get = vi.fn(async () => makeNote({ text: huge }));
    const exec = buildReadNoteExecutor({ store: fakeStore(get) });
    const parsed = JSON.parse(await exec('read_note', { paths: ['a.md'] }));
    expect(parsed.hits[0].body.length).toBe(8_000);
    expect(parsed.hits[0].truncated).toBe(true);
  });

  it('caps total chars across hits so a single call cannot blow the budget', async () => {
    const big = 'y'.repeat(8_000);
    const get = vi.fn(async (id: string) => makeNote({ id, title: id, text: big }));
    const exec = buildReadNoteExecutor({ store: fakeStore(get) });
    const parsed = JSON.parse(await exec('read_note', {
      paths: ['a.md', 'b.md', 'c.md', 'd.md'],
    }));
    const totalBodyChars = parsed.hits.reduce((sum: number, h: { body: string }) => sum + h.body.length, 0);
    expect(totalBodyChars).toBeLessThanOrEqual(24_000);
    // Final paths beyond the budget surface as errors so the model can retry.
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('caps to 5 paths and dedupes via normalize', async () => {
    const get = vi.fn(async (id: string) => makeNote({ id }));
    const exec = buildReadNoteExecutor({ store: fakeStore(get) });
    const parsed = JSON.parse(await exec('read_note', {
      paths: ['a.md', 'a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md'],
    }));
    expect(parsed.hits.map((h: { path: string }) => h.path)).toEqual(['a.md', 'b.md', 'c.md', 'd.md', 'e.md']);
  });

  it('returns a structured error for an unusable input rather than throwing', async () => {
    const get = vi.fn(async () => null);
    const exec = buildReadNoteExecutor({ store: fakeStore(get) });
    const parsed = JSON.parse(await exec('read_note', { paths: [] }));
    expect(parsed.hits).toEqual([]);
    expect(parsed.errors[0].message).toMatch(/non-empty array/);
    expect(get).not.toHaveBeenCalled();
  });

  it('throws on the wrong tool name so the dispatcher logs the misuse', async () => {
    const exec = buildReadNoteExecutor({ store: fakeStore(async () => null) });
    await expect(exec('search_vault', { paths: ['a.md'] })).rejects.toThrow(/Unsupported/i);
  });

  it('blocks hidden directories so chat threads + task files cannot leak', async () => {
    const get = vi.fn(async (id: string) => makeNote({ id }));
    const exec = buildReadNoteExecutor({ store: fakeStore(get) });
    const parsed = JSON.parse(await exec('read_note', {
      paths: [
        '.assets/chats/abc.md',
        '.assets/tasks/x.md',
        '.git/HEAD.md',
        'good.md',
      ],
    }));
    expect(parsed.hits.map((h: { path: string }) => h.path)).toEqual(['good.md']);
    expect(parsed.errors).toHaveLength(3);
    for (const err of parsed.errors) {
      expect(err.message).toMatch(/Hidden directories/);
    }
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith('good.md');
  });

  it('blocks asset folders and non-md files so binaries cannot be slurped', async () => {
    const get = vi.fn(async (id: string) => makeNote({ id }));
    const exec = buildReadNoteExecutor({ store: fakeStore(get) });
    const parsed = JSON.parse(await exec('read_note', {
      paths: ['note.assets/image.png', 'note.assets/pic.md', 'docs/notes.txt', 'real.md'],
    }));
    expect(parsed.hits.map((h: { path: string }) => h.path)).toEqual(['real.md']);
    expect(parsed.errors).toHaveLength(3);
    expect(get).toHaveBeenCalledOnce();
  });

  it('blocks `..` segments as defense in depth', async () => {
    const get = vi.fn(async () => null);
    const exec = buildReadNoteExecutor({ store: fakeStore(get) });
    const parsed = JSON.parse(await exec('read_note', {
      paths: ['../escape.md', 'foo/../bar.md'],
    }));
    expect(parsed.hits).toEqual([]);
    expect(parsed.errors).toHaveLength(2);
    expect(get).not.toHaveBeenCalled();
  });
});
