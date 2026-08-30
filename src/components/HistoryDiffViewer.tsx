import React, { type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { HistoryDiffLine, HistoryDiffResult } from '@/lib/history-diff';

interface Props {
  diff: HistoryDiffResult;
}

function rowStyle(kind: HistoryDiffLine['kind']): CSSProperties {
  if (kind === 'add') {
    return {
      background: 'color-mix(in srgb, var(--good) 14%, transparent)',
    };
  }

  if (kind === 'remove') {
    return {
      background: 'color-mix(in srgb, var(--bad) 12%, transparent)',
    };
  }

  if (kind === 'meta') {
    return {
      background: 'color-mix(in srgb, var(--panel-2) 80%, transparent)',
      color: 'var(--muted)',
      fontStyle: 'italic',
    };
  }

  return {};
}

function markerStyle(kind: HistoryDiffLine['kind']): CSSProperties {
  if (kind === 'add') {
    return { color: 'var(--good)' };
  }

  if (kind === 'remove') {
    return { color: 'var(--bad)' };
  }

  return { color: 'var(--muted)' };
}

export default function HistoryDiffViewer({ diff }: Props) {
  const t = useTranslations('history');
  if (!diff.hasChanges) {
    return (
      <div className="h-full flex items-center justify-center px-6 py-10 text-sm text-muted">
        {t('noChangesBody')}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[var(--panel)]">
      <div className="min-w-full text-[12px] leading-6 font-mono">
        {diff.hunks.map(hunk => (
          <section
            key={hunk.key}
            className="border-b last:border-b-0"
            style={{ borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)' }}
          >
            <div
              className="px-4 py-2 text-[11px] font-medium text-muted bg-[var(--panel-2)] border-b"
              style={{ borderColor: 'color-mix(in srgb, var(--border) 80%, transparent)' }}
            >
              {hunk.header}
            </div>
            {hunk.lines.map(line => (
              <div
                key={line.key}
                className="grid grid-cols-[4.5rem_4.5rem_1.75rem_minmax(0,1fr)] border-b last:border-b-0"
                style={{
                  ...rowStyle(line.kind),
                  borderColor: 'color-mix(in srgb, var(--border) 65%, transparent)',
                }}
              >
                <div
                  className="px-3 text-right select-none text-muted border-r"
                  style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
                >
                  {line.oldNumber ?? ''}
                </div>
                <div
                  className="px-3 text-right select-none text-muted border-r"
                  style={{ borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
                >
                  {line.newNumber ?? ''}
                </div>
                <div
                  className="px-2 text-center select-none border-r"
                  style={{
                    ...markerStyle(line.kind),
                    borderColor: 'color-mix(in srgb, var(--border) 60%, transparent)',
                  }}
                >
                  {line.marker}
                </div>
                <pre className="m-0 px-3 overflow-x-auto whitespace-pre text-text">
                  {line.text || ' '}
                </pre>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
