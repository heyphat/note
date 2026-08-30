// Frontmatter → Task. Pure, side-effect-free, no I/O.
//
// Per spec §2.4: read the canonical key first, fall back to aliases. Per
// §2.7: unknown fields are preserved verbatim into `_frontmatter` so they
// survive a round-trip through serialize-task.ts.
//
// This module deliberately does NOT validate semantics (required-field
// presence, date format correctness, RRULE validity, etc.). It coerces YAML
// into the typed shape and reports issues encountered during coercion.
// Validation belongs in `validate.ts`.

import {
  DEFAULT_MAPPING,
  type FieldMapping,
  type FieldReadIssue,
  readField,
} from './field-mapping';
import { parseYamlFrontmatter } from './yaml-frontmatter';
import type {
  BlockedByEntry,
  DependencyReltype,
  RecurrenceAnchor,
  Reminder,
  Task,
  TimeEntry,
} from './spec-types';

export interface ParseTaskOptions {
  mapping?: FieldMapping;
}

export interface ParseTaskResult {
  task: Task;
  /** Compatibility issues raised during coercion (not full validation). */
  issues: FieldReadIssue[];
}

/**
 * Parse a markdown string with TaskNotes frontmatter into a Task.
 *
 * Required roles missing or coerce-failing produce sentinel empty-string
 * values; `validate.ts` is responsible for flagging them. We do NOT throw on
 * missing required fields here so callers can surface the parsed-but-invalid
 * record to UI for repair.
 */
export function parseTask(raw: string, opts: ParseTaskOptions = {}): ParseTaskResult {
  const mapping = opts.mapping ?? DEFAULT_MAPPING;
  const { data: fm, body } = parseYamlFrontmatter(raw);
  const issues: FieldReadIssue[] = [];

  const read = <T>(role: Parameters<typeof readField>[1], coerce: (v: unknown) => T | undefined): T | undefined => {
    const r = readField(fm, role, mapping);
    issues.push(...r.issues);
    return r.value === undefined ? undefined : coerce(r.value);
  };

  const task: Task = {
    title: read('title', coerceString) ?? '',
    status: read('status', coerceString) ?? '',
    completed_date: read('completed_date', coerceString),
    date_created: read('date_created', coerceString) ?? '',
    date_modified: read('date_modified', coerceString) ?? '',
    id: read('id', coerceString),
    priority: read('priority', coerceString),
    due: read('due', coerceString),
    scheduled: read('scheduled', coerceString),
    tags: read('tags', coerceStringArray),
    contexts: read('contexts', coerceStringArray),
    projects: read('projects', coerceStringArray),
    time_estimate: read('time_estimate', coerceNonNegativeInt),
    time_entries: read('time_entries', coerceTimeEntries),
    recurrence: read('recurrence', coerceString),
    recurrence_anchor: read('recurrence_anchor', coerceRecurrenceAnchor),
    complete_instances: read('complete_instances', coerceStringArray),
    skipped_instances: read('skipped_instances', coerceStringArray),
    blocked_by: read('blocked_by', coerceBlockedBy),
    reminders: read('reminders', coerceReminders),
    _frontmatter: fm,
    body,
  };

  return { task, issues };
}

// --- Coercion helpers -------------------------------------------------------
// Each helper returns `undefined` when the input shape can't be coerced.
// Validation reports format errors; coercion just refuses to lie about types.

function coerceString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // Date instances can appear when js-yaml-style parsers auto-promote. The
  // `yaml` package keeps them as strings unless asked, but be defensive.
  if (v instanceof Date) return v.toISOString();
  return undefined;
}

function coerceStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const item of v) {
      const s = coerceString(item);
      if (s !== undefined) out.push(s);
    }
    return out;
  }
  if (typeof v === 'string') {
    // Frontmatter written as `tags: a, b, c` parses as a string in strict YAML.
    // Treat empty as no value, otherwise split.
    if (v.trim() === '') return [];
    return v.split(',').map(s => s.trim()).filter(Boolean);
  }
  return undefined;
}

function coerceNonNegativeInt(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.trunc(n);
}

function coerceRecurrenceAnchor(v: unknown): RecurrenceAnchor | undefined {
  const s = coerceString(v);
  return s === 'scheduled' || s === 'completion' ? s : undefined;
}

function coerceTimeEntries(v: unknown): TimeEntry[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: TimeEntry[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const startTime = coerceString(o.startTime);
    if (!startTime) continue;
    const entry: TimeEntry = { startTime };
    const endTime = coerceString(o.endTime);
    if (endTime) entry.endTime = endTime;
    const description = coerceString(o.description);
    if (description) entry.description = description;
    out.push(entry);
  }
  return out;
}

const RELTYPES: ReadonlySet<DependencyReltype> = new Set<DependencyReltype>([
  'FINISHTOSTART', 'STARTTOSTART', 'FINISHTOFINISH', 'STARTTOFINISH',
]);

function coerceBlockedBy(v: unknown): BlockedByEntry[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: BlockedByEntry[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const uid = coerceString(o.uid);
    if (!uid) continue;
    const reltypeRaw = coerceString(o.reltype);
    const reltype: DependencyReltype = reltypeRaw && RELTYPES.has(reltypeRaw as DependencyReltype)
      ? reltypeRaw as DependencyReltype
      : 'FINISHTOSTART'; // spec §10 allows defaulting when omitted
    const entry: BlockedByEntry = { uid, reltype };
    const gap = coerceString(o.gap);
    if (gap) entry.gap = gap;
    out.push(entry);
  }
  return out;
}

function coerceReminders(v: unknown): Reminder[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Reminder[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = coerceString(o.id);
    const type = coerceString(o.type);
    if (!id || (type !== 'absolute' && type !== 'relative')) continue;
    if (type === 'relative') {
      const relatedTo = coerceString(o.relatedTo);
      const offset = coerceString(o.offset);
      if (!relatedTo || !offset) continue;
      const r: Reminder = { id, type: 'relative', relatedTo, offset };
      const desc = coerceString(o.description);
      if (desc) r.description = desc;
      out.push(r);
    } else {
      const absoluteTime = coerceString(o.absoluteTime);
      if (!absoluteTime) continue;
      const r: Reminder = { id, type: 'absolute', absoluteTime };
      const desc = coerceString(o.description);
      if (desc) r.description = desc;
      out.push(r);
    }
  }
  return out;
}
