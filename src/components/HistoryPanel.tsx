'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import HistoryDiffViewer from '@/components/HistoryDiffViewer';
import type { NoteStore } from '@/lib/storage';
import { createHistoryDiff, getVisibleHistoryBody } from '@/lib/history-diff';

const MilkdownEditor = dynamic(() => import('@/components/MilkdownEditor'), {
  ssr: false,
  loading: () => (
    <div className="text-xs text-muted p-4">Loading preview…</div>
  ),
});

interface Props {
  store: NoteStore;
  noteId: string;
  /** Bumped by the parent after writes, so the list reloads. */
  reloadToken: number;
  /** Restore an older version by rewriting it as the current body. */
  onRestore: (content: string) => Promise<void>;
  onClose: () => void;
}

// "2026-04-19T14-30-00.000Z" -> Date (we stored with colons replaced by dashes)
function parseTs(ts: string): Date {
  return new Date(ts.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})/, '$1:$2:$3'));
}

function fmtTs(ts: string, locale: string): string {
  const d = parseTs(ts);
  return d.toLocaleString(locale, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const INITIAL_VERSION_VALUE = '__initial__';
const CURRENT_VERSION_VALUE = '__current__';

function isCurrentVersion(value: string | null): value is typeof CURRENT_VERSION_VALUE {
  return value === CURRENT_VERSION_VALUE;
}

function versionOptionLabel(value: string, locale: string, tCurrent: string): string {
  if (isCurrentVersion(value)) return tCurrent;
  return `${fmtTs(value, locale)} · ${value}`;
}

function versionTitle(value: string, locale: string, tCurrent: string): string {
  return isCurrentVersion(value) ? tCurrent : fmtTs(value, locale);
}

function versionDetail(value: string, tLive: string): string {
  return isCurrentVersion(value) ? tLive : value;
}

function versionLabel(value: string | null, tInitial: string, tCurrent: string): string {
  if (value == null) return tInitial;
  return isCurrentVersion(value) ? tCurrent : value;
}

type PreviewTab = 'diff' | 'snapshot';

interface PreviewState {
  compareTs: string;
  baseTs: string | null;
  versions: Record<string, string>;
}

export default function HistoryPanel({ store, noteId, reloadToken, onRestore, onClose }: Props) {
  const t = useTranslations('history');
  const locale = useLocale();
  const tInitial = t('initialVersion');
  const tCurrent = t('currentVersion');
  const tLive = t('liveNoteState');
  const [entries, setEntries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [activeTab, setActiveTab] = useState<PreviewTab>('diff');
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEntries(await store.listHistory(noteId)); }
    catch { setEntries([]); }
    finally { setLoading(false); }
  }, [store, noteId]);

  useEffect(() => { load(); }, [load, reloadToken]);

  const loadVersion = useCallback(async (version: string | null): Promise<string | null> => {
    if (version == null) return '';
    if (isCurrentVersion(version)) {
      const note = await store.get(noteId);
      return note?.text ?? null;
    }
    return store.getHistoryVersion(noteId, version);
  }, [noteId, store]);

  const openPreview = useCallback(async (ts: string) => {
    const index = entries.indexOf(ts);
    if (index === -1) return;

    const baseTs = index < entries.length - 1 ? entries[index + 1] : null;
    const [raw, baseRaw, currentRaw] = await Promise.all([
      loadVersion(ts),
      loadVersion(baseTs),
      loadVersion(CURRENT_VERSION_VALUE),
    ]);
    if (raw == null) return;

    setActiveTab('diff');
    setPreview({
      compareTs: ts,
      baseTs,
      versions: {
        ...(currentRaw != null ? { [CURRENT_VERSION_VALUE]: currentRaw } : {}),
        [ts]: raw,
        ...(baseTs && baseRaw != null ? { [baseTs]: baseRaw } : {}),
      },
    });
  }, [entries, loadVersion]);

  const setCompareSnapshot = useCallback(async (ts: string) => {
    const raw = await loadVersion(ts);
    if (raw == null) return;

    setPreview(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        compareTs: ts,
        versions: {
          ...prev.versions,
          [ts]: raw,
        },
      };
    });
  }, [loadVersion]);

  const setBaseSnapshot = useCallback(async (ts: string | null) => {
    if (ts == null) {
      setPreview(prev => prev ? { ...prev, baseTs: null } : prev);
      return;
    }

    const raw = await loadVersion(ts);
    if (raw == null) return;

    setPreview(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        baseTs: ts,
        versions: {
          ...prev.versions,
          [ts]: raw,
        },
      };
    });
  }, [loadVersion]);

  const compareRaw = useMemo(() => {
    if (!preview) return '';
    return preview.versions[preview.compareTs] ?? '';
  }, [preview]);

  const baseRaw = useMemo(() => {
    if (!preview || preview.baseTs == null) return '';
    return preview.versions[preview.baseTs] ?? '';
  }, [preview]);

  const previewBody = useMemo(() => {
    if (!preview) return '';
    return getVisibleHistoryBody(compareRaw);
  }, [compareRaw, preview]);

  const previewDiff = useMemo(() => {
    if (!preview) return null;
    return createHistoryDiff(baseRaw, compareRaw, {
      oldLabel: versionLabel(preview.baseTs, tInitial, tCurrent),
      newLabel: versionLabel(preview.compareTs, tInitial, tCurrent),
    });
  }, [baseRaw, compareRaw, preview, tInitial, tCurrent]);

  const hasCurrentVersion = useMemo(() => {
    if (!preview) return false;
    return Object.prototype.hasOwnProperty.call(preview.versions, CURRENT_VERSION_VALUE);
  }, [preview]);

  const baseOptions = useMemo(() => {
    if (!preview) return [];
    const options = entries.filter(ts => ts !== preview.compareTs);
    return hasCurrentVersion && preview.compareTs !== CURRENT_VERSION_VALUE
      ? [CURRENT_VERSION_VALUE, ...options]
      : options;
  }, [entries, hasCurrentVersion, preview]);

  const compareOptions = useMemo(() => {
    if (!preview) return [];
    const options = entries.filter(ts => ts !== preview.baseTs);
    return hasCurrentVersion && preview.baseTs !== CURRENT_VERSION_VALUE
      ? [CURRENT_VERSION_VALUE, ...options]
      : options;
  }, [entries, hasCurrentVersion, preview]);

  const compareIsCurrent = preview?.compareTs === CURRENT_VERSION_VALUE;

  const closePreview = useCallback(() => {
    if (restoring) return;
    setPreview(null);
    setActiveTab('diff');
  }, [restoring]);

  const doRestore = useCallback(async () => {
    if (!preview) return;
    setRestoring(true);
    try {
      await onRestore(previewBody);
      setPreview(null);
      setActiveTab('diff');
    } finally {
      setRestoring(false);
    }
  }, [preview, previewBody, onRestore]);

  return (
    <>
      {/*
        This panel is mounted inside a shared right-sidebar column that owns
        the fixed/relative wrapper, width, border, and shadow. We just render
        the header + scrollable list; `flex-1 min-h-0` lets us fill whatever
        vertical space is left after BacklinksPanel's capped 40vh.
      */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text tracking-tight">{t('heading')}</h2>
          <button
            onClick={onClose}
            title={t('hideTitle')}
            aria-label={t('hideAria')}
            className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md
              text-muted hover:text-text hover:bg-[var(--panel-2)] transition-colors text-lg leading-none">
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-xs text-muted p-4">…</div>
          ) : entries.length === 0 ? (
            <div className="text-xs text-muted p-4">
              {t('emptyBody')}
            </div>
          ) : (
            <ul className="py-1">
              {entries.map(ts => (
                <li key={ts}>
                  <button
                    onClick={() => openPreview(ts)}
                    className="w-full text-left px-3 py-2 text-xs text-text border-b border-[var(--border)]
                      hover:bg-[var(--panel-2)] transition-colors">
                    <div className="tabular-nums">{fmtTs(ts, locale)}</div>
                    <div className="text-[10px] text-muted mt-0.5 font-mono truncate">{ts}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {preview && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closePreview} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-preview-title"
            className="relative bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl
              w-[960px] max-w-[96vw] max-h-[85vh] flex flex-col"
          >
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="min-w-0">
                <div id="history-preview-title" className="text-sm font-semibold text-text truncate">{versionTitle(preview.compareTs, locale, tCurrent)}</div>
                <div className={`text-[11px] text-muted truncate ${isCurrentVersion(preview.compareTs) ? '' : 'font-mono'}`}>
                  {versionDetail(preview.compareTs, tLive)}
                </div>
                <div className="mt-1 text-[11px] text-muted truncate">
                  {t('comparedTo')} <span className={isCurrentVersion(preview.baseTs) ? '' : 'font-mono'}>{versionLabel(preview.baseTs, tInitial, tCurrent)}</span>
                </div>
              </div>
              <button onClick={closePreview} disabled={restoring}
                className="text-muted hover:text-text text-lg leading-none">&times;</button>
            </div>
            <div className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-2">
              <button
                type="button"
                id="history-preview-tab-diff"
                role="tab"
                aria-selected={activeTab === 'diff'}
                aria-controls="history-preview-panel-diff"
                onClick={() => setActiveTab('diff')}
                className="px-3 py-1.5 text-xs font-medium rounded border transition-colors hover:bg-[var(--panel-2)]"
                style={activeTab === 'diff'
                  ? {
                    color: 'var(--text)',
                    borderColor: 'var(--accent)',
                    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  }
                  : {
                    color: 'var(--muted)',
                    borderColor: 'var(--border)',
                  }}
              >
                {t('tabDiff')}
              </button>
              <button
                type="button"
                id="history-preview-tab-snapshot"
                role="tab"
                aria-selected={activeTab === 'snapshot'}
                aria-controls="history-preview-panel-snapshot"
                onClick={() => setActiveTab('snapshot')}
                className="px-3 py-1.5 text-xs font-medium rounded border transition-colors hover:bg-[var(--panel-2)]"
                style={activeTab === 'snapshot'
                  ? {
                    color: 'var(--text)',
                    borderColor: 'var(--accent)',
                    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  }
                  : {
                    color: 'var(--muted)',
                    borderColor: 'var(--border)',
                  }}
              >
                {t('tabSnapshot')}
              </button>
            </div>
            {activeTab === 'diff' ? (
              <div
                id="history-preview-panel-diff"
                role="tabpanel"
                aria-labelledby="history-preview-tab-diff"
                className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--panel)]"
              >
                <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--panel)]">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted sm:flex-row sm:items-center sm:gap-3 lg:flex-1">
                      <span className="shrink-0 w-14 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                        {t('baseLabel')}
                      </span>
                      <select
                        aria-label={t('baseAria')}
                        value={preview.baseTs ?? INITIAL_VERSION_VALUE}
                        onChange={event => {
                          const nextValue = event.target.value;
                          void setBaseSnapshot(nextValue === INITIAL_VERSION_VALUE ? null : nextValue);
                        }}
                        className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs text-text outline-none focus:border-[var(--accent)]"
                      >
                        <option value={INITIAL_VERSION_VALUE}>{t('initialVersion')}</option>
                        {baseOptions.map(ts => (
                          <option key={ts} value={ts}>{versionOptionLabel(ts, locale, tCurrent)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted sm:flex-row sm:items-center sm:gap-3 lg:flex-1">
                      <span className="shrink-0 w-14 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                        {t('compareLabel')}
                      </span>
                      <select
                        aria-label={t('compareAria')}
                        value={preview.compareTs}
                        onChange={event => {
                          void setCompareSnapshot(event.target.value);
                        }}
                        className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs text-text outline-none focus:border-[var(--accent)]"
                      >
                        {compareOptions.map(ts => (
                          <option key={ts} value={ts}>{versionOptionLabel(ts, locale, tCurrent)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                {previewDiff && <HistoryDiffViewer diff={previewDiff} />}
              </div>
            ) : (
              <div
                id="history-preview-panel-snapshot"
                role="tabpanel"
                aria-labelledby="history-preview-tab-snapshot"
                className="flex-initial min-h-0 overflow-auto bg-[var(--panel)]"
              >
                {/* History previews should shrink-wrap their rendered content.
                    The preview-specific wrapper class removes the editor's
                    page-level min-heights so short snapshots don't leave a
                    blank pane above the footer. */}
                <div className="milkdown-wrapper history-preview">
                  <MilkdownEditor
                    key={`history:${noteId}:${preview.compareTs}`}
                    defaultValue={previewBody}
                    noteKey={`history:${noteId}:${preview.compareTs}`}
                    locked
                    preview
                  />
                </div>
              </div>
            )}
            <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
              <button onClick={closePreview} disabled={restoring}
                className="px-3 py-1.5 text-xs font-medium text-muted border border-[var(--border)]
                  rounded hover:bg-[var(--panel-2)] transition-colors disabled:opacity-50">
                {t('close')}
              </button>
              <button onClick={doRestore} disabled={restoring || compareIsCurrent}
                className="px-3 py-1.5 text-xs font-medium bg-accent text-[var(--on-accent)]
                  rounded hover:opacity-90 transition-opacity disabled:opacity-50">
                {compareIsCurrent ? t('alreadyCurrent') : restoring ? t('restoring') : t('restore')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
