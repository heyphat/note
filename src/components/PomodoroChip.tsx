'use client';

// Pomodoro status chip + popover.
//
// Two render variants:
//   - `editor`: sits in the editor header next to the word count. The
//     primary UI — hidden when no note is open.
//   - `sidebar`: compact fallback in the NotesSidebar header, shown ONLY
//     while a session is live and no editor header is mounted.
//
// The component is a pure wrapper over usePomodoro(); all state lives in
// the hook. Clicking idle → starts a focus session for the active note.
// Clicking a live chip → opens a popover with pause/resume/stop.

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Tooltip from './Tooltip';
import { usePomodoro, type PomodoroSession } from '@/hooks/usePomodoro';

type Variant = 'editor' | 'sidebar';

type Props = {
  variant?: Variant;
  activeId?: string | null;
  activeTitle?: string | null;
  /** Click the session's origin-note breadcrumb to jump back. */
  onJumpToNote?: (id: string) => void;
};

function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function CoffeeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M17 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
      <path d="M6 2v3M10 2v3M14 2v3" />
    </svg>
  );
}

function progressFraction(s: PomodoroSession, remainingMs: number): number {
  if (s.durationMs <= 0) return 0;
  const done = s.durationMs - remainingMs;
  return Math.max(0, Math.min(1, done / s.durationMs));
}

export default function PomodoroChip({ variant = 'editor', activeId = null, activeTitle = null, onJumpToNote }: Props) {
  const t = useTranslations('pomodoro');
  const { session, remainingMs, start, pause, resume, stop } = usePomodoro();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + Escape to close the popover (same pattern as
  // EditorSettingsPanel).
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Sidebar variant is a fallback that only shows while a session is live.
  if (variant === 'sidebar' && !session) return null;

  // Idle + no active note + editor variant → nothing to start; hide.
  if (variant === 'editor' && !session && !activeId) return null;

  const running = session?.status === 'running';
  const paused = session?.status === 'paused';
  const isBreak = session?.phase === 'break';

  const onPrimaryClick = () => {
    if (session) {
      setOpen(v => !v);
      return;
    }
    // Idle → start focus on the currently active note.
    start('focus', activeId ?? null, activeTitle ?? null);
  };

  // === Pill styling ===
  // Matches header-toggle idiom (h-7 rounded-md) but with the content of a
  // pill. Uses the design tokens so it flips cleanly with the palette.
  const baseClass = 'relative group shrink-0 inline-flex items-center gap-1.5 h-7 px-2 rounded-md border transition-colors tabular-nums text-xs font-medium select-none';
  let toneClass: string;
  if (!session) {
    toneClass = 'text-muted border-transparent hover:text-text hover:bg-[var(--panel-2)] hover:border-[var(--border)]';
  } else if (isBreak) {
    toneClass = 'text-good border-[color-mix(in_srgb,var(--good)_40%,transparent)] bg-[color-mix(in_srgb,var(--good)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--good)_16%,transparent)]';
  } else if (paused) {
    toneClass = 'text-muted border-[var(--border)] bg-[var(--panel-2)] hover:text-text';
  } else {
    toneClass = 'text-accent border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]';
  }

  const label = !session
    ? t('labelFocus')
    : paused
      ? t('labelPaused', { time: formatMmSs(remainingMs) })
      : formatMmSs(remainingMs);

  const icon = !session
    ? <PlayIcon />
    : isBreak
      ? <CoffeeIcon />
      : paused
        ? <PauseIcon />
        : <span className={`w-[7px] h-[7px] rounded-full bg-current ${running ? 'animate-pulse' : ''}`} aria-hidden="true" />;

  const ariaLabel = !session
    ? t('startFocusAria')
    : isBreak
      ? t('breakRemainingAria', { time: formatMmSs(remainingMs) })
      : paused
        ? t('pausedRemainingAria', { time: formatMmSs(remainingMs) })
        : t('focusRemainingAria', { time: formatMmSs(remainingMs) });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onPrimaryClick}
        aria-label={ariaLabel}
        aria-live="polite"
        className={`${baseClass} ${toneClass}`}
      >
        {icon}
        <span>{label}</span>
        {!session && <Tooltip label={t('startFocusTooltip')} shortcut="⇧⌘P" align="end" />}
      </button>

      {open && session && (
        <div
          className={`absolute ${variant === 'sidebar' ? 'left-0' : 'right-0'} top-full mt-1.5 w-[240px] bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-lg z-30 p-3 space-y-2.5`}
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wide text-accent font-semibold">
              {isBreak ? t('sectionBreak') : t('sectionFocusLabel')}
            </div>
            <div className="text-[11px] text-muted tabular-nums">
              {formatMmSs(remainingMs)} / {formatMmSs(session.durationMs)}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 rounded-full bg-[var(--panel-2)] overflow-hidden">
            <div
              className={`h-full transition-[width] duration-500 ease-linear ${isBreak ? 'bg-[var(--good)]' : 'bg-[var(--accent)]'}`}
              style={{ width: `${progressFraction(session, remainingMs) * 100}%` }}
            />
          </div>

          {/* Origin note */}
          {session.noteId && session.noteTitle && (
            <button
              type="button"
              onClick={() => {
                if (session.noteId && onJumpToNote) onJumpToNote(session.noteId);
                setOpen(false);
              }}
              className="block w-full text-left text-[11px] text-muted hover:text-text transition-colors truncate"
              title={session.noteTitle}
            >
              {t('startedOn')} <span className="text-text">{session.noteTitle}</span>
            </button>
          )}
          {!session.noteId && (
            <div className="text-[11px] text-muted">{t('standalone')}</div>
          )}

          <div className="flex items-center gap-1.5 pt-0.5">
            {running && (
              <button
                type="button"
                onClick={() => { pause(); }}
                className="flex-1 text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--panel-2)] text-text hover:border-[var(--border-strong)] transition-colors"
              >
                {t('pause')}
              </button>
            )}
            {paused && (
              <button
                type="button"
                onClick={() => { resume(); }}
                className="flex-1 text-[11px] px-2 py-1 rounded border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-accent hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] transition-colors"
              >
                {t('resume')}
              </button>
            )}
            <button
              type="button"
              onClick={() => { stop(); setOpen(false); }}
              className="flex-1 text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-transparent text-muted hover:text-bad hover:border-[color-mix(in_srgb,var(--bad)_40%,transparent)] transition-colors"
            >
              {t('stop')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
