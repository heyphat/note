// Reminder operations per spec §10.3.
//
// API:
//   - addReminder    (validates id uniqueness; auto-generates id when omitted)
//   - updateReminder (patch-by-default; addressed by id)
//   - removeReminder (idempotent)
//
// Trigger-time computation (§10.3.4) is *not* a mutation — it lives below as
// `computeTrigger()` so views and notification scheduling can call it
// without going through the store.

import { mutateTask, type MutateConfig, type MutateResult } from './mutate-task';
import type { Reminder, SpecDate, SpecDateOrDateTime, Task } from './spec-types';
import type { TaskStore } from './task-store';

export type ReminderOpResult = MutateResult<{ id?: string }>;

export type ReminderInput =
  | { id?: string; type: 'absolute'; absoluteTime: string; description?: string }
  | { id?: string; type: 'relative'; relatedTo: 'due' | 'scheduled' | 'start'; offset: string; description?: string };

export interface ReminderConfig extends MutateConfig {
  /** When `relatedTo`-based date-only fields need a wall-clock anchor. Default `00:00`. */
  dateOnlyAnchorTime?: string;
}

export async function addReminder(
  store: TaskStore,
  path: string,
  input: ReminderInput,
  config: ReminderConfig = {},
): Promise<ReminderOpResult> {
  return mutateTask(store, path, async (task) => {
    const id = input.id ?? generateReminderId(task);
    if (!isValidId(id)) return invalidMutator('reminder id is required');
    if ((task.reminders ?? []).some(r => r.id === id)) {
      return { reject: { reason: 'mutator_rejected', message: `duplicate reminder id: ${id}`, code: 'duplicate_reminder_id' } };
    }
    const reminder = buildReminder({ ...input, id });
    return {
      task: { ...task, reminders: [...(task.reminders ?? []), reminder] },
      extra: { id },
    };
  }, config);
}

export async function updateReminder(
  store: TaskStore,
  path: string,
  id: string,
  patch: Partial<ReminderInput>,
  config: ReminderConfig = {},
): Promise<ReminderOpResult> {
  if (!id) return invalidInput('id is required');
  return mutateTask(store, path, async (task) => {
    const list = task.reminders ?? [];
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) {
      return { reject: { reason: 'mutator_rejected', message: `no reminder with id: ${id}`, code: 'reminder_not_found' } };
    }
    const merged = mergeReminder(list[idx], patch);
    if (remindersEqual(list[idx], merged)) return null;
    const next = list.slice();
    next[idx] = merged;
    return { task: { ...task, reminders: next }, extra: { id } };
  }, config);
}

export async function removeReminder(
  store: TaskStore,
  path: string,
  id: string,
  config: ReminderConfig = {},
): Promise<ReminderOpResult> {
  if (!id) return invalidInput('id is required');
  return mutateTask(store, path, async (task) => {
    const list = task.reminders ?? [];
    const filtered = list.filter(r => r.id !== id);
    if (filtered.length === list.length) return null; // idempotent
    return {
      task: { ...task, reminders: filtered.length > 0 ? filtered : undefined },
      extra: { id },
    };
  }, config);
}

// --- Trigger-time computation (read-only, no mutation) --------------------

export interface ComputedTrigger {
  reminder: Reminder;
  /** ISO instant when the reminder fires, or `null` if base is unresolvable. */
  triggerInstant: string | null;
  /** Set when this reminder is unresolvable (`relatedTo` field absent). */
  unresolved?: 'missing_base';
}

/**
 * Compute trigger instants for every reminder on a task per §10.3.4.
 * Returns the list sorted by trigger instant ascending; ties broken by `id`.
 *
 * This function never throws; reminders that can't be resolved come back with
 * `triggerInstant: null` and `unresolved: 'missing_base'`.
 */
export function computeTriggers(
  task: Task,
  opts: { dateOnlyAnchorTime?: string } = {},
): ComputedTrigger[] {
  const anchor = parseClockAnchor(opts.dateOnlyAnchorTime ?? '00:00');
  const out: ComputedTrigger[] = (task.reminders ?? []).map(r => {
    if (r.type === 'absolute') {
      return { reminder: r, triggerInstant: r.absoluteTime };
    }
    const base = r.relatedTo === 'due' ? task.due
      : r.relatedTo === 'scheduled' ? task.scheduled
      : undefined;
    if (!base) return { reminder: r, triggerInstant: null, unresolved: 'missing_base' };
    const baseInstant = baseToInstant(base, anchor);
    if (!baseInstant) return { reminder: r, triggerInstant: null, unresolved: 'missing_base' };
    const triggerMs = baseInstant.getTime() + parseIsoDurationMs(r.offset);
    return { reminder: r, triggerInstant: new Date(triggerMs).toISOString().replace(/\.\d+(?=Z)/, '') };
  });
  return out.sort((a, b) => {
    const ai = a.triggerInstant ?? '';
    const bi = b.triggerInstant ?? '';
    if (ai !== bi) return ai < bi ? -1 : 1;
    return a.reminder.id < b.reminder.id ? -1 : 1;
  });
}

// --- Helpers --------------------------------------------------------------

function buildReminder(input: ReminderInput & { id: string }): Reminder {
  if (input.type === 'absolute') {
    const out: Reminder = { id: input.id, type: 'absolute', absoluteTime: input.absoluteTime };
    if (input.description) out.description = input.description;
    return out;
  }
  const out: Reminder = {
    id: input.id,
    type: 'relative',
    relatedTo: input.relatedTo,
    offset: input.offset,
  };
  if (input.description) out.description = input.description;
  return out;
}

function mergeReminder(existing: Reminder, patch: Partial<ReminderInput>): Reminder {
  // Patch must keep the discriminator (`type`) coherent. If caller supplies
  // a new type, it must come with the matching required fields.
  if (patch.type && patch.type !== existing.type) {
    if (patch.type === 'absolute' && 'absoluteTime' in patch && patch.absoluteTime) {
      const out: Reminder = { id: existing.id, type: 'absolute', absoluteTime: patch.absoluteTime };
      if (patch.description ?? existing.description) out.description = patch.description ?? existing.description;
      return out;
    }
    if (patch.type === 'relative' && 'relatedTo' in patch && 'offset' in patch && patch.relatedTo && patch.offset) {
      const out: Reminder = { id: existing.id, type: 'relative', relatedTo: patch.relatedTo, offset: patch.offset };
      if (patch.description ?? existing.description) out.description = patch.description ?? existing.description;
      return out;
    }
    // Incompatible patch — leave existing untouched.
    return existing;
  }
  // Same type: merge in-place.
  if (existing.type === 'absolute') {
    return {
      id: existing.id,
      type: 'absolute',
      absoluteTime: ('absoluteTime' in patch && patch.absoluteTime) ? patch.absoluteTime : existing.absoluteTime,
      ...(((patch.description ?? existing.description) !== undefined)
        ? { description: patch.description ?? existing.description }
        : {}),
    };
  }
  return {
    id: existing.id,
    type: 'relative',
    relatedTo: ('relatedTo' in patch && patch.relatedTo) ? patch.relatedTo : existing.relatedTo,
    offset: ('offset' in patch && patch.offset) ? patch.offset : existing.offset,
    ...(((patch.description ?? existing.description) !== undefined)
      ? { description: patch.description ?? existing.description }
      : {}),
  };
}

function remindersEqual(a: Reminder, b: Reminder): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function generateReminderId(task: Task): string {
  const existing = new Set((task.reminders ?? []).map(r => r.id));
  for (let i = 1; i < 9999; i++) {
    const candidate = `r${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `r${Date.now()}`;
}

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.trim().length > 0;
}

function parseClockAnchor(s: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return { h: 0, m: 0 };
  return { h: Number(m[1]), m: Number(m[2]) };
}

function baseToInstant(value: SpecDateOrDateTime, anchor: { h: number; m: number }): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Date only — use anchor wall-clock in *UTC* for portability.
    // Local-time anchoring is left to the runtime view layer.
    const d = new Date(`${value}T00:00:00Z`);
    d.setUTCHours(anchor.h, anchor.m, 0, 0);
    return d;
  }
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

const DURATION_RE = /^(-)?P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

function parseIsoDurationMs(input: string): number {
  const m = DURATION_RE.exec(input);
  if (!m) return 0;
  const sign = m[1] ? -1 : 1;
  const years = Number(m[2] ?? 0);
  const months = Number(m[3] ?? 0);
  const weeks = Number(m[4] ?? 0);
  const days = Number(m[5] ?? 0);
  const hours = Number(m[6] ?? 0);
  const minutes = Number(m[7] ?? 0);
  const seconds = Number(m[8] ?? 0);
  // Use 30 days/month and 365.25 days/year as portable approximations. The
  // spec is silent on calendar-correct evaluation; consumers needing exact
  // semantics resolve against a calendar themselves.
  const ms = (((years * 365.25) + (months * 30) + (weeks * 7) + days) * 24 * 3600
    + (hours * 3600) + (minutes * 60) + seconds) * 1000;
  return sign * ms;
}

function invalidInput(message: string): ReminderOpResult {
  return { ok: false, reason: 'invalid_input', issues: [], message };
}

function invalidMutator(message: string): { reject: { reason: 'invalid_input'; message: string } } {
  return { reject: { reason: 'invalid_input', message } };
}

// Re-exports kept tight: callers should import via `lib/tasks` barrel.
export type { SpecDate };
