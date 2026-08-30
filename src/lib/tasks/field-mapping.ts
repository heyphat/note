// Field-mapping layer per TaskNotes spec §2.4 / §2.5.
// Each semantic role maps to a single canonical write key on disk. Vaults can
// configure the mapping; readers also accept legacy aliases so vaults written
// by other implementations round-trip cleanly.
//
// Three rules from the spec drive the design here:
//   1. Writers MUST write only the canonical key (§2.4.3).
//   2. Readers MUST resolve canonical first; aliases lose ties (§2.4.2).
//   3. When canonical wins over an alias, emit `alias_conflict_ignored` (§2.4.2).

import type { SemanticRole } from './spec-types';

/**
 * The vault-wide mapping from semantic role → canonical YAML key.
 * Most apps use the default mapping; advanced users override one or two keys
 * in settings (e.g. they already have notes with `deadline:` instead of `due`).
 */
export type FieldMapping = Record<SemanticRole, string>;

/**
 * Default canonical keys. We pick camelCase to match the example in spec §2.8
 * and what the upstream Obsidian plugin writes by default. Both casings are
 * accepted on read via READ_ALIASES.
 */
export const DEFAULT_MAPPING: FieldMapping = {
  // Required
  title: 'title',
  status: 'status',
  completed_date: 'completedDate',
  date_created: 'dateCreated',
  date_modified: 'dateModified',
  // Common
  id: 'id',
  priority: 'priority',
  due: 'due',
  scheduled: 'scheduled',
  tags: 'tags',
  contexts: 'contexts',
  projects: 'projects',
  time_estimate: 'timeEstimate',
  time_entries: 'timeEntries',
  recurrence: 'recurrence',
  recurrence_anchor: 'recurrence_anchor',
  complete_instances: 'complete_instances',
  skipped_instances: 'skipped_instances',
  blocked_by: 'blockedBy',
  reminders: 'reminders',
};

/**
 * Read-time alias table per spec §2.5. When the canonical mapping points at,
 * say, `dateCreated`, we still accept `date_created` from a vault written by a
 * different implementation. Canonical wins on tie (§2.4.2 step 4).
 *
 * Each entry is the *set* of alternate key names recognised on read for that
 * role. The active canonical key (from FieldMapping) is excluded automatically
 * by the resolver.
 */
export const READ_ALIASES: Record<SemanticRole, string[]> = {
  title: ['title'],
  status: ['status'],
  completed_date: ['completedDate', 'completed_date', 'completion'],
  date_created: ['dateCreated', 'date_created', 'created'],
  date_modified: ['dateModified', 'date_modified', 'modified'],
  id: ['id'],
  priority: ['priority'],
  due: ['due', 'dueDate', 'due_date', 'deadline'],
  scheduled: ['scheduled', 'scheduledDate', 'scheduled_date'],
  tags: ['tags'],
  contexts: ['contexts'],
  projects: ['projects'],
  time_estimate: ['timeEstimate', 'time_estimate'],
  time_entries: ['timeEntries', 'time_entries'],
  recurrence: ['recurrence'],
  recurrence_anchor: ['recurrence_anchor', 'recurrenceAnchor'],
  complete_instances: ['complete_instances', 'completeInstances'],
  skipped_instances: ['skipped_instances', 'skippedInstances'],
  blocked_by: ['blockedBy', 'blocked_by'],
  reminders: ['reminders'],
};

/** Outcome of a field read — value plus any compatibility issues. */
export interface FieldReadResult<T> {
  value: T | undefined;
  /** Compatibility issues to surface to the validator. */
  issues: FieldReadIssue[];
}

export interface FieldReadIssue {
  code: 'alias_conflict_ignored';
  role: SemanticRole;
  /** The key whose value won — the configured canonical. */
  canonical: string;
  /** Alias keys that were present alongside it. */
  aliases: string[];
}

/**
 * Resolve a single semantic role against a frontmatter object using the
 * canonical-precedence policy:
 *
 *   1. If the canonical key (per `mapping`) is present and non-empty, use it.
 *   2. Otherwise, walk known aliases in declaration order and use the first
 *      that's present and non-empty.
 *   3. If both canonical and aliases are present, canonical wins and we emit
 *      `alias_conflict_ignored` listing the also-present aliases.
 *
 * "Empty" here means: undefined, null, empty string after trim. Empty arrays
 * count as present (a user explicitly setting `tags: []` is meaningful).
 */
export function readField(
  frontmatter: Record<string, unknown>,
  role: SemanticRole,
  mapping: FieldMapping = DEFAULT_MAPPING,
): FieldReadResult<unknown> {
  const canonicalKey = mapping[role];
  const aliasKeys = READ_ALIASES[role].filter(k => k !== canonicalKey);

  const canonicalValue = frontmatter[canonicalKey];
  const presentAliases = aliasKeys.filter(k => isPresent(frontmatter[k]));

  if (isPresent(canonicalValue)) {
    const issues: FieldReadIssue[] = presentAliases.length > 0
      ? [{ code: 'alias_conflict_ignored', role, canonical: canonicalKey, aliases: presentAliases }]
      : [];
    return { value: canonicalValue, issues };
  }

  // Canonical absent — first alias wins.
  for (const alias of presentAliases) {
    return { value: frontmatter[alias], issues: [] };
  }

  return { value: undefined, issues: [] };
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/**
 * Set of every key (canonical + aliases) recognised by the mapping. Used by
 * the parser to identify which keys are "known" so unknown fields can be
 * preserved verbatim per spec §2.7.
 */
export function knownKeys(mapping: FieldMapping = DEFAULT_MAPPING): Set<string> {
  const out = new Set<string>();
  for (const role of Object.keys(mapping) as SemanticRole[]) {
    out.add(mapping[role]);
    for (const alias of READ_ALIASES[role]) out.add(alias);
  }
  return out;
}
