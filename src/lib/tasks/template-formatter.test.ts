import { describe, it, expect } from 'vitest';
import { formatTasksToday } from './template-formatter';
import type { Task } from './spec-types';

function task(overrides: Partial<Task>, path = 'a.md'): { path: string; task: Task } {
  return {
    path,
    task: {
      title: 't',
      status: 'open',
      date_created: '2026-01-01T00:00:00Z',
      date_modified: '2026-01-01T00:00:00Z',
      _frontmatter: {},
      body: '',
      ...overrides,
    },
  };
}

describe('formatTasksToday', () => {
  const today = '2026-05-04';

  it('emits an empty string when no tasks match', () => {
    expect(formatTasksToday([], { today })).toBe('');
    expect(formatTasksToday([task({ due: '2026-12-01' })], { today })).toBe('');
  });

  it('includes due-today tasks', () => {
    const out = formatTasksToday([
      task({ title: 'Pay bill', due: '2026-05-04' }, 'pay-bill.md'),
    ], { today });
    expect(out).toBe('- [ ] [[pay-bill|Pay bill]]');
  });

  it('includes overdue tasks with a warning marker', () => {
    const out = formatTasksToday([
      task({ title: 'Late', due: '2026-05-01' }, 'late.md'),
    ], { today });
    expect(out).toBe('- [ ] [[late|Late]] ⚠️');
  });

  it('uses scheduled when due is absent', () => {
    const out = formatTasksToday([
      task({ title: 'S', scheduled: '2026-05-04' }, 's.md'),
    ], { today });
    expect(out).toContain('[[s|S]]');
  });

  it('excludes completed tasks', () => {
    const out = formatTasksToday([
      task({ title: 'Done', due: '2026-05-04', status: 'done', completed_date: '2026-05-04' }, 'done.md'),
    ], { today });
    expect(out).toBe('');
  });

  it('sorts by date then title', () => {
    const out = formatTasksToday([
      task({ title: 'Z later', due: '2026-05-04' }, 'z.md'),
      task({ title: 'A overdue', due: '2026-05-01' }, 'a.md'),
    ], { today });
    const lines = out.split('\n');
    expect(lines[0]).toContain('A overdue');
    expect(lines[1]).toContain('Z later');
  });

  it('respects the limit option', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      task({ title: `T${i}`, due: '2026-05-04' }, `t${i}.md`));
    expect(formatTasksToday(tasks, { today, limit: 2 }).split('\n')).toHaveLength(2);
  });
});
