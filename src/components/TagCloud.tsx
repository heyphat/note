'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TagCount } from '@/lib/search/types';

interface Props {
  tags: TagCount[];
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
  /** Hide this whole section when the vault has no tags yet. Defaults to true. */
  hideWhenEmpty?: boolean;
  /** Cap the visible chips when the section is collapsed-to-N. Defaults to 24. */
  limit?: number;
  /** Lowercased tags the user has asked to hide from the cloud. */
  hiddenTags: Set<string>;
  /** Called when the user clicks × on a chip. Parent persists. */
  onHideTag: (tag: string) => void;
  /** Called from the "hidden" footer when the user restores a chip. */
  onUnhideTag: (tag: string) => void;
}

export default function TagCloud({
  tags,
  activeTag,
  onSelectTag,
  hideWhenEmpty = true,
  limit = 24,
  hiddenTags,
  onHideTag,
  onUnhideTag,
}: Props) {
  const t = useTranslations('tagCloud');
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  // Split the incoming list — visible chips vs. things the user has hidden.
  // Keep order from the source (already sorted by count desc).
  const [visibleTags, hiddenList] = useMemo(() => {
    const visible: TagCount[] = [];
    const hidden: TagCount[] = [];
    for (const t of tags) {
      (hiddenTags.has(t.tag) ? hidden : visible).push(t);
    }
    return [visible, hidden] as const;
  }, [tags, hiddenTags]);

  if (hideWhenEmpty && !visibleTags.length && !hiddenList.length) return null;

  const visible = expanded
    ? (showAll ? visibleTags : visibleTags.slice(0, limit))
    : [];
  const overflow = visibleTags.length - limit;

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
        <span className="ml-auto text-muted/70">{visibleTags.length}</span>
      </button>
      {expanded && activeTag && (
        <button
          onClick={() => onSelectTag(null)}
          className="w-full text-left text-[10px] text-accent hover:text-text transition-colors px-1 py-1 flex items-center gap-1"
          title={t('clearTagFilter')}
        >
          <span>{t('filteringBy')}</span>
          <span className="font-medium">#{activeTag}</span>
          <span className="ml-auto opacity-60">{t('clear')} ✕</span>
        </button>
      )}
      {expanded && (
        <div className="flex flex-wrap gap-1 px-1 pt-1 pb-2">
          {!visibleTags.length && !hiddenList.length && (
            <span className="text-[11px] text-muted px-1 py-0.5">{t('empty')}</span>
          )}
          {visible.map(({ tag, count }) => {
            const isActive = tag === activeTag;
            return (
              <span
                key={tag}
                className={`group relative inline-flex items-center text-[11px] rounded-full border transition-colors
                  ${isActive
                    ? 'bg-accent/20 border-accent/50 text-text'
                    : 'border-[var(--border)] text-muted hover:text-text hover:bg-[var(--panel-2)]'}`}
              >
                <button
                  onClick={() => onSelectTag(isActive ? null : tag)}
                  className="pl-2 pr-1 py-0.5"
                >
                  #{tag}
                  <span className="ml-1 opacity-60 tabular-nums">{count}</span>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onHideTag(tag); }}
                  title={t('hideTagTitle', { tag })}
                  aria-label={t('hideTagAria', { tag })}
                  className="pr-1.5 pl-0.5 py-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                >
                  ×
                </button>
              </span>
            );
          })}
          {!showAll && overflow > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="text-[11px] px-2 py-0.5 rounded-full text-muted hover:text-text transition-colors"
            >
              {t('moreOverflow', { count: overflow })}
            </button>
          )}
        </div>
      )}
      {expanded && hiddenList.length > 0 && (
        <div className="px-1 pb-2">
          <button
            onClick={() => setShowHidden(v => !v)}
            className="w-full text-left text-[10px] text-muted hover:text-text transition-colors py-0.5"
          >
            {showHidden ? t('hideHidden', { count: hiddenList.length }) : t('showHidden', { count: hiddenList.length })}
          </button>
          {showHidden && (
            <div className="flex flex-wrap gap-1 pt-1">
              {hiddenList.map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => onUnhideTag(tag)}
                  title={t('restoreTag', { tag })}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-[var(--border)]
                    text-muted/70 hover:text-text hover:border-solid transition-colors"
                >
                  #{tag}
                  <span className="ml-1 opacity-60 tabular-nums">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
