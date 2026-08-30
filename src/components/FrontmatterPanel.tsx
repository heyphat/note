'use client';

// Properties popover. A toolbar icon button (sliders icon) that opens a
// floating panel containing the YAML frontmatter editor for the active
// document. Designed to work for every content type that carries
// frontmatter — notes, templates, task files, skills — by accepting an
// explicit list of `FrontmatterField` descriptors.
//
// Field model:
//   - `text`     — single-line input
//   - `textarea` — multi-line input (auto-grows up to a cap)
//   - `tags`     — comma-separated input (kept flat for v1)
//   - `select`   — dropdown with a closed enum
//   - `date`     — YYYY-MM-DD date input
//
// Save semantics: each field carries its own `onChange`. The parent decides
// whether to debounce, save immediately, or batch — the panel only emits
// edits. This keeps the panel simple and gives each consumer the room to
// match their existing autosave cadence.

import { useEffect, useRef, useState } from 'react';
import Tooltip from './Tooltip';

export type FrontmatterFieldType = 'text' | 'textarea' | 'tags' | 'select' | 'date';

interface FieldBase {
  /** Stable key. Identifies the field for React lists + accessibility. */
  key: string;
  /** Visible label, e.g. "description". */
  label: string;
  /** Read-only fields are still rendered (so the value is visible) but
   *  uneditable. Useful for things like `id` or the canonical filename. */
  readonly?: boolean;
  /** One-line hint shown beneath the input. */
  help?: string;
  /** When true, an empty value flags the field — the trigger button gets a
   *  red dot badge and the field itself shows a "Required" inline hint. The
   *  panel only treats whitespace as empty (trims before checking). */
  required?: boolean;
}

export interface TextField extends FieldBase {
  type: 'text';
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}

export interface TextareaField extends FieldBase {
  type: 'textarea';
  value: string;
  placeholder?: string;
  /** Min visible rows. The input auto-grows; this just sets the floor. */
  minRows?: number;
  onChange: (next: string) => void;
}

export interface TagsField extends FieldBase {
  type: 'tags';
  /** Display value (comma-separated). Parent owns the canonical array. */
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}

export interface SelectField extends FieldBase {
  type: 'select';
  value: string;
  options: { label: string; value: string }[];
  onChange: (next: string) => void;
}

export interface DateField extends FieldBase {
  type: 'date';
  /** YYYY-MM-DD. Empty string = unset. */
  value: string;
  onChange: (next: string) => void;
}

export type FrontmatterField = TextField | TextareaField | TagsField | SelectField | DateField;

interface FrontmatterPanelProps {
  /** Visible header label on the popover. Default: "Properties". */
  title?: string;
  /** Tooltip on the trigger button. Default: "Edit properties". */
  triggerLabel?: string;
  /** Field descriptors, rendered top-to-bottom. Empty array hides the
   *  trigger entirely. */
  fields: FrontmatterField[];
}

export default function FrontmatterPanel({
  title = 'Properties',
  triggerLabel = 'Edit properties',
  fields,
}: FrontmatterPanelProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + Escape dismiss. Mirrors the EditorSettings popover so
  // the two trigger buttons in the same toolbar feel consistent.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (fields.length === 0) return null;

  // Surface any required-but-empty fields on the trigger button itself —
  // users may forget to fill a description on a freshly imported skill, and
  // the model silently degrades when the description is empty. The dot
  // surfaces this without us nagging via a modal.
  const missingFields = fields.filter(isMissingRequired);
  const hasMissing = missingFields.length > 0;
  const buttonTooltip = hasMissing
    ? `${triggerLabel} — ${missingFields.length} required field${missingFields.length === 1 ? '' : 's'} missing`
    : triggerLabel;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={buttonTooltip}
        aria-expanded={open}
        className={`relative group shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors
          ${open ? 'text-accent bg-[var(--panel-2)]' : 'text-muted hover:text-text hover:bg-[var(--panel-2)]'}`}
      >
        {/* Sliders icon — reads as "settings for this document" without
            colliding visually with the gear icon used by global Editor
            settings further along the toolbar. */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="14" y2="6" />
          <line x1="18" y1="6" x2="20" y2="6" />
          <circle cx="16" cy="6" r="2" />
          <line x1="4" y1="12" x2="8" y2="12" />
          <line x1="12" y1="12" x2="20" y2="12" />
          <circle cx="10" cy="12" r="2" />
          <line x1="4" y1="18" x2="14" y2="18" />
          <line x1="18" y1="18" x2="20" y2="18" />
          <circle cx="16" cy="18" r="2" />
        </svg>
        {hasMissing && (
          <span
            className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[var(--panel)]"
            aria-hidden="true"
          />
        )}
        {!open && <Tooltip label={buttonTooltip} align="end" />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label={title}
            className="w-[560px] max-w-[92vw] max-h-[88vh] flex flex-col bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="text-muted"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <h3 className="text-sm font-semibold text-text">{title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close properties"
                className="text-muted hover:text-text p-1 rounded transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
              {fields.map(field => (
                <FieldBlock key={field.key} field={field} />
              ))}
            </div>
            <div className="flex items-center justify-end px-5 py-3 border-t border-[var(--border)]">
              <span className="text-[11px] text-muted/70 mr-auto">Changes save automatically.</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-[var(--on-accent)] rounded hover:bg-[var(--accent-hover)] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldBlock({ field }: { field: FrontmatterField }) {
  const missing = isMissingRequired(field);
  return (
    <div className="space-y-1">
      <label
        htmlFor={`fm-${field.key}`}
        className={`flex items-center text-[11px] font-medium tracking-wide leading-none
          ${missing ? 'text-red-500' : 'text-muted'}`}
      >
        {field.label}
        {field.required && (
          <span
            className={`ml-0.5 inline-flex items-center leading-none ${missing ? 'text-red-500' : 'text-muted/60'}`}
            aria-hidden="true"
          >
            *
          </span>
        )}
        {missing && (
          <span className="ml-2 text-[10px] font-normal text-red-500/90">
            Required
          </span>
        )}
      </label>
      <FieldInput field={field} missing={missing} />
      {field.help && (
        <div className="text-[10px] text-muted/70 leading-snug">{field.help}</div>
      )}
    </div>
  );
}

/** Treat whitespace-only values as empty so a stray space doesn't bypass the
 *  required check. Read-only fields are never flagged — the user can't act on
 *  them. */
function isMissingRequired(field: FrontmatterField): boolean {
  if (!field.required || field.readonly) return false;
  const v = typeof field.value === 'string' ? field.value : '';
  return v.trim().length === 0;
}

const INPUT_BASE = 'w-full bg-[var(--panel-2)] text-xs text-text border rounded px-2.5 py-1.5 outline-none placeholder:text-muted/60 transition-colors disabled:opacity-60';
const INPUT_OK = 'border-[var(--border)] focus:border-accent';
const INPUT_MISSING = 'border-red-500/60 focus:border-red-500';

function inputClass(missing: boolean, extra = ''): string {
  return `${INPUT_BASE} ${missing ? INPUT_MISSING : INPUT_OK} ${extra}`.trim();
}

function FieldInput({ field, missing }: { field: FrontmatterField; missing: boolean }) {
  const id = `fm-${field.key}`;
  if (field.type === 'text') {
    return (
      <input
        id={id}
        type="text"
        value={field.value}
        readOnly={field.readonly}
        disabled={field.readonly}
        onChange={e => field.onChange(e.target.value)}
        placeholder={field.placeholder}
        aria-invalid={missing || undefined}
        className={inputClass(missing)}
      />
    );
  }
  if (field.type === 'textarea') {
    return <AutoGrowTextarea field={field} id={id} missing={missing} />;
  }
  if (field.type === 'tags') {
    return (
      <input
        id={id}
        type="text"
        value={field.value}
        readOnly={field.readonly}
        disabled={field.readonly}
        onChange={e => field.onChange(e.target.value)}
        placeholder={field.placeholder ?? 'tag-one, tag-two'}
        aria-invalid={missing || undefined}
        className={inputClass(missing)}
      />
    );
  }
  if (field.type === 'select') {
    return (
      <select
        id={id}
        value={field.value}
        disabled={field.readonly}
        onChange={e => field.onChange(e.target.value)}
        aria-invalid={missing || undefined}
        className={inputClass(missing, 'cursor-pointer')}
      >
        {field.options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }
  if (field.type === 'date') {
    return (
      <input
        id={id}
        type="date"
        value={field.value}
        readOnly={field.readonly}
        disabled={field.readonly}
        onChange={e => field.onChange(e.target.value)}
        aria-invalid={missing || undefined}
        className={inputClass(missing)}
      />
    );
  }
  return null;
}

// Auto-growing textarea — measures its scrollHeight after each render and
// resizes inline so multi-line descriptions don't get truncated to one row.
function AutoGrowTextarea({ field, id, missing }: { field: TextareaField; id: string; missing: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [field.value]);
  return (
    <textarea
      ref={ref}
      id={id}
      value={field.value}
      readOnly={field.readonly}
      disabled={field.readonly}
      onChange={e => field.onChange(e.target.value)}
      placeholder={field.placeholder}
      rows={field.minRows ?? 3}
      aria-invalid={missing || undefined}
      className={inputClass(missing, 'resize-none leading-snug')}
    />
  );
}
