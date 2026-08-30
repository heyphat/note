'use client';

// Cross-tab sync for the notes app.
//
// The hook owns:
//   - The BroadcastChannel subscription (via `createTabSync`)
//   - `syncPostRef` — callers use `post(msg)` to broadcast to other tabs
//   - `dirtyRef` — tracks whether the user has typed since the last save
//   - `activeIdRef` — mirrored from the `activeId` param so the subscription
//     handler (created once) can read the current value without re-subscribing
//   - `externalUpdateId` state — set when another tab saved the active note
//     WHILE local edits are unsaved, so the page can surface a conflict banner
//
// When another tab broadcasts:
//   - `onRefresh(kind)` fires for both message types (caller reloads the note
//     list / folder list / whatever else changed)
//   - For 'note-saved' messages matching the active id:
//     - If no local dirty edits → reads the fresh body off disk and calls
//       `onActiveSilentReload(fresh)` so the caller can seed the editor
//     - Otherwise → sets `externalUpdateId` so the conflict banner shows

import { useCallback, useEffect, useRef, useState } from 'react';
import { createTabSync, type SyncMessage } from '@/lib/tab-sync';
import type { NoteStore } from '@/lib/storage';

type SyncPostMessage =
  | { type: 'note-saved'; id: string; previousId?: string }
  | { type: 'notes-changed' }
  | { type: 'template-saved'; id: string }
  | { type: 'templates-changed' };

export type TabSyncHandlers = {
  /** Fired after every sync message. */
  onRefresh: (msg: SyncMessage) => void | Promise<void>;
  /**
   * Fired only when another tab saved the currently-active note AND no local
   * unsaved edits exist. Given the fresh note read off disk.
   *
   * When the save also renamed the note (path-changing rename), `previousId`
   * is the pre-rename id this tab still has in `activeId`, and `id` is the
   * new on-disk path. The host applies its id-remap cascade and seeds the
   * editor with the fresh body in one shot.
   */
  onActiveSilentReload: (fresh: {
    id: string;
    previousId?: string;
    text: string;
    title: string;
    size?: number;
    mtimeMs?: number;
  }) => void;
  /**
   * Fired when another tab saved the currently-active template AND no local
   * unsaved edits exist. Given the fresh template read off disk so the host
   * can seed editor body + title.
   */
  onActiveTemplateSilentReload: (fresh: {
    id: string;
    name: string;
    content: string;
  }) => void;
};

export type TabSyncApi = {
  /** Broadcast a message to every other tab. No-op if the channel is gone. */
  post: (msg: SyncPostMessage) => void;
  /** Flag that the editor has unsaved edits. Next external save raises banner. */
  markDirty: () => void;
  /** Flag that the editor is in sync with disk. Next external save silently reloads. */
  clearDirty: () => void;
  /** The id of the note that was externally updated while locally dirty, or null. */
  externalUpdateId: string | null;
  /** Dismiss the "updated in another tab" banner without reloading. */
  clearExternalUpdate: () => void;
  /** Raise the same conflict banner from a local save conflict. */
  flagExternalUpdate: (id: string) => void;
};

export function useTabSync(
  store: NoteStore,
  vaultId: string,
  activeId: string | null,
  activeTemplate: string | null,
  handlers: TabSyncHandlers,
): TabSyncApi {
  const [externalUpdateId, setExternalUpdateId] = useState<string | null>(null);
  const syncPostRef = useRef<((msg: SyncMessage) => void) | null>(null);
  const dirtyRef = useRef(false);
  const activeIdRef = useRef(activeId);
  const activeTemplateRef = useRef(activeTemplate);
  const vaultIdRef = useRef(vaultId);
  // Stash callbacks in a ref so we don't re-subscribe on every render just
  // because the caller passed fresh closure identities.
  const handlersRef = useRef(handlers);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { activeTemplateRef.current = activeTemplate; }, [activeTemplate]);
  useEffect(() => { vaultIdRef.current = vaultId; }, [vaultId]);
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);

  // Switching notes OR templates: clear the conflict banner (stale — it was
  // about the old item) and reset the dirty bit (the newly-mounted editor
  // seeds its own state via handleReady).
  useEffect(() => {
    setExternalUpdateId(null);
    dirtyRef.current = false;
  }, [activeId, activeTemplate]);

  useEffect(() => {
    const ch = createTabSync(async (msg) => {
      if (!msg.vaultId || msg.vaultId !== vaultIdRef.current) return;
      try { await handlersRef.current.onRefresh(msg); } catch { /* ignore */ }
      if (msg.type === 'note-saved') {
        // Match on either the new id OR the pre-rename id. Without the
        // previousId branch, a rename in another tab would never be
        // recognised here because this tab's `activeId` still holds the
        // pre-rename path.
        const previousId = msg.previousId;
        const matches = msg.id === activeIdRef.current
          || (previousId !== undefined && previousId === activeIdRef.current);
        if (!matches) return;
        if (!dirtyRef.current) {
          try {
            const fresh = await store.get(msg.id);
            if (fresh) {
              handlersRef.current.onActiveSilentReload({
                id: msg.id,
                previousId,
                text: fresh.text || '',
                title: fresh.title || '',
                size: fresh.size,
                mtimeMs: fresh.mtimeMs,
              });
            }
          } catch { /* ignore */ }
        } else {
          // Surface the conflict banner against whichever id the host already
          // knows — keeps the "Reload (discard mine)" button targeting an id
          // that's still in this tab's notes array.
          setExternalUpdateId(previousId ?? msg.id);
        }
        return;
      }
      if (msg.type === 'template-saved') {
        if (msg.id !== activeTemplateRef.current) return;
        if (dirtyRef.current) return; // local edits exist; don't clobber
        try {
          const fresh = await store.getTemplate(msg.id);
          if (fresh) {
            handlersRef.current.onActiveTemplateSilentReload({
              id: fresh.id,
              name: fresh.name,
              content: fresh.content,
            });
          }
        } catch { /* ignore */ }
        return;
      }
    });
    syncPostRef.current = ch.post;
    return () => {
      ch.close();
      syncPostRef.current = null;
    };
  }, [store]);

  const post = useCallback((msg: SyncPostMessage) => {
    const currentVaultId = vaultIdRef.current;
    if (!currentVaultId) return;
    syncPostRef.current?.({ ...msg, vaultId: currentVaultId } as SyncMessage);
  }, []);

  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);
  const clearDirty = useCallback(() => { dirtyRef.current = false; }, []);

  const clearExternalUpdate = useCallback(() => {
    setExternalUpdateId(null);
  }, []);

  const flagExternalUpdate = useCallback((id: string) => {
    setExternalUpdateId(id);
  }, []);

  return {
    post, markDirty, clearDirty, externalUpdateId, clearExternalUpdate, flagExternalUpdate,
  };
}
