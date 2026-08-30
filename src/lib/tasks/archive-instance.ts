// Spawn-on-completion: when a recurring task instance is marked complete with
// non-empty notes in the body, snapshot those notes into a separate archive
// file and reset the parent task's body so the next occurrence starts fresh.
//
// Archives live at `.assets/tasks/.archive/<task-uuid>/<instance-date>.md`,
// keyed by the task's stable UUID so renames or moves don't orphan history.
// Mirrors the note `.history/` pattern in `lib/storage/browser-fs.ts`.

import { generateNoteId } from '../frontmatter';
import { serializeYamlFrontmatter } from './yaml-frontmatter';
import type { SpecDate, Task } from './spec-types';
import type { TaskStore } from './task-store';

export interface ArchiveInstanceConfig {
  now: () => string;
}

export interface ArchiveInstanceResult {
  /** Whether a file was actually written (false when body was empty/whitespace). */
  archived: boolean;
  /** The (possibly mutated) parent task to persist: body cleared if archived,
   *  `id` backfilled if it was missing. Always returned so the caller writes
   *  the parent exactly once. */
  parent: Task;
}

export interface PreparedCompletedInstanceArchive extends ArchiveInstanceResult {
  taskUuid?: string;
  instanceDay: SpecDate;
  raw?: string;
}

/**
 * Archive the parent's body as the record of `instanceDay`'s completion, and
 * return the parent with its body cleared. Skips the write entirely when the
 * body is empty/whitespace — there's nothing worth keeping, and we don't want
 * to litter the archive with stub files for tasks like "Pay rent" that have no
 * per-occurrence notes.
 */
export async function archiveCompletedInstance(
  store: TaskStore,
  parent: Task,
  instanceDay: SpecDate,
  config: ArchiveInstanceConfig,
): Promise<ArchiveInstanceResult> {
  const prepared = prepareCompletedInstanceArchive(parent, instanceDay, config);
  if (prepared.archived && prepared.taskUuid && prepared.raw) {
    await store.writeArchive(prepared.taskUuid, prepared.instanceDay, prepared.raw);
  }
  return { archived: prepared.archived, parent: prepared.parent };
}

/**
 * Prepare the archive write without touching the store. Recurring completion
 * uses this so parent validation/write can fail without leaving an orphaned
 * archive entry behind.
 */
export function prepareCompletedInstanceArchive(
  parent: Task,
  instanceDay: SpecDate,
  config: ArchiveInstanceConfig,
): PreparedCompletedInstanceArchive {
  const body = parent.body ?? '';
  if (body.trim() === '') {
    return { archived: false, parent, instanceDay };
  }

  // Backfill stable UUID if the parent never got one. Same lazy-upgrade idea
  // as `migrateHistoryToUuid` in browser-fs.ts.
  const parentWithId: Task = parent.id
    ? parent
    : { ...parent, id: generateNoteId() };

  const raw = serializeArchiveNote(parentWithId, instanceDay, body, config.now());
  return {
    archived: true,
    taskUuid: parentWithId.id!,
    instanceDay,
    raw,
    parent: { ...parentWithId, body: '' },
  };
}

/**
 * Build the archive note's markdown. The frontmatter is a snapshot of the
 * parent's state at completion time (so the archive is self-contained and
 * survives the parent being edited or deleted later) plus the archive-only
 * fields `parent_id`, `parent_title`, `instance_date`, `archived_at`.
 *
 * Per-instance lists (`complete_instances`, `skipped_instances`) belong to the
 * parent and are intentionally not copied. The recurrence rule itself IS
 * copied so the archive remembers what cadence it was part of.
 */
function serializeArchiveNote(
  parent: Task,
  instanceDay: SpecDate,
  body: string,
  archivedAt: string,
): string {
  const fm: Record<string, unknown> = {
    parent_id: parent.id,
    parent_title: parent.title,
    instance_date: instanceDay,
    archived_at: archivedAt,
    title: parent.title,
  };
  if (parent.priority) fm.priority = parent.priority;
  if (parent.due) fm.due = parent.due;
  if (parent.scheduled) fm.scheduled = parent.scheduled;
  if (parent.tags && parent.tags.length > 0) fm.tags = parent.tags;
  if (parent.contexts && parent.contexts.length > 0) fm.contexts = parent.contexts;
  if (parent.projects && parent.projects.length > 0) fm.projects = parent.projects;
  if (parent.recurrence) fm.recurrence = parent.recurrence;
  if (parent.recurrence_anchor) fm.recurrence_anchor = parent.recurrence_anchor;
  return serializeYamlFrontmatter(fm, body);
}
