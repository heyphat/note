// Task → markdown string. Pure, side-effect-free.
//
// Spec §2.4.3 Write behaviour:
//   - write only canonical keys
//   - avoid introducing alias keys in new writes
//   - preserve unknown fields unless the operation explicitly opts into normalization
//
// The serializer takes a Task, writes each populated semantic role under its
// canonical key (per FieldMapping), then layers any unknown frontmatter on top
// so user-added fields survive. If an unknown key collides with a known
// canonical/alias key, the canonical wins (we never reintroduce aliases).

import { DEFAULT_MAPPING, READ_ALIASES, type FieldMapping } from './field-mapping';
import { serializeYamlFrontmatter } from './yaml-frontmatter';
import type { SemanticRole, Task } from './spec-types';

export interface SerializeTaskOptions {
  mapping?: FieldMapping;
  /**
   * When true, drops any unknown frontmatter keys instead of preserving them.
   * Used by explicit normalization/migration operations (spec §2.7 carve-out).
   * Default: false.
   */
  normalizeStripUnknown?: boolean;
}

/** Stable key order for the canonical fields. Required first, then common. */
const ROLE_ORDER: SemanticRole[] = [
  'id',
  'title',
  'status',
  'priority',
  'due',
  'scheduled',
  'completed_date',
  'date_created',
  'date_modified',
  'contexts',
  'projects',
  'tags',
  'time_estimate',
  'time_entries',
  'recurrence',
  'recurrence_anchor',
  'complete_instances',
  'skipped_instances',
  'blocked_by',
  'reminders',
];

export function serializeTask(task: Task, opts: SerializeTaskOptions = {}): string {
  const mapping = opts.mapping ?? DEFAULT_MAPPING;
  const out: Record<string, unknown> = {};

  // 1. Layer in unknown fields first (lowest priority — canonical wins on collision).
  if (!opts.normalizeStripUnknown && task._frontmatter) {
    const reservedKeys = reservedKeySet(mapping);
    for (const [key, value] of Object.entries(task._frontmatter)) {
      if (reservedKeys.has(key)) continue;
      out[key] = value;
    }
  }

  // 2. Write each semantic role under its canonical key, in stable order.
  for (const role of ROLE_ORDER) {
    const canonical = mapping[role];
    const value = roleValue(task, role);
    if (value === undefined) continue;
    out[canonical] = value;
  }

  return serializeYamlFrontmatter(out, task.body ?? '');
}

/**
 * Set of keys reserved by the mapping — both the active canonical key for
 * every role AND every recognised alias. Unknown-field preservation skips any
 * key in this set so a stale alias (e.g. `date_created` when canonical is
 * `dateCreated`) never lingers in the output.
 */
function reservedKeySet(mapping: FieldMapping): Set<string> {
  const out = new Set<string>();
  for (const role of Object.keys(mapping) as SemanticRole[]) {
    out.add(mapping[role]);
    for (const alias of READ_ALIASES[role]) out.add(alias);
  }
  return out;
}

/**
 * Pull a semantic role's value off a Task. Returns `undefined` for fields
 * that are absent or empty-array — empty arrays don't round-trip, treat them
 * as absent on write to keep the file tidy. (Validators that need to
 * distinguish "absent" from "explicitly empty" should check `_frontmatter`.)
 */
function roleValue(task: Task, role: SemanticRole): unknown {
  switch (role) {
    case 'title':           return nonEmptyString(task.title);
    case 'status':          return nonEmptyString(task.status);
    case 'completed_date':  return nonEmptyString(task.completed_date);
    case 'date_created':    return nonEmptyString(task.date_created);
    case 'date_modified':   return nonEmptyString(task.date_modified);
    case 'id':              return nonEmptyString(task.id);
    case 'priority':        return nonEmptyString(task.priority);
    case 'due':             return nonEmptyString(task.due);
    case 'scheduled':       return nonEmptyString(task.scheduled);
    case 'tags':            return nonEmptyArray(task.tags);
    case 'contexts':        return nonEmptyArray(task.contexts);
    case 'projects':        return nonEmptyArray(task.projects);
    case 'time_estimate':   return typeof task.time_estimate === 'number' ? task.time_estimate : undefined;
    case 'time_entries':    return nonEmptyArray(task.time_entries);
    case 'recurrence':      return nonEmptyString(task.recurrence);
    case 'recurrence_anchor': return task.recurrence_anchor ?? undefined;
    case 'complete_instances': return nonEmptyArray(task.complete_instances);
    case 'skipped_instances': return nonEmptyArray(task.skipped_instances);
    case 'blocked_by':      return nonEmptyArray(task.blocked_by);
    case 'reminders':       return nonEmptyArray(task.reminders);
  }
}

function nonEmptyString(s: string | undefined): string | undefined {
  if (s === undefined || s === null) return undefined;
  const trimmed = String(s).trim();
  return trimmed.length === 0 ? undefined : s;
}

function nonEmptyArray<T>(arr: T[] | undefined): T[] | undefined {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr;
}
