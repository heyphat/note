import { describe, it, expect } from 'vitest';
import { blocksWrite, validateTask } from './validate';
import type { Task } from './spec-types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    title: 'Plan workshop',
    status: 'open',
    date_created: '2026-02-20T09:00:00Z',
    date_modified: '2026-02-20T09:00:00Z',
    _frontmatter: {},
    body: '',
    ...overrides,
  };
}

describe('validateTask required fields', () => {
  it('passes a minimal valid task', () => {
    const r = validateTask(makeTask());
    expect(r.issues).toEqual([]);
    expect(blocksWrite(r)).toBe(false);
  });

  it('flags missing title', () => {
    const r = validateTask(makeTask({ title: '' }));
    expect(r.issues.some(i => i.code === 'missing_required' && i.field === 'title')).toBe(true);
  });

  it('flags missing dateModified (spec §6.9.1)', () => {
    const r = validateTask(makeTask({ date_modified: '' }));
    expect(r.issues.some(i => i.code === 'missing_required' && i.field === 'dateModified')).toBe(true);
  });

  it('requires completedDate when status is in completed_values', () => {
    const r = validateTask(makeTask({ status: 'done' }));
    expect(r.issues.some(i => i.code === 'missing_required' && i.field === 'completedDate')).toBe(true);
  });

  it('does NOT require completedDate for recurring tasks', () => {
    const r = validateTask(makeTask({
      status: 'done',
      recurrence: 'FREQ=DAILY',
    }));
    expect(r.issues.some(i => i.field === 'completedDate')).toBe(false);
  });
});

describe('validateTask date and datetime parsing', () => {
  it('rejects offset-less local datetime (strict mode, §3.4.4)', () => {
    const r = validateTask(makeTask({ date_created: '2026-02-20T09:00:00' }));
    expect(r.issues.some(i => i.code === 'invalid_datetime_value')).toBe(true);
  });

  it('rejects malformed dates (e.g. 2026-02-30)', () => {
    const r = validateTask(makeTask({ due: '2026-02-30' }));
    expect(r.issues.some(i => i.code === 'invalid_datetime_value' || i.code === 'invalid_date_value')).toBe(true);
  });

  it('accepts canonical date YYYY-MM-DD on date roles', () => {
    const r = validateTask(makeTask({ due: '2026-05-10' }));
    expect(r.issues.filter(i => i.field === 'due')).toEqual([]);
  });

  it('rejects basic date 20260220 (no separators)', () => {
    const r = validateTask(makeTask({ due: '20260220' }));
    expect(r.issues.some(i => i.field === 'due' && i.severity === 'error')).toBe(true);
  });

  it('flags dateModified earlier than dateCreated (§6.9 check 6)', () => {
    const r = validateTask(makeTask({
      date_created: '2026-02-20T10:00:00Z',
      date_modified: '2026-02-20T09:00:00Z',
    }));
    expect(r.issues.some(i => i.code === 'date_modified_before_created')).toBe(true);
  });
});

describe('validateTask recurrence and instance state', () => {
  it('flags overlap between complete and skipped instance lists (§6.9.3)', () => {
    const r = validateTask(makeTask({
      complete_instances: ['2026-02-20'],
      skipped_instances: ['2026-02-20'],
    }));
    expect(r.issues.some(i => i.code === 'instance_state_overlap')).toBe(true);
  });

  it('flags invalid recurrence_anchor (§6.9.2)', () => {
    const r = validateTask(makeTask({
      recurrence_anchor: 'due' as unknown as 'scheduled',
    }));
    expect(r.issues.some(i => i.code === 'invalid_recurrence_anchor')).toBe(true);
  });
});

describe('validateTask time tracking', () => {
  it('flags multiple active time entries (§6.9.7)', () => {
    const r = validateTask(makeTask({
      time_entries: [
        { startTime: '2026-02-20T10:00:00Z' },
        { startTime: '2026-02-20T11:00:00Z' },
      ],
    }));
    expect(r.issues.some(i => i.code === 'multiple_active_time_entries')).toBe(true);
  });

  it('accepts one active session', () => {
    const r = validateTask(makeTask({
      time_entries: [{ startTime: '2026-02-20T10:00:00Z' }],
    }));
    expect(r.issues.filter(i => i.code === 'multiple_active_time_entries')).toEqual([]);
  });

  it('flags reversed time range', () => {
    const r = validateTask(makeTask({
      time_entries: [{
        startTime: '2026-02-20T11:00:00Z',
        endTime: '2026-02-20T10:00:00Z',
      }],
    }));
    expect(r.issues.some(i => i.code === 'invalid_time_range')).toBe(true);
  });

  it('flags negative time_estimate', () => {
    const r = validateTask(makeTask({ time_estimate: -1 }));
    expect(r.issues.some(i => i.code === 'invalid_type' && i.field === 'timeEstimate')).toBe(true);
  });
});

describe('validateTask dependencies', () => {
  it('flags invalid reltype (§6.9.4)', () => {
    const r = validateTask(makeTask({
      blocked_by: [{ uid: '[[task-a]]', reltype: 'BLOCKS' as 'FINISHTOSTART' }],
    }));
    expect(r.issues.some(i => i.code === 'invalid_dependency_reltype')).toBe(true);
  });

  it('flags invalid gap duration', () => {
    const r = validateTask(makeTask({
      blocked_by: [{ uid: '[[task-a]]', reltype: 'FINISHTOSTART', gap: '1 day' }],
    }));
    expect(r.issues.some(i => i.code === 'invalid_dependency_gap')).toBe(true);
  });

  it('flags self-dependency by id', () => {
    const r = validateTask(makeTask({
      id: 'task-self',
      blocked_by: [{ uid: 'task-self', reltype: 'FINISHTOSTART' }],
    }));
    expect(r.issues.some(i => i.code === 'self_dependency')).toBe(true);
  });
});

describe('validateTask reminders', () => {
  it('flags duplicate reminder ids', () => {
    const r = validateTask(makeTask({
      due: '2026-02-20',
      reminders: [
        { id: 'a', type: 'relative', relatedTo: 'due', offset: '-P1D' },
        { id: 'a', type: 'relative', relatedTo: 'due', offset: '-P2D' },
      ],
    }));
    expect(r.issues.some(i => i.code === 'duplicate_reminder_id')).toBe(true);
  });

  it('flags unresolvable reminder base (§6.9.5)', () => {
    const r = validateTask(makeTask({
      reminders: [{ id: 'r', type: 'relative', relatedTo: 'due', offset: '-P1D' }],
    }));
    expect(r.issues.some(i => i.code === 'unresolvable_reminder_base')).toBe(true);
  });

  it('flags invalid offset', () => {
    const r = validateTask(makeTask({
      due: '2026-02-20',
      reminders: [{ id: 'r', type: 'relative', relatedTo: 'due', offset: '1 day' }],
    }));
    expect(r.issues.some(i => i.code === 'invalid_reminder_offset')).toBe(true);
  });

  it('flags invalid absolute time', () => {
    const r = validateTask(makeTask({
      reminders: [{ id: 'r', type: 'absolute', absoluteTime: 'tomorrow' }],
    }));
    expect(r.issues.some(i => i.code === 'invalid_reminder_absolute_time')).toBe(true);
  });
});

describe('blocksWrite', () => {
  it('returns true in strict mode when an error is present', () => {
    const r = validateTask(makeTask({ title: '' }));
    expect(blocksWrite(r)).toBe(true);
  });

  it('returns false in permissive mode regardless of severity', () => {
    const r = validateTask(makeTask({ title: '' }), { mode: 'permissive' });
    expect(blocksWrite(r)).toBe(false);
  });

  it('returns false when only warnings are present', () => {
    const r = validateTask(makeTask(), {
      parseIssues: [{
        code: 'alias_conflict_ignored',
        role: 'date_created',
        canonical: 'dateCreated',
        aliases: ['date_created'],
      }],
    });
    expect(blocksWrite(r)).toBe(false);
  });
});
