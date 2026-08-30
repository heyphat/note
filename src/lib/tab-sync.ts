/**
 * Cross-tab sync for the notes app.
 *
 * A BroadcastChannel under a fixed origin-scoped name. Each tab's channel
 * receives messages from every *other* tab on the same origin (self-posted
 * messages are not echoed back by the browser, which is exactly what we want).
 *
 * Messages intentionally kept coarse: either "a specific note's content was
 * rewritten" or "the note list changed somehow". Fine-grained diffing would
 * double the surface area for little gain — refreshing the list is cheap.
 */
export type SyncMessage =
  // `previousId` is set when the save also renamed the note's on-disk path
  // (lazy uuid→title-filename migration, manual title edit, "use template"
  // applying a `{{date}}`-derived title). Receivers use it to recognise the
  // broadcast as "about my active note" even though their `activeId` still
  // points at the pre-rename path, and to apply the same id-remap cascade
  // locally so the URL bar / locked / pinned state catches up.
  | { type: 'note-saved'; id: string; previousId?: string; vaultId: string }
  | { type: 'notes-changed'; vaultId: string }
  // Template body or name changed. Receivers refresh the templates list,
  // and tabs viewing the same template silently reload its body + title.
  // Templates have stable ids across rename, so no `previousId` is needed.
  | { type: 'template-saved'; id: string; vaultId: string }
  // Template list changed (create / delete). Receivers refresh the list.
  | { type: 'templates-changed'; vaultId: string };

const CHANNEL_NAME = 'notes:tab-sync';

export interface TabSync {
  post: (msg: SyncMessage) => void;
  close: () => void;
}

export function createTabSync(onMessage: (msg: SyncMessage) => void): TabSync {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return { post: () => {}, close: () => {} };
  }
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.onmessage = (e) => onMessage(e.data as SyncMessage);
  return {
    post: (msg) => ch.postMessage(msg),
    close: () => ch.close(),
  };
}
