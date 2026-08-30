// `search_tasks` — filtered query against the in-memory TaskIndex. Tasks
// live as TaskNotes-spec files under `.assets/tasks/` and are NOT covered
// by `search_vault`. Owns its schema/description, AI-SDK wrapper,
// normalizer, formatter, and executor adapter.

import { tool, jsonSchema } from 'ai';
import type { TaskIndex } from '../../tasks';
import type { Task } from '../../tasks/spec-types';
import type { ReadOnlyToolName } from './index';

export const SEARCH_TASKS_DESCRIPTION = 'Search the user\'s task index. Tasks live as TaskNotes-spec files under `.assets/tasks/` and are NOT covered by `search_vault` — use this tool when the user asks about tasks, todos, due dates, projects, or contexts. Every filter is AND-combined and is a required-match: a task with no `priority` set will NOT match a `priority` filter, and a task with no tags will NOT match a `tags` filter. Only pass the filters the user explicitly asked for; default to the smallest viable filter set ("open tasks" → `{status: "open"}`, nothing else). Return is ordered by relevance to `text` (when supplied) then due date asc. Each hit carries a `path` you can pass straight to `manage_tasks`. This tool is read-only and runs without user approval.';

export const SEARCH_TASKS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string', description: 'Substring filter against title + body. Case-insensitive. Omit to match all tasks.' },
    status: { type: 'string', description: 'Lifecycle status, e.g. "open", "done", "in-progress". Match is exact.' },
    priority: { type: 'string', enum: ['highest', 'high', 'normal', 'low', 'lowest'], description: '`normal` matches tasks with no priority set (the conventional default) as well as tasks explicitly marked normal. Other values strict-match.' },
    tags: { type: 'array', items: { type: 'string' }, description: 'All listed tags must be present.' },
    contexts: { type: 'array', items: { type: 'string' }, description: 'All listed contexts must be present.' },
    projects: { type: 'array', items: { type: 'string' }, description: 'Wikilinks like `[[Q2 Launch]]`. All listed projects must be present.' },
    due_after: { type: 'string', description: 'Inclusive YYYY-MM-DD lower bound on `due`.' },
    due_before: { type: 'string', description: 'Inclusive YYYY-MM-DD upper bound on `due`.' },
    scheduled_after: { type: 'string', description: 'Inclusive YYYY-MM-DD lower bound on `scheduled`.' },
    scheduled_before: { type: 'string', description: 'Inclusive YYYY-MM-DD upper bound on `scheduled`.' },
    limit: { type: 'number', description: 'Maximum hits to return. Defaults to 25; clamped to [1, 100].' },
  },
} as const;

export interface SearchTasksInput {
  /** Optional substring filter against title + body (case-insensitive). Empty/omitted matches all. */
  text?: string;
  /** Status filter (e.g. `"open"`, `"done"`). Single value because the spec uses status as the primary lifecycle field. */
  status?: string;
  /** Priority filter (`highest` | `high` | `normal` | `low` | `lowest`). */
  priority?: string;
  /** Tag filter — every listed tag must be present on a hit. */
  tags?: string[];
  /** GTD context filter — every listed context must be present. */
  contexts?: string[];
  /** Project filter (wikilinks like `[[Q2 Launch]]`) — every listed project must be present. */
  projects?: string[];
  /** Inclusive YYYY-MM-DD lower bound on `due`. */
  due_after?: string;
  /** Inclusive YYYY-MM-DD upper bound on `due`. */
  due_before?: string;
  /** Inclusive YYYY-MM-DD lower bound on `scheduled`. */
  scheduled_after?: string;
  /** Inclusive YYYY-MM-DD upper bound on `scheduled`. */
  scheduled_before?: string;
  /** Cap on hits returned. Defaults to 25, hard-capped at 100. */
  limit?: number;
}

export interface SearchTasksHit {
  path: string;
  title: string;
  status: string;
  priority?: string;
  due?: string;
  scheduled?: string;
  tags?: string[];
  contexts?: string[];
  projects?: string[];
  /** Short excerpt of the body when `text` matched the body, otherwise empty. */
  bodyExcerpt: string;
  /** ISO date_modified, for the model to reason about staleness. */
  updatedAt: string;
}

export interface SearchTasksResult {
  hits: SearchTasksHit[];
  total: number;
  truncated: boolean;
  /** Echoes the parsed filters so the model can self-correct on follow-up calls. */
  filters: SearchTasksInput;
}

export const searchTasksTool = tool({
  description: SEARCH_TASKS_DESCRIPTION,
  inputSchema: jsonSchema<SearchTasksInput>(SEARCH_TASKS_JSON_SCHEMA),
});

const ALLOWED_TASK_PRIORITIES = new Set(['highest', 'high', 'normal', 'low', 'lowest']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize a `search_tasks` input from the model. Returns `{}` (an
 * unfiltered match-everything query) for null/garbage input rather than
 * null — unlike `search_vault`, the empty filter set is a meaningful query.
 * Limit is clamped to [1, 100]; out-of-range values are silently clamped so
 * the model can't pin the prompt with `limit: 99999`.
 */
export function normalizeSearchTasksInput(input: unknown): SearchTasksInput {
  if (!input || typeof input !== 'object') return {};
  const obj = input as Record<string, unknown>;
  const out: SearchTasksInput = {};
  if (typeof obj.text === 'string' && obj.text.trim()) out.text = obj.text;
  if (typeof obj.status === 'string' && obj.status.trim()) out.status = obj.status;
  if (typeof obj.priority === 'string' && ALLOWED_TASK_PRIORITIES.has(obj.priority)) {
    out.priority = obj.priority;
  }
  const tags = pickStringArray(obj.tags);
  if (tags) out.tags = tags;
  const contexts = pickStringArray(obj.contexts);
  if (contexts) out.contexts = contexts;
  const projects = pickStringArray(obj.projects);
  if (projects) out.projects = projects;
  if (typeof obj.due_after === 'string' && ISO_DATE_RE.test(obj.due_after)) out.due_after = obj.due_after;
  if (typeof obj.due_before === 'string' && ISO_DATE_RE.test(obj.due_before)) out.due_before = obj.due_before;
  if (typeof obj.scheduled_after === 'string' && ISO_DATE_RE.test(obj.scheduled_after)) out.scheduled_after = obj.scheduled_after;
  if (typeof obj.scheduled_before === 'string' && ISO_DATE_RE.test(obj.scheduled_before)) out.scheduled_before = obj.scheduled_before;
  if (typeof obj.limit === 'number' && Number.isFinite(obj.limit)) {
    out.limit = Math.max(1, Math.min(100, Math.floor(obj.limit)));
  }
  return out;
}

function pickStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return out.length > 0 ? out : undefined;
}

export function formatSearchTasksResult(result: SearchTasksResult): string {
  return JSON.stringify(result);
}

// --- Executor adapter ---

export interface BuildSearchTasksExecutorOpts {
  taskIndex: Pick<TaskIndex, 'all'>;
}

const DEFAULT_LIMIT = 25;
const BODY_EXCERPT_CHARS = 200;

export function buildSearchTasksExecutor(opts: BuildSearchTasksExecutorOpts) {
  return async function executor(toolName: ReadOnlyToolName, rawInput: unknown): Promise<string> {
    if (toolName !== 'search_tasks') {
      throw new Error(`Unsupported read-only tool: ${toolName}`);
    }
    const filters = normalizeSearchTasksInput(rawInput);
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const all = opts.taskIndex.all();
    const matches: Array<{ path: string; task: Task; score: number }> = [];
    const needle = filters.text?.toLowerCase() ?? '';
    for (const { path, task } of all) {
      if (!matchesFilters(task, filters)) continue;
      const score = scoreMatch(task, needle);
      matches.push({ path, task, score });
    }
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Secondary: due asc (soonest first), undefined treated as "far future".
      const aDue = a.task.due ?? '￿';
      const bDue = b.task.due ?? '￿';
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
    const trimmed = matches.slice(0, limit);
    const hits: SearchTasksHit[] = trimmed.map(({ path, task }) => buildHit(path, task, needle));
    const result: SearchTasksResult = {
      hits,
      total: matches.length,
      truncated: matches.length > trimmed.length,
      filters,
    };
    return formatSearchTasksResult(result);
  };
}

function matchesFilters(task: Task, f: SearchTasksInput): boolean {
  if (f.status && task.status !== f.status) return false;
  // `priority: 'normal'` matches tasks with no priority set as well as tasks
  // explicitly marked normal. Rationale: TaskNotes spec leaves priority
  // optional, with no defined default; users conventionally treat unset as
  // "normal." Strict equality dropped every unset task — surprising to
  // users and a footgun GPT-class models walk into when they "helpfully"
  // add `priority: 'normal'` to a vague query like "what tasks do I have?".
  // Other priority values (highest/high/low/lowest) remain strict-match.
  if (f.priority) {
    const effective = task.priority ?? 'normal';
    if (effective !== f.priority) return false;
  }
  if (f.tags && !subsetOf(f.tags, task.tags)) return false;
  if (f.contexts && !subsetOf(f.contexts, task.contexts)) return false;
  if (f.projects && !subsetOf(f.projects, task.projects)) return false;
  if (f.due_after && !dateAtOrAfter(task.due, f.due_after)) return false;
  if (f.due_before && !dateAtOrBefore(task.due, f.due_before)) return false;
  if (f.scheduled_after && !dateAtOrAfter(task.scheduled, f.scheduled_after)) return false;
  if (f.scheduled_before && !dateAtOrBefore(task.scheduled, f.scheduled_before)) return false;
  if (f.text) {
    const haystack = `${task.title}\n${task.body}`.toLowerCase();
    if (!haystack.includes(f.text.toLowerCase())) return false;
  }
  return true;
}

/** True iff every entry of `subset` appears in `superset` (case-sensitive). */
function subsetOf(subset: string[], superset: string[] | undefined): boolean {
  if (!superset || superset.length === 0) return false;
  const set = new Set(superset);
  return subset.every(s => set.has(s));
}

/** Compare a task's date field (date or datetime) against a YYYY-MM-DD bound. */
function dateAtOrAfter(value: string | undefined, bound: string): boolean {
  if (!value) return false;
  return dayKey(value) >= bound;
}

function dateAtOrBefore(value: string | undefined, bound: string): boolean {
  if (!value) return false;
  return dayKey(value) <= bound;
}

function dayKey(value: string): string {
  const t = value.indexOf('T');
  return t === -1 ? value.slice(0, 10) : value.slice(0, t);
}

/**
 * Coarse relevance score. With no `text` filter every match scores 0 and
 * the secondary due-date sort takes over. With `text`, title hits weigh
 * heavier than body hits and exact-phrase matches beat substring matches.
 */
function scoreMatch(task: Task, needle: string): number {
  if (!needle) return 0;
  const title = task.title.toLowerCase();
  const body = task.body.toLowerCase();
  let score = 0;
  if (title.includes(needle)) score += 4;
  if (title === needle) score += 2;
  if (title.startsWith(needle)) score += 1;
  if (body.includes(needle)) score += 1;
  return score;
}

function buildHit(path: string, task: Task, needle: string): SearchTasksHit {
  return {
    path,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due: task.due,
    scheduled: task.scheduled,
    tags: task.tags,
    contexts: task.contexts,
    projects: task.projects,
    bodyExcerpt: deriveExcerpt(task.body, needle),
    updatedAt: task.date_modified,
  };
}

/** Pull a small window of the body around the first match of `needle`, or
 *  the leading chunk of the body when there's no needle. Always single-line. */
function deriveExcerpt(body: string, needle: string): string {
  if (!body) return '';
  const oneLine = body.replace(/\s+/g, ' ').trim();
  if (!needle) return clamp(oneLine, BODY_EXCERPT_CHARS);
  const idx = oneLine.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return clamp(oneLine, BODY_EXCERPT_CHARS);
  const half = Math.floor(BODY_EXCERPT_CHARS / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(oneLine.length, idx + needle.length + half);
  const window = oneLine.slice(start, end);
  return (start > 0 ? '…' : '') + window + (end < oneLine.length ? '…' : '');
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
