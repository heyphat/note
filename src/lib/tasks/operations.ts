// Task operations per spec §5. Pure orchestration: takes a TaskStore, calls
// parse/serialize/validate, returns a typed result. No UI, no React, no FS.
//
// Phase 1 covers core-lite + extended (non-recurrence):
//   - createTask
//   - updateTask          (patch semantics; preserves unrelated and unknown fields)
//   - completeTask        (non-recurring; idempotent)
//   - uncompleteTask      (non-recurring; idempotent)
//   - deleteTask
//
// Recurring instance operations (completeInstance / skipInstance / etc.) come
// in Phase 2 alongside the RRULE engine.

import { generateNoteId } from '../frontmatter';
import { DEFAULT_MAPPING, type FieldMapping } from './field-mapping';
import { localDayFromIso } from './local-day';
import { parseTask } from './parse-task';
import { parseRecurrenceString, RecurrenceParseError } from './recurrence';
import { serializeTask } from './serialize-task';
import type { RecurrenceAnchor, Task } from './spec-types';
import { defaultTaskBasename, type TaskFile, type TaskStore } from './task-store';
import {
  blocksWrite,
  validateTask,
  type ValidationIssue,
  type ValidationMode,
  type ValidationResult,
} from './validate';

export interface CollectionConfig {
  mapping?: FieldMapping;
  /** Status values that mean "completed". Default: {'done','completed'}. */
  completedStatusValues?: ReadonlySet<string>;
  /**
   * Default status applied when uncompleting a task. Default: 'open'.
   * Spec §5.6.1.
   */
  defaultStatus?: string;
  /**
   * On uncomplete, whether to clear `completed_date`. Default: 'clear'.
   * Spec §5.6.2 — must be deterministic and documented.
   */
  uncompleteCompletedDatePolicy?: 'clear' | 'preserve';
  /**
   * On complete, whether to overwrite an existing `completed_date`.
   * Default: 'preserve_if_present' (spec §5.5.3).
   */
  completedDateOverwritePolicy?: 'overwrite' | 'preserve_if_present';
  /** Validation mode (default 'strict'). */
  validationMode?: ValidationMode;
  /**
   * Function returning the current ISO datetime. Injected for testability.
   * Default: () => new Date().toISOString().
   */
  now?: () => string;
  /**
   * Function returning today's local calendar date as YYYY-MM-DD.
   * Default: derived from `now()` in local time.
   */
  today?: () => string;
}

/** Resolves the config with defaults baked in. Internal use only. */
interface ResolvedConfig {
  mapping: FieldMapping;
  completedStatusValues: ReadonlySet<string>;
  defaultStatus: string;
  uncompleteCompletedDatePolicy: 'clear' | 'preserve';
  completedDateOverwritePolicy: 'overwrite' | 'preserve_if_present';
  validationMode: ValidationMode;
  now: () => string;
  today: () => string;
}

const DEFAULT_COMPLETED_STATUS_VALUES = new Set(['done', 'completed']);

function resolveConfig(c: CollectionConfig = {}): ResolvedConfig {
  const now = c.now ?? (() => normalizeIsoSecond(new Date().toISOString()));
  return {
    mapping: c.mapping ?? DEFAULT_MAPPING,
    completedStatusValues: c.completedStatusValues ?? DEFAULT_COMPLETED_STATUS_VALUES,
    defaultStatus: c.defaultStatus ?? 'open',
    uncompleteCompletedDatePolicy: c.uncompleteCompletedDatePolicy ?? 'clear',
    completedDateOverwritePolicy: c.completedDateOverwritePolicy ?? 'preserve_if_present',
    validationMode: c.validationMode ?? 'strict',
    now,
    today: c.today ?? (() => localDayFromIso(now())),
  };
}

// --- Result types -----------------------------------------------------------

export interface OperationOk<T> {
  ok: true;
  value: T;
  /** Validation issues that didn't block the write (warnings/info). */
  issues: ValidationIssue[];
}

export interface OperationErr {
  ok: false;
  /** Why the operation refused to commit. */
  reason: 'validation_failed' | 'not_found' | 'invalid_input';
  issues: ValidationIssue[];
  message: string;
}

export type OperationResult<T> = OperationOk<T> | OperationErr;

export interface TaskRecord {
  /** Path inside `.assets/tasks/` (or whatever the store uses). */
  path: string;
  /** Parsed task. */
  task: Task;
  /** File metadata, if the store reported it. */
  file: TaskFile;
}

// --- Create -----------------------------------------------------------------

export interface CreateTaskInput {
  /** Required by spec §5.3.1 directly or via defaults. */
  title: string;
  /** Optional fields — anything from the Task type the caller wants to set. */
  status?: string;
  priority?: string;
  due?: string;
  scheduled?: string;
  contexts?: string[];
  projects?: string[];
  tags?: string[];
  time_estimate?: number;
  /** RRULE-derived recurrence string; validated via `parseRecurrenceString`. */
  recurrence?: string;
  recurrence_anchor?: RecurrenceAnchor;
  body?: string;
  /** Caller-supplied stable id; generated when absent if you want one. */
  id?: string;
}

export async function createTask(
  store: TaskStore,
  input: CreateTaskInput,
  config?: CollectionConfig,
): Promise<OperationResult<TaskRecord>> {
  const c = resolveConfig(config);
  const now = c.now();
  const recurrence = input.recurrence?.trim() || undefined;
  if (recurrence) {
    try {
      parseRecurrenceString(recurrence);
    } catch (err) {
      const message = err instanceof RecurrenceParseError ? err.message : String(err);
      return validationErr({
        mode: c.validationMode,
        issues: [{ code: 'invalid_recurrence_rule', severity: 'error', field: 'recurrence', message }],
      });
    }
  }
  const status = input.status ?? c.defaultStatus;
  // §6.4 check 1a — non-recurring tasks created with a completed status must
  // carry a completed_date. Without this default, picking 'done' in the
  // create form would fail validation (the input shape doesn't expose
  // completed_date).
  const isCompletedAtCreate = c.completedStatusValues.has(status) && !recurrence;
  const task: Task = {
    title: input.title,
    status,
    date_created: now,
    date_modified: now,
    completed_date: isCompletedAtCreate ? c.today() : undefined,
    id: input.id ?? generateNoteId(),
    priority: input.priority,
    due: input.due,
    scheduled: input.scheduled,
    contexts: input.contexts,
    projects: input.projects,
    tags: input.tags,
    time_estimate: input.time_estimate,
    recurrence,
    recurrence_anchor: input.recurrence_anchor,
    _frontmatter: {},
    body: input.body ?? '',
  };

  const validation = validateTask(task, {
    mode: c.validationMode,
    completedStatusValues: c.completedStatusValues,
  });
  if (blocksWrite(validation)) {
    return validationErr(validation);
  }

  const raw = serializeTask(task, { mapping: c.mapping });
  const basename = defaultTaskBasename(task.title, c.today());
  const file = await store.create(basename, raw);
  return { ok: true, value: { path: file.path, task, file }, issues: validation.issues };
}

// --- Update -----------------------------------------------------------------

/**
 * Patch a subset of semantic roles. Spec §5.4.1 — only targeted fields change;
 * unrelated known roles, unknown fields, and original date granularity are
 * preserved.
 */
export type TaskPatch = Partial<Omit<Task, '_frontmatter' | 'body'>> & {
  body?: string;
};

export async function updateTask(
  store: TaskStore,
  path: string,
  patch: TaskPatch,
  config?: CollectionConfig,
): Promise<OperationResult<TaskRecord>> {
  const c = resolveConfig(config);
  const existing = await readAndParse(store, path, c);
  if (!existing) return notFound(path);

  const next = applyPatch(existing.task, patch);
  // Always bump date_modified on a real state change.
  if (didMutate(existing.task, next, patch)) {
    next.date_modified = c.now();
  }

  const validation = validateTask(next, {
    mode: c.validationMode,
    completedStatusValues: c.completedStatusValues,
  });
  if (blocksWrite(validation)) {
    return validationErr(validation);
  }

  const raw = serializeTask(next, { mapping: c.mapping });
  const file = await store.write(path, raw);
  return { ok: true, value: { path, task: next, file }, issues: validation.issues };
}

// --- Complete (non-recurring) ----------------------------------------------

export interface CompleteTaskInput {
  /** Explicit completion day (YYYY-MM-DD). Falls back to today (§5.5.2). */
  completionDay?: string;
}

export async function completeTask(
  store: TaskStore,
  path: string,
  input: CompleteTaskInput = {},
  config?: CollectionConfig,
): Promise<OperationResult<TaskRecord>> {
  const c = resolveConfig(config);
  const existing = await readAndParse(store, path, c);
  if (!existing) return notFound(path);
  if (existing.task.recurrence) {
    return invalidInput('completeTask cannot be used on recurring tasks; use completeInstance.');
  }

  const completedValue = pickCompletedStatus(c.completedStatusValues, existing.task.status);
  const completionDay = input.completionDay ?? c.today();

  const wasCompleted = c.completedStatusValues.has(existing.task.status);
  const completedDate = (() => {
    if (existing.task.completed_date && c.completedDateOverwritePolicy === 'preserve_if_present') {
      return existing.task.completed_date;
    }
    return completionDay;
  })();

  const next: Task = {
    ...existing.task,
    status: completedValue,
    completed_date: completedDate,
  };

  // Idempotency (spec §5.2.2): if already in the same completed state, no-op.
  if (wasCompleted
    && existing.task.status === completedValue
    && existing.task.completed_date === completedDate
  ) {
    return { ok: true, value: existing, issues: [] };
  }

  next.date_modified = c.now();

  const validation = validateTask(next, {
    mode: c.validationMode,
    completedStatusValues: c.completedStatusValues,
  });
  if (blocksWrite(validation)) {
    return validationErr(validation);
  }

  const raw = serializeTask(next, { mapping: c.mapping });
  const file = await store.write(path, raw);
  return { ok: true, value: { path, task: next, file }, issues: validation.issues };
}

// --- Uncomplete (non-recurring) --------------------------------------------

export async function uncompleteTask(
  store: TaskStore,
  path: string,
  config?: CollectionConfig,
): Promise<OperationResult<TaskRecord>> {
  const c = resolveConfig(config);
  const existing = await readAndParse(store, path, c);
  if (!existing) return notFound(path);
  if (existing.task.recurrence) {
    return invalidInput('uncompleteTask cannot be used on recurring tasks; use uncompleteInstance.');
  }

  const wasCompleted = c.completedStatusValues.has(existing.task.status);
  if (!wasCompleted) {
    // Already not completed — idempotent no-op.
    return { ok: true, value: existing, issues: [] };
  }

  const next: Task = {
    ...existing.task,
    status: c.defaultStatus,
    completed_date: c.uncompleteCompletedDatePolicy === 'clear' ? undefined : existing.task.completed_date,
    date_modified: c.now(),
  };

  const validation = validateTask(next, {
    mode: c.validationMode,
    completedStatusValues: c.completedStatusValues,
  });
  if (blocksWrite(validation)) {
    return validationErr(validation);
  }

  const raw = serializeTask(next, { mapping: c.mapping });
  const file = await store.write(path, raw);
  return { ok: true, value: { path, task: next, file }, issues: validation.issues };
}

// --- Delete -----------------------------------------------------------------

export async function deleteTask(store: TaskStore, path: string): Promise<OperationResult<void>> {
  await store.delete(path);
  return { ok: true, value: undefined, issues: [] };
}

// --- Helpers ----------------------------------------------------------------

async function readAndParse(
  store: TaskStore,
  path: string,
  c: ResolvedConfig,
): Promise<TaskRecord | null> {
  const file = await store.read(path);
  if (!file) return null;
  const { task } = parseTask(file.raw, { mapping: c.mapping });
  return { path, task, file };
}

function applyPatch(base: Task, patch: TaskPatch): Task {
  const next: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      // Explicit `undefined` clears the field.
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next as unknown as Task;
}

function didMutate(prev: Task, next: Task, patch: TaskPatch): boolean {
  // Cheap proxy: if any patch key produced a different stringified value,
  // the task changed. Avoids deep-equality dependency.
  const prevR = prev as unknown as Record<string, unknown>;
  const nextR = next as unknown as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    if (JSON.stringify(prevR[key]) !== JSON.stringify(nextR[key])) return true;
  }
  return false;
}

function pickCompletedStatus(values: ReadonlySet<string>, current: string): string {
  // Spec §5.5.1: if multiple completed values are configured, choose
  // deterministically — default is the first entry. The Set preserves
  // insertion order for string keys, so this is stable.
  if (values.has(current)) return current; // already a completed value
  const first = values.values().next();
  if (!first.done) return first.value;
  return 'done';
}

function validationErr(result: ValidationResult): OperationErr {
  const errors = result.issues.filter(i => i.severity === 'error');
  return {
    ok: false,
    reason: 'validation_failed',
    issues: result.issues,
    message: errors.length > 0
      ? `validation failed: ${errors.map(e => e.code).join(', ')}`
      : 'validation failed',
  };
}

function notFound(path: string): OperationErr {
  return { ok: false, reason: 'not_found', issues: [], message: `task not found: ${path}` };
}

function invalidInput(message: string): OperationErr {
  return { ok: false, reason: 'invalid_input', issues: [], message };
}

/** Truncate fractional seconds to whole seconds per spec §3.3.2. */
function normalizeIsoSecond(iso: string): string {
  return iso.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, '');
}
