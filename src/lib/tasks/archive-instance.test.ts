import { describe, it, expect } from 'vitest';
import { archiveCompletedInstance } from './archive-instance';
import { InMemoryTaskStore } from './in-memory-task-store';
import type { Task } from './spec-types';

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  title: 'Daily standup',
  status: 'open',
  date_created: '2026-02-20T09:00:00Z',
  date_modified: '2026-02-20T09:00:00Z',
  id: 'task-uuid-1',
  _frontmatter: {},
  body: '',
  ...overrides,
});

const config = { now: () => '2026-02-20T10:00:00Z' };

describe('archiveCompletedInstance — empty-body short-circuit', () => {
  it('returns archived=false and leaves the parent unchanged when body is empty', async () => {
    const store = new InMemoryTaskStore();
    const parent = baseTask({ body: '' });
    const result = await archiveCompletedInstance(store, parent, '2026-02-20', config);
    expect(result.archived).toBe(false);
    expect(result.parent).toBe(parent);
    expect(await store.listArchive('task-uuid-1')).toEqual([]);
  });

  it('skips the archive write for whitespace-only bodies', async () => {
    const store = new InMemoryTaskStore();
    const parent = baseTask({ body: '   \n\n\t' });
    const result = await archiveCompletedInstance(store, parent, '2026-02-20', config);
    expect(result.archived).toBe(false);
    expect(result.parent).toBe(parent);
    expect(await store.listArchive('task-uuid-1')).toEqual([]);
  });
});

describe('archiveCompletedInstance — non-empty body', () => {
  it('writes the archive at the parent UUID + instance date and clears the parent body', async () => {
    const store = new InMemoryTaskStore();
    const parent = baseTask({ body: 'Did chest day. Felt strong.' });
    const result = await archiveCompletedInstance(store, parent, '2026-02-20', config);
    expect(result.archived).toBe(true);
    expect(result.parent.body).toBe('');
    expect(result.parent.id).toBe('task-uuid-1');
    expect(await store.listArchive('task-uuid-1')).toEqual(['2026-02-20']);
    const raw = await store.readArchive('task-uuid-1', '2026-02-20');
    expect(raw).toContain('Did chest day. Felt strong.');
  });

  it('snapshots the parent frontmatter into the archive note', async () => {
    const store = new InMemoryTaskStore();
    const parent = baseTask({
      body: 'session log',
      title: 'Workout',
      priority: 'high',
      due: '2026-02-20',
      scheduled: '2026-02-20',
      tags: ['training', 'back'],
      contexts: ['@gym'],
      projects: ['[[Q2 Health]]'],
      recurrence: 'FREQ=DAILY',
      recurrence_anchor: 'scheduled',
    });
    await archiveCompletedInstance(store, parent, '2026-02-20', config);
    const raw = (await store.readArchive('task-uuid-1', '2026-02-20'))!;
    expect(raw).toContain('parent_id: task-uuid-1');
    expect(raw).toContain('parent_title: Workout');
    expect(raw).toContain('instance_date: 2026-02-20');
    expect(raw).toContain('archived_at: 2026-02-20T10:00:00Z');
    expect(raw).toContain('title: Workout');
    expect(raw).toContain('priority: high');
    expect(raw).toContain('recurrence: FREQ=DAILY');
    expect(raw).toContain('recurrence_anchor: scheduled');
  });

  it('does NOT copy per-instance lists into the archive (those belong to the parent)', async () => {
    const store = new InMemoryTaskStore();
    const parent = baseTask({
      body: 'session log',
      complete_instances: ['2026-02-19'],
      skipped_instances: ['2026-02-18'],
    });
    await archiveCompletedInstance(store, parent, '2026-02-20', config);
    const raw = (await store.readArchive('task-uuid-1', '2026-02-20'))!;
    expect(raw).not.toContain('complete_instances');
    expect(raw).not.toContain('skipped_instances');
  });

  it('omits frontmatter fields that are empty/undefined', async () => {
    const store = new InMemoryTaskStore();
    const parent = baseTask({
      body: 'log',
      tags: [],
      contexts: undefined,
      projects: [],
    });
    await archiveCompletedInstance(store, parent, '2026-02-20', config);
    const raw = (await store.readArchive('task-uuid-1', '2026-02-20'))!;
    // Only the always-present keys should appear.
    expect(raw).not.toContain('tags:');
    expect(raw).not.toContain('contexts:');
    expect(raw).not.toContain('projects:');
  });
});

describe('archiveCompletedInstance — id backfill', () => {
  it('generates a UUID on the parent when one is missing, and uses it as the archive key', async () => {
    const store = new InMemoryTaskStore();
    const parent = baseTask({ id: undefined, body: 'log' });
    const result = await archiveCompletedInstance(store, parent, '2026-02-20', config);
    expect(result.archived).toBe(true);
    expect(result.parent.id).toBeTruthy();
    expect(result.parent.id!.length).toBeGreaterThan(0);
    expect(await store.listArchive(result.parent.id!)).toEqual(['2026-02-20']);
  });

  it('does not mutate the input task object when backfilling the id', async () => {
    const store = new InMemoryTaskStore();
    const parent = baseTask({ id: undefined, body: 'log' });
    await archiveCompletedInstance(store, parent, '2026-02-20', config);
    expect(parent.id).toBeUndefined();
  });
});
