'use client';

// Kanban layout for the tasks overlay. Lives inside `<TasksListView>`'s
// right-hand `<main>` region — the toolbar, smart-list rail, and modal frame
// belong to the parent. Columns are produced by `runQuery()` (same grouped
// shape the list consumes); only the layout and drag-and-drop are new.
//
// DnD is enabled for `status`, `priority`, `dueBucket`, `project`, `tag`, and
// `context`. The `folder` axis stays read-only because folder columns are
// derived from the first project's wikilink prefix (no clean way to mutate
// without restructuring the project list).
//
// For multi-valued axes (project / tag / context) a drop applies *move*
// semantics — the source bucket value is removed from the task's array and
// the target value is added (deduplicated). Drops onto the no-value column
// (`__none__`) are disabled because "remove only the source" vs "clear the
// whole list" is ambiguous; users edit the task to truly clear a list.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { effectiveInstanceState, todayLocalDay, type Task } from '@/lib/tasks';
import type { TaskPatch } from '@/lib/tasks/operations';
import { type GroupAxis, type runQuery } from '@/lib/tasks/query';
import { BodyPreview, IconButton, PencilIcon, PriorityDot, TaskMeta, TrashIcon } from './TasksListView';

const COMPLETED_STATUSES = new Set(['done', 'completed']);

type Groups = NonNullable<ReturnType<typeof runQuery>>['groups'];
type GroupItem = Groups[number]['items'][number];

// Axes that support drag-and-drop. `folder` is read-only — see file note.
// `project` / `tag` / `context` are multi-valued: the same task can appear
// in several columns, so drag IDs and the drop handler treat them specially.
const DND_AXES: ReadonlySet<GroupAxis> = new Set<GroupAxis>([
  'status', 'priority', 'dueBucket', 'project', 'tag', 'context',
]);

// Canonical column sets for the three single-valued axes. The kanban shows
// these columns *even when empty* so users have somewhere to drop cards
// (otherwise a status with zero tasks vanishes from the board and you can't
// drag a card into it). Multi-valued axes (project / tag / context) are left
// alone — the value space is open and we don't know which columns a vault
// "should" have.
export const KANBAN_CANONICAL_COLUMNS: Partial<Record<GroupAxis, readonly string[]>> = {
  status:    ['open', 'in-progress', 'done', 'cancelled'],
  priority:  ['highest', 'high', 'normal', 'low', 'lowest'],
  dueBucket: ['overdue', 'today', 'tomorrow', 'thisWeek', 'later', 'noDate', 'done'],
};

// For axes with a canonical column set, ensure every canonical column is
// present (filling empty groups for missing keys). Anything in `groups`
// that's not in the canonical set is appended at the tail. For other axes
// `groups` is returned unchanged.
export function augmentWithCanonicalColumns(
  groups: Groups,
  axis: GroupAxis,
): Groups {
  const canonical = KANBAN_CANONICAL_COLUMNS[axis];
  if (!canonical) return groups;
  const present = new Map(groups.map(g => [g.key, g]));
  const head = canonical.map(key => present.get(key) ?? { key, label: key, items: [] });
  const tail = groups.filter(g => !canonical.includes(g.key));
  return [...head, ...tail];
}

// dueBucket keys that accept drops. The remainder ('overdue', 'thisWeek',
// 'later') are ambiguous — there isn't a single date that lands a task there.
export function isDroppableDueBucket(key: string): boolean {
  return key === 'today' || key === 'tomorrow' || key === 'noDate' || key === 'done';
}

// Map a multi-valued group axis to the Task field name it writes back into.
export function fieldForAxis(axis: GroupAxis): 'projects' | 'tags' | 'contexts' | null {
  if (axis === 'project') return 'projects';
  if (axis === 'tag') return 'tags';
  if (axis === 'context') return 'contexts';
  return null;
}

// Compose the next array for a multi-valued field after a kanban move.
// Removes the source-column value and appends the target (deduped). Drops
// onto the no-value column (`__none__`) only remove the source value — they
// don't clear the whole list (that ambiguity is why those columns are
// non-droppable in the UI; this fallback is defensive).
export function applyMove(current: string[] | undefined, sourceKey: string, targetKey: string): string[] {
  const filtered = (current ?? []).filter(v => v !== sourceKey);
  if (targetKey === '__none__') return filtered;
  return Array.from(new Set([...filtered, targetKey]));
}

// Construct the unique drag ID. Multi-valued axes can render the same task
// in multiple columns, so the column key must be part of the id.
export function makeDragId(path: string, columnKey: string): string {
  return `${path}::${columnKey}`;
}

// Compose the patch a kanban status drop should apply. Two invariants are
// easy to get wrong without a dedicated helper:
//
//   1. The destination status is written *as-is* — including custom
//      completed values like 'completed'. Routing a "drop on Completed"
//      through `completeTask` would discard the user's choice because
//      `pickCompletedStatus` returns the first configured completed value
//      (usually 'done').
//
//   2. `completed_date` is stamped when entering the completed set and
//      cleared (via `applyPatch`'s `undefined → delete` semantics) when
//      leaving it. validate.ts §6.4 check 1a requires the stamp for
//      non-recurring tasks; for recurring tasks the dueBucket grouping
//      *also* reads completed_date (query.ts), so without this stamp a
//      recurring task dropped on the dueBucket "Done" column would not
//      land there.
//
// Recurring tasks intentionally take the same path: kanban moves change
// the task's *base* fields so the drop lands in the destination column.
// Per-instance completion (the checkbox tick) is a separate operation and
// stays on the `onToggleComplete` flow.
export function statusDropPatch(
  task: Task,
  destStatus: string,
  today: string,
  completedSet: ReadonlySet<string> = COMPLETED_STATUSES,
): TaskPatch {
  const movingToDone = completedSet.has(destStatus);
  const wasDone = completedSet.has(task.status);
  const patch: TaskPatch = { status: destStatus };
  if (movingToDone && !(wasDone && task.completed_date)) {
    // Stamp today when entering the completed set fresh. Preserve the
    // existing completed_date when re-targeting between completed values
    // (e.g. done → completed) — that matches `completeTask`'s default
    // `preserve_if_present` policy.
    patch.completed_date = today;
  } else if (!movingToDone && wasDone) {
    // Leaving the completed set: clear completed_date. `applyPatch` treats
    // explicit `undefined` as a delete.
    patch.completed_date = undefined;
  }
  return patch;
}

interface Props {
  groups: Groups;
  groupAxis: GroupAxis;
  onOpenTask: (path: string) => void;
  onToggleComplete: (path: string, currentlyDone: boolean) => void;
  onEditTask: (path: string) => void;
  onDeleteTask: (path: string) => Promise<void> | void;
  onUpdateTaskStatus: (path: string, status: string) => Promise<void> | void;
  onUpdateTaskPriority: (path: string, priority: string) => Promise<void> | void;
  onUpdateTaskDate: (path: string, field: 'due' | 'scheduled', value: string) => Promise<void> | void;
  /** Replace a multi-valued list field on the task (projects / tags /
   *  contexts). Used by kanban moves between columns on those axes. */
  onUpdateTaskList: (path: string, field: 'projects' | 'tags' | 'contexts', next: string[]) => Promise<void> | void;
}

// Stable identity wrapper for callbacks that change between renders. The
// kanban board receives inline arrow handlers from `page.tsx` — without this,
// the memoized `KanbanColumn` / `KanbanCard` would still re-render on every
// parent render because every prop is a fresh function. The wrapper always
// invokes the *latest* handler, but exposes a stable reference so React.memo
// shallow-compares true.
function useStable<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useCallback(((...args) => ref.current(...args)) as T, []);
}

export default function TaskKanbanBoard({
  groups, groupAxis,
  onOpenTask, onToggleComplete, onEditTask, onDeleteTask,
  onUpdateTaskStatus, onUpdateTaskPriority, onUpdateTaskDate, onUpdateTaskList,
}: Props) {
  const t = useTranslations('tasks');
  const sensors = useSensors(
    // 5px activation distance lets click-to-open coexist with drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activePath, setActivePath] = useState<string | null>(null);
  const dragEnabled = DND_AXES.has(groupAxis);

  // Stabilize handler identities so memoized children don't re-render every
  // time the parent rebuilds its inline arrow props. The wrappers are stable
  // for the lifetime of this component but always call the latest handler.
  const stableOpenTask = useStable(onOpenTask);
  const stableToggleComplete = useStable(onToggleComplete);
  const stableEditTask = useStable(onEditTask);
  const stableDeleteTask = useStable(onDeleteTask);
  const stableUpdateTaskDate = useStable(onUpdateTaskDate);
  const stableUpdateTaskPriority = useStable(onUpdateTaskPriority);

  // For single-valued axes, ensure every canonical column is present even
  // when empty so users have a drop target. Custom statuses (or any other
  // non-canonical key already in `groups`) keep their place at the tail.
  const renderGroups = useMemo(
    () => augmentWithCanonicalColumns(groups, groupAxis),
    [groups, groupAxis],
  );

  // Drag-id → (item, source column) lookup. The id encodes the column key
  // because multi-valued axes (project / tag / context) render the same task
  // in multiple columns. Single-valued axes still use a unique id per task,
  // just suffixed with the (one) column key.
  const itemByDragId = useMemo(() => {
    const m = new Map<string, { item: GroupItem; sourceKey: string }>();
    for (const g of renderGroups) for (const item of g.items) {
      m.set(makeDragId(item.path, g.key), { item, sourceKey: g.key });
    }
    return m;
  }, [renderGroups]);

  function handleDragStart(e: DragStartEvent) {
    setActivePath(String(e.active.id));
  }

  function handleDragCancel() {
    setActivePath(null);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActivePath(null);
    const { active, over } = e;
    if (!over) return;
    const data = active.data.current as { path?: string; sourceKey?: string } | undefined;
    const path = data?.path;
    const sourceKey = data?.sourceKey;
    if (!path) return;
    const destKey = String(over.id);
    if (sourceKey === destKey) return;

    switch (groupAxis) {
      case 'status': {
        if (destKey === 'unset') return;       // 'No status' is read-only
        await onUpdateTaskStatus(path, destKey);
        return;
      }
      case 'priority': {
        if (destKey === 'unset') return;       // 'No priority' is read-only
        await onUpdateTaskPriority(path, destKey);
        return;
      }
      case 'dueBucket': {
        const today = todayLocalDay();
        switch (destKey) {
          case 'today':    await onUpdateTaskDate(path, 'due', today); return;
          case 'tomorrow': await onUpdateTaskDate(path, 'due', offsetIsoDay(today, 1)); return;
          case 'noDate':   await onUpdateTaskDate(path, 'due', ''); return;
          case 'done':     await onUpdateTaskStatus(path, 'done'); return;
          default: return;                     // overdue / thisWeek / later — disabled
        }
      }
      case 'project':
      case 'tag':
      case 'context': {
        const field = fieldForAxis(groupAxis);
        if (!field || !sourceKey) return;
        const entry = itemByDragId.get(makeDragId(path, sourceKey));
        if (!entry) return;
        const current = (entry.item.task[field] ?? []) as string[];
        const next = applyMove(current, sourceKey, destKey);
        await onUpdateTaskList(path, field, next);
        return;
      }
      default:
        return;
    }
  }

  const activeEntry = activePath ? itemByDragId.get(activePath) ?? null : null;
  const today = todayLocalDay();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* `will-change: scroll-position` hints the compositor to keep the
          horizontal scroll area on its own layer so paint can be reused
          across frames. Combined with per-column `contain: paint` and
          `content-visibility: auto`, off-screen columns no longer paint as
          the user scrolls. */}
      <div className="h-full overflow-x-auto overflow-y-hidden" style={SCROLLER_STYLE}>
        <div className="h-full flex gap-3 pb-1 items-stretch">
          {renderGroups.map(group => {
            const isNoValue = group.key === 'unset' || group.key === '__none__' || group.key === '__inbox__';
            const dropEnabled = dragEnabled
              && !isNoValue
              && (groupAxis !== 'dueBucket' || isDroppableDueBucket(group.key));
            return (
              <KanbanColumn
                key={group.key}
                columnKey={group.key}
                label={localiseGroupLabel(group.key, group.label, groupAxis, t)}
                count={group.items.length}
                items={group.items}
                today={today}
                draggable={dragEnabled}
                droppable={dropEnabled}
                emptyLabel={t('kanbanEmptyColumn')}
                disabledHint={t('kanbanDropDisabled')}
                onOpenTask={stableOpenTask}
                onToggleComplete={stableToggleComplete}
                onEditTask={stableEditTask}
                onDeleteTask={stableDeleteTask}
                onUpdateTaskDate={stableUpdateTaskDate}
                onUpdateTaskPriority={stableUpdateTaskPriority}
              />
            );
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeEntry && (
          <div className="cursor-grabbing rotate-1 opacity-95">
            <CardBody
              item={activeEntry.item}
              done={isDoneToday(activeEntry.item.task, today)}
              elevated
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// --- Column ---------------------------------------------------------------

interface ColumnProps {
  columnKey: string;
  label: string;
  count: number;
  items: GroupItem[];
  today: string;
  draggable: boolean;
  droppable: boolean;
  emptyLabel: string;
  disabledHint: string;
  onOpenTask: (path: string) => void;
  onToggleComplete: (path: string, currentlyDone: boolean) => void;
  onEditTask: (path: string) => void;
  onDeleteTask: (path: string) => Promise<void> | void;
  onUpdateTaskDate: (path: string, field: 'due' | 'scheduled', value: string) => Promise<void> | void;
  onUpdateTaskPriority: (path: string, priority: string) => Promise<void> | void;
}

// Per-column paint isolation. `contain: paint` clips paint to the column's
// border box so a hover/scroll repaint inside one column can't invalidate
// pixels under a sibling column. `content-visibility: auto` lets the browser
// skip layout + paint entirely for off-screen columns; the
// `contain-intrinsic-size` placeholder keeps the horizontal layout stable
// while the column is virtualized.
const COLUMN_STYLE: CSSProperties = {
  contain: 'paint',
  contentVisibility: 'auto',
  containIntrinsicSize: '260px 600px',
};

const SCROLLER_STYLE: CSSProperties = {
  willChange: 'scroll-position',
};

const KanbanColumn = memo(function KanbanColumn({
  columnKey, label, count, items, today,
  draggable, droppable, emptyLabel, disabledHint,
  onOpenTask, onToggleComplete, onEditTask, onDeleteTask, onUpdateTaskDate, onUpdateTaskPriority,
}: ColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: columnKey, disabled: !droppable });
  return (
    <section
      className={`shrink-0 w-[260px] flex flex-col rounded-md border bg-[var(--panel)] ${
        isOver && droppable
          ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--panel))]'
          : 'border-[var(--border)]'
      }`}
      style={COLUMN_STYLE}
      title={!droppable && draggable ? disabledHint : undefined}
    >
      <header className="px-3 py-2 flex items-center justify-between border-b border-[var(--border)] shrink-0">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider truncate">{label}</h3>
        <span className="text-[11px] text-muted tabular-nums shrink-0 ml-2">{count}</span>
      </header>
      <div ref={setNodeRef} className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="text-[11px] text-muted text-center py-4">{emptyLabel}</div>
        ) : items.map(item => (
          <KanbanCard
            key={item.path}
            item={item}
            sourceKey={columnKey}
            today={today}
            draggable={draggable}
            onOpenTask={onOpenTask}
            onToggleComplete={onToggleComplete}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
            onUpdateTaskDate={onUpdateTaskDate}
            onUpdateTaskPriority={onUpdateTaskPriority}
          />
        ))}
      </div>
    </section>
  );
});

// --- Card -----------------------------------------------------------------

interface CardProps {
  item: GroupItem;
  sourceKey: string;
  today: string;
  draggable: boolean;
  onOpenTask: (path: string) => void;
  onToggleComplete: (path: string, currentlyDone: boolean) => void;
  onEditTask: (path: string) => void;
  onDeleteTask: (path: string) => Promise<void> | void;
  onUpdateTaskDate: (path: string, field: 'due' | 'scheduled', value: string) => Promise<void> | void;
  onUpdateTaskPriority: (path: string, priority: string) => Promise<void> | void;
}

const KanbanCard = memo(function KanbanCard({
  item, sourceKey, today, draggable,
  onOpenTask, onToggleComplete, onEditTask, onDeleteTask,
  onUpdateTaskDate, onUpdateTaskPriority,
}: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: makeDragId(item.path, sourceKey),
    disabled: !draggable,
    data: { path: item.path, sourceKey },
  });
  const done = isDoneToday(item.task, today);
  return (
    <div
      ref={setNodeRef}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      className={`group ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-30' : ''}`}
    >
      <CardBody
        item={item}
        done={done}
        onOpenTitle={() => onOpenTask(item.path)}
        onToggleDone={() => onToggleComplete(item.path, done)}
        onEdit={() => onEditTask(item.path)}
        onDelete={() => onDeleteTask(item.path)}
        onUpdateTaskDate={onUpdateTaskDate}
        onUpdateTaskPriority={onUpdateTaskPriority}
      />
    </div>
  );
});

interface CardBodyProps {
  item: GroupItem;
  done: boolean;
  elevated?: boolean;
  onOpenTitle?: () => void;
  onToggleDone?: () => void;
  onEdit?: () => void;
  onDelete?: () => Promise<void> | void;
  onUpdateTaskDate?: (path: string, field: 'due' | 'scheduled', value: string) => Promise<void> | void;
  onUpdateTaskPriority?: (path: string, priority: string) => Promise<void> | void;
}

function CardBody({
  item, done, elevated,
  onOpenTitle, onToggleDone, onEdit, onDelete,
  onUpdateTaskDate, onUpdateTaskPriority,
}: CardBodyProps) {
  const t = useTranslations('tasks');
  // Defer to TaskMeta for the chip row — same component the list view uses,
  // so the kanban surfaces every attribute (priority, due/overdue,
  // scheduled, recurrence, every project / tag / context).
  const noopDate = onUpdateTaskDate ?? (() => {});
  const noopPriority = onUpdateTaskPriority ?? (() => {});

  // Two-click confirm for delete, mirroring the list view's row pattern.
  // First click arms the button (3-second window); second click commits.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    // Hover border was previously a `color-mix` against `--accent` — pretty,
    // but every card the cursor crossed during a horizontal scroll triggered
    // a paint. The hover-revealed edit/delete cluster below is enough of a
    // hover affordance; the border stays static so scroll-induced hover
    // transitions don't fire across long card runs.
    <div
      className={`rounded-md border bg-[var(--panel-2)] px-2.5 py-2 ${
        elevated
          ? 'border-[var(--accent)] shadow-lg'
          : 'border-[var(--border)]'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="inline-flex items-center shrink-0 h-5">
          <input
            type="checkbox"
            checked={done}
            onChange={onToggleDone ?? (() => {})}
            // Drag listener owns pointer-down on the card; the checkbox
            // swallows it so toggling doesn't initiate a drag.
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={done ? t('uncomplete') : t('complete')}
            className="cursor-pointer"
          />
        </span>
        <PriorityDot priority={item.task.priority} />
        {/* The title button intentionally does NOT stopPropagation on
            pointerdown — dnd-kit's 5px activation distance disambiguates
            click vs drag, so a quick click still opens the task while a
            drag from the title now starts the move. */}
        <button
          type="button"
          onClick={onOpenTitle}
          className={`flex-1 min-w-0 text-left text-[13px] leading-5 ${done ? 'line-through text-muted' : 'text-text'}`}
        >
          <span className="line-clamp-2 break-words">{item.task.title}</span>
        </button>
        {(onEdit || onDelete) && (
          <div
            // Snap-on-hover (no transition) — every card the cursor crossed
            // during a horizontal scroll was animating opacity, which on a
            // high-DPR external display added up across dozens of cards.
            // The buttons still appear/disappear on hover, just instantly.
            className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 shrink-0"
            // Same defensive stopPropagation as TaskMeta below: the buttons
            // sit inside the draggable card, and we don't want a stray
            // pointer move during click to initiate a drag.
            onPointerDown={(e) => e.stopPropagation()}
          >
            {onEdit && (
              <IconButton
                onClick={onEdit}
                ariaLabel={t('rowEditAria')}
                title={t('rowEditAria')}
              >
                <PencilIcon />
              </IconButton>
            )}
            {onDelete && (
              <IconButton
                onClick={() => {
                  if (armed) {
                    setArmed(false);
                    void onDelete();
                  } else {
                    setArmed(true);
                  }
                }}
                ariaLabel={armed ? t('rowDeleteConfirmAria') : t('rowDeleteAria')}
                title={armed ? t('rowDeleteConfirmAria') : t('rowDeleteAria')}
                variant={armed ? 'danger' : 'default'}
              >
                <TrashIcon />
              </IconButton>
            )}
          </div>
        )}
      </div>
      <div className="pl-7">
        <BodyPreview body={item.task.body} done={done} />
      </div>
      {/* Intentionally no `stopPropagation` here — the 5px activation
          distance on PointerSensor disambiguates click-on-chip from
          drag-from-chip-area. Without this change the chip row was a
          drag-dead zone, forcing users to aim at the title to grab a
          card. Quick clicks on DateChip / PriorityChip still open their
          popovers; movement ≥ 5px hands the gesture to dnd-kit. */}
      <div className="pl-7">
        <TaskMeta
          path={item.path}
          task={item.task}
          isOverdue={item.computed.isOverdue}
          overdueLabel={t('overdue')}
          onUpdateTaskDate={noopDate}
          onUpdateTaskPriority={noopPriority}
        />
      </div>
    </div>
  );
}

// --- Helpers --------------------------------------------------------------

export function isDoneToday(task: Task, today: string): boolean {
  if (task.recurrence) return effectiveInstanceState(task, today) === 'completed';
  return COMPLETED_STATUSES.has(task.status);
}

export function offsetIsoDay(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T00:00:00Z`) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Localise the well-known bucket keys (`today`, `tomorrow`, `noDate`, etc.)
// from `dueBucket`, plus the priority tier names. Falls back to the raw
// label coming out of `runQuery()` for everything else (custom statuses,
// project wikilinks, tags, contexts).
function localiseGroupLabel(
  key: string,
  fallback: string,
  axis: GroupAxis,
  t: (key: string) => string,
): string {
  if (axis === 'dueBucket') {
    switch (key) {
      case 'overdue':  return t('overdue');
      case 'today':    return t('today');
      case 'tomorrow': return t('tomorrow');
      case 'thisWeek': return t('thisWeek');
      case 'later':    return t('later');
      case 'noDate':   return t('noDate');
      case 'done':     return t('filterDone');
    }
  }
  if (axis === 'priority') {
    switch (key) {
      case 'highest': return t('priorityHighest');
      case 'high':    return t('priorityHigh');
      case 'normal':  return t('priorityNormal');
      case 'low':     return t('priorityLow');
      case 'lowest':  return t('priorityLowest');
      case 'unset':   return t('priorityUnset');
    }
  }
  if (axis === 'status' && key === 'unset') return t('statusUnset');
  return fallback;
}
