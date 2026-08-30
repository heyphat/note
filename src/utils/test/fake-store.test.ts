import { describe, it, expect } from 'vitest';
import { FakeNoteStore } from './fake-store';
import { isNoteConflictError } from '@/lib/storage/types';

describe('FakeNoteStore', () => {
  it('initializes with the given vault id and label', async () => {
    const store = new FakeNoteStore({ vaultId: 'v1', label: 'My Vault' });
    const status = await store.initialize();
    expect(status).toEqual({ ready: true, label: 'My Vault', vaultId: 'v1' });
  });

  it('reports needsPicker when not ready', async () => {
    const store = new FakeNoteStore({ ready: false, needsPicker: true, label: 'gone' });
    const status = await store.initialize();
    expect(status.ready).toBe(false);
    expect(status.needsPicker).toBe(true);
  });

  it('creates notes inside folders and surfaces them in list()', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Hello', 'body', 'projects/trading');
    expect(meta.id).toMatch(/^projects\/trading\/id-\d{4}\.md$/);
    const listing = await store.list();
    expect(listing.notes).toHaveLength(1);
    expect(listing.notes[0]!.title).toBe('Hello');
    expect(listing.folders).toEqual(['projects', 'projects/trading']);
  });

  it('round-trips body via saveContent + get', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('Hi', 'first');
    await store.saveContent(meta.id, 'second');
    const fresh = await store.get(meta.id);
    expect(fresh?.text).toBe('second');
    expect(fresh?.size).toBe('second'.length);
  });

  it('throws NoteConflictError when expected revision mismatches', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('A', 'one');
    await store.saveContent(meta.id, 'two');
    let err: unknown;
    try {
      await store.saveContent(meta.id, 'three', undefined, {
        expected: { size: meta.size!, mtimeMs: meta.mtimeMs! },
      });
    } catch (e) { err = e; }
    expect(isNoteConflictError(err)).toBe(true);
  });

  it('snapshots history on each saveContent', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('A', 'v1');
    await store.saveContent(meta.id, 'v2');
    await store.saveContent(meta.id, 'v3');
    const history = await store.listHistory(meta.id);
    expect(history).toHaveLength(2);
  });

  it('move(note) updates id and preserves history', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('A', 'body', 'a');
    await store.saveContent(meta.id, 'next');
    const newId = await store.move(meta.id, 'b');
    expect(newId).toMatch(/^b\/id-\d{4}\.md$/);
    expect(await store.get(meta.id)).toBeNull();
    expect((await store.get(newId))?.text).toBe('next');
    expect(await store.listHistory(newId)).toHaveLength(1);
  });

  it('move(folder) remaps every descendant note', async () => {
    const store = new FakeNoteStore();
    await store.createFolder('src/feature');
    const a = await store.create('A', 'x', 'src/feature');
    const b = await store.create('B', 'y', 'src/feature/inner');
    const newFolder = await store.move('src/feature', 'dest');
    expect(newFolder).toBe('dest/feature');
    expect(await store.get(a.id)).toBeNull();
    expect(await store.get(b.id)).toBeNull();
    const listing = await store.list();
    const ids = listing.notes.map(n => n.id);
    expect(ids.some(id => id.startsWith('dest/feature/'))).toBe(true);
    expect(ids.some(id => id.startsWith('dest/feature/inner/'))).toBe(true);
  });

  it('renameFolder rewrites the folder name in place', async () => {
    const store = new FakeNoteStore();
    const note = await store.create('A', 'body', 'old');
    const newPath = await store.renameFolder('old', 'new');
    expect(newPath).toBe('new');
    const listing = await store.list();
    expect(listing.folders).toContain('new');
    expect(listing.folders).not.toContain('old');
    expect(await store.get(note.id)).toBeNull();
    expect(listing.notes[0]!.id).toMatch(/^new\/id-\d{4}\.md$/);
  });

  it('templates: create / get / rename / delete', async () => {
    const store = new FakeNoteStore();
    const t = await store.createTemplate('daily', '# {{date}}');
    expect((await store.getTemplate(t.id))?.content).toBe('# {{date}}');
    await store.saveTemplate(t.id, '# {{date}}\n\nplan');
    const renamed = await store.renameTemplate(t.id, 'weekly');
    expect(renamed.name).toBe('weekly');
    expect(await store.getTemplate('daily')).toBeNull();
    expect((await store.getTemplate('weekly'))?.content).toBe('# {{date}}\n\nplan');
    await store.deleteTemplate('weekly');
    expect(await store.listTemplates()).toEqual([]);
  });

  it('_test_simulateConflictOnNext throws on next saveContent', async () => {
    const store = new FakeNoteStore();
    const meta = await store.create('A', 'one');
    store._test_simulateConflictOnNext(meta.id);
    let err: unknown;
    try {
      await store.saveContent(meta.id, 'two');
    } catch (e) { err = e; }
    expect(isNoteConflictError(err)).toBe(true);
    // Subsequent save succeeds.
    const next = await store.saveContent(meta.id, 'three');
    expect(next.size).toBe('three'.length);
  });

  it('_test_failNext injects a single error on the named method', async () => {
    const store = new FakeNoteStore();
    store._test_failNext('list', new Error('disk gone'));
    await expect(store.list()).rejects.toThrow('disk gone');
    // Cleared after one trip.
    await expect(store.list()).resolves.toBeTruthy();
  });
});
