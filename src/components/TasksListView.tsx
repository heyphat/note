'use client';

// Modal overlay listing every task in the vault. Mirrors FileExplorerPalette
// in chrome — centered panel over a dimmed backdrop, escape-to-close,
// click-outside-to-close, dynamically imported in page.tsx.
//
// Owns a small amount of UI state (group axis, status filter) and delegates
// all the heavy lifting to `runQuery()`. Mutations go through the parent so
// the same code paths apply that the rest of the app uses (refresh through
// the index, etc.).

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { effectiveInstanceState, todayLocalDay, type Task, type TaskIndex } from '@/lib/tasks';
import { extractFirstImage, previewBody } from '@/lib/tasks/body-preview';
import { type GroupAxis, runQuery } from '@/lib/tasks/query';
import CalendarPopover from './CalendarPopover';
import TaskSelect from './TaskSelect';
import TaskKanbanBoard from './TaskKanbanBoard';

interface Props {
  open: boolean;
  index: TaskIndex | null;
  /** Bumped whenever the index notifies. */
  version: number;
  /** Open the source `.md` file in the main editor. */
  onOpenTask: (path: string) => void;
  /** Toggle status open ↔ done. */
  onToggleComplete: (path: string, currentlyDone: boolean) => void;
  /** Open the create-task modal pre-filled. */
  onCreateTask: () => void;
  /** Open the edit modal for the given task path. */
  onEditTask: (path: string) => void;
  /** Delete the task. Caller is responsible for confirmation if needed —
   *  the row uses a two-click confirm to avoid accidental loss. */
  onDeleteTask: (path: string) => Promise<void> | void;
  /** Update either the due or scheduled date inline from a row chip. The
   *  caller is expected to call `updateTask` and refresh the index. */
  onUpdateTaskDate: (path: string, field: 'due' | 'scheduled', value: string) => Promise<void> | void;
  /** Update priority inline from the priority chip popover. Same expectation
   *  as `onUpdateTaskDate` — call `updateTask` then refresh the index. */
  onUpdateTaskPriority: (path: string, priority: string) => Promise<void> | void;
  /** Set the task's `status` field. Caller handles recurring tasks (status
   *  is per-instance via `complete_instances`, not the base field) and the
   *  refresh through the index. Used by the kanban board for cross-column
   *  drops on the `status` axis. */
  onUpdateTaskStatus: (path: string, status: string) => Promise<void> | void;
  /** Replace a multi-valued list field on the task. Used by the kanban for
   *  drops on the project / tag / context axes. */
  onUpdateTaskList: (path: string, field: 'projects' | 'tags' | 'contexts', next: string[]) => Promise<void> | void;
  onClose: () => void;
}

const COMPLETED_STATUSES = new Set(['done', 'completed']);

type StatusFilter = 'all' | 'open' | 'done' | 'overdue';

// Smart-list rail selection. Each value composes its own pre-filter on the
// candidate set before runQuery sees it; 'all' is the unfiltered default.
type View = 'all' | 'today' | 'upcoming' | 'later' | 'completed';

type ViewMode = 'list' | 'kanban';

function TasksListView({ open, index, version, onOpenTask, onToggleComplete, onCreateTask, onEditTask, onDeleteTask, onUpdateTaskDate, onUpdateTaskPriority, onUpdateTaskStatus, onUpdateTaskList, onClose }: Props) {
  const t = useTranslations('tasks');
  const [view, setView] = useState<View>('all');
  const [groupAxis, setGroupAxis] = useState<GroupAxis>('status');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Kanban with `groupAxis === 'none'` would render a single column — pointless.
  // Coerce to a sensible default the first time the user enters kanban mode.
  useEffect(() => {
    if (viewMode === 'kanban' && groupAxis === 'none') {
      setGroupAxis('status');
    }
  }, [viewMode, groupAxis]);

  // Esc closes the overlay. Matches GraphView / file-explorer-palette UX.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const result = useMemo(() => {
    if (!index) return null;
    const today = todayLocalDay();
    // Open/done filtering happens here (not via runQuery's `status` filter)
    // so recurring tasks honor per-instance state. Spec §4.12: a recurring
    // task's base `status` doesn't flip on each completion — `complete_instances`
    // carries the truth. The runQuery `status in/notIn` filter only sees the
    // base, so without this pre-filter a recurring task completed today
    // would still appear under "Open" (and never under "Done").
    let candidates = index.all();
    const isCompleted = (task: Task): boolean =>
      task.recurrence ? effectiveInstanceState(task, today) === 'completed' : COMPLETED_STATUSES.has(task.status);
    if (view === 'completed') {
      candidates = candidates.filter(({ task }) => isCompleted(task));
    } else {
      if (statusFilter === 'open' || statusFilter === 'done') {
        candidates = candidates.filter(({ task }) => {
          const done = isCompleted(task);
          return statusFilter === 'open' ? !done : done;
        });
      }
      if (view === 'today') {
        candidates = candidates.filter(({ task }) => {
          const due = task.due?.slice(0, 10);
          const sched = task.scheduled?.slice(0, 10);
          return (!!due && due <= today) || (!!sched && sched <= today);
        });
      } else if (view === 'upcoming') {
        candidates = candidates.filter(({ task }) => !!task.due && task.due.slice(0, 10) > today);
      } else if (view === 'later') {
        candidates = candidates.filter(({ task }) => !task.due);
      }
    }
    const filters = [];
    if (view !== 'completed' && statusFilter === 'overdue') {
      filters.push({ field: 'overdue' as const, op: 'isTrue' as const });
    }
    if (search.trim()) filters.push({ field: 'text' as const, op: 'contains' as const, value: search.trim() });
    return runQuery(candidates, {
      filters,
      sort: [{ field: 'urgencyScore' }, { field: 'title' }],
      group: groupAxis,
    }, { completedStatusValues: COMPLETED_STATUSES });
    // version is the render-trigger; index drives the actual query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, version, view, statusFilter, search, groupAxis]);

  if (!open) return null;

  const groups = result?.groups ?? [];
  const items = result?.items ?? [];

  return (
    <div
      // Backdrop-blur was previously `backdrop-blur-[2px]`; dropped because
      // it forced the browser to Gaussian-blur the full viewport on every
      // paint behind the modal. On a 4K external display that's ~8M pixels
      // per frame just for chrome — visible as scroll lag inside the
      // kanban. The dimmer alone gives enough modal/backdrop separation.
      className="fixed inset-0 z-[90] bg-black/50 flex items-start justify-center pt-[8vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('viewHeading')}
      onClick={onClose}
    >
      <div
        className="w-[min(1100px,92vw)] h-[min(720px,82vh)] rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--panel-2)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar: search, cross-cut filters, and the primary Create
            action. The smart-list rail (below) replaces the standalone
            "Tasks" label that used to anchor the left side. */}
        <header className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-1.5 shrink-0">
          <div className="relative flex-1">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
              <SearchIcon />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] pl-7 pr-2 py-1 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-colors"
            />
          </div>

          {view !== 'completed' && (
            <TaskSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={[
                { value: 'open', label: t('filterOpen') },
                { value: 'done', label: t('filterDone') },
                { value: 'overdue', label: t('filterOverdue') },
                { value: 'all', label: t('filterAllStatus') },
              ]}
            />
          )}

          <TaskSelect
            value={groupAxis}
            onChange={(v) => setGroupAxis(v as GroupAxis)}
            ariaLabel={t('groupBy')}
            options={[
              { value: 'none', label: t('groupNone') },
              { value: 'dueBucket', label: t('groupDueBucket') },
              { value: 'status', label: t('groupStatus') },
              { value: 'priority', label: t('groupPriority') },
              { value: 'project', label: t('groupProject') },
              { value: 'tag', label: t('groupTag') },
              { value: 'context', label: t('groupContext') },
            ]}
          />

          <ViewModeToggle value={viewMode} onChange={setViewMode} t={t} />

          <button
            type="button"
            onClick={onCreateTask}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 transition-opacity"
          >
            <PlusIcon />
            {t('createTitle')}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeAria')}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted hover:text-text hover:bg-[var(--panel)] transition-colors"
          >
            <CloseIcon />
          </button>
        </header>

        {/* Body splits horizontally: smart-list rail on the left, scrollable
            task list on the right. The rail's selection drives the candidate
            pre-filter inside the useMemo above. */}
        <div className="flex flex-1 min-h-0">
          <SmartListRail view={view} setView={setView} t={t} />

          <main className={`flex-1 min-h-0 flex flex-col ${viewMode === 'kanban' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
            <div className={`shrink-0 ${viewMode === 'kanban' ? 'px-5 pt-5 pb-3' : 'px-5 pt-5'}`}>
              <div className={`flex items-baseline gap-2 ${viewMode === 'kanban' ? '' : 'max-w-3xl'}`}>
                <h2 className="text-base font-semibold text-text tracking-tight">
                  {railLabel(view, t)}
                </h2>
                <span className="text-xs text-muted tabular-nums">
                  {t('totalCount', { count: items.length })}
                </span>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="text-sm text-muted py-16 text-center">{t('emptyVault')}</div>
            ) : viewMode === 'kanban' ? (
              <div className="flex-1 min-h-0 px-5 pb-5">
                <TaskKanbanBoard
                  groups={groups}
                  groupAxis={groupAxis}
                  onOpenTask={onOpenTask}
                  onToggleComplete={onToggleComplete}
                  onEditTask={onEditTask}
                  onDeleteTask={onDeleteTask}
                  onUpdateTaskStatus={onUpdateTaskStatus}
                  onUpdateTaskPriority={onUpdateTaskPriority}
                  onUpdateTaskDate={onUpdateTaskDate}
                  onUpdateTaskList={onUpdateTaskList}
                />
              </div>
            ) : (
              <div className="px-5 pb-5 max-w-3xl">
                {groupAxis === 'none' ? (
                  <TaskRows
                    items={items}
                    onOpenTask={onOpenTask}
                    onToggleComplete={onToggleComplete}
                    onEditTask={onEditTask}
                    onDeleteTask={onDeleteTask}
                    onUpdateTaskDate={onUpdateTaskDate}
                    onUpdateTaskPriority={onUpdateTaskPriority}
                    tCompleteLabel={t('complete')}
                    tUncompleteLabel={t('uncomplete')}
                    tEditLabel={t('rowEditAria')}
                    tDeleteLabel={t('rowDeleteAria')}
                    tDeleteConfirmLabel={t('rowDeleteConfirmAria')}
                    overdueLabel={t('overdue')}
                  />
                ) : (
                  <ul className="flex flex-col gap-5">
                    {groups.map(group => (
                      <li key={group.key}>
                        <div className="px-1 py-1 mb-1 flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">{group.label}</h3>
                          <span className="text-[11px] text-muted tabular-nums">{group.items.length}</span>
                        </div>
                        <TaskRows
                          items={group.items}
                          onOpenTask={onOpenTask}
                          onToggleComplete={onToggleComplete}
                          onEditTask={onEditTask}
                          onDeleteTask={onDeleteTask}
                          onUpdateTaskDate={onUpdateTaskDate}
                          onUpdateTaskPriority={onUpdateTaskPriority}
                          tCompleteLabel={t('complete')}
                          tUncompleteLabel={t('uncomplete')}
                          tEditLabel={t('rowEditAria')}
                          tDeleteLabel={t('rowDeleteAria')}
                          tDeleteConfirmLabel={t('rowDeleteConfirmAria')}
                          overdueLabel={t('overdue')}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function railLabel(view: View, t: (key: string) => string): string {
  switch (view) {
    case 'today': return t('railToday');
    case 'upcoming': return t('railUpcoming');
    case 'later': return t('railLater');
    case 'completed': return t('railCompleted');
    default: return t('railAll');
  }
}

interface RailProps {
  view: View;
  setView: (v: View) => void;
  t: (key: string) => string;
}

function SmartListRail({ view, setView, t }: RailProps) {
  const items: Array<{ value: View; label: string; icon: ReactNode }> = [
    { value: 'all',       label: t('railAll'),       icon: <RailAllIcon /> },
    { value: 'today',     label: t('railToday'),     icon: <RailCalendarIcon /> },
    { value: 'upcoming',  label: t('railUpcoming'),  icon: <RailClockIcon /> },
    { value: 'later',     label: t('railLater'),     icon: <RailLaterIcon /> },
    { value: 'completed', label: t('railCompleted'), icon: <RailDoneIcon /> },
  ];
  return (
    <aside className="w-44 shrink-0 border-r border-[var(--border)] py-3 px-2 overflow-y-auto bg-[var(--panel-2)]">
      <ul className="flex flex-col gap-0.5">
        {items.map(item => {
          const active = item.value === view;
          return (
            <li key={item.value}>
              <button
                type="button"
                onClick={() => setView(item.value)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-medium'
                    : 'text-text hover:bg-[var(--panel)]'
                }`}
              >
                <span className={`shrink-0 ${active ? 'text-[var(--accent)]' : 'text-muted'}`}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

interface RowsProps {
  items: NonNullable<ReturnType<typeof runQuery>>['items'];
  onOpenTask: (path: string) => void;
  onToggleComplete: (path: string, currentlyDone: boolean) => void;
  onEditTask: (path: string) => void;
  onDeleteTask: (path: string) => Promise<void> | void;
  onUpdateTaskDate: (path: string, field: 'due' | 'scheduled', value: string) => Promise<void> | void;
  onUpdateTaskPriority: (path: string, priority: string) => Promise<void> | void;
  tCompleteLabel: string;
  tUncompleteLabel: string;
  tEditLabel: string;
  tDeleteLabel: string;
  tDeleteConfirmLabel: string;
  overdueLabel: string;
}

function TaskRows({
  items, onOpenTask, onToggleComplete, onEditTask, onDeleteTask, onUpdateTaskDate, onUpdateTaskPriority,
  tCompleteLabel, tUncompleteLabel, tEditLabel, tDeleteLabel, tDeleteConfirmLabel,
  overdueLabel,
}: RowsProps) {
  const today = todayLocalDay();
  // Two-click delete: clicking once arms the row, a second click within
  // ~3s confirms. Mirrors the note-delete pattern in useNoteCommands.
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmDeletePath) return;
    const timer = window.setTimeout(() => setConfirmDeletePath(null), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmDeletePath]);
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map(item => {
        // For recurring tasks, "done" is per-instance (today's date in
        // complete_instances) — base status doesn't flip on each completion.
        const done = item.task.recurrence
          ? effectiveInstanceState(item.task, today) === 'completed'
          : COMPLETED_STATUSES.has(item.task.status);
        const armed = confirmDeletePath === item.path;
        return (
          <li key={item.path} className="group">
            <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-transparent group-hover:border-[var(--border)] group-hover:bg-[var(--panel)] group-hover:shadow-sm transition-all">
              {/* Match the title's first-line height so the checkbox is
                  centered on line 1 for both short and wrapped titles. */}
              <span className="inline-flex items-center shrink-0 h-5">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => onToggleComplete(item.path, done)}
                  aria-label={done ? tUncompleteLabel : tCompleteLabel}
                  className="cursor-pointer"
                />
              </span>
              <PriorityDot priority={item.task.priority} />
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenTask(item.path)}
                  className={`block w-full text-left text-sm leading-5 ${done ? 'line-through text-muted' : 'text-text'}`}
                >
                  {item.task.title}
                </button>
                <BodyPreview body={item.task.body} done={done} />
                <TaskMeta
                  path={item.path}
                  task={item.task}
                  isOverdue={item.computed.isOverdue}
                  overdueLabel={overdueLabel}
                  onUpdateTaskDate={onUpdateTaskDate}
                  onUpdateTaskPriority={onUpdateTaskPriority}
                />
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                <IconButton
                  onClick={() => onEditTask(item.path)}
                  ariaLabel={tEditLabel}
                  title={tEditLabel}
                >
                  <PencilIcon />
                </IconButton>
                <IconButton
                  onClick={() => {
                    if (armed) {
                      setConfirmDeletePath(null);
                      void onDeleteTask(item.path);
                    } else {
                      setConfirmDeletePath(item.path);
                    }
                  }}
                  ariaLabel={armed ? tDeleteConfirmLabel : tDeleteLabel}
                  title={armed ? tDeleteConfirmLabel : tDeleteLabel}
                  variant={armed ? 'danger' : 'default'}
                >
                  <TrashIcon />
                </IconButton>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// --- View-mode toggle ------------------------------------------------------

/** Two-button segmented toggle: list ↔ kanban. */
function ViewModeToggle({
  value, onChange, t,
}: {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
  t: (key: string) => string;
}) {
  const buttonClass = (active: boolean) =>
    `inline-flex items-center justify-center w-7 h-7 transition-colors ${
      active
        ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
        : 'text-muted hover:text-text hover:bg-[var(--panel)]'
    }`;
  return (
    <div
      role="group"
      aria-label={t('viewModeList')}
      className="inline-flex items-center rounded-md border border-[var(--border)] overflow-hidden"
    >
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
        aria-label={t('viewModeList')}
        title={t('viewModeList')}
        className={buttonClass(value === 'list')}
      >
        <ListIcon />
      </button>
      <button
        type="button"
        onClick={() => onChange('kanban')}
        aria-pressed={value === 'kanban'}
        aria-label={t('viewModeKanban')}
        title={t('viewModeKanban')}
        className={`${buttonClass(value === 'kanban')} border-l border-[var(--border)]`}
      >
        <KanbanIcon />
      </button>
    </div>
  );
}

// --- Visual primitives ------------------------------------------------------

/**
 * Brief plain-text excerpt of the task body, shown beneath the title in
 * list rows and kanban cards. When the body contains an inline image
 * (absolute http(s) or raster data URL), a thumbnail renders on its own
 * row between the description text and the chip row. Empty bodies render
 * nothing.
 */
export function BodyPreview({ body, done }: { body?: string; done?: boolean }) {
  // Memo because previewBody runs a few regex passes and the row rerenders
  // freely (hover, focus-within state on the row).
  const image = useMemo(() => extractFirstImage(body), [body]);
  const text = useMemo(() => {
    // Strip the matched image string from the body before generating the
    // preview text, so the alt text doesn't appear duplicated alongside
    // the thumbnail.
    const source = image && body ? body.split(image.match).join('') : (body ?? '');
    return previewBody(source);
  }, [body, image]);
  if (!text && !image) return null;
  return (
    <div className="mt-0.5 flex flex-col gap-1.5">
      {text && (
        <p className={`text-xs leading-snug line-clamp-2 break-words ${done ? 'text-muted/70' : 'text-muted'}`}>
          {text}
        </p>
      )}
      {image && (
        <img
          src={image.url}
          alt={image.alt}
          loading="lazy"
          // Hide silently on load failure — a broken-image icon would draw
          // more attention than the missing thumbnail itself.
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          className={`self-start w-16 h-16 rounded object-cover bg-[var(--panel-2)] ${done ? 'opacity-70' : ''}`}
        />
      )}
    </div>
  );
}

export function PriorityDot({ priority }: { priority?: string }) {
  // Reserve the slot even when no priority is set so titles stay aligned
  // across rows. Color follows the spec's five-tier ladder. Same line-height
  // wrapper trick as the checkbox so the dot sits on the title's first-line
  // center regardless of row height.
  const tone = ({
    highest: 'bg-red-500',
    high: 'bg-orange-500',
    normal: 'bg-blue-500',
    low: 'bg-slate-400',
    lowest: 'bg-slate-300',
  } as Record<string, string>)[priority ?? ''];
  return (
    <span
      title={priority || undefined}
      aria-hidden="true"
      className="inline-flex items-center shrink-0 h-5"
    >
      <span className={`block w-2 h-2 rounded-full ${tone ?? ''}`} />
    </span>
  );
}

export type ChipTone = 'neutral' | 'danger' | 'accent' | 'high' | 'medium' | 'low';

export function chipToneClasses(variant: ChipTone): string {
  // No shadow / no border — for tinted variants the bg fill gives definition,
  // and the neutral chip uses a color-mix to sit a touch darker than the
  // modal panel-2. Shadows were dropped because each chip's blur sampled
  // many pixels per paint; with several chips per card × many cards, this
  // dominated scroll cost on high-DPR external displays.
  switch (variant) {
    case 'danger':  return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
    case 'accent':  return 'bg-[var(--accent)]/10 text-[var(--accent)]';
    case 'high':    return 'bg-red-500/15 text-red-600 dark:text-red-400';
    case 'medium':  return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
    case 'low':     return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
    default:        return 'bg-[color-mix(in_srgb,black_6%,var(--panel-2))] text-muted';
  }
}

export function Chip({
  children, variant = 'neutral', icon, prefix,
}: {
  children: ReactNode;
  variant?: ChipTone;
  icon?: ReactNode;
  prefix?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${chipToneClasses(variant)}`}>
      {icon}
      {prefix && <span className="opacity-70">{prefix}:</span>}
      {children}
    </span>
  );
}

const PRIORITY_TONE: Record<string, { tone: ChipTone; key: string }> = {
  highest: { tone: 'high',   key: 'priorityHighest' },
  high:    { tone: 'high',   key: 'priorityHigh' },
  normal:  { tone: 'medium', key: 'priorityNormal' },
  low:     { tone: 'low',    key: 'priorityLow' },
  lowest:  { tone: 'low',    key: 'priorityLowest' },
};

/**
 * Compact metadata row beneath a task title — surfaces every relevant field
 * (scheduled, due/overdue, recurrence cadence, projects, tags, contexts) so
 * the user can triage from the list without opening the file. Date chips
 * are click-to-edit: clicking opens the native calendar so the user can
 * reschedule without going through the edit modal.
 */
export function TaskMeta({
  path, task, isOverdue, overdueLabel, onUpdateTaskDate, onUpdateTaskPriority,
}: {
  path: string;
  task: Task;
  isOverdue: boolean;
  overdueLabel: string;
  onUpdateTaskDate: (path: string, field: 'due' | 'scheduled', value: string) => Promise<void> | void;
  onUpdateTaskPriority: (path: string, priority: string) => Promise<void> | void;
}) {
  const tCommon = useTranslations('tasks');
  const projects = (task.projects ?? [])
    .map(p => p.replace(/^\[\[|\]\]$/g, '').trim())
    .filter(Boolean);
  const tags = task.tags ?? [];
  const contexts = task.contexts ?? [];
  const recurrenceLabel = task.recurrence ? formatRecurrenceLabel(task.recurrence, tCommon) : null;
  const hasAny = task.scheduled
    || task.due
    || isOverdue
    || recurrenceLabel
    || projects.length > 0
    || tags.length > 0
    || contexts.length > 0;
  const priorityMeta = task.priority ? PRIORITY_TONE[task.priority] : undefined;
  const hasAnyChip = priorityMeta || hasAny;
  if (!hasAnyChip) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {priorityMeta && (
        <PriorityChip
          value={task.priority}
          prefix={tCommon('chipPriority')}
          onChange={(v) => void onUpdateTaskPriority(path, v)}
        />
      )}
      {(isOverdue || task.due) && (
        <DateChip
          value={task.due ? task.due.slice(0, 10) : ''}
          icon={<CalendarIcon />}
          variant={isOverdue ? 'danger' : 'neutral'}
          prefix={tCommon('chipDue')}
          ariaLabel={tCommon('createFieldDue')}
          onChange={(v) => void onUpdateTaskDate(path, 'due', v)}
        >
          {isOverdue
            ? `${overdueLabel}${task.due ? ` · ${task.due.slice(0, 10)}` : ''}`
            : task.due!.slice(0, 10)}
        </DateChip>
      )}
      {task.scheduled && (
        <DateChip
          value={task.scheduled.slice(0, 10)}
          icon={<ClockIcon />}
          variant="neutral"
          prefix={tCommon('chipScheduled')}
          ariaLabel={tCommon('createFieldScheduled')}
          onChange={(v) => void onUpdateTaskDate(path, 'scheduled', v)}
        />
      )}
      {recurrenceLabel && (
        <Chip variant="neutral" icon={<RecurrenceIcon />}>{recurrenceLabel}</Chip>
      )}
      {projects.map(p => <Chip key={`p-${p}`} variant="accent">{p}</Chip>)}
      {tags.map(tag => <Chip key={`t-${tag}`} variant="neutral">#{tag}</Chip>)}
      {contexts.map(c => (
        <Chip key={`c-${c}`} variant="neutral">{c.startsWith('@') ? c : `@${c}`}</Chip>
      ))}
    </div>
  );
}

/**
 * Themed chip that opens a `react-day-picker`-backed calendar popover on
 * click. The popover obeys the app theme (variables overridden in
 * globals.css), unlike the native `<input type="date">` picker which only
 * supports `color-scheme`.
 */
export function DateChip({
  value, icon, variant = 'neutral', prefix, ariaLabel, onChange, children,
}: {
  value: string;
  icon?: ReactNode;
  variant?: ChipTone;
  prefix?: string;
  ariaLabel: string;
  onChange: (next: string) => void;
  children?: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium hover:opacity-90 transition-colors ${chipToneClasses(variant)}`}
      >
        {icon}
        {prefix && <span className="opacity-70">{prefix}:</span>}
        {children ?? value}
      </button>
      <CalendarPopover
        open={open}
        value={value}
        anchorRef={triggerRef}
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </span>
  );
}

const PRIORITY_OPTIONS: Array<keyof typeof PRIORITY_TONE> = ['highest', 'high', 'normal', 'low', 'lowest'];

/**
 * Click-to-edit priority chip. Same chrome as the date chips (button + popover
 * anchored to the trigger), but the popover is a static list of the five
 * priority tiers. Selection writes via `onChange` and closes the popover.
 */
export function PriorityChip({
  value, prefix, onChange,
}: {
  value: string | undefined;
  prefix?: string;
  onChange: (next: string) => void;
}) {
  const tCommon = useTranslations('tasks');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Portaled-popover position. Recomputed on open + scroll + resize so the
  // listbox stays anchored even as the kanban scrolls. Portaling escapes
  // the column's `contain: paint` clip; the previous absolutely-positioned
  // popover was being chopped at the column edge.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const reposition = () => {
      const anchor = triggerRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const meta = value ? PRIORITY_TONE[value] : undefined;
  const tone = meta?.tone ?? 'neutral';
  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={tCommon('chipPriority')}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium hover:opacity-90 transition-colors ${chipToneClasses(tone)}`}
      >
        {prefix && <span className="opacity-70">{prefix}:</span>}
        {meta ? tCommon(meta.key) : '—'}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          role="listbox"
          className="fixed min-w-[140px] bg-[var(--panel)] border border-[var(--border)] rounded-md py-1 z-[100]"
          style={{
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            boxShadow: '0 12px 28px -10px rgba(0,0,0,0.35)',
          }}
        >
          {PRIORITY_OPTIONS.map(opt => {
            const optMeta = PRIORITY_TONE[opt];
            const active = opt === value;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { onChange(opt); setOpen(false); }}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-[12px] hover:bg-[var(--panel-2)] text-left"
              >
                <span className={`shrink-0 w-3 text-center ${active ? 'text-[var(--accent)]' : 'text-transparent'}`} aria-hidden="true">✓</span>
                <span className={active ? 'text-text font-medium' : 'text-text'}>{tCommon(optMeta.key)}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </span>
  );
}

/**
 * Map an RRULE-derived recurrence string to a friendly label, falling back to
 * the raw rule for anything that doesn't match a known preset. Re-uses the
 * task-modal locale keys so the wording stays in sync.
 */
function formatRecurrenceLabel(recurrence: string, t: (key: string) => string): string {
  const start = recurrence.indexOf('FREQ=');
  const rule = start === -1 ? recurrence.trim() : recurrence.slice(start);
  switch (rule) {
    case 'FREQ=DAILY': return t('recurrenceDaily');
    case 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR': return t('recurrenceWeekdays');
    case 'FREQ=WEEKLY': return t('recurrenceWeekly');
    case 'FREQ=MONTHLY': return t('recurrenceMonthly');
    case 'FREQ=YEARLY': return t('recurrenceYearly');
    default: return rule;
  }
}

export function IconButton({
  onClick, ariaLabel, title, children, variant = 'default',
}: {
  onClick: () => void;
  ariaLabel: string;
  title: string;
  children: ReactNode;
  variant?: 'default' | 'danger';
}) {
  const tone = variant === 'danger'
    ? 'text-red-500 bg-red-500/10'
    : 'text-muted hover:text-text hover:bg-[var(--panel-2)]';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${tone}`}
    >
      {children}
    </button>
  );
}

// --- Icons ------------------------------------------------------------------
// Inline so they inherit `currentColor` and theme without a sprite layer.

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 5l10 10M15 5l-10 10" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="9" r="5" />
      <path d="M13 13l3.5 3.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.5 3.5l3 3-9.5 9.5H4v-3l9.5-9.5z" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 6h13M8 6V4h4v2M5 6l1 11h8l1-11M9 9v6M11 9v6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5V10l2.5 1.8" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" />
      <path d="M3.5 8h13M7 3v3M13 3v3" />
    </svg>
  );
}

function RecurrenceIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10a6 6 0 0110-4.5M16 10a6 6 0 01-10 4.5" />
      <path d="M14 3v3h-3M6 17v-3h3" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h12M4 10h12M4 14h12" />
    </svg>
  );
}

function KanbanIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="4" height="14" rx="1" />
      <rect x="9" y="3" width="4" height="9" rx="1" />
      <rect x="15" y="3" width="2" height="6" rx="1" />
    </svg>
  );
}

// Rail-only icons (16px). The list uses 11px icons inside chips; the rail
// items want a slightly larger glyph for legibility at the navigation level.

function RailAllIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </svg>
  );
}

function RailLaterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15.5 12.5A6.5 6.5 0 1 1 7.5 4.5" />
      <path d="M14 3l3 3-3 3" />
    </svg>
  );
}

function RailDoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M6.5 10.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

function RailCalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="13" rx="1.5" />
      <path d="M3 8.5h14M7 3v3M13 3v3" />
    </svg>
  );
}

function RailClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 1.8" />
    </svg>
  );
}

export default memo(TasksListView);
