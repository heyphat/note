'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { NoteMeta } from '@/lib/storage';
import type { QueryResult } from '@/lib/tasks/query';
import { SidebarToggle } from './HeaderToggles';
import { Chip, type ChipTone } from './TasksListView';

// Live clock chip. Server / pre-mount renders a stable placeholder so SSR
// hydration doesn't mismatch on the time string; ticks align to the wall
// clock so successive seconds don't drift by the mount offset.
function Clock({ locale }: { locale: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const align = 1000 - (Date.now() % 1000);
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 1000);
    }, align);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const time = now
    ? now.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--:--:--';
  const date = now
    ? now.toLocaleDateString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div
      className="inline-flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3.5 py-1.5 select-none"
      style={{
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.04) inset, 0 6px 16px -10px rgba(0,0,0,0.35)',
      }}
      aria-live="off"
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)] ${now ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />
      <span className="font-mono tabular-nums text-sm text-text tracking-wide">
        {time}
      </span>
      {date && (
        <>
          <span className="h-3 w-px bg-[var(--border-strong)]" aria-hidden="true" />
          <span className="text-[11px] text-muted uppercase tracking-[0.15em] font-medium">
            {date}
          </span>
        </>
      )}
    </div>
  );
}

// Platform modifier glyph for shortcut hints. Mirrors the isMac check in
// useAppKeyboardShortcuts so the empty-state hints match what the handler
// actually listens for. SSR sees navigator === undefined and falls through
// to the Ctrl branch; client hydration corrects it on mac.
const PLATFORM_IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
const MOD_KEY = PLATFORM_IS_MAC ? '⌘' : 'Ctrl';
const NEW_NOTE_KEYS: string[] = PLATFORM_IS_MAC ? ['Ctrl', 'N'] : ['Ctrl', 'Alt', 'N'];
const CHAT_DRAWER_KEYS: string[] = [MOD_KEY, '\\'];

type EmptyStateShortcut = { keys: string[]; labelKey: string };

const EMPTY_STATE_SHORTCUTS_LEFT: EmptyStateShortcut[] = [
  { keys: NEW_NOTE_KEYS, labelKey: 'shortcutNewNote' },
  { keys: [MOD_KEY, 'Shift', 'E'], labelKey: 'shortcutFileExplorer' },
  { keys: [MOD_KEY, 'Shift', 'K'], labelKey: 'shortcutTasksView' },
  { keys: [MOD_KEY, 'Shift', 'X'], labelKey: 'shortcutCloseNote' },
];
const EMPTY_STATE_SHORTCUTS_RIGHT: EmptyStateShortcut[] = [
  { keys: [MOD_KEY, 'K'], labelKey: 'shortcutCommandPalette' },
  { keys: [MOD_KEY, 'B'], labelKey: 'shortcutToggleSidebar' },
  { keys: CHAT_DRAWER_KEYS, labelKey: 'shortcutToggleAiChat' },
  { keys: [MOD_KEY, '.'], labelKey: 'shortcutZenMode' },
];
const EMPTY_STATE_SHORTCUTS_MOBILE: EmptyStateShortcut[] = [
  { keys: NEW_NOTE_KEYS, labelKey: 'shortcutNewNote' },
  { keys: [MOD_KEY, 'K'], labelKey: 'shortcutCommandPalette' },
  { keys: [MOD_KEY, 'Shift', 'E'], labelKey: 'shortcutFileExplorer' },
  { keys: [MOD_KEY, 'Shift', 'K'], labelKey: 'shortcutTasksView' },
  { keys: [MOD_KEY, 'B'], labelKey: 'shortcutToggleSidebar' },
  { keys: CHAT_DRAWER_KEYS, labelKey: 'shortcutToggleAiChat' },
  { keys: [MOD_KEY, 'Shift', 'X'], labelKey: 'shortcutCloseNote' },
  { keys: [MOD_KEY, '.'], labelKey: 'shortcutZenMode' },
];

function shortcutKeyLabel(key: string): string {
  switch (key) {
    case 'Ctrl': return '⌃';
    case 'Shift': return '⇧';
    case 'Alt': return '⌥';
    default: return key;
  }
}

function EmptyStateShortcutRow({ keys, labelKey }: EmptyStateShortcut) {
  const t = useTranslations('page');
  return (
    <>
      <span className="inline-flex items-center gap-1 justify-self-end">
        {keys.map((key, i) => (
          <span key={`${labelKey}-${key}-${i}`} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-muted opacity-50">+</span>}
            <kbd
              aria-label={key}
              title={key}
              className="inline-flex items-center justify-center h-[22px] min-w-[22px] px-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-2)] text-[11px] font-mono text-text"
              style={{ boxShadow: '0 1px 0 var(--border-strong), inset 0 -1px 0 rgba(0,0,0,0.05)' }}
            >
              {shortcutKeyLabel(key)}
            </kbd>
          </span>
        ))}
      </span>
      <span className="justify-self-start self-center">{t(labelKey)}</span>
    </>
  );
}

// Short, humane timestamp for the "Recent" cards on the empty-state page.
// Keeps the resolution coarse — the page is for re-entry, not triage.
//
// Exported so tests can pin the bucket boundaries without rendering the
// whole component.
export function formatEmptyStateDate(
  iso: string,
  locale: string,
  labels: { today: string; yesterday: string; daysAgo: (n: number) => string },
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const day = 86_400_000;
  if (diffMs < day) return labels.today;
  if (diffMs < 2 * day) return labels.yesterday;
  if (diffMs < 7 * day) return labels.daysAgo(Math.floor(diffMs / day));
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

// Journal prompts shown on the empty-state page. A fresh one is picked each
// time the user enters the empty state (see the useMemo below).
const JOURNAL_PROMPT_KEYS: { q: 'promptQ1'|'promptQ2'|'promptQ3'|'promptQ4'|'promptQ5'|'promptQ6'|'promptQ7'|'promptQ8'; s: 'promptS1'|'promptS2'|'promptS3'|'promptS4'|'promptS5'|'promptS6'|'promptS7'|'promptS8' }[] = [
  { q: 'promptQ1', s: 'promptS1' },
  { q: 'promptQ2', s: 'promptS2' },
  { q: 'promptQ3', s: 'promptS3' },
  { q: 'promptQ4', s: 'promptS4' },
  { q: 'promptQ5', s: 'promptS5' },
  { q: 'promptQ6', s: 'promptS6' },
  { q: 'promptQ7', s: 'promptS7' },
  { q: 'promptQ8', s: 'promptS8' },
];

export type EmptyStateProps = {
  notes: NoteMeta[];
  /** Drives the journal-prompt re-roll: a value transition (any → null or
   *  null → any) on either activeId or activeTemplate picks a fresh prompt. */
  activeId: string | null;
  activeTemplate: string | null;
  sidebarOpen: boolean;
  locale: string;
  onCreateNote: () => void;
  onSelectNote: (id: string) => void;
  onToggleSidebar: () => void;
  /** Today's open tasks (sorted by urgency). When provided, the empty-state
   *  shows a secondary card below the hero so the user can scan + check off
   *  things without leaving the landing page. */
  todaysTasks?: QueryResult | null;
  onOpenTasksView?: () => void;
  onCreateTask?: () => void;
  onOpenTask?: (path: string) => void;
  onToggleTaskComplete?: (path: string, currentlyDone: boolean) => Promise<void> | void;
  /** Caller already renders a header above this view (e.g. the docs banner
   *  in first-launch mode), so skip the local sidebar-toggle row to avoid
   *  stacking two near-empty rows. */
  hideHeader?: boolean;
};

// Empty-state screen shown when no note or template is active. Owns the
// journal-prompt re-roll and the recent-notes shelf. Rendered inside the
// editor pane wrapper from page.tsx, so it doesn't claim its own flex
// container or full-screen layout.
export default function EmptyState({
  notes,
  activeId,
  activeTemplate,
  sidebarOpen,
  locale,
  onCreateNote,
  onSelectNote,
  onToggleSidebar,
  todaysTasks,
  onOpenTasksView,
  onCreateTask,
  onOpenTask,
  onToggleTaskComplete,
  hideHeader,
}: EmptyStateProps) {
  const tPage = useTranslations('page');
  const tCommon = useTranslations('common');
  const tRecent = useTranslations('recent');

  const emptyStatePrompt = useMemo(() => {
    const k = JOURNAL_PROMPT_KEYS[Math.floor(Math.random() * JOURNAL_PROMPT_KEYS.length)];
    return { q: tPage(k.q), s: tPage(k.s) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeTemplate]);

  return (
    <>
      {!sidebarOpen && !hideHeader && (
        <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-3 text-xs zen-hide">
          <SidebarToggle open={sidebarOpen} onClick={onToggleSidebar} />
        </div>
      )}
      <div className="relative flex-1 flex flex-col min-h-0">
        {/* Ambient accent glow — a soft radial wash behind the card so
            the page reads as lit rather than flat. Sits on the
            non-scrolling outer wrapper so it stays anchored to the
            visible area as the inner column scrolls. Non-interactive. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 50% 30%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 70%)',
          }}
        />

        <div className="relative flex-1 min-h-0 overflow-y-auto">
          <div className="min-h-full flex flex-col items-center justify-center px-6 py-10">
        <div className="relative mb-5">
          <Clock locale={locale} />
        </div>

        {/* Primary card — holds prompt, CTA, vault count, shortcuts. */}
        <div
          className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-8 py-10 flex flex-col items-center gap-7"
          style={{
            boxShadow:
              '0 1px 0 color-mix(in srgb, var(--border-strong) 50%, transparent) inset, 0 20px 40px -24px rgba(0,0,0,0.35)',
          }}
        >
          <div className="text-center space-y-3">
            <h1 className="text-2xl sm:text-3xl text-text font-semibold leading-tight tracking-tight">
              {emptyStatePrompt.q}
            </h1>
            <p className="text-sm text-muted leading-relaxed">{emptyStatePrompt.s}</p>
          </div>
          <button
            onClick={onCreateNote}
            className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] text-sm font-medium hover:bg-[var(--accent-hover)] transition-all duration-150 active:scale-[0.98]"
            style={{
              boxShadow:
                '0 8px 24px -10px color-mix(in srgb, var(--accent) 55%, transparent), 0 1px 0 rgba(255,255,255,0.08) inset',
            }}
          >
            <span className="text-base leading-none translate-y-[-1px]">+</span>
            <span>{notes.length > 0 ? tPage('newNoteCta') : tPage('createFirstNote')}</span>
          </button>
          {notes.length > 0 && (
            <div className="text-xs text-muted">
              {tPage(notes.length === 1 ? 'vaultCountOne' : 'vaultCountOther', { count: notes.length })}
            </div>
          )}
          <div className="w-full pt-5 border-t border-[var(--border)] text-xs text-muted">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 sm:hidden">
              {EMPTY_STATE_SHORTCUTS_MOBILE.map(shortcut => (
                <EmptyStateShortcutRow key={shortcut.labelKey} {...shortcut} />
              ))}
            </div>
            <div className="hidden sm:grid sm:grid-cols-2 sm:gap-x-8">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
                {EMPTY_STATE_SHORTCUTS_LEFT.map(shortcut => (
                  <EmptyStateShortcutRow key={shortcut.labelKey} {...shortcut} />
                ))}
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
                {EMPTY_STATE_SHORTCUTS_RIGHT.map(shortcut => (
                  <EmptyStateShortcutRow key={shortcut.labelKey} {...shortcut} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Today's tasks — secondary card under the hero. Hidden until the
            task index is loaded (todaysTasks === null) so we don't render
            an empty stub on first paint. The card itself handles the
            "no tasks today" state with a quick-add CTA. */}
        {todaysTasks !== undefined && (
          <TodayTasksCard
            result={todaysTasks ?? null}
            onToggleTaskComplete={onToggleTaskComplete}
            onOpenTask={onOpenTask}
            onCreateTask={onCreateTask}
            onOpenTasksView={onOpenTasksView}
          />
        )}

        {/* Recent notes — three most-recent cards as a quick re-entry
            shelf. Skipped when the vault is empty so nothing competes
            with the "Create your first note" CTA. */}
        {notes.length > 0 && (
          <div className="relative w-full max-w-2xl mt-10">
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted mb-3 text-center font-medium">
              {tRecent('heading')}
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {notes.slice(0, 3).map(note => (
                <button
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className="group text-left rounded-lg border border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--panel-2)] hover:border-[var(--border-strong)] transition-colors px-3.5 py-3 flex flex-col gap-1.5 min-w-0 w-full sm:w-[calc((100%-1.5rem)/3)]"
                >
                  <div className="text-sm text-text font-medium truncate group-hover:text-[var(--accent)] transition-colors">
                    {note.title || tCommon('untitled')}
                  </div>
                  <div className="text-[11px] text-muted">
                    {formatEmptyStateDate(note.updatedAt, locale, {
                      today: tPage('today'),
                      yesterday: tPage('yesterday'),
                      daysAgo: (n) => tPage('daysAgo', { n }),
                    })}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </>
  );
}

const COMPLETED_TASK_STATUSES = new Set(['done', 'completed']);
const MAX_TODAY_ROWS = 5;

const STATUS_CHIP: Record<string, { tone: ChipTone; key: string }> = {
  'open':        { tone: 'neutral', key: 'statusOpen' },
  'in-progress': { tone: 'accent',  key: 'statusInProgress' },
  'done':        { tone: 'low',     key: 'statusDone' },
  'completed':   { tone: 'low',     key: 'statusDone' },
  'cancelled':   { tone: 'neutral', key: 'statusCancelled' },
};

/**
 * Secondary card under the hero: top-N open tasks sorted by urgency, with
 * inline checkbox toggle and a "view all" affordance into the full tasks
 * page. When there's nothing open, the card collapses to a quick-add CTA so
 * the entry point doesn't disappear.
 */
function TodayTasksCard({
  result, onToggleTaskComplete, onOpenTask, onCreateTask, onOpenTasksView,
}: {
  result: QueryResult | null;
  onToggleTaskComplete?: (path: string, currentlyDone: boolean) => Promise<void> | void;
  onOpenTask?: (path: string) => void;
  onCreateTask?: () => void;
  onOpenTasksView?: () => void;
}) {
  const tTasks = useTranslations('tasks');
  const items = result?.items ?? [];
  const visible = items.slice(0, MAX_TODAY_ROWS);
  const remaining = Math.max(0, items.length - MAX_TODAY_ROWS);

  return (
    <div className="relative w-full max-w-lg mt-10">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.15em] text-muted font-medium">
          {tTasks('viewHeading')}
        </span>
        {items.length > 0 && onOpenTasksView && (
          <button
            type="button"
            onClick={onOpenTasksView}
            className="text-[11px] text-muted hover:text-text transition-colors"
          >
            {tTasks('totalCount', { count: items.length })} →
          </button>
        )}
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] divide-y divide-[var(--border)] overflow-hidden">
        {visible.length === 0 ? (
          <div className="px-4 py-5 text-center text-xs text-muted">
            <div>{tTasks('emptyVault')}</div>
            {onCreateTask && (
              <button
                type="button"
                onClick={onCreateTask}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--panel-2)] text-text text-[11px] hover:bg-[var(--border)] transition-colors"
              >
                <span className="leading-none">+</span> {tTasks('createTitle')}
              </button>
            )}
          </div>
        ) : (
          visible.map(item => {
            const done = COMPLETED_TASK_STATUSES.has(item.task.status);
            const overdue = item.computed.isOverdue;
            const statusChip = STATUS_CHIP[item.task.status];
            return (
              <div
                key={item.path}
                className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--panel-2)]/60 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => onToggleTaskComplete?.(item.path, done)}
                  aria-label={done ? tTasks('uncomplete') : tTasks('complete')}
                  className="cursor-pointer shrink-0"
                />
                <button
                  type="button"
                  onClick={() => onOpenTask?.(item.path)}
                  className="flex-1 min-w-0 text-left text-sm text-text truncate hover:text-[var(--accent)] transition-colors"
                >
                  {item.task.title}
                </button>
                {item.task.status && (
                  <span className="shrink-0">
                    <Chip variant={statusChip?.tone ?? 'neutral'}>
                      {statusChip ? tTasks(statusChip.key) : item.task.status}
                    </Chip>
                  </span>
                )}
                {overdue ? (
                  <span className="shrink-0 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    {tTasks('overdue')}
                  </span>
                ) : item.task.due ? (
                  <span className="shrink-0 text-[10px] text-muted tabular-nums">
                    {item.task.due.slice(0, 10)}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {visible.length > 0 && (onCreateTask || remaining > 0) && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
          {onCreateTask ? (
            <button
              type="button"
              onClick={onCreateTask}
              className="inline-flex items-center gap-1 hover:text-text transition-colors"
            >
              <span className="leading-none">+</span> {tTasks('createTitle')}
            </button>
          ) : <span />}
        </div>
      )}
    </div>
  );
}
