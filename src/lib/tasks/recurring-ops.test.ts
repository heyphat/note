import { describe, it, expect } from 'vitest';
import { InMemoryTaskStore } from './in-memory-task-store';
import {
  completeInstance,
  skipInstance,
  uncompleteInstance,
  unskipInstance,
} from './recurring-ops';
import { parseTask } from './parse-task';

const config = {
  now: () => '2026-02-20T10:00:00Z',
  today: () => '2026-02-20',
};

async function seed(store: InMemoryTaskStore, overrides: Record<string, unknown> = {}): Promise<string> {
  const fm = {
    title: 'Daily standup',
    status: 'open',
    recurrence: 'DTSTART:20260220;FREQ=DAILY',
    recurrence_anchor: 'scheduled',
    dateCreated: '2026-02-20T09:00:00Z',
    dateModified: '2026-02-20T09:00:00Z',
    ...overrides,
  };
  const lines = Object.entries(fm).map(([k, v]) => Array.isArray(v)
    ? `${k}:\n${v.map(item => `  - ${item}`).join('\n')}`
    : `${k}: ${typeof v === 'string' && /[:,#]/.test(v) ? JSON.stringify(v) : v}`);
  const raw = `---\n${lines.join('\n')}\n---\n`;
  const file = await store.create('task', raw);
  return file.path;
}

describe('completeInstance — scheduled anchor', () => {
  it('adds the target day to complete_instances', async () => {
    const store = new InMemoryTaskStore();
    const path = await seed(store);
    const result = await completeInstance(store, path, { targetDay: '2026-02-20' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.complete_instances).toEqual(['2026-02-20']);
  });

  it('removes the target day from skipped_instances if present (§4.7 step 2)', async () => {
    const store = new InMemoryTaskStore();
    const path = await seed(store, {
      skipped_instances: ['2026-02-20'],
    });
    const result = await completeInstance(store, path, { targetDay: '2026-02-20' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.complete_instances).toEqual(['2026-02-20']);
    expect(result.task.skipped_instances ?? []).toEqual([]);
  });

  it('is idempotent — repeat completion leaves date_modified unchanged', async () => {
    const store = new InMemoryTaskStore();
    let now = '2026-02-20T10:00:00Z';
    const c = { ...config, now: () => now };
    const path = await seed(store);
    const first = await completeInstance(store, path, { targetDay: '2026-02-20' }, c);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstModified = first.task.date_modified;
    now = '2026-02-20T11:00:00Z';
    const second = await completeInstance(store, path, { targetDay: '2026-02-20' }, c);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.task.date_modified).toBe(firstModified);
    expect(second.changed).toBe(false);
  });

  it('refuses non-recurring tasks', async () => {
    const store = new InMemoryTaskStore();
    const path = await seed(store, { recurrence: '' });
    const result = await completeInstance(store, path, { targetDay: '2026-02-20' }, config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not_recurring');
  });
});

describe('completeInstance — completion anchor', () => {
  it('rewrites DTSTART to the completion day (§4.4.3)', async () => {
    const store = new InMemoryTaskStore();
    const path = await seed(store, {
      recurrence: 'DTSTART:20260220;FREQ=DAILY',
      recurrence_anchor: 'completion',
    });
    const result = await completeInstance(store, path, { targetDay: '2026-02-22' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.recurrence).toBe('DTSTART:20260222;FREQ=DAILY');
    expect(result.task.complete_instances).toEqual(['2026-02-22']);
  });

  it('rewrites DTSTART to a datetime when targetInstant is supplied (§4.4.3)', async () => {
    const store = new InMemoryTaskStore();
    const path = await seed(store, {
      recurrence: 'DTSTART:20260220;FREQ=DAILY',
      recurrence_anchor: 'completion',
    });
    const result = await completeInstance(store, path, {
      targetDay: '2026-02-22',
      targetInstant: '2026-02-22T15:30:00Z',
    }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.recurrence).toBe('DTSTART:20260222T153000Z;FREQ=DAILY');
  });
});

describe('skipInstance / unskipInstance', () => {
  it('skip adds to skipped_instances and removes from complete_instances', async () => {
    const store = new InMemoryTaskStore();
    const path = await seed(store, { complete_instances: ['2026-02-20'] });
    const result = await skipInstance(store, path, { targetDay: '2026-02-20' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.skipped_instances).toEqual(['2026-02-20']);
    expect(result.task.complete_instances ?? []).toEqual([]);
  });

  it('unskip removes from skipped_instances but does NOT add to complete', async () => {
    const store = new InMemoryTaskStore();
    const path = await seed(store, { skipped_instances: ['2026-02-21'] });
    const result = await unskipInstance(store, path, { targetDay: '2026-02-21' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.skipped_instances ?? []).toEqual([]);
    expect(result.task.complete_instances ?? []).toEqual([]);
  });

  it('skip is idempotent', async () => {
    const store = new InMemoryTaskStore();
    const path = await seed(store, { skipped_instances: ['2026-02-20'] });
    const result = await skipInstance(store, path, { targetDay: '2026-02-20' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(false);
  });
});

describe('uncompleteInstance', () => {
  it('removes from complete_instances and does NOT touch DTSTART (§4.8 step 3)', async () => {
    const store = new InMemoryTaskStore();
    const path = await seed(store, {
      recurrence: 'DTSTART:20260222;FREQ=DAILY',
      recurrence_anchor: 'completion',
      complete_instances: ['2026-02-22'],
    });
    const result = await uncompleteInstance(store, path, { targetDay: '2026-02-22' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.complete_instances ?? []).toEqual([]);
    // DTSTART preserved per §4.8 step 3.
    expect(result.task.recurrence).toBe('DTSTART:20260222;FREQ=DAILY');
  });

  it('falls back to scheduled when targetDay is omitted (§5.2.1)', async () => {
    const store = new InMemoryTaskStore();
    const path = await seed(store, {
      scheduled: '2026-02-25',
      complete_instances: ['2026-02-25'],
    });
    const result = await uncompleteInstance(store, path, {}, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.complete_instances ?? []).toEqual([]);
  });
});

describe('round-trip through the store', () => {
  it('persists changes correctly', async () => {
    const store = new InMemoryTaskStore();
    const path = await seed(store);
    await completeInstance(store, path, { targetDay: '2026-02-20' }, config);
    const file = await store.read(path);
    expect(file).not.toBeNull();
    const { task } = parseTask(file!.raw);
    expect(task.complete_instances).toEqual(['2026-02-20']);
  });
});

describe('completeInstance — spawn-on-completion archive', () => {
  // Seeds a recurring task with `id` + body so the archive flow has
  // something to write. The default `seed()` builds an empty body.
  async function seedWithBody(store: InMemoryTaskStore, body: string, idValue = 'task-uuid-1'): Promise<string> {
    const fm = {
      title: 'Workout',
      status: 'open',
      id: idValue,
      recurrence: 'DTSTART:20260220;FREQ=DAILY',
      recurrence_anchor: 'scheduled',
      dateCreated: '2026-02-20T09:00:00Z',
      dateModified: '2026-02-20T09:00:00Z',
    };
    const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`);
    const raw = `---\n${lines.join('\n')}\n---\n${body}`;
    const file = await store.create('task', raw);
    return file.path;
  }

  it('archives the parent body and clears it on the parent', async () => {
    const store = new InMemoryTaskStore();
    const path = await seedWithBody(store, 'Today: chest day, felt strong\n');
    const result = await completeInstance(store, path, { targetDay: '2026-02-20' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Archive written under <uuid>/<day>
    expect(await store.listArchive('task-uuid-1')).toEqual(['2026-02-20']);
    const archived = await store.readArchive('task-uuid-1', '2026-02-20');
    expect(archived).toContain('Today: chest day, felt strong');
    expect(archived).toContain('parent_id: task-uuid-1');
    expect(archived).toContain('instance_date: 2026-02-20');

    // Parent body is cleared so the next instance starts fresh.
    const file = await store.read(path);
    const { task } = parseTask(file!.raw);
    expect(task.body.trim()).toBe('');
    // …and the day is recorded as complete.
    expect(task.complete_instances).toEqual(['2026-02-20']);
  });

  it('writes nothing to the archive when the body is empty', async () => {
    const store = new InMemoryTaskStore();
    const path = await seedWithBody(store, '');
    const result = await completeInstance(store, path, { targetDay: '2026-02-20' }, config);
    expect(result.ok).toBe(true);
    expect(await store.listArchive('task-uuid-1')).toEqual([]);
  });

  it('treats whitespace-only bodies the same as empty (no archive write)', async () => {
    const store = new InMemoryTaskStore();
    const path = await seedWithBody(store, '\n\n   \n');
    const result = await completeInstance(store, path, { targetDay: '2026-02-20' }, config);
    expect(result.ok).toBe(true);
    expect(await store.listArchive('task-uuid-1')).toEqual([]);
  });

  it('keeps separate archives per instance day across consecutive completions', async () => {
    const store = new InMemoryTaskStore();
    const path = await seedWithBody(store, 'Day 1 notes');
    await completeInstance(store, path, { targetDay: '2026-02-20' }, config);

    // Re-write a new body for the next instance, then complete a different day.
    const file1 = await store.read(path);
    await store.write(path, file1!.raw.replace(/(---\n)$/, '$1Day 2 notes'));
    await completeInstance(store, path, { targetDay: '2026-02-21' }, {
      now: () => '2026-02-21T10:00:00Z',
      today: () => '2026-02-21',
    });

    expect(await store.listArchive('task-uuid-1')).toEqual(['2026-02-20', '2026-02-21']);
    expect(await store.readArchive('task-uuid-1', '2026-02-20')).toContain('Day 1 notes');
    expect(await store.readArchive('task-uuid-1', '2026-02-21')).toContain('Day 2 notes');
  });

  it('does not write an archive when parent validation fails', async () => {
    const store = new InMemoryTaskStore();
    const path = await seedWithBody(store, 'This should not be archived');
    const result = await completeInstance(store, path, { targetDay: '2026-02-20' }, {
      now: () => '2026-02-20T08:00:00Z',
      today: () => '2026-02-20',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('validation_failed');
    expect(await store.listArchive('task-uuid-1')).toEqual([]);
    const file = await store.read(path);
    const { task } = parseTask(file!.raw);
    expect(task.body).toBe('This should not be archived');
    expect(task.complete_instances).toBeUndefined();
  });

  it('archives and clears body even when the instance was already completed', async () => {
    const store = new InMemoryTaskStore();
    const path = await seedWithBody(store, 'Late notes', 'task-uuid-1');
    const file = await store.read(path);
    await store.write(path, file!.raw.replace(
      'dateModified: 2026-02-20T09:00:00Z',
      'dateModified: 2026-02-20T09:00:00Z\ncompleteInstances:\n  - 2026-02-20',
    ));

    const result = await completeInstance(store, path, { targetDay: '2026-02-20' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(await store.listArchive('task-uuid-1')).toEqual(['2026-02-20']);
    const parent = await store.read(path);
    const { task } = parseTask(parent!.raw);
    expect(task.body.trim()).toBe('');
    expect(task.complete_instances).toEqual(['2026-02-20']);
  });
});
