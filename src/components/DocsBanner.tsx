'use client';

import { useTranslations } from 'next-intl';
import { SidebarToggle } from './HeaderToggles';

export default function DocsBanner({
  onPickFolder,
  sidebarOpen,
  onToggleSidebar,
}: {
  onPickFolder: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const t = useTranslations('docsBanner');
  return (
    <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--panel-2)] flex items-center gap-3 text-xs">
      {/* When the sidebar is collapsed in docs mode, the banner hosts the
          toggle so EmptyState/EditorHeaderToolbar can suppress their own
          duplicate toggle and the row stays clean. */}
      {!sidebarOpen && <SidebarToggle open={sidebarOpen} onClick={onToggleSidebar} />}
      {/* Match the app headers: py-2 plus a 28px control makes the row line up
          with the sidebar, editor toolbar, and right dock headers. */}
      <span className="flex-1 min-w-0 truncate text-sm text-muted">{t('message')}</span>
      <button
        type="button"
        onClick={onPickFolder}
        className="shrink-0 inline-flex h-7 items-center px-3 rounded-md bg-[var(--accent)] text-[var(--on-accent)] font-medium hover:bg-[var(--accent-hover)] transition-colors text-sm"
      >
        {t('cta')}
      </button>
    </div>
  );
}
