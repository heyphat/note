// Shared "read → mutate → validate → write" helper.
//
// Every op module (operations.ts, recurring-ops.ts, dependencies.ts,
// reminders.ts, time-tracking.ts) follows the same shape:
//
//   1. Read the task file.
//   2. Apply a pure mutator to the parsed Task.
//   3. Validate against the spec.
//   4. Bump `date_modified` if anything actually changed.
//   5. Serialise + write through the TaskStore.
//
// Concentrating that here keeps each per-feature module readable and ensures
// idempotency / validation / write atomicity behave consistently.

import { DEFAULT_MAPPING, type FieldMapping } from './field-mapping';
import { parseTask } from './parse-task';
import { serializeTask } from './serialize-task';
import type { Task } from './spec-types';
import type { TaskStore } from './task-store';
import {
  blocksWrite,
  validateTask,
  type ValidationIssue,
  type ValidationMode,
  type ValidationResult,
} from './validate';

export interface MutateConfig {
  mapping?: FieldMapping;
  validationMode?: ValidationMode;
  completedStatusValues?: ReadonlySet<string>;
  /** Function returning the current ISO datetime. */
  now?: () => string;
}

export interface MutateOk<TExtra = Record<string, never>> {
  ok: true;
  path: string;
  task: Task;
  issues: ValidationIssue[];
  /** True if the mutator produced any change (date_modified bumped). */
  changed: boolean;
  extra: TExtra;
}

export interface MutateErr {
  ok: false;
  reason: 'not_found' | 'validation_failed' | 'invalid_input' | 'mutator_rejected';
  issues: ValidationIssue[];
  message: string;
  /** Optional code from the mutator, e.g. `'duplicate_dependency_uid'`. */
  code?: string;
}

export type MutateResult<TExtra = Record<string, never>> = MutateOk<TExtra> | MutateErr;

/** Mutator output. Returning `null` means "no-op" (idempotent path). */
export type MutatorOutput<TExtra> =
  | { task: Task; extra?: TExtra }
  | { reject: { reason: 'invalid_input' | 'mutator_rejected'; message: string; code?: string } }
  | null;

export type Mutator<TExtra = Record<string, never>> =
  (task: Task) => MutatorOutput<TExtra> | Promise<MutatorOutput<TExtra>>;

/**
 * Read the task at `path`, apply `mutator`, validate, and write back. Pure
 * orchestration; never decides *what* to mutate.
 *
 * Idempotency: if the mutator returns `null` (no change) or returns the same
 * task content, `date_modified` is left untouched and we don't write.
 */
export async function mutateTask<TExtra = Record<string, never>>(
  store: TaskStore,
  path: string,
  mutator: Mutator<TExtra>,
  config: MutateConfig = {},
): Promise<MutateResult<TExtra>> {
  const mapping = config.mapping ?? DEFAULT_MAPPING;
  const now = config.now ?? (() => normalizeIsoSecond(new Date().toISOString()));

  const file = await store.read(path);
  if (!file) {
    return { ok: false, reason: 'not_found', issues: [], message: `task not found: ${path}` };
  }
  const { task } = parseTask(file.raw, { mapping });

  let output: MutatorOutput<TExtra>;
  try {
    output = await mutator(task);
  } catch (err) {
    return {
      ok: false,
      reason: 'invalid_input',
      issues: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (output === null) {
    // Idempotent no-op.
    return { ok: true, path, task, issues: [], changed: false, extra: {} as TExtra };
  }
  if ('reject' in output) {
    return {
      ok: false,
      reason: output.reject.reason,
      issues: [],
      message: output.reject.message,
      code: output.reject.code,
    };
  }

  const next = output.task;
  const changed = !shallowEqualSerialised(task, next, mapping);

  if (!changed) {
    return { ok: true, path, task, issues: [], changed: false, extra: (output.extra ?? {}) as TExtra };
  }

  const stamped: Task = { ...next, date_modified: now() };
  const validation = validateTask(stamped, {
    mode: config.validationMode ?? 'strict',
    completedStatusValues: config.completedStatusValues,
  });
  if (blocksWrite(validation)) return validationFailed(validation);

  const raw = serializeTask(stamped, { mapping });
  await store.write(path, raw);
  return {
    ok: true,
    path,
    task: stamped,
    issues: validation.issues,
    changed: true,
    extra: (output.extra ?? {}) as TExtra,
  };
}

// --- Internals --------------------------------------------------------------

function shallowEqualSerialised(a: Task, b: Task, mapping: FieldMapping): boolean {
  // Compare on the serialised form so unknown-field preservation and
  // canonical-key ordering are taken into account.
  return serializeTask(a, { mapping }) === serializeTask(b, { mapping });
}

function validationFailed(result: ValidationResult): MutateErr {
  return {
    ok: false,
    reason: 'validation_failed',
    issues: result.issues,
    message: 'validation failed',
  };
}

function normalizeIsoSecond(iso: string): string {
  return iso.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, '');
}
