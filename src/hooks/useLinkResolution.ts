'use client';

// Wikilink + backlink resolution: owns the `notesById` map (used by the
// recent list + palette to translate ids to titles), the `linkResolver`
// map (rebuilt on every notes change), the `linkResolverRef` ref read by
// editor plugins at click-time, the `isKnownLinkTarget` predicate the
// MilkdownEditor uses to dim unknown wikilinks, the `getWikilinkCandidates`
// ranking used by the [[ autocomplete, and the `backlinksCount` shown in
// the toolbar's backlinks toggle. Pulled out of page.tsx as Step 10.
//
// Runs BEFORE useNoteCommands in the page render so handleNavigateLink can
// read `linkResolverRef.current` at click-time. The ref pattern avoids a
// re-render every time the resolver rebuilds — editor plugins only invoke
// the callback when the user actually clicks a link.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { buildLinkResolver, isKnownTarget } from '@/lib/links/link-resolver';
import { type NoteMeta } from '@/lib/storage';
import type { LinkIndex } from '@/lib/links/link-index';

export type WikilinkCandidate = { title: string; id: string };

export type UseLinkResolutionParams = {
  notes: NoteMeta[];
  activeId: string | null;
  linkIndex: LinkIndex | null;
  /** Bumped by useSearch whenever link relationships change. Forces
   *  backlinksCount to re-derive even if the notes-array identity is
   *  stable (the index can change while notes don't, e.g. body indexing
   *  catches up after the initial paint). */
  linksVersion: number;
};

export type UseLinkResolutionResult = {
  notesById: Map<string, NoteMeta>;
  linkResolver: Map<string, NoteMeta>;
  linkResolverRef: React.MutableRefObject<Map<string, NoteMeta>>;
  isKnownLinkTarget: (target: string) => boolean;
  getWikilinkCandidates: (query: string) => WikilinkCandidate[];
  backlinksCount: number;
};

export function useLinkResolution(params: UseLinkResolutionParams): UseLinkResolutionResult {
  const { notes, activeId, linkIndex, linksVersion } = params;

  // Lookup for the command palette + recent list so they can resolve ids
  // to titles without re-scanning the notes array on every keystroke.
  const notesById = useMemo(() => {
    const m = new Map<string, NoteMeta>();
    for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  // Title / basename / id resolver for wikilinks. Rebuilt whenever the note
  // list changes (title refinements, renames, creates). Kept in a ref so the
  // editor plugin callbacks — which don't re-read props on every keystroke —
  // always read the latest map.
  const linkResolver = useMemo(() => buildLinkResolver(notes), [notes]);
  const linkResolverRef = useRef(linkResolver);
  useEffect(() => { linkResolverRef.current = linkResolver; }, [linkResolver]);

  const isKnownLinkTarget = useCallback((target: string) => {
    return isKnownTarget(linkResolverRef.current, target);
  }, []);

  const getWikilinkCandidates = useCallback((query: string) => {
    const q = query.trim().toLowerCase();
    const list: { title: string; id: string; score: number }[] = [];
    for (const n of notes) {
      if (!n.title) continue;
      const lower = n.title.toLowerCase();
      let score = -1;
      if (!q) score = 0;
      else if (lower === q) score = 1000;
      else if (lower.startsWith(q)) score = 600;
      else if (lower.includes(q)) score = 300;
      else if (n.id.toLowerCase().includes(q)) score = 100;
      if (score < 0) continue;
      list.push({ title: n.title, id: n.id, score });
    }
    list.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return list.slice(0, 20).map(({ title, id }) => ({ title, id }));
  }, [notes]);

  // Backlinks count for the active note — memoized so the toolbar doesn't
  // re-walk the link index on every unrelated render. Dupes between
  // title-based and id-based backlinks are collapsed by sourceId.
  const backlinksCount = useMemo(() => {
    if (!linkIndex || !activeId) return 0;
    const active = notesById.get(activeId);
    if (!active) return 0;
    const seen = new Set<string>();
    for (const b of linkIndex.getBacklinks(active.title)) seen.add(b.sourceId);
    for (const b of linkIndex.getBacklinks(activeId)) seen.add(b.sourceId);
    return seen.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkIndex, activeId, notesById, linksVersion]);

  return {
    notesById, linkResolver, linkResolverRef,
    isKnownLinkTarget, getWikilinkCandidates,
    backlinksCount,
  };
}
