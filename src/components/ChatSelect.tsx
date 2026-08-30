'use client';

// Shared dropdown used for provider / model / thread selectors in the
// chat drawer. Button + popover pattern (no native <select>) so the
// menu styling matches everywhere and option rows can be customized —
// the thread picker uses `renderOption` to tuck a hover-revealed delete
// button into each row.

import React, {
  useEffect, useRef, useState, Fragment, type CSSProperties, type ReactNode,
} from 'react';

export interface ChatSelectOption {
  id: string;
  label: string;
}

export interface ChatSelectOptionContext {
  active: boolean;
  close: () => void;
  select: () => void;
}

interface Props {
  value: string;
  options: ChatSelectOption[];
  onChange: (id: string) => void;
  className?: string;
  buttonClassName?: string;
  title?: string;
  ariaLabel?: string;
  /** Popover alignment relative to the trigger button. */
  align?: 'left' | 'right';
  /** Whether the popover opens above the trigger ('up') or below ('down', default). */
  direction?: 'up' | 'down';
  /** Visual style of the trigger button. 'ghost' is borderless for inline footer use. */
  variant?: 'bordered' | 'ghost';
  /** Optional content rendered inside the trigger button, before the value label. */
  triggerPrefix?: ReactNode;
  placeholder?: string;
  /** Fires when the popover closes — used by the thread picker to clear its confirm-delete state. */
  onClose?: () => void;
  /** Replace the default row renderer (e.g. to add an inline delete button). */
  renderOption?: (opt: ChatSelectOption, ctx: ChatSelectOptionContext) => ReactNode;
}

const TRIGGER_BASE_BORDERED =
  'w-full inline-flex h-10 items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 text-[11px] text-text transition-colors hover:bg-[var(--panel)]';
const TRIGGER_BASE_GHOST =
  'w-full inline-flex min-h-0 items-center justify-between gap-1 rounded py-0 text-[10px] text-muted transition-colors hover:text-text';
const GHOST_TRIGGER_STYLE: CSSProperties = {
  height: 15,
  minHeight: 0,
  lineHeight: '15px',
  paddingTop: 0,
  paddingBottom: 0,
};

export default function ChatSelect({
  value, options, onChange, className, buttonClassName, title, ariaLabel, align = 'left', direction = 'down', variant = 'bordered', triggerPrefix, placeholder, onClose, renderOption,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Outside-click and Escape close the popover. Same pattern SidebarSettings
  // and the old inline thread picker used.
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

  // Fire onClose once per open→closed transition so the parent can reset
  // any popover-scoped state (the thread picker uses this to drop a
  // half-committed delete confirmation).
  useEffect(() => {
    if (wasOpenRef.current && !open) onCloseRef.current?.();
    wasOpenRef.current = open;
  }, [open]);

  const current = options.find(o => o.id === value);
  const close = () => setOpen(false);

  return (
    <div
      ref={ref}
      className={`relative ${className ?? ''}`}
      style={variant === 'ghost' ? { height: 15, lineHeight: '15px' } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        className={`${variant === 'ghost' ? TRIGGER_BASE_GHOST : TRIGGER_BASE_BORDERED} ${buttonClassName ?? ''}`}
        style={variant === 'ghost' ? GHOST_TRIGGER_STYLE : undefined}
      >
        {triggerPrefix}
        <span className="truncate flex-1 text-left">{current?.label ?? placeholder ?? ''}</span>
        <svg width="10" height="10" viewBox="0 0 20 20" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true" className="shrink-0">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className={`absolute ${direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} ${align === 'right' ? 'right-0' : 'left-0'}
            min-w-full w-[240px] max-h-[320px] overflow-y-auto bg-[var(--panel)] border border-[var(--border)]
            rounded-md z-50 py-1`}
          style={{ boxShadow: '0 12px 28px -10px rgba(0,0,0,0.35)' }}
        >
          {options.map(opt => {
            const active = opt.id === value;
            const select = () => { onChange(opt.id); close(); };
            if (renderOption) {
              return <Fragment key={opt.id}>{renderOption(opt, { active, close, select })}</Fragment>;
            }
            return (
              <div
                key={opt.id}
                role="option"
                aria-selected={active}
                onClick={select}
                className="group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-[11px] hover:bg-[var(--panel-2)]"
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
