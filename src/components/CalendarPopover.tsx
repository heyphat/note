'use client';

// Themed calendar popover used in place of the native `<input type="date">`
// picker. Wraps `react-day-picker` so the popup actually obeys the app theme
// — the native picker only respects `color-scheme` (dark/light), nothing
// else. CSS variable overrides live in globals.css under `.rdp-app-themed`.
//
// Anchored to the trigger element passed in `anchorRef`. Portaled to
// document.body so CSS containment on ancestors (e.g. the kanban column's
// `contain: paint` / `content-visibility: auto`) doesn't clip the dropdown
// at the column edge. Positioned with fixed coordinates derived from the
// trigger's bounding rect; reposition on scroll/resize keeps it anchored
// while the user scrolls the kanban or the page resizes. Outside-click and
// Escape close the popover. Date values are kept in `YYYY-MM-DD` form on
// both sides so callers don't have to deal with timezone-fenced Date objects.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

interface Props {
  open: boolean;
  /** Selected date as `YYYY-MM-DD`. Empty string / undefined means no selection. */
  value?: string;
  onSelect: (date: string) => void;
  onClose: () => void;
  /** Element the popover positions itself relative to (used so an outside
   *  click on the trigger doesn't immediately re-close the popup). */
  anchorRef: RefObject<HTMLElement | null>;
  /** 'left' = align with anchor's left edge, 'right' = align right edge. */
  align?: 'left' | 'right';
  /** Override stacking. Default 100 sits above a typical modal; nested
   *  popovers (e.g. inside another portaled panel) should pass a higher
   *  value so the calendar renders above their host. */
  zIndex?: number;
}

export default function CalendarPopover({ open, value, onSelect, onClose, anchorRef, align = 'left', zIndex = 100 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Compute fixed-position coordinates from the trigger's rect. Runs once on
  // open and again any time an ancestor scrolls or the window resizes. The
  // RAF re-run after first commit lets right-aligned popovers measure their
  // own width (which is unknown on the first render).
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const popWidth = ref.current?.getBoundingClientRect().width ?? 0;
      const top = rect.bottom + 4;
      const left = align === 'right' ? rect.right - popWidth : rect.left;
      setPos({ top, left });
    };
    reposition();
    const raf = requestAnimationFrame(reposition);
    // capture: true catches scrolls in any ancestor (e.g. the kanban's
    // horizontal scroller, the column's vertical body) — they don't bubble.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, align, anchorRef]);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  const selected = value ? parseLocalDate(value) : undefined;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      className="rdp-app-themed fixed bg-[var(--panel)] border border-[var(--border)] rounded-md p-1.5"
      style={{
        // Render off-screen on first paint until layout effect computes the
        // real position; useLayoutEffect runs synchronously before paint, so
        // the user only ever sees the final position.
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        zIndex,
        boxShadow: '0 12px 28px -10px rgba(0,0,0,0.35)',
      }}
    >
      <DayPicker
        mode="single"
        selected={selected}
        defaultMonth={selected}
        onSelect={(date) => {
          if (date) {
            onSelect(formatLocalDate(date));
            onClose();
          }
        }}
        showOutsideDays
        weekStartsOn={1}
      />
    </div>,
    document.body,
  );
}

// Parse `YYYY-MM-DD` as a *local* calendar date. `new Date('2026-05-04')`
// would interpret it as UTC midnight, which renders as the previous day in
// negative-offset timezones — that's exactly the kind of off-by-one bug we
// don't want on a calendar picker.
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
