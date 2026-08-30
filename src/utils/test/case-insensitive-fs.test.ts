// Tests for the case-insensitive FS mock itself. The downstream
// browser-fs.test.ts regression tests are only as trustworthy as this
// mock — if the mock fails to reproduce APFS/NTFS case-insensitive
// lookup, the bug-trigger conditions never actually fire and the tests
// pass vacuously. So we assert the mock's contract here directly.

import { describe, it, expect } from 'vitest';
import { createMockDirectoryHandle, type MockDirectoryHandle } from './case-insensitive-fs';

async function writeText(h: FileSystemFileHandle, content: string) {
  const w = await h.createWritable();
  await w.write(content);
  await w.close();
}

async function readText(h: FileSystemFileHandle): Promise<string> {
  const f = await h.getFile();
  return f.text();
}

describe('case-insensitive FS mock — case-insensitive mode', () => {
  it('looks up files by lowercased name', async () => {
    const root = createMockDirectoryHandle();
    const a = await root.getFileHandle('Foo.md', { create: true });
    await writeText(a, 'hello');
    // Different casing must resolve to the same entry.
    const b = await root.getFileHandle('FOO.md');
    expect(await readText(b)).toBe('hello');
    const c = await root.getFileHandle('foo.md');
    expect(await readText(c)).toBe('hello');
  });

  it('preserves canonical case when looked up with different casing', async () => {
    const root = createMockDirectoryHandle();
    await root.getFileHandle('Foo.md', { create: true });
    // getFileHandle with different case must NOT update canonical case
    // (this mirrors APFS: looking up "foo.md" returns the existing entry
    // but the on-disk name stays "Foo.md").
    await root.getFileHandle('foo.md');
    expect(root.__names()).toContain('Foo.md');
    expect(root.__names()).not.toContain('foo.md');
  });

  it('reproduces the data-loss bug: getFileHandle(new,{create}) + removeEntry(old) deletes the same file', async () => {
    const root = createMockDirectoryHandle();
    const orig = await root.getFileHandle('How people.md', { create: true });
    await writeText(orig, 'original content');
    // The unsafe pattern: ask for the new case with create:true, write,
    // then remove the old name. On case-insensitive FS this deletes the
    // file. The mock MUST reproduce this so that the regression tests
    // can prove the new helpers avoid it.
    const aliased = await root.getFileHandle('How People.md', { create: true });
    await writeText(aliased, 'new content');
    await root.removeEntry('How people.md');
    // File is gone — both case variants must now be missing.
    expect(root.__exists('How people.md')).toBe(false);
    expect(root.__exists('How People.md')).toBe(false);
  });

  it('removeEntry deletes by case-insensitive lookup', async () => {
    const root = createMockDirectoryHandle();
    await root.getFileHandle('Mixed.md', { create: true });
    await root.removeEntry('MIXED.md');
    expect(root.__names()).toEqual([]);
  });

  it('directories follow the same case-insensitive rules', async () => {
    const root = createMockDirectoryHandle();
    const a = await root.getDirectoryHandle('Projects', { create: true });
    await a.getFileHandle('child.md', { create: true });
    // Different-case lookup returns same dir.
    const b = await root.getDirectoryHandle('PROJECTS');
    const child = await b.getFileHandle('child.md');
    expect(child).toBeDefined();
    // Canonical case unchanged.
    expect(root.__names()).toContain('Projects');
    expect(root.__names()).not.toContain('PROJECTS');
  });

  it('throws TypeMismatchError when a name resolves to the wrong kind', async () => {
    const root = createMockDirectoryHandle();
    await root.getFileHandle('thing', { create: true });
    await expect(root.getDirectoryHandle('thing')).rejects.toMatchObject({ name: 'TypeMismatchError' });
  });

  it('throws NotFoundError when looking up a missing entry without create', async () => {
    const root = createMockDirectoryHandle();
    await expect(root.getFileHandle('nope.md')).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(root.removeEntry('nope.md')).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('case-insensitive FS mock — case-sensitive mode', () => {
  it('treats different-case names as distinct entries', async () => {
    const root = createMockDirectoryHandle({ caseMode: 'sensitive' });
    const a = await root.getFileHandle('Foo.md', { create: true });
    await writeText(a, 'A');
    const b = await root.getFileHandle('foo.md', { create: true });
    await writeText(b, 'B');
    // Two distinct files must coexist.
    expect(root.__names().sort()).toEqual(['Foo.md', 'foo.md']);
    expect(await readText(await root.getFileHandle('Foo.md'))).toBe('A');
    expect(await readText(await root.getFileHandle('foo.md'))).toBe('B');
  });

  it('removeEntry(old) does NOT delete the new-case sibling', async () => {
    const root = createMockDirectoryHandle({ caseMode: 'sensitive' });
    const a = await root.getFileHandle('Foo.md', { create: true });
    await writeText(a, 'A');
    const b = await root.getFileHandle('foo.md', { create: true });
    await writeText(b, 'B');
    await root.removeEntry('Foo.md');
    // foo.md (lowercase) must remain.
    expect(root.__names()).toEqual(['foo.md']);
    expect(await readText(await root.getFileHandle('foo.md'))).toBe('B');
  });
});

describe('case-insensitive FS mock — move()', () => {
  it('renames a file in place and preserves content', async () => {
    const root = createMockDirectoryHandle();
    const h = await root.getFileHandle('old.md', { create: true });
    await writeText(h, 'hello');
    const moveable = h as FileSystemFileHandle & { move: (n: string) => Promise<void> };
    await moveable.move('new.md');
    expect(root.__exists('old.md')).toBe(false);
    expect(root.__exists('new.md')).toBe(true);
    const reread = await root.getFileHandle('new.md');
    expect(await readText(reread)).toBe('hello');
  });

  it('updates canonical case on a case-only move (the move-supported branch of safeRenameFile)', async () => {
    const root = createMockDirectoryHandle();
    const h = await root.getFileHandle('hello.md', { create: true });
    await writeText(h, 'content');
    const moveable = h as FileSystemFileHandle & { move: (n: string) => Promise<void> };
    await moveable.move('Hello.md');
    expect(root.__names()).toContain('Hello.md');
    expect(root.__names()).not.toContain('hello.md');
    // Content survives the canonical-case update.
    expect(await readText(await root.getFileHandle('Hello.md'))).toBe('content');
  });

  it('throws when the target name already exists with a different entry', async () => {
    const root = createMockDirectoryHandle();
    const h1 = await root.getFileHandle('one.md', { create: true });
    await root.getFileHandle('two.md', { create: true });
    const moveable = h1 as FileSystemFileHandle & { move: (n: string) => Promise<void> };
    await expect(moveable.move('two.md')).rejects.toMatchObject({ name: 'InvalidModificationError' });
  });

  it('strips move() entirely when supportsMove: false (fallback-path test substrate)', async () => {
    const root = createMockDirectoryHandle({ supportsMove: false });
    const h = await root.getFileHandle('a.md', { create: true });
    expect((h as FileSystemFileHandle & { move?: unknown }).move).toBeUndefined();
    const dir = await root.getDirectoryHandle('d', { create: true });
    expect((dir as FileSystemDirectoryHandle & { move?: unknown }).move).toBeUndefined();
  });

  it('renames a directory in place', async () => {
    const root = createMockDirectoryHandle();
    const dir = await root.getDirectoryHandle('Projects', { create: true });
    await dir.getFileHandle('child.md', { create: true });
    const moveable = dir as FileSystemDirectoryHandle & { move: (n: string) => Promise<void> };
    await moveable.move('Archive');
    expect(root.__exists('Projects')).toBe(false);
    expect(root.__exists('Archive')).toBe(true);
    const reread = await root.getDirectoryHandle('Archive') as MockDirectoryHandle;
    expect(reread.__exists('child.md')).toBe(true);
  });
});

describe('case-insensitive FS mock — entries / iteration', () => {
  it('yields canonical names in entries()', async () => {
    const root = createMockDirectoryHandle();
    await root.getFileHandle('Foo.md', { create: true });
    await root.getDirectoryHandle('Bar', { create: true });
    const names: string[] = [];
    for await (const [name] of (root as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      names.push(name);
    }
    expect(names.sort()).toEqual(['Bar', 'Foo.md']);
  });
});
