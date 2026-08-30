'use client';

// Sidebar calendar panel. Shows a collapsible month grid with a dot on
// every day that has at least one note (matched on updatedAt, local time).
// Clicking a day sets `activeDate` which the page uses to filter the tree.
//
// Visual style mirrors TagCloud / RecentList: uppercase chevron header,
// right-aligned count, and a "Filtering by X — clear ✕" row when active.

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { NoteMeta } from '@/lib/storage';

interface Props {
  notes: NoteMeta[];
  /** YYYY-MM-DD (local) or null. */
  activeDate: string | null;
  onSelectDate: (date: string | null) => void;
}

/** YYYY-MM-DD from a Date using the user's local calendar. */
function keyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD from an ISO timestamp (interpreted in local time). Null if unparseable. */
export function localDayKey(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return keyFromDate(d);
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarStrip({ notes, activeDate, onSelectDate }: Props) {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const [expanded, setExpanded] = useState(true);
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));

  // Precompute the set of days that have at least one note — matched against
  // updatedAt so the dots follow the same notion of "active" the tree sorts by.
  const noteDays = useMemo(() => {
    const s = new Set<string>();
    for (const n of notes) {
      const k = localDayKey(n.updatedAt);
      if (k) s.add(k);
    }
    return s;
  }, [notes]);

  // 6×7 grid starting on the Sunday before the first of the month.
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const startWeekday = first.getDay();
    const out: { date: Date; key: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(cursor.year, cursor.month, 1 - startWeekday + i);
      out.push({ date: d, key: keyFromDate(d), inMonth: d.getMonth() === cursor.month });
    }
    return out;
  }, [cursor]);

  const todayKey = keyFromDate(today);
  const monthLabel = useMemo(
    () => new Date(cursor.year, cursor.month, 1).toLocaleString(locale, { month: 'long', year: 'numeric' }),
    [cursor, locale],
  );

  const stepMonth = (delta: number) => {
    setCursor(c => {
      const m = c.month + delta;
      if (m < 0) return { year: c.year - 1, month: 11 };
      if (m > 11) return { year: c.year + 1, month: 0 };
      return { year: c.year, month: m };
    });
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
          fill="currentColor"
        >
          <path d="M3 1l4 4-4 4z" />
        </svg>
        {t('heading')}
        <span className="ml-auto text-muted/70">{noteDays.size}</span>
      </button>
      {expanded && activeDate && (
        <button
          onClick={() => onSelectDate(null)}
          className="w-full text-left text-[10px] text-accent hover:text-text transition-colors px-1 py-1 flex items-center gap-1"
          title={t('clearDateFilter')}
        >
          <span>{t('filteringBy')}</span>
          <span className="font-medium">{activeDate}</span>
          <span className="ml-auto opacity-60">{t('clear')} ✕</span>
        </button>
      )}
      {expanded && (
        <>
          <div className="flex items-center gap-1 px-1 py-1">
            <button
              onClick={() => stepMonth(-1)}
              className="w-5 h-5 flex items-center justify-center text-muted hover:text-text rounded hover:bg-[var(--panel-2)] transition-colors"
              title={t('prevMonth')}
              aria-label={t('prevMonth')}
            >‹</button>
            <button
              onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
              className="flex-1 text-[10px] text-center text-text hover:text-accent transition-colors truncate"
              title={t('jumpToCurrent')}
            >
              {monthLabel}
            </button>
            <button
              onClick={() => stepMonth(1)}
              className="w-5 h-5 flex items-center justify-center text-muted hover:text-text rounded hover:bg-[var(--panel-2)] transition-colors"
              title={t('nextMonth')}
              aria-label={t('nextMonth')}
            >›</button>
          </div>
          <div className="grid grid-cols-7 gap-0 px-1 text-[9px] text-muted/70 uppercase">
            {WEEKDAY_LABELS.map((d, i) => (
              <div key={i} className="h-4 flex items-center justify-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0 px-1 pb-2">
            {cells.map(cell => {
              const has = noteDays.has(cell.key);
              const isSelected = cell.key === activeDate;
              const isToday = cell.key === todayKey;
              const base = 'relative h-6 flex items-center justify-center text-[10px] rounded transition-colors';
              const state = isSelected
                ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                : has
                  ? 'text-text hover:bg-[var(--panel-2)]'
                  : 'text-muted/40 cursor-default';
              const dim = !cell.inMonth && !isSelected ? 'opacity-50' : '';
              const ring = isToday && !isSelected ? 'ring-1 ring-[var(--accent)]/60' : '';
              return (
                <button
                  key={cell.key}
                  disabled={!has}
                  onClick={() => onSelectDate(isSelected ? null : cell.key)}
                  className={[base, state, dim, ring].filter(Boolean).join(' ')}
                  title={has ? cell.key : undefined}
                >
                  {cell.date.getDate()}
                  {has && !isSelected && (
                    <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[var(--accent)]" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
