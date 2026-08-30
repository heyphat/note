'use client';

// Modal that appears when an autosave fails because the on-disk file is
// missing — the typical cause is the case-insensitive-FS rename data-loss
// bug fixed in safeRenameFile, but the same UI is useful for any
// out-of-band file deletion (Finder, Time Machine, sync tools).
//
// Two recovery paths are offered:
//   1. "Recover with these edits" — saves the editor's in-memory body to a
//      fresh file at the active note's path. This is the primary path
//      because what the user almost always wants is to preserve their
//      latest edits, not roll back to an older snapshot.
//   2. "Restore from a history snapshot" — lists snapshots fetched via
//      `store.listHistoryByUuid` (UUID-keyed because the live file is
//      gone), lets the user pick one, and restores it.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import type { NoteStore } from '@/lib/storage';

interface Props {
  store: NoteStore;
  /** Active note id (path). Used as the recovery destination. */
  noteId: string;
  /** Frontmatter UUID of the active note. Used for UUID-keyed history
   *  reads since the live file is missing. */
  noteUuid: string | null;
  /** Current title (typically `editingTitle` from the toolbar). */
  noteTitle: string;
  /** In-memory editor body to recover with. */
  body: string;
  /** Existing createdAt, when known, so the recovered file preserves it. */
  createdAt?: string;
  /** Recover with the in-memory body. Parent persists + clears state. */
  onRecover: (body: string) => Promise<void>;
  /** Restore from a history snapshot's raw frontmatter+body content. */
  onRestoreSnapshot: (snapshotRaw: string) => Promise<void>;
  onClose: () => void;
}

function parseTs(ts: string): Date {
  return new Date(ts.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})/, '$1:$2:$3'));
}

function fmtTs(ts: string, locale: string): string {
  return parseTs(ts).toLocaleString(locale, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function RecoveryDialog({
  store, noteId, noteUuid, noteTitle, body, createdAt,
  onRecover, onRestoreSnapshot, onClose,
}: Props) {
  void noteId;
  void createdAt;
  const t = useTranslations('recovery');
  const locale = useLocale();
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<'recover' | 'snapshot' | null>(null);
  const [busyTs, setBusyTs] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!noteUuid) {
      setSnapshotsLoading(false);
      return () => { cancelled = true; };
    }
    setSnapshotsLoading(true);
    store.listHistoryByUuid(noteUuid)
      .then(list => { if (!cancelled) setSnapshots(list); })
      .catch(() => { if (!cancelled) setSnapshots([]); })
      .finally(() => { if (!cancelled) setSnapshotsLoading(false); });
    return () => { cancelled = true; };
  }, [store, noteUuid]);

  const handleRecover = useCallback(async () => {
    setBusyKind('recover');
    try { await onRecover(body); }
    finally { setBusyKind(null); }
  }, [body, onRecover]);

  const handleRestoreSnapshot = useCallback(async (ts: string) => {
    if (!noteUuid) return;
    setBusyKind('snapshot');
    setBusyTs(ts);
    try {
      const raw = await store.getHistoryVersionByUuid(noteUuid, ts);
      if (!raw) return;
      await onRestoreSnapshot(raw);
    } finally {
      setBusyKind(null);
      setBusyTs(null);
    }
  }, [noteUuid, onRestoreSnapshot, store]);

  // Esc to close (unless busy mid-operation).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyKind) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busyKind, onClose]);

  // Body preview is truncated for readability — full content is what
  // actually gets saved.
  const preview = useMemo(() => {
    const trimmed = body.length > 800 ? `${body.slice(0, 800)}\n…` : body;
    return trimmed || '(empty)';
  }, [body]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={busyKind ? undefined : onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-dialog-title"
        className="relative bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl
          w-[640px] max-w-[96vw] max-h-[85vh] flex flex-col"
      >
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div className="min-w-0">
            <div id="recovery-dialog-title" className="text-sm font-semibold text-text truncate">
              {t('title')}
            </div>
            <div className="text-[11px] text-muted truncate">{noteTitle}</div>
          </div>
          <button onClick={onClose} disabled={!!busyKind}
            aria-label={t('cancel')}
            className="text-muted hover:text-text text-lg leading-none disabled:opacity-50">&times;</button>
        </div>

        <div className="px-4 py-3 overflow-y-auto flex-1">
          <p className="text-xs text-muted mb-3">{t('subtitle')}</p>

          <div className="text-[11px] uppercase tracking-wide text-muted mb-1">
            {t('previewLabel')}
          </div>
          <pre className="text-xs bg-[var(--bg)] border border-[var(--border)] rounded p-2 mb-4
            max-h-[180px] overflow-auto whitespace-pre-wrap font-mono">
            {preview}
          </pre>

          {noteUuid && (
            <>
              <div className="text-[11px] uppercase tracking-wide text-muted mb-1">
                {t('snapshotsLabel')}
              </div>
              {snapshotsLoading ? (
                <div className="text-xs text-muted py-2">{t('snapshotsLoading')}</div>
              ) : snapshots.length === 0 ? (
                <div className="text-xs text-muted py-2">{t('snapshotsEmpty')}</div>
              ) : (
                <ul className="border border-[var(--border)] rounded divide-y divide-[var(--border)]
                  max-h-[200px] overflow-auto">
                  {snapshots.map(ts => (
                    <li key={ts} className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <span className="font-mono text-muted truncate">{fmtTs(ts, locale)}</span>
                      <button
                        type="button"
                        onClick={() => handleRestoreSnapshot(ts)}
                        disabled={!!busyKind}
                        className="text-accent hover:underline disabled:opacity-50"
                      >
                        {busyKind === 'snapshot' && busyTs === ts ? t('recovering') : t('snapshotRestore')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={!!busyKind}
            className="px-3 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleRecover}
            disabled={!!busyKind}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:opacity-90 disabled:opacity-50"
          >
            {busyKind === 'recover' ? t('recovering') : t('recoverAction')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
