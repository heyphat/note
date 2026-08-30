'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { NoteMeta } from '@/lib/storage';

interface Props {
  recent: string[];
  notesById: Map<string, NoteMeta>;
  activeId: string | null;
  /** Live title for the active row — the editor's current `editingTitle`.
   *  Lets the sidebar follow auto-title updates during typing (before the
   *  autosave writes `notes[i].title`). */
  activeTitle?: string | null;
  onSelect: (id: string) => void;
  /** Cap the visible rows. Defaults to 5. */
  limit?: number;
}

export default function RecentList({ recent, notesById, activeId, activeTitle, onSelect, limit = 5 }: Props) {
  const t = useTranslations('recent');
  const tCommon = useTranslations('common');
  const [expanded, setExpanded] = useState(false);

  // Only show ids that still resolve to a note — a deleted note shouldn't
  // leave a dangling row, and a just-created note won't appear in recent
  // until it's been opened.
  const items = useMemo(() => {
    const out: NoteMeta[] = [];
    for (const id of recent) {
      const note = notesById.get(id);
      if (note) out.push(note);
    }
    return out;
  }, [recent, notesById]);

  if (!items.length) return null;
  const visible = expanded ? items.slice(0, limit) : [];

  return (
    <div className="px-2 pt-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted px-1 py-1 hover:text-text transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${expanded ? 'rotate-90' : ''}`} fill="currentColor">
          <path d="M3 1l4 4-4 4z" />
        </svg>
        {t('heading')}
        <span className="ml-auto text-muted/70">{items.length}</span>
      </button>
      {visible.map(note => {
        const isActive = note.id === activeId;
        const displayTitle = isActive && activeTitle ? activeTitle : note.title;
        return (
          <button
            key={note.id}
            onClick={() => onSelect(note.id)}
            className={`w-full text-left px-2 py-1 text-xs truncate rounded transition-colors
              ${isActive
                ? 'bg-[var(--panel-2)] text-text'
                : 'text-muted hover:text-text hover:bg-[var(--panel-2)]'}`}
            title={note.id}
          >
            {displayTitle || tCommon('untitled')}
          </button>
        );
      })}
    </div>
  );
}
