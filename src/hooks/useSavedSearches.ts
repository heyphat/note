'use client';

// Saved searches ("smart folders") — CRUD + per-vault persistence + resolving
// the active saved search to a result list the sidebar can render.
//
// The hook owns three pieces of state: the persisted list, the currently-
// selected id (or null), and the resolved result ids for the selected search.
// Resolving is debounced so the flood of `notes` updates during a cold body-
// index pass (one setNotes every ~250ms as titles refine) doesn't run the
// query hundreds of times.

import { useCallback, useEffect, useState } from 'react';
import {
  getSavedSearches, addSavedSearch, removeSavedSearch, renameSavedSearch,
  type SavedSearch,
} from '@/lib/saved-searches';
import { parseQuery } from '@/lib/search/query-parser';
import type { SearchQuery, SearchHit } from '@/lib/search/types';

const RESOLVE_DEBOUNCE_MS = 300;

export type UseSavedSearches = {
  items: SavedSearch[];
  activeId: string | null;
  /** Null while unresolved; `[]` for a query with no matches. */
  results: string[] | null;
  setActiveId: (id: string | null) => void;
  save: (input: string, name?: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
};

export function useSavedSearches(
  vaultId: string,
  runSearch: (q: SearchQuery) => Promise<SearchHit[]>,
  notesVersion: number,
): UseSavedSearches {
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [results, setResults] = useState<string[] | null>(null);

  // Per-vault load. Mutations go through CRUD helpers that return the new
  // list — mirror that into state so sidebar + active-id lookup stay in sync.
  useEffect(() => {
    setItems(getSavedSearches(vaultId));
    // Drop any active selection — it points into the previous vault's list.
    setActiveId(null);
  }, [vaultId]);

  // Resolve the active saved search whenever the selection, list, or note
  // set changes. Debounced to survive cold-index title refinements.
  useEffect(() => {
    if (!activeId) { setResults(null); return; }
    const item = items.find(s => s.id === activeId);
    if (!item) { setResults(null); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      try {
        const q = parseQuery(item.input);
        const hits = await runSearch({ ...q, limit: 500 });
        if (cancelled) return;
        setResults(hits.map(h => h.id));
      } catch {
        if (!cancelled) setResults([]);
      }
    }, RESOLVE_DEBOUNCE_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeId, items, runSearch, notesVersion]);

  const save = useCallback((input: string, name?: string) => {
    setItems(addSavedSearch(vaultId, { input, name }));
  }, [vaultId]);

  const rename = useCallback((id: string, name: string) => {
    setItems(renameSavedSearch(vaultId, id, name));
  }, [vaultId]);

  const remove = useCallback((id: string) => {
    setItems(removeSavedSearch(vaultId, id));
    setActiveId(prev => (prev === id ? null : prev));
  }, [vaultId]);

  return { items, activeId, results, setActiveId, save, rename, remove };
}
