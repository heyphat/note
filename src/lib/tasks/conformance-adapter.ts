// TaskNotes conformance adapter.
//
// This module exposes the operations the spec's conformance runner exercises
// via the contract documented at:
//   https://github.com/callumalpass/tasknotes-spec/blob/main/conformance/docs/ADAPTER_CONTRACT.md
//
// Phase 1 covers the core-lite + extended operation surface that maps onto
// the modules in `lib/tasks/`. Recurrence operations are stubbed and will be
// filled in alongside the RRULE engine in Phase 2.
//
// The adapter is plain TypeScript so it's typecheck-clean and unit-testable.
// `scripts/conformance-adapter.mjs` is a thin ESM wrapper that the spec's
// runner imports — it just re-exports `execute` and `metadata` from here.

import { DEFAULT_MAPPING, READ_ALIASES, knownKeys, readField, type FieldMapping } from './field-mapping';
import { parseTask } from './parse-task';
import {
  completeTask,
  deleteTask,
  uncompleteTask,
  updateTask,
  type CollectionConfig,
} from './operations';
import {
  completeInstance,
  skipInstance,
  uncompleteInstance,
  unskipInstance,
} from './recurring-ops';
import {
  canonicalizeDtstart,
  effectiveInstanceState,
  nextOccurrence,
  parseRecurrenceString,
  rewriteDtstart,
} from './recurrence';
import {
  addDependency,
  removeDependency,
  replaceDependencies,
} from './dependencies';
import {
  addReminder,
  computeTriggers,
  removeReminder,
  updateReminder,
} from './reminders';
import {
  removeEntry,
  replaceEntries,
  startTimer,
  stopTimer,
} from './time-tracking';
import { InMemoryTaskStore } from './in-memory-task-store';
import { isCanonicalDate, isCanonicalDateTime, validateTask } from './validate';
import type { SemanticRole, Task } from './spec-types';

export interface AdapterMetadata {
  implementation: string;
  version: string;
  spec_version: string;
  validation_modes: string[];
  profiles: string[];
  capabilities: string[];
}

export const metadata: AdapterMetadata = {
  implementation: 'note-tasknotes',
  version: '0.2.0',
  spec_version: '0.1.0-draft',
  validation_modes: ['strict'],
  profiles: ['core-lite', 'recurrence', 'extended'],
  capabilities: ['dependencies', 'reminders', 'links', 'time-tracking'],
};

export type Envelope =
  | { ok: true; result?: unknown }
  | { ok: false; error: string; error_details?: { operation?: string; code?: string; message?: string; field?: string } };

type OperationHandler = (input: Record<string, unknown>) => Envelope | Promise<Envelope>;

const HANDLERS: Record<string, OperationHandler> = {
  // --- meta ---
  'meta.claim': () => ok(metadata),
  'meta.has_capability': (input) => ok(metadata.capabilities.includes(String(input.capability))),
  'meta.has_profile': (input) => ok(metadata.profiles.includes(String(input.profile))),

  // --- field-mapping ---
  'field.default_mapping': () => ok({ ...DEFAULT_MAPPING }),
  'field.build_mapping': (input) => {
    const overrides = (input.overrides ?? {}) as Partial<FieldMapping>;
    return ok({ ...DEFAULT_MAPPING, ...overrides });
  },
  'field.normalize': (input) => {
    const fm = (input.frontmatter ?? {}) as Record<string, unknown>;
    const mapping = ((input.mapping ?? DEFAULT_MAPPING)) as FieldMapping;
    const out: Record<string, unknown> = {};
    const issues: Array<{ code: string; field?: string }> = [];
    for (const role of Object.keys(DEFAULT_MAPPING) as SemanticRole[]) {
      const r = readField(fm, role, mapping);
      if (r.value !== undefined) out[role] = r.value;
      for (const issue of r.issues) {
        issues.push({ code: issue.code, field: issue.canonical });
      }
    }
    return ok({ semantic: out, issues });
  },
  'field.denormalize': (input) => {
    const semantic = (input.semantic ?? {}) as Partial<Record<SemanticRole, unknown>>;
    const mapping = ((input.mapping ?? DEFAULT_MAPPING)) as FieldMapping;
    const out: Record<string, unknown> = {};
    for (const [role, value] of Object.entries(semantic) as Array<[SemanticRole, unknown]>) {
      if (value === undefined) continue;
      out[mapping[role]] = value;
    }
    return ok(out);
  },
  'field.is_completed_status': (input) => {
    const status = String(input.status ?? '');
    const completed = (input.completed_values as string[] | undefined) ?? ['done', 'completed'];
    return ok(completed.includes(status));
  },
  'field.default_completed_status': (input) => {
    const completed = (input.completed_values as string[] | undefined) ?? ['done'];
    return ok(completed[0] ?? 'done');
  },

  // --- date parsing ---
  'date.parse_utc': (input) => {
    const value = String(input.value ?? '');
    if (!isCanonicalDateTime(value)) {
      return failed('invalid_datetime_value', `not a canonical datetime: ${value}`);
    }
    return ok({ instant_iso: new Date(value).toISOString().replace(/\.\d+(?=Z)/, '') });
  },
  'date.validate': (input) => {
    const value = String(input.value ?? '');
    const kind = String(input.kind ?? 'date');
    const valid = kind === 'date' ? isCanonicalDate(value) : isCanonicalDateTime(value);
    return ok({ valid });
  },
  'date.has_time': (input) => {
    const value = String(input.value ?? '');
    return ok({ has_time: value.includes('T') });
  },
  'date.get_part': (input) => {
    const value = String(input.value ?? '');
    const tIdx = value.indexOf('T');
    return ok({ date: tIdx === -1 ? value.slice(0, 10) : value.slice(0, tIdx) });
  },
  'date.is_same': (input) => {
    return ok({ same: input.a === input.b });
  },
  'date.is_before': (input) => {
    const a = Date.parse(String(input.a ?? ''));
    const b = Date.parse(String(input.b ?? ''));
    if (Number.isNaN(a) || Number.isNaN(b)) return failed('invalid_datetime_value', 'unparseable');
    return ok({ before: a < b });
  },

  // --- validation ---
  'validation.core_evaluate': (input) => {
    const fm = (input.frontmatter ?? {}) as Record<string, unknown>;
    const mapping = ((input.mapping ?? DEFAULT_MAPPING)) as FieldMapping;
    const raw = `---\n${frontmatterAsYaml(fm)}\n---\n`;
    const { task, issues: parseIssues } = parseTask(raw, { mapping });
    const result = validateTask(task, { parseIssues });
    return ok({
      issues: result.issues,
      blocks_write: result.issues.some(i => i.severity === 'error'),
    });
  },
  'validation.time_entries': (input) => {
    const entries = (input.entries ?? []) as Task['time_entries'];
    const task: Task = baseTask({ time_entries: entries });
    const result = validateTask(task, {});
    return ok({ issues: result.issues.filter(i =>
      i.field?.startsWith('timeEntries')
      || i.code === 'multiple_active_time_entries'
      || i.code === 'invalid_time_range'
      || i.code === 'missing_time_entry_start',
    ) });
  },

  // --- operations ---
  'op.complete_nonrecurring': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const completionDay = input.completion_day as string | undefined;
    const config = configFromInput(input);
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await completeTask(store, path, { completionDay }, config);
    return wrap(result, store, path);
  },
  'op.uncomplete_nonrecurring': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const config = configFromInput(input);
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await uncompleteTask(store, path, config);
    return wrap(result, store, path);
  },
  'op.update_patch': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const patch = (input.patch ?? {}) as Record<string, unknown>;
    const config = configFromInput(input);
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await updateTask(store, path, patch as Parameters<typeof updateTask>[2], config);
    return wrap(result, store, path);
  },
  'op.idempotency_check': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const config = configFromInput(input);
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const first = await completeTask(store, path, {}, config);
    const second = await completeTask(store, path, {}, config);
    if (!first.ok || !second.ok) {
      return failed('operation_failed', 'idempotency check could not run');
    }
    return ok({
      first_modified: first.value.task.date_modified,
      second_modified: second.value.task.date_modified,
      idempotent: first.value.task.date_modified === second.value.task.date_modified,
    });
  },
  'delete.remove': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    await deleteTask(store, path);
    return ok({ exists: await store.exists(path) });
  },

  // --- recurrence ---
  'recurrence.complete': async (input) => instanceOp(input, completeInstance),
  'recurrence.uncomplete_instance': async (input) => instanceOp(input, uncompleteInstance),
  'recurrence.skip_instance': async (input) => instanceOp(input, skipInstance),
  'recurrence.unskip_instance': async (input) => instanceOp(input, unskipInstance),
  'recurrence.recalculate': (input) => {
    const recurrence = String(input.recurrence ?? '');
    try {
      const day = nextOccurrence({
        recurrence,
        scheduled: input.scheduled as string | undefined,
        date_created: input.date_created as string | undefined,
        recurrence_anchor: (input.recurrence_anchor as 'scheduled' | 'completion' | undefined) ?? 'scheduled',
        skipped_instances: (input.skipped_instances as string[] | undefined) ?? [],
        after: input.after ? new Date(String(input.after)) : undefined,
      });
      return ok({ next: day });
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'invalid_recurrence_rule';
      return failed(code, err instanceof Error ? err.message : String(err));
    }
  },
  'recurrence.effective_state': (input) => {
    const day = String(input.day ?? '');
    const task = baseTask({
      complete_instances: (input.complete_instances as string[] | undefined) ?? [],
      skipped_instances: (input.skipped_instances as string[] | undefined) ?? [],
    });
    return ok({ state: effectiveInstanceState(task, day) });
  },
  'recurrence.canonicalize_dtstart': (input) => {
    try {
      const result = canonicalizeDtstart({
        recurrence: String(input.recurrence ?? ''),
        scheduled: input.scheduled as string | undefined,
        date_created: input.date_created as string | undefined,
      });
      return ok({ recurrence: result });
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'invalid_recurrence_rule';
      return failed(code, err instanceof Error ? err.message : String(err));
    }
  },
  'recurrence.rewrite_dtstart': (input) => {
    try {
      const result = rewriteDtstart(
        String(input.recurrence ?? ''),
        String(input.target ?? ''),
        Boolean(input.as_datetime),
      );
      return ok({ recurrence: result });
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'invalid_recurrence_rule';
      return failed(code, err instanceof Error ? err.message : String(err));
    }
  },
  'recurrence.parse': (input) => {
    try {
      return ok(parseRecurrenceString(String(input.recurrence ?? '')));
    } catch (err) {
      return failed('invalid_recurrence_rule', err instanceof Error ? err.message : String(err));
    }
  },

  // --- dependencies ---
  'dependency.add': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await addDependency(store, path, {
      uid: String(input.uid ?? ''),
      reltype: input.reltype as 'FINISHTOSTART' | 'STARTTOSTART' | 'FINISHTOFINISH' | 'STARTTOFINISH' | undefined,
      gap: input.gap as string | undefined,
    }, { enforceUniqueUid: input.enforce_unique_uid !== false, now: nowFromInput(input) });
    return wrapMutate(result);
  },
  'dependency.remove': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await removeDependency(store, path, String(input.uid ?? ''), { now: nowFromInput(input) });
    return wrapMutate(result);
  },
  'dependency.replace': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const entries = (input.entries as Array<Record<string, unknown>> | undefined) ?? [];
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await replaceDependencies(store, path, entries.map(e => ({
      uid: String(e.uid ?? ''),
      reltype: e.reltype as 'FINISHTOSTART' | 'STARTTOSTART' | 'FINISHTOFINISH' | 'STARTTOFINISH' | undefined,
      gap: e.gap as string | undefined,
    })), { now: nowFromInput(input) });
    return wrapMutate(result);
  },
  'dependency.validate_entry': (input) => {
    const task = baseTask({ blocked_by: [{
      uid: String(input.uid ?? ''),
      reltype: (input.reltype as 'FINISHTOSTART') ?? 'FINISHTOSTART',
      gap: input.gap as string | undefined,
    }] });
    const issues = validateTask(task).issues.filter(i => i.field?.startsWith('blockedBy'));
    return ok({ issues });
  },

  // --- reminders ---
  'reminder.add': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const reminderInput = input.reminder as Record<string, unknown> | undefined;
    if (!reminderInput) return failed('invalid_input', 'reminder is required');
    const type = String(reminderInput.type ?? '');
    const result = await addReminder(store, path, type === 'absolute'
      ? { id: reminderInput.id as string | undefined, type: 'absolute', absoluteTime: String(reminderInput.absoluteTime ?? '') }
      : {
          id: reminderInput.id as string | undefined,
          type: 'relative',
          relatedTo: (reminderInput.relatedTo as 'due' | 'scheduled') ?? 'due',
          offset: String(reminderInput.offset ?? ''),
        }, { now: nowFromInput(input) });
    return wrapMutate(result);
  },
  'reminder.update': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await updateReminder(store, path, String(input.id ?? ''), (input.patch ?? {}) as never, { now: nowFromInput(input) });
    return wrapMutate(result);
  },
  'reminder.remove': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await removeReminder(store, path, String(input.id ?? ''), { now: nowFromInput(input) });
    return wrapMutate(result);
  },
  'reminder.compute_triggers': (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const raw = `---\n${frontmatterAsYaml(initial)}\n---\n`;
    const { task } = parseTask(raw);
    return ok(computeTriggers(task, { dateOnlyAnchorTime: input.date_only_anchor_time as string | undefined }));
  },

  // --- time-tracking ---
  'time.start': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await startTimer(store, path, { description: input.description as string | undefined }, {
      now: input.now ? () => String(input.now) : undefined,
    });
    return wrapMutate(result);
  },
  'time.stop': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await stopTimer(store, path, {
      now: input.now ? () => String(input.now) : undefined,
    });
    return wrapMutate(result);
  },
  'time.remove_entry': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await removeEntry(store, path, Number(input.index ?? -1), { now: nowFromInput(input) });
    return wrapMutate(result);
  },
  'time.replace_entries': async (input) => {
    const initial = (input.task ?? {}) as Record<string, unknown>;
    const entries = ((input.entries as Array<Record<string, unknown>> | undefined) ?? []).map(e => ({
      startTime: String(e.startTime ?? ''),
      endTime: e.endTime as string | undefined,
      description: e.description as string | undefined,
    }));
    const store = new InMemoryTaskStore();
    const path = await seedTask(store, initial);
    const result = await replaceEntries(store, path, entries, { now: nowFromInput(input) });
    return wrapMutate(result);
  },
};

function nowFromInput(input: Record<string, unknown>): (() => string) | undefined {
  if (typeof input.now === 'string') return () => input.now as string;
  // Default to a stable reference instant for fixture determinism. Conformance
  // fixtures that care about wall-clock can override via `now`.
  return undefined;
}

async function instanceOp(
  input: Record<string, unknown>,
  op: typeof completeInstance,
): Promise<Envelope> {
  const initial = (input.task ?? {}) as Record<string, unknown>;
  const store = new InMemoryTaskStore();
  const path = await seedTask(store, initial);
  const result = await op(store, path, {
    targetDay: input.target_day as string | undefined,
    targetInstant: input.target_instant as string | undefined,
  }, {
    now: input.now ? () => String(input.now) : undefined,
    today: input.today ? () => String(input.today) : undefined,
  });
  if (!result.ok) {
    return { ok: false, error: result.message, error_details: { code: result.reason } };
  }
  return ok({
    path: result.path,
    task: stripInternals(result.task),
    issues: result.issues,
    changed: result.changed,
  });
}

function wrapMutate(result: { ok: false; reason: string; message: string } | { ok: true; path: string; task: Task; issues: unknown[]; changed: boolean; extra?: unknown }): Envelope {
  if (!result.ok) {
    return { ok: false, error: result.message, error_details: { code: result.reason } };
  }
  return ok({
    path: result.path,
    task: stripInternals(result.task),
    issues: result.issues,
    changed: result.changed,
    extra: result.extra ?? {},
  });
}

/**
 * Run an operation. Never throws — every error is returned in the envelope.
 */
export async function execute(operation: string, input: Record<string, unknown> = {}): Promise<Envelope> {
  const handler = HANDLERS[operation];
  if (!handler) {
    return { ok: false, error: `unknown operation: ${operation}`, error_details: { operation, code: 'unknown_operation' } };
  }
  try {
    return await handler(input);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      error_details: { operation, code: 'adapter_error' },
    };
  }
}

/** List of operations the adapter currently handles (introspection helper). */
export function listOperations(): string[] {
  return Object.keys(HANDLERS).sort();
}

// --- Helpers ----------------------------------------------------------------

function ok(result: unknown): Envelope {
  return { ok: true, result };
}

function failed(code: string, message: string, field?: string): Envelope {
  return { ok: false, error: message, error_details: { code, message, field } };
}

function configFromInput(input: Record<string, unknown>): CollectionConfig {
  const completedValues = input.completed_values as string[] | undefined;
  return {
    completedStatusValues: completedValues ? new Set(completedValues) : undefined,
    defaultStatus: input.default_status as string | undefined,
    now: input.now ? () => String(input.now) : undefined,
    today: input.today ? () => String(input.today) : undefined,
  };
}

async function seedTask(store: InMemoryTaskStore, fm: Record<string, unknown>): Promise<string> {
  const raw = `---\n${frontmatterAsYaml(fm)}\n---\n${(fm.body as string | undefined) ?? ''}`;
  const file = await store.create('task', raw);
  return file.path;
}

function wrap(
  result: Awaited<ReturnType<typeof updateTask>>,
  store: InMemoryTaskStore,
  path: string,
): Envelope {
  if (!result.ok) {
    return {
      ok: false,
      error: result.message,
      error_details: { code: result.reason },
    };
  }
  // Return the on-disk frontmatter so fixture authors can assert against it.
  const file = store.list().then(); // typed convenience only
  void file;
  return ok({
    path,
    task: stripInternals(result.value.task),
    issues: result.issues,
  });
}

function stripInternals(task: Task): Record<string, unknown> {
  const out = { ...task } as Record<string, unknown>;
  delete out._frontmatter;
  delete out.body;
  return out;
}

function baseTask(overrides: Partial<Task>): Task {
  return {
    title: 't',
    status: 'open',
    date_created: '2026-01-01T00:00:00Z',
    date_modified: '2026-01-01T00:00:00Z',
    _frontmatter: {},
    body: '',
    ...overrides,
  };
}

/** Render a frontmatter object as flat YAML (single-level only — fixtures rarely nest). */
function frontmatterAsYaml(fm: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fm)) {
    if (key === 'body') continue;
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          lines.push(`  -`);
          for (const [k, v] of Object.entries(item)) lines.push(`    ${k}: ${formatScalar(v)}`);
        } else {
          lines.push(`  - ${formatScalar(item)}`);
        }
      }
    } else if (value !== undefined && value !== null) {
      lines.push(`${key}: ${formatScalar(value)}`);
    }
  }
  return lines.join('\n');
}

function formatScalar(v: unknown): string {
  if (typeof v === 'string') {
    if (v.includes(':') || v.includes('#') || v.includes('"') || v === '') return JSON.stringify(v);
    return v;
  }
  return String(v);
}

// Re-export some types/utilities the runner script wants.
export const _internal = { knownKeys, READ_ALIASES };
