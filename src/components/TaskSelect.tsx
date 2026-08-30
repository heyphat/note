'use client';

// Themed dropdown used by the task feature in place of native <select>.
// Same button + popover pattern as ChatSelect, but sized for inline form
// fields and toolbar filters rather than the chat drawer's fixed-height
// rows.

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

export interface TaskSelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: TaskSelectOption[];
  onChange: (value: string) => void;
  /** Override trigger sizing/layout; defaults to a toolbar-sized button. */
  className?: string;
  ariaLabel?: string;
  /** Popover alignment relative to the trigger. */
  align?: 'left' | 'right';
}

const TRIGGER_BASE =
  'inline-flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--panel-2)] text-text hover:bg-[var(--panel)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-colors';

export default function TaskSelect({ value, options, onChange, className, ariaLabel, align = 'left' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`${TRIGGER_BASE} ${className ?? 'px-2 py-1 text-sm'}`}
      >
        <span className="truncate text-left">{current?.label ?? ''}</span>
        <svg width="10" height="10" viewBox="0 0 20 20" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true" className="shrink-0">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className={`absolute top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} min-w-full max-h-[320px] overflow-y-auto bg-[var(--panel)] border border-[var(--border)] rounded-md z-50 py-1`}
          style={{ boxShadow: '0 12px 28px -10px rgba(0,0,0,0.35)' }}
        >
          {options.map(opt => {
            const active = opt.value === value;
            // Use onMouseDown so the document-level outside-click listener
            // (also bound to mousedown) doesn't race with our React click —
            // selecting fires first and immediately closes the popover.
            const select = (e: ReactMouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(opt.value);
              setOpen(false);
            };
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={active}
                onMouseDown={select}
                className="group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-sm hover:bg-[var(--panel-2)] whitespace-nowrap"
              >
                <span className={`shrink-0 w-3 text-center ${active ? 'text-accent' : 'text-transparent'}`} aria-hidden="true">✓</span>
                <span className={`flex-1 min-w-0 truncate ${active ? 'text-text' : 'text-muted group-hover:text-text'}`}>
                  {opt.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
