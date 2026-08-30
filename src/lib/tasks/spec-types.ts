// Types from the TaskNotes spec §2 (semantic roles).
// Single source of truth: every other module in `lib/tasks/*` imports from here.
// https://github.com/callumalpass/tasknotes-spec/blob/main/02-model-and-mapping.md

/** A YYYY-MM-DD calendar date. */
export type SpecDate = string;

/** ISO-8601 datetime, typically with `Z` or an offset. */
export type SpecDateTime = string;

/** A `date` field — calendar date or datetime; the spec allows either at this granularity. */
export type SpecDateOrDateTime = SpecDate | SpecDateTime;

/** ISO-8601 duration string, e.g. `P1D`, `PT30M`, `-PT1H`. */
export type IsoDuration = string;

/** Recurrence anchor mode — see spec §4.4. */
export type RecurrenceAnchor = 'scheduled' | 'completion';

/** Dependency relation type — RFC 5545 RELTYPE values, spec §10. */
export type DependencyReltype =
  | 'FINISHTOSTART'
  | 'STARTTOSTART'
  | 'FINISHTOFINISH'
  | 'STARTTOFINISH';

/** A single time-tracking entry. Spec §2.6.1. */
export interface TimeEntry {
  /** Required; ISO-8601 datetime. */
  startTime: SpecDateTime;
  /** Optional; if absent the entry is an active/running session. */
  endTime?: SpecDateTime;
  /** Optional free-text description. */
  description?: string;
}

/** A single dependency record. Spec §2.6.3. */
export interface BlockedByEntry {
  /** Link or string task reference. Wikilinks (`[[…]]`) are preferred when supported. */
  uid: string;
  /** Required; default allowed when omitted. */
  reltype: DependencyReltype;
  /** Optional ISO-8601 duration gap. */
  gap?: IsoDuration;
}

/** Reminder record — relative variant. Spec §2.6.4. */
export interface RelativeReminder {
  id: string;
  type: 'relative';
  /** What the offset is relative to: typically `due`, `scheduled`, or `start`. */
  relatedTo: string;
  /** ISO-8601 duration. Negative values mean "before". */
  offset: IsoDuration;
  description?: string;
}

/** Reminder record — absolute variant. Spec §2.6.4. */
export interface AbsoluteReminder {
  id: string;
  type: 'absolute';
  /** Required ISO-8601 datetime. */
  absoluteTime: SpecDateTime;
  description?: string;
}

export type Reminder = RelativeReminder | AbsoluteReminder;

/**
 * The semantic-role enumeration used by the field-mapping layer. Each role
 * appears exactly once on a Task; the runtime mapping decides which YAML key
 * stores it on disk.
 */
export type SemanticRole =
  // 2.2 Required
  | 'title'
  | 'status'
  | 'completed_date'
  | 'date_created'
  | 'date_modified'
  // 2.3 Common
  | 'id'
  | 'priority'
  | 'due'
  | 'scheduled'
  | 'tags'
  | 'contexts'
  | 'projects'
  | 'time_estimate'
  | 'time_entries'
  | 'recurrence'
  | 'recurrence_anchor'
  | 'complete_instances'
  | 'skipped_instances'
  | 'blocked_by'
  | 'reminders';

/**
 * A parsed task record. Mirrors the spec semantic-role names (snake_case),
 * not the on-disk write keys — those are decided per-vault by the FieldMapping.
 *
 * Required roles are always present. Common roles are optional. The original
 * frontmatter object is preserved so unknown fields survive round-trips
 * (spec §2.7).
 */
export interface Task {
  // Required (§2.2)
  title: string;
  status: string;
  completed_date?: SpecDate;
  date_created: SpecDateTime;
  date_modified: SpecDateTime;
  // Common (§2.3)
  id?: string;
  priority?: string;
  due?: SpecDateOrDateTime;
  scheduled?: SpecDateOrDateTime;
  tags?: string[];
  contexts?: string[];
  projects?: string[];
  time_estimate?: number;
  time_entries?: TimeEntry[];
  recurrence?: string;
  recurrence_anchor?: RecurrenceAnchor;
  complete_instances?: SpecDate[];
  skipped_instances?: SpecDate[];
  blocked_by?: BlockedByEntry[];
  reminders?: Reminder[];

  /**
   * The raw frontmatter object as parsed (after alias resolution but before
   * mapping into semantic fields). Held so unknown keys survive serialisation.
   * Per spec §2.7, unknown frontmatter keys MUST be preserved by default.
   */
  _frontmatter: Record<string, unknown>;

  /**
   * Markdown body (everything after the frontmatter block). Free-form notes,
   * non-normative for task semantics.
   */
  body: string;
}

/**
 * A reference to a task — either by stable `id` (preferred when present) or by
 * file path. Used by operations and the index when one task references
 * another.
 */
export type TaskRef = { kind: 'id'; id: string } | { kind: 'path'; path: string };
