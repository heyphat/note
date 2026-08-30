'use client';

import { memo, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { LinkIndex, Backlink } from '@/lib/links/link-index';
import type { NoteMeta } from '@/lib/storage';
import { parseWikiLinks } from '@/lib/links/link-parser';

interface Props {
  /** Live link index from useSearch. Null when not yet primed. */
  linkIndex: LinkIndex | null;
  /** Bumped by useSearch whenever the index mutates — triggers a re-render. */
  linksVersion: number;
  /** The note currently open in the editor. */
  activeNote: NoteMeta | null;
  /** Full notes list so we can render source titles for each backlink. */
  notesById: Map<string, NoteMeta>;
  /** Raw body markdown of the active note — scanned for unlinked mentions. */
  activeBody: string;
  /** Click handler: navigates to the given source note. */
  onSelect: (id: string) => void;
  /**
   * Convert an unlinked mention in the active note to a wikilink. Receives
   * the candidate note's title; the host re-scans the live body and splices
   * the first suitable occurrence so the edit stays correct even when the
   * editor has drifted since the panel last re-rendered.
   */
  onLinkMention?: (title: string) => void;
  onClose: () => void;
}

const UNLINKED_MIN_LEN = 3;
const UNLINKED_MAX = 20;
const CONTEXT_SNIPPET = 140;

interface UnlinkedMention {
  /** Id of the candidate note that matches this mention. */
  noteId: string;
  /** Title of the candidate note (what we'd link to). */
  title: string;
  /** Occurrence range in activeBody (original text). */
  start: number;
  end: number;
  /** Short snippet for display, pre-highlighted. */
  contextBefore: string;
  matchText: string;
  contextAfter: string;
}

function highlightSnippet(body: string, start: number, end: number): { before: string; match: string; after: string } {
  const from = Math.max(0, start - Math.floor(CONTEXT_SNIPPET / 2));
  const to = Math.min(body.length, end + Math.floor(CONTEXT_SNIPPET / 2));
  const before = (from > 0 ? '…' : '') + body.slice(from, start).replace(/\s+/g, ' ');
  const match = body.slice(start, end);
  const after = body.slice(end, to).replace(/\s+/g, ' ') + (to < body.length ? '…' : '');
  return { before, match, after };
}

// Mask code regions the same way the link parser does — inline spans and
// fenced blocks are not valid match sites for unlinked mentions either.
function maskCode(text: string): string {
  const out = text.split('');
  const mask = (start: number, end: number) => {
    for (let i = start; i < end && i < out.length; i++) if (out[i] !== '\n') out[i] = ' ';
  };
  let m: RegExpExecArray | null;
  const fence = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
  while ((m = fence.exec(text)) !== null) mask(m.index, m.index + m[0].length);
  const span = /`[^`\n]+`/g;
  while ((m = span.exec(text)) !== null) mask(m.index, m.index + m[0].length);
  return out.join('');
}

function findUnlinkedMentions(
  activeBody: string,
  activeId: string | null,
  notesById: Map<string, NoteMeta>,
): UnlinkedMention[] {
  if (!activeBody || !activeBody.trim()) return [];
  // Suppress ranges already inside a `[[wikilink]]` so we don't double-link
  // something the user already wrote.
  const wikiRanges = parseWikiLinks(activeBody).map(r => [r.start, r.end] as const);
  const masked = maskCode(activeBody);
  const results: UnlinkedMention[] = [];
  const seenOccurrence = new Set<string>(); // id+start
  // Build a list of candidate titles sorted by length desc so multi-word
  // titles match before their single-word substrings.
  const candidates = Array.from(notesById.values())
    .filter(n => n.id !== activeId && n.title && n.title.length >= UNLINKED_MIN_LEN)
    .sort((a, b) => b.title.length - a.title.length);
  for (const n of candidates) {
    if (results.length >= UNLINKED_MAX) break;
    const title = n.title;
    // Escape regex metacharacters in the title so we can build a live pattern.
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|\\W)(${escaped})(?:\\W|$)`, 'gi');
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) {
      const rawIndex = m.index + m[0].indexOf(m[1]);
      const start = rawIndex;
      const end = rawIndex + m[1].length;
      // Re-advance so overlapping matches don't infinite-loop.
      re.lastIndex = end;
      // Skip if this occurrence sits inside a wikilink already.
      if (wikiRanges.some(([a, b]) => start >= a && end <= b)) continue;
      const seenKey = `${n.id}:${start}`;
      if (seenOccurrence.has(seenKey)) continue;
      seenOccurrence.add(seenKey);
      const snippet = highlightSnippet(activeBody, start, end);
      results.push({
        noteId: n.id,
        title,
        start,
        end,
        contextBefore: snippet.before,
        matchText: snippet.match,
        contextAfter: snippet.after,
      });
      if (results.length >= UNLINKED_MAX) break;
    }
  }
  return results;
}

function BacklinkRow({
  bl,
  sourceTitle,
  onSelect,
  embeddedLabel,
}: {
  bl: Backlink;
  sourceTitle: string;
  onSelect: (id: string) => void;
  embeddedLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(bl.sourceId)}
      className="backlinks-row w-full text-left"
      title={bl.sourceId}
    >
      <div className="backlinks-title">
        {bl.isTransclusion ? <span className="text-muted" title={embeddedLabel}>⧉ </span> : null}
        {sourceTitle || bl.sourceId}
        {bl.section ? <span className="text-muted"> #{bl.section}</span> : null}
      </div>
      <div className="backlinks-context">{bl.context}</div>
    </button>
  );
}

function BacklinksPanel({
  linkIndex,
  linksVersion,
  activeNote,
  notesById,
  activeBody,
  onSelect,
  onLinkMention,
  onClose,
}: Props) {
  const t = useTranslations('backlinks');
  // Backlinks: query by both the note's title AND its id. A note linked as
  // `[[my note]]` ends up under the title key; one linked by relative path
  // (`[[projects/foo]]`) ends up under the id key. Dedupe by sourceId+start.
  const backlinks = useMemo<Backlink[]>(() => {
    if (!linkIndex || !activeNote) return [];
    const byTitle = linkIndex.getBacklinks(activeNote.title);
    const byId = linkIndex.getBacklinks(activeNote.id);
    const byIdNoMd = linkIndex.getBacklinks(activeNote.id.replace(/\.md$/, ''));
    const merged = [...byTitle, ...byId, ...byIdNoMd];
    const seen = new Set<string>();
    const out: Backlink[] = [];
    for (const b of merged) {
      const key = `${b.sourceId}:${b.context}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(b);
    }
    return out;
    // linksVersion is the render-trigger; linkIndex / activeNote drive the
    // actual query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkIndex, activeNote, linksVersion]);

  const unlinked = useMemo(
    () => findUnlinkedMentions(activeBody, activeNote?.id ?? null, notesById),
    [activeBody, activeNote, notesById],
  );

  return (
    <div className="border-b border-[var(--border)] flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text tracking-tight">
          {t('heading')}
          {backlinks.length > 0 ? <span className="text-muted font-normal ml-1.5">({backlinks.length})</span> : null}
        </h2>
        <button
          onClick={onClose}
          aria-label={t('hideAria')}
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md
            text-muted hover:text-text hover:bg-[var(--panel-2)] transition-colors text-lg leading-none">
          &times;
        </button>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '40vh' }}>
        {backlinks.length === 0 ? (
          <div className="text-xs text-muted p-4">
            {!linkIndex
              ? t('indexing')
              : t('emptyHint', { title: activeNote?.title ?? '' })}
          </div>
        ) : (
          <ul>
            {backlinks.map((bl, idx) => {
              const source = notesById.get(bl.sourceId);
              return (
                <li key={`${bl.sourceId}:${idx}`}>
                  <BacklinkRow
                    bl={bl}
                    sourceTitle={source?.title ?? bl.sourceId}
                    onSelect={onSelect}
                    embeddedLabel={t('embedded')}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {unlinked.length > 0 && (
          <>
            <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--panel-2)] text-[10px] uppercase tracking-wide text-muted">
              {t('unlinkedMentionsHeading')} <span className="normal-case">({unlinked.length})</span>
            </div>
            <ul>
              {unlinked.map(u => (
                <li key={`${u.noteId}:${u.start}`} className="unlinked-row">
                  <div className="unlinked-context">
                    {u.contextBefore}
                    <mark>{u.matchText}</mark>
                    {u.contextAfter}
                  </div>
                  {onLinkMention && (
                    <button
                      type="button"
                      className="unlinked-link-btn"
                      onClick={() => onLinkMention(u.title)}
                      title={t('replaceWith', { title: u.title })}
                    >
                      {t('link')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="unlinked-link-btn"
                    style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }}
                    onClick={() => onSelect(u.noteId)}
                    title={t('goTo', { title: u.title })}
                  >
                    ↗
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// Memoized: backlink resolution walks the link index twice (title + id) and
// a parent render from unrelated state (sidebar toggle, editor settings)
// would re-run it. `activeBody` only flips on note load / external reload,
// not on every keystroke, so shallow-compare is safe.
export default memo(BacklinksPanel);
