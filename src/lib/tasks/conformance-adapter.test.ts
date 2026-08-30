import { describe, it, expect } from 'vitest';
import { execute, listOperations, metadata } from './conformance-adapter';

describe('conformance adapter', () => {
  it('reports metadata satisfying the contract', () => {
    expect(metadata.implementation).toBe('note-tasknotes');
    expect(metadata.validation_modes).toContain('strict');
    expect(metadata.profiles).toContain('core-lite');
    expect(metadata.profiles).toContain('recurrence');
    expect(metadata.profiles).toContain('extended');
    // §7.3.4: claiming `extended` requires these capability tokens.
    expect(metadata.capabilities).toContain('dependencies');
    expect(metadata.capabilities).toContain('reminders');
    expect(metadata.capabilities).toContain('links');
    expect(metadata.capabilities).toContain('time-tracking');
  });

  it('replies with metadata via meta.claim', async () => {
    const env = await execute('meta.claim');
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    expect(env.result).toMatchObject({ implementation: 'note-tasknotes' });
  });

  it('returns ok=false (never throws) on unknown operations', async () => {
    const env = await execute('does.not.exist');
    expect(env.ok).toBe(false);
    if (env.ok) return;
    expect(env.error_details?.code).toBe('unknown_operation');
  });

  it('field.default_mapping returns the expected camelCase canonical keys', async () => {
    const env = await execute('field.default_mapping');
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    const result = env.result as Record<string, string>;
    expect(result.date_created).toBe('dateCreated');
    expect(result.date_modified).toBe('dateModified');
    expect(result.completed_date).toBe('completedDate');
    expect(result.blocked_by).toBe('blockedBy');
  });

  it('field.normalize maps canonical → semantic and surfaces alias conflicts', async () => {
    const env = await execute('field.normalize', {
      frontmatter: {
        title: 'X',
        status: 'open',
        dateCreated: '2026-01-01T00:00:00Z',
        date_created: '2025-01-01T00:00:00Z',
        dateModified: '2026-01-01T00:00:00Z',
      },
    });
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    const result = env.result as { semantic: Record<string, unknown>; issues: Array<{ code: string }> };
    expect(result.semantic.date_created).toBe('2026-01-01T00:00:00Z');
    expect(result.issues.some(i => i.code === 'alias_conflict_ignored')).toBe(true);
  });

  it('field.denormalize writes only canonical keys', async () => {
    const env = await execute('field.denormalize', {
      semantic: { date_created: '2026-01-01T00:00:00Z', date_modified: '2026-01-01T00:00:00Z' },
    });
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    expect(env.result).toEqual({
      dateCreated: '2026-01-01T00:00:00Z',
      dateModified: '2026-01-01T00:00:00Z',
    });
  });

  it('date.validate distinguishes date and datetime', async () => {
    expect((await execute('date.validate', { value: '2026-05-10', kind: 'date' })).ok).toBe(true);
    const dt = await execute('date.validate', { value: '2026-05-10T09:00:00', kind: 'datetime' });
    expect(dt.ok).toBe(true);
    if (!dt.ok) return;
    expect((dt.result as { valid: boolean }).valid).toBe(false); // offset-less rejected
  });

  it('validation.core_evaluate flags missing required roles', async () => {
    const env = await execute('validation.core_evaluate', {
      frontmatter: { title: 'X', status: 'open' },
    });
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    const r = env.result as { issues: Array<{ code: string; field?: string }>; blocks_write: boolean };
    expect(r.blocks_write).toBe(true);
    expect(r.issues.some(i => i.code === 'missing_required' && i.field === 'dateCreated')).toBe(true);
  });

  it('op.idempotency_check confirms repeat completion is a no-op', async () => {
    const env = await execute('op.idempotency_check', {
      task: {
        title: 'Foo',
        status: 'open',
        dateCreated: '2026-05-04T10:00:00Z',
        dateModified: '2026-05-04T10:00:00Z',
      },
      now: '2026-05-04T11:00:00Z',
      today: '2026-05-04',
    });
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    expect((env.result as { idempotent: boolean }).idempotent).toBe(true);
  });

  it('recurrence.recalculate returns the next scheduled occurrence', async () => {
    const env = await execute('recurrence.recalculate', {
      recurrence: 'DTSTART:20260206;FREQ=WEEKLY;BYDAY=FR',
      recurrence_anchor: 'scheduled',
      after: '2026-02-09T00:00:00Z',
    });
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    expect((env.result as { next: string }).next).toBe('2026-02-13');
  });

  it('recurrence.complete records an instance day', async () => {
    const env = await execute('recurrence.complete', {
      task: {
        title: 'Daily',
        status: 'open',
        recurrence: 'DTSTART:20260220;FREQ=DAILY',
        recurrence_anchor: 'scheduled',
        dateCreated: '2026-02-20T09:00:00Z',
        dateModified: '2026-02-20T09:00:00Z',
      },
      target_day: '2026-02-20',
      now: '2026-02-20T10:00:00Z',
    });
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    const result = env.result as { task: { complete_instances: string[] } };
    expect(result.task.complete_instances).toEqual(['2026-02-20']);
  });

  it('dependency.add appends a new dependency', async () => {
    const env = await execute('dependency.add', {
      task: {
        title: 'A',
        status: 'open',
        dateCreated: '2026-05-04T10:00:00Z',
        dateModified: '2026-05-04T10:00:00Z',
      },
      uid: '[[task-x]]',
      reltype: 'FINISHTOSTART',
      now: '2026-05-04T11:00:00Z',
    });
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    const r = env.result as { task: { blocked_by: Array<{ uid: string }> } };
    expect(r.task.blocked_by[0].uid).toBe('[[task-x]]');
  });

  it('time.start refuses when an entry is already active', async () => {
    const seed = {
      title: 'A',
      status: 'open',
      dateCreated: '2026-05-04T10:00:00Z',
      dateModified: '2026-05-04T10:00:00Z',
      timeEntries: [{ startTime: '2026-05-04T09:00:00Z' }],
    };
    const env = await execute('time.start', { task: seed, now: '2026-05-04T10:00:00Z' });
    expect(env.ok).toBe(false);
    if (env.ok) return;
    expect(env.error_details?.code).toBe('mutator_rejected');
  });

  it('reminder.compute_triggers resolves relative reminders against `due`', async () => {
    const env = await execute('reminder.compute_triggers', {
      task: {
        title: 'A',
        status: 'open',
        due: '2026-05-10',
        dateCreated: '2026-05-04T10:00:00Z',
        dateModified: '2026-05-04T10:00:00Z',
        reminders: [{ id: 'r1', type: 'relative', relatedTo: 'due', offset: '-PT2H' }],
      },
    });
    expect(env.ok).toBe(true);
    if (!env.ok) return;
    const triggers = env.result as Array<{ triggerInstant: string }>;
    expect(triggers[0].triggerInstant).toBe('2026-05-09T22:00:00Z');
  });

  it('listOperations returns a sorted unique list', () => {
    const ops = listOperations();
    expect(ops).toEqual([...ops].sort());
    expect(new Set(ops).size).toBe(ops.length);
    expect(ops).toContain('meta.claim');
    expect(ops).toContain('op.complete_nonrecurring');
  });
});
