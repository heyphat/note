import { describe, it, expect } from 'vitest';
import { runQuery } from './query';
import type { Task } from './spec-types';

function task(overrides: Partial<Task> = {}, idSuffix = 'a'): { path: string; task: Task } {
  return {
    path: `${idSuffix}.md`,
    task: {
      title: 't',
      status: 'open',
      date_created: '2026-05-01T00:00:00Z',
      date_modified: '2026-05-01T00:00:00Z',
      _frontmatter: {},
      body: '',
      ...overrides,
    },
  };
}

const today = '2026-05-04';
const ctx = { today };

describe('runQuery — filtering', () => {
  it('returns every task when no filter is supplied', () => {
    const r = runQuery([task({ title: 'A' }, 'a'), task({ title: 'B' }, 'b')], {}, ctx);
    expect(r.items).toHaveLength(2);
    expect(r.totalCount).toBe(2);
  });

  it('filters by status equality', () => {
    const r = runQuery([
      task({ status: 'open' }, 'a'),
      task({ status: 'done', completed_date: '2026-05-04' }, 'b'),
    ], { filters: [{ field: 'status', op: 'eq', value: 'open' }] }, ctx);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].path).toBe('a.md');
  });

  it('supports `in` over an array of statuses', () => {
    const r = runQuery([
      task({ status: 'open' }, 'a'),
      task({ status: 'in-progress' }, 'b'),
      task({ status: 'done', completed_date: '2026-05-04' }, 'c'),
    ], { filters: [{ field: 'status', op: 'in', value: ['open', 'in-progress'] }] }, ctx);
    expect(r.items.map(i => i.path).sort()).toEqual(['a.md', 'b.md']);
  });

  it('filters tags by `contains`', () => {
    const r = runQuery([
      task({ tags: ['urgent', 'work'] }, 'a'),
      task({ tags: ['home'] }, 'b'),
    ], { filters: [{ field: 'tag', op: 'contains', value: 'urgent' }] }, ctx);
    expect(r.items.map(i => i.path)).toEqual(['a.md']);
  });

  it('resolves date expressions like today / +7d', () => {
    const r = runQuery([
      task({ due: '2026-05-04' }, 'today'),
      task({ due: '2026-05-10' }, 'in6d'),
      task({ due: '2026-05-20' }, 'far'),
    ], { filters: [
      { field: 'due', op: 'lte', value: '+7d' },
      { field: 'due', op: 'gte', value: 'today' },
    ] }, ctx);
    expect(r.items.map(i => i.path).sort()).toEqual(['in6d.md', 'today.md']);
  });

  it('exposes overdue and recurring as boolean filters', () => {
    const r = runQuery([
      task({ due: '2026-05-01' }, 'late'),
      task({ due: '2026-05-04', recurrence: 'FREQ=DAILY' }, 'recurring'),
      task({}, 'plain'),
    ], { filters: [{ field: 'overdue', op: 'isTrue' }] }, ctx);
    expect(r.items.map(i => i.path)).toEqual(['late.md']);

    const recurring = runQuery([
      task({ due: '2026-05-01' }, 'late'),
      task({ due: '2026-05-04', recurrence: 'FREQ=DAILY' }, 'recurring'),
    ], { filters: [{ field: 'recurring', op: 'isTrue' }] }, ctx);
    expect(recurring.items.map(i => i.path)).toEqual(['recurring.md']);
  });

  it('text filter searches title + body case-insensitively', () => {
    const r = runQuery([
      task({ title: 'Plan launch', body: 'agenda' }, 'a'),
      task({ title: 'B', body: 'about LAUNCHING the rocket' }, 'b'),
      task({ title: 'C' }, 'c'),
    ], { filters: [{ field: 'text', op: 'contains', value: 'launch' }] }, ctx);
    expect(r.items.map(i => i.path).sort()).toEqual(['a.md', 'b.md']);
  });
});

describe('runQuery — sorting', () => {
  it('sorts by urgencyScore descending by default mapping', () => {
    const r = runQuery([
      task({ priority: 'low', due: '2026-06-01' }, 'low'),
      task({ priority: 'high', due: '2026-05-05' }, 'high'),
      task({}, 'plain'),
    ], { sort: [{ field: 'urgencyScore' }] }, ctx);
    // urgencyScore is sorted ascending, but the sortKey returns -score so
    // the highest-urgency task comes first.
    expect(r.items[0].path).toBe('high.md');
  });

  it('sorts by title asc/desc', () => {
    const r = runQuery([
      task({ title: 'Banana' }, 'b'),
      task({ title: 'Apple' }, 'a'),
    ], { sort: [{ field: 'title', direction: 'asc' }] }, ctx);
    expect(r.items.map(i => i.path)).toEqual(['a.md', 'b.md']);
  });

  it('places nulls last on date sorts', () => {
    const r = runQuery([
      task({ due: '2026-05-10' }, 'has'),
      task({}, 'none'),
    ], { sort: [{ field: 'due', direction: 'asc' }] }, ctx);
    expect(r.items.map(i => i.path)).toEqual(['has.md', 'none.md']);
  });
});

describe('runQuery — grouping', () => {
  it('groups by status', () => {
    const r = runQuery([
      task({ status: 'open' }, 'a'),
      task({ status: 'open' }, 'b'),
      task({ status: 'done', completed_date: '2026-05-04' }, 'c'),
    ], { group: 'status' }, ctx);
    expect(r.groups.map(g => g.key).sort()).toEqual(['done', 'open']);
  });

  it('puts due-bucket groups in fixed order', () => {
    const r = runQuery([
      task({ due: '2026-04-01' }, 'overdue'),
      task({ due: '2026-05-04' }, 'today'),
      task({ due: '2026-05-05' }, 'tomorrow'),
      task({ due: '2026-05-09' }, 'thisWeek'),
      task({ due: '2026-06-01' }, 'later'),
      task({}, 'noDate'),
      task({ status: 'done', completed_date: '2026-05-01' }, 'done'),
    ], { group: 'dueBucket' }, ctx);
    expect(r.groups.map(g => g.key)).toEqual(['overdue', 'today', 'tomorrow', 'thisWeek', 'later', 'noDate', 'done']);
  });

  it('uses placeholder labels for tasks with no project / context / tag', () => {
    const r = runQuery([task({}, 'plain')], { group: 'project' }, ctx);
    expect(r.groups[0].label).toBe('No project');
  });

  it('emits one group entry per project (a task with two projects appears in both)', () => {
    const r = runQuery([
      task({ projects: ['[[A]]', '[[B]]'] }, 'a'),
    ], { group: 'project' }, ctx);
    expect(r.groups).toHaveLength(2);
  });

  it('puts priority groups in fixed severity order regardless of insertion order', () => {
    const r = runQuery([
      task({ priority: 'low' }, 'l'),
      task({ priority: 'highest' }, 'hi'),
      task({}, 'unset'),
      task({ priority: 'normal' }, 'n'),
      task({ priority: 'high' }, 'h'),
      task({ priority: 'lowest' }, 'lo'),
    ], { group: 'priority' }, ctx);
    expect(r.groups.map(g => g.key)).toEqual([
      'highest', 'high', 'normal', 'low', 'lowest', 'unset',
    ]);
  });

  it('places non-canonical priority values after the canonical ladder', () => {
    const r = runQuery([
      task({ priority: 'critical' }, 'c'),
      task({ priority: 'high' }, 'h'),
      task({ priority: 'someday' }, 's'),
      task({}, 'unset'),
    ], { group: 'priority' }, ctx);
    const keys = r.groups.map(g => g.key);
    // Canonical members come first in spec order, custom values trail.
    expect(keys.slice(0, 2)).toEqual(['high', 'unset']);
    // The remaining two ('critical', 'someday') appear after — order
    // among them is insertion-driven, but they MUST come last.
    expect(keys.slice(2).sort()).toEqual(['critical', 'someday']);
  });

  it('only emits priority groups that actually have items', () => {
    const r = runQuery([
      task({ priority: 'high' }, 'h'),
      task({ priority: 'low' }, 'l'),
    ], { group: 'priority' }, ctx);
    expect(r.groups.map(g => g.key)).toEqual(['high', 'low']);
  });

  it('puts status groups in workflow order regardless of insertion order', () => {
    const r = runQuery([
      task({ status: 'cancelled' }, 'c'),
      task({ status: 'done', completed_date: '2026-05-04' }, 'd'),
      task({ status: 'open' }, 'o'),
      task({ status: 'in-progress' }, 'p'),
    ], { group: 'status' }, ctx);
    expect(r.groups.map(g => g.key)).toEqual([
      'open', 'in-progress', 'done', 'cancelled',
    ]);
  });

  it('places non-canonical status values after the canonical ladder', () => {
    const r = runQuery([
      task({ status: 'review' }, 'r'),
      task({ status: 'open' }, 'o'),
      task({ status: 'blocked' }, 'b'),
    ], { group: 'status' }, ctx);
    const keys = r.groups.map(g => g.key);
    expect(keys[0]).toBe('open');
    // Custom statuses ('review', 'blocked') come after — order among them
    // is insertion-driven but they MUST trail the canonical set.
    expect(keys.slice(1).sort()).toEqual(['blocked', 'review']);
  });

  it('sorts project groups alphabetically (case-insensitive) with __none__ at the end', () => {
    const r = runQuery([
      task({ projects: ['[[Zeta]]'] }, 'z'),
      task({}, 'none'),
      task({ projects: ['[[alpha]]'] }, 'a'),
      task({ projects: ['[[Beta]]'] }, 'b'),
    ], { group: 'project' }, ctx);
    expect(r.groups.map(g => g.key)).toEqual([
      '[[alpha]]', '[[Beta]]', '[[Zeta]]', '__none__',
    ]);
  });

  it('sorts tag groups alphabetically with __none__ at the end', () => {
    const r = runQuery([
      task({ tags: ['urgent'] }, 'u'),
      task({}, 'untagged'),
      task({ tags: ['admin'] }, 'a'),
      task({ tags: ['Backend'] }, 'b'),
    ], { group: 'tag' }, ctx);
    expect(r.groups.map(g => g.key)).toEqual([
      'admin', 'Backend', 'urgent', '__none__',
    ]);
  });

  it('sorts context groups alphabetically with __none__ at the end', () => {
    const r = runQuery([
      task({ contexts: ['@work'] }, 'w'),
      task({}, 'none'),
      task({ contexts: ['@home'] }, 'h'),
      task({ contexts: ['@errand'] }, 'e'),
    ], { group: 'context' }, ctx);
    expect(r.groups.map(g => g.key)).toEqual([
      '@errand', '@home', '@work', '__none__',
    ]);
  });

  it('sorts folder groups alphabetically with __inbox__ at the end', () => {
    const r = runQuery([
      task({ projects: ['[[work/A]]'] }, 'w'),
      task({ projects: ['[[archive/B]]'] }, 'a'),
      task({ projects: ['[[planning/C]]'] }, 'p'),
      task({ projects: ['[[NoFolder]]'] }, 'inbox'),
    ], { group: 'folder' }, ctx);
    expect(r.groups.map(g => g.key)).toEqual([
      'archive', 'planning', 'work', '__inbox__',
    ]);
  });
});

describe('runQuery — computed columns', () => {
  it('marks overdue when due is past today and status is not completed', () => {
    const r = runQuery([
      task({ due: '2026-04-01' }, 'late'),
      task({ due: '2026-05-04' }, 'today'),
    ], {}, ctx);
    const late = r.items.find(i => i.path === 'late.md')!;
    const todayItem = r.items.find(i => i.path === 'today.md')!;
    expect(late.computed.isOverdue).toBe(true);
    expect(todayItem.computed.isOverdue).toBe(false);
  });

  it('does not mark overdue when status is in completed_values', () => {
    const r = runQuery([task({
      due: '2026-04-01',
      status: 'done',
      completed_date: '2026-04-15',
    }, 'late')], {}, ctx);
    expect(r.items[0].computed.isOverdue).toBe(false);
  });

  it('computes daysUntilDue', () => {
    const r = runQuery([task({ due: '2026-05-10' }, 'a')], {}, ctx);
    expect(r.items[0].computed.daysUntilDue).toBe(6);
  });

  it('computes efficiencyRatio when estimate and entries are present', () => {
    const r = runQuery([task({
      time_estimate: 120,
      time_entries: [{ startTime: '2026-05-04T10:00:00Z', endTime: '2026-05-04T11:00:00Z' }],
    }, 'a')], {}, ctx);
    expect(r.items[0].computed.efficiencyRatio).toBe(50); // 60min tracked / 120min estimate = 50%
  });
});

describe('runQuery — limit', () => {
  it('caps the result list', () => {
    const r = runQuery([
      task({}, 'a'),
      task({}, 'b'),
      task({}, 'c'),
    ], { limit: 2 }, ctx);
    expect(r.items).toHaveLength(2);
    expect(r.filteredCount).toBe(3);
  });
});
