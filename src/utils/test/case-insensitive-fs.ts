// In-memory FileSystemDirectoryHandle mock with toggleable case sensitivity.
// Drives BrowserFsStore in tests without touching the real File System Access
// API. The whole point of this mock is to surface the case-insensitive-FS
// data-loss class of bugs that prompted the safeRenameFile / safeRenameDir
// helpers — see browser-fs.ts.
//
// Mirrors APFS / NTFS behavior when `caseMode: 'insensitive'`:
//   - getFileHandle / getDirectoryHandle look up by name.toLowerCase().
//   - Asking for a name with different casing returns the EXISTING entry
//     without changing its canonical case (this is the bug-trigger).
//   - removeEntry deletes by lowercase key — so removeEntry on an old
//     filename will delete the entry we just wrote under the new name if
//     they case-fold to the same key. This is exactly the data-loss path
//     safeRenameFile must avoid.
//   - File / dir handles expose a `move(newName)` method that renames the
//     entry's lowercase key + canonical name in place, preserving the
//     content — mirroring `FileSystemFileHandle.move()` from the spec.
//   - `supportsMove: false` strips the move() method so we can exercise
//     the no-move-support fallback path.

type FileEntry = {
  kind: 'file';
  canonicalName: string;
  content: ArrayBuffer;
  lastModified: number;
};
type DirEntry = {
  kind: 'directory';
  canonicalName: string;
  children: Map<string, FileEntry | DirEntry>;
};
type Entry = FileEntry | DirEntry;

export type CaseMode = 'sensitive' | 'insensitive';

export type MockFsOptions = {
  caseMode?: CaseMode;
  supportsMove?: boolean;
};

export type MockDirectoryHandle = FileSystemDirectoryHandle & {
  /** Test-only: dump the on-disk tree as a plain object for assertions. */
  __dump(): unknown;
  /** Test-only: case-insensitively read a file's text content. */
  __read(name: string): Promise<string>;
  /** Test-only: case-insensitively check if a name exists. */
  __exists(name: string): boolean;
  /** Test-only: list canonical names at this level. */
  __names(): string[];
};

export function createMockDirectoryHandle(opts?: MockFsOptions): MockDirectoryHandle {
  const caseMode: CaseMode = opts?.caseMode ?? 'insensitive';
  const supportsMove = opts?.supportsMove ?? true;

  const key = (name: string) => caseMode === 'insensitive' ? name.toLowerCase() : name;

  // Map every Entry to its containing DirEntry so move() can find its
  // parent without the caller passing it in.
  const parentOf = new WeakMap<Entry, DirEntry>();

  const root: DirEntry = { kind: 'directory', canonicalName: '', children: new Map() };

  const renameInPlace = (parent: DirEntry, e: Entry, newName: string) => {
    const newK = key(newName);
    const existing = parent.children.get(newK);
    if (existing && existing !== e) {
      throw makeError('InvalidModificationError', `Cannot move: ${newName} already exists`);
    }
    let oldK: string | undefined;
    for (const [k, v] of Array.from(parent.children.entries())) {
      if (v === e) { oldK = k; break; }
    }
    if (oldK !== undefined && oldK !== newK) parent.children.delete(oldK);
    e.canonicalName = newName;
    parent.children.set(newK, e);
  };

  const wrapFile = (entry: FileEntry): FileSystemFileHandle => {
    const handle: Record<string, unknown> = {
      kind: 'file',
      get name() { return entry.canonicalName; },
      async getFile() {
        // jsdom's Blob in older releases lacks `.text()` / `.arrayBuffer()`
        // — provide explicit shims so BrowserFsStore (which calls both)
        // works regardless of the environment's Blob fidelity.
        const buf = entry.content;
        const decoded = new TextDecoder().decode(buf);
        const fakeFile: Record<string, unknown> = {
          name: entry.canonicalName,
          lastModified: entry.lastModified,
          webkitRelativePath: '',
          size: buf.byteLength,
          type: '',
          async text() { return decoded; },
          async arrayBuffer() { return buf.slice(0); },
          slice() { throw new Error('slice() not implemented in mock'); },
          stream() { throw new Error('stream() not implemented in mock'); },
        };
        return fakeFile as unknown as File;
      },
      async createWritable() {
        const buf: Uint8Array[] = [];
        return {
          async write(data: string | ArrayBuffer | Uint8Array) {
            if (typeof data === 'string') buf.push(new TextEncoder().encode(data));
            else if (data instanceof Uint8Array) buf.push(new Uint8Array(data));
            else buf.push(new Uint8Array(data));
          },
          async close() {
            const total = buf.reduce((n, c) => n + c.byteLength, 0);
            const merged = new Uint8Array(total);
            let off = 0;
            for (const c of buf) { merged.set(c, off); off += c.byteLength; }
            entry.content = merged.buffer;
            entry.lastModified = Date.now();
          },
          async abort() { /* no-op */ },
        };
      },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      async isSameEntry(other: FileSystemHandle) { return other === (handle as unknown as FileSystemHandle); },
    };
    if (supportsMove) {
      handle.move = async (newName: string) => {
        const parent = parentOf.get(entry);
        if (!parent) throw makeError('InvalidStateError', 'Cannot move a root entry');
        renameInPlace(parent, entry, newName);
      };
    }
    return handle as unknown as FileSystemFileHandle;
  };

  const wrapDir = (entry: DirEntry): MockDirectoryHandle => {
    const register = <T extends Entry>(child: T): T => {
      if (entry !== child as unknown as DirEntry) parentOf.set(child, entry);
      return child;
    };

    const handle: Record<string, unknown> = {
      kind: 'directory',
      get name() { return entry.canonicalName; },

      async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
        const k = key(name);
        const existing = entry.children.get(k);
        if (existing) {
          if (existing.kind !== 'file') throw makeError('TypeMismatchError', `${name} is a directory`);
          return wrapFile(register(existing));
        }
        if (!options?.create) throw makeError('NotFoundError', `File not found: ${name}`);
        const fresh: FileEntry = { kind: 'file', canonicalName: name, content: new ArrayBuffer(0), lastModified: Date.now() };
        entry.children.set(k, fresh);
        return wrapFile(register(fresh));
      },

      async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
        const k = key(name);
        const existing = entry.children.get(k);
        if (existing) {
          if (existing.kind !== 'directory') throw makeError('TypeMismatchError', `${name} is a file`);
          return wrapDir(register(existing));
        }
        if (!options?.create) throw makeError('NotFoundError', `Directory not found: ${name}`);
        const fresh: DirEntry = { kind: 'directory', canonicalName: name, children: new Map() };
        entry.children.set(k, fresh);
        return wrapDir(register(fresh));
      },

      async removeEntry(name: string, options?: { recursive?: boolean }) {
        const k = key(name);
        const existing = entry.children.get(k);
        if (!existing) throw makeError('NotFoundError', `Entry not found: ${name}`);
        if (existing.kind === 'directory' && existing.children.size > 0 && !options?.recursive) {
          throw makeError('InvalidModificationError', `Directory not empty: ${name}`);
        }
        entry.children.delete(k);
      },

      async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
        const snapshot = Array.from(entry.children.values());
        for (const child of snapshot) {
          register(child);
          const wrapped = child.kind === 'file' ? wrapFile(child) : wrapDir(child);
          yield [child.canonicalName, wrapped as unknown as FileSystemHandle];
        }
      },

      async *keys(): AsyncIterableIterator<string> {
        for (const c of Array.from(entry.children.values())) yield c.canonicalName;
      },

      async *values(): AsyncIterableIterator<FileSystemHandle> {
        const snapshot = Array.from(entry.children.values());
        for (const c of snapshot) {
          register(c);
          yield (c.kind === 'file' ? wrapFile(c) : wrapDir(c)) as unknown as FileSystemHandle;
        }
      },

      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      async isSameEntry(other: FileSystemHandle) { return other === (handle as unknown as FileSystemHandle); },

      __dump() {
        const dump = (e: Entry): unknown => {
          if (e.kind === 'file') {
            return { name: e.canonicalName, content: new TextDecoder().decode(e.content) };
          }
          const out: Record<string, unknown> = {};
          for (const child of Array.from(e.children.values())) out[child.canonicalName] = dump(child);
          return out;
        };
        return dump(entry);
      },

      __read: async (name: string) => {
        const k = key(name);
        const child = entry.children.get(k);
        if (!child || child.kind !== 'file') throw new Error(`No file: ${name}`);
        return new TextDecoder().decode(child.content);
      },

      __exists: (name: string) => entry.children.has(key(name)),
      __names: () => Array.from(entry.children.values()).map(c => c.canonicalName),
    };

    if (supportsMove) {
      handle.move = async (newName: string) => {
        const parent = parentOf.get(entry);
        if (!parent) throw makeError('InvalidStateError', 'Cannot move a root entry');
        renameInPlace(parent, entry, newName);
      };
    }

    return handle as unknown as MockDirectoryHandle;
  };

  return wrapDir(root);
}

function makeError(name: string, message: string): DOMException {
  if (typeof DOMException === 'function') return new DOMException(message, name);
  const err = new Error(message) as Error & { name: string };
  err.name = name;
  return err as unknown as DOMException;
}
