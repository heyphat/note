import { describe, it, expect } from 'vitest';
import { InMemoryTaskStore } from './in-memory-task-store';
import {
  activeEntry,
  removeEntry as removeEntryFn,
  replaceEntries as replaceEntriesFn,
  startTimer as startTimerFn,
  stopTimer as stopTimerFn,
  totalMs,
  type TimeTrackingConfig,
} from './time-tracking';
import type { TimeEntry } from './spec-types';
import type { TaskStore } from './task-store';
import { createTask } from './operations';
import { parseTask } from './parse-task';

const config = {
  now: () => '2026-05-04T10:00:00Z',
  today: () => '2026-05-04',
};

const startTimer = (store: TaskStore, path: string, opts: { description?: string } = {}, c: TimeTrackingConfig = {}) =>
  startTimerFn(store, path, opts, { ...config, ...c });
const stopTimer = (store: TaskStore, path: string, c: TimeTrackingConfig = {}) =>
  stopTimerFn(store, path, { ...config, ...c });
const removeEntry = (store: TaskStore, path: string, index: number, c: TimeTrackingConfig = {}) =>
  removeEntryFn(store, path, index, { ...config, ...c });
const replaceEntries = (store: TaskStore, path: string, entries: TimeEntry[], c: TimeTrackingConfig = {}) =>
  replaceEntriesFn(store, path, entries, { ...config, ...c });

describe('startTimer / stopTimer', () => {
  it('starts and stops, recording an entry', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;

    let now = '2026-05-04T10:00:00Z';
    const cfg = { now: () => now };
    const start = await startTimer(store, created.value.path, {}, cfg);
    expect(start.ok).toBe(true);

    now = '2026-05-04T11:30:00Z';
    const stop = await stopTimer(store, created.value.path, cfg);
    expect(stop.ok).toBe(true);
    if (!stop.ok) return;
    expect(stop.task.time_entries).toHaveLength(1);
    expect(stop.task.time_entries?.[0]).toEqual({
      startTime: '2026-05-04T10:00:00Z',
      endTime: '2026-05-04T11:30:00Z',
    });
  });

  it('refuses to start when one is already active (§2.6.1 invariant)', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    await startTimer(store, created.value.path, {}, config);
    const second = await startTimer(store, created.value.path, {}, config);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('multiple_active_time_entries');
  });

  it('stop is idempotent when no active entry exists', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    const r = await stopTimer(store, created.value.path, config);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toBe(false);
  });
});

describe('removeEntry', () => {
  it('removes one entry by index', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    await replaceEntries(store, created.value.path, [
      { startTime: '2026-05-04T10:00:00Z', endTime: '2026-05-04T11:00:00Z' },
      { startTime: '2026-05-04T12:00:00Z', endTime: '2026-05-04T13:00:00Z' },
    ]);
    const r = await removeEntry(store, created.value.path, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.task.time_entries).toHaveLength(1);
    expect(r.task.time_entries?.[0].startTime).toBe('2026-05-04T12:00:00Z');
  });

  it('is idempotent on out-of-range indices', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    const r = await removeEntry(store, created.value.path, 99);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toBe(false);
  });
});

describe('replaceEntries', () => {
  it('rejects a replacement with multiple active entries', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    const r = await replaceEntries(store, created.value.path, [
      { startTime: '2026-05-04T10:00:00Z' },
      { startTime: '2026-05-04T11:00:00Z' },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('multiple_active_time_entries');
  });
});

describe('reporting helpers', () => {
  it('activeEntry returns the running session', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    await startTimer(store, created.value.path, {}, config);
    const file = await store.read(created.value.path);
    const { task } = parseTask(file!.raw);
    expect(activeEntry(task)).toBeDefined();
  });

  it('totalMs sums closed entries only', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    await replaceEntries(store, created.value.path, [
      { startTime: '2026-05-04T10:00:00Z', endTime: '2026-05-04T11:00:00Z' }, // 1h
      { startTime: '2026-05-04T12:00:00Z', endTime: '2026-05-04T12:30:00Z' }, // 30m
      { startTime: '2026-05-04T13:00:00Z' }, // active, excluded
    ]);
    const file = await store.read(created.value.path);
    const { task } = parseTask(file!.raw);
    expect(totalMs(task)).toBe(90 * 60 * 1000);
  });
});
