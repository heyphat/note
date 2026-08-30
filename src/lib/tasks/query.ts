// Bases-equivalent query layer.
//
// TaskNotes' Obsidian implementation builds its views from `.base` files
// (Obsidian's database query DSL). We don't have Bases — this module is the
// equivalent: pure filter / sort / group / computed-column logic over an
// in-memory task list. Views consume it by passing a TaskQuery and getting
// back a structured result.
//
// Everything here is pure, side-effect-free, and synchronous. UI components
// pipe `taskIndex.all()` through `runQuery()` whenever the index updates.

import type { Task } from './spec-types';

/** A filterable axis — every filter operates on one of these names. */
export type FilterField =
  | 'status'
  | 'priority'
  | 'tag'
  | 'context'
  | 'project'
  | 'due'
  | 'scheduled'
  | 'dateCreated'
  | 'dateModified'
  | 'completedDate'
  | 'recurring'
  | 'overdue'
  | 'text';

export type FilterOperator =
  | 'eq' | 'ne'
  | 'lt' | 'lte' | 'gt' | 'gte'
  | 'in' | 'notIn'
  | 'contains' | 'startsWith'
  | 'exists' | 'missing'
  | 'isTrue' | 'isFalse';

export interface Filter {
  field: FilterField;
  op: FilterOperator;
  /** Argument: scalar, array (for in/notIn), or unused (exists/missing/isTrue/isFalse). */
  value?: string | number | string[] | boolean;
}

export type SortField =
  | 'title' | 'status' | 'priority' | 'due' | 'scheduled'
  | 'dateCreated' | 'dateModified' | 'completedDate'
  | 'urgencyScore' | 'daysUntilDue' | 'timeEstimate';

export interface Sort {
  field: SortField;
  /** 'asc' | 'desc'. Default 'asc'. */
  direction?: 'asc' | 'desc';
}

export type GroupAxis =
  | 'none'
  | 'status'
  | 'priority'
  | 'project'
  | 'context'
  | 'tag'
  | 'dueBucket'    // Overdue / Today / Tomorrow / This week / Later / No date / Done
  | 'folder';      // first segment of project wikilink, falls back to "Inbox"

export interface TaskQuery {
  filters?: Filter[];
  sort?: Sort[];
  group?: GroupAxis;
  limit?: number;
}

/**
 * Computed columns analogous to the Bases formulas in TaskNotes' default
 * `.base` files (`daysUntilDue`, `isOverdue`, `urgencyScore`,
 * `efficiencyRatio`). These are derived from the Task at evaluation time.
 */
export interface ComputedColumns {
  daysUntilDue: number | null;
  isOverdue: boolean;
  urgencyScore: number;
  efficiencyRatio: number | null;
}

/** A `Task` plus its disk path plus computed columns for view rendering. */
export interface RankedTask {
  path: string;
  task: Task;
  computed: ComputedColumns;
}

export interface QueryResult {
  /** Flat list of matching tasks after sort + limit, with computed columns. */
  items: RankedTask[];
  /** Grouped output when `group !== 'none'`. Items inside groups respect sort. */
  groups: Array<{ key: string; label: string; items: RankedTask[] }>;
  /** Number of input tasks before filtering (useful for "X of Y" UI strings). */
  totalCount: number;
  /** Number of items after filtering, before limit. */
  filteredCount: number;
}

export interface RunQueryContext {
  /** Status values that count as completed (default `{'done', 'completed'}`). */
  completedStatusValues?: ReadonlySet<string>;
  /** Today's local date as YYYY-MM-DD. Default: derived from `now`. */
  today?: string;
  /** Reference instant; default `Date.now()`. */
  now?: Date;
}

const DEFAULT_COMPLETED = new Set(['done', 'completed']);

/**
 * Evaluate a query against a list of tasks. Pure — no I/O, no side effects.
 * The result is fully serializable and safe to memoize.
 */
export function runQuery(
  tasks: Array<{ path: string; task: Task }>,
  query: TaskQuery,
  ctx: RunQueryContext = {},
): QueryResult {
  const completed = ctx.completedStatusValues ?? DEFAULT_COMPLETED;
  const now = ctx.now ?? new Date();
  const today = ctx.today ?? toYmd(now);

  const totalCount = tasks.length;
  const ranked = tasks.map(({ path, task }) => ({
    path,
    task,
    computed: computeColumns(task, today, now, completed),
  }));

  const filtered = (query.filters && query.filters.length > 0)
    ? ranked.filter(r => query.filters!.every(f => matchFilter(r, f, completed, today)))
    : ranked;
  const filteredCount = filtered.length;

  const sorted = (query.sort && query.sort.length > 0)
    ? sortRanked(filtered, query.sort)
    : filtered;

  const limited = typeof query.limit === 'number' && query.limit >= 0
    ? sorted.slice(0, query.limit)
    : sorted;

  const groups = groupRanked(limited, query.group ?? 'none', today);

  return { items: limited, groups, totalCount, filteredCount };
}

// --- Computed columns ------------------------------------------------------

function computeColumns(
  task: Task,
  today: string,
  now: Date,
  completed: ReadonlySet<string>,
): ComputedColumns {
  const dueDay = task.due ? dayPart(task.due) : null;
  const daysUntilDue = dueDay ? daysBetween(today, dueDay) : null;
  const isCompletedStatus = completed.has(task.status);
  const isOverdue = !!(dueDay && !isCompletedStatus && daysUntilDue !== null && daysUntilDue < 0);

  // Urgency: higher is more urgent. Mirrors TaskNotes' default formula:
  //   urgencyScore = priorityWeight + max(0, 10 - daysUntilDue)
  const priorityWeight = priorityToWeight(task.priority);
  const dueWeight = daysUntilDue === null ? 0 : Math.max(0, 10 - daysUntilDue);
  const urgencyScore = priorityWeight + dueWeight + (isOverdue ? 5 : 0);

  // Efficiency: tracked vs estimated, when both present and non-zero.
  let efficiencyRatio: number | null = null;
  if (typeof task.time_estimate === 'number' && task.time_estimate > 0) {
    const tracked = totalTrackedMinutes(task);
    efficiencyRatio = Math.round((tracked / task.time_estimate) * 100);
  }

  // `now` is the reference instant — currently only used for `isOverdue`
  // (which already consults `today`). Kept in the signature for future
  // running-session reporting; the linter complains otherwise.
  void now;

  return { daysUntilDue, isOverdue, urgencyScore, efficiencyRatio };
}

function totalTrackedMinutes(task: Task): number {
  let total = 0;
  for (const entry of task.time_entries ?? []) {
    if (!entry.endTime) continue; // active sessions excluded for stability
    const start = Date.parse(entry.startTime);
    const end = Date.parse(entry.endTime);
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      total += (end - start) / 60000;
    }
  }
  return total;
}

function priorityToWeight(priority: string | undefined): number {
  switch (priority) {
    case 'highest': return 6;
    case 'high':    return 5;
    case 'normal':  return 3;
    case 'medium':  return 3;
    case 'low':     return 2;
    case 'lowest':  return 1;
    default:        return 0;
  }
}

// --- Filtering -------------------------------------------------------------

function matchFilter(
  ranked: RankedTask,
  filter: Filter,
  completed: ReadonlySet<string>,
  today: string,
): boolean {
  const { task, computed } = ranked;
  const value = filter.value;

  switch (filter.field) {
    case 'status':         return matchScalar(task.status, filter.op, value);
    case 'priority':       return matchScalar(task.priority, filter.op, value);
    case 'tag':            return matchArrayContains(task.tags, filter.op, value);
    case 'context':        return matchArrayContains(task.contexts, filter.op, value);
    case 'project':        return matchArrayContains(task.projects, filter.op, value);
    case 'due':            return matchDate(task.due ? dayPart(task.due) : undefined, filter.op, value, today);
    case 'scheduled':      return matchDate(task.scheduled ? dayPart(task.scheduled) : undefined, filter.op, value, today);
    case 'dateCreated':    return matchDate(task.date_created ? dayPart(task.date_created) : undefined, filter.op, value, today);
    case 'dateModified':   return matchDate(task.date_modified ? dayPart(task.date_modified) : undefined, filter.op, value, today);
    case 'completedDate':  return matchDate(task.completed_date, filter.op, value, today);
    case 'recurring': {
      const isRecurring = !!task.recurrence;
      if (filter.op === 'isTrue') return isRecurring;
      if (filter.op === 'isFalse') return !isRecurring;
      return false;
    }
    case 'overdue': {
      if (filter.op === 'isTrue') return computed.isOverdue;
      if (filter.op === 'isFalse') return !computed.isOverdue;
      return false;
    }
    case 'text': {
      const v = typeof value === 'string' ? value.toLowerCase() : '';
      const haystack = `${task.title} ${task.body}`.toLowerCase();
      if (filter.op === 'contains') return haystack.includes(v);
      if (filter.op === 'startsWith') return haystack.startsWith(v);
      return false;
    }
  }
  // unreachable in TS but defensive
  void completed;
  return false;
}

function matchScalar(actual: string | undefined, op: FilterOperator, expected: Filter['value']): boolean {
  switch (op) {
    case 'eq': return actual === expected;
    case 'ne': return actual !== expected;
    case 'in': return Array.isArray(expected) && actual !== undefined && expected.includes(actual);
    case 'notIn': return Array.isArray(expected) && (actual === undefined || !expected.includes(actual));
    case 'exists': return actual !== undefined && actual !== '';
    case 'missing': return actual === undefined || actual === '';
    default: return false;
  }
}

function matchArrayContains(actual: string[] | undefined, op: FilterOperator, expected: Filter['value']): boolean {
  const list = actual ?? [];
  switch (op) {
    case 'contains': return typeof expected === 'string' && list.includes(expected);
    case 'in': return Array.isArray(expected) && list.some(v => expected.includes(v));
    case 'notIn': return !Array.isArray(expected) || !list.some(v => expected.includes(v));
    case 'exists': return list.length > 0;
    case 'missing': return list.length === 0;
    default: return false;
  }
}

function matchDate(actual: string | undefined, op: FilterOperator, expected: Filter['value'], today: string): boolean {
  if (!actual) {
    return op === 'missing';
  }
  if (op === 'exists') return true;
  if (op === 'missing') return false;

  const a = actual;
  const b = resolveDateExpr(expected, today);
  if (!b) return false;
  switch (op) {
    case 'eq': return a === b;
    case 'ne': return a !== b;
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
    default: return false;
  }
}

/** Resolve `today`/`+7d`/literal date strings into a YYYY-MM-DD. */
function resolveDateExpr(expr: Filter['value'], today: string): string | null {
  if (typeof expr !== 'string') return null;
  if (expr === 'today') return today;
  if (/^\d{4}-\d{2}-\d{2}$/.test(expr)) return expr;
  const m = /^([+-])(\d+)d$/.exec(expr);
  if (m) return offsetDays(today, (m[1] === '-' ? -1 : 1) * Number(m[2]));
  return null;
}

// --- Sorting ---------------------------------------------------------------

function sortRanked(items: RankedTask[], sorts: Sort[]): RankedTask[] {
  const copy = items.slice();
  copy.sort((a, b) => {
    for (const s of sorts) {
      const dir = s.direction === 'desc' ? -1 : 1;
      const av = sortKey(a, s.field);
      const bv = sortKey(b, s.field);
      if (av === bv) continue;
      if (av === null) return 1;     // nulls last
      if (bv === null) return -1;
      return av < bv ? -1 * dir : 1 * dir;
    }
    return a.path.localeCompare(b.path);
  });
  return copy;
}

function sortKey(r: RankedTask, field: SortField): number | string | null {
  const t = r.task;
  switch (field) {
    case 'title':         return t.title.toLowerCase();
    case 'status':        return t.status;
    case 'priority':      return -priorityToWeight(t.priority); // higher priority first under asc
    case 'due':           return t.due ? dayPart(t.due) : null;
    case 'scheduled':     return t.scheduled ? dayPart(t.scheduled) : null;
    case 'dateCreated':   return t.date_created || null;
    case 'dateModified':  return t.date_modified || null;
    case 'completedDate': return t.completed_date ?? null;
    case 'urgencyScore':  return -r.computed.urgencyScore; // higher is more urgent
    case 'daysUntilDue':  return r.computed.daysUntilDue;
    case 'timeEstimate':  return typeof t.time_estimate === 'number' ? t.time_estimate : null;
  }
}

// --- Grouping --------------------------------------------------------------

function groupRanked(
  items: RankedTask[],
  axis: GroupAxis,
  today: string,
): QueryResult['groups'] {
  if (axis === 'none') return [];
  const buckets = new Map<string, { label: string; items: RankedTask[] }>();
  const order: string[] = [];

  const push = (key: string, label: string, item: RankedTask) => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { label, items: [] };
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.items.push(item);
  };

  for (const item of items) {
    const keys = bucketKeys(item, axis, today);
    for (const { key, label } of keys) {
      push(key, label, item);
    }
  }

  if (axis === 'dueBucket') {
    return DUE_BUCKET_ORDER
      .filter(k => buckets.has(k))
      .map(k => ({ key: k, label: buckets.get(k)!.label, items: buckets.get(k)!.items }));
  }

  if (axis === 'priority') {
    // Severity order top→bottom; anything outside the canonical ladder
    // (custom values, 'unset') falls below in insertion order.
    const known = new Set(PRIORITY_ORDER);
    const head = PRIORITY_ORDER.filter(k => buckets.has(k));
    const tail = order.filter(k => !known.has(k));
    return [...head, ...tail].map(k => ({
      key: k, label: buckets.get(k)!.label, items: buckets.get(k)!.items,
    }));
  }

  if (axis === 'status') {
    // Workflow order: open → in-progress → done → cancelled → unset.
    // Anything outside the canonical set (custom statuses) falls below in
    // insertion order.
    const known = new Set(STATUS_ORDER);
    const head = STATUS_ORDER.filter(k => buckets.has(k));
    const tail = order.filter(k => !known.has(k));
    return [...head, ...tail].map(k => ({
      key: k, label: buckets.get(k)!.label, items: buckets.get(k)!.items,
    }));
  }

  if (axis === 'project' || axis === 'tag' || axis === 'context' || axis === 'folder') {
    // Alphabetical (case-insensitive) by label so columns stay stable as the
    // index re-loads. The "no value" sentinel (`__none__` for project / tag /
    // context, `__inbox__` for folder) is pinned to the end so the named
    // buckets read in order.
    const sentinels = new Set(['__none__', '__inbox__']);
    const named = order.filter(k => !sentinels.has(k))
      .sort((a, b) => buckets.get(a)!.label.localeCompare(buckets.get(b)!.label, undefined, { sensitivity: 'base' }));
    const tail = order.filter(k => sentinels.has(k));
    return [...named, ...tail].map(k => ({
      key: k, label: buckets.get(k)!.label, items: buckets.get(k)!.items,
    }));
  }

  return order.map(k => ({ key: k, label: buckets.get(k)!.label, items: buckets.get(k)!.items }));
}

const DUE_BUCKET_ORDER = ['overdue', 'today', 'tomorrow', 'thisWeek', 'later', 'noDate', 'done'];
const PRIORITY_ORDER = ['highest', 'high', 'normal', 'low', 'lowest', 'unset'];
// Workflow order matching the create-task form's status options. Status is
// freeform per spec; custom values fall through to insertion order at the
// tail (same shape as PRIORITY_ORDER handling below).
const STATUS_ORDER = ['open', 'in-progress', 'done', 'cancelled', 'unset'];

function bucketKeys(r: RankedTask, axis: GroupAxis, today: string): Array<{ key: string; label: string }> {
  const t = r.task;
  switch (axis) {
    case 'status':   return [{ key: t.status || 'unset', label: t.status || 'unset' }];
    case 'priority': return [{ key: t.priority || 'unset', label: t.priority || 'unset' }];
    case 'project':
      return (t.projects && t.projects.length > 0)
        ? t.projects.map(p => ({ key: p, label: p }))
        : [{ key: '__none__', label: 'No project' }];
    case 'context':
      return (t.contexts && t.contexts.length > 0)
        ? t.contexts.map(c => ({ key: c, label: c }))
        : [{ key: '__none__', label: 'No context' }];
    case 'tag':
      return (t.tags && t.tags.length > 0)
        ? t.tags.map(g => ({ key: g, label: g }))
        : [{ key: '__none__', label: 'Untagged' }];
    case 'folder': {
      const wl = (t.projects ?? [])[0];
      const folder = wl ? extractFolder(wl) : '';
      return [{ key: folder || '__inbox__', label: folder || 'Inbox' }];
    }
    case 'dueBucket': return [dueBucket(r, today)];
    case 'none':      return [{ key: '__all__', label: 'All' }];
  }
}

function dueBucket(r: RankedTask, today: string): { key: string; label: string } {
  if (r.task.completed_date) return { key: 'done', label: 'Done' };
  if (r.computed.isOverdue) return { key: 'overdue', label: 'Overdue' };
  if (!r.task.due) return { key: 'noDate', label: 'No date' };
  const due = dayPart(r.task.due);
  if (due === today) return { key: 'today', label: 'Today' };
  if (due === offsetDays(today, 1)) return { key: 'tomorrow', label: 'Tomorrow' };
  if (due <= offsetDays(today, 7)) return { key: 'thisWeek', label: 'This week' };
  return { key: 'later', label: 'Later' };
}

function extractFolder(wikilink: string): string {
  if (!wikilink.startsWith('[[') || !wikilink.endsWith(']]')) return '';
  const inner = wikilink.slice(2, -2);
  const slash = inner.indexOf('/');
  return slash === -1 ? '' : inner.slice(0, slash);
}

// --- Date helpers ----------------------------------------------------------

function dayPart(value: string): string {
  const t = value.indexOf('T');
  return t === -1 ? value.slice(0, 10) : value.slice(0, t);
}

function toYmd(d: Date): string {
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round((db - da) / 86400000);
}

function offsetDays(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T00:00:00Z`) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}
