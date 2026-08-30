'use client';

// Small icon buttons that live in the editor header and sidebar. Split out
// of page.tsx so each one is a cleanly reviewable unit and the main file can
// focus on orchestration.

import { useTranslations } from 'next-intl';
import Tooltip from '@/components/Tooltip';

export function HistoryPanelToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  const tHistory = useTranslations('history');
  const label = open ? tHistory('hideAria') : tHistory('showAria');
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts="Shift+Meta+H"
      aria-pressed={open}
      className={`relative group shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors
        ${open ? 'text-accent bg-[var(--panel-2)]' : 'text-muted hover:text-text hover:bg-[var(--panel-2)]'}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <Tooltip label={label} shortcut="⇧⌘H" align="end" />
    </button>
  );
}

export function BacklinksToggle({ open, count, onClick }: { open: boolean; count: number; onClick: () => void }) {
  const tBacklinks = useTranslations('backlinks');
  const label = open ? tBacklinks('hideAria') : tBacklinks('showAria');
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts="Shift+Meta+B"
      aria-pressed={open}
      className={`relative group shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors
        ${open ? 'text-accent bg-[var(--panel-2)]' : 'text-muted hover:text-text hover:bg-[var(--panel-2)]'}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
        <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07L12.5 19.5" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full
          bg-accent text-[9px] leading-[14px] text-[var(--on-accent)] font-semibold text-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
      <Tooltip label={label} shortcut="⇧⌘B" align="end" />
    </button>
  );
}

export function GraphToggle({ onClick }: { onClick: () => void }) {
  const tPage = useTranslations('page');
  const label = tPage('graphView');
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts="Shift+Meta+G"
      className="relative group shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors
        text-muted hover:text-text hover:bg-[var(--panel-2)]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="6" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path d="M7 7l4 9M17 7l-4 9" />
      </svg>
      <Tooltip label={label} shortcut="⇧⌘G" align="end" />
    </button>
  );
}

export function SidebarToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  const tSidebar = useTranslations('sidebar');
  const label = open ? tSidebar('hideSidebar') : tSidebar('showSidebar');
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts="Meta+B"
      className="relative group shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md
        text-muted hover:text-text hover:bg-[var(--panel-2)] transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="9" y1="4" x2="9" y2="20" />
      </svg>
      <Tooltip label={label} shortcut="⌘B" />
    </button>
  );
}
