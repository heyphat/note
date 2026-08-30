'use client';

// Right-dock panel listing every task whose `projects[]` references the
// active note. Mirrors BacklinksPanel's shape so the dock layout stays
// consistent (header, count, hide button, scrollable list).
//
// Linkage is by-title because most users write `[[Note Title]]` rather than
// `[[path/to/note]]`. We also accept the path-stem form so vaults that lean
// on stable paths still resolve.

import { memo, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { NoteMeta } from '@/lib/storage';
import { effectiveInstanceState, todayLocalDay, type TaskIndex } from '@/lib/tasks';
import { runQuery } from '@/lib/tasks/query';

interface Props {
  /** Live task index. Null while initial load is in flight. */
  index: TaskIndex | null;
  /** Bumped whenever the index notifies — drives re-renders. */
  version: number;
  /** Note currently open in the editor. */
  activeNote: NoteMeta | null;
  /** Open the underlying task `.md` file in the main editor. */
  onOpenTask: (path: string) => void;
  /** Toggle status open ↔ done from the panel. */
  onToggleComplete: (path: string, currentlyDone: boolean) => void;
  onClose: () => void;
}

const COMPLETED_STATUSES = new Set(['done', 'completed']);

function ProjectTasksPanel({ index, version, activeNote, onOpenTask, onToggleComplete, onClose }: Props) {
  const t = useTranslations('tasks');

  const items = useMemo(() => {
    if (!index || !activeNote) return [];
    // Project values are wikilinks like `[[Note Title]]` or `[[folder/note]]`.
    // Match against title, path-stem, and full path so all conventions resolve.
    const candidates = new Set<string>([
      `[[${activeNote.title}]]`,
      `[[${activeNote.id.replace(/\.md$/, '')}]]`,
      `[[${activeNote.id}]]`,
    ]);
    return runQuery(index.all(), {
      filters: [{ field: 'project', op: 'in', value: Array.from(candidates) }],
      sort: [{ field: 'urgencyScore' }, { field: 'title' }],
    }, { completedStatusValues: COMPLETED_STATUSES }).items;
    // version is the render-trigger; index/activeNote drive the actual query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, activeNote, version]);

  const today = todayLocalDay();
  const isDone = (item: typeof items[number]): boolean => (
    item.task.recurrence
      ? effectiveInstanceState(item.task, today) === 'completed'
      : COMPLETED_STATUSES.has(item.task.status)
  );
  const openCount = items.filter(i => !isDone(i)).length;
  const doneCount = items.length - openCount;

  return (
    <div className="border-b border-[var(--border)] flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text tracking-tight">
          {t('panelHeading')}
          {items.length > 0 && (
            <span className="text-muted font-normal ml-1.5">
              ({t('openCount', { count: openCount })}{doneCount > 0 ? ` · ${t('doneCount', { count: doneCount })}` : ''})
            </span>
          )}
        </h2>
        <button
          onClick={onClose}
          aria-label={t('hideAria')}
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md
            text-muted hover:text-text hover:bg-[var(--panel-2)] transition-colors text-lg leading-none">
          &times;
        </button>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '40vh' }}>
        {items.length === 0 ? (
          <div className="text-xs text-muted p-4">{t('emptyForNote')}</div>
        ) : (
          <ul>
            {items.map(item => {
              const done = isDone(item);
              return (
                <li key={item.path} className="border-b border-[var(--border)] last:border-b-0">
                  <div className="flex items-start gap-2 px-3 py-2 group">
                    <span className="inline-flex items-center shrink-0 h-5">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => onToggleComplete(item.path, done)}
                        aria-label={done ? t('uncomplete') : t('complete')}
                        className="cursor-pointer"
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenTask(item.path)}
                      className="flex-1 text-left min-w-0"
                      title={item.path}
                    >
                      <div className={`text-sm leading-5 truncate ${done ? 'line-through text-muted' : 'text-text'}`}>
                        {item.task.title}
                      </div>
                      <div className="text-xs text-muted flex flex-wrap gap-x-2 gap-y-0.5">
                        {item.task.priority && <span>!{item.task.priority}</span>}
                        {item.task.due && <span>↓ {item.task.due.slice(0, 10)}</span>}
                        {item.computed.isOverdue && <span className="text-amber-500">{t('overdue')}</span>}
                      </div>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default memo(ProjectTasksPanel);
