'use client';

// Pomodoro session state + persistence.
//
// One session lives in localStorage; every tab reads from the same key and
// syncs via a dedicated BroadcastChannel (`notes:pomodoro`). Time is derived
// from wall-clock (`startedAt + accumulatedMs`), not accumulated by the tick
// interval — so reloads and hidden-tab throttling don't drift.
//
// Invariant: only explicit start()/pause()/resume()/stop() calls mutate the
// session. Navigation, reload, tab-open, note-close never touch it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createPomodoroSync } from '@/lib/pomodoro-sync';
import { playChime } from '@/lib/chime';
import { showToast } from '@/components/Toast';
import { loadSettings } from '@/components/EditorSettings';

export type PomodoroPhase = 'focus' | 'break';
export type PomodoroStatus = 'running' | 'paused';

export type PomodoroSession = {
  phase: PomodoroPhase;
  noteId: string | null;
  noteTitle: string | null;
  startedAt: number;
  accumulatedMs: number;
  durationMs: number;
  status: PomodoroStatus;
};

const STORAGE_KEY = 'notes:pomodoro-session';
const CHANGE_EVENT = 'pomodoro-change';
// Chime is suppressed if completion is discovered more than this many ms
// after it actually happened (tab was hidden / reloaded through the moment).
const STALE_COMPLETION_WINDOW_MS = 30_000;

function readSession(): PomodoroSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PomodoroSession;
  } catch {
    return null;
  }
}

function writeSession(s: PomodoroSession | null) {
  if (typeof window === 'undefined') return;
  try {
    if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore quota / private-mode errors */ }
}

function notifyLocal() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Elapsed ms within the current phase, accounting for pause. */
function elapsedOf(s: PomodoroSession, now: number): number {
  if (s.status === 'paused') return s.accumulatedMs;
  return s.accumulatedMs + Math.max(0, now - s.startedAt);
}

export function remainingMsOf(s: PomodoroSession, now: number = Date.now()): number {
  return Math.max(0, s.durationMs - elapsedOf(s, now));
}

// === Module-level actions ===
// Exposed so the keyboard-shortcut handler can drive the session without
// mounting a second hook instance. The hook below calls these and then
// re-reads storage via the `pomodoro-change` event.

function dispatchChange() {
  notifyLocal();
  // Let the cross-tab channel know too. Constructing a one-shot client
  // (closed immediately) is simpler than keeping a module-level channel
  // alive that we'd have to tear down.
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('notes:pomodoro');
      ch.postMessage({ type: 'session-changed' });
      ch.close();
    }
  } catch { /* ignore */ }
}

export function startPomodoro(phase: PomodoroPhase, noteId: string | null, noteTitle: string | null) {
  const settings = loadSettings();
  const minutes = phase === 'focus'
    ? Math.max(1, settings.pomodoroFocusMinutes || 25)
    : Math.max(1, settings.pomodoroBreakMinutes || 5);
  const next: PomodoroSession = {
    phase,
    noteId,
    noteTitle,
    startedAt: Date.now(),
    accumulatedMs: 0,
    durationMs: minutes * 60_000,
    status: 'running',
  };
  writeSession(next);
  dispatchChange();
}

export function stopPomodoro() {
  writeSession(null);
  dispatchChange();
}

/** Start a focus session if none is running; stop if one is. */
export function togglePomodoro(
  noteId: string | null,
  noteTitle: string | null,
  messages?: { stopped?: string; started?: string },
) {
  const current = readSession();
  if (current) {
    stopPomodoro();
    showToast(messages?.stopped ?? 'Focus session stopped');
  } else {
    startPomodoro('focus', noteId, noteTitle);
    showToast(messages?.started ?? 'Focus session started');
  }
}

export type UsePomodoro = {
  session: PomodoroSession | null;
  remainingMs: number;
  start: (phase: PomodoroPhase, noteId: string | null, noteTitle: string | null) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export function usePomodoro(): UsePomodoro {
  const tToast = useTranslations('toast');
  const [session, setSession] = useState<PomodoroSession | null>(() => readSession());
  const [now, setNow] = useState<number>(() => Date.now());
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  // Re-read from storage and push to local listeners.
  const syncFromStorage = useCallback(() => {
    const next = readSession();
    setSession(next);
  }, []);

  // Complete the current phase: clear it from storage, toast + chime if
  // fresh. `silent` skips the chime (used on cross-tab completion and on
  // stale restore).
  const complete = useCallback((s: PomodoroSession, opts: { silent?: boolean } = {}) => {
    writeSession(null);
    setSession(null);
    notifyLocal();

    const message = s.phase === 'focus'
      ? tToast('focusComplete')
      : tToast('breakComplete');
    if (opts.silent) {
      showToast(s.phase === 'focus'
        ? tToast('focusFinishedAway')
        : tToast('breakFinishedAway'));
    } else if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      playChime();
      showToast(message);
    } else {
      showToast(message);
    }
  }, [tToast]);

  // Start a new session. Replaces any existing session (caller confirms
  // via UI before calling). Delegates to the module-level action so the
  // keyboard-shortcut code path and the chip code path share one
  // implementation; React state catches up via the CHANGE_EVENT listener.
  const start = useCallback((phase: PomodoroPhase, noteId: string | null, noteTitle: string | null) => {
    startPomodoro(phase, noteId, noteTitle);
    syncFromStorage();
  }, [syncFromStorage]);

  const pause = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.status !== 'running') return;
    const next: PomodoroSession = {
      ...s,
      status: 'paused',
      accumulatedMs: elapsedOf(s, Date.now()),
    };
    writeSession(next);
    setSession(next);
    notifyLocal();
  }, []);

  const resume = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.status !== 'paused') return;
    const next: PomodoroSession = {
      ...s,
      status: 'running',
      startedAt: Date.now(),
    };
    writeSession(next);
    setSession(next);
    notifyLocal();
  }, []);

  const stop = useCallback(() => {
    if (!sessionRef.current) return;
    stopPomodoro();
    syncFromStorage();
  }, [syncFromStorage]);

  // Tick + completion check. Only runs while a session is live and running.
  useEffect(() => {
    if (!session || session.status !== 'running') return;
    const tick = () => {
      const s = sessionRef.current;
      if (!s) return;
      const current = Date.now();
      setNow(current);
      if (remainingMsOf(s, current) <= 0) complete(s);
    };
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [session, complete]);

  // Same-tab sync: other components in this tab dispatch CHANGE_EVENT on
  // mutation — we re-read storage to pick up their changes.
  useEffect(() => {
    const handler = () => syncFromStorage();
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, [syncFromStorage]);

  // Cross-tab sync: BroadcastChannel. Also `storage` as a belt-and-braces
  // fallback for the rare browser that lacks BroadcastChannel.
  useEffect(() => {
    const sync = createPomodoroSync(() => syncFromStorage());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) syncFromStorage();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      sync.close();
      window.removeEventListener('storage', onStorage);
    };
  }, [syncFromStorage]);

  // When the tab becomes visible, force a completion check — hidden-tab
  // throttling can hold the interval back past the actual completion time.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      const s = sessionRef.current;
      if (!s || s.status !== 'running') return;
      setNow(Date.now());
      if (remainingMsOf(s, Date.now()) <= 0) complete(s);
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [complete]);

  // Mount-time restore: if we woke up with a session whose time is already
  // up, fire a silent completion so we don't ring a stale chime.
  useEffect(() => {
    const s = sessionRef.current;
    if (!s || s.status !== 'running') return;
    const remaining = remainingMsOf(s, Date.now());
    if (remaining <= 0) {
      const overshoot = elapsedOf(s, Date.now()) - s.durationMs;
      complete(s, { silent: overshoot > STALE_COMPLETION_WINDOW_MS });
    }
    // Intentionally no dep on `session` — this is a mount-time check only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remainingMs = session ? remainingMsOf(session, now) : 0;
  return { session, remainingMs, start, pause, resume, stop };
}
