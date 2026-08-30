import { describe, it, expect } from 'vitest';
import { applyRenamesToTask, rewriteWikilink, rewriteWikilinkReferences } from './rename-references';
import { InMemoryTaskStore } from './in-memory-task-store';
import { createTask } from './operations';
import { addDependency } from './dependencies';
import { parseTask } from './parse-task';
import type { Task } from './spec-types';

const config = {
  now: () => '2026-05-04T10:00:00Z',
  today: () => '2026-05-04',
};

describe('rewriteWikilink', () => {
  it('rewrites a bare wikilink', () => {
    const result = rewriteWikilink('[[Old Project]]', [{ oldTarget: 'Old Project', newTarget: 'New Project' }]);
    expect(result).toBe('[[New Project]]');
  });

  it('preserves a section anchor', () => {
    const result = rewriteWikilink('[[Old#section]]', [{ oldTarget: 'Old', newTarget: 'New' }]);
    expect(result).toBe('[[New#section]]');
  });

  it('preserves a display text', () => {
    const result = rewriteWikilink('[[Old|click me]]', [{ oldTarget: 'Old', newTarget: 'New' }]);
    expect(result).toBe('[[New|click me]]');
  });

  it('leaves bare strings alone', () => {
    expect(rewriteWikilink('Old Project', [{ oldTarget: 'Old Project', newTarget: 'New' }])).toBe('Old Project');
  });

  it('returns input unchanged when no rename applies', () => {
    expect(rewriteWikilink('[[Untouched]]', [{ oldTarget: 'Other', newTarget: 'X' }])).toBe('[[Untouched]]');
  });
});

describe('applyRenamesToTask', () => {
  it('rewrites projects and blocked_by uids', () => {
    const task: Task = {
      title: 'A',
      status: 'open',
      date_created: '2026-05-04T10:00:00Z',
      date_modified: '2026-05-04T10:00:00Z',
      projects: ['[[Q1 Launch]]', '[[Untouched]]'],
      blocked_by: [
        { uid: '[[Q1 Launch]]', reltype: 'FINISHTOSTART' },
        { uid: '[[unrelated-task]]', reltype: 'FINISHTOSTART' },
      ],
      _frontmatter: {},
      body: '',
    };
    const next = applyRenamesToTask(task, [{ oldTarget: 'Q1 Launch', newTarget: 'Q1 Re-launch' }]);
    expect(next).not.toBeNull();
    expect(next!.projects).toEqual(['[[Q1 Re-launch]]', '[[Untouched]]']);
    expect(next!.blocked_by?.[0].uid).toBe('[[Q1 Re-launch]]');
    expect(next!.blocked_by?.[1].uid).toBe('[[unrelated-task]]');
  });

  it('returns null when no field needs rewriting', () => {
    const task: Task = {
      title: 'A',
      status: 'open',
      date_created: '2026-05-04T10:00:00Z',
      date_modified: '2026-05-04T10:00:00Z',
      projects: ['[[Other]]'],
      _frontmatter: {},
      body: '',
    };
    expect(applyRenamesToTask(task, [{ oldTarget: 'X', newTarget: 'Y' }])).toBeNull();
  });
});

describe('rewriteWikilinkReferences', () => {
  it('rewrites every task in the store and reports the results', async () => {
    const store = new InMemoryTaskStore();
    const a = await createTask(store, { title: 'A', projects: ['[[Q1 Launch]]'] }, config);
    const b = await createTask(store, { title: 'B', projects: ['[[Untouched]]'] }, config);
    if (!a.ok || !b.ok) return;
    await addDependency(store, a.value.path, { uid: '[[Q1 Launch]]' }, config);

    const result = await rewriteWikilinkReferences(store, [
      { oldTarget: 'Q1 Launch', newTarget: 'Q1 Re-launch' },
    ]);
    expect(result.scanned).toBe(2);
    expect(result.rewritten).toEqual([a.value.path]);

    const aFile = await store.read(a.value.path);
    const { task: aTask } = parseTask(aFile!.raw);
    expect(aTask.projects).toEqual(['[[Q1 Re-launch]]']);
    expect(aTask.blocked_by?.[0].uid).toBe('[[Q1 Re-launch]]');

    const bFile = await store.read(b.value.path);
    const { task: bTask } = parseTask(bFile!.raw);
    expect(bTask.projects).toEqual(['[[Untouched]]']);
  });

  it('handles malformed task files gracefully', async () => {
    const store = new InMemoryTaskStore();
    store.put('broken.md', '---\nstatus: "unclosed\n---\n');
    const result = await rewriteWikilinkReferences(store, [{ oldTarget: 'X', newTarget: 'Y' }]);
    expect(result.scanned).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.rewritten).toEqual([]);
  });

  it('is a no-op when renames is empty', async () => {
    const store = new InMemoryTaskStore();
    await createTask(store, { title: 'A', projects: ['[[X]]'] }, config);
    const result = await rewriteWikilinkReferences(store, []);
    expect(result.scanned).toBe(0);
  });
});
