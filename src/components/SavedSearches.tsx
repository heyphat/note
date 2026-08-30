'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SavedSearch } from '@/lib/saved-searches';

interface Props {
  items: SavedSearch[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function SavedSearches({
  items,
  activeId,
  onSelect,
  onRename,
  onDelete,
}: Props) {
  const t = useTranslations('savedSearches');
  const [expanded, setExpanded] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!items.length) return null;

  const startRename = (s: SavedSearch) => {
    setRenamingId(s.id);
    setRenameValue(s.name);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (name) onRename(renamingId, name);
    setRenamingId(null);
  };

  const requestDelete = (id: string) => {
    if (confirmDeleteId === id) {
      setConfirmDeleteId(null);
      onDelete(id);
      return;
    }
    setConfirmDeleteId(id);
    window.setTimeout(() => {
      setConfirmDeleteId(cur => (cur === id ? null : cur));
    }, 3000);
  };

  return (
    <div className="px-2 pt-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted px-1 py-1 hover:text-text transition-colors"
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10"
          className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="currentColor">
          <path d="M3 1l4 4-4 4z" />
        </svg>
        {t('heading')}
        <span className="ml-auto text-muted/70">{items.length}</span>
      </button>
      {expanded && items.map(s => {
        const isActive = s.id === activeId;
        const isRenaming = s.id === renamingId;
        const isConfirming = s.id === confirmDeleteId;
        return (
          <div
            key={s.id}
            className={`group flex items-center gap-1 px-1 py-1 rounded transition-colors
              ${isConfirming
                ? 'bg-red-500/10'
                : isActive
                  ? 'bg-[var(--panel-2)]'
                  : 'hover:bg-[var(--panel-2)]'}`}
          >
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  else if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); }
                }}
                onBlur={commitRename}
                className="flex-1 min-w-0 bg-transparent outline-none text-xs text-text border-b border-accent/60 py-0"
              />
            ) : (
              <button
                onClick={() => onSelect(isActive ? null : s.id)}
                onDoubleClick={() => startRename(s)}
                title={s.input}
                className={`flex-1 min-w-0 text-left truncate text-xs transition-colors
                  ${isActive ? 'text-accent' : 'text-muted hover:text-text'}`}
              >
                <span className="mr-1">{isActive ? '▸' : '▹'}</span>
                {s.name}
              </button>
            )}
            {!isRenaming && (
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-60">
                <button
                  onClick={e => { e.stopPropagation(); startRename(s); }}
                  title={t('rename')}
                  className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 hover:!opacity-100 text-muted hover:text-text"
                >
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 3.5a2.12 2.12 0 0 1 3 3L7 17l-4 1 1-4z" />
                  </svg>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); requestDelete(s.id); }}
                  title={isConfirming ? t('confirmDelete') : t('delete')}
                  className={`p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 hover:!opacity-100
                    ${isConfirming ? 'text-red-500 opacity-100' : 'text-muted hover:text-red-500'}`}
                >
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6h12M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 6l1 10a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-10" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
