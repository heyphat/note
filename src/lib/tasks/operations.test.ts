import { describe, it, expect } from 'vitest';
import {
  completeTask,
  createTask,
  deleteTask,
  uncompleteTask,
  updateTask,
} from './operations';
import { InMemoryTaskStore } from './in-memory-task-store';
import { parseTask } from './parse-task';

const FIXED_NOW = '2026-05-04T10:00:00Z';
const FIXED_TODAY = '2026-05-04';

const config = {
  now: () => FIXED_NOW,
  today: () => FIXED_TODAY,
};

describe('createTask', () => {
  it('creates a valid task with defaults applied', async () => {
    const store = new InMemoryTaskStore();
    const result = await createTask(store, { title: 'Pay electricity bill' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task.title).toBe('Pay electricity bill');
    expect(result.value.task.status).toBe('open');
    expect(result.value.task.date_created).toBe(FIXED_NOW);
    expect(result.value.task.date_modified).toBe(FIXED_NOW);
    expect(result.value.path).toMatch(/^2026-05-04-pay-electricity-bill\.md$/);
  });

  it('writes the task to the store with canonical keys', async () => {
    const store = new InMemoryTaskStore();
    const result = await createTask(store, {
      title: 'Foo',
      priority: 'high',
      tags: ['work'],
    }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const file = await store.read(result.value.path);
    expect(file?.raw).toContain('priority: high');
    expect(file?.raw).toContain('dateCreated:');
    expect(file?.raw).not.toContain('date_created:'); // alias never written
  });

  it('refuses to create a task with empty title (validation_failed)', async () => {
    const store = new InMemoryTaskStore();
    const result = await createTask(store, { title: '' }, config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('validation_failed');
  });

  it('preserves caller-supplied id', async () => {
    const store = new InMemoryTaskStore();
    const result = await createTask(store, { title: 'Foo', id: 'fixed-id-1' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task.id).toBe('fixed-id-1');
  });

  it('auto-generates a UUID when no id is supplied', async () => {
    const store = new InMemoryTaskStore();
    const result = await createTask(store, { title: 'Foo' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task.id).toBeTruthy();
    // crypto.randomUUID() shape: 8-4-4-4-12 hex digits.
    expect(result.value.task.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('generates distinct ids across consecutive creates', async () => {
    const store = new InMemoryTaskStore();
    const a = await createTask(store, { title: 'A' }, config);
    const b = await createTask(store, { title: 'B' }, config);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.task.id).not.toBe(b.value.task.id);
  });

  it('rejects a malformed recurrence string with invalid_recurrence_rule', async () => {
    const store = new InMemoryTaskStore();
    const result = await createTask(store, {
      title: 'Bad rule',
      recurrence: 'NOT_A_REAL_RRULE',
    }, config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('validation_failed');
    expect(result.issues.some(i => i.code === 'invalid_recurrence_rule')).toBe(true);
  });

  it('accepts a well-formed recurrence string', async () => {
    const store = new InMemoryTaskStore();
    const result = await createTask(store, {
      title: 'Daily review',
      recurrence: 'FREQ=DAILY',
    }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task.recurrence).toBe('FREQ=DAILY');
  });

  it('treats an empty/whitespace recurrence string as absent (no validation error)', async () => {
    const store = new InMemoryTaskStore();
    const result = await createTask(store, { title: 'Foo', recurrence: '   ' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task.recurrence).toBeUndefined();
  });

  it("auto-stamps completed_date to today when status='done' on creation", async () => {
    // Without this default, validateTask §6.4 check 1a would reject the task
    // because completed_date is required for non-recurring completed tasks
    // and CreateTaskInput doesn't expose completed_date.
    const store = new InMemoryTaskStore();
    const result = await createTask(store, { title: 'Already done', status: 'done' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task.status).toBe('done');
    expect(result.value.task.completed_date).toBe(FIXED_TODAY);
  });

  it("auto-stamps completed_date when status='completed' (alternate completed value)", async () => {
    const store = new InMemoryTaskStore();
    const result = await createTask(store, { title: 'Done already', status: 'completed' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task.completed_date).toBe(FIXED_TODAY);
  });

  it('does not stamp completed_date for non-completed statuses', async () => {
    const store = new InMemoryTaskStore();
    const r1 = await createTask(store, { title: 'Open task', status: 'open' }, config);
    const r2 = await createTask(store, { title: 'Working', status: 'in-progress' }, config);
    const r3 = await createTask(store, { title: 'Cancelled', status: 'cancelled' }, config);
    expect(r1.ok && r2.ok && r3.ok).toBe(true);
    if (!r1.ok || !r2.ok || !r3.ok) return;
    expect(r1.value.task.completed_date).toBeUndefined();
    expect(r2.value.task.completed_date).toBeUndefined();
    expect(r3.value.task.completed_date).toBeUndefined();
  });

  it('does not stamp completed_date on a recurring task with completed status (per-instance state owns it)', async () => {
    // Spec §4.12: recurring tasks track per-instance completion via
    // complete_instances; the base completed_date doesn't apply.
    const store = new InMemoryTaskStore();
    const result = await createTask(store, {
      title: 'Daily standup',
      status: 'done',
      recurrence: 'FREQ=DAILY',
    }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task.completed_date).toBeUndefined();
  });
});

describe('updateTask', () => {
  it('patches a single field, preserving unrelated fields and unknown ones', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, {
      title: 'Weekly review',
      scheduled: '2026-02-20',
      priority: 'normal',
    }, config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Stick a custom field in directly to simulate user-added unknown.
    const file = (await store.read(created.value.path))!;
    const stuffed = file.raw.replace(
      /^---/m,
      `---\ncustomClient: ACME`,
    );
    await store.write(created.value.path, stuffed);

    const updated = await updateTask(store, created.value.path, { priority: 'high' }, config);
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.task.priority).toBe('high');
    expect(updated.value.task.scheduled).toBe('2026-02-20');
    expect(updated.value.task._frontmatter.customClient).toBe('ACME');

    const onDisk = await store.read(created.value.path);
    expect(onDisk?.raw).toContain('customClient: ACME');
  });

  it('bumps date_modified on real change', async () => {
    const store = new InMemoryTaskStore();
    let now = '2026-01-01T00:00:00Z';
    const c = { ...config, now: () => now };
    const created = await createTask(store, { title: 'Foo' }, c);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    now = '2026-01-02T00:00:00Z';
    const updated = await updateTask(store, created.value.path, { priority: 'high' }, c);
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.task.date_modified).toBe('2026-01-02T00:00:00Z');
  });

  it('returns not_found for missing path', async () => {
    const store = new InMemoryTaskStore();
    const result = await updateTask(store, 'nope.md', { priority: 'high' }, config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not_found');
  });
});

describe('completeTask', () => {
  it('sets status to done and stamps completed_date', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'Foo' }, config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const completed = await completeTask(store, created.value.path, {}, config);
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.value.task.status).toBe('done');
    expect(completed.value.task.completed_date).toBe(FIXED_TODAY);
  });

  it('is idempotent: repeat call leaves date_modified unchanged', async () => {
    const store = new InMemoryTaskStore();
    let now = '2026-05-04T10:00:00Z';
    const c = { ...config, now: () => now };
    const created = await createTask(store, { title: 'Foo' }, c);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    now = '2026-05-04T11:00:00Z';
    const first = await completeTask(store, created.value.path, {}, c);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstModified = first.value.task.date_modified;

    now = '2026-05-04T12:00:00Z';
    const second = await completeTask(store, created.value.path, {}, c);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.task.date_modified).toBe(firstModified);
  });

  it('refuses to operate on a recurring task', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'Foo' }, config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // Simulate a recurring task by patching directly.
    const file = (await store.read(created.value.path))!;
    await store.write(created.value.path, file.raw.replace(/^---/m, '---\nrecurrence: FREQ=DAILY'));
    const result = await completeTask(store, created.value.path, {}, config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid_input');
  });

  it('preserves an existing completed_date by default', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'Foo' }, config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // First completion stamps a date.
    await completeTask(store, created.value.path, { completionDay: '2026-01-15' }, config);
    // Second call with a different completionDay should preserve the first.
    const result = await completeTask(store, created.value.path, { completionDay: '2026-02-01' }, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task.completed_date).toBe('2026-01-15');
  });
});

describe('uncompleteTask', () => {
  it('reverts a completed task to default status', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'Foo' }, config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await completeTask(store, created.value.path, {}, config);
    const result = await uncompleteTask(store, created.value.path, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task.status).toBe('open');
    expect(result.value.task.completed_date).toBeUndefined();
  });

  it('is idempotent on a non-completed task', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'Foo' }, config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await uncompleteTask(store, created.value.path, config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task.status).toBe('open');
  });
});

describe('deleteTask', () => {
  it('removes the file', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'Foo' }, config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await deleteTask(store, created.value.path);
    expect(await store.exists(created.value.path)).toBe(false);
  });

  it('is idempotent on missing files', async () => {
    const store = new InMemoryTaskStore();
    const result = await deleteTask(store, 'nope.md');
    expect(result.ok).toBe(true);
  });
});

describe('round-trip through the store', () => {
  it('reads back exactly what was written', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, {
      title: 'Round-trip',
      tags: ['a', 'b'],
      contexts: ['@home'],
    }, config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const file = await store.read(created.value.path);
    expect(file).not.toBeNull();
    const { task } = parseTask(file!.raw);
    expect(task.title).toBe('Round-trip');
    expect(task.tags).toEqual(['a', 'b']);
    expect(task.contexts).toEqual(['@home']);
  });
});
