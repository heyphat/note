'use client';

// Three sidebar filters — tag, saved-search, date — are mutually
// exclusive. Activating one clears the other two. The previous inline
// version split this into four paired useEffects with the same deps,
// which raced each other (both effects in a pair would fire on the same
// commit and cancel both filters out). This hook consolidates them into
// a single effect that detects which filter was JUST activated (via a
// prev-state ref) and clears the others — so the most-recently activated
// filter always wins.
//
// Also handles the "drop tag filter when its tag disappears" cleanup: if
// the user just hid the tag, or the last note carrying it was deleted (so
// the tag no longer exists in indexTags), the chip would otherwise look
// stuck on a filter that has no reachable surface. We bail gracefully if
// the search index hasn't primed yet — an empty indexTags while notes
// still exist means "not primed, wait" rather than "really gone."

import { useEffect, useRef } from 'react';
import type { TagCount } from '@/lib/search/types';

export type UseExclusiveFiltersParams = {
  activeTagFilter: string | null;
  setActiveTagFilter: React.Dispatch<React.SetStateAction<string | null>>;
  activeSavedSearchId: string | null;
  setActiveSavedSearchId: (id: string | null) => void;
  activeDateFilter: string | null;
  setActiveDateFilter: React.Dispatch<React.SetStateAction<string | null>>;
  /** Tag cloud (post-hidden filter NOT applied — we want the raw list so
   *  we can detect when a tag genuinely no longer exists). */
  indexTags: TagCount[];
  /** Tags the user has hidden from the cloud. Tag filters on a hidden tag
   *  should be cleared too. */
  hiddenTags: Set<string>;
  /** Total note count. Used as a primed-yet heuristic — if notes exist
   *  but indexTags is empty, the index hasn't built yet so we can't
   *  conclude "tag is gone." */
  notesLength: number;
};

export function useExclusiveFilters(params: UseExclusiveFiltersParams): void {
  const {
    activeTagFilter, setActiveTagFilter,
    activeSavedSearchId, setActiveSavedSearchId,
    activeDateFilter, setActiveDateFilter,
    indexTags, hiddenTags, notesLength,
  } = params;

  // Prev-state ref: lets the exclusivity effect detect which filter was
  // JUST activated (transition from null/empty → non-null) so we can
  // clear the others without racing.
  const prevRef = useRef<{ tag: string | null; saved: string | null; date: string | null }>({
    tag: activeTagFilter, saved: activeSavedSearchId, date: activeDateFilter,
  });

  useEffect(() => {
    const prev = prevRef.current;
    if (activeTagFilter && !prev.tag) {
      if (activeSavedSearchId) setActiveSavedSearchId(null);
      if (activeDateFilter) setActiveDateFilter(null);
    } else if (activeSavedSearchId && !prev.saved) {
      if (activeTagFilter) setActiveTagFilter(null);
      if (activeDateFilter) setActiveDateFilter(null);
    } else if (activeDateFilter && !prev.date) {
      if (activeTagFilter) setActiveTagFilter(null);
      if (activeSavedSearchId) setActiveSavedSearchId(null);
    }
    prevRef.current = { tag: activeTagFilter, saved: activeSavedSearchId, date: activeDateFilter };
  }, [
    activeTagFilter, activeSavedSearchId, activeDateFilter,
    setActiveTagFilter, setActiveSavedSearchId, setActiveDateFilter,
  ]);

  // Drop the tag filter if its tag has disappeared from the index (last
  // note carrying it was deleted / had the tag removed) or if the user
  // just hid it from the cloud. Index-not-primed-yet is detected by an
  // empty indexTags while notes still exist.
  useEffect(() => {
    if (!activeTagFilter) return;
    if (hiddenTags.has(activeTagFilter)) { setActiveTagFilter(null); return; }
    if (indexTags.some(t => t.tag === activeTagFilter)) return;
    if (!indexTags.length && notesLength) return;
    setActiveTagFilter(null);
  }, [indexTags, activeTagFilter, notesLength, hiddenTags, setActiveTagFilter]);
}
