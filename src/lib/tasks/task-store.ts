// Storage abstraction for task notes. Decoupled from `NoteStore` so that
// operations.ts is testable with an in-memory store, and so the conformance
// adapter doesn't need a browser/filesystem at all.
//
// Anything that touches `.assets/tasks/*.md` goes through this interface.
// Concrete implementations:
//   - InMemoryTaskStore   — used by tests and the conformance adapter
//   - BrowserFsTaskStore  — uses NoteStore's filesystem handle (real vault)

/**
 * Minimal record returned by listing — enough to identify a task on disk
 * without forcing a full parse. Operations.ts re-reads the body when it needs
 * the parsed Task.
 */
export interface TaskFile {
  /** Path relative to `.assets/tasks/`, e.g. `2026-05-04-q2-proposal.md`. */
  path: string;
  /** File size in bytes, if known. Used by the index for change detection. */
  size?: number;
  /** Last-modified time (ms since epoch), if known. */
  mtimeMs?: number;
}

export interface TaskFileWithBody extends TaskFile {
  /** Raw markdown including frontmatter. */
  raw: string;
}

export interface TaskStore {
  /** List every task file in the collection. Order is unspecified. */
  list(): Promise<TaskFile[]>;
  /** Read one task file by path. Returns null if missing. */
  read(path: string): Promise<TaskFileWithBody | null>;
  /**
   * Create a new task file. The store decides the final path based on
   * `desiredBasename` plus collision-resolution rules. Returns the actual
   * path written.
   */
  create(desiredBasename: string, raw: string): Promise<TaskFile>;
  /**
   * Atomically overwrite a task file. Throws if the file no longer exists
   * (the store is unforgiving here; callers handle the race).
   */
  write(path: string, raw: string): Promise<TaskFile>;
  /** Delete a task file. Idempotent — no-op if already gone. */
  delete(path: string): Promise<void>;
  /** True if a file exists at `path`. */
  exists(path: string): Promise<boolean>;

  /**
   * Per-instance archive of completed recurring tasks. Mirrors the note-history
   * pattern: keyed by the task's stable UUID (not its path) so renames or
   * moves don't orphan the archive. Files live at
   * `.assets/tasks/.archive/<taskUuid>/<instanceDate>.md`.
   */
  writeArchive(taskUuid: string, instanceDate: string, raw: string): Promise<void>;
  readArchive(taskUuid: string, instanceDate: string): Promise<string | null>;
  /** Sorted ascending list of instance dates archived for a task. */
  listArchive(taskUuid: string): Promise<string[]>;
}

/**
 * Helper: produce a filesystem-safe basename from a title plus the current
 * date. Pure — no I/O. Collision resolution happens inside the concrete
 * TaskStore implementation.
 */
export function defaultTaskBasename(title: string, today: string): string {
  const slug = slugifyTitle(title);
  return slug ? `${today}-${slug}` : today;
}

function slugifyTitle(title: string): string {
  const normalized = (title || '').normalize('NFC').toLowerCase();
  return normalized
    .replace(/[^a-z0-9 -]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}
