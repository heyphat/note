'use client';

// Compact task composer for create + edit. Replaces the prior field-grid
// modal with a chip-rich title input modeled on Todoist's quick-add: typing
// `#tag`, `!priority`, or `@note` opens an inline suggestion popover and
// commits the token as a chip on Enter/Tab. Action-row icons cover due date,
// priority, and an overflow popover for the less-common fields (scheduled,
// recurrence, contexts, status). Status defaults to `open` and is hidden
// from the primary surface — set it from the overflow when needed.

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { CreateTaskInput } from '@/lib/tasks';
import type { NoteMeta } from '@/lib/storage';
import { detectDuePhrase, type DuePhraseMatch } from '@/lib/tasks/parse-due-phrase';
import CalendarPopover from './CalendarPopover';

// Heavy editor — lazy-load so Crepe / ProseMirror only enter the bundle
// when the user actually expands the description. `compact` strips the
// slash menu, selection toolbar, link tooltip, and top bar so the editor
// fits cleanly inside the composer.
const MilkdownEditor = dynamic(() => import('./MilkdownEditor'), { ssr: false });

type Mode = 'create' | 'edit';

interface Props {
  open: boolean;
  mode: Mode;
  initial?: Partial<CreateTaskInput>;
  /** Notes available to mention as projects via `@`. */
  notes?: NoteMeta[];
  /** Existing tag values across the vault — surfaced in the `#` popover. */
  tagSuggestions?: string[];
  /** Existing context values across the vault — surfaced in the overflow popover. */
  contextSuggestions?: string[];
  onSubmit: (input: CreateTaskInput) => Promise<void>;
  onClose: () => void;
}

type TriggerChar = '#' | '!' | '@';

interface TriggerState {
  char: TriggerChar;
  /** Substring after the trigger char up to the caret. */
  query: string;
  /** Index of the trigger char in the title value. */
  triggerStart: number;
  /** Caret position when detected (one past the last query char). */
  triggerEnd: number;
}

type Suggestion =
  | { kind: 'tag'; value: string; label: string }
  | { kind: 'tag-new'; value: string; label: string }
  | { kind: 'priority'; value: string; label: string }
  | { kind: 'project'; value: string; label: string };

const PRIORITY_LEVELS: Array<{ value: string; labelKey: string; tone: PriorityTone }> = [
  { value: 'highest', labelKey: 'priorityHighest', tone: 'highest' },
  { value: 'high', labelKey: 'priorityHigh', tone: 'high' },
  { value: 'normal', labelKey: 'priorityNormal', tone: 'normal' },
  { value: 'low', labelKey: 'priorityLow', tone: 'low' },
  { value: 'lowest', labelKey: 'priorityLowest', tone: 'lowest' },
];

const STATUS_OPTIONS = [
  { value: 'open', labelKey: 'statusOpen' },
  { value: 'in-progress', labelKey: 'statusInProgress' },
  { value: 'done', labelKey: 'statusDone' },
  { value: 'cancelled', labelKey: 'statusCancelled' },
];

export default function TaskFormModal(props: Props) {
  if (!props.open) return null;
  return <TaskFormDialog {...props} />;
}

function TaskFormDialog({
  mode,
  initial,
  notes,
  tagSuggestions,
  contextSuggestions,
  onSubmit,
  onClose,
}: Props) {
  const t = useTranslations('tasks');

  const [title, setTitle] = useState(initial?.title ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [contexts, setContexts] = useState<string[]>(initial?.contexts ?? []);
  const [projects, setProjects] = useState<string[]>(initial?.projects ?? []);
  const [priority, setPriority] = useState<string>(initial?.priority ?? '');
  const [due, setDue] = useState(initial?.due ?? '');
  const [scheduled, setScheduled] = useState(initial?.scheduled ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'open');
  const initialPreset = useMemo(() => matchRecurrencePreset(initial?.recurrence), [initial?.recurrence]);
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>(initialPreset);
  const [recurrenceCustom, setRecurrenceCustom] = useState(
    initialPreset === 'custom' ? (initial?.recurrence ?? '') : ''
  );
  // Milkdown owns its own internal state and pushes the latest markdown via
  // onChange. Holding the value in a ref avoids a state round-trip per
  // keystroke. Read on submit.
  const bodyRef = useRef(initial?.body ?? '');
  // Frozen at first mount so re-renders don't push spurious value updates
  // into the editor (which would reset the caret).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialBody = useMemo(() => initial?.body ?? '', []);
  const [bodyExpanded, setBodyExpanded] = useState((initial?.body ?? '').trim().length > 0);
  const [submitting, setSubmitting] = useState(false);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const dueBtnRef = useRef<HTMLButtonElement>(null);
  const priorityBtnRef = useRef<HTMLButtonElement>(null);
  const recurrenceBtnRef = useRef<HTMLButtonElement>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);

  const [trigger, setTrigger] = useState<TriggerState | null>(null);
  const [triggerIdx, setTriggerIdx] = useState(0);
  const [duePopoverOpen, setDuePopoverOpen] = useState(false);
  const [priorityPopoverOpen, setPriorityPopoverOpen] = useState(false);
  const [recurrencePopoverOpen, setRecurrencePopoverOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  // Stable key of the date hint the user dismissed with Esc — keeps the
  // banner from re-appearing for the same match while they keep typing.
  const [dismissedDateKey, setDismissedDateKey] = useState<string | null>(null);

  // Date-phrase detection: skipped while a #/!/@ trigger is active (those
  // popovers take priority for keyboard handling).
  const dateHint = useMemo<DuePhraseMatch | null>(() => {
    if (trigger) return null;
    if (!title.trim()) return null;
    return detectDuePhrase(title);
  }, [title, trigger]);
  const dateHintKey = dateHint ? `${dateHint.start}:${dateHint.end}:${dateHint.iso}` : null;
  const showDateHint = !!dateHint && dismissedDateKey !== dateHintKey;

  useEffect(() => {
    queueMicrotask(() => titleRef.current?.focus());
  }, []);

  // Suggestions for the inline trigger popover. Shape varies per trigger
  // char; see Suggestion union.
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger) return [];
    const q = trigger.query.trim().toLowerCase();
    if (trigger.char === '#') {
      const all = (tagSuggestions ?? []).filter(tag => !tags.includes(tag));
      const filtered = q ? all.filter(tag => tag.toLowerCase().includes(q)) : all;
      const items: Suggestion[] = filtered.slice(0, 12).map(value => ({
        kind: 'tag', value, label: value,
      }));
      // Offer a "create new" row when the typed query doesn't exactly match.
      if (q && !filtered.some(tag => tag.toLowerCase() === q)) {
        items.push({ kind: 'tag-new', value: q, label: q });
      }
      return items;
    }
    if (trigger.char === '!') {
      return PRIORITY_LEVELS
        .filter(p => {
          if (!q) return true;
          return p.value.toLowerCase().startsWith(q) || t(p.labelKey).toLowerCase().startsWith(q);
        })
        .map(p => ({ kind: 'priority', value: p.value, label: t(p.labelKey) }));
    }
    if (trigger.char === '@') {
      const taken = new Set(projects.map(p => stripWikilink(p).toLowerCase()));
      const all = (notes ?? []).filter(n => !taken.has(n.title.toLowerCase()));
      const filtered = q ? all.filter(n => n.title.toLowerCase().includes(q)) : all;
      return filtered.slice(0, 12).map(n => ({ kind: 'project', value: n.title, label: n.title }));
    }
    return [];
  }, [trigger, tagSuggestions, tags, notes, projects, t]);

  useEffect(() => { setTriggerIdx(0); }, [trigger?.char, trigger?.query]);

  const reDetect = useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? el.value.length;
    setTrigger(detectTrigger(el.value, cursor));
  }, []);

  const onTitleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setTitle(next);
    const cursor = e.target.selectionStart ?? next.length;
    setTrigger(detectTrigger(next, cursor));
  };

  // Auto-resize: snap height to scrollHeight on every value change.
  // useLayoutEffect runs synchronously before paint so the row never
  // visibly clips before resizing.
  useLayoutEffect(() => {
    const ta = titleRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [title]);

  const commitSuggestion = useCallback((s: Suggestion) => {
    if (!trigger) return;
    const before = title.slice(0, trigger.triggerStart);
    const after = title.slice(trigger.triggerEnd);
    // Removing the token can leave double spaces — collapse to one.
    const merged = (before + after).replace(/[ \t]{2,}/g, ' ');
    setTitle(merged);

    if (s.kind === 'tag' || s.kind === 'tag-new') {
      setTags(prev => prev.includes(s.value) ? prev : [...prev, s.value]);
    } else if (s.kind === 'priority') {
      setPriority(s.value);
    } else if (s.kind === 'project') {
      const link = `[[${s.value}]]`;
      setProjects(prev => prev.includes(link) ? prev : [...prev, link]);
    }
    setTrigger(null);
    queueMicrotask(() => {
      const el = titleRef.current;
      if (!el) return;
      const pos = trigger.triggerStart;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }, [title, trigger]);

  // Pasted/dropped images in the description editor get converted to
  // base64 data URLs. Tasks don't have a real `noteKey` route to upload
  // assets against, so we inline the bytes — the markdown body stays
  // self-contained and survives reloads. Without this handler Crepe
  // falls back to `blob:` URLs that die with the page.
  const uploadImageAsDataUrl = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('Image read failed'));
      reader.readAsDataURL(file);
    });
  }, []);

  const commitDateHint = useCallback((hint: DuePhraseMatch) => {
    const before = title.slice(0, hint.start).replace(/\s+$/, '');
    const after = title.slice(hint.end).replace(/^\s+/, '');
    const merged = (before && after ? `${before} ${after}` : before + after).replace(/[ \t]{2,}/g, ' ');
    setTitle(merged);
    setDue(hint.iso);
    setDismissedDateKey(null);
    queueMicrotask(() => {
      const el = titleRef.current;
      if (!el) return;
      const pos = Math.min(merged.length, before.length + (before && after ? 1 : 0));
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }, [title]);

  const onTitleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (trigger && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setTriggerIdx(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setTriggerIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        commitSuggestion(suggestions[triggerIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTrigger(null);
        return;
      }
    }
    // Date-phrase confirm/dismiss. Only fires when no trigger popover is
    // intercepting keys.
    if (!trigger && showDateHint && dateHint) {
      if (e.key === 'Tab') {
        e.preventDefault();
        commitDateHint(dateHint);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissedDateKey(dateHintKey);
        return;
      }
    }
    // Backspace at column 0 peels off the most recently added chip.
    if (
      e.key === 'Backspace'
      && (e.currentTarget.selectionStart ?? 0) === 0
      && (e.currentTarget.selectionEnd ?? 0) === 0
    ) {
      if (projects.length > 0) {
        e.preventDefault();
        setProjects(prev => prev.slice(0, -1));
        return;
      }
      if (priority) {
        e.preventDefault();
        setPriority('');
        return;
      }
      if (tags.length > 0) {
        e.preventDefault();
        setTags(prev => prev.slice(0, -1));
        return;
      }
    }
    // Enter always submits (even Shift+Enter) so titles stay single-string.
    // The textarea is for visual wrapping of long titles, not multi-line
    // content. If a trigger is active but has no suggestions to pick, we
    // also fall through here so the user isn't trapped after typing `#`
    // with no existing tags.
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  const submit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        status: status.trim() || 'open',
        priority: priority || undefined,
        due: due || undefined,
        scheduled: scheduled || undefined,
        tags,
        contexts,
        projects,
        recurrence: resolveRecurrence(recurrencePreset, recurrenceCustom),
        body: bodyRef.current.trim() ? bodyRef.current : undefined,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const titleKey = mode === 'edit' ? 'editTitle' : 'createTitle';
  const submitKey = mode === 'edit' ? 'editSubmit' : 'createSubmit';
  const priorityTone = priorityToneFor(priority);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] pb-[4vh] px-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xl rounded-xl bg-[var(--panel)] border border-[var(--border)] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-title"
      >
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <h2 id="task-form-title" className="text-sm font-semibold text-text">{t(titleKey)}</h2>
          <button
            onClick={onClose}
            aria-label={t('closeAria')}
            className="text-muted hover:text-text text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        <div className="px-3 pt-3 pb-2 flex flex-col gap-2">
          {/* Chip-rich title input. Clicking anywhere in the wrapper focuses
              the underlying input so chips feel inline with the cursor. */}
          <div
            className="relative rounded-md border border-[var(--border)] bg-[var(--panel-2)] focus-within:ring-2 focus-within:ring-[var(--accent)] transition-shadow"
            onClick={() => titleRef.current?.focus()}
          >
            <div className="flex flex-wrap items-start gap-1.5 px-2 py-1.5 min-h-[36px]">
              {tags.map(tag => (
                <Chip
                  key={`tag:${tag}`}
                  tone="tag"
                  onRemove={() => setTags(prev => prev.filter(x => x !== tag))}
                  ariaLabel={t('chipRemoveTag', { value: tag })}
                >
                  #{tag}
                </Chip>
              ))}
              {priority && (
                <Chip
                  tone={priorityTone}
                  onRemove={() => setPriority('')}
                  ariaLabel={t('chipRemovePriority')}
                >
                  !{t(priorityLabelKey(priority))}
                </Chip>
              )}
              {projects.map(p => (
                <Chip
                  key={`project:${p}`}
                  tone="project"
                  onRemove={() => setProjects(prev => prev.filter(x => x !== p))}
                  ariaLabel={t('chipRemoveProject', { value: stripWikilink(p) })}
                >
                  ~{stripWikilink(p)}
                </Chip>
              ))}
              <textarea
                ref={titleRef}
                value={title}
                onChange={onTitleChange}
                onKeyDown={onTitleKeyDown}
                onSelect={reDetect}
                onClick={reDetect}
                onKeyUp={reDetect}
                onBlur={() => queueMicrotask(() => setTrigger(null))}
                rows={1}
                placeholder={
                  tags.length === 0 && projects.length === 0 && !priority && !title
                    ? t('composerPlaceholder')
                    : ''
                }
                className="flex-1 min-w-[8ch] bg-transparent text-sm text-text placeholder:text-muted outline-none py-0.5 resize-none overflow-hidden leading-snug"
                aria-label={t('createFieldTitle')}
              />
            </div>
            {trigger && suggestions.length > 0 && (
              <SuggestionList
                items={suggestions}
                selectedIdx={triggerIdx}
                onPick={commitSuggestion}
                onHover={setTriggerIdx}
                triggerLabel={triggerLabel(trigger.char, t)}
              />
            )}
            {showDateHint && dateHint && (
              <DateHintBanner
                confirmHint={t('composerDateHintConfirm')}
                dismissHint={t('composerDateHintDismiss')}
                label={t('composerDateHintLabel', { date: formatDateShort(dateHint.iso), phrase: dateHint.text })}
                onCommit={() => commitDateHint(dateHint)}
                onDismiss={() => setDismissedDateKey(dateHintKey)}
              />
            )}
          </div>

          {/* Description (Milkdown, compact) sits above the meta row when
              expanded. Mounted lazily on first expand and stays mounted —
              we don't offer a collapse-back path so the editor doesn't
              tear down mid-edit. */}
          {bodyExpanded && (
            <div
              className="milkdown-wrapper task-description rounded-md border border-[var(--border)] overflow-hidden"
              style={{ minHeight: 120, maxHeight: 320, background: 'var(--panel-2)' }}
              aria-label={t('createFieldDescription')}
            >
              <MilkdownEditor
                defaultValue={initialBody}
                noteKey={`task-form:${mode}:${initial?.id ?? 'new'}`}
                placeholder={t('createFieldDescriptionPlaceholder')}
                onChange={(md) => { bodyRef.current = md; }}
                onUpload={uploadImageAsDataUrl}
                compact
              />
            </div>
          )}

          {/* Meta row: Add-description button on the left, prefix legend on
              the right. Legend stays visible whether or not the description
              is expanded — the button vanishes once a textarea is showing. */}
          <div className="flex items-center justify-between gap-3 px-1 min-h-[20px]">
            {!bodyExpanded ? (
              <button
                type="button"
                onClick={() => setBodyExpanded(true)}
                className="text-xs text-muted hover:text-text"
              >
                {t('composerAddDescription')}
              </button>
            ) : <span aria-hidden="true" />}
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-muted/80">
              <PrefixHintItem char="#" tone="tag" label={t('composerHintTag')} />
              <PrefixHintItem char="!" tone="high" label={t('composerHintPriority')} />
              <PrefixHintItem char="@" tone="project" label={t('composerHintNote')} />
            </div>
          </div>
        </div>

        {/* Action row: due, priority, more, then Cancel + Send. */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[var(--border)]">
          <div className="flex items-center gap-1">
            <ActionButton
              ref={dueBtnRef}
              onClick={() => setDuePopoverOpen(v => !v)}
              ariaLabel={t('createFieldDue')}
              active={!!due}
              tone={due ? 'accent' : 'muted'}
            >
              <CalendarIcon />
              {due && <span className="text-[11px] tabular-nums">{formatDateShort(due)}</span>}
              {due && (
                // Inline clear: nested inside the trigger so the chip stays
                // one focusable unit. role=button + stopPropagation so the
                // outer onClick doesn't also fire and reopen the picker.
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={t('composerClearDate')}
                  onClick={(e) => { e.stopPropagation(); setDue(''); setDuePopoverOpen(false); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="ml-0.5 opacity-60 hover:opacity-100 leading-none cursor-pointer"
                >×</span>
              )}
            </ActionButton>
            <ActionButton
              ref={priorityBtnRef}
              onClick={() => setPriorityPopoverOpen(v => !v)}
              ariaLabel={t('createFieldPriority')}
              active={!!priority}
              tone={priorityIconTone(priority)}
            >
              <FlagIcon />
            </ActionButton>
            <ActionButton
              ref={recurrenceBtnRef}
              onClick={() => setRecurrencePopoverOpen(v => !v)}
              ariaLabel={t('createFieldRecurrence')}
              active={recurrencePreset !== ''}
              tone={recurrencePreset !== '' ? 'accent' : 'muted'}
            >
              <RepeatIcon />
              {recurrencePreset !== '' && (
                <span className="text-[11px]">{t(recurrencePresetLabelKey(recurrencePreset))}</span>
              )}
            </ActionButton>
            <ActionButton
              ref={overflowBtnRef}
              onClick={() => setOverflowOpen(v => !v)}
              ariaLabel={t('composerMoreOptions')}
              active={overflowActive(scheduled, contexts, status)}
              tone={overflowActive(scheduled, contexts, status) ? 'accent' : 'muted'}
            >
              <DotsIcon />
            </ActionButton>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="text-sm text-muted hover:text-text px-2 py-1 disabled:opacity-50"
            >
              {t('createCancel')}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!title.trim() || submitting}
              className="rounded-md bg-[var(--accent)] text-[var(--accent-fg)] px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
            >
              {t(submitKey)}
            </button>
          </div>
        </div>

        <CalendarPopover
          open={duePopoverOpen}
          value={due}
          anchorRef={dueBtnRef}
          onSelect={(d) => { setDue(d); setDuePopoverOpen(false); }}
          onClose={() => setDuePopoverOpen(false)}
        />
        {priorityPopoverOpen && (
          <PriorityPopover
            anchorRef={priorityBtnRef}
            value={priority}
            onChange={(v) => { setPriority(v); setPriorityPopoverOpen(false); }}
            onClose={() => setPriorityPopoverOpen(false)}
          />
        )}
        {recurrencePopoverOpen && (
          <RecurrencePopover
            anchorRef={recurrenceBtnRef}
            preset={recurrencePreset}
            custom={recurrenceCustom}
            onPresetChange={setRecurrencePreset}
            onCustomChange={setRecurrenceCustom}
            onClose={() => setRecurrencePopoverOpen(false)}
          />
        )}
        {overflowOpen && (
          <OverflowPopover
            anchorRef={overflowBtnRef}
            scheduled={scheduled}
            onScheduledChange={setScheduled}
            contexts={contexts}
            contextSuggestions={contextSuggestions ?? []}
            onContextsChange={setContexts}
            status={status}
            onStatusChange={setStatus}
            onClose={() => setOverflowOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// --- Chip + ActionButton ---

type PriorityTone = 'highest' | 'high' | 'normal' | 'low' | 'lowest';
type ChipTone = 'tag' | 'project' | PriorityTone;

function Chip({
  tone,
  children,
  onRemove,
  ariaLabel,
}: {
  tone: ChipTone;
  children: ReactNode;
  onRemove: () => void;
  ariaLabel: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${chipToneCls(tone)}`}
      onClick={(e) => e.stopPropagation()}
    >
      <span>{children}</span>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onRemove(); }}
        aria-label={ariaLabel}
        className="opacity-60 hover:opacity-100 leading-none"
      >
        ×
      </button>
    </span>
  );
}

function DateHintBanner({
  label, confirmHint, dismissHint, onCommit, onDismiss,
}: {
  label: string;
  confirmHint: string;
  dismissHint: string;
  onCommit: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute left-0 right-0 top-full mt-1 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[var(--panel)] border border-[var(--accent)]/40 text-xs z-50"
      style={{ boxShadow: '0 12px 28px -10px rgba(0,0,0,0.35)' }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[var(--accent)] shrink-0" aria-hidden="true"><CalendarIcon /></span>
        <span className="truncate text-text">{label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onCommit(); }}
          className="text-[var(--accent)] hover:underline"
        >
          {confirmHint}
        </button>
        <span className="text-muted/60">·</span>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onDismiss(); }}
          aria-label={dismissHint}
          className="text-muted hover:text-text leading-none"
          title={dismissHint}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function PrefixHintItem({ char, tone, label }: { char: string; tone: ChipTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-mono font-semibold ${chipToneCls(tone)}`}
      >
        {char}
      </span>
      <span>{label}</span>
    </span>
  );
}

function chipToneCls(tone: ChipTone): string {
  switch (tone) {
    case 'tag':     return 'bg-sky-500/15 text-sky-300';
    case 'project': return 'bg-violet-500/15 text-violet-300';
    case 'highest': return 'bg-rose-500/15 text-rose-300';
    case 'high':    return 'bg-red-500/15 text-red-300';
    case 'normal':  return 'bg-amber-500/15 text-amber-300';
    case 'low':     return 'bg-blue-500/15 text-blue-300';
    case 'lowest':  return 'bg-slate-500/15 text-slate-300';
  }
}

interface ActionButtonProps {
  onClick: () => void;
  ariaLabel: string;
  active?: boolean;
  tone?: 'accent' | 'muted' | PriorityTone;
  children: ReactNode;
}

const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton({ onClick, ariaLabel, active, tone, children }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-[var(--panel-2)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${actionToneCls(tone)}`}
      >
        {children}
      </button>
    );
  },
);

function actionToneCls(tone: 'accent' | 'muted' | PriorityTone | undefined): string {
  switch (tone) {
    case 'accent':  return 'text-[var(--accent)]';
    case 'highest': return 'text-rose-400';
    case 'high':    return 'text-red-400';
    case 'normal':  return 'text-amber-400';
    case 'low':     return 'text-blue-400';
    case 'lowest':  return 'text-slate-400';
    case 'muted':
    default:        return 'text-muted';
  }
}

// --- Suggestion popover (anchored under the title input) ---

function SuggestionList({
  items, selectedIdx, onPick, onHover, triggerLabel,
}: {
  items: Suggestion[];
  selectedIdx: number;
  onPick: (s: Suggestion) => void;
  onHover: (i: number) => void;
  triggerLabel: string;
}) {
  return (
    <div
      role="listbox"
      aria-label={triggerLabel}
      className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-[var(--panel)] border border-[var(--border)] rounded-md z-50 py-1"
      style={{ boxShadow: '0 12px 28px -10px rgba(0,0,0,0.35)' }}
    >
      {items.map((s, i) => (
        <button
          key={`${s.kind}:${s.value}`}
          type="button"
          role="option"
          aria-selected={i === selectedIdx}
          onMouseEnter={() => onHover(i)}
          // mouseDown so input doesn't blur (which would clear `trigger`)
          // before we read the picked value.
          onMouseDown={(e) => { e.preventDefault(); onPick(s); }}
          className={`w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 ${
            i === selectedIdx ? 'bg-[var(--panel-2)] text-text' : 'text-muted hover:text-text hover:bg-[var(--panel-2)]/60'
          }`}
        >
          <span className={`shrink-0 w-4 text-center ${suggestionIconCls(s)}`} aria-hidden="true">
            {suggestionGlyph(s)}
          </span>
          <span className="flex-1 truncate">{s.label}</span>
          {s.kind === 'tag-new' && (
            <span className="text-[10px] uppercase tracking-wide text-muted">new</span>
          )}
        </button>
      ))}
    </div>
  );
}

function suggestionGlyph(s: Suggestion): string {
  switch (s.kind) {
    case 'tag':
    case 'tag-new': return '#';
    case 'priority': return '!';
    case 'project': return '~';
  }
}

function suggestionIconCls(s: Suggestion): string {
  if (s.kind === 'priority') {
    return chipToneCls(priorityToneFor(s.value)).split(' ').filter(c => c.startsWith('text-')).join(' ');
  }
  if (s.kind === 'project') return 'text-violet-300';
  return 'text-sky-300';
}

// --- Priority popover ---

function PriorityPopover({
  anchorRef, value, onChange, onClose,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('tasks');
  const ref = useRef<HTMLDivElement>(null);
  const pos = useAnchoredPosition(anchorRef, ref);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (ref.current?.contains(tgt) || anchorRef.current?.contains(tgt)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      role="listbox"
      aria-label={t('createFieldPriority')}
      className="fixed z-[110] bg-[var(--panel)] border border-[var(--border)] rounded-md py-1 min-w-[160px]"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, boxShadow: '0 12px 28px -10px rgba(0,0,0,0.35)' }}
    >
      {PRIORITY_LEVELS.map(p => {
        const active = p.value === value;
        return (
          <button
            key={p.value}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onChange(p.value)}
            className={`w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-[var(--panel-2)] ${active ? 'text-text' : 'text-muted hover:text-text'}`}
          >
            <span className={`shrink-0 ${actionToneCls(p.tone)}`} aria-hidden="true"><FlagIcon /></span>
            <span className="flex-1">{t(p.labelKey)}</span>
            {active && <span className="text-accent" aria-hidden="true">✓</span>}
          </button>
        );
      })}
      <div className="border-t border-[var(--border)] mt-1 pt-1">
        <button
          type="button"
          onClick={() => onChange('')}
          className={`w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-[var(--panel-2)] ${!value ? 'text-text' : 'text-muted hover:text-text'}`}
        >
          <span className="shrink-0 text-muted" aria-hidden="true"><FlagIcon /></span>
          <span className="flex-1">{t('priorityUnset')}</span>
          {!value && <span className="text-accent" aria-hidden="true">✓</span>}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// --- Recurrence popover ---

const RECURRENCE_PRESETS: Array<{ value: Exclude<RecurrencePreset, ''>; labelKey: string }> = [
  { value: 'daily',    labelKey: 'recurrenceDaily' },
  { value: 'weekdays', labelKey: 'recurrenceWeekdays' },
  { value: 'weekly',   labelKey: 'recurrenceWeekly' },
  { value: 'monthly',  labelKey: 'recurrenceMonthly' },
  { value: 'yearly',   labelKey: 'recurrenceYearly' },
  { value: 'custom',   labelKey: 'recurrenceCustom' },
];

function RecurrencePopover({
  anchorRef, preset, custom, onPresetChange, onCustomChange, onClose,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  preset: RecurrencePreset;
  custom: string;
  onPresetChange: (v: RecurrencePreset) => void;
  onCustomChange: (v: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('tasks');
  const ref = useRef<HTMLDivElement>(null);
  const pos = useAnchoredPosition(anchorRef, ref);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (ref.current?.contains(tgt) || anchorRef.current?.contains(tgt)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      role="listbox"
      aria-label={t('createFieldRecurrence')}
      className="fixed z-[110] bg-[var(--panel)] border border-[var(--border)] rounded-md py-1 min-w-[200px]"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, boxShadow: '0 12px 28px -10px rgba(0,0,0,0.35)' }}
    >
      {RECURRENCE_PRESETS.map(p => {
        const active = p.value === preset;
        return (
          <button
            key={p.value}
            type="button"
            role="option"
            aria-selected={active}
            // For non-custom presets, close immediately. Custom keeps the
            // popover open so the user can edit the RRULE input below.
            onClick={() => {
              onPresetChange(p.value);
              if (p.value !== 'custom') onClose();
            }}
            className={`w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-[var(--panel-2)] ${active ? 'text-text' : 'text-muted hover:text-text'}`}
          >
            <span className="shrink-0 text-muted" aria-hidden="true"><RepeatIcon /></span>
            <span className="flex-1">{t(p.labelKey)}</span>
            {active && <span className="text-accent" aria-hidden="true">✓</span>}
          </button>
        );
      })}
      <div className="border-t border-[var(--border)] mt-1 pt-1">
        <button
          type="button"
          onClick={() => { onPresetChange(''); onClose(); }}
          className={`w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 hover:bg-[var(--panel-2)] ${preset === '' ? 'text-text' : 'text-muted hover:text-text'}`}
        >
          <span className="shrink-0 text-muted" aria-hidden="true"><RepeatIcon /></span>
          <span className="flex-1">{t('recurrenceNone')}</span>
          {preset === '' && <span className="text-accent" aria-hidden="true">✓</span>}
        </button>
      </div>
      {preset === 'custom' && (
        <div className="border-t border-[var(--border)] mt-1 pt-2 px-2 pb-2">
          <input
            value={custom}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-xs font-mono text-text focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
      )}
    </div>,
    document.body,
  );
}

// --- Overflow popover (scheduled, contexts, status) ---

function OverflowPopover({
  anchorRef,
  scheduled, onScheduledChange,
  contexts, contextSuggestions, onContextsChange,
  status, onStatusChange,
  onClose,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  scheduled: string;
  onScheduledChange: (v: string) => void;
  contexts: string[];
  contextSuggestions: string[];
  onContextsChange: (v: string[]) => void;
  status: string;
  onStatusChange: (v: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('tasks');
  const ref = useRef<HTMLDivElement>(null);
  const scheduledBtnRef = useRef<HTMLButtonElement>(null);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [contextInput, setContextInput] = useState('');
  const pos = useAnchoredPosition(anchorRef, ref);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (ref.current?.contains(tgt) || anchorRef.current?.contains(tgt)) return;
      // Don't close when interacting with the nested calendar popover.
      if ((e.target as Element)?.closest?.('.rdp-app-themed')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  const addContext = (raw: string) => {
    const cleaned = raw.replace(/^@/, '').trim();
    if (!cleaned) return;
    if (contexts.includes(cleaned)) return;
    onContextsChange([...contexts, cleaned]);
    setContextInput('');
  };

  const filteredContexts = useMemo(() => {
    const q = contextInput.trim().toLowerCase().replace(/^@/, '');
    if (!q) return [];
    return contextSuggestions
      .filter(c => !contexts.includes(c) && c.toLowerCase().includes(q))
      .slice(0, 6);
  }, [contextInput, contextSuggestions, contexts]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={t('composerMoreOptions')}
      className="fixed z-[110] bg-[var(--panel)] border border-[var(--border)] rounded-md p-3 w-[320px] flex flex-col gap-3"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, boxShadow: '0 12px 28px -10px rgba(0,0,0,0.35)' }}
    >
      <Field label={t('createFieldScheduled')}>
        <button
          ref={scheduledBtnRef}
          type="button"
          onClick={() => setScheduledOpen(v => !v)}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm text-left flex items-center justify-between gap-2"
        >
          <span className={scheduled ? 'text-text' : 'text-muted'}>
            {scheduled || t('composerNoDate')}
          </span>
          {scheduled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={t('composerClearDate')}
              onClick={(e) => { e.stopPropagation(); onScheduledChange(''); }}
              className="text-muted hover:text-text shrink-0 leading-none"
            >×</span>
          ) : (
            <span className="text-muted shrink-0" aria-hidden="true"><CalendarIcon /></span>
          )}
        </button>
        <CalendarPopover
          open={scheduledOpen}
          value={scheduled}
          anchorRef={scheduledBtnRef}
          onSelect={(d) => { onScheduledChange(d); setScheduledOpen(false); }}
          onClose={() => setScheduledOpen(false)}
          // Overflow panel sits at z-110 — bump the nested calendar above it.
          zIndex={120}
        />
      </Field>

      <Field label={t('createFieldContexts')}>
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5">
          {contexts.map(c => (
            <Chip
              key={c}
              tone="project"
              onRemove={() => onContextsChange(contexts.filter(x => x !== c))}
              ariaLabel={t('chipRemoveContext', { value: c })}
            >
              @{c}
            </Chip>
          ))}
          <input
            value={contextInput}
            onChange={(e) => setContextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
                e.preventDefault();
                addContext(contextInput);
              } else if (e.key === 'Backspace' && contextInput === '' && contexts.length > 0) {
                e.preventDefault();
                onContextsChange(contexts.slice(0, -1));
              }
            }}
            placeholder={contexts.length === 0 ? '@home, @work…' : ''}
            className="flex-1 min-w-[6ch] bg-transparent text-sm text-text placeholder:text-muted outline-none"
          />
        </div>
        {filteredContexts.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {filteredContexts.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => addContext(c)}
                className="text-xs text-muted hover:text-text bg-[var(--panel-2)] hover:bg-[var(--border)] rounded px-1.5 py-0.5"
              >
                @{c}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label={t('createFieldStatus')}>
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
          ))}
        </select>
      </Field>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}

// --- Anchored fixed position helper (mirrors CalendarPopover's pattern). ---

function useAnchoredPosition(
  anchorRef: RefObject<HTMLElement | null>,
  popRef: RefObject<HTMLElement | null>,
) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const reposition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const popWidth = popRef.current?.getBoundingClientRect().width ?? 0;
      // Try to render below; if popover would clip the right edge, align right.
      const viewportRight = window.innerWidth;
      let left = rect.left;
      if (left + popWidth + 8 > viewportRight) {
        left = Math.max(8, viewportRight - popWidth - 8);
      }
      setPos({ top: rect.bottom + 4, left });
    };
    reposition();
    const raf = requestAnimationFrame(reposition);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [anchorRef, popRef]);
  return pos;
}

// --- Icons ---

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" />
      <path d="M3.5 8h13M7 3v3M13 3v3" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3v14" />
      <path d="M5 4h9l-2 3 2 3H5" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="16" cy="10" r="1.5" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8a5 5 0 0 1 9-3l2 2" />
      <path d="M15 3v4h-4" />
      <path d="M16 12a5 5 0 0 1-9 3l-2-2" />
      <path d="M5 17v-4h4" />
    </svg>
  );
}

// --- Helpers ---

/**
 * Detect a `#`/`!`/`@` trigger immediately before the caret. The trigger
 * char must be at the start of the value or immediately after whitespace —
 * this avoids picking up an `@` inside an email or a `#` inside a URL.
 */
function detectTrigger(text: string, cursor: number): TriggerState | null {
  const before = text.slice(0, cursor);
  const m = before.match(/(?:^|\s)([#!@])([^\s]*)$/);
  if (!m) return null;
  const tokenLen = m[2].length;
  return {
    char: m[1] as TriggerChar,
    query: m[2],
    triggerStart: before.length - tokenLen - 1,
    triggerEnd: cursor,
  };
}

function triggerLabel(char: TriggerChar, t: ReturnType<typeof useTranslations>): string {
  switch (char) {
    case '#': return t('createFieldTags');
    case '!': return t('createFieldPriority');
    case '@': return t('createFieldProjects');
  }
}

function stripWikilink(s: string): string {
  return s.replace(/^\[\[/, '').replace(/\]\]$/, '');
}

function priorityToneFor(value: string): PriorityTone {
  const hit = PRIORITY_LEVELS.find(p => p.value === value);
  return hit?.tone ?? 'normal';
}

function priorityIconTone(value: string): 'muted' | PriorityTone {
  return value ? priorityToneFor(value) : 'muted';
}

function priorityLabelKey(value: string): string {
  const hit = PRIORITY_LEVELS.find(p => p.value === value);
  return hit?.labelKey ?? 'priorityNormal';
}

function overflowActive(scheduled: string, contexts: string[], status: string): boolean {
  return Boolean(scheduled) || contexts.length > 0 || (status !== 'open' && status !== '');
}

function recurrencePresetLabelKey(preset: RecurrencePreset): string {
  switch (preset) {
    case 'daily':    return 'recurrenceDaily';
    case 'weekdays': return 'recurrenceWeekdays';
    case 'weekly':   return 'recurrenceWeekly';
    case 'monthly':  return 'recurrenceMonthly';
    case 'yearly':   return 'recurrenceYearly';
    case 'custom':   return 'recurrenceCustom';
    case '':         return 'recurrenceNone';
  }
}

/** Format a `YYYY-MM-DD` value for the inline due chip. */
function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  // Match the rest of the app: short month + day.
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type RecurrencePreset = '' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom';

const PRESET_RRULE: Record<Exclude<RecurrencePreset, '' | 'custom'>, string> = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
};

function resolveRecurrence(preset: RecurrencePreset, custom: string): string | undefined {
  if (preset === '') return undefined;
  if (preset === 'custom') return custom.trim() || undefined;
  return PRESET_RRULE[preset];
}

function matchRecurrencePreset(value: string | undefined): RecurrencePreset {
  if (!value) return '';
  const normalized = value.trim();
  for (const [preset, rule] of Object.entries(PRESET_RRULE)) {
    if (normalized === rule) return preset as RecurrencePreset;
  }
  return 'custom';
}
