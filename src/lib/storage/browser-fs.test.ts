// Regression tests for the title-driven rename data-loss bug. Each of the
// 5 callsites refactored to use safeRenameFile / safeRenameDir is exercised
// here against a case-insensitive in-memory FS mock — the same conditions
// that delete files on macOS APFS / Windows NTFS in production.
//
// The pre-fix behavior would lose the file in every test below. The
// post-fix behavior preserves content unconditionally; only the on-disk
// canonical casing varies depending on whether move() is supported.

import { describe, it, expect } from 'vitest';
import { BrowserFsStore } from './browser-fs';
import { createMockDirectoryHandle, type MockDirectoryHandle } from '@/utils/test/case-insensitive-fs';

function newStore(opts?: { caseMode?: 'sensitive' | 'insensitive'; supportsMove?: boolean }) {
  const root = createMockDirectoryHandle({
    caseMode: opts?.caseMode ?? 'insensitive',
    supportsMove: opts?.supportsMove ?? true,
  });
  const store = new BrowserFsStore('test-user');
  // Inject the mock root directly — bypasses the picker / IndexedDB path
  // so tests can drive saveContent / rename / etc. without browser APIs.
  // After the BrowserFsStore split, the handle lives on the
  // PermissionsController held at `perms` rather than on the store itself.
  (store as unknown as { perms: { dirHandle: FileSystemDirectoryHandle } }).perms.dirHandle = root;
  return { store, root };
}

describe('case-insensitive FS data-loss regression — saveContent', () => {
  it('preserves the file when an auto-title rewrite changes only the casing', async () => {
    const { store, root } = newStore();
    // Create a note titled "How people think in the age of AI?". The `?` is
    // stripped by sanitizeNoteTitle, yielding "How people think in the age
    // of AI.md".
    const created = await store.create('How people think in the age of AI?', '## How people think in the age of AI?\n\nbody', 'unsorted');
    expect(created.id).toBe('unsorted/How people think in the age of AI.md');

    // Simulate the AI-driven body rewrite: heading flips to Title Case
    // (and drops the `?`). Auto-title would derive the new title from the
    // body and pass it to saveContent, triggering the title-driven rename.
    const newBody = '## How People Think in the Age of AI\n\nbody';
    const meta = await store.saveContent(created.id, newBody, 'How People Think in the Age of AI');

    // The file MUST still exist with the new content. On case-insensitive
    // FS with move() support, the canonical name updates to the new case.
    // Without move() support, casing stays as the original — but content
    // is preserved either way.
    const unsorted = await root.getDirectoryHandle('unsorted') as MockDirectoryHandle;
    expect(unsorted.__exists('How People Think in the Age of AI.md')).toBe(true);
    const onDisk = await unsorted.__read('How People Think in the Age of AI.md');
    expect(onDisk).toContain('How People Think in the Age of AI');
    expect(onDisk).toContain('body');
    // Frontmatter UUID is preserved across the rename.
    expect(onDisk).toContain(`id: ${created.uuid}`);
    // The returned id reflects the new filename casing.
    expect(meta.id).toBe('unsorted/How People Think in the Age of AI.md');
  });

  it('preserves content even when move() is unsupported', async () => {
    const { store, root } = newStore({ supportsMove: false });
    const created = await store.create('Foo bar', '## Foo bar\n\nbody', 'unsorted');
    const newBody = '## Foo Bar\n\nbody';
    await store.saveContent(created.id, newBody, 'Foo Bar');
    const unsorted = await root.getDirectoryHandle('unsorted') as MockDirectoryHandle;
    // File still readable under either case (case-insensitive lookup).
    // Canonical casing stays as "Foo bar.md" because move() isn't
    // available — strictly cosmetic regression.
    const onDisk = await unsorted.__read('Foo Bar.md');
    expect(onDisk).toContain('Foo Bar');
    expect(onDisk).toContain('body');
    expect(unsorted.__names()).toContain('Foo bar.md');
  });

  it('still renames truly-different filenames via the standard path', async () => {
    const { store, root } = newStore();
    const created = await store.create('Old name', '## Old name\n\nbody', 'unsorted');
    await store.saveContent(created.id, '## Brand new title\n\nbody', 'Brand new title');
    const unsorted = await root.getDirectoryHandle('unsorted') as MockDirectoryHandle;
    expect(unsorted.__exists('Brand new title.md')).toBe(true);
    expect(unsorted.__exists('Old name.md')).toBe(false);
  });
});

describe('case-insensitive FS data-loss regression — rename', () => {
  it('preserves the file on a case-only manual title rename', async () => {
    const { store, root } = newStore();
    const created = await store.create('Hello world', '## Hello world\n', 'unsorted');
    const meta = await store.rename(created.id, 'Hello World');
    const unsorted = await root.getDirectoryHandle('unsorted') as MockDirectoryHandle;
    expect(unsorted.__exists('Hello World.md')).toBe(true);
    const onDisk = await unsorted.__read('Hello World.md');
    expect(onDisk).toContain('title: Hello World');
    expect(meta.title).toBe('Hello World');
  });

  it('preserves the file with no move() support', async () => {
    const { store, root } = newStore({ supportsMove: false });
    const created = await store.create('Hello world', '## Hello world\n', 'unsorted');
    await store.rename(created.id, 'Hello World');
    const unsorted = await root.getDirectoryHandle('unsorted') as MockDirectoryHandle;
    // Content preserved; canonical case stays at the original (cosmetic).
    const onDisk = await unsorted.__read('Hello World.md');
    expect(onDisk).toContain('title: Hello World');
    expect(unsorted.__names()).toContain('Hello world.md');
  });

  it('snapshots history before the rename so a future regression is recoverable', async () => {
    const { store, root } = newStore();
    const created = await store.create('Hello world', '## Hello world\nbody-v1', 'unsorted');
    await store.rename(created.id, 'Hello World');
    // History dir lives at .history/<uuid>/ and should contain a snapshot
    // of the pre-rename body.
    const history = await root.getDirectoryHandle('.history') as MockDirectoryHandle;
    const noteHistory = await history.getDirectoryHandle(created.uuid!) as MockDirectoryHandle;
    expect(noteHistory.__names().length).toBeGreaterThan(0);
  });
});

describe('case-insensitive FS data-loss regression — renameTemplate', () => {
  it('preserves the template on a case-only rename', async () => {
    const { store, root } = newStore();
    const created = await store.createTemplate('Daily standup', 'tpl content');
    await store.renameTemplate(created.id, 'Daily Standup');
    const tplDir = await (await root.getDirectoryHandle('.assets') as MockDirectoryHandle)
      .getDirectoryHandle('templates') as MockDirectoryHandle;
    expect(tplDir.__exists('Daily Standup.md')).toBe(true);
    const onDisk = await tplDir.__read('Daily Standup.md');
    expect(onDisk).toContain('Daily Standup');
    expect(onDisk).toContain('tpl content');
  });

  it('preserves the template without move() support', async () => {
    const { store, root } = newStore({ supportsMove: false });
    const created = await store.createTemplate('Template name', 'tpl content');
    await store.renameTemplate(created.id, 'Template Name');
    const tplDir = await (await root.getDirectoryHandle('.assets') as MockDirectoryHandle)
      .getDirectoryHandle('templates') as MockDirectoryHandle;
    const onDisk = await tplDir.__read('Template Name.md');
    expect(onDisk).toContain('tpl content');
    expect(tplDir.__names()).toContain('Template name.md');
  });
});

describe('case-insensitive FS data-loss regression — renameFolder', () => {
  it('preserves folder contents on a case-only rename', async () => {
    const { store, root } = newStore();
    await store.createFolder('projects');
    await store.create('child', '## child\n', 'projects');
    await store.renameFolder('projects', 'Projects');
    // The folder still has the child note. With move() supported, the
    // canonical case becomes "Projects".
    const projectsDir = await root.getDirectoryHandle('Projects') as MockDirectoryHandle;
    expect(projectsDir.__exists('child.md')).toBe(true);
  });

  it('preserves folder contents without move() support', async () => {
    const { store, root } = newStore({ supportsMove: false });
    await store.createFolder('projects');
    await store.create('child', '## child\n', 'projects');
    await store.renameFolder('projects', 'Projects');
    // Casing stays at the original "projects" but the child note remains.
    const dir = await root.getDirectoryHandle('Projects') as MockDirectoryHandle;
    expect(dir.__exists('child.md')).toBe(true);
    expect(root.__names()).toContain('projects');
  });

  it('does not falsely flag a case-only rename as a collision', async () => {
    const { store } = newStore();
    await store.createFolder('foo');
    // Pre-fix: getDirectoryHandle('FOO') case-insensitively resolves to
    // the source dir itself, which the precheck used to interpret as a
    // pre-existing collision and reject.
    await expect(store.renameFolder('foo', 'FOO')).resolves.not.toThrow();
  });

  it('still rejects a real collision between distinct folder names', async () => {
    const { store } = newStore({ caseMode: 'sensitive' });
    await store.createFolder('alpha');
    await store.createFolder('beta');
    await expect(store.renameFolder('alpha', 'beta')).rejects.toThrow(/already exists/);
  });
});

describe('recoverNote — recreates a missing file', () => {
  it('creates the file at id with frontmatter built from opts', async () => {
    const { store, root } = newStore();
    const meta = await store.recoverNote(
      'unsorted/Recovered.md',
      'recovered body',
      { uuid: '11111111-2222-3333-4444-555555555555', title: 'Recovered', createdAt: '2026-01-01T00:00:00.000Z' },
    );
    const unsorted = await root.getDirectoryHandle('unsorted') as MockDirectoryHandle;
    expect(unsorted.__exists('Recovered.md')).toBe(true);
    const onDisk = await unsorted.__read('Recovered.md');
    expect(onDisk).toContain('id: 11111111-2222-3333-4444-555555555555');
    expect(onDisk).toContain('title: Recovered');
    expect(onDisk).toContain('createdAt: 2026-01-01T00:00:00.000Z');
    expect(onDisk).toContain('recovered body');
    expect(meta.uuid).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('creates parent folders if they do not exist', async () => {
    const { store, root } = newStore();
    await store.recoverNote(
      'projects/sub/Note.md',
      'body',
      { uuid: 'u-1', title: 'Note' },
    );
    const sub = await (await root.getDirectoryHandle('projects') as MockDirectoryHandle)
      .getDirectoryHandle('sub') as MockDirectoryHandle;
    expect(sub.__exists('Note.md')).toBe(true);
  });

  it('overwrites an existing file at id (idempotent)', async () => {
    const { store, root } = newStore();
    await store.create('Existing', '## Existing\nold', 'unsorted');
    await store.recoverNote(
      'unsorted/Existing.md',
      'fresh body',
      { uuid: 'u-2', title: 'Existing' },
    );
    const unsorted = await root.getDirectoryHandle('unsorted') as MockDirectoryHandle;
    const onDisk = await unsorted.__read('Existing.md');
    expect(onDisk).toContain('fresh body');
    expect(onDisk).toContain('id: u-2');
  });
});

describe('listHistoryByUuid / getHistoryVersionByUuid — work without the live file', () => {
  it('returns the snapshot list and content even after the live file is deleted', async () => {
    const { store, root } = newStore();
    const created = await store.create('Doomed', '## Doomed\nbody-v1', 'unsorted');
    expect(created.uuid).toBeDefined();
    // Trigger a history snapshot by saving a second version.
    await store.saveContent(created.id, 'body-v2', 'Doomed');
    // Now remove the live file from disk (simulating the data-loss bug
    // pre-fix, or an external delete).
    const unsorted = await root.getDirectoryHandle('unsorted') as MockDirectoryHandle;
    await unsorted.removeEntry('Doomed.md');
    expect(unsorted.__exists('Doomed.md')).toBe(false);
    // listHistory(id) returns [] because resolveNoteUuid reads the missing file.
    expect(await store.listHistory(created.id)).toEqual([]);
    // listHistoryByUuid(uuid) still works — that's the whole point.
    const ts = await store.listHistoryByUuid(created.uuid!);
    expect(ts.length).toBeGreaterThan(0);
    const raw = await store.getHistoryVersionByUuid(created.uuid!, ts[0]);
    expect(raw).toContain('body-v1');
  });

  it('returns [] / null for an unknown uuid', async () => {
    const { store } = newStore();
    expect(await store.listHistoryByUuid('does-not-exist')).toEqual([]);
    expect(await store.getHistoryVersionByUuid('does-not-exist', '2026-01-01T00-00-00.000Z')).toBeNull();
  });
});

describe('case-insensitive FS data-loss regression — migrateNoteSideFiles', () => {
  it('preserves a legacy .assets/ sidecar dir across a case-only rename', async () => {
    const { store, root } = newStore();
    // Set up: create a note + a legacy .assets sidecar dir alongside it.
    // The migrate path is triggered by saveContent when the title-driven
    // rename produces a different basename. We simulate that here by
    // manually placing a sidecar then triggering a case-only rename.
    const created = await store.create('Foo bar', '## Foo bar\n', 'unsorted');
    const unsorted = await root.getDirectoryHandle('unsorted') as MockDirectoryHandle;
    const sidecar = await unsorted.getDirectoryHandle('Foo bar.assets', { create: true });
    const asset = await (sidecar as MockDirectoryHandle).getFileHandle('img.png', { create: true });
    const w = await asset.createWritable();
    await w.write('PNGDATA');
    await w.close();
    // Trigger a case-only title rename that propagates to the sidecar.
    await store.saveContent(created.id, '## Foo Bar\n', 'Foo Bar');
    // Sidecar must still exist with its content. Canonical name may
    // update to "Foo Bar.assets" (move() supported) or stay as the old
    // case (no move()), but the asset must be intact either way.
    const reloadedSidecar = await unsorted.getDirectoryHandle('Foo Bar.assets') as MockDirectoryHandle;
    const img = await reloadedSidecar.getFileHandle('img.png');
    const file = await img.getFile();
    expect(await file.text()).toBe('PNGDATA');
  });
});
