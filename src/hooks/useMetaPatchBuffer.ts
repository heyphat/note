'use client';

// Buffered note metadata refinements.
//
// Context: the initial `list()` walk returns filename-derived titles for
// speed on huge vaults. Real titles then stream in later as the body indexer
// reads each file. On a 70k-file vault that's one setNotes per file = minutes
// of wasted tree rebuilds.
//
// Strategy: buffer patches and flush no more than once every META_PATCH_MS.
// Exceptions: (a) a patch for the currently-active note flushes immediately
// — the user just asked to see it. (b) any caller may call flush() manually
// (used when a vault switch happens, or when index progress reaches 100%).

import { useCallback, useEffect, useRef } from 'react';
import type { NoteMeta } from '@/lib/storage';

const META_PATCH_MS = 1500;

export type MetaPatchBuffer = {
  queuePatch: (id: string, patch: Partial<NoteMeta>) => void;
  flush: () => void;
};

export function useMetaPatchBuffer(
  activeId: string | null,
  setNotes: React.Dispatch<React.SetStateAction<NoteMeta[]>>,
  vaultId: string,
): MetaPatchBuffer {
  const bufferRef = useRef<Map<string, Partial<NoteMeta>>>(new Map());
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const buf = bufferRef.current;
    if (!buf.size) return;
    bufferRef.current = new Map();
    setNotes(prev => {
      let changed = false;
      const next = prev.slice();
      for (let i = 0; i < next.length; i++) {
        const patch = buf.get(next[i].id);
        if (!patch) continue;
        next[i] = { ...next[i], ...patch };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [setNotes]);

  const queuePatch = useCallback((id: string, patch: Partial<NoteMeta>) => {
    const existing = bufferRef.current.get(id);
    bufferRef.current.set(id, existing ? { ...existing, ...patch } : patch);
    if (id === activeId) {
      flush();
      return;
    }
    if (timerRef.current != null) return;
    timerRef.current = window.setTimeout(flush, META_PATCH_MS);
  }, [activeId, flush]);

  // Flush on vault switch so patches from the previous vault can't bleed
  // into the new one's notes array.
  useEffect(() => {
    flush();
  }, [vaultId, flush]);

  // Ensure any trailing patch is applied on unmount.
  useEffect(() => () => {
    flush();
  }, [flush]);

  return { queuePatch, flush };
}
