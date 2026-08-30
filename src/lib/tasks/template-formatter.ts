// Template-friendly formatters for task data.
//
// Pure helpers consumed by the template-variable interpolation pipeline.
// Kept separate from `query.ts` so the daily-note flow doesn't pull in the
// full grouping machinery just to print a bullet list.

import type { Task } from './spec-types';

const COMPLETED_STATUSES = new Set(['done', 'completed']);

export interface TasksTodayOptions {
  /** YYYY-MM-DD for "today". Required so callers control timezone semantics. */
  today: string;
  /** Status values that mean "completed" — these are excluded from the list. */
  completedStatusValues?: ReadonlySet<string>;
  /** Maximum lines to emit. Default 50 — daily notes shouldn't be a wall of tasks. */
  limit?: number;
}

/**
 * Format every open task whose `due` or `scheduled` falls on or before today
 * (i.e. due today + overdue) as a markdown bullet list. Each line carries a
 * wikilink back to the source `.md` file under `.assets/tasks/`.
 *
 * Returns the empty string when nothing matches — callers can fall through
 * to "no tasks today" copy in their template if they care.
 */
export function formatTasksToday(
  tasks: Array<{ path: string; task: Task }>,
  opts: TasksTodayOptions,
): string {
  const completed = opts.completedStatusValues ?? COMPLETED_STATUSES;
  const today = opts.today;
  const limit = opts.limit ?? 50;

  const due = (t: Task): string | undefined => t.due ? dayPart(t.due) : t.scheduled ? dayPart(t.scheduled) : undefined;
  const include = (t: Task): boolean => {
    if (completed.has(t.status)) return false;
    const day = due(t);
    if (!day) return false;
    return day <= today;
  };

  const matches = tasks
    .filter(({ task }) => include(task))
    .sort((a, b) => {
      const da = due(a.task) ?? '';
      const db = due(b.task) ?? '';
      if (da !== db) return da < db ? -1 : 1;
      return a.task.title.localeCompare(b.task.title);
    })
    .slice(0, limit);

  if (matches.length === 0) return '';

  return matches.map(({ path, task }) => {
    const target = path.replace(/\.md$/i, '');
    const overdueMark = (due(task) ?? '') < today ? ' ⚠️' : '';
    return `- [ ] [[${target}|${task.title}]]${overdueMark}`;
  }).join('\n');
}

function dayPart(value: string): string {
  const t = value.indexOf('T');
  return t === -1 ? value.slice(0, 10) : value.slice(0, t);
}
