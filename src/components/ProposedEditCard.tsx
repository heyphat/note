'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { PendingEdit } from '@/hooks/useChat';

interface Props {
  edit: PendingEdit;
  onApply: (toolCallId: string) => void;
  onReject: (toolCallId: string) => void;
  onDismiss: (toolCallId: string) => void;
}

export default function ProposedEditCard({ edit, onApply, onReject, onDismiss }: Props) {
  const t = useTranslations('proposedEdit');
  const { before, after, labelKey, target } = useMemo(() => describe(edit), [edit]);
  const label = t(labelKey);

  const busy = edit.status === 'pending';
  const applied = edit.status === 'applied';
  const rejected = edit.status === 'rejected';
  const errored = edit.status === 'error';

  return (
    <div className={`rounded-lg border px-3 py-2 text-[12px] space-y-2
      ${errored ? 'border-red-500/40 bg-red-500/5'
        : applied ? 'border-accent/40 bg-accent/5'
        : rejected ? 'border-[var(--border)] bg-[var(--panel-2)] opacity-60'
        : 'border-accent/50 bg-accent/[0.04]'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted">
            {applied ? t('statusApplied') : rejected ? t('statusRejected') : errored ? t('statusError') : t('statusProposed')}
          </span>
          {!busy && (
            <button
              type="button"
              onClick={() => onDismiss(edit.toolCallId)}
              aria-label={t('dismiss')}
              title={t('dismiss')}
              className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-md text-muted hover:text-text hover:bg-[var(--panel)]"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {target && (
        <div className="text-[11px] text-muted font-mono break-all">
          <span className="opacity-60 mr-1">→</span>{target}
        </div>
      )}
      {before != null && (
        <div className="rounded border border-red-500/30 bg-red-500/5 text-red-500/90 px-2 py-1 font-mono text-[11px] leading-snug whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
          <span className="opacity-60 mr-1">-</span>{truncate(before, 600, (n) => t('truncateSuffix', { count: n }))}
        </div>
      )}
      {after != null && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 text-emerald-500/90 px-2 py-1 font-mono text-[11px] leading-snug whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
          <span className="opacity-60 mr-1">+</span>{truncate(after, 600, (n) => t('truncateSuffix', { count: n }))}
        </div>
      )}

      {errored && edit.error && (
        <div className="text-[11px] text-red-500/90">{edit.error}</div>
      )}

      {busy && (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onReject(edit.toolCallId)}
            className="px-2.5 h-7 rounded-md border border-[var(--border)] text-[11px] text-text bg-[var(--panel-2)] hover:bg-[var(--panel)]"
          >
            {t('reject')}
          </button>
          <button
            type="button"
            onClick={() => onApply(edit.toolCallId)}
            className="px-2.5 h-7 rounded-md bg-accent text-white text-[11px] font-medium hover:opacity-90"
          >
            {t('apply')}
          </button>
        </div>
      )}
    </div>
  );
}

type DescribeResult = {
  before: string | null;
  after: string | null;
  labelKey: 'labelEditNote' | 'labelRewriteNote' | 'labelCreateNote' | 'labelManageTasks' | 'labelMcpCall';
  /** Where the note will land — shown above the diff for create_note. */
  target?: string;
};

function describe(edit: PendingEdit): DescribeResult {
  if (edit.toolName === 'edit_note') {
    return {
      labelKey: 'labelEditNote',
      before: edit.input.find,
      after: edit.input.replace,
    };
  }
  if (edit.toolName === 'create_note') {
    const folder = edit.input.folder?.trim();
    const target = folder
      ? `${folder.replace(/\/+$/, '')}/${edit.input.title}.md`
      : `${edit.input.title}.md`;
    return {
      labelKey: 'labelCreateNote',
      before: null,
      after: edit.input.content,
      target,
    };
  }
  if (edit.toolName === 'manage_tasks') {
    // Preview is a JSON dump of the operation. The chat hook is responsible
    // for actually applying it (separate path from text-edit application).
    return {
      labelKey: 'labelManageTasks',
      before: null,
      after: JSON.stringify(edit.input, null, 2),
    };
  }
  if (edit.toolName === 'mcp_call') {
    // Generic preview for an MCP server's tool call. We show the namespaced
    // tool name + the args the model emitted; the description from the
    // server's spec gives the user a one-line hint about what the call does.
    const args = typeof edit.input.args === 'string' || edit.input.args == null
      ? String(edit.input.args ?? '')
      : JSON.stringify(edit.input.args, null, 2);
    const desc = edit.input.description ? `${edit.input.description}\n\n` : '';
    return {
      labelKey: 'labelMcpCall',
      before: null,
      after: `${desc}${args}`,
      target: `${edit.input.server} · ${edit.input.tool}`,
    };
  }
  return {
    labelKey: 'labelRewriteNote',
    before: null,
    after: edit.input.new_content,
  };
}

function truncate(s: string, max: number, suffix: (remaining: number) => string): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…${suffix(s.length - max)}`;
}
