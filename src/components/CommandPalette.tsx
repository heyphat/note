'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { NoteMeta } from '@/lib/storage';
import type { SearchHit, SearchQuery, SortMode, TagCount } from '@/lib/search/types';
import { parseQuery } from '@/lib/search/query-parser';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  run: () => void;
  enabled?: boolean;
  /** Optional color swatches to render in place of the default icon — used by
   *  palette-switch actions so users can see each theme's actual colors. */
  swatches?: string[];
}

type Mode = 'search' | 'action' | 'quickopen' | 'tag';

interface Row {
  key: string;
  kind: 'note' | 'action' | 'tag';
  title: string;
  subtitle?: string;
  snippet?: string;
  matchedTerms?: string[];
  shortcut?: string;
  hint?: string;
  swatches?: string[];
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectNote: (id: string) => void;
  actions: PaletteAction[];
  search: (q: SearchQuery) => Promise<SearchHit[]>;
  notesById: Map<string, NoteMeta>;
  recent: string[];
  progress: { indexed: number; total: number };
  /** Known tags, surfaced when the user types `@`. Empty when the index hasn't primed yet. */
  tags?: TagCount[];
  /** Called when the user picks a tag row. Parent decides what to do (set a filter, insert into note, etc.). */
  onSelectTag?: (tag: string | null) => void;
  /** If provided, the input is pre-populated with this value on open. Used to echo an active tag filter as `#{tag}` when the palette reopens. */
  initialInput?: string;
  /**
   * Called when the user clicks "Save search" in the footer. Parent persists
   * a new saved search from the current palette input. Only surfaced in
   * search mode and when the input has content.
   */
  onSaveSearch?: (input: string, name?: string) => void;
}

// Token helpers for the date chips / sort dropdown. Operate on the raw input
// string so manual typing, URL-shareable inputs, and saved searches all share
// one representation (same one `parseQuery` consumes).

function stripTokens(input: string, field: 'updated' | 'sort'): string {
  const re = new RegExp(`(^|\\s)\\b${field}:\\S+`, 'gi');
  return input.replace(re, ' ').replace(/\s+/g, ' ').trim();
}

function appendToken(input: string, token: string): string {
  return input ? `${input} ${token}` : token;
}

function currentUpdatedChip(input: string): 'today' | '7d' | '30d' | 'all' {
  const m = input.match(/\bupdated:>?(today|7d|30d)\b/i);
  if (!m) return 'all';
  const v = m[1].toLowerCase();
  return v === 'today' || v === '7d' || v === '30d' ? v : 'all';
}

function toggleUpdatedChip(input: string, value: 'today' | '7d' | '30d' | 'all'): string {
  const stripped = stripTokens(input, 'updated');
  if (value === 'all') return stripped;
  return appendToken(stripped, `updated:>${value}`);
}

function currentSortValue(input: string): SortMode {
  const m = input.match(/\bsort:(relevance|updated|created|title)\b/i);
  const v = m?.[1]?.toLowerCase();
  if (v === 'relevance' || v === 'updated' || v === 'created' || v === 'title') return v as SortMode;
  return 'relevance';
}

function setSort(input: string, mode: SortMode): string {
  const stripped = stripTokens(input, 'sort');
  if (mode === 'relevance') return stripped;
  return appendToken(stripped, `sort:${mode}`);
}

function detectMode(input: string): { mode: Mode; rest: string } {
  if (input.startsWith('>')) return { mode: 'action', rest: input.slice(1).trim() };
  if (input.startsWith('#')) return { mode: 'tag', rest: input.slice(1).trim() };
  if (input.startsWith('@')) return { mode: 'quickopen', rest: input.slice(1).trim() };
  return { mode: 'search', rest: input.trim() };
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function Highlight({ text, terms }: { text: string; terms?: string[] }) {
  if (!terms || !terms.length || !text) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map(escapeRe).filter(Boolean).join('|')})`, 'ig');
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <mark key={i} className="rounded-sm bg-accent/25 text-text px-0.5">{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

function fuzzyScore(needle: string, hay: string): number {
  // Small, forgiving scorer for quick-open. Higher is better, -1 = no match.
  if (!needle) return 0;
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  if (h === n) return 1000;
  if (h.startsWith(n)) return 500 - (h.length - n.length);
  const idx = h.indexOf(n);
  if (idx !== -1) return 200 - idx;
  // Subsequence check.
  let hi = 0, matches = 0;
  for (let ni = 0; ni < n.length; ni++) {
    const c = n[ni];
    const found = h.indexOf(c, hi);
    if (found === -1) return -1;
    matches++;
    hi = found + 1;
  }
  return matches - n.length * 2;
}

export default function CommandPalette({
  open, onClose, onSelectNote, actions, search, notesById, recent, progress,
  tags = [], onSelectTag, initialInput, onSaveSearch,
}: Props) {
  const t = useTranslations('palette');
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const searchTokenRef = useRef(0);
  const selectedRef = useRef(0);
  const selectedKeyRef = useRef<string | null>(null);

  const { mode, rest } = useMemo(() => detectMode(input), [input]);

  useEffect(() => {
    selectedRef.current = selected;
    selectedKeyRef.current = rows[selected]?.key ?? null;
  }, [rows, selected]);

  const applyRows = useCallback((next: Row[]) => {
    let nextSelected = 0;
    if (next.length > 0) {
      const selectedKey = selectedKeyRef.current;
      if (selectedKey) {
        const preservedIndex = next.findIndex(row => row.key === selectedKey);
        if (preservedIndex >= 0) nextSelected = preservedIndex;
        else nextSelected = Math.min(selectedRef.current, next.length - 1);
      } else {
        nextSelected = Math.min(selectedRef.current, next.length - 1);
      }
    }

    setRows(next);
    setSelected(nextSelected);
  }, []);

  // Reset state each time the palette opens. When `initialInput` is present
  // (e.g. an active tag filter expressed as `@mytag`), pre-populate the
  // field and move the caret to the end so the user can immediately refine.
  useEffect(() => {
    if (!open) return;
    setInput(initialInput ?? '');
    setSelected(0);
    selectedRef.current = 0;
    selectedKeyRef.current = null;
    // Focus after the overlay paints.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (initialInput) {
        const len = initialInput.length;
        try { el.setSelectionRange(len, len); } catch { /* ignore */ }
      }
    });
  }, [open, initialInput]);

  // Query changes should intentionally jump back to the first result. Background
  // row refreshes should not, so those only preserve/clamp via applyRows().
  useEffect(() => {
    if (!open) return;
    setSelected(0);
    selectedRef.current = 0;
    selectedKeyRef.current = null;
  }, [open, mode, rest]);

  // Window-level Escape listener. The input's onKeyDown handles Escape when
  // focused, but if anything else steals focus (Milkdown's ProseMirror, a
  // selected row, etc.) the input never sees the key. Capture phase so we
  // win over anything bubbling up through document.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  // Recompute rows whenever input/mode changes.
  useEffect(() => {
    if (!open) return;
    const token = ++searchTokenRef.current;

    if (mode === 'action') {
      const filtered = rest
        ? actions.filter(a => a.label.toLowerCase().includes(rest.toLowerCase()))
        : actions;
      const next: Row[] = filtered.map(a => ({
        key: `action:${a.id}`,
        kind: 'action',
        title: a.label,
        hint: a.hint,
        shortcut: a.shortcut,
        swatches: a.swatches,
        matchedTerms: rest ? rest.split(/\s+/).filter(Boolean) : undefined,
        run: () => { a.run(); onClose(); },
      }));
      applyRows(next);
      return;
    }

    if (mode === 'tag') {
      // Tag picker. Matches the prefix (case-insensitive) so `@cat` surfaces
      // `#categorized`, `#catalog`, etc. Empty `rest` shows the full list so
      // the user can browse what's available.
      const filtered = rest
        ? tags.filter(t => t.tag.toLowerCase().includes(rest.toLowerCase()))
        : tags;
      const next: Row[] = filtered.map(tg => ({
        key: `tag:${tg.tag}`,
        kind: 'tag',
        title: `#${tg.tag}`,
        hint: tg.count === 1 ? t('tagCountOne', { count: tg.count }) : t('tagCountOther', { count: tg.count }),
        matchedTerms: rest ? [rest] : undefined,
        run: () => { onSelectTag?.(tg.tag); onClose(); },
      }));
      applyRows(next);
      return;
    }

    if (mode === 'quickopen') {
      // Synchronous fuzzy match against the in-memory notes map — no need to
      // round-trip through the search index for a title-only lookup.
      const list = Array.from(notesById.values());
      let filtered: { note: NoteMeta; score: number }[];
      if (!rest) {
        filtered = list.map(note => ({ note, score: 0 }));
      } else {
        filtered = [];
        for (const note of list) {
          const scoreTitle = fuzzyScore(rest, note.title);
          const scorePath = fuzzyScore(rest, note.id);
          const score = Math.max(scoreTitle, scorePath);
          if (score >= 0) filtered.push({ note, score });
        }
        filtered.sort((a, b) => b.score - a.score);
      }
      const next: Row[] = filtered.slice(0, 50).map(({ note }) => ({
        key: `note:${note.id}`,
        kind: 'note',
        title: note.title,
        subtitle: note.id.replace(/\.md$/, ''),
        matchedTerms: rest ? [rest] : undefined,
        run: () => { onSelectNote(note.id); onClose(); },
      }));
      applyRows(next);
      return;
    }

    // Default: full-text search. Empty input shows recent notes.
    if (!rest) {
      const next: Row[] = [];
      for (const id of recent) {
        const note = notesById.get(id);
        if (!note) continue;
        next.push({
          key: `note:${note.id}`,
          kind: 'note',
          title: note.title,
          subtitle: note.id.replace(/\.md$/, ''),
          hint: t('recentHint'),
          run: () => { onSelectNote(note.id); onClose(); },
        });
      }
      applyRows(next);
      return;
    }

    (async () => {
      const q = parseQuery(rest);
      const hits = await search({ ...q, limit: 50 });
      if (token !== searchTokenRef.current) return;
      const next: Row[] = hits.map(h => ({
        key: `note:${h.id}`,
        kind: 'note',
        title: h.title,
        subtitle: h.id.replace(/\.md$/, ''),
        snippet: h.snippet,
        matchedTerms: h.matchedTerms,
        run: () => { onSelectNote(h.id); onClose(); },
      }));
      applyRows(next);
    })();
  }, [open, mode, rest, actions, notesById, recent, search, onClose, onSelectNote, tags, onSelectTag, applyRows]);

  // Scroll the active row into view when arrow-key navigation moves it out.
  useEffect(() => {
    const el = rowRefs.current[selected];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(rows.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(0, s - 1));
    } else if (e.key === 'Home') {
      e.preventDefault(); setSelected(0);
    } else if (e.key === 'End') {
      e.preventDefault(); setSelected(Math.max(0, rows.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[selected];
      if (row) row.run();
    }
  }, [rows, selected, onClose]);

  if (!open) return null;

  // Derived chip state for the date / sort controls. Only shown in search
  // mode — the other modes (action, tag picker, quick-open) don't use query
  // tokens, so chips would be noise.
  const activeDateChip = mode === 'search' ? currentUpdatedChip(input) : 'all';
  const activeSort = mode === 'search' ? currentSortValue(input) : 'relevance';
  const canSave = mode === 'search' && !!rest && !!onSaveSearch;

  const placeholder =
    mode === 'action'
      ? t('placeholderAction')
      : mode === 'quickopen'
        ? t('placeholderQuickopen')
        : mode === 'tag'
          ? t('placeholderTag')
          : t('placeholderSearch');

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 backdrop-blur-[2px] pt-[12vh] px-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={t('ariaLabel')}
    >
      <div className="w-full max-w-xl bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className="text-muted shrink-0">
            <circle cx="9" cy="9" r="6" />
            <path d="m17 17-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            className="flex-1 bg-transparent outline-none text-sm text-text placeholder:text-muted py-1"
          />
        </div>
        {mode === 'search' && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] text-[11px]">
            <span className="text-muted shrink-0">{t('updated')}</span>
            {(['today', '7d', '30d', 'all'] as const).map(v => {
              const active = activeDateChip === v;
              return (
                <button
                  key={v}
                  onMouseDown={e => {
                    e.preventDefault();
                    setInput(cur => toggleUpdatedChip(cur, v));
                    inputRef.current?.focus();
                  }}
                  className={`px-2 py-0.5 rounded-full border transition-colors
                    ${active
                      ? 'bg-accent/20 border-accent/50 text-text'
                      : 'border-[var(--border)] text-muted hover:text-text hover:bg-[var(--panel-2)]'}`}
                >
                  {v === 'all' ? t('updatedAll') : v}
                </button>
              );
            })}
            <span className="ml-auto flex items-center gap-1 text-muted">
              <span className="shrink-0">{t('sort')}</span>
              <select
                value={activeSort}
                onMouseDown={e => e.stopPropagation()}
                onChange={e => {
                  setInput(cur => setSort(cur, e.target.value as SortMode));
                  inputRef.current?.focus();
                }}
                className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-1 py-0 text-[11px] text-text outline-none"
              >
                <option value="relevance">{t('sortRelevance')}</option>
                <option value="updated">{t('sortUpdated')}</option>
                <option value="created">{t('sortCreated')}</option>
                <option value="title">{t('sortTitle')}</option>
              </select>
            </span>
          </div>
        )}
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {rows.length === 0 && (
            <li className="px-3 py-6 text-xs text-muted text-center">
              {mode === 'action' ? t('emptyAction') :
               mode === 'quickopen' ? t('emptyQuickopen') :
               mode === 'tag' ? t('emptyTag') :
               rest ? t('emptyResults') : t('emptyHint')}
            </li>
          )}
          {rows.map((row, i) => (
            <li
              key={row.key}
              ref={el => { rowRefs.current[i] = el; }}
              onMouseDown={e => { e.preventDefault(); row.run(); }}
              onMouseEnter={() => setSelected(i)}
              className={`px-3 py-1.5 cursor-pointer flex items-center gap-3 ${
                i === selected ? 'bg-[var(--panel-2)]' : ''
              }`}
            >
              {row.swatches && row.swatches.length > 0 ? (
                <span className="shrink-0 flex w-8 h-4 rounded-sm overflow-hidden border border-[var(--border)]">
                  {row.swatches.map((c, si) => (
                    <span key={si} className="flex-1 h-full" style={{ background: c }} />
                  ))}
                </span>
              ) : (
                <span className={`shrink-0 w-4 h-4 flex items-center justify-center text-[10px] ${
                  row.kind === 'action' ? 'text-accent' :
                  row.kind === 'tag' ? 'text-accent' : 'text-muted'
                }`}>
                  {row.kind === 'action' ? '▸' : row.kind === 'tag' ? '#' : '📄'}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text truncate">
                  <Highlight text={row.title} terms={row.matchedTerms} />
                </div>
                {row.snippet ? (
                  <div className="text-[11px] text-muted truncate">
                    <Highlight text={row.snippet} terms={row.matchedTerms} />
                  </div>
                ) : row.subtitle ? (
                  <div className="text-[11px] text-muted truncate font-mono">
                    {row.subtitle}
                  </div>
                ) : null}
              </div>
              {row.shortcut && (
                <span className="shrink-0 text-[10px] text-muted opacity-70 tracking-wide">
                  {row.shortcut}
                </span>
              )}
              {row.hint && !row.shortcut && (
                <span className="shrink-0 text-[10px] text-muted opacity-70">{row.hint}</span>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-[var(--border)] px-3 py-1.5 flex items-center justify-between gap-2 text-[10px] text-muted">
          <span className="shrink-0">
            <kbd className="font-mono">↑↓</kbd> {t('footerNavigate')} · <kbd className="font-mono">↵</kbd> {t('footerOpen')} ·
            {' '}<kbd className="font-mono">esc</kbd> {t('footerClose')}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {canSave && (
              <button
                onMouseDown={e => {
                  e.preventDefault();
                  const name = window.prompt(t('saveSearchPrompt'), input.trim());
                  if (name === null) return;
                  onSaveSearch?.(input.trim(), name.trim() || undefined);
                  onClose();
                }}
                className="px-2 py-0.5 rounded-full border border-[var(--border)] text-muted hover:text-text hover:bg-[var(--panel-2)] transition-colors"
                title={t('saveSearchTitle')}
              >
                {t('saveSearch')}
              </button>
            )}
            <span>
              {progress.total > 0 && progress.indexed < progress.total
                ? t('indexingProgress', { indexed: progress.indexed, total: progress.total })
                : t('totalNotes', { count: progress.total })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
