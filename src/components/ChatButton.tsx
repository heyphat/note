'use client';

import { useTranslations } from 'next-intl';

interface Props {
  open: boolean;
  onToggle: () => void;
  hidden?: boolean;
}

export default function ChatButton({ open, onToggle, hidden }: Props) {
  const t = useTranslations('chat');
  if (hidden) return null;
  const platformIsMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
  const chatShortcut = platformIsMac ? '⌘\\' : 'Ctrl+\\';
  const ariaShortcut = platformIsMac ? 'Meta+\\' : 'Control+\\';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? t('closeButton') : t('openButton')}
      aria-keyshortcuts={ariaShortcut}
      aria-expanded={open}
      className={`fixed bottom-5 right-5 z-40 inline-flex items-center justify-center
        w-12 h-12 rounded-full border border-[var(--border)] shadow-lg
        transition-colors
        ${open
          ? 'bg-accent text-white'
          : 'bg-[var(--panel)] text-text hover:bg-[var(--panel-2)]'}`}
      title={`${open ? t('closeButton') : t('openButton')} (${chatShortcut})`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
