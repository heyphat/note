import { describe, expect, it } from 'vitest';
import type { Task } from '@/lib/tasks';
import {
  applyMove,
  augmentWithCanonicalColumns,
  fieldForAxis,
  isDoneToday,
  isDroppableDueBucket,
  KANBAN_CANONICAL_COLUMNS,
  makeDragId,
  offsetIsoDay,
  statusDropPatch,
} from './TaskKanbanBoard';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  title: 't',
  status: 'open',
  date_created: '2026-05-01T00:00:00Z',
  date_modified: '2026-05-01T00:00:00Z',
  _frontmatter: {},
  body: '',
  ...overrides,
});

// Pure-helper tests for the kanban board. Anything DOM-y stays out of this
// file — the rendered component is exercised through the existing notes
// page integration tests; the bits below are the testable units behind the
// drag-and-drop behaviour.

describe('isDroppableDueBucket', () => {
  it('accepts the four buckets that map to a single date / status mutation', () => {
    expect(isDroppableDueBucket('today')).toBe(true);
    expect(isDroppableDueBucket('tomorrow')).toBe(true);
    expect(isDroppableDueBucket('noDate')).toBe(true);
    expect(isDroppableDueBucket('done')).toBe(true);
  });

  it('rejects ambiguous buckets where no single date lands a task', () => {
    expect(isDroppableDueBucket('overdue')).toBe(false);
    expect(isDroppableDueBucket('thisWeek')).toBe(false);
    expect(isDroppableDueBucket('later')).toBe(false);
  });

  it('rejects unknown bucket keys', () => {
    expect(isDroppableDueBucket('whatever')).toBe(false);
    expect(isDroppableDueBucket('')).toBe(false);
  });
});

describe('fieldForAxis', () => {
  it('maps the multi-valued axes to their Task field name', () => {
    expect(fieldForAxis('project')).toBe('projects');
    expect(fieldForAxis('tag')).toBe('tags');
    expect(fieldForAxis('context')).toBe('contexts');
  });

  it('returns null for axes that are not multi-valued list mutations', () => {
    expect(fieldForAxis('status')).toBeNull();
    expect(fieldForAxis('priority')).toBeNull();
    expect(fieldForAxis('dueBucket')).toBeNull();
    expect(fieldForAxis('folder')).toBeNull();
    expect(fieldForAxis('none')).toBeNull();
  });
});

describe('applyMove', () => {
  it('removes the source value and adds the target', () => {
    expect(applyMove(['urgent', 'work'], 'urgent', 'inbox')).toEqual(['work', 'inbox']);
  });

  it('handles a single-value list (replace)', () => {
    expect(applyMove(['A'], 'A', 'B')).toEqual(['B']);
  });

  it('treats an absent list as empty', () => {
    expect(applyMove(undefined, 'A', 'B')).toEqual(['B']);
    expect(applyMove([], 'A', 'B')).toEqual(['B']);
  });

  it('does not duplicate the target if it is already present', () => {
    expect(applyMove(['A', 'B'], 'A', 'B')).toEqual(['B']);
    expect(applyMove(['A', 'B', 'C'], 'A', 'C')).toEqual(['B', 'C']);
  });

  it('drops onto __none__ only remove the source value, not the rest', () => {
    // The kanban marks __none__ columns as non-droppable, but the helper is
    // defensive: if it ever gets called, it removes only the source value
    // — clearing the entire list would be a surprising destructive action.
    expect(applyMove(['A', 'B'], 'A', '__none__')).toEqual(['B']);
    expect(applyMove(['A'], 'A', '__none__')).toEqual([]);
  });

  it('is a no-op when the source value is not in the list', () => {
    expect(applyMove(['A', 'B'], 'X', 'Y')).toEqual(['A', 'B', 'Y']);
  });
});

describe('makeDragId', () => {
  it('encodes both path and column so the same task in two columns has distinct ids', () => {
    expect(makeDragId('foo.md', 'colA')).toBe('foo.md::colA');
    expect(makeDragId('foo.md', 'colB')).toBe('foo.md::colB');
    expect(makeDragId('foo.md', 'colA')).not.toBe(makeDragId('foo.md', 'colB'));
  });
});

describe('offsetIsoDay', () => {
  it('adds days', () => {
    expect(offsetIsoDay('2026-05-04', 1)).toBe('2026-05-05');
    expect(offsetIsoDay('2026-05-04', 7)).toBe('2026-05-11');
  });

  it('crosses month boundaries', () => {
    expect(offsetIsoDay('2026-05-31', 1)).toBe('2026-06-01');
  });

  it('crosses year boundaries', () => {
    expect(offsetIsoDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('subtracts with a negative offset', () => {
    expect(offsetIsoDay('2026-05-04', -1)).toBe('2026-05-03');
  });
});

describe('isDoneToday', () => {
  it('reads from base status for non-recurring tasks', () => {
    expect(isDoneToday(makeTask({ status: 'open' }), '2026-05-04')).toBe(false);
    expect(isDoneToday(makeTask({ status: 'done' }), '2026-05-04')).toBe(true);
    expect(isDoneToday(makeTask({ status: 'completed' }), '2026-05-04')).toBe(true);
  });

  it('uses per-instance state for recurring tasks (spec §4.12)', () => {
    const recurring = makeTask({
      recurrence: 'FREQ=DAILY',
      complete_instances: ['2026-05-04'],
    });
    expect(isDoneToday(recurring, '2026-05-04')).toBe(true);
    expect(isDoneToday(recurring, '2026-05-05')).toBe(false);
  });

  it('ignores base status for recurring tasks', () => {
    // Base status='done' on a recurring task does NOT mean "done today";
    // only complete_instances determines per-instance state.
    const recurringDone = makeTask({
      status: 'done',
      recurrence: 'FREQ=DAILY',
      complete_instances: [],
    });
    expect(isDoneToday(recurringDone, '2026-05-04')).toBe(false);
  });
});

describe('statusDropPatch', () => {
  const TODAY = '2026-05-04';

  it('writes the destination status verbatim (does not collapse to the first completed value)', () => {
    // Regression for "drop on Completed column writes done": the helper
    // must preserve the user's choice. Routing through completeTask would
    // pickCompletedStatus(...) and replace 'completed' with 'done'.
    const patch = statusDropPatch(makeTask({ status: 'open' }), 'completed', TODAY);
    expect(patch.status).toBe('completed');
    expect(patch.completed_date).toBe(TODAY);
  });

  it('stamps completed_date when entering the completed set', () => {
    const patch = statusDropPatch(makeTask({ status: 'open' }), 'done', TODAY);
    expect(patch).toEqual({ status: 'done', completed_date: TODAY });
  });

  it('clears completed_date when leaving the completed set (applyPatch treats undefined as delete)', () => {
    const patch = statusDropPatch(
      makeTask({ status: 'done', completed_date: '2026-05-01' }),
      'open',
      TODAY,
    );
    expect(patch.status).toBe('open');
    expect(patch).toHaveProperty('completed_date', undefined);
  });

  it('does not touch completed_date for transitions that stay outside the completed set', () => {
    const patch = statusDropPatch(makeTask({ status: 'open' }), 'in-progress', TODAY);
    expect(patch).toEqual({ status: 'in-progress' });
    expect('completed_date' in patch).toBe(false);
  });

  it('does not touch completed_date for transitions that stay inside the completed set', () => {
    // done → completed should write the new status without re-stamping
    // the date (whatever was already there is preserved by updateTask).
    const patch = statusDropPatch(
      makeTask({ status: 'done', completed_date: '2026-05-01' }),
      'completed',
      TODAY,
    );
    expect(patch.status).toBe('completed');
    expect('completed_date' in patch).toBe(false);
  });

  it('writes base status for recurring tasks (drop must land in the destination column)', () => {
    // Regression for "recurring open → in-progress is a no-op": the
    // previous handler called uncompleteInstance for recurring tasks and
    // skipped writing the base status, so status grouping (which reads
    // task.status) never reflected the move.
    const patch = statusDropPatch(
      makeTask({ status: 'open', recurrence: 'FREQ=DAILY' }),
      'in-progress',
      TODAY,
    );
    expect(patch).toEqual({ status: 'in-progress' });
  });

  it('stamps completed_date for recurring tasks dropped on done (so dueBucket grouping reflects)', () => {
    // Regression for "recurring open → done can refresh back under the
    // old bucket": dueBucket grouping reads completed_date (query.ts), so
    // a recurring task dropped on 'done' must have completed_date set or
    // it ends up in dueBucket 'noDate' on the next refresh.
    const patch = statusDropPatch(
      makeTask({ status: 'open', recurrence: 'FREQ=DAILY' }),
      'done',
      TODAY,
    );
    expect(patch).toEqual({ status: 'done', completed_date: TODAY });
  });

  it('honors a custom completedSet (e.g. vault-configured "archived" status)', () => {
    const customSet = new Set(['archived']);
    const patch = statusDropPatch(
      makeTask({ status: 'open' }),
      'archived',
      TODAY,
      customSet,
    );
    expect(patch).toEqual({ status: 'archived', completed_date: TODAY });
  });
});

describe('augmentWithCanonicalColumns', () => {
  // Cast helper — the test only cares about key/items, not the full
  // Groups[number] shape, so we keep the literal terse.
  const g = (key: string, count = 0) => ({
    key, label: key, items: Array.from({ length: count }, () => ({} as never)),
  });

  it('inserts every canonical status column even when no task is in it', () => {
    const groups = [g('open', 2)];
    const out = augmentWithCanonicalColumns(groups as never, 'status');
    expect(out.map(o => o.key)).toEqual(['open', 'in-progress', 'done', 'cancelled']);
    // The 'open' bucket keeps its items; the rest are empty.
    expect(out[0].items).toHaveLength(2);
    expect(out[1].items).toHaveLength(0);
    expect(out[2].items).toHaveLength(0);
    expect(out[3].items).toHaveLength(0);
  });

  it('emits all five priority columns in canonical order', () => {
    const out = augmentWithCanonicalColumns([g('normal', 1)] as never, 'priority');
    expect(out.map(o => o.key)).toEqual(['highest', 'high', 'normal', 'low', 'lowest']);
  });

  it('emits all seven dueBucket columns in canonical order', () => {
    const out = augmentWithCanonicalColumns([g('today', 1)] as never, 'dueBucket');
    expect(out.map(o => o.key)).toEqual([
      'overdue', 'today', 'tomorrow', 'thisWeek', 'later', 'noDate', 'done',
    ]);
  });

  it('appends non-canonical keys (custom statuses, "unset") at the tail', () => {
    const groups = [g('open', 1), g('review', 1), g('unset', 1)];
    const out = augmentWithCanonicalColumns(groups as never, 'status');
    expect(out.map(o => o.key)).toEqual([
      'open', 'in-progress', 'done', 'cancelled', 'review', 'unset',
    ]);
  });

  it('returns groups unchanged for axes without a canonical set', () => {
    const groups = [g('foo', 1), g('bar', 1)];
    expect(augmentWithCanonicalColumns(groups as never, 'project')).toBe(groups);
    expect(augmentWithCanonicalColumns(groups as never, 'tag')).toBe(groups);
    expect(augmentWithCanonicalColumns(groups as never, 'context')).toBe(groups);
    expect(augmentWithCanonicalColumns(groups as never, 'folder')).toBe(groups);
    expect(augmentWithCanonicalColumns(groups as never, 'none')).toBe(groups);
  });

  it('exposes a stable canonical column registry for the three single-valued axes', () => {
    expect(KANBAN_CANONICAL_COLUMNS.status).toEqual(['open', 'in-progress', 'done', 'cancelled']);
    expect(KANBAN_CANONICAL_COLUMNS.priority).toEqual(['highest', 'high', 'normal', 'low', 'lowest']);
    expect(KANBAN_CANONICAL_COLUMNS.dueBucket).toEqual([
      'overdue', 'today', 'tomorrow', 'thisWeek', 'later', 'noDate', 'done',
    ]);
    expect(KANBAN_CANONICAL_COLUMNS.project).toBeUndefined();
    expect(KANBAN_CANONICAL_COLUMNS.tag).toBeUndefined();
    expect(KANBAN_CANONICAL_COLUMNS.context).toBeUndefined();
    expect(KANBAN_CANONICAL_COLUMNS.folder).toBeUndefined();
  });
});
