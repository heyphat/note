'use client';

import { useTranslations } from 'next-intl';
import { DEFAULT_NEW_NOTE_FOLDER } from '@/lib/title';

export default function FolderPickerScreen({
  label,
  error,
  requestedNewNote,
  onPick,
}: {
  /** Previously-picked folder name; empty if this is the first visit. */
  label: string;
  /** Access-failure message. Set ⇒ hide the pick button. */
  error: string;
  /** True when the URL was `/new` — copy nudges the user about where it'll land. */
  requestedNewNote: boolean;
  onPick: () => void;
}) {
  const t = useTranslations('folderPicker');
  const description = error || (requestedNewNote
    ? t('descNewNote', { folder: DEFAULT_NEW_NOTE_FOLDER })
    : t('descDefault'));

  return (
    <div className="relative flex h-screen items-center justify-center px-6 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 30%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 70%)',
        }}
      />

      <div
        className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-8 py-10 flex flex-col items-center gap-6 text-center"
        style={{
          boxShadow:
            '0 1px 0 color-mix(in srgb, var(--border-strong) 50%, transparent) inset, 0 20px 40px -24px rgba(0,0,0,0.35)',
        }}
      >
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl text-text font-semibold leading-tight tracking-tight">
            {error ? t('headingError') : t('headingChoose')}
          </h1>
          <p className="text-sm text-muted leading-relaxed">{description}</p>
        </div>

        {label && !error && (
          <p className="text-xs text-muted">
            {t('previouslySelected')}{' '}
            <span className="font-mono text-text">{label}</span>
          </p>
        )}

        {!error && (
          <button
            onClick={onPick}
            className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] text-sm font-medium hover:bg-[var(--accent-hover)] transition-all duration-150 active:scale-[0.98]"
            style={{
              boxShadow:
                '0 8px 24px -10px color-mix(in srgb, var(--accent) 55%, transparent), 0 1px 0 rgba(255,255,255,0.08) inset',
            }}
          >
            {label ? t('regrant') : t('choose')}
          </button>
        )}
      </div>
    </div>
  );
}
