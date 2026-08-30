// Per-instance operations for recurring tasks per spec §4.7–4.10.
//
// A recurring task's base status doesn't flip on each completion (§4.12); the
// per-instance lists `complete_instances` and `skipped_instances` carry the
// truth. These ops keep those lists tidy and idempotent.
//
// completion-anchor progression also updates `DTSTART` per §4.4.3 — that lives
// in `recurrence.ts` and is invoked by `completeInstance` here.

import { prepareCompletedInstanceArchive, type PreparedCompletedInstanceArchive } from './archive-instance';
import { DEFAULT_MAPPING, type FieldMapping } from './field-mapping';
import { localDayFromIso } from './local-day';
import { parseTask } from './parse-task';
import { serializeTask } from './serialize-task';
import {
  rewriteDtstart,
  RecurrenceParseError,
} from './recurrence';
import type { TaskStore } from './task-store';
import type { SpecDate, Task } from './spec-types';
import {
  blocksWrite,
  validateTask,
  type ValidationIssue,
  type ValidationMode,
  type ValidationResult,
} from './validate';

export interface RecurringConfig {
  mapping?: FieldMapping;
  validationMode?: ValidationMode;
  /** Function returning the current ISO datetime. Default: () => new Date().toISOString(). */
  now?: () => string;
  /** Function returning today's local calendar date (YYYY-MM-DD). */
  today?: () => string;
}

interface ResolvedConfig {
  mapping: FieldMapping;
  validationMode: ValidationMode;
  now: () => string;
  today: () => string;
}

function resolveConfig(c: RecurringConfig = {}): ResolvedConfig {
  const now = c.now ?? (() => new Date().toISOString().replace(/\.\d+(?=Z)/, ''));
  return {
    mapping: c.mapping ?? DEFAULT_MAPPING,
    validationMode: c.validationMode ?? 'strict',
    now,
    today: c.today ?? (() => localDayFromIso(now())),
  };
}

export interface InstanceOpInput {
  /** Target day (YYYY-MM-DD). When omitted, falls back to scheduled → due → today (§5.2.1). */
  targetDay?: SpecDate;
  /**
   * For `completion` anchor on `completeInstance`: explicit datetime drives
   * the DTSTART rewrite per §4.4.3. When the caller supplies just a date
   * (no `T`), DTSTART becomes a date token; when caller supplies a full
   * datetime, DTSTART becomes a UTC datetime token.
   */
  targetInstant?: string;
}

export type RecurringOpResult =
  | { ok: true; path: string; task: Task; issues: ValidationIssue[]; changed: boolean }
  | { ok: false; reason: 'not_found' | 'not_recurring' | 'invalid_recurrence' | 'validation_failed' | 'invalid_input'; issues: ValidationIssue[]; message: string };

// --- Public ops -------------------------------------------------------------

export async function completeInstance(
  store: TaskStore,
  path: string,
  input: InstanceOpInput = {},
  config?: RecurringConfig,
): Promise<RecurringOpResult> {
  return runOp(store, path, config, async (task, c) => {
    const day = resolveTargetDay(task, input.targetDay, c);
    let next: Task = applyInstanceMutation(task, day, 'complete');

    // Spawn-on-completion: snapshot the parent's body to an archive file
    // (`.assets/tasks/.archive/<uuid>/<day>.md`) so each instance's notes are
    // preserved as a standalone record, then clear the parent body so the
    // next occurrence starts fresh. No-op when the body is empty.
    const archive = prepareCompletedInstanceArchive(next, day, { now: c.now });
    next = archive.parent;

    // §4.4.3 / §4.4.5: completion-anchor progression rewrites DTSTART.
    if (next.recurrence_anchor === 'completion' && next.recurrence) {
      try {
        const explicit = input.targetInstant;
        const target = explicit ?? day;
        const asDateTime = !!explicit && explicit.includes('T');
        next = { ...next, recurrence: rewriteDtstart(next.recurrence, target, asDateTime) };
      } catch (err) {
        return failed('invalid_recurrence', err instanceof Error ? err.message : String(err));
      }
    }
    return { task: next, archive };
  });
}

export async function uncompleteInstance(
  store: TaskStore,
  path: string,
  input: InstanceOpInput = {},
  config?: RecurringConfig,
): Promise<RecurringOpResult> {
  return runOp(store, path, config, async (task, c) => {
    const day = resolveTargetDay(task, input.targetDay, c);
    // Per §4.8: uncomplete MUST NOT roll back DTSTART for completion anchor.
    return applyInstanceMutation(task, day, 'uncomplete');
  });
}

export async function skipInstance(
  store: TaskStore,
  path: string,
  input: InstanceOpInput = {},
  config?: RecurringConfig,
): Promise<RecurringOpResult> {
  return runOp(store, path, config, async (task, c) => {
    const day = resolveTargetDay(task, input.targetDay, c);
    return applyInstanceMutation(task, day, 'skip');
  });
}

export async function unskipInstance(
  store: TaskStore,
  path: string,
  input: InstanceOpInput = {},
  config?: RecurringConfig,
): Promise<RecurringOpResult> {
  return runOp(store, path, config, async (task, c) => {
    const day = resolveTargetDay(task, input.targetDay, c);
    return applyInstanceMutation(task, day, 'unskip');
  });
}

// --- Mutation core ----------------------------------------------------------

type InstanceMutation = 'complete' | 'uncomplete' | 'skip' | 'unskip';

function applyInstanceMutation(task: Task, day: SpecDate, action: InstanceMutation): Task {
  const completed = new Set(task.complete_instances ?? []);
  const skipped = new Set(task.skipped_instances ?? []);

  switch (action) {
    case 'complete':
      completed.add(day);
      skipped.delete(day);
      break;
    case 'uncomplete':
      completed.delete(day);
      // Per §4.8 step 2: do NOT add to skipped_instances implicitly.
      break;
    case 'skip':
      skipped.add(day);
      completed.delete(day);
      break;
    case 'unskip':
      skipped.delete(day);
      // Per §4.10 step 2: do NOT add to complete_instances implicitly.
      break;
  }

  return {
    ...task,
    complete_instances: Array.from(completed).sort(),
    skipped_instances: Array.from(skipped).sort(),
  };
}

// --- Driver -----------------------------------------------------------------

async function runOp(
  store: TaskStore,
  path: string,
  cfg: RecurringConfig | undefined,
  mutate: (task: Task, c: ResolvedConfig) => Promise<Task | { task: Task; archive?: PreparedCompletedInstanceArchive } | RecurringOpResult>,
): Promise<RecurringOpResult> {
  const c = resolveConfig(cfg);
  const file = await store.read(path);
  if (!file) return failed('not_found', `task not found: ${path}`);
  const { task } = parseTask(file.raw, { mapping: c.mapping });
  if (!task.recurrence) return failed('not_recurring', 'task is not recurring');

  let mutated: Task;
  let archive: PreparedCompletedInstanceArchive | undefined;
  try {
    const out = await mutate(task, c);
    if (isResult(out)) return out;
    if (isTaskWithArchive(out)) {
      mutated = out.task;
      archive = out.archive;
    } else {
      mutated = out;
    }
  } catch (err) {
    if (err instanceof RecurrenceParseError) {
      return failed('invalid_recurrence', err.message);
    }
    return failed('invalid_input', err instanceof Error ? err.message : String(err));
  }

  const changed = serializeTask(mutated, { mapping: c.mapping }) !== serializeTask(task, { mapping: c.mapping });

  if (!changed) {
    // §5.2.2 idempotency: no-op leaves date_modified unchanged.
    return { ok: true, path, task, issues: [], changed: false };
  }

  const next: Task = { ...mutated, date_modified: c.now() };
  const validation = validateTask(next, { mode: c.validationMode });
  if (blocksWrite(validation)) return validationFailed(validation);

  const raw = serializeTask(next, { mapping: c.mapping });
  await store.write(path, raw);
  if (archive?.archived && archive.taskUuid && archive.raw) {
    await store.writeArchive(archive.taskUuid, archive.instanceDay, archive.raw);
  }
  return { ok: true, path, task: next, issues: validation.issues, changed: true };
}

// --- Helpers ----------------------------------------------------------------

function isResult(x: unknown): x is RecurringOpResult {
  return typeof x === 'object' && x !== null && 'ok' in (x as Record<string, unknown>);
}

function isTaskWithArchive(x: unknown): x is { task: Task; archive?: PreparedCompletedInstanceArchive } {
  return typeof x === 'object' && x !== null && 'task' in (x as Record<string, unknown>);
}

function resolveTargetDay(task: Task, explicit: SpecDate | undefined, c: ResolvedConfig): SpecDate {
  if (explicit) return explicit;
  // §5.2.1 fallback chain: scheduled → due → today.
  if (task.scheduled) return dayPart(task.scheduled);
  if (task.due) return dayPart(task.due);
  return c.today();
}

function dayPart(value: string): SpecDate {
  const t = value.indexOf('T');
  return t === -1 ? value.slice(0, 10) : value.slice(0, t);
}

function failed(reason: Extract<RecurringOpResult, { ok: false }>['reason'], message: string): RecurringOpResult {
  return { ok: false, reason, issues: [], message };
}

function validationFailed(result: ValidationResult): RecurringOpResult {
  return {
    ok: false,
    reason: 'validation_failed',
    issues: result.issues,
    message: 'validation failed',
  };
}
