'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

export interface TocHeading {
  level: number;
  text: string;
  index: number;
}

interface Props {
  headings: TocHeading[];
  scrollContainer: HTMLElement | null;
}

/** Query the live ProseMirror DOM for all heading elements. */
function getLiveHeadings(container: HTMLElement): HTMLElement[] {
  const pm = container.querySelector('.ProseMirror');
  if (!pm) return [];
  return Array.from(pm.querySelectorAll('h1, h2, h3, h4, h5, h6'));
}

export default function TableOfContents({ headings, scrollContainer }: Props) {
  const t = useTranslations('toc');
  const [activeIdx, setActiveIdx] = useState(0);

  // Scroll-spy: find the heading closest to the top of the scroll container.
  const updateActive = useCallback(() => {
    if (!scrollContainer || headings.length === 0) return;
    const liveEls = getLiveHeadings(scrollContainer);
    const containerTop = scrollContainer.getBoundingClientRect().top;
    let best = 0;
    for (let i = 0; i < liveEls.length && i < headings.length; i++) {
      const top = liveEls[i].getBoundingClientRect().top - containerTop;
      if (top <= 80) best = i;
      else break;
    }
    setActiveIdx(best);
  }, [headings, scrollContainer]);

  useEffect(() => {
    if (!scrollContainer) return;
    updateActive();
    scrollContainer.addEventListener('scroll', updateActive, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', updateActive);
  }, [scrollContainer, updateActive]);

  const scrollToHeading = useCallback((idx: number) => {
    if (!scrollContainer) return;
    const liveEls = getLiveHeadings(scrollContainer);
    const el = liveEls[idx];
    if (!el) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const headingRect = el.getBoundingClientRect();
    const targetScrollTop = scrollContainer.scrollTop + (headingRect.top - containerRect.top) - 20;
    scrollContainer.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    setActiveIdx(idx);
  }, [scrollContainer]);

  if (headings.length < 2) return null;

  const minLevel = Math.min(...headings.map(h => h.level));

  return (
    <div className="hidden xl:block absolute left-4 top-4 w-44 select-none pointer-events-none"
      style={{ position: 'sticky', top: '1rem', height: 0, overflow: 'visible', zIndex: 10 }}>
      <nav className="pointer-events-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 6rem)' }}>
        <div className="text-[10px] uppercase tracking-wide text-muted font-semibold mb-2 sticky top-0 bg-[var(--bg)] pb-1">
          {t('heading')}
        </div>
        <ul className="space-y-0.5">
          {headings.map((h, i) => {
            const indent = (h.level - minLevel) * 10;
            const isActive = i === activeIdx;
            return (
              <li key={i} style={{ paddingLeft: indent }}>
                <button
                  onClick={() => scrollToHeading(i)}
                  className={`text-left text-[11px] leading-snug py-0.5 truncate block max-w-full transition-colors
                    ${isActive
                      ? 'text-accent font-medium'
                      : 'text-muted hover:text-text'}`}
                  title={h.text}>
                  {h.text}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
