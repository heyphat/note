import { describe, it, expect } from 'vitest';
import { TaskIndex } from './task-index';
import type { Task } from './spec-types';

function task(overrides: Partial<Task> = {}): Task {
  return {
    title: 't',
    status: 'open',
    date_created: '2026-01-01T00:00:00Z',
    date_modified: '2026-01-01T00:00:00Z',
    _frontmatter: {},
    body: '',
    ...overrides,
  };
}

describe('TaskIndex', () => {
  it('upserts and exposes the task on byPath', () => {
    const idx = new TaskIndex();
    idx.upsert('a.md', task({ title: 'A' }));
    expect(idx.size()).toBe(1);
    expect(idx.get('a.md')?.title).toBe('A');
  });

  it('updates reverse maps on upsert and again on overwrite', () => {
    const idx = new TaskIndex();
    idx.upsert('a.md', task({ status: 'open', priority: 'high' }));
    expect(idx.byStatus('open')).toEqual(['a.md']);
    expect(idx.byPriority('high')).toEqual(['a.md']);

    idx.upsert('a.md', task({ status: 'done', priority: 'low' }));
    expect(idx.byStatus('open')).toEqual([]); // moved off
    expect(idx.byStatus('done')).toEqual(['a.md']);
    expect(idx.byPriority('high')).toEqual([]);
    expect(idx.byPriority('low')).toEqual(['a.md']);
  });

  it('removes the entry from every reverse map on remove', () => {
    const idx = new TaskIndex();
    idx.upsert('a.md', task({
      tags: ['urgent'],
      contexts: ['@work'],
      projects: ['[[Q2]]'],
      due: '2026-05-10',
      blocked_by: [{ uid: '[[t-x]]', reltype: 'FINISHTOSTART' }],
    }));
    idx.remove('a.md');
    expect(idx.byTag('urgent')).toEqual([]);
    expect(idx.byContext('@work')).toEqual([]);
    expect(idx.byProject('[[Q2]]')).toEqual([]);
    expect(idx.byDueDay('2026-05-10')).toEqual([]);
    expect(idx.blockedBy('[[t-x]]')).toEqual([]);
  });

  it('replaceAll wipes prior state', () => {
    const idx = new TaskIndex();
    idx.upsert('a.md', task({ status: 'old' }));
    idx.replaceAll([
      { path: 'b.md', task: task({ status: 'new' }) },
    ]);
    expect(idx.size()).toBe(1);
    expect(idx.get('a.md')).toBeUndefined();
    expect(idx.byStatus('old')).toEqual([]);
    expect(idx.byStatus('new')).toEqual(['b.md']);
  });

  it('id lookup returns canonical path', () => {
    const idx = new TaskIndex();
    idx.upsert('a.md', task({ id: 'x1' }));
    expect(idx.byIdLookup('x1')?.path).toBe('a.md');
  });

  it('byDueDay normalises datetime to YYYY-MM-DD', () => {
    const idx = new TaskIndex();
    idx.upsert('a.md', task({ due: '2026-05-10T18:30:00Z' }));
    expect(idx.byDueDay('2026-05-10')).toEqual(['a.md']);
  });

  it('coalesces multiple mutations into a single listener notification', async () => {
    const idx = new TaskIndex();
    let calls = 0;
    idx.subscribe(() => { calls += 1; });
    idx.upsert('a.md', task());
    idx.upsert('b.md', task());
    idx.upsert('c.md', task());
    // Listener fires asynchronously via microtask.
    await new Promise<void>(resolve => queueMicrotask(resolve));
    expect(calls).toBe(1);
  });

  it('unsubscribe stops further notifications', async () => {
    const idx = new TaskIndex();
    let calls = 0;
    const off = idx.subscribe(() => { calls += 1; });
    idx.upsert('a.md', task());
    await new Promise<void>(resolve => queueMicrotask(resolve));
    expect(calls).toBe(1);

    off();
    idx.upsert('b.md', task());
    await new Promise<void>(resolve => queueMicrotask(resolve));
    expect(calls).toBe(1);
  });
});
