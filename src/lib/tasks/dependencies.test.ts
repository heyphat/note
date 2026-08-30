import { describe, it, expect } from 'vitest';
import { InMemoryTaskStore } from './in-memory-task-store';
import {
  addDependency as addDep,
  removeDependency as removeDep,
  replaceDependencies as replaceDeps,
  type DependenciesConfig,
  type DependencyInput,
} from './dependencies';
import { createTask } from './operations';
import type { TaskStore } from './task-store';

const config = {
  now: () => '2026-05-04T10:00:00Z',
  today: () => '2026-05-04',
};

// Bind `config.now` into every op call so date_modified can never land before
// the seeded date_created (would otherwise be timezone-clock-dependent).
const addDependency = (store: TaskStore, path: string, input: DependencyInput, c: DependenciesConfig = {}) =>
  addDep(store, path, input, { ...config, ...c });
const removeDependency = (store: TaskStore, path: string, uid: string, c: DependenciesConfig = {}) =>
  removeDep(store, path, uid, { ...config, ...c });
const replaceDependencies = (store: TaskStore, path: string, entries: DependencyInput[], c: DependenciesConfig = {}) =>
  replaceDeps(store, path, entries, { ...config, ...c });

describe('addDependency', () => {
  it('appends a new dependency', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await addDependency(store, created.value.path, { uid: '[[task-x]]' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.blocked_by).toEqual([{ uid: '[[task-x]]', reltype: 'FINISHTOSTART' }]);
  });

  it('rejects duplicate uids when enforce_unique_uid is true (default)', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    await addDependency(store, created.value.path, { uid: '[[task-x]]' });
    const dupe = await addDependency(store, created.value.path, { uid: '[[task-x]]' });
    expect(dupe.ok).toBe(false);
    if (dupe.ok) return;
    expect(dupe.code).toBe('duplicate_dependency_uid');
  });

  it('treats a duplicate as a no-op when enforce_unique_uid is false', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    await addDependency(store, created.value.path, { uid: '[[task-x]]' });
    const dupe = await addDependency(store, created.value.path, { uid: '[[task-x]]' }, { enforceUniqueUid: false });
    expect(dupe.ok).toBe(true);
    if (!dupe.ok) return;
    expect(dupe.changed).toBe(false);
  });

  it('rejects a self-dependency by id', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A', id: 'me' }, config);
    if (!created.ok) return;
    const result = await addDependency(store, created.value.path, { uid: 'me' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('self_dependency');
  });

  it('preserves an existing entry when adding a new one', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    await addDependency(store, created.value.path, { uid: '[[a]]' });
    const r = await addDependency(store, created.value.path, { uid: '[[b]]', reltype: 'STARTTOSTART', gap: 'P1D' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.task.blocked_by).toHaveLength(2);
    expect(r.task.blocked_by?.[1]).toEqual({ uid: '[[b]]', reltype: 'STARTTOSTART', gap: 'P1D' });
  });
});

describe('removeDependency', () => {
  it('removes a uid and is idempotent on a missing one', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    await addDependency(store, created.value.path, { uid: '[[a]]' });
    const removed = await removeDependency(store, created.value.path, '[[a]]');
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.task.blocked_by).toBeUndefined();

    const idempotent = await removeDependency(store, created.value.path, '[[never-there]]');
    expect(idempotent.ok).toBe(true);
    if (!idempotent.ok) return;
    expect(idempotent.changed).toBe(false);
  });
});

describe('replaceDependencies', () => {
  it('overwrites the entire list', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    await addDependency(store, created.value.path, { uid: '[[old]]' });
    const replaced = await replaceDependencies(store, created.value.path, [
      { uid: '[[new-a]]' }, { uid: '[[new-b]]', reltype: 'STARTTOSTART' },
    ]);
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.task.blocked_by).toEqual([
      { uid: '[[new-a]]', reltype: 'FINISHTOSTART' },
      { uid: '[[new-b]]', reltype: 'STARTTOSTART' },
    ]);
  });

  it('rejects duplicates in the replacement set', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    const r = await replaceDependencies(store, created.value.path, [
      { uid: '[[x]]' }, { uid: '[[x]]' },
    ]);
    expect(r.ok).toBe(false);
  });

  it('clears the list when given an empty array', async () => {
    const store = new InMemoryTaskStore();
    const created = await createTask(store, { title: 'A' }, config);
    if (!created.ok) return;
    await addDependency(store, created.value.path, { uid: '[[a]]' });
    const r = await replaceDependencies(store, created.value.path, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.task.blocked_by).toBeUndefined();
  });
});
