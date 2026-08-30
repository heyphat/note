import { describe, it, expect } from 'vitest';
import { InMemoryTaskStore } from './in-memory-task-store';
import {
  addReminder as addRem,
  computeTriggers,
  removeReminder as removeRem,
  updateReminder as updateRem,
  type ReminderConfig,
  type ReminderInput,
} from './reminders';
import type { TaskStore } from './task-store';
import { createTask } from './operations';
import { parseTask } from './parse-task';
import type { Task } from './spec-types';

const config = {
  now: () => '2026-05-04T10:00:00Z',
  today: () => '2026-05-04',
};

const addReminder = (store: TaskStore, path: string, input: ReminderInput, c: ReminderConfig = {}) =>
  addRem(store, path, input, { ...config, ...c });
const updateReminder = (store: TaskStore, path: string, id: string, patch: Partial<ReminderInput>, c: ReminderConfig = {}) =>
  updateRem(store, path, id, patch, { ...config, ...c });
const removeReminder = (store: TaskStore, path: string, id: string, c: ReminderConfig = {}) =>
  removeRem(store, path, id, { ...config, ...c });

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    title: 't',
    status: 'open',
    date_created: '2026-05-04T10:00:00Z',
    date_modified: '2026-05-04T10:00:00Z',
    _frontmatter: {},
    body: '',
    ...overrides,
  };
}

describe('addReminder', () => {
  it('adds a relative reminder', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A', due: '2026-05-10' }, config);
    if (!created.ok) return;
    const result = await addReminder(store, created.value.path, {
      type: 'relative', relatedTo: 'due', offset: '-P1D',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.reminders).toHaveLength(1);
    expect(result.task.reminders?.[0]).toMatchObject({
      type: 'relative', relatedTo: 'due', offset: '-P1D',
    });
  });

  it('auto-generates an id when caller omits one', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A', due: '2026-05-10' }, config);
    if (!created.ok) return;
    const result = await addReminder(store, created.value.path, {
      type: 'relative', relatedTo: 'due', offset: '-P1D',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.reminders?.[0].id).toBeTruthy();
  });

  it('rejects duplicate ids', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A', due: '2026-05-10' }, config);
    if (!created.ok) return;
    await addReminder(store, created.value.path, { id: 'r1', type: 'relative', relatedTo: 'due', offset: '-P1D' });
    const dupe = await addReminder(store, created.value.path, { id: 'r1', type: 'relative', relatedTo: 'due', offset: '-PT1H' });
    expect(dupe.ok).toBe(false);
    if (dupe.ok) return;
    expect(dupe.code).toBe('duplicate_reminder_id');
  });

  it('refuses to write when the relative reminder base is missing (validation)', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    const result = await addReminder(store, created.value.path, {
      id: 'r1', type: 'relative', relatedTo: 'due', offset: '-P1D',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('validation_failed');
  });
});

describe('updateReminder', () => {
  it('patches a single reminder by id', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A', due: '2026-05-10' }, config);
    if (!created.ok) return;
    await addReminder(store, created.value.path, { id: 'r1', type: 'relative', relatedTo: 'due', offset: '-P1D' });
    const updated = await updateReminder(store, created.value.path, 'r1', { offset: '-PT2H' });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.task.reminders?.[0]).toMatchObject({ offset: '-PT2H' });
  });

  it('returns mutator_rejected when id is unknown', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    const r = await updateReminder(store, created.value.path, 'nope', { offset: '-P1D' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('reminder_not_found');
  });
});

describe('removeReminder', () => {
  it('removes by id and is idempotent', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A', due: '2026-05-10' }, config);
    if (!created.ok) return;
    await addReminder(store, created.value.path, { id: 'r1', type: 'relative', relatedTo: 'due', offset: '-P1D' });
    const r = await removeReminder(store, created.value.path, 'r1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.task.reminders).toBeUndefined();

    const idempotent = await removeReminder(store, created.value.path, 'r1');
    expect(idempotent.ok).toBe(true);
    if (!idempotent.ok) return;
    expect(idempotent.changed).toBe(false);
  });
});

describe('computeTriggers', () => {
  it('uses absoluteTime for absolute reminders', () => {
    const task = makeTask({
      reminders: [{ id: 'r1', type: 'absolute', absoluteTime: '2026-05-10T09:00:00Z' }],
    });
    const triggers = computeTriggers(task);
    expect(triggers).toHaveLength(1);
    expect(triggers[0].triggerInstant).toBe('2026-05-10T09:00:00Z');
  });

  it('computes relative reminder against `due`', () => {
    const task = makeTask({
      due: '2026-05-10',
      reminders: [{ id: 'r1', type: 'relative', relatedTo: 'due', offset: '-PT2H' }],
    });
    const triggers = computeTriggers(task);
    expect(triggers[0].triggerInstant).toBe('2026-05-09T22:00:00Z');
  });

  it('marks unresolvable when base field is missing', () => {
    const task = makeTask({
      reminders: [{ id: 'r1', type: 'relative', relatedTo: 'due', offset: '-P1D' }],
    });
    const triggers = computeTriggers(task);
    expect(triggers[0].triggerInstant).toBeNull();
    expect(triggers[0].unresolved).toBe('missing_base');
  });

  it('sorts ascending and ties break on id', () => {
    const task = makeTask({
      reminders: [
        { id: 'b', type: 'absolute', absoluteTime: '2026-05-10T10:00:00Z' },
        { id: 'a', type: 'absolute', absoluteTime: '2026-05-10T10:00:00Z' },
        { id: 'c', type: 'absolute', absoluteTime: '2026-05-09T10:00:00Z' },
      ],
    });
    const triggers = computeTriggers(task);
    expect(triggers.map(t => t.reminder.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('round-trip through the store', () => {
  it('persists reminders correctly', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A', due: '2026-05-10' }, config);
    if (!created.ok) return;
    await addReminder(store, created.value.path, { id: 'r1', type: 'relative', relatedTo: 'due', offset: '-P1D' });
    const file = await store.read(created.value.path);
    expect(file).not.toBeNull();
    const { task } = parseTask(file!.raw);
    expect(task.reminders?.[0]).toMatchObject({ id: 'r1', type: 'relative', relatedTo: 'due', offset: '-P1D' });
  });
});
