'use client';

import { useTranslations } from 'next-intl';

export default function NotFoundScreen({
  slug,
  onDismiss,
}: {
  slug: string;
  onDismiss: () => void;
}) {
  const t = useTranslations('notFound');
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="max-w-md w-full mx-4 p-6 bg-[var(--panel)] border border-[var(--border)] rounded-lg text-center">
        <h1 className="text-lg font-semibold text-text mb-2">{t('heading')}</h1>
        <p className="text-sm text-muted mb-1">{t('body')}</p>
        <p className="text-sm font-mono text-text break-all mb-4">/{slug}</p>
        <button
          onClick={onDismiss}
          className="px-4 py-2 text-sm font-medium bg-accent text-[var(--on-accent)] rounded-md hover:opacity-90 transition-opacity"
        >
          {t('cta')}
        </button>
      </div>
    </div>
  );
}
