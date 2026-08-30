/**
 * Cross-tab sync for the pomodoro feature.
 *
 * A dedicated BroadcastChannel (separate from `notes:tab-sync`, which is
 * scoped to note-data events). Each tab writes the session to localStorage
 * and posts a message so every other tab can re-read and re-render.
 */
export type PomodoroSyncMessage =
  | { type: 'session-changed' }
  | { type: 'session-completed'; at: number };

const CHANNEL_NAME = 'notes:pomodoro';

export interface PomodoroSync {
  post: (msg: PomodoroSyncMessage) => void;
  close: () => void;
}

export function createPomodoroSync(onMessage: (msg: PomodoroSyncMessage) => void): PomodoroSync {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return { post: () => {}, close: () => {} };
  }
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.onmessage = (e) => onMessage(e.data as PomodoroSyncMessage);
  return {
    post: (msg) => ch.postMessage(msg),
    close: () => ch.close(),
  };
}
