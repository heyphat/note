import { describe, it, expect } from 'vitest';
import { buildSearchTasksExecutor } from './search-tasks';
import type { Task } from '../../tasks/spec-types';
import type { IndexedTask } from '../../tasks';

function task(overrides: Partial<Task> & { title?: string }): Task {
  return {
    title: overrides.title ?? 'Untitled',
    status: 'open',
    date_created: '2026-01-01T00:00:00Z',
    date_modified: '2026-01-01T00:00:00Z',
    _frontmatter: {},
    body: '',
    ...overrides,
  };
}

function fakeIndex(tasks: IndexedTask[]) {
  return { all: () => tasks };
}

async function runExec(tasks: IndexedTask[], input: unknown): Promise<{
  hits: Array<Record<string, unknown>>;
  total: number;
  truncated: boolean;
  filters: Record<string, unknown>;
}> {
  const exec = buildSearchTasksExecutor({ taskIndex: fakeIndex(tasks) });
  return JSON.parse(await exec('search_tasks', input));
}

describe('buildSearchTasksExecutor', () => {
  it('returns all tasks when no filter is supplied', async () => {
    const out = await runExec([
      { path: 'a.md', task: task({ title: 'A' }) },
      { path: 'b.md', task: task({ title: 'B' }) },
    ], {});
    expect(out.total).toBe(2);
    expect(out.hits.map(h => h.path).sort()).toEqual(['a.md', 'b.md']);
  });

  it('text filter matches title and body case-insensitively', async () => {
    const out = await runExec([
      { path: 'a.md', task: task({ title: 'Draft Q1 budget' }) },
      { path: 'b.md', task: task({ title: 'Other', body: 'we should re-do the budget' }) },
      { path: 'c.md', task: task({ title: 'Unrelated' }) },
    ], { text: 'BUDGET' });
    expect(out.hits.map(h => h.path)).toEqual(['a.md', 'b.md']);
  });

  it('text scoring prefers title hits over body hits', async () => {
    const out = await runExec([
      { path: 'body-only.md', task: task({ title: 'Other', body: 'budget review' }) },
      { path: 'title-hit.md', task: task({ title: 'Budget review' }) },
    ], { text: 'budget' });
    expect(out.hits[0].path).toBe('title-hit.md');
  });

  it('AND-combines status, priority, and tag filters', async () => {
    const out = await runExec([
      { path: 'a.md', task: task({ title: 'A', status: 'open', priority: 'high', tags: ['urgent'] }) },
      { path: 'b.md', task: task({ title: 'B', status: 'open', priority: 'low', tags: ['urgent'] }) },
      { path: 'c.md', task: task({ title: 'C', status: 'done', priority: 'high', tags: ['urgent'] }) },
    ], { status: 'open', priority: 'high', tags: ['urgent'] });
    expect(out.hits.map(h => h.path)).toEqual(['a.md']);
  });

  it('priority: "normal" matches both explicitly-normal AND unset priority', async () => {
    // Closes the GPT-class silent-drop footgun: most tasks have no priority
    // set, so a strict-match priority filter would drop them — bad UX when
    // the model "helpfully" adds priority: normal to a vague query.
    const out = await runExec([
      { path: 'unset.md', task: task({ title: 'Unset' }) },
      { path: 'normal.md', task: task({ title: 'Normal', priority: 'normal' }) },
      { path: 'high.md', task: task({ title: 'High', priority: 'high' }) },
    ], { priority: 'normal' });
    expect(out.hits.map(h => h.path).sort()).toEqual(['normal.md', 'unset.md']);
  });

  it('priority: "high" stays strict — unset does NOT match', async () => {
    const out = await runExec([
      { path: 'unset.md', task: task({ title: 'Unset' }) },
      { path: 'high.md', task: task({ title: 'High', priority: 'high' }) },
    ], { priority: 'high' });
    expect(out.hits.map(h => h.path)).toEqual(['high.md']);
  });

  it('rejects tag filters when the task has no tags at all', async () => {
    const out = await runExec([
      { path: 'a.md', task: task({ title: 'A' }) },
    ], { tags: ['x'] });
    expect(out.total).toBe(0);
  });

  it('due_after / due_before bounds are inclusive', async () => {
    const out = await runExec([
      { path: 'before.md', task: task({ title: 'B', due: '2026-01-01' }) },
      { path: 'on.md', task: task({ title: 'O', due: '2026-06-15' }) },
      { path: 'after.md', task: task({ title: 'A', due: '2026-12-31' }) },
    ], { due_after: '2026-06-15', due_before: '2026-06-15' });
    expect(out.hits.map(h => h.path)).toEqual(['on.md']);
  });

  it('clamps to limit and reports truncation', async () => {
    const tasks = Array.from({ length: 12 }, (_, i): IndexedTask => ({
      path: `t${i}.md`,
      task: task({ title: `T${i}` }),
    }));
    const out = await runExec(tasks, { limit: 5 });
    expect(out.hits).toHaveLength(5);
    expect(out.total).toBe(12);
    expect(out.truncated).toBe(true);
  });

  it('hit shape carries everything manage_tasks needs', async () => {
    const out = await runExec([
      {
        path: 't.md',
        task: task({
          title: 'Draft',
          status: 'open',
          priority: 'high',
          due: '2026-06-15',
          tags: ['urgent'],
          body: 'long body text here',
          date_modified: '2026-05-01T00:00:00Z',
        }),
      },
    ], { text: 'body' });
    expect(out.hits[0]).toMatchObject({
      path: 't.md',
      title: 'Draft',
      status: 'open',
      priority: 'high',
      due: '2026-06-15',
      tags: ['urgent'],
      updatedAt: '2026-05-01T00:00:00Z',
    });
    expect(out.hits[0].bodyExcerpt).toContain('body');
  });

  it('throws on unknown tool names so the loop logs the misuse', async () => {
    const exec = buildSearchTasksExecutor({ taskIndex: fakeIndex([]) });
    // @ts-expect-error — runtime guard exercise.
    await expect(exec('not_a_tool', {})).rejects.toThrow(/Unsupported/i);
  });
});
