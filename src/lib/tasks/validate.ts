// Task validation per TaskNotes spec §6.
//
// Three validation phases:
//   1. Schema  — types and role constraints (run by parse-task in part)
//   2. Semantic — cross-field invariants
//   3. Profile — extended-profile checks (deps, reminders) when those fields are present
//
// We support the strict mode required by the spec. Permissive mode is a
// straight subset: same checks, but warnings don't block writes (the
// `blocksWrite()` helper makes that explicit for callers).

import type {
  AbsoluteReminder,
  BlockedByEntry,
  RelativeReminder,
  Reminder,
  Task,
  TimeEntry,
} from './spec-types';
import type { FieldReadIssue } from './field-mapping';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  code: ValidationCode;
  severity: IssueSeverity;
  message: string;
  /** Dot-path or bracket-path to the offending field (e.g. `timeEntries[0].endTime`). */
  field?: string;
  expected?: string;
  actual?: string;
}

export type ValidationCode =
  | 'missing_required'
  | 'invalid_type'
  | 'invalid_enum_value'
  | 'invalid_date_value'
  | 'invalid_datetime_value'
  | 'invalid_recurrence_anchor'
  | 'invalid_recurrence_rule'
  | 'instance_state_overlap'
  | 'invalid_time_range'
  | 'missing_time_entry_start'
  | 'multiple_active_time_entries'
  | 'invalid_dependency_entry'
  | 'invalid_dependency_reltype'
  | 'invalid_dependency_gap'
  | 'self_dependency'
  | 'invalid_reminder_entry'
  | 'duplicate_reminder_id'
  | 'invalid_reminder_type'
  | 'invalid_reminder_offset'
  | 'invalid_reminder_related_to'
  | 'invalid_reminder_absolute_time'
  | 'unresolvable_reminder_base'
  | 'invalid_task_id'
  | 'date_modified_before_created'
  | 'alias_conflict_ignored';

export type ValidationMode = 'strict' | 'permissive';

export interface ValidateOptions {
  mode?: ValidationMode;
  /** Issues raised during parse (e.g. alias conflicts) merged into the result. */
  parseIssues?: FieldReadIssue[];
  /** Configured set of status values that mean "completed" (spec §2.2.1). */
  completedStatusValues?: ReadonlySet<string>;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  mode: ValidationMode;
}

const DEFAULT_COMPLETED_STATUS_VALUES = new Set(['done', 'completed']);

/**
 * Validate a parsed Task. Pure: doesn't read disk, doesn't traverse other
 * tasks. Cross-task checks (duplicate ids, unresolvable links) belong to a
 * collection-scoped validator that can be added later in the indexing layer.
 */
export function validateTask(task: Task, opts: ValidateOptions = {}): ValidationResult {
  const mode = opts.mode ?? 'strict';
  const completedValues = opts.completedStatusValues ?? DEFAULT_COMPLETED_STATUS_VALUES;
  const issues: ValidationIssue[] = [];

  // §6.4 check 1 — required roles.
  if (!nonEmpty(task.title)) {
    issues.push({ code: 'missing_required', severity: 'error', field: 'title', message: "Required field 'title' is missing." });
  }
  if (!nonEmpty(task.status)) {
    issues.push({ code: 'missing_required', severity: 'error', field: 'status', message: "Required field 'status' is missing." });
  }
  if (!nonEmpty(task.date_created)) {
    issues.push({ code: 'missing_required', severity: 'error', field: 'dateCreated', message: "Required field 'dateCreated' is missing." });
  } else if (!isCanonicalDateTime(task.date_created)) {
    issues.push({ code: 'invalid_datetime_value', severity: 'error', field: 'dateCreated', message: 'dateCreated must be a canonical ISO-8601 datetime with offset.', actual: task.date_created });
  }
  if (!nonEmpty(task.date_modified)) {
    issues.push({ code: 'missing_required', severity: 'error', field: 'dateModified', message: "Required field 'dateModified' is missing." });
  } else if (!isCanonicalDateTime(task.date_modified)) {
    issues.push({ code: 'invalid_datetime_value', severity: 'error', field: 'dateModified', message: 'dateModified must be a canonical ISO-8601 datetime with offset.', actual: task.date_modified });
  }

  // §6.4 check 1a — completed_date conditional requiredness.
  const isCompleted = completedValues.has(task.status) && !task.recurrence;
  if (isCompleted && !task.completed_date) {
    issues.push({
      code: 'missing_required',
      severity: 'error',
      field: 'completedDate',
      message: 'completedDate is required when status is in the configured completed set (non-recurring task).',
    });
  }
  if (task.completed_date && !isCanonicalDate(task.completed_date)) {
    issues.push({ code: 'invalid_date_value', severity: 'error', field: 'completedDate', message: 'completedDate must be YYYY-MM-DD.', actual: task.completed_date });
  }

  // §6.4 check 3 — date and datetime parsing for date-or-datetime roles.
  validateDateOrDateTime(task.due, 'due', mode, issues);
  validateDateOrDateTime(task.scheduled, 'scheduled', mode, issues);

  for (const d of task.complete_instances ?? []) {
    if (!isCanonicalDate(d)) {
      issues.push({ code: 'invalid_date_value', severity: 'error', field: 'completeInstances', message: 'instance date must be YYYY-MM-DD.', actual: d });
    }
  }
  for (const d of task.skipped_instances ?? []) {
    if (!isCanonicalDate(d)) {
      issues.push({ code: 'invalid_date_value', severity: 'error', field: 'skippedInstances', message: 'instance date must be YYYY-MM-DD.', actual: d });
    }
  }

  // §6.4 check 5 — instance state overlap.
  if (task.complete_instances && task.skipped_instances) {
    const completed = new Set(task.complete_instances);
    for (const d of task.skipped_instances) {
      if (completed.has(d)) {
        issues.push({
          code: 'instance_state_overlap',
          severity: 'error',
          field: 'skippedInstances',
          message: 'same date exists in complete and skipped instance lists.',
          actual: d,
        });
      }
    }
  }

  // §6.4 check 6 — date_modified not earlier than date_created.
  if (task.date_modified && task.date_created
    && isCanonicalDateTime(task.date_modified) && isCanonicalDateTime(task.date_created)
    && Date.parse(task.date_modified) < Date.parse(task.date_created)
  ) {
    issues.push({
      code: 'date_modified_before_created',
      severity: 'error',
      field: 'dateModified',
      message: 'dateModified must not be earlier than dateCreated.',
    });
  }

  // §6.4 check 7 — time_estimate non-negative when present.
  if (task.time_estimate !== undefined && (typeof task.time_estimate !== 'number' || task.time_estimate < 0)) {
    issues.push({ code: 'invalid_type', severity: 'error', field: 'timeEstimate', message: 'timeEstimate must be a non-negative integer.' });
  }

  // §6.4 check 8 — time_entries.
  if (task.time_entries) validateTimeEntries(task.time_entries, issues);

  // §6.4 check 9 — recurrence_anchor enum.
  if (task.recurrence_anchor !== undefined
    && task.recurrence_anchor !== 'scheduled'
    && task.recurrence_anchor !== 'completion'
  ) {
    issues.push({
      code: 'invalid_recurrence_anchor',
      severity: 'error',
      field: 'recurrence_anchor',
      message: "recurrence anchor must be 'scheduled' or 'completion'.",
      actual: String(task.recurrence_anchor),
    });
  }

  // §6.4 check 9 / §10 — blocked_by entries.
  if (task.blocked_by) validateBlockedBy(task.blocked_by, task.id, issues);

  // §6.4 check 10 / §10.3 — reminders.
  if (task.reminders) {
    validateReminders(task.reminders, { hasDue: !!task.due, hasScheduled: !!task.scheduled, hasStart: false }, issues);
  }

  // §6.4 check 15 — semantic id is non-empty when present.
  if (task.id !== undefined && (typeof task.id !== 'string' || task.id.trim() === '')) {
    issues.push({ code: 'invalid_task_id', severity: 'error', field: 'id', message: 'id must be a non-empty string.' });
  }

  // alias_conflict_ignored from parse-task (always warning).
  for (const pi of opts.parseIssues ?? []) {
    issues.push({
      code: 'alias_conflict_ignored',
      severity: 'warning',
      field: pi.canonical,
      message: `alias key(s) ${pi.aliases.join(', ')} ignored due to canonical conflict on ${pi.canonical}`,
    });
  }

  return { issues, mode };
}

/** Convenience: any error-severity issue blocks writes in strict mode. */
export function blocksWrite(result: ValidationResult): boolean {
  if (result.mode === 'permissive') return false;
  return result.issues.some(i => i.severity === 'error');
}

// --- Helpers ----------------------------------------------------------------

function nonEmpty(s: string | undefined | null): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isCanonicalDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  // Reject impossible calendar dates (e.g. 2026-02-30).
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

export function isCanonicalDateTime(s: string): boolean {
  if (!DATETIME_RE.test(s)) return false;
  return !Number.isNaN(Date.parse(s));
}

function validateDateOrDateTime(
  value: string | undefined,
  field: string,
  mode: ValidationMode,
  issues: ValidationIssue[],
): void {
  if (value === undefined) return;
  if (isCanonicalDate(value) || isCanonicalDateTime(value)) return;
  // Per §3.4.4: offset-less local datetimes are rejected in strict mode.
  // Permissive accepts under documented compat policy with a warning. We
  // currently *don't* document any such policy, so still raise an error in
  // permissive mode but downgrade severity to warning.
  if (mode === 'permissive') {
    issues.push({ code: 'invalid_datetime_value', severity: 'warning', field, message: `${field} is not a canonical date or datetime.`, actual: value });
  } else {
    issues.push({ code: 'invalid_datetime_value', severity: 'error', field, message: `${field} is not a canonical date or datetime.`, actual: value });
  }
}

function validateTimeEntries(entries: TimeEntry[], issues: ValidationIssue[]): void {
  let activeCount = 0;
  entries.forEach((entry, idx) => {
    if (!entry.startTime) {
      issues.push({ code: 'missing_time_entry_start', severity: 'error', field: `timeEntries[${idx}].startTime`, message: 'time entry is missing required startTime.' });
      return;
    }
    if (!isCanonicalDateTime(entry.startTime)) {
      issues.push({ code: 'invalid_datetime_value', severity: 'error', field: `timeEntries[${idx}].startTime`, message: 'startTime must be a canonical datetime.', actual: entry.startTime });
    }
    if (!entry.endTime) {
      activeCount += 1;
      return;
    }
    if (!isCanonicalDateTime(entry.endTime)) {
      issues.push({ code: 'invalid_datetime_value', severity: 'error', field: `timeEntries[${idx}].endTime`, message: 'endTime must be a canonical datetime.', actual: entry.endTime });
      return;
    }
    if (Date.parse(entry.endTime) < Date.parse(entry.startTime)) {
      issues.push({ code: 'invalid_time_range', severity: 'error', field: `timeEntries[${idx}]`, message: 'endTime is earlier than startTime.' });
    }
  });
  if (activeCount > 1) {
    issues.push({
      code: 'multiple_active_time_entries',
      severity: 'error',
      field: 'timeEntries',
      message: 'task contains more than one active time entry.',
    });
  }
}

const RELTYPES = ['FINISHTOSTART', 'STARTTOSTART', 'FINISHTOFINISH', 'STARTTOFINISH'];
const ISO_DURATION_RE = /^-?P(?!$)(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/;

function isIsoDuration(s: string): boolean {
  return ISO_DURATION_RE.test(s) && s !== 'P' && s !== '-P';
}

function validateBlockedBy(entries: BlockedByEntry[], selfId: string | undefined, issues: ValidationIssue[]): void {
  entries.forEach((entry, idx) => {
    if (!entry.uid || typeof entry.uid !== 'string') {
      issues.push({ code: 'invalid_dependency_entry', severity: 'error', field: `blockedBy[${idx}]`, message: 'dependency uid is required.' });
      return;
    }
    if (!RELTYPES.includes(entry.reltype)) {
      issues.push({
        code: 'invalid_dependency_reltype',
        severity: 'error',
        field: `blockedBy[${idx}].reltype`,
        message: `reltype must be one of ${RELTYPES.join(', ')}.`,
        actual: String(entry.reltype),
      });
    }
    if (entry.gap !== undefined && !isIsoDuration(entry.gap)) {
      issues.push({ code: 'invalid_dependency_gap', severity: 'error', field: `blockedBy[${idx}].gap`, message: 'gap must be a valid ISO-8601 duration.', actual: entry.gap });
    }
    // Self-dependency: the spec only requires this when uid resolves to the
    // task itself. Without the index we can only check for a literal `id` or
    // wikilink whose target plainly matches our id.
    if (selfId && (entry.uid === selfId || entry.uid === `[[${selfId}]]`)) {
      issues.push({ code: 'self_dependency', severity: 'error', field: `blockedBy[${idx}]`, message: 'task cannot depend on itself.' });
    }
  });
}

function validateReminders(
  reminders: Reminder[],
  context: { hasDue: boolean; hasScheduled: boolean; hasStart: boolean },
  issues: ValidationIssue[],
): void {
  const ids = new Set<string>();
  reminders.forEach((reminder, idx) => {
    if (!reminder.id) {
      issues.push({ code: 'invalid_reminder_entry', severity: 'error', field: `reminders[${idx}]`, message: 'reminder id is required.' });
      return;
    }
    if (ids.has(reminder.id)) {
      issues.push({ code: 'duplicate_reminder_id', severity: 'error', field: `reminders[${idx}].id`, message: 'duplicate reminder id within task.', actual: reminder.id });
    }
    ids.add(reminder.id);

    if (reminder.type !== 'absolute' && reminder.type !== 'relative') {
      issues.push({ code: 'invalid_reminder_type', severity: 'error', field: `reminders[${idx}].type`, message: "reminder type must be 'absolute' or 'relative'." });
      return;
    }
    if (reminder.type === 'absolute') {
      validateAbsoluteReminder(reminder, idx, issues);
    } else {
      validateRelativeReminder(reminder, idx, context, issues);
    }
  });
}

function validateAbsoluteReminder(r: AbsoluteReminder, idx: number, issues: ValidationIssue[]): void {
  if (!r.absoluteTime || !isCanonicalDateTime(r.absoluteTime)) {
    issues.push({
      code: 'invalid_reminder_absolute_time',
      severity: 'error',
      field: `reminders[${idx}].absoluteTime`,
      message: 'absoluteTime must be a canonical datetime.',
      actual: r.absoluteTime,
    });
  }
}

function validateRelativeReminder(
  r: RelativeReminder,
  idx: number,
  ctx: { hasDue: boolean; hasScheduled: boolean; hasStart: boolean },
  issues: ValidationIssue[],
): void {
  if (r.relatedTo !== 'due' && r.relatedTo !== 'scheduled' && r.relatedTo !== 'start') {
    issues.push({
      code: 'invalid_reminder_related_to',
      severity: 'error',
      field: `reminders[${idx}].relatedTo`,
      message: 'relatedTo must be due, scheduled, or start.',
      actual: r.relatedTo,
    });
  }
  if (!isIsoDuration(r.offset)) {
    issues.push({
      code: 'invalid_reminder_offset',
      severity: 'error',
      field: `reminders[${idx}].offset`,
      message: 'offset must be a valid ISO-8601 duration.',
      actual: r.offset,
    });
  }
  const hasBase = (r.relatedTo === 'due' && ctx.hasDue)
    || (r.relatedTo === 'scheduled' && ctx.hasScheduled)
    || (r.relatedTo === 'start' && ctx.hasStart);
  if (!hasBase) {
    issues.push({
      code: 'unresolvable_reminder_base',
      severity: 'error',
      field: `reminders[${idx}]`,
      message: `relative reminder references ${r.relatedTo} but no ${r.relatedTo} value exists.`,
    });
  }
}
