import { describe, it, expect } from 'vitest';
import { InMemoryTaskStore } from './in-memory-task-store';
import { TaskIndex } from './task-index';
import { loadAllTasks, refreshTask } from './task-loader';
import { createTask, updateTask } from './operations';

const config = {
  now: () => '2026-05-04T10:00:00Z',
  today: () => '2026-05-04',
};

describe('loadAllTasks', () => {
  it('populates the index from every task in the store', async () => {
    const store = new InMemoryTaskStore();
    await createTask(store, { title: 'A', priority: 'high' }, config);
    await createTask(store, { title: 'B', priority: 'low' }, config);

    const index = new TaskIndex();
    const result = await loadAllTasks(store, index);
    expect(result.loaded).toBe(2);
    expect(result.failed).toEqual([]);
    expect(index.size()).toBe(2);
    expect(index.byPriority('high')).toHaveLength(1);
    expect(index.byPriority('low')).toHaveLength(1);
  });

  it('reports malformed files in `failed` and skips them', async () => {
    const store = new InMemoryTaskStore();
    store.put('broken.md', '---\nstatus: "unclosed string\n---\n');
    await createTask(store, { title: 'good' }, config);

    const index = new TaskIndex();
    const result = await loadAllTasks(store, index);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].path).toBe('broken.md');
    expect(index.size()).toBe(1);
  });
});

describe('refreshTask', () => {
  it('upserts a single task after an external write', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A', priority: 'low' }, config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const index = new TaskIndex();
    await loadAllTasks(store, index);
    expect(index.byPriority('low')).toHaveLength(1);

    await updateTask(store, created.value.path, { priority: 'high' }, config);
    await refreshTask(store, index, created.value.path);

    expect(index.byPriority('low')).toHaveLength(0);
    expect(index.byPriority('high')).toHaveLength(1);
  });

  it('removes a task from the index when its file is gone', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const index = new TaskIndex();
    await loadAllTasks(store, index);
    await store.delete(created.value.path);
    await refreshTask(store, index, created.value.path);
    expect(index.size()).toBe(0);
  });
});
